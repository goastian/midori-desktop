export const PANEL_SECTION_MIDORI = 'midori';
export const PANEL_SECTION_WEB = 'web';
export const PANEL_SECTION_EXTENSIONS = 'extensions';

export const PANEL_SECTIONS = [
  { id: PANEL_SECTION_MIDORI, label: 'Midori' },
  { id: PANEL_SECTION_WEB, label: 'Paneles web' },
  { id: PANEL_SECTION_EXTENSIONS, label: 'Extensiones' },
];

export const SIDEBAR_PRESETS = {
  simple: {
    label: 'Simple',
    prefs: {
      position: 'left',
      width: 360,
      railExpanded: false,
      autohideEnabled: false,
      autohideMode: 'overlay',
      toolbarAutohide: false,
    },
  },
  work: {
    label: 'Trabajo',
    prefs: {
      position: 'left',
      width: 420,
      railExpanded: true,
      autohideEnabled: false,
      autohideMode: 'inline',
      toolbarAutohide: false,
    },
  },
  minimal: {
    label: 'Mínimo',
    prefs: {
      position: 'left',
      width: 340,
      railExpanded: false,
      autohideEnabled: true,
      autohideMode: 'overlay',
      toolbarAutohide: true,
    },
  },
};

export const SIDEBAR_MOTION = {
  railOpen: 180,
  railClose: 140,
  panelOpen: 200,
  panelClose: 160,
  panelInline: 220,
  reorder: 150,
  autohideIntent: 60,
  autohideGrace: 320,
  badge: 140,
};

export function panelSection(panel) {
  if (panel?.webExtensionId || String(panel?.url || '').startsWith('moz-extension:')) {
    return PANEL_SECTION_EXTENSIONS;
  }
  try {
    const hostname = new URL(panel?.url || '').hostname.toLowerCase();
    if (
      hostname === 'astian.org' ||
      hostname.endsWith('.astian.org') ||
      hostname === 'midori-browser.org' ||
      hostname.endsWith('.midori-browser.org')
    ) {
      return PANEL_SECTION_MIDORI;
    }
  } catch {}
  return PANEL_SECTION_WEB;
}

export function panelSearchText(panel) {
  let hostname = '';
  try {
    hostname = new URL(panel?.url || '').hostname;
  } catch {}
  return [panel?.title?.value, hostname, panel?.url]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

export function filterPanels(panels, query) {
  const normalized = String(query || '').trim().toLocaleLowerCase();
  const source = Array.isArray(panels) ? panels : [];
  if (!normalized) return [...source];
  return source.filter((panel) => panelSearchText(panel).includes(normalized));
}

export function panelsBySection(panels, query = '') {
  const filtered = filterPanels(panels, query);
  return PANEL_SECTIONS.map((section) => ({
    ...section,
    panels: filtered.filter((panel) => panelSection(panel) === section.id),
  })).filter((section) => section.panels.length);
}

export function panelSemantics(panel) {
  return {
    keepOpen: panel?.pinned !== false,
    keepAlive: panel?.unloadOnClose !== true,
    temporary: !!panel?.temporary,
  };
}

export function normalizeFrequentSites(rows, limit = 6) {
  const sites = [];
  const seen = new Set();
  for (const row of Array.isArray(rows) ? rows.flat() : []) {
    const url = row?.url || row?.link?.url || '';
    let safeUrl = '';
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) continue;
      safeUrl = parsed.toString();
    } catch {
      continue;
    }
    if (seen.has(safeUrl)) continue;
    seen.add(safeUrl);
    sites.push({
      url: safeUrl,
      title: String(row?.title || row?.label || row?.hostname || new URL(safeUrl).hostname).slice(0, 120),
      favicon: typeof row?.favicon === 'string' ? row.favicon : '',
    });
    if (sites.length >= Math.max(1, limit)) break;
  }
  return sites;
}

export function nextRovingIndex(length, currentIndex, key) {
  if (!Number.isInteger(length) || length <= 0) return -1;
  const current = Math.max(0, Math.min(length - 1, Number(currentIndex) || 0));
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  if (key === 'ArrowDown' || key === 'ArrowRight') return (current + 1) % length;
  if (key === 'ArrowUp' || key === 'ArrowLeft') return (current - 1 + length) % length;
  return current;
}

export function motionDuration(name, { reducedMotion = false, enabled = true } = {}) {
  if (reducedMotion || !enabled) return 0;
  return SIDEBAR_MOTION[name] || 0;
}

export function summarizeMotionFrames(timestamps, targetHz = 60) {
  const samples = Array.isArray(timestamps)
    ? timestamps.filter((value) => Number.isFinite(value))
    : [];
  if (samples.length < 2) {
    return { frames: samples.length, duration: 0, droppedFrames: 0, targetHz };
  }
  const budget = 1000 / Math.max(1, targetHz);
  let droppedFrames = 0;
  for (let index = 1; index < samples.length; index++) {
    const delta = samples[index] - samples[index - 1];
    if (delta > budget * 1.5) {
      droppedFrames += Math.max(1, Math.round(delta / budget) - 1);
    }
  }
  return {
    frames: samples.length,
    duration: Math.max(0, samples.at(-1) - samples[0]),
    droppedFrames,
    targetHz,
  };
}
