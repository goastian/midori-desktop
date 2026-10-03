/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PlacesUtils } from "resource://gre/modules/PlacesUtils.sys.mjs";
import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";
import { historyRetentionDays } from "./MidoriSyncHistory.sys.mjs";

const MAX_HINTS = 4096;
const DAY_USECS = 86400000000;

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
    this.#unsubscribe = adapter.observe(({ id, rescan }) => {
      if (this.#closed) {
        return;
      }
      this.#onChange();
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
    return Object.freeze({ busy: this.#busy, closed: this.#closed, error: this.#error,
      dirty: this.#dirty.size, inventory: Boolean(this.#inventory || this.#rescan),
      more: Boolean(this.#dirty.size || this.#inventory || this.#rescan) });
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
    const record = (result, id) => {
      ++progress.checked;
      if (result.status === "queued") {
        ++progress.queued;
      } else if (result.status === "pending") {
        ++progress.pending;
        if (this.#dirty.size < MAX_HINTS) {
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
        record(await this.#engine.capture(id), id);
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
          const id = this.#adapter.rememberLocal(url, Math.floor(time / DAY_USECS) * DAY_USECS);
          if (id && !seen.has(id)) {
            record(await this.#engine.capture(id), id);
            seen.add(id);
          }
          scan.time = time;
          scan.visitId = visitId;
        }
        if (rows.length < pageLimit) {
          scan.stage = "mirror";
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

  close() {
    if (!this.#closed) {
      this.#closed = true;
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
