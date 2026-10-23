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
const MAX_PENDING_HINTS = 128;
const EVENTS = ["page-visited", "page-title-changed", "page-removed"];
const MAX_PART_DEPTH = 13;
const MAX_REMOVAL_URLS = 5000;
const SUPPRESS_MS = 2000;
const KEY_CHUNK = 400;

function samePart(left, right) {
  return (left?.startUsec ?? null) === (right?.startUsec ?? null) && (left?.lenUsec ?? null) === (right?.lenUsec ?? null);
}

function keyOf(visit) {
  return `${visit.atUsec}:${visit.transition}`;
}

function windowOf(identity) {
  return identity.part ? [identity.part.startUsec, identity.part.startUsec + identity.part.lenUsec] :
    [identity.dayStartUsec, identity.dayStartUsec + DAY_USECS];
}

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
  #deriveRecordId;
  #allowLegacy;
  #identities = new Map();
  #urlIds = new Map();
  #clearBeforeUsec = 0;
  #removalUrls = new Set();
  #deleting = new Set();
  #suppressUntil = 0;
  #subscriptions = new Set();
  #closed = false;

  constructor({ withConnection = PlacesUtils.withConnectionWrapper.bind(PlacesUtils),
    asyncHistory = Cc["@mozilla.org/browser/history;1"].getService(Ci.mozIAsyncHistory),
    observers = PlacesUtils.observers,
    model = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto),
    deriveRecordId = null, allowLegacy = false } = {}) {
    if ((deriveRecordId !== null && typeof deriveRecordId !== "function") || typeof allowLegacy !== "boolean") {
      throw new SyncProtocolError("invalid_history_identity");
    }
    this.#withConnection = withConnection;
    this.#asyncHistory = asyncHistory;
    this.#observers = observers;
    this.#model = model;
    this.#deriveRecordId = deriveRecordId;
    this.#allowLegacy = allowLegacy;
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
    this.#suppressUntil = Date.now() + 3600000;
    try {
      while (await PlacesUtils.history.removeVisitsByFilter({ endDate: new Date(ms), limit: 1000 })) {
        this.#ensureOpen();
      }
    } finally {
      this.#suppressUntil = Date.now() + SUPPRESS_MS;
    }
    this.#identities.clear();
    this.#urlIds.clear();
  }

  observe(listener) {
    this.#ensureOpen();
    let active = true;
    let pending = 0;
    let tail = Promise.resolve();
    const notify = event => {
      if (active && !this.#closed) {
        try {
          listener(event);
        } catch {}
      }
    };
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
        if (event.type === "page-removed") {
          const deleted = typeof PlacesVisitRemoved === "undefined" ? event.reason === 0 :
            event.reason === PlacesVisitRemoved.REASON_DELETED;
          if (deleted && Date.now() >= this.#suppressUntil) {
            notify({ removedUrl: event.url });
          }
          continue;
        }
        if (event.type === "page-title-changed") {
          const ids = [...this.#urlIds.get(event.url) ?? []].filter(id => id.startsWith("h2:"));
          if (ids.length) {
            for (const id of ids) {
              notify({ id });
            }
          } else {
            notify({ rescan: true });
          }
          continue;
        }
        if (!Number.isSafeInteger(event.visitTime) ||
            ![1, 2, 3, 5, 6, 7, 8, 9].includes(event.transitionType) ||
            event.visitTime <= this.#clearBeforeUsec) {
          continue;
        }
        const dayStartUsec = Math.floor(event.visitTime / DAY_USECS) * DAY_USECS;
        if (pending >= MAX_PENDING_HINTS) {
          notify({ rescan: true });
          continue;
        }
        ++pending;
        tail = tail.then(async () => {
          if (!active || this.#closed || event.visitTime <= this.#clearBeforeUsec) {
            return;
          }
          const ids = await this.localIds(event.url, dayStartUsec);
          if (event.visitTime > this.#clearBeforeUsec) {
            for (const id of ids) {
              notify({ id });
            }
          }
        }).catch(() => notify({ rescan: true })).finally(() => { --pending; });
      }
    };
    this.#observers.addListener(EVENTS, callback);
    const unsubscribe = () => {
      active = false;
      if (this.#subscriptions.delete(unsubscribe)) {
        this.#observers.removeListener(EVENTS, callback);
      }
    };
    this.#subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  async validate(id, value) {
    this.#ensureOpen();
    if (typeof id !== "string" || !/^h[12]:[0-9a-f]{64}$/.test(id) ||
        (id.startsWith("h1:") && !this.#allowLegacy)) {
      throw new SyncProtocolError("invalid_record");
    }
    const canonical = await this.#validateValue(value);
    const part = canonical.part ?? null;
    if (part && id.startsWith("h1:")) {
      throw new SyncProtocolError("invalid_record");
    }
    const expected = id.startsWith("h1:") ? historyRecordId(canonical.url, canonical.dayStartUsec) :
      await this.#identity(canonical.url, canonical.dayStartUsec, part);
    this.#ensureOpen();
    if (id !== expected || canonical.visits.some(visit => visit.atUsec <= this.#clearBeforeUsec)) {
      throw new SyncProtocolError("invalid_record");
    }
    this.#remember(id, canonical.url, canonical.dayStartUsec, part);
    return canonical;
  }

  async #validateValue(value) {
    const canonical = await this.#process({ action: "validate", value });
    let url;
    try {
      url = new URL(canonical.url);
    } catch {
      throw new SyncProtocolError("invalid_record");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.href !== canonical.url || url.username || url.password ||
        canonical.visits.some(visit => visit.atUsec <= this.#clearBeforeUsec)) {
      throw new SyncProtocolError("invalid_record");
    }
    return canonical;
  }

  async migrationId(value) {
    this.#ensureOpen();
    const canonical = await this.#validateValue(value);
    const id = await this.#identity(canonical.url, canonical.dayStartUsec);
    this.#ensureOpen();
    return id;
  }

  async mergeForMigration(source, target) {
    const remote = await this.#validateValue(source);
    const local = await this.#validateValue(target);
    const decision = await this.#process({ action: "merge", base: null, local, remote });
    if (decision.status === "keep_local") {
      return local;
    }
    if (decision.status !== "apply" || !decision.value) {
      throw new SyncProtocolError("history_migration_conflict");
    }
    return this.#validateValue(decision.value);
  }

  async rememberLocal(url, dayStartUsec) {
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
    const id = await this.#identity(url, dayStartUsec);
    this.#ensureOpen();
    if (dayStartUsec + DAY_USECS <= this.#clearBeforeUsec) {
      return null;
    }
    this.#remember(id, url, dayStartUsec);
    return id;
  }

  async read(id, hint = null) {
    this.#ensureOpen();
    if (typeof id !== "string" || (id.startsWith("h1:") && !this.#allowLegacy)) {
      throw new SyncProtocolError("invalid_record");
    }
    if (hint) {
      await this.validate(id, hint);
    }
    const identity = this.#identities.get(id);
    if (!identity) {
      if (!hint) {
        return null;
      }
      throw new SyncProtocolError("history_identity_unavailable");
    }
    let value;
    try {
      value = await this.#readWindow(identity);
    } catch (error) {
      if (error.code !== "history_record_too_large" || !hint) {
        throw error;
      }
      value = await this.#readRestricted(identity, hint);
    }
    if (value && hint && this.#removalUrls.has(identity.url)) {
      value = this.#withRemovals(value, hint);
    }
    return value;
  }

  async readCaptured(id, captured, hint) {
    const previous = captured?.value ?? captured?.hint ?? hint;
    const current = await this.read(id, previous);
    return current && previous ? this.#withRemovals(current, previous, captured?.deleted === true) : current;
  }

  async readDay(url, dayStartUsec) {
    return this.#readWindow({ url, dayStartUsec, part: null });
  }

  async #readWindow(identity) {
    this.#ensureOpen();
    const { url, dayStartUsec, part } = identity;
    if (typeof url !== "string" || !Number.isSafeInteger(dayStartUsec) || dayStartUsec <= 0 ||
        dayStartUsec % DAY_USECS !== 0 || dayStartUsec > Number.MAX_SAFE_INTEGER - DAY_USECS) {
      throw new SyncProtocolError("invalid_record");
    }
    const [begin, end] = windowOf(identity);
    const rows = await this.#withConnection("MidoriSyncHistory: readDay", db => db.executeCached(
      `SELECT p.title AS title, v.visit_date AS atUsec, v.visit_type AS transition
       FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id
       WHERE p.url = :url AND v.visit_date >= :begin AND v.visit_date < :end
       ORDER BY v.visit_date, v.visit_type, v.id LIMIT :limit`,
      { url, begin: Math.max(begin, this.#clearBeforeUsec + 1), end, limit: MAX_VISITS * 4 + 1 }
    ));
    return this.#describeRows(identity, rows, true);
  }

  async #readRestricted(identity, hint) {
    const keys = new Map(hint.visits.map(visit => [keyOf(visit), visit]));
    const times = [...new Set(hint.visits.map(visit => visit.atUsec))];
    const rows = [];
    for (let offset = 0; offset < times.length; offset += KEY_CHUNK) {
      const chunk = times.slice(offset, offset + KEY_CHUNK);
      const params = Object.fromEntries(chunk.map((time, index) => [`t${index}`, time]));
      params.url = identity.url;
      const part = await this.#withConnection("MidoriSyncHistory: readKeys", db => db.executeCached(
        `SELECT p.title AS title, v.visit_date AS atUsec, v.visit_type AS transition
         FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id
         WHERE p.url = :url AND v.visit_date IN (${chunk.map((_, index) => `:t${index}`).join(",")})
         ORDER BY v.visit_date, v.visit_type, v.id`, params));
      rows.push(...part);
    }
    return this.#describeRows(identity, rows.filter(row => keys.has(`${row.getResultByName("atUsec")}:${row.getResultByName("transition")}`)),
      false);
  }

  async #describeRows(identity, rows, enforceLimit) {
    const { url, dayStartUsec, part } = identity;
    const [begin, end] = windowOf(identity);
    const visits = new Map();
    let title = "";
    for (const row of rows) {
      const atUsec = row.getResultByName("atUsec");
      const transition = row.getResultByName("transition");
      if (!Number.isSafeInteger(atUsec) || atUsec < begin || atUsec >= end ||
          ![1, 2, 3, 5, 6, 7, 8, 9].includes(transition)) {
        continue;
      }
      title = localTitle(row.getResultByName("title"));
      const key = `${atUsec}:${transition}`;
      const previous = visits.get(key);
      visits.set(key, { atUsec, transition, count: (previous?.count ?? 0) + 1 });
    }
    if (enforceLimit && visits.size > MAX_VISITS) {
      throw new SyncProtocolError("history_record_too_large");
    }
    const value = visits.size ? { version: 1, url, title, dayStartUsec, ...(part ? { part } : {}),
      visits: [...visits.values()].sort((left, right) => left.atUsec - right.atUsec || left.transition - right.transition) } : null;
    this.#ensureOpen();
    if (value === null) {
      return null;
    }
    const canonical = await this.#validateValue(value);
    if (this.#deriveRecordId) {
      await this.rememberLocal(canonical.url, canonical.dayStartUsec);
    }
    this.#ensureOpen();
    if (canonical.visits.some(visit => visit.atUsec <= this.#clearBeforeUsec)) {
      throw new SyncProtocolError("invalid_record");
    }
    return canonical;
  }

  #withRemovals(value, hint, deliberate = true) {
    const present = new Set(value.visits.map(keyOf));
    const removed = new Map([...(hint.removed ?? []), ...(value.removed ?? [])]
      .filter(key => !present.has(keyOf(key))).map(key => [keyOf(key), key]));
    for (const visit of deliberate ? hint.visits : []) {
      if (!present.has(keyOf(visit))) {
        removed.set(keyOf(visit), { atUsec: visit.atUsec, transition: visit.transition });
      }
    }
    const sorted = [...removed.values()].sort((left, right) => left.atUsec - right.atUsec || left.transition - right.transition);
    return sorted.length ? { ...value, removed: sorted.slice(0, 2048) } : value;
  }

  /**
   * Returns the identities that carry this URL/day. A day with more visits than one record can hold is
   * split by halving its time window until every piece fits.
   */
  async localIds(url, dayStartUsec) {
    const first = await this.rememberLocal(url, dayStartUsec);
    if (!first) {
      return [];
    }
    const count = (begin, end) => this.#withConnection("MidoriSyncHistory: count", async db => {
      const rows = await db.executeCached(
        `SELECT COUNT(*) AS total FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id
         WHERE p.url = :url AND v.visit_date >= :begin AND v.visit_date < :end`,
        { url, begin: Math.max(begin, this.#clearBeforeUsec + 1), end });
      return rows[0].getResultByName("total");
    });
    if (await count(dayStartUsec, dayStartUsec + DAY_USECS) <= MAX_VISITS) {
      return [first];
    }
    const ids = [];
    const split = async (start, len, depth) => {
      this.#ensureOpen();
      const total = await count(start, start + len);
      if (!total) {
        return;
      }
      if (total <= MAX_VISITS || depth >= MAX_PART_DEPTH) {
        const part = { startUsec: start, lenUsec: len };
        const id = await this.#identity(url, dayStartUsec, part);
        this.#remember(id, url, dayStartUsec, part);
        ids.push(id);
        return;
      }
      await split(start, len / 2, depth + 1);
      await split(start + len / 2, len / 2, depth + 1);
    };
    await split(dayStartUsec, DAY_USECS / 2, 1);
    await split(dayStartUsec + DAY_USECS / 2, DAY_USECS / 2, 1);
    return ids;
  }

  /**
   * Marks URLs the user removed on purpose so their records become deletions or visit tombstones.
   * Expiry and cleanup never pass through here, so they cannot delete anything remotely.
   */
  beginUserDeletion(urls, ids) {
    this.#ensureOpen();
    for (const url of urls) {
      this.#removalUrls.add(url);
    }
    for (const id of ids) {
      this.#deleting.add(id);
    }
  }

  endUserDeletion(urls, ids) {
    for (const url of urls) {
      this.#removalUrls.delete(url);
    }
    for (const id of ids) {
      this.#deleting.delete(id);
    }
  }

  matchesLocal(id, current, base) {
    if (!current) {
      return !(base && this.#deleting.has(id));
    }
    if (!base) {
      return false;
    }
    const known = new Set((base.removed ?? []).map(key => `${key.atUsec}:${key.transition}`));
    if ((current.removed ?? []).some(key => !known.has(`${key.atUsec}:${key.transition}`))) {
      return false;
    }
    const counts = new Map(base.visits.map(visit => [`${visit.atUsec}:${visit.transition}`, visit.count]));
    return current.title === base.title && current.visits.every(visit =>
      visit.count <= (counts.get(`${visit.atUsec}:${visit.transition}`) ?? 0));
  }

  matchesResolution(_id, current, desired) {
    if (current === null || desired === null) {
      return current === desired;
    }
    return current.url === desired.url && current.dayStartUsec === desired.dayStartUsec && samePart(current.part, desired.part) &&
      current.title === desired.title && JSON.stringify(current.visits) === JSON.stringify(desired.visits);
  }

  async plan(incoming, previous = null, local = {}) {
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
    const current = Object.hasOwn(local, "current") ? structuredClone(local.current) : await this.read(incoming.id, remote ?? base);
    const decision = await this.#process({ action: "merge", base, local: current, remote });
    return { current, decision };
  }

  async resolveValue(id, current, desired, choice) {
    if (desired && this.outsideRetention(desired)) {
      throw new SyncProtocolError("conflict_resolution_unavailable");
    }
    if (desired && !desired.visits.length) {
      return null;
    }
    if (desired === null || current === null || choice !== "remote") {
      return desired;
    }
    const remote = await this.validate(id, desired);
    const counts = new Map(remote.visits.map(visit => [keyOf(visit), visit.count]));
    if (current.visits.some(visit => counts.has(keyOf(visit)) && counts.get(keyOf(visit)) < visit.count)) {
      throw new SyncProtocolError("conflict_resolution_unavailable");
    }
    const removed = new Map((remote.removed ?? []).map(visit => [keyOf(visit), visit]));
    for (const visit of current.visits) {
      if (!counts.has(keyOf(visit))) {
        removed.set(keyOf(visit), { atUsec: visit.atUsec, transition: visit.transition });
      }
    }
    return this.validate(id, { ...remote, ...(removed.size ? {
      removed: [...removed.values()].sort((left, right) => left.atUsec - right.atUsec || left.transition - right.transition),
    } : {}) });
  }

  isRetired(incoming) {
    return !!this.#deriveRecordId && incoming?.deleted === true && incoming.authenticatedSchema === 2 &&
      /^h1:[0-9a-f]{64}$/.test(incoming.id);
  }

  async apply(incoming, previous = null) {
    this.#ensureOpen();
    if (incoming.deleted) {
      if (this.isRetired(incoming)) {
        return { status: "applied" };
      }
      if (incoming.authenticatedSchema !== 2) {
        return { status: "conflict", reason: "history_deletion_scope_required" };
      }
      if (!previous || previous.deleted) {
        return { status: "applied" };
      }
      const base = await this.validate(incoming.id, previous.value);
      const current = await this.read(incoming.id, base);
      const decision = await this.#process({ action: "merge", base, local: current, remote: null });
      if (decision.status === "conflict") {
        return decision;
      }
      if (decision.status === "apply" && decision.value === null) {
        await this.#removeVisits(this.#identities.get(incoming.id));
        if (await this.read(incoming.id, base) !== null) {
          return { status: "deferred", reason: "history_local_changed" };
        }
      }
      return { status: "applied" };
    }
    if (this.outsideRetention(incoming.value)) {
      await this.validate(incoming.id, incoming.value);
      return { status: "applied", skipped: "retention" };
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
    const removed = new Set((value.removed ?? []).map(key => `${key.atUsec}:${key.transition}`));
    const localCounts = new Map(current?.visits.map(visit => [`${visit.atUsec}:${visit.transition}`, visit.count]) ?? []);
    const stale = [...removed].filter(key => localCounts.has(key));
    if (stale.length) {
      await this.#removeVisits(this.#identities.get(incoming.id), stale);
      this.#ensureOpen();
    }
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
      if (!value.visits.length || current?.title === value.title) {
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

  outsideRetention(value) {
    return value?.dayStartUsec + DAY_USECS < (Date.now() - historyRetentionDays() * 86400000) * 1000;
  }

  /**
   * Removes the visits of one record window, or only the listed visit keys, with the exact microsecond
   * precision Places stores. The Places triggers keep visit counts and frecency consistent.
   */
  async #removeVisits(identity, keys = null) {
    this.#ensureOpen();
    const [begin, end] = windowOf(identity);
    await this.#withConnection("MidoriSyncHistory: removeVisits", async db => {
      await db.executeTransaction(async () => {
        if (keys === null) {
          await db.executeCached(
            `DELETE FROM moz_historyvisits WHERE place_id = (SELECT id FROM moz_places WHERE url = :url)
             AND visit_date >= :begin AND visit_date < :end`,
            { url: identity.url, begin, end });
          return;
        }
        for (const key of keys) {
          const [at, transition] = key.split(":").map(Number);
          if (at >= begin && at < end) {
            await db.executeCached(
              `DELETE FROM moz_historyvisits WHERE place_id = (SELECT id FROM moz_places WHERE url = :url)
               AND visit_date = :at AND visit_type = :transition`,
              { url: identity.url, at, transition });
          }
        }
      });
    });
    this.#ensureOpen();
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

  async #identity(url, dayStartUsec, part = null) {
    this.#ensureOpen();
    if (!this.#deriveRecordId) {
      throw new SyncProtocolError("history_identity_unavailable");
    }
    for (const id of this.#urlIds.get(url) ?? []) {
      const known = this.#identities.get(id);
      if (id.startsWith("h2:") && known?.dayStartUsec === dayStartUsec && samePart(known.part, part)) {
        return id;
      }
    }
    const bytes = encoder.encode(JSON.stringify(part ? [url, dayStartUsec, part.startUsec, part.lenUsec] : [url, dayStartUsec]));
    try {
      const digest = await this.#deriveRecordId("history", bytes);
      this.#ensureOpen();
      if (typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest)) {
        throw new SyncProtocolError("invalid_history_identity");
      }
      return `h2:${digest}`;
    } finally {
      bytes.fill(0);
    }
  }

  #remember(id, url, dayStartUsec, part = null) {
    const previous = this.#identities.get(id);
    if (previous) {
      this.#removeUrlId(previous.url, id);
      this.#identities.delete(id);
    }
    this.#identities.set(id, { url, dayStartUsec, part });
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
