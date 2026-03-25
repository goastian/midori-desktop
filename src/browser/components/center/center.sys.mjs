/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Midori Center — Settings hub logic.
 * Reads/writes browser prefs and drives the navigation UI.
 */

/* globals Services, Cc, Ci */

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

// ---- Read a pref by type ----
function readPref(prefName, type) {
  try {
    switch (type) {
      case "bool":   return Services.prefs.getBoolPref(prefName);
      case "int":    return Services.prefs.getIntPref(prefName);
      case "string": return Services.prefs.getStringPref(prefName);
    }
  } catch (_) {}
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
  } catch (_) {}
}

// ---- Boot ----
document.addEventListener("DOMContentLoaded", () => {
  initNavigation();
  initPrefs();
  initTabLayout();
  initVersionInfo();
});
