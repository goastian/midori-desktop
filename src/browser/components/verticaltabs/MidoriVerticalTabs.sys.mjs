/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * MidoriVerticalTabs — Natsumi-inspired modern UI system for Midori Browser.
 *
 * When enabled (vertical mode), this module:
 *   1. Activates Firefox 148's native sidebar.verticalTabs
 *   2. Injects Natsumi-inspired CSS: floating URL bar, rounded content area,
 *      modern findbar, enhanced PiP, improved tab styling
 *   3. Configures the sidebar for optimal vertical-tab UX
 *
 * When disabled (horizontal mode), standard horizontal tabs are used with
 * light visual refinements (rounded buttons, smooth transitions).
 *
 * Inspired by Natsumi Browser (github.com/greeeen-dev/natsumi-browser)
 * and ArcWTF (github.com/KiKaraage/ArcWTF), adapted for Firefox 148.
 *
 * Preferences:
 *   - midori.verticaltabs.enabled  (bool, default: false)
 *
 * @patch Midori Browser
 */

const PREF_ENABLED = "midori.verticaltabs.enabled";
const STYLE_ID = "midori-verticaltabs-style";

export const MidoriVerticalTabs = {
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    Services.prefs.addObserver(PREF_ENABLED, this);
    Services.obs.addObserver(this, "browser-delayed-startup-finished");

    this._syncFirefoxPrefs();
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (win.document.readyState === "complete") {
        this._applyToWindow(win);
      }
    }

    console.log(
      `MidoriVerticalTabs: Initialized (enabled=${this.isEnabled()})`
    );
  },

  isEnabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, false);
  },

  setEnabled(enabled) {
    Services.prefs.setBoolPref(PREF_ENABLED, !!enabled);
  },

  // =========================================================================
  // Observer
  // =========================================================================

  observe(subject, topic, data) {
    if (topic === "nsPref:changed" && data === PREF_ENABLED) {
      this._syncFirefoxPrefs();
      this._refreshAllWindows();
    } else if (topic === "browser-delayed-startup-finished") {
      this._applyToWindow(subject);
    }
  },

  // =========================================================================
  // Firefox pref sync
  // =========================================================================

  _syncFirefoxPrefs() {
    const enabled = this.isEnabled();
    Services.prefs.setBoolPref("sidebar.verticalTabs", enabled);
    Services.prefs.setBoolPref("sidebar.revamp", enabled);
    if (enabled) {
      Services.prefs.setCharPref("sidebar.visibility", "always-show");
      Services.prefs.setBoolPref("sidebar.position_start", true);
    }
  },

  // =========================================================================
  // Per-window
  // =========================================================================

  _applyToWindow(win) {
    if (!win || !win.document) return;
    const doc = win.document;
    const existing = doc.getElementById(STYLE_ID);
    if (existing) existing.remove();

    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = this.isEnabled()
      ? this._buildVerticalCSS()
      : this._buildBaseCSS();
    doc.documentElement.appendChild(style);
  },

  _refreshAllWindows() {
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (win.document.readyState === "complete") {
        this._applyToWindow(win);
      }
    }
  },

  // =========================================================================
  // CSS — Base enhancements (always applied, horizontal mode)
  // =========================================================================

  _buildBaseCSS() {
    return `
/* =====================================================================
   MIDORI BASE — Light visual refinements for horizontal mode
   Inspired by Natsumi Browser
   ===================================================================== */

/* --- Animations --- */
@keyframes midori-floating-urlbar-appear {
  0% { scale: 0.95; opacity: 0.5; }
  100% { scale: 1; opacity: 1; }
}

@keyframes midori-findbar-appear {
  from { top: 0; opacity: 0; filter: blur(5px); }
  to { top: 20px; opacity: 1; filter: blur(0); }
}

@keyframes midori-dialog-popup {
  0% { translate: 0 15px; opacity: 0; }
  100% { translate: 0; opacity: 1; }
}

/* --- Rounder toolbar buttons --- */
toolbar .toolbarbutton-1 {
  & > .toolbarbutton-icon,
  & > .toolbarbutton-badge-stack {
    border-radius: 10px !important;
    transition: background-color 0.2s ease, box-shadow 0.2s ease !important;
  }
}

/* --- Smooth button hovers --- */
.toolbarbutton-1:hover > .toolbarbutton-icon {
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.08) !important;
}

/* --- Better unloaded tabs indicator --- */
.tabbrowser-tab[pending="true"] {
  .tab-icon-stack { opacity: 0.4; }
  .tab-label-container { opacity: 0.7; }
}

/* --- Tab loading burst color --- */
.tab-loading-burst {
  --tab-loading-fill: light-dark(
    var(--focus-outline-color, AccentColor),
    color-mix(in srgb, var(--focus-outline-color, AccentColor) 80%, white)
  ) !important;
}

/* --- Remove tab outline --- */
.tab-background { outline: none !important; }

/* --- URL bar page actions: rounder --- */
.urlbar-page-action, .urlbar-revert-button {
  border-radius: 14px !important;
  width: 26px !important;
  height: 26px !important;
  padding: 5px !important;
  transition: background-color 0.2s ease, box-shadow 0.2s ease !important;
}

.urlbar-page-action:hover, .urlbar-revert-button:hover {
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.12) !important;
}

/* --- Floating findbar (Natsumi-style) --- */
.browserContainer > findbar {
  display: flex !important;
  position: absolute !important;
  top: 20px;
  width: min(550px, 90%) !important;
  right: 20px !important;
  left: auto !important;
  min-height: 70px;
  height: auto !important;
  flex-wrap: wrap;
  border-radius: 15px !important;
  background: color-mix(in srgb, var(--toolbar-bgcolor) 85%, transparent) !important;
  backdrop-filter: blur(12px) saturate(1.2) !important;
  -webkit-backdrop-filter: blur(12px) saturate(1.2) !important;
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent) !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  animation: midori-findbar-appear 0.2s ease !important;
  z-index: 10;
  transition: opacity 0.2s ease, top 0.2s ease, filter 0.2s ease !important;
}

.browserContainer > findbar[hidden] {
  opacity: 0 !important;
  top: 0 !important;
  pointer-events: none !important;
  filter: blur(5px);
}

.browserContainer > findbar .findbar-textbox {
  border-radius: 8px !important;
}

/* --- Status panel pill (Natsumi-style) --- */
#statuspanel {
  max-width: calc(100% - 20px) !important;
  margin: 10px !important;
}

#statuspanel-label {
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent) !important;
  border-radius: 13px !important;
  background-color: color-mix(in srgb, var(--toolbar-bgcolor) 90%, transparent) !important;
  backdrop-filter: blur(8px) saturate(1.1) !important;
  -webkit-backdrop-filter: blur(8px) saturate(1.1) !important;
  padding: 2px 12px !important;
}

/* --- Dialog popups animation --- */
.dialogStack .dialogBox {
  animation: midori-dialog-popup 0.3s ease !important;
}
`;
  },

  // =========================================================================
  // CSS — Vertical tabs mode (Natsumi + Arc inspired)
  // =========================================================================

  _buildVerticalCSS() {
    return this._buildBaseCSS() + `

/* =====================================================================
   MIDORI VERTICAL TABS — Natsumi + Arc-inspired layout
   ===================================================================== */

/* --- Natsumi-style content area separation --- */
:root:not([inDOMFullscreen="true"]):not([customizing]) {
  #tabbrowser-tabbox {
    margin-right: 6px !important;
    margin-bottom: 6px !important;

    .browserSidebarContainer {
      border: 1px solid color-mix(in srgb, currentColor 8%, transparent) !important;
      border-radius: 10px !important;
      overflow: hidden;
    }
  }
}

/* --- Hide vertical spacer --- */
#vertical-spacer { display: none !important; }

/* --- Navbar refinements --- */
#PanelUI-button { order: -1 !important; }

#PanelUI-menu-button {
  padding: 0 var(--toolbarbutton-outer-padding) 0
    var(--toolbar-start-end-padding) !important;
}

#nav-bar { border: none !important; }

#nav-bar-customization-target {
  & > :is(toolbarbutton, toolbaritem):first-child,
  & > toolbarpaletteitem:first-child > :is(toolbarbutton, toolbaritem) {
    padding-inline-start: 0 !important;
  }
}

/* Scale down toolbar buttons */
#nav-bar-customization-target .toolbarbutton-1,
.urlbar-go-button,
.search-go-button {
  scale: 0.92 !important;
  border-radius: 10px !important;
}

/* Hide unified extensions until hover */
#nav-bar:not([customizing]) #unified-extensions-button {
  opacity: 0 !important;
  transition: opacity 0.2s ease !important;
}
#nav-bar:not([customizing]) #unified-extensions-button:hover {
  opacity: 1 !important;
}

/* Hide private browsing label */
.private-browsing-indicator-label { display: none !important; }

/* --- Vertical tabs spacing & style --- */
#tabbrowser-tabs[orient="vertical"]:not([collapsed]) {
  grid-gap: var(--space-xsmall) !important;

  & .tabbrowser-tab {
    padding-block: 3px !important;
    &:nth-child(1 of :not([hidden], [pinned])) {
      padding-block-start: 3px !important;
    }
    &[pinned] { padding-block-start: 1px !important; }
  }

  & :not([pinned="true"]) .tab-background {
    margin-inline: calc(var(--tab-inner-inline-margin, 4px) - 2px) !important;
    margin-block: calc(var(--tab-block-margin, 2px) - 2px) !important;
    min-height: calc(var(--tab-min-height) + 3px) !important;
  }

  /* Selected tab accent glow (Natsumi Material-inspired) */
  & .tabbrowser-tab[selected] .tab-background,
  & .tabbrowser-tab[visuallyselected] .tab-background {
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.25),
      inset 0 0 0 1px color-mix(in srgb, var(--focus-outline-color, AccentColor) 12%, transparent) !important;
  }

  /* Unselected tabs — subtle border on hover */
  & .tabbrowser-tab:hover:not([selected]):not([visuallyselected]) .tab-background {
    box-shadow: 0 0 0 1px color-mix(in srgb, currentColor 6%, transparent) !important;
  }
}

/* Pinned tabs */
#vertical-pinned-tabs-container {
  #tabbrowser-tabs[expanded] > & {
    padding-inline: calc(
      var(--tab-pinned-container-margin-inline-expanded, 8px) - 1px
    ) !important;
    & .tab-background {
      margin-inline: calc(var(--space-xsmall, 4px) * 1.1) !important;
    }
  }
  .tab-background {
    min-height: calc(var(--tab-min-height) + 10px) !important;
  }
}

#tabbrowser-tabs[orient="vertical"]:not([expanded]) .tab-background {
  min-height: var(--tab-min-height) !important;
}

/* Fullscreen pinned-tab top padding */
#main-window[inFullscreen="true"] #vertical-pinned-tabs-container {
  #tabbrowser-tabs[expanded] > & { padding-block-start: 8px; }
}

/* Sidebar tools — horizontal row, show/hide on hover */
.tools-and-extensions[orientation="horizontal"] {
  display: flex !important;
  flex-wrap: initial !important;
  flex-direction: row !important;
  opacity: 0.4 !important;
}

/* Tab close button — scale down, only visible on row hover */
#tabbrowser-tabs[orient="vertical"] .tab-close-button {
  margin-inline-end: calc(-1 * var(--tab-close-button-padding, 6px) + 3px) !important;
  scale: 0.8;
  border-radius: 50% !important;
  transition: background-color 0.2s ease, opacity 0.2s ease !important;
  opacity: 0;
}

#tabbrowser-tabs[orient="vertical"] .tabbrowser-tab:hover .tab-close-button {
  opacity: 1;
}

#tabbrowser-tabs[orient="vertical"] .tabbrowser-tab[selected] .tab-close-button {
  opacity: 0.6;
}

#tabbrowser-tabs[orient="vertical"] .tabbrowser-tab[selected]:hover .tab-close-button {
  opacity: 1;
}

/* Hide separator below New Tab button */
#tabbrowser-tabs[orient="vertical"][overflow]::after {
  border-bottom: none !important;
  padding-bottom: calc(var(--toolbarbutton-border-radius, 4px) - 1px) !important;
}

/* Sidebar tools hover visibility */
.wrapper:hover {
  .tools-and-extensions:hover { opacity: 1 !important; }
  .tools-and-extensions[orientation="vertical"] {
    transition: 0.2s ease !important;
    display: flex !important;
    visibility: inherit !important;
    opacity: 0.4 !important;
    margin-top: -12px !important;
  }
  .tools-and-extensions[orientation="horizontal"] {
    overflow: scroll !important;
    scrollbar-width: thin;
    scrollbar-color: var(--lwt-accent-color) transparent;
    transition: 0.2s ease !important;
    margin-top: 0 !important;
    &:hover { opacity: 1 !important; }
  }
}

.wrapper .tools-and-extensions[orientation="vertical"] {
  visibility: collapse;
  opacity: 0 !important;
  margin-top: -12px !important;
}

/* --- Sidebar styling (Natsumi-inspired) --- */
#sidebar {
  border-radius: 10px !important;
  border: 0 solid transparent !important;
  outline: 0.01px solid var(--toolbar-bgcolor);
  box-shadow: var(--content-area-shadow, 0 1px 4px rgba(0,0,0,0.08)) !important;
  background-color: var(--toolbar-bgcolor) !important;
  transition: background-color 0.2s ease !important;
}

#sidebar-box {
  padding-inline-end: 0 !important;
  border: none !important;
  transition: background-color 0.2s ease !important;
}

/* Remove sidebar styling in fullscreen */
#main-window[inFullscreen="true"] {
  #sidebar-box { padding: 0 !important; }
  #sidebar { border-radius: 0 !important; }
}

/* --- Content area rounded corners --- */
#tabbrowser-tabpanels {
  border-radius: 10px !important;
}

/* --- URL bar — Natsumi-style (compact when idle, floating when active) --- */

#urlbar-container {
  --urlbar-container-height: 40px !important;
}

/* Idle: compact pill, centered text, hidden actions */
#urlbar:not([open]) {
  height: 32px !important;
  border-radius: 16px !important;
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent) !important;
  transition: border 0.2s ease !important;
}

#urlbar:not([open]) #urlbar-background,
#urlbar:not([open]) .urlbar-background {
  border-radius: 16px !important;
  background-color: color-mix(in srgb,
    var(--toolbar-field-background-color, var(--toolbar-bgcolor)) 60%,
    transparent
  ) !important;
  transition: background-color 0.2s ease !important;
  border-color: transparent !important;
}

#urlbar:not([open]) #urlbar-input {
  text-align: center !important;
}

/* Hide identity/actions when idle unless hovered */
#urlbar:not([open]) #identity-icon-label,
#urlbar:not([open]) #tracking-protection-icon-container,
#urlbar:not([open]) #urlbar-searchmode-switcher {
  display: none !important;
}

#urlbar:not([open]) #identity-icon-box {
  background-color: color-mix(in srgb, var(--toolbar-field-background-color) 40%, transparent) !important;
  border-radius: 13px !important;
  transition: background-color 0.2s ease !important;
}

#urlbar:not([open]) .urlbar-page-action {
  opacity: 0;
  width: 0 !important;
  padding: 0 !important;
  overflow: hidden;
  transition: opacity 0.2s ease, width 0.2s ease, padding 0.2s ease !important;
}

#urlbar:not([open]):hover .urlbar-page-action {
  opacity: 1;
  width: 26px !important;
  padding: 5px !important;
}

#urlbar:not([open]):hover #identity-icon-box {
  background-color: color-mix(in srgb, var(--toolbar-field-background-color) 70%, transparent) !important;
}

/* Expanded: Natsumi floating overlay */
#urlbar[open] {
  top: 25vh !important;
  width: 60% !important;
  left: 50% !important;
  translate: -50% 0 !important;
  border-radius: 12px !important;
  animation: midori-floating-urlbar-appear 0.2s ease !important;
  z-index: 999 !important;
}

#urlbar[open] .urlbar-input-container {
  padding-block: 5px !important;
}

#urlbar[open] .urlbar-input-container::before {
  content: "";
  width: 16px;
  height: 16px;
  background-image: url("chrome://browser/skin/preferences/category-search.svg");
  background-size: 16px;
  -moz-context-properties: stroke, fill, fill-opacity, stroke-opacity;
  fill: currentColor;
  margin-left: 12px !important;
  margin-top: 10px !important;
  margin-right: 8px !important;
}

#urlbar[open] #urlbar-input {
  font-size: 18px !important;
}

#urlbar[open] #urlbar-background,
#urlbar[open] .urlbar-background {
  background-color: color-mix(in srgb, var(--toolbar-bgcolor) 95%, transparent) !important;
  backdrop-filter: blur(16px) saturate(1.3) !important;
  -webkit-backdrop-filter: blur(16px) saturate(1.3) !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.1) !important;
  border: 1px solid color-mix(in srgb, currentColor 8%, transparent) !important;
}

#urlbar[open] #tracking-protection-icon-container,
#urlbar[open] #identity-box,
#urlbar[open] #page-action-buttons {
  display: none !important;
}

#urlbar[open] #urlbar-go-button {
  width: 28px !important;
  height: 28px !important;
  margin-block: auto !important;
  border-radius: 8px !important;
  transition: background-color 0.2s ease, box-shadow 0.2s ease !important;
}

#urlbar[open] #urlbar-go-button:hover {
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.15) !important;
}

/* Search engine color hints in floating urlbar */
#urlbar[open] #urlbar-searchmode-switcher {
  height: 24px !important;
  margin-block: auto !important;
  border-radius: 12px !important;
  background: color-mix(in srgb, var(--focus-outline-color, AccentColor) 15%, transparent) !important;
}

/* URL results styling */
#urlbar[open] .urlbarView-url {
  color: var(--focus-outline-color, AccentColor) !important;
}

/* Focus outline */
#urlbar:focus-within,
#searchbar:focus-within {
  outline-color: color-mix(in srgb,
    var(--toolbar-bgcolor) 85%,
    var(--lwt-text-color, currentColor)
  ) !important;
}

/* --- Tab groups (Arc folder style) --- */
tab-group .tab-group-label-container label {
  background: transparent !important;
  color: var(--lwt-text-color, currentColor) !important;
  transition: background-color 0.2s ease, color 0.2s ease !important;
}

tab-group .tab-group-label-container label:hover {
  background: color-mix(in srgb,
    light-dark(var(--tab-group-color), var(--tab-group-color-invert)) 20%,
    transparent
  ) !important;
  color: light-dark(var(--tab-group-color), var(--tab-group-color-invert)) !important;
  border-radius: 9px !important;
}

sidebar-main:has([expanded]) tab-group .tab-group-label-container label {
  padding-left: 38px !important;
  padding-right: 10px !important;
  transition: 0.3s ease !important;
}

sidebar-main:not([expanded]) tab-group {
  padding-block: calc(var(--tab-inline-padding, 8px) / 2) !important;
  margin-block: 0 !important;
  transition: 0.3s ease !important;
}
`;
  },
};
