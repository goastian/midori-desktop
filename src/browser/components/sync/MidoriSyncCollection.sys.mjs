/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MAX_LOCAL_VALUE_BYTES, SYNC_STORE_UUID, validateSyncStoreEntry } from "./MidoriSyncLocalCodec.sys.mjs";
import {
  MAX_ENGINE_PAGE_BYTES, SyncProtocolError, historyClearCutoff, validSyncCounter, validSyncCursor, validSyncRecordId, validateChangePage,
  validateRemoteRecord, validateOperationResults,
} from "./MidoriSyncProtocol.sys.mjs";
import { openSyncRecord, protectedSyncRecords, sealSyncRecord } from "./MidoriSyncRecord.sys.mjs";
import { signSyncControl, verifySyncControl } from "./MidoriSyncControl.sys.mjs";
import { syncConflictSummary } from "./MidoriSyncConflictSummary.sys.mjs";
import { isSyncPasswordIdentityAlias, validateSyncPasswordRetirementSnapshot } from "./MidoriSyncPasswordIdentity.sys.mjs";

const encoder = new TextEncoder();
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const REPAIR_AFTER_ATTEMPTS = 3;
const REPAIR_AFTER_MS = 10 * 60 * 1000;

function validConflictDecision(value) {
  return value?.version === 1 && ["local", "remote", "merge"].includes(value.choice) &&
    validSyncRecordId(value.record_id) && SYNC_STORE_UUID.test(value.conflict_id) &&
    Number.isInteger(value.conflict_revision) && value.conflict_revision >= 1 && value.conflict_revision <= 2147483647 &&
    validSyncCounter(value.remote_revision, 2147483647n);
}

function initialState() {
  return { version: 3, generation: null, cursor: null, sequence: "0", fence: null,
    inbox: null, index: 0, ack: null, initialized: false, pending: 0, conflicts: 0,
    deferred: 0, activeApplication: null, applicationAfter: null, lastCompletedAt: null };
}

function collectionStateVersion(state) {
  if (state.localChanges) {
    return 5;
  }
  return state.resolution ? 4 : 3;
}

function upgradeCollectionState(previous) {
  if (previous?.version === 1) {
    return { ...previous, version: 3, deferred: 0, activeApplication: null, applicationAfter: null };
  }
  return previous?.version === 2 ? { ...previous, version: 3 } : previous;
}

function validStateCounts(state, localChanges) {
  return [state.pending, state.conflicts, state.deferred, localChanges].every(count =>
    Number.isSafeInteger(count) && count >= 0 && count <= 10000);
}

function validStateResolution(state, resolution) {
  return resolution === null || (validConflictDecision(resolution) && SYNC_STORE_UUID.test(resolution.operation_id) &&
    state.initialized && state.pending && (resolution.after === null || SYNC_STORE_UUID.test(resolution.after)));
}

function validStateControls(state) {
  return (state.controlRevision === undefined || validSyncCounter(state.controlRevision)) &&
    (state.compactedThrough === undefined || validSyncCounter(state.compactedThrough)) &&
    (state.clearBeforeMs == null || (Number.isSafeInteger(state.clearBeforeMs) &&
      state.clearBeforeMs >= 1 && state.clearBeforeMs <= Math.floor(Number.MAX_SAFE_INTEGER / 1000))) &&
    (state.pendingClear == null || (SYNC_STORE_UUID.test(state.pendingClear.id) &&
      state.pendingClear.generation === state.generation));
}

export function validateSyncCollectionState(value) {
  const state = upgradeCollectionState(value);
  const resolution = state?.resolution ?? null;
  const localChanges = state?.localChanges ?? 0;
  if (![3, 4, 5].includes(state?.version) ||
      state.version !== collectionStateVersion(state) || !validStateCounts(state, localChanges) ||
      (localChanges && !state.initialized) ||
      !validStateResolution(state, resolution) || !validStateControls(state) ||
      (state.generation !== null && !SYNC_STORE_UUID.test(state.generation)) ||
      !validSyncCounter(state.sequence) || (state.fence !== null && !validSyncCounter(state.fence)) ||
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

/** Coordinates durable encrypted transfers and native applications for one collection. */
export class MidoriSyncCollection {
  #collection;
  #journal;
  #keys;
  #adapter;
  #request;
  #pageBytes;
  #entryId;
  #createId;
  #now;
  #state = null;
  #busy = false;
  #closed = false;
  #abort = new AbortController();
  #version = 0;
  #workVersion = 0;
  #listeners = new Set();
  #phase = "idle";
  #error = null;
  #retryAfter = 0;
  #previewSalt = null;
  constructor({ collection, journal, keys, adapter, request, entryId, createId, now = Date.now, pageByteBudget = false }) {
    validateSyncStoreEntry({ id: "00000000-0000-0000-0000-000000000000", collection, kind: "metadata", revision: 1 });
    this.#collection = collection;
    this.#journal = journal;
    this.#keys = keys;
    this.#adapter = adapter;
    this.#request = request;
    this.#pageBytes = pageByteBudget ? MAX_ENGINE_PAGE_BYTES : null;
    this.#entryId = entryId;
    this.#createId = createId;
    this.#now = now;
  }

  get snapshot() {
    return Object.freeze({
      phase: this.#phase, busy: this.#busy, error: this.#error, retryAfter: this.#retryAfter,
      pending: this.#state?.value.pending ?? 0, conflicts: this.#state?.value.conflicts ?? 0,
      deferred: this.#state?.value.deferred ?? 0,
      localChanges: this.#state?.value.localChanges ?? 0,
      lastCompletedAt: this.#state?.value.lastCompletedAt ?? null,
      initialized: this.#state?.value.initialized ?? false,
      resolving: !!this.#state?.value.resolution,
      more: Boolean(this.#state && (this.#state.value.pending || this.#state.value.inbox || this.#state.value.ack || this.#state.value.fence || this.#state.value.deferred || this.#state.value.pendingReset || this.#state.value.pendingClear || this.#state.value.resolution)),
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

  async recoverLocal({ maxApplications = 100 } = {}) {
    if (!Number.isInteger(maxApplications) || maxApplications < 1 || maxApplications > 1000) {
      throw new SyncProtocolError("invalid_run_limit");
    }
    return this.#exclusive(async () => {
      if (this.#state.value.pendingReset) {
        await this.#finishHistoryReset();
      }
      if (!this.#state.value.initialized || this.#state.value.pendingClear) {
        return { captureReady: false, more: false };
      }
      if (this.#state.value.resolution) {
        await this.#finishConflictResolution();
      }
      if (!this.#state.value.resolution) {
        if (this.#state.value.activeApplication) {
          await this.#executeApplication(await this.#application(this.#state.value.activeApplication));
        }
        if (!this.#state.value.resolution && this.#state.value.inbox) {
          await this.#applyInbox();
        }
        if (!this.#state.value.resolution) {
          await this.#retryApplications(maxApplications);
        }
      }
      const more = !!(this.#state.value.resolution || this.#state.value.activeApplication || this.#state.value.inbox);
      return { captureReady: !more, more };
    });
  }

  async markCompleted(at = Date.now()) {
    if (!Number.isSafeInteger(at) || at < 1) {
      throw new SyncProtocolError("invalid_sync_time");
    }
    return this.#exclusive(async () => {
      if (!this.#state.value.initialized) {
        throw new SyncProtocolError("bootstrap_required");
      }
      if (this.#state.value.resolution) {
        throw new SyncProtocolError("application_recovery_required");
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
      if (this.#state.value.resolution) {
        throw new SyncProtocolError("application_recovery_required");
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
      return { results, nextAfter: rows.at(-1)?.id ?? null };
    });
  }

  async recordPage({ after = null, limit = 100 } = {}) {
    if ((after !== null && !SYNC_STORE_UUID.test(after)) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new SyncProtocolError("invalid_capture_query");
    }
    return this.#exclusive(async () => {
      const rows = await this.#journal.list(this.#collection, "record", { after, limit });
      const entries = [];
      for (const row of rows) {
        const remote = row.value?.remote;
        entries.push({ id: row.value?.id, deleted: remote?.deleted ?? true, value: remote && !remote.deleted ? remote.value : null });
      }
      return { entries, nextAfter: rows.at(-1)?.id ?? null };
    });
  }

  async conflictPage({ after = null, limit = 25, summaries = false } = {}) {
    if ((after !== null && !SYNC_STORE_UUID.test(after)) || !Number.isInteger(limit) || limit < 1 || limit > 100 || typeof summaries !== "boolean") {
      throw new SyncProtocolError("invalid_conflict_query");
    }
    return this.#exclusive(async () => {
      const rows = await this.#journal.list(this.#collection, "conflict", { after, limit });
      const entries = [];
      for (const row of rows) {
        const info = this.#conflictInfo(row);
        const mirror = info.recordId ? await this.#mirror(info.recordId) : null;
        entries.push({ id: row.id, revision: row.revision, source: row.value.source, reason: info.reason,
          recordToken: info.recordId ? await this.#id("record", info.recordId) : null,
          remoteRevision: mirror?.value.remote?.revision ?? null,
          remoteDeleted: mirror?.value.remote?.deleted ?? null,
          canKeepLocal: this.#canResolveConflict(row, info, mirror) && this.#allowsConflictChoice("local", info.recordId),
          canAcceptRemote: this.#canResolveConflict(row, info, mirror) && this.#allowsConflictChoice("remote", info.recordId) && !!this.#adapter.apply,
          canMerge: this.#canResolveConflict(row, info, mirror) && this.#allowsConflictChoice("merge", info.recordId) && !!this.#adapter.plan,
          ...(summaries && mirror?.value.remote ? { summary: syncConflictSummary(this.#collection, info.recordId,
            this.#effectiveIncoming(mirror.value.remote).deleted ? null : mirror.value.remote.value) } : {}),
          resolving: !!info.recordId && this.#state.value.resolution?.record_id === info.recordId });
      }
      return { entries, nextAfter: rows.at(-1)?.id ?? null };
    });
  }

  async conflictPreview({ id, revision, remoteRevision } = {}) {
    if (!SYNC_STORE_UUID.test(id) || !Number.isInteger(revision) || revision < 1 || !validSyncCounter(remoteRevision, 2147483647n)) {
      throw new SyncProtocolError("invalid_conflict_query");
    }
    return this.#exclusive(async () => {
      this.#requireCapture();
      const entry = await this.#journal.read(id);
      if (!entry || entry.revision !== revision) {
        throw new SyncProtocolError("conflict_changed");
      }
      const info = this.#conflictInfo(entry);
      const mirror = info.recordId ? await this.#mirror(info.recordId) : null;
      if (mirror?.value.remote?.revision !== remoteRevision) {
        throw new SyncProtocolError("conflict_changed");
      }
      if (!this.#canResolveConflict(entry, info, mirror)) {
        throw new SyncProtocolError("conflict_resolution_unavailable");
      }
      const remote = this.#effectiveIncoming(mirror.value.remote);
      const current = await this.#readCaptured(info.recordId, mirror.value.localChange, this.#conflictHint(entry, mirror), true);
      return { local: this.#adapter.localConflictSummary ? this.#adapter.localConflictSummary(info.recordId, current) :
          syncConflictSummary(this.#collection, info.recordId, current),
        remote: syncConflictSummary(this.#collection, info.recordId, remote.deleted ? null : remote.value),
        localRevision: await this.#localVersion(current) };
    });
  }

  async #readCurrent(id, hint) {
    try {
      return await this.#adapter.read(id, hint);
    } finally {
      this.#adapter.endCapture?.();
    }
  }

  async #readCaptured(id, captured, hint, finish = false) {
    try {
      return this.#adapter.readCaptured ? await this.#adapter.readCaptured(id, structuredClone(captured), hint) :
        await this.#adapter.read(id, captured?.value ?? captured?.hint ?? hint);
    } finally {
      if (finish) {
        this.#adapter.endCapture?.();
      }
    }
  }

  async #localVersion(current) {
    this.#previewSalt ??= this.#newId();
    const value = this.#adapter.conflictValue ? this.#adapter.conflictValue(current) : current;
    return this.#id("conflict", JSON.stringify([this.#previewSalt, value]));
  }

  async pendingApplicationPage({ after = null, limit = 20 } = {}) {
    if ((after !== null && !SYNC_STORE_UUID.test(after)) || !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new SyncProtocolError("invalid_capture_query");
    }
    return this.#exclusive(async () => {
      if (typeof this.#adapter.applicationSummary !== "function") { throw new SyncProtocolError("application_review_unavailable"); }
      if (!this.#state) { await this.#load(); }
      const rows = await this.#journal.list(this.#collection, "application", { after, limit });
      const entries = [];
      for (const row of rows) {
        const entry = await this.#application(row.id);
        if (entry.value.phase !== "waiting") { continue; }
        const summary = await this.#adapter.applicationSummary(structuredClone(entry.value));
        if (summary !== null) { entries.push({ id: entry.id, revision: entry.revision, summary }); }
      }
      this.#ensureOpen();
      return { entries, next: rows.length === limit ? rows.at(-1).id : null };
    });
  }

  async reviewApplication({ id, revision } = {}) {
    if (!SYNC_STORE_UUID.test(id) || !Number.isInteger(revision) || revision < 1 || revision > 2147483647) {
      throw new SyncProtocolError("invalid_application");
    }
    return this.#exclusive(async () => {
      if (typeof this.#adapter.applicationSummary !== "function" || typeof this.#adapter.reviewApplication !== "function") {
        throw new SyncProtocolError("application_review_unavailable");
      }
      if (!this.#state) { await this.#load(); }
      const entry = await this.#application(id, { allowMissing: true });
      if (!entry || entry.revision !== revision || entry.value.phase !== "waiting") { throw new SyncProtocolError("application_state_changed"); }
      const summary = await this.#adapter.applicationSummary(structuredClone(entry.value));
      this.#ensureOpen();
      if (summary?.canReview !== true) { throw new SyncProtocolError("application_review_unavailable"); }
      await this.#adapter.reviewApplication(structuredClone(entry.value));
      this.#ensureOpen();
    });
  }

  async resolveConflict({ id, revision, remoteRevision, choice, localRevision = null } = {}) {
    if (!SYNC_STORE_UUID.test(id) || !Number.isInteger(revision) || revision < 1 || revision > 2147483647 ||
        !validSyncCounter(remoteRevision, 2147483647n) || !["local", "remote", "merge"].includes(choice) ||
        (localRevision !== null && !SYNC_STORE_UUID.test(localRevision))) {
      throw new SyncProtocolError("invalid_conflict_resolution");
    }
    return this.#exclusive(async () => {
      this.#requireCapture();
      const entry = await this.#journal.read(id);
      if (!entry || entry.revision !== revision) {
        throw new SyncProtocolError("conflict_changed");
      }
      const info = this.#conflictInfo(entry);
      const mirror = info.recordId ? await this.#mirror(info.recordId) : null;
      if (mirror?.value.remote?.revision !== remoteRevision) {
        throw new SyncProtocolError("conflict_changed");
      }
      if (!this.#canResolveConflict(entry, info, mirror) || !this.#allowsConflictChoice(choice, info.recordId)) {
        throw new SyncProtocolError("conflict_resolution_unavailable");
      }
      const remote = this.#effectiveIncoming(mirror.value.remote);
      const current = await this.#readCaptured(info.recordId, mirror.value.localChange, this.#conflictHint(entry, mirror), true);
      if (localRevision !== null && localRevision !== await this.#localVersion(current)) {
        throw new SyncProtocolError("conflict_changed");
      }
      this.#ensureOpen();
      const decision = { version: 1, choice, record_id: info.recordId, remote_revision: remoteRevision,
        conflict_id: id, conflict_revision: revision };
      if (choice !== "local") {
        return this.#resolveIncomingConflict(entry, mirror, remote, current, decision);
      }
      const deleted = current === null;
      if (deleted && this.#adapter.canDelete && !await this.#adapter.canDelete(info.recordId, remote.value, {
        record: recordId => this.record(recordId),
      })) {
        throw new SyncProtocolError("conflict_resolution_unavailable");
      }
      const value = deleted ? null : await this.#adapter.validate(info.recordId, structuredClone(current));
      const operationId = await this.#enqueue(info.recordId, value, deleted, mirror, decision);
      await this.#finishConflictResolution();
      return { operationId, resolving: !!this.#state.value.resolution };
    });
  }

  async #resolveIncomingConflict(conflict, mirror, remote, current, resolution) {
    let desired = remote.deleted ? null : remote.value;
    if (resolution.choice === "merge") {
      if (!this.#adapter.plan) {
        throw new SyncProtocolError("conflict_merge_unavailable");
      }
      const { decision } = await this.#adapter.plan(structuredClone(remote), structuredClone(conflict.value.base ?? null),
        { current: structuredClone(current) });
      if (!["apply", "keep_local"].includes(decision?.status)) {
        throw new SyncProtocolError("conflict_merge_unavailable");
      }
      desired = decision.status === "keep_local" ? current : decision.value;
    }
    if (!this.#adapter.apply) {
      throw new SyncProtocolError("conflict_resolution_unavailable");
    }
    if (this.#adapter.resolveValue) {
      desired = await this.#adapter.resolveValue(remote.id, structuredClone(current), structuredClone(desired), resolution.choice);
    }
    desired = desired === null ? null : await this.#adapter.validate(remote.id, structuredClone(desired));
    const incoming = { ...remote, deleted: desired === null, value: desired };
    const resolutionBase = { ...remote, deleted: current === null, value: current };
    const position = this.#positionOf(remote.id, current);
    const plan = await this.#prepareApplication(incoming, resolutionBase, position, resolution);
    const id = await this.#id("application", remote.id);
    const value = { version: 3, generation: this.#state.value.generation,
      change: { sequence: this.#state.value.sequence, record: mirror.value.remote }, incoming, plan,
      base: mirror.value.remote, phase: "applying", reason: null, source: null, resolution, resolutionBase };
    await this.#save([
      this.#change(null, "application", id, value),
      this.#change(mirror, "record", mirror.id, { ...mirror.value,
        ...this.#identityProjection({ value: current ?? this.#conflictHint(conflict, mirror) }, mirror),
        blocked: false, applying: id }),
    ], { ...this.#state.value, activeApplication: id, deferred: this.#state.value.deferred + 1 });
    const outcome = await this.#executeApplication({ id, collection: this.#collection, kind: "application", revision: 1, value });
    if (outcome?.status !== "applied") {
      throw new SyncProtocolError(outcome?.status === "deferred" ? "conflict_resolution_pending" : "conflict_changed");
    }
    return { resolving: !!this.#state.value.resolution, pending: true };
  }

  #conflictInfo(entry) {
    const value = entry?.value;
    if (!entry || entry.kind !== "conflict" || entry.collection !== this.#collection || !SYNC_STORE_UUID.test(entry.id) ||
        !Number.isInteger(entry.revision) || entry.revision < 1 || value?.version !== 1 ||
        !["download", "upload", "historical-key"].includes(value.source)) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    const record = value.source === "upload" ? value.queued?.operation : value.change?.record;
    const revision = value.source === "upload" ? value.result?.revision ?? record?.base_revision : record?.revision;
    const reason = value.outcome?.reason ?? value.result?.reason ?? value.result?.status;
    return { recordId: validSyncRecordId(record?.id) ? record.id : null,
      remoteRevision: validSyncCounter(revision) ? revision : null,
      reason: typeof reason === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(reason) ? reason : "unknown_conflict" };
  }

  #canResolveConflict(entry, info, mirror) {
    if (!info.recordId || info.remoteRevision === null || !mirror?.value.blocked || !mirror.value.remote ||
        BigInt(info.remoteRevision) > BigInt(mirror.value.remote.revision) || mirror.value.pending || mirror.value.applying ||
        this.#state.value.resolution || !this.#adapter.read || !this.#adapter.matchesLocal || entry.value.source === "historical-key") {
      return false;
    }
    if (["history", "form-history"].includes(this.#collection) && mirror.value.remote.deleted && !this.#conflictHint(entry, mirror)) {
      return false;
    }
    if (entry.value.source === "upload") {
      return ["conflict", "invalid"].includes(entry.value.result?.status);
    }
    return ["id", "revision", "payload", "deleted", "ttl"].every(field =>
      entry.value.change?.record?.[field] === mirror.value.remote[field]);
  }

  #allowsConflictChoice(choice, id) {
    return this.#adapter.canResolveConflict?.(choice, id) !== false;
  }

  #conflictHint(entry, mirror) {
    return mirror.value.localChange?.value ?? mirror.value.localChange?.hint ??
      mirror.value.remote.value ?? mirror.value.identityValue ?? entry.value.base?.value ??
      entry.value.queued?.value ?? entry.value.resolutionBase?.value ?? null;
  }

  #identityProjection(incoming, mirror) {
    if (!["history", "form-history"].includes(this.#collection)) {
      return {};
    }
    return { identityValue: incoming?.value ?? mirror?.value.remote?.value ?? mirror?.value.identityValue ?? null };
  }

  async #finishConflictResolution(maxPages = 2) {
    for (let page = 0; page < maxPages && this.#state.value.resolution; ++page) {
      const resolution = this.#state.value.resolution;
      const queued = await this.#journal.read(resolution.operation_id);
      const mirror = await this.#mirror(resolution.record_id);
      if (queued?.kind !== "outbox" || queued.collection !== this.#collection ||
          queued.value?.version !== 1 || queued.value.generation !== this.#state.value.generation ||
          queued.value?.operation?.id !== resolution.record_id ||
          queued.value.operation.operation_id !== resolution.operation_id ||
          queued.value.operation.base_revision !== resolution.remote_revision ||
          queued.value.resolution?.conflict_id !== resolution.conflict_id ||
          queued.value.resolution?.conflict_revision !== resolution.conflict_revision ||
          queued.value.resolution?.remote_revision !== resolution.remote_revision ||
          queued.value.resolution?.record_id !== resolution.record_id || queued.value.resolution?.choice !== resolution.choice ||
          mirror?.value.pending !== resolution.operation_id || !mirror.value.blocked ||
          mirror.value.remote?.revision !== resolution.remote_revision) {
        throw new SyncProtocolError("engine_state_corrupt");
      }
      const rows = await this.#journal.list(this.#collection, "conflict", { after: resolution.after, limit: 50 });
      if (!rows.length) {
        await this.#save([this.#change(mirror, "record", mirror.id, { ...mirror.value, blocked: false })],
          { ...this.#state.value, version: 3, resolution: null });
        break;
      }
      const removals = rows.filter(row => {
        const info = this.#conflictInfo(row);
        const selected = row.id === resolution.conflict_id && row.revision === resolution.conflict_revision;
        const safe = selected || row.value.source === "upload" || (row.value.source === "download" &&
          !["invalid_record", "record_revision_mismatch", "record_authentication_failed", "record_version_unsupported"].includes(info.reason));
        return safe && info.recordId === resolution.record_id && info.remoteRevision !== null &&
          BigInt(info.remoteRevision) <= BigInt(resolution.remote_revision);
      }).map(row => this.#remove(row));
      await this.#save(removals, { ...this.#state.value,
        conflicts: this.#state.value.conflicts - removals.length,
        resolution: { ...resolution, after: rows.at(-1).id } });
    }
  }

  #requireCapture() {
    if (!this.#state.value.initialized) {
      throw new SyncProtocolError("bootstrap_required");
    }
    if (this.#state.value.activeApplication || this.#state.value.inbox || this.#state.value.pendingReset || this.#state.value.pendingClear || this.#state.value.resolution) {
      throw new SyncProtocolError("application_recovery_required");
    }
    if (!this.#adapter.read || !this.#adapter.matchesLocal) {
      throw new SyncProtocolError("capture_unavailable");
    }
  }

  async #flushNative() {
    this.#ensureOpen();
    try {
      await this.#adapter.flush?.();
    } catch (error) {
      this.#ensureOpen();
      if (error instanceof SyncProtocolError) {
        throw error;
      }
      throw new SyncProtocolError("native_write_failed");
    }
    this.#ensureOpen();
  }

  async #capture(id) {
    this.#requireCapture();
    this.#setPhase("capturing");
    const mirror = await this.#mirror(id);
    if (mirror?.value.applying) {
      return { status: "pending" };
    }
    if (mirror?.value.pending || mirror?.value.blocked) {
      return this.#captureFollowup(id, mirror);
    }
    const remote = mirror?.value.remote;
    if (remote && this.#adapter.isRetired?.(remote)) {
      return { status: "unchanged" };
    }
    const base = remote && !this.#effectiveIncoming(remote).deleted ? remote.value : null;
    const current = await this.#readCaptured(id, null, base ?? mirror?.value.identityValue ?? null);
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
    if (deleted && this.#adapter.canDelete) {
      const permitted = await this.#adapter.canDelete(id, base, { record: recordId => this.record(recordId) });
      this.#ensureOpen();
      if (typeof permitted !== "boolean") {
        throw new SyncProtocolError("invalid_adapter_result");
      }
      if (!permitted) {
        return { status: "pending" };
      }
    }
    const retirement = deleted && mirror?.value.replacementId && this.#adapter.retirementValue ?
      await this.#adapter.retirementValue(id, base, { record: recordId => this.record(recordId) }) : undefined;
    this.#ensureOpen();
    if (retirement === null) {
      return { status: "pending" };
    }
    const value = retirement !== undefined ? await this.#adapter.validate(id, retirement) :
      deleted ? null : await this.#adapter.validate(id, current);
    return { status: "queued", operationId: await this.#enqueue(id, value, deleted && retirement === undefined, mirror) };
  }

  async #captureFollowup(id, mirror) {
    const queued = mirror.value.pending ? await this.#journal.read(mirror.value.pending) : null;
    if (mirror.value.pending && (queued?.collection !== this.#collection || queued.kind !== "outbox" ||
        queued.value?.version !== 1 || queued.value.generation !== this.#state.value.generation ||
        queued.value.operation?.operation_id !== mirror.value.pending || queued.value.operation.id !== id)) {
      throw new SyncProtocolError("outbox_state_mismatch");
    }
    const captured = mirror.value.localChange;
    let base = mirror.value.remote?.value ?? null;
    if (queued) {
      base = queued.value.value;
    }
    if (captured) {
      base = captured.value;
    }
    const hint = base ?? captured?.hint ?? mirror.value.identityValue ?? mirror.value.remote?.value ?? null;
    const current = await this.#readCaptured(id, captured, hint);
    const position = captured?.position ?? queued?.value.position ?? mirror.value.position ?? null;
    const matches = await this.#adapter.matchesLocal(id, current, base, position);
    this.#ensureOpen();
    if (typeof matches !== "boolean") {
      throw new SyncProtocolError("invalid_adapter_result");
    }
    const status = mirror.value.blocked ? "conflict" : "pending";
    if (matches) {
      return { status, durable: true };
    }
    const deleted = current === null;
    if (deleted && mirror.value.replacementId && queued && this.#adapter.retirementValue) {
      const retirement = await this.#adapter.retirementValue(id, base, { pending: true, record: recordId => this.record(recordId) });
      this.#ensureOpen();
      if (retirement === null) {
        return { status, durable: true };
      }
    }
    if (deleted && this.#adapter.canDelete) {
      const permitted = await this.#adapter.canDelete(id, base, { record: recordId => this.record(recordId) });
      this.#ensureOpen();
      if (typeof permitted !== "boolean") {
        throw new SyncProtocolError("invalid_adapter_result");
      }
      if (!permitted) {
        return { status };
      }
    }
    const value = deleted ? null : await this.#adapter.validate(id, structuredClone(current));
    await this.#flushNative();
    const localChange = { version: 1, operation_id: mirror.value.pending, deleted, value,
      hint: deleted ? hint : null, position: this.#positionOf(id, value) };
    await this.#save([this.#change(mirror, "record", mirror.id, { ...mirror.value, localChange })],
      { ...this.#state.value, localChanges: (this.#state.value.localChanges ?? 0) + (captured ? 0 : 1) });
    return { status, durable: true };
  }

  async #enqueue(id, data, deleted, mirror, resolution = null, completion = null, predecessor = null) {
    if (this.#state.value.pending >= 10000 && !predecessor) {
      throw new SyncProtocolError("queue_full");
    }
    if (this.#collection === "passwords" && isSyncPasswordIdentityAlias(data) &&
        (deleted || !protectedSyncRecords(this.#keys))) {
      throw new SyncProtocolError("record_version_unsupported");
    }
    await this.#flushNative();
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
    const writeContext = this.#keys.writeContext;
    const sealed = await sealSyncRecord(this.#keys, {
      collection: this.#collection, id, generation: this.#state.value.generation, base_revision: baseRevision,
    }, { deleted, ttl: operation.ttl ?? null, value: data });
    if (sealed.crypto.epoch !== writeContext.epoch || sealed.crypto.revision !== writeContext.revision) {
      throw new SyncProtocolError("crypto_state_conflict");
    }
    if (sealed.payload) {
      operation.payload = sealed.payload;
    }
    const queued = { version: 1, generation: this.#state.value.generation, epoch: writeContext.epoch, operation, value: data,
      base: mirror?.value.remote ? this.#effectiveIncoming(mirror.value.remote) : null,
      position: this.#positionOf(id, data), ...(resolution ? { resolution } : {}) };
    const nextMirror = { ...mirror?.value, version: 1, id, remote: mirror?.value.remote ?? null,
      ...this.#identityProjection({ value: data }, mirror),
      pending: operationId, blocked: !!resolution, applying: null, conflictBase: null,
      ...((resolution || predecessor) ? { localChange: null } : {}) };
    if (this.#adapter.retirementSnapshot) {
      const snapshot = await this.#adapter.retirementSnapshot(id, data, mirror?.value ?? null);
      this.#ensureOpen();
      if (snapshot !== undefined) {
        validateSyncPasswordRetirementSnapshot(id, snapshot);
        nextMirror.retirementSnapshot = snapshot;
      }
    }
    await this.#save([
      ...(predecessor ? [this.#remove(predecessor)] : []),
      ...(completion ? [this.#remove(completion.entry), ...completion.changes] : []),
      this.#change(null, "outbox", operationId, queued),
      this.#change(mirror, "record", await this.#id("record", id), nextMirror),
    ], { ...this.#state.value, pending: this.#state.value.pending + (predecessor ? 0 : 1),
      ...((resolution || predecessor) && mirror?.value.localChange ? {
        localChanges: this.#state.value.localChanges - 1,
      } : {}),
      ...(completion ? { activeApplication: null, deferred: this.#state.value.deferred - 1,
        ...(this.#state.value.deferred === 1 ? { applicationAfter: null } : {}) } : {}),
      ...(resolution ? { version: 4, resolution: { ...resolution, operation_id: operationId, after: null } } : {}) });
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
        const operation = { id: this.#newId(), generation: this.#state.value.generation };
        if (protectedSyncRecords(this.#keys)) {
          operation.control = await signSyncControl(this.#keys, {
            collection: this.#collection, operation_id: operation.id, previous_generation: operation.generation,
            generation: this.#newId(), control_revision: String(BigInt(this.#state.value.controlRevision ?? "0") + 1n),
            kind: "history_clear", clear_before_ms: Math.max(this.#now(), this.#state.value.clearBeforeMs ?? 0),
          });
        }
        await this.#save([], { ...this.#state.value, pendingClear: operation });
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
      ...(operation.control ? { control: operation.control } : {}),
    } });
    const cutoff = historyClearCutoff({ kind: "history_clear", clear_before: data?.clear_before });
    if (data.operation_id !== operation.id || data.previous_generation !== operation.generation ||
        !SYNC_STORE_UUID.test(data.generation) || data.generation === operation.generation ||
        !Number.isSafeInteger(data.deleted_records) || data.deleted_records < 0) {
      throw new SyncProtocolError("invalid_history_clear");
    }
    if (protectedSyncRecords(this.#keys)) {
      await this.#verifyControlPage({ ...data, control_revision: data.control?.control_revision,
        reset: { kind: "history_clear", clear_before: data.clear_before } });
      if (data.control.proof !== operation.control?.proof || data.control.clear_before_ms !== cutoff) {
        throw new SyncProtocolError("control_authentication_failed");
      }
    }
    await this.#recoverHistoryReset(data.generation, cutoff, operation.control?.control_revision ?? null);
    if (this.#state.value.clearBeforeMs < cutoff || this.#state.value.pendingClear) {
      throw new SyncProtocolError("invalid_history_clear");
    }
    return { deletedRecords: data.deleted_records, clearBeforeMs: this.#state.value.clearBeforeMs };
  }

  async #runCycle({ maxPages, maxBatches, maxApplications }) {
    if (this.#state.value.resolution) {
      await this.#finishConflictResolution();
      if (this.#state.value.resolution) {
        return;
      }
    }
    if (this.#state.value.pendingReset) {
      await this.#finishHistoryReset();
    }
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
      await this.#verifyControlPage(data);
      const cutoff = data.reset === undefined ? null : historyClearCutoff(data.reset);
      if (cutoff !== (this.#state.value.clearBeforeMs ?? null)) {
        throw new SyncProtocolError("history_reset_required");
      }
    }
    if (this.#state.value.activeApplication) {
      await this.#executeApplication(await this.#application(this.#state.value.activeApplication));
      if (this.#state.value.resolution) {
        return;
      }
    }
    if (this.#state.value.inbox) {
      await this.#applyInbox();
    }
    let remaining = maxApplications;
    remaining -= await this.#retryApplications(remaining);
    if (this.#state.value.resolution) {
      return;
    }
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

  cancel() {
    if (this.#closed) {
      return;
    }
    ++this.#version;
    this.#abort.abort();
    this.#abort = new AbortController();
    if (!this.#busy) { this.#workVersion = this.#version; }
  }

  close() {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.#previewSalt = null;
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
      const value = initialState();
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
    const captured = entry?.value.localChange;
    const savedIdentity = entry?.value.retirementSnapshot;
    if (entry && (entry.collection !== this.#collection || entry.kind !== "record" ||
        ![1, 2].includes(entry.value?.version) ||
        (entry.value.version === 2) !== (savedIdentity !== undefined) ||
        (savedIdentity !== undefined && this.#collection !== "passwords") ||
        entry.value.id !== id || typeof entry.value.blocked !== "boolean" ||
        (entry.value.replacementId != null && !this.#validReplacement(id, entry.value.replacementId)) ||
        (entry.value.position != null && !this.#validPosition(entry.value.position)) ||
        (entry.value.applying != null && (!SYNC_STORE_UUID.test(entry.value.applying) || entry.value.pending || entry.value.blocked)) ||
        (entry.value.pending !== null && !SYNC_STORE_UUID.test(entry.value.pending)) ||
        (captured != null && (captured.version !== 1 || typeof captured.deleted !== "boolean" ||
          captured.deleted !== (captured.value === null) ||
          (captured.operation_id !== null && !SYNC_STORE_UUID.test(captured.operation_id)) ||
          (entry.value.pending !== null && captured.operation_id !== entry.value.pending) ||
          (!entry.value.pending && !entry.value.blocked && !entry.value.applying) ||
          !this.#state.value.localChanges ||
          (captured.position !== null && !this.#validPosition(captured.position)))) ||
        (entry.value.remote !== null && (entry.value.remote?.id !== id || !validSyncCounter(entry.value.remote.revision, 2147483647n))))) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    if (savedIdentity !== undefined) {
      validateSyncPasswordRetirementSnapshot(id, savedIdentity);
    }
    return entry;
  }

  async #recoverHistoryReset(expectedGeneration = null, expectedCutoff = null, expectedRevision = null) {
    const { data } = await this.#send("changes", { query: { limit: 1 }, maxBytes: 8 * 1024 * 1024 });
    await this.#verifyControlPage(data, true);
    const cutoff = historyClearCutoff(data?.reset);
    validateChangePage(data, { generation: null, sequence: "0", fence: null });
    const superseded = expectedRevision !== null && validSyncCounter(data.control_revision) &&
      BigInt(data.control_revision) > BigInt(expectedRevision) && cutoff >= expectedCutoff;
    if (data.generation === this.#state.value.generation ||
        (expectedGeneration && data.generation !== expectedGeneration && !superseded) ||
        (expectedCutoff && cutoff !== expectedCutoff && !superseded) ||
        cutoff < (this.#state.value.clearBeforeMs ?? 0)) {
      throw new SyncProtocolError("invalid_history_reset");
    }
    if (typeof this.#adapter.clearBefore !== "function" || typeof this.#journal.clearHistory !== "function") {
      throw new SyncProtocolError("history_reset_unavailable");
    }
    await this.#save([], { ...this.#state.value, pendingReset: {
      generation: data.generation, cutoff, controlRevision: data.control_revision ?? "0", control: data.control ?? null,
    } });
    await this.#finishHistoryReset();
  }

  async #finishHistoryReset() {
    const pending = this.#state.value.pendingReset;
    if (this.#collection !== "history" || !SYNC_STORE_UUID.test(pending?.generation) ||
        !Number.isSafeInteger(pending.cutoff) || pending.cutoff < 1 ||
        !validSyncCounter(pending.controlRevision)) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    await this.#verifyControlPage({ generation: pending.generation, control_revision: pending.controlRevision,
      control: pending.control, reset: { kind: "history_clear", clear_before: new Date(pending.cutoff).toISOString() } }, true);
    this.#setPhase("resetting");
    await this.#adapter.clearBefore(pending.cutoff);
    this.#ensureOpen();
    const replacement = { id: this.#state.id, collection: this.#collection, kind: "metadata", revision: 1,
      value: { ...initialState(), generation: pending.generation, clearBeforeMs: pending.cutoff,
        controlRevision: pending.controlRevision, control: pending.control } };
    await this.#journal.clearHistory({ replacement });
    this.#ensureOpen();
    this.#state = replacement;
  }

  async #verifyControlPage(page, reset = false) {
    if (!protectedSyncRecords(this.#keys)) {
      return;
    }
    const revision = page.control_revision ?? "0";
    const previous = this.#state.value.controlRevision ?? "0";
    if (!validSyncCounter(revision) || BigInt(revision) < BigInt(previous)) {
      throw new SyncProtocolError("control_rollback_detected");
    }
    if (!page.control) {
      if (revision !== "0" || previous !== "0" || page.reset || reset) {
        throw new SyncProtocolError("authenticated_control_required");
      }
      return;
    }
    await verifySyncControl(this.#keys, page.control, {
      collection: this.#collection, generation: page.generation, minimumRevision: previous,
    });
    if (revision !== page.control.control_revision ||
        (page.control.kind === "history_clear" && (!page.reset || historyClearCutoff(page.reset) !== page.control.clear_before_ms)) ||
        (page.control.kind !== "history_clear" && page.reset) ||
        (page.generation === this.#state.value.generation && revision !== previous) ||
        (reset && BigInt(revision) <= BigInt(previous)) ||
        (revision === previous && this.#state.value.control &&
          page.control.proof !== this.#state.value.control.proof)) {
      throw new SyncProtocolError("control_authentication_failed");
    }
  }

  async #download() {
    this.#setPhase("downloading");
    let limit = 100;
    let page;
    while (true) {
      const query = { limit, ...(this.#state.value.cursor ? { cursor: this.#state.value.cursor } : {}) };
      const { data } = await this.#send("changes", { query, maxBytes: 8 * 1024 * 1024 });
      try {
        await this.#verifyControlPage(data);
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
      controlRevision: page.control_revision ?? "0", control: page.control ?? null,
      compactedThrough: page.compacted_through ?? this.#state.value.compactedThrough ?? "0",
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
    const sequence = page.has_more ? page.changes.at(-1).sequence : page.snapshot_sequence;
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
    let historical = null;
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
      const parsed = await openSyncRecord(this.#keys, {
        collection: this.#collection, id: raw.id, generation: this.#state.value.generation,
      }, raw);
      const value = raw.deleted ? null : await this.#adapter.validate(raw.id, parsed);
      incoming = { ...raw, value,
        authenticatedSchema: raw.payload ? JSON.parse(raw.payload).context.schema_version : 1 };
      historical = await this.#supersededHistoricalConflict(incoming);
      if (await this.#settleRetiredDeletion(incoming, mirror, index)) {
        return;
      }
      if (await this.#adoptMatchingRecord(incoming, mirror, index)) {
        return;
      }
      if (mirror?.value.pending || mirror?.value.blocked) {
        outcome = { status: "conflict", reason: "local_change_pending" };
      } else {
        const application = await this.#stageApplication(change, incoming, mirror, index, historical);
        await this.#executeApplication(application);
        return;
      }
    } catch (error) {
      if (error.code === "record_key_retired" ||
          (error.code === "record_authentication_failed" && raw.deleted && raw.payload === "" && protectedSyncRecords(this.#keys))) {
        await this.#quarantineRetiredKey(change, index, error.code === "record_key_retired" ? error.code : "legacy_tombstone_unverified");
        return;
      }
      const code = this.#recordError(error);
      if (!code) {
        throw error;
      }
      outcome = { status: "conflict", reason: code };
    }
    const changes = historical ? [this.#remove(historical)] : [];
    const conflictBase = mirror?.value.blocked ? mirror.value.conflictBase ?? null : mirror?.value.remote ?? null;
    if (incoming) {
      changes.push(this.#change(mirror, "record", await this.#id("record", raw.id), {
        ...mirror?.value, version: 1, id: raw.id, remote: incoming, pending: mirror?.value.pending ?? null,
        ...this.#identityProjection(incoming, mirror),
        blocked: outcome.status === "conflict", applying: null, conflictBase,
      }));
    }
    if (outcome.status === "conflict") {
      changes.push(this.#change(null, "conflict", this.#newId(), { version: 1, source: "download", change, outcome,
        base: conflictBase }));
    }
    await this.#save(changes, { ...this.#state.value, index: index + 1,
      conflicts: this.#state.value.conflicts - (historical ? 1 : 0) + (outcome.status === "conflict" ? 1 : 0) });
  }

  async #knownRemoteConflict(id, revision) {
    if (!this.#state.value.conflicts) { return false; }
    let after = null;
    for (;;) {
      const rows = await this.#journal.list(this.#collection, "conflict", { after, limit: 100 });
      this.#ensureOpen();
      if (!rows.length) { return false; }
      if (rows.some(row => {
        const info = this.#conflictInfo(row);
        return info.recordId === id && (info.remoteRevision === null || BigInt(info.remoteRevision) >= BigInt(revision));
      })) { return true; }
      after = rows.at(-1).id;
    }
  }

  async #adoptMatchingRecord(incoming, mirror, index) {
    if ((!mirror?.value.blocked && !mirror?.value.pending) || mirror.value.applying || mirror.value.localChange ||
        this.#state.value.resolution || incoming.deleted || incoming.authenticatedSchema !== 2 ||
        typeof this.#adapter.canAdoptRecord !== "function" || typeof this.#adapter.matchesLocal !== "function") {
      return false;
    }
    const pending = mirror.value.pending ? await this.#journal.read(mirror.value.pending) : null;
    if (mirror.value.pending && (!pending || pending.kind !== "outbox" || pending.collection !== this.#collection ||
        pending.value?.version !== 1 ||
        pending.value?.generation !== this.#state.value.generation || pending.value.operation?.operation_id !== pending.id ||
        pending.value.operation.id !== incoming.id)) {
      throw new SyncProtocolError("outbox_state_mismatch");
    }
    if (pending && (pending.value.operation.deleted ||
        BigInt(incoming.revision) <= BigInt(pending.value.operation.base_revision) ||
        !await this.#adapter.matchesLocal(incoming.id, structuredClone(pending.value.value), structuredClone(incoming.value)))) {
      return false;
    }
    const allowed = await this.#adapter.canAdoptRecord(structuredClone(incoming));
    this.#ensureOpen();
    if (typeof allowed !== "boolean") {
      throw new SyncProtocolError("invalid_adapter_result");
    }
    if (!allowed) {
      return false;
    }
    const matches = [];
    let after = null;
    for (;;) {
      const rows = await this.#journal.list(this.#collection, "conflict", { after, limit: 100 });
      this.#ensureOpen();
      if (!rows.length) {
        break;
      }
      for (const row of rows) {
        const info = this.#conflictInfo(row);
        if (info.recordId !== incoming.id) {
          continue;
        }
        if (row.value.source === "historical-key" || info.remoteRevision === null ||
            BigInt(info.remoteRevision) > BigInt(incoming.revision)) {
          return false;
        }
        if (row.value.source === "upload" && (row.value.queued?.operation?.deleted ||
            !await this.#adapter.matchesLocal(incoming.id, structuredClone(row.value.queued?.value), structuredClone(incoming.value)))) {
          return false;
        }
        matches.push({ id: row.id, revision: row.revision, collection: row.collection, kind: row.kind });
      }
      after = rows.at(-1).id;
    }
    if (!matches.length && !pending) {
      return false;
    }
    while (matches.length > 96) {
      const batch = matches.splice(0, 96);
      await this.#save(batch.map(row => this.#remove(row)), {
        ...this.#state.value, conflicts: this.#state.value.conflicts - batch.length,
      });
    }
    await this.#save([...matches.map(row => this.#remove(row)), ...(pending ? [this.#remove(pending)] : []),
      this.#change(mirror, "record", mirror.id, {
        ...mirror.value, remote: incoming, pending: null, blocked: false, conflictBase: null,
      })], { ...this.#state.value, conflicts: this.#state.value.conflicts - matches.length,
      pending: this.#state.value.pending - (pending ? 1 : 0), index: index + 1 });
    return true;
  }

  async #settleRetiredDeletion(incoming, mirror, index) {
    if (!incoming.deleted || incoming.authenticatedSchema !== 2 || !protectedSyncRecords(this.#keys) ||
        !mirror?.value.replacementId || !mirror.value.pending || mirror.value.blocked ||
        mirror.value.localChange || this.#state.value.resolution || !this.#adapter.canDelete) {
      return false;
    }
    const queued = await this.#journal.read(mirror.value.pending);
    if (queued?.kind !== "outbox" || queued.collection !== this.#collection ||
        queued.value?.version !== 1 || queued.value.generation !== this.#state.value.generation ||
        queued.value.operation?.operation_id !== queued.id || queued.value.operation.id !== incoming.id) {
      throw new SyncProtocolError("outbox_state_mismatch");
    }
    const base = queued.value.base?.value ?? mirror.value.remote?.value;
    if (!queued.value.operation.deleted || !base || await this.#adapter.read(incoming.id, base) !== null) {
      return false;
    }
    const permitted = await this.#adapter.canDelete(incoming.id, base, { record: id => this.record(id) });
    if (typeof permitted !== "boolean") {
      throw new SyncProtocolError("invalid_adapter_result");
    }
    if (!permitted) {
      return false;
    }
    await this.#flushNative();
    await this.#save([this.#remove(queued), this.#change(mirror, "record", mirror.id, {
      ...mirror.value, remote: incoming, pending: null, blocked: false, conflictBase: null,
    })], { ...this.#state.value, index: index + 1, pending: this.#state.value.pending - 1 });
    return true;
  }

  async #historicalConflict(id) {
    const entry = await this.#journal.read(await this.#id("conflict", `historical-key:${id}`));
    this.#ensureOpen();
    if (entry) {
      const value = entry.value;
      if (entry.kind !== "conflict" || entry.collection !== this.#collection || value?.version !== 1 ||
          value.source !== "historical-key" || value.generation !== this.#state.value.generation ||
          value.change?.record?.id !== id || !["record_key_retired", "legacy_tombstone_unverified"].includes(value.outcome?.reason)) {
        throw new SyncProtocolError("engine_state_corrupt");
      }
      validateRemoteRecord(value.change.record);
    }
    return entry;
  }

  async #quarantineRetiredKey(change, index, reason) {
    const previous = await this.#historicalConflict(change.record.id);
    const changes = !previous || BigInt(change.record.revision) > BigInt(previous.value.change.record.revision) ? [
      this.#change(previous, "conflict", await this.#id("conflict", `historical-key:${change.record.id}`), {
        version: 1, source: "historical-key", generation: this.#state.value.generation, change,
        outcome: { status: "conflict", reason },
      }),
    ] : [];
    await this.#save(changes, { ...this.#state.value, index: index + 1,
      conflicts: this.#state.value.conflicts + (previous ? 0 : 1) });
  }

  async #supersededHistoricalConflict(incoming) {
    if (!this.#state.value.conflicts || incoming.authenticatedSchema !== 2 || this.#keys.snapshot.custody !== "client") {
      return null;
    }
    const previous = await this.#historicalConflict(incoming.id);
    return previous && BigInt(incoming.revision) > BigInt(previous.value.change.record.revision) ? previous : null;
  }

  #checkRepeatedRecord(incoming, previous) {
    if (incoming.revision === previous.revision &&
        (incoming.payload !== previous.payload || incoming.deleted !== previous.deleted || incoming.ttl !== previous.ttl)) {
      throw new SyncProtocolError("record_revision_mismatch");
    }
  }

  #recordError(error) {
    let code = error.code;
    if (error.name === "OperationError") {
      code = "record_authentication_failed";
    } else if (error.name === "NotSupportedError") {
      code = "record_version_unsupported";
    }
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

  async #prepareApplication(incoming, base, position, resolution = null) {
    if (!this.#adapter.prepare) {
      return null;
    }
    let plan;
    try {
      plan = await this.#adapter.prepare(structuredClone(this.#effectiveIncoming(incoming)), structuredClone(base), {
        position: structuredClone(position),
        resolution: structuredClone(resolution),
        record: id => this.record(id),
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

  async #application(id, { allowMissing = false } = {}) {
    const entry = await this.#journal.read(id);
    this.#ensureOpen();
    if (!entry && allowMissing) { return null; }
    const value = entry?.value;
    const resolving = value?.resolution !== undefined;
    if (!entry || entry.kind !== "application" || entry.collection !== this.#collection || ![1, 2, 3].includes(value?.version) ||
        (value.version === 3) !== resolving ||
        (resolving && (!validConflictDecision(value.resolution) || value.resolution.choice === "local" ||
          value.resolution.record_id !== value.incoming?.id || value.source !== null ||
          value.resolution.remote_revision !== value.base?.revision ||
          value.resolutionBase?.id !== value.incoming?.id || typeof value.resolutionBase?.deleted !== "boolean")) ||
        value.generation !== this.#state.value.generation || !["applying", "waiting", "projecting"].includes(value.phase) ||
        !validSyncCounter(value.change?.sequence) || (!resolving && value.change.sequence === "0") ||
        (value.phase !== "waiting") !== (this.#state.value.activeApplication === id) ||
        (value.source !== null && (value.phase === "waiting" || value.source?.inbox !== this.#state.value.inbox ||
          value.source.index !== this.#state.value.index)) ||
        (value.phase === "projecting" && (value.version < 2 || value.outcome?.status !== "applied" || !value.outcome.effects ||
          (value.projectionAfter !== null && !SYNC_STORE_UUID.test(value.projectionAfter)))) ||
        (value.phase === "waiting" && !/^[a-z][a-z0-9_]{0,63}$/.test(value.reason))) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    if (value.progress != null && (typeof value.progress !== "object" || Array.isArray(value.progress) ||
        value.progress.id !== value.incoming?.id)) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    try {
      validateRemoteRecord(value.incoming);
      validateRemoteRecord(value.change.record);
      if (value.base !== null) {
        validateRemoteRecord(value.base);
        if (value.base.id !== value.incoming.id || (resolving ? value.base.revision !== value.incoming.revision :
          BigInt(value.base.revision) >= BigInt(value.incoming.revision))) {
          throw new SyncProtocolError("engine_state_corrupt");
        }
      }
    } catch {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    if (id !== await this.#id("application", value.incoming.id) ||
        !(resolving ? ["id", "revision", "payload", "ttl"] : ["id", "revision", "payload", "deleted", "ttl"])
          .every(key => value.incoming[key] === value.change.record[key])) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    const mirror = await this.#mirror(value.incoming.id);
    if (mirror?.value.applying !== id || JSON.stringify(mirror.value.remote) !== JSON.stringify(value.base)) {
      throw new SyncProtocolError("engine_state_corrupt");
    }
    return entry;
  }

  async #stageApplication(change, incoming, mirror, index, historical = null) {
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
      ...(historical ? [this.#remove(historical)] : []),
      this.#change(previous, "application", id, value),
      this.#change(mirror, "record", await this.#id("record", incoming.id), {
        ...(mirror?.value.retirementSnapshot ? { retirementSnapshot: mirror.value.retirementSnapshot } : {}),
        version: 1, id: incoming.id, remote: value.base, pending: null, blocked: false, applying: id, position,
      }),
    ], { ...this.#state.value, activeApplication: id, deferred: this.#state.value.deferred + (previous ? 0 : 1),
      conflicts: this.#state.value.conflicts - (historical ? 1 : 0) });
    return { id, collection: this.#collection, kind: "application", revision: (previous?.revision ?? 0) + 1, value };
  }

  async #waitForApplicationSlot(version, signal) {
    if (this.#closed || signal.aborted || version !== this.#version) {
      throw new SyncProtocolError("cancelled");
    }
    if (!this.#busy) { return; }
    await new Promise((resolve, reject) => {
      const finish = error => {
        stop();
        signal.removeEventListener("abort", abort);
        if (error) { reject(error); } else { resolve(); }
      };
      const abort = () => finish(new SyncProtocolError("cancelled"));
      const stop = this.subscribe(() => { if (!this.#busy) { finish(); } });
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) { abort(); }
      else if (!this.#busy) { finish(); }
    });
  }

  #applicationCheckpoint(entry) {
    const version = this.#version;
    const signal = this.#abort.signal;
    const identityOf = value => JSON.stringify([value.generation, this.#effectiveIncoming(value.incoming),
      value.base, value.resolution ?? null]);
    const identity = identityOf(entry.value);
    let expected = structuredClone(entry.value.progress ?? null);
    let tail = Promise.resolve();
    return nextProgress => {
      let progress;
      try { progress = structuredClone(nextProgress); } catch {
        return Promise.reject(new SyncProtocolError("invalid_adapter_result"));
      }
      if (!progress || typeof progress !== "object" || Array.isArray(progress) || progress.id !== entry.value.incoming.id) {
        return Promise.reject(new SyncProtocolError("invalid_adapter_result"));
      }
      const saving = tail.then(async () => {
        for (;;) {
          await this.#waitForApplicationSlot(version, signal);
          try {
            const updated = await this.#exclusive(async () => {
              if (signal.aborted || version !== this.#version) { throw new SyncProtocolError("cancelled"); }
              const current = await this.#application(entry.id, { allowMissing: true });
              if (!current || current.value.phase !== "waiting" || identityOf(current.value) !== identity ||
                  JSON.stringify(current.value.progress ?? null) !== JSON.stringify(expected)) {
                return false;
              }
              await this.#journal.commit([this.#change(current, "application", current.id, { ...current.value, progress })]);
              this.#ensureOpen();
              expected = structuredClone(progress);
              return true;
            });
            if (!updated) { throw new SyncProtocolError("application_state_changed"); }
            return;
          } catch (error) {
            if (error.code !== "busy") { throw error; }
          }
        }
      });
      tail = saving.catch(() => {});
      return saving;
    };
  }

  async #applyNativeApplication(entry) {
    const { incoming, base, plan } = entry.value;
    const resolution = entry.value.resolution;
    let outcome = null;
    try {
      if (!outcome) {
        if (this.#adapter.prepare && !plan) {
          throw new SyncProtocolError("application_upgrade_required");
        }
        if (resolution) {
          const current = await this.#readCurrent(incoming.id, incoming.value ?? entry.value.resolutionBase.value);
          const matches = (this.#adapter.matchesResolution ?? this.#adapter.matchesLocal).bind(this.#adapter);
          const unchanged = await matches(incoming.id, current,
            entry.value.resolutionBase.deleted ? null : entry.value.resolutionBase.value);
          const applied = await matches(incoming.id, current, incoming.deleted ? null : incoming.value);
          if (!unchanged && !applied) {
            outcome = { status: "conflict", reason: "application_state_changed" };
          } else if (applied && !plan) {
            outcome = { status: "applied" };
          }
        }
        const apply = resolution && this.#adapter.applyConflict ? this.#adapter.applyConflict : this.#adapter.apply;
        if (!outcome && plan) {
          outcome = typeof this.#adapter.applyPreparedWithCheckpoint === "function" ?
            await this.#adapter.applyPreparedWithCheckpoint(structuredClone(plan), {
              progress: structuredClone(entry.value.progress ?? null), checkpoint: this.#applicationCheckpoint(entry), signal: this.#abort.signal,
            }) :
            await this.#adapter.applyPrepared(structuredClone(plan));
        } else if (!outcome) {
          outcome = await apply.call(this.#adapter, structuredClone(this.#effectiveIncoming(incoming)),
            structuredClone(resolution ? entry.value.resolutionBase : base));
        }
      }
    } catch (error) {
      const code = this.#recordError(error);
      if (!code) {
        throw error;
      }
      outcome = { status: "conflict", reason: code };
    }
    return outcome;
  }

  async #executeApplication(entry) {
    this.#ensureOpen();
    this.#setPhase("applying");
    const { incoming, base, source, plan } = entry.value;
    const resolution = entry.value.resolution;
    const outcome = entry.value.phase === "projecting" ? entry.value.outcome : await this.#applyNativeApplication(entry);
    this.#ensureOpen();
    if (!outcome || !["applied", "conflict", "deferred"].includes(outcome.status) ||
        (outcome.status !== "applied" && !/^[a-z][a-z0-9_]{0,63}$/.test(outcome.reason))) {
      throw new SyncProtocolError("invalid_adapter_result");
    }
    if (outcome.status === "applied") {
      await this.#flushNative();
    }
    const deferred = outcome.status === "deferred";
    const conflict = outcome.status === "conflict";
    const replacement = outcome.replacement;
    if (replacement !== undefined && (outcome.status !== "applied" || !plan ||
        !this.#validReplacement(replacement?.id, replacement.replacementId))) {
      throw new SyncProtocolError("invalid_adapter_result");
    }
    if (outcome.retirementSnapshot !== undefined) {
      if (this.#collection !== "passwords" || outcome.status !== "applied" || !replacement) {
        throw new SyncProtocolError("invalid_adapter_result");
      }
      validateSyncPasswordRetirementSnapshot(incoming.id, outcome.retirementSnapshot);
    }
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
    if (resolution && outcome.status === "applied") {
      const current = await this.#readCaptured(incoming.id, { value: incoming.value }, incoming.value ?? entry.value.resolutionBase.value, true);
      const value = current === null ? null : await this.#adapter.validate(incoming.id, structuredClone(current));
      let mirror = await this.#mirror(incoming.id);
      const changes = [];
      if (replacement?.id === incoming.id) {
        mirror = { ...mirror, value: { ...mirror.value, replacementId: replacement.replacementId,
          ...await this.#replacementBackup(replacement, mirror, incoming, plan) } };
      } else if (replacement) {
        const other = await this.#mirror(replacement.id);
        changes.push(this.#change(other, "record", await this.#id("record", replacement.id), {
          version: 1, id: replacement.id, remote: null, pending: null, blocked: false, applying: null,
          ...other?.value, replacementId: replacement.replacementId,
          ...await this.#replacementBackup(replacement, other, incoming, plan),
        }));
      }
      await this.#enqueue(incoming.id, value, current === null, mirror, resolution, { entry, changes });
      await this.#finishConflictResolution();
      return outcome;
    }
    const state = { ...this.#state.value, activeApplication: null,
      index: source ? source.index + 1 : this.#state.value.index,
      deferred: this.#state.value.deferred - (deferred ? 0 : 1),
      conflicts: this.#state.value.conflicts + (conflict ? 1 : 0) };
    const changes = [];
    if (deferred) {
      changes.push(this.#change(entry, "application", entry.id, { ...entry.value, phase: "waiting", source: null,
        reason: outcome.reason, attempts: Math.min(1000, (entry.value.attempts ?? 0) + 1),
        waitingSince: entry.value.waitingSince ?? this.#now() }));
    } else {
      const mirror = await this.#mirror(incoming.id);
      changes.push(this.#remove(entry), this.#change(mirror, "record", mirror.id, {
        ...mirror.value, remote: resolution ? base : incoming, applying: null, blocked: conflict,
        conflictBase: conflict ? base : null,
        ...this.#identityProjection(resolution ? base : incoming, mirror),
        position: conflict ? null : outcome.position ?? this.#positionOf(incoming.id, incoming.value),
        ...(replacement?.id === incoming.id ? { replacementId: replacement.replacementId } : {}),
        ...(outcome.retirementSnapshot !== undefined ? { retirementSnapshot: mirror.value.retirementSnapshot ?? outcome.retirementSnapshot } : {}),
        ...(replacement?.id === incoming.id ? await this.#replacementBackup(replacement, mirror, incoming, plan) : {}),
      }));
      if (replacement && replacement.id !== incoming.id) {
        const other = await this.#mirror(replacement.id);
        changes.push(this.#change(other, "record", await this.#id("record", replacement.id), {
          version: 1, id: replacement.id, remote: null, pending: null, blocked: false, applying: null,
          ...other?.value, replacementId: replacement.replacementId,
          ...await this.#replacementBackup(replacement, other, incoming, plan),
        }));
      }
      if (conflict) {
        changes.push(this.#change(null, "conflict", this.#newId(), {
          version: 1, source: "download", change: entry.value.change, base, outcome,
          ...(resolution ? { resolution, resolutionBase: entry.value.resolutionBase } : {}),
        }));
      }
      if (!state.deferred) {
        state.applicationAfter = null;
        state.initialized ||= Boolean(state.cursor && !state.inbox && state.fence === null);
      }
    }
    await this.#save(changes, state);
    return outcome;
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
        if (mirror.value.localChange?.position) {
          targets.push({ entry: mirror, owner: row.id, id: mirror.value.id,
            position: mirror.value.localChange.position, captured: true });
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
        const { entry: target, owner, position, captured } = targets[index];
        if (!this.#samePosition(position, projected[index].position)) {
          const changes = byOwner.get(owner) ?? [];
          const previous = changes.find(change => change.id === target.id);
          const value = previous?.value ?? target.value;
          const updated = captured ? { ...value, localChange: { ...value.localChange, position: projected[index].position } } :
            { ...value, position: projected[index].position };
          if (previous) {
            previous.value = updated;
          } else {
            changes.push(this.#change(target, target.kind, target.id, updated));
          }
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
        const incoming = await this.#repairedIncoming(entry);
        const plan = entry.value.resolution ? entry.value.plan : await this.#prepareApplication(incoming, entry.value.base, position);
        const value = { ...entry.value, version: entry.value.resolution ? 3 : 2, incoming, plan, phase: "applying", source: null, reason: null };
        await this.#save([this.#change(entry, "application", entry.id, value)], {
          ...this.#state.value, activeApplication: entry.id, applicationAfter: entry.id,
        });
        await this.#executeApplication({ ...entry, revision: entry.revision + 1, value });
        if (this.#state.value.resolution) {
          return visited.size;
        }
      }
    }
    return visited.size;
  }

  async #repairedIncoming(entry) {
    const { incoming, reason, attempts, waitingSince } = entry.value;
    if (!this.#adapter.repair || incoming.deleted || (attempts ?? 0) < REPAIR_AFTER_ATTEMPTS ||
        !Number.isSafeInteger(waitingSince) || this.#now() - waitingSince < REPAIR_AFTER_MS ||
        this.#state.value.inbox || this.#state.value.fence !== null) {
      return incoming;
    }
    const repaired = await this.#adapter.repair(structuredClone(incoming.value), reason, incoming.id);
    this.#ensureOpen();
    return repaired ? { ...incoming, value: repaired } : incoming;
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
    const writeContext = this.#keys.writeContext;
    const selected = [];
    const operations = [];
    for (const entry of candidates) {
      const queued = entry.value;
      if (queued?.version !== 1 || queued.generation !== this.#state.value.generation || queued.epoch !== writeContext.epoch ||
          queued.operation?.operation_id !== entry.id || !validSyncRecordId(queued.operation.id) ||
          !validSyncCounter(queued.operation.base_revision, 2147483647n)) {
        throw new SyncProtocolError("outbox_state_mismatch");
      }
      const mirror = await this.#mirror(queued.operation.id);
      if (mirror?.value.pending !== entry.id) {
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
    const body = { crypto: writeContext, generation: this.#state.value.generation, operations };
    const { data } = await this.#send("operations", { method: "POST", body });
    const results = validateOperationResults(data, body.generation, operations);
    let quota = false;
    let refreshRequired = false;
    let waitingRetirement = false;
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
      if (result.status === "invalid" && await this.#renewRetiredOperation(entry, mirror)) {
        continue;
      }
      if (result.status === "conflict" && !operation.deleted && !mirror.value.blocked && !mirror.value.localChange &&
          !this.#state.value.resolution && protectedSyncRecords(this.#keys) &&
          typeof this.#adapter.canAdoptRecord === "function" &&
          BigInt(result.revision) > BigInt(mirror.value.remote?.revision ?? operation.base_revision) &&
          !await this.#knownRemoteConflict(operation.id, result.revision) &&
          await this.#adapter.canAdoptRecord({ id: operation.id, deleted: false, value: structuredClone(value), authenticatedSchema: 2 })) {
        refreshRequired = true;
        continue;
      }
      if (result.status === "conflict" && operation.deleted && mirror.value.replacementId &&
          !mirror.value.blocked && !mirror.value.localChange && !this.#state.value.resolution &&
          protectedSyncRecords(this.#keys) &&
          BigInt(result.revision) > BigInt(mirror.value.remote?.revision ?? "0")) {
        refreshRequired = true;
        continue;
      }
      const applied = result.status === "applied";
      const conflictBase = entry.value.base ?? (mirror.value.remote?.revision === operation.base_revision ? mirror.value.remote : null);
      const remote = applied ? { id: operation.id, revision: result.revision, payload: operation.payload ?? "", deleted: operation.deleted,
        ttl: operation.ttl ?? null, value } : mirror.value.remote;
      const position = applied ? entry.value.position ?? this.#positionOf(operation.id, value) : mirror.value.position ?? null;
      if (applied && mirror.value.localChange) {
        const captured = mirror.value.localChange;
        const nextValue = captured.value && captured.position ? { ...captured.value, ...captured.position } : captured.value;
        const retirement = captured.deleted && mirror.value.replacementId && this.#adapter.retirementValue ?
          await this.#adapter.retirementValue(operation.id, remote.value, { source: remote, record: id => this.record(id) }) : undefined;
        this.#ensureOpen();
        if (retirement === null) {
          await this.#save([this.#change(mirror, "record", mirrorId, {
            ...mirror.value, remote, position,
          })], this.#state.value);
          waitingRetirement = true;
          continue;
        }
        const validated = retirement !== undefined ? await this.#adapter.validate(operation.id, retirement) :
          captured.deleted ? null : await this.#adapter.validate(operation.id, structuredClone(nextValue));
        await this.#enqueue(operation.id, validated, captured.deleted && retirement === undefined,
          { ...mirror, value: { ...mirror.value, remote, position } }, null, null, entry);
        continue;
      }
      const changes = [this.#remove(entry), this.#change(mirror, "record", mirrorId, {
        ...mirror.value, remote, pending: null, blocked: !applied, conflictBase: applied ? null : conflictBase,
        ...this.#identityProjection(remote, mirror),
        position,
      })];
      if (!applied) {
        changes.push(this.#change(null, "conflict", this.#newId(), { version: 1, source: "upload", queued: entry.value, result,
          base: conflictBase,
          ...(mirror.value.localChange ? { localChange: mirror.value.localChange } : {}) }));
      }
      await this.#save(changes, { ...this.#state.value, pending: this.#state.value.pending - 1,
        conflicts: this.#state.value.conflicts + (applied ? 0 : 1) });
    }
    if (quota) {
      this.#error = "quota_exceeded";
    }
    return !quota && !refreshRequired && !waitingRetirement;
  }

  async #renewRetiredOperation(entry, mirror) {
    const queued = entry.value;
    const previous = queued.operation;
    if (!protectedSyncRecords(this.#keys) || !previous.payload) {
      return false;
    }
    let envelope;
    try {
      envelope = JSON.parse(previous.payload);
    } catch {
      throw new SyncProtocolError("outbox_state_mismatch");
    }
    if (envelope.key_id === this.#keys.snapshot.activeKeyId) {
      return false;
    }
    if (envelope.context?.collection !== this.#collection || envelope.context.id !== previous.id ||
        envelope.context.generation !== queued.generation || envelope.context.base_revision !== previous.base_revision) {
      throw new SyncProtocolError("outbox_state_mismatch");
    }
    const value = previous.deleted ? null : await this.#adapter.validate(previous.id, queued.value);
    const writeContext = this.#keys.writeContext;
    const sealed = await sealSyncRecord(this.#keys, {
      collection: this.#collection, id: previous.id, generation: queued.generation, base_revision: previous.base_revision,
    }, { deleted: previous.deleted, ttl: previous.ttl ?? null, value });
    if (sealed.crypto.epoch !== writeContext.epoch || sealed.crypto.revision !== writeContext.revision) {
      throw new SyncProtocolError("crypto_state_conflict");
    }
    const id = this.#newId();
    const operation = { ...previous, operation_id: id, payload: sealed.payload };
    await this.#save([
      this.#remove(entry),
      this.#change(null, "outbox", id, { ...queued, operation, value }),
      this.#change(mirror, "record", mirror.id, { ...mirror.value, pending: id,
        ...(mirror.value.localChange ? { localChange: { ...mirror.value.localChange, operation_id: id } } : {}) }),
    ], this.#state.value);
    return true;
  }

  async #send(path, options = {}) {
    this.#ensureOpen();
    if (path === "changes" && this.#pageBytes) {
      options = { ...options, maxBytes: this.#pageBytes, query: { ...options.query, max_bytes: this.#pageBytes } };
    }
    const result = await this.#request(`api/v1/sync/collections/${this.#collection}/${path}`, {
      maxBytes: 4 * 1024 * 1024, timeout: 15000, ...options, signal: this.#abort.signal,
    });
    this.#ensureOpen();
    return result;
  }

  async #save(changes, value) {
    this.#ensureOpen();
    value = { ...value, version: collectionStateVersion(value) };
    const current = this.#state;
    await this.#journal.commit([...changes, this.#change(current, "metadata", current.id, value)]);
    this.#ensureOpen();
    this.#state = { ...current, revision: current.revision + 1, value };
    this.#notify();
  }

  #validReplacement(id, targetId) {
    return validSyncRecordId(id) && validSyncRecordId(targetId) &&
      (this.#adapter.validReplacement ? this.#adapter.validReplacement(id, targetId) === true : targetId < id);
  }

  async #replacementBackup(replacement, mirror, incoming, plan) {
    const snapshot = await this.#adapter.backupReplacement?.(replacement.id, replacement.replacementId,
      mirror?.value ?? null, incoming, plan);
    this.#ensureOpen();
    if (snapshot === undefined) {
      return {};
    }
    validateSyncPasswordRetirementSnapshot(replacement.id, snapshot);
    return { retirementSnapshot: snapshot };
  }

  #change(previous, kind, id, value) {
    if (kind === "record" && value.retirementSnapshot !== undefined) {
      if (this.#collection !== "passwords") {
        throw new SyncProtocolError("invalid_adapter_result");
      }
      validateSyncPasswordRetirementSnapshot(value.id, value.retirementSnapshot);
      value = { ...value, version: 2 };
    }
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

  async #restoreCancelledState() {
    this.#workVersion = this.#version;
    try {
      const state = await this.#journal.read(await this.#id("metadata", "collection-state-v1"));
      if (state) {
        if (state.collection !== this.#collection || state.kind !== "metadata") {
          throw new SyncProtocolError("engine_state_corrupt");
        }
        validateSyncCollectionState(state.value);
        this.#state = state;
      }
      this.#phase = "idle";
      this.#error = null;
      this.#retryAfter = 0;
    } catch (error) {
      this.#error = error.code ?? "sync_failed";
      this.#phase = "error";
    }
  }

  async #exclusive(work) {
    this.#ensureOpen();
    if (this.#busy) {
      throw new SyncProtocolError("busy");
    }
    this.#workVersion = this.#version;
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
      if (this.#workVersion !== this.#version) {
        throw new SyncProtocolError("cancelled");
      }
      if (!this.#closed) {
        this.#phase = "error";
        this.#error = error.code ?? "sync_failed";
        this.#retryAfter = error.retryAfter ?? 0;
      }
      throw error;
    } finally {
      if (!this.#closed && this.#workVersion !== this.#version) {
        await this.#restoreCancelledState();
      }
      this.#busy = false;
      this.#workVersion = this.#version;
      this.#notify();
    }
  }

  #setPhase(phase) {
    this.#phase = phase;
    this.#notify();
  }

  #ensureOpen() {
    if (this.#closed || (this.#busy && this.#workVersion !== this.#version)) {
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
