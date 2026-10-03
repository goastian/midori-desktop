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

  matchesLocal(_id, current, base) {
    return equal(current, base);
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

  async apply(incoming, previous = null) {
    this.#ensureOpen();
    const { current, decision } = await this.plan(incoming, previous);
    if (decision.status === "conflict") {
      return decision;
    }
    if (decision.status === "keep_local") {
      return { status: "applied" };
    }
    if (!equal(await this.read(incoming.id), current)) {
      return { status: "deferred", reason: "card_changed" };
    }
    const cards = this.#storage.creditCards;
    this.#applying.add(incoming.id);
    try {
      if (decision.value === null) {
        await cards.remove(incoming.id);
        if (await this.read(incoming.id) !== null) {
          return { status: "deferred", reason: "card_changed" };
        }
      } else {
        const entry = { "cc-name": decision.value.name, "cc-number": decision.value.number };
        if (decision.value.month !== null) {
          entry["cc-exp-month"] = decision.value.month;
        }
        if (decision.value.year !== null) {
          entry["cc-exp-year"] = decision.value.year;
        }
        if (current) {
          await cards.update(incoming.id, entry, false, { sourceSync: true });
        } else {
          let duplicate;
          try {
            const existing = typeof cards.findDuplicateGUID === "function" ? [] :
              await Promise.all((await cards.getAll()).map(card => typeof cards._recordForMigrationExport === "function" ?
                cards._recordForMigrationExport(card) : card));
            duplicate = typeof cards.findDuplicateGUID === "function" ?
              await cards.findDuplicateGUID({ ...entry, guid: incoming.id, version: cards.version }) : existing.find(card =>
                card["cc-number"] === entry["cc-number"] &&
                (card["cc-name"] ?? "") === entry["cc-name"] &&
                (card["cc-exp-month"] ?? null) === (entry["cc-exp-month"] ?? null) &&
                (card["cc-exp-year"] ?? null) === (entry["cc-exp-year"] ?? null))?.guid;
          } catch {
            throw new SyncProtocolError("cards_locked");
          }
          if (duplicate) {
            return { status: "conflict", reason: "card_duplicate" };
          }
          const now = Date.now();
          if (typeof cards.findDuplicateGUID !== "function" && typeof cards.addManyWithMeta === "function") {
            const [result] = await cards.addManyWithMeta([{
              ...entry, guid: incoming.id, version: cards.version, timeCreated: now,
              _sync: { changeCounter: 0 },
            }]);
            if (result?.guid !== incoming.id) {
              throw new SyncProtocolError("card_apply_failed");
            }
            await cards.notifySyncApplied();
          } else if (await cards.add({ ...entry, guid: incoming.id, version: cards.version,
            timeCreated: now, timeLastModified: now, timeLastUsed: 0, timesUsed: 0 },
          { sourceSync: true }) !== incoming.id) {
            throw new SyncProtocolError("card_apply_failed");
          }
        }
      }
      this.#ensureOpen();
      return { status: "applied" };
    } finally {
      this.#applying.delete(incoming.id);
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
