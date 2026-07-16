import test from 'node:test';
import assert from 'node:assert/strict';

import { WorkspaceTabUnloader } from '../src/browser/components/workspace/WorkspaceTabUnloader.sys.mjs';

function baseState(overrides = {}) {
  return {
    belongsToActiveWorkspace: false,
    selected: false,
    multiselected: false,
    pinned: false,
    closing: false,
    discarded: false,
    busy: false,
    soundPlaying: false,
    attention: false,
    hasBeforeUnload: false,
    hasLinkedPanel: true,
    autoDiscardable: true,
    uriSpec: 'https://astian.org/',
    ...overrides,
  };
}

test('unload delay: defaults and bounds are enforced', () => {
  assert.equal(WorkspaceTabUnloader.getUnloadDelayMs(undefined), 45000);
  assert.equal(WorkspaceTabUnloader.getUnloadDelayMs(0), 5000);
  assert.equal(WorkspaceTabUnloader.getUnloadDelayMs(45000), 45000);
  assert.equal(WorkspaceTabUnloader.getUnloadDelayMs(99_999_999), 1800000);
  assert.equal(WorkspaceTabUnloader.getUnloadDelayMs('not-a-number'), 45000);
});

test('internal URIs and empty specs are never unloaded', () => {
  assert.equal(WorkspaceTabUnloader.isUriExcluded(''), true);
  assert.equal(WorkspaceTabUnloader.isUriExcluded('about:newtab'), true);
  assert.equal(WorkspaceTabUnloader.isUriExcluded('chrome://browser/content'), true);
  assert.equal(WorkspaceTabUnloader.isUriExcluded('view-source:https://a.b'), true);
  assert.equal(WorkspaceTabUnloader.isUriExcluded('https://astian.org'), false);
});

test('inactive-workspace tab with a real page is safe to unload', () => {
  assert.equal(WorkspaceTabUnloader.shouldUnloadTab(baseState()), true);
});

test('active-workspace tabs are never unloaded', () => {
  assert.equal(
    WorkspaceTabUnloader.shouldUnloadTab(baseState({ belongsToActiveWorkspace: true })),
    false
  );
});

test('guarded tab states are skipped', () => {
  const guarded = [
    { selected: true },
    { multiselected: true },
    { pinned: true },
    { closing: true },
    { discarded: true },
    { busy: true },
    { soundPlaying: true },
    { attention: true },
    { hasBeforeUnload: true },
    { hasLinkedPanel: false },
    { autoDiscardable: false },
    { uriSpec: 'about:preferences' },
    { uriSpec: '' },
  ];

  for (const override of guarded) {
    assert.equal(
      WorkspaceTabUnloader.shouldUnloadTab(baseState(override)),
      false,
      `expected guarded state ${JSON.stringify(override)} to be skipped`
    );
  }
});
