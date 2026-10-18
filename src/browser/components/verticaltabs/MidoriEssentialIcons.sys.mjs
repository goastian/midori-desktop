/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  extractHeadIcons,
  extractManifestIcons,
  iconMimeType,
  needsManifest,
  rankIcons,
} from 'resource:///modules/MidoriFaviconPicker.sys.mjs';

/**
 * MidoriEssentialIcons: downloads the real, high resolution icon of each
 * Essentials site once and keeps it in the profile.
 *
 * Only the page head is read, only for sites listed in Essentials, no cookies
 * or referrer are sent, and a failure is not retried for a day. Turn it off
 * with midori.verticaltabs.essentials.fetchIcons.
 *
 * @patch Midori Browser
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  clearTimeout: 'resource://gre/modules/Timer.sys.mjs',
  setTimeout: 'resource://gre/modules/Timer.sys.mjs',
});

const PREF_FETCH_ICONS = 'midori.verticaltabs.essentials.fetchIcons';
const CACHE_FILE = 'midori-essential-icons.json';
const CACHE_VERSION = 1;
const FRESH_MS = 30 * 24 * 60 * 60 * 1000;
const RETRY_MS = 24 * 60 * 60 * 1000;
const SAVE_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 10000;
const MAX_HEAD_BYTES = 256 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_ICON_BYTES = 400 * 1024;
const MAX_ATTEMPTS = 4;
const DATA_URL = /^data:image\/(?:png|x-icon|vnd\.microsoft\.icon|svg\+xml|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

let cache = null;
let loading = null;
let saveTimer = null;
const inflight = new Map();

function originOf(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

function cachePath() {
  return PathUtils.join(PathUtils.profileDir, CACHE_FILE);
}

function sanitizeCache(raw) {
  const clean = { version: CACHE_VERSION, icons: {}, failures: {} };
  if (!raw || raw.version !== CACHE_VERSION) {
    return clean;
  }
  for (const [origin, entry] of Object.entries(raw.icons || {})) {
    if (
      originOf(origin) &&
      typeof entry?.data === 'string' &&
      entry.data.length <= MAX_ICON_BYTES * 2 &&
      DATA_URL.test(entry.data) &&
      Number.isFinite(entry.fetchedAt)
    ) {
      clean.icons[origin] = { data: entry.data, fetchedAt: entry.fetchedAt, source: String(entry.source || '') };
    }
  }
  for (const [origin, at] of Object.entries(raw.failures || {})) {
    if (originOf(origin) && Number.isFinite(at)) {
      clean.failures[origin] = at;
    }
  }
  return clean;
}

function scheduleSave() {
  if (saveTimer) {
    return;
  }
  saveTimer = lazy.setTimeout(async () => {
    saveTimer = null;
    try {
      await IOUtils.writeJSON(cachePath(), cache, { tmpPath: `${cachePath()}.tmp` });
    } catch (e) {
      console.error('MidoriEssentialIcons: could not save the icon cache', e);
    }
  }, SAVE_DELAY_MS);
}

function toDataUrl(win, bytes, mime) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${mime};base64,${win.btoa(binary)}`;
}

/**
 * Reads a response up to `maxBytes`; with `stopOn` it stops as soon as the
 * text read so far matches, so a page is never downloaded in full.
 */
async function readLimited(win, url, { maxBytes, stopOn = null }) {
  const controller = new win.AbortController();
  const timer = win.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await win.fetch(url, {
      signal: controller.signal,
      credentials: 'omit',
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${response.status}`);
    }
    const declared = Number(response.headers.get('content-length'));
    if (!stopOn && declared > maxBytes) {
      throw new Error('too large');
    }

    const reader = response.body.getReader();
    const decoder = stopOn ? new win.TextDecoder() : null;
    const chunks = [];
    let total = 0;
    let text = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.length;
      if (total > maxBytes && !stopOn) {
        await reader.cancel();
        throw new Error('too large');
      }
      chunks.push(value);
      if (stopOn) {
        text += decoder.decode(value, { stream: true });
        if (stopOn.test(text) || total >= maxBytes) {
          await reader.cancel();
          break;
        }
      }
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return {
      bytes,
      url: response.url || url,
      contentType: response.headers.get('content-type') || '',
    };
  } finally {
    win.clearTimeout(timer);
  }
}

async function downloadIcon(win, url) {
  const { bytes, contentType } = await readLimited(win, url, { maxBytes: MAX_ICON_BYTES });
  const mime = iconMimeType(contentType, url);
  if (!mime || bytes.length < 16) {
    return null;
  }
  const data = toDataUrl(win, bytes, mime);
  return DATA_URL.test(data) ? data : null;
}

async function discoverIcon(win, origin) {
  let candidates = [];
  try {
    const page = await readLimited(win, `${origin}/`, {
      maxBytes: MAX_HEAD_BYTES,
      stopOn: /<\/head\s*>/i,
    });
    // A redirect to another site (Gmail to the Google sign-in page) describes
    // that other site, not this one.
    if (originOf(page.url) !== origin) {
      throw new Error('cross-origin redirect');
    }
    const text = new win.TextDecoder().decode(page.bytes);
    const found = extractHeadIcons(text, page.url);
    candidates = found.icons;
    if (found.manifest && needsManifest(candidates)) {
      try {
        const manifest = await readLimited(win, found.manifest, { maxBytes: MAX_MANIFEST_BYTES });
        candidates = [
          ...candidates,
          ...extractManifestIcons(
            JSON.parse(new win.TextDecoder().decode(manifest.bytes)),
            manifest.url
          ),
        ];
      } catch {}
    }
  } catch {}

  for (const candidate of rankIcons(candidates, origin).slice(0, MAX_ATTEMPTS)) {
    try {
      const data = await downloadIcon(win, candidate.url);
      if (data) {
        return { data, source: candidate.url };
      }
    } catch {}
  }
  return null;
}

export const MidoriEssentialIcons = {
  isEnabled() {
    return Services.prefs.getBoolPref(PREF_FETCH_ICONS, true);
  },

  load() {
    loading ||= (async () => {
      let raw = null;
      try {
        if (await IOUtils.exists(cachePath())) {
          raw = await IOUtils.readJSON(cachePath());
        }
      } catch {}
      cache = sanitizeCache(raw);
    })();
    return loading;
  },

  isLoaded() {
    return !!cache;
  },

  getCached(url) {
    const origin = originOf(url);
    return (origin && cache?.icons[origin]?.data) || null;
  },

  /**
   * Whether `ensure` would hit the network for this site right now.
   */
  needsFetch(url) {
    const origin = originOf(url);
    if (!origin || !cache || !this.isEnabled() || inflight.has(origin)) {
      return false;
    }
    const entry = cache.icons[origin];
    if (entry && Date.now() - entry.fetchedAt < FRESH_MS) {
      return false;
    }
    const failedAt = cache.failures[origin];
    return !(failedAt && Date.now() - failedAt < RETRY_MS);
  },

  async ensure(win, url) {
    await this.load();
    const origin = originOf(url);
    if (!origin) {
      return null;
    }
    if (this.needsFetch(url)) {
      const request = discoverIcon(win, origin)
        .then(result => {
          if (result) {
            cache.icons[origin] = { ...result, fetchedAt: Date.now() };
            delete cache.failures[origin];
          } else {
            cache.failures[origin] = Date.now();
          }
          scheduleSave();
        })
        .catch(() => {
          cache.failures[origin] = Date.now();
          scheduleSave();
        })
        .finally(() => inflight.delete(origin));
      inflight.set(origin, request);
    }
    await inflight.get(origin);
    return this.getCached(url);
  },

  async clear() {
    await this.load();
    cache = sanitizeCache(null);
    scheduleSave();
  },
};
