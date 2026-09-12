import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';

import {
  DEFAULT_MEMORY_PROFILE,
  PREF_METADATA,
  capturePreferenceSnapshot,
  getMemoryProfileMigration,
  getPreferenceInventory,
  getPreferencesByPolicy,
  getPrefsNeedingRestart,
  getProfilePreferences,
  normalizeMemoryProfile,
  planPreferenceRestore,
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
      schemaVersion: 2,
    }),
    {
      profile: 2,
      clearUserProfile: false,
      needsSchemaUpgrade: false,
    }
  );
});

test('schema 1 installations migrate once to clear abandoned overrides', () => {
  assert.deepEqual(
    getMemoryProfileMigration({
      configuredProfile: 2,
      hasUserValue: true,
      schemaVersion: 1,
    }),
    {
      profile: 0,
      clearUserProfile: true,
      needsSchemaUpgrade: true,
    }
  );

  assert.deepEqual(
    getMemoryProfileMigration({
      configuredProfile: 1,
      hasUserValue: true,
      schemaVersion: 1,
    }),
    {
      profile: 1,
      clearUserProfile: false,
      needsSchemaUpgrade: true,
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

test('profile preferences are separated by policy', () => {
  const balanced = getPreferencesByPolicy(1, 'linux');
  assert.ok(
    Object.keys(balanced.memory).includes('dom.ipc.processCount'),
    'memory policy owns process count'
  );
  assert.ok(
    Object.keys(balanced.energy).includes('media.cache_readahead_limit'),
    'energy policy owns media readahead'
  );
  assert.ok(
    Object.keys(balanced.network).includes('network.prefetch-next'),
    'network policy owns speculative loading'
  );
  const balancedGraphics = balanced.graphics || {};
  assert.ok(
    !Object.keys(balancedGraphics).includes('webgl.msaa-force'),
    'balanced has no experimental graphics overrides'
  );

  const gaming = getPreferencesByPolicy(3, 'linux');
  assert.ok(
    Object.keys(gaming.graphics).includes('dom.webgpu.enabled'),
    'gaming keeps an explicit WebGPU opt-in in its graphics policy'
  );
  assert.ok(
    !Object.keys(gaming.graphics).includes('webgl.msaa-force'),
    'gaming no longer forces experimental MSAA without measurement'
  );
  assert.ok(
    !Object.keys(gaming.graphics).includes(
      'layers.acceleration.draw-fps'
    ),
    'gaming no longer enables the FPS debug overlay'
  );
  assert.ok(
    Object.keys(gaming.memory).includes('browser.cache.memory.capacity'),
    'gaming memory settings stay under the memory policy'
  );
});

test('GC, render and decode use Gecko defaults until a regression is proven', () => {
  for (const profile of [1, 2, 3]) {
    for (const platform of ['linux', 'win', 'macosx']) {
      const prefs = getProfilePreferences(profile, platform);
      assert.ok(
        !('javascript.options.mem.gc_heap_growth_factor' in prefs),
        `profile ${profile} on ${platform} leaves GC growth to Gecko`
      );
      assert.ok(
        !('javascript.options.mem.gc_high_frequency_heap_growth_max' in prefs),
        `profile ${profile} on ${platform} leaves high-frequency GC to Gecko`
      );
      assert.ok(
        !('layers.acceleration.force-enabled' in prefs),
        `profile ${profile} on ${platform} does not force acceleration`
      );
      assert.ok(
        !('media.hardware-video-decoding.force-enabled' in prefs),
        `profile ${profile} on ${platform} does not force decoding paths`
      );
      assert.ok(
        !('network.http.max-connections' in prefs),
        `profile ${profile} on ${platform} does not inflate connection limits`
      );
      assert.ok(
        !('network.http.pacing.requests.enabled' in prefs),
        `profile ${profile} on ${platform} keeps request pacing`
      );
    }
  }
});

test('low memory disables speculation on every platform', () => {
  for (const platform of ['linux', 'win', 'macosx']) {
    const lowMemory = getProfilePreferences(2, platform);
    assert.equal(lowMemory['network.prefetch-next'], false);
    assert.equal(lowMemory['network.predictor.enable-prefetch'], false);
    assert.equal(lowMemory['network.dns.disablePrefetch'], true);
    assert.equal(
      lowMemory['browser.tabs.remote.warmup.enabled'],
      false
    );
  }

  const balanced = getProfilePreferences(1, 'linux');
  assert.equal(balanced['network.prefetch-next'], true);

  const gaming = getProfilePreferences(3, 'linux');
  assert.equal(gaming['network.prefetch-next'], true);
});

test('flattened preferences preserve the effective values', () => {
  const balanced = getProfilePreferences(1, 'linux');
  assert.equal(balanced['dom.ipc.processCount'], 4);
  assert.equal(balanced['browser.cache.memory.capacity'], 131072);
  assert.equal(balanced['network.prefetch-next'], true);
  assert.equal(balanced['dom.ipc.forkserver.enable'], true);

  const lowMemory = getProfilePreferences(2, 'linux');
  assert.equal(lowMemory['dom.ipc.processCount'], 1);
  assert.equal(lowMemory['network.prefetch-next'], false);

  const lowMemoryWindows = getProfilePreferences(2, 'win');
  assert.equal(lowMemoryWindows['network.prefetch-next'], false);
  assert.equal(lowMemoryWindows['browser.tabs.remote.warmup.enabled'], false);

  const lowMemoryMac = getProfilePreferences(2, 'macosx');
  assert.equal(lowMemoryMac['network.prefetch-next'], false);
  assert.equal(lowMemoryMac['browser.tabs.remote.warmup.enabled'], false);

  const gaming = getProfilePreferences(3, 'linux');
  assert.equal(gaming['dom.webgpu.enabled'], true);

  assert.deepEqual(getProfilePreferences(0, 'linux'), {});
});

test('abandoned overrides are cleaned on profile transitions', () => {
  const policy = readSource(
    '../src/browser/components/memory/MemoryProfilePolicy.sys.mjs'
  );

  for (const pref of [
    'layers.acceleration.draw-fps',
    'webgl.msaa-force',
    'webgl.enable-draft-extensions',
    'javascript.options.mem.gc_heap_growth_factor',
    'network.http.max-connections',
    'network.http.pacing.requests.enabled',
    'media.hardware-video-decoding.force-enabled',
  ]) {
    assert.match(
      policy,
      new RegExp(`'${pref.replace(/\./g, '\\.')}'`),
      `${pref} is listed for legacy cleanup`
    );
  }
});

test('preference inventory documents policy and activation moment', () => {
  for (const profile of [1, 2, 3]) {
    const inventory = getPreferenceInventory(profile, 'linux');
    assert.ok(inventory.length > 0, `profile ${profile} owns preferences`);
    for (const entry of inventory) {
      assert.ok(entry.pref, 'inventory entry names the preference');
      assert.ok(entry.policy, `${entry.pref} declares its policy`);
      assert.ok(
        entry.applies,
        `${entry.pref} declares when the value takes effect`
      );
      assert.deepEqual(
        PREF_METADATA[entry.pref]?.policy || entry.policy,
        entry.policy,
        `${entry.pref} inventory matches its metadata policy`
      );
    }
  }

  const restartPrefs = getPrefsNeedingRestart(1, 'linux');
  assert.ok(
    restartPrefs.includes('dom.ipc.processCount'),
    'process count is reported as needing new processes'
  );
  assert.ok(
    restartPrefs.includes('browser.cache.memory.capacity'),
    'cache capacity is reported as needing a restart'
  );
  assert.deepEqual(getPreferenceInventory(0, 'linux'), []);
  assert.deepEqual(getPrefsNeedingRestart(0, 'linux'), []);
});

test('memory profile UI does not promise immediate application', () => {
  const ftl = readSource(
    '../src/browser/locales/en-US/browser/preferences/preferences.ftl'
  );
  assert.doesNotMatch(ftl, /Changes apply immediately/);
  assert.match(ftl, /take full effect after a restart/);
});

test('lifecycle tracks the same profile schema as the policy', () => {
  const lifecycle = readSource(
    '../src/browser/components/lifecycle/MidoriBrowserServices.sys.mjs'
  );
  assert.match(
    lifecycle,
    /const MEMORY_PROFILE_SCHEMA_VERSION = 2;/,
    'pending schema-1 migrations keep the manager service enabled'
  );
});

test('profile switching records preference ownership instead of clearing all', () => {
  const manager = readSource(
    '../src/browser/components/memory/MemoryProfileManager.sys.mjs'
  );
  const preferencesPatch = readSource(
    '../src/browser/components/preferences/add-memory-profile.patch'
  );
  const browserGluePatch = readSource(
    '../src/browser/components/BrowserGlue-sys-mjs.patch'
  );

  assert.match(manager, /PREF_SAVED_PREFS: 'midori\.memory\.profile\.savedPrefs'/);
  assert.match(manager, /this\._captureSavedPrefs\(/);
  assert.match(manager, /this\._restoreSavedPrefs\(\)/);
  assert.match(manager, /this\._restoreUnusedPrefs\(/);
  assert.match(manager, /this\._discardUntrackedPrefs\(/);
  assert.match(manager, /schemaVersion < 2/);
  assert.doesNotMatch(manager, /~1\.5-4 GB/);
  assert.doesNotMatch(manager, /~350 MB-1\.1 GB/);
  assert.match(manager, /Restart recommended/);
  assert.doesNotMatch(manager, /_clearManagedPrefs/);
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
