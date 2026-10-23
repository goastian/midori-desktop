/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceCatalog, validateWorkspaceSyncValue } from '../src/browser/components/workspace/MidoriWorkspaceCatalog.sys.mjs';
import { validateWorkspaceStore, MAX_WORKSPACES } from '../src/browser/components/workspace/MidoriWorkspaceModel.sys.mjs';

const uuid = index => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const id = index => `w1:${uuid(index)}`;
const value = (name = 'Research', icon = 'research') => ({ version: 1, name, icon });
const windowData = () => ({ selectedId: 'default', tabs: { tab: 'default' }, workspaces: [
  { id: 'default', name: 'Default', icon: 'default', isDefault: true },
] });
function setup(windows = { first: windowData(), second: windowData() }) {
  let counter = 100;
  const store = { windows };
  const createId = () => uuid(++counter);
  return { store, createId, catalog: new WorkspaceCatalog(store, createId) };
}

test('legacy migration preserves tabs, selection and distinct metadata with reused local IDs', () => {
  const first = windowData();
  const second = windowData();
  first.workspaces.push({ id: uuid(1), name: 'Work', icon: 'work', isDefault: false });
  second.workspaces.push({ id: uuid(1), name: 'Personal', icon: 'personal', isDefault: false });
  first.selectedId = uuid(1);
  first.tabs.tab = uuid(1);
  const { store, createId, catalog } = setup({ first, second });
  assert.equal(first.workspaces[0].syncId, null);
  assert.equal(first.workspaces[1].syncId, id(1));
  assert.notEqual(first.workspaces[1].syncId, second.workspaces[1].syncId);
  assert.equal(catalog.listIds().length, 2);
  assert.equal(first.selectedId, uuid(1));
  assert.deepEqual(first.tabs, { tab: uuid(1) });
  const reloaded = validateWorkspaceStore(JSON.parse(JSON.stringify(store)));
  assert.deepEqual(new WorkspaceCatalog(reloaded, createId).listIds(), catalog.listIds());
  assert.deepEqual(reloaded, store);
});

test('remote metadata appears in every window without touching selection, default roles or local tabs', () => {
  const { store, catalog } = setup();
  assert.deepEqual(catalog.apply(id(1), value()), { status: 'applied' });
  const localIds = Object.values(store.windows).map(data => data.workspaces[1].id);
  assert.notEqual(localIds[0], localIds[1]);
  assert.deepEqual(catalog.apply(id(1), value('New name', 'work')), { status: 'applied' });
  for (const data of Object.values(store.windows)) {
    assert.equal(data.selectedId, 'default');
    assert.deepEqual(data.tabs, { tab: 'default' });
    assert.equal(data.workspaces[1].syncId, id(1));
    assert.equal(data.workspaces[1].name, 'New name');
    assert.equal(data.workspaces[1].icon, 'work');
    assert.equal(data.workspaces[1].isDefault, false);
  }
  assert.deepEqual(Object.values(store.windows).map(data => data.workspaces[1].id), localIds);
  assert.deepEqual(Object.keys(catalog.read(id(1))), ['version', 'name', 'icon']);
});

test('changing default role never aliases or changes a portable identity', () => {
  const { store, createId, catalog } = setup();
  const data = store.windows.first;
  data.workspaces[0].name = 'My home';
  const homeId = catalog.publish(data.workspaces[0]);
  catalog.apply(id(1), value());
  data.workspaces[0].isDefault = false;
  data.workspaces[1].isDefault = true;
  new WorkspaceCatalog(store, createId);
  assert.equal(data.workspaces[0].syncId, homeId);
  assert.equal(data.workspaces[1].syncId, id(1));
  assert.deepEqual(catalog.read(homeId), value('My home', 'default'));
});

test('new windows receive the durable catalog and removing a window never creates tombstones', () => {
  const { store, catalog } = setup();
  catalog.apply(id(1), value());
  delete store.windows.first;
  const third = windowData();
  catalog.materialize(third);
  assert.equal(third.workspaces[1].syncId, id(1));
  assert.equal(catalog.canDelete(id(1)), false);
  assert.equal(catalog.canDelete(id(2)), false);
  assert.deepEqual(catalog.listIds(), [id(1)]);
});

test('capacity rejection is atomic and never evicts existing metadata', () => {
  const { store, catalog } = setup();
  for (let index = 1; index < MAX_WORKSPACES; index++) {
    assert.equal(catalog.apply(id(index), value(`Workspace ${index}`)).status, 'applied');
  }
  const before = structuredClone(store);
  assert.deepEqual(catalog.apply(id(99), value()), { status: 'conflict', reason: 'workspace_capacity' });
  assert.deepEqual(store, before);
  assert.equal(catalog.apply(id(1), value('Renamed')).status, 'applied');
});

test('legacy catalogs larger than a window remain durable and expose their deferred metadata', () => {
  const { store, catalog } = setup({});
  for (let index = 1; index <= MAX_WORKSPACES + 2; index++) {
    catalog.apply(id(index), value(`Workspace ${index}`));
  }
  const data = windowData();
  store.windows.first = data;
  catalog.materialize(data);
  assert.equal(data.workspaces.length, MAX_WORKSPACES);
  assert.equal(catalog.missing(data), 3);
  assert.equal(catalog.listIds().length, MAX_WORKSPACES + 2);
  const removed = data.workspaces[1].syncId;
  catalog.apply(removed, null);
  catalog.materialize(data);
  assert.equal(data.workspaces.length, MAX_WORKSPACES);
  assert.equal(catalog.missing(data), 2);
  assert.equal(data.selectedId, 'default');
  assert.deepEqual(data.tabs, { tab: 'default' });
});

test('applying a record reserves the available native slot for that record before other deferred metadata', () => {
  const { store, catalog } = setup({});
  for (let index = 1; index < MAX_WORKSPACES + 2; index++) {
    catalog.apply(id(index), value(`Workspace ${index}`));
  }
  const data = windowData();
  store.windows.first = data;
  catalog.materialize(data);
  data.workspaces.pop();
  assert.equal(catalog.apply(id(999), value('Incoming record')).status, 'applied');
  assert.ok(data.workspaces.some(workspace => workspace.syncId === id(999)));
  assert.equal(data.workspaces.length, MAX_WORKSPACES);
});

test('remote deletion of a selected workspace preserves it until an explicit decision', () => {
  const { store, catalog } = setup();
  catalog.apply(id(1), value());
  const data = store.windows.first;
  data.selectedId = data.workspaces[1].id;
  data.tabs.extra = data.selectedId;
  const before = structuredClone(store);
  assert.deepEqual(catalog.apply(id(1), null), { status: 'conflict', reason: 'workspace_in_use' });
  assert.deepEqual(store, before);
  assert.equal(catalog.apply(id(1), null, { force: true }).status, 'applied');
  assert.equal(data.selectedId, 'default');
  assert.deepEqual(data.tabs, { tab: 'default', extra: 'default' });
  assert.equal(catalog.read(id(1)), null);
  assert.equal(catalog.canDelete(id(1)), true);
  assert.equal(catalog.apply(id(1), null, { force: true }).status, 'applied');
  assert.equal(store.sync.deleted.length, 1);
});

test('deleting a workspace used as local default creates a local fallback without losing tabs', () => {
  const { store, catalog } = setup();
  catalog.apply(id(1), value());
  const data = store.windows.first;
  data.workspaces[0].isDefault = false;
  data.workspaces[1].isDefault = true;
  data.tabs.other = data.workspaces[1].id;
  assert.equal(catalog.apply(id(1), null).reason, 'workspace_in_use');
  assert.equal(catalog.apply(id(1), null, { force: true }).status, 'applied');
  const fallback = data.workspaces.find(workspace => workspace.isDefault);
  assert.equal(fallback.syncId, null);
  assert.equal(data.tabs.other, fallback.id);
  assert.equal(data.tabs.tab, 'default');
  assert.equal(data.selectedId, 'default');
});

test('metadata updates share one identity across windows, and restore explicitly clears its tombstone', () => {
  const { store, catalog } = setup();
  catalog.apply(id(1), value());
  const local = store.windows.first.workspaces[1];
  local.name = 'Updated locally';
  assert.equal(catalog.publish(local), id(1));
  assert.equal(store.windows.second.workspaces[1].name, local.name);
  catalog.apply(id(1), null);
  assert.equal(catalog.canDelete(id(1)), true);
  catalog.apply(id(1), value());
  assert.equal(catalog.canDelete(id(1)), false);
});

test('unsupported schema, damaged identity and conflicting tombstones fail closed without discarding the file', () => {
  const { store, createId, catalog } = setup();
  catalog.apply(id(1), value());
  for (const mutate of [
    copy => { copy.sync.version = 2; },
    copy => { copy.sync.deleted.push(id(1)); },
    copy => { copy.windows.first.workspaces[1].syncId = 'broken'; },
    copy => { copy.sync.records[id(1)].unknown = true; },
  ]) {
    const copy = structuredClone(store);
    mutate(copy);
    const before = structuredClone(copy);
    assert.throws(() => new WorkspaceCatalog(validateWorkspaceStore(copy), createId));
    assert.deepEqual(copy, before);
  }
});

test('portable records reject native membership, scripts, controls and unknown future icons', () => {
  for (const invalid of [
    { ...value(), selectedId: 'default' }, { ...value(), tabs: [] },
    value('<script>'), value('Control\0'), value('Unknown icon', 'future'),
    { ...value(), version: 2 }, value('a'.repeat(33)), value(''),
  ]) {
    assert.throws(() => validateWorkspaceSyncValue(id(1), invalid));
  }
  assert.deepEqual(validateWorkspaceSyncValue(id(1), value('Investigación')), value('Investigación'));
});
