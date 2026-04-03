/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Midori Center — Settings hub logic.
 * Reads/writes browser prefs and drives the navigation UI.
 */

const WORKSPACE_CHANGE_TOPIC = "midori-workspaces-updated";
const WORKSPACES_MODULE_URL = "resource:///modules/MidoriWorkspaces.sys.mjs";

// ---- Pref mapping: element ID → { pref, type } ----
const PREF_MAP = {
  "pref-autohide-toolbar":  { pref: "midori.autohide.toolbar",        type: "bool" },
  "pref-gradient-enabled":  { pref: "midori.gradient.enabled",        type: "bool" },
  "pref-msidebar-enabled":  { pref: "midori.msidebar.enabled",        type: "bool" },
  "pref-msidebar-position": { pref: "midori.msidebar.position",       type: "string" },
  "pref-msidebar-width":    { pref: "midori.msidebar.width",          type: "int" },
  "pref-msidebar-autohide": { pref: "midori.msidebar.autohide.enabled", type: "bool" },
  "pref-workspaces-enabled":{ pref: "midori.workspaces.enabled",      type: "bool" },
  "pref-workspaces-button": { pref: "midori.workspaces.show-button",  type: "bool" },
};

const FALLBACK_WORKSPACE_ICONS = [
  { id: "default", emoji: "🏠" },
  { id: "work", emoji: "💼" },
  { id: "personal", emoji: "👤" },
  { id: "shopping", emoji: "🛒" },
  { id: "social", emoji: "💬" },
  { id: "dev", emoji: "💻" },
  { id: "research", emoji: "🔬" },
  { id: "music", emoji: "🎵" },
  { id: "gaming", emoji: "🎮" },
  { id: "finance", emoji: "💰" },
  { id: "travel", emoji: "✈️" },
  { id: "education", emoji: "📚" },
  { id: "health", emoji: "❤️" },
  { id: "news", emoji: "📰" },
  { id: "creative", emoji: "🎨" },
  { id: "star", emoji: "⭐" },
];

const workspaceUI = {
  panel: null,
  count: null,
  createName: null,
  createIcon: null,
  createBtn: null,
  list: null,
  empty: null,
  status: null,
};

let workspaceApi = null;
let workspaceObserver = null;

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

function populateIconSelect(selectEl, icons, selectedIcon) {
  if (!selectEl) return;

  while (selectEl.firstChild) {
    selectEl.firstChild.remove();
  }

  for (const icon of icons) {
    const option = document.createElement("option");
    option.value = icon.id;
    option.textContent = `${icon.emoji} ${icon.id}`;
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

  if (!workspaces.length) {
    workspaceUI.empty.hidden = false;
    workspaceUI.empty.textContent = "No workspaces available.";
    return;
  }

  workspaceUI.empty.hidden = true;

  for (let index = 0; index < workspaces.length; index++) {
    const ws = workspaces[index];
    const row = document.createElement("article");
    row.className = "workspace-item";

    const top = document.createElement("div");
    top.className = "workspace-item-top";

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
    } else if (el.tagName === "SELECT") {
      el.value = String(val);
      el.addEventListener("change", () => writePref(pref, type, el.value));
    } else if (el.type === "number") {
      el.value = val;
      el.addEventListener("change", () => writePref(pref, type, parseInt(el.value, 10)));
    }
  }
}

// ---- Tab layout ----
function getTabLayout() {
  const vertEnabled = readPref("midori.verticaltabs.enabled", "bool");
  if (vertEnabled) {
    const pos = readPref("midori.verticaltabs.position", "string") || "left";
    return pos === "right" ? "vertical-right" : "vertical-left";
  }
  const hPos = readPref("midori.horizontaltabs.position", "string") || "top";
  return hPos === "bottom" ? "horizontal-bottom" : "horizontal-top";
}

function setTabLayout(layout) {
  const vertical = layout === "vertical-left" || layout === "vertical-right";
  Services.prefs.setBoolPref("midori.verticaltabs.enabled", vertical);
  if (vertical) {
    Services.prefs.setCharPref(
      "midori.verticaltabs.position",
      layout === "vertical-right" ? "right" : "left"
    );
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

  for (const card of grid.querySelectorAll(".layout-card")) {
    card.classList.toggle("selected", card.dataset.layout === current);
    card.addEventListener("click", () => {
      grid.querySelectorAll(".layout-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      setTabLayout(card.dataset.layout);
    });
  }
}

// ---- Navigation ----
function initNavigation() {
  const navItems = document.querySelectorAll(".nav-item");
  const pages = document.querySelectorAll(".page");

  function navigateTo(pageId) {
    navItems.forEach(n => n.classList.toggle("active", n.dataset.page === pageId));
    pages.forEach(p => {
      const isTarget = p.id === `page-${pageId}`;
      p.classList.toggle("active", isTarget);
    });
  }

  navItems.forEach(btn => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.page));
  });

  // Overview cards navigate too
  document.querySelectorAll(".overview-card[data-navigate]").forEach(card => {
    card.addEventListener("click", () => navigateTo(card.dataset.navigate));
  });
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
    if (sidebarEng) sidebarEng.textContent = `Firefox ${platformVersion || appInfo?.platformVersion || ""}`;
    if (homeDetail) homeDetail.textContent = `v${version} · Firefox ${platformVersion || appInfo?.platformVersion || ""}`;
  } catch {}
}

// ---- Boot ----
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initPrefs();
  initTabLayout();
  initVersionInfo();
  initWorkspaceManager();
});
