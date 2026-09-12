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
 * - 3: Gaming/AI (specialized graphics and throughput settings)
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AppConstants: 'resource://gre/modules/AppConstants.sys.mjs',
  MemoryProfilePolicy: 'resource:///modules/MemoryProfilePolicy.sys.mjs',
});

const PROFILE_INDEXES = [0, 1, 2, 3];

const PROFILE_NAMES = {
  0: 'performance',
  1: 'balanced',
  2: 'lowMemory',
  3: 'gaming',
};

// Union of every preference any opt-in profile may write. The snapshot captures
// the user's value for all of them before Midori takes ownership, so returning
// to Performance restores exactly what the user had.
let ownedPrefsCache = null;

function getOwnedPrefs() {
  if (ownedPrefsCache) {
    return ownedPrefsCache;
  }
  ownedPrefsCache = new Set();
  for (const profileIndex of PROFILE_INDEXES) {
    const platformPreferences =
      lazy.MemoryProfilePolicy.getProfilePreferences(
        profileIndex,
        lazy.AppConstants.platform
      );
    for (const pref of Object.keys(platformPreferences)) {
      ownedPrefsCache.add(pref);
    }
  }
  return ownedPrefsCache;
}

function getProfileSettings(profileIndex) {
  return lazy.MemoryProfilePolicy.getProfilePreferences(
    profileIndex,
    lazy.AppConstants.platform
  );
}

function getAllProfileSettings() {
  const profiles = {};
  for (const profileIndex of PROFILE_INDEXES) {
    const definition = lazy.MemoryProfilePolicy.getProfileDefinition(profileIndex);
    profiles[profileIndex] = {
      name: definition?.name ?? PROFILE_NAMES[profileIndex],
      settings: getProfileSettings(profileIndex),
    };
  }
  return profiles;
}

export const MemoryProfileManager = {
  _initialized: false,
  PREF_MEMORY_PROFILE: 'midori.memory.profile',
  PREF_MEMORY_PROFILE_APPLIED: 'midori.memory.profile.lastApplied',
  PREF_MEMORY_PROFILE_SCHEMA: 'midori.memory.profile.schemaVersion',
  PREF_SAVED_PREFS: 'midori.memory.profile.savedPrefs',

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
    const definition = lazy.MemoryProfilePolicy.getProfileDefinition(profileIndex);
    if (!definition) {
      return null;
    }
    return {
      name: definition.name,
      settings: getProfileSettings(profileIndex),
    };
  },

  /**
   * Get all available profiles
   * @returns {object} All profile configurations
   */
  getAllProfiles() {
    return getAllProfileSettings();
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

    const lastAppliedProfile = Services.prefs.getIntPref(
      this.PREF_MEMORY_PROFILE_APPLIED,
      -1
    );
    const hasSavedPrefs = Services.prefs.prefHasUserValue(
      this.PREF_SAVED_PREFS
    );

    if (profileIndex === lazy.MemoryProfilePolicy.DEFAULT_MEMORY_PROFILE) {
      // The snapshot is the ownership record. If it is present, the user just
      // left an opt-in profile and their original values are restored. If it is
      // absent there is nothing Midori owns, so about:config edits are kept.
      if (hasSavedPrefs) {
        this._restoreSavedPrefs();
      }
      this._clearLegacyManagedPrefs();
    } else {
      this._discardUntrackedPrefs(lastAppliedProfile, hasSavedPrefs);
      this._captureSavedPrefs(profile.settings);
      this._restoreUnusedPrefs(lastAppliedProfile, profile.settings);
      this._applySettings(profile.settings, profile.name);
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

  /**
   * Record the user's original value for every preference a profile may own.
   * Prefs already recorded are left untouched so a previous profile's value is
   * never mistaken for the user's own.
   */
  _captureSavedPrefs(settings) {
    const saved = this._readSavedPrefs();
    const { snapshot, changed } = lazy.MemoryProfilePolicy.capturePreferenceSnapshot({
      preferences: { ...settings, ...this._ownedPrefs() },
      saved,
      readPreference: pref => this._readPrefState(pref),
    });

    if (changed) {
      this._writeSavedPrefs(snapshot);
    }
  },

  /**
   * Restore every recorded preference to the user's original value and forget
   * ownership. Without a snapshot there is nothing Midori owns to restore.
   */
  _restoreSavedPrefs() {
    const saved = this._readSavedPrefs();
    for (const { pref, entry } of lazy.MemoryProfilePolicy.planPreferenceRestore(
      saved
    )) {
      try {
        this._restorePrefState(pref, entry);
      } catch (e) {
        console.error(`MemoryProfileManager: Failed to restore pref ${pref}:`, e);
      }
    }
    Services.prefs.clearUserPref(this.PREF_SAVED_PREFS);
  },

  /**
   * Switching between two opt-in profiles must return preferences owned only by
   * the previous profile to the user's original value before the new profile's
   * values are written.
   */
  _restoreUnusedPrefs(lastAppliedProfile, nextSettings) {
    if (lastAppliedProfile === -1) {
      return;
    }
    const previousSettings = getProfileSettings(lastAppliedProfile);
    const saved = this._readSavedPrefs();
    for (const pref of Object.keys(previousSettings)) {
      if (Object.prototype.hasOwnProperty.call(nextSettings, pref)) {
        continue;
      }
      try {
        this._restorePrefState(
          pref,
          Object.prototype.hasOwnProperty.call(saved, pref)
            ? saved[pref]
            : { hasValue: false }
        );
      } catch (e) {
        console.error(
          `MemoryProfileManager: Failed to restore unused pref ${pref}:`,
          e
        );
      }
    }
  },

  _ownedPrefs() {
    const owned = {};
    for (const pref of getOwnedPrefs()) {
      owned[pref] = true;
    }
    return owned;
  },

  /**
   * Upgrading from a manager that never recorded preference ownership leaves
   * profile-written values indistinguishable from user values. Clear any owned
   * preference that has no recorded origin before the snapshot is taken.
   */
  _discardUntrackedPrefs(lastAppliedProfile, hasSavedPrefs) {
    if (hasSavedPrefs || lastAppliedProfile <= 0) {
      return;
    }
    for (const pref of getOwnedPrefs()) {
      try {
        if (Services.prefs.prefHasUserValue(pref)) {
          Services.prefs.clearUserPref(pref);
        }
      } catch (e) {
        console.error(
          `MemoryProfileManager: Failed to clear untracked pref ${pref}:`,
          e
        );
      }
    }
  },

  _readPrefState(pref) {
    if (!Services.prefs.prefHasUserValue(pref)) {
      return { hasValue: false };
    }
    const type = Services.prefs.getPrefType(pref);
    switch (type) {
      case Services.prefs.PREF_BOOL:
        return { hasValue: true, type: 'boolean', value: Services.prefs.getBoolPref(pref) };
      case Services.prefs.PREF_INT:
        return { hasValue: true, type: 'int', value: Services.prefs.getIntPref(pref) };
      case Services.prefs.PREF_STRING:
        return { hasValue: true, type: 'string', value: Services.prefs.getStringPref(pref) };
      default:
        return { hasValue: false };
    }
  },

  _restorePrefState(pref, entry) {
    if (!entry || !entry.hasValue) {
      if (Services.prefs.prefHasUserValue(pref)) {
        Services.prefs.clearUserPref(pref);
      }
      return;
    }
    if (entry.type === 'boolean') {
      Services.prefs.setBoolPref(pref, entry.value);
    } else if (entry.type === 'int') {
      Services.prefs.setIntPref(pref, entry.value);
    } else if (entry.type === 'string') {
      Services.prefs.setStringPref(pref, entry.value);
    }
  },

  _readSavedPrefs() {
    try {
      const raw = Services.prefs.getStringPref(this.PREF_SAVED_PREFS, '');
      if (!raw) {
        return {};
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      console.error('MemoryProfileManager: Failed to read saved prefs:', e);
      return {};
    }
  },

  _writeSavedPrefs(snapshot) {
    if (!snapshot || Object.keys(snapshot).length === 0) {
      Services.prefs.clearUserPref(this.PREF_SAVED_PREFS);
      return;
    }
    Services.prefs.setStringPref(this.PREF_SAVED_PREFS, JSON.stringify(snapshot));
  },

  /**
   * Preferences written by older versions have no recorded origin, so they can
   * only be cleared when a profile transition validates the cleanup.
   */
  _clearLegacyManagedPrefs() {
    for (const pref of lazy.MemoryProfilePolicy.LEGACY_MANAGED_PREFS) {
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
    const schemaVersion = Services.prefs.getIntPref(
      this.PREF_MEMORY_PROFILE_SCHEMA,
      0
    );
    const migration = lazy.MemoryProfilePolicy.getMemoryProfileMigration({
      configuredProfile: Services.prefs.getIntPref(
        this.PREF_MEMORY_PROFILE,
        lazy.MemoryProfilePolicy.DEFAULT_MEMORY_PROFILE
      ),
      hasUserValue: Services.prefs.prefHasUserValue(this.PREF_MEMORY_PROFILE),
      schemaVersion,
    });

    if (migration.clearUserProfile) {
      Services.prefs.clearUserPref(this.PREF_MEMORY_PROFILE);
    }
    // One-time sweep for prefs abandoned by the punto 4.1 review (GC/render
    // and experimental graphics/network forces). Users upgrading from schema
    // 1 may carry them as user values that no profile owns anymore, so no
    // profile transition would clear them otherwise.
    if (schemaVersion < 2) {
      this._clearLegacyManagedPrefs();
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
   * Qualitative profile summary for the UI. Deliberately free of fixed GB
   * ranges: RAM use depends on content, platform and session, and no
   * measurement scenario backs a per-profile figure (punto 4.1.5). Several
   * options apply to new processes or documents, so a restart is recommended
   * after switching.
   */
  getProfileDescription(profileIndex) {
    const descriptions = {
      0: 'Firefox defaults. Recommended after leaving another profile; restart to reapply to existing processes.',
      1: 'Fewer content processes and smaller caches; keeps speculative loading. Restart recommended.',
      2: 'Minimal processes and caches; disables prefetch and tab warmup to save RAM. Navigation and restore may be slower. Restart recommended.',
      3: 'More content processes and larger caches for heavy pages; no experimental graphics overrides. Restart recommended.',
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
   * Cleanup on shutdown. Profile values and the ownership snapshot persist so
   * the next startup can reapply the selected profile without losing the
   * user's original values.
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
export function getMidoriMemoryProfiles() {
  return getAllProfileSettings();
}
