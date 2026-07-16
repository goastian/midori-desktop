/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const MODIFIER_ALIASES = new Map([
  ['accel', 'Ctrl'],
  ['alt', 'Alt'],
  ['cmd', 'Meta'],
  ['command', 'Meta'],
  ['control', 'Ctrl'],
  ['ctrl', 'Ctrl'],
  ['meta', 'Meta'],
  ['option', 'Alt'],
  ['shift', 'Shift'],
]);

const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'];
const RESERVED_BROWSER_SHORTCUTS = new Set(['Ctrl+D', 'Meta+D']);

function canonicalizeShortcut(shortcut) {
  if (typeof shortcut !== 'string') return '';

  const parts = shortcut
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return '';

  const key = parts.at(-1);
  if (!key) return '';

  const modifiers = new Set(
    parts
      .slice(0, -1)
      .map((modifier) => MODIFIER_ALIASES.get(modifier.toLowerCase()))
      .filter(Boolean)
  );

  return [...MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier)), key.toUpperCase()].join('+');
}

/**
 * Keep Midori-configurable shortcuts from shadowing essential browser actions.
 * Ctrl/Cmd+D belongs to Firefox's built-in "Bookmark this page" command.
 */
export function isReservedBrowserShortcut(shortcut) {
  return RESERVED_BROWSER_SHORTCUTS.has(canonicalizeShortcut(shortcut));
}
