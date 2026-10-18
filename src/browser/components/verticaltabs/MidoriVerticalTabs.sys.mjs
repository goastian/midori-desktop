/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { isRegularBrowserWindow } from 'resource:///modules/MidoriWebAppUtils.sys.mjs';
import {
  MidoriEssentials,
  PREF_ESSENTIALS_ITEMS,
} from 'resource:///modules/MidoriEssentials.sys.mjs';

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
const PREF_VERTICAL_WIDTH = 'midori.verticaltabs.width';
const PREF_VERTICAL_DENSITY = 'midori.verticaltabs.density';
const PREF_VERTICAL_COMPACT = 'midori.verticaltabs.compact';
const PREF_VERTICAL_COLLAPSE = 'midori.verticaltabs.collapse';
const PREF_COMPACT_MODE = 'midori.compact.enabled';
const PREF_VERTICAL_FLOATING_URLBAR = 'midori.verticaltabs.floatingUrlbar';
const PREF_VERTICAL_SHOW_RAIL = 'midori.verticaltabs.showRail';
const PREF_VERTICAL_SHOW_PINNED_SECTION = 'midori.verticaltabs.showPinnedSection';
const PREF_VERTICAL_ESSENTIALS_ENABLED = 'midori.verticaltabs.essentials.enabled';
const PREF_VERTICAL_ESSENTIALS_MAX = 'midori.verticaltabs.essentials.max';
const PREF_VERTICAL_URLBAR_AUTO_SELECT = 'midori.verticaltabs.urlbar.autoSelect';
const PREF_VERTICAL_ACCENT_MODE = 'midori.verticaltabs.accent.mode';
const PREF_VERTICAL_ACCENT_CUSTOM = 'midori.verticaltabs.accent.custom';
const PREF_ARC_MODE_ENABLED = 'midori.arcmode.enabled';
const PREF_VERTICAL_STYLE = 'midori.verticaltabs.style';
const PREF_HORIZONTAL_POSITION = 'midori.horizontaltabs.position';
const STYLE_ID = 'midori-verticaltabs-style';

const OBSERVED_PREFS = new Set([
  PREF_ENABLED,
  PREF_VERTICAL_POSITION,
  PREF_VERTICAL_WIDTH,
  PREF_VERTICAL_DENSITY,
  PREF_VERTICAL_COMPACT,
  PREF_VERTICAL_COLLAPSE,
  PREF_COMPACT_MODE,
  PREF_VERTICAL_FLOATING_URLBAR,
  PREF_VERTICAL_SHOW_RAIL,
  PREF_VERTICAL_SHOW_PINNED_SECTION,
  PREF_VERTICAL_ESSENTIALS_ENABLED,
  PREF_VERTICAL_ESSENTIALS_MAX,
  PREF_ESSENTIALS_ITEMS,
  PREF_VERTICAL_URLBAR_AUTO_SELECT,
  PREF_VERTICAL_ACCENT_MODE,
  PREF_VERTICAL_ACCENT_CUSTOM,
  PREF_ARC_MODE_ENABLED,
  PREF_VERTICAL_STYLE,
  PREF_HORIZONTAL_POSITION,
]);

export const MidoriVerticalTabs = {
  _initialized: false,
  _windowState: new WeakMap(),

  bootstrap() {
    if (!this.isEnabled()) {
      return;
    }
    this._syncFirefoxPrefs();
  },

  init() {
    if (this._initialized) return;
    this._initialized = true;

    Services.prefs.addObserver(PREF_ENABLED, this);
    Services.prefs.addObserver(PREF_VERTICAL_POSITION, this);
    Services.prefs.addObserver(PREF_VERTICAL_WIDTH, this);
    Services.prefs.addObserver(PREF_VERTICAL_DENSITY, this);
    Services.prefs.addObserver(PREF_VERTICAL_COMPACT, this);
    Services.prefs.addObserver(PREF_VERTICAL_COLLAPSE, this);
    Services.prefs.addObserver(PREF_COMPACT_MODE, this);
    Services.prefs.addObserver(PREF_VERTICAL_FLOATING_URLBAR, this);
    Services.prefs.addObserver(PREF_VERTICAL_SHOW_RAIL, this);
    Services.prefs.addObserver(PREF_VERTICAL_SHOW_PINNED_SECTION, this);
    Services.prefs.addObserver(PREF_VERTICAL_ESSENTIALS_ENABLED, this);
    Services.prefs.addObserver(PREF_VERTICAL_ESSENTIALS_MAX, this);
    Services.prefs.addObserver(PREF_ESSENTIALS_ITEMS, this);
    Services.prefs.addObserver(PREF_VERTICAL_URLBAR_AUTO_SELECT, this);
    Services.prefs.addObserver(PREF_VERTICAL_ACCENT_MODE, this);
    Services.prefs.addObserver(PREF_VERTICAL_ACCENT_CUSTOM, this);
    Services.prefs.addObserver(PREF_ARC_MODE_ENABLED, this);
    Services.prefs.addObserver(PREF_VERTICAL_STYLE, this);
    Services.prefs.addObserver(PREF_HORIZONTAL_POSITION, this);
    Services.obs.addObserver(this, 'browser-delayed-startup-finished');
    Services.obs.addObserver(this, 'domwindowclosed');

    this._syncFirefoxPrefs();
    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      this._applyToWindow(win);
    }

    console.log(`MidoriVerticalTabs: Initialized (enabled=${this.isEnabled()})`);
  },

  isEnabled() {
    return (
      Services.prefs.getBoolPref(PREF_ENABLED, false) ||
      this._isArcModeEnabled()
    );
  },

  setEnabled(enabled) {
    Services.prefs.setBoolPref(PREF_ENABLED, !!enabled);
  },

  _getVerticalSide() {
    const side = Services.prefs.getStringPref(PREF_VERTICAL_POSITION, 'left');
    return side === 'right' ? 'right' : 'left';
  },

  _isArcModeEnabled() {
    return Services.prefs.getBoolPref(PREF_ARC_MODE_ENABLED, false);
  },

  _getVerticalStyle() {
    const style = Services.prefs.getStringPref(PREF_VERTICAL_STYLE, 'arc');
    return style === 'classic' ? 'classic' : 'arc';
  },

  /**
   * The Arc layout is the default look of vertical tabs. The legacy
   * midori.arcmode.enabled pref forces it on; midori.verticaltabs.style set to
   * 'classic' is the escape hatch back to the previous plain vertical look.
   */
  _isArcLayoutActive() {
    return (
      this._isArcModeEnabled() ||
      (this.isEnabled() && this._getVerticalStyle() === 'arc')
    );
  },

  _getHorizontalPosition() {
    const pos = Services.prefs.getStringPref(PREF_HORIZONTAL_POSITION, 'top');
    return pos === 'bottom' ? 'bottom' : 'top';
  },

  _getVerticalWidth() {
    const width = Services.prefs.getIntPref(PREF_VERTICAL_WIDTH, 248);
    return Math.max(180, Math.min(360, width));
  },

  _getVerticalDensity() {
    const density = Services.prefs.getStringPref(PREF_VERTICAL_DENSITY, 'normal');
    if (density === 'compact' || density === 'comfortable') {
      return density;
    }
    return 'normal';
  },

  _isVerticalCompact() {
    return Services.prefs.getBoolPref(PREF_VERTICAL_COMPACT, false);
  },

  _isVerticalCollapse() {
    return (
      Services.prefs.getBoolPref(PREF_COMPACT_MODE, false) ||
      Services.prefs.getBoolPref(PREF_VERTICAL_COLLAPSE, false)
    );
  },

  _isFloatingUrlbarEnabled() {
    return Services.prefs.getBoolPref(PREF_VERTICAL_FLOATING_URLBAR, true);
  },

  _isShowRailEnabled() {
    return Services.prefs.getBoolPref(PREF_VERTICAL_SHOW_RAIL, true);
  },

  _isShowPinnedSectionEnabled() {
    return Services.prefs.getBoolPref(PREF_VERTICAL_SHOW_PINNED_SECTION, true);
  },

  _isEssentialsEnabled() {
    return Services.prefs.getBoolPref(PREF_VERTICAL_ESSENTIALS_ENABLED, true);
  },

  _getEssentialsMax() {
    const value = Services.prefs.getIntPref(PREF_VERTICAL_ESSENTIALS_MAX, 4);
    return Math.max(1, Math.min(12, value));
  },

  _isUrlbarAutoSelectEnabled() {
    return Services.prefs.getBoolPref(PREF_VERTICAL_URLBAR_AUTO_SELECT, true);
  },

  _getAccentMode() {
    const mode = Services.prefs.getStringPref(PREF_VERTICAL_ACCENT_MODE, 'workspace');
    if (mode === 'system' || mode === 'custom') {
      return mode;
    }
    return 'workspace';
  },

  _getCustomAccent() {
    const value = Services.prefs.getStringPref(PREF_VERTICAL_ACCENT_CUSTOM, '#2d8659').trim();
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#2d8659';
  },

  _resolveVerticalAccent(doc) {
    const mode = this._getAccentMode();
    if (mode === 'custom') {
      return this._getCustomAccent();
    }

    if (mode === 'workspace') {
      const workspaceAccentSource =
        doc.getElementById('midori-workspace-dropdown') ||
        doc.querySelector('#midori-workspace-quick-icons .midori-workspace-quick-btn[data-active="true"]');
      const accent = workspaceAccentSource?.style?.getPropertyValue('--midori-workspace-accent')?.trim();
      if (accent) {
        return accent;
      }
    }

    return 'AccentColor';
  },

  _applyDensity(root) {
    const density = this._getVerticalDensity();
    root.setAttribute('midori-vt-density', density);
    switch (density) {
      case 'compact':
        root.style.setProperty('--midori-vt-density-pad', '4px');
        root.style.setProperty('--midori-vt-tab-radius', '10px');
        break;
      case 'comfortable':
        root.style.setProperty('--midori-vt-density-pad', '8px');
        root.style.setProperty('--midori-vt-tab-radius', '12px');
        break;
      default:
        root.style.setProperty('--midori-vt-density-pad', '6px');
        root.style.setProperty('--midori-vt-tab-radius', '11px');
        break;
    }
  },

  _applyWidth(root) {
    root.style.setProperty('--midori-vt-width', `${this._getVerticalWidth()}px`);
  },

  _applyCompact(root) {
    root.setAttribute('midori-vt-compact', this._isVerticalCompact() ? 'true' : 'false');
  },

  _applyCollapse(root) {
    root.setAttribute('midori-vt-collapse', this._isVerticalCollapse() ? 'true' : 'false');
  },

  _applyCompactMode(root) {
    root.toggleAttribute(
      'midori-compact-mode',
      Services.prefs.getBoolPref(PREF_COMPACT_MODE, false)
    );
  },

  _applyFloatingUrlbar(root) {
    root.setAttribute(
      'midori-vt-floating-urlbar',
      this._isFloatingUrlbarEnabled() ? 'true' : 'false'
    );
  },

  _applyShowRail(root) {
    root.setAttribute('midori-vt-show-rail', this._isShowRailEnabled() ? 'true' : 'false');
  },

  _applyShowPinnedSection(root) {
    root.setAttribute(
      'midori-vt-show-pinned-section',
      this._isShowPinnedSectionEnabled() ? 'true' : 'false'
    );
  },

  _applyVerticalRootState(doc) {
    const root = doc.documentElement;
    this._applyDensity(root);
    this._applyWidth(root);
    this._applyCompact(root);
    this._applyCollapse(root);
    this._applyFloatingUrlbar(root);
    this._applyShowRail(root);
    this._applyShowPinnedSection(root);
    root.setAttribute('midori-vt-essentials-enabled', this._isEssentialsEnabled() ? 'true' : 'false');
    root.setAttribute('midori-vt-essentials-max', String(this._getEssentialsMax()));
    root.setAttribute('midori-arc-mode', this._isArcLayoutActive() ? 'true' : 'false');

    const accent = this._resolveVerticalAccent(doc);
    root.style.setProperty('--midori-vt-accent', accent);
    root.style.setProperty('--midori-vt-divider', 'color-mix(in srgb, currentColor 12%, transparent)');
    root.setAttribute('midori-vt-accent-mode', this._getAccentMode());

    if (Services.locale.isAppLocaleRTL) {
      root.setAttribute('midori-vt-rtl', 'true');
    } else {
      root.removeAttribute('midori-vt-rtl');
    }
  },

  _clearVerticalRootState(doc) {
    const root = doc.documentElement;
    root.removeAttribute('midori-vt-density');
    root.removeAttribute('midori-vt-compact');
    root.removeAttribute('midori-vt-collapse');
    root.removeAttribute('midori-vt-floating-urlbar');
    root.removeAttribute('midori-vt-show-rail');
    root.removeAttribute('midori-vt-show-pinned-section');
    root.removeAttribute('midori-vt-essentials-enabled');
    root.removeAttribute('midori-vt-essentials-max');
    root.removeAttribute('midori-vt-has-pinned');
    root.removeAttribute('midori-vt-accent-mode');
    root.removeAttribute('midori-vt-rtl');
    root.removeAttribute('midori-arc-mode');
    root.style.removeProperty('--midori-vt-width');
    root.style.removeProperty('--midori-vt-density-pad');
    root.style.removeProperty('--midori-vt-tab-radius');
    root.style.removeProperty('--midori-vt-accent');
    root.style.removeProperty('--midori-vt-divider');
  },

  observe(subject, topic, data) {
    if (topic === 'nsPref:changed' && OBSERVED_PREFS.has(data)) {
      this._syncFirefoxPrefs();
      this._refreshAllWindows();
    } else if (topic === 'browser-delayed-startup-finished') {
      this._applyToWindow(subject);
    } else if (topic === 'domwindowclosed') {
      this._cleanupWindow(subject);
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
      Services.prefs.setCharPref(
        'sidebar.visibility',
        this._isVerticalCollapse() ? 'expand-on-hover' : 'always-show'
      );
      const logicalStartSide = Services.locale.isAppLocaleRTL
        ? 'right'
        : 'left';
      Services.prefs.setBoolPref(
        'sidebar.position_start',
        this._getVerticalSide() === logicalStartSide
      );
    }
  },

  // =========================================================================
  // Per-window
  // =========================================================================

  _applyToWindow(win) {
    if (!isRegularBrowserWindow(win)) return;
    const doc = win.document;
    // The injected CSS only depends on the layout mode; every other setting is
    // driven by root attributes and variables, so the sheet is rebuilt only
    // when the mode changes.
    const mode = this.isEnabled() ? 'vertical' : 'base';
    const existing = doc.getElementById(STYLE_ID);
    if (!existing || existing.getAttribute('data-midori-mode') !== mode) {
      existing?.remove();
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.setAttribute('data-midori-mode', mode);
      style.textContent = mode === 'vertical' ? this._buildVerticalCSS() : this._buildBaseCSS();
      doc.documentElement.appendChild(style);
    }

    if (this.isEnabled()) {
      doc.documentElement.removeAttribute('midori-horizontal-tabs');
      doc.documentElement.setAttribute('midori-vertical-tabs', this._getVerticalSide());
      this._applyVerticalRootState(doc);
      this._initEssentials(win);
    } else {
      doc.documentElement.removeAttribute('midori-vertical-tabs');
      doc.documentElement.setAttribute('midori-horizontal-tabs', this._getHorizontalPosition());
      this._clearVerticalRootState(doc);
      MidoriEssentials.cleanupWindow(win);
    }

    this._applyCompactMode(doc.documentElement);

    // --- Move TabsToolbar for bottom horizontal tabs ---
    this._applyBottomTabs(doc);

    // --- Auto-select URL bar content on open (Natsumi urlbar.uc.mjs) ---
    this._initUrlbarAutoSelect(win);
  },

  _getWindowState(win) {
    let state = this._windowState.get(win);
    if (!state) {
      state = { listeners: [], observers: [], cleanups: [] };
      this._windowState.set(win, state);
    }
    return state;
  },

  _trackWindowListener(win, target, type, listener, options) {
    target.addEventListener(type, listener, options);
    this._getWindowState(win).listeners.push({
      target,
      type,
      listener,
      options,
    });
  },

  _trackWindowObserver(win, observer) {
    this._getWindowState(win).observers.push(observer);
    return observer;
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
    const onKeyDown = () => {
      userTyping = true;
    };
    this._trackWindowListener(win, input, 'keydown', onKeyDown, true);

    const urlbarObserver = new win.MutationObserver(() => {
      const isOpen = urlbar.hasAttribute('open');
      if (isOpen && !wasOpen && !userTyping && this._isUrlbarAutoSelectEnabled()) {
        win.requestAnimationFrame(() => {
          if (
            urlbar.hasAttribute('open') &&
            !userTyping &&
            doc.activeElement === input
          ) {
            input.select();
          }
        });
      }
      if (!isOpen) {
        // Reset typing flag when urlbar closes
        userTyping = false;
      }
      wasOpen = isOpen;
    });
    urlbarObserver.observe(urlbar, { attributes: true, attributeFilter: ['open'] });
    this._trackWindowObserver(win, urlbarObserver);
  },

  _initEssentials(win) {
    MidoriEssentials.initWindow(win, {
      onPinnedChange: () => this._schedulePinnedState(win),
    });
    this._initPinnedState(win);
  },

  _initPinnedState(win) {
    const doc = win.document;
    if (doc._midoriPinnedStateInit) {
      this._updatePinnedState(win);
      return;
    }
    const tabContainer = win.gBrowser?.tabContainer;
    if (!tabContainer) {
      return;
    }
    doc._midoriPinnedStateInit = true;

    let frame = 0;
    const schedule = () => {
      if (frame) {
        return;
      }
      frame = win.requestAnimationFrame(() => {
        frame = 0;
        this._updatePinnedState(win);
      });
    };
    const scheduleIfPinned = event => {
      if (event.target?.pinned) {
        schedule();
      }
    };
    doc._midoriPinnedStateUpdate = schedule;
    this._getWindowState(win).cleanups.push(() => {
      if (frame) {
        win.cancelAnimationFrame(frame);
        frame = 0;
      }
    });

    this._trackWindowListener(win, tabContainer, 'TabPinned', schedule);
    this._trackWindowListener(win, tabContainer, 'TabUnpinned', schedule);
    this._trackWindowListener(win, tabContainer, 'TabClose', scheduleIfPinned);
    this._trackWindowListener(win, tabContainer, 'TabOpen', scheduleIfPinned);
    this._updatePinnedState(win);
  },

  _schedulePinnedState(win) {
    const schedule = win?.document?._midoriPinnedStateUpdate;
    if (schedule) {
      schedule();
    } else {
      this._updatePinnedState(win);
    }
  },

  /**
   * Reflects whether the native pinned section has tabs of its own. Essentials
   * tabs are hidden there, so an otherwise empty section is hidden by CSS.
   */
  _updatePinnedState(win) {
    const root = win?.document?.documentElement;
    if (!root || !win.gBrowser) {
      return;
    }
    root.setAttribute(
      'midori-vt-has-pinned',
      MidoriEssentials.countRegularPinned(win) > 0 ? 'true' : 'false'
    );
  },

  _refreshAllWindows() {
    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      if (win.document.readyState === 'complete') {
        this._applyToWindow(win);
      }
    }
  },

  _restoreTabsToolbar(doc) {
    const tabsToolbar = doc?.getElementById('TabsToolbar');
    const navigatorToolbox = doc?.getElementById('navigator-toolbox');
    if (!tabsToolbar || !navigatorToolbox) return;

    const originalFlex = tabsToolbar.getAttribute('data-midori-original-flex');
    if (originalFlex) {
      tabsToolbar.setAttribute('flex', originalFlex);
    }
    tabsToolbar.removeAttribute('data-midori-original-flex');

    if (tabsToolbar.parentNode !== navigatorToolbox) {
      const menubar = doc.getElementById('toolbar-menubar');
      if (menubar) {
        menubar.after(tabsToolbar);
      } else {
        navigatorToolbox.prepend(tabsToolbar);
      }
    }
  },

  _cleanupWindow(win) {
    const state = this._windowState.get(win);
    const doc = win?.document;

    if (state) {
      for (const cleanup of state.cleanups.splice(0).reverse()) {
        try {
          cleanup();
        } catch {}
      }
      for (const observer of state.observers.splice(0)) {
        try {
          observer.disconnect();
        } catch {}
      }
      for (const { target, type, listener, options } of state.listeners.splice(0)) {
        try {
          target.removeEventListener(type, listener, options);
        } catch {}
      }
      this._windowState.delete(win);
    }

    if (!doc) return;

    doc.getElementById(STYLE_ID)?.remove();
    MidoriEssentials.cleanupWindow(win);
    this._restoreTabsToolbar(doc);
    this._clearVerticalRootState(doc);
    doc.documentElement.removeAttribute('midori-vertical-tabs');
    doc.documentElement.removeAttribute('midori-horizontal-tabs');

    delete doc._midoriUrlbarAutoSelectInit;
    delete doc._midoriPinnedStateInit;
    delete doc._midoriPinnedStateUpdate;
  },

  uninit() {
    if (!this._initialized) {
      return;
    }

    this._initialized = false;
    for (const pref of OBSERVED_PREFS) {
      try {
        Services.prefs.removeObserver(pref, this);
      } catch {}
    }
    try {
      Services.obs.removeObserver(this, 'browser-delayed-startup-finished');
      Services.obs.removeObserver(this, 'domwindowclosed');
    } catch {}

    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      this._cleanupWindow(win);
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
  --toolbar-bgcolor: var(--pf-sidebar-bgcolor) !important;
  --toolbar-color: var(--pf-text-color) !important;
  --lwt-accent-color: var(--pf-sidebar-bgcolor) !important;
  --lwt-text-color: var(--pf-text-color) !important;
  --lwt-tab-text: var(--pf-text-color) !important;
  --tab-selected-textcolor: var(--pf-text-color) !important;
  --toolbarbutton-icon-fill: var(--pf-icon-color) !important;
  border-top: 1px solid var(--pf-border-color-light) !important;
  border-bottom: none !important;
  background:
    linear-gradient(var(--pf-tabbar-bgcolor), var(--pf-tabbar-bgcolor)),
    var(--pf-sidebar-bgcolor) !important;
  color: var(--pf-text-color) !important;
}

:root[midori-horizontal-tabs='bottom'] #tabbrowser-tabs,
:root[midori-horizontal-tabs='bottom'] .tabbrowser-tab,
:root[midori-horizontal-tabs='bottom'] .tab-content {
  --tab-label-color: var(--pf-text-color) !important;
  --tab-selected-textcolor: var(--pf-text-color) !important;
  color: var(--pf-text-color) !important;
}

:root[midori-horizontal-tabs='bottom'] .tab-background:is([selected], [multiselected]) {
  background-color: var(--pf-tab-selected-bgcolor) !important;
  box-shadow: var(--pf-tab-selected-shadow) !important;
}

:root[midori-horizontal-tabs='bottom'] .tabbrowser-tab:hover .tab-background:not([selected], [multiselected]) {
  background-color: var(--pf-toolbar-bgcolor-hover) !important;
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
  top: 12px;
  width: min(640px, calc(100% - 24px)) !important;
  right: 12px !important;
  left: auto !important;
  min-height: 44px !important;
  height: 44px !important;
  padding: 7px 8px !important;
  box-sizing: border-box !important;
  align-items: center !important;
  flex-wrap: nowrap !important;
  border-radius: 12px !important;
  background: var(--pf-panel-bgcolor, var(--toolbar-bgcolor)) !important;
  color: var(--pf-text-color, var(--toolbar-color)) !important;
  border: 1px solid var(--pf-border-color, color-mix(in srgb, currentColor 12%, transparent)) !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12) !important;
  animation: midori-findbar-appear 0.2s ease !important;
  z-index: 10;
  transition: opacity 0.15s ease, top 0.15s ease !important;
}

.browserContainer > findbar .findbar-container {
  flex-wrap: nowrap !important;
  min-width: 0 !important;
  min-height: 28px !important;
  height: 28px !important;
  margin-inline-start: 0 !important;
  overflow: hidden !important;
}

.browserContainer > findbar[hidden] {
  opacity: 0 !important;
  top: 0 !important;
  pointer-events: none !important;
}

.browserContainer > findbar .findbar-textbox {
  width: 20em !important;
  max-width: 36vw !important;
  border-radius: 8px !important;
  background-color: var(--pf-input-bgcolor, var(--toolbar-field-background-color)) !important;
  color: var(--pf-text-color, var(--toolbar-field-text-color)) !important;
  caret-color: var(--pf-accent-color, AccentColor) !important;
  border-color: var(--pf-border-color, var(--input-border-color)) !important;
}

.browserContainer > findbar .findbar-closebutton {
  position: static !important;
  flex: 0 0 auto !important;
  margin: 0 0 0 4px !important;
  padding: 4px !important;
}

/* --- Status panel pill (flat) --- */
#statuspanel {
  max-width: calc(100% - 20px) !important;
  margin: 10px !important;
}

#statuspanel-label {
  color: var(--toolbar-color, currentColor) !important;
  border: 1px solid var(--toolbar-field-border-color,
    color-mix(in srgb, currentColor 24%, transparent)) !important;
  border-radius: 13px !important;
  background-color: color-mix(
    in srgb,
    var(--toolbar-field-background-color, var(--toolbar-bgcolor)) 94%,
    black 6%
  ) !important;
  padding: 2px 12px !important;
  box-shadow: 0 2px 10px color-mix(in srgb, black 22%, transparent) !important;
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
   MIDORI VERTICAL TABS — Runtime defaults
   Visual layout is handled in shared.inc.css.
   ===================================================================== */

:root[midori-vertical-tabs] {
  --midori-vt-width: 248px;
  --midori-vt-density-pad: 6px;
  --midori-vt-tab-radius: 11px;
  --midori-vt-accent: AccentColor;
  --midori-vt-divider: color-mix(in srgb, currentColor 12%, transparent);
}

@media -moz-pref("midori.modblur.verticalTabs.compact") {
  :root[midori-vertical-tabs] {
    --midori-vt-density-pad: 3px;
    --midori-vt-tab-radius: 8px;
  }
}

@media -moz-pref("midori.modblur.verticalTabs.hideScrollbar") {
  :root[midori-vertical-tabs] .tabbrowser-arrowscrollbox,
  :root[midori-vertical-tabs] #tabbrowser-tabs,
  :root[midori-vertical-tabs] #vertical-tabs {
    scrollbar-width: none !important;
  }
}
`
    );
  },
};
