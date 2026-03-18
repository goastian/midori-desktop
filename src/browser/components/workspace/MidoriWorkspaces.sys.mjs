/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * MidoriWorkspaces — Workspace management for the Midori browser chrome.
 *
 * Allows users to organize tabs into named workspaces. Each workspace has a
 * name, icon, and a set of tabs. Switching workspaces shows/hides the
 * corresponding tabs. The active workspace selector is injected into the
 * TabsToolbar, in the position where Firefox View used to be.
 *
 * Persists workspace data per-profile via JSON in the profile directory.
 *
 * Preferences:
 *   - midori.workspaces.enabled       (bool, default: true)
 *   - midori.workspaces.show-button   (bool, default: true)
 *
 * Security:
 *   - All data is sanitized before DOM injection (no innerHTML with user data)
 *   - Workspace names are length-limited and HTML-escaped
 *   - File I/O uses IOUtils with atomic writes
 *   - No eval() or dynamic code execution
 *
 * Performance:
 *   - Tab visibility uses lightweight attribute toggling (not DOM removal)
 *   - Debounced saves to avoid excessive disk I/O
 *   - Lazy initialization per window
 *   - WeakMap for per-window state to avoid memory leaks
 *   - No polling — event-driven architecture
 *
 * @patch Midori Browser
 */

const PREF_ENABLED = 'midori.workspaces.enabled';
const PREF_SHOW_BUTTON = 'midori.workspaces.show-button';
const PREF_VERTICAL = 'midori.verticaltabs.enabled';
const PREF_SIDEBAR_VERTICAL = 'sidebar.verticalTabs';

const WORKSPACE_ATTR = 'midori-workspace-id';
const STYLE_ID = 'midori-workspaces-style';
const SELECTOR_ID = 'midori-workspace-selector';
const POPUP_ID = 'midori-workspace-popup';
const INDICATOR_ID = 'midori-workspace-indicator';
const INDICATOR_ICON_ID = 'midori-workspace-indicator-icon';
const INDICATOR_NAME_ID = 'midori-workspace-indicator-name';
const QUICK_ICONS_ID = 'midori-workspace-quick-icons';
const MAX_WORKSPACES = 25;
const MAX_NAME_LENGTH = 32;
const SAVE_DEBOUNCE_MS = 500;

const WORKSPACE_ICONS = [
  { id: 'default', emoji: '🏠' },
  { id: 'work', emoji: '💼' },
  { id: 'personal', emoji: '👤' },
  { id: 'shopping', emoji: '🛒' },
  { id: 'social', emoji: '💬' },
  { id: 'dev', emoji: '💻' },
  { id: 'research', emoji: '🔬' },
  { id: 'music', emoji: '🎵' },
  { id: 'gaming', emoji: '🎮' },
  { id: 'finance', emoji: '💰' },
  { id: 'travel', emoji: '✈️' },
  { id: 'education', emoji: '📚' },
  { id: 'health', emoji: '❤️' },
  { id: 'news', emoji: '📰' },
  { id: 'creative', emoji: '🎨' },
  { id: 'star', emoji: '⭐' },
];

function getEmojiForIcon(iconId) {
  const icon = WORKSPACE_ICONS.find((i) => i.id === iconId);
  return icon ? icon.emoji : '🏠';
}

function sanitizeName(name) {
  if (typeof name !== 'string') return 'Workspace';
  return name.slice(0, MAX_NAME_LENGTH).replace(/[<>"'&]/g, '');
}

function generateId() {
  // Use crypto.randomUUID where available, fallback to Services.uuid
  try {
    return Services.uuid.generateUUID().toString().replace(/[{}]/g, '');
  } catch {
    return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

/**
 * Returns the path to the workspaces JSON store in the user's profile.
 */
function getStoreFilePath() {
  return PathUtils.join(PathUtils.profileDir, 'midori-workspaces.json');
}

// Lazy import for setTimeout — MUST be before any usage
const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  setTimeout: 'resource://gre/modules/Timer.sys.mjs',
});

// Build a Set for fast icon validation
const VALID_ICON_IDS = new Set(WORKSPACE_ICONS.map((i) => i.id));

function validateIconId(iconId) {
  return VALID_ICON_IDS.has(iconId) ? iconId : 'default';
}

/**
 * Validates and repairs the workspace store structure.
 * Protects against corrupt or tampered JSON data.
 */
function validateStore(data) {
  if (!data || typeof data !== 'object') return { windows: {} };
  if (!data.windows || typeof data.windows !== 'object') {
    data.windows = {};
  }

  for (const [windowId, winData] of Object.entries(data.windows)) {
    if (!winData || typeof winData !== 'object') {
      delete data.windows[windowId];
      continue;
    }
    if (!Array.isArray(winData.workspaces)) {
      delete data.windows[windowId];
      continue;
    }
    // Validate each workspace entry
    winData.workspaces = winData.workspaces.filter((ws) => {
      if (!ws || typeof ws !== 'object') return false;
      if (typeof ws.id !== 'string' || !ws.id) return false;
      ws.name = sanitizeName(ws.name);
      ws.icon = validateIconId(ws.icon);
      ws.isDefault = !!ws.isDefault;
      return true;
    });
    // Ensure at least one workspace
    if (winData.workspaces.length === 0) {
      delete data.windows[windowId];
      continue;
    }
    // Ensure selectedId is valid
    const ids = new Set(winData.workspaces.map((ws) => ws.id));
    if (!ids.has(winData.selectedId)) {
      winData.selectedId = winData.workspaces[0].id;
    }
  }
  return data;
}

export const MidoriWorkspaces = {
  _initialized: false,
  _windowStates: new WeakMap(),
  _saveTimer: null,
  _storeCache: null,
  _storeDirty: false,

  // =========================================================================
  // Initialization
  // =========================================================================

  init() {
    if (this._initialized) return;
    this._initialized = true;

    Services.prefs.addObserver(PREF_ENABLED, this);
    Services.prefs.addObserver(PREF_SHOW_BUTTON, this);
    Services.prefs.addObserver(PREF_VERTICAL, this);
    Services.prefs.addObserver(PREF_SIDEBAR_VERTICAL, this);

    Services.obs.addObserver(this, 'browser-delayed-startup-finished');
    Services.obs.addObserver(this, 'domwindowclosed');

    // Apply to already-open windows
    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      if (win.document.readyState === 'complete') {
        this._initWindow(win);
      }
    }

    console.log(`MidoriWorkspaces: Initialized (enabled=${this.isEnabled()})`);
  },

  isEnabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  showButton() {
    return Services.prefs.getBoolPref(PREF_SHOW_BUTTON, true);
  },

  // =========================================================================
  // Data persistence (JSON file in profile dir)
  // =========================================================================

  async _loadStore() {
    if (this._storeCache) return this._storeCache;

    const path = getStoreFilePath();
    try {
      const exists = await IOUtils.exists(path);
      if (exists) {
        const raw = await IOUtils.readJSON(path);
        this._storeCache = validateStore(raw);
      } else {
        this._storeCache = { windows: {} };
      }
    } catch (e) {
      console.error('MidoriWorkspaces: Error loading store', e);
      this._storeCache = { windows: {} };
    }
    return this._storeCache;
  },

  _scheduleSave() {
    this._storeDirty = true;
    if (this._saveTimer) return;

    this._saveTimer = lazy.setTimeout(() => {
      this._saveTimer = null;
      this._flushSave();
    }, SAVE_DEBOUNCE_MS);
  },

  async _flushSave() {
    if (!this._storeDirty || !this._storeCache) return;
    this._storeDirty = false;

    const path = getStoreFilePath();
    try {
      await IOUtils.writeJSON(path, this._storeCache, {
        tmpPath: path + '.tmp',
      });
    } catch (e) {
      console.error('MidoriWorkspaces: Error saving store', e);
    }
  },

  /**
   * Get or create workspace data for a given windowId.
   * Returns { workspaces: [...], selectedId: string }
   */
  async _getWindowData(windowId) {
    const store = await this._loadStore();
    if (!store.windows[windowId]) {
      const defaultId = generateId();
      store.windows[windowId] = {
        workspaces: [
          {
            id: defaultId,
            name: 'Default',
            icon: 'default',
            isDefault: true,
          },
        ],
        selectedId: defaultId,
      };
      this._scheduleSave();
    }
    return store.windows[windowId];
  },

  _removeWindowData(windowId) {
    if (this._storeCache?.windows?.[windowId]) {
      delete this._storeCache.windows[windowId];
      this._scheduleSave();
    }
  },

  // =========================================================================
  // Window management
  // =========================================================================

  _getWindowId(win) {
    if (!win.__midoriWorkspaceWindowId) {
      try {
        const outerWindowID = win.windowUtils.outerWindowID;
        win.__midoriWorkspaceWindowId = `mw-${outerWindowID}`;
      } catch {
        win.__midoriWorkspaceWindowId = `mw-${Date.now()}`;
      }
    }
    return win.__midoriWorkspaceWindowId;
  },

  _getWindowState(win) {
    return this._windowStates.get(win);
  },

  async _initWindow(win) {
    if (!this.isEnabled()) return;
    if (this._windowStates.has(win)) return;

    const windowId = this._getWindowId(win);
    const data = await this._getWindowData(windowId);

    const state = {
      windowId,
      data,
      win,
    };
    this._windowStates.set(win, state);

    // In vertical mode, wait for sidebar to be fully initialized
    if (this._isVerticalMode()) {
      try {
        if (win.SidebarController?.promiseInitialized) {
          await win.SidebarController.promiseInitialized;
        }
      } catch (e) {
        console.warn('MidoriWorkspaces: SidebarController init error', e);
      }
    }

    this._injectUI(win, state);
    this._applyWorkspace(win, state, data.selectedId);
    this._attachTabListeners(win, state);
  },

  _destroyWindow(win) {
    const state = this._windowStates.get(win);
    if (!state) return;

    this._detachTabListeners(win, state);
    this._removeUI(win);
    this._windowStates.delete(win);
  },

  // =========================================================================
  // UI Injection — Workspace selector button + popup
  // =========================================================================

  _isVerticalMode() {
    // Check both Midori's pref and Firefox's native sidebar.verticalTabs
    return (
      Services.prefs.getBoolPref(PREF_VERTICAL, false) ||
      Services.prefs.getBoolPref(PREF_SIDEBAR_VERTICAL, false)
    );
  },

  _injectUI(win, state) {
    const doc = win.document;

    // Remove existing
    this._removeUI(win);

    if (!this.showButton()) return;

    const isVertical = this._isVerticalMode();
    console.log(`MidoriWorkspaces: _injectUI (vertical=${isVertical})`);

    if (isVertical) {
      this._injectVerticalWithRetry(win, state, 0);
    } else {
      this._injectHorizontalUI(win, state);
    }
  },

  /**
   * Retry vertical UI injection with increasing delays.
   * The sidebar DOM takes time to initialize in vertical mode.
   */
  _injectVerticalWithRetry(win, state, attempt) {
    const doc = win.document;
    const MAX_ATTEMPTS = 6;
    const DELAYS = [0, 300, 600, 1200, 2000, 3000];

    // Already injected?
    if (doc.getElementById(QUICK_ICONS_ID) || doc.getElementById(SELECTOR_ID)) return;
    // Window closed?
    if (win.closed) return;

    const success = this._injectVerticalUI(win, state);
    if (success) return;

    if (attempt < MAX_ATTEMPTS - 1) {
      const delay = DELAYS[attempt + 1] || 1000;
      console.log(
        `MidoriWorkspaces: Vertical DOM not ready (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying in ${delay}ms...`
      );
      win.setTimeout(() => {
        this._injectVerticalWithRetry(win, state, attempt + 1);
      }, delay);
    } else {
      // All retries exhausted — fallback to nav-bar button
      console.warn('MidoriWorkspaces: Vertical DOM never ready, injecting fallback in nav-bar');
      this._injectNavBarFallback(win, state);
    }
  },

  /**
   * Fallback: inject a workspace button in nav-bar when vertical-tabs DOM isn't available.
   */
  _injectNavBarFallback(win, state) {
    const doc = win.document;
    const navTarget = doc.getElementById('nav-bar-customization-target');
    if (!navTarget) return;

    const btn = doc.createXULElement('toolbarbutton');
    btn.id = SELECTOR_ID;
    btn.className = 'toolbarbutton-1 midori-workspace-btn';
    btn.setAttribute('tooltiptext', 'Workspaces');
    btn.setAttribute('label', '\uD83C\uDFE0 Workspaces');

    const labelEl = doc.createXULElement('label');
    labelEl.id = 'midori-workspace-selector-label';
    labelEl.className = 'midori-workspace-label';
    labelEl.setAttribute('value', '\uD83C\uDFE0 Workspaces');
    btn.appendChild(labelEl);

    navTarget.insertBefore(btn, navTarget.firstChild);

    const popup = doc.createXULElement('menupopup');
    popup.id = POPUP_ID;
    popup.className = 'midori-workspace-popup';
    popup.setAttribute('position', 'after_start');
    doc.getElementById('mainPopupSet').appendChild(popup);

    btn.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      this._populatePopup(win, state);
      popup.openPopup(btn, 'after_start', 0, 0, false, false);
    });

    popup.addEventListener('popupshowing', () => {
      this._populatePopup(win, state);
    });

    this._updateSelectorLabel(doc, state);
    this._populatePopup(win, state);
  },

  /**
   * Horizontal mode: selector button in TabsToolbar (where Firefox View was)
   */
  _injectHorizontalUI(win, state) {
    const doc = win.document;
    const tabsTarget = doc.getElementById('TabsToolbar-customization-target');
    if (!tabsTarget) return;

    // Build the selector button (no type="menu" — we open popup manually)
    const selector = doc.createXULElement('toolbarbutton');
    selector.id = SELECTOR_ID;
    selector.className = 'toolbarbutton-1 chromeclass-toolbar-additional midori-workspace-btn';
    selector.setAttribute('removable', 'false');
    selector.setAttribute('overflows', 'false');
    selector.setAttribute('tooltiptext', 'Workspaces \u2014 Click to switch workspace');

    // Add explicit label element (TabsToolbar hides .toolbarbutton-text)
    const labelEl = doc.createXULElement('label');
    labelEl.id = 'midori-workspace-selector-label';
    labelEl.className = 'midori-workspace-label';
    labelEl.setAttribute('value', '\uD83C\uDFE0 Workspaces');
    selector.appendChild(labelEl);

    // Insert as first child in TabsToolbar
    tabsTarget.insertBefore(selector, tabsTarget.firstChild);

    // Pre-create popup in mainPopupSet (not inside toolbarbutton)
    const popup = doc.createXULElement('menupopup');
    popup.id = POPUP_ID;
    popup.className = 'midori-workspace-popup';
    popup.setAttribute('position', 'after_start');
    doc.getElementById('mainPopupSet').appendChild(popup);

    // Click handler to open popup manually
    selector.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      this._populatePopup(win, state);
      popup.openPopup(selector, 'after_start', 0, 0, false, false);
    });

    // Also refresh when popup opens (e.g. via keyboard)
    popup.addEventListener('popupshowing', () => {
      this._populatePopup(win, state);
    });

    // Initial render
    this._updateSelectorLabel(doc, state);
    this._populatePopup(win, state);
  },

  /**
   * Vertical mode: workspace icon strip ABOVE tabs in the sidebar.
   * Inserted as first child of #vertical-tabs so it doesn't interfere
   * with the native tab layout (flex-direction: column).
   * @returns {boolean} true if vertical UI was successfully injected
   */
  _injectVerticalUI(win, state) {
    const doc = win.document;

    const verticalTabs = doc.getElementById('vertical-tabs');

    console.log(`MidoriWorkspaces: _injectVerticalUI — vertical-tabs=${!!verticalTabs}`);

    if (!verticalTabs) {
      return false;
    }

    // Create workspace strip container — inserted as FIRST child of #vertical-tabs
    // so it appears above the tabs, not below them.
    const container = doc.createXULElement('hbox');
    container.id = QUICK_ICONS_ID;
    container.className = 'midori-workspace-quick-icons';

    // Insert before first child (above tabs)
    verticalTabs.insertBefore(container, verticalTabs.firstChild);

    this._updateQuickIcons(win, state);

    // --- Pre-create popup attached to mainPopupSet for reuse ---
    const popupSet = doc.getElementById('mainPopupSet');
    if (popupSet) {
      const popup = doc.createXULElement('menupopup');
      popup.id = POPUP_ID;
      popup.className = 'midori-workspace-popup';
      popup.setAttribute('position', 'after_start');
      popupSet.appendChild(popup);

      popup.addEventListener('popupshowing', () => {
        this._populatePopup(win, state);
      });
    }

    console.log('MidoriWorkspaces: Vertical UI injected successfully');
    return true;
  },

  /**
   * Show the workspace popup anchored to a node (used by quick icon "manage" btn).
   */
  _showIndicatorPopup(win, state, anchorNode) {
    const doc = win.document;
    let popup = doc.getElementById(POPUP_ID);
    if (!popup) {
      popup = doc.createXULElement('menupopup');
      popup.id = POPUP_ID;
      popup.className = 'midori-workspace-popup';
      doc.getElementById('mainPopupSet').appendChild(popup);
      popup.addEventListener('popupshowing', () => {
        this._populatePopup(win, state);
      });
    }
    this._populatePopup(win, state);
    popup.openPopup(anchorNode, 'before_start', 0, 0, false, false);
  },

  /**
   * Update the workspace indicator (vertical mode) with current workspace info.
   */
  _updateIndicator(doc, state) {
    const indicator = doc.getElementById(INDICATOR_ID);
    if (!indicator) return;

    const current = state.data.workspaces.find((ws) => ws.id === state.data.selectedId);
    if (!current) return;

    const emoji = getEmojiForIcon(current.icon);

    const nameEl = doc.getElementById(INDICATOR_NAME_ID);
    if (nameEl) nameEl.setAttribute('value', current.name);

    const iconEl = doc.getElementById(INDICATOR_ICON_ID);
    if (iconEl) {
      iconEl.setAttribute('label', emoji);
      // Store current icon data as CSS variable for potential styling
      indicator.style.setProperty('--midori-workspace-emoji', `"${emoji}"`);
    }
  },

  /**
   * Update the quick workspace icon buttons (vertical mode, bottom of sidebar).
   * Like Natsumi/Floorp: one icon per workspace + a "+" button to add.
   */
  _updateQuickIcons(win, state) {
    const doc = win.document;
    const container = doc.getElementById(QUICK_ICONS_ID);
    if (!container) return;

    // Clear existing buttons
    while (container.firstChild) container.firstChild.remove();

    const { workspaces, selectedId } = state.data;

    // One button per workspace
    for (const ws of workspaces) {
      const btn = doc.createXULElement('toolbarbutton');
      btn.className = 'midori-workspace-quick-btn toolbarbutton-1';
      btn.setAttribute('tooltiptext', ws.name);
      btn.setAttribute('label', getEmojiForIcon(ws.icon));

      if (ws.id === selectedId) {
        btn.setAttribute('data-active', 'true');
      }

      // Left click → switch workspace
      btn.addEventListener('command', () => {
        this.switchWorkspace(win, ws.id);
      });

      // Right click → context popup for this workspace
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this._showIndicatorPopup(win, state, btn);
      });

      container.appendChild(btn);
    }

    // "+" button to create new workspace
    if (workspaces.length < MAX_WORKSPACES) {
      const addBtn = doc.createXULElement('toolbarbutton');
      addBtn.className = 'midori-workspace-quick-btn midori-workspace-add-btn toolbarbutton-1';
      addBtn.setAttribute('tooltiptext', 'New Workspace');
      addBtn.setAttribute('label', '+');
      addBtn.addEventListener('command', () => {
        this._showCreateDialog(win, state);
      });
      container.appendChild(addBtn);
    }
  },

  _removeUI(win) {
    const doc = win.document;
    const selector = doc.getElementById(SELECTOR_ID);
    if (selector) selector.remove();
    const indicator = doc.getElementById(INDICATOR_ID);
    if (indicator) indicator.remove();
    const quickIcons = doc.getElementById(QUICK_ICONS_ID);
    if (quickIcons) quickIcons.remove();
    const popup = doc.getElementById(POPUP_ID);
    if (popup) popup.remove();
  },

  _updateSelectorLabel(doc, state) {
    // Update horizontal mode selector
    const selector = doc.getElementById(SELECTOR_ID);
    if (selector) {
      const current = state.data.workspaces.find((ws) => ws.id === state.data.selectedId);
      if (current) {
        const emoji = getEmojiForIcon(current.icon);
        selector.setAttribute('label', `${emoji} Workspaces`);
        selector.setAttribute('tooltiptext', `Current: ${current.name}`);

        const labelEl = doc.getElementById('midori-workspace-selector-label');
        if (labelEl) {
          labelEl.setAttribute('value', `${emoji} Workspaces`);
        }
      }
    }

    // Update vertical mode indicator + quick icons
    this._updateIndicator(doc, state);
  },

  _populatePopup(win, state) {
    const doc = win.document;
    const popup = doc.getElementById(POPUP_ID);
    if (!popup) return;

    // Clear existing items
    while (popup.firstChild) {
      popup.firstChild.remove();
    }

    const { workspaces, selectedId } = state.data;

    // Workspace items
    for (const ws of workspaces) {
      const item = doc.createXULElement('menuitem');
      item.className = 'midori-workspace-item';
      const emoji = getEmojiForIcon(ws.icon);
      item.setAttribute('label', `${emoji}  ${ws.name}`);
      item.setAttribute('value', ws.id);

      if (ws.id === selectedId) {
        item.setAttribute('checked', 'true');
        item.className += ' midori-workspace-item-active';
      }

      // Count tabs in this workspace
      const tabCount = this._countTabsInWorkspace(win, ws.id);
      item.setAttribute('acceltext', `${tabCount} tab${tabCount !== 1 ? 's' : ''}`);

      item.addEventListener('command', () => {
        this.switchWorkspace(win, ws.id);
      });

      popup.appendChild(item);
    }

    // Separator
    const sep = doc.createXULElement('menuseparator');
    popup.appendChild(sep);

    // "New Workspace" item
    if (workspaces.length < MAX_WORKSPACES) {
      const newItem = doc.createXULElement('menuitem');
      newItem.className = 'midori-workspace-new-item';
      newItem.setAttribute('label', '➕  New Workspace…');
      newItem.addEventListener('command', () => {
        this._showCreateDialog(win, state);
      });
      popup.appendChild(newItem);
    }

    // "Manage Workspaces" item
    const manageItem = doc.createXULElement('menuitem');
    manageItem.className = 'midori-workspace-manage-item';
    manageItem.setAttribute('label', '⚙️  Manage Workspaces…');
    manageItem.addEventListener('command', () => {
      this._showManageDialog(win, state);
    });
    popup.appendChild(manageItem);
  },

  // =========================================================================
  // Tab management — show/hide tabs based on active workspace
  // =========================================================================

  _applyWorkspace(win, state, workspaceId) {
    const gBrowser = win.gBrowser;
    if (!gBrowser) return;

    // --- Natsumi-style transition animation ---
    const oldId = state.data.selectedId;
    const oldIndex = state.data.workspaces.findIndex((ws) => ws.id === oldId);
    const newIndex = state.data.workspaces.findIndex((ws) => ws.id === workspaceId);

    state.data.selectedId = workspaceId;
    this._scheduleSave();

    // Trigger slide animation if switching between different workspaces
    if (oldId !== workspaceId && oldIndex !== -1 && newIndex !== -1) {
      this._animateWorkspaceSwitch(win, newIndex < oldIndex);
    }

    const tabs = gBrowser.tabs;
    let hasVisibleTab = false;

    for (const tab of tabs) {
      const tabWsId = tab.getAttribute(WORKSPACE_ATTR);

      // Tabs without a workspace attribute belong to the current workspace
      if (!tabWsId) {
        tab.setAttribute(WORKSPACE_ATTR, workspaceId);
      }

      const belongs = tab.getAttribute(WORKSPACE_ATTR) === workspaceId;

      // Pinned tabs are always visible across all workspaces
      if (tab.pinned) {
        if (tab.hidden) {
          gBrowser.showTab(tab);
        }
        hasVisibleTab = true;
        continue;
      }

      if (belongs) {
        if (tab.hidden) {
          gBrowser.showTab(tab);
        }
        hasVisibleTab = true;
      } else {
        if (!tab.hidden) {
          gBrowser.hideTab(tab);
        }
      }
    }

    // If no visible tab, select or create one
    if (!hasVisibleTab) {
      const newTab = gBrowser.addTab('about:newtab', {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
      newTab.setAttribute(WORKSPACE_ATTR, workspaceId);
      gBrowser.selectedTab = newTab;
    } else {
      // Select the first visible tab if current is hidden
      if (gBrowser.selectedTab.hidden) {
        for (const tab of tabs) {
          if (!tab.hidden) {
            gBrowser.selectedTab = tab;
            break;
          }
        }
      }
    }

    // Update UI (both horizontal selector label and vertical indicator)
    this._updateSelectorLabel(win.document, state);
    this._updateQuickIcons(win, state);

    // Dispatch custom event (Natsumi-style)
    try {
      const event = new win.CustomEvent('midoriWorkspaceChanged', {
        bubbles: true,
        cancelable: false,
        detail: { workspaceId },
      });
      win.document.dispatchEvent(event);
    } catch (e) {}
  },

  /**
   * Natsumi-inspired workspace switch animation.
   * Applies a slide-in from left or right on the tabs list.
   */
  _animateWorkspaceSwitch(win, slideLeft) {
    const doc = win.document;
    const tabsList = doc.getElementById('tabbrowser-tabs');
    if (!tabsList) return;

    // Remove any existing animation attributes
    tabsList.removeAttribute('midori-workspace-anim');
    tabsList.removeAttribute('midori-workspace-anim-left');

    // Force reflow to restart animation
    void tabsList.offsetWidth;

    if (slideLeft) {
      tabsList.setAttribute('midori-workspace-anim-left', '');
    }
    tabsList.setAttribute('midori-workspace-anim', '');

    // Clear animation after it completes
    if (win.__midoriWsAnimTimeout) {
      win.clearTimeout(win.__midoriWsAnimTimeout);
    }
    win.__midoriWsAnimTimeout = win.setTimeout(() => {
      tabsList.removeAttribute('midori-workspace-anim');
      tabsList.removeAttribute('midori-workspace-anim-left');
    }, 300);
  },

  _countTabsInWorkspace(win, workspaceId) {
    const gBrowser = win.gBrowser;
    if (!gBrowser) return 0;

    let count = 0;
    for (const tab of gBrowser.tabs) {
      const wsId = tab.getAttribute(WORKSPACE_ATTR);
      if (wsId === workspaceId || (!wsId && workspaceId === null)) {
        count++;
      }
    }
    return count;
  },

  _attachTabListeners(win, state) {
    const container = win.gBrowser.tabContainer;

    state._onTabOpen = (event) => {
      const tab = event.target;
      if (!tab.getAttribute(WORKSPACE_ATTR)) {
        tab.setAttribute(WORKSPACE_ATTR, state.data.selectedId);
      }
    };

    state._onTabClose = () => {
      // After closing, ensure at least one visible tab exists
      lazy.setTimeout(() => {
        if (!win.closed) {
          this._ensureVisibleTab(win, state);
        }
      }, 50);
    };

    container.addEventListener('TabOpen', state._onTabOpen);
    container.addEventListener('TabClose', state._onTabClose);
  },

  _detachTabListeners(win, state) {
    if (!state._onTabOpen) return;
    const container = win.gBrowser?.tabContainer;
    if (!container) return;

    container.removeEventListener('TabOpen', state._onTabOpen);
    container.removeEventListener('TabClose', state._onTabClose);
    state._onTabOpen = null;
    state._onTabClose = null;
  },

  _ensureVisibleTab(win, state) {
    const gBrowser = win.gBrowser;
    if (!gBrowser) return;

    let hasVisible = false;
    for (const tab of gBrowser.tabs) {
      if (!tab.hidden && !tab.closing) {
        hasVisible = true;
        break;
      }
    }

    if (!hasVisible) {
      const newTab = gBrowser.addTab('about:newtab', {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
      newTab.setAttribute(WORKSPACE_ATTR, state.data.selectedId);
      gBrowser.selectedTab = newTab;
    }
  },

  // =========================================================================
  // Public API — workspace operations
  // =========================================================================

  switchWorkspace(win, workspaceId) {
    const state = this._getWindowState(win);
    if (!state) return;

    const exists = state.data.workspaces.some((ws) => ws.id === workspaceId);
    if (!exists) return;

    this._applyWorkspace(win, state, workspaceId);
  },

  async createWorkspace(win, name, icon = 'default') {
    const state = this._getWindowState(win);
    if (!state) return null;
    if (state.data.workspaces.length >= MAX_WORKSPACES) return null;

    const ws = {
      id: generateId(),
      name: sanitizeName(name),
      icon: validateIconId(icon),
      isDefault: false,
    };

    state.data.workspaces.push(ws);
    this._scheduleSave();

    // Switch to the new workspace
    this._applyWorkspace(win, state, ws.id);

    return ws.id;
  },

  async deleteWorkspace(win, workspaceId) {
    const state = this._getWindowState(win);
    if (!state) return false;

    const idx = state.data.workspaces.findIndex((ws) => ws.id === workspaceId);
    if (idx === -1) return false;

    const ws = state.data.workspaces[idx];
    if (ws.isDefault) return false; // Cannot delete default workspace
    if (state.data.workspaces.length <= 1) return false;

    // Move tabs from deleted workspace to default
    const defaultWs = state.data.workspaces.find((w) => w.isDefault);
    const targetId = defaultWs ? defaultWs.id : state.data.workspaces[0].id;

    const gBrowser = win.gBrowser;
    for (const tab of gBrowser.tabs) {
      if (tab.getAttribute(WORKSPACE_ATTR) === workspaceId) {
        tab.setAttribute(WORKSPACE_ATTR, targetId);
      }
    }

    state.data.workspaces.splice(idx, 1);

    // If deleted workspace was selected, switch to default
    if (state.data.selectedId === workspaceId) {
      this._applyWorkspace(win, state, targetId);
    } else {
      // Even if not selected, update the UI to reflect the removal
      this._updateSelectorLabel(win.document, state);
      this._updateQuickIcons(win, state);
    }

    this._scheduleSave();
    return true;
  },

  async renameWorkspace(win, workspaceId, newName) {
    const state = this._getWindowState(win);
    if (!state) return false;

    const ws = state.data.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return false;

    ws.name = sanitizeName(newName);
    this._scheduleSave();
    this._updateSelectorLabel(win.document, state);
    this._updateQuickIcons(win, state);
    return true;
  },

  async setWorkspaceIcon(win, workspaceId, iconId) {
    const state = this._getWindowState(win);
    if (!state) return false;

    const ws = state.data.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return false;

    ws.icon = validateIconId(iconId);
    this._scheduleSave();
    this._updateSelectorLabel(win.document, state);
    this._updateQuickIcons(win, state);
    return true;
  },

  // =========================================================================
  // Dialogs
  // =========================================================================

  _showCreateDialog(win, state) {
    const name = { value: '' };
    const result = Services.prompt.prompt(
      win,
      'New Workspace',
      'Enter a name for the new workspace:',
      name,
      null,
      {}
    );

    if (result && name.value.trim()) {
      this.createWorkspace(win, name.value.trim());
    }
  },

  _showManageDialog(win, state) {
    const { workspaces } = state.data;
    const items = workspaces.map((ws) => {
      const emoji = getEmojiForIcon(ws.icon);
      const tabCount = this._countTabsInWorkspace(win, ws.id);
      return `${emoji} ${ws.name} (${tabCount} tabs)${ws.isDefault ? ' [Default]' : ''}`;
    });

    const selected = { value: 0 };
    const result = Services.prompt.select(
      win,
      'Manage Workspaces',
      'Select a workspace to manage.\nTo delete: select and click OK, then confirm.\nDefault workspace cannot be deleted.',
      items,
      selected
    );

    if (result && selected.value >= 0 && selected.value < workspaces.length) {
      const ws = workspaces[selected.value];

      if (ws.isDefault) {
        // Offer rename only
        const newName = { value: ws.name };
        const renamed = Services.prompt.prompt(
          win,
          'Rename Workspace',
          `Rename "${ws.name}":`,
          newName,
          null,
          {}
        );
        if (renamed && newName.value.trim()) {
          this.renameWorkspace(win, ws.id, newName.value.trim());
        }
      } else {
        // Offer rename or delete
        const RENAME = 0;
        const DELETE = 1;
        const CANCEL = 2;
        const action = Services.prompt.confirmEx(
          win,
          `Workspace: ${ws.name}`,
          `What do you want to do with "${ws.name}"?`,
          Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
            Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_IS_STRING +
            Services.prompt.BUTTON_POS_2 * Services.prompt.BUTTON_TITLE_CANCEL,
          'Rename',
          'Delete',
          null,
          null,
          {}
        );

        if (action === RENAME) {
          const newName = { value: ws.name };
          const renamed = Services.prompt.prompt(
            win,
            'Rename Workspace',
            `Rename "${ws.name}":`,
            newName,
            null,
            {}
          );
          if (renamed && newName.value.trim()) {
            this.renameWorkspace(win, ws.id, newName.value.trim());
          }
        } else if (action === DELETE) {
          this.deleteWorkspace(win, ws.id);
        }
      }
    }
  },

  // =========================================================================
  // Observer
  // =========================================================================

  observe(subject, topic, data) {
    switch (topic) {
      case 'nsPref:changed':
        if (data === PREF_ENABLED) {
          if (this.isEnabled()) {
            for (const win of Services.wm.getEnumerator('navigator:browser')) {
              this._initWindow(win);
            }
          } else {
            for (const win of Services.wm.getEnumerator('navigator:browser')) {
              this._showAllTabs(win);
              this._destroyWindow(win);
            }
          }
        } else if (
          data === PREF_SHOW_BUTTON ||
          data === PREF_VERTICAL ||
          data === PREF_SIDEBAR_VERTICAL
        ) {
          // Re-inject UI when tab layout or button visibility changes
          for (const win of Services.wm.getEnumerator('navigator:browser')) {
            const state = this._getWindowState(win);
            if (state) {
              this._removeUI(win);
              if (this.showButton()) {
                this._injectUI(win, state);
              }
            }
          }
        }
        break;

      case 'browser-delayed-startup-finished':
        if (this.isEnabled()) {
          this._initWindow(subject);
        }
        break;

      case 'domwindowclosed':
        this._destroyWindow(subject);
        break;
    }
  },

  _showAllTabs(win) {
    const gBrowser = win.gBrowser;
    if (!gBrowser) return;
    for (const tab of gBrowser.tabs) {
      if (tab.hidden) {
        gBrowser.showTab(tab);
      }
    }
  },

  // =========================================================================
  // Cleanup
  // =========================================================================

  uninit() {
    Services.prefs.removeObserver(PREF_ENABLED, this);
    Services.prefs.removeObserver(PREF_SHOW_BUTTON, this);
    Services.prefs.removeObserver(PREF_VERTICAL, this);
    Services.prefs.removeObserver(PREF_SIDEBAR_VERTICAL, this);

    try {
      Services.obs.removeObserver(this, 'browser-delayed-startup-finished');
      Services.obs.removeObserver(this, 'domwindowclosed');
    } catch (e) {}

    // Show all tabs and remove UI from all windows
    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      this._showAllTabs(win);
      this._destroyWindow(win);
    }

    // Final save
    this._flushSave();

    this._initialized = false;
  },
};
