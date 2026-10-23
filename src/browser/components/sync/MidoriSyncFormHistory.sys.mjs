/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";

const TOPIC = "satchel-storage-changed";
const FIELDS = ["fieldname", "value", "firstUsed", "lastUsed", "timesUsed"];
const MAX_IDENTITIES = 8192;
const MAX_HINTS = 128;
const SENSITIVE_FIELDS = new Set(["password", "passwd", "pwd", "passphrase", "currentpassword",
  "newpassword", "otp", "onetimecode", "ccnumber", "cccsc", "cccvv", "cvv", "cvc",
  "accesstoken", "refreshtoken", "csrftoken"]);
const encoder = new TextEncoder();

function validId(id) {
  return typeof id === "string" && /^f1:[0-9a-f]{64}$/.test(id);
}

function equal(left, right) {
  return left === null || right === null ? left === right : FIELDS.every(field => left[field] === right[field]);
}

function merge(left, right) {
  return { ...left, firstUsed: Math.min(left.firstUsed, right.firstUsed),
    lastUsed: Math.max(left.lastUsed, right.lastUsed), timesUsed: Math.max(left.timesUsed, right.timesUsed) };
}

export class MidoriSyncFormHistory {
  #history;
  #observers;
  #deriveRecordId;
  #identities = new Map();
  #guids = new Map();
  #subscriptions = new Set();
  #closed = false;

  constructor({ history = null, observers = null, deriveRecordId } = {}) {
    if (typeof deriveRecordId !== "function") {
      throw new SyncProtocolError("invalid_form_history_identity");
    }
    this.#history = history ?? ChromeUtils.importESModule("resource://gre/modules/FormHistory.sys.mjs").FormHistory;
    this.#observers = observers ?? Services.obs;
    this.#deriveRecordId = deriveRecordId;
  }

  observe(listener) {
    this.#ensureOpen();
    let active = true;
    let pending = 0;
    let tail = Promise.resolve();
    const notify = event => {
      if (active && !this.#closed) {
        listener(event);
      }
    };
    const callback = (subject, _topic, action) => {
      if (!active || this.#closed || !["formhistory-add", "formhistory-update", "formhistory-remove",
        "formhistory-expireoldentries"].includes(action)) {
        return;
      }
      if (action === "formhistory-expireoldentries") {
        notify({ rescan: true });
        return;
      }
      let guid;
      try {
        guid = typeof subject?.QueryInterface === "function" ? subject.QueryInterface(Ci.nsISupportsString).data :
          subject?.data;
      } catch {
        notify({ rescan: true });
        return;
      }
      const previous = this.#guids.get(guid);
      if (action === "formhistory-remove") {
        this.#guids.delete(guid);
        notify(previous ? { id: previous } : { rescan: true });
        return;
      }
      if (typeof guid !== "string" || pending >= MAX_HINTS) {
        notify({ rescan: true });
        return;
      }
      ++pending;
      tail = tail.then(async () => {
        if (!active || this.#closed) {
          return;
        }
        const rows = await this.#history.search(["guid", ...FIELDS], { guid });
        this.#ensureOpen();
        if (previous) {
          notify({ id: previous });
        }
        if (rows.length !== 1 || !this.#allowed(rows[0])) {
          notify({ rescan: true });
          return;
        }
        const id = await this.#identity(rows[0]);
        this.#remember(id, rows[0]);
        if (id !== previous) {
          notify({ id });
        }
      }).catch(() => notify({ rescan: true })).finally(() => { --pending; });
    };
    this.#observers.addObserver(callback, TOPIC);
    const unsubscribe = () => {
      active = false;
      if (this.#subscriptions.delete(unsubscribe)) {
        this.#observers.removeObserver(callback, TOPIC);
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
    const canonical = this.#canonical(value);
    if (!validId(id) || await this.#identity(canonical) !== id) {
      throw new SyncProtocolError("invalid_record");
    }
    this.#remember(id, canonical);
    return canonical;
  }

  async read(id, base = null) {
    this.#ensureOpen();
    this.#requireEnabled();
    if (!validId(id)) {
      throw new SyncProtocolError("invalid_record");
    }
    if (base !== null) {
      await this.validate(id, base);
    }
    let identity = base ?? this.#identities.get(id);
    if (!identity) {
      const rows = await this.#history.search(["guid", ...FIELDS], {});
      this.#ensureOpen();
      for (const row of rows) {
        if (this.#allowed(row) && await this.#identity(row) === id) {
          identity = row;
          this.#remember(id, row);
          break;
        }
      }
    }
    if (!identity) {
      return null;
    }
    return this.#combined(await this.#rows(identity));
  }

  async listIds() {
    this.#ensureOpen();
    this.#requireEnabled();
    const rows = await this.#history.search(["guid", ...FIELDS], {});
    this.#ensureOpen();
    const ids = new Set();
    for (const row of rows) {
      if (!this.#allowed(row)) {
        continue;
      }
      this.#canonical({ version: 1, ...row }, true);
      const id = await this.#identity(row);
      this.#remember(id, row);
      ids.add(id);
    }
    return [...ids].sort();
  }

  async plan(incoming, previous = null) {
    this.#ensureOpen();
    incoming = structuredClone(incoming);
    previous = structuredClone(previous);
    if (!validId(incoming?.id) || typeof incoming.deleted !== "boolean" ||
        (previous !== null && (typeof previous.deleted !== "boolean" ||
          (previous.id !== undefined && previous.id !== incoming.id)))) {
      throw new SyncProtocolError("invalid_record");
    }
    const remote = incoming.deleted ? null : await this.validate(incoming.id, incoming.value);
    const base = previous === null || previous.deleted ? null : await this.validate(incoming.id, previous.value);
    const current = await this.read(incoming.id, remote ?? base);
    if (equal(current, remote)) {
      return { current, decision: { status: "keep_local" } };
    }
    if (current && remote) {
      const combined = merge(current, remote);
      return { current, decision: equal(current, combined) ? { status: "keep_local" } :
        { status: "apply", value: combined } };
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
    throw new SyncProtocolError("invalid_form_history_decision");
  }

  async apply(incoming, previous = null) {
    this.#ensureOpen();
    incoming = structuredClone(incoming);
    previous = structuredClone(previous);
    const { current, decision } = await this.plan(incoming, previous);
    if (decision.status === "conflict") {
      return decision;
    }
    const desired = decision.status === "keep_local" ? current : decision.value;
    return this.#applyValue(incoming.id, current, desired);
  }

  async applyConflict(incoming, previous) {
    const desired = incoming.deleted ? null : await this.validate(incoming.id, incoming.value);
    const base = previous.deleted ? null : await this.validate(incoming.id, previous.value);
    const current = await this.read(incoming.id, desired ?? base);
    if (!equal(current, base) && !equal(current, desired)) {
      return { status: "conflict", reason: "form_history_changed" };
    }
    return this.#applyValue(incoming.id, current, desired);
  }

  async #applyValue(id, current, desired) {
    const identity = desired ?? current;
    if (identity === null) {
      return { status: "applied" };
    }
    const rows = await this.#rows(identity);
    if (!equal(this.#combined(rows), current)) {
      return { status: "deferred", reason: "form_history_changed" };
    }
    const changes = [];
    if (desired === null) {
      changes.push({ op: "remove", fieldname: identity.fieldname, value: identity.value });
    } else if (rows.length) {
      const primary = rows[0];
      if (!equal(this.#canonical({ version: 1, ...primary }, true), desired)) {
        changes.push({ op: "update", guid: primary.guid, firstUsed: desired.firstUsed,
          lastUsed: desired.lastUsed, timesUsed: desired.timesUsed });
      }
      for (const duplicate of rows.slice(1)) {
        changes.push({ op: "remove", guid: duplicate.guid });
      }
    } else {
      const entry = Object.fromEntries(FIELDS.map(field => [field, desired[field]]));
      changes.push({ op: "add", ...entry });
    }
    if (changes.length) {
      await this.#history.update(changes);
      this.#ensureOpen();
    }
    const after = await this.#rows(identity);
    if (after.length > 1 || !equal(this.#combined(after), desired)) {
      return { status: "deferred", reason: "form_history_changed" };
    }
    for (const row of after) {
      this.#remember(id, row);
    }
    return { status: "applied" };
  }

  async #rows(identity) {
    const rows = await this.#history.search(["guid", ...FIELDS], {
      fieldname: identity.fieldname, value: identity.value,
    });
    this.#ensureOpen();
    if (rows.some(row => typeof row.guid !== "string" || !/^[A-Za-z0-9+/_-]{12,16}$/.test(row.guid))) {
      throw new SyncProtocolError("invalid_form_history_storage");
    }
    return rows.sort((left, right) => left.guid < right.guid ? -1 : left.guid > right.guid ? 1 : 0);
  }

  #combined(rows) {
    return rows.reduce((result, row) => {
      const value = this.#canonical({ version: 1, ...row }, true);
      return result ? merge(result, value) : value;
    }, null);
  }

  #allowed(value) {
    return typeof value?.fieldname === "string" && value.fieldname.length > 0 && value.fieldname.length <= 200 &&
      typeof value.value === "string" && value.value.length > 0 && value.value.length <= 200 &&
      !/[\p{Cc}\p{Cs}]/u.test(value.fieldname + value.value) &&
      !SENSITIVE_FIELDS.has(value.fieldname.toLowerCase().replace(/[-_\s]/g, "")) &&
      this.#history.isAllowedEntry(value.fieldname, value.value);
  }

  #canonical(value, local = false) {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        Object.keys(value).some(key => !["version", ...FIELDS, ...(local ? ["guid"] : [])].includes(key)) ||
        value.version !== 1 || !this.#allowed(value) ||
        !Number.isSafeInteger(value.firstUsed) || value.firstUsed < 1 ||
        !Number.isSafeInteger(value.lastUsed) || value.lastUsed < value.firstUsed ||
        !Number.isSafeInteger(value.timesUsed) || value.timesUsed < 1) {
      throw new SyncProtocolError("invalid_record");
    }
    return { version: 1, ...Object.fromEntries(FIELDS.map(field => [field, value[field]])) };
  }

  async #identity(value) {
    const bytes = encoder.encode(JSON.stringify([value.fieldname, value.value]));
    try {
      const digest = await this.#deriveRecordId("form-history", bytes);
      this.#ensureOpen();
      if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) {
        throw new SyncProtocolError("invalid_form_history_identity");
      }
      return `f1:${digest}`;
    } finally {
      bytes.fill(0);
    }
  }

  #remember(id, value) {
    this.#identities.delete(id);
    this.#identities.set(id, { fieldname: value.fieldname, value: value.value });
    if (value.guid) {
      this.#guids.delete(value.guid);
      this.#guids.set(value.guid, id);
    }
    for (const entries of [this.#identities, this.#guids]) {
      if (entries.size > MAX_IDENTITIES) {
        entries.delete(entries.keys().next().value);
      }
    }
  }

  #requireEnabled() {
    if (!this.#history.enabled) {
      throw new SyncProtocolError("form_history_disabled");
    }
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncProtocolError("cancelled");
    }
  }

  close() {
    this.#closed = true;
    for (const unsubscribe of this.#subscriptions) {
      unsubscribe();
    }
    this.#identities.clear();
    this.#guids.clear();
  }
}
