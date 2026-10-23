/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";
import { sameNativeSyncExtension } from "./MidoriSyncExtensionStore.sys.mjs";
import { createSyncExtensionSettingsStore } from "./MidoriSyncExtensionSettingsStore.sys.mjs";
import { deriveSyncExtensionSettingsId, createSyncExtensionSettingsBundle,
  validateSyncExtensionSettingsRecord, assembleSyncExtensionSettings,
  serializeSyncExtensionSettings, mergeSyncExtensionSettings } from "./MidoriSyncExtensionSettingsModel.sys.mjs";
import { syncTextDigest } from "./MidoriSyncTextBundle.sys.mjs";

const MANIFEST = /^xm1:[0-9a-f]{64}$/;
const PART = /^xp1:[0-9a-f]{64}$/;
const equal = (left, right) => left === null || right === null ? left === right :
  serializeSyncExtensionSettings(left) === serializeSyncExtensionSettings(right);
const sameManifest = (left, right) => left === null || right === null ? left === right :
  left.catalog === right.catalog && left.addonId === right.addonId &&
  left.bundle.digest === right.bundle.digest && left.bundle.byte_count === right.bundle.byte_count;
const empty = data => data !== null && !Object.keys(data).length;

export class MidoriSyncExtensionSettings {
  #store;
  #options;
  #record;
  #descriptors = new Map();
  #captures = new Map();
  #subscriptions = new Set();
  #lastRead = null;
  #lastObservation = null;
  #closed = false;

  constructor({ store = createSyncExtensionSettingsStore(), deriveRecordId, record, digest = syncTextDigest } = {}) {
    if (["read", "write", "persist", "list", "observe"].some(name => typeof store?.[name] !== "function") ||
        [deriveRecordId, record, digest].some(value => typeof value !== "function")) {
      throw new SyncProtocolError("invalid_adapter");
    }
    this.#store = store;
    this.#options = { deriveRecordId, digest };
    this.#record = record;
  }

  async #id(catalog, addonId) {
    const id = await deriveSyncExtensionSettingsId(catalog, addonId, this.#options.deriveRecordId);
    this.#ensureOpen();
    const previous = this.#descriptors.get(id);
    if (previous && (previous.catalog !== catalog || previous.addonId !== addonId)) {
      throw new SyncProtocolError("invalid_record");
    }
    this.#descriptors.set(id, { catalog, addonId });
    return id;
  }

  async validate(id, value) {
    this.#ensureOpen();
    const result = await validateSyncExtensionSettingsRecord(id, value, this.#options);
    await this.#id(result.catalog, result.addonId);
    return result;
  }

  async #bundle(snapshot) {
    const id = await this.#id(snapshot.catalog, snapshot.addonId);
    let captured = this.#captures.get(id);
    if (!captured || captured.raw !== snapshot.raw) {
      const bundle = await createSyncExtensionSettingsBundle(snapshot.catalog, snapshot.addonId, snapshot.data, this.#options);
      this.#ensureOpen();
      captured = { raw: snapshot.raw, bundle };
      this.#captures.set(id, captured);
    }
    return captured.bundle;
  }

  async #snapshot(snapshot) {
    const { catalog, addonId, native, source, status, reason, raw, data } = snapshot;
    const rawDigest = raw === null ? null : await this.#options.digest(raw);
    this.#ensureOpen();
    return { catalog, addonId, native: structuredClone(native), source, status, reason, rawDigest, data: structuredClone(data) };
  }

  async #unchanged(current, prepared) {
    return !!prepared && current.catalog === prepared.catalog && current.addonId === prepared.addonId &&
      current.status === prepared.status && current.source === prepared.source && current.reason === prepared.reason &&
      sameNativeSyncExtension(current.native, prepared.native) &&
      (current.raw === null ? null : await this.#options.digest(current.raw)) === prepared.rawDigest;
  }

  async listIds() {
    this.#ensureOpen();
    const inventory = await this.#store.list();
    if (!Array.isArray(inventory)) { throw new SyncProtocolError("invalid_adapter_result"); }
    const result = new Set();
    for (const snapshot of inventory) {
      if (!["portable", "cached"].includes(snapshot.status) || (snapshot.status === "cached" && empty(snapshot.data))) { continue; }
      const id = await this.#id(snapshot.catalog, snapshot.addonId);
      const remote = (await this.#record(id))?.remote;
      if (remote?.deleted && empty(snapshot.data)) { continue; }
      const bundle = await this.#bundle(snapshot);
      for (const part of bundle.parts) { result.add(part.id); }
      result.add(id);
    }
    this.#ensureOpen();
    return [...result];
  }

  async countUnsupported() {
    this.#ensureOpen();
    const inventory = await this.#store.list();
    this.#ensureOpen();
    if (!Array.isArray(inventory)) { throw new SyncProtocolError("invalid_adapter_result"); }
    return inventory.filter(snapshot => snapshot.status === "local").length;
  }

  async read(id, hint = null) {
    this.#ensureOpen();
    this.#lastRead = null;
    this.#lastObservation = null;
    if (!MANIFEST.test(id) && !PART.test(id)) { throw new SyncProtocolError("invalid_record"); }
    const saved = hint ?? (await this.#record(id))?.remote?.value ?? null;
    if (saved !== null) { await this.validate(id, saved); }
    if (PART.test(id)) {
      for (const captured of this.#captures.values()) {
        const part = captured.bundle.parts.find(value => value.id === id);
        if (!part) { continue; }
        const { catalog, addonId } = part.value;
        const current = await this.#store.read(catalog, addonId);
        this.#ensureOpen();
        if (["portable", "cached"].includes(current.status) && current.raw === captured.raw) {
          this.#lastRead = current;
          return structuredClone(part.value);
        }
      }
      return saved;
    }
    const descriptor = this.#descriptors.get(id);
    if (!descriptor) { return null; }
    const snapshot = await this.#store.read(descriptor.catalog, descriptor.addonId);
    this.#ensureOpen();
    this.#lastObservation = { id, snapshot: await this.#snapshot(snapshot) };
    if (snapshot.status === "local") { return null; }
    this.#lastRead = snapshot;
    if (snapshot.status === "removed" || (snapshot.status === "cached" && empty(snapshot.data)) ||
        ((await this.#record(id))?.remote?.deleted && empty(snapshot.data))) { return null; }
    return structuredClone((await this.#bundle(snapshot)).manifest.value);
  }

  matchesLocal(id, current, base) {
    this.#ensureOpen();
    if (MANIFEST.test(id)) {
      if (current === null && this.#lastObservation?.id === id && (this.#lastObservation.snapshot.status === "local" ||
          (this.#lastObservation.snapshot.status === "cached" && empty(this.#lastObservation.snapshot.data)))) { return true; }
      return sameManifest(current, base);
    }
    return JSON.stringify(current) === JSON.stringify(base);
  }

  conflictValue(value) {
    this.#ensureOpen();
    const { data: _data, ...native } = this.#lastObservation?.snapshot ?? {};
    return { value, native };
  }

  async flush() {
    this.#ensureOpen();
    const captured = this.#lastRead;
    this.#lastRead = null;
    if (captured && !await this.#store.persist(captured.catalog, captured.addonId, captured)) {
      throw new SyncProtocolError("native_write_failed");
    }
    this.#ensureOpen();
  }

  async canDelete(id, previous) {
    this.#ensureOpen();
    if (!MANIFEST.test(id) || previous === null) { return false; }
    const value = await this.validate(id, previous);
    const current = await this.#store.read(value.catalog, value.addonId);
    this.#ensureOpen();
    return current.status === "removed";
  }

  canResolveConflict(choice, id) {
    return MANIFEST.test(id) && ["local", "remote"].includes(choice);
  }

  async canAdoptRecord(incoming) {
    this.#ensureOpen();
    this.#lastRead = null;
    if (incoming.deleted || incoming.authenticatedSchema !== 2) { return false; }
    const value = await this.validate(incoming.id, incoming.value);
    if (PART.test(incoming.id)) { return true; }
    const snapshot = await this.#store.read(value.catalog, value.addonId);
    if (!["portable", "cached"].includes(snapshot.status) ||
        !sameManifest((await this.#bundle(snapshot)).manifest.value, value)) { return false; }
    const durable = await this.#store.persist(value.catalog, value.addonId, snapshot);
    this.#ensureOpen();
    return durable;
  }

  async prepare(incoming, previous = null, { resolution = null } = {}) {
    this.#ensureOpen();
    this.#lastRead = null;
    const observed = this.#lastObservation;
    if (typeof incoming?.deleted !== "boolean" || (!MANIFEST.test(incoming.id) && !PART.test(incoming.id))) {
      throw new SyncProtocolError("invalid_record");
    }
    const remote = incoming.deleted ? null : await this.validate(incoming.id, incoming.value);
    const unverified = incoming.deleted && incoming.authenticatedSchema !== 2;
    if (PART.test(incoming.id)) {
      return { version: 1, kind: "extension-settings-part", id: incoming.id, deleted: incoming.deleted, unverified };
    }
    const base = previous && !previous.deleted ? await this.validate(incoming.id, previous.value) : null;
    const descriptor = remote ?? base ?? this.#descriptors.get(incoming.id) ?? null;
    const current = descriptor ? await this.#store.read(descriptor.catalog, descriptor.addonId) : null;
    const reviewed = resolution?.choice === "remote";
    const reviewChanged = !!(reviewed && observed?.id === incoming.id && current && !await this.#unchanged(current, observed.snapshot));
    this.#ensureOpen();
    return { version: 1, kind: "extension-settings-manifest", id: incoming.id, remote, base, unverified, reviewed, reviewChanged,
      descriptor: descriptor ? { catalog: descriptor.catalog, addonId: descriptor.addonId } : null,
      current: current ? await this.#snapshot(current) : null };
  }

  async #assemble(id, value) {
    if (value === null) { return { complete: true, data: null }; }
    const data = await assembleSyncExtensionSettings({ id, value }, async partId => {
      const entry = await this.#record(partId);
      return entry?.remote?.deleted ? null : entry?.remote?.value ?? null;
    }, this.#options);
    this.#ensureOpen();
    return { complete: data !== null, data };
  }

  async applyPrepared(plan) {
    this.#ensureOpen();
    this.#lastRead = null;
    if (plan?.version !== 1 || typeof plan.unverified !== "boolean") { throw new SyncProtocolError("invalid_application"); }
    if (plan.unverified) { return { status: "conflict", reason: "unverified_deletion" }; }
    if (plan.kind === "extension-settings-part") {
      if (!PART.test(plan.id) || typeof plan.deleted !== "boolean") { throw new SyncProtocolError("invalid_application"); }
      return { status: "applied" };
    }
    if (plan.kind !== "extension-settings-manifest" || !MANIFEST.test(plan.id) ||
        typeof plan.reviewed !== "boolean" || typeof plan.reviewChanged !== "boolean") {
      throw new SyncProtocolError("invalid_application");
    }
    if (plan.reviewChanged) { return { status: "conflict", reason: "extension_settings_local_changed" }; }
    if (!plan.descriptor) {
      if (plan.remote !== null || plan.base !== null || plan.current !== null) { throw new SyncProtocolError("invalid_application"); }
      return { status: "applied" };
    }
    const { catalog, addonId } = plan.descriptor;
    if (await this.#id(catalog, addonId) !== plan.id || !plan.current ||
        plan.current.catalog !== catalog || plan.current.addonId !== addonId) { throw new SyncProtocolError("invalid_application"); }
    if (plan.remote !== null) { await this.validate(plan.id, plan.remote); }
    if (plan.base !== null) { await this.validate(plan.id, plan.base); }
    const current = await this.#store.read(catalog, addonId);
    this.#ensureOpen();
    if (current.status === "local") { return { status: "deferred", reason: current.reason }; }
    const remote = await this.#assemble(plan.id, plan.remote);
    if (!remote.complete) { return { status: "deferred", reason: "extension_settings_parts_missing" }; }
    let desired = remote.data;
    const original = plan.current.data;
    if (desired !== null && current.status === "removed") { return { status: "deferred", reason: "extension_settings_uninstalled" }; }
    if (!plan.reviewed && !equal(original, desired)) {
      if (sameManifest(plan.remote, plan.base)) { return { status: "applied" }; }
      const base = await this.#assemble(plan.id, plan.base);
      if (!base.complete) { return { status: "deferred", reason: "extension_settings_base_missing" }; }
      if (equal(original, base.data) || (base.data === null && empty(original)) ||
          (plan.current.status === "cached" && empty(original))) {
        desired = remote.data;
      } else if (original !== null && base.data !== null && remote.data !== null) {
        const merged = mergeSyncExtensionSettings(base.data, original, remote.data);
        if (merged.status !== "merged") { return merged; }
        desired = merged.data;
      } else {
        return { status: "conflict", reason: "extension_settings_changed" };
      }
    }
    const converged = equal(current.data, desired) || (desired === null && empty(current.data));
    if (converged) {
      if (!await this.#store.persist(catalog, addonId, current)) {
        return { status: "deferred", reason: "extension_settings_local_changed" };
      }
      this.#ensureOpen();
      return { status: "applied" };
    }
    if (!await this.#unchanged(current, plan.current)) {
      this.#ensureOpen();
      return { status: plan.reviewed ? "conflict" : "deferred", reason: "extension_settings_local_changed" };
    }
    this.#ensureOpen();
    const result = await this.#store.write({ catalog, addonId, desired, expected: current });
    this.#ensureOpen();
    if (!["applied", "deferred", "conflict"].includes(result?.status)) { throw new SyncProtocolError("invalid_adapter_result"); }
    return plan.reviewed && result.status === "deferred" && result.reason === "extension_settings_local_changed" ?
      { status: "conflict", reason: result.reason } : result;
  }

  async apply(incoming, previous = null) {
    return this.applyPrepared(await this.prepare(incoming, previous));
  }

  observe(listener) {
    this.#ensureOpen();
    if (typeof listener !== "function") { throw new SyncProtocolError("invalid_capture_query"); }
    const stop = this.#store.observe(() => { if (!this.#closed) { listener({ rescan: true }); } });
    const unsubscribe = () => { if (this.#subscriptions.delete(unsubscribe)) { stop(); } };
    this.#subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  close() {
    if (this.#closed) { return; }
    this.#closed = true;
    for (const unsubscribe of [...this.#subscriptions]) { unsubscribe(); }
    this.#captures.clear();
    this.#descriptors.clear();
    this.#lastRead = null;
    this.#lastObservation = null;
  }

  #ensureOpen() {
    if (this.#closed) { throw new SyncProtocolError("cancelled"); }
  }
}
