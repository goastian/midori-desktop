/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SYNC_STORE_UUID } from "./MidoriSyncLocalCodec.sys.mjs";
import { SyncProtocolError, validSyncCounter, validateRemoteRecord, validateOperationResults } from "./MidoriSyncProtocol.sys.mjs";
import { openSyncRecord, sealSyncRecord } from "./MidoriSyncRecord.sys.mjs";

const COLLECTIONS = new Set(["bookmarks", "history", "passwords", "credit-cards", "form-history", "addresses", "workspaces", "site-permissions", "extensions", "extension-settings", "tabs", "browser-settings", "devices", "midori-tab", "midori-privacy"]);

export async function finishSyncRotation(driver, {
  limit = 100, legacyDeletionDecisions = [], onBatch = async () => {}, yieldControl = async () => {},
} = {}) {
  let processed = 0;
  for (;;) {
    const result = await driver.run({ limit, legacyDeletionDecisions });
    if (typeof result?.done !== "boolean" || !Number.isInteger(result.processed) || result.processed < 0 || result.processed > limit) {
      throw new SyncProtocolError("invalid_rotation_progress");
    }
    processed += result.processed;
    if (result.done) {
      return { ...result, processed };
    }
    if (!result.processed) {
      throw new SyncProtocolError("rotation_no_progress");
    }
    legacyDeletionDecisions = [];
    await onBatch(result);
    await yieldControl();
  }
}

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

  async run({ limit = 100, legacyDeletionDecisions = [] } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || this.#busy) {
      throw new SyncProtocolError(this.#busy ? "busy" : "invalid_run_limit");
    }
    if (!Array.isArray(legacyDeletionDecisions) || legacyDeletionDecisions.length > 1) {
      throw new SyncProtocolError("invalid_legacy_review");
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
          !["remote", "local", "complete", "compact", "retire"].includes(this.#entry.value.phase))) {
        throw new SyncProtocolError("rotation_state_corrupt");
      }
      if (!this.#entry) {
        if (rotation.phase === "complete" && this.#keys.snapshot.keyCount === 1 && this.#keys.snapshot.localKeyCount === 1) {
          return { done: true, processed: 0, remaining: 0 };
        }
        this.#entry = { id, collection: "devices", kind: "metadata", revision: 0 };
        await this.#save({ version: 1, rotation: rotation.operation_id,
          phase: rotation.phase === "complete" ? "local" : "remote", pending: null, after: null });
      }
      if (legacyDeletionDecisions.length) {
        const [decision] = legacyDeletionDecisions;
        if (!this.#sameReview(this.#entry.value.review, decision) || decision.decision !== "delete") {
          throw new SyncProtocolError("invalid_legacy_review");
        }
        await this.#save({ ...this.#entry.value, review: { ...this.#entry.value.review, decision: "delete" } });
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
          const changesHistoryIdentity = this.#entry.value.pending.path === "api/v1/crypto/rotation/history-id";
          await this.#sendPending();
          ++processed;
          if (changesHistoryIdentity) {
            break;
          }
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
        await this.#save({ ...this.#entry.value, phase: "compact", compacted: [] });
      }
      if (this.#entry.value.phase === "compact") {
        const compacted = this.#entry.value.compacted;
        if (!Array.isArray(compacted) || new Set(compacted).size !== compacted.length ||
            compacted.some(collection => !COLLECTIONS.has(collection))) {
          throw new SyncProtocolError("rotation_state_corrupt");
        }
        const { data } = await this.#request("api/v1/capabilities", { maxBytes: 32768 });
        if (!Array.isArray(data?.features) || !data.features.includes("journal_compaction") ||
            !Array.isArray(data.collections) || [...COLLECTIONS].some(collection =>
              !["workspaces", "site-permissions", "extensions", "extension-settings"].includes(collection) && !data.collections.includes(collection)) ||
            compacted.some(collection => !data.collections.includes(collection))) {
          throw new SyncProtocolError("journal_compaction_unsupported");
        }
        const targets = [...COLLECTIONS].filter(collection => data.collections.includes(collection));
        for (const collection of targets) {
          if (this.#entry.value.compacted.includes(collection)) {
            continue;
          }
          if (processed >= limit) {
            break;
          }
          await this.#prepareCompaction(collection);
          await this.#sendPending();
          ++processed;
        }
        if (this.#entry.value.compacted.length === targets.length) {
          await this.#save({ ...this.#entry.value, phase: "retire" });
        }
      }
      if (this.#entry.value.phase === "retire") {
        await this.#keys.retireUnusedKeys(this.#journal);
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

  async #prepareCompaction(collection) {
    const path = `api/v1/sync/collections/${collection}`;
    const { data } = await this.#request(`${path}/changes`, { query: { limit: 1 }, maxBytes: 1024 * 1024 });
    this.#ensureOpen();
    if (!SYNC_STORE_UUID.test(data?.generation) || !validSyncCounter(data.snapshot_sequence)) {
      throw new SyncProtocolError("invalid_compaction_snapshot");
    }
    const operationId = this.#createId();
    if (!SYNC_STORE_UUID.test(operationId)) {
      throw new SyncProtocolError("invalid_operation_id");
    }
    await this.#save({ ...this.#entry.value, pending: { kind: "compact", collection, path: `${path}/compact`, body: {
      crypto: this.#keys.writeContext, operation_id: operationId, generation: data.generation,
      snapshot_sequence: data.snapshot_sequence,
    } } });
  }

  async #prepare({ collection, generation, record }) {
    this.#ensureOpen();
    if (!COLLECTIONS.has(collection) || !SYNC_STORE_UUID.test(generation)) {
      throw new SyncProtocolError("invalid_rotation_page");
    }
    validateRemoteRecord(record);
    const expected = { collection, generation, id: record.id };
    const value = await this.#openForMigration(collection, generation, record);
    const crypto = this.#keys.writeContext;
    const operationId = this.#createId();
    if (!SYNC_STORE_UUID.test(operationId)) {
      throw new SyncProtocolError("invalid_operation_id");
    }
    let path;
    let body;
    if (collection === "history" && !record.deleted && /^h1:[0-9a-f]{64}$/.test(record.id)) {
      let targetValue = await this.#history.validate(record.id, value);
      const targetId = await this.#history.migrationId(targetValue);
      const { data } = await this.#request("api/v1/crypto/rotation/history-target", {
        method: "POST", body: { id: targetId, generation }, maxBytes: 1024 * 1024,
      });
      this.#ensureOpen();
      if (data?.rotation_id !== this.#entry.value.rotation || data.generation !== generation ||
          (data.record !== null && data.record?.id !== targetId)) {
        throw new SyncProtocolError("invalid_rotation_target");
      }
      let targetDeleted = false;
      let targetTtl = record.ttl;
      if (data.record !== null) {
        validateRemoteRecord(data.record);
        const existing = await this.#openForMigration(collection, generation, data.record);
        targetDeleted = data.record.deleted;
        if (!targetDeleted) {
          const validated = await this.#history.validate(targetId, existing);
          targetValue = await this.#history.mergeForMigration(targetValue, validated);
        }
        if (data.record.ttl !== null && (targetTtl === null || Date.parse(data.record.ttl) < Date.parse(targetTtl))) {
          targetTtl = data.record.ttl;
        }
      }
      targetDeleted ||= targetTtl !== null && Date.parse(targetTtl) <= Date.now();
      if (targetDeleted) {
        targetValue = null;
        targetTtl = null;
      }
      const targetRevision = data.record?.revision ?? "0";
      const target = await sealSyncRecord(this.#keys, { ...expected, id: targetId, base_revision: targetRevision },
        { deleted: targetDeleted, ttl: targetTtl, value: targetValue });
      const source = await sealSyncRecord(this.#keys, { ...expected, base_revision: record.revision },
        { deleted: true, ttl: null, value: null });
      path = "api/v1/crypto/rotation/history-id";
      body = { crypto, operation_id: operationId, rotation_id: this.#entry.value.rotation, generation,
        source_id: record.id, source_revision: record.revision, target_id: targetId,
        source_payload: source.payload, target_payload: target.payload, target_revision: targetRevision,
        target_deleted: targetDeleted, target_ttl: targetTtl };
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

  async #openForMigration(collection, generation, record) {
    if (!record.deleted || record.payload) {
      return openSyncRecord(this.#keys, { collection, generation, id: record.id }, record);
    }
    const review = { rotation_id: this.#entry.value.rotation, collection, generation,
      id: record.id, revision: record.revision, ttl: record.ttl, decision: null };
    if (this.#sameReview(this.#entry.value.review, review) && this.#entry.value.review.decision === "delete") {
      return null;
    }
    await this.#save({ ...this.#entry.value, review });
    throw Object.assign(new SyncProtocolError("legacy_tombstone_review_required"), { review: [structuredClone(review)] });
  }

  #sameReview(left, right) {
    return Boolean(left && right && ["rotation_id", "collection", "generation", "id", "revision", "ttl"]
      .every(field => left[field] === right[field]));
  }

  async #sendPending() {
    this.#ensureOpen();
    if (this.#entry.value.pending.kind === "compact") {
      await this.#sendCompaction();
      return;
    }
    const { path, body } = this.#entry.value.pending;
    if (body.crypto?.epoch !== this.#keys.writeContext.epoch) {
      throw new SyncProtocolError("crypto_state_conflict");
    }
    let data;
    try {
      ({ data } = await this.#request(path, { method: "POST", body, maxBytes: 1024 * 1024 }));
    } catch (error) {
      if (path === "api/v1/crypto/rotation/history-id" && error.status === 409 &&
          ["history_source_conflict", "history_target_conflict", "history_target_exists", "history_target_deleted"].includes(error.code)) {
        await this.#save({ ...this.#entry.value, pending: null });
        throw new SyncProtocolError("rotation_conflict_retry");
      }
      throw error;
    }
    if (path === "api/v1/crypto/rotation/history-id") {
      if (data?.operation_id !== body.operation_id || data.source_id !== body.source_id ||
          data.target_id !== body.target_id || data.generation !== body.generation ||
          data.rotation_id !== body.rotation_id || data.target_revision !== String(BigInt(body.target_revision ?? "0") + 1n) ||
          data.target_deleted !== body.target_deleted ||
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

  async #sendCompaction() {
    const { collection, path, body } = this.#entry.value.pending;
    if (this.#entry.value.phase !== "compact" || !COLLECTIONS.has(collection) ||
        body.crypto?.epoch !== this.#keys.writeContext.epoch) {
      throw new SyncProtocolError("crypto_state_conflict");
    }
    let data;
    try {
      ({ data } = await this.#request(path, { method: "POST", body, maxBytes: 32768 }));
    } catch (error) {
      if (error.status === 409 && error.code === "snapshot_conflict") {
        await this.#save({ ...this.#entry.value, pending: null });
        throw new SyncProtocolError("rotation_conflict_retry");
      }
      throw error;
    }
    if (data?.operation_id !== body.operation_id || data.generation !== body.generation ||
        data.compacted_through !== body.snapshot_sequence || !validSyncCounter(data.snapshot_sequence) ||
        BigInt(data.snapshot_sequence) < BigInt(body.snapshot_sequence) || !Number.isSafeInteger(data.records) || data.records < 0) {
      throw new SyncProtocolError("invalid_compaction_result");
    }
    await this.#save({ ...this.#entry.value, pending: null, compacted: [...this.#entry.value.compacted, collection] });
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
