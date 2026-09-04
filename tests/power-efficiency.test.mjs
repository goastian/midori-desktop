import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('sidebar and panel blur are opt-in shipping defaults', () => {
  const defaults = readSource('../src/browser/app/profile/midori-browser.js');

  assert.match(defaults, /pref\('midori\.msidebar\.enabled', false\);/);
  assert.match(defaults, /pref\('midori\.modblur\.blur\.panels', false\);/);
});

test('sidebar module and window UI remain lazy until explicitly enabled', () => {
  const lifecycle = readSource(
    '../src/browser/components/lifecycle/MidoriBrowserServices.sys.mjs'
  );
  const sidebar = readSource(
    '../src/browser/components/msidebar/MidoriSidebar.sys.mjs'
  );
  const shortcuts = readSource(
    '../src/browser/components/shortcuts/MidoriShortcuts.sys.mjs'
  );
  const descriptor = lifecycle.slice(
    lifecycle.indexOf("name: 'MidoriSidebar'"),
    lifecycle.indexOf("name: 'MidoriShortcuts'")
  );

  assert.match(descriptor, /getState/);
  assert.match(descriptor, /getBoolPref\('midori\.msidebar\.enabled', false\)/);
  assert.match(sidebar, /if \(!Prefs\.getEnabled\(\)\) return;/);
  assert.match(sidebar, /_pendingWindows\.get\(win\)/);
  assert.match(sidebar, /_destroyWindowUI\(win\)/);
  const paletteAction = shortcuts.slice(
    shortcuts.indexOf("case 'sidebar-command-palette':"),
    shortcuts.indexOf("case 'search-selected-text':")
  );
  assert.match(paletteAction, /setBoolPref\(SidebarPrefs\.PREF_ENABLED, true\)/);
  assert.match(paletteAction, /dispatchToMainThread/);
  assert.match(paletteAction, /midori-msidebar-open-command-palette/);
});

test('sidebar refreshes reuse rail nodes and defer network favicon lookup', () => {
  const sidebar = readSource(
    '../src/browser/components/msidebar/SidebarUI.mjs'
  );
  const renderStart = sidebar.indexOf('  function renderButtons()');
  const renderEnd = sidebar.indexOf(
    "  buttonsBox.addEventListener(\n    'dragover'",
    renderStart
  );
  const render = sidebar.slice(renderStart, renderEnd);

  assert.match(render, /panelButtons\.get\(panel\.id\) \|\| createPanelButton/);
  assert.match(render, /reconcileButtonChildren\(nodes\)/);
  assert.doesNotMatch(render, /while \(buttonsBox\.firstChild\)/);
  assert.doesNotMatch(sidebar, /google\.com\/s2\/favicons/);
  assert.doesNotMatch(sidebar, /icons\.duckduckgo\.com/);
  assert.doesNotMatch(sidebar, /favicon\.yandex\.net/);
  assert.match(sidebar, /ensureFavicon\(panel, \{ allowNetwork: true \}\)/);
  assert.match(sidebar, /if \(!allowNetwork \|\| !visible \|\| activePanelId !== pid\) return;/);
  assert.match(sidebar, /if \(!visible \|\| activePanelId !== panel\.id\) return;/);
});

test('Chrome Web Store integration is event-driven and pauses while hidden', () => {
  const cws = readSource(
    '../src/browser/components/cws/MidoriCWSChild.sys.mjs'
  );
  const browserGlue = readSource(
    '../src/browser/components/BrowserGlue-sys-mjs.patch'
  );

  assert.doesNotMatch(cws, /pollTimer|setTimeout\(tick/);
  assert.match(browserGlue, /safeForUntrustedWebProcess:\s*true/);
  assert.match(cws, /visibilitychange/);
  assert.match(cws, /if \(!doc\.hidden\)/);
  assert.match(cws, /if \(doc\?\.hidden\) \{\s*this\.#observer\?\.disconnect\(\)/);
  assert.match(cws, /!win \|\| this\.#document\?\.hidden/);
  assert.doesNotMatch(cws, /this\.document\?\./);
  assert.match(cws, /btn\.dataset\.midoriCwsExtensionId = extensionId/);
  assert.match(cws, /#onClick\(btn, currentExtensionId\)/);
  assert.match(cws, /const selector = "button"/);
  assert.match(cws, /label\.includes\("switch to chrome"\)/);
});

test('workspace transitions remain compositor-driven without forced reflow', () => {
  const workspaces = readSource(
    '../src/browser/components/workspace/MidoriWorkspaces.sys.mjs'
  );

  assert.doesNotMatch(workspaces, /offsetWidth/);
  assert.match(workspaces, /tabsList\.animate\(/);
});
