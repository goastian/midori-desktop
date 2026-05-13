const STORE_VERSION = 2;

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
    title: {
      mode: 'dynamic',
      value: typeof title === 'string' ? title.slice(0, 120) : '',
    },
    favicon: {
      mode: 'dynamic',
      value: '',
    },
    pinned: true,
    floating: {
      enabled: false,
      anchor: 'center',
      alwaysOnTop: false,
      x: 0,
      y: 0,
      w: 480,
      h: 640,
    },
    dockWidth: null,
    zoom: 1,
    mobile: false,
    temporary: false,
    unloadOnClose: false,
    periodicReload: {
      enabled: false,
      seconds: 300,
    },
    shortcut: '',
    cssSelector: {
      enabled: false,
      value: '',
    },
    hide: {
      toolbar: false,
      soundIcon: false,
      notificationBadge: false,
    },
    webExtensionId: '',
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

export function validateStore(store, options = {}) {
  const def = createDefaultStore();
  if (!store || typeof store !== 'object') return def;

  const includeTemporary = !!options.includeTemporary;

  const version = Number.isInteger(store.version) ? store.version : STORE_VERSION;
  let panels = Array.isArray(store.panels) ? store.panels : [];
  const settings = store.settings && typeof store.settings === 'object' ? store.settings : {};
  const last = store.last && typeof store.last === 'object' ? store.last : {};

  // Migration v1 → v2: upgrade panel schema
  if (version === 1) {
    panels = panels.map(p => migratePanel_v1_to_v2(p));
  }

  const fixedPanels = [];
  const seen = new Set();
  for (const p of panels) {
    if (!p || typeof p !== 'object') continue;
    if (typeof p.id !== 'string' || !p.id) continue;
    if (seen.has(p.id)) continue;
    const safeUrl = sanitizeUrl(p.url);
    if (!safeUrl) continue;
    seen.add(p.id);
    const normalized = normalizePanel_v2(p, safeUrl);
    if (!normalized) continue;
    if (!includeTemporary && normalized.temporary) continue;
    fixedPanels.push(normalized);
  }

  const selectedPanelId =
    typeof last.selectedPanelId === 'string' && seen.has(last.selectedPanelId)
      ? last.selectedPanelId
      : null;

  return {
    version: STORE_VERSION,
    settings: { ...settings },
    panels: fixedPanels,
    last: { selectedPanelId },
  };
}

/**
 * Migrate a v1 panel to v2 schema
 */
function migratePanel_v1_to_v2(p) {
  if (!p || typeof p !== 'object') return null;
  // v1 had: id, url, title (string), pinned, floating (bool), dockWidth, zoom, userContextId, muted, loadOnStartup, restoreLastUrl, geometry
  // v2 has: id, url, title (object), favicon (object), floating (object), and new fields
  return {
    id: p.id,
    url: p.url,
    title: {
      mode: 'static',
      value: typeof p.title === 'string' ? p.title : '',
    },
    favicon: {
      mode: 'dynamic',
      value: '',
    },
    pinned: !!p.pinned,
    floating: {
      enabled: !!p.floating,
      anchor: 'center',
      alwaysOnTop: false,
      x: 0,
      y: 0,
      w: 480,
      h: 640,
    },
    dockWidth: p.dockWidth,
    zoom: p.zoom,
    mobile: false,
    temporary: false,
    unloadOnClose: false,
    periodicReload: {
      enabled: false,
      seconds: 300,
    },
    shortcut: '',
    cssSelector: {
      enabled: false,
      value: '',
    },
    hide: {
      toolbar: false,
      soundIcon: false,
      notificationBadge: false,
    },
    webExtensionId: typeof p.webExtensionId === 'string' ? p.webExtensionId : '',
    userContextId: p.userContextId,
    muted: !!p.muted,
    loadOnStartup: !!p.loadOnStartup,
    restoreLastUrl: p.restoreLastUrl !== false,
    geometry: p.geometry,
  };
}

/**
 * Normalize and validate a v2 panel
 */
function normalizePanel_v2(p, safeUrl) {
  // Validate title object
  const titleObj = p.title && typeof p.title === 'object' ? p.title : {};
  const title = {
    mode: ['dynamic', 'static'].includes(titleObj.mode) ? titleObj.mode : 'dynamic',
    value: typeof titleObj.value === 'string' ? titleObj.value.slice(0, 240) : '',
  };

  // Validate favicon object
  const faviconObj = p.favicon && typeof p.favicon === 'object' ? p.favicon : {};
  const favicon = {
    mode: ['dynamic', 'static'].includes(faviconObj.mode) ? faviconObj.mode : 'dynamic',
    value: typeof faviconObj.value === 'string' ? faviconObj.value.slice(0, 500) : '',
  };

  // Validate floating object
  const floatingObj = p.floating && typeof p.floating === 'object' ? p.floating : {};
  const validAnchors = ['tl', 'tr', 'bl', 'br', 'center'];
  const floating = {
    enabled: !!floatingObj.enabled,
    anchor: validAnchors.includes(floatingObj.anchor) ? floatingObj.anchor : 'center',
    alwaysOnTop: !!floatingObj.alwaysOnTop,
    x: typeof floatingObj.x === 'number' ? clamp(floatingObj.x, -2000, 2000) : 0,
    y: typeof floatingObj.y === 'number' ? clamp(floatingObj.y, -2000, 2000) : 0,
    w: typeof floatingObj.w === 'number' ? clamp(floatingObj.w, 240, 1200) : 480,
    h: typeof floatingObj.h === 'number' ? clamp(floatingObj.h, 240, 1200) : 640,
  };

  // Validate periodicReload object
  const reloadObj = p.periodicReload && typeof p.periodicReload === 'object' ? p.periodicReload : {};
  const periodicReload = {
    enabled: !!reloadObj.enabled,
    seconds: typeof reloadObj.seconds === 'number' ? Math.max(30, Math.min(86400, reloadObj.seconds)) : 300,
  };

  // Validate cssSelector object
  const cssObj = p.cssSelector && typeof p.cssSelector === 'object' ? p.cssSelector : {};
  const cssSelector = {
    enabled: !!cssObj.enabled,
    value: typeof cssObj.value === 'string' ? cssObj.value.slice(0, 500) : '',
  };

  // Validate hide object
  const hideObj = p.hide && typeof p.hide === 'object' ? p.hide : {};
  const hide = {
    toolbar: !!hideObj.toolbar,
    soundIcon: !!hideObj.soundIcon,
    notificationBadge: !!hideObj.notificationBadge,
  };

  return {
    id: p.id,
    url: safeUrl,
    title,
    favicon,
    pinned: !!p.pinned,
    floating,
    dockWidth: typeof p.dockWidth === 'number' ? clamp(p.dockWidth, 200, 800) : null,
    zoom: typeof p.zoom === 'number' ? Math.max(0.3, Math.min(3, p.zoom)) : 1,
    mobile: !!p.mobile,
    temporary: !!p.temporary,
    unloadOnClose: !!p.unloadOnClose,
    periodicReload,
    shortcut: typeof p.shortcut === 'string' ? p.shortcut.slice(0, 50) : '',
    cssSelector,
    hide,
    webExtensionId: typeof p.webExtensionId === 'string' ? p.webExtensionId.slice(0, 256) : '',
    userContextId: Number.isInteger(p.userContextId) ? p.userContextId : 0,
    muted: !!p.muted,
    loadOnStartup: !!p.loadOnStartup,
    restoreLastUrl: p.restoreLastUrl !== false,
    geometry: normalizeGeometry(p.geometry),
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
