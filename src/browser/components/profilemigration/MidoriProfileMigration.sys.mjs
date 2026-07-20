/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const MIGRATION_VERSION_PREF = "midori.profileMigration.version";
const ACTIVE_THEME_PREF = "extensions.activeThemeID";
const COLORWAY_PREF = "midori.colorway";
const LEGACY_THEME_MODE_PREF = "midori.theme.mode";
const LEGACY_WINDOW_CONTROLS_PREF = "midori.modblur.windowControls.macStyle";
const WINDOW_CONTROLS_STYLE_PREF = "midori.modblur.windowControls.style";
const SYSTEM_DARK_THEME_PREF = "ui.systemUsesDarkTheme";
const CURRENT_MIGRATION_VERSION = 2;

export const LEGACY_THEME_COLORWAYS = Object.freeze({
  "midori-theme-jade-mist@midori.astian.org": "jade",
  "midori-theme-forest-void@midori.astian.org": "forest",
  "midori-theme-sky-crystal@midori.astian.org": "ocean",
  "midori-theme-deep-ocean@midori.astian.org": "midnight",
  "midori-theme-citrus-dawn@midori.astian.org": "sunrise",
  "midori-theme-volcanic-sunset@midori.astian.org": "ember",
});

function colorwayForLegacyMode(prefs) {
  if (!prefs.prefHasUserValue(LEGACY_THEME_MODE_PREF)) {
    return null;
  }

  switch (prefs.getStringPref(LEGACY_THEME_MODE_PREF, "auto").toLowerCase()) {
    case "dark":
      return "forest";
    case "light":
      return "jade";
    case "auto":
      return prefs.getIntPref(SYSTEM_DARK_THEME_PREF, 0) > 0 ? "forest" : "jade";
    default:
      return null;
  }
}

/**
 * Migrates visual preferences from Midori 11.8.x without resetting Firefox's
 * toolbar state or overriding third-party themes.
 *
 * @param {nsIPrefBranch} prefs
 *   Preference service. Injectable for regression tests.
 * @returns {{ migrated: boolean, colorway: string|null, legacyTheme: string|null }}
 */
export function migrateLegacyProfile(prefs = Services.prefs) {
  const completedVersion = prefs.getIntPref(MIGRATION_VERSION_PREF, 0);
  if (completedVersion >= CURRENT_MIGRATION_VERSION) {
    return { migrated: false, colorway: null, legacyTheme: null };
  }

  const activeTheme = prefs.getStringPref(
    ACTIVE_THEME_PREF,
    "default-theme@mozilla.org"
  );
  const legacyColorway = LEGACY_THEME_COLORWAYS[activeTheme] || null;
  const modeColorway = colorwayForLegacyMode(prefs);
  const selectedColorway = legacyColorway || modeColorway;

  // A colorway selected in 11.9+ is newer than the legacy theme preference and
  // must win. Otherwise translate the old bundled theme to its closest native
  // Midori colorway.
  if (selectedColorway && !prefs.prefHasUserValue(COLORWAY_PREF)) {
    prefs.setStringPref(COLORWAY_PREF, selectedColorway);
  }

  if (legacyColorway && prefs.prefHasUserValue(ACTIVE_THEME_PREF)) {
    // The old built-in add-on no longer ships. Clearing only known Midori IDs
    // activates the new default theme while leaving third-party themes intact.
    prefs.clearUserPref(ACTIVE_THEME_PREF);
  }

  if (prefs.prefHasUserValue(LEGACY_THEME_MODE_PREF)) {
    prefs.clearUserPref(LEGACY_THEME_MODE_PREF);
  }

  if (prefs.prefHasUserValue(LEGACY_WINDOW_CONTROLS_PREF)) {
    if (
      prefs.getBoolPref(LEGACY_WINDOW_CONTROLS_PREF, false) &&
      !prefs.prefHasUserValue(WINDOW_CONTROLS_STYLE_PREF)
    ) {
      prefs.setStringPref(WINDOW_CONTROLS_STYLE_PREF, "mac-right");
    }
    prefs.clearUserPref(LEGACY_WINDOW_CONTROLS_PREF);
  }

  prefs.setIntPref(MIGRATION_VERSION_PREF, CURRENT_MIGRATION_VERSION);
  return {
    migrated: true,
    colorway: selectedColorway,
    legacyTheme: legacyColorway ? activeTheme : null,
  };
}

export const MidoriProfileMigration = Object.freeze({
  migrate: migrateLegacyProfile,
});
