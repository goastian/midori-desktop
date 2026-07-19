import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('Settings redesign uses the real Firefox preference name', () => {
  const prefs = readSource('../src/browser/app/profile/midori-browser.js');

  assert.match(prefs, /pref\('browser\.settings-redesign\.enabled', true\);/);
  assert.doesNotMatch(prefs, /pref\('\s+browser\.settings-redesign\.enabled'/);
});

test('Preferences localization contains every Firefox 152 compatibility id', () => {
  const preferencesFtl = readSource(
    '../src/browser/locales/en-US/browser/preferences/preferences.ftl'
  );

  for (const id of [
    'browser-language-install-error',
    'home-prefs-clocks-header',
    'home-prefs-firefox-home-disabled-notice',
    'home-prefs-firefox-logo-header',
    'home-prefs-homepage-extension-option',
    'home-prefs-recent-activity-select',
    'home-prefs-shortcuts-select',
    'home-prefs-sports-widget-header',
    'pane-account-sync-title2',
  ]) {
    assert.match(preferencesFtl, new RegExp(`^${id}\\s*=`, 'm'), id);
  }
});

test('both Midori keyset producers reject unsafe persisted shortcuts', () => {
  const shortcuts = readSource(
    '../src/browser/components/shortcuts/MidoriShortcuts.sys.mjs'
  );
  const sidebar = readSource(
    '../src/browser/components/msidebar/SidebarUI.mjs'
  );

  assert.match(shortcuts, /isSafeGlobalShortcut\(normalized\)/);
  assert.match(sidebar, /!isSafeGlobalShortcut\(normalized\)/);
});
