/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PlacesUtils } from "resource://gre/modules/PlacesUtils.sys.mjs";
import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";
import { historyRetentionDays } from "./MidoriSyncHistory.sys.mjs";

const MAX_HINTS = 4096;
const MAX_REMOVED_URLS = 5000;
const DAY_USECS = 86400000000;
const BACKFILL_PREF = "midori.sync.history.backfilledDays";
const SKIPPABLE = ["history_record_too_large", "history_identity_unavailable", "invalid_record"];

export class MidoriSyncHistoryTracker {
  #engine;
  #adapter;
  #onChange;
  #withConnection;
  #unsubscribe;
  #dirty = new Map();
  #revision = 0;
  #inventory = null;
  #rescan = true;
  #busy = false;
  #closed = false;
  #error = null;
  #cutoffUsec;
  #removedUrls = new Set();
  #deletionScan = null;
  #backfill = null;
  #skipped = 0;

  constructor({ engine, adapter, onChange = () => {},
    withConnection = PlacesUtils.withConnectionWrapper.bind(PlacesUtils) }) {
    if (typeof onChange !== "function") {
      throw new SyncProtocolError("invalid_capture_query");
    }
    this.#engine = engine;
    this.#adapter = adapter;
    this.#onChange = onChange;
    this.#withConnection = withConnection;
    this.#cutoffUsec = adapter.clearBeforeUsec ?? 0;
    this.#unsubscribe = adapter.observe(({ id, rescan, removedUrl }) => {
      if (this.#closed) {
        return;
      }
      this.#onChange();
      if (removedUrl) {
        if (this.#removedUrls.size < MAX_REMOVED_URLS) {
          this.#removedUrls.add(removedUrl);
        }
        return;
      }
      if (rescan) {
        this.#rescan = true;
        return;
      }
      if (this.#dirty.size >= MAX_HINTS && !this.#dirty.has(id)) {
        this.#rescan = true;
        return;
      }
      this.#dirty.delete(id);
      this.#dirty.set(id, ++this.#revision);
    });
  }

  get snapshot() {
    return Object.freeze({ busy: this.#busy, closed: this.#closed, error: this.#error, skipped: this.#skipped,
      dirty: this.#dirty.size, inventory: Boolean(this.#inventory || this.#rescan),
      more: Boolean(this.#dirty.size || this.#inventory || this.#rescan || this.#removedUrls.size ||
        this.#deletionScan || this.#backfill) });
  }

  requestInventory() {
    this.#ensureOpen();
    this.#rescan = true;
  }

  restartAfterBootstrap() {
    this.#ensureOpen();
    this.#dirty.clear();
    this.#inventory = null;
    this.#rescan = true;
  }

  resetAfterClear() {
    this.#ensureOpen();
    this.#cutoffUsec = this.#adapter.clearBeforeUsec ?? 0;
    this.#dirty.clear();
    this.#inventory = null;
    this.#rescan = true;
  }

  async run({ limit = 100 } = {}) {
    this.#ensureOpen();
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new SyncProtocolError("invalid_capture_query");
    }
    if (this.#busy) {
      throw new SyncProtocolError("busy");
    }
    if ((this.#adapter.clearBeforeUsec ?? 0) !== this.#cutoffUsec) {
      this.resetAfterClear();
    }
    this.#busy = true;
    this.#error = null;
    const progress = { checked: 0, queued: 0, pending: 0, conflicts: 0 };
    const capture = async id => {
      try {
        return await this.#engine.capture(id);
      } catch (error) {
        if (!SKIPPABLE.includes(error.code)) {
          throw error;
        }
        ++this.#skipped;
        return { status: "unchanged" };
      }
    };
    const record = (result, id) => {
      ++progress.checked;
      if (result.status === "queued") {
        ++progress.queued;
      } else if (result.status === "pending") {
        ++progress.pending;
        if (!result.durable && this.#dirty.size < MAX_HINTS) {
          this.#dirty.set(id, ++this.#revision);
        }
      } else if (result.status === "conflict") {
        ++progress.conflicts;
      } else if (result.status !== "unchanged") {
        throw new SyncProtocolError("invalid_adapter_result");
      }
    };
    try {
      for (const [id, revision] of [...this.#dirty].slice(0, limit)) {
        record(await capture(id), id);
        if (this.#dirty.get(id) === revision) {
          this.#dirty.delete(id);
        }
      }
      if (!this.#inventory && this.#rescan) {
        this.#rescan = false;
        this.#inventory = { stage: "local", window: Math.max(0, Date.now() * 1000 - historyRetentionDays() * DAY_USECS,
          (this.#adapter.clearBeforeUsec ?? 0) + 1),
          time: 0, visitId: 0, after: null };
      }
      if (this.#inventory?.stage === "local" && progress.checked < limit) {
        const scan = this.#inventory;
        const pageLimit = Math.max(1, limit - progress.checked);
        const rows = await this.#withConnection("MidoriSyncHistoryTracker: inventory", db => db.executeCached(
          `SELECT p.url AS url, v.visit_date AS atUsec, v.id AS visitId
           FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id
           WHERE v.visit_date >= :window AND
             (v.visit_date > :time OR (v.visit_date = :time AND v.id > :visitId))
           ORDER BY v.visit_date, v.id LIMIT :limit`,
          { window: scan.window, time: scan.time, visitId: scan.visitId, limit: pageLimit }
        ));
        const seen = new Set();
        for (const row of rows) {
          this.#ensureOpen();
          const time = row.getResultByName("atUsec");
          const visitId = row.getResultByName("visitId");
          const url = row.getResultByName("url");
          if (!Number.isSafeInteger(time) || !Number.isSafeInteger(visitId)) {
            throw new SyncProtocolError("invalid_history_visit");
          }
          const ids = await this.#adapter.localIds(url, Math.floor(time / DAY_USECS) * DAY_USECS);
          this.#ensureOpen();
          for (const id of ids) {
            if (!seen.has(id)) {
              record(await capture(id), id);
              seen.add(id);
            }
          }
          scan.time = time;
          scan.visitId = visitId;
        }
        if (rows.length < pageLimit) {
          scan.stage = "mirror";
        }
      }
      if (this.#removedUrls.size && !this.#deletionScan) {
        this.#deletionScan = { urls: new Set(this.#removedUrls), ids: new Set(), after: null };
        this.#removedUrls.clear();
      }
      if (this.#deletionScan && progress.checked < limit) {
        const scan = this.#deletionScan;
        const page = await this.#engine.recordPage({ after: scan.after, limit: Math.max(1, limit - progress.checked) });
        this.#ensureOpen();
        const matches = page.entries.filter(entry => !entry.deleted && scan.urls.has(entry.value?.url) &&
          typeof entry.id === "string");
        this.#adapter.beginUserDeletion(scan.urls, matches.map(entry => entry.id));
        try {
          for (const entry of matches) {
            scan.ids.add(entry.id);
            await this.#adapter.validate(entry.id, entry.value);
            record(await capture(entry.id), entry.id);
          }
        } finally {
          if (page.nextAfter === null) {
            this.#adapter.endUserDeletion(scan.urls, scan.ids);
          }
        }
        scan.after = page.nextAfter;
        if (scan.after === null) {
          this.#deletionScan = null;
        }
      }
      if (this.#backfill === null && !this.#deletionScan && this.#needsBackfill()) {
        this.#backfill = { after: null, windowDays: historyRetentionDays() };
      }
      if (this.#backfill && progress.checked < limit && !this.#deletionScan) {
        const scan = this.#backfill;
        const page = await this.#engine.recordPage({ after: scan.after, limit: 25 });
        this.#ensureOpen();
        for (const entry of page.entries) {
          if (!entry.deleted && entry.value && !this.#adapter.outsideRetention(entry.value)) {
            try {
              await this.#adapter.apply({ id: entry.id, deleted: false, value: entry.value }, null);
            } catch (error) {
              if (!SKIPPABLE.includes(error.code)) {
                throw error;
              }
            }
          }
        }
        scan.after = page.nextAfter;
        if (scan.after === null) {
          Services.prefs.setIntPref(BACKFILL_PREF, scan.windowDays);
          this.#backfill = null;
          this.#rescan = true;
        }
      }
      if (this.#inventory?.stage === "mirror" && progress.checked < limit) {
        const scan = this.#inventory;
        const page = await this.#engine.capturePage({ after: scan.after, limit: limit - progress.checked });
        this.#ensureOpen();
        for (const result of page.results) {
          record(result, result.id);
        }
        scan.after = page.nextAfter;
        if (scan.after === null) {
          this.#inventory = null;
        }
      }
      return Object.freeze({ ...progress, more: this.snapshot.more });
    } catch (error) {
      this.#error = error.code ?? "capture_failed";
      throw error;
    } finally {
      this.#busy = false;
    }
  }

  #needsBackfill() {
    const days = historyRetentionDays();
    const done = Services.prefs.getIntPref(BACKFILL_PREF, 0);
    if (done <= 0) {
      Services.prefs.setIntPref(BACKFILL_PREF, days);
      return false;
    }
    return days > done;
  }

  close() {
    if (!this.#closed) {
      this.#closed = true;
      this.#removedUrls.clear();
      this.#deletionScan = null;
      this.#backfill = null;
      this.#unsubscribe();
      this.#dirty.clear();
      this.#inventory = null;
      this.#rescan = false;
    }
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncProtocolError("cancelled");
    }
  }
}
