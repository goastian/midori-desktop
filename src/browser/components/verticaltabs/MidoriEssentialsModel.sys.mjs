/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Pure data model for the vertical tabs Essentials grid.
 *
 * Essentials are a per-profile list of sites. They are not tabs: an entry only
 * gets a live (pinned) tab when the user opens it, so an untouched list costs
 * nothing at startup.
 */

const ICON_BASE = 'chrome://browser/content/setup/icons/';

export const MAX_ESSENTIALS = 12;
export const DEFAULT_MAX_ESSENTIALS = 6;
const MAX_ID_LENGTH = 64;
const MAX_TITLE_LENGTH = 80;
const MAX_URL_LENGTH = 2048;

export const DEFAULT_ESSENTIALS = Object.freeze([
  { id: 'gmail', title: 'Gmail', url: 'https://mail.google.com/', icon: `${ICON_BASE}gmail.svg` },
  { id: 'youtube', title: 'YouTube', url: 'https://www.youtube.com/', icon: `${ICON_BASE}youtube.png` },
  { id: 'whatsapp', title: 'WhatsApp', url: 'https://web.whatsapp.com/', icon: `${ICON_BASE}whatsapp.svg` },
  { id: 'spotify', title: 'Spotify', url: 'https://open.spotify.com/', icon: `${ICON_BASE}spotify.svg` },
  { id: 'github', title: 'GitHub', url: 'https://github.com/', icon: `${ICON_BASE}github-plate.svg` },
  { id: 'reddit', title: 'Reddit', url: 'https://www.reddit.com/', icon: `${ICON_BASE}reddit.svg` },
].map(item => Object.freeze(item)));

export function clampMaxEssentials(value) {
  const number = Number.isFinite(value) ? Math.trunc(value) : DEFAULT_MAX_ESSENTIALS;
  return Math.max(1, Math.min(MAX_ESSENTIALS, number));
}

export function canonicalEssentialUrl(url) {
  if (typeof url !== 'string' || !url || url.length > MAX_URL_LENGTH) {
    return null;
  }
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

export function normalizeEssential(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const url = canonicalEssentialUrl(raw.url);
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!url || !id || id.length > MAX_ID_LENGTH || !/^[\w.-]+$/.test(id)) {
    return null;
  }

  let title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) {
    title = new URL(url).hostname.replace(/^www\./, '');
  }

  const item = { id, title: title.slice(0, MAX_TITLE_LENGTH), url };
  if (typeof raw.icon === 'string' && raw.icon.startsWith(ICON_BASE)) {
    item.icon = raw.icon;
  }
  return item;
}

function normalizeList(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const item = normalizeEssential(raw);
    if (!item || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    out.push(item);
    if (out.length >= MAX_ESSENTIALS) {
      break;
    }
  }
  return out;
}

/**
 * An empty or invalid value means "never customised" and yields the defaults;
 * a stored empty array means the user removed every entry on purpose.
 */
export function parseEssentials(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return DEFAULT_ESSENTIALS.map(item => ({ ...item }));
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return DEFAULT_ESSENTIALS.map(item => ({ ...item }));
    }
    return normalizeList(parsed);
  } catch {
    return DEFAULT_ESSENTIALS.map(item => ({ ...item }));
  }
}

export function serializeEssentials(items) {
  return JSON.stringify(normalizeList(items));
}

export function findEssentialByUrl(items, url) {
  const wanted = canonicalEssentialUrl(url);
  return wanted ? items.find(item => item.url === wanted) || null : null;
}

/**
 * @returns {{ items: object[], item: object|null, added: boolean }}
 */
export function addEssential(items, raw, max = DEFAULT_MAX_ESSENTIALS) {
  const item = normalizeEssential(raw);
  if (!item) {
    return { items, item: null, added: false };
  }
  const existing = findEssentialByUrl(items, item.url);
  if (existing) {
    return { items, item: existing, added: false };
  }
  if (items.some(other => other.id === item.id)) {
    return { items, item: null, added: false };
  }
  if (items.length >= clampMaxEssentials(max)) {
    return { items, item: null, added: false };
  }
  return { items: [...items, item], item, added: true };
}

export function removeEssential(items, id) {
  return items.filter(item => item.id !== id);
}

export function moveEssential(items, id, toIndex) {
  const from = items.findIndex(item => item.id === id);
  if (from < 0) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  const target = Math.max(0, Math.min(next.length, Math.trunc(toIndex)));
  next.splice(target, 0, moved);
  return next;
}

export function createEssentialId(randomPart) {
  const part = String(randomPart || '').replace(/[^\w]/g, '').slice(0, 24);
  return `custom-${part || Date.now().toString(36)}`;
}
