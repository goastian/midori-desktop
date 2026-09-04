import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MIDORI_SERVICE_STATES,
  MidoriServiceLifecycle,
} from '../src/browser/components/lifecycle/MidoriServiceLifecycle.sys.mjs';

const readSource = path =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

function createService(name, calls, { failInit = false, failUninit = false } = {}) {
  return {
    init() {
      calls.push(`init:${name}`);
      if (failInit) {
        throw new Error(`init:${name}`);
      }
    },
    uninit() {
      calls.push(`uninit:${name}`);
      if (failUninit) {
        throw new Error(`uninit:${name}`);
      }
    },
  };
}

test('services start in declaration order and stop once in reverse order', () => {
  const calls = [];
  const lifecycle = new MidoriServiceLifecycle([
    { name: 'memory', getService: () => createService('memory', calls) },
    { name: 'toolbar', getService: () => createService('toolbar', calls) },
    { name: 'tabs', getService: () => createService('tabs', calls) },
  ]);

  lifecycle.uninit();
  lifecycle.init();
  lifecycle.init();
  lifecycle.uninit();
  lifecycle.uninit();

  assert.deepEqual(calls, [
    'init:memory',
    'init:toolbar',
    'init:tabs',
    'uninit:tabs',
    'uninit:toolbar',
    'uninit:memory',
  ]);
});

test('startup failures are isolated and partially started services are still cleaned', () => {
  const calls = [];
  const errors = [];
  const lifecycle = new MidoriServiceLifecycle(
    [
      { name: 'memory', getService: () => createService('memory', calls) },
      {
        name: 'toolbar',
        getService: () => createService('toolbar', calls, { failInit: true }),
      },
      { name: 'tabs', getService: () => createService('tabs', calls) },
    ],
    { onError: error => errors.push(error) }
  );

  lifecycle.init();
  lifecycle.uninit();

  assert.deepEqual(calls, [
    'init:memory',
    'init:toolbar',
    'init:tabs',
    'uninit:tabs',
    'uninit:toolbar',
    'uninit:memory',
  ]);
  assert.deepEqual(
    errors.map(({ phase, name }) => ({ phase, name })),
    [{ phase: 'init', name: 'toolbar' }]
  );
});

test('shutdown failures do not prevent the remaining services from cleaning up', () => {
  const calls = [];
  const errors = [];
  const lifecycle = new MidoriServiceLifecycle(
    [
      { name: 'memory', getService: () => createService('memory', calls) },
      {
        name: 'toolbar',
        getService: () => createService('toolbar', calls, { failUninit: true }),
      },
      { name: 'tabs', getService: () => createService('tabs', calls) },
    ],
    { onError: error => errors.push(error) }
  );

  lifecycle.init();
  lifecycle.uninit();

  assert.deepEqual(calls.slice(-3), [
    'uninit:tabs',
    'uninit:toolbar',
    'uninit:memory',
  ]);
  assert.deepEqual(
    errors.map(({ phase, name }) => ({ phase, name })),
    [{ phase: 'uninit', name: 'toolbar' }]
  );
});

test('inactive services stay unloaded and transition through all three levels', () => {
  const calls = [];
  const getterCalls = [];
  const states = {
    dormant: MIDORI_SERVICE_STATES.UNUSED,
    waiting: MIDORI_SERVICE_STATES.CONFIGURED,
    visible: MIDORI_SERVICE_STATES.ACTIVE,
  };
  let observer = null;
  const preferenceCalls = [];
  const preferenceSource = {
    addObserver(domain, value) {
      preferenceCalls.push(`add:${domain}`);
      observer = value;
    },
    removeObserver(domain, value) {
      assert.equal(value, observer);
      preferenceCalls.push(`remove:${domain}`);
      observer = null;
    },
    notify() {
      observer?.observe(null, 'nsPref:changed', 'midori.feature.enabled');
    },
  };
  const descriptors = Object.keys(states).map(name => ({
    name,
    getState: () => states[name],
    getService() {
      getterCalls.push(name);
      return createService(name, calls);
    },
  }));
  const lifecycle = new MidoriServiceLifecycle(descriptors, {
    preferenceSource,
  });

  lifecycle.init();

  assert.deepEqual(getterCalls, ['visible']);
  assert.deepEqual(calls, ['init:visible']);
  assert.deepEqual(lifecycle.getSnapshot(), [
    { name: 'dormant', state: 'unused', loaded: false, started: false },
    { name: 'waiting', state: 'configured', loaded: false, started: false },
    { name: 'visible', state: 'active', loaded: true, started: true },
  ]);

  states.waiting = MIDORI_SERVICE_STATES.ACTIVE;
  states.visible = MIDORI_SERVICE_STATES.CONFIGURED;
  preferenceSource.notify();
  assert.deepEqual(getterCalls, ['visible', 'waiting']);
  assert.deepEqual(calls, [
    'init:visible',
    'init:waiting',
    'uninit:visible',
  ]);

  lifecycle.uninit();
  assert.deepEqual(calls.at(-1), 'uninit:waiting');
  assert.deepEqual(preferenceCalls, ['add:midori.', 'remove:midori.']);
});

test('preference bursts schedule one deferred reconciliation', () => {
  const scheduled = [];
  let observer = null;
  let active = false;
  const calls = [];
  const lifecycle = new MidoriServiceLifecycle(
    [
      {
        name: 'feature',
        getState: () =>
          active
            ? MIDORI_SERVICE_STATES.ACTIVE
            : MIDORI_SERVICE_STATES.UNUSED,
        getService: () => createService('feature', calls),
      },
    ],
    {
      preferenceSource: {
        addObserver(_domain, value) {
          observer = value;
        },
        removeObserver() {},
      },
      scheduleRefresh: callback => scheduled.push(callback),
    }
  );

  lifecycle.init();
  active = true;
  observer.observe(null, 'nsPref:changed', 'midori.feature.enabled');
  observer.observe(null, 'nsPref:changed', 'midori.feature.mode');

  assert.equal(scheduled.length, 1);
  assert.deepEqual(calls, []);
  scheduled[0]();
  assert.deepEqual(calls, ['init:feature']);
});

test('BrowserGlue startup and profile shutdown share the lifecycle facade', () => {
  const browserGluePatch = readSource(
    '../src/browser/components/BrowserGlue-sys-mjs.patch'
  );

  assert.match(
    browserGluePatch,
    /\+ {4}try \{\s*\+ {6}lazy\.MidoriBrowserServices\.init\(\);\s*\+ {4}\} catch \(e\)/
  );
  assert.match(
    browserGluePatch,
    /_dispose: function BG__dispose\(\) \{[\s\S]*?lazy\.MidoriBrowserServices\.uninit\(\)/
  );
  assert.doesNotMatch(browserGluePatch, /browser-quit-application-granted[\s\S]*MidoriBrowserServices\.uninit/);
});

test('service shutdown preserves the registered sidebar widget placement', () => {
  const sidebar = readSource(
    '../src/browser/components/msidebar/MidoriSidebar.sys.mjs'
  );

  const uninit = sidebar.slice(sidebar.lastIndexOf('  uninit() {'));
  assert.doesNotMatch(uninit, /CustomizableUI\.destroyWidget/);
});

test('the lifecycle facade owns the eleven BrowserGlue services', () => {
  const facade = readSource(
    '../src/browser/components/lifecycle/MidoriBrowserServices.sys.mjs'
  );
  const serviceSources = [
    '../src/browser/components/memory/MemoryProfileManager.sys.mjs',
    '../src/browser/components/autohide/AutoHideToolbar.sys.mjs',
    '../src/browser/components/gradient/MidoriGradient.sys.mjs',
    '../src/browser/components/verticaltabs/MidoriVerticalTabs.sys.mjs',
    '../src/browser/components/workspace/MidoriWorkspaces.sys.mjs',
    '../src/browser/components/msidebar/MidoriSidebar.sys.mjs',
    '../src/browser/components/shortcuts/MidoriShortcuts.sys.mjs',
    '../src/browser/components/tabsleep/MidoriTabSleep.sys.mjs',
    '../src/browser/components/lifecycle/MidoriSmoothScroll.sys.mjs',
  ];

  for (const name of [
    'MidoriModBlur',
    'MidoriSmoothScroll',
    'MemoryProfileManager',
    'AutoHideToolbar',
    'MidoriGradient',
    'MidoriVerticalTabs',
    'MidoriWorkspaces',
    'MidoriSidebar',
    'MidoriShortcuts',
    'MidoriTabProtection',
    'MidoriTabSleep',
  ]) {
    assert.match(facade, new RegExp(`name: '${name}'`));
  }

  assert.match(
    facade,
    /\{ name: 'MidoriVerticalTabs', getService: \(\) => lazy\.MidoriVerticalTabs \}/
  );

  assert.match(facade, /preferenceSource: Services\.prefs/);
  assert.match(facade, /getFeatureState\(/);
  assert.match(
    facade,
    /MidoriTabProtectionEntry: 'resource:\/\/\/modules\/MidoriTabProtectionEntry\.sys\.mjs'/
  );
  assert.doesNotMatch(
    facade,
    /MidoriTabProtection: 'resource:\/\/\/modules\/MidoriTabProtection\.sys\.mjs'/
  );

  const browserGluePatch = readSource(
    '../src/browser/components/BrowserGlue-sys-mjs.patch'
  );
  assert.match(browserGluePatch, /lazy\.MidoriBrowserServices\.bootstrap\(\)/);
  assert.doesNotMatch(browserGluePatch, /lazy\.MidoriVerticalTabs\.bootstrap\(\)/);

  const protectionEntry = readSource(
    '../src/browser/components/tabprotect/MidoriTabProtectionEntry.sys.mjs'
  );
  assert.match(protectionEntry, /SSTabRestored/);
  assert.match(protectionEntry, /this\._service\.hasProtectedTabs\(\)/);
  assert.match(protectionEntry, /this\._service\.uninit\(\)/);

  for (const sourcePath of serviceSources) {
    assert.match(readSource(sourcePath), /\buninit\(\)\s*\{/);
  }
});

test('workspace windows use persistent ids and only remove closed-window data', () => {
  const workspaces = readSource(
    '../src/browser/components/workspace/MidoriWorkspaces.sys.mjs'
  );

  assert.match(workspaces, /getCustomWindowValue\(\s*win,\s*WINDOW_SESSION_KEY/);
  assert.match(workspaces, /setCustomWindowValue\(\s*win,\s*WINDOW_SESSION_KEY/);
  assert.match(
    workspaces,
    /case 'domwindowclosed':[\s\S]*?_destroyWindow\(subject, \{ removeData: !this\._isShuttingDown \}\)/
  );
  assert.match(workspaces, /case 'quit-application-granted':[\s\S]*?_isShuttingDown = true/);
  assert.doesNotMatch(workspaces, /outerWindowID/);
});

test('workspace switching avoids forced reflow and nested tab counts', () => {
  const workspaces = readSource(
    '../src/browser/components/workspace/MidoriWorkspaces.sys.mjs'
  );

  assert.doesNotMatch(workspaces, /offsetWidth/);
  assert.match(workspaces, /state\?\.tabIndex\?\.count\(workspaceId\)/);
  assert.match(workspaces, /tabsList\.animate\(/);
  const countMethod = workspaces.slice(
    workspaces.indexOf('  _countTabsInWorkspace('),
    workspaces.indexOf('  _attachTabListeners(')
  );
  assert.doesNotMatch(countMethod, /for \(const tab/);
});
