/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MidoriServiceLifecycle } from 'resource:///modules/MidoriServiceLifecycle.sys.mjs';
import { isRegularBrowserWindow } from 'resource:///modules/MidoriWebAppUtils.sys.mjs';

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AutoHideToolbar: 'resource:///modules/AutoHideToolbar.sys.mjs',
  MemoryProfileManager: 'resource:///modules/MemoryProfileManager.sys.mjs',
  MidoriGradient: 'resource:///modules/MidoriGradient.sys.mjs',
  MidoriSidebar: 'resource:///modules/MidoriSidebar.sys.mjs',
  MidoriShortcuts: 'resource:///modules/MidoriShortcuts.sys.mjs',
  MidoriTabProtection: 'resource:///modules/MidoriTabProtection.sys.mjs',
  MidoriTabSleep: 'resource:///modules/MidoriTabSleep.sys.mjs',
  MidoriVerticalTabs: 'resource:///modules/MidoriVerticalTabs.sys.mjs',
  MidoriWorkspaces: 'resource:///modules/MidoriWorkspaces.sys.mjs',
});

const services = [
  { name: 'MemoryProfileManager', getService: () => lazy.MemoryProfileManager },
  { name: 'AutoHideToolbar', getService: () => lazy.AutoHideToolbar },
  { name: 'MidoriGradient', getService: () => lazy.MidoriGradient },
  { name: 'MidoriVerticalTabs', getService: () => lazy.MidoriVerticalTabs },
  { name: 'MidoriWorkspaces', getService: () => lazy.MidoriWorkspaces },
  { name: 'MidoriSidebar', getService: () => lazy.MidoriSidebar },
  { name: 'MidoriShortcuts', getService: () => lazy.MidoriShortcuts },
  { name: 'MidoriTabProtection', getService: () => lazy.MidoriTabProtection },
  { name: 'MidoriTabSleep', getService: () => lazy.MidoriTabSleep },
];

const lifecycle = new MidoriServiceLifecycle(services, {
  onError({ phase, name, error }) {
    const action = phase === 'init' ? 'initialize' : 'uninitialize';
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
};
