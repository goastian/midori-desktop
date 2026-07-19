/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MidoriServiceLifecycle } from 'resource:///modules/MidoriServiceLifecycle.sys.mjs';

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AutoHideToolbar: 'resource:///modules/AutoHideToolbar.sys.mjs',
  MemoryProfileManager: 'resource:///modules/MemoryProfileManager.sys.mjs',
  MidoriGradient: 'resource:///modules/MidoriGradient.sys.mjs',
  MidoriSidebar: 'resource:///modules/MidoriSidebar.sys.mjs',
  MidoriShortcuts: 'resource:///modules/MidoriShortcuts.sys.mjs',
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
  { name: 'MidoriTabSleep', getService: () => lazy.MidoriTabSleep },
];

export const MidoriBrowserServices = new MidoriServiceLifecycle(services, {
  onError({ phase, name, error }) {
    const action = phase === 'init' ? 'initialize' : 'uninitialize';
    console.error(`Midori: Failed to ${action} ${name}`, error);
  },
});
