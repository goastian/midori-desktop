import { createPanel, sanitizeUrl } from './SidebarModel.mjs';
import {
  createPanelBrowser,
  createPanelNotificationBridge,
  createPanelPromptAdapter,
  destroyBrowser,
} from './SidebarPanelHost.mjs';
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
#midori-msidebar-edge-trigger{position:absolute;top:0;bottom:0;width:8px;z-index:29;background:transparent;pointer-events:auto;}
#midori-msidebar-edge-trigger[position='left']{left:0;}
#midori-msidebar-edge-trigger[position='right']{right:0;}
#midori-msidebar-edge-trigger[hidden='true']{display:none;pointer-events:none;}
#midori-msidebar-main{display:flex;flex-direction:column;gap:var(--space-small,8px);padding:var(--space-small,8px) calc(var(--space-small,8px)/2);background:var(--toolbox-bgcolor);color:var(--toolbox-color);min-width:var(--midori-msidebar-main-width);box-sizing:border-box;}
#midori-msidebar-main[collapsed='true']{pointer-events:none;opacity:0;min-width:0;padding:0;margin:0;}
#midori-msidebar-main[animated='true']:not([initializing]){transition:opacity var(--midori-msidebar-anim) ease, min-width var(--midori-msidebar-anim) ease, padding var(--midori-msidebar-anim) ease;}
#midori-msidebar-main .toolbarbutton-1{padding:0 !important;}
.midori-msidebar-icon{min-width:calc(var(--midori-msidebar-main-width) - 8px);min-height:34px;padding:0;margin:0;}
#midori-msidebar-main .toolbarbutton-1{border-radius:var(--border-radius-medium);background:transparent;}
#midori-msidebar-main .toolbarbutton-1:hover{background:color-mix(in srgb, currentColor 8%, transparent);}
#midori-msidebar-main .toolbarbutton-1:active{background:color-mix(in srgb, currentColor 12%, transparent);}
#midori-msidebar-main .toolbarbutton-1,#midori-msidebar-box-toolbar .toolbarbutton-1{-moz-context-properties:fill;fill:currentColor;}
#midori-msidebar-main .toolbarbutton-text{display:none;}
.midori-msidebar-panel-btn .toolbarbutton-text{display:none;}
.midori-msidebar-panel-btn .toolbarbutton-icon{width:18px;height:18px;}
.midori-msidebar-panel-btn{list-style-image:url("chrome://global/skin/icons/defaultFavicon.svg");position:relative;overflow:visible;}
.midori-msidebar-panel-btn[checked='true']{background:color-mix(in srgb, currentColor 10%, transparent);}
.midori-msidebar-panel-btn[data-sound-playing='true']::after{content:"";position:absolute;right:3px;bottom:2px;width:12px;height:12px;background:url("chrome://browser/skin/notification-icons/speaker.svg") center/12px 12px no-repeat;opacity:0.95;pointer-events:none;}
.midori-msidebar-panel-btn[data-notification-badge]::before{content:attr(data-notification-badge);position:absolute;top:1px;right:1px;min-width:12px;height:12px;padding:0 3px;border-radius:999px;background:#d92222;color:#fff;font-size:9px;font-weight:700;line-height:12px;text-align:center;pointer-events:none;}

#midori-msidebar-toggle{list-style-image:url("chrome://browser/skin/sidebars.svg");}
#midori-msidebar-add{list-style-image:url("chrome://global/skin/icons/plus.svg");}
#midori-msidebar-settings{list-style-image:url("chrome://global/skin/icons/settings.svg");}
#midori-msidebar-nav-back{list-style-image:url("chrome://browser/skin/back.svg");}
#midori-msidebar-nav-forward{list-style-image:url("chrome://browser/skin/forward.svg");}
#midori-msidebar-nav-reload{list-style-image:url("chrome://global/skin/icons/reload.svg");}
#midori-msidebar-nav-home{list-style-image:url("chrome://browser/skin/home.svg");}
#midori-msidebar-box-area{display:flex;height:100%;width:var(--midori-msidebar-width);min-width:200px;box-sizing:border-box;}
#midori-msidebar-box-area[collapsed='true']{width:0;min-width:0;opacity:0;overflow:hidden;}
#midori-msidebar-box-area[collapsed='true']:not([autohide-target='true']){pointer-events:none;}
#midori-msidebar-box-area[overlay='true']{position:absolute;top:0;bottom:0;z-index:30;box-shadow:var(--content-area-shadow);}
#midori-msidebar-box-area[overlay='true'][floating='true']{z-index:45;}
#midori-msidebar-box-area[overlay='true'][always-on-top='true']{z-index:2147483000;}
#midori-msidebar-box-area[overlay='true'][position='left']{left:var(--midori-msidebar-main-width);}
#midori-msidebar-box-area[overlay='true'][position='right']{right:var(--midori-msidebar-main-width);}
#midori-msidebar-box-area[animated='true']:not([initializing]){transition:width var(--midori-msidebar-anim) ease, opacity var(--midori-msidebar-anim) ease;}
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

#midori-msidebar-edit-panel{
  background-color:var(--toolbar-bgcolor);
  color:var(--toolbar-color);
  border:1px solid var(--sidebar-border-color);
  border-radius:var(--border-radius-medium);
  padding:0;
  max-width:600px;
}

#midori-msidebar-edit-panel > vbox{
  padding:16px;
}

#midori-msidebar-edit-panel tabs{
  background-color:color-mix(in srgb, var(--toolbar-bgcolor) 85%, var(--sidebar-background-color));
  border-bottom:1px solid var(--sidebar-border-color);
}

#midori-msidebar-edit-panel tab{
  background-color:transparent;
  color:var(--toolbar-color);
  padding:8px 12px;
  border:none;
  border-bottom:2px solid transparent;
  margin:0;
  cursor:pointer;
}

#midori-msidebar-edit-panel tab[selected='true']{
  border-bottom-color:var(--focus-outline-color);
  background-color:color-mix(in srgb, var(--toolbar-bgcolor) 92%, var(--sidebar-background-color));
}

#midori-msidebar-edit-panel tab:hover{
  background-color:color-mix(in srgb, var(--toolbar-bgcolor) 90%, var(--sidebar-background-color));
}

#midori-msidebar-edit-panel tabpanels{
  background-color:var(--toolbar-bgcolor);
  color:var(--toolbar-color);
}

#midori-msidebar-edit-panel tabpanel{
  background-color:var(--toolbar-bgcolor);
  color:var(--toolbar-color);
  padding:12px;
  overflow:auto;
}

#midori-msidebar-edit-panel checkbox{
  margin:4px 0;
  -moz-user-select:none;
}

#midori-msidebar-edit-panel checkbox > label{
  color:var(--toolbar-color);
  margin-left:6px;
}

#midori-msidebar-edit-panel label{
  color:var(--toolbar-color);
}

#midori-msidebar-edit-panel textbox{
  background-color:var(--sidebar-background-color);
  color:var(--sidebar-text-color);
  border:1px solid var(--sidebar-border-color);
  padding:4px 6px;
  border-radius:2px;
}

#midori-msidebar-edit-panel textbox:focus{
  border-color:var(--focus-outline-color);
  outline:1px solid var(--focus-outline-color);
}

#midori-msidebar-edit-panel menulist{
  background-color:var(--sidebar-background-color);
  color:var(--sidebar-text-color);
  border:1px solid var(--sidebar-border-color);
  padding:4px 6px;
  border-radius:2px;
}

#midori-msidebar-edit-panel menupopup{
  background-color:var(--toolbar-bgcolor);
  color:var(--toolbar-color);
  border:1px solid var(--sidebar-border-color);
}

#midori-msidebar-edit-panel menuitem{
  background-color:var(--toolbar-bgcolor);
  color:var(--toolbar-color);
  padding:4px 8px;
}

#midori-msidebar-edit-panel menuitem:hover{
  background-color:var(--focus-outline-color);
}

#midori-msidebar-edit-panel button{
  background-color:var(--sidebar-background-color);
  color:var(--sidebar-text-color);
  border:1px solid var(--sidebar-border-color);
  padding:6px 12px;
  border-radius:var(--border-radius-medium);
  cursor:pointer;
}

#midori-msidebar-edit-panel button:hover{
  background-color:color-mix(in srgb, var(--sidebar-background-color) 95%, var(--focus-outline-color));
}

#midori-msidebar-edit-panel button:active{
  background-color:var(--focus-outline-color);
}
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
  const title = (panel?.title?.value || '').trim();
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

function clampFloatingNumber(value, min, max, fallback) {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizedAnchor(anchor) {
  return ['tl', 'tr', 'bl', 'br', 'center'].includes(anchor) ? anchor : 'center';
}

function anchorUsesRight(anchor, position) {
  const a = normalizedAnchor(anchor);
  return a === 'tr' || a === 'br' || (a === 'center' && position === 'right');
}

function anchorUsesBottom(anchor) {
  const a = normalizedAnchor(anchor);
  return a === 'bl' || a === 'br';
}

export function computeFloatingZIndex(alwaysOnTop) {
  return alwaysOnTop ? 2147483000 : 45;
}

export function computeFloatingPlacement({ anchor, x, y, w, h, position }) {
  const finalAnchor = normalizedAnchor(anchor);
  const width = clampFloatingNumber(w, 240, 1200, 480);
  const height = clampFloatingNumber(h, 240, 1200, 640);
  const offsetX = clampFloatingNumber(x, -2000, 2000, 12);
  const offsetY = clampFloatingNumber(y, -2000, 2000, 12);

  const next = {
    width: `${width}px`,
    height: `${height}px`,
    top: 'unset',
    bottom: 'unset',
    left: 'unset',
    right: 'unset',
  };

  if (finalAnchor === 'center') {
    next.top = `calc(50% - ${Math.round(height / 2)}px + ${offsetY}px)`;
  } else if (anchorUsesBottom(finalAnchor)) {
    next.bottom = `${offsetY}px`;
  } else {
    next.top = `${offsetY}px`;
  }

  const sideExpr = `calc(var(--midori-msidebar-main-width) + ${offsetX}px)`;
  if (anchorUsesRight(finalAnchor, position)) {
    next.right = sideExpr;
  } else {
    next.left = sideExpr;
  }

  return next;
}

export function computePanelButtonDecorations(panel, { audioPlaying = false, notificationCount = 0 } = {}) {
  const hide = panel?.hide && typeof panel.hide === 'object' ? panel.hide : {};
  const count = Number.isFinite(notificationCount) ? Math.max(0, Math.floor(notificationCount)) : 0;
  const badgeText = !hide.notificationBadge && count > 0 ? (count > 99 ? '99+' : String(count)) : '';
  return {
    showSoundIcon: !!audioPlaying && !hide.soundIcon,
    badgeText,
  };
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
  main.setAttribute('initializing', 'true');

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
  boxArea.setAttribute('initializing', 'true');
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

  const edgeTrigger = createXul(doc, 'box');
  edgeTrigger.id = 'midori-msidebar-edge-trigger';
  edgeTrigger.setAttribute('position', 'left');
  edgeTrigger.setAttribute('hidden', 'true');

  wrapper.appendChild(main);
  wrapper.appendChild(boxArea);
  wrapper.appendChild(splitter);
  browser.insertBefore(wrapper, tabbox);
  browser.appendChild(edgeTrigger);
  try {
    doc.documentElement.setAttribute('midori-msidebar-injected', 'true');
  } catch {}
  // Remove initializing flag after first paint to enable transitions
  win.requestAnimationFrame(() => {
    win.requestAnimationFrame(() => {
      main.removeAttribute('initializing');
      boxArea.removeAttribute('initializing');
    });
  });

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
  const desktopReloadPanels = new Set();
  const panelAudioState = new Map();
  const panelNotificationCount = new Map();
  let activePromptAdapter = null;
  let activeNotificationBridge = null;
  let activeAudioEventsCleanup = null;

  function teardownActivePanelBridges() {
    if (activeAudioEventsCleanup) {
      try {
        activeAudioEventsCleanup();
      } catch {}
      activeAudioEventsCleanup = null;
    }
    if (activeNotificationBridge) {
      try {
        activeNotificationBridge.destroy();
      } catch {}
      activeNotificationBridge = null;
    }
    if (activePromptAdapter) {
      try {
        activePromptAdapter.destroy();
      } catch {}
      activePromptAdapter = null;
    }
  }

  function setPanelAudioState(panelId, playing) {
    if (!panelId) return;
    panelAudioState.set(panelId, !!playing);
    renderButtons();
  }

  function incrementPanelNotificationBadge(panelId, amount = 1) {
    if (!panelId) return;
    const delta = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 1;
    if (!delta) return;
    const next = (panelNotificationCount.get(panelId) || 0) + delta;
    panelNotificationCount.set(panelId, next);
    renderButtons();
  }

  function syncPanelAudioFromBrowser(panelId, browserEl) {
    let playing = false;
    try {
      playing = !!browserEl?.audioPlaybackStarted;
    } catch {}
    if (!playing) {
      try {
        playing = browserEl?.getAttribute?.('soundplaying') === 'true';
      } catch {}
    }
    setPanelAudioState(panelId, playing);
  }

  function applyPanelButtonDecorations(btn, panel) {
    const panelId = panel?.id;
    const decorations = computePanelButtonDecorations(panel, {
      audioPlaying: !!panelAudioState.get(panelId),
      notificationCount: panelNotificationCount.get(panelId) || 0,
    });

    if (decorations.showSoundIcon) {
      btn.setAttribute('data-sound-playing', 'true');
    } else {
      btn.removeAttribute('data-sound-playing');
    }

    if (decorations.badgeText) {
      btn.setAttribute('data-notification-badge', decorations.badgeText);
    } else {
      btn.removeAttribute('data-notification-badge');
    }
  }

  function syncEdgeTriggerVisibility() {
    const shouldShow = autohideEnabled && visible && !currentPanelFloating;
    setBoolAttr(edgeTrigger, 'hidden', !shouldShow);
    edgeTrigger.setAttribute('position', position);
  }

  function hidePanelArea() {
    activePanelId = null;
    currentPanelFloating = false;
    clearBrowser();
    clearFloatingChrome();
    titleLabel.setAttribute('value', '');
    boxArea.style.display = '';
    setBoolAttr(boxArea, 'collapsed', true);
    setBoolAttr(splitter, 'hidden', true);
  }

  function applyAutohideCollapsedState(open) {
    if (!autohideEnabled || currentPanelFloating) {
      return;
    }
    _ahOpen = !!open;
    setBoolAttr(main, 'collapsed', !_ahOpen);
    setBoolAttr(boxArea, 'collapsed', panelAreaHiddenByUser || !activePanelId || !_ahOpen);
    syncSplitterVisibility();
    syncEdgeTriggerVisibility();
  }

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
    const floating = panel?.floating || {};
    const geometry = panel?.geometry || {};
    const placement = computeFloatingPlacement({
      anchor: floating.anchor,
      x: typeof floating.x === 'number' ? floating.x : geometry.offsetX,
      y: typeof floating.y === 'number' ? floating.y : geometry.offsetY,
      w: typeof floating.w === 'number' ? floating.w : geometry.width,
      h: typeof floating.h === 'number' ? floating.h : geometry.height,
      position,
    });
    boxArea.style.width = placement.width;
    boxArea.style.height = placement.height;
    boxArea.style.top = placement.top;
    boxArea.style.bottom = placement.bottom;
    boxArea.style.left = placement.left;
    boxArea.style.right = placement.right;
    setBoolAttr(boxArea, 'floating', true);
    setBoolAttr(boxArea, 'always-on-top', !!floating.alwaysOnTop);
    boxArea.style.zIndex = String(computeFloatingZIndex(!!floating.alwaysOnTop));
  }

  function currentMainWidthPx() {
    return parseFloat(win.getComputedStyle(doc.documentElement).getPropertyValue('--midori-msidebar-main-width')) || 44;
  }

  function floatingOffsetsFromRect(rect, anchor) {
    const useRight = anchorUsesRight(anchor, position);
    const useBottom = anchorUsesBottom(anchor);
    const mainW = currentMainWidthPx();
    const x = useRight ? Math.round(win.innerWidth - rect.right - mainW) : Math.round(rect.left - mainW);
    const y = useBottom ? Math.round(win.innerHeight - rect.bottom) : Math.round(rect.top);
    return { x, y };
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
    boxArea.style.zIndex = '';
    boxArea.removeAttribute('floating');
    boxArea.removeAttribute('always-on-top');
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
    teardownActivePanelBridges();
    if (activePanelId) {
      panelAudioState.set(activePanelId, false);
    }
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
    currentPanelFloating = !!panel.floating?.enabled;
    store.last = store.last || {};
    store.last.selectedPanelId = panel.id;
    clearBrowser();
    const browserEl = createPanelBrowser(win, {
      ...panel,
      mobile: !!panel.mobile && !desktopReloadPanels.has(panel.id),
    });
    activeBrowser = browserEl;
    activePromptAdapter = createPanelPromptAdapter(win, activeBrowser, {
      onPromptShown(kind) {
        if (kind === 'media') {
          syncPanelAudioFromBrowser(panel.id, activeBrowser);
        }
      },
    });
    activeNotificationBridge = createPanelNotificationBridge(activeBrowser, {
      onIncrement(amount) {
        incrementPanelNotificationBadge(panel.id, amount);
      },
    });
    const onAudioStarted = () => setPanelAudioState(panel.id, true);
    const onAudioStopped = () => setPanelAudioState(panel.id, false);
    try {
      activeBrowser.addEventListener('DOMAudioPlaybackStarted', onAudioStarted, true);
      activeBrowser.addEventListener('DOMAudioPlaybackStopped', onAudioStopped, true);
      activeAudioEventsCleanup = () => {
        try {
          activeBrowser.removeEventListener('DOMAudioPlaybackStarted', onAudioStarted, true);
        } catch {}
        try {
          activeBrowser.removeEventListener('DOMAudioPlaybackStopped', onAudioStopped, true);
        } catch {}
      };
    } catch {
      activeAudioEventsCleanup = null;
    }
    activeBrowser.addEventListener(
      'load',
      () => {
        syncNavButtons();
        applyZoomToBrowser(activeBrowser, panel.zoom);
        syncPanelAudioFromBrowser(panel.id, activeBrowser);
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
    titleBaseText = panel.title?.value || safeHostname(panel.url) || panel.url;
    titleLabel.setAttribute('value', titleBaseText);
    if (currentPanelFloating) {
      boxArea.setAttribute('overlay', 'true');
      boxArea.style.display = '';
      setBoolAttr(boxArea, 'collapsed', !visible);
      ensureFloatingChrome();
      applyFloatingGeometry(panel);
    } else {
      clearFloatingChrome();
      boxArea.removeAttribute('floating');
      boxArea.removeAttribute('always-on-top');
      boxArea.style.zIndex = '';
      boxArea.style.display = '';
      boxArea.setAttribute('overlay', autohideEnabled && autohideMode === 'overlay' ? 'true' : 'false');
      boxArea.style.height = '';
      boxArea.style.top = '';
      boxArea.style.bottom = '';
      boxArea.style.left = '';
      boxArea.style.right = '';
      if (autohideEnabled) {
        boxArea.setAttribute('autohide-target', 'true');
        if (_ahTimer) { try { win.clearTimeout(_ahTimer); } catch {} _ahTimer = null; }
        applyAutohideCollapsedState(true);
      } else if (visible) {
        boxArea.removeAttribute('autohide-target');
        setBoolAttr(main, 'collapsed', false);
        setBoolAttr(boxArea, 'collapsed', false);
      }
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
    const selected = activePanelId;
    const indicator = Prefs.getContainerIndicator();
    for (const panel of store.panels) {
      const btn = createXul(doc, 'toolbarbutton');
      btn.classList.add('toolbarbutton-1', 'midori-msidebar-icon', 'midori-msidebar-panel-btn');
      btn.setAttribute('label', '');
      btn.setAttribute('aria-label', panel.title?.value || safeHostname(panel.url) || panel.url || 'Panel');
      const tt = tooltipTextForPanel(panel);
      if (tt) btn.setAttribute('tooltiptext', tt);
      btn.setAttribute('midori-msidebar-panel-id', panel.id);
      btn.setAttribute('container-indicator', indicator);
      const cc = containerColorForUserContext(panel.userContextId);
      if (cc) btn.style.setProperty('--midori-msidebar-container-color', cc);
      setPanelButtonIcon(btn, faviconCache.get(panel.id) || faviconFallbackForPanel(panel));
      applyPanelButtonDecorations(btn, panel);
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
            _ahOpen = false;
            if (_ahTimer) { try { win.clearTimeout(_ahTimer); } catch {} _ahTimer = null; }
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
          if (_ahTimer) { try { win.clearTimeout(_ahTimer); } catch {} _ahTimer = null; }
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
      syncEdgeTriggerVisibility();
      return;
    }
    if (currentPanelFloating) {
      setBoolAttr(main, 'collapsed', false);
      boxArea.style.display = panelAreaHiddenByUser || !activePanelId ? 'none' : '';
      setBoolAttr(boxArea, 'collapsed', panelAreaHiddenByUser || !activePanelId);
    } else {
      if (autohideEnabled) {
        boxArea.setAttribute('autohide-target', 'true');
        applyAutohideCollapsedState(false);
      }
      if (!autohideEnabled) {
        setBoolAttr(main, 'collapsed', false);
        setBoolAttr(boxArea, 'collapsed', panelAreaHiddenByUser || !activePanelId);
      }
      boxArea.style.display = '';
    }
    syncSplitterVisibility();
    syncEdgeTriggerVisibility();
  }

  function syncSplitterVisibility() {
    if (!visible || currentPanelFloating || panelAreaHiddenByUser || !activePanelId) {
      setBoolAttr(splitter, 'hidden', true);
      return;
    }
    if (autohideEnabled && !_ahOpen) {
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
    edgeTrigger.setAttribute('position', position);
  }

  function setPosition(next) {
    position = next === 'right' ? 'right' : 'left';
    boxArea.setAttribute('position', position);
    main.setAttribute('position', position);
    splitter.setAttribute('position', position);
    applyOrder();
    syncEdgeTriggerVisibility();
    if (currentPanelFloating && activePanelId) {
      const panel = store.panels.find((p) => p.id === activePanelId);
      if (panel) applyFloatingGeometry(panel);
    }
  }

  function setAutohide(enabled) {
    autohideEnabled = !!enabled;
    // Reset autohide hover state
    _ahOpen = false;
    if (_ahTimer) { try { win.clearTimeout(_ahTimer); } catch {} _ahTimer = null; }
    if (currentPanelFloating) return;
    if (!autohideEnabled) {
      boxArea.removeAttribute('autohide-target');
      setBoolAttr(main, 'collapsed', !visible);
      setBoolAttr(boxArea, 'collapsed', panelAreaHiddenByUser || !visible);
      boxArea.setAttribute('overlay', 'false');
      applyDockWidth();
      syncSplitterVisibility();
      syncEdgeTriggerVisibility();
      return;
    }
    boxArea.setAttribute('autohide-target', 'true');
    if (visible) applyAutohideCollapsedState(false);
    boxArea.setAttribute('overlay', autohideMode === 'overlay' ? 'true' : 'false');
    applyDockWidth();
    syncSplitterVisibility();
    syncEdgeTriggerVisibility();
  }

  function setAutohideMode(mode) {
    autohideMode = mode === 'inline' ? 'inline' : 'overlay';
    // Reset autohide hover state on mode change
    _ahOpen = false;
    if (_ahTimer) { try { win.clearTimeout(_ahTimer); } catch {} _ahTimer = null; }
    if (currentPanelFloating) return;
    if (autohideEnabled && visible) applyAutohideCollapsedState(false);
    boxArea.setAttribute('overlay', autohideEnabled && autohideMode === 'overlay' ? 'true' : 'false');
    applyDockWidth();
    syncSplitterVisibility();
    syncEdgeTriggerVisibility();
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
      startBottom: rect.bottom,
      anchor: store.panels.find((p) => p.id === activePanelId)?.floating?.anchor || 'center',
    };
    // Disable animations during drag to prevent flickering
    boxArea.setAttribute('animated', 'false');
    win.addEventListener('mousemove', onFloatingDragMove, true);
    win.addEventListener('mouseup', onFloatingDragUp, true);
  }

  function onFloatingDragMove(e) {
    if (!floatingDrag) return;
    const dx = e.clientX - floatingDrag.startX;
    const dy = e.clientY - floatingDrag.startY;
    const anchor = floatingDrag.anchor || 'center';
    if (anchorUsesBottom(anchor)) {
      const bottom = Math.round(win.innerHeight - (floatingDrag.startBottom + dy));
      boxArea.style.bottom = `${bottom}px`;
      boxArea.style.top = 'unset';
    } else {
      const top = Math.round(floatingDrag.startTop + dy);
      boxArea.style.top = `${top}px`;
      boxArea.style.bottom = 'unset';
    }
    if (anchorUsesRight(anchor, position)) {
      const right = Math.round(win.innerWidth - (floatingDrag.startRight + dx));
      boxArea.style.right = `${right}px`;
      boxArea.style.left = 'unset';
    } else {
      const left = Math.round(floatingDrag.startLeft + dx);
      boxArea.style.left = `${left}px`;
      boxArea.style.right = 'unset';
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
    const anchor = floatingDrag.anchor || 'center';
    const offsets = floatingOffsetsFromRect(rect, anchor);
    updatePanel(activePanelId, (p) => {
      p.floating = p.floating || {};
      p.floating.x = offsets.x;
      p.floating.y = offsets.y;
      p.floating.w = Math.round(rect.width);
      p.floating.h = Math.round(rect.height);
      p.geometry = p.geometry || {};
      p.geometry.offsetX = offsets.x;
      p.geometry.offsetY = offsets.y;
      p.geometry.width = Math.round(rect.width);
      p.geometry.height = Math.round(rect.height);
      return p;
    });
    floatingDrag = null;
    // Re-enable animations after drag ends with delay to let layout settle
    setTimeout(() => {
      win.requestAnimationFrame(() => {
        win.requestAnimationFrame(() => {
          if (animated) boxArea.setAttribute('animated', 'true');
        });
      });
    }, 50);
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
    // Disable animations during resize to prevent flickering
    boxArea.setAttribute('animated', 'false');
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
    const anchor = store.panels.find((p) => p.id === activePanelId)?.floating?.anchor || 'center';
    if (anchorUsesBottom(anchor)) {
      boxArea.style.bottom = `${Math.round(win.innerHeight - bottom)}px`;
      boxArea.style.top = 'unset';
    } else {
      boxArea.style.top = `${Math.round(top)}px`;
      boxArea.style.bottom = 'unset';
    }
    if (anchorUsesRight(anchor, position)) {
      boxArea.style.right = `${Math.round(win.innerWidth - right)}px`;
      boxArea.style.left = 'unset';
    } else {
      boxArea.style.left = `${Math.round(left)}px`;
      boxArea.style.right = 'unset';
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
      const anchor = p.floating?.anchor || 'center';
      const offsets = floatingOffsetsFromRect(rect, anchor);
      p.floating = p.floating || {};
      p.floating.w = Math.round(rect.width);
      p.floating.h = Math.round(rect.height);
      p.floating.x = offsets.x;
      p.floating.y = offsets.y;
      p.geometry = p.geometry || {};
      p.geometry.width = Math.round(rect.width);
      p.geometry.height = Math.round(rect.height);
      p.geometry.offsetX = offsets.x;
      p.geometry.offsetY = offsets.y;
      return p;
    });
    floatingResize = null;
    // Re-enable animations after resize ends with delay to let layout settle
    setTimeout(() => {
      win.requestAnimationFrame(() => {
        win.requestAnimationFrame(() => {
          if (animated) boxArea.setAttribute('animated', 'true');
        });
      });
    }, 50);
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
      menuItem('Edit…', () => {
        openEditPanelDialog(panelMenuTargetId);
      })
    );
    panelMenu.appendChild(menuSeparator());
    panelMenu.appendChild(
      menuItem('Edit URL', () => {
        const p = store.panels.find((x) => x.id === panelMenuTargetId);
        if (!p) return;
        const input = { value: p.url };
        const ok = Services.prompt.prompt(win, 'Edit panel', 'Panel URL:', input, null, {});
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
    if (target?.mobile) {
      panelMenu.appendChild(
        menuItem(desktopReloadPanels.has(panelMenuTargetId) ? 'Reload as mobile' : 'Reload as desktop', () => {
          if (desktopReloadPanels.has(panelMenuTargetId)) {
            desktopReloadPanels.delete(panelMenuTargetId);
          } else {
            desktopReloadPanels.add(panelMenuTargetId);
          }
          if (panelMenuTargetId === activePanelId) {
            setActivePanel(activePanelId);
          }
        })
      );
    }
    panelMenu.appendChild(
      menuItem(target?.floating?.enabled ? 'Dock' : 'Floating', () => {
        const next = updatePanel(panelMenuTargetId, (p) => {
          p.floating = p.floating || {};
          p.floating.enabled = !p.floating.enabled;
          p.pinned = !p.floating.enabled;
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
      menuItem('Reset position/size', () => {
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
        desktopReloadPanels.delete(panelMenuTargetId);
        if (store.last?.selectedPanelId === panelMenuTargetId) {
          store.last.selectedPanelId = store.panels[0]?.id;
        }
        onStoreChanged?.(store);
        setStore(store);
      })
    );
    panelMenu.appendChild(
      menuItem('Open in tab', () => {
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

  // Prevent autohide from closing while settings popup is open
  try {
    settingsPanel.addEventListener('popupshowing', () => { _ahPopupOpen = true; });
    settingsPanel.addEventListener('popuphidden', () => { _ahPopupOpen = false; });
  } catch {}

  function setAnimated(next) {
    animated = !!next;
    main.setAttribute('animated', animated ? 'true' : 'false');
    boxArea.setAttribute('animated', animated ? 'true' : 'false');
  }

  // ── Autohide hover logic ──────────────────────────────────────────
  // main = icon column (always visible), boxArea = panel (hidden when autohide)
  // Entering main → show boxArea; leaving both main AND boxArea → hide after delay
  let _ahTimer = null;
  let _ahOpen = false;

  let _ahPopupOpen = false;

  function _ahGuard() {
    return autohideEnabled && visible && !currentPanelFloating;
  }

  function _ahShow() {
    if (!_ahGuard()) return;
    if (_ahTimer) { try { win.clearTimeout(_ahTimer); } catch {} _ahTimer = null; }
    applyAutohideCollapsedState(true);
  }

  function _ahScheduleHide() {
    if (!_ahGuard()) return;
    if (sizing || floatingResize || floatingDrag) return;
    if (_ahPopupOpen) return;
    if (_ahTimer) { try { win.clearTimeout(_ahTimer); } catch {} }
    _ahTimer = win.setTimeout(() => {
      _ahTimer = null;
      if (!_ahGuard()) return;
      if (sizing || floatingResize || floatingDrag) return;
      if (_ahPopupOpen) return;
      applyAutohideCollapsedState(false);
    }, 200);
  }

  function _ahCancelHide() {
    if (_ahTimer) { try { win.clearTimeout(_ahTimer); } catch {} _ahTimer = null; }
  }

  // main: entering shows, leaving schedules hide
  function onMainEnter() { _ahShow(); }
  function onMainLeave(e) {
    if (!_ahGuard()) return;
    // If mouse moved into boxArea, don't hide
    const rel = e.relatedTarget;
    if (rel && (boxArea.contains(rel) || rel === boxArea || splitter.contains(rel) || rel === splitter)) return;
    _ahScheduleHide();
  }

  // boxArea: entering cancels hide, leaving schedules hide
  function onBoxEnter() { _ahCancelHide(); }
  function onBoxLeave(e) {
    if (!_ahGuard()) return;
    const rel = e.relatedTarget;
    if (rel && (main.contains(rel) || rel === main || splitter.contains(rel) || rel === splitter)) return;
    _ahScheduleHide();
  }

  // splitter: same logic — cancel hide on enter, schedule on leave
  function onSplitterEnter() { _ahCancelHide(); }
  function onSplitterLeave(e) {
    if (!_ahGuard()) return;
    const rel = e.relatedTarget;
    if (rel && (main.contains(rel) || rel === main || boxArea.contains(rel) || rel === boxArea)) return;
    _ahScheduleHide();
  }

  function onEdgeTriggerEnter() { _ahShow(); }
  function onEdgeTriggerLeave(e) {
    if (!_ahGuard()) return;
    const rel = e.relatedTarget;
    if (rel && (main.contains(rel) || rel === main || boxArea.contains(rel) || rel === boxArea || splitter.contains(rel) || rel === splitter)) return;
    _ahScheduleHide();
  }

  function onBrowserEdgeMove(e) {
    if (!_ahGuard() || _ahPopupOpen) return;
    const rect = browser.getBoundingClientRect();
    const threshold = 10;
    const nearLeft = e.clientX <= rect.left + threshold;
    const nearRight = e.clientX >= rect.right - threshold;
    if ((position === 'left' && nearLeft) || (position === 'right' && nearRight)) {
      _ahShow();
    }
  }

  main.addEventListener('mouseenter', onMainEnter);
  main.addEventListener('mouseleave', onMainLeave);
  boxArea.addEventListener('mouseenter', onBoxEnter);
  boxArea.addEventListener('mouseleave', onBoxLeave);
  splitter.addEventListener('mouseenter', onSplitterEnter);
  splitter.addEventListener('mouseleave', onSplitterLeave);
  edgeTrigger.addEventListener('mouseenter', onEdgeTriggerEnter);
  edgeTrigger.addEventListener('mouseleave', onEdgeTriggerLeave);
  browser.addEventListener('mousemove', onBrowserEdgeMove, true);

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
      // Disable transitions during drag to prevent browser flicker
      boxArea.setAttribute('animated', 'false');
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
      // Re-enable transitions after drag ends (double-rAF to avoid flash)
      win.requestAnimationFrame(() => {
        win.requestAnimationFrame(() => {
          if (animated) boxArea.setAttribute('animated', 'true');
        });
      });
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
    const previousActivePanelId = activePanelId;
    store = next || { panels: [], last: {} };
    for (const id of [...desktopReloadPanels]) {
      if (!store.panels.some((panel) => panel.id === id && panel.mobile)) {
        desktopReloadPanels.delete(id);
      }
    }
    syncToolbarPrefs();
    const targetId = previousActivePanelId || store.last?.selectedPanelId;
    if (targetId && store.panels.some((panel) => panel.id === targetId)) {
      setActivePanel(targetId);
    } else {
      hidePanelArea();
      renderButtons();
    }
  }

  function openEditPanelDialog(panelId) {
    const panel = store.panels.find((p) => p.id === panelId);
    if (!panel) return;

    // Use a vbox container that will act as a lightweight dialog
    const dlgWrapper = createXul(doc, 'vbox');
    dlgWrapper.id = 'midori-msidebar-edit-dialog-wrapper';
    dlgWrapper.setAttribute('style', `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 10000;
      width: min(760px, 92vw);
      max-height: 88vh;
      background: var(--toolbar-bgcolor);
      border: 1px solid color-mix(in srgb, var(--sidebar-border-color) 75%, transparent);
      border-radius: 12px;
      box-shadow: 0 18px 48px rgba(0,0,0,0.35);
      display: flex;
      flex-direction: column;
    `);

    // Add a semi-transparent backdrop
    const backdrop = createXul(doc, 'vbox');
    backdrop.id = 'midori-msidebar-edit-dialog-backdrop';
    backdrop.setAttribute('style', `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(8,10,18,0.46);
      z-index: 9999;
    `);
    backdrop.addEventListener('click', () => {
      backdrop.remove();
      dlgWrapper.remove();
    });
    doc.documentElement.appendChild(backdrop);

    // Title bar
    const titleBar = createXul(doc, 'hbox');
    titleBar.setAttribute('style', `
      padding: 12px 16px;
      border-bottom: 1px solid color-mix(in srgb, var(--sidebar-border-color) 60%, transparent);
      align-items: center;
      background: color-mix(in srgb, var(--toolbar-bgcolor) 90%, var(--sidebar-background-color));
    `);
    const titleLabel = createXul(doc, 'label');
    titleLabel.setAttribute('value', 'Edit Panel');
    titleLabel.setAttribute('style', 'flex: 1; font-weight: bold; font-size: 1.1em;');
    titleBar.appendChild(titleLabel);
    dlgWrapper.appendChild(titleBar);

    // Scroll container for content
    const scrollBox = createXul(doc, 'scrollbox');
    scrollBox.setAttribute('style', `
      flex: 1;
      overflow: auto;
      padding: 12px 16px 10px;
    `);
    dlgWrapper.appendChild(scrollBox);

    const dlg = createXul(doc, 'vbox');
    dlg.id = 'midori-msidebar-edit-panel';
    dlg.setAttribute('style', 'display: flex; flex-direction: column; gap: 0;');
    scrollBox.appendChild(dlg);

    // Tab box
    const tabs = createXul(doc, 'tabbox');
    const tabstrip = createXul(doc, 'tabs');
    tabs.appendChild(tabstrip);

    const tabpanels = createXul(doc, 'tabpanels');
    tabs.appendChild(tabpanels);

    // Helper: Create a tab
    let editTabCounter = 0;
    function mkTab(label) {
      const tab = createXul(doc, 'tab');
      tab.setAttribute('label', label);
      tabstrip.appendChild(tab);

      const panel = createXul(doc, 'tabpanel');
      panel.id = `midori-msidebar-edit-tabpanel-${panelId}-${editTabCounter++}`;
      tab.setAttribute('linkedpanel', panel.id);
      panel.setAttribute('style', 'padding: 10px 8px; overflow: auto; max-height: 52vh;');
      tabpanels.appendChild(panel);

      const content = createXul(doc, 'vbox');
      content.setAttribute('style', 'display:flex; flex-direction:column; gap:8px;');
      panel.appendChild(content);
      return content;
    }

    // Helper: Create form row
    function formRow(label, control, style = '') {
      const hbox = createXul(doc, 'hbox');
      hbox.setAttribute('align', 'center');
      hbox.setAttribute('style', `gap: 10px; margin-bottom: 10px; ${style}`);
      const lbl = createXul(doc, 'label');
      lbl.setAttribute('value', label);
      lbl.setAttribute('style', 'min-width: 132px; font-weight: 600;');
      hbox.appendChild(lbl);
      hbox.appendChild(control);
      return hbox;
    }

    function formColumn(label, control, style = '') {
      const box = createXul(doc, 'vbox');
      box.setAttribute('style', `gap: 6px; margin-bottom: 10px; ${style}`);
      const lbl = createXul(doc, 'label');
      lbl.setAttribute('value', label);
      lbl.setAttribute('style', 'font-weight: 600;');
      box.appendChild(lbl);
      box.appendChild(control);
      return box;
    }

    // TAB 1: General
    const pnGeneral = mkTab('General');
    {
      const chkPinned = createXul(doc, 'checkbox');
      chkPinned.setAttribute('label', 'Pinned');
      chkPinned.setAttribute('checked', panel.pinned ? 'true' : 'false');
      pnGeneral.appendChild(chkPinned);

      const uaMenu = createXul(doc, 'menulist');
      uaMenu.setAttribute('style', 'min-width: 240px;');
      const uaPopup = createXul(doc, 'menupopup');
      for (const opt of [
        { label: 'Desktop (default)', value: 'desktop' },
        { label: 'Mobile (iPhone emulation)', value: 'mobile' },
      ]) {
        const mi = createXul(doc, 'menuitem');
        mi.setAttribute('label', opt.label);
        mi.setAttribute('value', opt.value);
        uaPopup.appendChild(mi);
      }
      uaMenu.appendChild(uaPopup);
      uaMenu.value = panel.mobile ? 'mobile' : 'desktop';
      pnGeneral.appendChild(formRow('User agent', uaMenu, 'flex: 1;'));

      const chkTemporary = createXul(doc, 'checkbox');
      chkTemporary.setAttribute('label', 'Temporary');
      chkTemporary.setAttribute('checked', panel.temporary ? 'true' : 'false');
      pnGeneral.appendChild(chkTemporary);

      const chkUnload = createXul(doc, 'checkbox');
      chkUnload.setAttribute('label', 'Unload on close');
      chkUnload.setAttribute('checked', panel.unloadOnClose ? 'true' : 'false');
      pnGeneral.appendChild(chkUnload);

      const chkLoadOnStartup = createXul(doc, 'checkbox');
      chkLoadOnStartup.setAttribute('label', 'Load on startup');
      chkLoadOnStartup.setAttribute('checked', panel.loadOnStartup ? 'true' : 'false');
      pnGeneral.appendChild(chkLoadOnStartup);

      const chkRestoreLast = createXul(doc, 'checkbox');
      chkRestoreLast.setAttribute('label', 'Restore last URL');
      chkRestoreLast.setAttribute('checked', panel.restoreLastUrl ? 'true' : 'false');
      pnGeneral.appendChild(chkRestoreLast);

      const chkMuted = createXul(doc, 'checkbox');
      chkMuted.setAttribute('label', 'Muted');
      chkMuted.setAttribute('checked', panel.muted ? 'true' : 'false');
      pnGeneral.appendChild(chkMuted);

      pnGeneral._controls = { chkPinned, uaMenu, chkTemporary, chkUnload, chkLoadOnStartup, chkRestoreLast, chkMuted };
    }

    // TAB 2: Title & Favicon
    const pnTitleFavicon = mkTab('Title & Favicon');
    {
      const txtTitle = createXul(doc, 'textbox');
      txtTitle.setAttribute('value', panel.title?.value || '');
      txtTitle.setAttribute('style', 'width: 100%; min-width: 320px;');
      pnTitleFavicon.appendChild(formRow('Title', txtTitle, 'flex: 1;'));

      const titleModeMenu = createXul(doc, 'menulist');
      const titleModePopup = createXul(doc, 'menupopup');
      for (const opt of [
        { label: 'Dynamic (from page)', value: 'dynamic' },
        { label: 'Static (custom)', value: 'static' },
      ]) {
        const mi = createXul(doc, 'menuitem');
        mi.setAttribute('label', opt.label);
        mi.setAttribute('value', opt.value);
        titleModePopup.appendChild(mi);
      }
      titleModeMenu.appendChild(titleModePopup);
      titleModeMenu.value = panel.title?.mode === 'static' ? 'static' : 'dynamic';
      pnTitleFavicon.appendChild(formRow('Title mode', titleModeMenu, 'flex: 1;'));

      const h2 = createXul(doc, 'label');
      h2.setAttribute('value', 'Favicon');
      h2.setAttribute('style', 'margin-top: 16px; margin-bottom: 8px; font-weight: bold;');
      pnTitleFavicon.appendChild(h2);

      const txtFavicon = createXul(doc, 'textbox');
      txtFavicon.setAttribute('value', panel.favicon?.value || '');
      txtFavicon.setAttribute('style', 'width: 100%; min-width: 320px;');
      pnTitleFavicon.appendChild(formRow('Favicon URL', txtFavicon, 'flex: 1;'));

      const favModeMenu = createXul(doc, 'menulist');
      const favModePopup = createXul(doc, 'menupopup');
      for (const opt of [
        { label: 'Dynamic (from page)', value: 'dynamic' },
        { label: 'Static (custom)', value: 'static' },
      ]) {
        const mi = createXul(doc, 'menuitem');
        mi.setAttribute('label', opt.label);
        mi.setAttribute('value', opt.value);
        favModePopup.appendChild(mi);
      }
      favModeMenu.appendChild(favModePopup);
      favModeMenu.value = panel.favicon?.mode === 'static' ? 'static' : 'dynamic';
      pnTitleFavicon.appendChild(formRow('Favicon mode', favModeMenu, 'flex: 1;'));

      pnTitleFavicon._controls = { txtTitle, titleModeMenu, txtFavicon, favModeMenu };
    }

    // TAB 3: Position & Size
    const pnPosition = mkTab('Position & Size');
    {
      const chkFloating = createXul(doc, 'checkbox');
      chkFloating.setAttribute('label', 'Floating window');
      chkFloating.setAttribute('checked', panel.floating?.enabled ? 'true' : 'false');
      pnPosition.appendChild(chkFloating);

      const chkAlwaysOnTop = createXul(doc, 'checkbox');
      chkAlwaysOnTop.setAttribute('label', 'Always on top');
      chkAlwaysOnTop.setAttribute('checked', panel.floating?.alwaysOnTop ? 'true' : 'false');
      pnPosition.appendChild(chkAlwaysOnTop);

      const anchorOptions = [
        { label: 'Top-left', value: 'tl' },
        { label: 'Top-right', value: 'tr' },
        { label: 'Bottom-left', value: 'bl' },
        { label: 'Bottom-right', value: 'br' },
        { label: 'Center', value: 'center' },
      ];
      const anchorMenu = createXul(doc, 'menulist');
      anchorMenu.setAttribute('style', 'width: 100%;');
      const anchorPopup = createXul(doc, 'menupopup');
      for (const opt of anchorOptions) {
        const mi = createXul(doc, 'menuitem');
        mi.setAttribute('label', opt.label);
        mi.setAttribute('value', opt.value);
        anchorPopup.appendChild(mi);
      }
      anchorMenu.appendChild(anchorPopup);
      anchorMenu.value = panel.floating?.anchor || 'center';
      pnPosition.appendChild(formRow('Anchor', anchorMenu, 'flex: 1;'));

      const txtX = createXul(doc, 'textbox');
      txtX.setAttribute('value', panel.floating?.x || '0');
      txtX.setAttribute('type', 'number');
      txtX.setAttribute('style', 'width: 110px;');
      pnPosition.appendChild(formRow('X', txtX));

      const txtY = createXul(doc, 'textbox');
      txtY.setAttribute('value', panel.floating?.y || '0');
      txtY.setAttribute('type', 'number');
      txtY.setAttribute('style', 'width: 110px;');
      pnPosition.appendChild(formRow('Y', txtY));

      const txtW = createXul(doc, 'textbox');
      txtW.setAttribute('value', panel.floating?.w || '480');
      txtW.setAttribute('type', 'number');
      txtW.setAttribute('style', 'width: 110px;');
      pnPosition.appendChild(formRow('Width', txtW));

      const txtH = createXul(doc, 'textbox');
      txtH.setAttribute('value', panel.floating?.h || '640');
      txtH.setAttribute('type', 'number');
      txtH.setAttribute('style', 'width: 110px;');
      pnPosition.appendChild(formRow('Height', txtH));

      const syncFloatingControls = () => {
        const enabled = !!chkFloating.checked;
        try {
          chkAlwaysOnTop.disabled = !enabled;
          anchorMenu.disabled = !enabled;
          txtX.disabled = !enabled;
          txtY.disabled = !enabled;
          txtW.disabled = !enabled;
          txtH.disabled = !enabled;
        } catch {}
      };
      chkFloating.addEventListener('command', syncFloatingControls, true);
      syncFloatingControls();

      pnPosition._controls = { chkFloating, chkAlwaysOnTop, anchorMenu, txtX, txtY, txtW, txtH };
    }

    // TAB 4: Loading
    const pnLoading = mkTab('Loading');
    {
      const chkPeriodicReload = createXul(doc, 'checkbox');
      chkPeriodicReload.setAttribute('label', 'Periodic reload');
      chkPeriodicReload.setAttribute('checked', panel.periodicReload?.enabled ? 'true' : 'false');
      pnLoading.appendChild(chkPeriodicReload);

      const txtReloadSecs = createXul(doc, 'textbox');
      txtReloadSecs.setAttribute('value', Math.max(30, panel.periodicReload?.seconds || 300));
      txtReloadSecs.setAttribute('type', 'number');
      txtReloadSecs.setAttribute('min', '30');
      txtReloadSecs.setAttribute('style', 'width: 140px;');
      pnLoading.appendChild(formRow('Reload interval (seconds)', txtReloadSecs));

      pnLoading._controls = { chkPeriodicReload, txtReloadSecs };
    }

    // TAB 5: Shortcut
    const pnShortcut = mkTab('Shortcut');
    {
      const txtShortcut = createXul(doc, 'textbox');
      txtShortcut.setAttribute('value', panel.shortcut || '');
      txtShortcut.setAttribute('placeholder', 'e.g., Ctrl+Shift+E');
      txtShortcut.setAttribute('style', 'width: 100%; min-width: 320px;');
      pnShortcut.appendChild(formRow('Keyboard Shortcut', txtShortcut, 'flex: 1;'));

      pnShortcut._controls = { txtShortcut };
    }

    // TAB 6: CSS
    const pnCSS = mkTab('CSS');
    {
      const chkCssEnabled = createXul(doc, 'checkbox');
      chkCssEnabled.setAttribute('label', 'Enable CSS selector');
      chkCssEnabled.setAttribute('checked', panel.cssSelector?.enabled ? 'true' : 'false');
      pnCSS.appendChild(chkCssEnabled);

      const txtCss = createXul(doc, 'textbox');
      txtCss.setAttribute('value', panel.cssSelector?.value || '');
      txtCss.setAttribute('multiline', 'true');
      txtCss.setAttribute('rows', '8');
      txtCss.setAttribute('style', 'width: 100%; min-width: 420px; min-height: 180px; font-family: monospace;');
      pnCSS.appendChild(formColumn('CSS Selector', txtCss, 'flex: 1;'));

      pnCSS._controls = { chkCssEnabled, txtCss };
    }

    // TAB 7: Hide
    const pnHide = mkTab('Hide');
    {
      const chkHideToolbar = createXul(doc, 'checkbox');
      chkHideToolbar.setAttribute('label', 'Hide toolbar');
      chkHideToolbar.setAttribute('checked', panel.hide?.toolbar ? 'true' : 'false');
      pnHide.appendChild(chkHideToolbar);

      const chkHideSoundIcon = createXul(doc, 'checkbox');
      chkHideSoundIcon.setAttribute('label', 'Hide sound icon');
      chkHideSoundIcon.setAttribute('checked', panel.hide?.soundIcon ? 'true' : 'false');
      pnHide.appendChild(chkHideSoundIcon);

      const chkHideNotifBadge = createXul(doc, 'checkbox');
      chkHideNotifBadge.setAttribute('label', 'Hide notification badge');
      chkHideNotifBadge.setAttribute('checked', panel.hide?.notificationBadge ? 'true' : 'false');
      pnHide.appendChild(chkHideNotifBadge);

      pnHide._controls = { chkHideToolbar, chkHideSoundIcon, chkHideNotifBadge };
    }

    // Dialog buttons
    const btnOK = createXul(doc, 'button');
    btnOK.setAttribute('label', 'OK');

    const btnCancel = createXul(doc, 'button');
    btnCancel.setAttribute('label', 'Cancel');

    dlg.appendChild(tabs);
    const buttonBox = createXul(doc, 'hbox');
    buttonBox.setAttribute('pack', 'end');
    buttonBox.setAttribute('style', 'margin-top: 14px; gap: 10px; padding: 0 2px;');
    buttonBox.appendChild(btnOK);
    buttonBox.appendChild(btnCancel);
    dlg.appendChild(buttonBox);

    btnOK.addEventListener('command', () => {
      updatePanel(panelId, (p) => {
        const g = pnGeneral._controls;
        p.pinned = g.chkPinned.checked;
        p.mobile = g.uaMenu.value === 'mobile';
        if (!p.mobile) {
          desktopReloadPanels.delete(panelId);
        }
        p.temporary = g.chkTemporary.checked;
        p.unloadOnClose = g.chkUnload.checked;
        p.loadOnStartup = g.chkLoadOnStartup.checked;
        p.restoreLastUrl = g.chkRestoreLast.checked;
        p.muted = g.chkMuted.checked;

        const tf = pnTitleFavicon._controls;
        p.title = {
          mode: tf.titleModeMenu.value === 'static' ? 'static' : 'dynamic',
          value: tf.txtTitle.value,
        };
        p.favicon = {
          mode: tf.favModeMenu.value === 'static' ? 'static' : 'dynamic',
          value: tf.txtFavicon.value,
        };

        const pos = pnPosition._controls;
        p.floating = {
          enabled: pos.chkFloating.checked,
          anchor: pos.anchorMenu.value || 'center',
          alwaysOnTop: pos.chkAlwaysOnTop.checked,
          x: parseInt(pos.txtX.value) || 0,
          y: parseInt(pos.txtY.value) || 0,
          w: parseInt(pos.txtW.value) || 480,
          h: parseInt(pos.txtH.value) || 640,
        };

        const ld = pnLoading._controls;
        p.periodicReload = {
          enabled: ld.chkPeriodicReload.checked,
          seconds: Math.max(30, parseInt(ld.txtReloadSecs.value) || 300),
        };

        const sc = pnShortcut._controls;
        p.shortcut = sc.txtShortcut.value;

        const cs = pnCSS._controls;
        p.cssSelector = {
          enabled: cs.chkCssEnabled.checked,
          value: cs.txtCss.value,
        };

        const hd = pnHide._controls;
        p.hide = {
          toolbar: hd.chkHideToolbar.checked,
          soundIcon: hd.chkHideSoundIcon.checked,
          notificationBadge: hd.chkHideNotifBadge.checked,
        };

        return p;
      });

      if (panelId === activePanelId) {
        setActivePanel(activePanelId);
      } else {
        renderButtons();
      }

      backdrop.remove();
      dlgWrapper.remove();
    }, true);

    btnCancel.addEventListener('command', () => {
      backdrop.remove();
      dlgWrapper.remove();
    }, true);

    doc.documentElement.appendChild(dlgWrapper);
    // Focus the first input for better UX
    try {
      const firstInput = dlgWrapper.querySelector('textbox, checkbox, menulist');
      if (firstInput) firstInput.focus();
    } catch {}
  }

  function destroy() {
    try {
      main.removeEventListener('mouseenter', onMainEnter);
      main.removeEventListener('mouseleave', onMainLeave);
      boxArea.removeEventListener('mouseenter', onBoxEnter);
      boxArea.removeEventListener('mouseleave', onBoxLeave);
      splitter.removeEventListener('mouseenter', onSplitterEnter);
      splitter.removeEventListener('mouseleave', onSplitterLeave);
      edgeTrigger.removeEventListener('mouseenter', onEdgeTriggerEnter);
      edgeTrigger.removeEventListener('mouseleave', onEdgeTriggerLeave);
      browser.removeEventListener('mousemove', onBrowserEdgeMove, true);
    } catch {}
    if (_ahTimer) {
      try { win.clearTimeout(_ahTimer); } catch {}
      _ahTimer = null;
    }
    clearBrowser();
    teardownActivePanelBridges();
    try {
      wrapper.remove();
    } catch {}
    try {
      edgeTrigger.remove();
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
