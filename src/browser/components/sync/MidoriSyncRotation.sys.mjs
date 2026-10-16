/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SYNC_STORE_UUID } from "./MidoriSyncLocalCodec.sys.mjs";
import { SyncProtocolError, validateRemoteRecord, validateOperationResults } from "./MidoriSyncProtocol.sys.mjs";
import { openSyncRecord, sealSyncRecord } from "./MidoriSyncRecord.sys.mjs";

const COLLECTIONS = new Set(["bookmarks", "history", "passwords", "credit-cards", "tabs", "browser-settings", "devices", "midori-tab", "midori-privacy"]);

export class MidoriSyncRotation {
  #keys;
  #journal;
  #request;
  #entryId;
  #createId;
  #history;
  #busy = false;
  #closed = false;
  #entry = null;

  constructor({ keys, journal, request, entryId, createId, history }) {
    this.#keys = keys;
    this.#journal = journal;
    this.#request = request;
    this.#entryId = entryId;
    this.#createId = createId;
    this.#history = history;
  }

  async run({ limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || this.#busy) {
      throw new SyncProtocolError(this.#busy ? "busy" : "invalid_run_limit");
    }
    this.#busy = true;
    try {
      const rotation = this.#keys.snapshot.rotation;
      if (!rotation || !SYNC_STORE_UUID.test(rotation.operation_id)) {
        throw new SyncProtocolError("unknown_rotation");
      }
      const id = await this.#entryId("devices", "metadata", "key-rotation-v1");
      this.#entry = await this.#journal.read(id);
      if (this.#entry && (this.#entry.value?.version !== 1 ||
          this.#entry.value.rotation !== rotation.operation_id ||
          !["remote", "local", "complete"].includes(this.#entry.value.phase))) {
        throw new SyncProtocolError("rotation_state_corrupt");
      }
      if (!this.#entry) {
        if (rotation.phase === "complete") {
          return { done: true, processed: 0, remaining: 0 };
        }
        this.#entry = { id, collection: "devices", kind: "metadata", revision: 0 };
        await this.#save({ version: 1, rotation: rotation.operation_id, phase: "remote", pending: null, after: null });
      }
      let processed = 0;
      if (this.#entry.value.pending) {
        await this.#sendPending();
        ++processed;
      }
      while (this.#entry.value.phase === "remote" && processed < limit) {
        this.#ensureOpen();
        const { data } = await this.#request("api/v1/crypto/rotation/records", {
          query: { limit: Math.min(100, limit - processed) }, maxBytes: 5 * 1024 * 1024,
        });
        if (data?.rotation_id !== rotation.operation_id || !Array.isArray(data.records) ||
            data.records.length > limit - processed || typeof data.has_more !== "boolean") {
          throw new SyncProtocolError("invalid_rotation_page");
        }
        if (!data.records.length) {
          if (data.has_more) {
            throw new SyncProtocolError("invalid_rotation_page");
          }
          await this.#save({ ...this.#entry.value, phase: "local" });
          break;
        }
        for (const source of data.records) {
          await this.#prepare(source);
          await this.#sendPending();
          ++processed;
        }
      }
      if (this.#entry.value.phase === "local" && processed < limit) {
        const rows = await this.#journal.scan({ after: this.#entry.value.after, limit: limit - processed });
        this.#ensureOpen();
        for (const row of rows) {
          if (row.id !== this.#entry.id) {
            const value = row.kind === "metadata" && row.value?.version === 3 &&
              typeof row.value.initialized === "boolean" ? { ...row.value, initialized: false } : row.value;
            await this.#journal.commit([{ id: row.id, collection: row.collection, kind: row.kind,
              expectedRevision: row.revision, value }]);
          }
          await this.#save({ ...this.#entry.value, after: row.id });
          ++processed;
        }
        if (!rows.length) {
          await this.#save({ ...this.#entry.value, phase: "complete" });
        }
      }
      if (this.#entry.value.phase === "complete") {
        await this.#keys.completeRotation(rotation.operation_id);
        this.#ensureOpen();
        await this.#journal.commit([{ id: this.#entry.id, collection: "devices", kind: "metadata",
          expectedRevision: this.#entry.revision, deleted: true }]);
        return { done: true, processed, remaining: 0 };
      }
      return { done: false, processed, remaining: null };
    } finally {
      this.#busy = false;
    }
  }

  async #prepare({ collection, generation, record }) {
    this.#ensureOpen();
    if (!COLLECTIONS.has(collection) || !SYNC_STORE_UUID.test(generation)) {
      throw new SyncProtocolError("invalid_rotation_page");
    }
    validateRemoteRecord(record);
    if (record.deleted && !record.payload) {
      throw new SyncProtocolError("legacy_tombstone_review_required");
    }
    const expected = { collection, generation, id: record.id };
    const value = await openSyncRecord(this.#keys, expected, record);
    const crypto = this.#keys.writeContext;
    const operationId = this.#createId();
    if (!SYNC_STORE_UUID.test(operationId)) {
      throw new SyncProtocolError("invalid_operation_id");
    }
    let path;
    let body;
    if (collection === "history" && !record.deleted && /^h1:[0-9a-f]{64}$/.test(record.id)) {
      const targetId = await this.#history.migrationId(await this.#history.validate(record.id, value));
      const target = await sealSyncRecord(this.#keys, { ...expected, id: targetId, base_revision: "0" },
        { deleted: false, ttl: record.ttl, value });
      const source = await sealSyncRecord(this.#keys, { ...expected, base_revision: record.revision },
        { deleted: true, ttl: null, value: null });
      path = "api/v1/crypto/rotation/history-id";
      body = { crypto, operation_id: operationId, rotation_id: this.#entry.value.rotation, generation,
        source_id: record.id, source_revision: record.revision, target_id: targetId,
        source_payload: source.payload, target_payload: target.payload, target_ttl: record.ttl };
    } else {
      const sealed = await sealSyncRecord(this.#keys, { ...expected, base_revision: record.revision },
        { deleted: record.deleted, ttl: record.ttl, value });
      path = `api/v1/sync/collections/${collection}/operations`;
      body = { generation, crypto, operations: [{ operation_id: operationId, id: record.id,
        base_revision: record.revision, deleted: record.deleted, ttl: record.ttl, payload: sealed.payload }] };
    }
    const current = this.#keys.writeContext;
    if (current.epoch !== crypto.epoch || current.revision !== crypto.revision) {
      throw new SyncProtocolError("crypto_state_conflict");
    }
    await this.#save({ ...this.#entry.value, pending: { path, body } });
  }

  async #sendPending() {
    this.#ensureOpen();
    const { path, body } = this.#entry.value.pending;
    if (body.crypto?.epoch !== this.#keys.writeContext.epoch) {
      throw new SyncProtocolError("crypto_state_conflict");
    }
    let data;
    try {
      ({ data } = await this.#request(path, { method: "POST", body, maxBytes: 1024 * 1024 }));
    } catch (error) {
      if (path === "api/v1/crypto/rotation/history-id" && error.status === 409 && error.code === "history_source_conflict") {
        await this.#save({ ...this.#entry.value, pending: null });
        throw new SyncProtocolError("rotation_conflict_retry");
      }
      throw error;
    }
    if (path === "api/v1/crypto/rotation/history-id") {
      if (data?.operation_id !== body.operation_id || data.source_id !== body.source_id ||
          data.target_id !== body.target_id || data.generation !== body.generation ||
          data.rotation_id !== body.rotation_id || data.target_revision !== "1" ||
          data.source_revision !== String(BigInt(body.source_revision) + 1n)) {
        throw new SyncProtocolError("invalid_rotation_result");
      }
    } else {
      validateOperationResults(data, body.generation, body.operations);
      if (data.results[0].status === "conflict") {
        await this.#save({ ...this.#entry.value, pending: null });
        throw new SyncProtocolError("rotation_conflict_retry");
      }
      if (data.results[0].status !== "applied") {
        throw new SyncProtocolError(`rotation_${data.results[0].status}`);
      }
    }
    await this.#save({ ...this.#entry.value, pending: null });
  }

  async #save(value) {
    this.#ensureOpen();
    await this.#journal.commit([{ id: this.#entry.id, collection: "devices", kind: "metadata",
      expectedRevision: this.#entry.revision, value }]);
    this.#entry = { ...this.#entry, revision: this.#entry.revision + 1, value };
    this.#ensureOpen();
  }

  close() {
    this.#closed = true;
    this.#history?.close();
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncProtocolError("cancelled");
    }
  }
}
