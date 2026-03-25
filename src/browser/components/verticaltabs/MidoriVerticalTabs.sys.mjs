/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * MidoriVerticalTabs — Flat Design UI system for Midori Browser.
 *
 * When enabled (vertical mode), this module:
 *   1. Activates Firefox 148's native sidebar.verticalTabs
 *   2. Injects flat, minimal CSS: floating URL bar, rounded content area,
 *      modern findbar, improved tab styling — zero backdrop-filter/blur
 *   3. Configures the sidebar for optimal vertical-tab UX
 *
 * When disabled (horizontal mode), standard horizontal tabs are used with
 * light visual refinements (rounded buttons, smooth transitions).
 *
 * Preferences:
 *   - midori.verticaltabs.enabled  (bool, default: false)
 *
 * @patch Midori Browser
 */

const PREF_ENABLED = 'midori.verticaltabs.enabled';
const PREF_VERTICAL_POSITION = 'midori.verticaltabs.position';
const PREF_HORIZONTAL_POSITION = 'midori.horizontaltabs.position';
const STYLE_ID = 'midori-verticaltabs-style';

export const MidoriVerticalTabs = {
  _initialized: false,

  init() {
    if (this._initialized) return;
    this._initialized = true;

    Services.prefs.addObserver(PREF_ENABLED, this);
    Services.prefs.addObserver(PREF_VERTICAL_POSITION, this);
    Services.prefs.addObserver(PREF_HORIZONTAL_POSITION, this);
    Services.obs.addObserver(this, 'browser-delayed-startup-finished');

    this._syncFirefoxPrefs();
    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      if (win.document.readyState === 'complete') {
        this._applyToWindow(win);
      }
    }

    console.log(`MidoriVerticalTabs: Initialized (enabled=${this.isEnabled()})`);
  },

  isEnabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, false);
  },

  setEnabled(enabled) {
    Services.prefs.setBoolPref(PREF_ENABLED, !!enabled);
  },

  _getVerticalSide() {
    const side = Services.prefs.getStringPref(PREF_VERTICAL_POSITION, 'left');
    return side === 'right' ? 'right' : 'left';
  },

  _getHorizontalPosition() {
    const pos = Services.prefs.getStringPref(PREF_HORIZONTAL_POSITION, 'top');
    return pos === 'bottom' ? 'bottom' : 'top';
  },

  // =========================================================================
  // Observer
  // =========================================================================

  observe(subject, topic, data) {
    if (
      topic === 'nsPref:changed' &&
      (data === PREF_ENABLED || data === PREF_VERTICAL_POSITION || data === PREF_HORIZONTAL_POSITION)
    ) {
      this._syncFirefoxPrefs();
      this._refreshAllWindows();
    } else if (topic === 'browser-delayed-startup-finished') {
      this._applyToWindow(subject);
    }
  },

  // =========================================================================
  // Firefox pref sync
  // =========================================================================

  _syncFirefoxPrefs() {
    const enabled = this.isEnabled();
    Services.prefs.setBoolPref('sidebar.verticalTabs', enabled);
    Services.prefs.setBoolPref('sidebar.revamp', enabled);
    if (enabled) {
      Services.prefs.setCharPref('sidebar.visibility', 'always-show');
      Services.prefs.setBoolPref('sidebar.position_start', this._getVerticalSide() === 'left');
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

    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = this.isEnabled() ? this._buildVerticalCSS() : this._buildBaseCSS();
    doc.documentElement.appendChild(style);

    if (this.isEnabled()) {
      doc.documentElement.removeAttribute('midori-horizontal-tabs');
      doc.documentElement.setAttribute('midori-vertical-tabs', this._getVerticalSide());
    } else {
      doc.documentElement.removeAttribute('midori-vertical-tabs');
      doc.documentElement.setAttribute('midori-horizontal-tabs', this._getHorizontalPosition());
    }

    // --- Move TabsToolbar for bottom horizontal tabs ---
    this._applyBottomTabs(doc);

    // --- Pinned tabs icon feature (Natsumi-inspired) ---
    this._initPinnedTabsIcon(win);

    // --- Auto-select URL bar content on open (Natsumi urlbar.uc.mjs) ---
    this._initUrlbarAutoSelect(win);
  },

  /**
   * Moves #TabsToolbar below #browser in the DOM for true bottom tabs,
   * or restores it inside #navigator-toolbox for top/vertical modes.
   */
  _applyBottomTabs(doc) {
    const tabsToolbar = doc.getElementById('TabsToolbar');
    const navigatorToolbox = doc.getElementById('navigator-toolbox');
    const browser = doc.getElementById('browser');
    if (!tabsToolbar || !navigatorToolbox || !browser) return;

    const isBottomHorizontal =
      !this.isEnabled() && this._getHorizontalPosition() === 'bottom';

    if (isBottomHorizontal) {
      // Move TabsToolbar after #browser so it sits at the window bottom
      if (tabsToolbar.parentNode !== browser.parentNode ||
          tabsToolbar.previousElementSibling !== browser) {
        // Save original flex value so we can restore it later
        if (!tabsToolbar.hasAttribute('data-midori-original-flex')) {
          tabsToolbar.setAttribute('data-midori-original-flex',
            tabsToolbar.getAttribute('flex') || '');
        }
        tabsToolbar.removeAttribute('flex');
        browser.after(tabsToolbar);
      }
    } else {
      // Restore TabsToolbar inside #navigator-toolbox (after #toolbar-menubar)
      if (tabsToolbar.parentNode !== navigatorToolbox) {
        // Restore original flex attribute
        const origFlex = tabsToolbar.getAttribute('data-midori-original-flex');
        if (origFlex) {
          tabsToolbar.setAttribute('flex', origFlex);
        }
        tabsToolbar.removeAttribute('data-midori-original-flex');

        const menubar = doc.getElementById('toolbar-menubar');
        if (menubar) {
          menubar.after(tabsToolbar);
        } else {
          navigatorToolbox.prepend(tabsToolbar);
        }
      }
    }
  },

  /**
   * Copies each pinned tab's favicon into a CSS custom property
   * (--midori-tab-icon) so CSS can reference it for decorative purposes.
   * Inspired by Natsumi's pinned-tabs-icon.uc.mjs.
   */
  _initPinnedTabsIcon(win) {
    const doc = win.document;
    if (doc._midoriPinnedIconInit) return;
    doc._midoriPinnedIconInit = true;

    const copyTabIcon = (tab) => {
      const image = tab.getAttribute('image');
      tab.style.setProperty(
        '--midori-tab-icon',
        image ? `url("${image}")` : `url("chrome://global/skin/icons/defaultFavicon.svg")`
      );
    };

    const observeTab = (tab) => {
      const obs = new win.MutationObserver(() => copyTabIcon(tab));
      obs.observe(tab, { attributes: true, attributeFilter: ['image'] });
    };

    // Process existing pinned tabs
    for (const container of [
      doc.getElementById('pinned-tabs-container'),
      doc.getElementById('vertical-pinned-tabs-container'),
    ]) {
      if (!container) continue;
      for (const tab of container.querySelectorAll('tab')) {
        copyTabIcon(tab);
        observeTab(tab);
      }
      // Watch for newly pinned tabs
      new win.MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeName === 'tab') {
              copyTabIcon(node);
              observeTab(node);
            }
          }
        }
      }).observe(container, { childList: true });
    }
  },

  /**
   * Auto-selects the URL bar text when the floating URL bar opens.
   * Only selects on the initial open (before the user starts typing).
   * Once the user presses a key, auto-select is suppressed until the
   * urlbar fully closes and re-opens.
   */
  _initUrlbarAutoSelect(win) {
    const doc = win.document;
    if (doc._midoriUrlbarAutoSelectInit) return;
    doc._midoriUrlbarAutoSelectInit = true;

    const urlbar = doc.getElementById('urlbar');
    if (!urlbar) return;

    let wasOpen = false;
    let userTyping = false;

    const input = doc.getElementById('urlbar-input');
    if (!input) return;

    // Suppress auto-select once the user starts typing
    input.addEventListener('keydown', () => { userTyping = true; }, true);

    new win.MutationObserver(() => {
      const isOpen = urlbar.hasAttribute('open');
      if (isOpen && !wasOpen && !userTyping) {
        // Only select on fresh open before any keystrokes
        input.select();
      }
      if (!isOpen) {
        // Reset typing flag when urlbar closes
        userTyping = false;
      }
      wasOpen = isOpen;
    }).observe(urlbar, { attributes: true, attributeFilter: ['open'] });
  },

  _refreshAllWindows() {
    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      if (win.document.readyState === 'complete') {
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
   MIDORI BASE — Flat Design refinements for horizontal mode
   Lightweight, no backdrop-filter, no blur
   ===================================================================== */

/* --- Bottom tabs: TabsToolbar is moved after #browser via JS --- */
:root[midori-horizontal-tabs='bottom'] #TabsToolbar {
  flex: none !important;  /* Don't stretch — only take natural height */
  border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent) !important;
  border-bottom: none !important;
  background-color: var(--toolbar-bgcolor) !important;
  color: var(--toolbar-color, inherit) !important;
}

/* Hide titlebar spacers & window buttons — they must stay at the top */
:root[midori-horizontal-tabs='bottom'] #TabsToolbar .titlebar-spacer,
:root[midori-horizontal-tabs='bottom'] #TabsToolbar .titlebar-buttonbox-container {
  display: none !important;
}

/* Ensure content area fills the space between nav-bar and bottom tabs */
:root[midori-horizontal-tabs='bottom'] #browser {
  flex: 1 !important;
  min-height: 0 !important;
}

/* --- Animations --- */
@keyframes midori-floating-urlbar-appear {
  0% { scale: 0.95; opacity: 0.5; }
  100% { scale: 1; opacity: 1; }
}

@keyframes midori-findbar-appear {
  from { top: 0; opacity: 0; }
  to { top: 20px; opacity: 1; }
}

@keyframes midori-dialog-popup {
  0% { translate: 0 15px; opacity: 0; }
  100% { translate: 0; opacity: 1; }
}

/* --- Flat toolbar buttons --- */
toolbar .toolbarbutton-1 {
  & > .toolbarbutton-icon,
  & > .toolbarbutton-badge-stack {
    border-radius: 10px !important;
    transition: background-color 0.15s ease !important;
  }
}

.toolbarbutton-1:hover > .toolbarbutton-icon {
  background-color: var(--midori-btn-hover, color-mix(in srgb, currentColor 8%, transparent)) !important;
}

.toolbarbutton-1:active > .toolbarbutton-icon,
.toolbarbutton-1[open] > .toolbarbutton-icon {
  background-color: var(--midori-btn-active, color-mix(in srgb, AccentColor 18%, transparent)) !important;
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

/* --- URL bar page actions: rounder --- */
.urlbar-page-action, .urlbar-revert-button {
  border-radius: 14px !important;
  width: 26px !important;
  height: 26px !important;
  padding: 5px !important;
  transition: background-color 0.15s ease !important;
}

/* --- Floating findbar (flat) --- */
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
  border-radius: 12px !important;
  background: var(--toolbar-bgcolor) !important;
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent) !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12) !important;
  animation: midori-findbar-appear 0.2s ease !important;
  z-index: 10;
  transition: opacity 0.15s ease, top 0.15s ease !important;
}

.browserContainer > findbar[hidden] {
  opacity: 0 !important;
  top: 0 !important;
  pointer-events: none !important;
}

.browserContainer > findbar .findbar-textbox {
  border-radius: 8px !important;
}

/* --- Status panel pill (flat) --- */
#statuspanel {
  max-width: calc(100% - 20px) !important;
  margin: 10px !important;
}

#statuspanel-label {
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent) !important;
  border-radius: 13px !important;
  background-color: var(--toolbar-bgcolor) !important;
  padding: 2px 12px !important;
}

/* --- Dialog popups animation --- */
.dialogStack .dialogBox {
  animation: midori-dialog-popup 0.3s ease !important;
}
`;
  },

  // =========================================================================
  // CSS — Vertical tabs mode (Flat Design)
  // =========================================================================

  _buildVerticalCSS() {
    return (
      this._buildBaseCSS() +
      `

/* =====================================================================
   MIDORI VERTICAL TABS — Flat Design layout
   ===================================================================== */

/* --- Content area separation (flat border, no glass) --- */
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
  transition: opacity 0.15s ease !important;
}
#nav-bar:not([customizing]) #unified-extensions-button:hover {
  opacity: 1 !important;
}

/* Hide private browsing label */
.private-browsing-indicator-label { display: none !important; }

/* Sidebar tools — horizontal row, show/hide on hover */
.tools-and-extensions[orientation="horizontal"] {
  display: flex !important;
  flex-wrap: initial !important;
  flex-direction: row !important;
  opacity: 0.4 !important;
}

/* Sidebar tools hover visibility */
.wrapper:hover {
  .tools-and-extensions:hover { opacity: 1 !important; }
  .tools-and-extensions[orientation="vertical"] {
    transition: 0.15s ease !important;
    display: flex !important;
    visibility: inherit !important;
    opacity: 0.4 !important;
    margin-top: -12px !important;
  }
  .tools-and-extensions[orientation="horizontal"] {
    overflow: scroll !important;
    scrollbar-width: thin;
    scrollbar-color: var(--lwt-accent-color) transparent;
    transition: 0.15s ease !important;
    margin-top: 0 !important;
    &:hover { opacity: 1 !important; }
  }
}

.wrapper .tools-and-extensions[orientation="vertical"] {
  visibility: collapse;
  opacity: 0 !important;
  margin-top: -12px !important;
}

/* --- Sidebar styling (flat) --- */
#sidebar {
  border-radius: 10px !important;
  border: 1px solid color-mix(in srgb, currentColor 6%, transparent) !important;
  background-color: var(--toolbar-bgcolor) !important;
  transition: background-color 0.15s ease !important;
}

#sidebar-box {
  padding-inline-end: 0 !important;
  border: none !important;
  transition: background-color 0.15s ease !important;
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

/* --- URL bar — compact when idle, floating when active (flat) --- */

#urlbar-container {
  --urlbar-container-height: 40px !important;
}

/* Idle: compact pill, centered text, hidden actions */
#urlbar:not([open]) {
  height: 32px !important;
  border-radius: 16px !important;
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent) !important;
  transition: border 0.15s ease !important;
}

#urlbar:not([open]) #urlbar-background,
#urlbar:not([open]) .urlbar-background {
  border-radius: 16px !important;
  background-color: var(--toolbar-field-background-color, var(--toolbar-bgcolor)) !important;
  transition: background-color 0.15s ease !important;
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
  transition: background-color 0.15s ease !important;
}

#urlbar:not([open]) .urlbar-page-action {
  opacity: 0;
  width: 0 !important;
  padding: 0 !important;
  overflow: hidden;
  transition: opacity 0.15s ease, width 0.15s ease, padding 0.15s ease !important;
}

#urlbar:not([open]):hover .urlbar-page-action {
  opacity: 1;
  width: 26px !important;
  padding: 5px !important;
}

#urlbar:not([open]):hover #identity-icon-box {
  background-color: color-mix(in srgb, var(--toolbar-field-background-color) 70%, transparent) !important;
}

/* Expanded: floating overlay (flat, no blur) */
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
  background-color: var(--toolbar-bgcolor) !important;
  border-radius: 12px !important;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.08) !important;
  border: 1px solid color-mix(in srgb, currentColor 10%, transparent) !important;
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
  transition: background-color 0.15s ease !important;
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

/* --- Tab groups --- */
tab-group .tab-group-label-container label {
  background: transparent !important;
  color: var(--lwt-text-color, currentColor) !important;
  transition: background-color 0.15s ease, color 0.15s ease !important;
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
`
    );
  },
};
