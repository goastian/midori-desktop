/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";
import {
  createSyncTextBundle, assembleSyncTextBundle, validateSyncTextManifest, validateSyncTextPart, syncTextDigest,
} from "./MidoriSyncTextBundle.sys.mjs";

export const SYNC_FILTERS_ID = "custom-filters";
const TYPE = "custom-filters";
const PART_ID = /^t1:[0-9a-f]{64}$/;
const encoder = new TextEncoder();
const sameManifest = (left, right) => left === null || right === null ? left === right :
  left.digest === right.digest && left.byte_count === right.byte_count;
const sameState = (left, right) => left.present === right.present && left.digest === right.digest;

export class MidoriSyncPrivacyFilters {
  #producer;
  #deriveRecordId;
  #record;
  #digest;
  #normalize;
  #capture = null;
  #listeners = new Set();
  #subscriptions = new Set();
  #closed = false;

  constructor({ producer, deriveRecordId, record, digest = syncTextDigest, normalize } = {}) {
    if (!producer || ["readCustomFiltersSnapshot", "updateCustomFiltersText", "observeCustomFilters"]
      .some(method => typeof producer[method] !== "function") ||
        typeof deriveRecordId !== "function" || typeof record !== "function" ||
        typeof digest !== "function" || typeof normalize !== "function") {
      throw new SyncProtocolError("invalid_adapter");
    }
    this.#producer = producer;
    this.#deriveRecordId = deriveRecordId;
    this.#record = record;
    this.#digest = digest;
    this.#normalize = normalize;
  }

  async #partId(digest) {
    const bytes = encoder.encode(JSON.stringify([1, "text-part", TYPE, digest]));
    try {
      const id = `t1:${await this.#deriveRecordId("midori-privacy", bytes)}`;
      this.#ensureOpen();
      if (!PART_ID.test(id)) {
        throw new SyncProtocolError("invalid_record");
      }
      return id;
    } finally {
      bytes.fill(0);
    }
  }

  async validate(id, value) {
    this.#ensureOpen();
    if (id === SYNC_FILTERS_ID) {
      validateSyncTextManifest(TYPE, value);
      for (const part of value.parts) {
        if (await this.#partId(part.digest) !== part.id) {
          throw new SyncProtocolError("invalid_record");
        }
      }
      return { version: 1, type: TYPE, kind: "text-manifest", digest: value.digest,
        byte_count: value.byte_count, parts: value.parts.map(part => ({ id: part.id,
          digest: part.digest, byte_count: part.byte_count })) };
    }
    if (!PART_ID.test(id)) {
      throw new SyncProtocolError("invalid_record");
    }
    const part = await validateSyncTextPart(TYPE, value, this.#digest);
    if (id !== await this.#partId(part.digest)) {
      throw new SyncProtocolError("invalid_record");
    }
    return part;
  }

  async #bundle(snapshot) {
    if (!snapshot.present) {
      return null;
    }
    if (this.#capture?.text !== snapshot.text) {
      const bundle = await this.#createBundle(snapshot.text);
      this.#ensureOpen();
      this.#capture = { text: snapshot.text, bundle };
    }
    return this.#capture.bundle;
  }

  #createBundle(text) {
    return createSyncTextBundle(TYPE, text, {
      digest: this.#digest, entryId: (_type, digest) => this.#partId(digest),
    });
  }

  async listIds() {
    this.#ensureOpen();
    const bundle = await this.#bundle(await this.#producer.readCustomFiltersSnapshot());
    return bundle ? [...bundle.parts.map(part => part.id), SYNC_FILTERS_ID] : [];
  }

  async read(id, hint = null) {
    this.#ensureOpen();
    if (id === SYNC_FILTERS_ID) {
      const snapshot = await this.#producer.readCustomFiltersSnapshot();
      this.#ensureOpen();
      if (!snapshot.present || (snapshot.text === "" && (await this.#record(id))?.remote?.deleted)) {
        return null;
      }
      return structuredClone((await this.#bundle(snapshot)).manifest);
    }
    if (!PART_ID.test(id)) {
      throw new SyncProtocolError("invalid_record");
    }
    const captured = this.#capture?.bundle.parts.find(part => part.id === id);
    if (captured) {
      return structuredClone(captured.value);
    }
    const saved = hint ?? (await this.#record(id))?.remote?.value ?? null;
    return saved === null ? null : this.validate(id, saved);
  }

  matchesLocal(id, current, base) {
    return id === SYNC_FILTERS_ID ? sameManifest(current, base) : JSON.stringify(current) === JSON.stringify(base);
  }

  canDelete() {
    return false;
  }

  canResolveConflict(choice, id) {
    return id === SYNC_FILTERS_ID && ["local", "remote"].includes(choice);
  }

  async canAdoptRecord(incoming) {
    this.#ensureOpen();
    if (incoming.deleted || incoming.authenticatedSchema !== 2) {
      return false;
    }
    const value = await this.validate(incoming.id, incoming.value);
    if (PART_ID.test(incoming.id)) {
      return true;
    }
    return JSON.stringify(await this.read(incoming.id)) === JSON.stringify(value);
  }

  observe(listener) {
    this.#ensureOpen();
    if (typeof listener !== "function") {
      throw new SyncProtocolError("invalid_capture_query");
    }
    const changed = () => {
      if (!this.#closed) {
        this.#capture = null;
        listener({ rescan: true });
      }
    };
    const stop = this.#producer.observeCustomFilters(changed);
    this.#listeners.add(changed);
    const unsubscribe = () => {
      if (this.#subscriptions.delete(unsubscribe)) {
        this.#listeners.delete(changed);
        stop();
      }
    };
    this.#subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  async prepare(incoming, previous = null, { resolution = null } = {}) {
    this.#ensureOpen();
    if (typeof incoming?.deleted !== "boolean") {
      throw new SyncProtocolError("invalid_record");
    }
    const remote = incoming.deleted ? null : await this.validate(incoming.id, incoming.value);
    if (incoming.id !== SYNC_FILTERS_ID) {
      if (!PART_ID.test(incoming.id)) {
        throw new SyncProtocolError("invalid_record");
      }
      return { version: 1, id: incoming.id, kind: "part", deleted: incoming.deleted,
        unverified: incoming.deleted && incoming.authenticatedSchema !== 2 };
    }
    const snapshot = await this.#producer.readCustomFiltersSnapshot();
    const current = { present: snapshot.present, digest: await this.#digest(snapshot.text) };
    const base = previous && !previous.deleted ? await this.validate(SYNC_FILTERS_ID, previous.value) : null;
    let decision;
    if (incoming.deleted && incoming.authenticatedSchema !== 2) {
      decision = { status: "conflict", reason: "unverified_deletion" };
    } else if (remote !== null && snapshot.present && current.digest === remote.digest) {
      decision = JSON.stringify((await this.#bundle(snapshot)).manifest) === JSON.stringify(remote)
        ? { status: "keep_local" } : { status: "conflict", reason: "privacy_filters_invalid" };
    } else if (sameManifest(remote, base)) {
      decision = { status: "keep_local" };
    } else if (resolution?.choice !== "remote" && snapshot.present &&
        current.digest !== remote?.digest && current.digest !== base?.digest && !(remote === null && snapshot.text === "")) {
      decision = { status: "conflict", reason: "privacy_filters_changed" };
    } else {
      decision = { status: "apply" };
    }
    this.#ensureOpen();
    return { version: 1, id: SYNC_FILTERS_ID, kind: "manifest", current, desired: remote, decision };
  }

  async applyPrepared(plan) {
    this.#ensureOpen();
    if (plan?.version !== 1 || (plan.kind === "part" ? !PART_ID.test(plan.id) :
      plan.kind !== "manifest" || plan.id !== SYNC_FILTERS_ID)) {
      throw new SyncProtocolError("invalid_application");
    }
    if (plan.kind === "part") {
      if (typeof plan.deleted !== "boolean" || typeof plan.unverified !== "boolean") {
        throw new SyncProtocolError("invalid_application");
      }
      if (plan.unverified) {
        return { status: "conflict", reason: "unverified_deletion" };
      }
      if (plan.deleted) {
        for (const listener of this.#listeners) {
          listener();
        }
      }
      return { status: "applied" };
    }
    if (plan.decision?.status === "conflict") {
      return plan.decision;
    }
    if (plan.decision?.status === "keep_local") {
      return { status: "applied" };
    }
    if (plan.decision?.status !== "apply" || typeof plan.current?.present !== "boolean" ||
        !/^[0-9a-f]{64}$/.test(plan.current.digest)) {
      throw new SyncProtocolError("invalid_application");
    }
    let text = "";
    if (plan.desired !== null) {
      const manifest = await this.validate(SYNC_FILTERS_ID, plan.desired);
      text = await assembleSyncTextBundle(TYPE, manifest, async id => {
        const entry = await this.#record(id);
        return entry?.remote?.deleted ? null : entry?.remote?.value ?? null;
      }, this.#digest);
      if (text === null) {
        return { status: "deferred", reason: "privacy_parts_missing" };
      }
      try {
        if (this.#normalize(text) !== text) {
          return { status: "conflict", reason: "privacy_filters_invalid" };
        }
      } catch {
        return { status: "conflict", reason: "privacy_filters_invalid" };
      }
      if (JSON.stringify((await this.#createBundle(text)).manifest) !== JSON.stringify(manifest)) {
        return { status: "conflict", reason: "privacy_filters_invalid" };
      }
    }
    const desiredDigest = await this.#digest(text);
    let outcome = { status: "deferred", reason: "privacy_filters_local_changed" };
    await this.#producer.updateCustomFiltersText(async current => {
      this.#ensureOpen();
      const digest = await this.#digest(current.text);
      this.#ensureOpen();
      if (digest === desiredDigest && (plan.desired === null || current.present)) {
        outcome = { status: "applied" };
        return null;
      }
      if (!sameState({ present: current.present, digest }, plan.current)) {
        return null;
      }
      outcome = { status: "applied" };
      return text;
    });
    this.#ensureOpen();
    if (outcome.status === "applied") {
      this.#capture = null;
    }
    return outcome;
  }

  async apply(incoming, previous = null) {
    return this.applyPrepared(await this.prepare(incoming, previous));
  }

  close() {
    for (const unsubscribe of [...this.#subscriptions]) {
      unsubscribe();
    }
    this.#closed = true;
    this.#capture = null;
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncProtocolError("cancelled");
    }
  }
}
