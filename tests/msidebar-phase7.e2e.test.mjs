import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { createPanel } from '../src/browser/components/msidebar/SidebarModel.mjs';
import {
  resolveSidebarActionPanelForExtensionId,
  resolveSidebarActionPanelForUrl,
} from '../src/browser/components/msidebar/SidebarExtensions.mjs';

if (!globalThis.ChromeUtils) {
  globalThis.ChromeUtils = {
    defineESModuleGetters() {},
  };
}

const { reorderPanelsById } = await import('../src/browser/components/msidebar/SidebarUI.mjs');

const manifestPath = new URL('./fixtures/msidebar/sidebar-action-extension/manifest.json', import.meta.url);
const rawManifest = await fs.readFile(manifestPath, 'utf8');
const manifest = JSON.parse(rawManifest);

const extensionId = manifest.browser_specific_settings.gecko.id;
const extensionHost = 'fixture-sidebar-action';
const baseUrl = `moz-extension://${extensionHost}/`;

function makePolicy() {
  return {
    id: extensionId,
    name: manifest.name,
    manifest,
    getURL(path = '/') {
      return new URL(path, baseUrl).toString();
    },
    baseURL: baseUrl,
    mozExtensionHostname: extensionHost,
  };
}

function makePolicyApi(policy) {
  return {
    getByID(id) {
      return id === policy.id ? policy : null;
    },
    getByURI(uriLike) {
      const spec = typeof uriLike === 'string' ? uriLike : uriLike?.spec || '';
      return spec.startsWith(baseUrl) ? policy : null;
    },
    getByHostname(hostname) {
      return hostname === extensionHost ? policy : null;
    },
  };
}

test('phase7 e2e: resolves sidebar_action panel info from fixture extension', () => {
  const policy = makePolicy();
  const policyApi = makePolicyApi(policy);

  const byId = resolveSidebarActionPanelForExtensionId(extensionId, { policyApi });
  assert.equal(byId.extensionId, extensionId);
  assert.equal(byId.url, `${baseUrl}sidebar/panel.html`);
  assert.equal(byId.title, 'Fixture Sidebar');
  assert.equal(byId.iconUrl, `${baseUrl}icons/sidebar-32.png`);

  const byUrl = resolveSidebarActionPanelForUrl(`${baseUrl}something/else.html`, { policyApi });
  assert.equal(byUrl.url, `${baseUrl}sidebar/panel.html`);
});

test('phase7 e2e: dropped moz-extension url builds panel and rail reorder persists order', () => {
  const policy = makePolicy();
  const policyApi = makePolicyApi(policy);

  const droppedPanel = createPanel({
    url: `${baseUrl}random-source.html`,
    title: 'Dropped extension entry',
  });
  const resolved = resolveSidebarActionPanelForUrl(droppedPanel.url, { policyApi });
  droppedPanel.webExtensionId = resolved.extensionId;
  droppedPanel.url = resolved.url;
  droppedPanel.favicon = {
    mode: 'static',
    value: resolved.iconUrl,
  };

  const stablePanel = createPanel({ url: 'https://example.com/stable', title: 'Stable panel' });
  const finalPanels = reorderPanelsById([stablePanel, droppedPanel], droppedPanel.id, stablePanel.id);

  assert.equal(finalPanels[0].id, droppedPanel.id);
  assert.equal(finalPanels[0].url, `${baseUrl}sidebar/panel.html`);
  assert.equal(finalPanels[0].webExtensionId, extensionId);
  assert.equal(finalPanels[0].favicon.value, `${baseUrl}icons/sidebar-32.png`);
});
