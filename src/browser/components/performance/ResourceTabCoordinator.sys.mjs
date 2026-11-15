/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

const lazy = {};
const tabIds = new WeakMap();
const protectionQueries = new WeakSet();
let nextTabId = 0;

function tabId(tab) {
  if (!tabIds.has(tab)) tabIds.set(tab, String(++nextTabId));
  return tabIds.get(tab);
}

function processIds(tab) {
  const result = new Set();
  const visit = context => {
    if (context?.currentWindowGlobal?.osPid) result.add(context.currentWindowGlobal.osPid);
    for (const child of context?.children || []) visit(child);
  };
  try { visit(tab.linkedBrowser?.browsingContext); } catch { result.clear(); }
  return result;
}
ChromeUtils.defineESModuleGetters(lazy, {
  PrivateBrowsingUtils: 'resource://gre/modules/PrivateBrowsingUtils.sys.mjs',
  webrtcUI: 'resource:///modules/webrtcUI.sys.mjs',
  clearTimeout: 'resource://gre/modules/Timer.sys.mjs',
  setTimeout: 'resource://gre/modules/Timer.sys.mjs',
});

export const ResourceTabCoordinator = {
  _pending: null,
  _actorRegistered: false,
  _lastReclaimAttempt: new WeakMap(),
  _reclaimSequence: 0,

  describeTabs(win, sample, order = 'memory') {
    if (!win?.gBrowser || !sample) return [];
    const processes = new Map(sample.processes.map(process => [process.pid, process]));
    const memberships = new Map();
    const counts = new Map();
    for (const browserWindow of Services.wm.getEnumerator('navigator:browser')) {
      for (const tab of browserWindow.gBrowser?.tabs || []) {
        const pids = processIds(tab);
        memberships.set(tab, pids);
        for (const pid of pids) counts.set(pid, (counts.get(pid) || 0) + 1);
      }
    }
    const rows = [];
    for (const tab of win.gBrowser.tabs) {
      if (!['http', 'https'].includes(tab.linkedBrowser?.currentURI?.scheme) || tab.hasAttribute('pending')) continue;
      const pids = [...(memberships.get(tab) || [])];
      const complete = pids.length && pids.every(pid => processes.has(pid));
      const entries = pids.map(pid => processes.get(pid)).filter(Boolean);
      rows.push({
        tab,
        id: tabId(tab),
        title: tab.getAttribute('label'),
        shared: pids.some(pid => counts.get(pid) > 1),
        memoryBytes: complete ? entries.reduce((total, process) => total + process.memoryBytes, 0) : null,
        cpuPercent: complete && entries.every(process => process.cpuPercent !== null)
          ? entries.reduce((total, process) => total + process.cpuPercent, 0) : null,
      });
    }
    return rows.sort((a, b) => (b[order === 'cpu' ? 'cpuPercent' : 'memoryBytes'] ?? -1) -
      (a[order === 'cpu' ? 'cpuPercent' : 'memoryBytes'] ?? -1)).slice(0, 8)
      .map(({ tab, ...row }) => ({ ...row, canSuspend: this.isEligible(tab) }));
  },

  findTab(win, id) {
    return [...(win?.gBrowser?.tabs || [])].find(tab => tabIds.get(tab) === id && !tab.closing) || null;
  },

  _registerActor() {
    if (!this._actorRegistered) {
      ChromeUtils.registerWindowActor('MidoriResourceTab', {
        child: { esModuleURI: 'resource:///modules/ResourceTabChild.sys.mjs' },
        allFrames: true,
        remoteTypes: ['web'],
        safeForUntrustedWebProcess: true,
      });
      this._actorRegistered = true;
    }
  },

  async hasProtectedState(tab, onUncertain = () => {}) {
    this._registerActor();
    const deadlineAt = ChromeUtils.now() + 1000;
    let timer;
    const deadline = new Promise(resolve => {
      timer = lazy.setTimeout(() => { onUncertain(); resolve(true); }, 1000);
    });
    const check = async context => {
      if (ChromeUtils.now() >= deadlineAt) { onUncertain(); return true; }
      const global = context.currentWindowGlobal;
      if (!global || protectionQueries.has(global)) { onUncertain(); return true; }
      protectionQueries.add(global);
      let protectedState;
      try {
        protectedState = await global.getActor('MidoriResourceTab').sendQuery('MidoriResourceTab:Protected');
      } finally {
        protectionQueries.delete(global);
      }
      if (ChromeUtils.now() >= deadlineAt) { onUncertain(); return true; }
      if (protectedState) return true;
      for (const child of context.children) {
        if (await check(child)) return true;
      }
      return false;
    };
    try {
      return await Promise.race([check(tab.linkedBrowser.browsingContext), deadline]);
    } catch (error) {
      onUncertain();
      console.error('MidoriResourceTab: protection check failed', error);
      return true;
    } finally {
      lazy.clearTimeout(timer);
    }
  },

  async inspectForPause(tab, { includeForms = true } = {}) {
    this._registerActor();
    const forms = [];
    let expired = false;
    let timer;
    const deadline = new Promise(resolve => {
      timer = lazy.setTimeout(() => { expired = true; resolve(true); }, 1000);
    });
    const check = async context => {
      if (expired) return true;
      const global = context.currentWindowGlobal;
      if (!global) return true;
      const state = await global.getActor('MidoriResourceTab').sendQuery(includeForms ?
        'MidoriResourceTab:PauseState' : 'MidoriResourceTab:PauseProtection');
      if (expired || (includeForms ? state.protected : state)) return true;
      if (includeForms) forms.push(...state.forms);
      for (const child of context.children) if (await check(child)) return true;
      return false;
    };
    try {
      return { protected: await Promise.race([check(tab.linkedBrowser.browsingContext), deadline]), forms };
    } catch (error) {
      console.error('MidoriResourceTab: pause check failed', error);
      return { protected: true, forms: [] };
    } finally {
      lazy.clearTimeout(timer);
    }
  },

  async persistForPause(tab, canContinue = () => true) {
    let expired = false;
    let timer;
    const deadline = new Promise(resolve => {
      timer = lazy.setTimeout(() => { expired = true; resolve(false); }, 1000);
    });
    const persist = async context => {
      if (expired || !canContinue()) return false;
      const global = context.currentWindowGlobal;
      if (!global) return false;
      if (!await global.getActor('MidoriResourceTab').sendQuery('MidoriResourceTab:PersistHistory')) return false;
      if (expired || !canContinue()) return false;
      for (const child of context.children) if (!await persist(child)) return false;
      return true;
    };
    try {
      return await Promise.race([persist(tab.linkedBrowser.browsingContext), deadline]);
    } catch (error) {
      console.error('MidoriResourceTab: history persistence failed', error);
      return false;
    } finally {
      lazy.clearTimeout(timer);
    }
  },

  isEligible(tab) {
    try {
      const browser = tab?.linkedBrowser;
      if (!browser?.browsingContext || !browser?.isConnected || !tab.linkedPanel || tab.selected || tab.multiselected ||
        tab.pinned || tab.closing || tab.undiscardable || tab.autoDiscardable === false ||
        tab.soundPlaying || tab.pictureinpicture || tab.attention || browser.hasBeforeUnload ||
        tab.hasAttribute('pending') || tab.hasAttribute('busy') ||
        tab.hasAttribute('discarded') || tab.hasAttribute('sharing')) return false;
      if (lazy.PrivateBrowsingUtils.isBrowserPrivate(browser) ||
          lazy.webrtcUI.browserHasStreams(browser) ||
          browser.browsingContext?.currentWindowGlobal?.hasActivePeerConnections()) return false;
      const uri = browser.currentURI;
      if (!['http', 'https'].includes(uri?.scheme)) return false;
      const excluded = Services.prefs.getStringPref('midori.tabsleep.excludeHosts', '')
        .split(',').map(host => host.trim().toLowerCase());
      if (excluded.includes(uri.host.toLowerCase())) return false;
      if (tab.splitview) return false;
      return true;
    } catch {
      return false;
    }
  },

  reclaimOne(canContinue = () => true, { onExhausted = () => {} } = {}) {
    this._pending ||= this._withDiscardDeadline(active => this._reclaimOne(active, onExhausted), canContinue)
      .finally(() => { this._pending = null; });
    return this._pending;
  },

  discardTab(tab, canContinue = () => true) {
    if (this._pending) return Promise.resolve(false);
    this._pending = this._withDiscardDeadline(active => this._discardTab(tab, active), canContinue)
      .finally(() => { this._pending = null; });
    return this._pending;
  },

  async _withDiscardDeadline(operation, canContinue) {
    const deadlineAt = ChromeUtils.now() + 2000;
    let active = true;
    let timer;
    const deadline = new Promise(resolve => {
      timer = lazy.setTimeout(() => { active = false; resolve(false); }, 2000);
    });
    try {
      return await Promise.race([
        operation(() => active && ChromeUtils.now() < deadlineAt && canContinue()),
        deadline,
      ]);
    } finally {
      active = false;
      lazy.clearTimeout(timer);
    }
  },

  async _discardTab(tab, canContinue, onUncertain = () => {}) {
    if (!canContinue() || !this.isEligible(tab) || await this.hasProtectedState(tab, onUncertain)) return false;
    const browser = tab.linkedBrowser;
    const tabbrowser = tab.ownerDocument.defaultView.gBrowser;
    await tabbrowser.prepareDiscardBrowser(tab);
    if (browser !== tab.linkedBrowser || !canContinue() || !this.isEligible(tab) ||
        await this.hasProtectedState(tab, onUncertain)) return false;
    return canContinue() && this.isEligible(tab) && tabbrowser.discardBrowser(tab);
  },

  async _reclaimOne(canContinue, onExhausted) {
    const candidates = [];
    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      if (!win.gBrowser) continue;
      for (const tab of win.gBrowser.tabs) {
        if (this.isEligible(tab) && Date.now() - tab.lastAccessed >= 60000) candidates.push(tab);
      }
    }
    candidates.sort((a, b) => (this._lastReclaimAttempt.get(a) || 0) -
      (this._lastReclaimAttempt.get(b) || 0) || a.lastAccessed - b.lastAccessed);
    let uncertain = false;
    const onUncertain = () => { uncertain = true; };
    for (const tab of candidates) {
      if (!canContinue()) return false;
      this._lastReclaimAttempt.set(tab, ++this._reclaimSequence);
      if (await this._discardTab(tab, canContinue, onUncertain)) return true;
    }
    if (canContinue() && !uncertain) onExhausted();
    return false;
  },
};
