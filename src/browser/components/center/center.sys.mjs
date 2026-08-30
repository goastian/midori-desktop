/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Midori Center — Settings hub logic.
 * Reads/writes browser prefs and drives the navigation UI.
 */

const WORKSPACE_CHANGE_TOPIC = "midori-workspaces-updated";
const WORKSPACES_MODULE_URL = "resource:///modules/MidoriWorkspaces.sys.mjs";
const SHORTCUTS_MODULE_URL = "resource:///modules/MidoriShortcuts.sys.mjs";
const TAB_PROTECTION_MODULE_URL = "resource:///modules/MidoriTabProtection.sys.mjs";
const WEBAPPS_MODULE_URL = "resource:///modules/MidoriWebApps.sys.mjs";
const WEBAPPS_CHANGE_TOPIC = "midori-webapps-changed";
const WEBAPP_FALLBACK_ICON =
  "chrome://browser/skin/taskbar-tabs-add-tab.svg";
const BROWSER_WINDOW_TRACKER_MODULE_URL =
  "resource:///modules/BrowserWindowTracker.sys.mjs";
const ADDON_MANAGER_MODULE_URL = "resource://gre/modules/AddonManager.sys.mjs";
const MODBLUR_MODULE_URL = "resource:///modules/MidoriModBlur.sys.mjs";
const {
  LEGACY_MODBLUR_PREFS,
  migrateLegacyModBlurPrefs,
} = ChromeUtils.importESModule(MODBLUR_MODULE_URL);

const ADDON_IDS = {
  privacy: "midori-protection@astian.org",
  vpn: "midorivpn@astian.org",
};

// ---- Pref mapping: element ID → { pref, type } ----
const PREF_MAP = {
  "pref-autohide-toolbar":  { pref: "midori.autohide.toolbar",        type: "bool" },
  "pref-tabsleep-enabled":  { pref: "midori.tabsleep.enabled",        type: "bool" },
  "pref-tabsleep-timeout":  { pref: "midori.tabsleep.timeoutMinutes", type: "int" },
  "pref-tabprotect-mode": { pref: "midori.tabprotect.mode", type: "string" },
  "pref-msidebar-enabled":  { pref: "midori.msidebar.enabled",        type: "bool" },
  "pref-msidebar-position": { pref: "midori.msidebar.position",       type: "string" },
  "pref-msidebar-width":    { pref: "midori.msidebar.width",          type: "int" },
  "pref-msidebar-autohide": { pref: "midori.msidebar.autohide.enabled", type: "bool" },
  "pref-msidebar-autohide-mode": { pref: "midori.msidebar.autohide.mode", type: "string" },
  "pref-verticaltabs-collapse": { pref: "midori.verticaltabs.collapse", type: "bool" },
  "pref-workspaces-enabled":{ pref: "midori.workspaces.enabled",      type: "bool" },
  "pref-workspaces-button": { pref: "midori.workspaces.show-button",  type: "bool" },
  "pref-workspaces-name":   { pref: "midori.workspaces.show-name",    type: "bool" },
  "pref-workspaces-unload": { pref: "midori.workspaces.unloadInactive", type: "bool" },
  "pref-workspaces-tint":   { pref: "midori.workspaces.chromeTint",   type: "bool" },
  "pref-modblur-window-controls": { pref: "midori.modblur.windowControls.style", type: "string" },
  "pref-modblur-bookmarks-popout": { pref: "midori.modblur.bookmarks.popout", type: "bool" },
  "pref-modblur-bookmarks-clean": { pref: "midori.modblur.bookmarks.clean", type: "bool" },
  "pref-modblur-bookmarks-folders": { pref: "midori.modblur.bookmarks.hideFolderIcons", type: "bool" },
  "pref-modblur-bookmarks-transparent": { pref: "midori.modblur.bookmarks.transparent", type: "bool" },
  "pref-modblur-bookmarks-centered": { pref: "midori.modblur.bookmarks.centered", type: "bool" },
  "pref-modblur-privacy-blur": { pref: "midori.modblur.privacy.blurIdentity", type: "bool" },
  "pref-modblur-privacy-tabs": { pref: "midori.modblur.privacy.blurTabs", type: "bool" },
  "pref-modblur-extension-style": { pref: "midori.modblur.extensions.style", type: "string" },
  "pref-modblur-extension-columns": { pref: "midori.modblur.extensions.columns", type: "int" },
  "pref-modblur-extension-icon-size": { pref: "midori.modblur.extensions.iconSize", type: "int" },
  "pref-modblur-extension-hide-manage": { pref: "midori.modblur.extensions.hideManageButton", type: "bool" },
  "pref-modblur-extension-hide-separator": { pref: "midori.modblur.extensions.hideSeparator", type: "bool" },
  "pref-modblur-extension-hide-faded": { pref: "midori.modblur.extensions.hideFaded", type: "bool" },
  "pref-modblur-menu-density": { pref: "midori.modblur.menus.density", type: "string" },
  "pref-modblur-compact-identity": { pref: "midori.modblur.search.compactIdentity", type: "bool" },
  "pref-modblur-hide-extension-icon": { pref: "midori.modblur.search.hideExtensionIcon", type: "bool" },
  "pref-modblur-icons-menu": { pref: "midori.modblur.icons.mainMenu", type: "bool" },
  "pref-modblur-icons-tabs-overview": { pref: "midori.modblur.icons.tabsOverview", type: "bool" },
  "pref-modblur-icons-midori-menu": { pref: "midori.modblur.icons.midoriMenu", type: "bool" },
  "pref-modblur-icons-github": { pref: "midori.modblur.icons.github", type: "bool" },
  "pref-modblur-icons-ublock": { pref: "midori.modblur.icons.ublock", type: "bool" },
  "pref-modblur-compact-vertical": { pref: "midori.modblur.verticalTabs.compact", type: "bool" },
  "pref-modblur-autohide-tabs": { pref: "midori.modblur.tabs.autohide", type: "bool" },
  "pref-modblur-show-inactive-tabs": { pref: "midori.modblur.tabs.showWhileInactive", type: "bool" },
  "pref-modblur-centered-tabs": { pref: "midori.modblur.tabs.centered", type: "bool" },
  "pref-modblur-hide-tab-preview": { pref: "midori.modblur.tabs.hidePreviewPanel", type: "bool" },
  "pref-modblur-hide-vertical-scrollbar": { pref: "midori.modblur.verticalTabs.hideScrollbar", type: "bool" },
  "pref-modblur-search-outline": { pref: "midori.modblur.search.focusOutline", type: "bool" },
  "pref-modblur-url-alignment": { pref: "midori.modblur.search.textAlignment", type: "string" },
  "pref-modblur-tabs-layout": { pref: "midori.modblur.tabs.layout", type: "string" },
  "pref-modblur-window-frame": { pref: "midori.modblur.window.frameStyle", type: "string" },
  "pref-modblur-search-buttons": { pref: "midori.modblur.search.buttonsAlways", type: "bool" },
  "pref-modblur-active-tab-static": { pref: "midori.modblur.tabs.activeStaticWidth", type: "bool" },
  "pref-modblur-sound-tab": { pref: "midori.modblur.tabs.soundColor", type: "bool" },
  "pref-modblur-hide-all-tabs": { pref: "midori.modblur.tabs.hideAllTabsButton", type: "bool" },
  "pref-modblur-popout-searchbar": { pref: "midori.modblur.search.popoutStyle", type: "string" },
  "pref-modblur-panel-blur": { pref: "midori.modblur.blur.panels", type: "bool" },
  "pref-modblur-search-blur": { pref: "midori.modblur.blur.searchbar", type: "bool" },
  "pref-modblur-vertical-expand-blur": { pref: "midori.modblur.blur.verticalExpand", type: "bool" },
  "pref-modblur-extra-blur": { pref: "midori.modblur.blur.extra", type: "bool" },
  "pref-modblur-strength": { pref: "midori.modblur.blur.strength", type: "string" },
  "pref-modblur-motion": { pref: "midori.modblur.motion.style", type: "string" },
  "pref-modblur-spill-theme": { pref: "midori.modblur.theme.spill", type: "bool" },
  "pref-modblur-card-theme": { pref: "midori.modblur.theme.cardStyle", type: "string" },
  "pref-modblur-texture": { pref: "midori.modblur.theme.textureStyle", type: "string" },
  "pref-modblur-acrylic": { pref: "midori.modblur.blur.acrylic", type: "bool" },
  "pref-modblur-newtab-hide-titles": { pref: "midori.modblur.newtab.hideShortcutTitles", type: "bool" },
  "pref-modblur-newtab-center-widgets": { pref: "midori.modblur.newtab.centerWidgetsStyle", type: "string" },
  "pref-modblur-newtab-circular": { pref: "midori.modblur.newtab.circularShortcuts", type: "bool" },
  "pref-modblur-newtab-wallpaper-blur": { pref: "midori.modblur.newtab.wallpaperBlur", type: "int" },
};

const MODBLUR_PREFS = [...new Set(
  Object.values(PREF_MAP)
    .map(({ pref }) => pref)
    .filter(pref => pref.startsWith("midori.modblur."))
)];

let modBlurUndoSnapshot = null;
let activeModBlurFilter = "all";

const FALLBACK_WORKSPACE_ICONS = [
  { id: "default", emoji: "🏠", label: "Home" },
  { id: "work", emoji: "💼", label: "Work" },
  { id: "personal", emoji: "👤", label: "Personal" },
  { id: "shopping", emoji: "🛒", label: "Shopping" },
  { id: "social", emoji: "💬", label: "Social" },
  { id: "dev", emoji: "💻", label: "Development" },
  { id: "research", emoji: "🔬", label: "Research" },
  { id: "music", emoji: "🎵", label: "Music" },
  { id: "gaming", emoji: "🎮", label: "Gaming" },
  { id: "finance", emoji: "💰", label: "Finance" },
  { id: "travel", emoji: "✈️", label: "Travel" },
  { id: "education", emoji: "📚", label: "Education" },
  { id: "health", emoji: "❤️", label: "Health" },
  { id: "news", emoji: "📰", label: "News" },
  { id: "creative", emoji: "🎨", label: "Creative" },
  { id: "star", emoji: "⭐", label: "Favorite" },
];

const workspaceUI = {
  panel: null,
  count: null,
  summary: null,
  createName: null,
  createIcon: null,
  createBtn: null,
  list: null,
  empty: null,
  status: null,
};

const shortcutUI = {
  panel: null,
  count: null,
  groups: null,
  status: null,
};

const addonUI = {
  privacy: null,
  vpn: null,
  status: null,
};

const webAppsUI = {
  panel: null,
  enabled: null,
  count: null,
  list: null,
  empty: null,
  status: null,
};

let workspaceApi = null;
let workspaceObserver = null;
let shortcutsApi = null;
let tabProtectionApi = null;
let shortcutObserver = null;
let shortcutObservedPrefs = [];
let shortcutFlashPref = "";
let addonManagerApi = null;
let webAppsApi = null;
let webAppsObserver = null;
let webAppsInitPromise = null;
let webAppsRefreshFrame = 0;
let webAppsRefreshGeneration = 0;
let webAppsIconObserver = null;
const webAppsPendingIcons = new WeakMap();
let browserWindowTrackerApi = null;

// ---- Read a pref by type ----
function readPref(prefName, type) {
  try {
    switch (type) {
      case "bool":   return Services.prefs.getBoolPref(prefName);
      case "int":    return Services.prefs.getIntPref(prefName);
      case "string": return Services.prefs.getStringPref(prefName);
    }
  } catch {}
  return undefined;
}

// ---- Write a pref by type ----
function writePref(prefName, type, value) {
  switch (type) {
    case "bool":   Services.prefs.setBoolPref(prefName, value);   break;
    case "int":    Services.prefs.setIntPref(prefName, value);    break;
    case "string": Services.prefs.setCharPref(prefName, value);   break;
  }

  if (
    prefName === "midori.modblur.windowControls.style" &&
    Services.prefs.prefHasUserValue("midori.modblur.windowControls.macStyle")
  ) {
    Services.prefs.clearUserPref("midori.modblur.windowControls.macStyle");
  }
}

function syncPrefElement(id, pref, type) {
  const el = document.getElementById(id);
  const val = readPref(pref, type);
  if (!el || val === undefined) return;

  if (el.type === "checkbox") {
    el.checked = !!val;
  } else if (el.tagName === "SELECT" || el.type === "range" || el.type === "number" || el.type === "color") {
    el.value = String(val);
  } else if (el.tagName === "FIELDSET") {
    const radios = [...el.querySelectorAll("input[type=radio]")];
    const selected = radios.find(radio => radio.value === String(val)) || radios[0];
    if (selected) selected.checked = true;
  }

  if (el.type === "range" && el.dataset.valueTarget) {
    const valueTarget = document.getElementById(el.dataset.valueTarget);
    if (valueTarget) valueTarget.textContent = `${el.value} px`;
  }
}

function getBrowserWindow() {
  try {
    browserWindowTrackerApi ??= ChromeUtils.importESModule(
      BROWSER_WINDOW_TRACKER_MODULE_URL
    ).BrowserWindowTracker;
    return browserWindowTrackerApi.getTopWindow({
      private: false,
      allowTaskbarTabs: false,
      allowFromInactiveWorkspace: true,
    });
  } catch {
    return null;
  }
}

function getWorkspaceApi() {
  if (workspaceApi) {
    return workspaceApi;
  }

  try {
    const mod = ChromeUtils.importESModule(WORKSPACES_MODULE_URL);
    workspaceApi = mod?.MidoriWorkspaces || null;
  } catch {
    workspaceApi = null;
  }

  return workspaceApi;
}

function getShortcutsApi() {
  if (shortcutsApi) {
    return shortcutsApi;
  }

  try {
    shortcutsApi = ChromeUtils.importESModule(SHORTCUTS_MODULE_URL);
  } catch {
    shortcutsApi = null;
  }

  return shortcutsApi;
}

function getTabProtectionApi() {
  if (tabProtectionApi) {
    return tabProtectionApi;
  }

  try {
    tabProtectionApi = ChromeUtils.importESModule(
      TAB_PROTECTION_MODULE_URL
    ).MidoriTabProtection;
  } catch {
    tabProtectionApi = null;
  }

  return tabProtectionApi;
}

function getAddonManagerApi() {
  if (addonManagerApi) {
    return addonManagerApi;
  }

  try {
    addonManagerApi = ChromeUtils.importESModule(ADDON_MANAGER_MODULE_URL);
  } catch {
    addonManagerApi = null;
  }

  return addonManagerApi;
}

function getWebAppsApi() {
  if (webAppsApi) {
    return webAppsApi;
  }

  try {
    webAppsApi = ChromeUtils.importESModule(WEBAPPS_MODULE_URL)?.MidoriWebApps;
  } catch {
    webAppsApi = null;
  }

  return webAppsApi;
}

function setAddonStatus(message, isError = false) {
  if (!addonUI.status) return;
  addonUI.status.textContent = message || "";
  addonUI.status.classList.toggle("workspace-status-error", !!isError);
  addonUI.status.hidden = !message;
}

function clearAddonStatus() {
  setAddonStatus("");
}

async function getAddonById(addonId) {
  try {
    const api = getAddonManagerApi();
    return (await api?.AddonManager?.getAddonByID?.(addonId)) || null;
  } catch {
    return null;
  }
}

async function refreshAddonToggle(kind) {
  const control = addonUI[kind];
  if (!control) {
    return;
  }

  const addon = await getAddonById(ADDON_IDS[kind]);
  if (!addon) {
    control.checked = false;
    control.disabled = true;
    setAddonStatus("The selected extension is unavailable in this build.", true);
    return;
  }

  if (addon.appDisabled) {
    control.checked = false;
    control.disabled = true;
    setAddonStatus(`${addon.name} is disabled by the application and cannot be toggled here.`, true);
    return;
  }

  const api = getAddonManagerApi();
  const perms = addon.permissions || 0;
  const canDisable = !!(perms & api.AddonManager.PERM_CAN_DISABLE);
  const canEnable = !!(perms & api.AddonManager.PERM_CAN_ENABLE);

  control.checked = !addon.userDisabled;
  control.disabled = control.checked ? !canDisable : !canEnable;
}

async function setAddonEnabled(kind, enabled) {
  const control = addonUI[kind];
  const addon = await getAddonById(ADDON_IDS[kind]);

  if (!control || !addon) {
    setAddonStatus("Could not update extension state.", true);
    await refreshAddonToggle(kind);
    return;
  }

  control.disabled = true;
  try {
    const api = getAddonManagerApi();
    const perms = addon.permissions || 0;
    if (enabled && !(perms & api.AddonManager.PERM_CAN_ENABLE)) {
      throw new Error("This extension cannot be enabled by user action.");
    }
    if (!enabled && !(perms & api.AddonManager.PERM_CAN_DISABLE)) {
      throw new Error("This extension cannot be disabled by user action.");
    }

    if (enabled) {
      await addon.enable({ allowSystemAddons: true });
    } else {
      await addon.disable({ allowSystemAddons: true });
    }

    const updatedAddon = await getAddonById(ADDON_IDS[kind]);
    const targetUserDisabled = !enabled;
    const applied = updatedAddon ? updatedAddon.userDisabled === targetUserDisabled : false;
    if (!applied) {
      throw new Error("The extension state could not be changed.");
    }

    setAddonStatus(`${updatedAddon.name} ${enabled ? "enabled" : "disabled"}.`);
  } catch (error) {
    const reason = error?.message ? ` (${error.message})` : "";
    setAddonStatus(`Could not ${enabled ? "enable" : "disable"} ${addon.name}.${reason}`, true);
  }

  await refreshAddonToggle(kind);
}

async function initAddonControls() {
  addonUI.privacy = document.getElementById("pref-midori-privacy-enabled");
  addonUI.vpn = document.getElementById("pref-midori-vpn-enabled");
  addonUI.status = document.getElementById("addon-controls-status");

  if (!addonUI.privacy || !addonUI.vpn) {
    return;
  }

  clearAddonStatus();
  await refreshAddonToggle("privacy");
  await refreshAddonToggle("vpn");

  addonUI.privacy.addEventListener("change", async () => {
    await setAddonEnabled("privacy", addonUI.privacy.checked);
  });

  addonUI.vpn.addEventListener("change", async () => {
    await setAddonEnabled("vpn", addonUI.vpn.checked);
  });
}

function setWebAppsStatus(message, isError = false) {
  if (!webAppsUI.status) return;
  webAppsUI.status.classList.toggle("workspace-status-error", !!isError);
  webAppsUI.status.setAttribute("role", "status");
  webAppsUI.status.setAttribute("aria-live", isError ? "assertive" : "polite");
  webAppsUI.status.hidden = !message;
  webAppsUI.status.textContent = message || "";
}

function createWebAppButton(label, action, { danger = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = danger ? "mc-btn mc-btn-danger" : "mc-btn";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

function captureWebAppsViewState() {
  const edits = new Map();
  for (const row of webAppsUI.list?.children || []) {
    const input = row.querySelector(".webapp-name-input");
    if (input && input.value !== input.dataset.originalName) {
      edits.set(row.dataset.webAppId, input.value);
    }
  }

  const active = document.activeElement;
  const activeRow = active?.closest?.(".webapp-item");
  return {
    edits,
    activeId: activeRow?.dataset.webAppId ?? null,
    activeAction: active?.dataset?.webAppAction ?? null,
    selection:
      active?.classList?.contains("webapp-name-input")
        ? [active.selectionStart, active.selectionEnd]
        : null,
  };
}

function restoreWebAppsFocus(state) {
  if (
    !state.activeId ||
    !document.getElementById("page-webapps")?.classList.contains("active")
  ) {
    return;
  }

  const row = [...webAppsUI.list.children].find(
    item => item.dataset.webAppId === state.activeId
  );
  if (!row) {
    webAppsUI.enabled.focus();
    return;
  }

  const target = state.activeAction
    ? row.querySelector(`[data-webapp-action="${state.activeAction}"]`)
    : row.querySelector(".webapp-name-input");
  target?.focus();
  if (state.selection && target?.setSelectionRange) {
    target.setSelectionRange(...state.selection);
  }
}

function loadWebAppIcon(icon, app) {
  const load = async () => {
    try {
      const iconUrl = await getWebAppsApi()?.getIcon?.(app.id, app.startUrl);
      if (
        iconUrl &&
        icon.isConnected &&
        icon.closest(".webapp-item")?.dataset.webAppId === app.id
      ) {
        icon.src = iconUrl;
      }
    } catch {}
  };

  if (!("IntersectionObserver" in window)) {
    load();
    return;
  }

  webAppsIconObserver ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) {
        continue;
      }
      webAppsIconObserver.unobserve(entry.target);
      const pendingLoad = webAppsPendingIcons.get(entry.target);
      webAppsPendingIcons.delete(entry.target);
      pendingLoad?.();
    }
  });
  webAppsPendingIcons.set(icon, load);
  webAppsIconObserver.observe(icon);
}

function scheduleWebAppsRefresh() {
  if (webAppsRefreshFrame || !webAppsUI.panel) {
    return;
  }
  webAppsRefreshFrame = window.requestAnimationFrame(() => {
    webAppsRefreshFrame = 0;
    refreshWebApps().catch(error => {
      setWebAppsStatus(error?.message || "Could not refresh web apps.", true);
    });
  });
}

async function runWebAppRowAction(row, action) {
  const controls = [...row.querySelectorAll("button, input")];
  const disabledStates = controls.map(control => control.disabled);
  row.setAttribute("aria-busy", "true");
  controls.forEach(control => {
    control.disabled = true;
  });
  setWebAppsStatus("");

  try {
    return await action();
  } finally {
    if (row.isConnected) {
      controls.forEach((control, index) => {
        control.disabled = disabledStates[index];
      });
      row.removeAttribute("aria-busy");
    }
  }
}

async function refreshWebApps() {
  if (
    !webAppsUI.panel ||
    !webAppsUI.enabled ||
    !webAppsUI.count ||
    !webAppsUI.list ||
    !webAppsUI.empty ||
    !webAppsUI.status
  ) {
    return;
  }

  const generation = ++webAppsRefreshGeneration;
  webAppsUI.panel.setAttribute("aria-busy", "true");
  try {
    const api = getWebAppsApi();
    if (!api) {
      webAppsUI.enabled.checked = false;
      webAppsUI.enabled.disabled = true;
      webAppsUI.count.textContent = "Unavailable";
      webAppsUI.empty.hidden = false;
      webAppsUI.empty.textContent = "The Web Apps service could not be loaded.";
      setWebAppsStatus("The Web Apps service is unavailable.", true);
      return;
    }

    const supported = !!api.supported;
    const enabled = supported && !!api.enabled;
    webAppsUI.enabled.checked = enabled;
    webAppsUI.enabled.disabled = !supported;

    if (!supported) {
      webAppsUI.count.textContent = "Unavailable";
      webAppsUI.list.replaceChildren();
      webAppsUI.empty.hidden = false;
      webAppsUI.empty.textContent =
        "Native web apps are currently available on Windows and Linux.";
      setWebAppsStatus("");
      return;
    }

    const apps = await api.list();
    if (generation !== webAppsRefreshGeneration) {
      return;
    }

    const viewState = captureWebAppsViewState();
    webAppsIconObserver?.disconnect();
    webAppsIconObserver = null;
    webAppsUI.list.replaceChildren();
    webAppsUI.count.textContent =
      apps.length === 1 ? "1 installed" : `${apps.length} installed`;
    webAppsUI.empty.hidden = apps.length > 0;
    webAppsUI.empty.textContent = enabled
      ? "No web apps installed."
      : "Web apps are disabled. Installed apps remain available for removal.";
    for (const app of apps) {
      const row = document.createElement("div");
      row.className = "webapp-item";
      row.dataset.webAppId = app.id;
      row.setAttribute("role", "listitem");

      const icon = document.createElement("img");
      icon.className = "webapp-icon";
      icon.src = WEBAPP_FALLBACK_ICON;
      icon.alt = "";
      icon.addEventListener(
        "error",
        () => {
          if (icon.src !== WEBAPP_FALLBACK_ICON) {
            icon.src = WEBAPP_FALLBACK_ICON;
          }
        },
        { once: true }
      );

      const details = document.createElement("div");
      details.className = "webapp-details";

      const nameRow = document.createElement("div");
      nameRow.className = "webapp-name-row";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "text-input webapp-name-input";
      nameInput.maxLength = 80;
      nameInput.dataset.originalName = app.name;
      nameInput.value = viewState.edits.get(app.id) ?? app.name;
      nameInput.disabled = !enabled || !app.supported;
      nameInput.setAttribute("aria-label", `Name for ${app.name}`);
      const saveButton = createWebAppButton("Save", async () => {
        const name = nameInput.value.trim();
        if (!name || name === app.name) {
          nameInput.value = app.name;
          saveButton.disabled = true;
          return;
        }
        await runWebAppRowAction(row, async () => {
          try {
            await api.rename(app.id, name, getBrowserWindow());
            setWebAppsStatus("Web app renamed.");
            scheduleWebAppsRefresh();
          } catch (error) {
            setWebAppsStatus(
              error?.message || "Could not rename the web app.",
              true
            );
          }
        });
      });
      saveButton.dataset.webAppAction = "save";
      saveButton.setAttribute("aria-label", `Save name for ${app.name}`);
      saveButton.disabled =
        !enabled ||
        !app.supported ||
        !nameInput.value.trim() ||
        nameInput.value.trim() === app.name;
      nameInput.addEventListener("input", () => {
        const name = nameInput.value.trim();
        saveButton.disabled =
          !enabled || !app.supported || !name || name === app.name;
      });
      nameInput.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
          saveButton.click();
        } else if (event.key === "Escape") {
          nameInput.value = app.name;
          saveButton.disabled = true;
          nameInput.blur();
        }
      });
      nameRow.appendChild(nameInput);
      nameRow.appendChild(saveButton);

      const url = document.createElement("span");
      url.className = "webapp-url";
      url.textContent = app.startUrl;
      url.title = app.startUrl;

      const meta = document.createElement("span");
      meta.className = "webapp-meta";
      const container = app.containerName
        ? app.containerName
        : app.userContextId
          ? `Container ${app.userContextId}`
          : "Default container";
      const shortcut = !app.supported
        ? "Legacy URL unsupported"
        : app.shortcutInstalled
          ? "System shortcut ready"
          : "System shortcut needs repair";
      meta.textContent = `${container} | ${shortcut}`;

      details.appendChild(nameRow);
      details.appendChild(url);
      details.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "webapp-actions";
      const openButton = createWebAppButton("Open", () =>
        runWebAppRowAction(row, async () => {
          try {
            await api.open(app.id);
            setWebAppsStatus("");
          } catch (error) {
            setWebAppsStatus(
              error?.message || "Could not open the web app.",
              true
            );
          }
        })
      );
      openButton.dataset.webAppAction = "open";
      openButton.setAttribute("aria-label", `Open ${app.name}`);
      openButton.disabled = !enabled || !app.supported;

      const repairLabel = app.shortcutInstalled
        ? "Recreate shortcut"
        : "Create shortcut";
      const repairButton = createWebAppButton(repairLabel, () =>
        runWebAppRowAction(row, async () => {
          try {
            await api.repairShortcut(app.id, getBrowserWindow());
            setWebAppsStatus("System shortcut repaired.");
            scheduleWebAppsRefresh();
          } catch (error) {
            setWebAppsStatus(
              error?.message || "Could not repair the system shortcut.",
              true
            );
          }
        })
      );
      repairButton.dataset.webAppAction = "repair";
      repairButton.setAttribute(
        "aria-label",
        `${repairLabel} for ${app.name}`
      );
      repairButton.disabled = !enabled || !app.supported;

      const removeButton = createWebAppButton(
        "Remove",
        () =>
          runWebAppRowAction(row, async () => {
            if (
              !window.confirm(`Remove "${app.name}" from Midori and the system?`)
            ) {
              return;
            }
            try {
              const removed = await api.uninstall(app.id);
              if (!removed) {
                throw new Error("The web app is no longer installed.");
              }
              setWebAppsStatus("Web app removed.");
              scheduleWebAppsRefresh();
            } catch (error) {
              setWebAppsStatus(
                error?.message || "Could not remove the web app.",
                true
              );
            }
          }),
        { danger: true }
      );
      removeButton.dataset.webAppAction = "remove";
      removeButton.setAttribute("aria-label", `Remove ${app.name}`);

      actions.appendChild(openButton);
      actions.appendChild(repairButton);
      actions.appendChild(removeButton);

      row.appendChild(icon);
      row.appendChild(details);
      row.appendChild(actions);
      webAppsUI.list.appendChild(row);
      loadWebAppIcon(icon, app);
    }
    restoreWebAppsFocus(viewState);
  } catch (error) {
    if (generation === webAppsRefreshGeneration) {
      webAppsUI.count.textContent = "Unavailable";
      webAppsUI.list.replaceChildren();
      webAppsUI.empty.hidden = false;
      webAppsUI.empty.textContent = "Installed web apps could not be loaded.";
      setWebAppsStatus(
        error?.message || "Could not read the web app registry.",
        true
      );
    }
  } finally {
    if (generation === webAppsRefreshGeneration) {
      webAppsUI.panel.removeAttribute("aria-busy");
    }
  }
}

async function initWebApps() {
  webAppsUI.panel = document.getElementById("webapps-manager-panel");
  webAppsUI.enabled = document.getElementById("pref-webapps-enabled");
  webAppsUI.count = document.getElementById("webapps-count");
  webAppsUI.list = document.getElementById("webapps-list");
  webAppsUI.empty = document.getElementById("webapps-empty");
  webAppsUI.status = document.getElementById("webapps-status");

  if (
    !webAppsUI.panel ||
    !webAppsUI.enabled ||
    !webAppsUI.count ||
    !webAppsUI.list ||
    !webAppsUI.empty ||
    !webAppsUI.status
  ) {
    return;
  }

  webAppsUI.enabled.addEventListener("change", async () => {
    const api = getWebAppsApi();
    if (!api?.supported) {
      return;
    }
    const enabled = webAppsUI.enabled.checked;
    webAppsUI.enabled.disabled = true;
    try {
      api.setEnabled(enabled);
      setWebAppsStatus("");
      scheduleWebAppsRefresh();
    } catch (error) {
      webAppsUI.enabled.checked = !!api.enabled;
      setWebAppsStatus(
        error?.message || "Could not update Web Apps.",
        true
      );
    } finally {
      webAppsUI.enabled.disabled = false;
    }
  });

  const observer = { observe: scheduleWebAppsRefresh };
  webAppsObserver = observer;
  Services.obs.addObserver(observer, WEBAPPS_CHANGE_TOPIC);
  Services.prefs.addObserver("browser.taskbarTabs.enabled", observer);
  window.addEventListener(
    "unload",
    () => {
      try {
        Services.obs.removeObserver(observer, WEBAPPS_CHANGE_TOPIC);
        Services.prefs.removeObserver("browser.taskbarTabs.enabled", observer);
      } catch {}
      if (webAppsObserver === observer) {
        webAppsObserver = null;
      }
      if (webAppsRefreshFrame) {
        window.cancelAnimationFrame(webAppsRefreshFrame);
        webAppsRefreshFrame = 0;
      }
      webAppsIconObserver?.disconnect();
      webAppsIconObserver = null;
      webAppsRefreshGeneration++;
    },
    { once: true }
  );

  await refreshWebApps();
}

function ensureWebAppsInitialized() {
  webAppsInitPromise ??= initWebApps().catch(error => {
    setWebAppsStatus(error?.message || "Could not initialize Web Apps.", true);
  });
  return webAppsInitPromise;
}

function getWorkspaceIcons(api) {
  try {
    const icons = api?.getWorkspaceIcons?.();
    if (Array.isArray(icons) && icons.length) {
      return icons;
    }
  } catch {}
  return FALLBACK_WORKSPACE_ICONS;
}

function setWorkspaceStatus(message, isError = false) {
  if (!workspaceUI.status) return;
  workspaceUI.status.textContent = message || "";
  workspaceUI.status.classList.toggle("workspace-status-error", !!isError);
  workspaceUI.status.hidden = !message;
}

function clearWorkspaceStatus() {
  setWorkspaceStatus("");
}

function setShortcutStatus(message, isError = false) {
  if (!shortcutUI.status) return;
  shortcutUI.status.textContent = message || "";
  shortcutUI.status.classList.toggle("workspace-status-error", !!isError);
  shortcutUI.status.hidden = !message;
}

function clearShortcutStatus() {
  setShortcutStatus("");
}

function populateIconSelect(selectEl, icons, selectedIcon) {
  if (!selectEl) return;

  while (selectEl.firstChild) {
    selectEl.firstChild.remove();
  }

  for (const icon of icons) {
    const option = document.createElement("option");
    option.value = icon.id;
    option.textContent = `${icon.emoji} ${icon.label || icon.id}`;
    selectEl.appendChild(option);
  }

  selectEl.value = selectedIcon || "default";
}

function setWorkspaceManagerEnabled(enabled) {
  if (!workspaceUI.panel) return;
  workspaceUI.panel.classList.toggle("workspace-disabled", !enabled);
  for (const el of [workspaceUI.createName, workspaceUI.createIcon, workspaceUI.createBtn]) {
    if (el) {
      el.disabled = !enabled;
    }
  }
}

async function refreshWorkspaceManager() {
  if (!workspaceUI.panel || !workspaceUI.list || !workspaceUI.empty || !workspaceUI.count) {
    return;
  }

  const enabled = readPref("midori.workspaces.enabled", "bool") !== false;
  setWorkspaceManagerEnabled(enabled);

  if (!enabled) {
    workspaceUI.count.textContent = "0 / 0";
    workspaceUI.list.textContent = "";
    if (workspaceUI.summary) {
      workspaceUI.summary.textContent = "";
    }
    workspaceUI.empty.hidden = false;
    workspaceUI.empty.textContent = "Enable Workspaces to start managing them.";
    clearWorkspaceStatus();
    return;
  }

  const api = getWorkspaceApi();
  const win = getBrowserWindow();
  if (!api || !win) {
    workspaceUI.count.textContent = "0 / 0";
    workspaceUI.list.textContent = "";
    if (workspaceUI.summary) {
      workspaceUI.summary.textContent = "";
    }
    workspaceUI.empty.hidden = false;
    workspaceUI.empty.textContent = "Workspace service is unavailable in this context.";
    setWorkspaceStatus("Could not connect to the workspace service.", true);
    return;
  }

  const icons = getWorkspaceIcons(api);
  populateIconSelect(workspaceUI.createIcon, icons, "default");

  let snapshot = null;
  try {
    snapshot = await api.getWorkspacesForWindow(win);
  } catch {
    snapshot = null;
  }

  const workspaces = snapshot?.workspaces || [];
  const maxCount = api.getMaxWorkspaces?.() || 25;
  const maxNameLength = api.getMaxWorkspaceNameLength?.() || 32;

  workspaceUI.count.textContent = `${workspaces.length} / ${maxCount}`;
  workspaceUI.createName.maxLength = maxNameLength;

  workspaceUI.list.textContent = "";
  if (workspaceUI.summary) {
    workspaceUI.summary.textContent = "";
  }

  if (!workspaces.length) {
    workspaceUI.empty.hidden = false;
    workspaceUI.empty.textContent = "No workspaces available.";
    return;
  }

  workspaceUI.empty.hidden = true;

  for (let index = 0; index < workspaces.length; index++) {
    const ws = workspaces[index];
    const icon = icons.find((item) => item.id === ws.icon) || icons[0];

    if (workspaceUI.summary) {
      const summaryItem = document.createElement("button");
      summaryItem.type = "button";
      summaryItem.className = "workspace-summary-item";
      if (ws.isSelected) {
        summaryItem.classList.add("workspace-summary-item-active");
      }
      summaryItem.title = `${ws.name} · ${ws.tabCount} tab${ws.tabCount === 1 ? "" : "s"}`;
      summaryItem.textContent = icon?.emoji || "🏠";
      summaryItem.addEventListener("click", async () => {
        api.switchWorkspace(win, ws.id);
        await refreshWorkspaceManager();
      });
      workspaceUI.summary.appendChild(summaryItem);
    }

    const row = document.createElement("article");
    row.className = "workspace-item";
    if (ws.isSelected) {
      row.classList.add("workspace-item-active");
    }
    row.style.setProperty("--workspace-row-accent", api.getWorkspaceAccent?.(ws.icon) || "var(--mc-green-500)");

    const top = document.createElement("div");
    top.className = "workspace-item-top";

    const identity = document.createElement("div");
    identity.className = "workspace-identity";
    const iconEl = document.createElement("span");
    iconEl.className = "workspace-icon";
    iconEl.textContent = icon?.emoji || "🏠";
    const titleEl = document.createElement("strong");
    titleEl.textContent = ws.name;
    identity.appendChild(iconEl);
    identity.appendChild(titleEl);

    const badges = document.createElement("div");
    badges.className = "workspace-badges";

    if (ws.isSelected) {
      const selectedBadge = document.createElement("span");
      selectedBadge.className = "workspace-badge workspace-badge-selected";
      selectedBadge.textContent = "Current";
      badges.appendChild(selectedBadge);
    }

    if (ws.isDefault) {
      const defaultBadge = document.createElement("span");
      defaultBadge.className = "workspace-badge workspace-badge-default";
      defaultBadge.textContent = "Default";
      badges.appendChild(defaultBadge);
    }

    const tabsBadge = document.createElement("span");
    tabsBadge.className = "workspace-badge";
    tabsBadge.textContent = `${ws.tabCount} tab${ws.tabCount === 1 ? "" : "s"}`;
    badges.appendChild(tabsBadge);

    top.appendChild(identity);
    top.appendChild(badges);

    const form = document.createElement("div");
    form.className = "workspace-edit-grid";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "text-input";
    nameInput.maxLength = maxNameLength;
    nameInput.value = ws.name;

    const iconSelect = document.createElement("select");
    iconSelect.className = "select-input";
    populateIconSelect(iconSelect, icons, ws.icon);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "mc-btn";
    saveBtn.textContent = "Save";

    saveBtn.addEventListener("click", async () => {
      const updated = await api.updateWorkspace(win, ws.id, {
        name: nameInput.value.trim() || ws.name,
        icon: iconSelect.value,
      });
      if (!updated) {
        setWorkspaceStatus("Could not save workspace changes.", true);
        return;
      }
      clearWorkspaceStatus();
      await refreshWorkspaceManager();
    });

    nameInput.addEventListener("keydown", async (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        saveBtn.click();
      }
    });

    form.appendChild(nameInput);
    form.appendChild(iconSelect);
    form.appendChild(saveBtn);

    const actions = document.createElement("div");
    actions.className = "workspace-actions";

    const makeButton = (label, className, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `mc-btn ${className}`.trim();
      btn.textContent = label;
      btn.addEventListener("click", onClick);
      actions.appendChild(btn);
      return btn;
    };

    makeButton("Activate", "", async () => {
      api.switchWorkspace(win, ws.id);
      await refreshWorkspaceManager();
    });

    makeButton("Duplicate", "", async () => {
      const duplicatedId = await api.duplicateWorkspace(win, ws.id);
      if (!duplicatedId) {
        setWorkspaceStatus("Could not duplicate workspace.", true);
        return;
      }
      clearWorkspaceStatus();
      await refreshWorkspaceManager();
    });

    const upBtn = makeButton("Up", "", async () => {
      const moved = await api.moveWorkspace(win, ws.id, -1);
      if (!moved) {
        setWorkspaceStatus("Could not move workspace up.", true);
        return;
      }
      clearWorkspaceStatus();
      await refreshWorkspaceManager();
    });
    upBtn.disabled = index === 0;

    const downBtn = makeButton("Down", "", async () => {
      const moved = await api.moveWorkspace(win, ws.id, 1);
      if (!moved) {
        setWorkspaceStatus("Could not move workspace down.", true);
        return;
      }
      clearWorkspaceStatus();
      await refreshWorkspaceManager();
    });
    downBtn.disabled = index === workspaces.length - 1;

    const defaultBtn = makeButton("Set default", "", async () => {
      const changed = await api.setDefaultWorkspace(win, ws.id);
      if (!changed) {
        setWorkspaceStatus("Could not set default workspace.", true);
        return;
      }
      clearWorkspaceStatus();
      await refreshWorkspaceManager();
    });
    defaultBtn.disabled = ws.isDefault;

    const deleteBtn = makeButton("Delete", "mc-btn-danger", async () => {
      const MOVE_TABS = 0;
      const DELETE_TABS = 1;
      const action = Services.prompt.confirmEx(
        win,
        `Delete workspace: ${ws.name}`,
        "What should happen to this workspace's tabs?",
        Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
          Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_IS_STRING +
          Services.prompt.BUTTON_POS_2 * Services.prompt.BUTTON_TITLE_CANCEL +
          Services.prompt.BUTTON_POS_2_DEFAULT,
        ws.tabCount === 1 ? "Move the tab to Default" : "Move all tabs to Default",
        ws.tabCount === 1 ? "Close the tab" : "Close all tabs",
        null,
        null,
        {}
      );
      if (action !== MOVE_TABS && action !== DELETE_TABS) {
        return;
      }
      const deleted = await api.deleteWorkspace(win, ws.id, {
        closeTabs: action === DELETE_TABS,
      });
      if (!deleted) {
        setWorkspaceStatus("Could not delete workspace.", true);
        return;
      }
      clearWorkspaceStatus();
      await refreshWorkspaceManager();
    });
    deleteBtn.disabled = !ws.canDelete;

    row.appendChild(top);
    row.appendChild(form);
    row.appendChild(actions);
    workspaceUI.list.appendChild(row);
  }
}

async function initWorkspaceManager() {
  workspaceUI.panel = document.getElementById("workspace-manager-panel");
  workspaceUI.count = document.getElementById("workspace-count");
  workspaceUI.summary = document.getElementById("workspace-summary-strip");
  workspaceUI.createName = document.getElementById("workspace-create-name");
  workspaceUI.createIcon = document.getElementById("workspace-create-icon");
  workspaceUI.createBtn = document.getElementById("workspace-create-btn");
  workspaceUI.list = document.getElementById("workspace-list");
  workspaceUI.empty = document.getElementById("workspace-empty");
  workspaceUI.status = document.getElementById("workspace-manager-status");

  if (!workspaceUI.panel) {
    return;
  }

  workspaceUI.createBtn?.addEventListener("click", async () => {
    const api = getWorkspaceApi();
    const win = getBrowserWindow();
    if (!api || !win) {
      setWorkspaceStatus("Workspace service is unavailable.", true);
      return;
    }

    const rawName = workspaceUI.createName?.value?.trim();
    const workspaceName = rawName || "New Workspace";
    const icon = workspaceUI.createIcon?.value || "default";
    const createdId = await api.createWorkspace(win, workspaceName, icon);
    if (!createdId) {
      setWorkspaceStatus("Could not create workspace. You may have reached the limit.", true);
      return;
    }

    if (workspaceUI.createName) {
      workspaceUI.createName.value = "";
    }
    clearWorkspaceStatus();
    await refreshWorkspaceManager();
  });

  document.getElementById("pref-workspaces-enabled")?.addEventListener("change", async () => {
    await refreshWorkspaceManager();
  });

  if (!workspaceObserver) {
    workspaceObserver = {
      observe() {
        refreshWorkspaceManager();
      },
    };
    Services.obs.addObserver(workspaceObserver, WORKSPACE_CHANGE_TOPIC);
  }

  window.addEventListener(
    "unload",
    () => {
      if (workspaceObserver) {
        try {
          Services.obs.removeObserver(workspaceObserver, WORKSPACE_CHANGE_TOPIC);
        } catch {}
      }
      workspaceObserver = null;
    },
    { once: true }
  );

  await refreshWorkspaceManager();
}

function findShortcutConflict(definitions, currentPref, candidate) {
  if (!candidate) {
    return null;
  }

  const api = getShortcutsApi();
  const normalized = api?.normalizeShortcutString?.(candidate) || candidate;
  for (const definition of definitions) {
    if (definition.pref === currentPref) {
      continue;
    }

    const existing = api?.getShortcutValue?.(definition.pref) || "";
    if (existing && existing === normalized) {
      return definition;
    }
  }

  return null;
}

function isReservedShortcut(candidate) {
  return !!getShortcutsApi()?.isReservedBrowserShortcut?.(candidate);
}

function syncShortcutFieldValue(input, definition) {
  const api = getShortcutsApi();
  const savedValue = api?.getShortcutValue?.(definition.pref) || "";
  input.dataset.savedShortcut = savedValue;
  delete input.dataset.pendingShortcut;
  input.value = api?.formatShortcutForDisplay?.(savedValue) || "Not set";
  input.classList.remove(
    "shortcut-field-capturing",
    "shortcut-field-error",
    "shortcut-field-success"
  );
}

async function saveCapturedShortcut(input, definitions, definition, conflict) {
  const pendingShortcut = input.dataset.pendingShortcut;
  if (pendingShortcut === undefined) {
    return false;
  }

  if (isReservedShortcut(pendingShortcut)) {
    input.classList.add("shortcut-field-error");
    conflict.hidden = false;
    conflict.textContent = `${pendingShortcut} is reserved for bookmarking the current page.`;
    setShortcutStatus(`${pendingShortcut} is reserved by the browser. Choose another shortcut.`, true);
    return false;
  }

  const conflictDef = findShortcutConflict(definitions, definition.pref, pendingShortcut);
  if (conflictDef) {
    input.classList.add("shortcut-field-error");
    conflict.hidden = false;
    conflict.textContent = `Conflict with ${conflictDef.title}. Choose another shortcut or clear the other action first.`;
    setShortcutStatus(`Shortcut conflict: ${conflictDef.title} already uses ${pendingShortcut}.`, true);
    return false;
  }

  getShortcutsApi()?.setShortcutValue?.(definition.pref, pendingShortcut);
  shortcutFlashPref = definition.pref;
  setShortcutStatus(`${definition.title} shortcut saved.`);
  await refreshShortcutManager();
  return true;
}

function buildShortcutRow(definitions, definition) {
  const api = getShortcutsApi();
  const row = document.createElement("div");
  row.className = "shortcut-row";

  const meta = document.createElement("div");
  meta.className = "shortcut-meta";

  const title = document.createElement("strong");
  title.textContent = definition.title;
  meta.appendChild(title);

  const desc = document.createElement("p");
  desc.textContent = definition.description;
  meta.appendChild(desc);

  const controls = document.createElement("div");
  controls.className = "shortcut-controls";

  const inputRow = document.createElement("div");
  inputRow.className = "shortcut-input-row";

  const input = document.createElement("input");
  input.type = "text";
  input.readOnly = true;
  input.className = "shortcut-field";
  input.setAttribute("aria-label", definition.title);
  input.title = `${definition.title} shortcut`;
  syncShortcutFieldValue(input, definition);

  if (shortcutFlashPref === definition.pref) {
    input.classList.add("shortcut-field-success");
  }

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "mc-btn";
  resetBtn.textContent = definition.defaultValue ? "Reset" : "Clear";
  resetBtn.disabled = !definition.defaultValue && !api?.getShortcutValue?.(definition.pref);
  resetBtn.addEventListener("click", async () => {
    api?.setShortcutValue?.(definition.pref, definition.defaultValue || "");
    shortcutFlashPref = definition.pref;
    setShortcutStatus(`${definition.title} shortcut updated.`);
    await refreshShortcutManager();
  });

  input.addEventListener("focus", () => {
    input.classList.add("shortcut-field-capturing");
    setShortcutStatus(`Press a shortcut for ${definition.title}, then move to another field to save it.`);
  });

  input.addEventListener("blur", () => {
    if (input.dataset.pendingShortcut !== undefined) {
      void saveCapturedShortcut(input, definitions, definition, conflict);
      return;
    }

    syncShortcutFieldValue(input, definition);
    clearShortcutStatus();
  });

  const hint = document.createElement("div");
  hint.className = "shortcut-hint";
  hint.textContent = "Click field, press shortcut, then move to another field to save.";

  const conflict = document.createElement("div");
  conflict.className = "shortcut-conflict";
  conflict.hidden = true;

  input.addEventListener("keydown", async event => {
    if (event.key === "Tab") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Backspace") {
      api?.setShortcutValue?.(definition.pref, "");
      shortcutFlashPref = definition.pref;
      setShortcutStatus(`${definition.title} shortcut cleared.`);
      await refreshShortcutManager();
      return;
    }

    if (event.key === "Escape") {
      delete input.dataset.pendingShortcut;
      input.blur();
      return;
    }

    const captured = api?.captureShortcutFromKeyEvent?.(event) || "";
    if (!captured) {
      setShortcutStatus("Use a modifier plus a key, or a function key.", true);
      return;
    }

    input.dataset.pendingShortcut = captured;
    input.value = api?.formatShortcutForDisplay?.(captured) || captured;
    input.classList.add("shortcut-field-capturing");
    input.classList.remove("shortcut-field-error", "shortcut-field-success");

    if (isReservedShortcut(captured)) {
      conflict.hidden = false;
      conflict.textContent = `${captured} is reserved for bookmarking the current page.`;
      input.classList.add("shortcut-field-error");
      setShortcutStatus(`${captured} is reserved by the browser.`, true);
      return;
    }

    const conflictDef = findShortcutConflict(definitions, definition.pref, captured);
    if (conflictDef) {
      conflict.hidden = false;
      conflict.textContent = `Conflict with ${conflictDef.title}. Choose another shortcut or press Esc to cancel.`;
      input.classList.add("shortcut-field-error");
      setShortcutStatus(`Conflict with ${conflictDef.title}.`, true);
    } else {
      conflict.hidden = true;
      conflict.textContent = "";
      setShortcutStatus(`${captured} will be saved when you move to another field.`);
    }
  });

  inputRow.appendChild(input);
  inputRow.appendChild(resetBtn);
  controls.appendChild(inputRow);
  controls.appendChild(hint);
  controls.appendChild(conflict);

  const defaults = document.createElement("div");
  defaults.className = "shortcut-default";
  defaults.textContent = definition.defaultValue
    ? `Default: ${definition.defaultValue}`
    : "Default: Not set";

  const actions = document.createElement("div");
  actions.className = "shortcut-actions";

  const captureBtn = document.createElement("button");
  captureBtn.type = "button";
  captureBtn.className = "mc-btn";
  captureBtn.textContent = "Capture";
  captureBtn.addEventListener("click", () => {
    input.focus();
    input.select();
  });
  actions.appendChild(captureBtn);

  row.appendChild(meta);
  row.appendChild(controls);
  row.appendChild(defaults);
  row.appendChild(actions);
  return row;
}

async function refreshShortcutManager() {
  if (!shortcutUI.panel || !shortcutUI.count || !shortcutUI.groups) {
    return;
  }

  const api = getShortcutsApi();
  const definitions = api?.getShortcutDefinitions?.() || [];
  if (!api || !definitions.length) {
    shortcutUI.count.textContent = "0 / 0";
    shortcutUI.groups.textContent = "";
    const empty = document.createElement("div");
    empty.className = "shortcut-empty";
    empty.textContent = "Shortcut service is unavailable in this context.";
    shortcutUI.groups.appendChild(empty);
    setShortcutStatus("Could not connect to the shortcut service.", true);
    return;
  }

  const configuredCount = definitions.filter(definition => api.getShortcutValue(definition.pref)).length;
  shortcutUI.count.textContent = `${configuredCount} / ${definitions.length}`;
  shortcutUI.groups.textContent = "";

  const groups = new Map();
  for (const definition of definitions) {
    if (!groups.has(definition.category)) {
      groups.set(definition.category, []);
    }
    groups.get(definition.category).push(definition);
  }

  for (const [category, items] of groups.entries()) {
    const section = document.createElement("section");
    section.className = "shortcut-group";

    const header = document.createElement("div");
    header.className = "shortcut-group-header";

    const copy = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = category;
    const desc = document.createElement("p");
    desc.textContent = `${items.length} customizable action${items.length === 1 ? "" : "s"}.`;
    copy.appendChild(title);
    copy.appendChild(desc);

    const count = document.createElement("span");
    count.className = "shortcut-group-count";
    count.textContent = `${items.filter(item => api.getShortcutValue(item.pref)).length} active`;

    header.appendChild(copy);
    header.appendChild(count);

    const list = document.createElement("div");
    list.className = "shortcut-list";
    for (const definition of items) {
      list.appendChild(buildShortcutRow(definitions, definition));
    }

    section.appendChild(header);
    section.appendChild(list);
    shortcutUI.groups.appendChild(section);
  }

  if (shortcutFlashPref) {
    window.setTimeout(() => {
      if (shortcutFlashPref) {
        shortcutFlashPref = "";
        refreshShortcutManager();
      }
    }, 900);
  }
}

async function initShortcutManager() {
  shortcutUI.panel = document.getElementById("shortcut-manager-panel");
  shortcutUI.count = document.getElementById("shortcut-count");
  shortcutUI.groups = document.getElementById("shortcut-groups");
  shortcutUI.status = document.getElementById("shortcut-manager-status");

  if (!shortcutUI.panel) {
    return;
  }

  const api = getShortcutsApi();
  const definitions = api?.getShortcutDefinitions?.() || [];
  shortcutObservedPrefs = [...new Set(definitions.map(definition => definition.pref))];

  if (!shortcutObserver && shortcutObservedPrefs.length) {
    shortcutObserver = {
      observe() {
        refreshShortcutManager();
      },
    };
    for (const pref of shortcutObservedPrefs) {
      Services.prefs.addObserver(pref, shortcutObserver);
    }
  }

  window.addEventListener(
    "unload",
    () => {
      if (shortcutObserver) {
        for (const pref of shortcutObservedPrefs) {
          try {
            Services.prefs.removeObserver(pref, shortcutObserver);
          } catch {}
        }
      }
      shortcutObserver = null;
      shortcutObservedPrefs = [];
    },
    { once: true }
  );

  await refreshShortcutManager();
}

// ---- Init prefs on all mapped elements ----
function initPrefs() {
  for (const [id, { pref, type }] of Object.entries(PREF_MAP)) {
    const el = document.getElementById(id);
    if (!el) continue;
    const val = readPref(pref, type);
    if (val !== undefined) syncPrefElement(id, pref, type);

    if (el.type === "checkbox") {
      el.addEventListener("change", () => writePref(pref, type, el.checked));
    } else if (el.type === "range") {
      const valueTarget = el.dataset.valueTarget ? document.getElementById(el.dataset.valueTarget) : null;
      const syncRangeValue = () => {
        if (valueTarget) {
          valueTarget.textContent = `${el.value} px`;
        }
      };
      syncRangeValue();
      el.addEventListener("input", () => {
        syncRangeValue();
      });
      el.addEventListener("change", () => {
        syncRangeValue();
        writePref(pref, type, parseInt(el.value, 10));
      });
    } else if (el.tagName === "SELECT") {
      el.addEventListener("change", () => writePref(pref, type, el.value));
    } else if (el.tagName === "FIELDSET") {
      const radios = [...el.querySelectorAll("input[type=radio]")];
      if (!radios.length) {
        continue;
      }
      const current = val === undefined ? radios[0].value : String(val);
      const selected = radios.find(radio => radio.value === current) || radios[0];
      selected.checked = true;
      for (const radio of radios) {
        radio.addEventListener("change", () => {
          if (radio.checked) {
            writePref(pref, type, radio.value);
          }
        });
      }
    } else if (el.type === "number") {
      el.addEventListener("change", () => {
        const parsedMin = el.min === "" ? Number.MIN_SAFE_INTEGER : Number(el.min);
        const parsedMax = el.max === "" ? Number.MAX_SAFE_INTEGER : Number(el.max);
        const parsedStep = el.step === "" || el.step === "any" ? 1 : Number(el.step);
        const min = Number.isFinite(parsedMin) ? Math.ceil(parsedMin) : Number.MIN_SAFE_INTEGER;
        const max = Number.isFinite(parsedMax) ? Math.floor(parsedMax) : Number.MAX_SAFE_INTEGER;
        const step = Number.isFinite(parsedStep) && parsedStep > 0
          ? Math.max(1, Math.round(parsedStep))
          : 1;
        const requested = el.valueAsNumber;
        const fallback = readPref(pref, type) ?? min;
        const bounded = Math.min(max, Math.max(min, Number.isFinite(requested) ? requested : fallback));
        const stepBase = Number.isFinite(parsedMin) ? min : 0;
        const snapped = stepBase + Math.round((bounded - stepBase) / step) * step;
        const next = Math.trunc(Math.min(max, Math.max(min, snapped)));
        el.value = String(next);
        writePref(pref, type, next);
      });
    } else if (el.type === "color") {
      el.addEventListener("change", () => writePref(pref, type, el.value));
    }
  }
}

function updateSidebarControlAvailability() {
  const enabled = document.getElementById("pref-msidebar-enabled")?.checked ?? false;
  const autohide = document.getElementById("pref-msidebar-autohide")?.checked ?? false;
  const vertical =
    readPref("midori.verticaltabs.enabled", "bool") ||
    readPref("midori.arcmode.enabled", "bool");

  for (const id of [
    "pref-msidebar-position",
    "pref-msidebar-width",
    "pref-msidebar-autohide",
  ]) {
    const control = document.getElementById(id);
    if (!control) continue;
    control.disabled = !enabled;
    control.closest(".setting-row")?.classList.toggle("setting-row-disabled", !enabled);
  }

  const mode = document.getElementById("pref-msidebar-autohide-mode");
  const modeAvailable = enabled && autohide;
  if (mode) {
    mode.disabled = !modeAvailable;
    mode.closest(".setting-row")?.classList.toggle("setting-row-disabled", !modeAvailable);
  }

  const collapse = document.getElementById("pref-verticaltabs-collapse");
  if (collapse) {
    collapse.disabled = !vertical;
    collapse.closest(".setting-row")?.classList.toggle("setting-row-disabled", !vertical);
  }
}

function initSidebarControls() {
  const observedPrefs = new Set([
    "midori.msidebar.enabled",
    "midori.msidebar.position",
    "midori.msidebar.width",
    "midori.msidebar.autohide.enabled",
    "midori.msidebar.autohide.mode",
    "midori.verticaltabs.collapse",
    "midori.verticaltabs.enabled",
    "midori.arcmode.enabled",
  ]);
  const controlsByPref = new Map();
  for (const [id, config] of Object.entries(PREF_MAP)) {
    if (!observedPrefs.has(config.pref)) continue;
    const controls = controlsByPref.get(config.pref) || [];
    controls.push({ id, ...config });
    controlsByPref.set(config.pref, controls);
  }

  for (const id of ["pref-msidebar-enabled", "pref-msidebar-autohide"]) {
    document.getElementById(id)?.addEventListener("change", updateSidebarControlAvailability);
  }

  const observer = {
    observe(_subject, _topic, pref) {
      for (const config of controlsByPref.get(pref) || []) {
        syncPrefElement(config.id, config.pref, config.type);
      }
      updateSidebarControlAvailability();
    },
  };
  for (const pref of observedPrefs) {
    Services.prefs.addObserver(pref, observer);
  }
  window.addEventListener("unload", () => {
    for (const pref of observedPrefs) {
      try {
        Services.prefs.removeObserver(pref, observer);
      } catch {}
    }
  }, { once: true });

  updateSidebarControlAvailability();
}

function setModControlAvailability(control, available, reason = "") {
  if (!control) {
    return;
  }
  control.disabled = !available;
  const row = control.closest(".mod-row");
  row?.classList.toggle("is-unavailable", !available);
  let reasonElement = row?.querySelector(".mod-unavailable-reason");
  if (row && !reasonElement) {
    reasonElement = document.createElement("span");
    reasonElement.className = "mod-unavailable-reason";
    reasonElement.id = `${control.id}-availability`;
    row.querySelector(".mod-copy")?.append(reasonElement);
  }
  if (!available && reason) {
    row?.setAttribute("data-unavailable-reason", reason);
    if (reasonElement) {
      reasonElement.textContent = reason;
      reasonElement.hidden = false;
      control.setAttribute("aria-describedby", reasonElement.id);
    }
  } else {
    row?.removeAttribute("data-unavailable-reason");
    if (reasonElement) {
      reasonElement.hidden = true;
      if (control.getAttribute("aria-describedby") === reasonElement.id) {
        control.removeAttribute("aria-describedby");
      }
    }
  }
}

function updateModBlurDependencies() {
  const extensionStyle = document.getElementById("pref-modblur-extension-style")?.value || "off";
  setModControlAvailability(
    document.getElementById("pref-modblur-extension-columns"),
    extensionStyle === "grid",
    "Choose Icon grid to change this value."
  );
  setModControlAvailability(
    document.getElementById("pref-modblur-extension-icon-size"),
    extensionStyle !== "off",
    "Choose Compact list or Icon grid to change this value."
  );

  const combinedBlur = document.getElementById("pref-modblur-extra-blur")?.checked;
  setModControlAvailability(
    document.getElementById("pref-modblur-panel-blur"),
    !combinedBlur,
    "Combined extra blur already includes this effect."
  );

  const popoutEnabled = (document.getElementById("pref-modblur-popout-searchbar")?.value || "off") !== "off";
  setModControlAvailability(
    document.getElementById("pref-modblur-search-blur"),
    !combinedBlur && !popoutEnabled,
    combinedBlur
      ? "Combined extra blur already includes this effect."
      : "The selected popout address bar already includes blur."
  );

  const vertical = Boolean(
    readPref("midori.verticaltabs.enabled", "bool") ||
    readPref("midori.arcmode.enabled", "bool")
  );
  for (const id of ["pref-modblur-compact-vertical", "pref-modblur-hide-vertical-scrollbar"]) {
    setModControlAvailability(
      document.getElementById(id),
      vertical,
      "Switch to vertical tabs to see this modification."
    );
  }
  setModControlAvailability(
    document.getElementById("pref-modblur-vertical-expand-blur"),
    vertical && !combinedBlur,
    combinedBlur
      ? "Combined extra blur already includes this effect."
      : "Switch to vertical tabs to see this modification."
  );

  for (const id of [
    "pref-modblur-autohide-tabs",
    "pref-modblur-centered-tabs",
    "pref-modblur-tabs-layout",
    "pref-modblur-active-tab-static",
  ]) {
    setModControlAvailability(
      document.getElementById(id),
      !vertical,
      "Switch to horizontal tabs to see this modification."
    );
  }
  setModControlAvailability(
    document.getElementById("pref-modblur-show-inactive-tabs"),
    !vertical && Boolean(document.getElementById("pref-modblur-autohide-tabs")?.checked),
    vertical
      ? "Switch to horizontal tabs to see this modification."
      : "Enable Tabs on hover first."
  );

  setModControlAvailability(
    document.getElementById("pref-modblur-bookmarks-centered"),
    Boolean(document.getElementById("pref-modblur-bookmarks-transparent")?.checked),
    "Enable Transparent bookmarks bar first."
  );

  const anyBlur = Boolean(
    combinedBlur ||
    popoutEnabled ||
    document.getElementById("pref-modblur-panel-blur")?.checked ||
    document.getElementById("pref-modblur-search-blur")?.checked ||
    document.getElementById("pref-modblur-vertical-expand-blur")?.checked ||
    document.getElementById("pref-modblur-acrylic")?.checked ||
    document.getElementById("pref-modblur-card-theme")?.value !== "off"
  );
  setModControlAvailability(
    document.getElementById("pref-modblur-strength"),
    anyBlur,
    "Enable a blur surface or Acrylic to tune its strength."
  );
}

function updateModBlurPreview() {
  const preview = document.getElementById("modblur-preview");
  if (!preview) {
    return;
  }

  const value = (id, fallback) => document.getElementById(id)?.value || fallback;
  const checked = id => Boolean(document.getElementById(id)?.checked);
  preview.dataset.density = value("pref-modblur-menu-density", "balanced");
  preview.dataset.texture = value("pref-modblur-texture", "off");
  preview.dataset.motion = value("pref-modblur-motion", "calm");
  preview.dataset.blur = value("pref-modblur-strength", "balanced");
  preview.dataset.alignment = value("pref-modblur-url-alignment", "smart");
  preview.dataset.popout = value("pref-modblur-popout-searchbar", "off");
  preview.dataset.bookmarks = checked("pref-modblur-bookmarks-transparent") && checked("pref-modblur-bookmarks-centered") ? "centered" : "start";
  preview.dataset.identity = checked("pref-modblur-compact-identity") ? "compact" : "visible";
  preview.dataset.panels = checked("pref-modblur-panel-blur") || checked("pref-modblur-extra-blur") ? "blurred" : "solid";
  preview.dataset.layout = value("pref-modblur-tabs-layout", "urlbar-top");
  preview.dataset.frame = value("pref-modblur-window-frame", "none");
  preview.dataset.controls = value("pref-modblur-window-controls", "system");
  preview.dataset.card = value("pref-modblur-card-theme", "off");
  preview.dataset.spill = checked("pref-modblur-spill-theme") ? "on" : "off";
  preview.dataset.newtabCenter = value("pref-modblur-newtab-center-widgets", "off") === "center" ? "center" : "off";
  preview.dataset.shortcutTitles = checked("pref-modblur-newtab-hide-titles") ? "hidden" : "visible";
  preview.dataset.shortcutShape = checked("pref-modblur-newtab-circular") ? "circular" : "rounded";
  preview.dataset.wallpaperBlur = value("pref-modblur-newtab-wallpaper-blur", "0");
  preview.style.setProperty(
    "--mod-preview-wallpaper-blur",
    `${Math.max(0, Math.min(10, Number(preview.dataset.wallpaperBlur) || 0)) * 1.2}px`
  );

  const labels = {
    soft: "Soft blur",
    balanced: "Balanced blur",
    deep: "Deep blur",
    calm: "calm motion",
    expressive: "expressive motion",
    off: "no optional motion",
    grain: "fine grain",
    frosted: "frosted grain",
    "urlbar-top": "address bar above tabs",
    "tabs-top": "tabs above address bar",
    none: "no added frame",
    compact: "compact frame",
    padded: "padded frame",
    system: "system window controls",
    "system-left": "system controls on the left",
    "mac-left": "Mac-style controls on the left",
    "mac-right": "Mac-style controls on the right",
    subtle: "subtle cards",
    elevated: "elevated cards",
  };
  const texture = preview.dataset.texture === "off" ? "no texture" : labels[preview.dataset.texture];
  const cards = preview.dataset.card === "off" ? "cards off" : labels[preview.dataset.card];
  const newTab = preview.dataset.newtabCenter === "center" ? "centered New Tab widgets" : "default New Tab alignment";
  const titles = preview.dataset.shortcutTitles === "hidden" ? "shortcut titles hidden" : "shortcut titles visible";
  const description = document.getElementById("modblur-preview-description");
  if (description) {
    description.textContent = `${labels[preview.dataset.layout]} · ${labels[preview.dataset.frame]} · ${labels[preview.dataset.controls]} · ${labels[preview.dataset.blur]} · ${labels[preview.dataset.motion]} · ${texture} · ${cards} · ${preview.dataset.spill === "on" ? "spill on" : "spill off"} · ${newTab} · ${titles}`;
  }
}

function updateModBlurVisibility() {
  const query = (document.getElementById("modblur-search")?.value || "").trim().toLocaleLowerCase();
  let visible = 0;

  for (const group of document.querySelectorAll(".visual-mods-group")) {
    const groupMatches = activeModBlurFilter === "all" || group.dataset.modGroup === activeModBlurFilter;
    let groupVisible = 0;
    for (const row of group.querySelectorAll(".mod-row")) {
      const haystack = `${row.dataset.search || ""} ${row.textContent || ""}`.toLocaleLowerCase();
      const matches = groupMatches && (!query || haystack.includes(query));
      row.hidden = !matches;
      if (matches) {
        groupVisible++;
      }
    }
    group.hidden = groupVisible === 0;
    visible += groupVisible;
  }

  const results = document.getElementById("modblur-search-results");
  if (results) {
    results.textContent = query || activeModBlurFilter !== "all"
      ? `${visible} matching modifications`
      : "";
  }
  const empty = document.getElementById("modblur-empty");
  if (empty) {
    empty.hidden = visible !== 0;
  }
}

function updateModBlurSummary() {
  updateModBlurDependencies();
  const controls = [...document.querySelectorAll("[data-mod-control]")];
  const customizedPrefs = new Set();
  for (const control of controls) {
    const mapping = PREF_MAP[control.id];
    const customized = Boolean(mapping && isPrefCustomized(mapping.pref, mapping.type));
    control.closest(".mod-row")?.classList.toggle("is-customized", customized);
    if (customized) {
      customizedPrefs.add(mapping.pref);
    }
  }
  const customized = customizedPrefs.size;
  const count = document.getElementById("modblur-enabled-count");
  if (count) {
    count.textContent = customized === 1 ? "1 customized" : `${customized} customized`;
  }
  updateModBlurPreview();
}

function isPrefCustomized(pref, type) {
  const effective = readPref(pref, type);
  const defaults = Services.prefs.getDefaultBranch("");
  let defaultValue;
  try {
    switch (type) {
      case "bool":
        defaultValue = defaults.getBoolPref(pref);
        break;
      case "int":
        defaultValue = defaults.getIntPref(pref);
        break;
      case "string":
        defaultValue = defaults.getStringPref(pref);
        break;
    }
  } catch {
    return Services.prefs.prefHasUserValue(pref);
  }
  return effective !== defaultValue;
}

function setModBlurStatus(message, kind = "success") {
  const status = document.getElementById("modblur-status");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.dataset.kind = kind;
  status.hidden = !message;
}

function readTypedPref(pref, type) {
  switch (type) {
    case Services.prefs.PREF_BOOL:
      return Services.prefs.getBoolPref(pref);
    case Services.prefs.PREF_INT:
      return Services.prefs.getIntPref(pref);
    case Services.prefs.PREF_STRING:
      return Services.prefs.getStringPref(pref);
  }
  return undefined;
}

function restoreTypedPref(pref, type, value) {
  switch (type) {
    case Services.prefs.PREF_BOOL:
      Services.prefs.setBoolPref(pref, value);
      break;
    case Services.prefs.PREF_INT:
      Services.prefs.setIntPref(pref, value);
      break;
    case Services.prefs.PREF_STRING:
      Services.prefs.setStringPref(pref, value);
      break;
  }
}

function syncModBlurControl(pref) {
  for (const [id, mapping] of Object.entries(PREF_MAP)) {
    if (mapping.pref !== pref) {
      continue;
    }
    const control = document.getElementById(id);
    const value = readPref(mapping.pref, mapping.type);
    if (!control || value === undefined) {
      continue;
    }
    if (control.type === "checkbox") {
      control.checked = !!value;
    } else {
      control.value = String(value);
    }
  }
}

function initModBlurCatalog() {
  const controls = [...document.querySelectorAll("[data-mod-control]")];
  const observedPrefs = new Set([
    ...MODBLUR_PREFS,
    "midori.verticaltabs.enabled",
    "midori.arcmode.enabled",
  ]);
  const search = document.getElementById("modblur-search");
  const resetButton = document.getElementById("modblur-reset");
  const undoButton = document.getElementById("modblur-undo");
  const resetPrefs = [...new Set([...MODBLUR_PREFS, ...LEGACY_MODBLUR_PREFS])];

  for (const control of controls) {
    control.addEventListener("change", () => {
      updateModBlurSummary();
      const title = control.closest(".mod-row")?.querySelector(".mod-title")?.textContent?.trim();
      setModBlurStatus(`${title || "Modification"} saved. The change applies immediately.`);
    });
  }

  search?.addEventListener("input", updateModBlurVisibility);
  for (const filter of document.querySelectorAll("[data-mod-filter]")) {
    filter.addEventListener("click", () => {
      activeModBlurFilter = filter.dataset.modFilter || "all";
      for (const candidate of document.querySelectorAll("[data-mod-filter]")) {
        const selected = candidate === filter;
        candidate.classList.toggle("is-selected", selected);
        candidate.setAttribute("aria-pressed", String(selected));
      }
      updateModBlurVisibility();
    });
  }

  resetButton?.addEventListener("click", () => {
    modBlurUndoSnapshot = resetPrefs
      .filter(pref => Services.prefs.prefHasUserValue(pref))
      .map(pref => {
        const type = Services.prefs.getPrefType(pref);
        return { pref, type, value: readTypedPref(pref, type) };
      });
    for (const pref of resetPrefs) {
      if (Services.prefs.prefHasUserValue(pref)) {
        Services.prefs.clearUserPref(pref);
      }
      syncModBlurControl(pref);
    }
    updateModBlurSummary();
    if (undoButton) {
      undoButton.hidden = modBlurUndoSnapshot.length === 0;
    }
    setModBlurStatus("Visual modifications restored to Midori defaults.");
  });

  undoButton?.addEventListener("click", () => {
    for (const pref of resetPrefs) {
      if (Services.prefs.prefHasUserValue(pref)) {
        Services.prefs.clearUserPref(pref);
      }
    }
    for (const { pref, type, value } of modBlurUndoSnapshot || []) {
      restoreTypedPref(pref, type, value);
      syncModBlurControl(pref);
    }
    modBlurUndoSnapshot = null;
    undoButton.hidden = true;
    updateModBlurSummary();
    setModBlurStatus("Previous visual modification settings restored.");
  });

  const observer = {
    observe(_subject, _topic, pref) {
      syncModBlurControl(pref);
      updateModBlurSummary();
    },
  };
  for (const pref of observedPrefs) {
    Services.prefs.addObserver(pref, observer);
  }
  window.addEventListener("unload", () => {
    for (const pref of observedPrefs) {
      try {
        Services.prefs.removeObserver(pref, observer);
      } catch {}
    }
  }, { once: true });

  updateModBlurSummary();
  updateModBlurVisibility();
}

// ---- Tab layout ----
function getTabLayout() {
  if (
    readPref("midori.arcmode.enabled", "bool") ||
    readPref("midori.verticaltabs.enabled", "bool")
  ) {
    return "arc-zen";
  }
  const hPos = readPref("midori.horizontaltabs.position", "string") || "top";
  return hPos === "bottom" ? "horizontal-bottom" : "horizontal-top";
}

function setTabLayout(layout) {
  const arc = layout === "arc-zen";
  Services.prefs.setBoolPref("midori.arcmode.enabled", arc);
  Services.prefs.setBoolPref("midori.verticaltabs.enabled", arc);
  if (arc) {
    Services.prefs.setCharPref("midori.verticaltabs.position", "left");
    Services.prefs.setIntPref("midori.verticaltabs.width", 220);
    Services.prefs.setCharPref("midori.verticaltabs.density", "normal");
    Services.prefs.setBoolPref("midori.verticaltabs.floatingUrlbar", true);
    Services.prefs.setBoolPref("midori.verticaltabs.showRail", true);
    Services.prefs.setBoolPref("midori.verticaltabs.showPinnedSection", true);
    Services.prefs.setBoolPref("midori.autohide.toolbar", true);
  } else {
    Services.prefs.setCharPref(
      "midori.horizontaltabs.position",
      layout === "horizontal-bottom" ? "bottom" : "top"
    );
  }
}

function initTabLayout() {
  const grid = document.getElementById("tabLayoutGrid");
  if (!grid) return;
  const current = getTabLayout();

  const selectLayoutCard = layout => {
    grid.querySelectorAll(".layout-card").forEach(card => {
      card.classList.toggle("selected", card.dataset.layout === layout);
    });
  };

  selectLayoutCard(current);
  for (const card of grid.querySelectorAll(".layout-card")) {
    card.addEventListener("click", () => {
      const layout = card.dataset.layout;
      selectLayoutCard(layout);
      setTabLayout(layout);
    });
  }
}

function setTabProtectionStatus(message, error = false) {
  const status = document.getElementById("tabprotect-status");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("form-status-error", error);
}

function updateTabProtectionControls() {
  const api = getTabProtectionApi();
  const configured = api?.hasGlobalPassword?.() || false;
  const globalStatus = document.getElementById("tabprotect-global-password-status");
  const button = document.getElementById("tabprotect-set-global-password");
  if (globalStatus) {
    globalStatus.textContent = configured
      ? "A global password is configured. Changing it updates every tab that uses it."
      : "No global password is configured.";
  }
  if (button) {
    button.textContent = configured ? "Change password" : "Set password";
  }
}

function initTabProtectionControls() {
  const api = getTabProtectionApi();
  const setPasswordButton = document.getElementById("tabprotect-set-global-password");
  const resetButton = document.getElementById("tabprotect-reset");
  if (!api || (!setPasswordButton && !resetButton)) {
    return;
  }

  setPasswordButton?.addEventListener("click", async () => {
    const first = { value: "" };
    if (!Services.prompt.promptPassword(window, "Set global tab password", "Enter a password with at least 8 characters.", first, null, {})) {
      return;
    }
    const confirmation = { value: "" };
    if (!Services.prompt.promptPassword(window, "Confirm global tab password", "Enter the password again to confirm it.", confirmation, null, {})) {
      return;
    }
    if (first.value !== confirmation.value) {
      setTabProtectionStatus("The passwords do not match.", true);
      return;
    }
    setPasswordButton.disabled = true;
    setTabProtectionStatus("Securing the global password…");
    let saved = false;
    try {
      saved = await api.setGlobalPassword(first.value);
    } catch {
      setTabProtectionStatus("Could not save the global password.", true);
      return;
    } finally {
      setPasswordButton.disabled = false;
    }
    if (!saved) {
      setTabProtectionStatus("Choose a password with at least 8 characters.", true);
      return;
    }
    updateTabProtectionControls();
    setTabProtectionStatus("Global tab password saved.");
  });

  resetButton?.addEventListener("click", () => {
    const confirmed = Services.prompt.confirm(
      window,
      "Reset tab protection",
      "This permanently closes every protected tab, removes protected recently closed entries, and deletes all tab passwords. Continue?"
    );
    if (!confirmed) {
      return;
    }
    const closedTabs = api.resetAllProtection();
    updateTabProtectionControls();
    setTabProtectionStatus(
      closedTabs
        ? `${closedTabs} protected tab${closedTabs === 1 ? " was" : "s were"} closed and protection was reset.`
        : "Tab protection was reset."
    );
  });

  const observer = {
    observe() {
      updateTabProtectionControls();
    },
  };
  Services.prefs.addObserver("midori.tabprotect.globalPasswordHash", observer);
  window.addEventListener("unload", () => {
    try {
      Services.prefs.removeObserver("midori.tabprotect.globalPasswordHash", observer);
    } catch {}
  }, { once: true });
  updateTabProtectionControls();
}

// ---- Navigation ----
function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const pages = document.querySelectorAll(".page");
  const validPages = new Set([...navItems].map(item => item.dataset.page));

  function navigateTo(pageId, { updateHistory = true } = {}) {
    const targetPage = validPages.has(pageId) ? pageId : "home";
    navItems.forEach(n => {
      const active = n.dataset.page === targetPage;
      n.classList.toggle("active", active);
      if (active) {
        n.setAttribute("aria-current", "page");
      } else {
        n.removeAttribute("aria-current");
      }
    });
    pages.forEach(p => {
      const isTarget = p.id === `page-${targetPage}`;
      p.classList.toggle("active", isTarget);
      p.hidden = !isTarget;
    });
    document.title = `${document.querySelector(`#page-${targetPage} .page-title`)?.textContent || "Midori Center"} — Midori Center`;
    if (updateHistory && window.location.hash !== `#${targetPage}`) {
      window.history.pushState(null, "", `#${targetPage}`);
    }
    if (targetPage === "webapps") {
      ensureWebAppsInitialized();
    }
    document.getElementById("center-content")?.scrollTo({ top: 0 });
    if (updateHistory) {
      const heading = document.querySelector(`#page-${targetPage} .page-title`);
      if (heading) {
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
  }

  navItems.forEach(btn => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.page));
  });

  // Overview cards navigate too
  document.querySelectorAll(".overview-card[data-navigate]").forEach(card => {
    card.addEventListener("click", () => navigateTo(card.dataset.navigate));
  });

  window.addEventListener("hashchange", () => {
    navigateTo(window.location.hash.slice(1), { updateHistory: false });
  });
  navigateTo(window.location.hash.slice(1), { updateHistory: false });
}

// ---- Version info ----
function initVersionInfo() {
  try {
    const appInfo = Cc["@mozilla.org/xre/app-info;1"]?.getService(Ci.nsIXULAppInfo);
    const platformVersion = Services.prefs.getStringPref("extensions.lastPlatformVersion", "");
    const version = appInfo?.version || "—";
    const name = appInfo?.name || "Midori";

    const sidebarVer = document.getElementById("sidebar-version");
    const sidebarEng = document.getElementById("sidebar-engine");
    const homeDetail = document.getElementById("home-version-detail");

    if (sidebarVer) sidebarVer.textContent = `${name} ${version}`;
    if (sidebarEng) sidebarEng.textContent = `Gecko ${platformVersion || appInfo?.platformVersion || ""}`;
    if (homeDetail) homeDetail.textContent = `v${version} · Gecko ${platformVersion || appInfo?.platformVersion || ""}`;
  } catch {}
}

// ---- Boot ----
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  migrateLegacyModBlurPrefs();
  initPrefs();
  initSidebarControls();
  initModBlurCatalog();
  initAddonControls();
  initTabLayout();
  initTabProtectionControls();
  initVersionInfo();
  initWorkspaceManager();
  initShortcutManager();
});
