const SETUP_ICON_BASE = 'chrome://browser/content/setup/icons/';

export const SIDEBAR_SITE_CATALOG = [
  { id: 'astian-cloud', title: 'Astian Cloud', url: 'https://cloud.astian.org/', icon: `${SETUP_ICON_BASE}astian-cloud.svg` },
  { id: 'astian-calendar', title: 'Astian Calendar', url: 'https://calendar.astian.org/', icon: `${SETUP_ICON_BASE}astian-calendar.svg` },
  { id: 'astian-contacts', title: 'Astian Contacts', url: 'https://contacts.astian.org/', icon: `${SETUP_ICON_BASE}astian-contacts.svg` },
  { id: 'midorivpn', title: 'MidoriVPN', url: 'https://vpn.astian.org/', icon: `${SETUP_ICON_BASE}midorivpn.svg` },
  { id: 'github', title: 'GitHub', url: 'https://github.com/', icon: `${SETUP_ICON_BASE}github.svg` },
  { id: 'discord', title: 'Discord', url: 'https://discord.com/', icon: `${SETUP_ICON_BASE}discord.svg` },
  { id: 'youtube', title: 'YouTube', url: 'https://www.youtube.com/', icon: `${SETUP_ICON_BASE}youtube.png` },
  { id: 'twitch', title: 'Twitch', url: 'https://www.twitch.tv/', icon: `${SETUP_ICON_BASE}twitch.svg` },
  { id: 'reddit', title: 'Reddit', url: 'https://www.reddit.com/', icon: `${SETUP_ICON_BASE}reddit.svg` },
  { id: 'amazon', title: 'Amazon', url: 'https://www.amazon.com/', icon: `${SETUP_ICON_BASE}amazon.svg` },
  { id: 'whatsapp', title: 'WhatsApp', url: 'https://web.whatsapp.com/', icon: `${SETUP_ICON_BASE}whatsapp.svg` },
  { id: 'telegram', title: 'Telegram', url: 'https://web.telegram.org/', icon: `${SETUP_ICON_BASE}telegram.svg` },
  { id: 'spotify', title: 'Spotify', url: 'https://open.spotify.com/', icon: `${SETUP_ICON_BASE}spotify.svg` },
  { id: 'wikipedia', title: 'Wikipedia', url: 'https://www.wikipedia.org/', icon: `${SETUP_ICON_BASE}wikipedia.png` },
];

export const DEFAULT_SELECTED_SIDEBAR_SITE_IDS = [
  'astian-cloud',
  'astian-calendar',
  'astian-contacts',
  'midorivpn',
];

export function getSidebarSiteById(id) {
  return SIDEBAR_SITE_CATALOG.find(site => site.id === id) || null;
}

export function normalizeSidebarSiteId(id) {
  return typeof id === 'string' && SIDEBAR_SITE_CATALOG.some(site => site.id === id)
    ? id
    : null;
}

export function canonicalizeSiteUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).href;
  } catch {
    return null;
  }
}

export function sidebarSiteMatchesUrl(site, url) {
  const expected = canonicalizeSiteUrl(site?.url);
  const actual = canonicalizeSiteUrl(url);
  return !!expected && expected === actual;
}

export function findSiteForPanelUrl(url) {
  const actual = canonicalizeSiteUrl(url);
  if (!actual) return null;
  return SIDEBAR_SITE_CATALOG.find(site => canonicalizeSiteUrl(site.url) === actual) || null;
}

export function parseSelectedSiteIds(value) {
  let raw = value;
  if (typeof raw !== 'string') return [...DEFAULT_SELECTED_SIDEBAR_SITE_IDS];
  try {
    raw = JSON.parse(raw);
  } catch {
    return [...DEFAULT_SELECTED_SIDEBAR_SITE_IDS];
  }
  if (!Array.isArray(raw)) return [...DEFAULT_SELECTED_SIDEBAR_SITE_IDS];
  const seen = new Set();
  const out = [];
  for (const id of raw) {
    const normalized = normalizeSidebarSiteId(id);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

export function serializeSelectedSiteIds(ids) {
  const seen = new Set();
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    const normalized = normalizeSidebarSiteId(id);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return JSON.stringify(out);
}

export function toggleSelectedSiteId(ids, siteId, enabled) {
  const current = new Set(
    (Array.isArray(ids) ? ids : []).map(normalizeSidebarSiteId).filter(Boolean)
  );
  const normalized = normalizeSidebarSiteId(siteId);
  if (!normalized) return [...current];
  if (enabled) current.add(normalized);
  else current.delete(normalized);
  return SIDEBAR_SITE_CATALOG.map(site => site.id).filter(id => current.has(id));
}

export function selectedSiteIdsFromPanels(panels) {
  const ids = new Set();
  for (const panel of Array.isArray(panels) ? panels : []) {
    const site = findSiteForPanelUrl(panel?.url);
    if (site) ids.add(site.id);
  }
  return SIDEBAR_SITE_CATALOG.map(site => site.id).filter(id => ids.has(id));
}

export function getMissingSitesForPanels(panels, selectedIds) {
  const present = new Set(selectedSiteIdsFromPanels(panels));
  return (Array.isArray(selectedIds) ? selectedIds : [])
    .map(normalizeSidebarSiteId)
    .filter(Boolean)
    .map(getSidebarSiteById)
    .filter(site => site && !present.has(site.id));
}

export function getDanglingPanelIds(panels, selectedIds) {
  const selected = new Set(
    (Array.isArray(selectedIds) ? selectedIds : []).map(normalizeSidebarSiteId).filter(Boolean)
  );
  const out = [];
  for (const panel of Array.isArray(panels) ? panels : []) {
    if (!panel || typeof panel.id !== 'string') continue;
    const site = findSiteForPanelUrl(panel.url);
    if (site && !selected.has(site.id)) out.push(panel.id);
  }
  return out;
}
