/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";
import { validateSyncExtension, classifySyncExtension, planSyncExtension, canDeleteSyncExtension,
  deriveSyncExtensionId } from "./MidoriSyncExtensionModel.sys.mjs";
import { createSyncExtensionStore, sameNativeSyncExtension } from "./MidoriSyncExtensionStore.sys.mjs";
import { syncConflictSummary } from "./MidoriSyncConflictSummary.sys.mjs";

const ID = /^e1:[0-9a-f]{64}$/;
const phases = ["downloading", "awaiting-user", "declined", "failed", "waiting", "installed"];
const same = (left, right) => left === null || right === null ? left === right :
  ["catalog", "addonId", "enabled"].every(field => left[field] === right[field]);
const pending = reason => ({ status: "deferred", reason });
const intent = plan => JSON.stringify([plan.revision, plan.decision.desired]);
const MAX_ATTEMPTS = 5;
const MAX_RETRY_DELAY = 10 * 60000;

export class MidoriSyncExtensions {
  #store;
  #timers;
  #now;
  #derive;
  #record;
  #descriptors = new Map();
  #subscriptions = new Set();
  #listeners = new Set();
  #jobs = new Map();
  #reviews = new Set();
  #retries = new Map();
  #lastRead = null;
  #lastObservation = null;
  #closed = false;

  constructor({ store = createSyncExtensionStore(), deriveRecordId, record, now = () => Date.now(),
    timers = typeof ChromeUtils === "undefined" ? globalThis : ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs") } = {}) {
    if (["list", "read", "persist", "write", "install", "observe"].some(name => typeof store?.[name] !== "function") ||
        typeof deriveRecordId !== "function" || typeof record !== "function" ||
        typeof timers?.setTimeout !== "function" || typeof timers?.clearTimeout !== "function" || typeof now !== "function") { throw new SyncProtocolError("invalid_adapter"); }
    this.#store = store;
    this.#timers = timers;
    this.#now = now;
    this.#derive = deriveRecordId;
    this.#record = record;
  }

  async #id(catalog, addonId) {
    const id = await deriveSyncExtensionId(catalog, addonId, this.#derive);
    this.#ensureOpen();
    const previous = this.#descriptors.get(id);
    if (previous && (previous.catalog !== catalog || previous.addonId !== addonId)) { throw new SyncProtocolError("invalid_record"); }
    this.#descriptors.set(id, { catalog, addonId });
    return id;
  }

  async validate(id, value) {
    this.#ensureOpen();
    value = validateSyncExtension(value);
    if (!ID.test(id) || await this.#id(value.catalog, value.addonId) !== id) { throw new SyncProtocolError("invalid_record"); }
    return value;
  }

  async #descriptor(id, hint) {
    this.#ensureOpen();
    if (!ID.test(id)) { throw new SyncProtocolError("invalid_record"); }
    const value = hint ?? (await this.#record(id))?.remote?.value ?? null;
    if (value !== null) { await this.validate(id, value); }
    return this.#descriptors.get(id) ?? null;
  }

  async listIds() {
    this.#ensureOpen();
    const inventory = await this.#store.list();
    if (!Array.isArray(inventory)) { throw new SyncProtocolError("invalid_adapter_result"); }
    const result = new Set();
    for (const native of inventory) {
      const projected = classifySyncExtension(native);
      if (projected.kind === "portable") {
        const id = await this.#id(native.catalog, native.addonId);
        if (!this.#jobs.has(id)) { result.add(id); }
      }
    }
    this.#ensureOpen();
    return [...result];
  }

  async countUnsupported() {
    this.#ensureOpen();
    const inventory = await this.#store.list();
    this.#ensureOpen();
    if (!Array.isArray(inventory)) { throw new SyncProtocolError("invalid_adapter_result"); }
    return inventory.filter(native => classifySyncExtension(native).kind === "local").length;
  }

  async read(id, hint = null) {
    const descriptor = await this.#descriptor(id, hint);
    this.#lastRead = null;
    this.#lastObservation = null;
    if (!descriptor) { return null; }
    const native = await this.#store.read(descriptor.catalog, descriptor.addonId);
    this.#ensureOpen();
    this.#lastObservation = { id, native: structuredClone(native) };
    const projected = classifySyncExtension(native);
    if (this.#jobs.has(id)) { return null; }
    if (["portable", "removed", "missing"].includes(projected.kind)) { this.#lastRead = { ...descriptor, native: structuredClone(native) }; }
    return projected.kind === "portable" ? projected.value : null;
  }

  matchesLocal(id, current, base) {
    if (this.#jobs.has(id) || (current === null && this.#lastObservation?.id === id &&
        classifySyncExtension(this.#lastObservation.native).kind === "local")) { return true; }
    return same(current, base);
  }

  conflictValue(current) { return { value: current, native: structuredClone(this.#lastObservation?.native ?? null) }; }

  localConflictSummary(id, current) {
    this.#ensureOpen();
    if (this.#lastObservation?.id !== id) { throw new SyncProtocolError("invalid_adapter_result"); }
    const native = this.#lastObservation.native;
    const value = current ?? (native && native.scope !== "absent" ? native : null);
    return syncConflictSummary("extensions", id, value);
  }

  async flush() {
    this.#ensureOpen();
    const captured = this.#lastRead;
    this.#lastRead = null;
    if (captured && !await this.#store.persist(captured.catalog, captured.addonId, captured.native)) {
      throw new SyncProtocolError("native_write_failed");
    }
    this.#ensureOpen();
  }

  async canDelete(id, previous) {
    if (previous === null || this.#jobs.has(id)) { return false; }
    const value = await this.validate(id, previous);
    const native = await this.#store.read(value.catalog, value.addonId);
    this.#ensureOpen();
    return canDeleteSyncExtension(value, native);
  }

  canResolveConflict(choice) { return ["local", "remote"].includes(choice); }

  async canAdoptRecord(incoming) {
    this.#ensureOpen();
    this.#lastRead = null;
    if (incoming.deleted || incoming.authenticatedSchema !== 2 || this.#jobs.has(incoming.id)) { return false; }
    const value = await this.validate(incoming.id, incoming.value);
    const native = await this.#store.read(value.catalog, value.addonId);
    const projection = classifySyncExtension(native);
    if (projection.kind !== "portable" || !same(projection.value, value)) { return false; }
    const result = await this.#store.persist(value.catalog, value.addonId, native);
    this.#ensureOpen();
    return result;
  }

  async prepare(incoming, previous = null, { resolution = null } = {}) {
    this.#ensureOpen();
    this.#lastRead = null;
    if (typeof incoming?.deleted !== "boolean" || !ID.test(incoming.id)) { throw new SyncProtocolError("invalid_record"); }
    const value = incoming.deleted ? null : await this.validate(incoming.id, incoming.value);
    const base = previous && !previous.deleted ? await this.validate(incoming.id, previous.value) : null;
    const descriptor = value ?? base;
    const current = descriptor ? await this.#store.read(descriptor.catalog, descriptor.addonId) : null;
    this.#ensureOpen();
    let decision = planSyncExtension({ ...incoming, value }, previous && base ? { ...previous, value: base } : null, current, { resolution });
    const reviewed = resolution?.choice === "remote";
    if (reviewed && this.#lastObservation?.id === incoming.id && !sameNativeSyncExtension(this.#lastObservation.native, current)) {
      decision = { status: "conflict", reason: "extension_local_changed" };
    }
    return { version: 1, kind: "extension", id: incoming.id, revision: incoming.revision ?? null,
      descriptor: descriptor ? { catalog: descriptor.catalog, addonId: descriptor.addonId } : null,
      current: structuredClone(current), reviewed, decision };
  }

  async applyPreparedWithCheckpoint(plan, { progress = null, checkpoint = null, signal = null } = {}) {
    this.#ensureOpen();
    this.#lastRead = null;
    if (plan?.version !== 1 || plan.kind !== "extension" || !ID.test(plan.id) || typeof plan.reviewed !== "boolean") {
      throw new SyncProtocolError("invalid_application");
    }
    if (progress !== null && (progress.version !== 1 || progress.type !== "extension-install" ||
        progress.id !== plan.id || typeof progress.intent !== "string" || !phases.includes(progress.phase) ||
        !/^extension_[a-z_]{1,49}$/.test(progress.reason))) { throw new SyncProtocolError("invalid_application"); }
    if (progress && ((progress.attempt !== undefined && (!Number.isInteger(progress.attempt) || progress.attempt < 1 || progress.attempt > MAX_ATTEMPTS)) ||
        (progress.retryAt !== undefined && (!Number.isSafeInteger(progress.retryAt) || progress.retryAt < 0 || progress.attempt === undefined)))) {
      throw new SyncProtocolError("invalid_application");
    }
    const active = this.#jobs.get(plan.id);
    if (active) {
      if (active.intent === intent(plan) && !active.controller.signal.aborted) { return pending(active.reason); }
      active.controller.abort();
      return pending("extension_local_changed");
    }
    const decision = plan.decision;
    if (decision?.status === "keep_local") { return { status: "applied" }; }
    if (["conflict", "deferred"].includes(decision?.status)) { return structuredClone(decision); }
    if (!["apply", "persist"].includes(decision?.status) || !plan.descriptor ||
        await this.#id(plan.descriptor.catalog, plan.descriptor.addonId) !== plan.id) { throw new SyncProtocolError("invalid_application"); }
    const desired = decision.desired === null ? null : await this.validate(plan.id, decision.desired);
    const result = await this.#store.write({ ...plan.descriptor, expected: plan.current, desired });
    this.#ensureOpen();
    if (result?.status !== "deferred" || result.reason !== "extension_install_required") {
      this.#clearRetry(plan.id);
      if (!["applied", "deferred", "conflict"].includes(result?.status)) { throw new SyncProtocolError("invalid_adapter_result"); }
      return plan.reviewed && result.reason === "extension_local_changed" ? { status: "conflict", reason: result.reason } : result;
    }
    if (!desired || typeof checkpoint !== "function" || !signal || signal.aborted) { return pending("extension_checkpoint_required"); }
    if (progress && progress.intent !== intent(plan)) { throw new SyncProtocolError("invalid_application"); }
    const review = this.#reviews.has(plan.id);
    const retry = progress?.phase === "waiting" && progress.reason === "extension_download_failed" &&
      progress.retryAt !== undefined && progress.attempt < MAX_ATTEMPTS;
    if (progress && progress.phase !== "downloading" && !review &&
        !(progress.phase === "waiting" && progress.reason === "extension_window_required")) {
      if (!retry) { return pending(progress.reason); }
      if (!this.#retryReady(plan, progress, signal)) { return pending("extension_retry_scheduled"); }
    }
    if (this.#jobs.size >= 1) { return pending("extension_install_queued"); }
    this.#reviews.delete(plan.id);
    this.#clearRetry(plan.id);
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { abort(); }
    const job = { controller, intent: intent(plan), reason: "extension_downloading", promise: null,
      attempt: review ? 1 : retry ? progress.attempt + 1 : progress?.attempt ?? 1, signal, timedOut: false };
    this.#jobs.set(plan.id, job);
    const timeout = this.#timers.setTimeout(() => { job.timedOut = true; controller.abort(); }, 10 * 60000);
    job.promise = this.#install(plan, desired, job, checkpoint).finally(() => {
      this.#timers.clearTimeout(timeout);
      signal.removeEventListener("abort", abort);
      if (this.#jobs.get(plan.id) === job) { this.#jobs.delete(plan.id); }
      this.#notify();
    });
    return pending(job.reason);
  }

  async #install(plan, desired, job, checkpoint) {
    const ensureActive = (allowTimeout = false) => {
      this.#ensureOpen();
      if (job.signal.aborted || (job.controller.signal.aborted && !(allowTimeout && job.timedOut)) ||
          this.#jobs.get(plan.id) !== job) { throw new SyncProtocolError("cancelled"); }
    };
    const save = async (phase, reason, extra = {}, allowTimeout = false) => {
      ensureActive(allowTimeout);
      await checkpoint({ version: 1, type: "extension-install", id: plan.id, intent: job.intent, phase, reason,
        attempt: job.attempt, ...extra });
      ensureActive(allowTimeout);
      job.reason = reason;
      this.#notify();
    };
    const downloadFailed = (allowTimeout = false) => {
      const retryAt = Math.trunc(this.#now()) + Math.min(MAX_RETRY_DELAY, 30000 * 2 ** (job.attempt - 1));
      return save(job.attempt < MAX_ATTEMPTS ? "waiting" : "failed", "extension_download_failed",
        job.attempt < MAX_ATTEMPTS ? { retryAt } : {}, allowTimeout);
    };
    try {
      await save("downloading", "extension_downloading");
      const result = await this.#store.install({ desired, expected: plan.current, signal: job.controller.signal,
        beforePermissionPrompt: () => save("awaiting-user", "extension_permission_required") });
      ensureActive();
      if (result?.status === "applied") { await save("installed", "extension_installed"); }
      else if (result?.status === "deferred" && /^extension_[a-z_]{1,49}$/.test(result.reason)) {
        if (result.reason === "extension_download_failed") {
          await downloadFailed();
        } else { await save(result.reason === "extension_permission_declined" ? "declined" : "waiting", result.reason); }
      } else { throw new SyncProtocolError("invalid_adapter_result"); }
    } catch (error) {
      if (job.timedOut && job.reason === "extension_downloading") {
        try { await downloadFailed(true); } catch {}
        return;
      }
      if (["cancelled", "application_state_changed"].includes(error.code) || this.#closed || job.controller.signal.aborted) { return; }
      try { await save("failed", "extension_install_failed"); } catch {}
    }
  }

  #clearRetry(id) {
    const retry = this.#retries.get(id);
    if (retry) {
      this.#timers.clearTimeout(retry.timer);
      retry.signal.removeEventListener("abort", retry.abort);
      this.#retries.delete(id);
    }
  }

  #retryReady(plan, progress, signal) {
    if (progress.retryAt <= this.#now()) { return true; }
    let retry = this.#retries.get(plan.id);
    if (retry && (retry.intent !== intent(plan) || retry.attempt !== progress.attempt || retry.signal !== signal)) {
      this.#clearRetry(plan.id);
      retry = null;
    }
    if (!retry) {
      retry = { intent: intent(plan), attempt: progress.attempt, signal, ready: false,
        abort: () => this.#clearRetry(plan.id), timer: null };
      this.#retries.set(plan.id, retry);
      signal.addEventListener("abort", retry.abort, { once: true });
      retry.timer = this.#timers.setTimeout(() => {
        if (!signal.aborted && this.#retries.get(plan.id) === retry) { retry.ready = true; this.#notify(); }
      }, Math.min(MAX_RETRY_DELAY, Math.max(0, progress.retryAt - this.#now())));
    }
    return retry.ready;
  }

  async applicationSummary({ incoming, reason, progress }) {
    this.#ensureOpen();
    if (incoming.deleted) { return null; }
    const value = await this.validate(incoming.id, incoming.value);
    let status = this.#jobs.get(incoming.id)?.reason ?? progress?.reason ?? reason;
    if (!this.#jobs.has(incoming.id) && progress?.phase === "waiting" && status === "extension_download_failed" &&
        progress.retryAt !== undefined && progress.attempt < MAX_ATTEMPTS) { status = "extension_retry_scheduled"; }
    if (!/^extension_[a-z_]{1,49}$/.test(status)) { throw new SyncProtocolError("invalid_application"); }
    return { catalog: value.catalog, addonId: value.addonId, reason: status,
      canReview: !this.#jobs.has(incoming.id) && progress != null && progress.phase !== "downloading" };
  }

  reviewApplication({ incoming }) { this.reviewInstall(incoming.id); }

  reviewInstall(id) {
    this.#ensureOpen();
    if (!ID.test(id) || !this.#descriptors.has(id)) { throw new SyncProtocolError("invalid_record"); }
    this.#reviews.add(id);
    this.#notify();
  }

  async applyPrepared(plan) { return this.applyPreparedWithCheckpoint(plan); }
  async apply(incoming, previous = null) { return this.applyPrepared(await this.prepare(incoming, previous)); }

  #notify() {
    if (!this.#closed) { for (const listener of this.#listeners) { try { listener({ rescan: true }); } catch {} } }
  }

  observe(listener) {
    this.#ensureOpen();
    this.#listeners.add(listener);
    const stop = this.#store.observe(event => {
      if (event.rescan) { listener(event); return; }
      this.#id(event.catalog, event.addonId).then(id => { if (!this.#closed) { listener({ id }); } }).catch(() => {});
    });
    const unsubscribe = () => {
      if (this.#subscriptions.delete(unsubscribe)) { this.#listeners.delete(listener); stop(); }
    };
    this.#subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  close() {
    if (this.#closed) { return; }
    this.#closed = true;
    for (const job of this.#jobs.values()) { job.controller.abort(); }
    for (const id of this.#retries.keys()) { this.#clearRetry(id); }
    for (const stop of this.#subscriptions) { stop(); }
    this.#descriptors.clear(); this.#reviews.clear(); this.#listeners.clear();
    this.#lastRead = null; this.#lastObservation = null;
  }

  #ensureOpen() { if (this.#closed) { throw new SyncProtocolError("cancelled"); } }
}
