import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getAutohideAvailability,
  getSidebarArrangement,
  getSidebarSideForLayout,
  getTabLayoutFromPrefs,
  isSidebarAtLogicalStart,
  normalizeSide,
} from '../src/browser/components/setup/SetupCustomizationPolicy.sys.mjs';

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const setup = readSource('../src/browser/components/setup/setup.sys.mjs');
const setupHtml = readSource('../src/browser/components/setup/setup.html');
const sidebarPrefs = readSource(
  '../src/browser/components/msidebar/SidebarPrefs.mjs'
);
const sidebar = readSource(
  '../src/browser/components/msidebar/MidoriSidebar.sys.mjs'
);
const sidebarUi = readSource(
  '../src/browser/components/msidebar/SidebarUI.mjs'
);
const verticalTabs = readSource(
  '../src/browser/components/verticaltabs/MidoriVerticalTabs.sys.mjs'
);
const defaults = readSource('../src/browser/app/profile/midori-browser.js');
const modBlurCss = readSource(
  '../src/browser/themes/custom/shared/modblur.inc.css'
);
const setupJar = readSource('../src/browser/components/setup/jar.mn');
const setupL10n = readSource(
  '../src/browser/locales/en-US/browser/welcome.ftl'
);
const autoHideToolbar = readSource(
  '../src/browser/components/autohide/AutoHideToolbar.sys.mjs'
);
const center = readSource('../src/browser/components/center/center.sys.mjs');
const centerHtml = readSource('../src/browser/components/center/center.html');
const sharedCss = readSource(
  '../src/browser/themes/custom/shared/shared.inc.css'
);

test('about:setup currently offers every horizontal and vertical tab placement', () => {
  for (const id of [
    'tablayoutHorizontal',
    'tablayoutHorizontalBottom',
    'tablayoutVertical',
    'tablayoutVerticalRight',
  ]) {
    assert.match(setupHtml, new RegExp(`id=["']${id}["']`), id);
  }

  assert.match(setup, /midori\.verticaltabs\.enabled/);
  assert.match(setup, /midori\.verticaltabs\.position/);
  assert.match(setup, /midori\.horizontaltabs\.position/);
});

test('Multi-Sidebar position is independent from the vertical tab manager', () => {
  assert.match(
    sidebarPrefs,
    /PREF_POSITION\s*=\s*['"]midori\.msidebar\.position['"]/
  );
  assert.match(sidebar, /const position = Prefs\.getPosition\(\)/);
  assert.doesNotMatch(sidebar, /_getEffectiveSidebarPosition/);
  assert.match(verticalTabs, /const logicalStartSide = Services\.locale\.isAppLocaleRTL/);
  assert.match(verticalTabs, /this\._getVerticalSide\(\) === logicalStartSide/);
});

test('shipping AutoHide preferences are independent and opt-in', () => {
  for (const pref of [
    'midori.msidebar.autohide.enabled',
    'midori.autohide.toolbar',
    'midori.modblur.tabs.autohide',
    'midori.verticaltabs.collapse',
  ]) {
    assert.match(
      defaults,
      new RegExp(`pref\\(['"]${pref.replaceAll('.', '\\.')}['"], false\\);`),
      pref
    );
  }
  assert.match(
    defaults,
    /pref\('midori\.msidebar\.autohide\.mode', 'overlay'\);/
  );
});

test('sidebar placement preserves its selected side in every tab mode', () => {
  assert.deepEqual(
    getSidebarArrangement({ tabLayout: 'horizontal-top', sidebarSide: 'left' }),
    { sidebarSide: 'left' }
  );
  assert.deepEqual(
    getSidebarArrangement({ tabLayout: 'horizontal-bottom', sidebarSide: 'right' }),
    { sidebarSide: 'right' }
  );
  assert.deepEqual(
    getSidebarArrangement({ tabLayout: 'vertical-left', sidebarSide: 'left' }),
    { sidebarSide: 'left' }
  );
  assert.deepEqual(
    getSidebarArrangement({ tabLayout: 'vertical-left', sidebarSide: 'right' }),
    { sidebarSide: 'right' }
  );
  assert.deepEqual(
    getSidebarArrangement({ tabLayout: 'vertical-right', sidebarSide: 'left' }),
    { sidebarSide: 'left' }
  );
  assert.deepEqual(
    getSidebarArrangement({ tabLayout: 'vertical-right', sidebarSide: 'right' }),
    { sidebarSide: 'right' }
  );
});

test('existing vertical and Arc profiles resolve to their effective layout', () => {
  assert.equal(
    getTabLayoutFromPrefs({
      verticalTabsEnabled: false,
      arcModeEnabled: true,
      verticalTabsSide: 'right',
      horizontalTabsPosition: 'top',
    }),
    'vertical-right'
  );
  assert.equal(
    getSidebarSideForLayout({
      tabLayout: 'vertical-right',
      storedSidebarSide: 'right',
    }),
    'right'
  );
  assert.equal(normalizeSide('invalid'), 'left');
});

test('AutoHide availability reflects sidebar and tab placement constraints', () => {
  assert.deepEqual(
    getAutohideAvailability({
      tabLayout: 'horizontal-top',
      sidebarEnabled: true,
      sidebarAutohideEnabled: true,
      horizontalTabsAutohideEnabled: true,
    }),
    {
      sidebar: true,
      sidebarMode: true,
      horizontalTabs: true,
      inactiveWindowTabs: true,
      verticalTabs: false,
    }
  );
  assert.deepEqual(
    getAutohideAvailability({
      tabLayout: 'horizontal-bottom',
      sidebarEnabled: false,
      sidebarAutohideEnabled: true,
      horizontalTabsAutohideEnabled: true,
    }),
    {
      sidebar: false,
      sidebarMode: false,
      horizontalTabs: false,
      inactiveWindowTabs: false,
      verticalTabs: false,
    }
  );
  assert.equal(
    getAutohideAvailability({
      tabLayout: 'vertical-left',
      sidebarEnabled: true,
      sidebarAutohideEnabled: false,
      horizontalTabsAutohideEnabled: false,
    }).verticalTabs,
    true
  );
});

test('physical vertical-tab sides map correctly to logical start in RTL', () => {
  assert.equal(isSidebarAtLogicalStart({ side: 'left', isRTL: false }), true);
  assert.equal(isSidebarAtLogicalStart({ side: 'right', isRTL: false }), false);
  assert.equal(isSidebarAtLogicalStart({ side: 'left', isRTL: true }), false);
  assert.equal(isSidebarAtLogicalStart({ side: 'right', isRTL: true }), true);
});

test('about:setup packages and wires the sidebar and layout-aware AutoHide controls', () => {
  for (const id of [
    'msidebarPositionLeft',
    'msidebarPositionRight',
    'msidebarAutohide',
    'msidebarAutohideMode',
    'horizontalTabsAutohide',
    'showInactiveWindowTabs',
    'verticalTabsAutohide',
  ]) {
    assert.match(setupHtml, new RegExp(`id=["']${id}["']`), id);
  }

  assert.match(setupJar, /SetupCustomizationPolicy\.sys\.mjs/);
  assert.match(setup, /PREF_MSIDEBAR_POSITION/);
  assert.match(setup, /PREF_MSIDEBAR_AUTOHIDE_MODE/);
  assert.match(setup, /PREF_HORIZONTAL_AUTOHIDE/);
  assert.match(setup, /PREF_VERTICAL_COLLAPSE/);
  assert.match(setup, /setBoolPref\(PREF_ARC_MODE, false\)/);
  assert.doesNotMatch(setup, /midori\.autohide\.toolbar/);
  assert.doesNotMatch(setupHtml, /class=["']setup-preview-tabs["']/);

  for (const id of [
    'welcome-dialog-msidebar-position',
    'welcome-dialog-autohide-sidebar',
    'welcome-dialog-autohide-horizontal-tabs',
    'welcome-dialog-autohide-vertical-tabs',
  ]) {
    assert.match(setupL10n, new RegExp(`^${id}\\s*=`, 'm'), id);
  }
});

test('sidebar and tab-layout choices never write each other preferences', () => {
  const tabLayoutStart = setup.indexOf('class TabLayout');
  const tabSelectStart = setup.indexOf('_select(mode) {', tabLayoutStart);
  const tabRenderStart = setup.indexOf('\n  _render(mode) {', tabSelectStart);
  const sidebarStart = setup.indexOf('class MSidebar');
  const sidebarSelectStart = setup.indexOf(
    '_selectPosition(side) {',
    sidebarStart
  );
  const sidebarLayoutStart = setup.indexOf(
    '\n  _updateLayoutUI() {',
    sidebarSelectStart
  );

  assert.doesNotMatch(
    setup.slice(tabSelectStart, tabRenderStart),
    /PREF_MSIDEBAR_POSITION/
  );
  assert.doesNotMatch(
    setup.slice(sidebarSelectStart, sidebarLayoutStart),
    /PREF_VERTICAL_POSITION/
  );
});

test('Multi-Sidebar AutoHide preserves the visible rail outside compact mode', () => {
  const collapseStart = sidebarUi.indexOf(
    'function applyAutohideCollapsedState(open) {'
  );
  const collapseEnd = sidebarUi.indexOf(
    '\n  function applyDockWidth()',
    collapseStart
  );
  const collapseBlock = sidebarUi.slice(collapseStart, collapseEnd);

  assert.match(
    collapseBlock,
    /setBoolAttr\(main, ['"]collapsed['"], compactMode \? !open : !visible\)/
  );
  assert.doesNotMatch(collapseBlock, /setBoolAttr\(main, ['"]collapsed['"], !_ahOpen\)/);
  assert.match(sidebarUi, /main\.addEventListener\(['"]mouseenter['"], onMainEnter\)/);
  assert.match(sidebarUi, /#midori-msidebar-wrapper\{position:relative/);
  assert.doesNotMatch(sidebarUi, /browser\.addEventListener\(['"]mousemove['"], onBrowserEdgeMove/);
  assert.doesNotMatch(sidebarUi, /midori-msidebar-edge-trigger/);
});

test('Multi-Sidebar owns a protected integer edge order', () => {
  assert.match(
    sidebarUi,
    /order:var\(--midori-msidebar-edge-order,-1000000\)!important/
  );
  assert.match(sidebarUi, /browser\.appendChild\(wrapper\)/);
  assert.match(sidebarUi, /computeSidebarEdgeOrder\(position, isRTL\)/);
  assert.doesNotMatch(sidebarUi, /contentOrder\s*[+-]\s*0\.5/);
  assert.doesNotMatch(sidebarUi, /wrapper\.style\.order/);
});

test('Midori Settings exposes the same independent sidebar controls', () => {
  for (const [id, pref] of [
    ['pref-msidebar-position', 'midori.msidebar.position'],
    ['pref-msidebar-autohide', 'midori.msidebar.autohide.enabled'],
    ['pref-msidebar-autohide-mode', 'midori.msidebar.autohide.mode'],
    ['pref-verticaltabs-collapse', 'midori.verticaltabs.collapse'],
  ]) {
    assert.match(centerHtml, new RegExp(`id=["']${id}["']`), id);
    assert.match(center, new RegExp(pref.replaceAll('.', '\\.')), pref);
  }
  assert.match(centerHtml, /option value="overlay"/);
  assert.match(centerHtml, /option value="inline"/);
  assert.match(center, /function initSidebarControls\(\)/);
  assert.match(center, /Services\.prefs\.addObserver\(pref, observer\)/);
});

test('tab layout presets never overwrite web-panel sidebar preferences', () => {
  const start = center.indexOf('function setTabLayout(layout) {');
  const end = center.indexOf('\nfunction initTabLayout()', start);
  const block = center.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(block, /midori\.msidebar\./);
});

test('vertical tab collapse ignores stale pointer focus', () => {
  const start = sharedCss.indexOf(
    ':root[midori-vertical-tabs][midori-vt-collapse="true"] #sidebar-box {'
  );
  const end = sharedCss.indexOf('\n:root[midori-vertical-tabs] #midori-workspace-rail', start);
  const block = sharedCss.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(block, /#sidebar-box:has\(:focus-visible\)/);
  assert.doesNotMatch(block, /#sidebar-box:focus-within/);
});

test('about:setup reflects preference changes made by another surface', () => {
  assert.match(setup, /const MSIDEBAR_SETUP_PREFS = \[/);
  assert.match(setup, /Services\.prefs\.addObserver\(pref, this\._prefObserver\)/);
  assert.match(setup, /Services\.prefs\.removeObserver\(pref, this\._prefObserver\)/);
});

test('every localization id used by about:setup is defined', () => {
  const definitions = new Set(
    [...setupL10n.matchAll(/^([a-z0-9-]+)\s*=/gm)].map(match => match[1])
  );
  const usedIds = [
    ...setupHtml.matchAll(/data-l10n-id=["']([^"']+)["']/g),
  ].map(match => match[1]);

  assert.deepEqual(
    [...new Set(usedIds)].filter(id => !definitions.has(id)),
    []
  );
});

test('opening Setup or disabling Multi-Sidebar preserves stored customization', () => {
  const classStart = setup.indexOf('class MSidebar');
  const syncStart = setup.indexOf('_syncFromPrefs() {', classStart);
  const showStart = setup.indexOf('\n  show() {', syncStart);
  const syncBlock = setup.slice(syncStart, showStart);

  assert.ok(classStart >= 0 && syncStart > classStart && showStart > syncStart);
  assert.doesNotMatch(syncBlock, /set(?:Bool|Char|String|Int)Pref/);
  assert.doesNotMatch(setup, /clearUserPref/);
});

test('horizontal tabs on hover cannot hide bottom tabs', () => {
  const start = modBlurCss.indexOf(
    '@media -moz-pref("midori.modblur.tabs.autohide")'
  );
  const end = modBlurCss.indexOf(
    '/* Firefox-Mod-Blur layout:',
    start
  );
  const block = modBlurCss.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(block, /midori-horizontal-tabs="top"/);
  assert.doesNotMatch(block, /midori-horizontal-tabs\](?!\s*=)/);
});

test('global toolbar AutoHide remains opt-in when its default is unavailable', () => {
  assert.doesNotMatch(
    autoHideToolbar,
    /getBoolPref\(PREF_AUTOHIDE, true\)/
  );
  assert.equal(
    [...autoHideToolbar.matchAll(/getBoolPref\(PREF_AUTOHIDE, false\)/g)]
      .length,
    1
  );
  assert.match(autoHideToolbar, /getBoolPref\(PREF_COMPACT_MODE, false\)/);
});

test('Arc affects Firefox sidebar defaults without overriding Multi-Sidebar position', () => {
  assert.match(sidebar, /const PREF_ARC_MODE = 'midori\.arcmode\.enabled'/);
  assert.match(
    sidebar,
    /getBoolPref\(PREF_VERTICAL_TABS, false\) \|\|\s*Services\.prefs\.getBoolPref\(PREF_ARC_MODE, false\)/
  );
  assert.doesNotMatch(sidebar, /_getVerticalTabsSide/);
  assert.doesNotMatch(sidebar, /_getEffectiveSidebarPosition/);
});
