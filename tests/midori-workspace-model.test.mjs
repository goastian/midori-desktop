import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getEmojiForIcon,
  getLabelForIcon,
  getWorkspaceAccent,
  sanitizeWorkspaceName,
  validateIconId,
  validateWorkspaceStore,
  WORKSPACE_ICONS,
} from '../src/browser/components/workspace/MidoriWorkspaceModel.sys.mjs';

test('workspace icons expose stable labels and fallbacks', () => {
  assert.ok(WORKSPACE_ICONS.length >= 20);
  assert.equal(getEmojiForIcon('focus'), '🎯');
  assert.equal(getLabelForIcon('focus'), 'Focus');
  assert.equal(validateIconId('secure'), 'secure');
  assert.equal(validateIconId('missing'), 'default');
  assert.equal(getWorkspaceAccent('missing'), getWorkspaceAccent('default'));
});

test('workspace name limits never leave a partial Unicode character or control', () => {
  assert.equal(sanitizeWorkspaceName('a'.repeat(31) + '\u{1F30D}'), 'a'.repeat(31));
  assert.equal(sanitizeWorkspaceName('a'.repeat(30) + '\u{1F30D}'), 'a'.repeat(30) + '\u{1F30D}');
  assert.equal(sanitizeWorkspaceName('A\0B\nC\ud800'), 'ABC');
});

test('workspace store validation keeps only known icon ids and tab mappings', () => {
  const store = validateWorkspaceStore({
    windows: {
      main: {
        selectedId: 'dev',
        workspaces: [
          { id: 'default', name: ' Default ', icon: 'default', isDefault: true },
          { id: 'dev', name: '<Dev>', icon: 'focus' },
          { id: 'broken', name: 'Broken', icon: 'missing' },
        ],
        tabs: {
          tab1: 'dev',
          tab2: 'ghost',
          '': 'dev',
        },
      },
    },
  });

  assert.equal(store.windows.main.selectedId, 'dev');
  assert.equal(store.windows.main.workspaces[1].name, 'Dev');
  assert.equal(store.windows.main.workspaces[1].icon, 'focus');
  assert.equal(store.windows.main.workspaces[2].icon, 'default');
  assert.deepEqual(store.windows.main.tabs, { tab1: 'dev' });
});
