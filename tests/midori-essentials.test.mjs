import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  DEFAULT_ESSENTIALS,
  DEFAULT_MAX_ESSENTIALS,
  MAX_ESSENTIALS,
  addEssential,
  canonicalEssentialUrl,
  clampMaxEssentials,
  createEssentialId,
  findEssentialByUrl,
  moveEssential,
  normalizeEssential,
  parseEssentials,
  removeEssential,
  serializeEssentials,
} from '../src/browser/components/verticaltabs/MidoriEssentialsModel.sys.mjs';

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('defaults are six popular platforms with optional bundled icons', () => {
  assert.deepEqual(
    DEFAULT_ESSENTIALS.map(item => item.id),
    ['gmail', 'youtube', 'whatsapp', 'spotify', 'github', 'reddit']
  );
  assert.equal(DEFAULT_ESSENTIALS.length, DEFAULT_MAX_ESSENTIALS);
  for (const item of DEFAULT_ESSENTIALS) {
    assert.match(item.url, /^https:\/\//);
    if (item.icon !== undefined) {
      assert.match(item.icon, /^chrome:\/\/browser\/content\/setup\/icons\//);
      const file = item.icon.split('/').pop();
      assert.doesNotThrow(() =>
        readFileSync(new URL(`../src/browser/components/setup/icons/${file}`, import.meta.url))
      );
    }
  }
});

test('an untouched or broken value yields the defaults, an empty list stays empty', () => {
  for (const value of ['', '   ', 'not json', '{"a":1}', null, undefined]) {
    assert.deepEqual(
      parseEssentials(value).map(item => item.id),
      DEFAULT_ESSENTIALS.map(item => item.id)
    );
  }
  assert.deepEqual(parseEssentials('[]'), []);
});

test('defaults are returned as copies', () => {
  const items = parseEssentials('');
  items[0].title = 'changed';
  assert.equal(DEFAULT_ESSENTIALS[0].title, 'Gmail');
});

test('only http and https entries survive normalisation', () => {
  assert.equal(canonicalEssentialUrl('javascript:alert(1)'), null);
  assert.equal(canonicalEssentialUrl('file:///etc/passwd'), null);
  assert.equal(canonicalEssentialUrl('about:preferences'), null);
  assert.equal(canonicalEssentialUrl('data:text/html,hi'), null);
  assert.equal(canonicalEssentialUrl(''), null);
  assert.equal(canonicalEssentialUrl('https://example.com'), 'https://example.com/');

  assert.equal(normalizeEssential({ id: 'x', url: 'javascript:1' }), null);
  assert.equal(normalizeEssential({ id: 'bad id', url: 'https://a.test/' }), null);
  assert.equal(normalizeEssential({ id: '', url: 'https://a.test/' }), null);
  assert.equal(normalizeEssential(null), null);
});

test('titles are derived and limited and only bundled icons are kept', () => {
  const derived = normalizeEssential({ id: 'a', url: 'https://www.example.com/x' });
  assert.equal(derived.title, 'example.com');

  const long = normalizeEssential({ id: 'b', title: 'x'.repeat(500), url: 'https://a.test/' });
  assert.equal(long.title.length, 80);

  const remote = normalizeEssential({
    id: 'c',
    url: 'https://a.test/',
    icon: 'https://tracker.example/pixel.png',
  });
  assert.equal(remote.icon, undefined);

  const bundled = normalizeEssential({
    id: 'd',
    url: 'https://a.test/',
    icon: 'chrome://browser/content/setup/icons/github.svg',
  });
  assert.equal(bundled.icon, 'chrome://browser/content/setup/icons/github.svg');
});

test('parsing drops invalid and duplicate entries and caps the list', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    id: `s${i}`,
    url: `https://site${i}.test/`,
  }));
  assert.equal(parseEssentials(JSON.stringify(many)).length, MAX_ESSENTIALS);

  const parsed = parseEssentials(
    JSON.stringify([
      { id: 'a', url: 'https://a.test/' },
      { id: 'a', url: 'https://b.test/' },
      { id: 'b', url: 'ftp://nope' },
      'junk',
    ])
  );
  assert.deepEqual(parsed.map(item => item.id), ['a']);
});

test('serialisation round-trips', () => {
  const items = parseEssentials('');
  assert.deepEqual(parseEssentials(serializeEssentials(items)), items);
  assert.equal(serializeEssentials([]), '[]');
});

test('adding respects duplicates, ids and the maximum', () => {
  const base = [{ id: 'a', title: 'A', url: 'https://a.test/' }];

  const added = addEssential(base, { id: 'b', title: 'B', url: 'https://b.test/' }, 6);
  assert.equal(added.added, true);
  assert.equal(added.items.length, 2);
  assert.equal(base.length, 1);

  const duplicateUrl = addEssential(base, { id: 'z', url: 'https://a.test' }, 6);
  assert.equal(duplicateUrl.added, false);
  assert.equal(duplicateUrl.item.id, 'a');

  const duplicateId = addEssential(base, { id: 'a', url: 'https://other.test/' }, 6);
  assert.equal(duplicateId.added, false);
  assert.equal(duplicateId.item, null);

  const full = addEssential(base, { id: 'b', url: 'https://b.test/' }, 1);
  assert.equal(full.added, false);

  const invalid = addEssential(base, { id: 'b', url: 'javascript:1' }, 6);
  assert.equal(invalid.added, false);
});

test('removing and moving keep the rest intact', () => {
  const items = parseEssentials('');
  assert.deepEqual(
    removeEssential(items, 'youtube').map(item => item.id),
    ['gmail', 'whatsapp', 'spotify', 'github', 'reddit']
  );
  assert.equal(removeEssential(items, 'missing').length, items.length);

  assert.deepEqual(
    moveEssential(items, 'reddit', 0).map(item => item.id),
    ['reddit', 'gmail', 'youtube', 'whatsapp', 'spotify', 'github']
  );
  assert.deepEqual(moveEssential(items, 'missing', 0), items);
  assert.equal(moveEssential(items, 'gmail', 99).at(-1).id, 'gmail');
});

test('maximum is clamped and urls are matched canonically', () => {
  assert.equal(clampMaxEssentials(0), 1);
  assert.equal(clampMaxEssentials(99), MAX_ESSENTIALS);
  assert.equal(clampMaxEssentials(NaN), DEFAULT_MAX_ESSENTIALS);
  assert.equal(findEssentialByUrl(DEFAULT_ESSENTIALS, 'https://github.com').id, 'github');
  assert.equal(findEssentialByUrl(DEFAULT_ESSENTIALS, 'about:blank'), null);
  assert.match(createEssentialId('{12ab-34cd}'), /^custom-12ab34cd$/);
});

test('the essentials grid never injects nodes into the native pinned container', () => {
  const ui = readSource('../src/browser/components/verticaltabs/MidoriEssentials.sys.mjs');
  const verticalTabs = readSource(
    '../src/browser/components/verticaltabs/MidoriVerticalTabs.sys.mjs'
  );

  assert.match(ui, /host\.insertBefore\(container, host\.firstChild\)/);
  assert.match(ui, /getElementById\('vertical-tabs'\)/);
  for (const source of [ui, verticalTabs]) {
    assert.doesNotMatch(source, /pinnedContainer\.(appendChild|append|prepend)/);
    assert.doesNotMatch(source, /pinned-tabs-container'\)\??\.(appendChild|append|prepend)/);
  }
});

test('tiles are opened lazily and linked through the session', () => {
  const ui = readSource('../src/browser/components/verticaltabs/MidoriEssentials.sys.mjs');
  assert.match(ui, /addTab\(item\.url, \{\s*pinned: true/);
  assert.match(ui, /setCustomTabValue\(tab, SESSION_KEY, id\)/);
  assert.match(ui, /'SSTabRestored'/);
  assert.match(ui, /'TabUnpinned'/);
  assert.doesNotMatch(ui, /setInterval|setTimeout/);
});

test('new modules and strings are packaged', () => {
  const build = readSource('../src/browser/components/verticaltabs/moz.build');
  assert.match(build, /MidoriEssentials\.sys\.mjs/);
  assert.match(build, /MidoriEssentialsModel\.sys\.mjs/);

  const ftl = readSource('../src/browser/locales/en-US/browser/midori/essentials.ftl');
  for (const id of [
    'midori-essentials-add-current',
    'midori-essentials-remove',
    'midori-essentials-reset',
  ]) {
    assert.match(ftl, new RegExp(`^${id} =`, 'm'));
  }
  const ui = readSource('../src/browser/components/verticaltabs/MidoriEssentials.sys.mjs');
  for (const [, id] of ui.matchAll(/setAttributes\([^,]+, '([^']+)'\)/g)) {
    assert.match(ftl, new RegExp(`^${id} =`, 'm'), id);
  }

  const defaults = readSource('../src/browser/app/profile/midori-browser.js');
  assert.match(defaults, /pref\('midori\.verticaltabs\.essentials\.max', 6\);/);
  assert.match(defaults, /pref\('midori\.verticaltabs\.essentials\.items', ''\);/);
});

test('icon downloads are minimal and private', () => {
  const icons = readSource('../src/browser/components/verticaltabs/MidoriEssentialIcons.sys.mjs');
  assert.match(icons, /credentials: 'omit'/);
  assert.match(icons, /referrerPolicy: 'no-referrer'/);
  assert.match(icons, /stopOn: \/<\\\/head\\s\*>\/i/);
  assert.match(icons, /cross-origin redirect/);
  assert.match(icons, /essentials\.fetchIcons/);
  assert.match(icons, /MAX_ICON_BYTES = 400 \* 1024/);
  assert.match(icons, /RETRY_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(icons, /FRESH_MS = 30 \* 24 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(icons, /google\.com\/s2|duckduckgo|favicon\.yandex/);
});

test('the downloaded icon wins and fetching waits for idle time', () => {
  const ui = readSource('../src/browser/components/verticaltabs/MidoriEssentials.sys.mjs');
  const iconFor = ui.slice(ui.indexOf('function iconFor('), ui.indexOf('function essentialUrlFromLinkData'));
  assert.ok(iconFor.indexOf('getCached') < iconFor.indexOf('item.icon'));
  assert.match(ui, /win\.requestIdleCallback\(/);
  assert.match(ui, /icon-kind/);
});

test('tiles can be reordered and accept tabs and links by drag and drop', () => {
  const ui = readSource('../src/browser/components/verticaltabs/MidoriEssentials.sys.mjs');
  assert.match(ui, /tile\.setAttribute\('draggable', 'true'\)/);
  assert.match(ui, /ESSENTIAL_DRAG_TYPE = 'application\/x-midori-essential'/);
  assert.match(ui, /TAB_DROP_TYPE = 'application\/x-moz-tabbrowser-tab'/);
  assert.match(ui, /listen\(container, 'dragover'/);
  assert.match(ui, /listen\(container, 'drop'/);
  assert.match(ui, /event\.dataTransfer\.dropEffect = drag\.kind === 'link' \? 'copy' : 'move'/);
  assert.match(ui, /tab\?\.ownerDocument === win\.document/);
  assert.match(ui, /moveEssential\(all, id, to\)/);
});

test('the new modules and the icon preference are registered', () => {
  const build = readSource('../src/browser/components/verticaltabs/moz.build');
  assert.match(build, /MidoriEssentialIcons\.sys\.mjs/);
  assert.match(build, /MidoriFaviconPicker\.sys\.mjs/);
  const defaults = readSource('../src/browser/app/profile/midori-browser.js');
  assert.match(defaults, /pref\('midori\.verticaltabs\.essentials\.fetchIcons', true\);/);
});
