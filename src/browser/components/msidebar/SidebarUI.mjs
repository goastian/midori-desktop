import { createPanel, sanitizeUrl } from './SidebarModel.mjs';
import { createPanelBrowser, destroyBrowser } from './SidebarPanelHost.mjs';
import * as Prefs from './SidebarPrefs.mjs';

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ContextualIdentityService: 'resource://gre/modules/ContextualIdentityService.sys.mjs',
  PlacesUtils: 'resource://gre/modules/PlacesUtils.sys.mjs',
});

function createXul(doc, tag) {
  if (doc.createXULElement) return doc.createXULElement(tag);
  return doc.createElement(tag);
}

function ensureStyle(doc) {
  const id = 'midori-msidebar-style';
  if (doc.getElementById(id)) return;
  const style = doc.createElement('style');
  style.id = id;
  style.textContent = `
:root{--midori-msidebar-width:320px;--midori-msidebar-main-width:44px;--midori-msidebar-anim:160ms;}
#browser{position:relative;}
#midori-msidebar-wrapper{display:flex;flex-direction:row;height:100%;}
#midori-msidebar-main{display:flex;flex-direction:column;gap:var(--space-small,8px);padding:var(--space-small,8px) calc(var(--space-small,8px)/2);background:var(--toolbox-bgcolor);color:var(--toolbox-color);min-width:var(--midori-msidebar-main-width);box-sizing:border-box;}
#midori-msidebar-main[collapsed='true']{pointer-events:none;opacity:0;min-width:0;padding:0;margin:0;}
#midori-msidebar-main[animated='true']{transition:opacity var(--midori-msidebar-anim) ease, min-width var(--midori-msidebar-anim) ease, padding var(--midori-msidebar-anim) ease;}
#midori-msidebar-main .toolbarbutton-1{padding:0 !important;}
.midori-msidebar-icon{min-width:calc(var(--midori-msidebar-main-width) - 8px);min-height:34px;padding:0;margin:0;}
#midori-msidebar-main .toolbarbutton-1{border-radius:var(--border-radius-medium);background:transparent;}
#midori-msidebar-main .toolbarbutton-1:hover{background:color-mix(in srgb, currentColor 8%, transparent);}
#midori-msidebar-main .toolbarbutton-1:active{background:color-mix(in srgb, currentColor 12%, transparent);}
#midori-msidebar-main .toolbarbutton-1,#midori-msidebar-box-toolbar .toolbarbutton-1{-moz-context-properties:fill;fill:currentColor;}
#midori-msidebar-main .toolbarbutton-text{display:none;}
.midori-msidebar-panel-btn .toolbarbutton-text{display:none;}
.midori-msidebar-panel-btn .toolbarbutton-icon{width:18px;height:18px;}
.midori-msidebar-panel-btn{list-style-image:url("chrome://global/skin/icons/defaultFavicon.svg");}
.midori-msidebar-panel-btn[checked='true']{background:color-mix(in srgb, currentColor 10%, transparent);}

#midori-msidebar-toggle{list-style-image:url("chrome://browser/skin/sidebars.svg");}
#midori-msidebar-add{list-style-image:url("chrome://global/skin/icons/plus.svg");}
#midori-msidebar-settings{list-style-image:url("chrome://global/skin/icons/settings.svg");}
#midori-msidebar-nav-back{list-style-image:url("chrome://browser/skin/back.svg");}
#midori-msidebar-nav-forward{list-style-image:url("chrome://browser/skin/forward.svg");}
#midori-msidebar-nav-reload{list-style-image:url("chrome://global/skin/icons/reload.svg");}
#midori-msidebar-nav-home{list-style-image:url("chrome://browser/skin/home.svg");}
#midori-msidebar-box-area{display:flex;height:100%;width:var(--midori-msidebar-width);min-width:200px;box-sizing:border-box;}
#midori-msidebar-box-area[collapsed='true']{width:0;min-width:0;pointer-events:none;opacity:0;}
#midori-msidebar-box-area[overlay='true']{position:absolute;top:0;bottom:0;z-index:30;box-shadow:var(--content-area-shadow);}
#midori-msidebar-box-area[overlay='true'][position='left']{left:var(--midori-msidebar-main-width);}
#midori-msidebar-box-area[overlay='true'][position='right']{right:var(--midori-msidebar-main-width);}
#midori-msidebar-box-area[animated='true']{transition:width var(--midori-msidebar-anim) ease, opacity var(--midori-msidebar-anim) ease;}
#midori-msidebar-box{flex:1;display:flex;flex-direction:column;background:var(--sidebar-background-color);color:var(--sidebar-text-color);border:0.5px solid var(--sidebar-border-color);border-radius:var(--border-radius-medium);overflow:hidden;box-sizing:border-box;}
#midori-msidebar-box-header{display:flex;align-items:center;gap:6px;padding:6px 8px;background:color-mix(in srgb, var(--sidebar-background-color) 92%, var(--toolbar-bgcolor));border-bottom:1px solid color-mix(in srgb, var(--sidebar-border-color) 60%, transparent);}
#midori-msidebar-box-title{flex:1;min-width:0;}
#midori-msidebar-box-title label{margin:0;min-width:0;max-width:100%;}
#midori-msidebar-box-toolbar{display:flex;gap:4px;}
#midori-msidebar-box-toolbar .toolbarbutton-1{min-width:28px;min-height:28px;}
#midori-msidebar-box-toolbar[autohide='true']{opacity:0;pointer-events:none;transition:opacity var(--midori-msidebar-anim) ease;}
#midori-msidebar-box-header:hover #midori-msidebar-box-toolbar[autohide='true']{opacity:1;pointer-events:auto;}
#midori-msidebar-browser-stack{flex:1;min-height:0;}
#midori-msidebar-splitter{cursor:e-resize;min-width:6px;width:6px;background:transparent;transition:background-color var(--midori-msidebar-anim) ease;}
#midori-msidebar-splitter:hover{background:var(--focus-outline-color);}

.midori-msidebar-float-resizer{position:absolute;background-color:transparent;z-index:40;transition:background-color var(--midori-msidebar-anim) ease;}
.midori-msidebar-float-resizer:hover{background-color:var(--focus-outline-color);}
.midori-msidebar-float-resizer[type='left'],.midori-msidebar-float-resizer[type='right']{top:0;width:4px;height:100%;cursor:e-resize;}
.midori-msidebar-float-resizer[type='left']{left:0;}
.midori-msidebar-float-resizer[type='right']{right:0;}
.midori-msidebar-float-resizer[type='top'],.midori-msidebar-float-resizer[type='bottom']{left:0;width:100%;height:4px;cursor:n-resize;}
.midori-msidebar-float-resizer[type='top']{top:0;}
.midori-msidebar-float-resizer[type='bottom']{bottom:0;}
.midori-msidebar-float-resizer[type='topleft'],.midori-msidebar-float-resizer[type='topright'],.midori-msidebar-float-resizer[type='bottomleft'],.midori-msidebar-float-resizer[type='bottomright']{width:24px;height:24px;border-radius:50%;}
.midori-msidebar-float-resizer[type='topleft']{top:-12px;left:-12px;cursor:nwse-resize;}
.midori-msidebar-float-resizer[type='topright']{top:-12px;right:-12px;cursor:nesw-resize;}
.midori-msidebar-float-resizer[type='bottomleft']{bottom:-12px;left:-12px;cursor:nesw-resize;}
.midori-msidebar-float-resizer[type='bottomright']{bottom:-12px;right:-12px;cursor:nwse-resize;}

.midori-msidebar-panel-btn[container-indicator='left']{box-shadow:inset 3px 0 0 var(--midori-msidebar-container-color, transparent);}
.midori-msidebar-panel-btn[container-indicator='right']{box-shadow:inset -3px 0 0 var(--midori-msidebar-container-color, transparent);}
.midori-msidebar-panel-btn[container-indicator='top']{box-shadow:inset 0 3px 0 var(--midori-msidebar-container-color, transparent);}
.midori-msidebar-panel-btn[container-indicator='bottom']{box-shadow:inset 0 -3px 0 var(--midori-msidebar-container-color, transparent);}
.midori-msidebar-panel-btn[container-indicator='around']{outline:2px solid var(--midori-msidebar-container-color, transparent);outline-offset:-2px;}
`;
  doc.documentElement.appendChild(style);
}

function getBrowserEls(doc) {
  return {
    browser: doc.getElementById('browser'),
    tabbox: doc.getElementById('tabbrowser-tabbox'),
  };
}

function safeHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function tooltipTextForPanel(panel) {
  const mode = Prefs.getTooltipMode();
  if (mode === Prefs.TOOLTIP_OFF) return '';
  const title = (panel?.title || '').trim();
  const fullUrl = Prefs.getTooltipFullUrl();
  const url = fullUrl ? panel?.url || '' : safeHostname(panel?.url || '') || panel?.url || '';
  if (mode === Prefs.TOOLTIP_TITLE) return title || url || 'Panel';
  if (mode === Prefs.TOOLTIP_URL) return url || title || 'Panel';
  if (!title) return url || 'Panel';
  if (!url) return title;
  return `${title}\n${url}`;
}

function containerColorForUserContext(userContextId) {
  if (!userContextId) return null;
  try {
    const ident = lazy.ContextualIdentityService.getPublicIdentityFromId(userContextId);
    const color = ident?.color;
    if (!color) return null;
    const map = {
      blue: '#37adff',
      turquoise: '#00c79a',
      green: '#51cd00',
      yellow: '#ffcb00',
      orange: '#ff9f00',
      red: '#ff613d',
      pink: '#ff4bda',
      purple: '#af51f5',
      toolbar: 'currentColor',
    };
    return map[color] || null;
  } catch {
    return null;
  }
}

function escapeCssUrl(url) {
  if (typeof url !== 'string') return '';
  return url.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function svgDataUri(svg) {
  try {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  } catch {
    return '';
  }
}

function zoomIconDataUri(kind) {
  const base = 'fill="context-fill" fill-opacity="context-fill-opacity"';
  if (kind === 'in') {
    return svgDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path ${base} d="M6.5 2a4.5 4.5 0 1 0 2.768 8.051l3.09 3.09a1 1 0 0 0 1.414-1.414l-3.09-3.09A4.5 4.5 0 0 0 6.5 2Zm0 1.5a3 3 0 1 1 0 6a3 3 0 0 1 0-6Z"/><path ${base} d="M6.5 4.5a.75.75 0 0 1 .75.75V6H8a.75.75 0 0 1 0 1.5h-.75v.75a.75.75 0 0 1-1.5 0V7.5H5A.75.75 0 0 1 5 6h.75v-.75a.75.75 0 0 1 .75-.75Z"/></svg>`
    );
  }
  if (kind === 'out') {
    return svgDataUri(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path ${base} d="M6.5 2a4.5 4.5 0 1 0 2.768 8.051l3.09 3.09a1 1 0 0 0 1.414-1.414l-3.09-3.09A4.5 4.5 0 0 0 6.5 2Zm0 1.5a3 3 0 1 1 0 6a3 3 0 0 1 0-6Z"/><path ${base} d="M5 6.75A.75.75 0 0 1 5.75 6h1.5a.75.75 0 0 1 0 1.5h-1.5A.75.75 0 0 1 5 6.75Z"/></svg>`
    );
  }
  return svgDataUri(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path ${base} d="M8 2a6 6 0 1 0 5.657 4H12a.75.75 0 0 1 0-1.5h3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0V6.65A4.5 4.5 0 1 1 8 3.5a.75.75 0 0 1 0 1.5A3 3 0 1 0 11 8a.75.75 0 0 1 1.5 0A4.5 4.5 0 1 1 8 3.5"/></svg>`
  );
}

function defaultFaviconSpec() {
  return 'chrome://global/skin/icons/defaultFavicon.svg';
}

function faviconFallbackForPanel(panel) {
  return defaultFaviconSpec();
}

function clampZoom(z) {
  return Math.max(0.3, Math.min(3, typeof z === 'number' ? z : 1));
}

export function createSidebarUI(win, { onStoreChanged } = {}) {
  const doc = win.document;
  ensureStyle(doc);

  const { browser, tabbox } = getBrowserEls(doc);
  if (!browser || !tabbox) {
    return {
      root: null,
      setStore() {},
      setVisible() {},
      setPosition() {},
      setAutohide() {},
      setAutohideMode() {},
      setAnimated() {},
      setCssWidth() {},
      destroy() {},
    };
  }

  const wrapper = createXul(doc, 'hbox');
  wrapper.id = 'midori-msidebar-wrapper';

  const main = createXul(doc, 'vbox');
  main.id = 'midori-msidebar-main';
  main.setAttribute('animated', 'true');

  const btnToggle = createXul(doc, 'toolbarbutton');
  btnToggle.id = 'midori-msidebar-toggle';
  btnToggle.classList.add('toolbarbutton-1', 'midori-msidebar-icon');
  btnToggle.setAttribute('label', '');
  btnToggle.setAttribute('aria-label', 'Sidebar');
  btnToggle.setAttribute('tooltiptext', 'Sidebar');
  main.appendChild(btnToggle);

  const btnAdd = createXul(doc, 'toolbarbutton');
  btnAdd.id = 'midori-msidebar-add';
  btnAdd.classList.add('toolbarbutton-1', 'midori-msidebar-icon');
  btnAdd.setAttribute('label', '');
  btnAdd.setAttribute('aria-label', 'Agregar panel');
  btnAdd.setAttribute('tooltiptext', 'Agregar panel');

  const buttonsBox = createXul(doc, 'vbox');
  buttonsBox.id = 'midori-msidebar-buttons';
  main.appendChild(buttonsBox);
  main.appendChild(btnAdd);

  const spring = createXul(doc, 'spacer');
  spring.setAttribute('flex', '1');
  main.appendChild(spring);

  const btnSettings = createXul(doc, 'toolbarbutton');
  btnSettings.id = 'midori-msidebar-settings';
  btnSettings.classList.add('toolbarbutton-1', 'midori-msidebar-icon');
  btnSettings.setAttribute('label', '');
  btnSettings.setAttribute('aria-label', 'Configuración');
  btnSettings.setAttribute('tooltiptext', 'Configuración');
  main.appendChild(btnSettings);

  const boxArea = createXul(doc, 'hbox');
  boxArea.id = 'midori-msidebar-box-area';
  boxArea.setAttribute('animated', 'true');
  boxArea.setAttribute('overlay', 'false');
  boxArea.setAttribute('position', 'left');

  const box = createXul(doc, 'vbox');
  box.id = 'midori-msidebar-box';
  boxArea.appendChild(box);

  const header = createXul(doc, 'hbox');
  header.id = 'midori-msidebar-box-header';
  box.appendChild(header);

  const titleWrap = createXul(doc, 'hbox');
  titleWrap.id = 'midori-msidebar-box-title';
  titleWrap.setAttribute('flex', '1');
  const titleLabel = createXul(doc, 'label');
  titleLabel.setAttribute('value', '');
  titleLabel.setAttribute('crop', 'end');
  titleWrap.appendChild(titleLabel);
  header.appendChild(titleWrap);

  const toolbar = createXul(doc, 'hbox');
  toolbar.id = 'midori-msidebar-box-toolbar';
  header.appendChild(toolbar);

  function mkTb(id, label) {
    const b = createXul(doc, 'toolbarbutton');
    b.id = id;
    b.classList.add('toolbarbutton-1');
    b.setAttribute('label', '');
    b.setAttribute('aria-label', label);
    b.setAttribute('tooltiptext', label);
    toolbar.appendChild(b);
    return b;
  }

  const btnBack = mkTb('midori-msidebar-nav-back', '←');
  const btnForward = mkTb('midori-msidebar-nav-forward', '→');
  const btnReload = mkTb('midori-msidebar-nav-reload', '⟳');
  const btnHome = mkTb('midori-msidebar-nav-home', '⌂');
  const btnZoomOut = mkTb('midori-msidebar-zoom-out', 'Zoom -');
  const btnZoomReset = mkTb('midori-msidebar-zoom-reset', 'Zoom 100%');
  const btnZoomIn = mkTb('midori-msidebar-zoom-in', 'Zoom +');
  try {
    btnZoomOut.setAttribute('image', zoomIconDataUri('out'));
    btnZoomReset.setAttribute('image', zoomIconDataUri('reset'));
    btnZoomIn.setAttribute('image', zoomIconDataUri('in'));
  } catch {}

  const stack = createXul(doc, 'stack');
  stack.id = 'midori-msidebar-browser-stack';
  stack.setAttribute('flex', '1');
  box.appendChild(stack);

  const splitter = createXul(doc, 'splitter');
  splitter.id = 'midori-msidebar-splitter';
  splitter.classList.add('chromeclass-extrachrome', 'sidebar-splitter');

  wrapper.appendChild(main);
  wrapper.appendChild(boxArea);
  wrapper.appendChild(splitter);
  browser.insertBefore(wrapper, tabbox);
  try {
    doc.documentElement.setAttribute('midori-msidebar-injected', 'true');
  } catch {}

  function setBoolAttr(el, name, enabled) {
    if (!el) return;
    try {
      if (enabled) el.setAttribute(name, 'true');
      else el.removeAttribute(name);
    } catch {}
  }

  let store = { panels: [], last: {} };
  let activeBrowser = null;
  let activePanelId = null;
  let position = 'left';
  let autohideEnabled = false;
  let autohideMode = 'overlay';
  let animated = true;
  let visible = false;
  let sizing = false;
  let floatingDrag = null;
  let floatingResize = null;
  let currentPanelFloating = false;
  let floatResizers = null;
  let titleBaseText = '';
  let hidePanelWhenHidden = Prefs.getHidePanelWhenHidden();
  let panelAreaHiddenByUser = false;
  let preferredDockWidth = 320;
  const faviconCache = new Map();
  const faviconPending = new Set();
  const faviconRetryAt = new Map();
  let splitterDrag = null;

  function applyDockWidth() {
    if (currentPanelFloating) return;
    let width = preferredDockWidth;
    try {
      const p = activePanelId ? store.panels.find((x) => x.id === activePanelId) : null;
      if (p && typeof p.dockWidth === 'number') width = p.dockWidth;
    } catch {}
    doc.documentElement.style.setProperty('--midori-msidebar-width', `${width}px`);
    if (autohideMode !== 'overlay') {
      try {
        boxArea.style.width = `${width}px`;
      } catch {}
    }
  }

  function setCssWidth(px) {
    preferredDockWidth = Math.min(800, Math.max(200, px));
    applyDockWidth();
  }

  function updatePanel(panelId, updater) {
    const idx = store.panels.findIndex((p) => p.id === panelId);
    if (idx === -1) return null;
    const prev = store.panels[idx];
    const next = updater({ ...prev });
    if (!next) return null;
    store.panels[idx] = next;
    try {
      if (prev.url !== next.url) {
        faviconCache.delete(panelId);
        faviconRetryAt.delete(panelId);
      }
    } catch {}
    onStoreChanged?.(store);
    return next;
  }

  function applyZoomToBrowser(browserEl, zoom) {
    const z = clampZoom(zoom);
    try {
      if ('fullZoom' in browserEl) browserEl.fullZoom = z;
    } catch {}
    try {
      if (win.ZoomManager?.setZoomForBrowser) win.ZoomManager.setZoomForBrowser(browserEl, z);
    } catch {}
  }

  function applyMuteToBrowser(browserEl, muted) {
    const m = !!muted;
    try {
      if ('audioMuted' in browserEl) browserEl.audioMuted = m;
    } catch {}
    try {
      if (m && typeof browserEl.mute === 'function') browserEl.mute();
      if (!m && typeof browserEl.unmute === 'function') browserEl.unmute();
    } catch {}
    try {
      browserEl.setAttribute('muted', m ? 'true' : 'false');
    } catch {}
  }

  function faviconCandidatesForHost(host) {
    const h = (host || '').trim().toLowerCase();
    if (!h) return [];
    return [
      `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=32`,
      `https://icons.duckduckgo.com/ip3/${encodeURIComponent(h)}.ico`,
      `https://favicon.yandex.net/favicon/${encodeURIComponent(h)}/`,
      `https://${h}/favicon.ico`,
    ];
  }

  function loadImageUrl(url, timeoutMs = 3500) {
    return new Promise((resolve, reject) => {
      const ImageCtor = win.Image || doc.defaultView?.Image;
      if (!ImageCtor || typeof url !== 'string' || !url) {
        reject(new Error('no-image'));
        return;
      }

      const img = new ImageCtor();
      let done = false;
      const timer = win.setTimeout(() => {
        if (done) return;
        done = true;
        try {
          img.onload = null;
          img.onerror = null;
          img.src = '';
        } catch {}
        reject(new Error('timeout'));
      }, timeoutMs);

      img.onload = () => {
        if (done) return;
        done = true;
        try {
          win.clearTimeout(timer);
        } catch {}
        resolve(url);
      };
      img.onerror = () => {
        if (done) return;
        done = true;
        try {
          win.clearTimeout(timer);
        } catch {}
        reject(new Error('error'));
      };
      try {
        img.referrerPolicy = 'no-referrer';
      } catch {}
      img.src = url;
    });
  }

  async function resolveFaviconSpecForPanel(panel) {
    try {
      const pageUri = Services.io.newURI(panel.url);
      const uri = await lazy.PlacesUtils?.favicons?.getFaviconURLForPage?.(pageUri);
      const iconUri = uri?.spec ? uri : null;
      if (iconUri?.spec && iconUri.spec !== defaultFaviconSpec()) {
        const link = lazy.PlacesUtils?.favicons?.getFaviconLinkForIcon?.(iconUri);
        const spec = link?.spec || iconUri.spec;
        if (spec && spec !== defaultFaviconSpec()) return spec;
      }
    } catch {}
    let host = '';
    try {
      host = new URL(panel?.url || '').hostname || '';
    } catch {
      host = safeHostname(panel?.url || '');
    }
    const candidates = faviconCandidatesForHost(host);
    for (const u of candidates) {
      try {
        await loadImageUrl(u);
        return u;
      } catch {}
    }
    return faviconFallbackForPanel(panel);
  }

  function setPanelButtonIcon(btn, spec) {
    const safe = escapeCssUrl(spec || defaultFaviconSpec());
    try {
      btn.style.listStyleImage = `url("${safe}")`;
    } catch {}
    try {
      btn.setAttribute('image', spec || defaultFaviconSpec());
    } catch {}
  }

  function ensureFavicon(panel) {
    const pid = panel?.id;
    if (!pid) return;
    const now = Date.now();
    const nextAt = faviconRetryAt.get(pid) || 0;
    if (now < nextAt) return;
    const cached = faviconCache.get(pid);
    if (cached && cached !== defaultFaviconSpec()) return;
    if (faviconPending.has(pid)) return;
    faviconPending.add(pid);
    resolveFaviconSpecForPanel(panel).then((spec) => {
      faviconPending.delete(pid);
      const resolved = spec || defaultFaviconSpec();
      faviconCache.set(pid, resolved);
      const btn = buttonsBox.querySelector(`[midori-msidebar-panel-id="${pid}"]`);
      if (btn) setPanelButtonIcon(btn, resolved);
      if (!spec || resolved === defaultFaviconSpec()) {
        faviconRetryAt.set(pid, Date.now() + 30_000);
      } else {
        faviconRetryAt.delete(pid);
      }
    });
  }

  function applyFloatingGeometry(panel) {
    if (!panel?.geometry) return;
    const g = panel.geometry;
    const w = Math.min(1200, Math.max(240, Math.round(g.width || 480)));
    const h = Math.min(1200, Math.max(240, Math.round(g.height || 640)));
    const ox = Math.min(2000, Math.max(-2000, Math.round(g.offsetX || 12)));
    const oy = Math.min(2000, Math.max(-2000, Math.round(g.offsetY || 12)));
    boxArea.style.width = `${w}px`;
    boxArea.style.height = `${h}px`;
    boxArea.style.top = `${oy}px`;
    boxArea.style.bottom = 'unset';
    if (position === 'left') {
      boxArea.style.left = `calc(var(--midori-msidebar-main-width) + ${ox}px)`;
      boxArea.style.right = 'unset';
    } else {
      boxArea.style.right = `calc(var(--midori-msidebar-main-width) + ${ox}px)`;
      boxArea.style.left = 'unset';
    }
  }

  function clearFloatingChrome() {
    if (floatResizers) {
      for (const r of floatResizers) {
        try {
          r.remove();
        } catch {}
      }
    }
    floatResizers = null;
    header.style.cursor = '';
    try {
      header.removeEventListener('mousedown', onFloatingHeaderMouseDown, true);
    } catch {}
    boxArea.style.width = '';
    boxArea.style.height = '';
    boxArea.style.top = '';
    boxArea.style.left = '';
    boxArea.style.right = '';
    boxArea.style.bottom = '';
  }

  function ensureFloatingChrome() {
    if (floatResizers) return;
    floatResizers = [];
    const types = ['left', 'right', 'top', 'bottom', 'topleft', 'topright', 'bottomleft', 'bottomright'];
    for (const type of types) {
      const r = createXul(doc, 'box');
      r.classList.add('midori-msidebar-float-resizer');
      r.setAttribute('type', type);
      r.addEventListener(
        'mousedown',
        (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          e.stopPropagation();
          startFloatingResize(type, e);
        },
        true
      );
      boxArea.appendChild(r);
      floatResizers.push(r);
    }
    header.style.cursor = 'move';
    header.addEventListener('mousedown', onFloatingHeaderMouseDown, true);
  }

  function clearBrowser() {
    if (activeBrowser) {
      destroyBrowser(activeBrowser);
      activeBrowser = null;
    }
    while (stack.firstChild) stack.firstChild.remove();
  }

  function syncToolbarPrefs() {
    hidePanelWhenHidden = Prefs.getHidePanelWhenHidden();
    setBoolAttr(toolbar, 'autohide', Prefs.getWebPanelToolbarAutohide());
  }

  function syncNavButtons() {
    const autoBack = Prefs.getWebPanelToolbarAutohideBack();
    const autoForward = Prefs.getWebPanelToolbarAutohideForward();
    let canBack = true;
    let canForward = true;
    try {
      canBack = !!activeBrowser?.canGoBack;
    } catch {}
    try {
      canForward = !!activeBrowser?.canGoForward;
    } catch {}
    setBoolAttr(btnBack, 'hidden', autoBack && !canBack);
    setBoolAttr(btnForward, 'hidden', autoForward && !canForward);
  }

  function setActivePanel(panelId) {
    const panel = store.panels.find((p) => p.id === panelId);
    if (!panel) return;
    panelAreaHiddenByUser = false;
    activePanelId = panel.id;
    currentPanelFloating = !!panel.floating;
    store.last = store.last || {};
    store.last.selectedPanelId = panel.id;
    clearBrowser();
    const browserEl = createPanelBrowser(win, panel);
    activeBrowser = browserEl;
    activeBrowser.addEventListener(
      'load',
      () => {
        syncNavButtons();
        applyZoomToBrowser(activeBrowser, panel.zoom);
        try {
          faviconCache.delete(panel.id);
        } catch {}
        ensureFavicon(panel);
      },
      true
    );
    try {
      applyMuteToBrowser(activeBrowser, panel.muted);
    } catch {}
    try {
      applyZoomToBrowser(activeBrowser, panel.zoom);
    } catch {}
    stack.appendChild(browserEl);
    titleBaseText = panel.title || safeHostname(panel.url) || panel.url;
    titleLabel.setAttribute('value', titleBaseText);
    if (currentPanelFloating) {
      boxArea.setAttribute('overlay', 'true');
      boxArea.style.display = '';
      setBoolAttr(boxArea, 'collapsed', !visible);
      ensureFloatingChrome();
      applyFloatingGeometry(panel);
    } else {
      clearFloatingChrome();
      boxArea.style.display = '';
      boxArea.setAttribute('overlay', autohideEnabled && autohideMode === 'overlay' ? 'true' : 'false');
      boxArea.style.height = '';
      boxArea.style.top = '';
      boxArea.style.bottom = '';
      boxArea.style.left = '';
      boxArea.style.right = '';
      if (!autohideEnabled && visible) setBoolAttr(boxArea, 'collapsed', false);
      applyDockWidth();
    }
    renderButtons();
    syncToolbarPrefs();
    syncNavButtons();
    ensureFavicon(panel);
    onStoreChanged?.(store);
  }

  function promptNewPanelUrl() {
    const input = { value: 'https://' };
    const ok = Services.prompt.prompt(win, 'Agregar panel', 'URL del panel:', input, null, {});
    if (!ok) return;
    const url = sanitizeUrl(input.value);
    if (!url) return;
    const panel = createPanel({ url });
    if (!panel) return;
    store.panels.push(panel);
    store.last = store.last || {};
    store.last.selectedPanelId = panel.id;
    onStoreChanged?.(store);
    setActivePanel(panel.id);
  }

  function renderButtons() {
    while (buttonsBox.firstChild) buttonsBox.firstChild.remove();
    const selected = store.last?.selectedPanelId;
    const indicator = Prefs.getContainerIndicator();
    for (const panel of store.panels) {
      const btn = createXul(doc, 'toolbarbutton');
      btn.classList.add('toolbarbutton-1', 'midori-msidebar-icon', 'midori-msidebar-panel-btn');
      btn.setAttribute('label', '');
      btn.setAttribute('aria-label', panel.title || safeHostname(panel.url) || panel.url || 'Panel');
      const tt = tooltipTextForPanel(panel);
      if (tt) btn.setAttribute('tooltiptext', tt);
      btn.setAttribute('midori-msidebar-panel-id', panel.id);
      btn.setAttribute('container-indicator', indicator);
      const cc = containerColorForUserContext(panel.userContextId);
      if (cc) btn.style.setProperty('--midori-msidebar-container-color', cc);
      setPanelButtonIcon(btn, faviconCache.get(panel.id) || faviconFallbackForPanel(panel));
      btn.addEventListener(
        'contextmenu',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          openPanelMenu(panel.id, e);
        },
        true
      );
      btn.addEventListener(
        'command',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (activePanelId === panel.id && !panelAreaHiddenByUser) {
            panelAreaHiddenByUser = true;
            store.last = store.last || {};
            store.last.selectedPanelId = null;
            activePanelId = null;
            currentPanelFloating = false;
            clearBrowser();
            clearFloatingChrome();
            titleLabel.setAttribute('value', '');
            setBoolAttr(boxArea, 'collapsed', true);
            boxArea.style.display = '';
            setBoolAttr(splitter, 'hidden', true);
            renderButtons();
            onStoreChanged?.(store);
            return;
          }
          panelAreaHiddenByUser = false;
          if (!autohideEnabled && visible) {
            setBoolAttr(boxArea, 'collapsed', false);
            setBoolAttr(splitter, 'hidden', false);
          }
          setActivePanel(panel.id);
        },
        true
      );
      if (panel.id === selected) btn.setAttribute('checked', 'true');
      buttonsBox.appendChild(btn);
      ensureFavicon(panel);
    }
  }

  function setVisible(nextVisible) {
    visible = !!nextVisible;
    if (!visible) {
      if (hidePanelWhenHidden) {
        clearBrowser();
      }
      setBoolAttr(main, 'collapsed', true);
      setBoolAttr(boxArea, 'collapsed', true);
      boxArea.style.display = '';
      setBoolAttr(splitter, 'hidden', true);
      return;
    }
    setBoolAttr(main, 'collapsed', false);
    if (currentPanelFloating) {
      boxArea.style.display = panelAreaHiddenByUser ? 'none' : '';
      setBoolAttr(boxArea, 'collapsed', panelAreaHiddenByUser);
    } else {
      setBoolAttr(boxArea, 'collapsed', panelAreaHiddenByUser || autohideEnabled);
      boxArea.style.display = '';
    }
    syncSplitterVisibility();
    if (hidePanelWhenHidden && !activeBrowser) {
      const selected = store.last?.selectedPanelId;
      if (selected) setActivePanel(selected);
    }
  }

  function syncSplitterVisibility() {
    if (!visible || currentPanelFloating || panelAreaHiddenByUser) {
      setBoolAttr(splitter, 'hidden', true);
      return;
    }
    if (autohideEnabled && autohideMode === 'overlay') {
      const collapsed = boxArea.getAttribute('collapsed') === 'true';
      setBoolAttr(splitter, 'hidden', collapsed);
      return;
    }
    setBoolAttr(splitter, 'hidden', false);
  }

  function applyOrder() {
    const parent = browser;
    if (!parent) return;
    if (position === 'left') {
      splitter.setAttribute('resizebefore', 'sibling');
      splitter.setAttribute('resizeafter', 'none');
      while (wrapper.firstChild) wrapper.firstChild.remove();
      wrapper.appendChild(main);
      wrapper.appendChild(boxArea);
      wrapper.appendChild(splitter);
      parent.insertBefore(wrapper, tabbox);
    } else {
      splitter.setAttribute('resizebefore', 'none');
      splitter.setAttribute('resizeafter', 'sibling');
      while (wrapper.firstChild) wrapper.firstChild.remove();
      wrapper.appendChild(splitter);
      wrapper.appendChild(boxArea);
      wrapper.appendChild(main);
      const aiSplitter = doc.getElementById('ai-window-splitter');
      parent.insertBefore(wrapper, aiSplitter || null);
    }
  }

  function setPosition(next) {
    position = next === 'right' ? 'right' : 'left';
    boxArea.setAttribute('position', position);
    applyOrder();
    if (currentPanelFloating && activePanelId) {
      const panel = store.panels.find((p) => p.id === activePanelId);
      if (panel) applyFloatingGeometry(panel);
    }
  }

  function setAutohide(enabled) {
    autohideEnabled = !!enabled;
    if (currentPanelFloating) return;
    if (!autohideEnabled) {
      setBoolAttr(boxArea, 'collapsed', panelAreaHiddenByUser || !visible);
      boxArea.setAttribute('overlay', 'false');
      applyDockWidth();
      syncSplitterVisibility();
      return;
    }
    if (visible) setBoolAttr(boxArea, 'collapsed', true);
    boxArea.setAttribute('overlay', autohideMode === 'overlay' ? 'true' : 'false');
    applyDockWidth();
    syncSplitterVisibility();
  }

  function setAutohideMode(mode) {
    autohideMode = mode === 'inline' ? 'inline' : 'overlay';
    if (currentPanelFloating) return;
    boxArea.setAttribute('overlay', autohideEnabled && autohideMode === 'overlay' ? 'true' : 'false');
    applyDockWidth();
    syncSplitterVisibility();
  }

  function onFloatingHeaderMouseDown(e) {
    if (!currentPanelFloating) return;
    if (e.button !== 0) return;
    if (e.target?.id && e.target.id.startsWith('midori-msidebar-nav-')) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = boxArea.getBoundingClientRect();
    floatingDrag = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      startRight: rect.right,
      position,
    };
    win.addEventListener('mousemove', onFloatingDragMove, true);
    win.addEventListener('mouseup', onFloatingDragUp, true);
  }

  function onFloatingDragMove(e) {
    if (!floatingDrag) return;
    const dx = e.clientX - floatingDrag.startX;
    const dy = e.clientY - floatingDrag.startY;
    const top = Math.round(floatingDrag.startTop + dy);
    boxArea.style.top = `${top}px`;
    boxArea.style.bottom = 'unset';
    if (floatingDrag.position === 'left') {
      const left = Math.round(floatingDrag.startLeft + dx);
      boxArea.style.left = `${left}px`;
      boxArea.style.right = 'unset';
    } else {
      const right = Math.round(win.innerWidth - (floatingDrag.startRight + dx));
      boxArea.style.right = `${right}px`;
      boxArea.style.left = 'unset';
    }
    if (Prefs.getGeometryHintEnabled()) {
      try {
        const r = boxArea.getBoundingClientRect();
        titleLabel.setAttribute(
          'value',
          `${titleBaseText}  ${Math.round(r.width)}×${Math.round(r.height)}  ${Math.round(r.left)},${Math.round(r.top)}`
        );
      } catch {}
    }
  }

  function onFloatingDragUp() {
    win.removeEventListener('mousemove', onFloatingDragMove, true);
    win.removeEventListener('mouseup', onFloatingDragUp, true);
    if (!floatingDrag) return;
    const rect = boxArea.getBoundingClientRect();
    const ox =
      floatingDrag.position === 'left'
        ? Math.round(rect.left - parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--midori-msidebar-main-width')) || 44)
        : Math.round(win.innerWidth - rect.right - (parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--midori-msidebar-main-width')) || 44));
    const oy = Math.round(rect.top);
    updatePanel(activePanelId, (p) => {
      p.geometry = p.geometry || {};
      p.geometry.offsetX = ox;
      p.geometry.offsetY = oy;
      return p;
    });
    floatingDrag = null;
    try {
      titleLabel.setAttribute('value', titleBaseText);
    } catch {}
  }

  function startFloatingResize(type, e) {
    if (!currentPanelFloating) return;
    const rect = boxArea.getBoundingClientRect();
    floatingResize = {
      type,
      startX: e.clientX,
      startY: e.clientY,
      startRect: rect,
    };
    win.addEventListener('mousemove', onFloatingResizeMove, true);
    win.addEventListener('mouseup', onFloatingResizeUp, true);
  }

  function onFloatingResizeMove(e) {
    if (!floatingResize) return;
    const { type, startX, startY, startRect } = floatingResize;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    let left = startRect.left;
    let top = startRect.top;
    let right = startRect.right;
    let bottom = startRect.bottom;

    if (type.includes('left')) left += dx;
    if (type.includes('right')) right += dx;
    if (type.includes('top')) top += dy;
    if (type.includes('bottom')) bottom += dy;

    const width = Math.min(1200, Math.max(240, Math.round(right - left)));
    const height = Math.min(1200, Math.max(240, Math.round(bottom - top)));
    boxArea.style.width = `${width}px`;
    boxArea.style.height = `${height}px`;
    boxArea.style.top = `${Math.round(top)}px`;
    boxArea.style.bottom = 'unset';
    if (position === 'left') {
      boxArea.style.left = `${Math.round(left)}px`;
      boxArea.style.right = 'unset';
    } else {
      boxArea.style.right = `${Math.round(win.innerWidth - right)}px`;
      boxArea.style.left = 'unset';
    }
    if (Prefs.getGeometryHintEnabled()) {
      try {
        titleLabel.setAttribute('value', `${titleBaseText}  ${width}×${height}`);
      } catch {}
    }
  }

  function onFloatingResizeUp() {
    win.removeEventListener('mousemove', onFloatingResizeMove, true);
    win.removeEventListener('mouseup', onFloatingResizeUp, true);
    if (!floatingResize) return;
    const rect = boxArea.getBoundingClientRect();
    updatePanel(activePanelId, (p) => {
      p.geometry = p.geometry || {};
      p.geometry.width = Math.round(rect.width);
      p.geometry.height = Math.round(rect.height);
      const mainW = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--midori-msidebar-main-width')) || 44;
      if (position === 'left') {
        p.geometry.offsetX = Math.round(rect.left - mainW);
      } else {
        p.geometry.offsetX = Math.round(win.innerWidth - rect.right - mainW);
      }
      p.geometry.offsetY = Math.round(rect.top);
      return p;
    });
    floatingResize = null;
    try {
      titleLabel.setAttribute('value', titleBaseText);
    } catch {}
  }

  const popupSet = doc.getElementById('mainPopupSet') || doc.documentElement;
  const panelMenu = createXul(doc, 'menupopup');
  panelMenu.id = 'midori-msidebar-panel-menu';
  popupSet.appendChild(panelMenu);
  let panelMenuTargetId = null;

  function menuItem(label, onCommand) {
    const item = createXul(doc, 'menuitem');
    item.setAttribute('label', label);
    item.addEventListener(
      'command',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        onCommand?.();
      },
      true
    );
    return item;
  }

  function menuSeparator() {
    const sep = createXul(doc, 'menuseparator');
    return sep;
  }

  function openPanelMenu(panelId, e) {
    panelMenuTargetId = panelId;
    while (panelMenu.firstChild) panelMenu.firstChild.remove();
    const target = store.panels.find((x) => x.id === panelMenuTargetId);
    panelMenu.appendChild(
      menuItem('Editar URL', () => {
        const p = store.panels.find((x) => x.id === panelMenuTargetId);
        if (!p) return;
        const input = { value: p.url };
        const ok = Services.prompt.prompt(win, 'Editar panel', 'URL del panel:', input, null, {});
        if (!ok) return;
        const url = sanitizeUrl(input.value);
        if (!url) return;
        updatePanel(panelMenuTargetId, (pp) => {
          pp.url = url;
          return pp;
        });
        if (panelMenuTargetId === activePanelId) {
          setActivePanel(activePanelId);
        } else {
          renderButtons();
          const next = store.panels.find((x) => x.id === panelMenuTargetId);
          if (next) ensureFavicon(next);
        }
      })
    );
    panelMenu.appendChild(
      menuItem(target?.floating ? 'Acoplar' : 'Flotante', () => {
        const next = updatePanel(panelMenuTargetId, (p) => {
          p.floating = !p.floating;
          p.pinned = !p.floating;
          return p;
        });
        if (next && panelMenuTargetId === activePanelId) setActivePanel(activePanelId);
      })
    );
    panelMenu.appendChild(
      menuItem(target?.muted ? 'Unmute' : 'Mute', () => {
        const next = updatePanel(panelMenuTargetId, (p) => {
          p.muted = !p.muted;
          return p;
        });
        if (panelMenuTargetId === activePanelId && activeBrowser) {
          try {
            applyMuteToBrowser(activeBrowser, next?.muted);
          } catch {}
        }
      })
    );
    panelMenu.appendChild(
      menuItem('Unload', () => {
        if (panelMenuTargetId !== activePanelId) return;
        clearBrowser();
        syncNavButtons();
      })
    );
    panelMenu.appendChild(menuSeparator());
    panelMenu.appendChild(
      menuItem('Zoom +', () => {
        const p = store.panels.find((x) => x.id === panelMenuTargetId);
        if (!p) return;
        const nextZoom = Math.min(3, Math.round(((p.zoom || 1) + 0.1) * 100) / 100);
        updatePanel(panelMenuTargetId, (pp) => {
          pp.zoom = nextZoom;
          return pp;
        });
        if (panelMenuTargetId === activePanelId && activeBrowser) applyZoomToBrowser(activeBrowser, nextZoom);
      })
    );
    panelMenu.appendChild(
      menuItem('Zoom -', () => {
        const p = store.panels.find((x) => x.id === panelMenuTargetId);
        if (!p) return;
        const nextZoom = Math.max(0.3, Math.round(((p.zoom || 1) - 0.1) * 100) / 100);
        updatePanel(panelMenuTargetId, (pp) => {
          pp.zoom = nextZoom;
          return pp;
        });
        if (panelMenuTargetId === activePanelId && activeBrowser) applyZoomToBrowser(activeBrowser, nextZoom);
      })
    );
    panelMenu.appendChild(
      menuItem('Zoom reset', () => {
        updatePanel(panelMenuTargetId, (pp) => {
          pp.zoom = 1;
          return pp;
        });
        if (panelMenuTargetId === activePanelId && activeBrowser) applyZoomToBrowser(activeBrowser, 1);
      })
    );
    panelMenu.appendChild(
      menuItem('Reset posición/tamaño', () => {
        updatePanel(panelMenuTargetId, (pp) => {
          pp.geometry = { width: 480, height: 640, offsetX: 12, offsetY: 12 };
          pp.dockWidth = null;
          return pp;
        });
        if (panelMenuTargetId === activePanelId) setActivePanel(activePanelId);
      })
    );
    panelMenu.appendChild(menuSeparator());
    panelMenu.appendChild(
      menuItem('Eliminar', () => {
        const idx = store.panels.findIndex((p) => p.id === panelMenuTargetId);
        if (idx === -1) return;
        store.panels.splice(idx, 1);
        if (store.last?.selectedPanelId === panelMenuTargetId) {
          store.last.selectedPanelId = store.panels[0]?.id;
        }
        onStoreChanged?.(store);
        setStore(store);
      })
    );
    panelMenu.appendChild(
      menuItem('Abrir en pestaña', () => {
        const p = store.panels.find((x) => x.id === panelMenuTargetId);
        if (!p) return;
        try {
          win.openTrustedLinkIn(p.url, 'tab');
        } catch {}
      })
    );
    try {
      panelMenu.openPopupAtScreen(e.screenX, e.screenY, true);
    } catch {}
  }

  const settingsPanel = createXul(doc, 'panel');
  settingsPanel.id = 'midori-msidebar-settings-panel';
  settingsPanel.setAttribute('type', 'arrow');
  settingsPanel.setAttribute('noautofocus', 'true');
  const settingsBox = createXul(doc, 'vbox');
  settingsBox.setAttribute('style', 'padding:10px; min-width: 260px;');
  settingsPanel.appendChild(settingsBox);
  popupSet.appendChild(settingsPanel);

  function checkboxRow(label, prefName) {
    const row = createXul(doc, 'hbox');
    row.setAttribute('align', 'center');
    row.setAttribute('style', 'gap: 8px; margin-bottom: 8px;');
    const cb = createXul(doc, 'checkbox');
    cb.setAttribute('label', label);
    cb.setAttribute('checked', Services.prefs.getBoolPref(prefName, false) ? 'true' : 'false');
    cb.addEventListener(
      'command',
      () => {
        let next = false;
        try {
          next = !!cb.checked;
        } catch {
          next = cb.getAttribute('checked') === 'true';
        }
        try {
          Services.prefs.setBoolPref(prefName, next);
        } catch {}
      },
      true
    );
    row.appendChild(cb);
    settingsBox.appendChild(row);
    return cb;
  }

  function selectRow(label, options, get, set) {
    const row = createXul(doc, 'hbox');
    row.setAttribute('align', 'center');
    row.setAttribute('style', 'gap: 8px; margin-bottom: 8px;');
    const lab = createXul(doc, 'label');
    lab.setAttribute('value', label);
    row.appendChild(lab);
    const menulist = createXul(doc, 'menulist');
    const menupopup = createXul(doc, 'menupopup');
    for (const opt of options) {
      const mi = createXul(doc, 'menuitem');
      mi.setAttribute('label', opt.label);
      mi.setAttribute('value', opt.value);
      menupopup.appendChild(mi);
    }
    menulist.appendChild(menupopup);
    menulist.value = get();
    menulist.addEventListener('command', () => set(menulist.value), true);
    row.appendChild(menulist);
    settingsBox.appendChild(row);
    return menulist;
  }

  checkboxRow('Auto-hide sidebar', 'midori.msidebar.autohide.enabled');
  selectRow(
    'Auto-hide modo',
    [
      { value: 'overlay', label: 'Overlay' },
      { value: 'inline', label: 'Inline' },
    ],
    () => Services.prefs.getStringPref('midori.msidebar.autohide.mode', 'overlay'),
    (v) => Services.prefs.setStringPref('midori.msidebar.autohide.mode', v)
  );

  checkboxRow('Ocultar panel al ocultar sidebar', 'midori.msidebar.hidePanelWhenHidden');
  checkboxRow('Animaciones', 'midori.msidebar.animations.enabled');
  checkboxRow('Hints de geometría', 'midori.msidebar.geometryHint.enabled');
  selectRow(
    'Posición',
    [
      { value: 'left', label: 'Izquierda' },
      { value: 'right', label: 'Derecha' },
    ],
    () => Services.prefs.getStringPref('midori.msidebar.position', 'left'),
    (v) => Services.prefs.setStringPref('midori.msidebar.position', v)
  );

  selectRow(
    'Indicador de container',
    [
      { value: 'off', label: 'Off' },
      { value: 'left', label: 'Left' },
      { value: 'right', label: 'Right' },
      { value: 'top', label: 'Top' },
      { value: 'bottom', label: 'Bottom' },
      { value: 'around', label: 'Around' },
    ],
    () => Services.prefs.getStringPref('midori.msidebar.containerIndicator', 'left'),
    (v) => Services.prefs.setStringPref('midori.msidebar.containerIndicator', v)
  );

  selectRow(
    'Tooltip',
    [
      { value: 'off', label: 'Off' },
      { value: 'title', label: 'Title' },
      { value: 'url', label: 'URL' },
      { value: 'title-url', label: 'Title+URL' },
    ],
    () => Services.prefs.getStringPref('midori.msidebar.tooltip.mode', 'title-url'),
    (v) => Services.prefs.setStringPref('midori.msidebar.tooltip.mode', v)
  );

  checkboxRow('Tooltip: URL completa', 'midori.msidebar.tooltip.fullUrl');

  checkboxRow('Toolbar panel: auto-hide', 'midori.msidebar.webPanelToolbar.autohide');
  checkboxRow('Toolbar panel: auto-hide back', 'midori.msidebar.webPanelToolbar.autohideBack');
  checkboxRow('Toolbar panel: auto-hide forward', 'midori.msidebar.webPanelToolbar.autohideForward');

  const customizeBtn = createXul(doc, 'button');
  customizeBtn.setAttribute('label', 'Customize Toolbar…');
  customizeBtn.setAttribute('style', 'margin-top: 8px;');
  customizeBtn.addEventListener(
    'command',
    () => {
      try {
        win.gCustomizeMode?.enter?.();
      } catch {}
    },
    true
  );
  settingsBox.appendChild(customizeBtn);

  btnSettings.addEventListener(
    'command',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        settingsPanel.openPopup(btnSettings, 'after_end', 0, 0, false, false);
      } catch {}
    },
    true
  );

  function setAnimated(next) {
    animated = !!next;
    main.setAttribute('animated', animated ? 'true' : 'false');
    boxArea.setAttribute('animated', animated ? 'true' : 'false');
  }

  function onEnter(e) {
    if (!autohideEnabled || !visible || panelAreaHiddenByUser || currentPanelFloating) return;
    setBoolAttr(boxArea, 'collapsed', false);
    syncSplitterVisibility();
  }
  function onLeave() {
    if (!autohideEnabled || !visible || panelAreaHiddenByUser || currentPanelFloating) return;
    if (sizing || floatingResize || floatingDrag) return;
    setBoolAttr(boxArea, 'collapsed', true);
    syncSplitterVisibility();
  }

  main.addEventListener('mouseenter', onEnter, true);
  boxArea.addEventListener('mouseenter', onEnter, true);
  main.addEventListener('mouseleave', onLeave, true);
  boxArea.addEventListener('mouseleave', onLeave, true);

  btnToggle.addEventListener(
    'command',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      Services.prefs.setBoolPref('midori.msidebar.enabled', !Services.prefs.getBoolPref('midori.msidebar.enabled', false));
    },
    true
  );

  btnAdd.addEventListener(
    'command',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      promptNewPanelUrl();
    },
    true
  );

  function onSplitterMouseMove(e) {
    if (!sizing || !splitterDrag || currentPanelFloating) return;
    try {
      const dx = e.clientX - splitterDrag.startX;
      const dir = splitterDrag.position === 'right' ? -1 : 1;
      const width = Math.min(800, Math.max(200, Math.round(splitterDrag.startWidth + dx * dir)));
      doc.documentElement.style.setProperty('--midori-msidebar-width', `${width}px`);
      if (autohideMode !== 'overlay') {
        try {
          boxArea.style.width = `${width}px`;
        } catch {}
      }
    } catch {}
  }

  splitter.addEventListener(
    'mousedown',
    (e) => {
      if (e.button !== 0) return;
      sizing = true;
      try {
        splitterDrag = {
          startX: e.clientX,
          startWidth: boxArea.getBoundingClientRect().width || preferredDockWidth,
          position,
          panelId: activePanelId,
        };
      } catch {
        splitterDrag = { startX: e.clientX, startWidth: preferredDockWidth, position, panelId: activePanelId };
      }
      win.addEventListener('mousemove', onSplitterMouseMove, true);
      if (autohideEnabled && visible && !currentPanelFloating) {
        setBoolAttr(boxArea, 'collapsed', false);
      }
      syncSplitterVisibility();
    },
    true
  );
  win.addEventListener(
    'mouseup',
    () => {
      if (!sizing) return;
      sizing = false;
      const splitterPanelId = splitterDrag?.panelId;
      splitterDrag = null;
      try {
        win.removeEventListener('mousemove', onSplitterMouseMove, true);
      } catch {}
      try {
        const w = Math.round(boxArea.getBoundingClientRect().width);
        if (w >= 200 && w <= 800) {
          Services.prefs.setIntPref('midori.msidebar.width', w);
          preferredDockWidth = w;
          const pid = activePanelId || splitterPanelId;
          if (pid && !currentPanelFloating) {
            updatePanel(pid, (p) => {
              p.dockWidth = w;
              return p;
            });
          } else {
            applyDockWidth();
          }
        }
      } catch {}
      syncSplitterVisibility();
    },
    true
  );

  function tryNav(fn) {
    try {
      if (!activeBrowser || typeof activeBrowser[fn] !== 'function') return;
      activeBrowser[fn]();
    } catch {}
  }

  btnBack.addEventListener('command', () => (tryNav('goBack'), syncNavButtons()), true);
  btnForward.addEventListener('command', () => (tryNav('goForward'), syncNavButtons()), true);
  btnReload.addEventListener('command', () => (tryNav('reload'), syncNavButtons()), true);
  btnHome.addEventListener(
    'command',
    () => {
      const panel = store.panels.find((p) => p.id === activePanelId);
      if (!panel) return;
      try {
        activeBrowser?.setAttribute?.('src', panel.url);
      } catch {}
      syncNavButtons();
    },
    true
  );

  function setZoomForActivePanel(nextZoom) {
    if (!activePanelId) return;
    const z = clampZoom(nextZoom);
    updatePanel(activePanelId, (pp) => {
      pp.zoom = z;
      return pp;
    });
    if (activeBrowser) applyZoomToBrowser(activeBrowser, z);
  }

  function changeZoomForActivePanel(delta) {
    const p = store.panels.find((x) => x.id === activePanelId);
    if (!p) return;
    const current = typeof p.zoom === 'number' ? p.zoom : 1;
    const next = Math.round((current + delta) * 100) / 100;
    setZoomForActivePanel(next);
  }

  btnZoomIn.addEventListener('command', () => changeZoomForActivePanel(0.1), true);
  btnZoomOut.addEventListener('command', () => changeZoomForActivePanel(-0.1), true);
  btnZoomReset.addEventListener('command', () => setZoomForActivePanel(1), true);

  function setStore(next) {
    store = next || { panels: [], last: {} };
    syncToolbarPrefs();
    renderButtons();
    const selected = store.last?.selectedPanelId;
    if (selected) {
      setActivePanel(selected);
    } else {
      activePanelId = null;
      titleLabel.setAttribute('value', '');
      clearBrowser();
    }
  }

  function destroy() {
    try {
      main.removeEventListener('mouseenter', onEnter, true);
      boxArea.removeEventListener('mouseenter', onEnter, true);
      main.removeEventListener('mouseleave', onLeave, true);
      boxArea.removeEventListener('mouseleave', onLeave, true);
    } catch {}
    clearBrowser();
    try {
      wrapper.remove();
    } catch {}
    try {
      doc.documentElement.removeAttribute('midori-msidebar-injected');
    } catch {}
  }

  function refresh() {
    syncToolbarPrefs();
    renderButtons();
    syncNavButtons();
  }

  return {
    root: wrapper,
    setStore,
    setVisible,
    setPosition,
    setAutohide,
    setAutohideMode,
    setAnimated,
    setCssWidth,
    refresh,
    destroy,
    get settingsAnchor() {
      return btnSettings;
    },
  };
}
