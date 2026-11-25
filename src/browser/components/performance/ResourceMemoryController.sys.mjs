/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ResourceSampler } from 'resource:///modules/ResourceSampler.sys.mjs';

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ResourcePausedTab: 'resource:///modules/ResourcePausedTab.sys.mjs',
  ResourceTabCoordinator: 'resource:///modules/ResourceTabCoordinator.sys.mjs',
  setTimeout: 'resource://gre/modules/Timer.sys.mjs',
});

function candidates(sample, attempted, lastAttempt) {
  const memory = new Map(sample.processes.map(process => [process.pid, process.memoryBytes]));
  const tabs = [];
  const owners = new Map();
  for (const win of Services.wm.getEnumerator('navigator:browser')) {
    for (const tab of win.gBrowser?.tabs || []) {
      const pids = new Set();
      const visit = context => {
        const pid = context?.currentWindowGlobal?.osPid;
        if (pid) pids.add(pid);
        for (const child of context?.children || []) visit(child);
      };
      visit(tab.linkedBrowser?.browsingContext);
      tabs.push({ tab, pids });
      for (const pid of pids) owners.set(pid, (owners.get(pid) || 0) + 1);
    }
  }
  return tabs.filter(({ tab }) => !attempted.has(tab.linkedBrowser.permanentKey) &&
    lazy.ResourcePausedTab.isEligible(tab)).map(({ tab, pids }) => ({
      tab,
      cost: [...pids].reduce((total, pid) => total + (memory.get(pid) || 0) / owners.get(pid), 0),
    })).sort((a, b) => (lastAttempt.get(a.tab.linkedBrowser.permanentKey) || 0) -
      (lastAttempt.get(b.tab.linkedBrowser.permanentKey) || 0) ||
      Number(a.tab.selected) - Number(b.tab.selected) ||
      b.cost - a.cost || a.tab.lastAccessed - b.tab.lastAccessed);
}

const BLOCKED_RETRY_MS = 10000;

export class ResourceMemoryController {
  _generation = 0;
  _reclaiming = false;
  _pending = null;
  _blockedRetry = null;
  _lastAttempt = new WeakMap();
  _attemptSequence = 0;
  _sparesSuppressed = false;
  _spareReserveBytes = 0;

  constructor(sampler = new ResourceSampler()) {
    this._sampler = sampler;
  }

  reset() {
    this._generation++;
    this._reclaiming = false;
    this._blockedRetry = null;
    this._releaseSparePressure();
  }

  _releaseSparePressure() {
    if (this._sparesSuppressed) ChromeUtils.setMemoryBudgetPressure(false);
    this._sparesSuppressed = false;
    this._spareReserveBytes = 0;
  }

  _updateSparePressure(sample, budgetBytes) {
    if (Services.appinfo.OS !== 'Linux' || typeof ChromeUtils.setMemoryBudgetPressure !== 'function') return 0;
    if (this._sparesSuppressed) {
      if (sample.memoryBytes + this._spareReserveBytes < budgetBytes * 0.8) this._releaseSparePressure();
      return 0;
    }
    if (sample.memoryBytes <= budgetBytes * 0.9) return 0;
    const spareBytes = (sample.processes || []).filter(process => process.type === 'preallocated')
      .reduce((total, process) => total + process.memoryBytes, 0);
    const closed = ChromeUtils.setMemoryBudgetPressure(true);
    this._sparesSuppressed = true;
    this._spareReserveBytes = Math.max(spareBytes, closed * 32 * 1024 ** 2);
    return closed;
  }

  recover(memory, { sample = null, resample = () => this._sampler.sample(),
    canContinue = () => true, onReclaim = () => {} } = {}) {
    if (this._pending) throw new Error('memory-recovery-in-progress');
    const generation = this._generation;
    this._pending = this._recover(memory, sample,
      () => generation === this._generation && canContinue(), onReclaim, resample)
      .finally(() => { this._pending = null; });
    return this._pending;
  }

  async _recover(memory, sample, canContinue, onReclaim, resample) {
    if (!memory?.enabled) {
      this._reclaiming = false;
      this._blockedRetry = null;
      this._releaseSparePressure();
      return { state: 'off', reclaimedTabs: 0, sample };
    }
    if (!Number.isSafeInteger(memory.budgetBytes) || memory.budgetBytes <= 0) {
      throw new RangeError('memory-budget');
    }
    sample ||= await resample();
    const result = (state, reclaimedTabs = 0) => ({ state, reclaimedTabs, sample });
    if (!canContinue()) return result('cancelled');
    if (this._updateSparePressure(sample, memory.budgetBytes)) {
      this._reclaiming = true;
      this._blockedRetry = null;
      onReclaim();
      if (!memory.strict) return result('reclaiming');
      await new Promise(resolve => lazy.setTimeout(resolve, 200));
      if (!canContinue()) return result('cancelled');
      sample = await resample();
    }
    this._reclaiming = sample.memoryBytes > memory.budgetBytes * (this._reclaiming ? 0.85 : 0.9);
    if (!this._reclaiming) {
      this._blockedRetry = null;
      return result('monitoring');
    }
    if (!memory.strict && this._blockedRetry?.budgetBytes === memory.budgetBytes &&
        ChromeUtils.now() < this._blockedRetry.until) return result('blocked');
    onReclaim();
    if (!memory.strict) {
      let exhausted = false;
      const reclaimed = await lazy.ResourceTabCoordinator.reclaimOne(canContinue, {
        onExhausted: () => { exhausted = true; },
      });
      const active = canContinue();
      this._blockedRetry = active && exhausted && !reclaimed
        ? { budgetBytes: memory.budgetBytes, until: ChromeUtils.now() + BLOCKED_RETRY_MS } : null;
      return result(active ? reclaimed ? 'reclaiming' : 'blocked' : 'cancelled', Number(reclaimed));
    }
    const attempted = new Set();
    let reclaimed = 0;
    let exhausted = false;
    let ready = [];
    while (sample.memoryBytes > memory.budgetBytes * 0.85 && reclaimed < 4) {
      if (!canContinue()) return result('cancelled', reclaimed);
      if (!ready.length) {
        if (attempted.size >= 16) break;
        const batch = candidates(sample, attempted, this._lastAttempt).slice(0, 16 - attempted.size);
        if (!batch.length) {
          exhausted = true;
          break;
        }
        for (const { tab } of batch) {
          attempted.add(tab.linkedBrowser.permanentKey);
          this._lastAttempt.set(tab.linkedBrowser.permanentKey, ++this._attemptSequence);
        }
        const states = await Promise.all(batch.map(({ tab }) =>
          lazy.ResourceTabCoordinator.inspectForPause(tab, { includeForms: false })));
        if (!canContinue()) return result('cancelled', reclaimed);
        ready = batch.filter((_, index) => !states[index].protected).map(({ tab }) => tab);
        continue;
      }
      const next = ready.shift();
      if (await lazy.ResourcePausedTab.pause(next, canContinue)) {
        reclaimed++;
        await new Promise(resolve => lazy.setTimeout(resolve, 200));
        if (!canContinue()) return result('cancelled', reclaimed);
        sample = await resample();
      }
    }
    if (!canContinue()) return result('cancelled', reclaimed);
    this._reclaiming = sample.memoryBytes > memory.budgetBytes * 0.85;
    return result(this._reclaiming ? exhausted ? 'blocked' : 'reclaiming' : 'monitoring', reclaimed);
  }
}
