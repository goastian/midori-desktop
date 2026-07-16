/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * MemoryProfileManager - Manages memory optimization profiles for Midori Browser
 *
 * Profiles:
 * - 0: Performance (default Firefox settings, higher RAM usage)
 * - 1: Balanced (moderate RAM savings, good for most users)
 * - 2: Low Memory (aggressive RAM savings for systems with limited RAM)
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AppConstants: 'resource://gre/modules/AppConstants.sys.mjs',
  MemoryProfilePolicy: 'resource:///modules/MemoryProfilePolicy.sys.mjs',
});

// Memory profile configurations
const MEMORY_PROFILES = {
  // Performance: Default Firefox settings, maximum performance
  0: {
    name: 'performance',
    // Profile 0 deliberately owns no Firefox prefs. Clearing values left by a
    // previous Midori profile restores the platform-tested upstream defaults.
    settings: {},
  },
  // Balanced: Moderate RAM savings while maintaining good performance
  1: {
    name: 'balanced',
    settings: {
      'dom.ipc.processCount': 4,
      'dom.ipc.processCount.webIsolated': 2,
      'dom.ipc.processPrelaunch.enabled': true,
      'dom.ipc.processPrelaunch.fission.number': 1,
      'browser.cache.memory.capacity': 131072, // 128 MB
      'browser.sessionhistory.max_total_viewers': 4,
      'browser.sessionstore.max_tabs_undo': 10,
      'browser.sessionstore.max_windows_undo': 2,
      'media.memory_cache_max_size': 65536, // 64 MB
      'media.memory_caches_combined_limit_kb': 262144, // 256 MB
      'javascript.options.mem.gc_high_frequency_heap_growth_max': 200,
      'javascript.options.mem.gc_high_frequency_heap_growth_min': 120,
      'javascript.options.mem.gc_heap_growth_factor': 120,
      'browser.tabs.unloadOnLowMemory': true,
    },
  },
  // Low Memory: Aggressive RAM savings for limited systems
  2: {
    name: 'lowMemory',
    settings: {
      'dom.ipc.processCount': 1,
      'dom.ipc.processCount.webIsolated': 1,
      'dom.ipc.processPrelaunch.enabled': false,
      'dom.ipc.processPrelaunch.fission.number': 0,
      'browser.cache.memory.capacity': 32768, // 32 MB
      'browser.cache.memory.max_entry_size': 4096,
      'browser.sessionhistory.max_total_viewers': 1,
      'browser.sessionstore.max_tabs_undo': 3,
      'browser.sessionstore.max_windows_undo': 1,
      'media.memory_cache_max_size': 16384, // 16 MB
      'media.memory_caches_combined_limit_kb': 65536, // 64 MB
      'javascript.options.mem.gc_high_frequency_heap_growth_max': 120,
      'javascript.options.mem.gc_high_frequency_heap_growth_min': 80,
      'javascript.options.mem.gc_heap_growth_factor': 90,
      'browser.tabs.unloadOnLowMemory': true,
    },
  },
  // Gaming/AI: Maximum performance for WebGPU, gaming, and AI workloads
  3: {
    name: 'gaming',
    settings: {
      // Maximum processes for parallelization
      'dom.ipc.processCount': 12,
      'dom.ipc.processCount.webIsolated': 6,
      'dom.ipc.processPrelaunch.enabled': true,
      'dom.ipc.processPrelaunch.fission.number': 4,

      // WebGPU and graphics acceleration
      'dom.webgpu.enabled': true,
      'gfx.webrender.all': true,
      'gfx.webrender.enabled': true,
      'layers.acceleration.force-enabled': true,
      'layers.gpu-process.enabled': true,
      'layers.mlgpu.enabled': true,

      // WebGL optimizations
      'webgl.force-enabled': true,
      'webgl.msaa-force': true,
      'webgl.enable-draft-extensions': true,
      'webgl.enable-privileged-extensions': true,

      // Canvas and 2D acceleration
      'gfx.canvas.accelerated': true,
      'gfx.canvas.accelerated.cache-items': 32768,
      'gfx.canvas.accelerated.cache-size': 4096,

      // Memory - prioritize performance over savings
      'browser.cache.memory.capacity': -1, // Auto (unlimited)
      'browser.cache.memory.max_entry_size': 51200, // 50 MB
      'browser.sessionhistory.max_total_viewers': -1, // Auto
      'media.memory_cache_max_size': 16384, // 16 MB
      'media.memory_caches_combined_limit_kb': 1048576, // 1 GB

      // JavaScript performance
      'javascript.options.mem.gc_high_frequency_heap_growth_max': 400,
      'javascript.options.mem.gc_high_frequency_heap_growth_min': 200,
      'javascript.options.mem.gc_heap_growth_factor': 200,
      'javascript.options.baselinejit': true,
      'javascript.options.ion': true,
      'javascript.options.wasm_baselinejit': true,
      'javascript.options.wasm_optimizingjit': true,

      // Network optimizations for gaming
      'network.http.max-connections': 1800,
      'network.http.max-persistent-connections-per-server': 10,
      'network.http.pacing.requests.enabled': false,

      // Disable memory-saving features
      'browser.tabs.unloadOnLowMemory': false,
      'browser.sessionstore.interval': 60000, // Save less frequently

      // Image decoding
      'image.mem.decode_bytes_at_a_time': 65536,
      'image.mem.shared.unmap.min_expiration_ms': 120000,

      // Media playback
      'media.hardware-video-decoding.enabled': true,
      'media.hardware-video-decoding.force-enabled': true,
      'media.ffmpeg.vaapi.enabled': true,

      // Compositor
      'layers.omtp.enabled': true,
      'layers.acceleration.draw-fps': true,
    },
  },
};

// Shared resource-saving settings for opt-in profiles only. Profile 0 must
// remain a Firefox-compatible baseline and does not receive these overrides.
const COMMON_OPTIMIZATIONS = {
  // Memory efficiency
  'browser.cache.disk.smart_size.enabled': true, // Auto-adjust disk cache
  'browser.cache.disk.smart_size.first_run': false,
  'browser.cache.memory.enable': true,

  // Tab efficiency
  'browser.tabs.remote.warmup.enabled': true, // Faster tab switching
  'browser.tabs.remote.warmup.maxTabs': 3,
  'browser.tabs.remote.warmup.unloadDelayMs': 2000,

  // Network efficiency
  'network.predictor.enabled': true, // Prefetch DNS/connections
  'network.predictor.enable-prefetch': true,
  'network.dns.disablePrefetch': false,
  'network.prefetch-next': true,

  // Image optimization
  'image.cache.size': 5242880, // 5 MB image cache
  'image.mem.decode_bytes_at_a_time': 16384, // Decode in chunks
  'image.mem.discardable': true, // Free decoded images when not visible

  // JavaScript efficiency
  'javascript.options.compact_on_user_inactive': true, // GC when idle
  'javascript.options.compact_on_user_inactive_delay': 15000, // 15s delay

  // Session restore optimization
  'browser.sessionstore.restore_on_demand': true, // Lazy load tabs
  'browser.sessionstore.restore_pinned_tabs_on_demand': false, // But restore pinned
  'browser.sessionstore.restore_tabs_lazily': true,

  // Content process efficiency
  'dom.ipc.keepProcessesAlive.web': 1, // Keep 1 process warm
  'dom.ipc.processPrelaunch.lowmem_mb': 0, // Disable on low memory

  // Media efficiency
  'media.cache_readahead_limit': 60, // Seconds to buffer
  'media.cache_resume_threshold': 30,
  'media.suspend-bkgnd-video.enabled': true, // Suspend background video
  'media.suspend-bkgnd-video.delay-ms': 5000,

};

// Linux-only settings for the opt-in memory profiles.
const LINUX_SETTINGS = {
  'dom.ipc.forkserver.enable': true,
  'widget.wayland.opaque-region.enabled': true, // Wayland optimization
};

const WINDOWS_LOW_MEMORY_SETTINGS = {
  'browser.tabs.remote.warmup.enabled': false,
  'browser.tabs.remote.warmup.maxTabs': 0,
  'browser.tabs.remote.warmup.unloadDelayMs': 0,
  'browser.cache.memory.capacity': 32768,
  'browser.cache.memory.max_entry_size': 4096,
  'browser.sessionhistory.max_total_viewers': 0,
  'dom.ipc.keepProcessesAlive.web': 0,
  'network.predictor.enabled': false,
  'network.predictor.enable-prefetch': false,
  'network.dns.disablePrefetch': true,
  'network.prefetch-next': false,
  'media.cache_readahead_limit': 15,
  'media.cache_resume_threshold': 5,
};

// Preferences written by older versions of MemoryProfileManager but no longer
// managed. Include them in cleanup so switching to Performance really returns
// to Firefox defaults instead of retaining forced compositor/privacy values.
const LEGACY_MANAGED_PREFS = [
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
];

const MANAGED_PREFS = new Set([
  ...LEGACY_MANAGED_PREFS,
  ...Object.keys(COMMON_OPTIMIZATIONS),
  ...Object.keys(LINUX_SETTINGS),
  ...Object.keys(WINDOWS_LOW_MEMORY_SETTINGS),
  ...Object.values(MEMORY_PROFILES).flatMap((profile) =>
    Object.keys(profile.settings)
  ),
]);

export const MemoryProfileManager = {
  _initialized: false,
  PREF_MEMORY_PROFILE: 'midori.memory.profile',
  PREF_MEMORY_PROFILE_APPLIED: 'midori.memory.profile.lastApplied',
  PREF_MEMORY_PROFILE_SCHEMA: 'midori.memory.profile.schemaVersion',

  /**
   * Get the current memory profile (0, 1, 2, or 3)
   * @returns {number} The current profile index
   */
  getCurrentProfile() {
    return lazy.MemoryProfilePolicy.normalizeMemoryProfile(
      Services.prefs.getIntPref(
        this.PREF_MEMORY_PROFILE,
        lazy.MemoryProfilePolicy.DEFAULT_MEMORY_PROFILE
      )
    );
  },

  /**
   * Get profile configuration by index
   * @param {number} profileIndex - The profile index (0, 1, 2, or 3)
   * @returns {object|null} The profile configuration or null if invalid
   */
  getProfile(profileIndex) {
    return MEMORY_PROFILES[profileIndex] || null;
  },

  /**
   * Get all available profiles
   * @returns {object} All profile configurations
   */
  getAllProfiles() {
    return MEMORY_PROFILES;
  },

  /**
   * Apply a memory profile
   * @param {number} profileIndex - The profile index to apply (0, 1, 2, or 3)
   * @returns {boolean} True if successful, false otherwise
   */
  applyProfile(profileIndex) {
    const profile = this.getProfile(profileIndex);
    if (!profile) {
      console.error(`MemoryProfileManager: Invalid profile index: ${profileIndex}`);
      return false;
    }

    console.log(`MemoryProfileManager: Applying profile "${profile.name}" (${profileIndex})`);

    // Clear settings from the previously active profile. Without this step,
    // selecting Performance kept the old process/cache/GC limits indefinitely.
    // Once Performance is active, preserve subsequent about:config changes.
    const lastAppliedProfile = Services.prefs.getIntPref(
      this.PREF_MEMORY_PROFILE_APPLIED,
      -1
    );
    if (
      profileIndex !== lazy.MemoryProfilePolicy.DEFAULT_MEMORY_PROFILE ||
      lastAppliedProfile !== profileIndex
    ) {
      this._clearManagedPrefs();
    }

    if (profileIndex !== lazy.MemoryProfilePolicy.DEFAULT_MEMORY_PROFILE) {
      this._applySettings(COMMON_OPTIMIZATIONS, 'shared');
    }

    // Apply profile-specific settings
    this._applySettings(profile.settings, profile.name);

    // Apply platform-specific settings only to explicit resource-saving modes.
    if (
      profileIndex !== lazy.MemoryProfilePolicy.DEFAULT_MEMORY_PROFILE &&
      lazy.AppConstants.platform === 'linux'
    ) {
      this._applySettings(LINUX_SETTINGS, 'Linux');
    }

    if (profileIndex === 2 && lazy.AppConstants.platform === 'win') {
      this._applySettings(WINDOWS_LOW_MEMORY_SETTINGS, 'Windows low-memory');
    }

    Services.prefs.setIntPref(
      this.PREF_MEMORY_PROFILE_APPLIED,
      profileIndex
    );

    console.log(`MemoryProfileManager: Profile "${profile.name}" applied successfully`);
    return true;
  },

  _applySettings(settings, groupName) {
    for (const [pref, value] of Object.entries(settings)) {
      try {
        this._setPref(pref, value);
      } catch (e) {
        console.error(
          `MemoryProfileManager: Failed to set ${groupName} pref ${pref}:`,
          e
        );
      }
    }
  },

  _clearManagedPrefs() {
    for (const pref of MANAGED_PREFS) {
      try {
        if (Services.prefs.prefHasUserValue(pref)) {
          Services.prefs.clearUserPref(pref);
        }
      } catch (e) {
        console.error(`MemoryProfileManager: Failed to clear pref ${pref}:`, e);
      }
    }
  },

  _migrateLegacyAutomaticProfile() {
    const migration = lazy.MemoryProfilePolicy.getMemoryProfileMigration({
      configuredProfile: Services.prefs.getIntPref(
        this.PREF_MEMORY_PROFILE,
        lazy.MemoryProfilePolicy.DEFAULT_MEMORY_PROFILE
      ),
      hasUserValue: Services.prefs.prefHasUserValue(this.PREF_MEMORY_PROFILE),
      schemaVersion: Services.prefs.getIntPref(
        this.PREF_MEMORY_PROFILE_SCHEMA,
        0
      ),
    });

    if (migration.clearUserProfile) {
      Services.prefs.clearUserPref(this.PREF_MEMORY_PROFILE);
    }
    if (migration.needsSchemaUpgrade) {
      Services.prefs.setIntPref(
        this.PREF_MEMORY_PROFILE_SCHEMA,
        lazy.MemoryProfilePolicy.MEMORY_PROFILE_SCHEMA_VERSION
      );
    }

    return migration.profile;
  },

  /**
   * Set a preference value based on its type
   * @private
   */
  _setPref(pref, value) {
    if (typeof value === 'boolean') {
      Services.prefs.setBoolPref(pref, value);
    } else if (typeof value === 'number') {
      Services.prefs.setIntPref(pref, value);
    } else if (typeof value === 'string') {
      Services.prefs.setStringPref(pref, value);
    }
  },

  /**
   * Get estimated RAM usage description for a profile
   * @param {number} profileIndex - The profile index
   * @returns {string} Description of estimated RAM usage
   */
  getProfileDescription(profileIndex) {
    const descriptions = {
      0: '~1.5-4 GB with multiple tabs',
      1: '~1-2.5 GB with multiple tabs',
      2: '~350 MB-1.1 GB with multiple tabs',
      3: '~2-5 GB with multiple tabs (WebGPU enabled)',
    };
    return descriptions[profileIndex] || 'Unknown';
  },

  /**
   * Initialize the memory profile manager
   * Called on browser startup to ensure settings are applied
   */
  init() {
    if (this._initialized) {
      return;
    }

    const currentProfile = this._migrateLegacyAutomaticProfile();
    console.log(`MemoryProfileManager: Initialized with profile ${currentProfile}`);

    // Register preference observer
    Services.prefs.addObserver(this.PREF_MEMORY_PROFILE, this);
    this._initialized = true;
    this.applyProfile(currentProfile);
  },

  /**
   * Preference observer
   */
  observe(subject, topic, data) {
    if (topic === 'nsPref:changed' && data === this.PREF_MEMORY_PROFILE) {
      const newProfile = this.getCurrentProfile();
      this.applyProfile(newProfile);
    }
  },

  /**
   * Cleanup on shutdown
   */
  uninit() {
    if (!this._initialized) {
      return;
    }
    Services.prefs.removeObserver(this.PREF_MEMORY_PROFILE, this);
    this._initialized = false;
  },
};

// Export for use in preferences UI
export const MIDORI_MEMORY_PROFILES = MEMORY_PROFILES;
