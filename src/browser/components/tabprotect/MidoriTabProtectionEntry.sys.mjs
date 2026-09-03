/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { isRegularBrowserWindow } from "resource:///modules/MidoriWebAppUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SessionStore: "resource:///modules/sessionstore/SessionStore.sys.mjs",
});

const PROTECTION_MODULE_URL =
  "resource:///modules/MidoriTabProtection.sys.mjs";
const PROTECTION_STATE_TOPIC = "midori-tab-protection-state-changed";
const TAB_PASSWORD_KEY = "midori-tabprotect-password";
const TAB_SCOPE_KEY = "midori-tabprotect-scope";
const TAB_PROTECTED_ATTR = "midori-protected";

function getContextTab(win, menu) {
  return (
    win.TabContextMenu?.contextTab ||
    menu?.triggerNode?.closest?.("tab") ||
    win.gBrowser?.selectedTab ||
    null
  );
}

function hasStoredProtection(tab) {
  if (!tab) {
    return false;
  }
  if (tab.hasAttribute(TAB_PROTECTED_ATTR)) {
    return true;
  }
  try {
    return !!(
      lazy.SessionStore.getCustomTabValue(tab, TAB_PASSWORD_KEY) ||
      lazy.SessionStore.getCustomTabValue(tab, TAB_SCOPE_KEY)
    );
  } catch {
    return false;
  }
}

export const MidoriTabProtectionEntry = {
  _initialized: false,
  _windowState: new WeakMap(),
  _service: null,
  _reconcileScheduled: false,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.obs.addObserver(this, "domwindowclosed");
    Services.obs.addObserver(this, PROTECTION_STATE_TOPIC);

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
    this._reconcileScheduled = false;
    try {
      Services.obs.removeObserver(this, "browser-delayed-startup-finished");
      Services.obs.removeObserver(this, "domwindowclosed");
      Services.obs.removeObserver(this, PROTECTION_STATE_TOPIC);
    } catch {}

    this._service?.uninit();
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      this._cleanupWindow(win);
    }
  },

  observe(subject, topic) {
    if (topic === "browser-delayed-startup-finished") {
      this._attachWindow(subject);
      return;
    }
    if (topic === "domwindowclosed") {
      this._cleanupWindow(subject);
      return;
    }
    if (topic === PROTECTION_STATE_TOPIC) {
      this._scheduleReconcile();
    }
  },

  async toggleTabProtection(win, tab = win?.gBrowser?.selectedTab) {
    if (!tab) {
      return false;
    }
    const service = this._ensureService();
    const result = this._isProtected(service, tab)
      ? await service.unprotectTab(win, tab)
      : await service.protectTab(win, tab);
    this._scheduleReconcile();
    return result;
  },

  _attachWindow(win) {
    if (!isRegularBrowserWindow(win) || this._windowState.has(win)) {
      return;
    }
    const menu = win.document.getElementById("tabContextMenu");
    if (!menu) {
      return;
    }

    const separator = win.document.createXULElement("menuseparator");
    separator.id = "midori-protect-tab-separator";
    const menuitem = win.document.createXULElement("menuitem");
    menuitem.id = "midori-protect-tab";
    menuitem.setAttribute("label", "Protect Tab");

    const onCommand = () => {
      void this.toggleTabProtection(win, getContextTab(win, menu));
    };
    const onTabRestored = event => {
      if (hasStoredProtection(event.target)) {
        this._ensureService();
      }
    };

    menuitem.addEventListener("command", onCommand);
    win.gBrowser.tabContainer.addEventListener(
      "SSTabRestored",
      onTabRestored,
      true
    );
    menu.append(separator, menuitem);
    this._windowState.set(win, {
      menu,
      menuitem,
      separator,
      onCommand,
      onTabRestored,
    });

    Services.tm.dispatchToMainThread(() => {
      if (!this._initialized || win.closed) {
        return;
      }
      if ([...win.gBrowser.tabs].some(hasStoredProtection)) {
        this._ensureService();
      }
    });
  },

  _cleanupWindow(win) {
    const state = this._windowState.get(win);
    if (!state) {
      return;
    }
    state.menuitem.removeEventListener("command", state.onCommand);
    win.gBrowser?.tabContainer?.removeEventListener(
      "SSTabRestored",
      state.onTabRestored,
      true
    );
    state.menuitem.remove();
    state.separator.remove();
    this._windowState.delete(win);
  },

  _ensureService() {
    this._service ||= ChromeUtils.importESModule(
      PROTECTION_MODULE_URL
    ).MidoriTabProtection;
    this._service.init();
    return this._service;
  },

  _isProtected(service, tab) {
    try {
      return service.isProtected(tab);
    } catch {
      return false;
    }
  },

  _scheduleReconcile() {
    if (this._reconcileScheduled) {
      return;
    }
    this._reconcileScheduled = true;
    Services.tm.dispatchToMainThread(() => {
      this._reconcileScheduled = false;
      if (
        this._initialized &&
        this._service &&
        !this._service.hasProtectedTabs()
      ) {
        this._service.uninit();
        for (const win of Services.wm.getEnumerator("navigator:browser")) {
          win.document
            .getElementById("midori-protect-tab")
            ?.setAttribute("label", "Protect Tab");
        }
      }
    });
  },
};
