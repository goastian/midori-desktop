import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

import {
  DEFAULT_MEMORY_PROFILE,
  getMemoryProfileMigration,
  normalizeMemoryProfile,
} from '../src/browser/components/memory/MemoryProfilePolicy.sys.mjs';

const readSource = path =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

test('performance is the validated default and invalid values fall back to it', () => {
  assert.equal(DEFAULT_MEMORY_PROFILE, 0);
  assert.equal(normalizeMemoryProfile(0), 0);
  assert.equal(normalizeMemoryProfile(3), 3);
  assert.equal(normalizeMemoryProfile(99), 0);
  assert.equal(normalizeMemoryProfile(undefined), 0);
});

test('legacy automatic low-memory value migrates once for existing users', () => {
  assert.deepEqual(
    getMemoryProfileMigration({
      configuredProfile: 2,
      hasUserValue: true,
      schemaVersion: 0,
    }),
    {
      profile: 0,
      clearUserProfile: true,
      needsSchemaUpgrade: true,
    }
  );

  assert.deepEqual(
    getMemoryProfileMigration({
      configuredProfile: 2,
      hasUserValue: true,
      schemaVersion: 1,
    }),
    {
      profile: 2,
      clearUserProfile: false,
      needsSchemaUpgrade: false,
    }
  );
});

test('explicit non-legacy profiles remain selected during migration', () => {
  for (const profile of [0, 1, 3]) {
    const migration = getMemoryProfileMigration({
      configuredProfile: profile,
      hasUserValue: true,
      schemaVersion: 0,
    });

    assert.equal(migration.profile, profile);
    assert.equal(migration.clearUserProfile, false);
    assert.equal(migration.needsSchemaUpgrade, true);
  }
});

test('shipping defaults avoid the measured process/cache throttling', () => {
  const prefs = readSource('../src/browser/app/profile/midori-browser.js');

  assert.doesNotMatch(prefs, /#include Memoryfox\.js/);
  assert.match(prefs, /pref\('midori\.memory\.profile', 0\)/);
  assert.match(prefs, /pref\('midori\.workspaces\.unloadInactive', false\)/);
  assert.match(prefs, /pref\('midori\.tabsleep\.enabled', false\)/);
  assert.match(prefs, /pref\('browser\.tabs\.unloadOnLowMemory', false\)/);
  assert.match(prefs, /pref\("browser\.cache\.disk\.enable", true\)/);
  assert.match(
    prefs,
    /pref\("network\.http\.speculative-parallel-limit", 20\)/
  );
  assert.match(prefs, /pref\("network\.dns\.disablePrefetch", false\)/);
  assert.match(prefs, /pref\("network\.prefetch-next", true\)/);
});

test('profile switching has one observer-owned application path', () => {
  const manager = readSource(
    '../src/browser/components/memory/MemoryProfileManager.sys.mjs'
  );
  const preferencesPatch = readSource(
    '../src/browser/components/preferences/add-memory-profile.patch'
  );
  const browserGluePatch = readSource(
    '../src/browser/components/BrowserGlue-sys-mjs.patch'
  );

  assert.match(manager, /0:\s*\{\s*name: 'performance',[\s\S]*?settings: \{\}/);
  assert.match(manager, /this\._clearManagedPrefs\(\)/);
  assert.doesNotMatch(
    manager,
    /setIntPref\(this\.PREF_MEMORY_PROFILE,\s*profileIndex/
  );
  assert.doesNotMatch(
    preferencesPatch,
    /MemoryProfileManager\.applyProfile/
  );
  assert.match(browserGluePatch, /lazy\.MidoriBrowserServices\.init\(\)/);
  assert.doesNotMatch(
    browserGluePatch,
    /lazy\.MemoryProfileManager\.applyProfile/
  );
});
