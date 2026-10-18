/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Pure helpers that decide which icon of a site to use for an Essentials tile.
 * They never touch the network: callers pass in the page head and the web app
 * manifest they fetched.
 */

const VECTOR_SCORE = 1000;
const MAX_USEFUL_SIZE = 512;
const UNKNOWN_SIZE = {
  svg: VECTOR_SCORE,
  apple: 180,
  ico: 48,
  raster: 32,
};

const IGNORED_RELS = new Set(['mask-icon', 'fluid-icon']);

function parseAttributes(tag) {
  const attributes = {};
  const pattern = /([^\s=/>"']+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match;
  // Skip the tag name itself.
  const body = tag.replace(/^<\s*link\b/i, '');
  while ((match = pattern.exec(body))) {
    const name = match[1].toLowerCase();
    if (!(name in attributes)) {
      attributes[name] = match[2] ?? match[3] ?? match[4] ?? '';
    }
  }
  return attributes;
}

function resolveHttpUrl(href, baseUrl) {
  if (typeof href !== 'string' || !href.trim()) {
    return null;
  }
  try {
    const url = new URL(href.trim(), baseUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Largest edge declared in a `sizes` attribute. "any" counts as vector.
 */
export function parseSizes(sizes) {
  if (typeof sizes !== 'string') {
    return 0;
  }
  let best = 0;
  for (const token of sizes.toLowerCase().split(/\s+/)) {
    if (token === 'any') {
      return VECTOR_SCORE;
    }
    const match = /^(\d+)x(\d+)$/.exec(token);
    if (match) {
      best = Math.max(best, Math.min(Number(match[1]), Number(match[2])));
    }
  }
  return best;
}

function isSvg(url, type) {
  return /svg/i.test(type || '') || /\.svg(?:[?#]|$)/i.test(url);
}

function isIco(url, type) {
  const declaredIco = /icon|ico/i.test(type || '') && !/svg|png/i.test(type || '');
  return declaredIco || /\.ico(?:[?#]|$)/i.test(url);
}

export function scoreIcon({ url, type = '', size = 0, apple = false }) {
  if (isSvg(url, type)) {
    return VECTOR_SCORE;
  }
  let effective = size;
  if (!effective) {
    if (apple) {
      effective = UNKNOWN_SIZE.apple;
    } else if (isIco(url, type)) {
      effective = UNKNOWN_SIZE.ico;
    } else {
      effective = UNKNOWN_SIZE.raster;
    }
  }
  if (effective === VECTOR_SCORE) {
    return VECTOR_SCORE;
  }
  if (effective > MAX_USEFUL_SIZE) {
    effective = MAX_USEFUL_SIZE - (effective - MAX_USEFUL_SIZE) / 100;
  }
  return effective + (apple ? 0.5 : 0);
}

/**
 * @returns {{ icons: object[], manifest: string|null }} Icon candidates found
 *   in the markup and the URL of the web app manifest, if declared.
 */
export function extractHeadIcons(html, baseUrl) {
  const icons = [];
  let manifest = null;
  if (typeof html !== 'string') {
    return { icons, manifest };
  }

  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const attributes = parseAttributes(tag);
    const rels = (attributes.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
    const url = resolveHttpUrl(attributes.href, baseUrl);
    if (!url || !rels.length) {
      continue;
    }
    if (rels.includes('manifest')) {
      manifest ||= url;
      continue;
    }
    if (rels.some(rel => IGNORED_RELS.has(rel))) {
      continue;
    }
    const apple = rels.some(rel => rel.startsWith('apple-touch-icon'));
    if (!apple && !rels.includes('icon')) {
      continue;
    }
    const type = attributes.type || '';
    const size = parseSizes(attributes.sizes);
    icons.push({ url, type, size, apple, score: scoreIcon({ url, type, size, apple }) });
  }
  return { icons, manifest };
}

export function extractManifestIcons(manifest, manifestUrl) {
  const icons = [];
  for (const entry of Array.isArray(manifest?.icons) ? manifest.icons : []) {
    const url = resolveHttpUrl(entry?.src, manifestUrl);
    if (!url || /monochrome/i.test(entry.purpose || '')) {
      continue;
    }
    const type = typeof entry.type === 'string' ? entry.type : '';
    const size = parseSizes(entry.sizes);
    icons.push({ url, type, size, apple: false, score: scoreIcon({ url, type, size }) });
  }
  return icons;
}

/**
 * Candidates ordered from best to worst, ending with the conventional
 * locations used when a page declares nothing usable.
 */
export function rankIcons(candidates, origin) {
  const seen = new Set();
  const ranked = [];
  for (const candidate of [...candidates].sort((a, b) => b.score - a.score)) {
    if (!seen.has(candidate.url)) {
      seen.add(candidate.url);
      ranked.push(candidate);
    }
  }
  for (const path of ['/apple-touch-icon.png', '/favicon.ico']) {
    const url = `${origin}${path}`;
    if (!seen.has(url)) {
      seen.add(url);
      ranked.push({
        url,
        type: '',
        size: 0,
        apple: path.startsWith('/apple'),
        score: 0,
      });
    }
  }
  return ranked;
}

export function needsManifest(candidates) {
  return !candidates.some(candidate => candidate.score >= 96);
}

export function iconMimeType(contentType, url) {
  const declared = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (declared.startsWith('image/')) {
    return declared;
  }
  if (/\.svg(?:[?#]|$)/i.test(url)) return 'image/svg+xml';
  if (/\.png(?:[?#]|$)/i.test(url)) return 'image/png';
  if (/\.ico(?:[?#]|$)/i.test(url)) return 'image/x-icon';
  if (/\.jpe?g(?:[?#]|$)/i.test(url)) return 'image/jpeg';
  return null;
}
