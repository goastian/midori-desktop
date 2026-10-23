/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";

export const SYNC_PREFERENCE_SPECS = Object.freeze({
  "midori.tabs.show.close": { type: "bool" },
  "midori.tabs.show.new": { type: "bool" },
  "midori.workspaces.enabled": { type: "bool" },
  "midori.workspaces.show-button": { type: "bool" },
  "midori.workspaces.show-name": { type: "bool" },
  "midori.workspaces.unloadInactive": { type: "bool" },
  "midori.workspaces.unloadDelayMs": { type: "int", min: 5000, max: 1800000 },
  "midori.workspaces.chromeTint": { type: "bool" },
  "midori.verticaltabs.enabled": { type: "bool" },
  "midori.verticaltabs.position": { type: "string", values: ["left", "right"] },
  "midori.verticaltabs.width": { type: "int", min: 120, max: 600 },
  "midori.verticaltabs.density": { type: "string", values: ["compact", "normal", "comfortable"] },
  "midori.search.useCustomEngine": { type: "bool" },
  "midori.search.customEngine.name": { type: "string", max: 8192 },
  "midori.search.customEngine.url": { type: "string", max: 8192 },
  "midori.sidebar.keeptabsactive.enabled": { type: "bool" },
  "midori.pip.skin": { type: "string", max: 8192 },
  "midori.pdfjs.flat.enabled": { type: "bool" },
  "midori.memory.profile": { type: "int", min: 0, max: 100000000 },
  "midori.tabsleep.enabled": { type: "bool" },
  "midori.tabsleep.timeoutMinutes": { type: "int", min: 0, max: 100000000 },
  "midori.tabsleep.excludeHosts": { type: "string", max: 8192 },
  "midori.colorway": { type: "string", max: 8192 },
  "midori.modblur.windowControls.macStyle": { type: "bool", platforms: ["linux", "win"] },
  "midori.modblur.windowControls.style": { type: "string", max: 8192, platforms: ["linux", "win"] },
  "midori.modblur.bookmarks.popout": { type: "bool" },
  "midori.modblur.bookmarks.clean": { type: "bool" },
  "midori.modblur.bookmarks.hideFolderIcons": { type: "bool" },
  "midori.modblur.bookmarks.transparent": { type: "bool" },
  "midori.modblur.bookmarks.centered": { type: "bool" },
  "midori.modblur.privacy.blurIdentity": { type: "bool" },
  "midori.modblur.privacy.blurTabs": { type: "bool" },
  "midori.modblur.extensions.style": { type: "string", max: 8192 },
  "midori.modblur.extensions.columns": { type: "int", min: 0, max: 100000000 },
  "midori.modblur.extensions.iconSize": { type: "int", min: 0, max: 100000000 },
  "midori.modblur.extensions.hideManageButton": { type: "bool" },
  "midori.modblur.extensions.hideSeparator": { type: "bool" },
  "midori.modblur.extensions.hideFaded": { type: "bool" },
  "midori.modblur.icons.mainMenu": { type: "bool" },
  "midori.modblur.icons.tabsOverview": { type: "bool" },
  "midori.modblur.icons.midoriMenu": { type: "bool" },
  "midori.modblur.icons.github": { type: "bool" },
  "midori.modblur.icons.ublock": { type: "bool" },
  "midori.modblur.verticalTabs.compact": { type: "bool" },
  "midori.modblur.verticalTabs.hideScrollbar": { type: "bool" },
  "midori.modblur.tabs.autohide": { type: "bool" },
  "midori.modblur.tabs.showWhileInactive": { type: "bool" },
  "midori.modblur.tabs.centered": { type: "bool" },
  "midori.modblur.tabs.hidePreviewPanel": { type: "bool" },
  "midori.modblur.tabs.layout": { type: "string", max: 8192 },
  "midori.modblur.tabs.onTop": { type: "bool" },
  "midori.modblur.tabs.activeStaticWidth": { type: "bool" },
  "midori.modblur.tabs.soundColor": { type: "bool" },
  "midori.modblur.tabs.hideAllTabsButton": { type: "bool" },
  "midori.modblur.window.frame": { type: "bool", platforms: ["linux", "win"] },
  "midori.modblur.window.frameStyle": { type: "string", max: 8192, platforms: ["linux", "win"] },
  "midori.modblur.search.focusOutline": { type: "bool" },
  "midori.modblur.search.buttonsAlways": { type: "bool" },
  "midori.modblur.search.textAlignment": { type: "string", max: 8192 },
  "midori.modblur.search.compactIdentity": { type: "bool" },
  "midori.modblur.search.hideExtensionIcon": { type: "bool" },
  "midori.modblur.search.popoutBlur": { type: "bool" },
  "midori.modblur.search.popoutStyle": { type: "string", max: 8192 },
  "midori.modblur.blur.extra": { type: "bool" },
  "midori.modblur.blur.panels": { type: "bool" },
  "midori.modblur.blur.searchbar": { type: "bool" },
  "midori.modblur.blur.verticalExpand": { type: "bool" },
  "midori.modblur.blur.acrylic": { type: "bool" },
  "midori.modblur.blur.strength": { type: "string", max: 8192 },
  "midori.modblur.menus.density": { type: "string", max: 8192 },
  "midori.modblur.motion.style": { type: "string", max: 8192 },
  "midori.modblur.newtab.hideShortcutTitles": { type: "bool" },
  "midori.modblur.newtab.centerWidgets": { type: "bool" },
  "midori.modblur.newtab.centerWidgetsStyle": { type: "string", max: 8192 },
  "midori.modblur.newtab.circularShortcuts": { type: "bool" },
  "midori.modblur.newtab.wallpaperBlur": { type: "int", min: 0, max: 100000000 },
  "midori.modblur.theme.spill": { type: "bool" },
  "midori.modblur.theme.card": { type: "bool" },
  "midori.modblur.theme.cardStyle": { type: "string", max: 8192 },
  "midori.modblur.theme.textureStyle": { type: "string", max: 8192 },
  "midori.arcmode.enabled": { type: "bool" },
  "midori.gradient.enabled": { type: "bool" },
  "midori.gradient.type": { type: "string", max: 8192 },
  "midori.gradient.angle": { type: "int", min: 0, max: 100000000 },
  "midori.gradient.stops": { type: "string", max: 8192 },
  "midori.gradient.texture": { type: "string", max: 8192 },
  "midori.gradient.texture.opacity": { type: "int", min: 0, max: 100000000 },
  "midori.verticaltabs.style": { type: "string", max: 8192 },
  "midori.verticaltabs.compact": { type: "bool" },
  "midori.verticaltabs.collapse": { type: "bool" },
  "midori.compact.enabled": { type: "bool" },
  "midori.verticaltabs.floatingUrlbar": { type: "bool" },
  "midori.verticaltabs.showRail": { type: "bool" },
  "midori.verticaltabs.showPinnedSection": { type: "bool" },
  "midori.verticaltabs.essentials.enabled": { type: "bool" },
  "midori.verticaltabs.essentials.max": { type: "int", min: 0, max: 100000000 },
  "midori.verticaltabs.essentials.items": { type: "string", max: 8192 },
  "midori.verticaltabs.essentials.fetchIcons": { type: "bool" },
  "midori.verticaltabs.urlbar.autoSelect": { type: "bool" },
  "midori.verticaltabs.accent.mode": { type: "string", max: 8192 },
  "midori.verticaltabs.accent.custom": { type: "string", max: 8192 },
  "midori.horizontaltabs.position": { type: "string", max: 8192 },
  "midori.msidebar.enabled": { type: "bool" },
  "midori.msidebar.position": { type: "string", max: 8192 },
  "midori.msidebar.width": { type: "int", min: 0, max: 100000000 },
  "midori.msidebar.autohide.enabled": { type: "bool" },
  "midori.msidebar.autohide.mode": { type: "string", max: 8192 },
  "midori.msidebar.animations.enabled": { type: "bool" },
  "midori.msidebar.hidePanelWhenHidden": { type: "bool" },
  "midori.msidebar.newPanelButton.position": { type: "string", max: 8192 },
  "midori.msidebar.geometryHint.enabled": { type: "bool" },
  "midori.msidebar.containerIndicator": { type: "string", max: 8192 },
  "midori.msidebar.tooltip.mode": { type: "string", max: 8192 },
  "midori.msidebar.tooltip.fullUrl": { type: "bool" },
  "midori.msidebar.webPanelToolbar.autohide": { type: "bool" },
  "midori.msidebar.webPanelToolbar.autohideBack": { type: "bool" },
  "midori.msidebar.webPanelToolbar.autohideForward": { type: "bool" },
  "midori.msidebar.shortcut.toggleSidebar": { type: "string", max: 8192 },
  "midori.msidebar.shortcut.togglePanel": { type: "string", max: 8192 },
  "midori.msidebar.shortcut.commandPalette": { type: "string", max: 8192 },
  "midori.msidebar.rail.expanded": { type: "bool" },
  "midori.msidebar.preset": { type: "string", max: 8192 },
  "midori.msidebar.sites.selected": { type: "string", max: 8192 },
  "midori.shortcuts.general.openCenter": { type: "string", max: 8192 },
  "midori.shortcuts.tabs.toggleVertical": { type: "string", max: 8192 },
  "midori.shortcuts.quickActions.searchSelectedText": { type: "string", max: 8192 },
  "midori.shortcuts.quickActions.duplicateTab": { type: "string", max: 8192 },
  "midori.shortcuts.tabs.protectTab": { type: "string", max: 8192 },
  "midori.workspaces.shortcut.previous": { type: "string", max: 8192 },
  "midori.workspaces.shortcut.next": { type: "string", max: 8192 },
  "midori.workspaces.shortcut.switch1": { type: "string", max: 8192 },
  "midori.workspaces.shortcut.switch2": { type: "string", max: 8192 },
  "midori.workspaces.shortcut.switch3": { type: "string", max: 8192 },
  "midori.workspaces.shortcut.switch4": { type: "string", max: 8192 },
  "midori.workspaces.shortcut.switch5": { type: "string", max: 8192 },
  "midori.workspaces.shortcut.switch6": { type: "string", max: 8192 },
  "midori.workspaces.shortcut.switch7": { type: "string", max: 8192 },
  "midori.workspaces.shortcut.switch8": { type: "string", max: 8192 },
  "midori.workspaces.shortcut.switch9": { type: "string", max: 8192 },
  "midori.autohide.toolbar": { type: "bool" },
  "midori.autohide.flashOnLocationChange": { type: "bool" },
  "midori.autohide.flashDurationMs": { type: "int", min: 0, max: 100000000 },
  "midori.blocker.enabled": { type: "bool" },
  "midori.blocker.ui.enabled": { type: "bool" },
  "midori.blocker.showBadge": { type: "bool" },
  "midori.blocker.customFiltersEnabled": { type: "bool" },
  "browser.tabs.warnOnClose": { type: "bool" },
  "browser.tabs.warnOnCloseOtherTabs": { type: "bool" },
  "browser.tabs.closeWindowWithLastTab": { type: "bool" },
  "browser.tabs.loadInBackground": { type: "bool" },
  "browser.tabs.insertRelatedAfterCurrent": { type: "bool" },
  "browser.ctrlTab.sortByRecentlyUsed": { type: "bool" },
  "browser.search.suggest.enabled": { type: "bool" },
  "browser.urlbar.suggest.history": { type: "bool" },
  "browser.urlbar.suggest.bookmark": { type: "bool" },
  "browser.urlbar.suggest.openpage": { type: "bool" },
  "browser.urlbar.suggest.topsites": { type: "bool" },
  "browser.urlbar.suggest.engines": { type: "bool" },
  "browser.urlbar.suggest.searches": { type: "bool" },
  "browser.formfill.enable": { type: "bool" },
  "general.autoScroll": { type: "bool" },
  "general.smoothScroll": { type: "bool" },
  "accessibility.typeaheadfind": { type: "bool" },
  "privacy.donottrackheader.enabled": { type: "bool" },
  "privacy.globalprivacycontrol.enabled": { type: "bool" },
  "privacy.trackingprotection.enabled": { type: "bool" },
  "privacy.trackingprotection.fingerprinting.enabled": { type: "bool" },
  "privacy.trackingprotection.cryptomining.enabled": { type: "bool" },
  "dom.security.https_only_mode": { type: "bool" },
  "dom.security.https_only_mode_pbm": { type: "bool" },
  "privacy.sanitize.sanitizeOnShutdown": { type: "bool" },
  "signon.rememberSignons": { type: "bool" },
  "signon.autofillForms": { type: "bool" },
  "signon.generation.enabled": { type: "bool" },
  "extensions.formautofill.addresses.enabled": { type: "bool" },
  "extensions.formautofill.creditCards.enabled": { type: "bool" },
  "browser.safebrowsing.malware.enabled": { type: "bool" },
  "browser.safebrowsing.phishing.enabled": { type: "bool" },
  "browser.download.useDownloadDir": { type: "bool" },
  "browser.download.alwaysOpenPanel": { type: "bool" },
  "browser.zoom.siteSpecific": { type: "bool" },
  "browser.compactmode.show": { type: "bool" },
  "intl.regional_prefs.use_os_locales": { type: "bool" },
  "browser.startup.page": { type: "int", min: 0, max: 3 },
  "network.cookie.cookieBehavior": { type: "int", min: 0, max: 5 },
  "browser.uidensity": { type: "int", min: 0, max: 2 },
  "browser.link.open_newwindow": { type: "int", min: 1, max: 3 },
  "layout.spellcheckDefault": { type: "int", min: 0, max: 2 },
  "browser.contentblocking.category": { type: "string", values: ["standard", "strict", "custom"] },
  "browser.toolbars.bookmarks.visibility": { type: "string", values: ["always", "never", "newtab"] },
  "intl.accept_languages": { type: "string", max: 256, pattern: /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*(?:, ?[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)*$/ },
});

export function validateSyncPreference(id, value) {
  if (!Object.hasOwn(SYNC_PREFERENCE_SPECS, id) || value?.version !== 1 || value.name !== id ||
      Object.keys(value).length !== 3 || !["version", "name", "value"].every(key => Object.hasOwn(value, key))) {
    throw new SyncProtocolError("invalid_record");
  }
  const spec = SYNC_PREFERENCE_SPECS[id];
  const actual = value.value;
  let invalid;
  if (spec.type === "bool") {
    invalid = typeof actual !== "boolean";
  } else if (spec.type === "int") {
    invalid = !Number.isSafeInteger(actual) || actual < spec.min || actual > spec.max;
  } else {
    invalid = !validString(spec, actual);
  }
  if (invalid) {
    throw new SyncProtocolError("invalid_record");
  }
  return value;
}

function validString(spec, actual) {
  if (typeof actual !== "string") {
    return false;
  }
  if (spec.values) {
    return spec.values.includes(actual);
  }
  return actual.length <= spec.max && !/[\p{Cc}\p{Cs}]/u.test(actual) &&
    (!spec.pattern || spec.pattern.test(actual));
}

const PREF_TYPES = { bool: 128, int: 64, string: 32 };

function localTypeMismatch(prefs, id, spec) {
  if (typeof prefs.getPrefType !== "function") {
    return false;
  }
  const type = prefs.getPrefType(id);
  return type !== 0 && type !== PREF_TYPES[spec.type];
}

function currentPlatform() {
  return typeof ChromeUtils === "undefined" ? "linux" :
    ChromeUtils.importESModule("resource://gre/modules/AppConstants.sys.mjs").AppConstants.platform;
}

/**
 *
 */
export class MidoriSyncPreferences {
  #prefs;
  #platform;
  #coordinateBlocker;
  #closed = false;

  constructor({ prefs = Services.prefs, platform = currentPlatform(), coordinateBlocker = null } = {}) {
    this.#prefs = prefs;
    this.#platform = platform;
    this.#coordinateBlocker = coordinateBlocker ??
      (typeof ChromeUtils !== "undefined" && typeof Services !== "undefined" && prefs === Services.prefs
        ? task => ChromeUtils.importESModule("resource:///modules/MidoriBlockerService.sys.mjs")
          .MidoriBlockerService.withCustomFiltersSettings(task)
        : null);
  }

  async flush() {
    this.#ensureOpen();
    await this.#prefs.flushPrefFile();
    this.#ensureOpen();
  }

  #unsupported(spec) {
    return Array.isArray(spec.platforms) && !spec.platforms.includes(this.#platform);
  }

  read(id, base = null) {
    if (id === "midori.blocker.customFiltersEnabled" && this.#coordinateBlocker) {
      return this.#coordinateBlocker(() => this.#read(id, base));
    }
    return this.#read(id, base);
  }

  #read(id, base = null) {
    this.#ensureOpen();
    if (!Object.hasOwn(SYNC_PREFERENCE_SPECS, id)) {
      throw new SyncProtocolError("invalid_record");
    }
    const spec = SYNC_PREFERENCE_SPECS[id];
    if (this.#unsupported(spec)) {
      return base;
    }
    if (this.#prefs.prefIsLocked(id)) {
      return base;
    }
    if (!this.#prefs.prefHasUserValue(id) || localTypeMismatch(this.#prefs, id, spec)) {
      return null;
    }
    try {
      let value;
      if (spec.type === "bool") {
        value = this.#prefs.getBoolPref(id);
      } else if (spec.type === "int") {
        value = this.#prefs.getIntPref(id);
      } else {
        value = this.#prefs.getStringPref(id);
      }
      return validateSyncPreference(id, { version: 1, name: id, value });
    } catch {
      throw new SyncProtocolError("invalid_local_preference");
    }
  }

  validate(id, value) {
    this.#ensureOpen();
    return validateSyncPreference(id, value);
  }

  matchesLocal(_id, current, base) {
    return JSON.stringify(current) === JSON.stringify(base);
  }

  apply(incoming, previous = null) {
    if (incoming?.id === "midori.blocker.customFiltersEnabled" && this.#coordinateBlocker) {
      return this.#coordinateBlocker(() => this.#apply(incoming, previous));
    }
    return this.#apply(incoming, previous);
  }

  #apply(incoming, previous = null) {
    this.#ensureOpen();
    const id = incoming.id;
    if (!Object.hasOwn(SYNC_PREFERENCE_SPECS, id)) {
      throw new SyncProtocolError("invalid_record");
    }
    if (this.#unsupported(SYNC_PREFERENCE_SPECS[id])) {
      return { status: "applied" };
    }
    if (this.#prefs.prefIsLocked(id)) {
      return { status: "conflict", reason: "preference_locked" };
    }
    const remote = incoming.deleted ? null : this.validate(id, incoming.value);
    const base = previous === null || previous.deleted ? null : this.validate(id, previous.value);
    const current = this.#read(id);
    if (this.matchesLocal(id, current, remote)) {
      return { status: "applied" };
    }
    if (!this.matchesLocal(id, current, base)) {
      return { status: "conflict", reason: "local_preference_changed" };
    }
    if (remote === null) {
      this.#prefs.clearUserPref(id);
    } else {
      const spec = SYNC_PREFERENCE_SPECS[id];
      if (localTypeMismatch(this.#prefs, id, spec)) {
        return { status: "applied" };
      }
      if (spec.type === "bool") {
        this.#prefs.setBoolPref(id, remote.value);
      } else if (spec.type === "int") {
        this.#prefs.setIntPref(id, remote.value);
      } else {
        this.#prefs.setStringPref(id, remote.value);
      }
    }
    return { status: "applied" };
  }

  close() {
    this.#closed = true;
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncProtocolError("cancelled");
    }
  }
}
