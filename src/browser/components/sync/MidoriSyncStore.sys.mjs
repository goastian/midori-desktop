/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Sqlite } from "resource://gre/modules/Sqlite.sys.mjs";
import {
  MidoriSyncLocalCodec, SyncStoreError, SYNC_STORE_UUID, MAX_LOCAL_VALUE_BYTES,
  MAX_LOCAL_CIPHERTEXT_BYTES, validateSyncStoreEntry,
} from "./MidoriSyncLocalCodec.sys.mjs";

const MAX_STORE_BYTES = 64 * 1024 * 1024;
const MAX_STORE_ENTRIES = 10000;
const encoder = new TextEncoder();
const openPaths = new Set();

export async function openSyncStore({ directory, storeId, deviceId, keys, create = false }) {
  if (typeof create !== "boolean") {
    throw new SyncStoreError("invalid_store_identity");
  }
  const codec = new MidoriSyncLocalCodec({ keys, storeId, deviceId, createId: () => Services.uuid.generateUUID().toString().slice(1, -1) });
  const path = PathUtils.join(directory, `${storeId}.sqlite`);
  if (openPaths.has(path)) {
    throw new SyncStoreError("store_busy");
  }
  openPaths.add(path);
  let database;
  try {
    await IOUtils.makeDirectory(directory, { ignoreExisting: true, permissions: 0o700 });
    await IOUtils.setPermissions(directory, 0o700);
    if (!create && !(await IOUtils.exists(path))) {
      throw new SyncStoreError("store_missing");
    }
    database = await Sqlite.openConnection({ path });
    await IOUtils.setPermissions(path, 0o600);
    await database.executeTransaction(async () => {
      const version = await database.getSchemaVersion();
      if (version === 0) {
        if (!create) {
          throw new SyncStoreError("store_schema_missing");
        }
        await database.execute(`CREATE TABLE sync_entries (
          id TEXT PRIMARY KEY NOT NULL,
          collection TEXT NOT NULL,
          kind TEXT NOT NULL,
          revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 2147483647),
          ciphertext TEXT NOT NULL,
          size INTEGER NOT NULL CHECK (size > 0)
        )`);
        await database.execute("CREATE INDEX sync_entries_by_kind ON sync_entries(collection, kind, id)");
        await database.setSchemaVersion(1);
      } else if (version !== 1) {
        throw new SyncStoreError("store_version_unsupported");
      }
    });
    return new MidoriSyncStore(database, codec, () => openPaths.delete(path));
  } catch (error) {
    await database?.close();
    openPaths.delete(path);
    throw error;
  }
}

class MidoriSyncStore {
  #database;
  #codec;
  #tail = Promise.resolve();
  #pending = 0;
  #closed = false;
  #closing = null;
  #onClose;

  constructor(database, codec, onClose) {
    this.#database = database;
    this.#codec = codec;
    this.#onClose = onClose;
  }

  async read(id) {
    this.#validateId(id);
    return this.#enqueue(() => this.#read(id));
  }

  async list(collection, kind, { after = null, limit = 100 } = {}) {
    validateSyncStoreEntry({ id: "00000000-0000-0000-0000-000000000000", collection, kind, revision: 1 });
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (after !== null && !SYNC_STORE_UUID.test(after))) {
      throw new SyncStoreError("invalid_store_query");
    }
    return this.#enqueue(async () => {
      const rows = await this.#database.executeCached(
        `SELECT id, length(CAST(ciphertext AS BLOB)) AS size FROM sync_entries
         WHERE collection = :collection AND kind = :kind AND id > :after ORDER BY id LIMIT :limit`,
        { collection, kind, after: after ?? "", limit });
      return this.#decodeRows(rows);
    });
  }

  async scan({ after = null, limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (after !== null && !SYNC_STORE_UUID.test(after))) {
      throw new SyncStoreError("invalid_store_query");
    }
    return this.#enqueue(async () => {
      const rows = await this.#database.executeCached(
        `SELECT id, length(CAST(ciphertext AS BLOB)) AS size FROM sync_entries
         WHERE id > :after ORDER BY id LIMIT :limit`, { after: after ?? "", limit });
      return this.#decodeRows(rows);
    });
  }

  async clearHistory() {
    return this.#enqueue(() => this.#database.executeTransaction(async () => {
      const [row] = await this.#database.execute("SELECT COUNT(*) AS count FROM sync_entries WHERE collection = 'history'");
      await this.#database.execute("DELETE FROM sync_entries WHERE collection = 'history'");
      return row.getResultByName("count");
    }));
  }

  async #decodeRows(rows) {
    const result = [];
    let size = 0;
    for (const row of rows) {
      const entrySize = row.getResultByName("size");
      if (!Number.isSafeInteger(entrySize) || entrySize < 1 || entrySize > MAX_LOCAL_CIPHERTEXT_BYTES) {
        throw new SyncStoreError("store_corrupt");
      }
      size += entrySize;
      if (result.length && size > MAX_LOCAL_CIPHERTEXT_BYTES) {
        break;
      }
      result.push(await this.#read(row.getResultByName("id")));
      this.#ensureOpen();
    }
    return result;
  }

  async commit(changes) {
    this.#ensureOpen();
    if (this.#pending >= 4) {
      throw new SyncStoreError("store_busy");
    }
    if (!Array.isArray(changes) || !changes.length || changes.length > 100) {
      throw new SyncStoreError("invalid_store_batch");
    }
    const prepared = [];
    try {
      const ids = new Set();
      let size = 0;
      for (const change of changes) {
        const { id, collection, kind, expectedRevision, deleted = false } = change;
        if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= 2147483647 ||
            typeof deleted !== "boolean" || (deleted && expectedRevision === 0) || ids.has(id)) {
          throw new SyncStoreError("invalid_store_batch");
        }
        const revision = expectedRevision + 1;
        validateSyncStoreEntry({ id, collection, kind, revision });
        ids.add(id);
        let bytes = null;
        if (!deleted) {
          const json = JSON.stringify(change.value);
          if (json === undefined) {
            throw new SyncStoreError("invalid_store_value");
          }
          bytes = encoder.encode(json);
          size += bytes.length;
          if (size > MAX_LOCAL_VALUE_BYTES) {
            bytes.fill(0);
            throw new SyncStoreError("store_value_too_large");
          }
        }
        prepared.push({ id, collection, kind, revision, expectedRevision, deleted, bytes });
      }
      return await this.#enqueue(async () => {
        for (const change of prepared) {
          if (!change.deleted) {
            change.ciphertext = await this.#codec.encode(change, change.bytes);
            change.bytes.fill(0);
            this.#ensureOpen();
          }
        }
        return this.#database.executeTransaction(async () => {
          this.#ensureOpen();
          for (const change of prepared) {
            const rows = await this.#database.executeCached(
              "SELECT collection, kind, revision FROM sync_entries WHERE id = :id", { id: change.id });
            const current = rows[0];
            if ((current?.getResultByName("revision") ?? 0) !== change.expectedRevision ||
                (current && (current.getResultByName("collection") !== change.collection || current.getResultByName("kind") !== change.kind))) {
              throw new SyncStoreError("store_conflict");
            }
            if (change.deleted) {
              await this.#database.executeCached("DELETE FROM sync_entries WHERE id = :id", { id: change.id });
            } else {
              const { id, collection, kind, revision, ciphertext } = change;
              await this.#database.executeCached(
                `INSERT INTO sync_entries(id, collection, kind, revision, ciphertext, size)
                 VALUES (:id, :collection, :kind, :revision, :ciphertext, :size)
                 ON CONFLICT(id) DO UPDATE SET revision = excluded.revision, ciphertext = excluded.ciphertext, size = excluded.size`,
                { id, collection, kind, revision, ciphertext, size: encoder.encode(ciphertext).length });
            }
            this.#ensureOpen();
          }
          const [totals] = await this.#database.execute("SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS size FROM sync_entries");
          if (totals.getResultByName("count") > MAX_STORE_ENTRIES || totals.getResultByName("size") > MAX_STORE_BYTES) {
            throw new SyncStoreError("store_quota_exceeded");
          }
          this.#ensureOpen();
          return prepared.map(({ id, revision, deleted }) => ({ id, revision, deleted }));
        });
      });
    } finally {
      for (const change of prepared) {
        change.bytes?.fill(0);
      }
    }
  }

  close() {
    this.#closed = true;
    this.#closing ??= this.#tail.then(() => this.#database.close()).then(() => this.#onClose());
    return this.#closing;
  }

  async #decode(row) {
    this.#ensureOpen();
    const entry = Object.fromEntries(["id", "collection", "kind", "revision"].map(name => [name, row.getResultByName(name)]));
    const value = await this.#codec.decode(entry, row.getResultByName("ciphertext"));
    this.#ensureOpen();
    return { ...entry, value };
  }

  async #read(id) {
    const rows = await this.#database.executeCached(
      `SELECT id, collection, kind, revision,
       CASE WHEN length(CAST(ciphertext AS BLOB)) <= :max THEN ciphertext ELSE NULL END AS ciphertext
       FROM sync_entries WHERE id = :id`, { id, max: MAX_LOCAL_CIPHERTEXT_BYTES });
    return rows.length ? this.#decode(rows[0]) : null;
  }

  #validateId(id) {
    if (!SYNC_STORE_UUID.test(id)) {
      throw new SyncStoreError("invalid_store_entry");
    }
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncStoreError("store_closed");
    }
  }

  async #enqueue(work) {
    this.#ensureOpen();
    if (this.#pending >= 4) {
      throw new SyncStoreError("store_busy");
    }
    ++this.#pending;
    const result = this.#tail.then(async () => {
      this.#ensureOpen();
      const value = await work();
      this.#ensureOpen();
      return value;
    });
    this.#tail = result.catch(() => {});
    try {
      return await result;
    } finally {
      --this.#pending;
    }
  }
}
