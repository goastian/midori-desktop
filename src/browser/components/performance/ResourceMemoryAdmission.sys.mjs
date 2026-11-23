/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const TOPIC = 'midori-memory-admission';
const LOAD_RESERVE_BYTES = 32 * 1024 * 1024;

export class ResourceMemoryAdmission {
  QueryInterface = ChromeUtils.generateQI(['nsIObserver']);
  _active = false;
  _pending = new Map();
  _loads = new Map();
  _generation = 0;
  _draining = false;
  _drainAgain = false;
  _refreshAfterLoad = 0;

  constructor(prepareLoad, readBudget = null) {
    this._prepareLoad = prepareLoad;
    this._readBudget = readBudget;
  }

  get reservedBytes() {
    return this._loads.size * LOAD_RESERVE_BYTES;
  }

  configure(enabled) {
    if (enabled === this._active) {
      if (enabled && this._readBudget) this._drain();
      return;
    }
    this._generation++;
    this._active = enabled;
    this._draining = false;
    this._drainAgain = false;
    if (enabled) {
      Services.obs.addObserver(this, TOPIC);
      Services.obs.addObserver(this, 'xpcom-will-shutdown');
      if (this._readBudget) Services.obs.addObserver(this, 'browsing-context-discarded');
    } else {
      Services.obs.removeObserver(this, TOPIC);
      Services.obs.removeObserver(this, 'xpcom-will-shutdown');
      if (this._readBudget) Services.obs.removeObserver(this, 'browsing-context-discarded');
      const pending = [...this._pending.values()];
      this._pending.clear();
      for (const entry of this._loads.values()) this._releaseLoad(entry, false);
      for (const entry of pending) entry.allow.run();
    }
  }

  observe(subject, topic, data) {
    if (topic === 'browsing-context-discarded') {
      if (data === 'replace') return;
      for (const entry of this._loads.values()) {
        if (entry.contextId === subject.id) this._releaseLoad(entry);
      }
      return;
    }
    if (topic === 'xpcom-will-shutdown') {
      const pending = [...this._pending.values()];
      this._pending.clear();
      for (const entry of pending) entry.deny.run();
      this.configure(false);
      return;
    }
    const bag = subject.QueryInterface(Ci.nsIPropertyBag2);
    const id = bag.getPropertyAsAString('id');
    if (data === 'settled') {
      const entry = this._pending.get(id);
      this._pending.delete(id);
      if (entry && this._readBudget) {
        if (bag.getPropertyAsBool('admitted')) this._reserve(entry);
        else this._releaseLoad(entry);
        if (!entry.releasing) this._drain();
      }
      return;
    }
    const entry = { id, allow: bag.getPropertyAsInterface('allow', Ci.nsIRunnable),
      deny: bag.getPropertyAsInterface('deny', Ci.nsIRunnable) };
    this._pending.set(id, entry);
    if (this._readBudget) {
      entry.contextId = bag.getPropertyAsUint64('browsingContextId');
      entry.channelId = bag.getPropertyAsUint64('channelId');
      for (const load of this._loads.values()) {
        if (load.contextId === entry.contextId) this._releaseLoad(load, false);
      }
      this._drain();
      return;
    }
    const release = () => {
      if (this._pending.get(id) === entry) entry.allow.run();
    };
    try {
      const pending = this._prepareLoad();
      if (pending) Promise.resolve(pending).then(release, release);
      else release();
    } catch {
      release();
    }
  }

  async _drain() {
    if (!this._active || !this._readBudget) return;
    if (this._draining) {
      this._drainAgain = true;
      return;
    }
    const generation = this._generation;
    this._draining = true;
    try {
      do {
        this._drainAgain = false;
        while (this._active && this._pending.size) {
          const entry = this._pending.values().next().value;
          const refresh = this._refreshAfterLoad;
          try {
            await this._prepareLoad({ reservedBytes: this.reservedBytes + LOAD_RESERVE_BYTES,
              forceSample: !!refresh });
          } catch {}
          if (!this._active || generation !== this._generation) return;
          if (this._refreshAfterLoad === refresh) this._refreshAfterLoad = 0;
          if (this._pending.get(entry.id) !== entry) continue;
          const budget = this._readBudget();
          if (this._loads.size && budget &&
              budget.memoryBytes + this.reservedBytes + LOAD_RESERVE_BYTES > budget.budgetBytes * 0.85) break;
          this._reserve(entry);
          entry.releasing = true;
          entry.allow.run();
        }
      } while (this._drainAgain && this._active);
    } finally {
      if (generation === this._generation) this._draining = false;
    }
  }

  _reserve(entry) {
    if (this._loads.has(entry.id)) return;
    try {
      const context = BrowsingContext.get(entry.contextId);
      const progress = context?.webProgress;
      if (!progress) return;
      const previousWindow = context.currentWindowGlobal;
      const listener = {
        QueryInterface: ChromeUtils.generateQI(['nsIWebProgressListener', 'nsISupportsWeakReference']),
        onStateChange: (webProgress, request, flags) => {
          const state = Ci.nsIWebProgressListener;
          if (!webProgress.isTopLevel || !(flags & state.STATE_STOP) || !(flags & state.STATE_IS_WINDOW)) return;
          let channelId;
          try { channelId = request?.QueryInterface(Ci.nsIIdentChannel).channelId; } catch {}
          if ((entry.channelId && channelId === entry.channelId) || webProgress.browsingContext.currentWindowGlobal !== previousWindow) {
            this._releaseLoad(entry);
          }
        },
      };
      progress.addProgressListener(listener, Ci.nsIWebProgress.NOTIFY_STATE_WINDOW);
      entry.progress = progress;
      entry.listener = listener;
      this._loads.set(entry.id, entry);
    } catch (error) {
      console.error(error);
    }
  }

  _releaseLoad(entry, drain = true) {
    if (this._loads.get(entry.id) !== entry) return;
    this._loads.delete(entry.id);
    try { entry.progress.removeProgressListener(entry.listener); } catch {}
    entry.progress = entry.listener = null;
    this._refreshAfterLoad++;
    if (drain) this._drain();
  }
}
