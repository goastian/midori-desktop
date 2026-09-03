import assert from 'node:assert/strict';
import test from 'node:test';

import { WorkspaceTabIndex } from '../src/browser/components/workspace/WorkspaceTabIndex.sys.mjs';

test('workspace tab counts update incrementally', () => {
  const index = new WorkspaceTabIndex(['default', 'work']);
  const firstTab = {};
  const secondTab = {};

  assert.equal(index.assign(firstTab, 'default'), true);
  assert.equal(index.assign(secondTab, 'default'), true);
  assert.equal(index.assign(firstTab, 'default'), false);
  assert.equal(index.count('default'), 2);

  assert.equal(index.assign(firstTab, 'work'), true);
  assert.equal(index.count('default'), 1);
  assert.equal(index.count('work'), 1);

  assert.equal(index.forget(firstTab), true);
  assert.equal(index.forget(firstTab), false);
  assert.equal(index.count('work'), 0);
});

test('workspace changes discard removed counts and accept new ids', () => {
  const index = new WorkspaceTabIndex(['default', 'work']);
  const tab = {};

  index.assign(tab, 'work');
  index.setWorkspaceIds(['default', 'research']);

  assert.equal(index.get(tab), null);
  assert.equal(index.count('work'), 0);
  assert.equal(index.assign(tab, 'research'), true);
  assert.equal(index.count('research'), 1);
});

test('last shown tabs are replaced and removed in constant time', () => {
  const index = new WorkspaceTabIndex(['default']);
  const firstTab = {};
  const secondTab = {};

  index.assign(firstTab, 'default');
  index.assign(secondTab, 'default');
  assert.equal(index.setLastShown('default', firstTab), null);
  assert.equal(index.setLastShown('default', secondTab), firstTab);
  assert.equal(index.getLastShown('default'), secondTab);

  index.assign(secondTab, 'default');
  index.forget(secondTab);
  assert.equal(index.getLastShown('default'), null);
});

test('moving the last shown tab clears the old workspace reference', () => {
  const index = new WorkspaceTabIndex(['default', 'work']);
  const tab = {};

  index.assign(tab, 'default');
  index.setLastShown('default', tab);
  index.assign(tab, 'work');

  assert.equal(index.getLastShown('default'), null);
});
