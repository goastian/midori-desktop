/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as SidebarPrefs from 'resource:///modules/msidebar/SidebarPrefs.mjs';
import { isRegularBrowserWindow } from 'resource:///modules/MidoriWebAppUtils.sys.mjs';
import {
  isReservedBrowserShortcut,
  isSafeGlobalShortcut,
} from './shortcuts/ShortcutPolicy.sys.mjs';

export { isReservedBrowserShortcut, isSafeGlobalShortcut };

const KEYSET_ID = 'midori-shortcuts-keyset';
const SEARCH_UI_UTILS_MODULE_URL = 'resource:///modules/SearchUIUtils.sys.mjs';

export const PREF_SHORTCUT_OPEN_CENTER = 'midori.shortcuts.general.openCenter';
export const PREF_SHORTCUT_TOGGLE_VERTICAL_TABS = 'midori.shortcuts.tabs.toggleVertical';
export const PREF_SHORTCUT_WORKSPACE_PREVIOUS = 'midori.workspaces.shortcut.previous';
export const PREF_SHORTCUT_WORKSPACE_NEXT = 'midori.workspaces.shortcut.next';

const SHORTCUT_DEFINITIONS = [
  {
    id: 'open-center',
    category: 'General',
    title: 'Open Midori Center',
    description: 'Open Midori Center in a new tab.',
    pref: PREF_SHORTCUT_OPEN_CENTER,
    defaultValue: 'Ctrl+Alt+M',
    action: 'open-center',
  },
  {
    id: 'toggle-vertical-tabs',
    category: 'General',
    title: 'Toggle Vertical Tabs',
    description: 'Switch between vertical and horizontal tabs.',
    pref: PREF_SHORTCUT_TOGGLE_VERTICAL_TABS,
    defaultValue: 'Ctrl+Alt+V',
    action: 'toggle-vertical-tabs',
  },
  {
    id: 'toggle-sidebar',
    category: 'Sidebar',
    title: 'Toggle Multi-Sidebar',
    description: 'Show or hide the Midori multi-sidebar.',
    pref: SidebarPrefs.PREF_SHORTCUT_TOGGLE_SIDEBAR,
    defaultValue: 'Ctrl+Alt+S',
    action: 'toggle-sidebar',
  },
  {
    id: 'sidebar-command-palette',
    category: 'Sidebar',
    title: 'Open Sidebar Commands',
    description: 'Search sidebar panels and actions.',
    pref: SidebarPrefs.PREF_SHORTCUT_COMMAND_PALETTE,
    defaultValue: 'Ctrl+Alt+P',
    action: 'sidebar-command-palette',
  },
  {
    id: 'search-selected-text',
    category: 'Quick Actions',
    title: 'Search Selected Text',
    description: 'Search the selected text with your default search engine.',
    pref: 'midori.shortcuts.quickActions.searchSelectedText',
    defaultValue: 'Ctrl+Alt+F',
    action: 'search-selected-text',
  },
  {
    id: 'duplicate-tab',
    category: 'Quick Actions',
    title: 'Duplicate Tab',
    description: 'Duplicate the current tab next to the original.',
    pref: 'midori.shortcuts.quickActions.duplicateTab',
    defaultValue: 'Ctrl+Alt+D',
    action: 'duplicate-tab',
  },
  {
    id: 'workspace-previous',
    category: 'Workspaces',
    title: 'Previous Workspace',
    description: 'Switch to the previous workspace.',
    pref: PREF_SHORTCUT_WORKSPACE_PREVIOUS,
    defaultValue: 'Ctrl+Alt+Q',
    action: 'workspace-previous',
  },
  {
    id: 'workspace-next',
    category: 'Workspaces',
    title: 'Next Workspace',
    description: 'Switch to the next workspace.',
    pref: PREF_SHORTCUT_WORKSPACE_NEXT,
    defaultValue: 'Ctrl+Alt+E',
    action: 'workspace-next',
  },
  ...Array.from({ length: 9 }, (_, index) => ({
    id: `workspace-${index + 1}`,
    category: 'Workspaces',
    title: `Switch to Workspace ${index + 1}`,
    description: `Jump directly to workspace ${index + 1}.`,
    pref: `midori.workspaces.shortcut.switch${index + 1}`,
    defaultValue: '',
    action: `workspace-${index + 1}`,
  })),
];

const NAMED_KEYS = {
  ArrowDown: { keycode: 'VK_DOWN', label: 'Down' },
  ArrowLeft: { keycode: 'VK_LEFT', label: 'Left' },
  ArrowRight: { keycode: 'VK_RIGHT', label: 'Right' },
  ArrowUp: { keycode: 'VK_UP', label: 'Up' },
  Backspace: { keycode: 'VK_BACK', label: 'Backspace' },
  Delete: { keycode: 'VK_DELETE', label: 'Delete' },
  End: { keycode: 'VK_END', label: 'End' },
  Enter: { keycode: 'VK_RETURN', label: 'Enter' },
  Escape: { keycode: 'VK_ESCAPE', label: 'Esc' },
  Home: { keycode: 'VK_HOME', label: 'Home' },
  Insert: { keycode: 'VK_INSERT', label: 'Insert' },
  PageDown: { keycode: 'VK_PAGE_DOWN', label: 'PageDown' },
  PageUp: { keycode: 'VK_PAGE_UP', label: 'PageUp' },
  Space: { keycode: 'VK_SPACE', label: 'Space' },
  Tab: { keycode: 'VK_TAB', label: 'Tab' },
};

function getNamedKeyDefinition(key) {
  if (!key) {
    return null;
  }

  if (/^F([1-9]|1[0-2])$/i.test(key)) {
    const label = key.toUpperCase();
    return { keycode: `VK_${label}`, label };
  }

  return NAMED_KEYS[key] || null;
}

function normalizeModifier(modifier) {
  const normalized = modifier?.trim()?.toLowerCase();
  switch (normalized) {
    case 'accel':
    case 'control':
    case 'ctrl':
      return 'Ctrl';
    case 'alt':
    case 'option':
      return 'Alt';
    case 'shift':
      return 'Shift';
    case 'cmd':
    case 'command':
    case 'meta':
      return 'Meta';
    default:
      return '';
  }
}

function orderModifiers(modifiers) {
  const unique = new Set(modifiers.map(normalizeModifier).filter(Boolean));
  return ['Ctrl', 'Alt', 'Shift', 'Meta'].filter((modifier) => unique.has(modifier));
}

function normalizeKeyLabel(key) {
  if (!key || typeof key !== 'string') {
    return '';
  }

  const trimmed = key.trim();
  if (!trimmed) {
    return '';
  }

  const named = getNamedKeyDefinition(trimmed);
  if (named) {
    return named.label;
  }

  if (trimmed.length === 1) {
    return trimmed.toUpperCase();
  }

  return trimmed;
}

export function normalizeShortcutString(shortcut) {
  if (!shortcut || typeof shortcut !== 'string') {
    return '';
  }

  const parts = shortcut
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) {
    return '';
  }

  const keyLabel = normalizeKeyLabel(parts.at(-1));
  if (!keyLabel) {
    return '';
  }

  return [...orderModifiers(parts.slice(0, -1)), keyLabel].join('+');
}

export function formatShortcutForDisplay(shortcut) {
  return normalizeShortcutString(shortcut) || 'Not set';
}

export function captureShortcutFromKeyEvent(event) {
  if (!event) {
    return '';
  }

  if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) {
    return '';
  }

  const modifiers = [];
  if (event.ctrlKey) {
    modifiers.push('Ctrl');
  }
  if (event.altKey) {
    modifiers.push('Alt');
  }
  if (event.shiftKey) {
    modifiers.push('Shift');
  }
  if (event.metaKey) {
    modifiers.push('Meta');
  }

  let keyLabel = '';
  const named = getNamedKeyDefinition(event.key);
  if (named) {
    keyLabel = named.label;
  } else if (event.key === ' ') {
    keyLabel = 'Space';
  } else if (event.key?.length === 1) {
    keyLabel = event.key.toUpperCase();
  } else if (/^F([1-9]|1[0-2])$/i.test(event.key || '')) {
    keyLabel = event.key.toUpperCase();
  }

  if (!keyLabel) {
    return '';
  }

  if (!modifiers.length && !/^F([1-9]|1[0-2])$/.test(keyLabel)) {
    return '';
  }

  return normalizeShortcutString([...modifiers, keyLabel].join('+'));
}

function modifierToXul(modifier) {
  switch (modifier.toLowerCase()) {
    case 'ctrl':
      return 'control';
    case 'meta':
      return 'meta';
    case 'alt':
      return 'alt';
    case 'shift':
      return 'shift';
    default:
      return modifier.toLowerCase();
  }
}

function shortcutToXul(shortcut) {
  const normalized = normalizeShortcutString(shortcut);
  if (!normalized || !isSafeGlobalShortcut(normalized)) {
    return null;
  }

  const parts = normalized.split('+');
  const keyLabel = parts.at(-1);
  const modifiers = parts.slice(0, -1).map(modifierToXul).join(',');
  const named = getNamedKeyDefinition(keyLabel);

  if (named?.keycode) {
    return { key: '', keycode: named.keycode, modifiers };
  }

  return { key: keyLabel.toLowerCase(), keycode: '', modifiers };
}

function getUniquePrefs() {
  return [...new Set(SHORTCUT_DEFINITIONS.map((definition) => definition.pref))];
}

async function switchWorkspaceRelative(win, delta) {
  const { MidoriWorkspaces } = ChromeUtils.importESModule('resource:///modules/MidoriWorkspaces.sys.mjs');
  const snapshot = await MidoriWorkspaces.getWorkspacesForWindow(win);
  const workspaces = snapshot?.workspaces || [];
  if (!workspaces.length || !snapshot?.selectedId) {
    return;
  }

  const currentIndex = workspaces.findIndex((workspace) => workspace.id === snapshot.selectedId);
  if (currentIndex === -1) {
    return;
  }

  const nextIndex = (currentIndex + delta + workspaces.length) % workspaces.length;
  const nextWorkspace = workspaces[nextIndex];
  if (nextWorkspace) {
    MidoriWorkspaces.switchWorkspace(win, nextWorkspace.id);
  }
}

async function switchWorkspaceAtIndex(win, index) {
  const { MidoriWorkspaces } = ChromeUtils.importESModule('resource:///modules/MidoriWorkspaces.sys.mjs');
  const snapshot = await MidoriWorkspaces.getWorkspacesForWindow(win);
  const targetWorkspace = snapshot?.workspaces?.[index];
  if (targetWorkspace) {
    MidoriWorkspaces.switchWorkspace(win, targetWorkspace.id);
  }
}

async function getSelectedText(win) {
  const browser = win.gBrowser?.selectedBrowser;
  const actor = browser?.browsingContext?.currentWindowGlobal?.getActor('ContextMenu');
  if (!actor) {
    return '';
  }

  try {
    return (await actor.sendQuery('ContextMenu:GetSelection'))?.text || '';
  } catch {
    return '';
  }
}

async function searchSelectedText(win) {
  const browser = win.gBrowser?.selectedBrowser;
  const searchText = await getSelectedText(win);
  if (!browser || !searchText) {
    return;
  }

  const { SearchUIUtils } = ChromeUtils.importESModule(SEARCH_UI_UTILS_MODULE_URL);
  await SearchUIUtils.loadSearch({
    window: win,
    searchText,
    where: 'tab',
    triggeringPrincipal: browser.contentPrincipal,
    sapSource: 'contextmenu',
  });
}

export function getShortcutDefinitions() {
  return SHORTCUT_DEFINITIONS.map((definition) => ({ ...definition }));
}

export function getShortcutValue(pref) {
  const normalized = normalizeShortcutString(Services.prefs.getStringPref(pref, ''));
  return !normalized || isSafeGlobalShortcut(normalized) ? normalized : '';
}

export function setShortcutValue(pref, value) {
  const normalized = normalizeShortcutString(value);
  if (
    normalized &&
    (!isSafeGlobalShortcut(normalized) || isReservedBrowserShortcut(normalized))
  ) {
    return false;
  }
  Services.prefs.setStringPref(pref, normalized);
  return true;
}

export const MidoriShortcuts = {
  _initialized: false,

  init() {
    if (this._initialized) {
      return;
    }

    this._initialized = true;

    for (const pref of getUniquePrefs()) {
      Services.prefs.addObserver(pref, this);
    }

    Services.obs.addObserver(this, 'browser-delayed-startup-finished');

    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      if (win.document.readyState === 'complete') {
        this._applyToWindow(win);
      }
    }
  },

  observe(subject, topic) {
    if (topic === 'nsPref:changed') {
      this._refreshAllWindows();
    } else if (topic === 'browser-delayed-startup-finished') {
      this._applyToWindow(subject);
    }
  },

  _refreshAllWindows() {
    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      if (win.document.readyState === 'complete') {
        this._applyToWindow(win);
      }
    }
  },

  _applyToWindow(win) {
    if (!isRegularBrowserWindow(win)) {
      return;
    }

    const doc = win.document;
    doc.getElementById(KEYSET_ID)?.remove();

    const keyset = doc.createXULElement('keyset');
    keyset.id = KEYSET_ID;

    for (const definition of SHORTCUT_DEFINITIONS) {
      const shortcut = getShortcutValue(definition.pref);
      if (!shortcut || isReservedBrowserShortcut(shortcut)) {
        continue;
      }

      const parsed = shortcutToXul(shortcut);
      if (!parsed || (!parsed.key && !parsed.keycode)) {
        continue;
      }

      const key = doc.createXULElement('key');
      key.id = `midori-shortcut-${definition.id}`;
      if (parsed.key) {
        key.setAttribute('key', parsed.key);
      }
      if (parsed.keycode) {
        key.setAttribute('keycode', parsed.keycode);
      }
      if (parsed.modifiers) {
        key.setAttribute('modifiers', parsed.modifiers);
      }
      key.addEventListener(
        'command',
        () => {
          void this._runAction(definition.action, win);
        },
        true
      );
      keyset.appendChild(key);
    }

    if (!keyset.childNodes.length) {
      return;
    }

    doc.documentElement.appendChild(keyset);
  },

  async _runAction(action, win) {
    switch (action) {
      case 'open-center':
        win.openTrustedLinkIn('about:center', 'tab');
        return;
      case 'toggle-vertical-tabs':
        Services.prefs.setBoolPref(
          'midori.verticaltabs.enabled',
          !Services.prefs.getBoolPref('midori.verticaltabs.enabled', false)
        );
        return;
      case 'toggle-sidebar':
        Services.prefs.setBoolPref(
          SidebarPrefs.PREF_ENABLED,
          !Services.prefs.getBoolPref(SidebarPrefs.PREF_ENABLED, false)
        );
        return;
      case 'sidebar-command-palette':
        Services.obs.notifyObservers(win, 'midori-msidebar-open-command-palette');
        return;
      case 'search-selected-text':
        await searchSelectedText(win);
        return;
      case 'duplicate-tab':
        win.BrowserCommands?.duplicateTab();
        return;
      case 'workspace-previous':
        await switchWorkspaceRelative(win, -1);
        return;
      case 'workspace-next':
        await switchWorkspaceRelative(win, 1);
        return;
      default:
        break;
    }

    const match = /^workspace-(\d+)$/.exec(action);
    if (match) {
      await switchWorkspaceAtIndex(win, Number(match[1]) - 1);
    }
  },

  uninit() {
    if (!this._initialized) {
      return;
    }

    this._initialized = false;
    for (const pref of getUniquePrefs()) {
      try {
        Services.prefs.removeObserver(pref, this);
      } catch {}
    }
    try {
      Services.obs.removeObserver(this, 'browser-delayed-startup-finished');
    } catch {}

    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      win.document?.getElementById(KEYSET_ID)?.remove();
    }
  },
};
