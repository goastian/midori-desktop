/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { isRegularBrowserWindow } from "resource:///modules/MidoriWebAppUtils.sys.mjs";
import {
  TAB_PROTECTION_MODES,
  isTabProtectionRecordValid,
  normalizeTabProtectionMode,
  shouldRequireTabPassword,
} from "resource:///modules/TabProtectionState.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SessionStore: "resource:///modules/sessionstore/SessionStore.sys.mjs",
});

export const PREF_TAB_PROTECTION_MODE = "midori.tabprotect.mode";
export const PREF_TAB_PROTECTION_GLOBAL_HASH = "midori.tabprotect.globalPasswordHash";
export const TAB_PROTECTION_STATE_TOPIC =
  "midori-tab-protection-state-changed";

const TAB_PROTECTED_ATTR = "midori-protected";
const TAB_PASSWORD_ATTR = "midori-protected-password";
const TAB_SCOPE_ATTR = "midori-protected-scope";
const TAB_PASSWORD_KEY = "midori-tabprotect-password";
const TAB_SCOPE_KEY = "midori-tabprotect-scope";
const TAB_EVENT_TYPES = [
  "SSTabRestored",
  "SSTabRestoring",
  "TabAttrModified",
  "TabClose",
  "TabOpen",
  "TabRemotenessChange",
  "TabSelect",
];
const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";
const STYLESHEET_URL = "resource:///modules/tabprotect.css";
const ACTIVE_WINDOW_ATTR = "midori-tabprotect-active";
const TAB_LOCKED_ATTR = "midori-tabprotect-locked";
const BROWSER_HIDDEN_ATTR = "midori-tabprotect-content-hidden";
const PROTECTED_TAB_TITLE = "Protected Tab";
const PBKDF2_PREFIX = "pbkdf2-sha256";
const PBKDF2_ITERATIONS = 600_000;
const MIN_PASSWORD_LENGTH = 8;
const MAX_FAILED_ATTEMPTS = 5;
const ATTEMPT_COOLDOWN_MS = 30_000;
const BLOCKED_COMMANDS = new Set([
  "Browser:AddBookmarkAs",
  "Browser:Back",
  "Browser:BackOrBackDuplicate",
  "Browser:DuplicateTab",
  "Browser:Forward",
  "Browser:ForwardOrForwardDuplicate",
  "Browser:OpenFile",
  "Browser:OpenLocation",
  "Browser:Reload",
  "Browser:ReloadOrDuplicate",
  "Browser:ReloadSkipCache",
  "Browser:SavePage",
  "Browser:Screenshot",
  "Browser:SendLink",
  "Browser:Stop",
  "View:PageInfo",
  "View:PageSource",
  "View:PictureInPicture",
  "View:ReaderView",
  "cmd_editPDF",
  "cmd_find",
  "cmd_findAgain",
  "cmd_findPrevious",
  "cmd_pageSetup",
  "cmd_print",
  "cmd_printPreviewToggle",
  "cmd_translate",
  "context-inspect",
  "context-inspect-a11y",
  "context-savepage",
  "context-take-screenshot",
  "context-viewpartialsource-selection",
  "context-viewsource",
  "context_duplicateTab",
  "context_duplicateTabs",
  "menu_pageInfo",
  "menu_print",
  "menu_savePage",
]);

function getTabPasswordHash(tab) {
  if (!tab) {
    return "";
  }
  try {
    return lazy.SessionStore.getCustomTabValue(tab, TAB_PASSWORD_KEY) || tab.getAttribute(TAB_PASSWORD_ATTR) || "";
  } catch {
    return tab.getAttribute(TAB_PASSWORD_ATTR) || "";
  }
}

function setTabPasswordHash(tab, passwordHash) {
  tab.setAttribute(TAB_PASSWORD_ATTR, passwordHash);
  lazy.SessionStore.setCustomTabValue(tab, TAB_PASSWORD_KEY, passwordHash);
}

function getTabScope(tab) {
  try {
    return normalizeTabProtectionMode(
      lazy.SessionStore.getCustomTabValue(tab, TAB_SCOPE_KEY) || tab.getAttribute(TAB_SCOPE_ATTR)
    );
  } catch {
    return normalizeTabProtectionMode(tab.getAttribute(TAB_SCOPE_ATTR));
  }
}

function setTabScope(tab, scope) {
  const normalizedScope = normalizeTabProtectionMode(scope);
  tab.setAttribute(TAB_SCOPE_ATTR, normalizedScope);
  lazy.SessionStore.setCustomTabValue(tab, TAB_SCOPE_KEY, normalizedScope);
}

function clearTabPasswordHash(tab) {
  tab.removeAttribute(TAB_PASSWORD_ATTR);
  tab.removeAttribute(TAB_SCOPE_ATTR);
  try {
    lazy.SessionStore.deleteCustomTabValue(tab, TAB_PASSWORD_KEY);
    lazy.SessionStore.deleteCustomTabValue(tab, TAB_SCOPE_KEY);
  } catch {}
}

function tabStateHasProtection(tabState) {
  const state = tabState?.state || tabState;
  return !!(
    state?.extData?.[TAB_PASSWORD_KEY] ||
    state?.extData?.[TAB_SCOPE_KEY]
  );
}

function passwordDigest(password) {
  const bytes = new TextEncoder().encode(password);
  const hasher = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
  hasher.init(hasher.SHA256);
  hasher.update(bytes, bytes.length);
  return Array.from(hasher.finish(false), character => character.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

function equalBytes(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derivePassword(password, salt, iterations = PBKDF2_ITERATIONS) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
}

async function createPasswordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await derivePassword(password, salt);
  const encodedSalt = ChromeUtils.base64URLEncode(salt, { pad: false });
  const encodedHash = ChromeUtils.base64URLEncode(derived, { pad: false });
  return `${PBKDF2_PREFIX}:${PBKDF2_ITERATIONS}:${encodedSalt}:${encodedHash}`;
}

async function passwordMatches(password, storedHash) {
  const [algorithm, iterationsValue, encodedSalt, encodedHash] = storedHash.split(":");
  if (algorithm === PBKDF2_PREFIX && encodedSalt && encodedHash) {
    const iterations = Number.parseInt(iterationsValue, 10);
    if (!Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 1_000_000) {
      return false;
    }
    try {
      const salt = new Uint8Array(
        ChromeUtils.base64URLDecode(encodedSalt, { padding: "ignore" })
      );
      const expected = new Uint8Array(
        ChromeUtils.base64URLDecode(encodedHash, { padding: "ignore" })
      );
      return equalBytes(await derivePassword(password, salt, iterations), expected);
    } catch {
      return false;
    }
  }

  const separator = storedHash.indexOf(":");
  if (separator === -1) {
    return false;
  }
  const salt = storedHash.slice(0, separator);
  return passwordDigest(`${salt}:${password}`) === storedHash.slice(separator + 1);
}

function promptForPassword(win, title, text) {
  const password = { value: "" };
  const accepted = Services.prompt.promptPassword(win, title, text, password, null, {});
  return accepted ? password.value : null;
}

function promptForNewPassword(win, title, text) {
  const password = promptForPassword(win, title, text);
  if (typeof password !== "string") {
    return null;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    Services.prompt.alert(
      win,
      title,
      `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    );
    return null;
  }
  const confirmation = promptForPassword(win, title, "Enter the password again to confirm it.");
  if (typeof confirmation !== "string") {
    return null;
  }
  if (password !== confirmation) {
    Services.prompt.alert(win, title, "The passwords do not match.");
    return null;
  }
  return password;
}

function getContextTab(win, menu) {
  return win.TabContextMenu?.contextTab || menu?.triggerNode?.closest?.("tab") || win.gBrowser?.selectedTab || null;
}

function createHTMLElement(doc, tagName, className = "", text = "") {
  const element = doc.createElementNS(HTML_NS, tagName);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

function createLockIcon(doc) {
  const container = createHTMLElement(doc, "div", "midori-tabprotect-icon");
  container.setAttribute("aria-hidden", "true");
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const body = doc.createElementNS(SVG_NS, "rect");
  body.setAttribute("x", "5");
  body.setAttribute("y", "10");
  body.setAttribute("width", "14");
  body.setAttribute("height", "11");
  body.setAttribute("rx", "3");
  const shackle = doc.createElementNS(SVG_NS, "path");
  shackle.setAttribute("d", "M8 10V7a4 4 0 0 1 8 0v3");
  const keyhole = doc.createElementNS(SVG_NS, "path");
  keyhole.setAttribute("d", "M12 14.5v2.5");
  svg.append(body, shackle, keyhole);
  container.append(svg);
  return container;
}

export const MidoriTabProtection = {
  _initialized: false,
  _windowState: new WeakMap(),
  _credentialAttempts: new Map(),

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this._registerStylesheet();
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.obs.addObserver(this, "domwindowclosed");
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (win.document.readyState === "complete") {
        this._attachWindow(win);
      }
    }
  },

  uninit() {
    if (!this._initialized) {
      return;
    }
    this._initialized = false;
    Services.obs.removeObserver(this, "browser-delayed-startup-finished");
    Services.obs.removeObserver(this, "domwindowclosed");
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      this._cleanupWindow(win);
    }
    this._unregisterStylesheet();
  },

  observe(subject, topic) {
    if (topic === "browser-delayed-startup-finished") {
      this._attachWindow(subject);
    } else if (topic === "domwindowclosed") {
      this._cleanupWindow(subject);
    }
  },

  getMode() {
    return normalizeTabProtectionMode(
      Services.prefs.getStringPref(PREF_TAB_PROTECTION_MODE, TAB_PROTECTION_MODES.GLOBAL)
    );
  },

  setMode(mode) {
    Services.prefs.setStringPref(PREF_TAB_PROTECTION_MODE, normalizeTabProtectionMode(mode));
  },

  hasGlobalPassword() {
    return !!Services.prefs.getStringPref(PREF_TAB_PROTECTION_GLOBAL_HASH, "");
  },

  async setGlobalPassword(password) {
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      return false;
    }
    const passwordHash = await createPasswordHash(password);
    Services.prefs.setStringPref(
      PREF_TAB_PROTECTION_GLOBAL_HASH,
      passwordHash
    );
    this._credentialAttempts.clear();
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (!isRegularBrowserWindow(win)) {
        continue;
      }
      for (const tab of win.gBrowser.tabs) {
        if (
          this.isProtected(tab) &&
          getTabScope(tab) === TAB_PROTECTION_MODES.GLOBAL
        ) {
          setTabPasswordHash(tab, passwordHash);
          this._lockTab(win, tab, { focus: tab.selected });
        }
      }
    }
    return true;
  },

  isProtected(tab) {
    return isTabProtectionRecordValid({
      protected: true,
      passwordHash: getTabPasswordHash(tab),
    });
  },

  async protectTab(win, tab = win?.gBrowser?.selectedTab) {
    this.init();
    if (!tab || this.isProtected(tab)) {
      return false;
    }

    let passwordHash = "";
    const scope = this.getMode();
    if (scope === TAB_PROTECTION_MODES.GLOBAL) {
      passwordHash = Services.prefs.getStringPref(PREF_TAB_PROTECTION_GLOBAL_HASH, "");
      if (!passwordHash) {
        const password = promptForNewPassword(
          win,
          "Set tab protection password",
          "Create the password used to unlock protected tabs."
        );
        if (!(await this.setGlobalPassword(password))) {
          return false;
        }
        passwordHash = Services.prefs.getStringPref(PREF_TAB_PROTECTION_GLOBAL_HASH, "");
      }
    } else {
      const password = promptForNewPassword(win, "Protect Tab", "Set a password for this tab.");
      if (typeof password !== "string") {
        return false;
      }
      passwordHash = await createPasswordHash(password);
    }

    tab.setAttribute(TAB_PROTECTED_ATTR, "true");
    setTabPasswordHash(tab, passwordHash);
    setTabScope(tab, scope);
    this._lockTab(win, tab, { focus: true });
    this._notifyStateChanged();
    return true;
  },

  async unprotectTab(win, tab = win?.gBrowser?.selectedTab) {
    if (!this.isProtected(tab)) {
      return false;
    }
    if (!(await this._unlockTab(win, tab, "Enter the password to remove protection from this tab."))) {
      return false;
    }
    tab.removeAttribute(TAB_PROTECTED_ATTR);
    clearTabPasswordHash(tab);
    this._removeOverlay(win, tab);
    this._notifyStateChanged();
    return true;
  },

  async toggleTabProtection(win, tab = win?.gBrowser?.selectedTab) {
    if (!this.isProtected(tab)) {
      return this.protectTab(win, tab);
    }
    this._lockTab(win, tab, { focus: true });
    return true;
  },

  resetAllProtection() {
    const tabsToClose = [];
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (!isRegularBrowserWindow(win)) {
        continue;
      }
      const protectedTabs = [...win.gBrowser.tabs].filter(tab => this.isProtected(tab));
      if (protectedTabs.length) {
        tabsToClose.push({ win, protectedTabs });
      }
    }
    this._purgeClosedProtectionData();
    Services.prefs.clearUserPref(PREF_TAB_PROTECTION_GLOBAL_HASH);
    this._credentialAttempts.clear();
    let closedTabs = 0;
    for (const { win, protectedTabs } of tabsToClose) {
      for (const tab of protectedTabs) {
        win.gBrowser.removeTab(tab, {
          animate: false,
          closeWindowWithLastTab: false,
          skipPermitUnload: true,
          skipSessionStore: true,
        });
      }
      closedTabs += protectedTabs.length;
    }
    this._notifyStateChanged();
    return closedTabs;
  },

  hasProtectedTabs() {
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (
        isRegularBrowserWindow(win) &&
        [...win.gBrowser.tabs].some(tab => this.isProtected(tab))
      ) {
        return true;
      }
    }
    return false;
  },

  _purgeClosedProtectionData() {
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      let closedTabs = [];
      try {
        closedTabs = lazy.SessionStore.getClosedTabDataForWindow(win);
      } catch {}
      for (const closedTab of closedTabs) {
        if (!tabStateHasProtection(closedTab) || !closedTab.closedId) {
          continue;
        }
        try {
          lazy.SessionStore.forgetClosedTabById(closedTab.closedId, win);
        } catch {}
      }
    }

    let closedWindowTabs = [];
    try {
      closedWindowTabs = lazy.SessionStore.getClosedTabDataFromClosedWindows();
    } catch {}
    for (const closedTab of closedWindowTabs) {
      if (
        !tabStateHasProtection(closedTab) ||
        !closedTab.closedId ||
        !closedTab.sourceClosedId
      ) {
        continue;
      }
      try {
        lazy.SessionStore.forgetClosedTabById(closedTab.closedId, {
          sourceClosedId: closedTab.sourceClosedId,
        });
      } catch {}
    }

    let closedWindows = [];
    try {
      closedWindows = lazy.SessionStore.getClosedWindowData();
    } catch {}
    for (const closedWindow of closedWindows) {
      if (
        !closedWindow.closedId ||
        !closedWindow.tabs?.some(tabStateHasProtection)
      ) {
        continue;
      }
      try {
        lazy.SessionStore.forgetClosedWindowById(closedWindow.closedId);
      } catch {}
    }

    let savedGroups = [];
    try {
      savedGroups = lazy.SessionStore.getSavedTabGroups();
    } catch {}
    for (const savedGroup of savedGroups) {
      if (!savedGroup.tabs?.some(tabStateHasProtection)) {
        continue;
      }
      try {
        lazy.SessionStore.forgetSavedTabGroup(savedGroup.id);
      } catch {}
    }
  },

  _attachWindow(win) {
    if (!isRegularBrowserWindow(win) || this._windowState.has(win)) {
      return;
    }
    const menu = win.document.getElementById("tabContextMenu");
    if (!menu) {
      return;
    }

    let menuitem = win.document.getElementById("midori-protect-tab");
    let separator = win.document.getElementById(
      "midori-protect-tab-separator"
    );
    const ownsMenu = !menuitem || !separator;
    let onMenuCommand = null;
    if (ownsMenu) {
      menuitem?.remove();
      separator?.remove();
      menuitem = win.document.createXULElement("menuitem");
      menuitem.id = "midori-protect-tab";
      menuitem.setAttribute("label", "Protect Tab");
      separator = win.document.createXULElement("menuseparator");
      separator.id = "midori-protect-tab-separator";
      onMenuCommand = () => {
        const tab = getContextTab(win, menu);
        void (this.isProtected(tab)
          ? this.unprotectTab(win, tab)
          : this.protectTab(win, tab));
      };
      menuitem.addEventListener("command", onMenuCommand);
      menu.append(separator, menuitem);
    }

    const previewPanel = win.document.getElementById("tab-preview-panel");
    const state = {
      menu,
      menuitem,
      separator,
      ownsMenu,
      onMenuCommand,
      previewPanel,
      unlockedTabs: new WeakSet(),
      overlays: new Map(),
      metadata: new WeakMap(),
      browserPrivacy: new WeakMap(),
      urlbarPrivacy: null,
      onPopupShowing: () => {
        const tab = getContextTab(win, menu);
        const protectedTab = this.isProtected(tab);
        menuitem.hidden = !tab;
        separator.hidden = !tab;
        menuitem.setAttribute("label", protectedTab ? "Remove Tab Protection" : "Protect Tab");
      },
      onPreviewShowing: () => {
        const tab = previewPanel?.anchorNode?.closest?.("tab");
        previewPanel?.toggleAttribute(
          TAB_LOCKED_ATTR,
          !!tab && this.isProtected(tab) && tab.hasAttribute(TAB_LOCKED_ATTR)
        );
      },
      onWindowDeactivate: () => {
        const tab = win.gBrowser.selectedTab;
        if (this.isProtected(tab)) {
          this._lockTab(win, tab);
        }
      },
      onTabSwitchDone: () => {
        const tab = win.gBrowser.selectedTab;
        if (this._isTabLocked(win, tab)) {
          this._setBrowserPrivacy(win, tab, true);
          this._syncChromePrivacy(win);
        }
      },
      onVisibilityChange: () => {
        const tab = win.gBrowser.selectedTab;
        if (this._isTabLocked(win, tab)) {
          this._setBrowserPrivacy(win, tab, true);
          this._syncChromePrivacy(win);
        }
      },
      onFocusIn: event => {
        if (
          win.document.documentElement.hasAttribute(ACTIVE_WINDOW_ATTR) &&
          event.target?.closest?.("#urlbar")
        ) {
          event.preventDefault();
          state.overlays.get(win.gBrowser.selectedTab)?.input.focus();
        }
      },
      onCommand: event => {
        const tab = win.gBrowser.selectedTab;
        if (!this._isTabLocked(win, tab)) {
          return;
        }
        const command = event.target?.getAttribute?.("command") || event.target?.id;
        if (!BLOCKED_COMMANDS.has(command)) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        const record = state.overlays.get(tab);
        if (record) {
          record.status.textContent = "Unlock this tab before using that action.";
          record.status.setAttribute("data-error", "true");
          record.input.focus();
        }
      },
      progressListener: {
        onLocationChange: (browser, webProgress) => {
          if (
            webProgress?.isTopLevel &&
            browser === win.gBrowser.selectedBrowser &&
            this._isTabLocked(win)
          ) {
            this._syncChromePrivacy(win);
          }
        },
      },
      onTabEvent: event => this._handleTabEvent(win, event),
    };
    menu.addEventListener("popupshowing", state.onPopupShowing);
    previewPanel?.addEventListener("popupshowing", state.onPreviewShowing);
    win.addEventListener("deactivate", state.onWindowDeactivate);
    win.addEventListener("focusin", state.onFocusIn, true);
    win.addEventListener("command", state.onCommand, true);
    win.gBrowser.addEventListener("TabSwitchDone", state.onTabSwitchDone);
    win.document.addEventListener("visibilitychange", state.onVisibilityChange);
    win.gBrowser.addTabsProgressListener(state.progressListener);
    for (const type of TAB_EVENT_TYPES) {
      win.addEventListener(type, state.onTabEvent, true);
    }
    this._windowState.set(win, state);
    for (const tab of win.gBrowser.tabs) {
      if (!this.isProtected(tab)) {
        continue;
      }
      tab.setAttribute(TAB_PROTECTED_ATTR, "true");
      this._lockTab(win, tab, { focus: tab.selected });
    }
  },

  _cleanupWindow(win) {
    const state = this._windowState.get(win);
    if (!state) {
      return;
    }
    state.menu.removeEventListener("popupshowing", state.onPopupShowing);
    state.previewPanel?.removeEventListener("popupshowing", state.onPreviewShowing);
    win.removeEventListener("deactivate", state.onWindowDeactivate);
    win.removeEventListener("focusin", state.onFocusIn, true);
    win.removeEventListener("command", state.onCommand, true);
    win.gBrowser?.removeEventListener("TabSwitchDone", state.onTabSwitchDone);
    win.document.removeEventListener("visibilitychange", state.onVisibilityChange);
    try {
      win.gBrowser?.removeTabsProgressListener(state.progressListener);
    } catch {}
    for (const type of TAB_EVENT_TYPES) {
      win.removeEventListener(type, state.onTabEvent, true);
    }
    for (const tab of win.gBrowser?.tabs || []) {
      this._setBrowserPrivacy(win, tab, false);
      this._restoreTabMetadata(win, tab);
      tab.removeAttribute(TAB_LOCKED_ATTR);
    }
    for (const record of state.overlays.values()) {
      record.stack.classList.remove("midori-tabprotect-stack");
      record.overlay.remove();
    }
    this._restoreChromePrivacy(win, state);
    if (state.ownsMenu) {
      state.menuitem.removeEventListener("command", state.onMenuCommand);
      state.separator.remove();
      state.menuitem.remove();
    }
    this._windowState.delete(win);
  },

  _registerStylesheet() {
    if (this._stylesheetService) {
      return;
    }
    const service = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
      Ci.nsIStyleSheetService
    );
    const uri = Services.io.newURI(STYLESHEET_URL);
    if (!service.sheetRegistered(uri, service.AUTHOR_SHEET)) {
      service.loadAndRegisterSheet(uri, service.AUTHOR_SHEET);
    }
    this._stylesheetService = service;
    this._stylesheetURI = uri;
  },

  _unregisterStylesheet() {
    if (
      this._stylesheetService &&
      this._stylesheetURI &&
      this._stylesheetService.sheetRegistered(
        this._stylesheetURI,
        this._stylesheetService.AUTHOR_SHEET
      )
    ) {
      this._stylesheetService.unregisterSheet(
        this._stylesheetURI,
        this._stylesheetService.AUTHOR_SHEET
      );
    }
    this._stylesheetService = null;
    this._stylesheetURI = null;
  },

  _handleTabEvent(win, event) {
    const state = this._windowState.get(win);
    if (!state) {
      return;
    }
    if (event.type === "TabClose") {
      this._removeOverlay(win, event.target);
      this._notifyStateChanged();
      return;
    }
    if (event.type === "TabOpen") {
      win.setTimeout(() => {
        const tab = event.target;
        if (this.isProtected(tab)) {
          tab.setAttribute(TAB_PROTECTED_ATTR, "true");
          this._lockTab(win, tab, { focus: tab.selected });
        }
      }, 0);
      return;
    }
    if (
      event.type === "SSTabRestored" ||
      event.type === "SSTabRestoring" ||
      event.type === "TabRemotenessChange"
    ) {
      const tab = event.target;
      if (this.isProtected(tab) && !state.unlockedTabs.has(tab)) {
        tab.setAttribute(TAB_PROTECTED_ATTR, "true");
        this._lockTab(win, tab, { focus: tab.selected });
      }
      return;
    }
    if (event.type === "TabAttrModified") {
      const tab = event.target;
      if (
        this.isProtected(tab) &&
        !tab.hasAttribute(TAB_LOCKED_ATTR) &&
        !state.unlockedTabs.has(tab)
      ) {
        tab.setAttribute(TAB_PROTECTED_ATTR, "true");
        this._lockTab(win, tab, { focus: tab.selected });
        return;
      }
      if (
        tab.hasAttribute(TAB_LOCKED_ATTR) &&
        event.detail?.changed?.includes("label")
      ) {
        this._maskTabMetadata(win, tab);
        if (tab.selected) {
          this._syncChromePrivacy(win);
        }
      }
      return;
    }
    if (event.type !== "TabSelect") {
      return;
    }

    const tab = event.target;
    const previousTab = event.detail?.previousTab;
    if (previousTab && previousTab !== tab && this.isProtected(previousTab)) {
      this._lockTab(win, previousTab);
    }
    if (shouldRequireTabPassword({
      protectedTab: this.isProtected(tab),
      unlocked: state.unlockedTabs.has(tab),
    })) {
      this._lockTab(win, tab, { focus: true });
    } else {
      this._syncChromePrivacy(win);
    }
  },

  _ensureOverlay(win, tab) {
    const state = this._windowState.get(win);
    if (!state) {
      return null;
    }
    const existing = state.overlays.get(tab);
    if (existing) {
      return existing;
    }

    const browser = tab.linkedBrowser;
    const browserStack = win.gBrowser
      .getBrowserContainer(browser)
      ?.querySelector(".browserStack");
    if (!browserStack) {
      return null;
    }

    browserStack.classList.add("midori-tabprotect-stack");
    const doc = win.document;
    const overlay = createHTMLElement(doc, "div", "midori-tabprotect-overlay");
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");

    const card = createHTMLElement(doc, "section", "midori-tabprotect-card");
    const eyebrow = createHTMLElement(
      doc,
      "p",
      "midori-tabprotect-eyebrow",
      "Midori Protect Tab"
    );
    const title = createHTMLElement(
      doc,
      "h1",
      "midori-tabprotect-title",
      "This tab is locked"
    );
    const titleId = `midori-tabprotect-title-${Services.uuid.generateUUID()}`;
    title.id = titleId;
    overlay.setAttribute("aria-labelledby", titleId);
    const description = createHTMLElement(
      doc,
      "p",
      "midori-tabprotect-description",
      "Its contents and address stay hidden until you verify your password."
    );
    const form = createHTMLElement(doc, "form", "midori-tabprotect-form");
    const input = createHTMLElement(doc, "input", "midori-tabprotect-password");
    input.type = "password";
    input.placeholder = "Enter your password";
    input.autocomplete = "current-password";
    input.setAttribute("aria-label", "Tab password");
    const submit = createHTMLElement(
      doc,
      "button",
      "midori-tabprotect-submit",
      "Unlock tab"
    );
    submit.type = "submit";
    const status = createHTMLElement(doc, "p", "midori-tabprotect-status");
    status.setAttribute("aria-live", "polite");
    const reset = createHTMLElement(
      doc,
      "button",
      "midori-tabprotect-reset",
      "Forgot password? Reset in Midori Center"
    );
    reset.type = "button";
    const assurance = createHTMLElement(
      doc,
      "p",
      "midori-tabprotect-assurance",
      "Password verification stays on this device."
    );

    form.append(input, submit, status, reset);
    card.append(createLockIcon(doc), eyebrow, title, description, form, assurance);
    overlay.append(card);
    browserStack.append(overlay);

    const record = {
      stack: browserStack,
      overlay,
      input,
      submit,
      status,
      verifying: false,
    };
    form.addEventListener("submit", event => {
      event.preventDefault();
      void this._attemptOverlayUnlock(win, tab, record);
    });
    reset.addEventListener("click", () => {
      win.openTrustedLinkIn("about:center#tabs", "tab");
    });
    input.addEventListener("input", () => {
      status.textContent = "";
      status.removeAttribute("data-error");
    });
    state.overlays.set(tab, record);
    return record;
  },

  _isTabVisible(win, tab) {
    if (tab?.selected) {
      return true;
    }
    return !!win.document
      .getElementById(tab?.linkedPanel)
      ?.classList.contains("split-view-panel-active");
  },

  _isTabLocked(win, tab = win?.gBrowser?.selectedTab) {
    const state = this._windowState.get(win);
    return !!state && !!tab && this.isProtected(tab) &&
      !state.unlockedTabs.has(tab);
  },

  _maskTabMetadata(win, tab) {
    const state = this._windowState.get(win);
    if (!state || !tab) {
      return;
    }
    if (!state.metadata.has(tab)) {
      const attributes = {};
      for (const name of [
        "aria-label",
        "label",
        "labeldirection",
        "labelendaligned",
        "tooltiptext",
      ]) {
        attributes[name] = {
          present: tab.hasAttribute(name),
          value: tab.getAttribute(name),
        };
      }
      state.metadata.set(tab, {
        attributes,
        fullLabel: tab._fullLabel,
        hadFullLabel: Object.hasOwn(tab, "_fullLabel"),
      });
    }
    tab.setAttribute("aria-label", PROTECTED_TAB_TITLE);
    tab.setAttribute("label", PROTECTED_TAB_TITLE);
    tab.setAttribute("tooltiptext", PROTECTED_TAB_TITLE);
    tab.removeAttribute("labeldirection");
    tab.removeAttribute("labelendaligned");
    tab._fullLabel = PROTECTED_TAB_TITLE;
  },

  _restoreTabMetadata(win, tab) {
    const state = this._windowState.get(win);
    const metadata = state?.metadata.get(tab);
    if (!metadata) {
      return;
    }
    for (const [name, saved] of Object.entries(metadata.attributes)) {
      if (saved.present) {
        tab.setAttribute(name, saved.value);
      } else {
        tab.removeAttribute(name);
      }
    }
    if (metadata.hadFullLabel) {
      tab._fullLabel = metadata.fullLabel;
    } else {
      delete tab._fullLabel;
    }
    state.metadata.delete(tab);
    try {
      win.gBrowser.setTabTitle(tab);
    } catch {}
  },

  _setBrowserPrivacy(win, tab, locked) {
    const state = this._windowState.get(win);
    const browser = tab?.linkedBrowser;
    if (!state || !browser) {
      return;
    }
    if (locked) {
      if (!state.browserPrivacy.has(tab)) {
        state.browserPrivacy.set(tab, {
          ariaHidden: browser.getAttribute("aria-hidden"),
          hadAriaHidden: browser.hasAttribute("aria-hidden"),
          suspendMediaWhenInactive: browser.suspendMediaWhenInactive,
        });
      }
      browser.setAttribute(BROWSER_HIDDEN_ATTR, "true");
      browser.setAttribute("aria-hidden", "true");
      browser.suspendMediaWhenInactive = true;
      try {
        browser.docShellIsActive = false;
      } catch {}
      return;
    }

    browser.removeAttribute(BROWSER_HIDDEN_ATTR);
    const browserPrivacy = state.browserPrivacy.get(tab);
    if (browserPrivacy) {
      if (browserPrivacy.hadAriaHidden) {
        browser.setAttribute("aria-hidden", browserPrivacy.ariaHidden);
      } else {
        browser.removeAttribute("aria-hidden");
      }
      browser.suspendMediaWhenInactive =
        browserPrivacy.suspendMediaWhenInactive;
      state.browserPrivacy.delete(tab);
    }
    try {
      browser.docShellIsActive = win.gBrowser.shouldActivateDocShell(browser);
    } catch {}
  },

  _lockTab(win, tab, { focus = false } = {}) {
    const state = this._windowState.get(win);
    if (!state || !this.isProtected(tab)) {
      return;
    }
    state.unlockedTabs.delete(tab);
    tab.setAttribute(TAB_PROTECTED_ATTR, "true");
    tab.setAttribute(TAB_LOCKED_ATTR, "true");
    this._maskTabMetadata(win, tab);
    this._setBrowserPrivacy(win, tab, true);
    if (this._isTabVisible(win, tab)) {
      const record = this._ensureOverlay(win, tab);
      if (record) {
        record.overlay.hidden = false;
        record.input.value = "";
        record.status.textContent = "";
        record.status.removeAttribute("data-error");
        if (focus) {
          win.requestAnimationFrame(() => record.input.focus());
        }
      }
    }
    this._syncChromePrivacy(win);
  },

  _unlockOverlay(win, tab) {
    const state = this._windowState.get(win);
    const record = state?.overlays.get(tab);
    state?.unlockedTabs.add(tab);
    tab.removeAttribute(TAB_LOCKED_ATTR);
    this._setBrowserPrivacy(win, tab, false);
    this._restoreTabMetadata(win, tab);
    if (record) {
      record.overlay.hidden = true;
      record.input.value = "";
      record.status.textContent = "";
      record.status.removeAttribute("data-error");
    }
    this._syncChromePrivacy(win);
    if (tab.selected) {
      tab.linkedBrowser?.focus();
    }
  },

  _removeOverlay(win, tab) {
    const state = this._windowState.get(win);
    if (!state) {
      return;
    }
    const record = state.overlays.get(tab);
    record?.overlay.remove();
    record?.stack.classList.remove("midori-tabprotect-stack");
    state.overlays.delete(tab);
    state.unlockedTabs.delete(tab);
    tab?.removeAttribute(TAB_LOCKED_ATTR);
    this._setBrowserPrivacy(win, tab, false);
    this._restoreTabMetadata(win, tab);
    this._syncChromePrivacy(win);
  },

  _syncChromePrivacy(win) {
    const state = this._windowState.get(win);
    const selectedTab = win.gBrowser?.selectedTab;
    const locked = this._isTabLocked(win, selectedTab);
    win.document.documentElement.toggleAttribute(ACTIVE_WINDOW_ATTR, locked);
    const urlbar = win.document.getElementById("urlbar");
    if (locked) {
      if (state && !state.urlbarPrivacy && urlbar) {
        state.urlbarPrivacy = {
          ariaHidden: urlbar.getAttribute("aria-hidden"),
          hadAriaHidden: urlbar.hasAttribute("aria-hidden"),
          inputTitle: win.gURLBar?.inputField?.getAttribute("title") || "",
          hadInputTitle: win.gURLBar?.inputField?.hasAttribute("title") || false,
        };
      }
      urlbar?.setAttribute("aria-hidden", "true");
      if (win.gURLBar) {
        win.gURLBar.value = "";
        win.gURLBar.inputField?.removeAttribute("title");
        win.gURLBar.view?.close();
      }
      let brandName = "Midori";
      try {
        brandName = win.document
          .getElementById("bundle_brand")
          ?.getString("brandShortName") || brandName;
      } catch {}
      win.document.title = `${PROTECTED_TAB_TITLE} — ${brandName}`;
      return;
    }
    this._restoreChromePrivacy(win, state);
  },

  _restoreChromePrivacy(win, state = this._windowState.get(win)) {
    win.document.documentElement.removeAttribute(ACTIVE_WINDOW_ATTR);
    const urlbar = win.document.getElementById("urlbar");
    if (state?.urlbarPrivacy && urlbar) {
      if (state.urlbarPrivacy.hadAriaHidden) {
        urlbar.setAttribute("aria-hidden", state.urlbarPrivacy.ariaHidden);
      } else {
        urlbar.removeAttribute("aria-hidden");
      }
      if (state.urlbarPrivacy.hadInputTitle) {
        win.gURLBar?.inputField?.setAttribute(
          "title",
          state.urlbarPrivacy.inputTitle
        );
      } else {
        win.gURLBar?.inputField?.removeAttribute("title");
      }
      state.urlbarPrivacy = null;
    }
    try {
      win.gURLBar?.setURI({ dueToTabSwitch: true });
    } catch {}
    try {
      win.gBrowser?.updateTitlebar();
    } catch {}
  },

  _getEffectivePasswordHash(tab) {
    const scope = getTabScope(tab);
    return scope === TAB_PROTECTION_MODES.GLOBAL
      ? Services.prefs.getStringPref(PREF_TAB_PROTECTION_GLOBAL_HASH, "") ||
        getTabPasswordHash(tab)
      : getTabPasswordHash(tab);
  },

  _getCredentialAttemptState(passwordHash) {
    let attemptState = this._credentialAttempts.get(passwordHash);
    if (!attemptState) {
      attemptState = { failedAttempts: 0, lockedUntil: 0 };
      this._credentialAttempts.set(passwordHash, attemptState);
    }
    return attemptState;
  },

  _recordFailedAttempt(attemptState) {
    attemptState.failedAttempts += 1;
    if (attemptState.failedAttempts >= MAX_FAILED_ATTEMPTS) {
      attemptState.failedAttempts = 0;
      attemptState.lockedUntil = Date.now() + ATTEMPT_COOLDOWN_MS;
      return "Too many attempts. Try again in 30 seconds.";
    }
    const remaining = MAX_FAILED_ATTEMPTS - attemptState.failedAttempts;
    return `Incorrect password. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`;
  },

  async _passwordMatchesTab(tab, password) {
    const scope = getTabScope(tab);
    const passwordHash = this._getEffectivePasswordHash(tab);
    if (!passwordHash || !(await passwordMatches(password, passwordHash))) {
      return false;
    }
    if (!passwordHash.startsWith(`${PBKDF2_PREFIX}:`)) {
      const upgradedHash = await createPasswordHash(password);
      if (scope === TAB_PROTECTION_MODES.GLOBAL) {
        Services.prefs.setStringPref(
          PREF_TAB_PROTECTION_GLOBAL_HASH,
          upgradedHash
        );
      } else {
        setTabPasswordHash(tab, upgradedHash);
      }
    }
    return true;
  },

  async _attemptOverlayUnlock(win, tab, record) {
    if (record.verifying) {
      return;
    }
    if (!this.isProtected(tab)) {
      record.status.textContent =
        "Protection credentials are unavailable. Reset protection in Midori Center.";
      record.status.setAttribute("data-error", "true");
      return;
    }
    const passwordHash = this._getEffectivePasswordHash(tab);
    const attemptState = this._getCredentialAttemptState(passwordHash);
    const now = Date.now();
    if (attemptState.lockedUntil > now) {
      const seconds = Math.ceil((attemptState.lockedUntil - now) / 1000);
      record.status.textContent = `Too many attempts. Try again in ${seconds} seconds.`;
      record.status.setAttribute("data-error", "true");
      return;
    }
    if (!record.input.value) {
      record.status.textContent = "Enter your password to continue.";
      record.status.setAttribute("data-error", "true");
      record.input.focus();
      return;
    }

    record.verifying = true;
    record.submit.disabled = true;
    record.submit.textContent = "Verifying…";
    record.status.textContent = "Verifying password…";
    record.status.removeAttribute("data-error");
    try {
      if (await this._passwordMatchesTab(tab, record.input.value)) {
        this._credentialAttempts.delete(passwordHash);
        this._unlockOverlay(win, tab);
        return;
      }
      record.input.value = "";
      record.status.textContent = this._recordFailedAttempt(attemptState);
      record.status.setAttribute("data-error", "true");
      record.input.focus();
    } catch (error) {
      record.input.value = "";
      record.status.textContent =
        "Midori could not verify the password. Try again.";
      record.status.setAttribute("data-error", "true");
      record.input.focus();
      console.error("Protect Tab password verification failed", error);
    } finally {
      record.verifying = false;
      record.submit.disabled = false;
      record.submit.textContent = "Unlock tab";
    }
  },

  async _unlockTab(win, tab, text) {
    if (!this.isProtected(tab)) {
      return true;
    }
    const passwordHash = this._getEffectivePasswordHash(tab);
    const attemptState = this._getCredentialAttemptState(passwordHash);
    if (attemptState.lockedUntil > Date.now()) {
      const seconds = Math.ceil((attemptState.lockedUntil - Date.now()) / 1000);
      Services.prompt.alert(
        win,
        "Unlock Protected Tab",
        `Too many attempts. Try again in ${seconds} seconds.`
      );
      return false;
    }
    const password = promptForPassword(win, "Unlock Protected Tab", text);
    if (typeof password !== "string") {
      return false;
    }
    if (await this._passwordMatchesTab(tab, password)) {
      this._credentialAttempts.delete(passwordHash);
      this._unlockOverlay(win, tab);
      return true;
    }
    Services.prompt.alert(
      win,
      "Unlock Protected Tab",
      this._recordFailedAttempt(attemptState)
    );
    return false;
  },

  _notifyStateChanged() {
    Services.obs.notifyObservers(null, TAB_PROTECTION_STATE_TOPIC);
  },
};
