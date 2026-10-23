import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const verticalTabs = readSource(
  '../src/browser/components/verticaltabs/MidoriVerticalTabs.sys.mjs'
);
const defaults = readSource('../src/browser/app/profile/midori-browser.js');

function methodBody(source, name) {
  const start = source.indexOf(`  ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const end = source.indexOf('\n  },\n', start);
  assert.ok(end > start, `${name} has a closing brace`);
  return source.slice(start, end);
}

test('vertical tabs use the Arc layout by default and keep a classic fallback', () => {
  assert.match(defaults, /pref\('midori\.verticaltabs\.style', 'arc'\);/);
  assert.match(defaults, /pref\('midori\.arcmode\.enabled', false\);/);
  assert.match(defaults, /pref\('midori\.verticaltabs\.enabled', false\);/);

  const style = methodBody(verticalTabs, '_getVerticalStyle');
  assert.match(style, /getStringPref\(PREF_VERTICAL_STYLE, 'arc'\)/);
  assert.match(style, /style === 'classic' \? 'classic' : 'arc'/);

  const layout = methodBody(verticalTabs, '_isArcLayoutActive');
  assert.match(layout, /this\._isArcModeEnabled\(\)/);
  assert.match(layout, /this\.isEnabled\(\) && this\._getVerticalStyle\(\) === 'arc'/);

  const root = methodBody(verticalTabs, '_applyVerticalRootState');
  assert.match(root, /midori-arc-mode', this\._isArcLayoutActive\(\)/);
  assert.doesNotMatch(root, /midori-arc-mode', this\._isArcModeEnabled\(\)/);
});

test('arc mode alone never enables vertical tabs on a horizontal profile', () => {
  const enabled = methodBody(verticalTabs, 'isEnabled');
  assert.match(enabled, /PREF_ENABLED/);
  assert.match(enabled, /this\._isArcModeEnabled\(\)/);
  assert.doesNotMatch(enabled, /_getVerticalStyle|_isArcLayoutActive/);
});

test('the vertical style preference is observed and released', () => {
  assert.match(verticalTabs, /const OBSERVED_PREFS = new Set\(\[[^\]]*PREF_VERTICAL_STYLE/s);
  assert.match(verticalTabs, /Services\.prefs\.addObserver\(PREF_VERTICAL_STYLE, this\)/);
});

test('pinned tab icon observers stay removed', () => {
  assert.doesNotMatch(verticalTabs, /_initPinnedTabsIcon/);
  assert.doesNotMatch(verticalTabs, /--midori-tab-icon/);
  assert.doesNotMatch(verticalTabs, /_midoriPinnedIconInit/);
});

test('pinned state only follows pinned tab events and never walks every tab', () => {
  const start = verticalTabs.indexOf('_initPinnedState(win) {');
  const end = verticalTabs.indexOf('  _refreshAllWindows()', start);
  const block = verticalTabs.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(block, /'TabSelect'/);
  assert.match(block, /'TabClose', scheduleIfPinned/);
  assert.match(block, /'TabOpen', scheduleIfPinned/);
  assert.match(block, /if \(event\.target\?\.pinned\)/);
  assert.doesNotMatch(block, /gBrowser\.tabs/);
});

test('the injected stylesheet is rebuilt only when the layout mode changes', () => {
  const apply = methodBody(verticalTabs, '_applyToWindow');
  assert.match(apply, /data-midori-mode/);
  assert.match(apply, /getAttribute\('data-midori-mode'\) !== mode/);
  assert.equal([...apply.matchAll(/createElement\('style'\)/g)].length, 1);
});

test('collapse maps to the native expand-on-hover visibility', () => {
  const sync = methodBody(verticalTabs, '_syncFirefoxPrefs');
  assert.match(sync, /'sidebar\.visibility',\s*this\._isVerticalCollapse\(\) \? 'expand-on-hover' : 'always-show'/);
  assert.match(verticalTabs, /Services\.prefs\.addObserver\(PREF_VERTICAL_COLLAPSE, this\)/);
  assert.match(verticalTabs, /Services\.prefs\.addObserver\(PREF_COMPACT_MODE, this\)/);
});

test('the essentials grid is styled outside the native pinned container', () => {
  const css = readSource('../src/browser/themes/custom/shared/shared.inc.css');
  assert.match(css, /#midori-essentials \{[^}]*grid-template-columns: repeat\(var\(--midori-essentials-columns, 3\)/s);
  assert.match(css, /\.midori-essential-tile\[selected\] \{/);
  assert.match(css, /\.tabbrowser-tab\[midori-essential-tab\] \{\s*display: none !important;/);
  assert.match(css, /midori-vt-has-pinned="false"\] :is\(#pinned-tabs-container/);
  assert.doesNotMatch(css, /midori-essentials-promo/);
  assert.doesNotMatch(css, /midori-vt-has-essentials/);
});

test('collapse maps to the native expand-on-hover visibility', () => {
  const sync = methodBody(verticalTabs, '_syncFirefoxPrefs');
  assert.match(sync, /'sidebar\.visibility',\s*this\._isVerticalCollapse\(\) \? 'expand-on-hover' : 'always-show'/);
  assert.match(verticalTabs, /Services\.prefs\.addObserver\(PREF_VERTICAL_COLLAPSE, this\)/);
  assert.match(verticalTabs, /Services\.prefs\.addObserver\(PREF_COMPACT_MODE, this\)/);
});
