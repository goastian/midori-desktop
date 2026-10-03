/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";

const MAX_HINTS = 4096;

export class MidoriSyncRecordTracker {
  #engine;
  #adapter;
  #onChange;
  #unsubscribe;
  #dirty = new Map();
  #revision = 0;
  #inventory = null;
  #rescan = true;
  #busy = false;
  #closed = false;
  #error = null;

  constructor({ engine, adapter, onChange = () => {} }) {
    if (typeof onChange !== "function") {
      throw new SyncProtocolError("invalid_capture_query");
    }
    this.#engine = engine;
    this.#adapter = adapter;
    this.#onChange = onChange;
    this.#unsubscribe = adapter.observe(event => {
      if (this.#closed) {
        return;
      }
      this.#onChange();
      if (event.rescan) {
        this.#rescan = true;
      } else if (this.#dirty.size >= MAX_HINTS && !this.#dirty.has(event.id)) {
        this.#rescan = true;
      } else {
        this.#dirty.delete(event.id);
        this.#dirty.set(event.id, ++this.#revision);
      }
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

  async run({ limit = 100 } = {}) {
    this.#ensureOpen();
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new SyncProtocolError("invalid_capture_query");
    }
    if (this.#busy) {
      throw new SyncProtocolError("busy");
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
        const ids = await this.#adapter.listIds();
        this.#ensureOpen();
        this.#rescan = false;
        this.#inventory = { ids, index: 0, stage: "local", after: null };
      }
      while (this.#inventory && progress.checked < limit) {
        const scan = this.#inventory;
        if (scan.stage === "local") {
          if (scan.index >= scan.ids.length) {
            scan.ids = [];
            scan.stage = "mirror";
            continue;
          }
          const id = scan.ids[scan.index];
          record(await this.#engine.capture(id), id);
          ++scan.index;
        } else {
          const page = await this.#engine.capturePage({ after: scan.after, limit: limit - progress.checked });
          this.#ensureOpen();
          for (const result of page.results) {
            record(result, result.id);
          }
          scan.after = page.nextAfter;
          if (scan.after === null) {
            this.#inventory = null;
          }
          break;
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

export const MidoriSyncPasswordTracker = MidoriSyncRecordTracker;
