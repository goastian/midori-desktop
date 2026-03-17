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
  AppConstants: "resource://gre/modules/AppConstants.sys.mjs",
});

// Memory profile configurations
const MEMORY_PROFILES = {
  // Performance: Default Firefox settings, maximum performance
  0: {
    name: "performance",
    settings: {
      "dom.ipc.processCount": 8,
      "dom.ipc.processCount.webIsolated": 4,
      "dom.ipc.processPrelaunch.enabled": true,
      "dom.ipc.processPrelaunch.fission.number": 3,
      "browser.cache.memory.capacity": -1, // Auto
      "browser.sessionhistory.max_total_viewers": -1, // Auto (8)
      "browser.sessionstore.max_tabs_undo": 25,
      "browser.sessionstore.max_windows_undo": 3,
      "media.memory_cache_max_size": 8192,
      "media.memory_caches_combined_limit_kb": 524288,
      "javascript.options.mem.gc_high_frequency_heap_growth_max": 300,
      "javascript.options.mem.gc_high_frequency_heap_growth_min": 150,
      "javascript.options.mem.gc_heap_growth_factor": 150,
      "browser.tabs.unloadOnLowMemory": false,
    },
  },
  // Balanced: Moderate RAM savings while maintaining good performance
  1: {
    name: "balanced",
    settings: {
      "dom.ipc.processCount": 4,
      "dom.ipc.processCount.webIsolated": 2,
      "dom.ipc.processPrelaunch.enabled": true,
      "dom.ipc.processPrelaunch.fission.number": 1,
      "browser.cache.memory.capacity": 131072, // 128 MB
      "browser.sessionhistory.max_total_viewers": 4,
      "browser.sessionstore.max_tabs_undo": 10,
      "browser.sessionstore.max_windows_undo": 2,
      "media.memory_cache_max_size": 65536, // 64 MB
      "media.memory_caches_combined_limit_kb": 262144, // 256 MB
      "javascript.options.mem.gc_high_frequency_heap_growth_max": 200,
      "javascript.options.mem.gc_high_frequency_heap_growth_min": 120,
      "javascript.options.mem.gc_heap_growth_factor": 120,
      "browser.tabs.unloadOnLowMemory": true,
    },
  },
  // Low Memory: Aggressive RAM savings for limited systems
  2: {
    name: "lowMemory",
    settings: {
      "dom.ipc.processCount": 1,
      "dom.ipc.processCount.webIsolated": 1,
      "dom.ipc.processPrelaunch.enabled": false,
      "dom.ipc.processPrelaunch.fission.number": 0,
      "browser.cache.memory.capacity": 65536, // 64 MB
      "browser.sessionhistory.max_total_viewers": 2,
      "browser.sessionstore.max_tabs_undo": 5,
      "browser.sessionstore.max_windows_undo": 1,
      "media.memory_cache_max_size": 32768, // 32 MB
      "media.memory_caches_combined_limit_kb": 131072, // 128 MB
      "javascript.options.mem.gc_high_frequency_heap_growth_max": 150,
      "javascript.options.mem.gc_high_frequency_heap_growth_min": 100,
      "javascript.options.mem.gc_heap_growth_factor": 100,
      "browser.tabs.unloadOnLowMemory": true,
    },
  },
  // Gaming/AI: Maximum performance for WebGPU, gaming, and AI workloads
  3: {
    name: "gaming",
    settings: {
      // Maximum processes for parallelization
      "dom.ipc.processCount": 12,
      "dom.ipc.processCount.webIsolated": 6,
      "dom.ipc.processPrelaunch.enabled": true,
      "dom.ipc.processPrelaunch.fission.number": 4,
      
      // WebGPU and graphics acceleration
      "dom.webgpu.enabled": true,
      "gfx.webrender.all": true,
      "gfx.webrender.enabled": true,
      "layers.acceleration.force-enabled": true,
      "layers.gpu-process.enabled": true,
      "layers.mlgpu.enabled": true,
      
      // WebGL optimizations
      "webgl.force-enabled": true,
      "webgl.msaa-force": true,
      "webgl.enable-draft-extensions": true,
      "webgl.enable-privileged-extensions": true,
      
      // Canvas and 2D acceleration
      "gfx.canvas.accelerated": true,
      "gfx.canvas.accelerated.cache-items": 32768,
      "gfx.canvas.accelerated.cache-size": 4096,
      
      // Memory - prioritize performance over savings
      "browser.cache.memory.capacity": -1, // Auto (unlimited)
      "browser.cache.memory.max_entry_size": 51200, // 50 MB
      "browser.sessionhistory.max_total_viewers": -1, // Auto
      "media.memory_cache_max_size": 16384, // 16 MB
      "media.memory_caches_combined_limit_kb": 1048576, // 1 GB
      
      // JavaScript performance
      "javascript.options.mem.gc_high_frequency_heap_growth_max": 400,
      "javascript.options.mem.gc_high_frequency_heap_growth_min": 200,
      "javascript.options.mem.gc_heap_growth_factor": 200,
      "javascript.options.baselinejit": true,
      "javascript.options.ion": true,
      "javascript.options.wasm_baselinejit": true,
      "javascript.options.wasm_optimizingjit": true,
      
      // Network optimizations for gaming
      "network.http.max-connections": 1800,
      "network.http.max-persistent-connections-per-server": 10,
      "network.http.pacing.requests.enabled": false,
      
      // Disable memory-saving features
      "browser.tabs.unloadOnLowMemory": false,
      "browser.sessionstore.interval": 60000, // Save less frequently
      
      // Image decoding
      "image.mem.decode_bytes_at_a_time": 65536,
      "image.mem.shared.unmap.min_expiration_ms": 120000,
      
      // Media playback
      "media.hardware-video-decoding.enabled": true,
      "media.hardware-video-decoding.force-enabled": true,
      "media.ffmpeg.vaapi.enabled": true,
      
      // Compositor
      "layers.omtp.enabled": true,
      "layers.acceleration.draw-fps": true,
    },
  },
};

// Common optimizations applied to ALL profiles
const COMMON_OPTIMIZATIONS = {
  // Memory efficiency
  "browser.cache.disk.smart_size.enabled": true, // Auto-adjust disk cache
  "browser.cache.disk.smart_size.first_run": false,
  "browser.cache.memory.enable": true,
  
  // Tab efficiency
  "browser.tabs.remote.warmup.enabled": true, // Faster tab switching
  "browser.tabs.remote.warmup.maxTabs": 3,
  "browser.tabs.remote.warmup.unloadDelayMs": 2000,
  
  // Network efficiency
  "network.predictor.enabled": true, // Prefetch DNS/connections
  "network.predictor.enable-prefetch": true,
  "network.dns.disablePrefetch": false,
  "network.prefetch-next": true,
  
  // Image optimization
  "image.cache.size": 5242880, // 5 MB image cache
  "image.mem.decode_bytes_at_a_time": 16384, // Decode in chunks
  "image.mem.discardable": true, // Free decoded images when not visible
  
  // JavaScript efficiency
  "javascript.options.compact_on_user_inactive": true, // GC when idle
  "javascript.options.compact_on_user_inactive_delay": 15000, // 15s delay
  
  // Session restore optimization
  "browser.sessionstore.restore_on_demand": true, // Lazy load tabs
  "browser.sessionstore.restore_pinned_tabs_on_demand": false, // But restore pinned
  "browser.sessionstore.restore_tabs_lazily": true,
  
  // Content process efficiency
  "dom.ipc.keepProcessesAlive.web": 1, // Keep 1 process warm
  "dom.ipc.processPrelaunch.lowmem_mb": 0, // Disable on low memory
  
  // Media efficiency
  "media.cache_readahead_limit": 60, // Seconds to buffer
  "media.cache_resume_threshold": 30,
  "media.suspend-bkgnd-video.enabled": true, // Suspend background video
  "media.suspend-bkgnd-video.delay-ms": 5000,
  
  // Font optimization
  "gfx.font_rendering.opentype_svg.enabled": true,
  "gfx.font_rendering.graphite.enabled": true,
  
  // Scrolling performance
  "apz.allow_zooming": true,
  "apz.frame_delay.enabled": true,
  "apz.overscroll.enabled": true,
  
  // Security & Privacy (no performance cost)
  "privacy.resistFingerprinting.block_mozAddonManager": true,
  "privacy.trackingprotection.enabled": true,
  "privacy.trackingprotection.socialtracking.enabled": true,
  
  // Rendering efficiency
  "layout.css.grid-template-masonry-value.enabled": true,
  "gfx.webrender.compositor": true,
  "gfx.webrender.compositor.force-enabled": true,
};

// Linux-only settings (applied on top of profile settings)
const LINUX_SETTINGS = {
  "dom.ipc.forkserver.enable": true,
  "widget.wayland.opaque-region.enabled": true, // Wayland optimization
  "widget.dmabuf.force-enabled": true, // DMA-BUF for better GPU memory
};

export const MemoryProfileManager = {
  PREF_MEMORY_PROFILE: "midori.memory.profile",

  /**
   * Get the current memory profile (0, 1, or 2)
   * @returns {number} The current profile index
   */
  getCurrentProfile() {
    return Services.prefs.getIntPref(this.PREF_MEMORY_PROFILE, 2); // Default to low memory
  },

  /**
   * Get profile configuration by index
   * @param {number} profileIndex - The profile index (0, 1, or 2)
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

    // Apply common optimizations first (benefits all profiles)
    for (const [pref, value] of Object.entries(COMMON_OPTIMIZATIONS)) {
      try {
        this._setPref(pref, value);
      } catch (e) {
        console.error(`MemoryProfileManager: Failed to set common pref ${pref}:`, e);
      }
    }

    // Apply profile-specific settings
    for (const [pref, value] of Object.entries(profile.settings)) {
      try {
        this._setPref(pref, value);
      } catch (e) {
        console.error(`MemoryProfileManager: Failed to set ${pref}:`, e);
      }
    }

    // Apply Linux-specific settings if on Linux
    if (lazy.AppConstants.platform === "linux") {
      for (const [pref, value] of Object.entries(LINUX_SETTINGS)) {
        try {
          this._setPref(pref, value);
        } catch (e) {
          console.error(`MemoryProfileManager: Failed to set Linux pref ${pref}:`, e);
        }
      }
    }

    // Save the current profile preference
    Services.prefs.setIntPref(this.PREF_MEMORY_PROFILE, profileIndex);

    console.log(`MemoryProfileManager: Profile "${profile.name}" applied successfully`);
    return true;
  },

  /**
   * Set a preference value based on its type
   * @private
   */
  _setPref(pref, value) {
    if (typeof value === "boolean") {
      Services.prefs.setBoolPref(pref, value);
    } else if (typeof value === "number") {
      Services.prefs.setIntPref(pref, value);
    } else if (typeof value === "string") {
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
      0: "~1.5-4 GB with multiple tabs",
      1: "~1-2.5 GB with multiple tabs",
      2: "~600 MB-1.5 GB with multiple tabs",
      3: "~2-5 GB with multiple tabs (WebGPU enabled)",
    };
    return descriptions[profileIndex] || "Unknown";
  },

  /**
   * Initialize the memory profile manager
   * Called on browser startup to ensure settings are applied
   */
  init() {
    const currentProfile = this.getCurrentProfile();
    console.log(`MemoryProfileManager: Initialized with profile ${currentProfile}`);
    
    // Register preference observer
    Services.prefs.addObserver(this.PREF_MEMORY_PROFILE, this);
  },

  /**
   * Preference observer
   */
  observe(subject, topic, data) {
    if (topic === "nsPref:changed" && data === this.PREF_MEMORY_PROFILE) {
      const newProfile = this.getCurrentProfile();
      this.applyProfile(newProfile);
    }
  },

  /**
   * Cleanup on shutdown
   */
  uninit() {
    Services.prefs.removeObserver(this.PREF_MEMORY_PROFILE, this);
  },
};

// Export for use in preferences UI
export const MIDORI_MEMORY_PROFILES = MEMORY_PROFILES;
