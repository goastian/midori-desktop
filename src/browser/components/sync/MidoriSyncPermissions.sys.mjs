/* This Source Code Form is subject to the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";
import { validateSyncPermission, classifySyncPermission, planSyncPermission,
  canDeleteSyncPermission, deriveSyncPermissionId } from "./MidoriSyncPermissionModel.sys.mjs";
import { createSyncPermissionStore, sameNativeSyncPermission } from "./MidoriSyncPermissionStore.sys.mjs";
import { syncConflictSummary } from "./MidoriSyncConflictSummary.sys.mjs";

const ID = /^p1:[0-9a-f]{64}$/;
const same = (left, right) => left === null || right === null ? left === right :
  ["origin", "permission", "action", "expiresAt"].every(field => left[field] === right[field]);

export class MidoriSyncPermissions {
  #store;
  #derive;
  #record;
  #now;
  #descriptors = new Map();
  #subscriptions = new Set();
  #lastRead = null;
  #lastObservation = null;
  #closed = false;

  constructor({ store = createSyncPermissionStore(), deriveRecordId, record, now = Date.now } = {}) {
    if (["list", "read", "persist", "write", "observe"].some(name => typeof store?.[name] !== "function") ||
        typeof deriveRecordId !== "function" || typeof record !== "function" || typeof now !== "function") {
      throw new SyncProtocolError("invalid_adapter");
    }
    this.#store = store;
    this.#derive = deriveRecordId;
    this.#record = record;
    this.#now = now;
  }

  async #id(origin, permission) {
    const id = await deriveSyncPermissionId(origin, permission, this.#derive);
    this.#ensureOpen();
    const previous = this.#descriptors.get(id);
    if (previous && (previous.origin !== origin || previous.permission !== permission)) {
      throw new SyncProtocolError("invalid_record");
    }
    this.#descriptors.set(id, { origin, permission });
    return id;
  }

  async validate(id, value) {
    this.#ensureOpen();
    value = validateSyncPermission(value);
    if (!ID.test(id) || await this.#id(value.origin, value.permission) !== id) {
      throw new SyncProtocolError("invalid_record");
    }
    return value;
  }

  async #descriptor(id, hint = null) {
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
    const ids = new Set();
    for (const native of inventory) {
      const projection = classifySyncPermission(native, this.#now());
      if (projection.kind === "portable") {
        ids.add(await this.#id(projection.value.origin, projection.value.permission));
      }
    }
    this.#ensureOpen();
    return [...ids];
  }

  async countUnsupported() {
    this.#ensureOpen();
    const inventory = await this.#store.list();
    this.#ensureOpen();
    if (!Array.isArray(inventory)) { throw new SyncProtocolError("invalid_adapter_result"); }
    return inventory.filter(native => {
      const projection = classifySyncPermission(native, this.#now());
      return projection.kind === "local" && projection.reason !== "private";
    }).length;
  }

  async read(id, hint = null) {
    const descriptor = await this.#descriptor(id, hint);
    this.#lastRead = null;
    this.#lastObservation = null;
    if (!descriptor) { return null; }
    const native = await this.#store.read(descriptor.origin, descriptor.permission);
    this.#ensureOpen();
    const projection = classifySyncPermission(native, this.#now());
    this.#lastObservation = { id, native: structuredClone(native) };
    if (["portable", "absent"].includes(projection.kind) || projection.reason === "sensitive-grant") {
      this.#lastRead = { ...descriptor, native: structuredClone(native) };
    }
    return projection.kind === "portable" ? projection.value : null;
  }

  matchesLocal(id, current, base) {
    if (current === null && this.#lastObservation?.id === id) {
      const projection = classifySyncPermission(this.#lastObservation.native, this.#now());
      if (["expired", "excluded"].includes(projection.kind) ||
          (projection.kind === "local" && projection.reason !== "sensitive-grant")) {
        return true;
      }
    }
    return same(current, base);
  }

  conflictValue(current) {
    this.#ensureOpen();
    return { value: current, native: structuredClone(this.#lastObservation?.native ?? null) };
  }

  localConflictSummary(id, current) {
    this.#ensureOpen();
    const observed = this.#lastObservation;
    if (observed?.id !== id) {
      throw new SyncProtocolError("invalid_adapter_result");
    }
    const native = observed.native;
    const projection = classifySyncPermission(native, this.#now());
    if (["excluded", "expired"].includes(projection.kind)) {
      return { ...syncConflictSummary("site-permissions", id, native), localReason: projection.kind };
    }
    if (["sensitive-grant", "policy", "session"].includes(projection.reason)) {
      const actions = { 1: "allow", 2: "deny", 3: "prompt", 8: "session-cookies" };
      return { ...syncConflictSummary("site-permissions", id, { ...native, action: actions[native.capability] }),
        localReason: projection.reason };
    }
    return syncConflictSummary("site-permissions", id, current);
  }

  async flush() {
    this.#ensureOpen();
    const captured = this.#lastRead;
    this.#lastRead = null;
    if (captured && !await this.#store.persist(captured.origin, captured.permission, captured.native)) {
      throw new SyncProtocolError("native_write_failed");
    }
    this.#ensureOpen();
  }

  async canDelete(id, previous) {
    if (previous === null) { return false; }
    const base = await this.validate(id, previous);
    const current = await this.#store.read(base.origin, base.permission);
    this.#ensureOpen();
    return canDeleteSyncPermission(base, current, this.#now());
  }

  canResolveConflict(choice) {
    return ["local", "remote"].includes(choice);
  }

  async canAdoptRecord(incoming) {
    this.#ensureOpen();
    this.#lastRead = null;
    if (incoming.deleted || incoming.authenticatedSchema !== 2) { return false; }
    const value = await this.validate(incoming.id, incoming.value);
    const native = await this.#store.read(value.origin, value.permission);
    this.#ensureOpen();
    const current = classifySyncPermission(native, this.#now());
    if (current.kind !== "portable" || !same(current.value, value)) { return false; }
    const durable = await this.#store.persist(value.origin, value.permission, native);
    this.#ensureOpen();
    return durable;
  }

  async prepare(incoming, previous = null, { resolution = null } = {}) {
    this.#ensureOpen();
    this.#lastRead = null;
    const observed = this.#lastObservation;
    if (typeof incoming?.deleted !== "boolean" || !ID.test(incoming.id)) {
      throw new SyncProtocolError("invalid_record");
    }
    const value = incoming.deleted ? null : await this.validate(incoming.id, incoming.value);
    const base = previous && !previous.deleted ? await this.validate(incoming.id, previous.value) : null;
    const descriptor = value ?? base;
    const current = descriptor ? await this.#store.read(descriptor.origin, descriptor.permission) : null;
    let decision = planSyncPermission({ ...incoming, value }, previous && base ? { ...previous, value: base } : null,
      current, { now: this.#now(), resolution });
    this.#ensureOpen();
    const reviewed = resolution?.choice === "remote";
    if (reviewed && observed?.id === incoming.id && !sameNativeSyncPermission(observed.native, current)) {
      decision = { status: "conflict", reason: "permission_local_changed" };
    }
    return { version: 1, id: incoming.id, kind: "site-permission",
      descriptor: descriptor ? { origin: descriptor.origin, permission: descriptor.permission } : null,
      current: structuredClone(current), reviewed, decision };
  }

  async applyPrepared(plan) {
    this.#ensureOpen();
    this.#lastRead = null;
    if (plan?.version !== 1 || plan.kind !== "site-permission" || !ID.test(plan.id) || typeof plan.reviewed !== "boolean") {
      throw new SyncProtocolError("invalid_application");
    }
    const decision = plan.decision;
    if (decision?.status === "keep_local") { return { status: "applied" }; }
    if (["conflict", "deferred"].includes(decision?.status)) {
      if (decision.status === "deferred" && plan.reviewed && plan.descriptor &&
          !sameNativeSyncPermission(plan.current, await this.#store.read(plan.descriptor.origin, plan.descriptor.permission))) {
        this.#ensureOpen();
        return { status: "conflict", reason: "permission_local_changed" };
      }
      this.#ensureOpen();
      return structuredClone(decision);
    }
    if (!["apply", "persist"].includes(decision?.status) || !plan.descriptor ||
        await this.#id(plan.descriptor.origin, plan.descriptor.permission) !== plan.id ||
        (plan.current && (plan.current.origin !== plan.descriptor.origin || plan.current.permission !== plan.descriptor.permission))) {
      throw new SyncProtocolError("invalid_application");
    }
    const desired = decision.desired === null ? null : await this.validate(plan.id, decision.desired);
    const result = await this.#store.write({ ...plan.descriptor, expected: plan.current, desired });
    this.#ensureOpen();
    if (!["applied", "deferred", "conflict"].includes(result?.status)) {
      throw new SyncProtocolError("invalid_adapter_result");
    }
    return plan.reviewed && result.status === "deferred" && result.reason === "permission_local_changed" ?
      { status: "conflict", reason: "permission_local_changed" } : result;
  }

  async apply(incoming, previous = null) {
    return this.applyPrepared(await this.prepare(incoming, previous));
  }

  observe(listener) {
    this.#ensureOpen();
    const stop = this.#store.observe(listener);
    const unsubscribe = () => {
      if (this.#subscriptions.delete(unsubscribe)) { stop(); }
    };
    this.#subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  close() {
    if (this.#closed) { return; }
    this.#closed = true;
    for (const unsubscribe of [...this.#subscriptions]) { unsubscribe(); }
    this.#descriptors.clear();
    this.#lastRead = null;
    this.#lastObservation = null;
  }

  #ensureOpen() {
    if (this.#closed) { throw new SyncProtocolError("cancelled"); }
  }
}
