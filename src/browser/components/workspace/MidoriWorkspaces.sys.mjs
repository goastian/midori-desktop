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
 *   - midori.workspaces.show-name     (bool, default: true)
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
const PREF_SHOW_NAME = 'midori.workspaces.show-name';
const PREF_VERTICAL = 'midori.verticaltabs.enabled';
const PREF_SIDEBAR_VERTICAL = 'sidebar.verticalTabs';
const PREF_UNLOAD_INACTIVE = 'midori.workspaces.unloadInactive';
const PREF_UNLOAD_DELAY_MS = 'midori.workspaces.unloadDelayMs';
const PREF_CHROME_TINT = 'midori.workspaces.chromeTint';

const WORKSPACE_ATTR = 'midori-workspace-id';
const WORKSPACE_LAST_SHOWN_ATTR = 'midori-workspace-last-shown-id';
const WORKSPACE_SESSION_KEY = 'midoriWorkspaceId';
const STYLE_ID = 'midori-workspaces-style';
const SELECTOR_ID = 'midori-workspace-selector';
const POPUP_ID = 'midori-workspace-popup';
const VERTICAL_RAIL_ID = 'midori-workspace-rail';
const QUICK_ICONS_ID = 'midori-workspace-quick-icons';
const DROPDOWN_ID = 'midori-workspace-dropdown';
const CTX_SEPARATOR_ID = 'midori-workspace-context-separator';
const CTX_MENU_ID = 'midori-workspace-context-menu';
const CTX_MENU_POPUP_ID = 'midori-workspace-context-menupopup';
const WORKSPACE_CHANGE_TOPIC = 'midori-workspaces-updated';
const SAVE_DEBOUNCE_MS = 500;

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

const WorkspaceModel = ChromeUtils.importESModule(
  'resource:///modules/MidoriWorkspaceModel.sys.mjs'
);

// Lazy import for setTimeout — MUST be before any usage
const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SessionStore: 'resource:///modules/sessionstore/SessionStore.sys.mjs',
  clearTimeout: 'resource://gre/modules/Timer.sys.mjs',
  setTimeout: 'resource://gre/modules/Timer.sys.mjs',
  WorkspaceTabUnloader: 'resource:///modules/WorkspaceTabUnloader.sys.mjs',
});

/**
 * Validates and repairs the workspace store structure.
 * Protects against corrupt or tampered JSON data.
 */
function validateStore(data) {
  return WorkspaceModel.validateWorkspaceStore(data);
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
    Services.prefs.addObserver(PREF_SHOW_NAME, this);
    Services.prefs.addObserver(PREF_VERTICAL, this);
    Services.prefs.addObserver(PREF_SIDEBAR_VERTICAL, this);
    Services.prefs.addObserver(PREF_CHROME_TINT, this);
    Services.prefs.addObserver(PREF_UNLOAD_INACTIVE, this);

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

  showWorkspaceName() {
    return Services.prefs.getBoolPref(PREF_SHOW_NAME, true);
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
    if (!this._initialized) return;
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
        tabs: {},
      };
      this._scheduleSave();
    } else if (!store.windows[windowId].tabs || typeof store.windows[windowId].tabs !== 'object') {
      store.windows[windowId].tabs = {};
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
    if (!this._initialized || !this.isEnabled()) return;
    if (this._windowStates.has(win)) return;

    const windowId = this._getWindowId(win);
    const data = await this._getWindowData(windowId);
    if (!this._initialized || !this.isEnabled() || win.closed) return;

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

    if (!this._initialized || this._windowStates.get(win) !== state || win.closed) {
      return;
    }

    this._injectUI(win, state);
    this._initTabContextMenu(win, state);
    this._syncWindowTabMembership(win, state);
    this._applyWorkspace(win, state, data.selectedId);
    this._attachTabListeners(win, state);
  },

  _destroyWindow(win) {
    const state = this._windowStates.get(win);
    if (!state) return;

    this._cancelInactiveUnload(win, state);
    if (state._verticalRetryTimer) {
      win.clearTimeout(state._verticalRetryTimer);
      state._verticalRetryTimer = null;
    }
    for (const timer of state._tabCloseTimers || []) {
      lazy.clearTimeout(timer);
    }
    state._tabCloseTimers?.clear();
    if (win.__midoriWsAnimTimeout) {
      win.clearTimeout(win.__midoriWsAnimTimeout);
      win.__midoriWsAnimTimeout = null;
    }
    this._detachTabListeners(win, state);
    this._removeTabContextMenu(win);
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
    if (!this._initialized || this._windowStates.get(win) !== state || win.closed) return;

    const success = this._injectVerticalUI(win, state);
    if (success) return;

    if (attempt < MAX_ATTEMPTS - 1) {
      const delay = DELAYS[attempt + 1] || 1000;
      console.log(
        `MidoriWorkspaces: Vertical DOM not ready (attempt ${attempt + 1}/${MAX_ATTEMPTS}), retrying in ${delay}ms...`
      );
      state._verticalRetryTimer = win.setTimeout(() => {
        state._verticalRetryTimer = null;
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
    popup.addEventListener('popupshown', () => {
      btn.setAttribute('open', 'true');
    });
    popup.addEventListener('popuphidden', () => {
      btn.removeAttribute('open');
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
    selector.className = 'chromeclass-toolbar-additional midori-workspace-btn';
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
    popup.addEventListener('popupshown', () => {
      selector.setAttribute('open', 'true');
    });
    popup.addEventListener('popuphidden', () => {
      selector.removeAttribute('open');
    });

    // Initial render
    this._updateSelectorLabel(doc, state);
    this._populatePopup(win, state);
  },

  /**
   * Vertical mode: Vivaldi-style workspace dropdown ABOVE tabs in the sidebar.
   * Shows current workspace (emoji + name) with a chevron; clicking opens the popup.
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

    // Create a dedicated vertical rail so workspaces are clearly separate from tabs.
    const rail = doc.createXULElement('vbox');
    rail.id = VERTICAL_RAIL_ID;
    rail.className = 'midori-workspace-rail';

    // ── Vivaldi-style dropdown button ──────────────────────────────────────
    const dropdown = doc.createXULElement('toolbarbutton');
    dropdown.id = DROPDOWN_ID;
    dropdown.className = 'midori-workspace-dropdown toolbarbutton-1';
    dropdown.setAttribute('tooltiptext', 'Switch workspace');

    // Emoji icon
    const iconEl = doc.createXULElement('label');
    iconEl.id = 'midori-workspace-dropdown-icon';
    iconEl.className = 'midori-workspace-dropdown-icon';
    iconEl.setAttribute('value', '🏠');
    dropdown.appendChild(iconEl);

    // Workspace name
    const labelEl = doc.createXULElement('label');
    labelEl.id = 'midori-workspace-dropdown-label';
    labelEl.className = 'midori-workspace-dropdown-label';
    labelEl.setAttribute('value', 'Workspace');
    dropdown.appendChild(labelEl);

    rail.appendChild(dropdown);
    // ──────────────────────────────────────────────────────────────────────

    // Insert before first child (above tabs)
    verticalTabs.insertBefore(rail, verticalTabs.firstChild);

    this._updateDropdown(doc, state);

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
      popup.addEventListener('popupshown', () => {
        dropdown.setAttribute('open', 'true');
      });
      popup.addEventListener('popuphidden', () => {
        dropdown.removeAttribute('open');
      });
    }

    // Clicking the dropdown button opens the popup
    dropdown.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      const popup = doc.getElementById(POPUP_ID);
      if (!popup) return;
      this._populatePopup(win, state);
      popup.openPopup(dropdown, 'after_start', 0, 0, false, false);
    });

    console.log('MidoriWorkspaces: Vertical UI injected successfully');
    return true;
  },

  /**
   * Update the Vivaldi-style dropdown button with the currently active workspace.
   * Called in vertical mode after every workspace switch.
   */
  _updateDropdown(doc, state) {
    const dropdown = doc.getElementById(DROPDOWN_ID);
    if (!dropdown) return;

    const current = state.data.workspaces.find((ws) => ws.id === state.data.selectedId);
    if (!current) return;

    const emoji = WorkspaceModel.getEmojiForIcon(current.icon);
    const accent = WorkspaceModel.getWorkspaceAccent(current.icon);

    dropdown.style.setProperty('--midori-workspace-accent', accent);
    dropdown.setAttribute('tooltiptext', `Current workspace: ${current.name}`);

    const iconEl = doc.getElementById('midori-workspace-dropdown-icon');
    if (iconEl) iconEl.setAttribute('value', emoji);

    const labelEl = doc.getElementById('midori-workspace-dropdown-label');
    if (labelEl) {
      const label = this.showWorkspaceName()
        ? WorkspaceModel.sanitizeWorkspaceName(current.name)
        : '';
      labelEl.setAttribute('value', label);
    }
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
    popup.openPopup(anchorNode, 'after_start', 0, 0, false, false);
  },

  /**
   * Update the vertical workspace UI.
   * In vertical mode, updates the Vivaldi-style dropdown button.
   * In horizontal mode, this is a no-op (horizontal uses _updateSelectorLabel).
   */
  _updateQuickIcons(win, state) {
    const doc = win.document;

    this._applyChromeTint(doc, state);

    // Vertical mode: update the dropdown button
    if (doc.getElementById(DROPDOWN_ID)) {
      this._updateDropdown(doc, state);
      return;
    }
  },

  /**
   * Tint the browser chrome with the active workspace accent. Sets
   * --midori-workspace-accent on the root so shared.inc.css can apply a
   * subtle color-mix overlay on the toolbox (works in BOTH vertical and
   * horizontal tab modes). This reuses the same accent variable consumed by
   * the vertical-tabs accent system, keeping a single source of truth.
   * Controlled by pref midori.workspaces.chromeTint.
   */
  _applyChromeTint(doc, state) {
    const root = doc?.documentElement;
    if (!root) return;

    if (!Services.prefs.getBoolPref(PREF_CHROME_TINT, true)) {
      root.removeAttribute('midori-workspace-tint');
      root.style.removeProperty('--midori-workspace-accent');
      return;
    }

    const current = state.data.workspaces.find((ws) => ws.id === state.data.selectedId);
    if (!current) {
      root.removeAttribute('midori-workspace-tint');
      root.style.removeProperty('--midori-workspace-accent');
      return;
    }

    const accent = WorkspaceModel.getWorkspaceAccent(current.icon);
    root.style.setProperty('--midori-workspace-accent', accent);
    root.setAttribute('midori-workspace-tint', 'true');
  },

  _removeUI(win) {
    const doc = win.document;
    const root = doc.documentElement;
    if (root) {
      root.removeAttribute('midori-workspace-tint');
      root.style.removeProperty('--midori-workspace-accent');
    }
    const verticalRail = doc.getElementById(VERTICAL_RAIL_ID);
    if (verticalRail) verticalRail.remove();
    const dropdown = doc.getElementById(DROPDOWN_ID);
    if (dropdown) dropdown.remove();
    const selector = doc.getElementById(SELECTOR_ID);
    if (selector) selector.remove();
    const quickIcons = doc.getElementById(QUICK_ICONS_ID);
    if (quickIcons) quickIcons.remove();
    const popup = doc.getElementById(POPUP_ID);
    if (popup) popup.remove();
  },

  _removeTabContextMenu(win) {
    const doc = win?.document;
    if (!doc) return;

    const popup = doc.getElementById('tabContextMenu');
    if (popup && doc._midoriWorkspaceContextMenuPopupHandler) {
      popup.removeEventListener('popupshowing', doc._midoriWorkspaceContextMenuPopupHandler);
    }

    doc.getElementById(CTX_SEPARATOR_ID)?.remove();
    doc.getElementById(CTX_MENU_ID)?.remove();
    doc._midoriWorkspaceContextMenuInit = false;
    doc._midoriWorkspaceContextMenuPopupHandler = null;
  },

  _updateSelectorLabel(doc, state) {
    // Apply the per-workspace chrome tint here too so it works on horizontal
    // startup (horizontal init uses _updateSelectorLabel, not _updateQuickIcons).
    this._applyChromeTint(doc, state);

    // Update horizontal mode selector
    const selector = doc.getElementById(SELECTOR_ID);
    if (selector) {
      const current = state.data.workspaces.find((ws) => ws.id === state.data.selectedId);
      if (current) {
        const emoji = WorkspaceModel.getEmojiForIcon(current.icon);
        const selectorLabel = this.showWorkspaceName() ? `${emoji} ${current.name}` : emoji;
        selector.setAttribute('label', selectorLabel);
        selector.setAttribute('tooltiptext', `Current workspace: ${current.name}`);

        const labelEl = doc.getElementById('midori-workspace-selector-label');
        if (labelEl) {
          labelEl.setAttribute('value', selectorLabel);
        }
      }
    }

    // Vertical mode buttons are updated separately by _updateQuickIcons.
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
      const emoji = WorkspaceModel.getEmojiForIcon(ws.icon);
      item.setAttribute('label', `${emoji}  ${ws.name}`);
      item.setAttribute('value', ws.id);
      item.setAttribute('tooltiptext', `Switch to ${ws.name}`);

      if (ws.id === selectedId) {
        item.setAttribute('type', 'checkbox');
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
    if (workspaces.length < WorkspaceModel.MAX_WORKSPACES) {
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

    if (oldId && oldId !== workspaceId) {
      this._rememberLastShownTab(win, state, oldId);
    }

    state.data.selectedId = workspaceId;
    this._scheduleSave();

    // Trigger slide animation if switching between different workspaces
    if (oldId !== workspaceId && oldIndex !== -1 && newIndex !== -1) {
      this._animateWorkspaceSwitch(win, newIndex < oldIndex);
    }

    const tabs = Array.from(gBrowser.tabs);
    const fallbackTabWorkspaceId = oldId || workspaceId;
    let targetTab = null;
    let fallbackTargetTab = null;
    const lastShownTab = this._getLastShownTab(win, state, workspaceId);

    for (const tab of tabs) {
      const tabWorkspaceId = this._resolveTabWorkspace(state, tab, fallbackTabWorkspaceId);
      if (tabWorkspaceId) {
        this._rememberTabWorkspace(state, tab, tabWorkspaceId);
      }

      if (!tab.pinned && !tab.closing && tabWorkspaceId === workspaceId) {
        if (tab === gBrowser.selectedTab) {
          targetTab = tab;
        } else if (tab === lastShownTab) {
          fallbackTargetTab = tab;
        } else {
          fallbackTargetTab ||= tab;
        }
      }
    }

    targetTab ||= fallbackTargetTab;

    if (!targetTab) {
      targetTab = gBrowser.addTab('about:newtab', {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
      this._rememberTabWorkspace(state, targetTab, workspaceId);
      tabs.push(targetTab);
    }

    if (targetTab.hidden) {
      gBrowser.showTab(targetTab);
    }
    gBrowser.selectedTab = targetTab;
    this._markLastShownTab(state, targetTab, workspaceId);

    for (const tab of tabs) {
      const tabWorkspaceId = this._resolveTabWorkspace(state, tab, fallbackTabWorkspaceId);
      const belongs = tabWorkspaceId === workspaceId;

      if (tab.pinned || belongs) {
        if (tab.hidden) {
          gBrowser.showTab(tab);
        }
      } else {
        if (!tab.hidden) {
          gBrowser.hideTab(tab);
        }
      }
    }

    // Update UI (horizontal selector label + vertical quick buttons)
    this._updateSelectorLabel(win.document, state);
    this._updateQuickIcons(win, state);

    // Memory-aware unloading: schedule discard of now-hidden tabs that belong
    // to inactive workspaces so they stop consuming memory while keeping the
    // tab entry for instant on-demand reload.
    this._scheduleInactiveUnload(win, state);

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

  // =========================================================================
  // Memory-aware workspace unloading
  // =========================================================================

  /**
   * Schedule a single per-window timer that discards tabs belonging to
   * inactive workspaces. Re-scheduling on every switch keeps memory pressure
   * low without unloading the workspace the user is actively using; the active
   * workspace is re-evaluated when the timer fires, so quickly switching back
   * cancels the unload for that workspace's tabs.
   */
  _scheduleInactiveUnload(win, state) {
    this._cancelInactiveUnload(win, state);

    if (!Services.prefs.getBoolPref(PREF_UNLOAD_INACTIVE, false)) {
      return;
    }

    const gBrowser = win.gBrowser;
    if (!gBrowser) return;

    // Skip scheduling when nothing is currently unloadable.
    const hasCandidate = Array.from(gBrowser.tabs).some((tab) =>
      this._isUnloadCandidate(state, tab)
    );
    if (!hasCandidate) {
      return;
    }

    const delayMs = lazy.WorkspaceTabUnloader.getUnloadDelayMs(
      Services.prefs.getIntPref(PREF_UNLOAD_DELAY_MS, 0)
    );

    state._unloadTimer = win.setTimeout(() => {
      state._unloadTimer = null;
      this._unloadInactiveTabs(win, state);
    }, delayMs);
  },

  _cancelInactiveUnload(win, state) {
    if (state && state._unloadTimer) {
      try {
        win.clearTimeout(state._unloadTimer);
      } catch (e) {}
      state._unloadTimer = null;
    }
  },

  /**
   * Build the pure decision state for a tab and ask WorkspaceTabUnloader
   * whether it is safe to discard given the active workspace.
   */
  _isUnloadCandidate(state, tab) {
    if (!tab || tab.pinned || tab.closing) {
      return false;
    }

    const activeId = state.data.selectedId;
    const tabWorkspaceId = this._resolveTabWorkspace(state, tab, activeId);

    let uriSpec = '';
    try {
      uriSpec = tab.linkedBrowser?.currentURI?.spec || '';
    } catch (e) {}

    return lazy.WorkspaceTabUnloader.shouldUnloadTab({
      belongsToActiveWorkspace: tabWorkspaceId === activeId,
      selected: !!tab.selected,
      multiselected: !!tab.multiselected,
      pinned: !!tab.pinned,
      closing: !!tab.closing,
      discarded: tab.getAttribute?.('discarded') === 'true',
      busy: tab.getAttribute?.('busy') === 'true',
      soundPlaying: !!tab.soundPlaying,
      attention: !!tab.attention,
      hasBeforeUnload: !!tab.linkedBrowser?.hasBeforeUnload,
      hasLinkedPanel: !!tab.linkedPanel,
      autoDiscardable: tab.autoDiscardable !== false,
      uriSpec,
    });
  },

  _unloadInactiveTabs(win, state) {
    if (win.closed) return;
    const gBrowser = win.gBrowser;
    if (!gBrowser) return;

    for (const tab of Array.from(gBrowser.tabs)) {
      if (!this._isUnloadCandidate(state, tab)) {
        continue;
      }
      try {
        gBrowser.discardBrowser(tab);
      } catch (error) {
        console.error('MidoriWorkspaces: Failed to discard tab', error);
      }
    }
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
      if (wsId === workspaceId || this._getStoredWorkspaceForTab(tab) === workspaceId) {
        count++;
      }
    }
    return count;
  },

  _attachTabListeners(win, state) {
    const container = win.gBrowser.tabContainer;

    state._onTabOpen = (event) => {
      const tab = event.target;
      const workspaceId = this._resolveTabWorkspace(state, tab, state.data.selectedId);
      if (workspaceId) {
        this._rememberTabWorkspace(state, tab, workspaceId);
      }
    };

    state._onTabClose = (event) => {
      this._forgetTabWorkspace(state, event.target);
      // After closing, ensure at least one visible tab exists
      state._tabCloseTimers ||= new Set();
      const timer = lazy.setTimeout(() => {
        state._tabCloseTimers.delete(timer);
        if (
          this._initialized &&
          this._windowStates.get(win) === state &&
          !win.closed
        ) {
          this._ensureVisibleTab(win, state);
        }
      }, 50);
      state._tabCloseTimers.add(timer);
    };

    state._onTabRestored = (event) => {
      const tab = event.target;
      const workspaceId = this._resolveTabWorkspace(state, tab, state.data.selectedId);
      if (workspaceId) {
        this._rememberTabWorkspace(state, tab, workspaceId);
        this._applyWorkspace(win, state, state.data.selectedId);
      }
    };

    state._onTabSelect = (event) => {
      const tab = event.target;
      const workspaceId = this._resolveTabWorkspace(state, tab, state.data.selectedId);
      if (workspaceId === state.data.selectedId) {
        this._markLastShownTab(state, tab, workspaceId);
      }
    };

    state._onTabAttrModified = (event) => {
      const tab = event.target;
      const workspaceId = tab.getAttribute(WORKSPACE_ATTR);
      if (this._isKnownWorkspaceId(state, workspaceId)) {
        this._rememberTabWorkspace(state, tab, workspaceId);
      }
    };

    // Shift + wheel over workspace controls switches workspaces quickly.
    state._onWorkspaceWheel = (event) => {
      if (!event.shiftKey) return;

      let node = event.target;
      let isWorkspaceTarget = false;
      while (node && node !== win.document) {
        if (
          node.id === VERTICAL_RAIL_ID ||
          node.id === QUICK_ICONS_ID ||
          node.id === DROPDOWN_ID ||
          node.id === SELECTOR_ID
        ) {
          isWorkspaceTarget = true;
          break;
        }
        node = node.parentNode;
      }

      if (!isWorkspaceTarget) return;

      event.preventDefault();
      event.stopPropagation();
      this._switchWorkspaceRelative(win, state, event.deltaY > 0 ? 1 : -1);
    };

    container.addEventListener('TabOpen', state._onTabOpen);
    container.addEventListener('TabClose', state._onTabClose);
    container.addEventListener('TabSelect', state._onTabSelect);
    container.addEventListener('SSTabRestored', state._onTabRestored);
    container.addEventListener('TabAttrModified', state._onTabAttrModified);
    win.document.addEventListener('wheel', state._onWorkspaceWheel, {
      capture: true,
      passive: false,
    });
  },

  _switchWorkspaceRelative(win, state, delta) {
    const list = state?.data?.workspaces;
    if (!Array.isArray(list) || list.length === 0) return;

    const currentIndex = list.findIndex((ws) => ws.id === state.data.selectedId);
    if (currentIndex === -1) return;

    const nextIndex = (currentIndex + delta + list.length) % list.length;
    const next = list[nextIndex];
    if (!next || next.id === state.data.selectedId) return;

    this.switchWorkspace(win, next.id);
  },

  _detachTabListeners(win, state) {
    const container = win.gBrowser?.tabContainer;
    if (container && state._onTabOpen) {
      container.removeEventListener('TabOpen', state._onTabOpen);
      container.removeEventListener('TabClose', state._onTabClose);
      container.removeEventListener('TabSelect', state._onTabSelect);
      container.removeEventListener('SSTabRestored', state._onTabRestored);
      container.removeEventListener('TabAttrModified', state._onTabAttrModified);
    }

    if (state._onWorkspaceWheel) {
      win.document.removeEventListener('wheel', state._onWorkspaceWheel, true);
    }

    state._onTabOpen = null;
    state._onTabClose = null;
    state._onTabSelect = null;
    state._onTabRestored = null;
    state._onTabAttrModified = null;
    state._onWorkspaceWheel = null;
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
      this._rememberTabWorkspace(state, newTab, state.data.selectedId);
      gBrowser.selectedTab = newTab;
    }
  },

  async _ensureWindowState(win) {
    if (!win) return null;

    let state = this._getWindowState(win);
    if (state) {
      return state;
    }

    if (!this.isEnabled()) {
      return null;
    }

    await this._initWindow(win);
    return this._getWindowState(win);
  },

  _emitWorkspaceChange(reason = 'updated') {
    try {
      Services.obs.notifyObservers(null, WORKSPACE_CHANGE_TOPIC, reason);
    } catch (_) {}
  },

  _refreshWorkspaceUI(win, state) {
    if (!win || !state) return;
    this._populatePopup(win, state);
    this._updateSelectorLabel(win.document, state);
    this._updateQuickIcons(win, state);
  },

  _invalidateWorkspaceIdCache(state) {
    if (!state) return;
    state._workspaceIdsCache = null;
    state._workspaceIdsCacheKey = null;
  },

  _getKnownWorkspaceIds(state) {
    if (!state) {
      return new Set();
    }
    const workspaces = state?.data?.workspaces || [];
    const cacheKey = workspaces.map((ws) => ws.id).join('\n');
    if (!state._workspaceIdsCache || state._workspaceIdsCacheKey !== cacheKey) {
      state._workspaceIdsCache = new Set(workspaces.map((ws) => ws.id));
      state._workspaceIdsCacheKey = cacheKey;
    }
    return state._workspaceIdsCache;
  },

  _isKnownWorkspaceId(state, workspaceId) {
    return typeof workspaceId === 'string' && this._getKnownWorkspaceIds(state).has(workspaceId);
  },

  _getDefaultWorkspaceId(state) {
    return (
      state?.data?.workspaces?.find((ws) => ws.isDefault)?.id ||
      state?.data?.workspaces?.[0]?.id ||
      null
    );
  },

  _getTabStableKey(tab) {
    if (!tab) return null;
    if (!tab.__midoriWorkspaceTabKey) {
      let browserId = '';
      try {
        browserId = tab.linkedBrowser?.browserId ? String(tab.linkedBrowser.browserId) : '';
      } catch (_) {}

      tab.__midoriWorkspaceTabKey = browserId || generateId();
    }
    return tab.__midoriWorkspaceTabKey;
  },

  _getStoredWorkspaceForTab(tab) {
    try {
      return lazy.SessionStore.getCustomTabValue(tab, WORKSPACE_SESSION_KEY) || null;
    } catch (_) {
      return null;
    }
  },

  _setStoredWorkspaceForTab(tab, workspaceId) {
    if (!tab || typeof workspaceId !== 'string' || !workspaceId) {
      return;
    }

    tab.setAttribute(WORKSPACE_ATTR, workspaceId);
    try {
      lazy.SessionStore.setCustomTabValue(tab, WORKSPACE_SESSION_KEY, workspaceId);
    } catch (_) {}
  },

  _clearStoredWorkspaceForTab(tab) {
    if (!tab) return;
    tab.removeAttribute(WORKSPACE_ATTR);
    tab.removeAttribute(WORKSPACE_LAST_SHOWN_ATTR);
    try {
      lazy.SessionStore.deleteCustomTabValue(tab, WORKSPACE_SESSION_KEY);
    } catch (_) {}
  },

  _rememberTabWorkspace(state, tab, workspaceId) {
    if (!this._isKnownWorkspaceId(state, workspaceId)) {
      return false;
    }

    this._setStoredWorkspaceForTab(tab, workspaceId);

    const tabKey = this._getTabStableKey(tab);
    if (tabKey) {
      state.data.tabs ||= {};
      if (state.data.tabs[tabKey] !== workspaceId) {
        state.data.tabs[tabKey] = workspaceId;
        this._scheduleSave();
      }
    }

    return true;
  },

  _forgetTabWorkspace(state, tab) {
    const tabKey = this._getTabStableKey(tab);
    if (tabKey && state?.data?.tabs?.[tabKey]) {
      delete state.data.tabs[tabKey];
      this._scheduleSave();
    }
    this._clearStoredWorkspaceForTab(tab);
  },

  _resolveTabWorkspace(state, tab, fallbackWorkspaceId) {
    const attrWorkspaceId = tab.getAttribute(WORKSPACE_ATTR);
    if (this._isKnownWorkspaceId(state, attrWorkspaceId)) {
      return attrWorkspaceId;
    }

    const sessionWorkspaceId = this._getStoredWorkspaceForTab(tab);
    if (this._isKnownWorkspaceId(state, sessionWorkspaceId)) {
      return sessionWorkspaceId;
    }

    const tabKey = this._getTabStableKey(tab);
    const rememberedWorkspaceId = tabKey ? state.data.tabs?.[tabKey] : null;
    if (this._isKnownWorkspaceId(state, rememberedWorkspaceId)) {
      return rememberedWorkspaceId;
    }

    return this._isKnownWorkspaceId(state, fallbackWorkspaceId)
      ? fallbackWorkspaceId
      : this._getDefaultWorkspaceId(state);
  },

  _syncWindowTabMembership(win, state) {
    const gBrowser = win.gBrowser;
    if (!gBrowser) return;

    const liveTabKeys = new Set();
    for (const tab of gBrowser.tabs) {
      const tabKey = this._getTabStableKey(tab);
      if (tabKey) {
        liveTabKeys.add(tabKey);
      }

      const workspaceId = this._resolveTabWorkspace(state, tab, state.data.selectedId);
      if (workspaceId) {
        this._rememberTabWorkspace(state, tab, workspaceId);
      }
    }

    if (state.data.tabs) {
      let removed = false;
      for (const tabKey of Object.keys(state.data.tabs)) {
        if (!liveTabKeys.has(tabKey)) {
          delete state.data.tabs[tabKey];
          removed = true;
        }
      }
      if (removed) {
        this._scheduleSave();
      }
    }
  },

  _rememberLastShownTab(win, state, workspaceId) {
    const selectedTab = win?.gBrowser?.selectedTab;
    if (!selectedTab || selectedTab.closing || selectedTab.pinned) {
      return;
    }

    const selectedWorkspaceId = this._resolveTabWorkspace(state, selectedTab, workspaceId);
    if (selectedWorkspaceId === workspaceId) {
      this._markLastShownTab(state, selectedTab, workspaceId);
    }
  },

  _markLastShownTab(state, targetTab, workspaceId) {
    if (!targetTab || !this._isKnownWorkspaceId(state, workspaceId)) {
      return;
    }

    const ownerDocument = targetTab.ownerDocument;
    const gBrowser = ownerDocument?.defaultView?.gBrowser;
    if (gBrowser) {
      for (const tab of gBrowser.tabs) {
        if (tab !== targetTab && tab.getAttribute(WORKSPACE_LAST_SHOWN_ATTR) === workspaceId) {
          tab.removeAttribute(WORKSPACE_LAST_SHOWN_ATTR);
        }
      }
    }

    targetTab.setAttribute(WORKSPACE_LAST_SHOWN_ATTR, workspaceId);
  },

  _getLastShownTab(win, state, workspaceId) {
    const gBrowser = win?.gBrowser;
    if (!gBrowser || !this._isKnownWorkspaceId(state, workspaceId)) {
      return null;
    }

    for (const tab of gBrowser.tabs) {
      if (
        !tab.closing &&
        !tab.pinned &&
        tab.getAttribute(WORKSPACE_LAST_SHOWN_ATTR) === workspaceId &&
        this._resolveTabWorkspace(state, tab, workspaceId) === workspaceId
      ) {
        return tab;
      }
    }

    return null;
  },

  _getContextTabs(win) {
    const contextTab = win.TabContextMenu?.contextTab || win.gBrowser?.selectedTab;
    if (!contextTab || contextTab.closing) {
      return [];
    }

    if (contextTab.multiselected && Array.isArray(win.gBrowser?.selectedTabs)) {
      return win.gBrowser.selectedTabs.filter((tab) => tab && !tab.closing);
    }

    return [contextTab];
  },

  _initTabContextMenu(win, state) {
    const doc = win?.document;
    if (!doc || doc._midoriWorkspaceContextMenuInit) {
      this._updateTabContextMenu(win, state);
      return;
    }

    const popup = doc.getElementById('tabContextMenu');
    if (!popup) {
      return;
    }

    const separator = doc.createXULElement('menuseparator');
    separator.id = CTX_SEPARATOR_ID;
    popup.appendChild(separator);

    const menu = doc.createXULElement('menu');
    menu.id = CTX_MENU_ID;
    menu.setAttribute('label', 'Send to Workspace');

    const menupopup = doc.createXULElement('menupopup');
    menupopup.id = CTX_MENU_POPUP_ID;
    menupopup.addEventListener('popupshowing', () => {
      this._populateTabContextWorkspaceMenu(win, state);
    });
    menu.appendChild(menupopup);
    popup.appendChild(menu);

    const onPopupShowing = (event) => {
      if (event.target?.id !== 'tabContextMenu') {
        return;
      }
      this._updateTabContextMenu(win, state);
      this._populateTabContextWorkspaceMenu(win, state);
    };

    popup.addEventListener('popupshowing', onPopupShowing);
    doc._midoriWorkspaceContextMenuInit = true;
    doc._midoriWorkspaceContextMenuPopupHandler = onPopupShowing;

    this._updateTabContextMenu(win, state);
  },

  _updateTabContextMenu(win, state) {
    const doc = win?.document;
    if (!doc) return;

    const separator = doc.getElementById(CTX_SEPARATOR_ID);
    const menu = doc.getElementById(CTX_MENU_ID);
    if (!separator || !menu) return;

    const tabs = this._getContextTabs(win);
    const canUse =
      this.isEnabled() &&
      !!state &&
      tabs.length > 0 &&
      Array.isArray(state.data.workspaces) &&
      state.data.workspaces.length > 1;

    separator.hidden = !canUse;
    menu.hidden = !canUse;
    menu.disabled = !canUse;
    menu.setAttribute(
      'label',
      tabs.length > 1 ? `Send ${tabs.length} Tabs to Workspace` : 'Send Tab to Workspace'
    );
  },

  _populateTabContextWorkspaceMenu(win, state) {
    const doc = win?.document;
    const popup = doc?.getElementById(CTX_MENU_POPUP_ID);
    if (!popup || !state) return;

    while (popup.firstChild) {
      popup.firstChild.remove();
    }

    const tabs = this._getContextTabs(win);
    const currentIds = new Set(
      tabs.map((tab) => this._resolveTabWorkspace(state, tab, state.data.selectedId))
    );

    for (const ws of state.data.workspaces) {
      const item = doc.createXULElement('menuitem');
      item.setAttribute(
        'label',
        `${WorkspaceModel.getEmojiForIcon(ws.icon)}  ${ws.name}`
      );
      item.setAttribute('value', ws.id);
      if (currentIds.size === 1 && currentIds.has(ws.id)) {
        item.setAttribute('checked', 'true');
        item.disabled = true;
      }
      item.addEventListener('command', () => {
        this.moveTabsToWorkspace(win, tabs, ws.id);
      });
      popup.appendChild(item);
    }
  },

  // =========================================================================
  // Public API — Workspace data for management UI
  // =========================================================================

  getWorkspaceIcons() {
    return WorkspaceModel.WORKSPACE_ICONS.map((icon) => ({ ...icon }));
  },

  getWorkspaceAccent(iconId) {
    return WorkspaceModel.getWorkspaceAccent(iconId);
  },

  getMaxWorkspaces() {
    return WorkspaceModel.MAX_WORKSPACES;
  },

  getMaxWorkspaceNameLength() {
    return WorkspaceModel.MAX_NAME_LENGTH;
  },

  async getWorkspacesForWindow(win) {
    const state = await this._ensureWindowState(win);
    if (!state) {
      return {
        selectedId: null,
        workspaces: [],
      };
    }

    const items = state.data.workspaces.map((ws, index) => ({
      id: ws.id,
      name: ws.name,
      icon: ws.icon,
      isDefault: !!ws.isDefault,
      isSelected: ws.id === state.data.selectedId,
      canDelete: !ws.isDefault && state.data.workspaces.length > 1,
      position: index,
      tabCount: this._countTabsInWorkspace(win, ws.id),
    }));

    return {
      selectedId: state.data.selectedId,
      workspaces: items,
    };
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
    this._emitWorkspaceChange('switch');
  },

  async moveTabsToWorkspace(win, tabs, workspaceId, options = {}) {
    const state = await this._ensureWindowState(win);
    if (!state || !this._isKnownWorkspaceId(state, workspaceId)) {
      return 0;
    }

    const tabList = Array.isArray(tabs) ? tabs : [tabs];
    let moved = 0;
    for (const tab of tabList) {
      if (!tab || tab.closing || tab.pinned) {
        continue;
      }
      if (this._rememberTabWorkspace(state, tab, workspaceId)) {
        moved++;
      }
    }

    if (!moved) {
      return 0;
    }

    this._applyWorkspace(win, state, options.switchToTarget ? workspaceId : state.data.selectedId);
    this._refreshWorkspaceUI(win, state);
    this._emitWorkspaceChange('move-tabs');
    return moved;
  },

  async createWorkspace(win, name, icon = 'default') {
    const state = await this._ensureWindowState(win);
    if (!state) return null;
    if (state.data.workspaces.length >= WorkspaceModel.MAX_WORKSPACES) return null;

    const ws = {
      id: generateId(),
      name: WorkspaceModel.sanitizeWorkspaceName(name),
      icon: WorkspaceModel.validateIconId(icon),
      isDefault: false,
    };

    state.data.workspaces.push(ws);
    this._invalidateWorkspaceIdCache(state);
    this._scheduleSave();

    // Switch to the new workspace
    this._applyWorkspace(win, state, ws.id);
    this._emitWorkspaceChange('create');

    return ws.id;
  },

  async deleteWorkspace(win, workspaceId) {
    const state = await this._ensureWindowState(win);
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
      if (this._resolveTabWorkspace(state, tab, state.data.selectedId) === workspaceId) {
        this._rememberTabWorkspace(state, tab, targetId);
      }
    }

    state.data.workspaces.splice(idx, 1);
    this._invalidateWorkspaceIdCache(state);

    // If deleted workspace was selected, switch to default
    if (state.data.selectedId === workspaceId) {
      this._applyWorkspace(win, state, targetId);
    } else {
      // Even if not selected, update the UI to reflect the removal
      this._updateSelectorLabel(win.document, state);
      this._updateQuickIcons(win, state);
    }

    this._scheduleSave();
    this._emitWorkspaceChange('delete');
    return true;
  },

  async renameWorkspace(win, workspaceId, newName) {
    const state = await this._ensureWindowState(win);
    if (!state) return false;

    const ws = state.data.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return false;

    ws.name = WorkspaceModel.sanitizeWorkspaceName(newName);
    this._scheduleSave();
    this._refreshWorkspaceUI(win, state);
    this._emitWorkspaceChange('rename');
    return true;
  },

  async setWorkspaceIcon(win, workspaceId, iconId) {
    const state = await this._ensureWindowState(win);
    if (!state) return false;

    const ws = state.data.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return false;

    ws.icon = WorkspaceModel.validateIconId(iconId);
    this._scheduleSave();
    this._refreshWorkspaceUI(win, state);
    this._emitWorkspaceChange('icon');
    return true;
  },

  async setDefaultWorkspace(win, workspaceId) {
    const state = await this._ensureWindowState(win);
    if (!state) return false;

    const ws = state.data.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return false;

    for (const item of state.data.workspaces) {
      item.isDefault = item.id === workspaceId;
    }

    this._scheduleSave();
    this._refreshWorkspaceUI(win, state);
    this._emitWorkspaceChange('default');
    return true;
  },

  async moveWorkspace(win, workspaceId, direction) {
    const state = await this._ensureWindowState(win);
    if (!state) return false;

    if (direction !== -1 && direction !== 1) {
      return false;
    }

    const index = state.data.workspaces.findIndex((ws) => ws.id === workspaceId);
    if (index === -1) return false;

    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= state.data.workspaces.length) {
      return false;
    }

    const [item] = state.data.workspaces.splice(index, 1);
    state.data.workspaces.splice(targetIndex, 0, item);
    this._invalidateWorkspaceIdCache(state);

    this._scheduleSave();
    this._refreshWorkspaceUI(win, state);
    this._emitWorkspaceChange('reorder');
    return true;
  },

  async duplicateWorkspace(win, workspaceId) {
    const state = await this._ensureWindowState(win);
    if (!state) return null;
    if (state.data.workspaces.length >= WorkspaceModel.MAX_WORKSPACES) return null;

    const source = state.data.workspaces.find((ws) => ws.id === workspaceId);
    if (!source) return null;

    const duplicated = {
      id: generateId(),
      name: WorkspaceModel.getWorkspaceCopyName(state.data.workspaces, source.name),
      icon: WorkspaceModel.validateIconId(source.icon),
      isDefault: false,
    };

    const sourceIndex = state.data.workspaces.findIndex((ws) => ws.id === workspaceId);
    state.data.workspaces.splice(sourceIndex + 1, 0, duplicated);
    this._invalidateWorkspaceIdCache(state);

    this._scheduleSave();
    this._refreshWorkspaceUI(win, state);
    this._emitWorkspaceChange('duplicate');
    return duplicated.id;
  },

  async updateWorkspace(win, workspaceId, updates = {}) {
    const state = await this._ensureWindowState(win);
    if (!state) return false;

    const ws = state.data.workspaces.find((w) => w.id === workspaceId);
    if (!ws) return false;

    let changed = false;

    if (typeof updates.name === 'string') {
      const nextName = WorkspaceModel.sanitizeWorkspaceName(updates.name);
      if (nextName && nextName !== ws.name) {
        ws.name = nextName;
        changed = true;
      }
    }

    if (typeof updates.icon === 'string') {
      const nextIcon = WorkspaceModel.validateIconId(updates.icon);
      if (nextIcon !== ws.icon) {
        ws.icon = nextIcon;
        changed = true;
      }
    }

    if (!changed) return true;

    this._scheduleSave();
    this._refreshWorkspaceUI(win, state);
    this._emitWorkspaceChange('update');
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
      const emoji = WorkspaceModel.getEmojiForIcon(ws.icon);
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
          data === PREF_SHOW_NAME ||
          data === PREF_VERTICAL ||
          data === PREF_SIDEBAR_VERTICAL ||
          data === PREF_CHROME_TINT
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
        } else if (data === PREF_UNLOAD_INACTIVE) {
          for (const win of Services.wm.getEnumerator('navigator:browser')) {
            const state = this._getWindowState(win);
            if (state) {
              this._scheduleInactiveUnload(win, state);
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
    if (!this._initialized) {
      return;
    }

    this._initialized = false;
    for (const pref of [
      PREF_ENABLED,
      PREF_SHOW_BUTTON,
      PREF_SHOW_NAME,
      PREF_VERTICAL,
      PREF_SIDEBAR_VERTICAL,
      PREF_CHROME_TINT,
      PREF_UNLOAD_INACTIVE,
    ]) {
      try {
        Services.prefs.removeObserver(pref, this);
      } catch {}
    }

    try {
      Services.obs.removeObserver(this, 'browser-delayed-startup-finished');
      Services.obs.removeObserver(this, 'domwindowclosed');
    } catch {}

    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      this._destroyWindow(win);
    }

    if (this._saveTimer) {
      lazy.clearTimeout(this._saveTimer);
      this._saveTimer = null;
    }
    void this._flushSave();
  },
};
