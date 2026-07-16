import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('issue 205 keeps the bookmark action and URL-bar anchor materialized', () => {
  const patch = readSource('../src/browser/base/content/browser-init-js.patch');
  const placeIndex = patch.indexOf('BrowserPageActions.placeActionInUrlbar(bookmarkAction)');
  const updateIndex = patch.indexOf('BookmarkingUI.updateStarState()');

  assert.ok(placeIndex >= 0, 'bookmark action should be placed in the URL bar');
  assert.ok(updateIndex > placeIndex, 'bookmark star state should update after its anchor exists');
});

test('issue 206 keeps sidebar actions inside compact submenus', () => {
  const source = readSource('../src/browser/components/msidebar/MidoriSidebar.sys.mjs');
  const sidebarUi = readSource('../src/browser/components/msidebar/SidebarUI.mjs');

  assert.match(source, /menu\.id = CONTENT_CTX_MENU_ID/);
  assert.match(source, /menu\.id = TAB_CTX_MENU_ID/);
  assert.match(source, /menu\.appendChild\(submenu\)/);
  assert.doesNotMatch(source, /popup\.appendChild\(openItem\)/);
  assert.doesNotMatch(source, /popup\.appendChild\(tempItem\)/);
  assert.match(sidebarUi, /chrome:\/\/browser\/skin\/sidebar-expanded\.svg/);
  assert.doesNotMatch(sidebarUi, /chrome:\/\/browser\/skin\/sidebars\.svg/);
});
