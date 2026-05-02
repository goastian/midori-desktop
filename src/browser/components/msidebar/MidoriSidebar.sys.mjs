import * as Prefs from 'resource:///modules/msidebar/SidebarPrefs.mjs';
import { loadStore, saveStore } from 'resource:///modules/msidebar/SidebarStore.mjs';
import { createPanel, validateStore } from 'resource:///modules/msidebar/SidebarModel.mjs';
import { createSidebarUI } from 'resource:///modules/msidebar/SidebarUI.mjs';

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI: 'moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs',
  clearTimeout: 'resource://gre/modules/Timer.sys.mjs',
  setTimeout: 'resource://gre/modules/Timer.sys.mjs',
});

const PREF_VERTICAL_TABS = 'midori.verticaltabs.enabled';
const PREF_VERTICAL_POSITION = 'midori.verticaltabs.position';
const PREF_SEEDED_DEFAULT_PANELS = 'midori.msidebar.seededDefaultPanels';

export const MidoriSidebar = {
  _initialized: false,
  _uis: new WeakMap(),
  _stores: new WeakMap(),
  _saveTimers: new WeakMap(),
  _retryTimers: new WeakMap(),

  init() {
    if (this._initialized) return;
    this._initialized = true;
    this._log('init');

    Services.prefs.addObserver(Prefs.PREF_ENABLED, this);
    Services.prefs.addObserver(Prefs.PREF_POSITION, this);
    Services.prefs.addObserver(Prefs.PREF_WIDTH, this);
    Services.prefs.addObserver(Prefs.PREF_AUTOHIDE_ENABLED, this);
    Services.prefs.addObserver(Prefs.PREF_AUTOHIDE_MODE, this);
    Services.prefs.addObserver(Prefs.PREF_ANIMATIONS_ENABLED, this);
    Services.prefs.addObserver(Prefs.PREF_HIDE_PANEL_WHEN_HIDDEN, this);
    Services.prefs.addObserver(Prefs.PREF_NEW_PANEL_BUTTON_POSITION, this);
    Services.prefs.addObserver(Prefs.PREF_GEOMETRY_HINT, this);
    Services.prefs.addObserver(Prefs.PREF_CONTAINER_INDICATOR, this);
    Services.prefs.addObserver(Prefs.PREF_TOOLTIP_MODE, this);
    Services.prefs.addObserver(Prefs.PREF_TOOLTIP_FULL_URL, this);
    Services.prefs.addObserver(Prefs.PREF_WEBPANEL_TOOLBAR_AUTOHIDE, this);
    Services.prefs.addObserver(Prefs.PREF_WEBPANEL_TOOLBAR_AUTOHIDE_BACK, this);
    Services.prefs.addObserver(Prefs.PREF_WEBPANEL_TOOLBAR_AUTOHIDE_FORWARD, this);
    Services.prefs.addObserver(Prefs.PREF_DEBUG, this);
    Services.prefs.addObserver(PREF_VERTICAL_TABS, this);
    Services.prefs.addObserver(PREF_VERTICAL_POSITION, this);

    Services.obs.addObserver(this, 'browser-delayed-startup-finished');
    Services.obs.addObserver(this, 'domwindowclosed');

    this._ensureToolbarWidget();
    this._applyFirefoxSidebarDefaults();

    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      if (win.document.readyState === 'complete') {
        this._applyToWindow(win);
      }
    }
  },

  observe(subject, topic) {
    if (topic === 'nsPref:changed') {
      this._log('pref-changed');
      this._applyFirefoxSidebarDefaults();
      this._refreshAllWindows();
      return;
    }

    if (topic === 'browser-delayed-startup-finished') {
      this._log('window-startup');
      this._applyToWindow(subject);
      return;
    }

    if (topic === 'domwindowclosed') {
      this._cleanupWindow(subject);
    }
  },

  _refreshAllWindows() {
    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      if (win.document.readyState === 'complete') {
        this._syncWindowUI(win);
      }
    }
  },

  async _applyToWindow(win) {
    if (!win || !win.document) return;
    if (this._uis.has(win)) {
      this._syncWindowUI(win);
      return;
    }

    try {
      const store = await loadStore();
      const ui = createSidebarUI(win, {
        onStoreChanged: (nextStore) => this._scheduleSave(win, nextStore),
      });

      if (!ui || !ui.root) {
        this._log('ui-not-ready');
        this._scheduleRetry(win);
        return;
      }

      this._uis.set(win, ui);
      this._stores.set(win, store);

      ui.setStore(store);
      this._syncWindowUI(win);
      this._log('ui-ready');
    } catch {
      this._log('ui-error');
      this._scheduleRetry(win);
    }
  },

  _syncWindowUI(win) {
    const ui = this._uis.get(win);
    if (!ui || !ui.root) {
      this._scheduleRetry(win);
      return;
    }

    const enabled = Prefs.getEnabled();
    const position = this._getEffectiveSidebarPosition(win);
    const width = Prefs.getWidth();
    const autohideEnabled = Prefs.getAutohideEnabled();
    const autohideMode = Prefs.getAutohideMode();
    const animationsEnabled = Prefs.getAnimationsEnabled();

    if (enabled) this._ensureSeededDefaultPanels(win);
    ui.setPosition(position);
    ui.setCssWidth(width);
    ui.setAnimated?.(animationsEnabled);
    ui.setAutohideMode?.(autohideMode);
    ui.setAutohide(autohideEnabled);
    ui.setVisible(enabled);
    ui.refresh?.();
  },

  _ensureSeededDefaultPanels(win) {
    try {
      if (Services.prefs.getBoolPref(PREF_SEEDED_DEFAULT_PANELS, false)) return;
    } catch {}

    const store = this._stores.get(win);
    const ui = this._uis.get(win);
    if (!store || !ui) return;

    try {
      Services.prefs.setBoolPref(PREF_SEEDED_DEFAULT_PANELS, true);
    } catch {}

    try {
      if (Array.isArray(store.panels) && store.panels.length) return;
    } catch {}

    const defaults = [
      { url: 'https://wallet.astian.org', title: 'Midori Wallet' },
      { url: 'https://cloud2.astian.org', title: 'Astian Cloud' },
      { url: 'https://astian.org/community', title: 'Astian Community' },
      { url: 'https://calendar.astian.org', title: 'Astian Calendar' },
      { url: 'https://contacts.astian.org', title: 'Astian Contacts' },
    ];

    const seeded = { ...store, panels: Array.isArray(store.panels) ? [...store.panels] : [], last: { ...(store.last || {}) } };
    for (const d of defaults) {
      const p = createPanel({ url: d.url, title: d.title });
      if (!p) continue;
      p.loadOnStartup = true;
      seeded.panels.push(p);
    }

    const validated = validateStore(seeded);
    this._stores.set(win, validated);
    ui.setStore(validated);
    this._scheduleSave(win, validated);
  },

  _scheduleSave(win, nextStore) {
    const ui = this._uis.get(win);
    if (!ui) return;

    const validated = validateStore(nextStore);
    this._stores.set(win, validated);

    const existing = this._saveTimers.get(win);
    if (existing) {
      try {
        lazy.clearTimeout(existing);
      } catch {}
    }

    const timer = lazy.setTimeout(() => {
      this._saveTimers.delete(win);
      saveStore(validated).catch(() => {});
    }, 400);
    this._saveTimers.set(win, timer);
  },

  _cleanupWindow(win) {
    const ui = this._uis.get(win);
    if (ui) {
      try {
        ui.destroy();
      } catch {}
    }
    this._uis.delete(win);
    this._stores.delete(win);
    const t = this._saveTimers.get(win);
    if (t) {
      try {
        lazy.clearTimeout(t);
      } catch {}
    }
    this._saveTimers.delete(win);
    const r = this._retryTimers.get(win);
    if (r) {
      try {
        lazy.clearTimeout(r);
      } catch {}
    }
    this._retryTimers.delete(win);
    try {
      const ks = win.document.getElementById('midori-msidebar-keyset');
      ks?.remove?.();
    } catch {}
  },

  _scheduleRetry(win) {
    if (!win || !win.document) return;
    const existing = this._retryTimers.get(win);
    if (existing) return;
    const timer = lazy.setTimeout(() => {
      this._retryTimers.delete(win);
      this._applyToWindow(win);
    }, 750);
    this._retryTimers.set(win, timer);
  },

  _log(msg) {
    try {
      if (!Prefs.getDebugEnabled()) return;
      Services.console.logStringMessage(`MidoriSidebar: ${msg}`);
    } catch {}
  },

  _ensureToolbarWidget() {
    const id = 'midori-msidebar-button';
    let cui;
    try {
      cui = lazy.CustomizableUI;
    } catch {
      return;
    }
    try {
      if (cui.getWidget(id)) return;
      cui.createWidget({
        id,
        label: 'Sidebar',
        tooltiptext: 'Sidebar',
        defaultArea: cui.AREA_NAVBAR,
        onCommand: () => {
          const enabled = Services.prefs.getBoolPref(Prefs.PREF_ENABLED, false);
          Services.prefs.setBoolPref(Prefs.PREF_ENABLED, !enabled);
        },
      });
    } catch {}
  },

  _applyFirefoxSidebarDefaults() {
    const verticalTabs = Services.prefs.getBoolPref(PREF_VERTICAL_TABS, false);
    const enabled = Services.prefs.getBoolPref(Prefs.PREF_ENABLED, false);
    // When vertical tabs are active, defer to MidoriVerticalTabs for sidebar prefs
    if (verticalTabs) return;
    if (enabled) {
      // msidebar is active but vertical tabs are not — hide Firefox native sidebar
      try {
        Services.prefs.setBoolPref('sidebar.revamp', false);
      } catch {}
      try {
        Services.prefs.setBoolPref('sidebar.verticalTabs', false);
      } catch {}
      try {
        Services.prefs.setCharPref('sidebar.visibility', 'hide');
      } catch {}
      return;
    }
    // Neither is active
    try {
      Services.prefs.setBoolPref('sidebar.revamp', false);
    } catch {}
    try {
      Services.prefs.setBoolPref('sidebar.verticalTabs', false);
    } catch {}
    try {
      Services.prefs.setCharPref('sidebar.visibility', 'hide');
    } catch {}
  },

  _getVerticalTabsEnabled() {
    return Services.prefs.getBoolPref(PREF_VERTICAL_TABS, false);
  },

  _getVerticalTabsSide(win = null) {
    try {
      const attr = win?.document?.documentElement?.getAttribute?.('midori-vertical-tabs');
      if (attr === 'left' || attr === 'right') {
        return attr;
      }
    } catch {}
    // Read directly from the vtabs position pref — guaranteed up-to-date since
    // setTabLayout writes it synchronously before any pref observer fires.
    try {
      const side = Services.prefs.getStringPref(PREF_VERTICAL_POSITION, 'left');
      return side === 'right' ? 'right' : 'left';
    } catch {}
    return 'left';
  },

  _getEffectiveSidebarPosition(win = null) {
    const preferred = Prefs.getPosition();
    if (!this._getVerticalTabsEnabled()) {
      return preferred;
    }
    return this._getVerticalTabsSide(win) === 'left' ? 'right' : 'left';
  },
};
