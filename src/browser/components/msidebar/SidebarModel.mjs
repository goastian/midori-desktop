const STORE_VERSION = 1;

export function createDefaultStore() {
  return {
    version: STORE_VERSION,
    settings: {},
    panels: [],
    last: {},
  };
}

export function sanitizeUrl(url) {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.toString();
    if (u.protocol === 'file:' || u.protocol === 'moz-extension:') return u.toString();
    return null;
  } catch {
    return null;
  }
}

export function generateId() {
  try {
    return Services.uuid.generateUUID().toString().replace(/[{}]/g, '');
  } catch {
    return `msb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

export function createPanel({ url, title, userContextId } = {}) {
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) return null;
  const panel = {
    id: generateId(),
    url: safeUrl,
    title: typeof title === 'string' ? title.slice(0, 120) : '',
    pinned: true,
    floating: false,
    zoom: 1,
    userContextId: Number.isInteger(userContextId) ? userContextId : 0,
    muted: false,
    loadOnStartup: false,
    restoreLastUrl: true,
    geometry: {
      width: 480,
      height: 640,
      offsetX: 12,
      offsetY: 12,
    },
  };
  return panel;
}

export function validateStore(store) {
  const def = createDefaultStore();
  if (!store || typeof store !== 'object') return def;

  const version = Number.isInteger(store.version) ? store.version : STORE_VERSION;
  const panels = Array.isArray(store.panels) ? store.panels : [];
  const settings = store.settings && typeof store.settings === 'object' ? store.settings : {};
  const last = store.last && typeof store.last === 'object' ? store.last : {};

  const fixedPanels = [];
  const seen = new Set();
  for (const p of panels) {
    if (!p || typeof p !== 'object') continue;
    if (typeof p.id !== 'string' || !p.id) continue;
    if (seen.has(p.id)) continue;
    const safeUrl = sanitizeUrl(p.url);
    if (!safeUrl) continue;
    seen.add(p.id);
    fixedPanels.push({
      id: p.id,
      url: safeUrl,
      title: typeof p.title === 'string' ? p.title.slice(0, 120) : '',
      pinned: !!p.pinned,
      floating: !!p.floating,
      zoom: typeof p.zoom === 'number' ? Math.max(0.3, Math.min(3, p.zoom)) : 1,
      userContextId: Number.isInteger(p.userContextId) ? p.userContextId : 0,
      muted: !!p.muted,
      loadOnStartup: !!p.loadOnStartup,
      restoreLastUrl: p.restoreLastUrl !== false,
      geometry: normalizeGeometry(p.geometry),
    });
  }

  const selectedPanelId =
    typeof last.selectedPanelId === 'string' && seen.has(last.selectedPanelId)
      ? last.selectedPanelId
      : fixedPanels[0]?.id;

  return {
    version,
    settings: { ...settings },
    panels: fixedPanels,
    last: { selectedPanelId },
  };
}

function normalizeGeometry(geom) {
  const def = { width: 480, height: 640, offsetX: 12, offsetY: 12 };
  if (!geom || typeof geom !== 'object') return def;
  const width = typeof geom.width === 'number' ? clamp(geom.width, 240, 1200) : def.width;
  const height = typeof geom.height === 'number' ? clamp(geom.height, 240, 1200) : def.height;
  const offsetX = typeof geom.offsetX === 'number' ? clamp(geom.offsetX, -2000, 2000) : def.offsetX;
  const offsetY = typeof geom.offsetY === 'number' ? clamp(geom.offsetY, -2000, 2000) : def.offsetY;
  return { width, height, offsetX, offsetY };
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
