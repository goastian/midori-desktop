/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const MIGRATION_PREF = 'midori.smoothScroll.migrationVersion';
const MIGRATION_VERSION = 1;

const PREF_TYPES = Object.freeze({
  'general.smoothScroll.currentVelocityWeighting': 'string',
  'general.smoothScroll.msdPhysics.continuousMotionMaxDeltaMS': 'int',
  'general.smoothScroll.msdPhysics.enabled': 'bool',
  'general.smoothScroll.msdPhysics.motionBeginSpringConstant': 'int',
  'general.smoothScroll.msdPhysics.regularSpringConstant': 'int',
  'general.smoothScroll.msdPhysics.slowdownMinDeltaMS': 'int',
  'general.smoothScroll.msdPhysics.slowdownMinDeltaRatio': 'string',
  'general.smoothScroll.msdPhysics.slowdownSpringConstant': 'int',
  'general.smoothScroll.stopDecelerationWeighting': 'string',
  'mousewheel.default.delta_multiplier_y': 'int',
});

const PROFILE_OVERRIDES = Object.freeze({
  '60hz': Object.freeze({}),
  '90hz': Object.freeze({
    'general.smoothScroll.msdPhysics.enabled': true,
    'mousewheel.default.delta_multiplier_y': 300,
  }),
  '120hz': Object.freeze({
    'general.smoothScroll.currentVelocityWeighting': '1',
    'general.smoothScroll.msdPhysics.continuousMotionMaxDeltaMS': 12,
    'general.smoothScroll.msdPhysics.enabled': true,
    'general.smoothScroll.msdPhysics.motionBeginSpringConstant': 600,
    'general.smoothScroll.msdPhysics.regularSpringConstant': 650,
    'general.smoothScroll.msdPhysics.slowdownMinDeltaMS': 25,
    'general.smoothScroll.msdPhysics.slowdownMinDeltaRatio': '2',
    'general.smoothScroll.msdPhysics.slowdownSpringConstant': 250,
    'general.smoothScroll.stopDecelerationWeighting': '1',
    'mousewheel.default.delta_multiplier_y': 300,
  }),
});

const LEGACY_FORCED_VALUES = Object.freeze({
  'apz.overscroll.enabled': true,
  'general.smoothScroll': true,
  'general.smoothScroll.currentVelocityWeighting': '1',
  'general.smoothScroll.mouseWheel.durationMinMS': 80,
  'general.smoothScroll.msdPhysics.continuousMotionMaxDeltaMS': 12,
  'general.smoothScroll.msdPhysics.enabled': true,
  'general.smoothScroll.msdPhysics.motionBeginSpringConstant': 600,
  'general.smoothScroll.msdPhysics.regularSpringConstant': 650,
  'general.smoothScroll.msdPhysics.slowdownMinDeltaMS': 25,
  'general.smoothScroll.msdPhysics.slowdownMinDeltaRatio': '2',
  'general.smoothScroll.msdPhysics.slowdownSpringConstant': 250,
  'general.smoothScroll.stopDecelerationWeighting': '1',
  'mousewheel.default.delta_multiplier_y': 300,
  'mousewheel.min_line_scroll_amount': 10,
});

const OBSERVER_TOPICS = Object.freeze([
  'browser-delayed-startup-finished',
  'domwindowclosed',
  'screen-information-changed',
]);

function getPreference(branch, name, type) {
  if (type === 'bool') {
    return branch.getBoolPref(name);
  }
  if (type === 'int') {
    return branch.getIntPref(name);
  }
  return branch.getStringPref(name);
}

function setPreference(branch, name, type, value) {
  if (getPreference(branch, name, type) === value) {
    return;
  }
  if (type === 'bool') {
    branch.setBoolPref(name, value);
  } else if (type === 'int') {
    branch.setIntPref(name, value);
  } else {
    branch.setStringPref(name, value);
  }
}

function isBrowserWindow(win) {
  return (
    !win?.closed &&
    win.document?.documentElement?.getAttribute('windowtype') ===
      'navigator:browser'
  );
}

function readWindowRefreshRate(win) {
  const refreshRate = Number(
    win?.document?.documentElement?.screen?.refreshRate
  );
  return Number.isFinite(refreshRate) && refreshRate > 0 ? refreshRate : 0;
}

export function selectSmoothScrollProfile(refreshRate) {
  if (refreshRate >= 120) {
    return '120hz';
  }
  if (refreshRate >= 90) {
    return '90hz';
  }
  return '60hz';
}

export function migrateLegacySmoothfoxPreferences(preferences) {
  if (preferences.getIntPref(MIGRATION_PREF, 0) >= MIGRATION_VERSION) {
    return false;
  }

  for (const [name, legacyValue] of Object.entries(LEGACY_FORCED_VALUES)) {
    if (!preferences.prefHasUserValue(name)) {
      continue;
    }

    const type = typeof legacyValue;
    let currentValue;
    try {
      currentValue =
        type === 'boolean'
          ? preferences.getBoolPref(name)
          : type === 'number'
            ? preferences.getIntPref(name)
            : preferences.getStringPref(name);
    } catch {
      continue;
    }
    if (currentValue === legacyValue) {
      preferences.clearUserPref(name);
    }
  }

  preferences.setIntPref(MIGRATION_PREF, MIGRATION_VERSION);
  return true;
}

export class MidoriSmoothScrollController {
  constructor({
    defaultBranch,
    observerService,
    windowMediator,
    focusManager,
    scheduleRefresh = callback => callback(),
    isWindowSupported = isBrowserWindow,
    readRefreshRate = readWindowRefreshRate,
  }) {
    this._defaultBranch = defaultBranch;
    this._observerService = observerService;
    this._windowMediator = windowMediator;
    this._focusManager = focusManager;
    this._scheduleRefresh = scheduleRefresh;
    this._isWindowSupported = isWindowSupported;
    this._readRefreshRate = readRefreshRate;
    this._windows = new Set();
    this._basePreferences = null;
    this._initialized = false;
    this._refreshScheduled = false;
    this._activeProfile = null;
    this._detectedRefreshRate = 0;
  }

  init() {
    if (this._initialized) {
      return;
    }

    this._initialized = true;
    this._basePreferences = new Map(
      Object.entries(PREF_TYPES).map(([name, type]) => [
        name,
        getPreference(this._defaultBranch, name, type),
      ])
    );
    for (const topic of OBSERVER_TOPICS) {
      this._observerService.addObserver(this, topic);
    }
    for (const win of this._windowMediator.getEnumerator('navigator:browser')) {
      this._attachWindow(win);
    }
    this.refresh();
  }

  uninit() {
    if (!this._initialized) {
      return;
    }

    this._initialized = false;
    this._refreshScheduled = false;
    for (const topic of OBSERVER_TOPICS) {
      this._observerService.removeObserver(this, topic);
    }
    for (const win of [...this._windows]) {
      this._detachWindow(win);
    }
    this._applyValues(Object.fromEntries(this._basePreferences));
    this._basePreferences = null;
    this._activeProfile = null;
    this._detectedRefreshRate = 0;
  }

  observe(subject, topic) {
    if (topic === 'browser-delayed-startup-finished') {
      this._attachWindow(subject);
    } else if (topic === 'domwindowclosed') {
      this._detachWindow(subject);
    }
    this._scheduleUpdate();
  }

  handleEvent() {
    this._scheduleUpdate();
  }

  refresh() {
    if (!this._initialized) {
      return;
    }

    const win = this._getCurrentWindow();
    try {
      this._detectedRefreshRate = this._readRefreshRate(win);
    } catch {
      this._detectedRefreshRate = 0;
    }
    const profile = selectSmoothScrollProfile(this._detectedRefreshRate);
    const values = {};
    for (const [name, value] of this._basePreferences) {
      values[name] = PROFILE_OVERRIDES[profile][name] ?? value;
    }
    this._applyValues(values);
    this._activeProfile = profile;
  }

  getState() {
    return {
      profile: this._activeProfile,
      refreshRate: this._detectedRefreshRate,
    };
  }

  _getCurrentWindow() {
    const activeWindow = this._focusManager.activeWindow;
    if (this._isWindowSupported(activeWindow)) {
      this._attachWindow(activeWindow);
      return activeWindow;
    }

    const recentWindow = this._windowMediator.getMostRecentWindow(
      'navigator:browser'
    );
    if (this._isWindowSupported(recentWindow)) {
      this._attachWindow(recentWindow);
      return recentWindow;
    }
    return null;
  }

  _attachWindow(win) {
    if (!this._isWindowSupported(win) || this._windows.has(win)) {
      return;
    }

    this._windows.add(win);
    win.addEventListener('activate', this);
    win.addEventListener('sizemodechange', this);
    win.windowRoot?.addEventListener('MozUpdateWindowPos', this);
  }

  _detachWindow(win) {
    if (!this._windows.delete(win)) {
      return;
    }

    win.removeEventListener('activate', this);
    win.removeEventListener('sizemodechange', this);
    win.windowRoot?.removeEventListener('MozUpdateWindowPos', this);
  }

  _scheduleUpdate() {
    if (!this._initialized || this._refreshScheduled) {
      return;
    }

    this._refreshScheduled = true;
    this._scheduleRefresh(() => {
      this._refreshScheduled = false;
      this.refresh();
    });
  }

  _applyValues(values) {
    for (const [name, value] of Object.entries(values)) {
      setPreference(this._defaultBranch, name, PREF_TYPES[name], value);
    }
  }
}

let controller = null;

export const MidoriSmoothScroll = {
  init() {
    migrateLegacySmoothfoxPreferences(Services.prefs);
    controller ||= new MidoriSmoothScrollController({
      defaultBranch: Services.prefs.getDefaultBranch(''),
      observerService: Services.obs,
      windowMediator: Services.wm,
      focusManager: Services.focus,
      scheduleRefresh: callback => Services.tm.dispatchToMainThread(callback),
    });
    controller.init();
  },

  uninit() {
    controller?.uninit();
  },

  getState() {
    return controller?.getState() ?? { profile: null, refreshRate: 0 };
  },
};
