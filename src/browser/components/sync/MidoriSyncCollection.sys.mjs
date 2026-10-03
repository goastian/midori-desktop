/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MAX_LOCAL_VALUE_BYTES, SYNC_STORE_UUID, validateSyncStoreEntry } from "./MidoriSyncLocalCodec.sys.mjs";
import {
  SyncProtocolError, historyClearCutoff, validSyncCounter, validSyncCursor, validSyncRecordId, validateChangePage,
  validateRemoteRecord, validateOperationResults,
} from "./MidoriSyncProtocol.sys.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_PLAINTEXT_BYTES = 190000;

export function validateSyncCollectionState(value) {
  const previous = value;
  const legacy = [1, 2].includes(previous?.version);
  const state = previous?.version === 1 ? { ...previous, version: 3, deferred: 0, activeApplication: null, applicationAfter: null } :
    legacy ? { ...previous, version: 3 } : previous;
  if (state?.version !== 3 || (state.generation !== null && !SYNC_STORE_UUID.test(state.generation)) ||
      !validSyncCounter(state.sequence) || (state.fence !== null && !validSyncCounter(state.fence)) ||
      !Number.isSafeInteger(state.pending) || state.pending < 0 || state.pending > 10000 ||
      !Number.isSafeInteger(state.conflicts) || state.conflicts < 0 || state.conflicts > 10000 ||
      !Number.isSafeInteger(state.deferred) || state.deferred < 0 || state.deferred > 10000 ||
      (state.clearBeforeMs != null && (!Number.isSafeInteger(state.clearBeforeMs) ||
        state.clearBeforeMs < 1 || state.clearBeforeMs > Math.floor(Number.MAX_SAFE_INTEGER / 1000))) ||
      (state.pendingClear != null && (!SYNC_STORE_UUID.test(state.pendingClear.id) ||
        state.pendingClear.generation !== state.generation)) ||
      (state.activeApplication !== null && (!state.deferred || !SYNC_STORE_UUID.test(state.activeApplication))) ||
      (state.applicationAfter !== null && !SYNC_STORE_UUID.test(state.applicationAfter)) ||
      (state.lastCompletedAt != null && (!Number.isSafeInteger(state.lastCompletedAt) || state.lastCompletedAt < 1)) ||
      typeof state.initialized !== "boolean" || !Number.isInteger(state.index) || state.index < 0 || state.index > 100 ||
      (state.inbox !== null && !SYNC_STORE_UUID.test(state.inbox)) ||
      (state.cursor !== null && !validSyncCursor(state.cursor)) ||
      (state.ack !== null && (!validSyncCursor(state.ack) || state.ack !== state.cursor)) ||
      (state.fence !== null && (!state.cursor || BigInt(state.fence) <= BigInt(state.sequence))) ||
      (state.inbox === null && state.index !== 0) ||
      (state.initialized && !state.cursor) ||
      (state.generation === null && (state.sequence !== "0" || state.cursor || state.fence || state.inbox || state.pending || state.deferred))) {
    throw new SyncProtocolError("engine_state_corrupt");
  }
  return state;
}

export class MidoriSyncCollection {
  #collection;
  #journal;
  #keys;
  #adapter;
  #request;
  #entryId;
  #createId;
  #now;
  #state = null;
  #busy = false;
  #closed = false;
  #abort = new AbortController();
  #listeners = new Set();
  #phase = "idle";
  #error = null;
  #retryAfter = 0;
  constructor({ collection, journal, keys, adapter, request, entryId, createId, now = Date.now }) {
    validateSyncStoreEntry({ id: "00000000-0000-0000-0000-000000000000", collection, kind: "metadata", revision: 1 });
    this.#collection = collection;
    this.#journal = journal;
    this.#keys = keys;
    this.#adapter = adapter;
    this.#request = request;
    this.#entryId = entryId;
    this.#createId = createId;
    this.#now = now;
  }

  get snapshot() {
    return Object.freeze({
      phase: this.#phase, busy: this.#busy, error: this.#error, retryAfter: this.#retryAfter,
      pending: this.#state?.value.pending ?? 0, conflicts: this.#state?.value.conflicts ?? 0,
      deferred: this.#state?.value.deferred ?? 0,
      lastCompletedAt: this.#state?.value.lastCompletedAt ?? null,
      initialized: this.#state?.value.initialized ?? false,
      more: Boolean(this.#state && (this.#state.value.pending || this.#state.value.inbox || this.#state.value.ack || this.#state.value.fence || this.#state.value.deferred)),
    });
  }

  subscribe(listener) {
    this.#ensureOpen();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async initialize() {
    return this.#exclusive(async () => {});
  }

  async markCompleted(at = Date.now()) {
    if (!Number.isSafeInteger(at) || at < 1) {
      throw new SyncProtocolError("invalid_sync_time");
    }
    return this.#exclusive(async () => {
      if (!this.#state.value.initialized) {
        throw new SyncProtocolError("bootstrap_required");
      }
      const completedAt = Math.max(at, this.#state.value.lastCompletedAt ?? 0);
      if (completedAt !== this.#state.value.lastCompletedAt) {
        await this.#save([], { ...this.#state.value, lastCompletedAt: completedAt });
      }
      return completedAt;
    });
  }

  async record(id) {
    this.#ensureOpen();
    if (!validSyncRecordId(id)) {
      throw new SyncProtocolError("invalid_record");
    }
    return (await this.#mirror(id))?.value ?? null;
  }

  async enqueue(id, value, { deleted = false } = {}) {
    if (!validSyncRecordId(id) || typeof deleted !== "boolean") {
      throw new SyncProtocolError("invalid_record");
    }
    const captured = deleted ? null : structuredClone(value);
    return this.#exclusive(async () => {
      if (!this.#state.value.initialized) {
        throw new SyncProtocolError("bootstrap_required");
      }
      const mirror = await this.#mirror(id);
      if (mirror?.value.applying) {
        throw new SyncProtocolError("record_application_pending");
      }
      if (mirror?.value.pending || mirror?.value.blocked) {
        throw new SyncProtocolError(mirror.value.pending ? "record_pending" : "record_conflict");
      }
      const data = deleted ? null : await this.#adapter.validate(id, captured);
      return this.#enqueue(id, data, deleted, mirror);
    });
  }

  async capture(id) {
    if (!validSyncRecordId(id)) {
      throw new SyncProtocolError("invalid_record");
    }
    return this.#exclusive(() => this.#capture(id));
  }

  async capturePage({ after = null, limit = 100 } = {}) {
    if ((after !== null && !SYNC_STORE_UUID.test(after)) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new SyncProtocolError("invalid_capture_query");
    }
    return this.#exclusive(async () => {
      this.#requireCapture();
      const rows = await this.#journal.list(this.#collection, "record", { after, limit });
      const results = [];
      for (const row of rows) {
        const mirror = await this.#mirror(row.value?.id);
        if (!mirror || mirror.id !== row.id || mirror.revision !== row.revision) {
          throw new SyncProtocolError("engine_state_corrupt");
        }
        results.push({ id: row.value.id, ...await this.#capture(row.value.id) });
      }
      return { results, nextAfter: rows.length === limit ? rows.at(-1).id : null };
    });
  }

  #requireCapture() {
    if (!this.#state.value.initialized) {
      throw new SyncProtocolError("bootstrap_required");
    }
    if (this.#state.value.activeApplication || this.#state.value.inbox) {
      throw new SyncProtocolError("application_recovery_required");
    }
    if (!this.#adapter.read || !this.#adapter.matchesLocal) {
      throw new SyncProtocolError("capture_unavailable");
    }
  }

  async #capture(id) {
    this.#requireCapture();
    this.#setPhase("capturing");
    const mirror = await this.#mirror(id);
    if (mirror?.value.applying || mirror?.value.pending || mirror?.value.blocked) {
      return { status: mirror.value.blocked ? "conflict" : "pending" };
    }
    const remote = mirror?.value.remote;
    const base = remote && !this.#effectiveIncoming(remote).deleted ? remote.value : null;
    const current = await this.#adapter.read(id, base);
    this.#ensureOpen();
    const matches = await this.#adapter.matchesLocal(id, current, base, mirror?.value.position ?? null);
    this.#ensureOpen();
    if (typeof matches !== "boolean") {
      throw new SyncProtocolError("invalid_adapter_result");
    }
    if (matches) {
      return { status: "unchanged" };
    }
    const deleted = current === null;
    const value = deleted ? null : await this.#adapter.validate(id, current);
    return { status: "queued", operationId: await this.#enqueue(id, value, deleted, mirror) };
  }

  async #enqueue(id, data, deleted, mirror) {
    if (this.#state.value.pending >= 10000) {
      throw new SyncProtocolError("queue_full");
    }
    const baseRevision = mirror?.value.remote?.revision ?? "0";
    const operationId = this.#newId();
    const operation = { operation_id: operationId, id, base_revision: baseRevision, deleted };
    const ttl = deleted ? null : this.#adapter.ttlOf?.(data) ?? null;
    if (ttl !== null) {
      const expiry = typeof ttl === "string" ? Date.parse(ttl) : NaN;
      if (!Number.isSafeInteger(expiry) || expiry <= this.#now()) {
        throw new SyncProtocolError("invalid_record");
      }
      operation.ttl = new Date(Math.floor(expiry / 1000) * 1000).toISOString().replace(".000Z", "+00:00");
    }
    const crypto = this.#keys.writeContext;
    if (!deleted) {
      const bytes = encoder.encode(JSON.stringify(data));
      try {
        if (bytes.length > MAX_PLAINTEXT_BYTES) {
          throw new SyncProtocolError("record_too_large");
        }
        const sealed = await this.#keys.sealRecord({
          collection: this.#collection, id, generation: this.#state.value.generation,
          schema_version: 1, base_revision: baseRevision,
        }, bytes);
        if (sealed.crypto.epoch !== crypto.epoch || sealed.crypto.revision !== crypto.revision) {
          throw new SyncProtocolError("crypto_state_conflict");
        }
        operation.payload = sealed.payload;
      } finally {
        bytes.fill(0);
      }
    }
    const queued = { version: 1, generation: this.#state.value.generation, epoch: crypto.epoch, operation, value: data,
      position: this.#positionOf(id, data) };
    const nextMirror = { ...mirror?.value, version: 1, id, remote: mirror?.value.remote ?? null,
      pending: operationId, blocked: false, applying: null };
    await this.#save([
      this.#change(null, "outbox", operationId, queued),
      this.#change(mirror, "record", await this.#id("record", id), nextMirror),
    ], { ...this.#state.value, pending: this.#state.value.pending + 1 });
    return operationId;
  }

  async run({ maxPages = 10, maxBatches = 4, maxApplications = 100 } = {}) {
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100 ||
        !Number.isInteger(maxBatches) || maxBatches < 1 || maxBatches > 100 ||
        !Number.isInteger(maxApplications) || maxApplications < 1 || maxApplications > 1000) {
      throw new SyncProtocolError("invalid_run_limit");
    }
    return this.#exclusive(async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await this.#runCycle({ maxPages, maxBatches, maxApplications });
          return;
        } catch (error) {
          if (this.#collection !== "history" || error.code !== "reset_required" || attempt) {
            throw error;
          }
          await this.#recoverHistoryReset();
        }
      }
    });
  }

  async clearHistory() {
    if (this.#collection !== "history") {
      throw new SyncProtocolError("invalid_collection");
    }
    return this.#exclusive(async () => {
      if (!this.#state.value.initialized) {
        await this.#runCycle({ maxPages: 10, maxBatches: 4, maxApplications: 100 });
      }
      if (!this.#state.value.initialized) {
        throw new SyncProtocolError("bootstrap_required");
      }
      if (!this.#state.value.pendingClear) {
        await this.#save([], { ...this.#state.value,
          pendingClear: { id: this.#newId(), generation: this.#state.value.generation } });
      }
      return this.#finishHistoryClear();
    });
  }

  async #finishHistoryClear() {
    const operation = this.#state.value.pendingClear;
    if (!operation) {
      throw new SyncProtocolError("invalid_history_clear");
    }
    this.#setPhase("clearing");
    const { data } = await this.#send("clear", { method: "POST", body: {
      operation_id: operation.id, generation: operation.generation, crypto: this.#keys.writeContext,
    } });
    const cutoff = historyClearCutoff({ kind: "history_clear", clear_before: data?.clear_before });
    if (data.operation_id !== operation.id || data.previous_generation !== operation.generation ||
        !SYNC_STORE_UUID.test(data.generation) || data.generation === operation.generation ||
        !Number.isSafeInteger(data.deleted_records) || data.deleted_records < 0) {
      throw new SyncProtocolError("invalid_history_clear");
    }
    await this.#recoverHistoryReset(data.generation, cutoff);
    if (this.#state.value.clearBeforeMs !== cutoff || this.#state.value.pendingClear) {
      throw new SyncProtocolError("invalid_history_clear");
    }
    return { deletedRecords: data.deleted_records, clearBeforeMs: cutoff };
  }

  async #runCycle({ maxPages, maxBatches, maxApplications }) {
    if (this.#collection === "history" && this.#state.value.pendingClear) {
      await this.#finishHistoryClear();
    }
    if (this.#collection === "history" && this.#state.value.generation &&
        (this.#state.value.activeApplication || this.#state.value.inbox || this.#state.value.deferred ||
          this.#state.value.pending || this.#state.value.ack)) {
      const query = { limit: 1, ...(this.#state.value.cursor ? { cursor: this.#state.value.cursor } : {}) };
      const { data } = await this.#send("changes", { query });
      if (data?.generation !== this.#state.value.generation) {
        throw new SyncProtocolError("reset_required");
      }
      const cutoff = data.reset === undefined ? null : historyClearCutoff(data.reset);
      if (cutoff !== (this.#state.value.clearBeforeMs ?? null)) {
        throw new SyncProtocolError("history_reset_required");
      }
    }
    if (this.#state.value.activeApplication) {
      await this.#executeApplication(await this.#application(this.#state.value.activeApplication));
    }
    if (this.#state.value.inbox) {
      await this.#applyInbox();
    }
    let remaining = maxApplications;
    remaining -= await this.#retryApplications(remaining);
    await this.#acknowledge();
    for (let batch = 0; batch < maxBatches && this.#state.value.pending; batch++) {
      if (!(await this.#upload())) {
        break;
      }
    }
    for (let page = 0; page < maxPages; page++) {
      await this.#download();
      await this.#applyInbox();
      remaining -= await this.#retryApplications(remaining);
      await this.#acknowledge();
      if (this.#state.value.fence === null) {
        break;
      }
    }
  }

  close() {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#abort.abort();
    this.#phase = "closed";
    this.#listeners.clear();
    this.#adapter.close?.();
  }

  async #load() {
    const id = await this.#id("metadata", "collection-state-v1");
    this.#state = await this.#journal.read(id);
    this.#ensureOpen();
    if (!this.#state) {
      const value = { version: 3, generation: null, cursor: null, sequence: "0", fence: null,
        inbox: null, index: 0, ack: null, initialized: false, pending: 0, conflicts: 0,
        deferred: 0, activeApplication: null, applicationAfter: null, lastCompletedAt: null };
      await this.#journal.commit([this.#change(null, "metadata", id, value)]);
      this.#state = { id, collection: this.#collection, kind: "metadata", revision: 1, value };
    }
    const legacy = [1, 2].includes(this.#state.value?.version);
    if (this.#state.collection !== this.#collection || this.#state.kind !== "metadata") {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    const state = validateSyncCollectionState(this.#state.value);
    if (legacy) {
      await this.#save([], state);
    }
    if (this.#collection === "history" && state.clearBeforeMs != null) {
      this.#adapter.setHistoryCutoff?.(state.clearBeforeMs);
    }
  }

  async #mirror(id) {
    const entry = await this.#journal.read(await this.#id("record", id));
    this.#ensureOpen();
    if (entry && (entry.collection !== this.#collection || entry.kind !== "record" || entry.value?.version !== 1 ||
        entry.value.id !== id || typeof entry.value.blocked !== "boolean" ||
        (entry.value.position != null && !this.#validPosition(entry.value.position)) ||
        (entry.value.applying != null && (!SYNC_STORE_UUID.test(entry.value.applying) || entry.value.pending || entry.value.blocked)) ||
        (entry.value.pending !== null && !SYNC_STORE_UUID.test(entry.value.pending)) ||
        (entry.value.remote !== null && (entry.value.remote?.id !== id || !validSyncCounter(entry.value.remote.revision, 2147483647n))))) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    return entry;
  }

  async #recoverHistoryReset(expectedGeneration = null, expectedCutoff = null) {
    const { data } = await this.#send("changes", { query: { limit: 1 }, maxBytes: 8 * 1024 * 1024 });
    const cutoff = historyClearCutoff(data?.reset);
    validateChangePage(data, { generation: null, sequence: "0", fence: null });
    if (data.generation === this.#state.value.generation ||
        (expectedGeneration && data.generation !== expectedGeneration) ||
        (expectedCutoff && cutoff !== expectedCutoff) ||
        cutoff < (this.#state.value.clearBeforeMs ?? 0)) {
      throw new SyncProtocolError("invalid_history_reset");
    }
    if (typeof this.#adapter.clearBefore !== "function" || typeof this.#journal.clearHistory !== "function") {
      throw new SyncProtocolError("history_reset_unavailable");
    }
    this.#setPhase("resetting");
    await this.#adapter.clearBefore(cutoff);
    this.#ensureOpen();
    await this.#journal.clearHistory();
    this.#ensureOpen();
    this.#state = null;
    await this.#load();
    await this.#save([], { ...this.#state.value, clearBeforeMs: cutoff });
  }

  async #download() {
    this.#setPhase("downloading");
    let limit = 100;
    let page;
    while (true) {
      const query = { limit, ...(this.#state.value.cursor ? { cursor: this.#state.value.cursor } : {}) };
      const { data } = await this.#send("changes", { query, maxBytes: 8 * 1024 * 1024 });
      try {
        page = validateChangePage(data, this.#state.value);
        break;
      } catch (error) {
        if (error.code !== "change_page_too_large" || limit === 1) {
          throw error;
        }
        limit = Math.max(1, Math.floor(limit / 2));
      }
    }
    let cutoff = null;
    if (this.#collection === "history") {
      cutoff = page.reset === undefined ? null : historyClearCutoff(page.reset);
      if ((this.#state.value.generation && cutoff !== (this.#state.value.clearBeforeMs ?? null)) ||
          (!this.#state.value.generation && this.#state.value.clearBeforeMs != null &&
            cutoff !== this.#state.value.clearBeforeMs)) {
        throw new SyncProtocolError("history_reset_required");
      }
      if (cutoff !== null && !this.#state.value.generation) {
        this.#adapter.setHistoryCutoff?.(cutoff);
      }
    }
    const id = this.#newId();
    await this.#save([this.#change(null, "inbox", id, page)], {
      ...this.#state.value, generation: page.generation, inbox: id, index: 0,
      ...(cutoff === null ? {} : { clearBeforeMs: cutoff }),
    });
  }

  async #applyInbox() {
    this.#setPhase("applying");
    const entry = await this.#journal.read(this.#state.value.inbox);
    if (!entry || entry.kind !== "inbox" || entry.collection !== this.#collection) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    const page = validateChangePage(entry.value, this.#state.value);
    if (this.#state.value.index > page.changes.length) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    for (let index = this.#state.value.index; index < page.changes.length; index++) {
      await this.#applyChange(page.changes[index], index);
    }
    const sequence = page.changes.at(-1)?.sequence ?? this.#state.value.sequence;
    await this.#save([this.#remove(entry)], {
      ...this.#state.value, cursor: page.next_cursor, sequence,
      fence: page.has_more ? page.snapshot_sequence : null, inbox: null, index: 0,
      ack: page.next_cursor, initialized: this.#state.value.initialized || (!page.has_more && !this.#state.value.deferred),
    });
  }

  async #applyChange(change, index) {
    this.#ensureOpen();
    const raw = change.record;
    let mirror = null;
    let incoming = null;
    let outcome = null;
    try {
      validateRemoteRecord(raw);
      mirror = await this.#mirror(raw.id);
      if (mirror?.value.applying) {
        const queued = await this.#application(mirror.value.applying);
        if (BigInt(raw.revision) <= BigInt(queued.value.incoming.revision)) {
          this.#checkRepeatedRecord(raw, queued.value.incoming);
          await this.#save([], { ...this.#state.value, index: index + 1 });
          return;
        }
      }
      if (mirror?.value.remote && BigInt(raw.revision) <= BigInt(mirror.value.remote.revision)) {
        this.#checkRepeatedRecord(raw, mirror.value.remote);
        await this.#save([], { ...this.#state.value, index: index + 1 });
        return;
      }
      let value = null;
      if (!raw.deleted) {
        const bytes = await this.#keys.openRecord({ collection: this.#collection, id: raw.id, generation: this.#state.value.generation }, raw.payload);
        try {
          let parsed;
          try {
            parsed = JSON.parse(decoder.decode(bytes));
          } catch {
            throw new SyncProtocolError("invalid_record");
          }
          const envelope = JSON.parse(raw.payload);
          if (!validSyncCounter(envelope.context?.base_revision) || BigInt(envelope.context.base_revision) + 1n !== BigInt(raw.revision)) {
            throw new SyncProtocolError("record_revision_mismatch");
          }
          value = await this.#adapter.validate(raw.id, parsed);
        } finally {
          bytes.fill(0);
        }
      }
      incoming = { ...raw, value };
      if (mirror?.value.pending || mirror?.value.blocked) {
        outcome = { status: "conflict", reason: "local_change_pending" };
      } else {
        const application = await this.#stageApplication(change, incoming, mirror, index);
        await this.#executeApplication(application);
        return;
      }
    } catch (error) {
      const code = this.#recordError(error);
      if (!code) {
        throw error;
      }
      outcome = { status: "conflict", reason: code };
    }
    const changes = [];
    if (incoming) {
      changes.push(this.#change(mirror, "record", await this.#id("record", raw.id), {
        version: 1, id: raw.id, remote: incoming, pending: mirror?.value.pending ?? null,
        blocked: outcome.status === "conflict", applying: null,
      }));
    }
    if (outcome.status === "conflict") {
      changes.push(this.#change(null, "conflict", this.#newId(), { version: 1, source: "download", change, outcome }));
    }
    await this.#save(changes, { ...this.#state.value, index: index + 1,
      conflicts: this.#state.value.conflicts + (outcome.status === "conflict" ? 1 : 0) });
  }

  #checkRepeatedRecord(incoming, previous) {
    if (incoming.revision === previous.revision &&
        (incoming.payload !== previous.payload || incoming.deleted !== previous.deleted || incoming.ttl !== previous.ttl)) {
      throw new SyncProtocolError("record_revision_mismatch");
    }
  }

  #recordError(error) {
    const code = error.name === "OperationError" ? "record_authentication_failed" :
      error.name === "NotSupportedError" ? "record_version_unsupported" : error.code;
    return ["invalid_record", "record_revision_mismatch", "record_authentication_failed", "record_version_unsupported"].includes(code) ? code : null;
  }

  #positionOf(id, value) {
    return this.#adapter.positionOf?.(id, value) ?? null;
  }

  #validPosition(value) {
    return value && validSyncRecordId(value.parentGuid) && Number.isInteger(value.index) && value.index >= 0 && value.index <= 1000000;
  }

  #samePosition(left, right) {
    return left === null || right === null ? left === right : left.parentGuid === right.parentGuid && left.index === right.index;
  }

  #effectiveIncoming(incoming) {
    return { ...incoming, deleted: incoming.deleted || (incoming.ttl !== null && Date.parse(incoming.ttl) <= this.#now()) };
  }

  async #prepareApplication(incoming, base, position) {
    if (!this.#adapter.prepare) {
      return null;
    }
    let plan;
    try {
      plan = await this.#adapter.prepare(structuredClone(this.#effectiveIncoming(incoming)), structuredClone(base), {
        position: structuredClone(position),
      });
    } catch (error) {
      if (this.#recordError(error)) {
        throw new SyncProtocolError("application_prepare_failed");
      }
      throw error;
    }
    this.#ensureOpen();
    if (!plan || plan.id !== incoming.id) {
      throw new SyncProtocolError("invalid_adapter_result");
    }
    return plan;
  }

  async #application(id) {
    const entry = await this.#journal.read(id);
    this.#ensureOpen();
    const value = entry?.value;
    if (!entry || entry.kind !== "application" || entry.collection !== this.#collection || ![1, 2].includes(value?.version) ||
        value.generation !== this.#state.value.generation || !["applying", "waiting", "projecting"].includes(value.phase) ||
        !validSyncCounter(value.change?.sequence) || value.change.sequence === "0" ||
        (value.phase !== "waiting") !== (this.#state.value.activeApplication === id) ||
        (value.source !== null && (value.phase === "waiting" || value.source?.inbox !== this.#state.value.inbox ||
          value.source.index !== this.#state.value.index)) ||
        (value.phase === "projecting" && (value.version !== 2 || value.outcome?.status !== "applied" || !value.outcome.effects ||
          (value.projectionAfter !== null && !SYNC_STORE_UUID.test(value.projectionAfter)))) ||
        (value.phase === "waiting" && !/^[a-z][a-z0-9_]{0,63}$/.test(value.reason))) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    try {
      validateRemoteRecord(value.incoming);
      validateRemoteRecord(value.change.record);
      if (value.base !== null) {
        validateRemoteRecord(value.base);
        if (value.base.id !== value.incoming.id || BigInt(value.base.revision) >= BigInt(value.incoming.revision)) {
          throw new SyncProtocolError("engine_state_corrupt");
        }
      }
    } catch {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    if (id !== await this.#id("application", value.incoming.id) ||
        !["id", "revision", "payload", "deleted", "ttl"].every(key => value.incoming[key] === value.change.record[key])) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    const mirror = await this.#mirror(value.incoming.id);
    if (mirror?.value.applying !== id || JSON.stringify(mirror.value.remote) !== JSON.stringify(value.base)) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    return entry;
  }

  async #stageApplication(change, incoming, mirror, index) {
    if (this.#state.value.activeApplication) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    const id = await this.#id("application", incoming.id);
    const previous = mirror?.value.applying ? await this.#application(id) : null;
    const position = mirror?.value.position ?? this.#positionOf(incoming.id, mirror?.value.remote?.value);
    const plan = await this.#prepareApplication(incoming, mirror?.value.remote ?? null, position);
    const value = { version: 2, generation: this.#state.value.generation, change, incoming, plan,
      base: mirror?.value.remote ?? null, phase: "applying", reason: null,
      source: { inbox: this.#state.value.inbox, index } };
    await this.#save([
      this.#change(previous, "application", id, value),
      this.#change(mirror, "record", await this.#id("record", incoming.id), {
        version: 1, id: incoming.id, remote: value.base, pending: null, blocked: false, applying: id, position,
      }),
    ], { ...this.#state.value, activeApplication: id, deferred: this.#state.value.deferred + (previous ? 0 : 1) });
    return { id, collection: this.#collection, kind: "application", revision: (previous?.revision ?? 0) + 1, value };
  }

  async #executeApplication(entry) {
    this.#ensureOpen();
    this.#setPhase("applying");
    const { incoming, base, source, plan } = entry.value;
    let outcome = entry.value.phase === "projecting" ? entry.value.outcome : null;
    try {
      if (!outcome) {
        if (this.#adapter.prepare && !plan) {
          throw new SyncProtocolError("application_upgrade_required");
        }
        outcome = plan ? await this.#adapter.applyPrepared(structuredClone(plan)) :
          await this.#adapter.apply(structuredClone(this.#effectiveIncoming(incoming)), structuredClone(base));
      }
    } catch (error) {
      const code = this.#recordError(error);
      if (!code) {
        throw error;
      }
      outcome = { status: "conflict", reason: code };
    }
    this.#ensureOpen();
    if (!outcome || !["applied", "conflict", "deferred"].includes(outcome.status) ||
        (outcome.status !== "applied" && !/^[a-z][a-z0-9_]{0,63}$/.test(outcome.reason))) {
      throw new SyncProtocolError("invalid_adapter_result");
    }
    const deferred = outcome.status === "deferred";
    const conflict = outcome.status === "conflict";
    if (outcome.status === "applied" && outcome.effects) {
      if (!plan || !this.#adapter.project || JSON.stringify(plan.effects) !== JSON.stringify(outcome.effects)) {
        throw new SyncProtocolError("invalid_adapter_result");
      }
      if (entry.value.phase !== "projecting") {
        const value = { ...entry.value, phase: "projecting", outcome, projectionAfter: null };
        await this.#save([this.#change(entry, "application", entry.id, value)], this.#state.value);
        entry = { ...entry, revision: entry.revision + 1, value };
      }
      entry = await this.#projectPositions(entry);
    }
    const state = { ...this.#state.value, activeApplication: null,
      index: source ? source.index + 1 : this.#state.value.index,
      deferred: this.#state.value.deferred - (deferred ? 0 : 1),
      conflicts: this.#state.value.conflicts + (conflict ? 1 : 0) };
    const changes = [];
    if (deferred) {
      changes.push(this.#change(entry, "application", entry.id, { ...entry.value, phase: "waiting", source: null, reason: outcome.reason }));
    } else {
      const mirror = await this.#mirror(incoming.id);
      changes.push(this.#remove(entry), this.#change(mirror, "record", mirror.id, {
        ...mirror.value, remote: incoming, applying: null, blocked: conflict,
        position: conflict ? null : outcome.position ?? this.#positionOf(incoming.id, incoming.value),
      }));
      if (conflict) {
        changes.push(this.#change(null, "conflict", this.#newId(), {
          version: 1, source: "download", change: entry.value.change, base, outcome,
        }));
      }
      if (!state.deferred) {
        state.applicationAfter = null;
        state.initialized ||= Boolean(state.cursor && !state.inbox && state.fence === null);
      }
    }
    await this.#save(changes, state);
  }

  async #projectPositions(entry) {
    const { incoming, outcome } = entry.value;
    while (true) {
      this.#ensureOpen();
      const rows = await this.#journal.list(this.#collection, "record", { after: entry.value.projectionAfter, limit: 25 });
      if (!rows.length) {
        return entry;
      }
      const targets = [];
      for (const row of rows) {
        if (row.value?.id === incoming.id) {
          continue;
        }
        const mirror = await this.#mirror(row.value?.id);
        if (!mirror || mirror.id !== row.id || mirror.revision !== row.revision) {
          throw new SyncProtocolError("engine_state_corrupt");
        }
        if (mirror.value.remote && !mirror.value.remote.deleted) {
          const position = mirror.value.position ?? this.#positionOf(mirror.value.id, mirror.value.remote.value);
          if (position) {
            targets.push({ entry: mirror, owner: row.id, id: mirror.value.id, position });
          }
        }
        if (mirror.value.pending) {
          const queued = await this.#journal.read(mirror.value.pending);
          if (!queued || queued.kind !== "outbox" || queued.collection !== this.#collection || queued.value.operation?.id !== mirror.value.id) {
            throw new SyncProtocolError("engine_state_corrupt");
          }
          const position = queued.value.position ?? this.#positionOf(mirror.value.id, queued.value.value);
          if (position) {
            targets.push({ entry: queued, owner: row.id, id: mirror.value.id, position });
          }
        }
      }
      const projected = await this.#adapter.project(incoming.id, outcome.effects, targets.map(({ id, position }) => ({ id, position })));
      this.#ensureOpen();
      if (!Array.isArray(projected) || projected.length !== targets.length ||
          projected.some((item, index) => item?.id !== targets[index].id || !this.#validPosition(item.position))) {
        throw new SyncProtocolError("invalid_adapter_result");
      }
      const byOwner = new Map();
      for (let index = 0; index < targets.length; index++) {
        const { entry: target, owner, position } = targets[index];
        if (!this.#samePosition(position, projected[index].position)) {
          const changes = byOwner.get(owner) ?? [];
          changes.push(this.#change(target, target.kind, target.id, { ...target.value, position: projected[index].position }));
          byOwner.set(owner, changes);
        }
      }
      const changes = [];
      let size = encoder.encode(JSON.stringify({ ...entry.value, projectionAfter: rows.at(-1).id })).length +
        encoder.encode(JSON.stringify(this.#state.value)).length;
      let after = entry.value.projectionAfter;
      for (const row of rows) {
        const additions = byOwner.get(row.id) ?? [];
        const bytes = additions.reduce((total, change) => total + encoder.encode(JSON.stringify(change.value)).length, 0);
        if (size + bytes > MAX_LOCAL_VALUE_BYTES) {
          if (after === entry.value.projectionAfter) {
            throw new SyncProtocolError("application_batch_too_large");
          }
          break;
        }
        changes.push(...additions);
        size += bytes;
        after = row.id;
      }
      const value = { ...entry.value, projectionAfter: after };
      await this.#save([...changes, this.#change(entry, "application", entry.id, value)], this.#state.value);
      entry = { ...entry, revision: entry.revision + 1, value };
    }
  }

  async #retryApplications(limit) {
    const visited = new Set();
    let wrapped = false;
    while (visited.size < limit && this.#state.value.deferred) {
      const entries = await this.#journal.list(this.#collection, "application", {
        after: this.#state.value.applicationAfter, limit: Math.min(100, limit - visited.size),
      });
      this.#ensureOpen();
      if (!entries.length) {
        if (!this.#state.value.applicationAfter) {
          throw new SyncProtocolError("engine_state_corrupt");
        }
        await this.#save([], { ...this.#state.value, applicationAfter: null });
        if (wrapped) {
          break;
        }
        wrapped = true;
        continue;
      }
      for (const listed of entries) {
        if (visited.has(listed.id)) {
          return visited.size;
        }
        visited.add(listed.id);
        const entry = await this.#application(listed.id);
        const mirror = await this.#mirror(entry.value.incoming.id);
        const position = mirror.value.position ?? this.#positionOf(mirror.value.id, mirror.value.remote?.value);
        const plan = await this.#prepareApplication(entry.value.incoming, entry.value.base, position);
        const value = { ...entry.value, version: 2, plan, phase: "applying", source: null, reason: null };
        await this.#save([this.#change(entry, "application", entry.id, value)], {
          ...this.#state.value, activeApplication: entry.id, applicationAfter: entry.id,
        });
        await this.#executeApplication({ ...entry, revision: entry.revision + 1, value });
      }
    }
    return visited.size;
  }

  async #acknowledge() {
    const state = this.#state.value;
    if (!state.ack || state.deferred || state.activeApplication) {
      return;
    }
    this.#setPhase("acknowledging");
    const { data } = await this.#send("ack", { method: "POST", body: { cursor: state.ack } });
    if (data?.generation !== state.generation || data.acknowledged_sequence !== state.sequence) {
      throw new SyncProtocolError("invalid_acknowledgement");
    }
    await this.#save([], { ...this.#state.value, ack: null });
  }

  async #upload() {
    this.#setPhase("uploading");
    const candidates = await this.#journal.list(this.#collection, "outbox");
    if (!candidates.length) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    const crypto = this.#keys.writeContext;
    const selected = [];
    const operations = [];
    for (const entry of candidates) {
      const queued = entry.value;
      if (queued?.version !== 1 || queued.generation !== this.#state.value.generation || queued.epoch !== crypto.epoch ||
          queued.operation?.operation_id !== entry.id || !validSyncRecordId(queued.operation.id) ||
          !validSyncCounter(queued.operation.base_revision, 2147483647n)) {
        throw new SyncProtocolError("outbox_state_mismatch");
      }
      const next = [...operations, queued.operation];
      if (encoder.encode(JSON.stringify(next)).length > MAX_UPLOAD_BYTES) {
        break;
      }
      selected.push(entry);
      operations.push(queued.operation);
    }
    if (!operations.length) {
      throw new SyncProtocolError("record_too_large");
    }
    const body = { crypto, generation: this.#state.value.generation, operations };
    const { data } = await this.#send("operations", { method: "POST", body });
    const results = validateOperationResults(data, body.generation, operations);
    let quota = false;
    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (result.status === "quota_exceeded") {
        quota = true;
        continue;
      }
      const entry = selected[index];
      const { operation, value } = entry.value;
      const mirrorId = await this.#id("record", operation.id);
      const mirror = await this.#mirror(operation.id);
      if (mirror?.value.pending !== entry.id) {
        throw new SyncProtocolError("outbox_state_mismatch");
      }
      const applied = result.status === "applied";
      const remote = applied ? { id: operation.id, revision: result.revision, payload: operation.payload ?? "", deleted: operation.deleted,
        ttl: operation.ttl ?? null, value } : mirror.value.remote;
      const changes = [this.#remove(entry), this.#change(mirror, "record", mirrorId, {
        ...mirror.value, remote, pending: null, blocked: !applied,
        position: applied ? entry.value.position ?? this.#positionOf(operation.id, value) : mirror.value.position ?? null,
      })];
      if (!applied) {
        changes.push(this.#change(null, "conflict", this.#newId(), { version: 1, source: "upload", queued: entry.value, result }));
      }
      await this.#save(changes, { ...this.#state.value, pending: this.#state.value.pending - 1,
        conflicts: this.#state.value.conflicts + (applied ? 0 : 1) });
    }
    if (quota) {
      this.#error = "quota_exceeded";
    }
    return !quota;
  }

  async #send(path, options = {}) {
    this.#ensureOpen();
    const result = await this.#request(`api/v1/sync/collections/${this.#collection}/${path}`, {
      maxBytes: 4 * 1024 * 1024, timeout: 15000, ...options, signal: this.#abort.signal,
    });
    this.#ensureOpen();
    return result;
  }

  async #save(changes, value) {
    this.#ensureOpen();
    const current = this.#state;
    await this.#journal.commit([...changes, this.#change(current, "metadata", current.id, value)]);
    this.#ensureOpen();
    this.#state = { ...current, revision: current.revision + 1, value };
    this.#notify();
  }

  #change(previous, kind, id, value) {
    return { id, collection: this.#collection, kind, expectedRevision: previous?.revision ?? 0, value };
  }

  #remove(entry) {
    return { id: entry.id, collection: this.#collection, kind: entry.kind, expectedRevision: entry.revision, deleted: true };
  }

  async #id(kind, value) {
    const id = await this.#entryId(this.#collection, kind, value);
    if (!SYNC_STORE_UUID.test(id)) {
      throw new SyncProtocolError("invalid_entry_id");
    }
    return id;
  }

  #newId() {
    const id = this.#createId();
    if (!SYNC_STORE_UUID.test(id)) {
      throw new SyncProtocolError("invalid_entry_id");
    }
    return id;
  }

  async #exclusive(work) {
    this.#ensureOpen();
    if (this.#busy) {
      throw new SyncProtocolError("busy");
    }
    this.#busy = true;
    this.#error = null;
    this.#retryAfter = 0;
    this.#notify();
    try {
      await this.#load();
      const result = await work();
      this.#ensureOpen();
      this.#phase = "idle";
      return result;
    } catch (error) {
      if (!this.#closed) {
        this.#phase = "error";
        this.#error = error.code ?? "sync_failed";
        this.#retryAfter = error.retryAfter ?? 0;
      }
      throw error;
    } finally {
      this.#busy = false;
      this.#notify();
    }
  }

  #setPhase(phase) {
    this.#phase = phase;
    this.#notify();
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncProtocolError("cancelled");
    }
  }

  #notify() {
    if (!this.#closed) {
      for (const listener of this.#listeners) {
        try {
          listener(this.snapshot);
        } catch {}
      }
    }
  }
}
