import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_SELECTED_SIDEBAR_SITE_IDS,
  SIDEBAR_SITE_CATALOG,
  parseSelectedSiteIds,
  toggleSelectedSiteId,
} from '../src/browser/components/msidebar/SidebarSites.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readSource = path => readFileSync(join(root, path), 'utf8');

test('sidebar site catalog covers the requested popular sites with local icons', () => {
  assert.equal(SIDEBAR_SITE_CATALOG.length, 14);
  for (const id of [
    'astian-cloud',
    'astian-calendar',
    'astian-contacts',
    'midorivpn',
    'github',
    'discord',
    'youtube',
    'twitch',
    'reddit',
    'amazon',
    'whatsapp',
    'telegram',
    'spotify',
    'wikipedia',
  ]) {
    const site = SIDEBAR_SITE_CATALOG.find(entry => entry.id === id);
    assert.ok(site, id);
    assert.match(site.url, /^https:\/\//);
    assert.match(
      site.icon,
      /^chrome:\/\/browser\/content\/setup\/icons\//
    );
    const file = site.icon.replace(
      'chrome://browser/content/setup/',
      'src/browser/components/setup/'
    );
    assert.ok(existsSync(join(root, file)), file);
  }
  for (const id of DEFAULT_SELECTED_SIDEBAR_SITE_IDS) {
    assert.ok(
      SIDEBAR_SITE_CATALOG.some(site => site.id === id),
      id
    );
  }
});

test('about:setup renders every catalog site with its packaged icon', () => {
  const html = readSource('src/browser/components/setup/setup.html');
  assert.doesNotMatch(html, /s2\/favicons/);
  assert.doesNotMatch(html, /onerror=/);
  const rendered = [...html.matchAll(/data-site-id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(
    [...rendered].sort(),
    SIDEBAR_SITE_CATALOG.map(site => site.id).sort()
  );
  for (const site of SIDEBAR_SITE_CATALOG) {
    assert.match(html, new RegExp(`src="${site.icon.replace(/[./]/g, m => `\\${m}`)}"`), site.id);
  }
  const jar = readSource('src/browser/components/setup/jar.mn');
  assert.match(jar, /content\/browser\/setup\/icons\/\s+\(icons\/\*\)/);
});

test('sidebar seeds catalog panels with static icons and resolves the rest fast', () => {
  const sidebar = readSource(
    'src/browser/components/msidebar/MidoriSidebar.sys.mjs'
  );
  const ui = readSource('src/browser/components/msidebar/SidebarUI.mjs');

  assert.match(sidebar, /_applyCatalogIcon\(panel\)/);
  assert.match(sidebar, /mode: 'static', value: site\.icon/);
  assert.match(ui, /retryPlacesFaviconSpec\(panel, host\)/);
  assert.match(ui, /apple-touch-icon\.png/);
  assert.doesNotMatch(ui, /google\.com\/s2\/favicons/);
  assert.doesNotMatch(ui, /icons\.duckduckgo\.com/);
  assert.doesNotMatch(ui, /favicon\.yandex\.net/);
  assert.match(ui, /ensureFavicon\(panel, \{ allowNetwork: true \}\)/);
  assert.match(ui, /if \(!allowNetwork \|\| !visible \|\| activePanelId !== pid\) return;/);
  assert.match(ui, /if \(!visible \|\| activePanelId !== panel\.id\) return;/);
});

test('site selection helpers keep catalog order and ignore unknown ids', () => {
  assert.deepEqual(parseSelectedSiteIds(''), DEFAULT_SELECTED_SIDEBAR_SITE_IDS);
  assert.deepEqual(parseSelectedSiteIds('no-json'), DEFAULT_SELECTED_SIDEBAR_SITE_IDS);
  assert.deepEqual(
    toggleSelectedSiteId(['youtube'], 'github', true),
    ['github', 'youtube']
  );
  assert.deepEqual(toggleSelectedSiteId(['github'], 'unknown', true), ['github']);
});
