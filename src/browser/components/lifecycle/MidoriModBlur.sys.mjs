/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const STYLESHEET_URL = "resource:///modules/midori-newtab-modblur.css";
const TAB_LAYOUT_PREF = "midori.modblur.tabs.layout";
const LEGACY_TABS_ON_TOP_PREF = "midori.modblur.tabs.onTop";
const CENTER_WIDGETS_PREF = "midori.modblur.newtab.centerWidgetsStyle";
const HIDE_TITLES_PREF = "midori.modblur.newtab.hideShortcutTitles";

export const LEGACY_MODBLUR_PREFS = [
  LEGACY_TABS_ON_TOP_PREF,
  "midori.modblur.window.frame",
  "midori.modblur.search.popoutBlur",
  "midori.modblur.newtab.centerWidgets",
  "midori.modblur.theme.card",
  "midori.modblur.theme.softTexture",
  "midori.modblur.windowControls.macStyle",
  "midori.modblur.extensions.cleanMenu",
  "midori.modblur.search.hidePermissionIcon",
];

function setMigratedStringPref(pref, value) {
  const defaultValue = Services.prefs
    .getDefaultBranch("")
    .getStringPref(pref, "");
  if (value === defaultValue) {
    if (Services.prefs.prefHasUserValue(pref)) {
      Services.prefs.clearUserPref(pref);
    }
    return;
  }
  Services.prefs.setStringPref(pref, value);
}

function setMigratedIntPref(pref, value) {
  const defaultValue = Services.prefs
    .getDefaultBranch("")
    .getIntPref(pref, value);
  if (value === defaultValue) {
    if (Services.prefs.prefHasUserValue(pref)) {
      Services.prefs.clearUserPref(pref);
    }
    return;
  }
  Services.prefs.setIntPref(pref, value);
}

export function migrateLegacyModBlurPrefs() {
  const hasLayoutChoice = Services.prefs.prefHasUserValue(TAB_LAYOUT_PREF);
  const hasLegacyLayout = Services.prefs.prefHasUserValue(
    LEGACY_TABS_ON_TOP_PREF
  );
  if (!hasLayoutChoice && hasLegacyLayout) {
    const tabsOnTop = Services.prefs.getBoolPref(
      LEGACY_TABS_ON_TOP_PREF,
      false
    );
    setMigratedStringPref(
      TAB_LAYOUT_PREF,
      tabsOnTop ? "tabs-top" : "urlbar-top"
    );
  }
  if (hasLegacyLayout) {
    Services.prefs.clearUserPref(LEGACY_TABS_ON_TOP_PREF);
  }

  const boolMigrations = [
    ["midori.modblur.window.frame", "midori.modblur.window.frameStyle", "compact", "none"],
    ["midori.modblur.search.popoutBlur", "midori.modblur.search.popoutStyle", "animated", "off"],
    ["midori.modblur.newtab.centerWidgets", "midori.modblur.newtab.centerWidgetsStyle", "center", "off"],
    ["midori.modblur.theme.card", "midori.modblur.theme.cardStyle", "subtle", "off"],
    ["midori.modblur.theme.softTexture", "midori.modblur.theme.textureStyle", "grain", "off"],
    ["midori.modblur.windowControls.macStyle", "midori.modblur.windowControls.style", "mac-left", "system"],
  ];

  for (const [legacyPref, currentPref, enabledValue, disabledValue] of
    boolMigrations) {
    if (!Services.prefs.prefHasUserValue(legacyPref)) {
      continue;
    }
    if (!Services.prefs.prefHasUserValue(currentPref)) {
      const enabled = Services.prefs.getBoolPref(legacyPref, false);
      setMigratedStringPref(
        currentPref,
        enabled ? enabledValue : disabledValue
      );
    }
    Services.prefs.clearUserPref(legacyPref);
  }

  if (Services.prefs.prefHasUserValue(CENTER_WIDGETS_PREF)) {
    const value = Services.prefs.getStringPref(CENTER_WIDGETS_PREF, "off");
    if (value === "hide-titles" || value === "keep-titles") {
      if (
        value === "hide-titles" &&
        !Services.prefs.prefHasUserValue(HIDE_TITLES_PREF)
      ) {
        Services.prefs.setBoolPref(HIDE_TITLES_PREF, true);
      }
      setMigratedStringPref(CENTER_WIDGETS_PREF, "center");
    }
  }

  for (const obsoletePref of [
    "midori.modblur.extensions.cleanMenu",
    "midori.modblur.search.hidePermissionIcon",
  ]) {
    if (Services.prefs.prefHasUserValue(obsoletePref)) {
      Services.prefs.clearUserPref(obsoletePref);
    }
  }

  const wallpaperPref = "midori.modblur.newtab.wallpaperBlur";
  if (
    Services.prefs.prefHasUserValue(wallpaperPref) &&
    Services.prefs.getPrefType(wallpaperPref) === Services.prefs.PREF_BOOL
  ) {
    const enabled = Services.prefs.getBoolPref(wallpaperPref, false);
    Services.prefs.clearUserPref(wallpaperPref);
    setMigratedIntPref(wallpaperPref, enabled ? 5 : 0);
  }
}

export const MidoriModBlur = {
  _stylesheetService: null,
  _stylesheetURI: null,

  init() {
    migrateLegacyModBlurPrefs();
    if (this._stylesheetService) {
      return;
    }

    const service = Cc[
      "@mozilla.org/content/style-sheet-service;1"
    ].getService(Ci.nsIStyleSheetService);
    const uri = Services.io.newURI(STYLESHEET_URL);
    if (!service.sheetRegistered(uri, service.USER_SHEET)) {
      service.loadAndRegisterSheet(uri, service.USER_SHEET);
    }
    this._stylesheetService = service;
    this._stylesheetURI = uri;
  },

  uninit() {
    if (
      this._stylesheetService &&
      this._stylesheetURI &&
      this._stylesheetService.sheetRegistered(
        this._stylesheetURI,
        this._stylesheetService.USER_SHEET
      )
    ) {
      this._stylesheetService.unregisterSheet(
        this._stylesheetURI,
        this._stylesheetService.USER_SHEET
      );
    }
    this._stylesheetService = null;
    this._stylesheetURI = null;
  },
};
