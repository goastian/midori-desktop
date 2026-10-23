/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError, validSyncRecordId } from "./MidoriSyncProtocol.sys.mjs";

const TOPIC = "formautofill-storage-changed";
const FIELDS = ["name", "number", "month", "year"];
const MAX_NAME_LENGTH = 512;

function validCardId(value) {
  return validSyncRecordId(value) && /^[A-Za-z0-9_-]{12}$/.test(value);
}

function equal(left, right) {
  return left === null || right === null ? left === right : FIELDS.every(field => left[field] === right[field]);
}

function choose(base, local, remote, field) {
  if (local[field] === remote[field]) {
    return { value: local[field] };
  }
  if (base && local[field] === base[field]) {
    return { value: remote[field] };
  }
  if (base && remote[field] === base[field]) {
    return { value: local[field] };
  }
  return { conflict: true };
}

/** Synchronizes payment cards through native encrypted Form Autofill storage. */
export class MidoriSyncCreditCards {
  #storage;
  #subscriptions = new Set();
  #applying = new Set();
  #closed = false;

  constructor({ storage = null } = {}) {
    this.#storage = storage ?? ChromeUtils.importESModule("resource://autofill/FormAutofillStorage.sys.mjs").formAutofillStorage;
  }

  observe(listener) {
    this.#ensureOpen();
    const callback = (subject, _topic, action) => {
      if (this.#closed) {
        return;
      }
      const event = subject?.wrappedJSObject;
      if (event?.collectionName !== "creditCards" || event.sourceSync === true || action === "notifyUsed") {
        return;
      }
      if (action === "migrate" || !validCardId(event.guid)) {
        listener({ rescan: true });
      } else if (!this.#applying.has(event.guid)) {
        listener({ id: event.guid });
        if (validCardId(event.forkedGUID)) {
          listener({ id: event.forkedGUID });
        }
      }
    };
    Services.obs.addObserver(callback, TOPIC);
    const unsubscribe = () => {
      if (this.#subscriptions.delete(unsubscribe)) {
        Services.obs.removeObserver(callback, TOPIC);
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
      if (!validCardId(candidateId) || candidateId >= previousId) {
        throw new SyncProtocolError("card_identity_conflict");
      }
      const current = await this.read(candidateId);
      mirror = await record(candidateId);
      this.#ensureOpen();
      if (current) {
        return Boolean(mirror?.remote && !mirror.remote.deleted && !mirror.pending && !mirror.applying &&
          !mirror.blocked && equal(current, mirror.remote.value));
      }
      previousId = candidateId;
    }
    return true;
  }

  async validate(id, value) {
    this.#ensureOpen();
    if (!validCardId(id) || !value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).length !== 5 || Object.keys(value).some(key => !["version", ...FIELDS].includes(key)) ||
        value.version !== 1 || typeof value.name !== "string" || value.name.length > MAX_NAME_LENGTH ||
        typeof value.number !== "string" || !/^[0-9]{12,19}$/.test(value.number) ||
        (value.month !== null && (!Number.isInteger(value.month) || value.month < 1 || value.month > 12)) ||
        (value.year !== null && (!Number.isInteger(value.year) || value.year < 1900 || value.year > 9999))) {
      throw new SyncProtocolError("invalid_record");
    }
    return { version: 1, name: value.name, number: value.number, month: value.month, year: value.year };
  }

  async read(id) {
    this.#ensureOpen();
    if (!validCardId(id)) {
      throw new SyncProtocolError("invalid_record");
    }
    await this.#storage.initialize();
    this.#ensureOpen();
    let card;
    try {
      const cards = this.#storage.creditCards;
      card = await cards.get(id, { rawData: true });
      if (card && typeof cards._recordForMigrationExport === "function") {
        card = await cards._recordForMigrationExport(card);
      }
    } catch {
      throw new SyncProtocolError("cards_locked");
    }
    this.#ensureOpen();
    if (!card) {
      return null;
    }
    const number = typeof card["cc-number"] === "string" ? card["cc-number"].replace(/[ -]/g, "") : "";
    if (/[*•]/u.test(number)) {
      throw new SyncProtocolError("cards_locked");
    }
    return this.validate(id, {
      version: 1, name: card["cc-name"] ?? "", number,
      month: card["cc-exp-month"] ?? null, year: card["cc-exp-year"] ?? null,
    });
  }

  async listIds() {
    this.#ensureOpen();
    await this.#storage.initialize();
    const cards = await this.#storage.creditCards.getAll();
    this.#ensureOpen();
    return cards.map(card => card.guid).filter(validCardId).sort();
  }

  async plan(incoming, previous = null) {
    this.#ensureOpen();
    incoming = structuredClone(incoming);
    previous = structuredClone(previous);
    if (!validCardId(incoming?.id) || typeof incoming.deleted !== "boolean" ||
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
    const merged = { version: 1 };
    for (const field of FIELDS) {
      const choice = choose(base, current, remote, field);
      if (choice.conflict) {
        return { current, decision: { status: "conflict", reason: field === "number" ?
          "card_number_diverged" : "card_metadata_diverged" } };
      }
      merged[field] = choice.value;
    }
    await this.validate(incoming.id, merged);
    return { current, decision: equal(current, merged) ? { status: "keep_local" } :
      { status: "apply", value: merged } };
  }

  async prepare(incoming, previous = null, { record } = {}) {
    this.#ensureOpen();
    const { current, decision } = await this.plan(incoming, previous);
    let duplicate = null;
    let similar = false;
    let published = false;
    let canonicalId = incoming.id;
    if (current === null && decision.status === "apply" && decision.value) {
      const cards = (await this.#storage.creditCards.getAll()).filter(card => validCardId(card.guid))
        .sort((left, right) => left.guid < right.guid ? -1 : 1);
      for (const card of cards) {
        if (card.guid === incoming.id) {
          continue;
        }
        const value = await this.read(card.guid);
        if (value?.number !== decision.value.number) {
          continue;
        }
        if (equal(value, decision.value)) {
          duplicate = { id: card.guid, value };
          break;
        }
        similar = true;
      }
      if (!duplicate && similar) {
        return { version: 1, id: incoming.id, current, decision: { status: "conflict", reason: "card_duplicate" } };
      }
      if (duplicate) {
        const mirror = await record?.(duplicate.id);
        this.#ensureOpen();
        published = Boolean(mirror?.pending || mirror?.localChange || (mirror?.remote && !mirror.remote.deleted));
        if (published && duplicate.id < incoming.id) {
          canonicalId = duplicate.id;
        }
      }
    }
    return { version: 1, id: incoming.id, current, decision, duplicate, canonicalId, published };
  }

  async apply(incoming, previous = null) {
    return this.applyPrepared(await this.prepare(incoming, previous));
  }

  async applyPrepared(plan) {
    this.#ensureOpen();
    plan = structuredClone(plan);
    if (plan?.version !== 1 || !validCardId(plan.id) || !plan.decision ||
        !["apply", "keep_local", "conflict"].includes(plan.decision.status)) {
      throw new SyncProtocolError("invalid_record");
    }
    const { id, current, decision, duplicate } = plan;
    if (decision.status === "conflict") {
      return decision;
    }
    if (decision.status === "keep_local") {
      return { status: "applied" };
    }
    if (current !== null) {
      await this.validate(id, current);
    }
    if (decision.value !== null) {
      decision.value = await this.validate(id, decision.value);
    }
    if (duplicate !== null) {
      return this.#applyDuplicate(plan);
    }
    return this.#write(id, decision.value, current);
  }

  async #applyDuplicate({ id, current, decision, duplicate, canonicalId, published }) {
    if (current !== null || !decision.value || !validCardId(duplicate?.id) || duplicate.id === id ||
        typeof published !== "boolean" || ![id, duplicate.id].includes(canonicalId) ||
        (!published && canonicalId !== id) || (published && canonicalId !== (id < duplicate.id ? id : duplicate.id))) {
      throw new SyncProtocolError("invalid_record");
    }
    duplicate.value = await this.validate(duplicate.id, duplicate.value);
    if (!equal(duplicate.value, decision.value)) {
      throw new SyncProtocolError("invalid_record");
    }
    const incoming = await this.read(id);
    const existing = await this.read(duplicate.id);
    if ((incoming !== null && (canonicalId !== id || !equal(incoming, decision.value))) ||
        (existing !== null && !equal(existing, duplicate.value)) ||
        (existing === null && (canonicalId !== id || !equal(incoming, decision.value)))) {
      return { status: "conflict", reason: "card_duplicate_changed" };
    }
    if (canonicalId === id && incoming === null) {
      const result = await this.#write(id, decision.value, null);
      if (result.status !== "applied") {
        return result;
      }
    }
    const otherId = canonicalId === id ? duplicate.id : id;
    if (canonicalId === id && existing !== null) {
      const result = await this.#write(duplicate.id, null, duplicate.value);
      if (result.status !== "applied") {
        return result;
      }
    }
    if (!equal(await this.read(canonicalId), decision.value) || await this.read(otherId) !== null) {
      return { status: "deferred", reason: "card_changed" };
    }
    return published ? { status: "applied", replacement: { id: otherId, replacementId: canonicalId } } : { status: "applied" };
  }

  async #write(id, value, current) {
    const cards = this.#storage.creditCards;
    const observed = await this.read(id);
    if (cards !== this.#storage.creditCards) {
      return { status: "deferred", reason: "card_changed" };
    }
    if (equal(observed, value)) {
      return { status: "applied" };
    }
    if (!equal(observed, current)) {
      return { status: "deferred", reason: "card_changed" };
    }
    this.#applying.add(id);
    try {
      if (value === null) {
        if (current !== null) {
          await cards.remove(id);
        }
        if (await this.read(id) !== null) {
          return { status: "deferred", reason: "card_changed" };
        }
      } else {
        const entry = { "cc-name": value.name, "cc-number": value.number };
        if (value.month !== null) {
          entry["cc-exp-month"] = value.month;
        }
        if (value.year !== null) {
          entry["cc-exp-year"] = value.year;
        }
        if (current) {
          await cards.update(id, entry, false, { sourceSync: true });
        } else {
          const now = Date.now();
          if (typeof cards.findDuplicateGUID !== "function" && typeof cards.addManyWithMeta === "function") {
            const [result] = await cards.addManyWithMeta([{
              ...entry, guid: id, version: cards.version, timeCreated: now,
              _sync: { changeCounter: 0 },
            }]);
            if (result?.guid !== id) {
              throw new SyncProtocolError("card_apply_failed");
            }
            await cards.notifySyncApplied();
          } else if (await cards.add({ ...entry, guid: id, version: cards.version,
            timeCreated: now, timeLastModified: now, timeLastUsed: 0, timesUsed: 0 },
          { sourceSync: true }) !== id) {
            throw new SyncProtocolError("card_apply_failed");
          }
        }
      }
      this.#ensureOpen();
      return { status: "applied" };
    } catch (error) {
      if (error instanceof SyncProtocolError) {
        throw error;
      }
      throw new SyncProtocolError("card_apply_failed");
    } finally {
      this.#applying.delete(id);
    }
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
