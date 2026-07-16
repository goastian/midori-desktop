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
const CONTENT_CTX_SEPARATOR_ID = 'midori-msidebar-content-context-separator';
const CONTENT_CTX_MENU_ID = 'midori-msidebar-content-menu';
const CONTENT_CTX_OPEN_ID = 'midori-msidebar-content-open';
const CONTENT_CTX_TEMP_ID = 'midori-msidebar-content-open-temp';
const CONTENT_CTX_EXTENSION_ID = 'midori-msidebar-content-extension';
const TAB_CTX_SEPARATOR_ID = 'midori-msidebar-tab-context-separator';
const TAB_CTX_MENU_ID = 'midori-msidebar-tab-menu';
const TAB_CTX_OPEN_ID = 'midori-msidebar-tab-open';
const TAB_CTX_TEMP_ID = 'midori-msidebar-tab-open-temp';

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
      this._initContextMenus(win);
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
    ui.setVisible(enabled, { openPanel: false });
    ui.refresh?.();
  },

  _ensureSeededDefaultPanels(win) {
    try {
      if (Services.prefs.getBoolPref(PREF_SEEDED_DEFAULT_PANELS, false)) return;
    } catch {}

    const store = this._stores.get(win);
    const ui = this._uis.get(win);
    if (!store || !ui) return;

    // Early exit if store already has panels (schema may vary v1/v2, be defensive)
    if (store.panels?.length > 0) return;

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

    const validated = validateStore(seeded, { includeTemporary: true });
    this._stores.set(win, validated);
    ui.setStore(validated);
    this._scheduleSave(win, validated);

    // Mark as seeded ONLY after successful creation and update
    try {
      Services.prefs.setBoolPref(PREF_SEEDED_DEFAULT_PANELS, true);
    } catch {}
  },

  _scheduleSave(win, nextStore) {
    const ui = this._uis.get(win);
    if (!ui) return;

    const runtimeValidated = validateStore(nextStore, { includeTemporary: true });
    const persistedValidated = validateStore(runtimeValidated);
    this._stores.set(win, runtimeValidated);

    const existing = this._saveTimers.get(win);
    if (existing) {
      try {
        lazy.clearTimeout(existing);
      } catch {}
    }

    const timer = lazy.setTimeout(() => {
      this._saveTimers.delete(win);
      saveStore(persistedValidated).catch(() => {});
    }, 400);
    this._saveTimers.set(win, timer);
  },

  _cleanupWindow(win) {
    const ui = this._uis.get(win);
    const store = this._stores.get(win);
    if (store?.panels?.some?.((p) => p?.temporary)) {
      const cleaned = validateStore(store, { includeTemporary: false });
      this._stores.set(win, cleaned);
      saveStore(cleaned).catch(() => {});
    }
    if (ui) {
      try {
        ui.destroy();
      } catch {}
    }
    this._cleanupContextMenus(win);
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

  _initContextMenus(win) {
    this._initContentContextMenu(win);
    this._initTabContextMenu(win);
  },

  _createMenuItem(doc, id, label, command) {
    let item = doc.getElementById(id);
    if (item) return item;
    item = doc.createXULElement('menuitem');
    item.id = id;
    item.setAttribute('label', label);
    item.addEventListener('command', command);
    return item;
  },

  _createSeparator(doc, id) {
    let sep = doc.getElementById(id);
    if (sep) return sep;
    sep = doc.createXULElement('menuseparator');
    sep.id = id;
    return sep;
  },

  _initContentContextMenu(win) {
    const doc = win?.document;
    const popup = doc?.getElementById?.('contentAreaContextMenu');
    if (!doc || !popup || doc._midoriMSidebarContentContextInit) return;

    const sep = this._createSeparator(doc, CONTENT_CTX_SEPARATOR_ID);
    const openItem = this._createMenuItem(doc, CONTENT_CTX_OPEN_ID, 'Open in Sidebar', () => {
      this._openContextPanel(win, { temporary: false });
    });
    const tempItem = this._createMenuItem(doc, CONTENT_CTX_TEMP_ID, 'Open in Temporary Sidebar Panel', () => {
      this._openContextPanel(win, { temporary: true });
    });
    const extItem = this._createMenuItem(doc, CONTENT_CTX_EXTENSION_ID, 'Send extension sidebar to rail', () => {
      this._openContextPanel(win, { temporary: false, extensionOnly: true });
    });

    const menu = doc.createXULElement('menu');
    menu.id = CONTENT_CTX_MENU_ID;
    menu.setAttribute('label', 'Open in Midori Sidebar');
    const submenu = doc.createXULElement('menupopup');
    submenu.appendChild(openItem);
    submenu.appendChild(tempItem);
    submenu.appendChild(extItem);
    menu.appendChild(submenu);

    popup.appendChild(sep);
    popup.appendChild(menu);

    const onShowing = (event) => {
      if (event.target?.id !== 'contentAreaContextMenu') return;
      this._updateContentContextMenu(win);
    };
    popup.addEventListener('popupshowing', onShowing);
    doc._midoriMSidebarContentContextInit = true;
    doc._midoriMSidebarContentContextHandler = onShowing;
  },

  _initTabContextMenu(win) {
    const doc = win?.document;
    const popup = doc?.getElementById?.('tabContextMenu');
    if (!doc || !popup || doc._midoriMSidebarTabContextInit) return;

    const sep = this._createSeparator(doc, TAB_CTX_SEPARATOR_ID);
    const openItem = this._createMenuItem(doc, TAB_CTX_OPEN_ID, 'Open Tab in Sidebar', () => {
      this._openTabPanel(win, { temporary: false });
    });
    const tempItem = this._createMenuItem(doc, TAB_CTX_TEMP_ID, 'Open Tab as Temporary Sidebar Panel', () => {
      this._openTabPanel(win, { temporary: true });
    });

    const menu = doc.createXULElement('menu');
    menu.id = TAB_CTX_MENU_ID;
    menu.setAttribute('label', 'Open Tab in Midori Sidebar');
    const submenu = doc.createXULElement('menupopup');
    submenu.appendChild(openItem);
    submenu.appendChild(tempItem);
    menu.appendChild(submenu);

    popup.appendChild(sep);
    popup.appendChild(menu);

    const onShowing = (event) => {
      if (event.target?.id !== 'tabContextMenu') return;
      this._updateTabContextMenu(win);
    };
    popup.addEventListener('popupshowing', onShowing);
    doc._midoriMSidebarTabContextInit = true;
    doc._midoriMSidebarTabContextHandler = onShowing;
  },

  _cleanupContextMenus(win) {
    const doc = win?.document;
    if (!doc) return;
    try {
      const contentPopup = doc.getElementById('contentAreaContextMenu');
      const handler = doc._midoriMSidebarContentContextHandler;
      if (contentPopup && handler) contentPopup.removeEventListener('popupshowing', handler);
    } catch {}
    try {
      const tabPopup = doc.getElementById('tabContextMenu');
      const handler = doc._midoriMSidebarTabContextHandler;
      if (tabPopup && handler) tabPopup.removeEventListener('popupshowing', handler);
    } catch {}
    for (const id of [
      CONTENT_CTX_SEPARATOR_ID,
      CONTENT_CTX_MENU_ID,
      CONTENT_CTX_OPEN_ID,
      CONTENT_CTX_TEMP_ID,
      CONTENT_CTX_EXTENSION_ID,
      TAB_CTX_SEPARATOR_ID,
      TAB_CTX_MENU_ID,
      TAB_CTX_OPEN_ID,
      TAB_CTX_TEMP_ID,
    ]) {
      try {
        doc.getElementById(id)?.remove?.();
      } catch {}
    }
    doc._midoriMSidebarContentContextInit = false;
    doc._midoriMSidebarTabContextInit = false;
  },

  _contextPayload(win) {
    const context = win.gContextMenu;
    const linkUrl = context?.linkURL || context?.linkUrl || '';
    const pageUrl = context?.browser?.currentURI?.spec || win.gBrowser?.selectedBrowser?.currentURI?.spec || '';
    const url = linkUrl || pageUrl;
    let title = '';
    try {
      title = context?.linkTextStr || context?.browser?.contentTitle || win.gBrowser?.selectedTab?.label || '';
    } catch {}
    return { url, title };
  },

  _tabPayload(win) {
    const tab = win.TabContextMenu?.contextTab || win.gBrowser?.selectedTab;
    const browser = tab?.linkedBrowser;
    return {
      url: browser?.currentURI?.spec || '',
      title: tab?.label || browser?.contentTitle || '',
      userContextId: Number.parseInt(tab?.getAttribute?.('usercontextid') || '0', 10) || 0,
    };
  },

  _isMozExtensionUrl(url) {
    return typeof url === 'string' && url.startsWith('moz-extension://');
  },

  _updateContentContextMenu(win) {
    const doc = win?.document;
    const payload = this._contextPayload(win);
    const canOpen = !!payload.url && /^(https?:|file:|moz-extension:)/.test(payload.url);
    const isExtension = this._isMozExtensionUrl(payload.url);
    for (const id of [CONTENT_CTX_SEPARATOR_ID, CONTENT_CTX_MENU_ID]) {
      const node = doc?.getElementById?.(id);
      if (node) node.hidden = !canOpen;
    }
    const extItem = doc?.getElementById?.(CONTENT_CTX_EXTENSION_ID);
    if (extItem) extItem.hidden = !isExtension;
  },

  _updateTabContextMenu(win) {
    const doc = win?.document;
    const payload = this._tabPayload(win);
    const canOpen = !!payload.url && /^(https?:|file:|moz-extension:)/.test(payload.url);
    for (const id of [TAB_CTX_SEPARATOR_ID, TAB_CTX_MENU_ID]) {
      const node = doc?.getElementById?.(id);
      if (node) node.hidden = !canOpen;
    }
  },

  _openContextPanel(win, { temporary = false, extensionOnly = false } = {}) {
    const payload = this._contextPayload(win);
    if (extensionOnly && !this._isMozExtensionUrl(payload.url)) return;
    this._openPanel(win, { ...payload, temporary });
  },

  _openTabPanel(win, { temporary = false } = {}) {
    this._openPanel(win, { ...this._tabPayload(win), temporary });
  },

  _openPanel(win, payload) {
    const ui = this._uis.get(win);
    if (!ui?.addPanelFromContext) return;
    const panel = ui.addPanelFromContext(payload);
    if (!panel) return;
    try {
      Services.prefs.setBoolPref(Prefs.PREF_ENABLED, true);
    } catch {}
    this._syncWindowUI(win);
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
