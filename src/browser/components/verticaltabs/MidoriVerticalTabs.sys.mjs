/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { isRegularBrowserWindow } from 'resource:///modules/MidoriWebAppUtils.sys.mjs';

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
const PREF_VERTICAL_FLOATING_URLBAR = 'midori.verticaltabs.floatingUrlbar';
const PREF_VERTICAL_SHOW_RAIL = 'midori.verticaltabs.showRail';
const PREF_VERTICAL_SHOW_PINNED_SECTION = 'midori.verticaltabs.showPinnedSection';
const PREF_VERTICAL_ESSENTIALS_ENABLED = 'midori.verticaltabs.essentials.enabled';
const PREF_VERTICAL_ESSENTIALS_MAX = 'midori.verticaltabs.essentials.max';
const PREF_VERTICAL_ESSENTIALS_PROMO = 'midori.verticaltabs.essentialsPromo';
const PREF_VERTICAL_URLBAR_AUTO_SELECT = 'midori.verticaltabs.urlbar.autoSelect';
const PREF_VERTICAL_ACCENT_MODE = 'midori.verticaltabs.accent.mode';
const PREF_VERTICAL_ACCENT_CUSTOM = 'midori.verticaltabs.accent.custom';
const PREF_ARC_MODE_ENABLED = 'midori.arcmode.enabled';
const PREF_HORIZONTAL_POSITION = 'midori.horizontaltabs.position';
const STYLE_ID = 'midori-verticaltabs-style';
const ESSENTIALS_PROMO_ID = 'midori-essentials-promo';
const ESSENTIAL_ATTR = 'midori-essential';
const FIRST_REGULAR_PINNED_ATTR = 'midori-first-regular-pinned';
const ESSENTIALS_CTX_SEPARATOR_ID = 'midori-context-essentials-separator';
const ESSENTIALS_CTX_ADD_ID = 'midori-context-add-essential';
const ESSENTIALS_CTX_REMOVE_ID = 'midori-context-remove-essential';
const PINNED_STATE_ATTRS = new Set(['pinned', ESSENTIAL_ATTR]);

const OBSERVED_PREFS = new Set([
  PREF_ENABLED,
  PREF_VERTICAL_POSITION,
  PREF_VERTICAL_WIDTH,
  PREF_VERTICAL_DENSITY,
  PREF_VERTICAL_COMPACT,
  PREF_VERTICAL_COLLAPSE,
  PREF_VERTICAL_FLOATING_URLBAR,
  PREF_VERTICAL_SHOW_RAIL,
  PREF_VERTICAL_SHOW_PINNED_SECTION,
  PREF_VERTICAL_ESSENTIALS_ENABLED,
  PREF_VERTICAL_ESSENTIALS_MAX,
  PREF_VERTICAL_ESSENTIALS_PROMO,
  PREF_VERTICAL_URLBAR_AUTO_SELECT,
  PREF_VERTICAL_ACCENT_MODE,
  PREF_VERTICAL_ACCENT_CUSTOM,
  PREF_ARC_MODE_ENABLED,
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
    Services.prefs.addObserver(PREF_VERTICAL_FLOATING_URLBAR, this);
    Services.prefs.addObserver(PREF_VERTICAL_SHOW_RAIL, this);
    Services.prefs.addObserver(PREF_VERTICAL_SHOW_PINNED_SECTION, this);
    Services.prefs.addObserver(PREF_VERTICAL_ESSENTIALS_ENABLED, this);
    Services.prefs.addObserver(PREF_VERTICAL_ESSENTIALS_MAX, this);
    Services.prefs.addObserver(PREF_VERTICAL_ESSENTIALS_PROMO, this);
    Services.prefs.addObserver(PREF_VERTICAL_URLBAR_AUTO_SELECT, this);
    Services.prefs.addObserver(PREF_VERTICAL_ACCENT_MODE, this);
    Services.prefs.addObserver(PREF_VERTICAL_ACCENT_CUSTOM, this);
    Services.prefs.addObserver(PREF_ARC_MODE_ENABLED, this);
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
    return Services.prefs.getBoolPref(PREF_VERTICAL_COLLAPSE, false);
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

  _isEssentialsPromoEnabled() {
    return Services.prefs.getBoolPref(PREF_VERTICAL_ESSENTIALS_PROMO, true);
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

  _applyEssentialsPromo(root) {
    root.setAttribute(
      'midori-vt-essentials-promo',
      this._isEssentialsPromoEnabled() ? 'true' : 'false'
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
    this._applyEssentialsPromo(root);
    root.setAttribute('midori-vt-essentials-enabled', this._isEssentialsEnabled() ? 'true' : 'false');
    root.setAttribute('midori-vt-essentials-max', String(this._getEssentialsMax()));
    root.setAttribute('midori-arc-mode', this._isArcModeEnabled() ? 'true' : 'false');

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
    root.removeAttribute('midori-vt-essentials-promo');
    root.removeAttribute('midori-vt-essentials-enabled');
    root.removeAttribute('midori-vt-essentials-max');
    root.removeAttribute('midori-vt-has-essentials');
    root.removeAttribute('midori-vt-essentials-count');
    root.removeAttribute('midori-vt-has-pinned');
    root.removeAttribute('midori-vt-pinned-count');
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
      Services.prefs.setCharPref('sidebar.visibility', 'always-show');
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
    const existing = doc.getElementById(STYLE_ID);
    if (existing) existing.remove();

    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = this.isEnabled() ? this._buildVerticalCSS() : this._buildBaseCSS();
    doc.documentElement.appendChild(style);

    if (this.isEnabled()) {
      doc.documentElement.removeAttribute('midori-horizontal-tabs');
      doc.documentElement.setAttribute('midori-vertical-tabs', this._getVerticalSide());
      this._applyVerticalRootState(doc);
      this._initEssentialsPromo(win);
      this._initEssentialsContextMenu(win);
      this._updatePinnedState(win);
    } else {
      doc.documentElement.removeAttribute('midori-vertical-tabs');
      doc.documentElement.setAttribute('midori-horizontal-tabs', this._getHorizontalPosition());
      this._clearVerticalRootState(doc);
      this._removeEssentialsPromo(win);
      this._updateEssentialsContextMenu(win);
    }

    // --- Move TabsToolbar for bottom horizontal tabs ---
    this._applyBottomTabs(doc);

    // --- Pinned tabs icon feature (Natsumi-inspired) ---
    this._initPinnedTabsIcon(win);

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
      this._trackWindowObserver(win, obs);
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
      const containerObserver = new win.MutationObserver((mutations) => {
        for (const m of mutations) {
          for (const node of m.addedNodes) {
            if (node.nodeName === 'tab') {
              copyTabIcon(node);
              observeTab(node);
            }
          }
        }
      });
      containerObserver.observe(container, { childList: true });
      this._trackWindowObserver(win, containerObserver);
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

  _updatePinnedState(win) {
    const doc = win?.document;
    const gBrowser = win?.gBrowser;
    if (!doc || !gBrowser) return;

    const root = doc.documentElement;
    const pinnedTabs = gBrowser.tabs.filter(tab => tab.pinned && !tab.closing);
    const essentialTabs = this._normalizeEssentials(win, pinnedTabs);
    const pinnedCount = pinnedTabs.length;
    const essentialsCount = essentialTabs.length;

    for (const tab of pinnedTabs) {
      tab.removeAttribute(FIRST_REGULAR_PINNED_ATTR);
    }

    const firstRegularPinned = pinnedTabs.find(tab => !tab.hasAttribute(ESSENTIAL_ATTR));
    if (firstRegularPinned) {
      firstRegularPinned.setAttribute(FIRST_REGULAR_PINNED_ATTR, 'true');
    }

    root.setAttribute('midori-vt-pinned-count', String(pinnedCount));
    root.setAttribute('midori-vt-has-pinned', pinnedCount > 0 ? 'true' : 'false');
    root.setAttribute('midori-vt-essentials-count', String(essentialsCount));
    root.setAttribute('midori-vt-has-essentials', essentialsCount > 0 ? 'true' : 'false');

    this._updateEssentialsPromo(win, pinnedCount, essentialsCount);
  },

  _normalizeEssentials(win, pinnedTabs) {
    if (!win?.gBrowser) {
      return [];
    }

    const maxEssentials = this._getEssentialsMax();
    const essentialsEnabled = this._isEssentialsEnabled();
    const gBrowser = win.gBrowser;

    if (!essentialsEnabled) {
      for (const tab of pinnedTabs) {
        if (tab.hasAttribute(ESSENTIAL_ATTR)) {
          tab.removeAttribute(ESSENTIAL_ATTR);
        }
      }
      return [];
    }

    const essentialTabs = [];
    for (const tab of pinnedTabs) {
      if (!tab.hasAttribute(ESSENTIAL_ATTR)) {
        continue;
      }
      if (essentialTabs.length >= maxEssentials) {
        tab.removeAttribute(ESSENTIAL_ATTR);
        continue;
      }
      essentialTabs.push(tab);
    }

    // Keep essentials grouped at the beginning of the pinned area.
    for (let i = 0; i < essentialTabs.length; i++) {
      const tab = essentialTabs[i];
      if (tab._tPos !== i) {
        gBrowser.moveTabTo(tab, i);
      }
    }

    return gBrowser.tabs.filter(
      tab => tab.pinned && !tab.closing && tab.hasAttribute(ESSENTIAL_ATTR)
    );
  },

  _canAddCurrentToEssentials(win, essentialsCount = null) {
    const selectedTab = win?.gBrowser?.selectedTab;
    if (!selectedTab || selectedTab.closing || selectedTab.hasAttribute(ESSENTIAL_ATTR)) {
      return false;
    }
    if (essentialsCount === null) {
      essentialsCount = win.gBrowser.tabs.filter(
        tab => tab.pinned && !tab.closing && tab.hasAttribute(ESSENTIAL_ATTR)
      ).length;
    }
    return this._isEssentialsEnabled() && essentialsCount < this._getEssentialsMax();
  },

  _isEssentialsAtCapacity(win, contextTab = null) {
    if (!win?.gBrowser) {
      return true;
    }

    const max = this._getEssentialsMax();
    let count = win.gBrowser.tabs.filter(
      tab => tab.pinned && !tab.closing && tab.hasAttribute(ESSENTIAL_ATTR)
    ).length;

    if (contextTab?.hasAttribute?.(ESSENTIAL_ATTR)) {
      count -= 1;
    }

    return count >= max;
  },

  _shouldMarkTabEssentialByPosition(win, tab) {
    if (!win?.gBrowser || !tab?.pinned || tab.closing || !this._isEssentialsEnabled()) {
      return false;
    }
    return tab._tPos < this._getEssentialsMax();
  },

  _handlePinnedTabMove(win, movedTab) {
    if (!this.isEnabled() || !this._isEssentialsEnabled()) {
      return;
    }
    if (!movedTab || movedTab.closing || !movedTab.pinned) {
      return;
    }

    if (this._shouldMarkTabEssentialByPosition(win, movedTab)) {
      movedTab.setAttribute(ESSENTIAL_ATTR, 'true');
    } else if (movedTab.hasAttribute(ESSENTIAL_ATTR)) {
      movedTab.removeAttribute(ESSENTIAL_ATTR);
    }
  },

  _setTabEssential(win, tab, value) {
    if (!win?.gBrowser || !tab || tab.closing) {
      return;
    }

    if (!value) {
      tab.removeAttribute(ESSENTIAL_ATTR);
      this._updatePinnedState(win);
      return;
    }

    if (!tab.pinned) {
      win.gBrowser.pinTab(tab);
    }
    tab.setAttribute(ESSENTIAL_ATTR, 'true');
    this._updatePinnedState(win);
  },

  _updateEssentialsPromo(win, pinnedCount, essentialsCount) {
    const doc = win?.document;
    if (!doc) return;

    if (
      !this.isEnabled() ||
      !this._isEssentialsEnabled() ||
      !this._isEssentialsPromoEnabled() ||
      !this._isShowPinnedSectionEnabled()
    ) {
      this._removeEssentialsPromo(win);
      return;
    }

    const pinnedContainer = doc.getElementById('pinned-tabs-container');
    if (!pinnedContainer || pinnedContainer.getAttribute('orient') !== 'vertical') {
      this._removeEssentialsPromo(win);
      return;
    }

    if (essentialsCount > 0) {
      this._removeEssentialsPromo(win);
      return;
    }

    let promo = doc.getElementById(ESSENTIALS_PROMO_ID);
    if (!promo) {
      promo = doc.createXULElement('vbox');
      promo.id = ESSENTIALS_PROMO_ID;
      promo.className = 'midori-essentials-promo';

      const title = doc.createXULElement('label');
      title.className = 'midori-essentials-promo-title';
      title.setAttribute('value', 'Pin your essentials');

      const subtitle = doc.createXULElement('label');
      subtitle.className = 'midori-essentials-promo-subtitle';
      subtitle.setAttribute('value', 'Pin important tabs for instant access here.');

      const button = doc.createXULElement('toolbarbutton');
      button.id = 'midori-essentials-promo-button';
      button.className = 'toolbarbutton-1 midori-essentials-promo-button';
      button.setAttribute('label', 'Add current to essentials');
      button.setAttribute('tooltiptext', 'Pin and mark the selected tab as essential');
      button.addEventListener('command', () => {
        const tab = win.gBrowser?.selectedTab;
        if (!tab || !this._canAddCurrentToEssentials(win, essentialsCount)) {
          return;
        }
        this._setTabEssential(win, tab, true);
      });

      promo.appendChild(title);
      promo.appendChild(subtitle);
      promo.appendChild(button);

      pinnedContainer.appendChild(promo);
    }

    const button = doc.getElementById('midori-essentials-promo-button');
    if (button) {
      const canAddCurrent = this._canAddCurrentToEssentials(win, essentialsCount);
      button.disabled = !canAddCurrent;
      button.setAttribute(
        'tooltiptext',
        canAddCurrent
          ? 'Pin and mark the selected tab as essential'
          : essentialsCount >= this._getEssentialsMax()
            ? 'You reached the maximum number of essentials'
            : 'Select a regular tab that is not already essential'
      );
    }
  },

  _removeEssentialsPromo(win) {
    const promo = win?.document?.getElementById(ESSENTIALS_PROMO_ID);
    if (promo) {
      promo.remove();
    }
  },

  _initEssentialsContextMenu(win) {
    const doc = win?.document;
    if (!doc || doc._midoriEssentialsContextMenuInit) {
      this._updateEssentialsContextMenu(win);
      return;
    }

    const popup = doc.getElementById('tabContextMenu');
    if (!popup) {
      return;
    }

    let separator = doc.getElementById(ESSENTIALS_CTX_SEPARATOR_ID);
    if (!separator) {
      separator = doc.createXULElement('menuseparator');
      separator.id = ESSENTIALS_CTX_SEPARATOR_ID;
      popup.appendChild(separator);
    }

    let addItem = doc.getElementById(ESSENTIALS_CTX_ADD_ID);
    if (!addItem) {
      addItem = doc.createXULElement('menuitem');
      addItem.id = ESSENTIALS_CTX_ADD_ID;
      addItem.setAttribute('label', 'Add to Essentials');
      addItem.addEventListener('command', () => {
        const tab = win.TabContextMenu?.contextTab;
        if (!tab || tab.closing || tab.hasAttribute(ESSENTIAL_ATTR)) {
          return;
        }
        if (this._isEssentialsAtCapacity(win, tab)) {
          return;
        }
        this._setTabEssential(win, tab, true);
      });
      popup.appendChild(addItem);
    }

    let removeItem = doc.getElementById(ESSENTIALS_CTX_REMOVE_ID);
    if (!removeItem) {
      removeItem = doc.createXULElement('menuitem');
      removeItem.id = ESSENTIALS_CTX_REMOVE_ID;
      removeItem.setAttribute('label', 'Remove from Essentials');
      removeItem.addEventListener('command', () => {
        const tab = win.TabContextMenu?.contextTab;
        if (!tab || tab.closing || !tab.hasAttribute(ESSENTIAL_ATTR)) {
          return;
        }
        this._setTabEssential(win, tab, false);
      });
      popup.appendChild(removeItem);
    }

    const onPopupShowing = event => {
      if (event.target?.id !== 'tabContextMenu') {
        return;
      }
      this._updateEssentialsContextMenu(win);
    };

    this._trackWindowListener(win, popup, 'popupshowing', onPopupShowing);
    doc._midoriEssentialsContextMenuInit = true;
    doc._midoriEssentialsContextMenuPopupHandler = onPopupShowing;

    this._updateEssentialsContextMenu(win);
  },

  _updateEssentialsContextMenu(win) {
    const doc = win?.document;
    if (!doc) {
      return;
    }

    const separator = doc.getElementById(ESSENTIALS_CTX_SEPARATOR_ID);
    const addItem = doc.getElementById(ESSENTIALS_CTX_ADD_ID);
    const removeItem = doc.getElementById(ESSENTIALS_CTX_REMOVE_ID);
    if (!separator || !addItem || !removeItem) {
      return;
    }

    const tab = win.TabContextMenu?.contextTab;
    const canUseEssentials =
      this.isEnabled() &&
      this._isShowPinnedSectionEnabled() &&
      this._isEssentialsEnabled() &&
      !!tab &&
      !tab.closing;

    const tabIsEssential = canUseEssentials && tab.hasAttribute(ESSENTIAL_ATTR);
    const canAdd =
      canUseEssentials &&
      !tabIsEssential &&
      !this._isEssentialsAtCapacity(win, tab);
    const canRemove = canUseEssentials && tabIsEssential;

    separator.hidden = !canUseEssentials;
    addItem.hidden = !canUseEssentials;
    removeItem.hidden = !canUseEssentials;

    addItem.disabled = !canAdd;
    removeItem.disabled = !canRemove;
  },

  _initEssentialsPromo(win) {
    const doc = win?.document;
    if (!doc || doc._midoriEssentialsPromoInit) return;
    doc._midoriEssentialsPromoInit = true;

    let updateFrame = 0;
    const update = () => {
      if (updateFrame) {
        return;
      }
      updateFrame = win.requestAnimationFrame(() => {
        updateFrame = 0;
        this._updatePinnedState(win);
      });
    };
    const updateNow = () => {
      if (updateFrame) {
        win.cancelAnimationFrame(updateFrame);
        updateFrame = 0;
      }
      this._updatePinnedState(win);
    };

    doc._midoriEssentialsPromoUpdate = update;
    this._getWindowState(win).cleanups.push(() => {
      if (updateFrame) {
        win.cancelAnimationFrame(updateFrame);
        updateFrame = 0;
      }
    });

    const tabContainer = win.gBrowser?.tabContainer;
    if (tabContainer) {
      const onTabPinned = event => {
        this._handlePinnedTabMove(win, event.target);
        update();
      };
      const onTabMove = event => {
        this._handlePinnedTabMove(win, event.target);
        update();
      };
      const onTabAttrModified = event => {
        const changed = event.detail?.changed || [];
        if (changed.some(attr => PINNED_STATE_ATTRS.has(attr))) {
          update();
        }
      };
      this._trackWindowListener(win, tabContainer, 'TabPinned', onTabPinned);
      this._trackWindowListener(win, tabContainer, 'TabUnpinned', update);
      this._trackWindowListener(win, tabContainer, 'TabMove', onTabMove);
      this._trackWindowListener(
        win,
        tabContainer,
        'TabAttrModified',
        onTabAttrModified
      );
      this._trackWindowListener(win, tabContainer, 'TabClose', update);
      this._trackWindowListener(win, tabContainer, 'TabOpen', update);
      this._trackWindowListener(win, tabContainer, 'TabSelect', update);
    }

    updateNow();
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
    doc.getElementById(ESSENTIALS_PROMO_ID)?.remove();
    const contextMenu = doc.getElementById('tabContextMenu');
    const contextHandler = doc._midoriEssentialsContextMenuPopupHandler;
    if (contextMenu && contextHandler) {
      contextMenu.removeEventListener('popupshowing', contextHandler);
    }
    doc.getElementById(ESSENTIALS_CTX_SEPARATOR_ID)?.remove();
    doc.getElementById(ESSENTIALS_CTX_ADD_ID)?.remove();
    doc.getElementById(ESSENTIALS_CTX_REMOVE_ID)?.remove();
    this._restoreTabsToolbar(doc);
    this._clearVerticalRootState(doc);
    doc.documentElement.removeAttribute('midori-vertical-tabs');
    doc.documentElement.removeAttribute('midori-horizontal-tabs');

    for (const tab of win.gBrowser?.tabs || []) {
      tab.style.removeProperty('--midori-tab-icon');
      tab.removeAttribute(FIRST_REGULAR_PINNED_ATTR);
    }

    delete doc._midoriPinnedIconInit;
    delete doc._midoriUrlbarAutoSelectInit;
    delete doc._midoriEssentialsContextMenuInit;
    delete doc._midoriEssentialsContextMenuPopupHandler;
    delete doc._midoriEssentialsPromoInit;
    delete doc._midoriEssentialsPromoUpdate;
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
