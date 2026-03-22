import * as Prefs from 'resource:///modules/msidebar/SidebarPrefs.mjs';
import { loadStore, saveStore } from 'resource:///modules/msidebar/SidebarStore.mjs';
import { validateStore } from 'resource:///modules/msidebar/SidebarModel.mjs';
import { createSidebarUI } from 'resource:///modules/msidebar/SidebarUI.mjs';

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI: 'moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs',
  clearTimeout: 'resource://gre/modules/Timer.sys.mjs',
  setTimeout: 'resource://gre/modules/Timer.sys.mjs',
});

const PREF_VERTICAL_TABS = 'midori.verticaltabs.enabled';

export const MidoriSidebar = {
  _initialized: false,
  _uis: new WeakMap(),
  _stores: new WeakMap(),
  _saveTimers: new WeakMap(),
  _retryTimers: new WeakMap(),

  init() {
    if (this._initialized) return;
    this._initialized = true;

    Services.prefs.addObserver(Prefs.PREF_ENABLED, this);
    Services.prefs.addObserver(Prefs.PREF_POSITION, this);
    Services.prefs.addObserver(Prefs.PREF_WIDTH, this);
    Services.prefs.addObserver(Prefs.PREF_AUTOHIDE_ENABLED, this);
    Services.prefs.addObserver(Prefs.PREF_AUTOHIDE_MODE, this);
    Services.prefs.addObserver(Prefs.PREF_ANIMATIONS_ENABLED, this);

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
      this._applyFirefoxSidebarDefaults();
      this._refreshAllWindows();
      return;
    }

    if (topic === 'browser-delayed-startup-finished') {
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
        this._scheduleRetry(win);
        return;
      }

      this._uis.set(win, ui);
      this._stores.set(win, store);

      ui.setStore(store);
      this._syncWindowUI(win);
    } catch {
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
    const position = Prefs.getPosition();
    const width = Prefs.getWidth();
    const autohideEnabled = Prefs.getAutohideEnabled();
    const autohideMode = Prefs.getAutohideMode();
    const animationsEnabled = Prefs.getAnimationsEnabled();

    ui.setPosition(position);
    ui.setCssWidth(width);
    ui.setAnimated?.(animationsEnabled);
    ui.setAutohideMode?.(autohideMode);
    ui.setAutohide(autohideEnabled);
    ui.setVisible(enabled);
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
    if (verticalTabs || enabled) return;
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
};
