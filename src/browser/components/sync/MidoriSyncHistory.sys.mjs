/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PlacesUtils } from "resource://gre/modules/PlacesUtils.sys.mjs";
import { setTimeout, clearTimeout } from "resource://gre/modules/Timer.sys.mjs";
import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";

const encoder = new TextEncoder();
const DAY_USECS = 86400000000;
const MAX_VISITS = 2048;
const MAX_IDENTITIES = 8192;
const EVENTS = ["page-visited", "page-title-changed"];

export function historyRetentionDays() {
  const days = Services.prefs.getIntPref("midori.sync.history.retentionDays", 90);
  return Number.isInteger(days) && days >= 1 && days <= 3650 ? days : 90;
}

function localTitle(value) {
  let units = 0;
  const parts = [];
  for (const character of value ?? "") {
    if (units + character.length > 4096) {
      break;
    }
    const code = character.codePointAt(0);
    parts.push(code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? " " : character);
    units += character.length;
  }
  return parts.join("");
}

export function historyRecordId(url, dayStartUsec) {
  const bytes = encoder.encode(JSON.stringify(["MidoriSync/history/v1", url, dayStartUsec]));
  try {
    const hash = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
    hash.init(Ci.nsICryptoHash.SHA256);
    hash.update(bytes, bytes.length);
    return `h1:${Array.from(hash.finish(false), byte => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("")}`;
  } finally {
    bytes.fill(0);
  }
}

export class MidoriSyncHistory {
  #withConnection;
  #asyncHistory;
  #observers;
  #model;
  #identities = new Map();
  #urlIds = new Map();
  #clearBeforeUsec = 0;
  #subscriptions = new Set();
  #closed = false;

  constructor({ withConnection = PlacesUtils.withConnectionWrapper.bind(PlacesUtils),
    asyncHistory = Cc["@mozilla.org/browser/history;1"].getService(Ci.mozIAsyncHistory),
    observers = PlacesUtils.observers,
    model = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto) } = {}) {
    this.#withConnection = withConnection;
    this.#asyncHistory = asyncHistory;
    this.#observers = observers;
    this.#model = model;
  }

  get clearBeforeUsec() {
    return this.#clearBeforeUsec;
  }

  setHistoryCutoff(ms) {
    this.#ensureOpen();
    if (!Number.isSafeInteger(ms) || ms < 1 || ms > Math.floor(Number.MAX_SAFE_INTEGER / 1000) ||
        ms * 1000 < this.#clearBeforeUsec) {
      throw new SyncProtocolError("invalid_history_reset");
    }
    this.#clearBeforeUsec = ms * 1000;
  }

  async clearBefore(ms) {
    this.setHistoryCutoff(ms);
    while (await PlacesUtils.history.removeVisitsByFilter({ endDate: new Date(ms), limit: 1000 })) {
      this.#ensureOpen();
    }
    this.#identities.clear();
    this.#urlIds.clear();
  }

  observe(listener) {
    this.#ensureOpen();
    const callback = events => {
      if (this.#closed) {
        return;
      }
      for (const event of events) {
        if (!EVENTS.includes(event.type)) {
          continue;
        }
        let url;
        try {
          url = new URL(event.url);
        } catch {
          continue;
        }
        if (!["http:", "https:"].includes(url.protocol) || url.href !== event.url || url.username || url.password) {
          continue;
        }
        if (event.type === "page-title-changed") {
          const ids = this.#urlIds.get(event.url);
          if (ids?.size) {
            for (const id of ids) {
              listener({ id });
            }
          } else {
            listener({ rescan: true });
          }
          continue;
        }
        if (!Number.isSafeInteger(event.visitTime) ||
            ![1, 2, 3, 5, 6, 7, 8, 9].includes(event.transitionType) ||
            event.visitTime <= this.#clearBeforeUsec) {
          continue;
        }
        const dayStartUsec = Math.floor(event.visitTime / DAY_USECS) * DAY_USECS;
        const id = this.rememberLocal(event.url, dayStartUsec);
        if (id) {
          listener({ id });
        }
      }
    };
    this.#observers.addListener(EVENTS, callback);
    const unsubscribe = () => {
      if (this.#subscriptions.delete(unsubscribe)) {
        this.#observers.removeListener(EVENTS, callback);
      }
    };
    this.#subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  async validate(id, value) {
    this.#ensureOpen();
    const canonical = await this.#process({ action: "validate", value });
    let url;
    try {
      url = new URL(canonical.url);
    } catch {
      throw new SyncProtocolError("invalid_record");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.href !== canonical.url || url.username || url.password ||
        id !== historyRecordId(canonical.url, canonical.dayStartUsec) ||
        canonical.visits.some(visit => visit.atUsec <= this.#clearBeforeUsec)) {
      throw new SyncProtocolError("invalid_record");
    }
    this.#remember(id, canonical.url, canonical.dayStartUsec);
    return canonical;
  }

  rememberLocal(url, dayStartUsec) {
    this.#ensureOpen();
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.href !== url || parsed.username || parsed.password ||
          url.length > 2000 || !Number.isSafeInteger(dayStartUsec) || dayStartUsec <= 0 ||
          dayStartUsec % DAY_USECS !== 0 || dayStartUsec > Number.MAX_SAFE_INTEGER - DAY_USECS ||
          dayStartUsec + DAY_USECS <= this.#clearBeforeUsec) {
        return null;
      }
    } catch {
      return null;
    }
    const id = historyRecordId(url, dayStartUsec);
    this.#remember(id, url, dayStartUsec);
    return id;
  }

  async read(id, hint = null) {
    this.#ensureOpen();
    if (hint) {
      await this.validate(id, hint);
    }
    const identity = this.#identities.get(id);
    if (!identity) {
      throw new SyncProtocolError("history_identity_unavailable");
    }
    return this.readDay(identity.url, identity.dayStartUsec);
  }

  async readDay(url, dayStartUsec) {
    this.#ensureOpen();
    if (typeof url !== "string" || !Number.isSafeInteger(dayStartUsec) || dayStartUsec <= 0 ||
        dayStartUsec % DAY_USECS !== 0 || dayStartUsec > Number.MAX_SAFE_INTEGER - DAY_USECS) {
      throw new SyncProtocolError("invalid_record");
    }
    const id = historyRecordId(url, dayStartUsec);
    const rows = await this.#withConnection("MidoriSyncHistory: readDay", db => db.executeCached(
      `SELECT p.title AS title, v.visit_date AS atUsec, v.visit_type AS transition
       FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id
       WHERE p.url = :url AND v.visit_date >= :begin AND v.visit_date < :end
       ORDER BY v.visit_date, v.visit_type, v.id LIMIT :limit`,
      { url, begin: Math.max(dayStartUsec, this.#clearBeforeUsec + 1), end: dayStartUsec + DAY_USECS, limit: MAX_VISITS + 1 }
    ));
    if (rows.length > MAX_VISITS) {
      throw new SyncProtocolError("history_record_too_large");
    }
    const visits = new Map();
    let title = "";
    for (const row of rows) {
      const atUsec = row.getResultByName("atUsec");
      const transition = row.getResultByName("transition");
      if (!Number.isSafeInteger(atUsec) || atUsec < dayStartUsec || atUsec >= dayStartUsec + DAY_USECS ||
          ![1, 2, 3, 5, 6, 7, 8, 9].includes(transition)) {
        continue;
      }
      title = localTitle(row.getResultByName("title"));
      const key = `${atUsec}:${transition}`;
      const previous = visits.get(key);
      visits.set(key, { atUsec, transition, count: (previous?.count ?? 0) + 1 });
    }
    const value = visits.size ? { version: 1, url, title, dayStartUsec,
      visits: [...visits.values()].sort((left, right) => left.atUsec - right.atUsec || left.transition - right.transition) } : null;
    this.#ensureOpen();
    return value === null ? null : this.validate(id, value);
  }

  matchesLocal(_id, current, base) {
    if (!current) {
      return true;
    }
    if (!base) {
      return false;
    }
    const counts = new Map(base.visits.map(visit => [`${visit.atUsec}:${visit.transition}`, visit.count]));
    return current.title === base.title && current.visits.every(visit =>
      visit.count <= (counts.get(`${visit.atUsec}:${visit.transition}`) ?? 0));
  }

  async plan(incoming, previous = null) {
    this.#ensureOpen();
    incoming = structuredClone(incoming);
    previous = structuredClone(previous);
    if (typeof incoming?.id !== "string" || typeof incoming.deleted !== "boolean" ||
        (previous !== null && (typeof previous.deleted !== "boolean" ||
          (previous.id !== undefined && previous.id !== incoming.id)))) {
      throw new SyncProtocolError("invalid_record");
    }
    const remote = incoming.deleted ? null : await this.validate(incoming.id, incoming.value);
    const base = previous === null || previous.deleted ? null : await this.validate(incoming.id, previous.value);
    const current = await this.read(incoming.id, remote ?? base);
    const decision = await this.#process({ action: "merge", base, local: current, remote });
    return { current, decision };
  }

  async apply(incoming, previous = null) {
    this.#ensureOpen();
    if (incoming.deleted) {
      return { status: "conflict", reason: "history_deletion_scope_required" };
    }
    if (incoming.value?.dayStartUsec + DAY_USECS < (Date.now() - historyRetentionDays() * 86400000) * 1000) {
      await this.validate(incoming.id, incoming.value);
      return { status: "applied" };
    }
    const { current, decision } = await this.plan(incoming, previous);
    if (decision.status === "conflict") {
      return decision;
    }
    if (decision.status === "keep_local") {
      return { status: "applied" };
    }
    if (decision.status !== "apply" || !decision.value) {
      throw new SyncProtocolError("invalid_history_decision");
    }
    const value = decision.value;
    const localCounts = new Map(current?.visits.map(visit => [`${visit.atUsec}:${visit.transition}`, visit.count]) ?? []);
    const visits = [];
    for (const visit of value.visits) {
      const count = visit.count - (localCounts.get(`${visit.atUsec}:${visit.transition}`) ?? 0);
      if (count < 0) {
        return { status: "conflict", reason: "history_local_changed" };
      }
      for (let index = 0; index < count; index++) {
        visits.push({ visitDate: visit.atUsec, transitionType: visit.transition });
      }
    }
    if (!visits.length) {
      if (current?.title === value.title) {
        return { status: "applied" };
      }
      let complete;
      const changed = new Promise(resolve => { complete = resolve; });
      const onTitle = events => {
        if (events.some(event => event.url === value.url && event.title === value.title)) {
          complete(true);
        }
      };
      this.#observers.addListener(["page-title-changed"], onTitle);
      const timer = setTimeout(() => complete(false), 5000);
      try {
        this.#model.setHistoryTitle(value.url, value.title);
        const notified = await changed;
        const updated = await this.readDay(value.url, value.dayStartUsec);
        return updated?.title === value.title ? { status: "applied" } :
          { status: "deferred", reason: notified ? "history_local_changed" : "history_title_update_unavailable" };
      } finally {
        clearTimeout(timer);
        this.#observers.removeListener(["page-title-changed"], onTitle);
      }
    }
    const uri = Services.io.newURI(value.url);
    await new Promise((resolve, reject) => {
      let failure = null;
      this.#asyncHistory.updatePlaces({ uri, title: value.title, visits }, {
        handleError(code) { failure = code; },
        handleResult() {},
        handleCompletion(count) {
          if (failure || count !== visits.length) {
            reject(new SyncProtocolError("history_write_failed"));
          } else {
            resolve();
          }
        },
      });
    });
    this.#ensureOpen();
    return { status: "applied" };
  }

  async #process(request) {
    this.#ensureOpen();
    const bytes = encoder.encode(JSON.stringify(request));
    try {
      if (bytes.length > 786432) {
        throw new SyncProtocolError("record_too_large");
      }
      const result = await this.#model.processHistory(bytes);
      this.#ensureOpen();
      return JSON.parse(result);
    } catch (error) {
      if (error.result === Cr.NS_ERROR_INVALID_ARG) {
        throw new SyncProtocolError("invalid_record");
      }
      throw error;
    } finally {
      bytes.fill(0);
    }
  }

  #remember(id, url, dayStartUsec) {
    const previous = this.#identities.get(id);
    if (previous) {
      this.#removeUrlId(previous.url, id);
      this.#identities.delete(id);
    }
    this.#identities.set(id, { url, dayStartUsec });
    if (!this.#urlIds.has(url)) {
      this.#urlIds.set(url, new Set());
    }
    this.#urlIds.get(url).add(id);
    if (this.#identities.size > MAX_IDENTITIES) {
      const oldest = this.#identities.keys().next().value;
      this.#removeUrlId(this.#identities.get(oldest).url, oldest);
      this.#identities.delete(oldest);
    }
  }

  #removeUrlId(url, id) {
    const ids = this.#urlIds.get(url);
    ids.delete(id);
    if (!ids.size) {
      this.#urlIds.delete(url);
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
    this.#urlIds.clear();
    this.#model.close();
  }
}
