/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  MIDORI_SERVICE_STATES,
  MidoriServiceLifecycle,
} from 'resource:///modules/MidoriServiceLifecycle.sys.mjs';
import { isRegularBrowserWindow } from 'resource:///modules/MidoriWebAppUtils.sys.mjs';

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AutoHideToolbar: 'resource:///modules/AutoHideToolbar.sys.mjs',
  MemoryProfileManager: 'resource:///modules/MemoryProfileManager.sys.mjs',
  MidoriGradient: 'resource:///modules/MidoriGradient.sys.mjs',
  MidoriModBlur: 'resource:///modules/MidoriModBlur.sys.mjs',
  MidoriSmoothScroll: 'resource:///modules/MidoriSmoothScroll.sys.mjs',
  MidoriSidebar: 'resource:///modules/MidoriSidebar.sys.mjs',
  MidoriShortcuts: 'resource:///modules/MidoriShortcuts.sys.mjs',
  MidoriTabProtectionEntry: 'resource:///modules/MidoriTabProtectionEntry.sys.mjs',
  MidoriTabSleep: 'resource:///modules/MidoriTabSleep.sys.mjs',
  MidoriVerticalTabs: 'resource:///modules/MidoriVerticalTabs.sys.mjs',
  MidoriWorkspaces: 'resource:///modules/MidoriWorkspaces.sys.mjs',
});

const MEMORY_PROFILE_PREF = 'midori.memory.profile';
const MEMORY_PROFILE_APPLIED_PREF = 'midori.memory.profile.lastApplied';
const MEMORY_PROFILE_SCHEMA_PREF = 'midori.memory.profile.schemaVersion';
const MEMORY_PROFILE_SCHEMA_VERSION = 1;

function hasUserValueInBranches(branches) {
  return branches.some(branch =>
    Services.prefs
      .getChildList(branch)
      .some(pref => Services.prefs.prefHasUserValue(pref))
  );
}

function getFeatureState(active, branches) {
  if (active) {
    return MIDORI_SERVICE_STATES.ACTIVE;
  }
  return hasUserValueInBranches(branches)
    ? MIDORI_SERVICE_STATES.CONFIGURED
    : MIDORI_SERVICE_STATES.UNUSED;
}

function isAnyShortcutEnabled() {
  for (const branch of [
    'midori.shortcuts.',
    'midori.msidebar.shortcut.',
    'midori.workspaces.shortcut.',
  ]) {
    for (const pref of Services.prefs.getChildList(branch)) {
      if (Services.prefs.getStringPref(pref, '').trim()) {
        return true;
      }
    }
  }
  return false;
}

const services = [
  { name: 'MidoriModBlur', getService: () => lazy.MidoriModBlur },
  { name: 'MidoriSmoothScroll', getService: () => lazy.MidoriSmoothScroll },
  {
    name: 'MemoryProfileManager',
    getService: () => lazy.MemoryProfileManager,
    getState: () =>
      getFeatureState(
        Services.prefs.getIntPref(MEMORY_PROFILE_PREF, 0) !== 0 ||
          Services.prefs.getIntPref(MEMORY_PROFILE_APPLIED_PREF, -1) > 0 ||
          Services.prefs.getIntPref(MEMORY_PROFILE_SCHEMA_PREF, 0) <
            MEMORY_PROFILE_SCHEMA_VERSION,
        [MEMORY_PROFILE_PREF, MEMORY_PROFILE_APPLIED_PREF, MEMORY_PROFILE_SCHEMA_PREF]
      ),
  },
  {
    name: 'AutoHideToolbar',
    getService: () => lazy.AutoHideToolbar,
    getState: () =>
      getFeatureState(
        Services.prefs.getBoolPref('midori.autohide.toolbar', false) ||
          Services.prefs.getBoolPref('midori.compact.enabled', false),
        ['midori.autohide.', 'midori.compact.enabled']
      ),
  },
  {
    name: 'MidoriGradient',
    getService: () => lazy.MidoriGradient,
    getState: () =>
      getFeatureState(
        Services.prefs.getBoolPref('midori.gradient.enabled', false),
        ['midori.gradient.']
      ),
  },
  { name: 'MidoriVerticalTabs', getService: () => lazy.MidoriVerticalTabs },
  {
    name: 'MidoriWorkspaces',
    getService: () => lazy.MidoriWorkspaces,
    getState: () =>
      getFeatureState(
        Services.prefs.getBoolPref('midori.workspaces.enabled', true),
        ['midori.workspaces.']
      ),
  },
  {
    name: 'MidoriSidebar',
    getService: () => lazy.MidoriSidebar,
    getState: () =>
      getFeatureState(
        Services.prefs.getBoolPref('midori.msidebar.enabled', false),
        ['midori.msidebar.']
      ),
  },
  {
    name: 'MidoriShortcuts',
    getService: () => lazy.MidoriShortcuts,
    getState: () =>
      getFeatureState(isAnyShortcutEnabled(), [
        'midori.shortcuts.',
        'midori.msidebar.shortcut.',
        'midori.workspaces.shortcut.',
      ]),
  },
  {
    name: 'MidoriTabProtection',
    getService: () => lazy.MidoriTabProtectionEntry,
  },
  {
    name: 'MidoriTabSleep',
    getService: () => lazy.MidoriTabSleep,
    getState: () =>
      getFeatureState(
        Services.prefs.getBoolPref('midori.tabsleep.enabled', false),
        ['midori.tabsleep.']
      ),
  },
];

const lifecycle = new MidoriServiceLifecycle(services, {
  preferenceSource: Services.prefs,
  scheduleRefresh: callback => Services.tm.dispatchToMainThread(callback),
  onError({ phase, name, error }) {
    const action =
      phase === 'init'
        ? 'initialize'
        : phase === 'uninit'
          ? 'uninitialize'
          : 'resolve state for';
    console.error(`Midori: Failed to ${action} ${name}`, error);
  },
});

let browserWindowObserver = null;

function findRegularBrowserWindow() {
  for (const win of Services.wm.getEnumerator('navigator:browser')) {
    if (isRegularBrowserWindow(win)) {
      return win;
    }
  }
  return null;
}

export const MidoriBrowserServices = {
  bootstrap() {
    if (
      Services.prefs.getBoolPref('midori.verticaltabs.enabled', false) ||
      Services.prefs.getBoolPref('midori.arcmode.enabled', false)
    ) {
      lazy.MidoriVerticalTabs.bootstrap();
    }
  },

  init() {
    if (browserWindowObserver) {
      return;
    }

    browserWindowObserver = (subject, topic) => {
      if (topic === 'browser-delayed-startup-finished') {
        if (isRegularBrowserWindow(subject)) {
          lifecycle.init();
        }
        return;
      }

      Services.tm.dispatchToMainThread(() => {
        if (!findRegularBrowserWindow()) {
          lifecycle.uninit();
        }
      });
    };
    Services.obs.addObserver(
      browserWindowObserver,
      'browser-delayed-startup-finished'
    );
    Services.obs.addObserver(browserWindowObserver, 'domwindowclosed');

    if (findRegularBrowserWindow()) {
      lifecycle.init();
    }
  },

  uninit() {
    if (browserWindowObserver) {
      Services.obs.removeObserver(
        browserWindowObserver,
        'browser-delayed-startup-finished'
      );
      Services.obs.removeObserver(browserWindowObserver, 'domwindowclosed');
      browserWindowObserver = null;
    }
    lifecycle.uninit();
  },

  getServiceSnapshot() {
    return lifecycle.getSnapshot();
  },
};
