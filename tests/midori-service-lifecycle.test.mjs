import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MidoriServiceLifecycle } from '../src/browser/components/lifecycle/MidoriServiceLifecycle.sys.mjs';

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

test('the lifecycle facade owns the eight BrowserGlue services', () => {
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
  ];

  for (const name of [
    'MemoryProfileManager',
    'AutoHideToolbar',
    'MidoriGradient',
    'MidoriVerticalTabs',
    'MidoriWorkspaces',
    'MidoriSidebar',
    'MidoriShortcuts',
    'MidoriTabSleep',
  ]) {
    assert.match(facade, new RegExp(`name: '${name}'`));
  }

  for (const sourcePath of serviceSources) {
    assert.match(readSource(sourcePath), /\buninit\(\)\s*\{/);
  }
});
