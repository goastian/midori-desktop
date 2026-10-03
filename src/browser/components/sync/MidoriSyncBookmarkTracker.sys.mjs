/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";

const MAX_HINTS = 4096;
const GUID = /^[A-Za-z0-9_-]{12}$/;

export class MidoriSyncBookmarkTracker {
  #engine;
  #adapter;
  #onChange;
  #roots;
  #unsubscribe;
  #dirty = new Map();
  #parents = new Map();
  #revision = 0;
  #inventory = null;
  #rescan = true;
  #busy = false;
  #closed = false;
  #error = null;

  constructor({ engine, adapter, roots, onChange = () => {} }) {
    if (!Array.isArray(roots) || !roots.length || roots.length > 4 || roots.some(id => !GUID.test(id)) ||
        typeof onChange !== "function") {
      throw new SyncProtocolError("invalid_bookmark_query");
    }
    this.#engine = engine;
    this.#adapter = adapter;
    this.#onChange = onChange;
    this.#roots = [...roots];
    this.#unsubscribe = adapter.observe(event => {
      if (this.#closed) {
        return;
      }
      this.#remember(event.id);
      for (const id of event.parents) {
        if (this.#parents.has(id) || this.#dirty.size + this.#parents.size < MAX_HINTS) {
          this.#parents.set(id, { index: 0 });
        } else {
          this.#rescan = true;
        }
      }
      this.#rescan ||= event.subtree;
      this.#onChange();
    });
  }

  get snapshot() {
    return Object.freeze({ busy: this.#busy, closed: this.#closed, error: this.#error,
      dirty: this.#dirty.size, parents: this.#parents.size,
      inventory: this.#inventory !== null || this.#rescan,
      more: !!(this.#dirty.size || this.#parents.size || this.#inventory || this.#rescan) });
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
    const record = (id, result) => {
      this.#ensureOpen();
      ++progress.checked;
      if (result.status === "queued") {
        ++progress.queued;
      } else if (result.status === "pending") {
        ++progress.pending;
        this.#remember(id);
      } else if (result.status === "conflict") {
        ++progress.conflicts;
      } else if (result.status !== "unchanged") {
        throw new SyncProtocolError("invalid_adapter_result");
      }
    };
    try {
      for (const [id, revision] of [...this.#dirty].slice(0, limit)) {
        const result = await this.#engine.capture(id);
        record(id, result);
        if (result.status !== "pending" && this.#dirty.get(id) === revision) {
          this.#dirty.delete(id);
        }
      }
      for (const [parent, cursor] of this.#parents) {
        if (progress.checked >= limit) {
          break;
        }
        const page = await this.#readPage(parent, cursor.index, Math.min(25, limit - progress.checked));
        for (const entry of page.entries) {
          record(entry.id, await this.#engine.capture(entry.id));
        }
        if (!page.entries.length) {
          ++progress.checked;
        }
        if (this.#parents.get(parent) === cursor) {
          if (page.nextIndex === null) {
            this.#parents.delete(parent);
          } else {
            cursor.index = page.nextIndex;
          }
        }
      }
      if (!this.#inventory && this.#rescan) {
        this.#rescan = false;
        this.#inventory = { root: 0, stack: [], stage: "local", after: null };
      }
      while (this.#inventory && progress.checked < limit) {
        this.#ensureOpen();
        const scan = this.#inventory;
        if (scan.stage === "local") {
          if (!scan.stack.length) {
            if (scan.root === this.#roots.length) {
              scan.stage = "mirror";
              continue;
            }
            scan.stack.push({ id: this.#roots[scan.root++], index: 0 });
          }
          const frame = scan.stack.at(-1);
          const page = await this.#readPage(frame.id, frame.index, 1);
          const entry = page.entries[0];
          if (!entry) {
            scan.stack.pop();
            ++progress.checked;
            continue;
          }
          record(entry.id, await this.#engine.capture(entry.id));
          ++frame.index;
          if (entry.value.kind === "folder") {
            if (scan.stack.length >= 256 || scan.stack.some(item => item.id === entry.id)) {
              throw new SyncProtocolError("bookmark_tree_too_deep");
            }
            scan.stack.push({ id: entry.id, index: 0 });
          }
        } else {
          const page = await this.#engine.capturePage({ after: scan.after, limit: limit - progress.checked });
          this.#ensureOpen();
          for (const result of page.results) {
            record(result.id, result);
          }
          scan.after = page.nextAfter;
          if (scan.after === null) {
            this.#inventory = null;
          }
        }
      }
      this.#ensureOpen();
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
      this.#parents.clear();
      this.#inventory = null;
      this.#rescan = false;
    }
  }

  #remember(id) {
    if (!this.#closed) {
      if (this.#dirty.has(id) || this.#dirty.size + this.#parents.size < MAX_HINTS) {
        this.#dirty.delete(id);
        this.#dirty.set(id, ++this.#revision);
      } else {
        this.#rescan = true;
      }
    }
  }

  async #readPage(parent, index, limit) {
    this.#ensureOpen();
    try {
      const page = await this.#adapter.readPage(parent, { index, limit });
      this.#ensureOpen();
      return page;
    } catch (error) {
      this.#ensureOpen();
      if (["bookmark_parent_missing", "bookmark_outside_roots"].includes(error.code)) {
        return { entries: [], nextIndex: null };
      }
      throw error;
    }
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncProtocolError("cancelled");
    }
  }
}
