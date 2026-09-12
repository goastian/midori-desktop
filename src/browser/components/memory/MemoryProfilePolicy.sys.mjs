/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const DEFAULT_MEMORY_PROFILE = 0;
export const LEGACY_AUTOMATIC_PROFILE = 2;
export const MEMORY_PROFILE_SCHEMA_VERSION = 2;

export const MEMORY_POLICY = 'memory';
export const ENERGY_POLICY = 'energy';
export const NETWORK_POLICY = 'network';
export const JAVASCRIPT_POLICY = 'javascript';
export const GRAPHICS_POLICY = 'graphics';

const VALID_MEMORY_PROFILES = new Set([0, 1, 2, 3]);

function mergeIntoPolicy(target, source) {
  for (const [policy, prefs] of Object.entries(source)) {
    target[policy] = { ...(target[policy] || {}), ...prefs };
  }
  return target;
}

function flattenPolicies(policies) {
  const preferences = {};
  for (const prefs of Object.values(policies)) {
    Object.assign(preferences, prefs);
  }
  return preferences;
}

// Shared adjustments for the opt-in profiles. Profile 0 stays
// Firefox-compatible and never receives these. The common set is deliberately
// small: lazy session restore, discardable images and background media
// suspension. Speculative networking (prefetch, predictor, tab warmup) is NOT
// common: it trades RAM/network for latency, so Low Memory opts out on every
// platform while Balanced and Gaming opt in explicitly.
const COMMON_POLICIES = {
  [MEMORY_POLICY]: {
    'browser.cache.disk.smart_size.enabled': true,
    'browser.cache.disk.smart_size.first_run': false,
    'browser.cache.memory.enable': true,
    'image.cache.size': 5242880,
    'image.mem.decode_bytes_at_a_time': 16384,
    'image.mem.discardable': true,
    'browser.sessionstore.restore_on_demand': true,
    'browser.sessionstore.restore_pinned_tabs_on_demand': false,
    'browser.sessionstore.restore_tabs_lazily': true,
    'dom.ipc.keepProcessesAlive.web': 1,
    'dom.ipc.processPrelaunch.lowmem_mb': 0,
  },
  [ENERGY_POLICY]: {
    'javascript.options.compact_on_user_inactive': true,
    'javascript.options.compact_on_user_inactive_delay': 15000,
    'media.cache_readahead_limit': 60,
    'media.cache_resume_threshold': 30,
    'media.suspend-bkgnd-video.enabled': true,
    'media.suspend-bkgnd-video.delay-ms': 5000,
  },
};

// Speculative loading for profiles that prefer latency over RAM. Kept out of
// COMMON_POLICIES so Low Memory can disable it uniformly on all platforms.
const SPECULATIVE_NETWORK_POLICIES = {
  [NETWORK_POLICY]: {
    'browser.tabs.remote.warmup.enabled': true,
    'browser.tabs.remote.warmup.maxTabs': 3,
    'browser.tabs.remote.warmup.unloadDelayMs': 2000,
    'network.predictor.enabled': true,
    'network.predictor.enable-prefetch': true,
    'network.dns.disablePrefetch': false,
    'network.prefetch-next': true,
  },
};

// Low Memory opts out of speculation on every platform. Previously only
// Windows received this correction while Linux/macOS kept prefetching,
// which contradicted the profile's RAM-saving goal.
const LOW_MEMORY_NETWORK_POLICIES = {
  [MEMORY_POLICY]: {
    'dom.ipc.keepProcessesAlive.web': 0,
  },
  [NETWORK_POLICY]: {
    'browser.tabs.remote.warmup.enabled': false,
    'browser.tabs.remote.warmup.maxTabs': 0,
    'browser.tabs.remote.warmup.unloadDelayMs': 0,
    'network.predictor.enabled': false,
    'network.predictor.enable-prefetch': false,
    'network.dns.disablePrefetch': true,
    'network.prefetch-next': false,
  },
  [ENERGY_POLICY]: {
    'media.cache_readahead_limit': 15,
    'media.cache_resume_threshold': 5,
  },
};

const PROFILE_DEFINITIONS = {
  0: {
    name: 'performance',
    policies: {},
  },
  1: {
    name: 'balanced',
    policies: {
      [MEMORY_POLICY]: {
        'dom.ipc.processCount': 4,
        'dom.ipc.processCount.webIsolated': 2,
        'dom.ipc.processPrelaunch.enabled': true,
        'dom.ipc.processPrelaunch.fission.number': 1,
        'browser.cache.memory.capacity': 131072,
        'browser.sessionhistory.max_total_viewers': 4,
        'browser.sessionstore.max_tabs_undo': 10,
        'browser.sessionstore.max_windows_undo': 2,
        'media.memory_cache_max_size': 65536,
        'media.memory_caches_combined_limit_kb': 262144,
        'browser.tabs.unloadOnLowMemory': true,
      },
    },
  },
  2: {
    name: 'lowMemory',
    policies: {
      [MEMORY_POLICY]: {
        'dom.ipc.processCount': 1,
        'dom.ipc.processCount.webIsolated': 1,
        'dom.ipc.processPrelaunch.enabled': false,
        'dom.ipc.processPrelaunch.fission.number': 0,
        'browser.cache.memory.capacity': 32768,
        'browser.cache.memory.max_entry_size': 4096,
        'browser.sessionhistory.max_total_viewers': 1,
        'browser.sessionstore.max_tabs_undo': 3,
        'browser.sessionstore.max_windows_undo': 1,
        'media.memory_cache_max_size': 16384,
        'media.memory_caches_combined_limit_kb': 65536,
        'browser.tabs.unloadOnLowMemory': true,
      },
    },
  },
  3: {
    name: 'gaming',
    policies: {
      [MEMORY_POLICY]: {
        'dom.ipc.processCount': 12,
        'dom.ipc.processCount.webIsolated': 6,
        'dom.ipc.processPrelaunch.enabled': true,
        'dom.ipc.processPrelaunch.fission.number': 4,
        'browser.cache.memory.capacity': -1,
        'browser.cache.memory.max_entry_size': 51200,
        'browser.sessionhistory.max_total_viewers': -1,
        'media.memory_caches_combined_limit_kb': 1048576,
        'browser.tabs.unloadOnLowMemory': false,
      },
      [ENERGY_POLICY]: {
        'browser.sessionstore.interval': 60000,
      },
      [GRAPHICS_POLICY]: {
        'dom.webgpu.enabled': true,
      },
    },
  },
};

const PLATFORM_POLICIES = {
  linux: {
    [MEMORY_POLICY]: {
      'dom.ipc.forkserver.enable': true,
    },
    [GRAPHICS_POLICY]: {
      'widget.wayland.opaque-region.enabled': true,
    },
  },
};

// Preference inventory (punto 4.1, recomendacion 1). Each override records its
// Gecko consumer area, value type, relevant platforms and when the new value
// takes effect, so future audits can verify consumer, units and activation
// moment against the pinned Firefox base instead of trusting comments.
export const PREF_METADATA = {
  'browser.cache.disk.smart_size.enabled': { policy: 'memory', type: 'bool', platforms: ['all'], applies: 'restart', area: 'cache' },
  'browser.cache.disk.smart_size.first_run': { policy: 'memory', type: 'bool', platforms: ['all'], applies: 'restart', area: 'cache' },
  'browser.cache.memory.enable': { policy: 'memory', type: 'bool', platforms: ['all'], applies: 'restart', area: 'cache' },
  'browser.cache.memory.capacity': { policy: 'memory', type: 'int', units: 'KiB (-1 = automatic)', platforms: ['all'], applies: 'restart', area: 'cache' },
  'browser.cache.memory.max_entry_size': { policy: 'memory', type: 'int', units: 'KiB', platforms: ['all'], applies: 'restart', area: 'cache' },
  'image.cache.size': { policy: 'memory', type: 'int', units: 'bytes', platforms: ['all'], applies: 'live', area: 'image' },
  'image.mem.decode_bytes_at_a_time': { policy: 'memory', type: 'int', units: 'bytes', platforms: ['all'], applies: 'new-documents', area: 'image' },
  'image.mem.discardable': { policy: 'memory', type: 'bool', platforms: ['all'], applies: 'new-documents', area: 'image' },
  'browser.sessionstore.restore_on_demand': { policy: 'memory', type: 'bool', platforms: ['all'], applies: 'restart', area: 'sessionstore' },
  'browser.sessionstore.restore_pinned_tabs_on_demand': { policy: 'memory', type: 'bool', platforms: ['all'], applies: 'restart', area: 'sessionstore' },
  'browser.sessionstore.restore_tabs_lazily': { policy: 'memory', type: 'bool', platforms: ['all'], applies: 'restart', area: 'sessionstore' },
  'browser.sessionstore.max_tabs_undo': { policy: 'memory', type: 'int', platforms: ['all'], applies: 'live', area: 'sessionstore' },
  'browser.sessionstore.max_windows_undo': { policy: 'memory', type: 'int', platforms: ['all'], applies: 'live', area: 'sessionstore' },
  'browser.sessionstore.interval': { policy: 'energy', type: 'int', units: 'ms', platforms: ['all'], applies: 'live', area: 'sessionstore' },
  'browser.sessionhistory.max_total_viewers': { policy: 'memory', type: 'int', platforms: ['all'], applies: 'new-documents', area: 'bfcache' },
  'browser.tabs.unloadOnLowMemory': { policy: 'memory', type: 'bool', platforms: ['all'], applies: 'live', area: 'tab-unload' },
  'dom.ipc.processCount': { policy: 'memory', type: 'int', platforms: ['all'], applies: 'restart (new content processes)', area: 'ipc' },
  'dom.ipc.processCount.webIsolated': { policy: 'memory', type: 'int', platforms: ['all'], applies: 'restart (new content processes)', area: 'ipc' },
  'dom.ipc.processPrelaunch.enabled': { policy: 'memory', type: 'bool', platforms: ['all'], applies: 'restart', area: 'ipc' },
  'dom.ipc.processPrelaunch.fission.number': { policy: 'memory', type: 'int', platforms: ['all'], applies: 'restart', area: 'ipc' },
  'dom.ipc.processPrelaunch.lowmem_mb': { policy: 'memory', type: 'int', units: 'MiB (verify consumer in pinned base)', platforms: ['all'], applies: 'restart', area: 'ipc' },
  'dom.ipc.keepProcessesAlive.web': { policy: 'memory', type: 'int', platforms: ['all'], applies: 'new-processes', area: 'ipc' },
  'dom.ipc.forkserver.enable': { policy: 'memory', type: 'bool', platforms: ['linux'], applies: 'restart', area: 'ipc' },
  'media.memory_cache_max_size': { policy: 'memory', type: 'int', units: 'KiB', platforms: ['all'], applies: 'new-media', area: 'media' },
  'media.memory_caches_combined_limit_kb': { policy: 'memory', type: 'int', units: 'KiB', platforms: ['all'], applies: 'new-media', area: 'media' },
  'media.cache_readahead_limit': { policy: 'energy', type: 'int', units: 's', platforms: ['all'], applies: 'new-media', area: 'media' },
  'media.cache_resume_threshold': { policy: 'energy', type: 'int', units: 's', platforms: ['all'], applies: 'new-media', area: 'media' },
  'media.suspend-bkgnd-video.enabled': { policy: 'energy', type: 'bool', platforms: ['all'], applies: 'new-media', area: 'media' },
  'media.suspend-bkgnd-video.delay-ms': { policy: 'energy', type: 'int', units: 'ms', platforms: ['all'], applies: 'new-media', area: 'media' },
  'javascript.options.compact_on_user_inactive': { policy: 'energy', type: 'bool', platforms: ['all'], applies: 'live', area: 'js-gc' },
  'javascript.options.compact_on_user_inactive_delay': { policy: 'energy', type: 'int', units: 'ms', platforms: ['all'], applies: 'live', area: 'js-gc' },
  'browser.tabs.remote.warmup.enabled': { policy: 'network', type: 'bool', platforms: ['all'], applies: 'new-tabs', area: 'warmup' },
  'browser.tabs.remote.warmup.maxTabs': { policy: 'network', type: 'int', platforms: ['all'], applies: 'new-tabs', area: 'warmup' },
  'browser.tabs.remote.warmup.unloadDelayMs': { policy: 'network', type: 'int', units: 'ms', platforms: ['all'], applies: 'new-tabs', area: 'warmup' },
  'network.predictor.enabled': { policy: 'network', type: 'bool', platforms: ['all'], applies: 'new-documents', area: 'predictor' },
  'network.predictor.enable-prefetch': { policy: 'network', type: 'bool', platforms: ['all'], applies: 'new-documents', area: 'predictor' },
  'network.dns.disablePrefetch': { policy: 'network', type: 'bool', platforms: ['all'], applies: 'new-documents', area: 'dns' },
  'network.prefetch-next': { policy: 'network', type: 'bool', platforms: ['all'], applies: 'new-documents', area: 'prefetch' },
  'dom.webgpu.enabled': { policy: 'graphics', type: 'bool', platforms: ['all'], applies: 'restart', area: 'webgpu' },
  'widget.wayland.opaque-region.enabled': { policy: 'graphics', type: 'bool', platforms: ['linux'], applies: 'restart', area: 'compositor' },
};

// Preferences written by older versions of MemoryProfileManager but no longer
// managed. They have no recorded user-origin value, so they are only cleared
// when a profile transition occurs. This includes the GC/render/decode
// overrides reverted to Gecko defaults (punto 4.1.3) and the experimental
// Gaming graphics/network forces removed for lack of per-pref measurement.
export const LEGACY_MANAGED_PREFS = [
  'apz.allow_zooming',
  'apz.frame_delay.enabled',
  'apz.overscroll.enabled',
  'gfx.font_rendering.graphite.enabled',
  'gfx.font_rendering.opentype_svg.enabled',
  'gfx.webrender.compositor',
  'gfx.webrender.compositor.force-enabled',
  'layout.css.grid-template-masonry-value.enabled',
  'privacy.resistFingerprinting.block_mozAddonManager',
  'privacy.trackingprotection.enabled',
  'privacy.trackingprotection.socialtracking.enabled',
  'widget.dmabuf.force-enabled',
  'javascript.options.mem.gc_high_frequency_heap_growth_max',
  'javascript.options.mem.gc_high_frequency_heap_growth_min',
  'javascript.options.mem.gc_heap_growth_factor',
  'javascript.options.baselinejit',
  'javascript.options.ion',
  'javascript.options.wasm_baselinejit',
  'javascript.options.wasm_optimizingjit',
  'network.http.max-connections',
  'network.http.max-persistent-connections-per-server',
  'network.http.pacing.requests.enabled',
  'layers.acceleration.force-enabled',
  'layers.acceleration.draw-fps',
  'layers.gpu-process.enabled',
  'layers.mlgpu.enabled',
  'layers.omtp.enabled',
  'gfx.webrender.all',
  'gfx.webrender.enabled',
  'gfx.canvas.accelerated',
  'gfx.canvas.accelerated.cache-items',
  'gfx.canvas.accelerated.cache-size',
  'webgl.force-enabled',
  'webgl.msaa-force',
  'webgl.enable-draft-extensions',
  'webgl.enable-privileged-extensions',
  'media.hardware-video-decoding.enabled',
  'media.hardware-video-decoding.force-enabled',
  'media.ffmpeg.vaapi.enabled',
  'image.mem.shared.unmap.min_expiration_ms',
];

export function normalizeMemoryProfile(profile) {
  return VALID_MEMORY_PROFILES.has(profile)
    ? profile
    : DEFAULT_MEMORY_PROFILE;
}

export function getProfileDefinition(profileIndex) {
  return PROFILE_DEFINITIONS[profileIndex] || null;
}

export function getPreferencesByPolicy(profileIndex, platform = 'unknown') {
  if (
    profileIndex === DEFAULT_MEMORY_PROFILE ||
    !PROFILE_DEFINITIONS[profileIndex]
  ) {
    return {};
  }

  const byPolicy = {};
  mergeIntoPolicy(byPolicy, COMMON_POLICIES);
  mergeIntoPolicy(byPolicy, PROFILE_DEFINITIONS[profileIndex].policies);

  if (profileIndex === 1 || profileIndex === 3) {
    mergeIntoPolicy(byPolicy, SPECULATIVE_NETWORK_POLICIES);
  }
  if (profileIndex === LEGACY_AUTOMATIC_PROFILE) {
    mergeIntoPolicy(byPolicy, LOW_MEMORY_NETWORK_POLICIES);
  }

  if (platform === 'linux') {
    mergeIntoPolicy(byPolicy, PLATFORM_POLICIES.linux);
  }

  return byPolicy;
}

export function getProfilePreferences(profileIndex, platform = 'unknown') {
  return flattenPolicies(getPreferencesByPolicy(profileIndex, platform));
}

export function capturePreferenceSnapshot({ preferences, saved, readPreference }) {
  const snapshot = { ...saved };
  let changed = false;

  for (const pref of Object.keys(preferences)) {
    if (Object.prototype.hasOwnProperty.call(snapshot, pref)) {
      continue;
    }
    snapshot[pref] = readPreference(pref);
    changed = true;
  }

  return { snapshot, changed };
}

export function planPreferenceRestore(snapshot) {
  return Object.entries(snapshot).map(([pref, entry]) => ({
    pref,
    entry: entry ?? { hasValue: false },
  }));
}

export function getPreferenceInventory(profileIndex, platform = 'unknown') {
  const byPolicy = getPreferencesByPolicy(profileIndex, platform);
  const inventory = [];
  for (const [policy, prefs] of Object.entries(byPolicy)) {
    for (const [pref, value] of Object.entries(prefs)) {
      inventory.push({
        pref,
        value,
        policy,
        ...(PREF_METADATA[pref] || {
          policy,
          type: typeof value === 'boolean' ? 'bool' : 'int',
          platforms: ['all'],
          applies: 'verify against pinned base',
        }),
      });
    }
  }
  return inventory.sort((a, b) => (a.pref < b.pref ? -1 : 1));
}

export function getPrefsNeedingRestart(profileIndex, platform = 'unknown') {
  return getPreferenceInventory(profileIndex, platform)
    .filter(entry => (entry.applies || '').startsWith('restart'))
    .map(entry => entry.pref);
}

/**
 * Midori 11.7-11.9 persisted profile 2 as a user preference on every startup,
 * even when the user never selected it. Migrate that indistinguishable legacy
 * value once so existing installations receive the new Firefox-compatible
 * default. A user can select Low Memory again after this schema is recorded.
 */
export function getMemoryProfileMigration({
  configuredProfile,
  hasUserValue,
  schemaVersion,
}) {
  const profile = normalizeMemoryProfile(configuredProfile);
  const needsSchemaUpgrade = schemaVersion < MEMORY_PROFILE_SCHEMA_VERSION;
  const clearUserProfile =
    needsSchemaUpgrade &&
    hasUserValue &&
    profile === LEGACY_AUTOMATIC_PROFILE;

  return {
    profile: clearUserProfile ? DEFAULT_MEMORY_PROFILE : profile,
    clearUserProfile,
    needsSchemaUpgrade,
  };
}

export const MemoryProfilePolicy = Object.freeze({
  DEFAULT_MEMORY_PROFILE,
  MEMORY_PROFILE_SCHEMA_VERSION,
  PROFILE_DEFINITIONS,
  PREF_METADATA,
  capturePreferenceSnapshot,
  getMemoryProfileMigration,
  getPreferenceInventory,
  getPreferencesByPolicy,
  getPrefsNeedingRestart,
  getProfilePreferences,
  normalizeMemoryProfile,
  planPreferenceRestore,
});
