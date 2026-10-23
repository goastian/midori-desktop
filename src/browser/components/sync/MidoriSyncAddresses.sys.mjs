/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError, validSyncRecordId } from "./MidoriSyncProtocol.sys.mjs";

const TOPIC = "formautofill-storage-changed";
const FIELDS = ["name", "organization", "street-address", "address-level3",
  "address-level2", "address-level1", "postal-code", "country", "tel", "email"];
const METADATA = ["timeCreated", "timeLastModified", "timeLastUsed", "timesUsed"];
const KEYS = ["version", "nativeVersion", "fields", ...METADATA];
const encoder = new TextEncoder();

function validAddressId(value) {
  return validSyncRecordId(value) && /^[A-Za-z0-9_-]{12}$/.test(value);
}

function sameFields(left, right) {
  return FIELDS.every(field => left.fields[field] === right.fields[field]);
}

function equal(left, right) {
  return left === null || right === null ? left === right :
    sameFields(left, right) && METADATA.every(field => left[field] === right[field]);
}

function mergeMetadata(left, right, fields = left.fields) {
  return { version: 1, nativeVersion: 1, fields,
    timeCreated: Math.min(left.timeCreated, right.timeCreated),
    timeLastModified: Math.max(left.timeLastModified, right.timeLastModified),
    timeLastUsed: Math.max(left.timeLastUsed, right.timeLastUsed),
    timesUsed: Math.max(left.timesUsed, right.timesUsed) };
}

/** Synchronizes personal address profiles through native Form Autofill storage. */
export class MidoriSyncAddresses {
  #storage;
  #observers;
  #subscriptions = new Set();
  #applying = new Set();
  #closed = false;

  constructor({ storage = null, observers = Services.obs } = {}) {
    this.#storage = storage ?? ChromeUtils.importESModule(
      "resource://autofill/FormAutofillStorage.sys.mjs").formAutofillStorage;
    this.#observers = observers;
  }

  observe(listener) {
    this.#ensureOpen();
    if (typeof listener !== "function") {
      throw new SyncProtocolError("invalid_capture_query");
    }
    const callback = (subject, _topic, action) => {
      const event = subject?.wrappedJSObject;
      if (this.#closed || event?.collectionName !== "addresses" || event.sourceSync === true) {
        return;
      }
      if (action === "migrate" || !validAddressId(event.guid)) {
        listener({ rescan: true });
      } else if (!this.#applying.has(event.guid)) {
        listener({ id: event.guid });
        if (validAddressId(event.forkedGUID)) {
          listener({ id: event.forkedGUID });
        }
      }
    };
    this.#observers.addObserver(callback, TOPIC);
    const unsubscribe = () => {
      if (this.#subscriptions.delete(unsubscribe)) {
        this.#observers.removeObserver(callback, TOPIC);
      }
    };
    this.#subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  async flush() {
    this.#ensureOpen();
    await this.#storage.flush();
    this.#ensureOpen();
  }

  matchesLocal(_id, current, base) {
    return equal(current, base);
  }

  async canDelete(id, base, { record }) {
    await this.validate(id, base);
    let mirror = await record(id);
    let previousId = id;
    while (mirror?.replacementId) {
      const candidateId = mirror.replacementId;
      if (!validAddressId(candidateId) || candidateId >= previousId) {
        throw new SyncProtocolError("address_identity_conflict");
      }
      const current = await this.read(candidateId);
      mirror = await record(candidateId);
      this.#ensureOpen();
      if (current) {
        return Boolean(mirror?.remote && !mirror.remote.deleted && !mirror.pending && !mirror.applying &&
          !mirror.blocked && this.matchesLocal(candidateId, current, mirror.remote.value));
      }
      previousId = candidateId;
    }
    return true;
  }

  async validate(id, value) {
    this.#ensureOpen();
    if (!validAddressId(id) || !value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).length !== KEYS.length || Object.keys(value).some(key => !KEYS.includes(key)) ||
        value.version !== 1 || value.nativeVersion !== 1 || !value.fields ||
        typeof value.fields !== "object" || Array.isArray(value.fields) ||
        Object.keys(value.fields).some(field => !FIELDS.includes(field)) ||
        METADATA.some(field => !Number.isSafeInteger(value[field]) || value[field] < 0)) {
      throw new SyncProtocolError("invalid_record");
    }
    const fields = {};
    for (const field of FIELDS) {
      if (!Object.hasOwn(value.fields, field)) {
        continue;
      }
      const entry = value.fields[field];
      if (typeof entry !== "string" || entry.length > 8192 || entry.includes("\0") ||
          (field === "country" && entry !== "" && !/^[A-Z]{2}$/.test(entry))) {
        throw new SyncProtocolError("invalid_record");
      }
      if (entry !== "") {
        fields[field] = entry;
      }
    }
    if (!Object.keys(fields).some(field => field !== "country")) {
      throw new SyncProtocolError("invalid_record");
    }
    const canonical = { version: 1, nativeVersion: 1, fields };
    for (const field of METADATA) {
      canonical[field] = value[field];
    }
    const bytes = encoder.encode(JSON.stringify(canonical));
    try {
      if (bytes.length > 131072) {
        throw new SyncProtocolError("record_too_large");
      }
    } finally {
      bytes.fill(0);
    }
    return canonical;
  }

  async read(id) {
    this.#ensureOpen();
    if (!validAddressId(id)) {
      throw new SyncProtocolError("invalid_record");
    }
    await this.#storage.initialize();
    this.#ensureOpen();
    const record = await this.#storage.addresses.get(id, { rawData: true });
    this.#ensureOpen();
    return record && !record.deleted ? this.#describe(id, record) : null;
  }

  async listIds() {
    this.#ensureOpen();
    await this.#storage.initialize();
    const records = await this.#storage.addresses.getAll({ rawData: true });
    this.#ensureOpen();
    if (records.some(record => !record.deleted && !validAddressId(record.guid))) {
      throw new SyncProtocolError("address_identity_conflict");
    }
    return records.filter(record => !record.deleted).map(record => record.guid).sort();
  }

  async plan(incoming, previous = null) {
    this.#ensureOpen();
    incoming = structuredClone(incoming);
    previous = structuredClone(previous);
    if (!validAddressId(incoming?.id) || typeof incoming.deleted !== "boolean" ||
        (previous !== null && (typeof previous.deleted !== "boolean" ||
          (previous.id !== undefined && previous.id !== incoming.id)))) {
      throw new SyncProtocolError("invalid_record");
    }
    const remote = incoming.deleted ? null : await this.validate(incoming.id, incoming.value);
    const base = previous === null || previous.deleted ? null : await this.validate(incoming.id, previous.value);
    const current = await this.read(incoming.id);
    if (equal(current, remote)) {
      return { current, decision: { status: "keep_local" } };
    }
    if (equal(current, base)) {
      return { current, decision: { status: "apply", value: remote } };
    }
    if (equal(remote, base)) {
      return { current, decision: { status: "keep_local" } };
    }
    if (!current || !remote) {
      return { current, decision: { status: "conflict", reason: "deletion_edit" } };
    }
    const fields = {};
    for (const field of FIELDS) {
      const localValue = current.fields[field];
      const remoteValue = remote.fields[field];
      let chosen;
      if (localValue === remoteValue || (base && remoteValue === base.fields[field])) {
        chosen = localValue;
      } else if (base && localValue === base.fields[field]) {
        chosen = remoteValue;
      } else {
        return { current, decision: { status: "conflict", reason: "address_fields_diverged" } };
      }
      if (chosen !== undefined) {
        fields[field] = chosen;
      }
    }
    const merged = await this.validate(incoming.id, mergeMetadata(current, remote, fields));
    return { current, decision: equal(current, merged) ? { status: "keep_local" } :
      { status: "apply", value: merged } };
  }

  async prepare(incoming, previous = null) {
    this.#ensureOpen();
    const { current, decision } = await this.plan(incoming, previous);
    let duplicate = null;
    if (!current && decision.status === "apply" && decision.value) {
      const existing = await this.#storage.addresses.getAll({ rawData: true });
      this.#ensureOpen();
      for (const record of existing.sort((left, right) => left.guid < right.guid ? -1 : 1)) {
        if (record.guid !== incoming.id && !record.deleted) {
          const value = await this.#describe(record.guid, record);
          if (sameFields(value, decision.value)) {
            duplicate = { id: record.guid, value };
            decision.value = mergeMetadata(value, decision.value);
            break;
          }
        }
      }
    }
    return { version: 1, id: incoming.id, current, decision, duplicate };
  }

  async apply(incoming, previous = null) {
    return this.applyPrepared(await this.prepare(incoming, previous));
  }

  async applyPrepared(plan) {
    this.#ensureOpen();
    plan = structuredClone(plan);
    if (plan?.version !== 1 || !validAddressId(plan.id) || !plan.decision ||
        !["apply", "keep_local", "conflict"].includes(plan.decision.status)) {
      throw new SyncProtocolError("invalid_record");
    }
    const { id, current, decision, duplicate } = plan;
    if (current !== null) {
      await this.validate(id, current);
    }
    if (decision.status === "conflict") {
      return decision;
    }
    if (decision.status === "keep_local") {
      return { status: "applied" };
    }
    if (decision.value !== null) {
      decision.value = await this.validate(id, decision.value);
    }
    if (duplicate !== null) {
      if (!validAddressId(duplicate?.id) || duplicate.id === id || current !== null || !decision.value) {
        throw new SyncProtocolError("invalid_record");
      }
      duplicate.value = await this.validate(duplicate.id, duplicate.value);
      if (!sameFields(duplicate.value, decision.value)) {
        throw new SyncProtocolError("invalid_record");
      }
      return this.#applyDuplicate(plan);
    }
    const latest = await this.read(id);
    if (equal(latest, decision.value)) {
      return { status: "applied" };
    }
    if (!equal(latest, current)) {
      return { status: "conflict", reason: latest === null || current === null ?
        "deletion_edit" : "address_fields_diverged" };
    }
    return this.#write(id, decision.value, current);
  }

  async #applyDuplicate({ id, decision, duplicate }) {
    const canonicalId = id < duplicate.id ? id : duplicate.id;
    const otherId = canonicalId === id ? duplicate.id : id;
    let current = await this.read(id);
    let existing = await this.read(duplicate.id);
    if (current !== null && !equal(current, decision.value)) {
      return { status: "conflict", reason: "address_fields_diverged" };
    }
    if (existing !== null && !equal(existing, duplicate.value) &&
        !(canonicalId === duplicate.id && equal(existing, decision.value))) {
      return { status: "conflict", reason: "address_duplicate_changed" };
    }
    if (existing === null && (canonicalId !== id || !equal(current, decision.value))) {
      return { status: "conflict", reason: "deletion_edit" };
    }
    if (canonicalId === duplicate.id && current !== null) {
      return { status: "conflict", reason: "address_duplicate_changed" };
    }
    const canonical = canonicalId === id ? current : existing;
    if (!equal(canonical, decision.value)) {
      const written = await this.#write(canonicalId, decision.value, canonical);
      if (written.status !== "applied") {
        return written;
      }
    }
    if (canonicalId === id) {
      existing = await this.read(duplicate.id);
      if (existing !== null) {
        if (!equal(existing, duplicate.value)) {
          return { status: "conflict", reason: "address_duplicate_changed" };
        }
        const removed = await this.#write(duplicate.id, null, existing);
        if (removed.status !== "applied") {
          return removed;
        }
      }
    }
    if (!equal(await this.read(canonicalId), decision.value) || await this.read(otherId) !== null) {
      return { status: "deferred", reason: "address_changed" };
    }
    this.#observers.notifyObservers({ wrappedJSObject: { collectionName: "addresses", guid: null,
      sourceSync: false } }, TOPIC, "migrate");
    return { status: "applied", replacement: { id: otherId, replacementId: canonicalId } };
  }

  async #write(id, value, current) {
    const addresses = this.#storage.addresses;
    if (!equal(await this.read(id), current) || addresses !== this.#storage.addresses) {
      return { status: "deferred", reason: "address_changed" };
    }
    this.#applying.add(id);
    try {
      if (value === null) {
        await addresses.remove(id, { sourceSync: false });
      } else {
        const entry = { ...value.fields, guid: id, version: value.nativeVersion,
          _sync: { changeCounter: 0, lastSyncedFields: {} } };
        for (const field of METADATA) {
          entry[field] = value[field];
        }
        const method = current ? "updateManyWithMeta" : "addManyWithMeta";
        if (typeof addresses[method] !== "function") {
          throw new SyncProtocolError("addresses_storage_unsupported");
        }
        const results = await addresses[method]([entry]);
        this.#ensureOpen();
        if (results?.length !== 1 || results[0]?.guid !== id || results[0]?.error) {
          throw new SyncProtocolError("address_apply_failed");
        }
        if (typeof addresses.notifySyncApplied === "function") {
          await addresses.notifySyncApplied();
        } else {
          this.#observers.notifyObservers({ wrappedJSObject: { sourceSync: true,
            guid: id, collectionName: "addresses" } }, TOPIC, current ? "update" : "add");
        }
      }
      this.#ensureOpen();
      return equal(await this.read(id), value) ? { status: "applied" } :
        { status: "deferred", reason: "address_changed" };
    } finally {
      this.#applying.delete(id);
    }
  }

  #describe(id, record) {
    if (record.version !== 1) {
      throw new SyncProtocolError("addresses_schema_unsupported");
    }
    const value = { version: 1, nativeVersion: record.version, fields: {} };
    for (const field of FIELDS) {
      if (Object.hasOwn(record, field)) {
        value.fields[field] = record[field];
      }
    }
    for (const field of METADATA) {
      value[field] = record[field] ?? 0;
    }
    return this.validate(id, value);
  }

  close() {
    this.#closed = true;
    for (const unsubscribe of this.#subscriptions) {
      unsubscribe();
    }
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncProtocolError("cancelled");
    }
  }
}
