/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  DEFAULT_MAX_ESSENTIALS,
  addEssential,
  canonicalEssentialUrl,
  clampMaxEssentials,
  createEssentialId,
  findEssentialByUrl,
  moveEssential,
  parseEssentials,
  serializeEssentials,
} from 'resource:///modules/MidoriEssentialsModel.sys.mjs';
import { MidoriEssentialIcons } from 'resource:///modules/MidoriEssentialIcons.sys.mjs';

/**
 * MidoriEssentials: the Essentials grid shown at the top of the vertical tabs
 * sidebar (the equivalent of Arc favorites and Zen essentials).
 *
 * Each tile is an entry of a per-profile list. Nothing is loaded for a tile
 * until it is clicked; then a pinned tab is opened, linked to the tile and
 * hidden from the tab strip. The grid lives outside #pinned-tabs-container on
 * purpose: tabbrowser treats every child of that container as a tab.
 *
 * @patch Midori Browser
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SessionStore: 'moz-src:///browser/components/sessionstore/SessionStore.sys.mjs',
});

export const PREF_ESSENTIALS_ITEMS = 'midori.verticaltabs.essentials.items';
const PREF_ENABLED = 'midori.verticaltabs.essentials.enabled';
const PREF_MAX = 'midori.verticaltabs.essentials.max';
const PREF_SHOW_PINNED_SECTION = 'midori.verticaltabs.showPinnedSection';

export const ESSENTIAL_TAB_ATTR = 'midori-essential-tab';
const SESSION_KEY = 'midoriEssentialId';
const FTL = 'browser/midori/essentials.ftl';
const CONTAINER_ID = 'midori-essentials';
const POPUP_ID = 'midori-essentials-context';
const TILE_CLASS = 'midori-essential-tile';
const ID_ATTR = 'data-essential-id';
const CTX_SEPARATOR_ID = 'midori-context-essentials-separator';
const CTX_ADD_ID = 'midori-context-add-essential';
const CTX_REMOVE_ID = 'midori-context-remove-essential';
const MAX_COLUMNS = 3;
const TAB_DROP_TYPE = 'application/x-moz-tabbrowser-tab';
const ESSENTIAL_DRAG_TYPE = 'application/x-midori-essential';
const LINK_DRAG_TYPES = ['text/x-moz-url', 'text/uri-list'];

const states = new WeakMap();

function isActive() {
  return (
    Services.prefs.getBoolPref(PREF_ENABLED, true) &&
    Services.prefs.getBoolPref(PREF_SHOW_PINNED_SECTION, true)
  );
}

function getMax() {
  return clampMaxEssentials(Services.prefs.getIntPref(PREF_MAX, DEFAULT_MAX_ESSENTIALS));
}

function readAllItems() {
  return parseEssentials(Services.prefs.getStringPref(PREF_ESSENTIALS_ITEMS, ''));
}

function writeItems(items) {
  Services.prefs.setStringPref(PREF_ESSENTIALS_ITEMS, serializeEssentials(items));
}

function tabEssentialId(tab) {
  return tab?.getAttribute?.(ESSENTIAL_TAB_ATTR) || null;
}

function tabUrl(tab) {
  try {
    return tab?.linkedBrowser?.currentURI?.spec || '';
  } catch {
    return '';
  }
}

/**
 * The downloaded site icon wins; the bundled one only covers the time before
 * it arrives or an offline first run. Bundled icons already have their own
 * plate, favicons get one from CSS.
 */
function iconFor(item, tab) {
  const downloaded = MidoriEssentialIcons.getCached(item.url);
  if (downloaded) {
    return { src: downloaded, kind: 'favicon' };
  }
  if (item.icon) {
    return { src: item.icon, kind: 'bundled' };
  }
  return {
    src: tab?.getAttribute('image') || `page-icon:${item.url}`,
    kind: 'favicon',
  };
}

function essentialUrlFromLinkData(dataTransfer) {
  let raw = '';
  try {
    raw = dataTransfer.getData('text/x-moz-url') || '';
  } catch {}
  if (raw) {
    const [first, title = ''] = raw.split(/\r?\n/);
    const url = canonicalEssentialUrl(first.trim());
    if (url) {
      return { url, title };
    }
  }
  try {
    raw = dataTransfer.getData('text/uri-list') || '';
  } catch {
    raw = '';
  }
  for (const line of raw.split(/\r?\n/)) {
    const url = line && !line.startsWith('#') ? canonicalEssentialUrl(line.trim()) : null;
    if (url) {
      return { url, title: '' };
    }
  }
  return null;
}

export const MidoriEssentials = {
  /**
   * Number of pinned tabs that are not owned by an Essentials tile.
   */
  countRegularPinned(win) {
    let count = 0;
    const container = win?.gBrowser?.tabContainer?.pinnedTabsContainer;
    for (const tab of container?.children || []) {
      if (tab.pinned && !tab.hasAttribute(ESSENTIAL_TAB_ATTR)) {
        count++;
      }
    }
    return count;
  },

  initWindow(win, { onPinnedChange } = {}) {
    if (!isActive()) {
      this.cleanupWindow(win);
      return;
    }

    let state = states.get(win);
    if (!state) {
      state = this._createState(win, onPinnedChange);
      if (!state) {
        return;
      }
      states.set(win, state);
    }
    this.refresh(win);
  },

  refresh(win) {
    if (!isActive()) {
      this.cleanupWindow(win);
      return;
    }
    const state = states.get(win);
    if (!state) {
      this.initWindow(win);
      return;
    }
    this._reconcileLinks(win, state);
    this._render(win, state);
  },

  cleanupWindow(win) {
    const state = states.get(win);
    if (!state) {
      return;
    }
    states.delete(win);

    for (const { target, type, listener } of state.listeners) {
      try {
        target.removeEventListener(type, listener);
      } catch {}
    }
    const doc = win.document;
    doc.getElementById(CONTAINER_ID)?.remove();
    doc.getElementById(POPUP_ID)?.remove();
    doc.getElementById(CTX_SEPARATOR_ID)?.remove();
    doc.getElementById(CTX_ADD_ID)?.remove();
    doc.getElementById(CTX_REMOVE_ID)?.remove();
    for (const tab of win.gBrowser?.tabContainer?.pinnedTabsContainer?.children || []) {
      tab.removeAttribute(ESSENTIAL_TAB_ATTR);
    }
    state.onPinnedChange?.();
  },

  _createState(win, onPinnedChange) {
    const doc = win.document;
    const host = doc.getElementById('vertical-tabs');
    const gBrowser = win.gBrowser;
    const tabContainer = gBrowser?.tabContainer;
    if (!host || !tabContainer) {
      return null;
    }

    if (!doc._midoriEssentialsFtl) {
      doc._midoriEssentialsFtl = true;
      doc.l10n.addResourceIds([FTL]);
    }

    const container = doc.createXULElement('box');
    container.id = CONTAINER_ID;
    container.className = 'midori-essentials';
    host.insertBefore(container, host.firstChild);

    const state = {
      container,
      tiles: new Map(),
      live: new Map(),
      listeners: [],
      selectedId: null,
      contextId: null,
      popup: null,
      dropTile: null,
      iconRequests: new Set(),
      onPinnedChange,
    };

    const listen = (target, type, listener) => {
      target.addEventListener(type, listener);
      state.listeners.push({ target, type, listener });
    };

    listen(container, 'command', event => {
      const tile = event.target?.closest?.(`.${TILE_CLASS}`);
      const id = tile?.getAttribute(ID_ATTR);
      if (id) {
        this._activate(win, state, id);
      }
    });

    listen(container, 'dragstart', event => this._onDragStart(state, event));
    listen(container, 'dragend', () => this._onDragEnd(state));
    listen(container, 'dragover', event => this._onDragOver(win, state, event));
    listen(container, 'dragleave', event => {
      if (!container.contains(event.relatedTarget)) {
        this._clearDrop(state);
      }
    });
    listen(container, 'drop', event => this._onDrop(win, state, event));

    listen(tabContainer, 'TabSelect', () => this._syncSelection(win, state));
    listen(tabContainer, 'TabClose', event => this._onTabClose(state, event.target));
    listen(tabContainer, 'TabUnpinned', event => this._unlink(state, event.target));
    listen(tabContainer, 'TabAttrModified', event => {
      if (
        event.detail?.changed?.includes('image') &&
        tabEssentialId(event.target)
      ) {
        this._updateTile(state, tabEssentialId(event.target));
      }
    });
    const relink = event => {
      this._linkFromSession(state, event.target);
      this._render(win, state);
    };
    listen(tabContainer, 'SSTabRestoring', relink);
    listen(tabContainer, 'SSTabRestored', relink);

    this._createTileMenu(win, state, listen);
    this._createTabMenu(win, state, listen);

    for (const tab of gBrowser.tabs) {
      if (tab.pinned) {
        this._linkFromSession(state, tab);
      }
    }
    MidoriEssentialIcons.load().then(() => {
      if (states.get(win) === state) {
        this._render(win, state);
      }
    });
    return state;
  },

  _createTileMenu(win, state, listen) {
    const doc = win.document;
    const popup = doc.createXULElement('menupopup');
    popup.id = POPUP_ID;

    const remove = doc.createXULElement('menuitem');
    doc.l10n.setAttributes(remove, 'midori-essentials-remove');
    remove.addEventListener('command', () => {
      if (state.contextId) {
        writeItems(readAllItems().filter(item => item.id !== state.contextId));
      }
    });

    const reset = doc.createXULElement('menuitem');
    doc.l10n.setAttributes(reset, 'midori-essentials-reset');
    reset.addEventListener('command', () => {
      Services.prefs.clearUserPref(PREF_ESSENTIALS_ITEMS);
    });

    popup.append(remove, doc.createXULElement('menuseparator'), reset);
    doc.getElementById('mainPopupSet').appendChild(popup);
    state.popup = popup;

    listen(popup, 'popupshowing', event => {
      if (event.target !== popup) {
        return;
      }
      const tile = popup.triggerNode?.closest?.(`.${TILE_CLASS}`);
      state.contextId = tile?.getAttribute(ID_ATTR) || null;
      if (!state.contextId) {
        event.preventDefault();
      }
    });
  },

  _createTabMenu(win, state, listen) {
    const doc = win.document;
    const popup = doc.getElementById('tabContextMenu');
    if (!popup) {
      return;
    }

    const separator = doc.createXULElement('menuseparator');
    separator.id = CTX_SEPARATOR_ID;

    const add = doc.createXULElement('menuitem');
    add.id = CTX_ADD_ID;
    doc.l10n.setAttributes(add, 'midori-essentials-add-current');
    add.addEventListener('command', () => {
      const tab = win.TabContextMenu?.contextTab;
      if (tab) {
        this._addTab(win, state, tab);
      }
    });

    const remove = doc.createXULElement('menuitem');
    remove.id = CTX_REMOVE_ID;
    doc.l10n.setAttributes(remove, 'midori-essentials-remove');
    remove.addEventListener('command', () => {
      const id = tabEssentialId(win.TabContextMenu?.contextTab);
      if (id) {
        writeItems(readAllItems().filter(item => item.id !== id));
      }
    });

    popup.append(separator, add, remove);

    listen(popup, 'popupshowing', event => {
      if (event.target !== popup) {
        return;
      }
      const tab = win.TabContextMenu?.contextTab;
      const linked = !!tabEssentialId(tab);
      const canAdd =
        !!tab &&
        !tab.closing &&
        !linked &&
        !!canonicalEssentialUrl(tabUrl(tab)) &&
        (!!findEssentialByUrl(readAllItems(), tabUrl(tab)) ||
          readAllItems().length < getMax());
      add.hidden = linked;
      add.disabled = !canAdd;
      remove.hidden = !linked;
      separator.hidden = false;
    });
  },

  _link(state, tab, id) {
    const current = state.live.get(id);
    if (current && current !== tab && !current.closing && current.isConnected) {
      return false;
    }
    tab.setAttribute(ESSENTIAL_TAB_ATTR, id);
    try {
      if (lazy.SessionStore.getCustomTabValue(tab, SESSION_KEY) !== id) {
        lazy.SessionStore.setCustomTabValue(tab, SESSION_KEY, id);
      }
    } catch {}
    state.live.set(id, tab);
    return true;
  },

  _unlink(state, tab) {
    const id = tabEssentialId(tab);
    if (!id) {
      return;
    }
    tab.removeAttribute(ESSENTIAL_TAB_ATTR);
    try {
      lazy.SessionStore.deleteCustomTabValue(tab, SESSION_KEY);
    } catch {}
    if (state.live.get(id) === tab) {
      state.live.delete(id);
    }
    this._updateTile(state, id);
    state.onPinnedChange?.();
  },

  _linkFromSession(state, tab) {
    let id = null;
    try {
      id = lazy.SessionStore.getCustomTabValue(tab, SESSION_KEY) || null;
    } catch {}
    if (id && tab.pinned && !tab.hasAttribute(ESSENTIAL_TAB_ATTR)) {
      if (this._link(state, tab, id)) {
        state.onPinnedChange?.();
      }
    }
  },

  _onTabClose(state, tab) {
    const id = tabEssentialId(tab);
    if (id && state.live.get(id) === tab) {
      state.live.delete(id);
      this._updateTile(state, id);
    }
    if (id) {
      state.onPinnedChange?.();
    }
  },

  /**
   * Drops links whose entry no longer exists and returns those tabs to the
   * regular tab strip.
   */
  _reconcileLinks(win, state) {
    const ids = new Set(readAllItems().map(item => item.id));
    for (const [id, tab] of [...state.live]) {
      if (ids.has(id)) {
        continue;
      }
      this._unlink(state, tab);
      if (tab.pinned && !tab.closing) {
        win.gBrowser.unpinTab(tab);
      }
    }
  },

  _activate(win, state, id) {
    const item = readAllItems().find(entry => entry.id === id);
    if (!item) {
      return;
    }
    const gBrowser = win.gBrowser;
    let tab = state.live.get(id);
    if (!tab || tab.closing || !tab.isConnected) {
      state.live.delete(id);
      tab = gBrowser.addTab(item.url, {
        pinned: true,
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
      this._link(state, tab, id);
      state.onPinnedChange?.();
    }
    gBrowser.selectedTab = tab;
  },

  _addTab(win, state, tab, index = null) {
    const url = tabUrl(tab);
    let item = findEssentialByUrl(readAllItems(), url);
    if (!item) {
      item = this._addUrl(url, tab.label, index);
      if (!item) {
        return;
      }
    }
    if (!tab.pinned) {
      win.gBrowser.pinTab(tab);
    }
    if (this._link(state, tab, item.id)) {
      state.onPinnedChange?.();
    }
    this._render(win, state);
  },

  /**
   * Adds a site to the list (at `index` when given) and returns its entry.
   */
  _addUrl(url, title, index = null) {
    const result = addEssential(
      readAllItems(),
      {
        id: createEssentialId(Services.uuid.generateUUID().toString()),
        title,
        url,
      },
      getMax()
    );
    if (!result.item) {
      return null;
    }
    if (result.added) {
      const items =
        index === null ? result.items : moveEssential(result.items, result.item.id, index);
      writeItems(items);
    }
    return result.item;
  },

  _hasRoomFor(url) {
    return !!findEssentialByUrl(readAllItems(), url) || readAllItems().length < getMax();
  },

  _inspectDrag(win, event) {
    const dt = event.dataTransfer;
    if (!dt) {
      return null;
    }
    const types = Array.from(dt.types || []);
    if (types.includes(ESSENTIAL_DRAG_TYPE)) {
      return { kind: 'essential' };
    }
    if (types.includes(TAB_DROP_TYPE)) {
      const tabs = [];
      for (let i = 0; i < dt.mozItemCount; i++) {
        const tab = dt.mozGetDataAt(TAB_DROP_TYPE, i);
        if (tab?.ownerDocument === win.document && canonicalEssentialUrl(tabUrl(tab))) {
          tabs.push(tab);
        }
      }
      return tabs.length ? { kind: 'tab', tabs } : null;
    }
    if (LINK_DRAG_TYPES.some(type => types.includes(type))) {
      return { kind: 'link' };
    }
    return null;
  },

  _canAccept(drag) {
    if (drag.kind === 'essential') {
      return true;
    }
    if (drag.kind === 'tab') {
      return drag.tabs.some(tab => this._hasRoomFor(tabUrl(tab)));
    }
    return readAllItems().length < getMax();
  },

  _dropTarget(state, event) {
    const tiles = Array.from(state.container.children).filter(node =>
      node.classList.contains(TILE_CLASS)
    );
    if (!tiles.length) {
      return { index: 0, tile: null, after: false, column: false };
    }
    const rects = tiles.map(tile => tile.getBoundingClientRect());
    const column = tiles.length > 1 && Math.abs(rects[1].left - rects[0].left) < 4;
    let best = 0;
    let bestDistance = Infinity;
    rects.forEach((rect, i) => {
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      if (dx * dx + dy * dy < bestDistance) {
        bestDistance = dx * dx + dy * dy;
        best = i;
      }
    });
    const rect = rects[best];
    const after = column
      ? event.clientY > rect.top + rect.height / 2
      : event.clientX > rect.left + rect.width / 2;
    return { index: best + (after ? 1 : 0), tile: tiles[best], after, column };
  },

  _clearDrop(state) {
    state.dropTile?.removeAttribute('drop-before');
    state.dropTile?.removeAttribute('drop-after');
    state.dropTile = null;
    state.container.removeAttribute('dragover');
    state.container.removeAttribute('drop-axis');
  },

  _onDragStart(state, event) {
    const tile = event.target?.closest?.(`.${TILE_CLASS}`);
    const id = tile?.getAttribute(ID_ATTR);
    if (!id || !event.dataTransfer) {
      return;
    }
    event.dataTransfer.setData(ESSENTIAL_DRAG_TYPE, id);
    event.dataTransfer.effectAllowed = 'move';
    tile.setAttribute('dragging', '');
  },

  _onDragEnd(state) {
    for (const tile of state.tiles.values()) {
      tile.removeAttribute('dragging');
    }
    this._clearDrop(state);
  },

  _onDragOver(win, state, event) {
    const drag = this._inspectDrag(win, event);
    if (!drag || !this._canAccept(drag)) {
      this._clearDrop(state);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = drag.kind === 'link' ? 'copy' : 'move';

    const target = this._dropTarget(state, event);
    this._clearDrop(state);
    state.container.setAttribute('dragover', '');
    state.container.setAttribute('drop-axis', target.column ? 'vertical' : 'horizontal');
    if (target.tile) {
      target.tile.setAttribute(target.after ? 'drop-after' : 'drop-before', '');
      state.dropTile = target.tile;
    }
  },

  _onDrop(win, state, event) {
    const drag = this._inspectDrag(win, event);
    if (!drag) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const { index } = this._dropTarget(state, event);
    this._clearDrop(state);

    if (drag.kind === 'essential') {
      const id = event.dataTransfer.getData(ESSENTIAL_DRAG_TYPE);
      const all = readAllItems();
      const from = all.findIndex(item => item.id === id);
      const to = from >= 0 && from < index ? index - 1 : index;
      if (from >= 0 && to !== from) {
        writeItems(moveEssential(all, id, to));
      }
    } else if (drag.kind === 'tab') {
      let insertAt = index;
      for (const tab of drag.tabs) {
        if (this._hasRoomFor(tabUrl(tab))) {
          this._addTab(win, state, tab, insertAt++);
        }
      }
    } else {
      const link = essentialUrlFromLinkData(event.dataTransfer);
      if (link) {
        this._addUrl(link.url, link.title, index);
      }
    }
  },

  _scheduleIconFetches(win, state, items) {
    if (!MidoriEssentialIcons.isLoaded()) {
      return;
    }
    for (const item of items) {
      let origin;
      try {
        origin = new URL(item.url).origin;
      } catch {
        continue;
      }
      if (state.iconRequests.has(origin) || !MidoriEssentialIcons.needsFetch(item.url)) {
        continue;
      }
      state.iconRequests.add(origin);
      win.requestIdleCallback(
        () => {
          MidoriEssentialIcons.ensure(win, item.url)
            .catch(() => {})
            .then(() => {
              state.iconRequests.delete(origin);
              if (states.get(win) === state) {
                for (const entry of readAllItems()) {
                  this._updateTile(state, entry.id);
                }
              }
            });
        },
        { timeout: 4000 }
      );
    }
  },

  _syncSelection(win, state) {
    const id = tabEssentialId(win.gBrowser?.selectedTab);
    if (id === state.selectedId) {
      return;
    }
    const previous = state.selectedId;
    state.selectedId = id;
    for (const key of [previous, id]) {
      const tile = key && state.tiles.get(key);
      if (tile) {
        tile.toggleAttribute('selected', key === id);
      }
    }
  },

  _updateTile(state, id) {
    const tile = state.tiles.get(id);
    if (!tile) {
      return;
    }
    const item = readAllItems().find(entry => entry.id === id);
    if (!item) {
      return;
    }
    const tab = state.live.get(id);
    const icon = iconFor(item, tab);
    if (tile.getAttribute('image') !== icon.src) {
      tile.setAttribute('image', icon.src);
    }
    tile.setAttribute('icon-kind', icon.kind);
    tile.toggleAttribute('live', !!tab && !tab.closing);
  },

  _render(win, state) {
    const doc = win.document;
    const { container } = state;
    const items = readAllItems().slice(0, getMax());
    const wanted = new Set(items.map(item => item.id));

    for (const [id, tile] of [...state.tiles]) {
      if (!wanted.has(id)) {
        tile.remove();
        state.tiles.delete(id);
      }
    }

    const selectedId = tabEssentialId(win.gBrowser?.selectedTab);
    const ordered = [];
    for (const item of items) {
      let tile = state.tiles.get(item.id);
      if (!tile) {
        tile = doc.createXULElement('toolbarbutton');
        tile.className = TILE_CLASS;
        tile.setAttribute(ID_ATTR, item.id);
        tile.setAttribute('context', POPUP_ID);
        tile.setAttribute('draggable', 'true');
        state.tiles.set(item.id, tile);
      }
      if (tile.getAttribute('label') !== item.title) {
        tile.setAttribute('label', item.title);
        tile.setAttribute('tooltiptext', item.title);
      }
      ordered.push(tile);
      tile.toggleAttribute('selected', item.id === selectedId);
      this._updateTile(state, item.id);
    }

    const current = Array.from(container.children);
    if (current.length !== ordered.length || current.some((node, i) => node !== ordered[i])) {
      container.replaceChildren(...ordered);
    }

    container.hidden = items.length === 0;
    container.style.setProperty(
      '--midori-essentials-columns',
      String(Math.max(1, Math.min(MAX_COLUMNS, items.length)))
    );
    state.selectedId = selectedId;
    this._scheduleIconFetches(win, state, items);
  },
};
