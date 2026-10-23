/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Sqlite } from "resource://gre/modules/Sqlite.sys.mjs";
import {
  MidoriSyncLocalCodec, SyncStoreError, SYNC_STORE_UUID, MAX_LOCAL_VALUE_BYTES,
  MAX_LOCAL_CIPHERTEXT_BYTES, validateSyncStoreEntry,
  discoverSyncStoreDeviceId,
} from "./MidoriSyncLocalCodec.sys.mjs";
import { createProfileSyncSavedCustody } from "./MidoriSyncSecretStore.sys.mjs";

const MAX_STORE_BYTES = 64 * 1024 * 1024;
const MAX_STORE_ENTRIES = 10000;
const encoder = new TextEncoder();
const openPaths = new Set();
const STORE_FILES = ["", "-wal", "-shm", "-journal"];

function regularStoreFile(path) {
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  if (file.isSymlink() || !file.isFile()) {
    throw new SyncStoreError("store_file_unsupported");
  }
}

export function createSyncJournalFiles(directory) {
  const pathFor = id => {
    if (!SYNC_STORE_UUID.test(id)) {
      throw new SyncStoreError("invalid_store_identity");
    }
    return PathUtils.join(directory, `${id}.sqlite`);
  };
  const parts = async id => {
    const path = pathFor(id);
    const result = [];
    for (const suffix of STORE_FILES) {
      const part = path + suffix;
      if (await IOUtils.exists(part)) {
        regularStoreFile(part);
        const stat = await IOUtils.stat(part);
        result.push({ path: part, suffix, size: stat.size, modified: stat.lastModified });
      }
    }
    return result;
  };
  return {
    async list({ after = null, limit = 25, activeId = null } = {}) {
      if ((after !== null && !SYNC_STORE_UUID.test(after)) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new SyncStoreError("invalid_store_query");
      }
      if (!(await IOUtils.exists(directory))) {
        return [];
      }
      const ids = new Set();
      for (const path of await IOUtils.getChildren(directory)) {
        const match = /^([0-9a-f-]{36})\.sqlite(?:-wal|-shm|-journal)?$/.exec(PathUtils.filename(path));
        if (match && SYNC_STORE_UUID.test(match[1]) && match[1] !== activeId && (after === null || match[1] > after)) {
          ids.add(match[1]);
        }
      }
      const result = [];
      for (const id of [...ids].sort().slice(0, limit)) {
        const files = await parts(id);
        if (files.length) {
          result.push({ id, bytes: files.reduce((sum, file) => sum + file.size, 0),
            modified: Math.max(...files.map(file => file.modified)), incomplete: files.every(file => file.suffix !== "") });
        }
      }
      return result;
    },
    async fingerprint(id) {
      const files = await parts(id);
      if (!files.length) {
        throw new SyncStoreError("store_missing");
      }
      const hash = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
      hash.init(Ci.nsICryptoHash.SHA256);
      for (const file of files) {
        const header = encoder.encode(JSON.stringify([file.suffix, file.size, file.modified]));
        hash.update(header, header.length);
        for (let offset = 0; offset < file.size; offset += 128 * 1024) {
          const bytes = await IOUtils.read(file.path, { offset, maxBytes: Math.min(128 * 1024, file.size - offset) });
          try {
            if (bytes.length !== Math.min(128 * 1024, file.size - offset)) {
              throw new SyncStoreError("store_changed");
            }
            hash.update(bytes, bytes.length);
          } finally {
            bytes.fill(0);
          }
        }
      }
      if (JSON.stringify(await parts(id)) !== JSON.stringify(files)) {
        throw new SyncStoreError("store_changed");
      }
      return Array.from(hash.finish(false), byte => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    },
    async remove(id, fingerprint, assertCurrent = () => {}) {
      const path = pathFor(id);
      if (openPaths.has(path)) {
        throw new SyncStoreError("store_busy");
      }
      openPaths.add(path);
      try {
        if (typeof fingerprint !== "string" || fingerprint !== await this.fingerprint(id)) {
          throw new SyncStoreError("store_changed");
        }
        for (const suffix of STORE_FILES) {
          assertCurrent();
          await IOUtils.remove(path + suffix, { ignoreAbsent: true });
        }
      } finally {
        openPaths.delete(path);
      }
    },
  };
}

export async function assertSavedSyncCopiesIndependent({ directory, activeId = null, keyIds, scope = null,
  savedCustody = null }) {
  if (!Array.isArray(keyIds) || keyIds.length > 32 || keyIds.some(id => !/^[A-Za-z0-9_-]{22}$/.test(id))) {
    throw new SyncStoreError("saved_journals_require_review");
  }
  if (!keyIds.length) { return; }
  const files = createSyncJournalFiles(directory);
  let after = null;
  try {
    while (true) {
      const copies = await files.list({ activeId, after, limit: 25 });
      if (!copies.length) { return; }
      for (const copy of copies) {
        if (!copy.bytes) { continue; }
        const path = PathUtils.join(directory, `${copy.id}.sqlite`);
        if (openPaths.has(path)) {
          throw new SyncStoreError("saved_journals_require_review");
        }
        openPaths.add(path);
        let database;
        try {
          if (scope !== null) {
            const fingerprint = await files.fingerprint(copy.id);
            const custody = savedCustody ?? createProfileSyncSavedCustody();
            const archived = await custody.open({ id: copy.id, fingerprint, scope, requiredKeyIds: keyIds });
            if (archived) {
              archived.keys.close();
              if (fingerprint !== await files.fingerprint(copy.id)) {
                throw new SyncStoreError("saved_journals_require_review");
              }
              continue;
            }
          }
          if (copy.incomplete) {
            throw new SyncStoreError("saved_journals_require_review");
          }
          regularStoreFile(path);
          database = await Sqlite.openConnection({ path, readOnly: true });
          if (await database.getSchemaVersion() !== 1) {
            throw new SyncStoreError("saved_journals_require_review");
          }
          const tables = await database.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND substr(name, 1, 7) != 'sqlite_' LIMIT 2");
          if (tables.length !== 1 || tables[0].getResultByName("name") !== "sync_entries" ||
              (await database.execute("SELECT id FROM sync_entries LIMIT 1")).length) {
            throw new SyncStoreError("saved_journals_require_review");
          }
        } finally {
          await database?.close();
          openPaths.delete(path);
        }
      }
      after = copies.at(-1).id;
    }
  } catch {
    throw new SyncStoreError("saved_journals_require_review");
  }
}

export async function openDiscoveredSyncStore({ directory, storeId, keys }) {
  if (!SYNC_STORE_UUID.test(storeId)) {
    throw new SyncStoreError("invalid_store_identity");
  }
  const path = PathUtils.join(directory, `${storeId}.sqlite`);
  if (openPaths.has(path)) {
    throw new SyncStoreError("store_busy");
  }
  openPaths.add(path);
  let database;
  try {
    if (!(await IOUtils.exists(path))) {
      throw new SyncStoreError("store_missing");
    }
    regularStoreFile(path);
    database = await Sqlite.openConnection({ path, readOnly: true });
    if (await database.getSchemaVersion() !== 1) {
      throw new SyncStoreError("store_version_unsupported");
    }
    const [first] = await database.executeCached(
      `SELECT id, collection, kind, revision,
       CASE WHEN length(CAST(ciphertext AS BLOB)) <= :max THEN ciphertext ELSE NULL END AS ciphertext
       FROM sync_entries ORDER BY id LIMIT 1`, { max: MAX_LOCAL_CIPHERTEXT_BYTES });
    if (!first) {
      throw new SyncStoreError("store_empty");
    }
    const entry = Object.fromEntries(["id", "collection", "kind", "revision"].map(name => [name, first.getResultByName(name)]));
    const deviceId = await discoverSyncStoreDeviceId(keys, storeId, entry, first.getResultByName("ciphertext"));
    const codec = new MidoriSyncLocalCodec({ keys, storeId, deviceId });
    return { deviceId, store: new MidoriSyncStore(database, codec, () => openPaths.delete(path), { directory, storeId }) };
  } catch (error) {
    await database?.close();
    openPaths.delete(path);
    throw error;
  }
}

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
    const exists = await IOUtils.exists(path);
    if (!create && !exists) {
      throw new SyncStoreError("store_missing");
    }
    database = await Sqlite.openConnection({ path });
    await IOUtils.setPermissions(path, 0o600);
    if (!exists && !Services.prefs.getBoolPref("security.storage.encryption.sqlite.enabled", false)) {
      // Encrypted SQLite connections require the page size chosen by obfsvfs.
      const [cache] = await database.execute("PRAGMA cache_size");
      const cacheSize = cache.getResultByIndex(0);
      await database.execute("PRAGMA page_size = 4096");
      // SQLite retains a page count until the KiB cache budget is reapplied.
      await database.execute(`PRAGMA cache_size = ${cacheSize}`);
    }
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
    return new MidoriSyncStore(database, codec, () => openPaths.delete(path), { directory, storeId });
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
  #location;

  constructor(database, codec, onClose, location) {
    this.#database = database;
    this.#codec = codec;
    this.#onClose = onClose;
    this.#location = location;
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

  async clearHistory(options = {}) {
    return this.clearCollection("history", options);
  }

  async clearCollection(collection, { replacement = null } = {}) {
    this.#ensureOpen();
    validateSyncStoreEntry({ id: "00000000-0000-0000-0000-000000000000", collection, kind: "metadata", revision: 1 });
    let entry = null;
    let bytes = null;
    try {
      if (replacement !== null) {
        validateSyncStoreEntry(replacement);
        if (replacement.collection !== collection || replacement.kind !== "metadata" || replacement.revision !== 1) {
          throw new SyncStoreError("invalid_store_entry");
        }
        const json = JSON.stringify(replacement.value);
        if (json === undefined) {
          throw new SyncStoreError("invalid_store_value");
        }
        bytes = encoder.encode(json);
        if (bytes.length > MAX_LOCAL_VALUE_BYTES) {
          throw new SyncStoreError("store_value_too_large");
        }
        entry = { id: replacement.id, collection, kind: "metadata", revision: 1 };
      }
      return await this.#enqueue(async () => {
        const ciphertext = entry ? await this.#codec.encode(entry, bytes) : null;
        bytes?.fill(0);
        this.#ensureOpen();
        return this.#database.executeTransaction(async () => {
          this.#ensureOpen();
          const [row] = await this.#database.executeCached(
            "SELECT COUNT(*) AS count FROM sync_entries WHERE collection = :collection", { collection });
          await this.#database.executeCached("DELETE FROM sync_entries WHERE collection = :collection", { collection });
          if (entry) {
            const existing = await this.#database.executeCached("SELECT id FROM sync_entries WHERE id = :id", { id: entry.id });
            if (existing.length) {
              throw new SyncStoreError("store_conflict");
            }
            await this.#database.executeCached(
              `INSERT INTO sync_entries(id, collection, kind, revision, ciphertext, size)
               VALUES (:id, :collection, :kind, :revision, :ciphertext, :size)`,
              { ...entry, ciphertext, size: encoder.encode(ciphertext).length });
            const [totals] = await this.#database.execute("SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS size FROM sync_entries");
            if (totals.getResultByName("count") > MAX_STORE_ENTRIES || totals.getResultByName("size") > MAX_STORE_BYTES) {
              throw new SyncStoreError("store_quota_exceeded");
            }
          }
          this.#ensureOpen();
          return row.getResultByName("count");
        });
      });
    } finally {
      bytes?.fill(0);
    }
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

  async assertOnlyKey(keyId, { accountKeyIds = [], scope = null } = {}) {
    if (!/^[A-Za-z0-9_-]{22}$/.test(keyId) || !Array.isArray(accountKeyIds) || accountKeyIds.length > 32 ||
        accountKeyIds.some(id => !/^[A-Za-z0-9_-]{22}$/.test(id))) {
      throw new SyncStoreError("invalid_key_id");
    }
    return this.#enqueue(async () => {
      let after = "";
      while (true) {
        const rows = await this.#database.executeCached(
          `SELECT id, collection, kind, revision,
           CASE WHEN length(CAST(ciphertext AS BLOB)) <= :max THEN ciphertext ELSE NULL END AS ciphertext
           FROM sync_entries WHERE id > :after ORDER BY id LIMIT 100`, { after, max: MAX_LOCAL_CIPHERTEXT_BYTES });
        if (!rows.length) {
          break;
        }
        for (const row of rows) {
          let chunks;
          try {
            chunks = JSON.parse(row.getResultByName("ciphertext")).chunks;
            if (!Array.isArray(chunks) || !chunks.length || chunks.length > 33) {
              throw new Error();
            }
            if (chunks.some(chunk => JSON.parse(chunk).key_id !== keyId)) {
              throw new SyncStoreError("local_key_in_use");
            }
          } catch (error) {
            throw new SyncStoreError(error.code === "local_key_in_use" ? error.code : "store_corrupt");
          }
          await this.#decode(row);
          after = row.getResultByName("id");
        }
      }
      if (accountKeyIds.some(id => id !== keyId)) {
        await assertSavedSyncCopiesIndependent({ directory: this.#location.directory,
          activeId: this.#location.storeId, keyIds: accountKeyIds, scope });
      }
    });
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
