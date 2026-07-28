/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { isRegularBrowserWindow } from 'resource:///modules/MidoriWebAppUtils.sys.mjs';

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  TabSleepLifecycle: 'resource:///modules/TabSleepLifecycle.sys.mjs',
  clearTimeout: 'resource://gre/modules/Timer.sys.mjs',
  setTimeout: 'resource://gre/modules/Timer.sys.mjs',
});

const PREF_ENABLED = 'midori.tabsleep.enabled';
const PREF_TIMEOUT_MINUTES = 'midori.tabsleep.timeoutMinutes';
const PREF_EXCLUDE_HOSTS = 'midori.tabsleep.excludeHosts';

const TAB_EVENT_TYPES = [
  'TabAttrModified',
  'TabOpen',
  'TabClose',
  'TabSelect',
  'TabPinned',
  'TabUnpinned',
  'TabBrowserDiscarded',
];

function getTabForBrowser(browser) {
  try {
    return browser?.ownerGlobal?.gBrowser?.getTabForBrowser(browser) || null;
  } catch {
    return null;
  }
}

export const MidoriTabSleep = {
  _initialized: false,
  _enabled: false,
  _timeoutMs: 600000,
  _excludeHosts: [],
  _windowState: new WeakMap(),
  _attachedWindowCount: 0,
  _lastActivity: new WeakMap(),
  _timer: null,

  init() {
    if (this._initialized) {
      return;
    }

    this._initialized = true;

    Services.prefs.addObserver(PREF_ENABLED, this);
    Services.prefs.addObserver(PREF_TIMEOUT_MINUTES, this);
    Services.prefs.addObserver(PREF_EXCLUDE_HOSTS, this);

    Services.obs.addObserver(this, 'browser-delayed-startup-finished');
    Services.obs.addObserver(this, 'domwindowclosed');

    this._refreshPrefs();
  },

  uninit() {
    if (!this._initialized) {
      return;
    }

    this._initialized = false;
    this._enabled = false;
    this._clearTimer();

    try {
      Services.prefs.removeObserver(PREF_ENABLED, this);
      Services.prefs.removeObserver(PREF_TIMEOUT_MINUTES, this);
      Services.prefs.removeObserver(PREF_EXCLUDE_HOSTS, this);
      Services.obs.removeObserver(this, 'browser-delayed-startup-finished');
      Services.obs.removeObserver(this, 'domwindowclosed');
    } catch {}

    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      this._cleanupWindow(win);
    }
    this._attachedWindowCount = 0;
  },

  observe(subject, topic) {
    if (topic === 'nsPref:changed') {
      this._refreshPrefs();
      return;
    }

    if (topic === 'browser-delayed-startup-finished') {
      if (this._enabled && isRegularBrowserWindow(subject)) {
        this._attachWindow(subject);
        this._scheduleNextEvaluation();
      }
      return;
    }

    if (topic === 'domwindowclosed' && this._windowState.has(subject)) {
      this._cleanupWindow(subject);
      this._scheduleNextEvaluation();
    }
  },

  _refreshPrefs() {
    this._enabled = Services.prefs.getBoolPref(PREF_ENABLED, false);
    this._timeoutMs = lazy.TabSleepLifecycle.getTimeoutMs(
      Services.prefs.getIntPref(
        PREF_TIMEOUT_MINUTES,
        lazy.TabSleepLifecycle.DEFAULT_TIMEOUT_MINUTES
      )
    );
    this._excludeHosts = lazy.TabSleepLifecycle.normalizeHosts(
      Services.prefs.getStringPref(PREF_EXCLUDE_HOSTS, '')
    );

    if (!this._enabled) {
      this._clearTimer();
      for (const win of Services.wm.getEnumerator('navigator:browser')) {
        this._cleanupWindow(win);
      }
      this._attachedWindowCount = 0;
      return;
    }

    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      if (isRegularBrowserWindow(win) && win.document.readyState === 'complete') {
        this._attachWindow(win);
      }
    }

    this._scheduleNextEvaluation();
  },

  _attachWindow(win) {
    if (!isRegularBrowserWindow(win) || this._windowState.has(win)) {
      return;
    }

    const eventListener = (event) => this._handleTabEvent(event);
    const progressListener = {
      onStateChange(browser, webProgress, _request, stateFlags) {
        if (!webProgress.isTopLevel) {
          return;
        }

        if (!(stateFlags & Ci.nsIWebProgressListener.STATE_STOP)) {
          return;
        }

        const tab = getTabForBrowser(browser);
        if (tab) {
          MidoriTabSleep._markTabActive(tab);
          MidoriTabSleep._scheduleNextEvaluation();
        }
      },

      onLocationChange(browser, webProgress) {
        if (!webProgress.isTopLevel) {
          return;
        }

        const tab = getTabForBrowser(browser);
        if (tab) {
          MidoriTabSleep._markTabActive(tab);
          MidoriTabSleep._scheduleNextEvaluation();
        }
      },
    };

    for (const type of TAB_EVENT_TYPES) {
      win.addEventListener(type, eventListener, true);
    }
    win.gBrowser.addTabsProgressListener(progressListener);

    this._windowState.set(win, { eventListener, progressListener });
    this._attachedWindowCount += 1;

    const now = Date.now();
    for (const tab of win.gBrowser.tabs) {
      this._markTabActive(tab, now);
    }
  },

  _cleanupWindow(win) {
    const state = this._windowState.get(win);
    if (!state) {
      return;
    }

    for (const type of TAB_EVENT_TYPES) {
      try {
        win.removeEventListener(type, state.eventListener, true);
      } catch {}
    }

    try {
      win.gBrowser.removeTabsProgressListener(state.progressListener);
    } catch {}

    this._windowState.delete(win);
    this._attachedWindowCount = Math.max(0, this._attachedWindowCount - 1);
  },

  _handleTabEvent(event) {
    const tab = event.target;
    if (!tab) {
      return;
    }

    switch (event.type) {
      case 'TabAttrModified': {
        const changed = event.detail?.changed || [];
        if (
          changed.includes('busy') ||
          changed.includes('label') ||
          changed.includes('soundplaying') ||
          changed.includes('muted') ||
          changed.includes('attention')
        ) {
          this._markTabActive(tab);
        }
        break;
      }
      case 'TabClose':
        this._lastActivity.delete(tab);
        break;
      default:
        this._markTabActive(tab);
        break;
    }

    this._scheduleNextEvaluation();
  },

  _markTabActive(tab, ts = Date.now()) {
    this._lastActivity.set(tab, ts);
  },

  _getTabState(tab, now) {
    let uriSpec = '';
    let host = '';

    try {
      const uri = tab.linkedBrowser?.currentURI;
      uriSpec = uri?.spec || '';
      host = uri?.hostPort || '';
    } catch {}

    return {
      now,
      timeoutMs: this._timeoutMs,
      lastActivityAt: this._lastActivity.get(tab),
      lastAccessedAt: tab.lastAccessed,
      selected: !!tab.selected,
      multiselected: !!tab.multiselected,
      pinned: !!tab.pinned,
      closing: !!tab.closing,
      discarded: tab.getAttribute?.('discarded') === 'true',
      busy: tab.getAttribute?.('busy') === 'true',
      soundPlaying: !!tab.soundPlaying,
      attention: !!tab.attention,
      hasBeforeUnload: !!tab.linkedBrowser?.hasBeforeUnload,
      hasLinkedPanel: !!tab.linkedPanel,
      autoDiscardable: tab.autoDiscardable !== false,
      uriSpec,
      host,
      excludedHosts: this._excludeHosts,
    };
  },

  _collectCandidates(now) {
    const candidates = [];

    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      if (!isRegularBrowserWindow(win)) {
        continue;
      }

      for (const tab of win.gBrowser.tabs) {
        const state = this._getTabState(tab, now);
        if (
          state.selected ||
          state.multiselected ||
          state.pinned ||
          state.closing ||
          state.discarded ||
          state.busy ||
          state.soundPlaying ||
          state.attention ||
          state.hasBeforeUnload ||
          !state.hasLinkedPanel ||
          state.autoDiscardable === false ||
          lazy.TabSleepLifecycle.isUriExcluded(state.uriSpec) ||
          lazy.TabSleepLifecycle.isHostExcluded(state.host, this._excludeHosts)
        ) {
          continue;
        }

        candidates.push({
          lastActivityAt: state.lastActivityAt,
          lastAccessedAt: state.lastAccessedAt,
        });
      }
    }

    return candidates;
  },

  _evaluateTabs() {
    if (!this._enabled) {
      this._clearTimer();
      return;
    }

    const now = Date.now();
    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      if (!isRegularBrowserWindow(win)) {
        continue;
      }

      for (const tab of win.gBrowser.tabs) {
        const state = this._getTabState(tab, now);
        if (!lazy.TabSleepLifecycle.shouldDiscardTab(state)) {
          continue;
        }

        try {
          win.gBrowser.discardBrowser(tab);
        } catch (error) {
          console.error('MidoriTabSleep: Failed to discard tab', error);
        }
      }
    }

    this._scheduleNextEvaluation();
  },

  _scheduleNextEvaluation() {
    if (
      !lazy.TabSleepLifecycle.shouldScheduleEvaluation({
        initialized: this._initialized,
        enabled: this._enabled,
        attachedWindowCount: this._attachedWindowCount,
      })
    ) {
      this._clearTimer();
      return;
    }

    const now = Date.now();
    const delayMs = lazy.TabSleepLifecycle.getNextEvaluationDelayMs({
      now,
      timeoutMs: this._timeoutMs,
      candidates: this._collectCandidates(now),
    });
    this._armTimer(delayMs);
  },

  _armTimer(delayMs) {
    this._clearTimer();
    this._timer = lazy.setTimeout(() => {
      this._timer = null;
      this._evaluateTabs();
    }, delayMs);
  },

  _clearTimer() {
    if (this._timer === null) {
      return;
    }

    try {
      lazy.clearTimeout(this._timer);
    } catch {}
    this._timer = null;
  },
};
