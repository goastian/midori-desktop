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
const ADDON_MANAGER_MODULE_URL = "resource://gre/modules/AddonManager.sys.mjs";

const ADDON_IDS = {
  privacy: "midori-protection@astian.org",
  vpn: "midorivpn@astian.org",
};

// ---- Pref mapping: element ID → { pref, type } ----
const PREF_MAP = {
  "pref-autohide-toolbar":  { pref: "midori.autohide.toolbar",        type: "bool" },
  "pref-tabsleep-enabled":  { pref: "midori.tabsleep.enabled",        type: "bool" },
  "pref-tabsleep-timeout":  { pref: "midori.tabsleep.timeoutMinutes", type: "int" },
  "pref-msidebar-enabled":  { pref: "midori.msidebar.enabled",        type: "bool" },
  "pref-msidebar-position": { pref: "midori.msidebar.position",       type: "string" },
  "pref-msidebar-width":    { pref: "midori.msidebar.width",          type: "int" },
  "pref-msidebar-autohide": { pref: "midori.msidebar.autohide.enabled", type: "bool" },
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
  "pref-modblur-privacy-blur": { pref: "midori.modblur.privacy.blurIdentity", type: "bool" },
  "pref-modblur-privacy-tabs": { pref: "midori.modblur.privacy.blurTabs", type: "bool" },
  "pref-modblur-extension-style": { pref: "midori.modblur.extensions.style", type: "string" },
  "pref-modblur-extension-columns": { pref: "midori.modblur.extensions.columns", type: "int" },
  "pref-modblur-extension-icon-size": { pref: "midori.modblur.extensions.iconSize", type: "int" },
  "pref-modblur-extension-hide-manage": { pref: "midori.modblur.extensions.hideManageButton", type: "bool" },
  "pref-modblur-extension-hide-separator": { pref: "midori.modblur.extensions.hideSeparator", type: "bool" },
  "pref-modblur-extension-hide-faded": { pref: "midori.modblur.extensions.hideFaded", type: "bool" },
  "pref-modblur-icons-menu": { pref: "midori.modblur.icons.mainMenu", type: "bool" },
  "pref-modblur-icons-tabs-overview": { pref: "midori.modblur.icons.tabsOverview", type: "bool" },
  "pref-modblur-icons-midori-menu": { pref: "midori.modblur.icons.midoriMenu", type: "bool" },
  "pref-modblur-icons-github": { pref: "midori.modblur.icons.github", type: "bool" },
  "pref-modblur-icons-ublock": { pref: "midori.modblur.icons.ublock", type: "bool" },
  "pref-modblur-compact-vertical": { pref: "midori.modblur.verticalTabs.compact", type: "bool" },
  "pref-modblur-centered-tabs": { pref: "midori.modblur.tabs.centered", type: "bool" },
  "pref-modblur-hide-tab-preview": { pref: "midori.modblur.tabs.hidePreviewPanel", type: "bool" },
  "pref-modblur-hide-vertical-scrollbar": { pref: "midori.modblur.verticalTabs.hideScrollbar", type: "bool" },
  "pref-modblur-search-outline": { pref: "midori.modblur.search.focusOutline", type: "bool" },
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
  "pref-modblur-spill-theme": { pref: "midori.modblur.theme.spill", type: "bool" },
  "pref-modblur-card-theme": { pref: "midori.modblur.theme.cardStyle", type: "string" },
  "pref-modblur-soft-texture": { pref: "midori.modblur.theme.softTexture", type: "bool" },
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

const TAB_LAYOUT_PREF = "midori.modblur.tabs.layout";
const LEGACY_TABS_ON_TOP_PREF = "midori.modblur.tabs.onTop";

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

let workspaceApi = null;
let workspaceObserver = null;
let shortcutsApi = null;
let shortcutObserver = null;
let shortcutObservedPrefs = [];
let shortcutFlashPref = "";
let addonManagerApi = null;

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
}

function migrateLegacyTabLayoutPref() {
  const hasLayoutChoice = Services.prefs.prefHasUserValue(TAB_LAYOUT_PREF);
  const hasLegacyChoice = Services.prefs.prefHasUserValue(LEGACY_TABS_ON_TOP_PREF);

  if (!hasLayoutChoice && hasLegacyChoice) {
    const tabsOnTop = Services.prefs.getBoolPref(LEGACY_TABS_ON_TOP_PREF, false);
    Services.prefs.setStringPref(TAB_LAYOUT_PREF, tabsOnTop ? "tabs-top" : "urlbar-top");
  }

  if (hasLegacyChoice) {
    Services.prefs.clearUserPref(LEGACY_TABS_ON_TOP_PREF);
  }
}

function getBrowserWindow() {
  return Services.wm.getMostRecentWindow("navigator:browser");
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
      const ok = window.confirm(
        `Delete workspace "${ws.name}"?\n\nTabs from this workspace will be moved to the default workspace.`
      );
      if (!ok) {
        return;
      }
      const deleted = await api.deleteWorkspace(win, ws.id);
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
    setShortcutStatus(`Press a shortcut for ${definition.title}, then press Esc to save it.`);
  });

  input.addEventListener("blur", () => {
    syncShortcutFieldValue(input, definition);
    clearShortcutStatus();
  });

  const hint = document.createElement("div");
  hint.className = "shortcut-hint";
  hint.textContent = "Click field, press shortcut, then Esc to save.";

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
      const pendingShortcut = input.dataset.pendingShortcut;
      if (pendingShortcut === undefined) {
        input.blur();
        return;
      }

      const conflictDef = findShortcutConflict(definitions, definition.pref, pendingShortcut);
      if (conflictDef) {
        input.classList.add("shortcut-field-error");
        conflict.hidden = false;
        conflict.textContent = `Conflict with ${conflictDef.title}. Choose another shortcut or clear the other action first.`;
        setShortcutStatus(`Shortcut conflict: ${conflictDef.title} already uses ${pendingShortcut}.`, true);
        return;
      }

      api?.setShortcutValue?.(definition.pref, pendingShortcut);
      shortcutFlashPref = definition.pref;
      setShortcutStatus(`${definition.title} shortcut saved.`);
      await refreshShortcutManager();
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

    const conflictDef = findShortcutConflict(definitions, definition.pref, captured);
    if (conflictDef) {
      conflict.hidden = false;
      conflict.textContent = `Conflict with ${conflictDef.title}. Press Esc to keep editing.`;
      input.classList.add("shortcut-field-error");
      setShortcutStatus(`Conflict with ${conflictDef.title}.`, true);
    } else {
      conflict.hidden = true;
      conflict.textContent = "";
      setShortcutStatus(`Ready to save ${captured}. Press Esc to confirm.`);
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
    if (val === undefined) continue;

    if (el.type === "checkbox") {
      el.checked = !!val;
      el.addEventListener("change", () => writePref(pref, type, el.checked));
    } else if (el.type === "range") {
      el.value = String(val);
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
      el.value = String(val);
      el.addEventListener("change", () => writePref(pref, type, el.value));
    } else if (el.tagName === "FIELDSET") {
      const radios = [...el.querySelectorAll("input[type=radio]")];
      if (!radios.length) {
        continue;
      }
      const current = String(val);
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
      el.value = val;
      el.addEventListener("change", () => {
        const min = Number.isFinite(el.minAsNumber) ? el.minAsNumber : Number.MIN_SAFE_INTEGER;
        const max = Number.isFinite(el.maxAsNumber) ? el.maxAsNumber : Number.MAX_SAFE_INTEGER;
        const next = Math.min(max, Math.max(min, parseInt(el.value, 10)));
        el.value = String(next);
        writePref(pref, type, next);
      });
    } else if (el.type === "color") {
      el.value = String(val);
      el.addEventListener("change", () => writePref(pref, type, el.value));
    }
  }
}

function isModControlEnabled(control) {
  if (!control || control.disabled) {
    return false;
  }
  if (control.type === "checkbox") {
    return control.checked;
  }
  if (control.type === "number") {
    return Number(control.value) > 0;
  }
  return !["", "off", "none", "system"].includes(String(control.value));
}

function setModControlAvailability(control, available, reason = "") {
  if (!control) {
    return;
  }
  control.disabled = !available;
  const row = control.closest(".mod-row");
  row?.classList.toggle("is-unavailable", !available);
  if (!available && reason) {
    row?.setAttribute("data-unavailable-reason", reason);
  } else {
    row?.removeAttribute("data-unavailable-reason");
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
  for (const id of ["pref-modblur-panel-blur", "pref-modblur-search-blur", "pref-modblur-vertical-expand-blur"]) {
    setModControlAvailability(
      document.getElementById(id),
      !combinedBlur,
      "Combined extra blur already includes this effect."
    );
  }
}

function updateModBlurSummary() {
  updateModBlurDependencies();
  const controls = [...document.querySelectorAll("[data-mod-control]")];
  const enabled = controls.filter(isModControlEnabled).length;
  const count = document.getElementById("modblur-enabled-count");
  if (count) {
    count.textContent = `${enabled} of ${controls.length} active`;
  }

  for (const control of controls) {
    control.closest(".mod-row")?.classList.toggle("is-active", isModControlEnabled(control));
  }
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
  const search = document.getElementById("modblur-search");
  const resetButton = document.getElementById("modblur-reset");
  const undoButton = document.getElementById("modblur-undo");

  for (const control of controls) {
    control.addEventListener("change", () => {
      updateModBlurSummary();
      const title = control.closest(".mod-row")?.querySelector(".mod-title")?.textContent?.trim();
      setModBlurStatus(`${title || "Modification"} saved. The change applies immediately.`);
    });
  }

  search?.addEventListener("input", () => {
    const query = search.value.trim().toLocaleLowerCase();
    for (const row of document.querySelectorAll(".mod-row")) {
      const haystack = `${row.dataset.search || ""} ${row.textContent || ""}`.toLocaleLowerCase();
      row.hidden = !!query && !haystack.includes(query);
    }
    for (const group of document.querySelectorAll(".visual-mods-group")) {
      group.hidden = !group.querySelector(".mod-row:not([hidden])");
    }
    const visible = document.querySelectorAll(".mod-row:not([hidden])").length;
    const results = document.getElementById("modblur-search-results");
    if (results) {
      results.textContent = query ? `${visible} matching modifications` : "";
    }
  });

  resetButton?.addEventListener("click", () => {
    modBlurUndoSnapshot = MODBLUR_PREFS
      .filter(pref => Services.prefs.prefHasUserValue(pref))
      .map(pref => {
        const type = Services.prefs.getPrefType(pref);
        return { pref, type, value: readTypedPref(pref, type) };
      });
    for (const pref of MODBLUR_PREFS) {
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
  for (const pref of MODBLUR_PREFS) {
    Services.prefs.addObserver(pref, observer);
  }
  window.addEventListener("unload", () => {
    for (const pref of MODBLUR_PREFS) {
      try {
        Services.prefs.removeObserver(pref, observer);
      } catch {}
    }
  }, { once: true });

  updateModBlurSummary();
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
    Services.prefs.setBoolPref("midori.msidebar.enabled", true);
    Services.prefs.setCharPref("midori.msidebar.position", "right");
    Services.prefs.setBoolPref("midori.msidebar.autohide.enabled", true);
    Services.prefs.setCharPref("midori.msidebar.autohide.mode", "overlay");
    Services.prefs.setBoolPref("midori.autohide.toolbar", true);
    const posSelect = document.getElementById("pref-msidebar-position");
    if (posSelect) posSelect.value = "right";
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
    document.getElementById("center-content")?.scrollTo({ top: 0 });
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
  migrateLegacyTabLayoutPref();
  initPrefs();
  initModBlurCatalog();
  initAddonControls();
  initTabLayout();
  initVersionInfo();
  initWorkspaceManager();
  initShortcutManager();
});
