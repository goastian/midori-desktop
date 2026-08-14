import { createPanel, sanitizeUrl } from './SidebarModel.mjs';
import {
  resolveSidebarActionPanelForExtensionId,
  resolveSidebarActionPanelForUrl,
} from './SidebarExtensions.mjs';
import {
  createPanelBrowser,
  createPanelNotificationBridge,
  createPanelPromptAdapter,
  destroyBrowser,
} from './SidebarPanelHost.mjs';
import {
  createPresetRestoreSnapshot,
  motionDuration,
  nextRovingIndex,
  normalizeFrequentSites,
  panelSemantics,
  panelsBySection,
  parsePresetRestoreSnapshot,
  SIDEBAR_MOTION,
  SIDEBAR_PRESETS,
  summarizeMotionFrames,
} from './SidebarExperience.mjs';
import * as Prefs from './SidebarPrefs.mjs';
import {
  isReservedBrowserShortcut,
  isSafeGlobalShortcut,
} from '../shortcuts/ShortcutPolicy.sys.mjs';

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AboutNewTab: 'resource:///modules/AboutNewTab.sys.mjs',
  ContextualIdentityService: 'resource://gre/modules/ContextualIdentityService.sys.mjs',
  PlacesUtils: 'resource://gre/modules/PlacesUtils.sys.mjs',
});

const PANEL_KEYSET_ID = 'midori-msidebar-panel-shortcuts';
const FAVICON_FETCH_GAP_MS = 350;
const SIDEBAR_EDGE_ORDER = 1_000_000;

export function computeSidebarEdgeOrder(position, isRTL = false) {
  const right = position === Prefs.POSITION_RIGHT;
  const lowOrder = isRTL ? right : !right;
  return lowOrder ? -SIDEBAR_EDGE_ORDER : SIDEBAR_EDGE_ORDER;
}

function createXul(doc, tag) {
  if (doc.createXULElement) return doc.createXULElement(tag);
  return doc.createElement(tag);
}

function createHtml(doc, tag) {
  return doc.createElementNS('http://www.w3.org/1999/xhtml', tag);
}

function ensureStyle(doc) {
  const id = 'midori-msidebar-style';
  if (doc.getElementById(id)) return;
  const style = doc.createElement('style');
  style.id = id;
  style.textContent = `
:root{--midori-msidebar-width:320px;--midori-msidebar-main-width:44px;--midori-msidebar-rail-expanded-width:220px;--midori-msidebar-open:200ms;--midori-msidebar-close:160ms;--midori-msidebar-rail-open:180ms;--midori-msidebar-rail-close:140ms;--midori-msidebar-reorder:150ms;--midori-msidebar-surface:var(--sidebar-background-color,var(--toolbox-bgcolor,var(--toolbar-bgcolor)));--midori-msidebar-surface-text:var(--sidebar-text-color,var(--toolbar-color,var(--lwt-text-color)));--midori-msidebar-popup-surface:var(--arrowpanel-background,var(--panel-background,var(--midori-msidebar-surface)));--midori-msidebar-popup-text:var(--arrowpanel-color,var(--panel-color,var(--midori-msidebar-surface-text)));}
#browser{position:relative;}
#midori-msidebar-wrapper{position:relative;display:flex;flex-direction:row;height:100%;order:var(--midori-msidebar-edge-order,-1000000)!important;}
#midori-msidebar-wrapper:dir(rtl){flex-direction:row-reverse;}
#midori-msidebar-main{display:flex;flex-direction:column;align-items:stretch;gap:6px;padding:8px 5px;background:var(--midori-msidebar-surface);color:var(--midori-msidebar-surface-text);width:var(--midori-msidebar-main-width);min-width:var(--midori-msidebar-main-width);max-width:var(--midori-msidebar-main-width);box-sizing:border-box;overflow:hidden;transition:width var(--midori-msidebar-rail-close) cubic-bezier(.4,0,1,1),min-width var(--midori-msidebar-rail-close) cubic-bezier(.4,0,1,1),max-width var(--midori-msidebar-rail-close) cubic-bezier(.4,0,1,1),opacity var(--midori-msidebar-rail-close) ease;}
#midori-msidebar-main[expanded='true']{width:var(--midori-msidebar-rail-expanded-width);min-width:var(--midori-msidebar-rail-expanded-width);max-width:var(--midori-msidebar-rail-expanded-width);transition-duration:var(--midori-msidebar-rail-open);transition-timing-function:cubic-bezier(0,0,.2,1);}
#midori-msidebar-buttons{display:flex;flex-direction:column;align-items:stretch;gap:4px;min-width:100%;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;}
#midori-msidebar-main[collapsed='true']{pointer-events:none;opacity:0;min-width:0;padding:0;margin:0;}
#midori-msidebar-main[animated='false'],#midori-msidebar-box-area[animated='false']{transition:none!important;}
#midori-msidebar-main .toolbarbutton-1{padding:0 !important;display:flex;align-items:center;justify-content:center;}
.midori-msidebar-icon{width:100%;min-width:34px;height:36px;min-height:36px;padding:0 8px!important;margin:0;justify-content:flex-start!important;gap:8px;}
#midori-msidebar-main .toolbarbutton-1{border-radius:var(--border-radius-medium);background:transparent;box-sizing:border-box;}
#midori-msidebar-main .toolbarbutton-1:hover{background:color-mix(in srgb, currentColor 8%, transparent);}
#midori-msidebar-main .toolbarbutton-1[data-drop-target='true']{outline:2px solid var(--focus-outline-color);outline-offset:-2px;}
#midori-msidebar-main .toolbarbutton-1:active{background:color-mix(in srgb, currentColor 12%, transparent);}
#midori-msidebar-main .toolbarbutton-1,#midori-msidebar-box-toolbar .toolbarbutton-1{-moz-context-properties:fill;fill:currentColor;}
#midori-msidebar-main .toolbarbutton-icon,#midori-msidebar-box-toolbar .toolbarbutton-icon{margin-inline:auto;}
#midori-msidebar-main[expanded='true'] .toolbarbutton-icon{margin-inline:0;}
#midori-msidebar-main .toolbarbutton-text{display:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:start;}
#midori-msidebar-main[expanded='true'] .toolbarbutton-text{display:block;}
.midori-msidebar-panel-btn .toolbarbutton-text{display:none;}
#midori-msidebar-main[expanded='true'] .midori-msidebar-panel-btn .toolbarbutton-text{display:block;}
.midori-msidebar-panel-btn .toolbarbutton-icon{width:18px;height:18px;}
.midori-msidebar-panel-btn{list-style-image:url("chrome://global/skin/icons/defaultFavicon.svg");position:relative;overflow:visible;transition:background-color 120ms ease,transform 120ms ease;}
.midori-msidebar-panel-btn:active{transform:scale(.98);}
.midori-msidebar-panel-btn[checked='true']{background:color-mix(in srgb, currentColor 12%, transparent);}
.midori-msidebar-panel-btn[temporary='true']{background:color-mix(in srgb, var(--attention-dot-color, #0060df) 14%, transparent);}
.midori-msidebar-panel-btn[unloaded='true'] .toolbarbutton-icon{opacity:var(--toolbarbutton-disabled-opacity, .55);}
.midori-msidebar-panel-btn[loading='true']{list-style-image:url("chrome://global/skin/icons/loading.svg");}
.midori-msidebar-panel-btn[status='error']{outline:2px solid var(--error-text-color,#d70022);outline-offset:-2px;}
.midori-msidebar-panel-btn[status='suspended'] .toolbarbutton-icon{opacity:.58;filter:grayscale(.6);}
.midori-msidebar-panel-btn[data-sound-playing='true']::after{content:"";position:absolute;right:3px;bottom:2px;width:12px;height:12px;background:url("chrome://browser/skin/tabbrowser/tab-audio-playing-small.svg") center/12px 12px no-repeat;opacity:0.95;pointer-events:none;}
.midori-msidebar-panel-btn[data-muted='true']::after{content:"";position:absolute;right:3px;bottom:2px;width:12px;height:12px;background:url("chrome://browser/skin/tabbrowser/tab-audio-muted-small.svg") center/12px 12px no-repeat;opacity:0.95;pointer-events:none;}
.midori-msidebar-panel-btn[data-notification-badge]::before{content:attr(data-notification-badge);position:absolute;top:1px;right:1px;min-width:12px;height:12px;padding:0 3px;border-radius:999px;background:#d92222;color:#fff;font-size:9px;font-weight:700;line-height:12px;text-align:center;pointer-events:none;}

#midori-msidebar-toggle{list-style-image:url("chrome://browser/skin/sidebar-expanded.svg");}
#midori-msidebar-expand{list-style-image:url("chrome://global/skin/icons/arrow-right.svg");}
#midori-msidebar-main[expanded='true'] #midori-msidebar-expand{list-style-image:url("chrome://global/skin/icons/arrow-left.svg");}
#midori-msidebar-add{list-style-image:url("chrome://global/skin/icons/plus.svg");}
#midori-msidebar-settings{list-style-image:url("chrome://global/skin/icons/settings.svg");}
#midori-msidebar-commands{list-style-image:url("chrome://global/skin/icons/search-glass.svg");}
#midori-msidebar-nav-back{list-style-image:url("chrome://browser/skin/back.svg");}
#midori-msidebar-nav-forward{list-style-image:url("chrome://browser/skin/forward.svg");}
#midori-msidebar-nav-reload{list-style-image:url("chrome://global/skin/icons/reload.svg");}
#midori-msidebar-nav-home{list-style-image:url("chrome://browser/skin/home.svg");}
#midori-msidebar-keep-open{list-style-image:url("chrome://browser/skin/pin.svg");}
#midori-msidebar-close-panel{list-style-image:url("chrome://global/skin/icons/close.svg");}
#midori-msidebar-zoom-out{list-style-image:url("${zoomIconDataUri('out')}");}
#midori-msidebar-zoom-reset{list-style-image:url("${zoomIconDataUri('reset')}");}
#midori-msidebar-zoom-in{list-style-image:url("${zoomIconDataUri('in')}");}
#midori-msidebar-box-area{display:flex;height:100%;width:var(--midori-msidebar-width);min-width:200px;box-sizing:border-box;}
#midori-msidebar-box-area{transform:translateX(0);opacity:1;transition:width var(--midori-msidebar-open) cubic-bezier(0,0,.2,1),opacity var(--midori-msidebar-open) ease,transform var(--midori-msidebar-open) cubic-bezier(0,0,.2,1);}
#midori-msidebar-box-area[collapsed='true']{width:0;min-width:0;opacity:0;overflow:hidden;transition-duration:var(--midori-msidebar-close);transition-timing-function:cubic-bezier(.4,0,1,1);}
#midori-msidebar-box-area[collapsed='true']:not([autohide-target='true']){pointer-events:none;}
#midori-msidebar-box-area[overlay='true']{position:absolute;top:0;bottom:0;z-index:30;box-shadow:var(--content-area-shadow);}
#midori-msidebar-box-area[overlay='true'][collapsed='true']{width:var(--midori-msidebar-width);min-width:200px;pointer-events:none;}
#midori-msidebar-box-area[overlay='true'][position='left'][collapsed='true']{transform:translateX(-16px);}
#midori-msidebar-box-area[overlay='true'][position='right'][collapsed='true']{transform:translateX(16px);}
#midori-msidebar-box-area[overlay='true'][floating='true']{z-index:45;}
#midori-msidebar-box-area[overlay='true'][always-on-top='true']{z-index:2147483000;}
#midori-msidebar-box-area[overlay='true'][position='left']{left:var(--midori-msidebar-main-width);}
#midori-msidebar-box-area[overlay='true'][position='right']{right:var(--midori-msidebar-main-width);}
#midori-msidebar-box{flex:1;display:flex;flex-direction:column;background:var(--midori-msidebar-surface);color:var(--midori-msidebar-surface-text);border:0.5px solid var(--sidebar-border-color);border-radius:var(--border-radius-medium);overflow:hidden;box-sizing:border-box;}
#midori-msidebar-box-header{display:flex;align-items:center;gap:6px;padding:6px 8px;background:color-mix(in srgb,var(--midori-msidebar-surface) 92%,var(--midori-msidebar-surface-text) 8%);border-bottom:1px solid color-mix(in srgb,var(--midori-msidebar-surface-text) 14%,transparent);}
#midori-msidebar-box-title{flex:1;min-width:0;}
#midori-msidebar-box-title label{margin:0;min-width:0;max-width:100%;}
#midori-msidebar-box-toolbar{display:flex;gap:4px;}
#midori-msidebar-box-toolbar .toolbarbutton-1{min-width:28px;min-height:28px;padding:0 !important;}
#midori-msidebar-box-toolbar[autohide='true']{opacity:0;pointer-events:none;transition:opacity 140ms ease;}
#midori-msidebar-box-header:hover #midori-msidebar-box-toolbar[autohide='true'],#midori-msidebar-box-header:focus-within #midori-msidebar-box-toolbar[autohide='true']{opacity:1;pointer-events:auto;}
#midori-msidebar-browser-stack{flex:1;min-height:0;}
#midori-msidebar-splitter{cursor:e-resize;min-width:8px;width:8px;background:transparent;transition:background-color 120ms ease;}
#midori-msidebar-splitter:hover,#midori-msidebar-splitter:focus-visible{background:var(--focus-outline-color);outline:none;}

.midori-msidebar-section-label{display:none;padding:8px 8px 3px;color:color-mix(in srgb,currentColor 68%,transparent);font-size:10px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;}
#midori-msidebar-main[expanded='true'] .midori-msidebar-section-label{display:block;}
#midori-msidebar-filter{display:none;margin:2px 2px 5px;min-height:30px;padding:4px 8px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:7px;background:color-mix(in srgb,var(--midori-msidebar-surface) 92%,currentColor 8%);color:inherit;}
#midori-msidebar-main[expanded='true'] #midori-msidebar-filter[available='true']{display:block;}
#midori-msidebar-filter:focus-visible,#midori-msidebar-main .toolbarbutton-1:focus-visible,#midori-msidebar-box-toolbar .toolbarbutton-1:focus-visible{outline:2px solid var(--focus-outline-color);outline-offset:1px;}
.midori-msidebar-empty{padding:14px 8px;color:color-mix(in srgb,currentColor 70%,transparent);text-align:center;}

#midori-msidebar-panel-status{display:none;place-items:center;align-content:center;gap:8px;padding:24px;text-align:center;background:var(--midori-msidebar-surface);color:var(--midori-msidebar-surface-text);z-index:3;}
#midori-msidebar-panel-status[visible='true']:not([data-status='loading']){display:grid;}
#midori-msidebar-panel-status-title{font-weight:600;}
#midori-msidebar-panel-status-message{max-width:32ch;color:color-mix(in srgb,currentColor 72%,transparent);}
#midori-msidebar-panel-status button{min-height:32px;padding:4px 12px;}

.midori-msidebar-popup{padding:12px;min-width:300px;max-width:390px;max-height:min(640px,80vh);background:var(--midori-msidebar-popup-surface);color:var(--midori-msidebar-popup-text);}
.midori-msidebar-popup-title{font-size:15px;font-weight:600;margin:0 0 4px;}
.midori-msidebar-popup-description{color:color-mix(in srgb,currentColor 68%,transparent);margin:0 0 10px;}
.midori-msidebar-dialog button,.midori-msidebar-popup button{appearance:none;min-height:32px;padding:5px 10px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);border-radius:7px;background:color-mix(in srgb,currentColor 8%,transparent);color:inherit!important;}
.midori-msidebar-dialog button:hover,.midori-msidebar-popup button:hover{background:color-mix(in srgb,currentColor 14%,transparent);}
.midori-msidebar-dialog button[selected='true'],.midori-msidebar-dialog button[aria-selected='true']{border-color:var(--focus-outline-color);background:color-mix(in srgb,var(--focus-outline-color) 14%,transparent);}
.midori-msidebar-dialog input,.midori-msidebar-dialog textarea,.midori-msidebar-dialog menulist,.midori-msidebar-popup input{min-height:32px;padding:5px 8px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:7px;background:var(--input-bgcolor,var(--midori-msidebar-surface));color:var(--input-color,var(--midori-msidebar-surface-text));box-sizing:border-box;}
.midori-msidebar-dialog :focus-visible,.midori-msidebar-popup :focus-visible{outline:2px solid var(--focus-outline-color);outline-offset:2px;}
.midori-msidebar-settings-section{padding:10px 0;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);}
.midori-msidebar-settings-section:first-of-type{border-top:0;}
.midori-msidebar-settings-heading{font-weight:600;margin-bottom:8px;}
.midori-msidebar-settings-row{gap:8px;margin-bottom:8px;align-items:center;}
.midori-msidebar-settings-row>label{min-width:104px;}
.midori-msidebar-preset-row{display:flex;gap:6px;}
.midori-msidebar-preset-row button[selected='true']{outline:2px solid var(--focus-outline-color);}
.midori-msidebar-preset-restore{display:flex;flex-direction:column;align-items:stretch;gap:6px;margin-top:8px;padding:8px;border-radius:8px;background:color-mix(in srgb,var(--focus-outline-color) 8%,transparent);}
.midori-msidebar-preset-restore[hidden='true']{display:none;}
.midori-msidebar-preset-restore description{flex:1;margin:0;color:color-mix(in srgb,currentColor 72%,transparent);}
.midori-msidebar-preset-feedback{min-height:18px;margin-top:6px;color:color-mix(in srgb,currentColor 72%,transparent);}

#midori-msidebar-command-search{margin-bottom:8px;min-height:34px;}
.midori-msidebar-command-item{display:flex;align-items:center;justify-content:flex-start;min-height:36px;padding:5px 8px;color:inherit!important;}
.midori-msidebar-command-item[selected='true']{background:color-mix(in srgb,var(--focus-outline-color) 16%,transparent);}

@media (prefers-reduced-motion:reduce){
  :root{--midori-msidebar-open:0ms;--midori-msidebar-close:0ms;--midori-msidebar-rail-open:0ms;--midori-msidebar-rail-close:0ms;--midori-msidebar-reorder:0ms;}
  #midori-msidebar-main,#midori-msidebar-box-area,.midori-msidebar-panel-btn,#midori-msidebar-box-toolbar{transition:none!important;}
}

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
  background-color:var(--midori-msidebar-popup-surface);
  color:var(--midori-msidebar-popup-text);
  width:100%;
  min-width:0;
}

.midori-msidebar-edit-dialog{
  position:fixed;
  inset-block-start:50%;
  left:50%;
  transform:translate(-50%,-50%);
  z-index:10000;
  width:min(640px,calc(100vw - 32px));
  max-height:calc(100vh - 48px);
  overflow:hidden;
  background:var(--midori-msidebar-popup-surface);
  color:var(--midori-msidebar-popup-text);
  border:1px solid color-mix(in srgb,currentColor 18%,transparent);
  border-radius:14px;
  box-shadow:0 20px 56px color-mix(in srgb,#000 34%,transparent);
}

.midori-msidebar-edit-header{
  min-height:52px;
  padding:12px 16px 11px 20px;
  align-items:center;
  border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);
  background:color-mix(in srgb,var(--midori-msidebar-popup-surface) 96%,currentColor 4%);
}

.midori-msidebar-edit-title-wrap{gap:2px;min-width:0;}
.midori-msidebar-edit-title{font-size:15px;font-weight:650;letter-spacing:-.01em;}
.midori-msidebar-edit-subtitle{color:color-mix(in srgb,currentColor 64%,transparent);font-size:12px;}
.midori-msidebar-edit-close{list-style-image:url("chrome://global/skin/icons/close.svg");width:32px;height:32px;margin:0;padding:0!important;border-radius:7px;}

.midori-msidebar-edit-scroll{
  min-height:0;
  max-height:calc(100vh - 164px);
  overflow:auto;
  padding:18px 22px 22px;
  scrollbar-width:thin;
}

.midori-msidebar-edit-tabs{gap:16px;}

.midori-msidebar-edit-footer{
  min-height:58px;
  padding:10px 16px;
  gap:8px;
  align-items:center;
  justify-content:flex-end;
  border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);
  background:color-mix(in srgb,var(--midori-msidebar-popup-surface) 96%,currentColor 4%);
}
.midori-msidebar-edit-footer button{min-width:88px;}

#midori-msidebar-edit-sections{
  display:grid;
  grid-template-columns:repeat(3,minmax(0,1fr));
  width:100%;
  gap:4px;
  padding:4px;
  position:sticky;
  top:0;
  z-index:2;
  border-radius:10px;
  background-color:color-mix(in srgb,currentColor 7%,transparent);
  box-shadow:0 -10px 0 var(--midori-msidebar-popup-surface),0 8px 12px var(--midori-msidebar-popup-surface);
}

#midori-msidebar-edit-sections button{
  appearance:none;
  background-color:transparent;
  color:var(--midori-msidebar-popup-text);
  min-height:34px;
  padding:6px 10px;
  border:none;
  border-radius:7px;
  margin:0;
  cursor:pointer;
  transition:background-color 140ms ease,box-shadow 140ms ease;
}

#midori-msidebar-edit-sections button[selected='true']{
  background-color:var(--midori-msidebar-popup-surface);
  box-shadow:0 1px 3px color-mix(in srgb,#000 18%,transparent),inset 0 0 0 1px color-mix(in srgb,currentColor 10%,transparent);
}

#midori-msidebar-edit-sections button:hover{
  background-color:color-mix(in srgb, currentColor 8%, transparent);
}

.midori-msidebar-edit-panels{
  background-color:var(--midori-msidebar-popup-surface);
  color:var(--midori-msidebar-popup-text);
  min-width:0;
}

.midori-msidebar-edit-section{
  background-color:var(--midori-msidebar-popup-surface);
  color:var(--midori-msidebar-popup-text);
  padding:0;
  min-width:0;
  animation:midori-msidebar-edit-enter 140ms ease-out;
}

.midori-msidebar-edit-help{
  color:color-mix(in srgb,currentColor 68%,transparent);
  line-height:1.45;
  margin:0 0 2px;
  max-width:62ch;
  text-wrap:pretty;
}

.midori-msidebar-edit-content{gap:16px;min-width:0;}
.midori-msidebar-edit-group{gap:9px;padding-top:15px;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent);min-width:0;}
.midori-msidebar-edit-group:first-of-type{padding-top:4px;border-top:0;}
.midori-msidebar-edit-group-title{font-size:13px;font-weight:650;margin:0;}
.midori-msidebar-edit-group-help{color:color-mix(in srgb,currentColor 62%,transparent);font-size:12px;line-height:1.4;margin:-3px 0 2px;max-width:62ch;}

.midori-msidebar-edit-form-row{
  display:grid;
  grid-template-columns:150px minmax(0,1fr);
  align-items:center;
  gap:12px;
  min-width:0;
}

.midori-msidebar-edit-form-column{gap:6px;min-width:0;}
.midori-msidebar-edit-form-label{font-weight:600;min-width:0;}
.midori-msidebar-edit-control{width:100%;min-width:0;box-sizing:border-box;}
.midori-msidebar-edit-options{gap:7px;}
.midori-msidebar-edit-nested{gap:10px;margin-inline-start:22px;padding:10px 12px;border-radius:9px;background:color-mix(in srgb,currentColor 5%,transparent);}
.midori-msidebar-edit-geometry{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}
.midori-msidebar-edit-geometry .midori-msidebar-edit-form-row{grid-template-columns:1fr;gap:5px;}

@keyframes midori-msidebar-edit-enter{
  from{opacity:0;transform:translateY(3px);}
  to{opacity:1;transform:translateY(0);}
}

#midori-msidebar-edit-panel checkbox{
  margin:4px 0;
  -moz-user-select:none;
}

#midori-msidebar-edit-panel checkbox > label{
  color:var(--midori-msidebar-popup-text);
  margin-left:6px;
}

#midori-msidebar-edit-panel label{
  color:var(--midori-msidebar-popup-text);
}

#midori-msidebar-edit-panel input,
#midori-msidebar-edit-panel textarea{
  background-color:var(--input-bgcolor,var(--midori-msidebar-surface));
  color:var(--input-color,var(--midori-msidebar-surface-text));
  border:1px solid var(--sidebar-border-color);
  min-height:34px;
  padding:6px 9px;
  border-radius:7px;
}

#midori-msidebar-edit-panel input:focus,
#midori-msidebar-edit-panel textarea:focus{
  border-color:var(--focus-outline-color);
  outline:1px solid var(--focus-outline-color);
}
#midori-msidebar-edit-panel input[invalid='true'],
#midori-msidebar-edit-panel textarea[invalid='true']{
  border-color:#d92222;
  outline:1px solid #d92222;
}

#midori-msidebar-edit-panel menulist{
  background-color:var(--input-bgcolor,var(--midori-msidebar-surface));
  color:var(--input-color,var(--midori-msidebar-surface-text));
  border:1px solid var(--sidebar-border-color);
  min-height:34px;
  padding:4px 8px;
  border-radius:7px;
}

#midori-msidebar-edit-panel menupopup{
  background-color:var(--midori-msidebar-popup-surface);
  color:var(--midori-msidebar-popup-text);
  border:1px solid var(--sidebar-border-color);
}

#midori-msidebar-edit-panel menuitem{
  background-color:var(--midori-msidebar-popup-surface);
  color:var(--midori-msidebar-popup-text);
  padding:4px 8px;
}

#midori-msidebar-edit-panel menuitem:hover{
  background-color:var(--focus-outline-color);
}

#midori-msidebar-edit-panel button,
.midori-msidebar-edit-footer button{
  background-color:color-mix(in srgb,currentColor 8%,transparent);
  color:var(--midori-msidebar-popup-text);
  border:1px solid var(--sidebar-border-color);
  min-height:34px;
  padding:6px 12px;
  border-radius:7px;
  cursor:pointer;
  transition:background-color 140ms ease,transform 100ms ease;
}

#midori-msidebar-edit-panel button:hover,
.midori-msidebar-edit-footer button:hover{
  background-color:color-mix(in srgb,currentColor 14%,transparent);
}

#midori-msidebar-edit-panel button:active,
.midori-msidebar-edit-footer button:active{
  transform:translateY(1px);
}

.midori-msidebar-edit-dialog button:focus-visible,
.midori-msidebar-edit-dialog toolbarbutton:focus-visible,
.midori-msidebar-edit-dialog checkbox:focus-visible,
.midori-msidebar-edit-dialog menulist:focus-visible{
  outline:2px solid var(--focus-outline-color);
  outline-offset:2px;
}

#midori-msidebar-edit-panel button[data-primary='true'],
.midori-msidebar-edit-footer button[data-primary='true']{
  border-color:transparent;
  background:var(--button-background-color-primary,var(--focus-outline-color));
  color:var(--button-text-color-primary,#fff);
}

#midori-msidebar-edit-panel button[data-primary='true']:hover,
.midori-msidebar-edit-footer button[data-primary='true']:hover{
  background:var(--button-background-color-primary-hover,var(--focus-outline-color));
}

@media (max-width:680px){
  .midori-msidebar-edit-dialog{width:calc(100vw - 20px);max-height:calc(100vh - 20px);border-radius:11px;}
  .midori-msidebar-edit-scroll{max-height:calc(100vh - 136px);padding:14px 16px 18px;}
  .midori-msidebar-edit-form-row{grid-template-columns:1fr;gap:5px;}
  .midori-msidebar-edit-geometry{grid-template-columns:1fr;}
  .midori-msidebar-edit-nested{margin-inline-start:0;}
}

@media (prefers-reduced-motion:reduce){
  .midori-msidebar-edit-section{animation:none;}
  #midori-msidebar-edit-sections button,#midori-msidebar-edit-panel button{transition:none;}
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

function containerOptions() {
  const options = [{ id: 0, label: 'Contenedor predeterminado', color: '' }];
  try {
    const ids =
      lazy.ContextualIdentityService.getPublicIdentities?.()?.map((identity) => identity.userContextId) ||
      lazy.ContextualIdentityService.getUserContextIds?.() ||
      [];
    for (const id of ids) {
      const numericId = Number(id);
      if (!Number.isInteger(numericId) || numericId <= 0) continue;
      const identity = lazy.ContextualIdentityService.getPublicIdentityFromId(numericId);
      const label = identity?.name || identity?.l10nId || `Container ${numericId}`;
      options.push({ id: numericId, label, color: containerColorForUserContext(numericId) || '' });
    }
  } catch {}
  return options;
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

function faviconFallbackForPanel(_panel) {
  return defaultFaviconSpec();
}

function clampZoom(z) {
  return Math.max(0.3, Math.min(3, typeof z === 'number' ? z : 1));
}

const PANEL_NAMED_KEYS = {
  ArrowDown: { keycode: 'VK_DOWN', label: 'Down' },
  ArrowLeft: { keycode: 'VK_LEFT', label: 'Left' },
  ArrowRight: { keycode: 'VK_RIGHT', label: 'Right' },
  ArrowUp: { keycode: 'VK_UP', label: 'Up' },
  Backspace: { keycode: 'VK_BACK', label: 'Backspace' },
  Delete: { keycode: 'VK_DELETE', label: 'Delete' },
  End: { keycode: 'VK_END', label: 'End' },
  Enter: { keycode: 'VK_RETURN', label: 'Enter' },
  Escape: { keycode: 'VK_ESCAPE', label: 'Esc' },
  Home: { keycode: 'VK_HOME', label: 'Home' },
  Insert: { keycode: 'VK_INSERT', label: 'Insert' },
  PageDown: { keycode: 'VK_PAGE_DOWN', label: 'PageDown' },
  PageUp: { keycode: 'VK_PAGE_UP', label: 'PageUp' },
  Space: { keycode: 'VK_SPACE', label: 'Space' },
  Tab: { keycode: 'VK_TAB', label: 'Tab' },
};

function panelNamedKeyDefinition(key) {
  if (!key) return null;
  if (/^F([1-9]|1[0-2])$/i.test(key)) {
    const label = key.toUpperCase();
    return { keycode: `VK_${label}`, label };
  }
  return PANEL_NAMED_KEYS[key] || null;
}

function normalizePanelModifier(modifier) {
  const normalized = modifier?.trim()?.toLowerCase();
  switch (normalized) {
    case 'accel':
    case 'control':
    case 'ctrl':
      return 'Ctrl';
    case 'alt':
    case 'option':
      return 'Alt';
    case 'shift':
      return 'Shift';
    case 'cmd':
    case 'command':
    case 'meta':
      return 'Meta';
    default:
      return '';
  }
}

function normalizePanelShortcutKey(key) {
  if (!key || typeof key !== 'string') return '';
  const trimmed = key.trim();
  const named = panelNamedKeyDefinition(trimmed);
  if (named) return named.label;
  if (trimmed.length === 1) return trimmed.toUpperCase();
  return trimmed;
}

export function normalizePanelShortcut(shortcut) {
  if (!shortcut || typeof shortcut !== 'string') return '';
  const parts = shortcut
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1 && normalizePanelModifier(parts[0])) return '';
  const key = normalizePanelShortcutKey(parts.at(-1));
  if (!key) return '';
  const modifiers = new Set(parts.slice(0, -1).map(normalizePanelModifier).filter(Boolean));
  return [...['Ctrl', 'Alt', 'Shift', 'Meta'].filter((modifier) => modifiers.has(modifier)), key].join('+');
}

function panelModifierToXul(modifier) {
  switch (modifier.toLowerCase()) {
    case 'ctrl':
      return 'control';
    case 'meta':
      return 'meta';
    case 'alt':
      return 'alt';
    case 'shift':
      return 'shift';
    default:
      return modifier.toLowerCase();
  }
}

export function panelShortcutToXul(shortcut) {
  const normalized = normalizePanelShortcut(shortcut);
  if (!normalized || !isSafeGlobalShortcut(normalized)) return null;
  const parts = normalized.split('+');
  const keyLabel = parts.at(-1);
  const modifiers = parts.slice(0, -1).map(panelModifierToXul).join(',');
  const named = panelNamedKeyDefinition(keyLabel);
  if (named?.keycode) {
    return { key: '', keycode: named.keycode, modifiers };
  }
  return { key: keyLabel.toLowerCase(), keycode: '', modifiers };
}

export function panelShortcutEntries(panels) {
  const entries = [];
  const used = new Set();
  for (const panel of Array.isArray(panels) ? panels : []) {
    const shortcut = normalizePanelShortcut(panel?.shortcut || '');
    if (!panel?.id || !shortcut || isReservedBrowserShortcut(shortcut) || used.has(shortcut)) continue;
    const parsed = panelShortcutToXul(shortcut);
    if (!parsed || (!parsed.key && !parsed.keycode)) continue;
    used.add(shortcut);
    entries.push({ panelId: panel.id, shortcut, parsed });
  }
  return entries;
}

export function panelPeriodicReloadDelayMs(panel) {
  const reload = panel?.periodicReload;
  if (!reload?.enabled) return 0;
  const seconds = typeof reload.seconds === 'number' ? reload.seconds : 300;
  return Math.max(30, Math.min(86400, seconds)) * 1000;
}

export function panelDisplayTitle(panel, browserTitle = '') {
  const dynamicTitle = typeof browserTitle === 'string' ? browserTitle.trim() : '';
  if (panel?.title?.mode === 'dynamic' && dynamicTitle) {
    return dynamicTitle.slice(0, 240);
  }
  const staticTitle = typeof panel?.title?.value === 'string' ? panel.title.value.trim() : '';
  return staticTitle || safeHostname(panel?.url || '') || panel?.url || 'Panel';
}

export function panelLastUrl(store, panel) {
  if (!panel?.restoreLastUrl) return panel?.url || '';
  const safeUrl = sanitizeUrl(store?.last?.panelUrls?.[panel.id]);
  return safeUrl || panel?.url || '';
}

export function startupPanelIdForStore(store) {
  const panels = Array.isArray(store?.panels) ? store.panels : [];
  const selectedId = store?.last?.selectedPanelId;
  if (selectedId && panels.some((panel) => panel.id === selectedId && panel.loadOnStartup)) {
    return selectedId;
  }
  return panels.find((panel) => panel.loadOnStartup)?.id || null;
}

export function buildPanelSelectorScript(selector) {
  if (typeof selector !== 'string' || !selector.trim()) return '';
  const safeSelector = JSON.stringify(selector.trim().slice(0, 500));
  return `(() => {
    let target = null;
    try {
      target = document.querySelector(${safeSelector});
    } catch {
      document.documentElement.setAttribute('data-midori-msidebar-selector-invalid', ${safeSelector});
      return false;
    }
    if (!target || !document.body || !document.body.contains(target)) {
      document.documentElement.setAttribute('data-midori-msidebar-selector-miss', ${safeSelector});
      return false;
    }
    document.documentElement.setAttribute('data-midori-msidebar-selector-hit', ${safeSelector});
    const keep = new Set();
    let node = target;
    while (node && node !== document.body) {
      keep.add(node);
      node = node.parentElement;
    }
    keep.add(document.body);
    for (const parent of [...keep]) {
      for (const child of [...parent.children]) {
        if (!keep.has(child) && child.nodeName !== 'STYLE' && child.nodeName !== 'SCRIPT') {
          child.setAttribute('hidden', 'true');
        }
      }
      parent.style.margin = '0';
      parent.style.padding = '0';
      parent.style.minWidth = '0';
      parent.style.minHeight = '0';
      parent.style.overflow = parent === document.body ? 'hidden' : 'visible';
      parent.style.transform = 'none';
    }
    target.scrollIntoView({ block: 'start', inline: 'nearest' });
    window.scrollTo(0, 0);
    return true;
  })();`;
}

export function validatePanelEditInput({ url, shortcut, cssSelector } = {}) {
  return {
    url: !url || !!sanitizeUrl(url),
    shortcut: !shortcut || (!isReservedBrowserShortcut(shortcut) && !!panelShortcutToXul(shortcut)),
    cssSelector: !cssSelector || (typeof cssSelector === 'string' && cssSelector.trim().length <= 500),
  };
}

export function shouldPersistFavicon(panel, faviconUrl) {
  if (panel?.favicon?.mode === 'static') return false;
  const safeUrl = sanitizeUrl(faviconUrl);
  if (!safeUrl || safeUrl === defaultFaviconSpec()) return false;
  return safeUrl.startsWith('http') || safeUrl.startsWith('moz-extension://') || safeUrl.startsWith('file://');
}

export function buildPanelOptionsFromContext(payload = {}, resolver = resolveSidebarActionPanelForUrl) {
  const url = sanitizeUrl(payload.url);
  if (!url) return null;

  const resolved = resolver?.(url) || null;
  return {
    url: resolved?.url || url,
    title: resolved?.title || payload.title || '',
    temporary: !!payload.temporary,
    userContextId: Number.isInteger(payload.userContextId) ? payload.userContextId : 0,
    webExtensionId: resolved?.extensionId || payload.webExtensionId || '',
    faviconUrl: resolved?.iconUrl || payload.faviconUrl || '',
  };
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

export function reorderPanelsById(panels, sourcePanelId, targetPanelId) {
  if (!Array.isArray(panels)) return [];
  const next = [...panels];
  if (!sourcePanelId || !targetPanelId || sourcePanelId === targetPanelId) return next;

  const sourceIndex = next.findIndex((panel) => panel?.id === sourcePanelId);
  const targetIndex = next.findIndex((panel) => panel?.id === targetPanelId);
  if (sourceIndex === -1 || targetIndex === -1) return next;

  const [source] = next.splice(sourceIndex, 1);
  const insertAt = next.findIndex((panel) => panel?.id === targetPanelId);
  if (!source || insertAt === -1) return next;
  next.splice(insertAt, 0, source);
  return next;
}

function splitMozUrl(payload) {
  if (typeof payload !== 'string' || !payload.trim()) return null;
  const lines = payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  const [url, title] = lines;
  return {
    url,
    title: title || '',
  };
}

export function extractPanelDropPayload(dataTransfer) {
  if (!dataTransfer || typeof dataTransfer !== 'object') return null;

  const getData = (type) => {
    try {
      if (typeof dataTransfer.getData !== 'function') return '';
      return dataTransfer.getData(type) || '';
    } catch {
      return '';
    }
  };

  const mozUrl = splitMozUrl(getData('text/x-moz-url'));
  if (mozUrl?.url) return mozUrl;

  const uriList = getData('text/uri-list');
  if (uriList) {
    const line = uriList
      .split(/\r?\n/)
      .map((part) => part.trim())
      .find((part) => part && !part.startsWith('#'));
    if (line) return { url: line, title: '' };
  }

  try {
    if (typeof dataTransfer.mozGetDataAt === 'function') {
      const tab = dataTransfer.mozGetDataAt('application/x-moz-tabbrowser-tab', 0);
      const tabUrl = tab?.linkedBrowser?.currentURI?.spec || tab?.browser?.currentURI?.spec || '';
      const tabTitle = tab?.label || tab?.linkedBrowser?.contentTitle || '';
      if (tabUrl) return { url: tabUrl, title: tabTitle };
    }
  } catch {}

  const plain = getData('text/plain') || getData('text/x-moz-text-internal');
  if (plain) {
    const value = plain
      .split(/\r?\n/)
      .map((part) => part.trim())
      .find(Boolean);
    if (value) return { url: value, title: '' };
  }

  return null;
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
      openCommandPalette() {},
      destroy() {},
    };
  }

  const wrapper = createXul(doc, 'hbox');
  wrapper.id = 'midori-msidebar-wrapper';

  const main = createXul(doc, 'vbox');
  main.id = 'midori-msidebar-main';
  main.setAttribute('role', 'navigation');
  main.setAttribute('aria-label', 'Barra lateral de Midori');
  main.setAttribute('animated', 'true');
  main.setAttribute('initializing', 'true');

  const btnToggle = createXul(doc, 'toolbarbutton');
  btnToggle.id = 'midori-msidebar-toggle';
  btnToggle.classList.add('toolbarbutton-1', 'midori-msidebar-icon');
  btnToggle.setAttribute('label', 'Ocultar barra lateral');
  btnToggle.setAttribute('aria-label', 'Ocultar barra lateral');
  btnToggle.setAttribute('tooltiptext', 'Ocultar barra lateral');
  main.appendChild(btnToggle);

  const btnExpand = createXul(doc, 'toolbarbutton');
  btnExpand.id = 'midori-msidebar-expand';
  btnExpand.classList.add('toolbarbutton-1', 'midori-msidebar-icon');
  btnExpand.setAttribute('label', 'Mostrar nombres');
  btnExpand.setAttribute('aria-label', 'Mostrar nombres de los paneles');
  btnExpand.setAttribute('tooltiptext', 'Mostrar nombres de los paneles');
  btnExpand.setAttribute('aria-pressed', 'false');
  main.appendChild(btnExpand);

  const filterInput = createHtml(doc, 'input');
  filterInput.id = 'midori-msidebar-filter';
  filterInput.setAttribute('type', 'search');
  filterInput.setAttribute('placeholder', 'Buscar paneles');
  filterInput.setAttribute('aria-label', 'Buscar paneles');
  main.appendChild(filterInput);

  const btnAdd = createXul(doc, 'toolbarbutton');
  btnAdd.id = 'midori-msidebar-add';
  btnAdd.classList.add('toolbarbutton-1', 'midori-msidebar-icon');
  btnAdd.setAttribute('label', 'Añadir panel');
  btnAdd.setAttribute('aria-label', 'Agregar panel');
  btnAdd.setAttribute('tooltiptext', 'Agregar panel');

  const buttonsBox = createXul(doc, 'vbox');
  buttonsBox.id = 'midori-msidebar-buttons';
  buttonsBox.setAttribute('role', 'toolbar');
  buttonsBox.setAttribute('aria-label', 'Paneles de la barra lateral');
  buttonsBox.setAttribute('aria-orientation', 'vertical');
  main.appendChild(buttonsBox);
  main.appendChild(btnAdd);

  const spring = createXul(doc, 'spacer');
  spring.setAttribute('flex', '1');
  main.appendChild(spring);

  const btnSettings = createXul(doc, 'toolbarbutton');
  btnSettings.id = 'midori-msidebar-settings';
  btnSettings.classList.add('toolbarbutton-1', 'midori-msidebar-icon');
  btnSettings.setAttribute('label', 'Configuración');
  btnSettings.setAttribute('aria-label', 'Configuración');
  btnSettings.setAttribute('tooltiptext', 'Configuración');
  const btnCommands = createXul(doc, 'toolbarbutton');
  btnCommands.id = 'midori-msidebar-commands';
  btnCommands.classList.add('toolbarbutton-1', 'midori-msidebar-icon');
  btnCommands.setAttribute('label', 'Comandos');
  btnCommands.setAttribute('aria-label', 'Buscar paneles y acciones');
  btnCommands.setAttribute('tooltiptext', 'Buscar paneles y acciones');
  main.appendChild(btnCommands);
  main.appendChild(btnSettings);

  const boxArea = createXul(doc, 'hbox');
  boxArea.id = 'midori-msidebar-box-area';
  boxArea.setAttribute('animated', 'true');
  boxArea.setAttribute('initializing', 'true');
  boxArea.setAttribute('overlay', 'false');
  boxArea.setAttribute('position', 'left');
  boxArea.setAttribute('role', 'complementary');

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
  titleLabel.id = 'midori-msidebar-active-panel-title';
  titleLabel.setAttribute('value', '');
  titleLabel.setAttribute('crop', 'end');
  titleWrap.appendChild(titleLabel);
  boxArea.setAttribute('aria-labelledby', titleLabel.id);
  header.appendChild(titleWrap);

  const toolbar = createXul(doc, 'hbox');
  toolbar.id = 'midori-msidebar-box-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Controles del panel');
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

  const btnBack = mkTb('midori-msidebar-nav-back', 'Atrás');
  const btnForward = mkTb('midori-msidebar-nav-forward', 'Adelante');
  const btnReload = mkTb('midori-msidebar-nav-reload', 'Recargar');
  const btnHome = mkTb('midori-msidebar-nav-home', 'Abrir página inicial del panel');
  const btnKeepOpen = mkTb('midori-msidebar-keep-open', 'Mantener abierto');
  btnKeepOpen.setAttribute('type', 'checkbox');
  const btnZoomOut = mkTb('midori-msidebar-zoom-out', 'Alejar');
  const btnZoomReset = mkTb('midori-msidebar-zoom-reset', 'Restablecer zoom');
  const btnZoomIn = mkTb('midori-msidebar-zoom-in', 'Acercar');
  const btnClosePanel = mkTb('midori-msidebar-close-panel', 'Cerrar panel');
  try {
    btnZoomOut.setAttribute('image', zoomIconDataUri('out'));
    btnZoomReset.setAttribute('image', zoomIconDataUri('reset'));
    btnZoomIn.setAttribute('image', zoomIconDataUri('in'));
  } catch {}

  const stack = createXul(doc, 'stack');
  stack.id = 'midori-msidebar-browser-stack';
  stack.setAttribute('flex', '1');
  box.appendChild(stack);

  const statusBox = createXul(doc, 'vbox');
  statusBox.id = 'midori-msidebar-panel-status';
  statusBox.setAttribute('role', 'status');
  statusBox.setAttribute('aria-live', 'polite');
  const statusTitle = createXul(doc, 'label');
  statusTitle.id = 'midori-msidebar-panel-status-title';
  const statusMessage = createXul(doc, 'label');
  statusMessage.id = 'midori-msidebar-panel-status-message';
  const statusRetry = createXul(doc, 'button');
  statusRetry.setAttribute('label', 'Reintentar');
  statusRetry.setAttribute('hidden', 'true');
  statusBox.appendChild(statusTitle);
  statusBox.appendChild(statusMessage);
  statusBox.appendChild(statusRetry);
  stack.appendChild(statusBox);

  const splitter = createXul(doc, 'splitter');
  splitter.id = 'midori-msidebar-splitter';
  splitter.classList.add('chromeclass-extrachrome', 'sidebar-splitter');
  splitter.setAttribute('role', 'separator');
  splitter.setAttribute('tabindex', '0');
  splitter.setAttribute('aria-orientation', 'vertical');
  splitter.setAttribute('aria-label', 'Cambiar ancho del panel');
  splitter.setAttribute('aria-valuemin', '200');
  splitter.setAttribute('aria-valuemax', '800');

  wrapper.appendChild(main);
  wrapper.appendChild(boxArea);
  wrapper.appendChild(splitter);
  browser.appendChild(wrapper);
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
  let activeBrowserPanelId = null;
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
  const faviconQueue = [];
  const faviconQueued = new Set();
  let faviconPumpTimer = null;
  let lastFaviconFetchAt = 0;
  const selectorAppliedKeys = new Map();
  let splitterDrag = null;
  let railDragPanelId = null;
  const desktopReloadPanels = new Set();
  const panelAudioState = new Map();
  const panelNotificationCount = new Map();
  let periodicReloadTimer = null;
  let activePromptAdapter = null;
  let activeNotificationBridge = null;
  let activeAudioEventsCleanup = null;
  let railExpanded = Prefs.getRailExpanded();
  let railFilterQuery = '';
  let lastFocusedRailPanelId = null;
  const panelStatuses = new Map();

  function reducedMotionRequested() {
    try {
      return !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    } catch {
      return false;
    }
  }

  function measureMotion(name, duration) {
    if (!Prefs.getDebugEnabled() || !duration || reducedMotionRequested()) return;
    const timestamps = [];
    const startedAt = win.performance?.now?.() || Date.now();
    const sample = (timestamp) => {
      timestamps.push(timestamp);
      if (timestamp - startedAt < duration + 32) {
        win.requestAnimationFrame(sample);
        return;
      }
      const at60 = summarizeMotionFrames(timestamps, 60);
      const at120 = summarizeMotionFrames(timestamps, 120);
      try {
        Services.console.logStringMessage(
          `MidoriSidebar motion ${name}: ${at60.frames} frames, ${Math.round(at60.duration)}ms, dropped ${at60.droppedFrames}@60Hz / ${at120.droppedFrames}@120Hz`
        );
      } catch {}
    };
    win.requestAnimationFrame(sample);
  }

  function setPanelStatus(panelId, status, message = '') {
    if (!panelId) return;
    if (!status || status === 'ready') panelStatuses.delete(panelId);
    else panelStatuses.set(panelId, { status, message });
    if (panelId === activePanelId) renderActivePanelStatus();
    renderButtons();
  }

  function renderActivePanelStatus() {
    const entry = activePanelId ? panelStatuses.get(activePanelId) : null;
    const status = entry?.status || 'ready';
    const values = {
      loading: ['Cargando panel', 'El sitio se está preparando.'],
      error: ['No se pudo abrir el panel', entry?.message || 'Comprueba la conexión o vuelve a intentarlo.'],
      suspended: ['Panel suspendido', 'Se liberaron sus recursos. Reanúdalo cuando lo necesites.'],
    };
    const visibleStatus = values[status];
    setBoolAttr(statusBox, 'visible', !!visibleStatus);
    statusBox.setAttribute('data-status', status);
    if (!visibleStatus) return;
    statusTitle.setAttribute('value', visibleStatus[0]);
    statusMessage.setAttribute('value', visibleStatus[1]);
    setBoolAttr(statusRetry, 'hidden', status === 'loading');
    statusRetry.setAttribute('label', status === 'suspended' ? 'Reanudar' : 'Reintentar');
  }

  function syncRailExpansion() {
    railExpanded = Prefs.getRailExpanded();
    setBoolAttr(main, 'expanded', railExpanded);
    btnExpand.setAttribute('aria-pressed', railExpanded ? 'true' : 'false');
    btnExpand.setAttribute('label', railExpanded ? 'Ocultar nombres' : 'Mostrar nombres');
    btnExpand.setAttribute(
      'tooltiptext',
      railExpanded ? 'Ocultar nombres de los paneles' : 'Mostrar nombres de los paneles'
    );
    renderButtons();
  }

  function setSelectedPanelId(panelId) {
    if (!panelId) return;
    store.last = store.last || {};
    store.last.selectedPanelId = panelId;
  }

  function currentUrlForBrowser(browserEl) {
    try {
      const spec = browserEl?.currentURI?.spec;
      if (spec) return spec;
    } catch {}
    try {
      const spec = browserEl?.browsingContext?.currentURI?.spec;
      if (spec) return spec;
    } catch {}
    try {
      const src = browserEl?.getAttribute?.('src');
      if (src) return src;
    } catch {}
    return '';
  }

  function isPanelErrorDocument(browserEl) {
    const urls = [currentUrlForBrowser(browserEl)];
    try {
      urls.push(browserEl?.browsingContext?.currentWindowGlobal?.documentURI?.spec || '');
    } catch {}
    return urls.some((url) =>
      ['about:neterror', 'about:certerror', 'about:blocked'].some((prefix) => url.startsWith(prefix))
    );
  }

  function rememberPanelUrl(panel, browserEl = activeBrowser) {
    if (!panel?.id || !panel.restoreLastUrl) return;
    const safeUrl = sanitizeUrl(currentUrlForBrowser(browserEl));
    if (!safeUrl) return;
    store.last = store.last || {};
    store.last.panelUrls = store.last.panelUrls || {};
    if (store.last.panelUrls[panel.id] === safeUrl) return;
    store.last.panelUrls[panel.id] = safeUrl;
    onStoreChanged?.(store);
  }

  function teardownActivePanelBridges() {
    stopPeriodicReload();
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

  function stopPeriodicReload() {
    if (!periodicReloadTimer) return;
    try {
      win.clearInterval(periodicReloadTimer);
    } catch {}
    periodicReloadTimer = null;
  }

  function startPeriodicReload(panel) {
    stopPeriodicReload();
    const delayMs = panelPeriodicReloadDelayMs(panel);
    if (!delayMs) return;
    periodicReloadTimer = win.setInterval(() => {
      try {
        if (!activeBrowser || activePanelId !== panel.id) return;
        if (typeof activeBrowser.reload === 'function') {
          activeBrowser.reload();
          return;
        }
        const src = activeBrowser.getAttribute?.('src') || panel.url;
        if (src) activeBrowser.setAttribute('src', src);
      } catch {}
    }, delayMs);
  }

  function syncPanelShortcuts() {
    try {
      doc.getElementById(PANEL_KEYSET_ID)?.remove?.();
    } catch {}
    const entries = panelShortcutEntries(store.panels);
    if (!entries.length) return;
    const keyset = createXul(doc, 'keyset');
    keyset.id = PANEL_KEYSET_ID;
    for (const entry of entries) {
      const key = createXul(doc, 'key');
      key.id = `midori-msidebar-shortcut-${entry.panelId}`;
      if (entry.parsed.key) key.setAttribute('key', entry.parsed.key);
      if (entry.parsed.keycode) key.setAttribute('keycode', entry.parsed.keycode);
      if (entry.parsed.modifiers) key.setAttribute('modifiers', entry.parsed.modifiers);
      key.addEventListener(
        'command',
        (event) => {
          event.preventDefault();
          event.stopPropagation();
          Services.prefs.setBoolPref(Prefs.PREF_ENABLED, true);
          openPanelFromShortcut(entry.panelId);
        },
        true
      );
      keyset.appendChild(key);
    }
    doc.documentElement.appendChild(keyset);
  }

  function chooseVisiblePanelId() {
    const selectedId = store.last?.selectedPanelId;
    if (selectedId && store.panels.some((panel) => panel.id === selectedId)) {
      return selectedId;
    }
    return store.panels[0]?.id || null;
  }

  function openPanelFromShortcut(panelId) {
    const panel = store.panels.find((item) => item.id === panelId);
    if (!panel) return;
    panelAreaHiddenByUser = false;
    setSelectedPanelId(panel.id);
    setActivePanel(panel.id);
    setVisible(true);
  }

  function setPanelAudioState(panelId, playing) {
    if (!panelId) return;
    panelAudioState.set(panelId, !!playing);
    renderButtons();
  }

  function panelIconSpec(panel) {
    const staticFavicon = panel?.favicon?.mode === 'static' ? panel?.favicon?.value : '';
    if (typeof staticFavicon === 'string' && staticFavicon.trim()) return staticFavicon;
    const persisted = sanitizeUrl(store?.last?.favicons?.[panel?.id]);
    if (persisted) {
      faviconCache.set(panel.id, persisted);
      return persisted;
    }
    return faviconCache.get(panel?.id) || faviconFallbackForPanel(panel);
  }

  function synchronizePanelWithSidebarAction(panel) {
    if (!panel || typeof panel !== 'object') return panel;

    const resolved =
      (panel.webExtensionId
        ? resolveSidebarActionPanelForExtensionId(panel.webExtensionId)
        : null) || resolveSidebarActionPanelForUrl(panel.url);
    if (!resolved?.url) return panel;

    const next = {
      ...panel,
      webExtensionId: resolved.extensionId || panel.webExtensionId || '',
    };

    let changed = false;
    if (next.url !== resolved.url) {
      next.url = resolved.url;
      changed = true;
    }

    const currentTitle = next.title?.value || '';
    if (!currentTitle && typeof resolved.title === 'string' && resolved.title) {
      next.title = {
        mode: 'static',
        value: resolved.title.slice(0, 120),
      };
      changed = true;
    }

    if (typeof resolved.iconUrl === 'string' && resolved.iconUrl) {
      const currIcon = next.favicon?.value || '';
      if (!currIcon) {
        next.favicon = {
          mode: 'static',
          value: resolved.iconUrl,
        };
        changed = true;
      }
    }

    if (!changed) return panel;
    const updated = updatePanel(panel.id, () => next);
    return updated || next;
  }

  function buildPanelFromInput(url, title = '') {
    const safe = sanitizeUrl(url);
    if (!safe) return null;
    const panel = createPanel({
      url: safe,
      title: typeof title === 'string' ? title : '',
    });
    if (!panel) return null;
    const synced = synchronizePanelWithSidebarAction(panel);
    return synced || panel;
  }

  function createPanelFromOptions(options = {}) {
    const normalized = buildPanelOptionsFromContext(options);
    if (!normalized) return null;
    const panel = createPanel({
      url: normalized.url,
      title: normalized.title,
      userContextId: normalized.userContextId,
    });
    if (!panel) return null;
    panel.temporary = !!normalized.temporary;
    panel.pinned = options.keepOpen === undefined ? !panel.temporary : !!options.keepOpen;
    panel.unloadOnClose = options.keepAlive === false;
    panel.lifecycle = {
      mode: options.keepAlive ? 'keep-alive' : 'idle',
      idleMinutes: 15,
    };
    panel.mobile = !!options.mobile;
    panel.webExtensionId = normalized.webExtensionId || '';
    if (normalized.faviconUrl) {
      panel.favicon = {
        mode: 'static',
        value: normalized.faviconUrl,
      };
    }
    return synchronizePanelWithSidebarAction(panel) || panel;
  }

  function addPanel(options = {}) {
    const panel = createPanelFromOptions(options);
    if (!panel) return null;
    store.panels.push(panel);
    setSelectedPanelId(panel.id);
    syncPanelShortcuts();
    onStoreChanged?.(store);
    setActivePanel(panel.id);
    setVisible(true);
    return panel;
  }

  function clearRailDropTarget() {
    for (const btn of buttonsBox.querySelectorAll('[data-drop-target="true"]')) {
      btn.removeAttribute('data-drop-target');
    }
  }

  function createPanelFromDrop(event, targetPanelId = null) {
    const payload = extractPanelDropPayload(event?.dataTransfer);
    if (!payload?.url) return false;

    const panel = buildPanelFromInput(payload.url, payload.title || '');
    if (!panel) return false;

    store.panels.push(panel);
    if (targetPanelId) {
      store.panels = reorderPanelsById(store.panels, panel.id, targetPanelId);
    }
    store.last = store.last || {};
    setSelectedPanelId(panel.id);
    syncPanelShortcuts();
    onStoreChanged?.(store);
    setActivePanel(panel.id);
    return true;
  }

  function closePanel(panelId, { preserveSelection = false } = {}) {
    const idx = store.panels.findIndex((panel) => panel.id === panelId);
    if (idx === -1) return false;
    const wasActive = activePanelId === panelId;
    store.panels.splice(idx, 1);
    desktopReloadPanels.delete(panelId);
    selectorAppliedKeys.delete(panelId);
    panelAudioState.delete(panelId);
    panelNotificationCount.delete(panelId);
    panelStatuses.delete(panelId);
    faviconCache.delete(panelId);
    faviconPending.delete(panelId);
    faviconQueued.delete(panelId);
    faviconRetryAt.delete(panelId);
    for (let i = faviconQueue.length - 1; i >= 0; i--) {
      if (faviconQueue[i]?.id === panelId) faviconQueue.splice(i, 1);
    }
    try {
      delete store.last?.panelUrls?.[panelId];
      delete store.last?.favicons?.[panelId];
    } catch {}
    if (!preserveSelection && store.last?.selectedPanelId === panelId) {
      store.last.selectedPanelId = store.panels[Math.max(0, idx - 1)]?.id || store.panels[0]?.id || null;
    }
    syncPanelShortcuts();
    onStoreChanged?.(store);
    if (wasActive) setStore(store);
    else renderButtons();
    return true;
  }

  function pinTemporaryPanel(panelId) {
    const updated = updatePanel(panelId, (panel) => {
      panel.temporary = false;
      panel.pinned = true;
      return panel;
    });
    if (updated) renderButtons();
    return !!updated;
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

    if (panel?.muted && !panel?.hide?.soundIcon) {
      btn.setAttribute('data-muted', 'true');
    } else {
      btn.removeAttribute('data-muted');
    }

    if (decorations.badgeText) {
      btn.setAttribute('data-notification-badge', decorations.badgeText);
    } else {
      btn.removeAttribute('data-notification-badge');
    }
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
    setBoolAttr(main, 'collapsed', !visible);
    setBoolAttr(boxArea, 'collapsed', panelAreaHiddenByUser || !activePanelId || !_ahOpen);
    syncSplitterVisibility();
  }

  function applyDockWidth() {
    if (currentPanelFloating) return;
    let width = preferredDockWidth;
    try {
      const p = activePanelId ? store.panels.find((x) => x.id === activePanelId) : null;
      if (p && typeof p.dockWidth === 'number') width = p.dockWidth;
    } catch {}
    doc.documentElement.style.setProperty('--midori-msidebar-width', `${width}px`);
    splitter.setAttribute('aria-valuenow', String(Math.round(width)));
    splitter.setAttribute('aria-valuetext', `${Math.round(width)} píxeles`);
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
    syncPanelShortcuts();
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

  function persistPanelFavicon(panel, spec) {
    if (!panel?.id || !shouldPersistFavicon(panel, spec)) return;
    store.last = store.last || {};
    store.last.favicons = store.last.favicons || {};
    if (store.last.favicons[panel.id] === spec) return;
    store.last.favicons[panel.id] = spec;
    onStoreChanged?.(store);
  }

  function pumpFaviconQueue() {
    faviconPumpTimer = null;
    const panel = faviconQueue.shift();
    if (!panel?.id) return;
    faviconQueued.delete(panel.id);

    const now = Date.now();
    const wait = Math.max(0, FAVICON_FETCH_GAP_MS - (now - lastFaviconFetchAt));
    if (wait > 0) {
      faviconQueue.unshift(panel);
      faviconQueued.add(panel.id);
      faviconPumpTimer = win.setTimeout(pumpFaviconQueue, wait);
      return;
    }

    lastFaviconFetchAt = now;
    const pid = panel.id;
    faviconPending.add(pid);
    resolveFaviconSpecForPanel(panel).then((spec) => {
      faviconPending.delete(pid);
      const resolved = spec || defaultFaviconSpec();
      faviconCache.set(pid, resolved);
      persistPanelFavicon(panel, resolved);
      const btn = buttonsBox.querySelector(`[midori-msidebar-panel-id="${pid}"]`);
      if (btn) setPanelButtonIcon(btn, resolved);
      if (!spec || resolved === defaultFaviconSpec()) {
        faviconRetryAt.set(pid, Date.now() + 30_000);
      } else {
        faviconRetryAt.delete(pid);
      }
      if (faviconQueue.length && !faviconPumpTimer) {
        faviconPumpTimer = win.setTimeout(pumpFaviconQueue, FAVICON_FETCH_GAP_MS);
      }
    }).catch(() => {
      faviconPending.delete(pid);
      faviconRetryAt.set(pid, Date.now() + 60_000);
      if (faviconQueue.length && !faviconPumpTimer) {
        faviconPumpTimer = win.setTimeout(pumpFaviconQueue, FAVICON_FETCH_GAP_MS);
      }
    });
  }

  function ensureFavicon(panel) {
    const pid = panel?.id;
    if (!pid) return;
    if (panel?.favicon?.mode === 'static' && panel?.favicon?.value) {
      faviconCache.set(pid, panel.favicon.value);
      const btn = buttonsBox.querySelector(`[midori-msidebar-panel-id="${pid}"]`);
      if (btn) setPanelButtonIcon(btn, panel.favicon.value);
      return;
    }
    const now = Date.now();
    const nextAt = faviconRetryAt.get(pid) || 0;
    if (now < nextAt) return;
    const cached = faviconCache.get(pid);
    if (cached && cached !== defaultFaviconSpec()) return;
    const persisted = sanitizeUrl(store?.last?.favicons?.[pid]);
    if (persisted) {
      faviconCache.set(pid, persisted);
      const btn = buttonsBox.querySelector(`[midori-msidebar-panel-id="${pid}"]`);
      if (btn) setPanelButtonIcon(btn, persisted);
      return;
    }
    if (faviconPending.has(pid)) return;
    if (faviconQueued.has(pid)) return;
    faviconQueued.add(pid);
    faviconQueue.push(panel);
    if (!faviconPumpTimer) faviconPumpTimer = win.setTimeout(pumpFaviconQueue, 0);
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
      r.setAttribute('role', 'separator');
      r.setAttribute('tabindex', '0');
      r.setAttribute('aria-label', 'Cambiar tamaño del panel flotante');
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
      r.addEventListener(
        'keydown',
        (event) => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
          event.preventDefault();
          const step = event.shiftKey ? 50 : 10;
          const next = updatePanel(activePanelId, (panel) => {
            panel.floating = panel.floating || {};
            const currentWidth = panel.floating.w || panel.geometry?.width || 480;
            const currentHeight = panel.floating.h || panel.geometry?.height || 640;
            if (event.key === 'ArrowLeft') panel.floating.w = Math.max(240, currentWidth - step);
            if (event.key === 'ArrowRight') panel.floating.w = Math.min(1200, currentWidth + step);
            if (event.key === 'ArrowUp') panel.floating.h = Math.max(240, currentHeight - step);
            if (event.key === 'ArrowDown') panel.floating.h = Math.min(1200, currentHeight + step);
            panel.geometry = {
              ...(panel.geometry || {}),
              width: panel.floating.w,
              height: panel.floating.h,
            };
            return panel;
          });
          if (next) applyFloatingGeometry(next);
        },
        true
      );
      boxArea.appendChild(r);
      floatResizers.push(r);
    }
    header.style.cursor = 'move';
    header.addEventListener('mousedown', onFloatingHeaderMouseDown, true);
  }

  function clearBrowser({ status = '' } = {}) {
    teardownActivePanelBridges();
    if (activeBrowserPanelId) {
      panelAudioState.set(activeBrowserPanelId, false);
    }
    if (activeBrowser) {
      destroyBrowser(activeBrowser);
      activeBrowser = null;
    }
    activeBrowserPanelId = null;
    for (const child of [...stack.children]) {
      if (child !== statusBox) child.remove();
    }
    if (status && activePanelId) setPanelStatus(activePanelId, status);
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

  function browserTitleForPanel(browserEl) {
    try {
      const title = browserEl?.contentTitle || browserEl?.currentURI?.displaySpec || '';
      if (title) return title;
    } catch {}
    try {
      const title = browserEl?.browsingContext?.currentWindowGlobal?.documentTitle || '';
      if (title) return title;
    } catch {}
    try {
      const title = browserEl?.ownerGlobal?.gBrowser?.getTabForBrowser?.(browserEl)?.label || '';
      if (title) return title;
    } catch {}
    return '';
  }

  function updateActivePanelTitle(panel) {
    if (!panel || activePanelId !== panel.id) return;
    titleBaseText = panelDisplayTitle(panel, browserTitleForPanel(activeBrowser));
    try {
      titleLabel.setAttribute('value', titleBaseText);
    } catch {}
    renderButtons();
  }

  function applyPanelSelector(panel, browserEl) {
    if (!panel?.cssSelector?.enabled || !panel.cssSelector.value || !browserEl) return;
    const currentUrl = currentUrlForBrowser(browserEl) || panel.url || '';
    const selectorKey = `${currentUrl}\n${panel.cssSelector.value}`;
    if (selectorAppliedKeys.get(panel.id) === selectorKey) return;
    const script = buildPanelSelectorScript(panel.cssSelector.value);
    if (!script) return;
    try {
      selectorAppliedKeys.set(panel.id, selectorKey);
      const frameScript = `(() => {
        const document = content.document;
        const window = content;
        ${script}
      })();`;
      browserEl.messageManager?.loadFrameScript?.(`data:application/javascript,${encodeURIComponent(frameScript)}`, false);
      return;
    } catch {}
    try {
      selectorAppliedKeys.set(panel.id, selectorKey);
      browserEl.browsingContext?.currentWindowGlobal?.drawSnapshot;
      browserEl.loadURI?.(`javascript:${encodeURIComponent(script)}`, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
    } catch {}
  }

  function setActivePanel(panelId) {
    const sourcePanel = store.panels.find((p) => p.id === panelId);
    if (!sourcePanel) return;
    const panel = synchronizePanelWithSidebarAction(sourcePanel);
    const previousBrowserPanelId = activeBrowserPanelId;
    if (previousBrowserPanelId && previousBrowserPanelId !== panel.id) {
      setPanelStatus(previousBrowserPanelId, 'suspended', 'Reanúdalo para continuar donde estabas.');
    }
    panelAreaHiddenByUser = false;
    activePanelId = panel.id;
    currentPanelFloating = !!panel.floating?.enabled;
    setSelectedPanelId(panel.id);
    clearBrowser();
    setPanelStatus(panel.id, 'loading');
    const loadUrl = panelLastUrl(store, panel);
    const browserEl = createPanelBrowser(win, {
      ...panel,
      url: loadUrl,
      mobile: !!panel.mobile && !desktopReloadPanels.has(panel.id),
    });
    activeBrowser = browserEl;
    activeBrowserPanelId = panel.id;
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
    let loadStatusFallback = win.setTimeout(() => {
      loadStatusFallback = null;
      if (activeBrowser === browserEl && activePanelId === panel.id) {
        setPanelStatus(panel.id, 'ready');
      }
    }, 1500);
    const finishLoadingStatus = () => {
      if (!loadStatusFallback) return;
      win.clearTimeout(loadStatusFallback);
      loadStatusFallback = null;
    };
    activeBrowser.addEventListener('load', () => {
      if (activeBrowser !== browserEl || activePanelId !== panel.id) return;
      finishLoadingStatus();
      const failed = isPanelErrorDocument(browserEl);
      setPanelStatus(panel.id, failed ? 'error' : 'ready');
      syncNavButtons();
      if (failed) return;
      applyZoomToBrowser(browserEl, panel.zoom);
      syncPanelAudioFromBrowser(panel.id, browserEl);
      rememberPanelUrl(panel, browserEl);
      updateActivePanelTitle(panel);
      applyPanelSelector(panel, browserEl);
      faviconCache.delete(panel.id);
      ensureFavicon(panel);
    }, true);
    activeBrowser.addEventListener(
      'pageshow',
      () => {
        finishLoadingStatus();
        if (activeBrowser === browserEl && activePanelId === panel.id) {
          setPanelStatus(panel.id, isPanelErrorDocument(browserEl) ? 'error' : 'ready');
        }
        rememberPanelUrl(panel, browserEl);
      },
      true
    );
    activeBrowser.addEventListener('TabAttrModified', () => rememberPanelUrl(panel, activeBrowser), true);
    activeBrowser.addEventListener('DOMTitleChanged', () => updateActivePanelTitle(panel), true);
    activeBrowser.addEventListener('DOMLinkAdded', () => ensureFavicon(panel), true);
    try {
      applyMuteToBrowser(activeBrowser, panel.muted);
    } catch {}
    try {
      applyZoomToBrowser(activeBrowser, panel.zoom);
    } catch {}
    stack.appendChild(browserEl);
    stack.appendChild(statusBox);
    titleBaseText = panelDisplayTitle({ ...panel, url: loadUrl });
    titleLabel.setAttribute('value', titleBaseText);
    const semantics = panelSemantics(panel);
    btnKeepOpen.setAttribute('checked', semantics.keepOpen ? 'true' : 'false');
    btnKeepOpen.setAttribute('aria-pressed', semantics.keepOpen ? 'true' : 'false');
    setBoolAttr(toolbar, 'hidden', !!panel.hide?.toolbar);
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
    startPeriodicReload(panel);
    onStoreChanged?.(store);
  }

  function createDialogShell({ id, title, description, opener }) {
    doc.getElementById(id)?.remove?.();
    doc.getElementById(`${id}-backdrop`)?.remove?.();
    const previousFocus = opener || doc.activeElement;
    const backdrop = createXul(doc, 'vbox');
    backdrop.id = `${id}-backdrop`;
    backdrop.classList.add('midori-msidebar-dialog-backdrop');
    backdrop.setAttribute('style', 'position:fixed;inset:0;background:rgba(8,10,18,.46);z-index:9999;');

    const dialog = createXul(doc, 'vbox');
    dialog.id = id;
    dialog.classList.add('midori-msidebar-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('style', 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10000;width:min(680px,92vw);max-height:88vh;padding:18px;background:var(--midori-msidebar-popup-surface);color:var(--midori-msidebar-popup-text);border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:12px;box-shadow:0 18px 48px rgba(0,0,0,.35);gap:10px;');

    const titleId = `${id}-title`;
    const titleNode = createXul(doc, 'label');
    titleNode.id = titleId;
    titleNode.setAttribute('value', title);
    titleNode.setAttribute('style', 'font-size:18px;font-weight:650;');
    dialog.setAttribute('aria-labelledby', titleId);
    dialog.appendChild(titleNode);

    if (description) {
      const descriptionId = `${id}-description`;
      const descriptionNode = createXul(doc, 'description');
      descriptionNode.id = descriptionId;
      descriptionNode.setAttribute('style', 'max-width:58ch;color:color-mix(in srgb,currentColor 68%,transparent);');
      descriptionNode.textContent = description;
      dialog.setAttribute('aria-describedby', descriptionId);
      dialog.appendChild(descriptionNode);
    }

    const content = createXul(doc, 'vbox');
    content.setAttribute('style', 'overflow:auto;gap:10px;');
    dialog.appendChild(content);
    const footer = createXul(doc, 'hbox');
    footer.setAttribute('pack', 'end');
    footer.setAttribute('style', 'gap:8px;padding-top:10px;border-top:1px solid color-mix(in srgb,currentColor 12%,transparent);');
    dialog.appendChild(footer);

    let dirty = false;
    const focusableSelector = 'button,toolbarbutton,menulist,checkbox,input,textarea,[tabindex="0"]';
    const close = ({ force = false } = {}) => {
      if (!force && dirty) {
        const confirm = Services.prompt.confirm(win, 'Descartar cambios', 'Hay cambios sin guardar. ¿Quieres cerrar?');
        if (!confirm) return false;
      }
      dialog.removeEventListener('keydown', onKeyDown, true);
      dialog.remove();
      backdrop.remove();
      try {
        previousFocus?.focus?.();
      } catch {}
      return true;
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll(focusableSelector)].filter(
        (node) => !node.hidden && !node.disabled && node.getAttribute('hidden') !== 'true'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && doc.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && doc.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown, true);
    dialog.addEventListener('input', () => { dirty = true; }, true);
    doc.documentElement.appendChild(backdrop);
    doc.documentElement.appendChild(dialog);
    _ahPopupOpen = true;
    const originalClose = close;
    const closeAndRelease = (options) => {
      const closed = originalClose(options);
      if (closed) _ahPopupOpen = false;
      return closed;
    };
    return { dialog, content, footer, close: closeAndRelease, markClean: () => { dirty = false; } };
  }

  function currentPageCandidate() {
    try {
      const selectedBrowser = win.gBrowser?.selectedBrowser;
      const url = sanitizeUrl(selectedBrowser?.currentURI?.spec || '');
      if (!url) return null;
      return {
        url,
        title: win.gBrowser?.selectedTab?.label || selectedBrowser?.contentTitle || '',
        userContextId: Number.parseInt(win.gBrowser?.selectedTab?.getAttribute?.('usercontextid') || '0', 10) || 0,
      };
    } catch {
      return null;
    }
  }

  function openAddPanelDialog(opener = btnAdd) {
    const shell = createDialogShell({
      id: 'midori-msidebar-add-dialog',
      title: 'Añadir panel',
      description: 'Elige una página. Puedes ajustar el comportamiento ahora o cambiarlo después.',
      opener,
    });
    const { content, footer } = shell;
    const sourceRow = createXul(doc, 'hbox');
    sourceRow.setAttribute('role', 'tablist');
    sourceRow.setAttribute('style', 'gap:6px;');
    content.appendChild(sourceRow);

    const sourceButtons = new Map();
    for (const [value, label] of [['current', 'Página actual'], ['frequent', 'Frecuentes'], ['url', 'Introducir URL']]) {
      const button = createXul(doc, 'button');
      button.setAttribute('label', label);
      button.setAttribute('role', 'tab');
      button.setAttribute('data-source', value);
      sourceRow.appendChild(button);
      sourceButtons.set(value, button);
    }

    const sourceContent = createXul(doc, 'vbox');
    sourceContent.setAttribute('style', 'gap:8px;padding:10px 0;');
    content.appendChild(sourceContent);
    const errorLabel = createXul(doc, 'description');
    errorLabel.setAttribute('role', 'alert');
    errorLabel.setAttribute('style', 'color:var(--error-text-color,#d70022);min-height:18px;');
    content.appendChild(errorLabel);

    const advancedButton = createXul(doc, 'button');
    advancedButton.setAttribute('label', 'Más opciones');
    advancedButton.setAttribute('aria-expanded', 'false');
    content.appendChild(advancedButton);
    const advancedBox = createXul(doc, 'vbox');
    advancedBox.setAttribute('hidden', 'true');
    advancedBox.setAttribute('style', 'gap:8px;padding:8px 0;');
    content.appendChild(advancedBox);

    const titleInput = createHtml(doc, 'input');
    titleInput.type = 'text';
    titleInput.value = '';
    titleInput.setAttribute('placeholder', 'Nombre opcional');
    titleInput.setAttribute('aria-label', 'Nombre opcional del panel');
    const temporary = createXul(doc, 'checkbox');
    temporary.setAttribute('label', 'Temporal — se elimina al cerrar la ventana');
    const keepOpen = createXul(doc, 'checkbox');
    keepOpen.setAttribute('label', 'Mantener abierto — no se oculta automáticamente');
    keepOpen.setAttribute('checked', 'true');
    const keepAlive = createXul(doc, 'checkbox');
    keepAlive.setAttribute('label', 'Conservar activo — mantiene la sesión al cerrar la barra');
    keepAlive.setAttribute('checked', 'false');
    const mobile = createXul(doc, 'checkbox');
    mobile.setAttribute('label', 'Usar vista móvil');
    const containerMenu = createXul(doc, 'menulist');
    containerMenu.id = 'midori-msidebar-add-container';
    const containerPopup = createXul(doc, 'menupopup');
    for (const option of containerOptions()) {
      const item = createXul(doc, 'menuitem');
      item.setAttribute('label', option.label);
      item.setAttribute('value', String(option.id));
      containerPopup.appendChild(item);
    }
    containerMenu.appendChild(containerPopup);
    containerMenu.value = '0';
    const containerRow = createXul(doc, 'hbox');
    const containerLabel = createXul(doc, 'label');
    containerLabel.setAttribute('value', 'Contenedor');
    containerLabel.setAttribute('control', containerMenu.id);
    containerRow.appendChild(containerLabel);
    containerRow.appendChild(containerMenu);
    for (const node of [titleInput, temporary, keepOpen, keepAlive, mobile, containerRow]) advancedBox.appendChild(node);

    const cancelButton = createXul(doc, 'button');
    cancelButton.setAttribute('label', 'Cancelar');
    const addButton = createXul(doc, 'button');
    addButton.setAttribute('label', 'Añadir panel');
    addButton.setAttribute('disabled', 'true');
    footer.appendChild(cancelButton);
    footer.appendChild(addButton);

    const current = currentPageCandidate();
    let frequent = [];
    try {
      frequent = normalizeFrequentSites(lazy.AboutNewTab?.getTopSites?.() || []);
    } catch {}
    let selectedSource = current ? 'current' : 'url';
    let selectedCandidate = current;
    let urlInput = null;

    const validate = () => {
      const candidate = selectedSource === 'url'
        ? { url: sanitizeUrl(urlInput?.value || ''), title: titleInput.value || '' }
        : selectedCandidate;
      const valid = !!candidate?.url;
      if (selectedSource === 'url' && urlInput?.value && !valid) {
        errorLabel.textContent = 'Introduce una dirección http o https válida.';
        urlInput.setAttribute('aria-invalid', 'true');
      } else {
        errorLabel.textContent = valid ? '' : 'Selecciona una página para continuar.';
        urlInput?.removeAttribute?.('aria-invalid');
      }
      addButton.disabled = !valid;
      setBoolAttr(addButton, 'disabled', !valid);
      return valid ? candidate : null;
    };

    const selectSource = (source) => {
      selectedSource = source;
      while (sourceContent.firstChild) sourceContent.firstChild.remove();
      for (const [value, button] of sourceButtons) {
        button.setAttribute('selected', value === source ? 'true' : 'false');
        button.setAttribute('aria-selected', value === source ? 'true' : 'false');
      }
      if (source === 'current') {
        selectedCandidate = current;
        const label = createXul(doc, 'description');
        label.textContent = current
          ? `${current.title || safeHostname(current.url)} — ${current.url}`
          : 'La página actual no se puede usar como panel.';
        sourceContent.appendChild(label);
      } else if (source === 'frequent') {
        selectedCandidate = null;
        if (!frequent.length) {
          const empty = createXul(doc, 'description');
          empty.textContent = 'Todavía no hay sitios frecuentes disponibles.';
          sourceContent.appendChild(empty);
        }
        for (const site of frequent) {
          const button = createXul(doc, 'button');
          button.setAttribute('label', `${site.title} — ${safeHostname(site.url)}`);
          button.addEventListener('command', () => {
            selectedCandidate = site;
            for (const item of sourceContent.querySelectorAll('button')) item.removeAttribute('selected');
            button.setAttribute('selected', 'true');
            validate();
          }, true);
          sourceContent.appendChild(button);
        }
      } else {
        selectedCandidate = null;
        urlInput = createHtml(doc, 'input');
        urlInput.type = 'url';
        urlInput.value = '';
        urlInput.setAttribute('placeholder', 'https://ejemplo.com');
        urlInput.setAttribute('aria-label', 'Dirección del panel');
        urlInput.addEventListener('input', validate, true);
        sourceContent.appendChild(urlInput);
        win.setTimeout(() => urlInput.focus(), 0);
      }
      validate();
    };

    for (const [source, button] of sourceButtons) {
      button.addEventListener('command', () => selectSource(source), true);
    }
    advancedButton.addEventListener('command', () => {
      const expanded = advancedBox.getAttribute('hidden') === 'true';
      setBoolAttr(advancedBox, 'hidden', !expanded);
      advancedButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      advancedButton.setAttribute('label', expanded ? 'Menos opciones' : 'Más opciones');
    }, true);
    temporary.addEventListener('command', () => {
      if (temporary.checked) keepOpen.checked = false;
    }, true);
    cancelButton.addEventListener('command', () => shell.close(), true);
    addButton.addEventListener('command', () => {
      const candidate = validate();
      if (!candidate) return;
      const panel = addPanel({
        ...candidate,
        title: String(titleInput.value || '').trim() || candidate.title || '',
        temporary: !!temporary.checked,
        keepOpen: !!keepOpen.checked && !temporary.checked,
        keepAlive: !!keepAlive.checked,
        mobile: !!mobile.checked,
        userContextId: Number.parseInt(containerMenu.value || candidate.userContextId || '0', 10) || 0,
      });
      if (!panel) {
        errorLabel.textContent = 'No se pudo crear el panel. Revisa la dirección.';
        return;
      }
      shell.markClean();
      shell.close({ force: true });
    }, true);
    shell.markClean();
    selectSource(selectedSource);
    win.setTimeout(() => sourceButtons.get(selectedSource)?.focus?.(), 0);
    return shell.dialog;
  }

  function openQuickAddPanelPrompt() {
    const current = currentPageCandidate();
    const value = { value: current?.url || 'https://' };
    const accepted = Services.prompt.prompt(
      win,
      'Añadir panel',
      'Introduce la dirección del sitio:',
      value,
      null,
      { value: false }
    );
    if (!accepted) return;
    const url = sanitizeUrl(value.value || '');
    if (!url || !addPanel({ url })) {
      Services.prompt.alert(win, 'No se pudo añadir el panel', 'Introduce una dirección http o https válida.');
    }
  }

  function renderButtons() {
    while (buttonsBox.firstChild) buttonsBox.firstChild.remove();
    const selected = activePanelId;
    const indicator = Prefs.getContainerIndicator();
    const sections = panelsBySection(store.panels, railFilterQuery);
    const showFilter = store.panels.length >= 7;
    setBoolAttr(filterInput, 'available', showFilter);
    if (!sections.length) {
      const empty = createXul(doc, 'label');
      empty.classList.add('midori-msidebar-empty');
      empty.setAttribute('value', railFilterQuery ? 'No hay paneles que coincidan' : 'Aún no hay paneles');
      buttonsBox.appendChild(empty);
      return;
    }
    for (const section of sections) {
      const sectionLabel = createXul(doc, 'label');
      sectionLabel.classList.add('midori-msidebar-section-label');
      sectionLabel.setAttribute('value', section.label);
      buttonsBox.appendChild(sectionLabel);
      for (const panel of section.panels) {
      const btn = createXul(doc, 'toolbarbutton');
      btn.classList.add('toolbarbutton-1', 'midori-msidebar-icon', 'midori-msidebar-panel-btn');
      btn.setAttribute('draggable', 'true');
      const displayTitle = panelDisplayTitle(panel);
      const semantics = panelSemantics(panel);
      btn.setAttribute('label', displayTitle);
      btn.setAttribute(
        'aria-label',
        `${displayTitle}${semantics.temporary ? ', temporal' : ''}${semantics.keepOpen ? ', mantener abierto' : ''}`
      );
      btn.setAttribute('role', 'button');
      btn.setAttribute('tabindex', panel.id === (lastFocusedRailPanelId || selected || section.panels[0]?.id) ? '0' : '-1');
      const tt = tooltipTextForPanel(panel);
      if (tt) btn.setAttribute('tooltiptext', tt);
      btn.setAttribute('midori-msidebar-panel-id', panel.id);
      btn.setAttribute('container-indicator', indicator);
      if (panel.temporary) btn.setAttribute('temporary', 'true');
      if (panel.id !== selected || panelAreaHiddenByUser) btn.setAttribute('unloaded', 'true');
      const panelStatus = panelStatuses.get(panel.id)?.status;
      if (panelStatus) {
        btn.setAttribute('status', panelStatus);
        if (panelStatus === 'loading') btn.setAttribute('loading', 'true');
      }
      const cc = containerColorForUserContext(panel.userContextId);
      if (cc) btn.style.setProperty('--midori-msidebar-container-color', cc);
      setPanelButtonIcon(btn, panelIconSpec(panel));
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
          if (activePanelId === panel.id && panelAreaHiddenByUser) {
            panelAreaHiddenByUser = false;
            if (_ahTimer) { try { win.clearTimeout(_ahTimer); } catch {} _ahTimer = null; }
            if (currentPanelFloating) {
              boxArea.style.display = '';
              setBoolAttr(boxArea, 'collapsed', !visible);
            } else if (autohideEnabled) {
              applyAutohideCollapsedState(true);
            } else {
              setBoolAttr(boxArea, 'collapsed', false);
            }
            syncSplitterVisibility();
            renderButtons();
            onStoreChanged?.(store);
            return;
          }
          if (activePanelId === panel.id && !panelAreaHiddenByUser) {
            panelAreaHiddenByUser = true;
            _ahOpen = false;
            if (_ahTimer) { try { win.clearTimeout(_ahTimer); } catch {} _ahTimer = null; }
            setSelectedPanelId(panel.id);
            setBoolAttr(boxArea, 'collapsed', true);
            boxArea.style.display = '';
            syncSplitterVisibility();
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
      btn.addEventListener(
        'focus',
        () => {
          lastFocusedRailPanelId = panel.id;
          for (const item of buttonsBox.querySelectorAll('.midori-msidebar-panel-btn')) {
            item.setAttribute('tabindex', item === btn ? '0' : '-1');
          }
        },
        true
      );
      btn.addEventListener(
        'keydown',
        (event) => {
          const items = [...buttonsBox.querySelectorAll('.midori-msidebar-panel-btn')];
          const currentIndex = items.indexOf(btn);
          if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const nextIndex = nextRovingIndex(items.length, currentIndex, event.key);
            items[nextIndex]?.focus?.();
            return;
          }
          if (event.key === 'Delete') {
            event.preventDefault();
            closePanel(panel.id, { allowUndo: true });
          } else if (event.key === 'F2') {
            event.preventDefault();
            openEditPanelDialog(panel.id, btn);
          }
        },
        true
      );
      btn.addEventListener(
        'auxclick',
        (e) => {
          if (e.button !== 1 || !panel.temporary) return;
          e.preventDefault();
          e.stopPropagation();
          closePanel(panel.id);
        },
        true
      );
      btn.addEventListener(
        'dragstart',
        (e) => {
          railDragPanelId = panel.id;
          try {
            e.dataTransfer?.setData('application/x-midori-msidebar-panel-id', panel.id);
            e.dataTransfer?.setData('text/plain', panel.url || '');
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
          } catch {}
        },
        true
      );
      btn.addEventListener(
        'dragend',
        () => {
          clearRailDropTarget();
          railDragPanelId = null;
        },
        true
      );
      btn.addEventListener(
        'dragover',
        (e) => {
          const dragged = (() => {
            try {
              return e.dataTransfer?.getData('application/x-midori-msidebar-panel-id') || railDragPanelId;
            } catch {
              return railDragPanelId;
            }
          })();
          if (dragged && dragged === panel.id) return;
          e.preventDefault();
          e.stopPropagation();
          clearRailDropTarget();
          btn.setAttribute('data-drop-target', 'true');
          try {
            if (e.dataTransfer) e.dataTransfer.dropEffect = dragged ? 'move' : 'copy';
          } catch {}
        },
        true
      );
      btn.addEventListener(
        'drop',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          const dragged = (() => {
            try {
              return e.dataTransfer?.getData('application/x-midori-msidebar-panel-id') || railDragPanelId;
            } catch {
              return railDragPanelId;
            }
          })();

          if (dragged && dragged !== panel.id) {
            const reordered = reorderPanelsById(store.panels, dragged, panel.id);
            store.panels = reordered;
            syncPanelShortcuts();
            onStoreChanged?.(store);
            renderButtons();
          } else if (!dragged) {
            createPanelFromDrop(e, panel.id);
          }

          clearRailDropTarget();
          railDragPanelId = null;
        },
        true
      );
      if (panel.id === selected) btn.setAttribute('checked', 'true');
      buttonsBox.appendChild(btn);
      ensureFavicon(panel);
      }
    }
  }

  buttonsBox.addEventListener(
    'dragover',
    (e) => {
      const overPanelBtn = e.target?.closest?.('[midori-msidebar-panel-id]');
      if (overPanelBtn) return;
      e.preventDefault();
      e.stopPropagation();
      clearRailDropTarget();
      try {
        if (e.dataTransfer) e.dataTransfer.dropEffect = railDragPanelId ? 'move' : 'copy';
      } catch {}
    },
    true
  );

  buttonsBox.addEventListener(
    'drop',
    (e) => {
      const overPanelBtn = e.target?.closest?.('[midori-msidebar-panel-id]');
      if (overPanelBtn) return;
      e.preventDefault();
      e.stopPropagation();

      const dragged = (() => {
        try {
          return e.dataTransfer?.getData('application/x-midori-msidebar-panel-id') || railDragPanelId;
        } catch {
          return railDragPanelId;
        }
      })();

      if (!dragged) {
        createPanelFromDrop(e);
      }
      clearRailDropTarget();
      railDragPanelId = null;
    },
    true
  );

  function setVisible(nextVisible, { openPanel = true } = {}) {
    const wasVisible = visible;
    visible = !!nextVisible;
    if (!visible) {
      const panel = store.panels.find((item) => item.id === activePanelId);
      if (hidePanelWhenHidden || panel?.unloadOnClose) {
        clearBrowser({ status: 'suspended' });
      }
      setBoolAttr(main, 'collapsed', true);
      setBoolAttr(boxArea, 'collapsed', true);
      boxArea.style.display = '';
      setBoolAttr(splitter, 'hidden', true);
      if (wasVisible) {
        measureMotion('panel-close', motionDuration('panelClose', { reducedMotion: reducedMotionRequested(), enabled: animated }));
      }
      return;
    }
    if (activePanelId && !activeBrowser) {
      setActivePanel(activePanelId);
    }
    if (openPanel && !activePanelId) {
      const targetId = chooseVisiblePanelId();
      if (targetId) setActivePanel(targetId);
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
    if (!wasVisible) {
      measureMotion('panel-open', motionDuration('panelOpen', { reducedMotion: reducedMotionRequested(), enabled: animated }));
    }
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
    const isRTL = win.getComputedStyle(browser).direction === 'rtl';
    wrapper.style.setProperty(
      '--midori-msidebar-edge-order',
      String(computeSidebarEdgeOrder(position, isRTL))
    );
    const orderedChildren = position === 'left'
      ? [main, boxArea, splitter]
      : [splitter, boxArea, main];
    if (position === 'left') {
      splitter.setAttribute('resizebefore', 'sibling');
      splitter.setAttribute('resizeafter', 'none');
    } else {
      splitter.setAttribute('resizebefore', 'none');
      splitter.setAttribute('resizeafter', 'sibling');
    }
    for (let index = 0; index < orderedChildren.length; index++) {
      const child = orderedChildren[index];
      if (wrapper.children[index] !== child) {
        wrapper.insertBefore(child, wrapper.children[index] || null);
      }
    }
  }

  function setPosition(next) {
    position = next === 'right' ? 'right' : 'left';
    boxArea.setAttribute('position', position);
    main.setAttribute('position', position);
    splitter.setAttribute('position', position);
    applyOrder();
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
      return;
    }
    boxArea.setAttribute('autohide-target', 'true');
    if (visible) applyAutohideCollapsedState(false);
    boxArea.setAttribute('overlay', autohideMode === 'overlay' ? 'true' : 'false');
    applyDockWidth();
    syncSplitterVisibility();
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
      menuItem('Editar…', () => {
        openEditPanelDialog(panelMenuTargetId);
      })
    );
    panelMenu.appendChild(
      menuItem(target?.pinned ? 'Dejar de mantener abierto' : 'Mantener abierto', () => {
        const next = updatePanel(panelMenuTargetId, (panel) => {
          panel.pinned = !panel.pinned;
          return panel;
        });
        if (next && panelMenuTargetId === activePanelId) setActivePanel(activePanelId);
      })
    );
    if (target?.mobile) {
      panelMenu.appendChild(
        menuItem(desktopReloadPanels.has(panelMenuTargetId) ? 'Recargar como móvil' : 'Recargar como escritorio', () => {
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
    if (target?.temporary) {
      panelMenu.appendChild(
        menuItem('Convertir en panel permanente', () => {
          pinTemporaryPanel(panelMenuTargetId);
        })
      );
    }
    panelMenu.appendChild(
      menuItem(target?.floating?.enabled ? 'Acoplar al navegador' : 'Mostrar sobre la página', () => {
        const next = updatePanel(panelMenuTargetId, (p) => {
          p.floating = p.floating || {};
          p.floating.enabled = !p.floating.enabled;
          return p;
        });
        if (next && panelMenuTargetId === activePanelId) setActivePanel(activePanelId);
      })
    );
    panelMenu.appendChild(
      menuItem(target?.muted ? 'Activar audio' : 'Silenciar audio', () => {
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
      menuItem('Suspender panel', () => {
        if (panelMenuTargetId !== activePanelId) return;
        clearBrowser({ status: 'suspended' });
        syncNavButtons();
      })
    );
    panelMenu.appendChild(menuSeparator());
    panelMenu.appendChild(
      menuItem('Acercar', () => {
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
      menuItem('Alejar', () => {
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
      menuItem('Restablecer zoom', () => {
        updatePanel(panelMenuTargetId, (pp) => {
          pp.zoom = 1;
          return pp;
        });
        if (panelMenuTargetId === activePanelId && activeBrowser) applyZoomToBrowser(activeBrowser, 1);
      })
    );
    panelMenu.appendChild(
      menuItem('Restablecer posición y tamaño', () => {
        updatePanel(panelMenuTargetId, (pp) => {
          pp.geometry = { width: 480, height: 640, offsetX: 12, offsetY: 12 };
          pp.dockWidth = null;
          return pp;
        });
        if (panelMenuTargetId === activePanelId) setActivePanel(activePanelId);
      })
    );
    panelMenu.appendChild(menuSeparator());
    const targetIndex = store.panels.findIndex((panel) => panel.id === panelMenuTargetId);
    if (targetIndex > 0) {
      panelMenu.appendChild(
        menuItem('Mover arriba', () => {
          const next = [...store.panels];
          [next[targetIndex - 1], next[targetIndex]] = [next[targetIndex], next[targetIndex - 1]];
          store.panels = next;
          onStoreChanged?.(store);
          renderButtons();
        })
      );
    }
    if (targetIndex >= 0 && targetIndex < store.panels.length - 1) {
      panelMenu.appendChild(
        menuItem('Mover abajo', () => {
          const next = [...store.panels];
          [next[targetIndex], next[targetIndex + 1]] = [next[targetIndex + 1], next[targetIndex]];
          store.panels = next;
          onStoreChanged?.(store);
          renderButtons();
        })
      );
    }
    panelMenu.appendChild(
      menuItem('Eliminar', () => {
        closePanel(panelMenuTargetId);
      })
    );
    panelMenu.appendChild(
      menuItem('Abrir en una pestaña', () => {
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
  settingsPanel.classList.add('midori-msidebar-popup-panel');
  settingsPanel.setAttribute('type', 'arrow');
  settingsPanel.setAttribute('role', 'dialog');
  settingsPanel.setAttribute('aria-label', 'Configuración de la barra lateral');
  const settingsBox = createXul(doc, 'vbox');
  settingsBox.classList.add('midori-msidebar-popup');
  const settingsTitle = createXul(doc, 'label');
  settingsTitle.classList.add('midori-msidebar-popup-title');
  settingsTitle.setAttribute('value', 'Barra lateral');
  const settingsDescription = createXul(doc, 'description');
  settingsDescription.classList.add('midori-msidebar-popup-description');
  settingsDescription.textContent = 'Elige un punto de partida y ajusta sólo lo que necesites.';
  settingsBox.appendChild(settingsTitle);
  settingsBox.appendChild(settingsDescription);
  settingsPanel.appendChild(settingsBox);
  popupSet.appendChild(settingsPanel);

  function settingsSection(title) {
    const section = createXul(doc, 'vbox');
    section.classList.add('midori-msidebar-settings-section');
    const heading = createXul(doc, 'label');
    heading.classList.add('midori-msidebar-settings-heading');
    heading.setAttribute('value', title);
    section.appendChild(heading);
    settingsBox.appendChild(section);
    return section;
  }

  function markPresetCustom() {
    try {
      Services.prefs.setStringPref(Prefs.PREF_PRESET, 'custom');
    } catch {}
  }

  function checkboxRow(parent, label, prefName, defaultValue = false) {
    const row = createXul(doc, 'hbox');
    row.classList.add('midori-msidebar-settings-row');
    const cb = createXul(doc, 'checkbox');
    cb.setAttribute('label', label);
    cb.setAttribute('checked', Services.prefs.getBoolPref(prefName, defaultValue) ? 'true' : 'false');
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
          markPresetCustom();
        } catch {}
      },
      true
    );
    row.appendChild(cb);
    parent.appendChild(row);
    return cb;
  }

  function selectRow(parent, label, options, get, set) {
    const row = createXul(doc, 'hbox');
    row.classList.add('midori-msidebar-settings-row');
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
    menulist.addEventListener('command', () => {
      set(menulist.value);
      markPresetCustom();
    }, true);
    row.appendChild(menulist);
    parent.appendChild(row);
    return menulist;
  }

  function applyPreset(presetId) {
    const preset = SIDEBAR_PRESETS[presetId];
    if (!preset) return;
    if (!getPresetRestoreSnapshot()) {
      const snapshot = createPresetRestoreSnapshot({
        preset: Prefs.getPreset(),
        position: Prefs.getPosition(),
        width: Prefs.getWidth(),
        railExpanded: Prefs.getRailExpanded(),
        autohideEnabled: Prefs.getAutohideEnabled(),
        autohideMode: Prefs.getAutohideMode(),
        toolbarAutohide: Prefs.getWebPanelToolbarAutohide(),
      });
      if (snapshot) {
        Services.prefs.setStringPref(
          Prefs.PREF_PRESET_RESTORE_SNAPSHOT,
          JSON.stringify(snapshot)
        );
      }
    }
    const values = preset.prefs;
    Services.prefs.setStringPref(Prefs.PREF_POSITION, values.position);
    Services.prefs.setIntPref(Prefs.PREF_WIDTH, values.width);
    Services.prefs.setBoolPref(Prefs.PREF_RAIL_EXPANDED, values.railExpanded);
    Services.prefs.setBoolPref(Prefs.PREF_AUTOHIDE_ENABLED, values.autohideEnabled);
    Services.prefs.setStringPref(Prefs.PREF_AUTOHIDE_MODE, values.autohideMode);
    Services.prefs.setBoolPref(Prefs.PREF_WEBPANEL_TOOLBAR_AUTOHIDE, values.toolbarAutohide);
    Services.prefs.setStringPref(Prefs.PREF_PRESET, presetId);
    syncSettingsControls();
    setPresetFeedback(`Preset ${preset.label} aplicado. Puedes volver a tu configuración anterior.`);
  }

  function getPresetRestoreSnapshot() {
    return parsePresetRestoreSnapshot(Prefs.getPresetRestoreSnapshot());
  }

  function restorePresetSettings() {
    const snapshot = getPresetRestoreSnapshot();
    if (!snapshot) return false;
    const values = snapshot.prefs;
    Services.prefs.setStringPref(Prefs.PREF_POSITION, values.position);
    Services.prefs.setIntPref(Prefs.PREF_WIDTH, values.width);
    Services.prefs.setBoolPref(Prefs.PREF_RAIL_EXPANDED, values.railExpanded);
    Services.prefs.setBoolPref(Prefs.PREF_AUTOHIDE_ENABLED, values.autohideEnabled);
    Services.prefs.setStringPref(Prefs.PREF_AUTOHIDE_MODE, values.autohideMode);
    Services.prefs.setBoolPref(Prefs.PREF_WEBPANEL_TOOLBAR_AUTOHIDE, values.toolbarAutohide);
    Services.prefs.setStringPref(Prefs.PREF_PRESET, snapshot.preset);
    Services.prefs.setStringPref(Prefs.PREF_PRESET_RESTORE_SNAPSHOT, '');
    syncSettingsControls();
    setPresetFeedback('Configuración anterior restaurada. Tus paneles no cambiaron.');
    return true;
  }

  const appearanceSection = settingsSection('Apariencia');
  const presetRow = createXul(doc, 'hbox');
  presetRow.classList.add('midori-msidebar-preset-row');
  presetRow.setAttribute('aria-label', 'Presets de barra lateral');
  for (const [presetId, preset] of Object.entries(SIDEBAR_PRESETS)) {
    const button = createXul(doc, 'button');
    button.setAttribute('label', preset.label);
    button.setAttribute('data-preset', presetId);
    if (Prefs.getPreset() === presetId) button.setAttribute('selected', 'true');
    button.addEventListener('command', () => applyPreset(presetId), true);
    presetRow.appendChild(button);
  }
  appearanceSection.appendChild(presetRow);
  const presetRestoreBox = createXul(doc, 'hbox');
  presetRestoreBox.classList.add('midori-msidebar-preset-restore');
  const presetRestoreDescription = createXul(doc, 'description');
  presetRestoreDescription.textContent = 'Guardamos la configuración que tenías antes de aplicar el preset.';
  const presetRestoreButton = createXul(doc, 'button');
  presetRestoreButton.setAttribute('label', 'Restaurar configuración anterior');
  presetRestoreButton.setAttribute('aria-label', 'Restaurar configuración anterior al preset');
  presetRestoreButton.addEventListener('command', restorePresetSettings, true);
  presetRestoreBox.appendChild(presetRestoreDescription);
  presetRestoreBox.appendChild(presetRestoreButton);
  appearanceSection.appendChild(presetRestoreBox);
  const presetFeedback = createXul(doc, 'description');
  presetFeedback.classList.add('midori-msidebar-preset-feedback');
  presetFeedback.setAttribute('role', 'status');
  presetFeedback.setAttribute('aria-live', 'polite');
  appearanceSection.appendChild(presetFeedback);
  const positionSetting = selectRow(
    appearanceSection,
    'Posición',
    [
      { value: 'left', label: 'Izquierda' },
      { value: 'right', label: 'Derecha' },
    ],
    () => Prefs.getPosition(),
    (value) => Services.prefs.setStringPref(Prefs.PREF_POSITION, value)
  );
  const railExpandedSetting = checkboxRow(appearanceSection, 'Mostrar nombres de paneles', Prefs.PREF_RAIL_EXPANDED);
  const animationsSetting = checkboxRow(appearanceSection, 'Usar animaciones', Prefs.PREF_ANIMATIONS_ENABLED, true);

  const behaviorSection = settingsSection('Comportamiento');
  const autohideSetting = checkboxRow(behaviorSection, 'Ocultar automáticamente', Prefs.PREF_AUTOHIDE_ENABLED);
  const autohideModeSetting = selectRow(
    behaviorSection,
    'Apertura',
    [
      { value: 'overlay', label: 'Sobre la página' },
      { value: 'inline', label: 'Reservar espacio' },
    ],
    () => Prefs.getAutohideMode(),
    (value) => Services.prefs.setStringPref(Prefs.PREF_AUTOHIDE_MODE, value)
  );
  const suspendSetting = checkboxRow(behaviorSection, 'Suspender panel al cerrar la barra', Prefs.PREF_HIDE_PANEL_WHEN_HIDDEN, false);
  const toolbarSetting = checkboxRow(behaviorSection, 'Ocultar controles hasta usarlos', Prefs.PREF_WEBPANEL_TOOLBAR_AUTOHIDE, true);

  const advancedSection = settingsSection('Avanzado');
  const geometrySetting = checkboxRow(advancedSection, 'Mostrar medidas al redimensionar', Prefs.PREF_GEOMETRY_HINT, true);
  const containerSetting = selectRow(
    advancedSection,
    'Contenedor',
    [
      { value: 'off', label: 'Sin indicador' },
      { value: 'left', label: 'Borde izquierdo' },
      { value: 'right', label: 'Borde derecho' },
      { value: 'top', label: 'Borde superior' },
      { value: 'bottom', label: 'Borde inferior' },
      { value: 'around', label: 'Contorno' },
    ],
    () => Prefs.getContainerIndicator(),
    (value) => Services.prefs.setStringPref(Prefs.PREF_CONTAINER_INDICATOR, value)
  );
  const tooltipSetting = selectRow(
    advancedSection,
    'Tooltip',
    [
      { value: 'off', label: 'Desactivado' },
      { value: 'title', label: 'Título' },
      { value: 'url', label: 'URL' },
      { value: 'title-url', label: 'Título y URL' },
    ],
    () => Prefs.getTooltipMode(),
    (value) => Services.prefs.setStringPref(Prefs.PREF_TOOLTIP_MODE, value)
  );
  const fullUrlSetting = checkboxRow(advancedSection, 'Mostrar URL completa', Prefs.PREF_TOOLTIP_FULL_URL);

  const customizeBtn = createXul(doc, 'button');
  customizeBtn.setAttribute('label', 'Personalizar barra de herramientas…');
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
  advancedSection.appendChild(customizeBtn);

  function syncSettingsControls() {
    const preset = Prefs.getPreset();
    for (const button of presetRow.querySelectorAll('[data-preset]')) {
      setBoolAttr(button, 'selected', button.getAttribute('data-preset') === preset);
    }
    positionSetting.value = Prefs.getPosition();
    railExpandedSetting.checked = Prefs.getRailExpanded();
    animationsSetting.checked = Prefs.getAnimationsEnabled();
    autohideSetting.checked = Prefs.getAutohideEnabled();
    autohideModeSetting.value = Prefs.getAutohideMode();
    suspendSetting.checked = Prefs.getHidePanelWhenHidden();
    toolbarSetting.checked = Prefs.getWebPanelToolbarAutohide();
    geometrySetting.checked = Prefs.getGeometryHintEnabled();
    containerSetting.value = Prefs.getContainerIndicator();
    tooltipSetting.value = Prefs.getTooltipMode();
    fullUrlSetting.checked = Prefs.getTooltipFullUrl();
    setBoolAttr(presetRestoreBox, 'hidden', !getPresetRestoreSnapshot());
  }

  function setPresetFeedback(message) {
    presetFeedback.textContent = message;
  }

  btnSettings.addEventListener(
    'command',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      syncSettingsControls();
      try {
        settingsPanel.openPopup(btnSettings, 'after_end', 0, 0, false, false);
      } catch {}
    },
    true
  );

  const commandPanel = createXul(doc, 'panel');
  commandPanel.id = 'midori-msidebar-command-palette';
  commandPanel.classList.add('midori-msidebar-popup-panel');
  commandPanel.setAttribute('type', 'arrow');
  commandPanel.setAttribute('role', 'dialog');
  commandPanel.setAttribute('aria-label', 'Comandos de la barra lateral');
  const commandBox = createXul(doc, 'vbox');
  commandBox.classList.add('midori-msidebar-popup');
  const commandTitle = createXul(doc, 'label');
  commandTitle.classList.add('midori-msidebar-popup-title');
  commandTitle.setAttribute('value', 'Paneles y acciones');
  const commandSearch = createHtml(doc, 'input');
  commandSearch.id = 'midori-msidebar-command-search';
  commandSearch.setAttribute('type', 'search');
  commandSearch.setAttribute('placeholder', 'Buscar panel o acción');
  commandSearch.setAttribute('aria-label', 'Buscar panel o acción');
  const commandResults = createXul(doc, 'vbox');
  commandResults.setAttribute('role', 'listbox');
  commandResults.setAttribute('style', 'overflow:auto;max-height:420px;');
  commandBox.appendChild(commandTitle);
  commandBox.appendChild(commandSearch);
  commandBox.appendChild(commandResults);
  commandPanel.appendChild(commandBox);
  popupSet.appendChild(commandPanel);

  function commandEntries() {
    const entries = store.panels.map((panel) => ({
      id: `panel-${panel.id}`,
      label: `Abrir ${panelDisplayTitle(panel)}`,
      keywords: `${panelDisplayTitle(panel)} ${panel.url}`,
      run() {
        Services.prefs.setBoolPref(Prefs.PREF_ENABLED, true);
        panelAreaHiddenByUser = false;
        setActivePanel(panel.id);
        setVisible(true);
      },
    }));
    entries.push(
      {
        id: 'add',
        label: 'Añadir panel',
        keywords: 'nuevo crear url página actual frecuente',
        run: () => win.setTimeout(() => openAddPanelDialog(btnCommands), 0),
      },
      {
        id: 'rail',
        label: Prefs.getRailExpanded() ? 'Ocultar nombres de paneles' : 'Mostrar nombres de paneles',
        keywords: 'rail expandir contraer etiquetas',
        run() {
          Services.prefs.setBoolPref(Prefs.PREF_RAIL_EXPANDED, !Prefs.getRailExpanded());
          Services.prefs.setStringPref(Prefs.PREF_PRESET, 'custom');
        },
      },
      {
        id: 'settings',
        label: 'Configurar barra lateral',
        keywords: 'ajustes apariencia comportamiento avanzado',
        run: () => win.setTimeout(() => settingsPanel.openPopup(btnSettings, 'after_end', 0, 0, false, false), 0),
      }
    );
    if (getPresetRestoreSnapshot()) {
      entries.push({
        id: 'restore-preset',
        label: 'Restaurar configuración anterior',
        keywords: 'deshacer preset recuperar apariencia comportamiento',
        run: restorePresetSettings,
      });
    }
    if (activePanelId) {
      const panel = store.panels.find((item) => item.id === activePanelId);
      if (panel) {
        entries.push(
          {
            id: 'keep-open',
            label: panelSemantics(panel).keepOpen ? 'Dejar de mantener abierto' : 'Mantener panel abierto',
            keywords: 'fijar pin autohide',
            run() {
              updatePanel(panel.id, (next) => {
                next.pinned = !panelSemantics(next).keepOpen;
                return next;
              });
              setActivePanel(panel.id);
            },
          },
          {
            id: 'suspend',
            label: 'Suspender panel activo',
            keywords: 'descargar liberar memoria conservar activo',
            run: () => clearBrowser({ status: 'suspended' }),
          },
          {
            id: 'edit',
            label: 'Editar panel activo',
            keywords: 'general comportamiento avanzado',
            run: () => win.setTimeout(() => openEditPanelDialog(panel.id, btnCommands), 0),
          }
        );
      }
    }
    return entries;
  }

  function renderCommandEntries() {
    while (commandResults.firstChild) commandResults.firstChild.remove();
    const query = String(commandSearch.value || '').trim().toLocaleLowerCase();
    const entries = commandEntries().filter((entry) =>
      !query || `${entry.label} ${entry.keywords}`.toLocaleLowerCase().includes(query)
    );
    for (const [index, entry] of entries.entries()) {
      const button = createXul(doc, 'button');
      button.classList.add('midori-msidebar-command-item');
      button.setAttribute('label', entry.label);
      button.setAttribute('role', 'option');
      button.setAttribute('tabindex', index === 0 ? '0' : '-1');
      button.addEventListener('command', () => {
        commandPanel.hidePopup?.();
        entry.run();
      }, true);
      commandResults.appendChild(button);
    }
    if (!entries.length) {
      const empty = createXul(doc, 'description');
      empty.textContent = 'No hay resultados.';
      commandResults.appendChild(empty);
    }
  }

  function openCommandPalette(anchor = btnCommands) {
    renderCommandEntries();
    try {
      commandPanel.openPopup(anchor, 'after_end', 0, 0, false, false);
    } catch {}
    win.setTimeout(() => commandSearch.focus(), 0);
  }

  commandSearch.addEventListener('input', renderCommandEntries, true);
  commandSearch.addEventListener('keydown', (event) => {
    const items = [...commandResults.querySelectorAll('.midori-msidebar-command-item')];
    if (!items.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const current = items.indexOf(doc.activeElement);
      const next = nextRovingIndex(items.length, current < 0 ? 0 : current, event.key);
      items[next]?.focus?.();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      (items.find((item) => item.getAttribute('tabindex') === '0') || items[0])?.click?.();
    }
  }, true);
  commandResults.addEventListener('keydown', (event) => {
    const items = [...commandResults.querySelectorAll('.midori-msidebar-command-item')];
    const current = items.indexOf(doc.activeElement);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next = nextRovingIndex(items.length, current, event.key);
      for (const [index, item] of items.entries()) item.setAttribute('tabindex', index === next ? '0' : '-1');
      items[next]?.focus?.();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      commandSearch.focus();
    }
  }, true);
  commandPanel.addEventListener('popupshowing', () => { _ahPopupOpen = true; });
  commandPanel.addEventListener('popuphidden', () => {
    _ahPopupOpen = false;
    commandSearch.value = '';
  });
  btnCommands.addEventListener('command', () => openCommandPalette(btnCommands), true);

  // Prevent autohide from closing while settings popup is open
  try {
    settingsPanel.addEventListener('popupshowing', () => {
      _ahPopupOpen = true;
      syncSettingsControls();
    });
    settingsPanel.addEventListener('popuphidden', () => { _ahPopupOpen = false; });
  } catch {}

  function setAnimated(next) {
    animated = !!next && !reducedMotionRequested();
    main.setAttribute('animated', animated ? 'true' : 'false');
    boxArea.setAttribute('animated', animated ? 'true' : 'false');
    doc.documentElement.style.setProperty('--midori-msidebar-open', `${motionDuration('panelOpen', { enabled: animated })}ms`);
    doc.documentElement.style.setProperty('--midori-msidebar-close', `${motionDuration('panelClose', { enabled: animated })}ms`);
    doc.documentElement.style.setProperty('--midori-msidebar-rail-open', `${motionDuration('railOpen', { enabled: animated })}ms`);
    doc.documentElement.style.setProperty('--midori-msidebar-rail-close', `${motionDuration('railClose', { enabled: animated })}ms`);
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
    if (panelAreaHiddenByUser) return;
    if (!activePanelId) {
      const targetId = chooseVisiblePanelId();
      if (targetId) setActivePanel(targetId);
    }
    if (!activePanelId) return;
    if (_ahTimer) { try { win.clearTimeout(_ahTimer); } catch {} _ahTimer = null; }
    applyAutohideCollapsedState(true);
  }

  function _ahScheduleHide() {
    if (!_ahGuard()) return;
    if (sizing || floatingResize || floatingDrag) return;
    if (_ahPopupOpen) return;
    const panel = store.panels.find((item) => item.id === activePanelId);
    if (panelSemantics(panel).keepOpen) return;
    if (main.matches?.(':focus-within') || boxArea.matches?.(':focus-within')) return;
    if (_ahTimer) { try { win.clearTimeout(_ahTimer); } catch {} }
    _ahTimer = win.setTimeout(() => {
      _ahTimer = null;
      if (!_ahGuard()) return;
      if (sizing || floatingResize || floatingDrag) return;
      if (_ahPopupOpen) return;
      if (main.matches?.(':focus-within') || boxArea.matches?.(':focus-within')) return;
      applyAutohideCollapsedState(false);
    }, SIDEBAR_MOTION.autohideGrace);
  }

  function _ahCancelHide() {
    if (_ahTimer) { try { win.clearTimeout(_ahTimer); } catch {} _ahTimer = null; }
  }

  // main: entering shows, leaving schedules hide
  function onMainEnter() {
    _ahCancelHide();
    _ahTimer = win.setTimeout(() => {
      _ahTimer = null;
      _ahShow();
    }, SIDEBAR_MOTION.autohideIntent);
  }
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

  main.addEventListener('mouseenter', onMainEnter);
  main.addEventListener('mouseleave', onMainLeave);
  boxArea.addEventListener('mouseenter', onBoxEnter);
  boxArea.addEventListener('mouseleave', onBoxLeave);
  splitter.addEventListener('mouseenter', onSplitterEnter);
  splitter.addEventListener('mouseleave', onSplitterLeave);
  main.addEventListener('focusin', _ahShow);
  boxArea.addEventListener('focusin', _ahCancelHide);
  main.addEventListener('focusout', _ahScheduleHide);
  boxArea.addEventListener('focusout', _ahScheduleHide);

  btnToggle.addEventListener(
    'command',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      Services.prefs.setBoolPref('midori.msidebar.enabled', !Services.prefs.getBoolPref('midori.msidebar.enabled', false));
    },
    true
  );

  btnExpand.addEventListener(
    'command',
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const next = !Prefs.getRailExpanded();
      Services.prefs.setBoolPref(Prefs.PREF_RAIL_EXPANDED, next);
      Services.prefs.setStringPref(Prefs.PREF_PRESET, 'custom');
      measureMotion(
        next ? 'rail-open' : 'rail-close',
        motionDuration(next ? 'railOpen' : 'railClose', {
          reducedMotion: reducedMotionRequested(),
          enabled: animated,
        })
      );
    },
    true
  );

  filterInput.addEventListener(
    'input',
    () => {
      railFilterQuery = filterInput.value || '';
      renderButtons();
    },
    true
  );
  filterInput.addEventListener(
    'keydown',
    (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      filterInput.value = '';
      railFilterQuery = '';
      renderButtons();
      btnExpand.focus();
    },
    true
  );

  const launchAddPanelDialog = (event) => {
    if (event?.type === 'click' && event.button !== 0) return;
    const existing = doc.getElementById('midori-msidebar-add-dialog');
    if (existing) {
      existing.focus?.();
      return;
    }
    try {
      openAddPanelDialog(btnAdd);
    } catch (error) {
      try {
        console.error('MidoriSidebar: no se pudo abrir Añadir panel', error);
      } catch {}
      openQuickAddPanelPrompt();
    }
  };
  btnAdd.addEventListener('click', launchAddPanelDialog, true);
  btnAdd.addEventListener('command', launchAddPanelDialog, true);

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
  btnKeepOpen.addEventListener('command', () => {
    if (!activePanelId) return;
    const next = updatePanel(activePanelId, (panel) => {
      panel.pinned = !panelSemantics(panel).keepOpen;
      return panel;
    });
    if (!next) return;
    btnKeepOpen.setAttribute('checked', next.pinned ? 'true' : 'false');
    btnKeepOpen.setAttribute('aria-pressed', next.pinned ? 'true' : 'false');
    renderButtons();
  }, true);
  btnClosePanel.addEventListener('command', () => {
    if (!activePanelId) return;
    panelAreaHiddenByUser = true;
    setBoolAttr(boxArea, 'collapsed', true);
    syncSplitterVisibility();
    renderButtons();
  }, true);
  statusRetry.addEventListener('command', () => {
    if (activePanelId) setActivePanel(activePanelId);
  }, true);

  splitter.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
    event.preventDefault();
    const panel = store.panels.find((item) => item.id === activePanelId);
    const current = panel?.dockWidth || preferredDockWidth;
    const direction = position === 'right' ? -1 : 1;
    const step = event.shiftKey ? 50 : 10;
    const next = event.key === 'Home'
      ? Prefs.getWidth()
      : current + (event.key === 'ArrowRight' ? step : -step) * direction;
    const width = Math.min(800, Math.max(200, next));
    preferredDockWidth = width;
    if (panel) {
      updatePanel(panel.id, (value) => {
        value.dockWidth = width;
        return value;
      });
    }
    applyDockWidth();
    splitter.setAttribute('aria-valuenow', String(width));
    splitter.setAttribute('aria-valuetext', `${width} píxeles`);
  }, true);

  function setStore(next) {
    const previousActivePanelId = activePanelId;
    store = next || { panels: [], last: {} };
    for (const id of [...desktopReloadPanels]) {
      if (!store.panels.some((panel) => panel.id === id && panel.mobile)) {
        desktopReloadPanels.delete(id);
      }
    }
    syncToolbarPrefs();
    syncPanelShortcuts();
    const targetId = previousActivePanelId || (visible ? chooseVisiblePanelId() : null);
    if (targetId && store.panels.some((panel) => panel.id === targetId)) {
      setActivePanel(targetId);
    } else {
      hidePanelArea();
      renderButtons();
    }
  }

  function openEditPanelDialog(panelId, opener = doc.activeElement) {
    const panel = store.panels.find((p) => p.id === panelId);
    if (!panel) return;
    doc.getElementById('midori-msidebar-edit-dialog-wrapper')?.remove?.();
    doc.getElementById('midori-msidebar-edit-dialog-backdrop')?.remove?.();
    const previousFocus = opener || doc.activeElement;

    // Use a vbox container that will act as a lightweight dialog
    const dlgWrapper = createXul(doc, 'vbox');
    dlgWrapper.id = 'midori-msidebar-edit-dialog-wrapper';
    dlgWrapper.classList.add('midori-msidebar-edit-dialog');
    dlgWrapper.setAttribute('role', 'dialog');
    dlgWrapper.setAttribute('aria-modal', 'true');

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
    doc.documentElement.appendChild(backdrop);

    // Title bar
    const titleBar = createXul(doc, 'hbox');
    titleBar.classList.add('midori-msidebar-edit-header');
    const titleWrap = createXul(doc, 'vbox');
    titleWrap.classList.add('midori-msidebar-edit-title-wrap');
    titleWrap.setAttribute('flex', '1');
    const titleLabel = createXul(doc, 'label');
    titleLabel.id = 'midori-msidebar-edit-dialog-title';
    titleLabel.classList.add('midori-msidebar-edit-title');
    titleLabel.setAttribute('value', 'Editar panel');
    const titleSubtitle = createXul(doc, 'label');
    titleSubtitle.classList.add('midori-msidebar-edit-subtitle');
    titleSubtitle.setAttribute('value', panelDisplayTitle(panel));
    titleSubtitle.setAttribute('crop', 'end');
    dlgWrapper.setAttribute('aria-labelledby', titleLabel.id);
    titleWrap.appendChild(titleLabel);
    titleWrap.appendChild(titleSubtitle);
    titleBar.appendChild(titleWrap);
    const btnCloseEditor = createXul(doc, 'toolbarbutton');
    btnCloseEditor.classList.add('toolbarbutton-1', 'midori-msidebar-edit-close');
    btnCloseEditor.setAttribute('aria-label', 'Cerrar editor');
    btnCloseEditor.setAttribute('tooltiptext', 'Cerrar editor');
    titleBar.appendChild(btnCloseEditor);
    dlgWrapper.appendChild(titleBar);

    // Scroll container for content
    const scrollBox = createXul(doc, 'scrollbox');
    scrollBox.classList.add('midori-msidebar-edit-scroll');
    dlgWrapper.appendChild(scrollBox);

    const dlg = createXul(doc, 'vbox');
    dlg.id = 'midori-msidebar-edit-panel';
    scrollBox.appendChild(dlg);

    const tabs = createXul(doc, 'vbox');
    tabs.classList.add('midori-msidebar-edit-tabs');
    const tabstrip = createXul(doc, 'hbox');
    tabstrip.id = 'midori-msidebar-edit-sections';
    tabstrip.setAttribute('role', 'tablist');
    tabs.appendChild(tabstrip);

    const tabpanels = createXul(doc, 'vbox');
    tabpanels.classList.add('midori-msidebar-edit-panels');
    tabs.appendChild(tabpanels);

    let editTabCounter = 0;
    function mkTab(label) {
      const index = editTabCounter++;
      const tab = createXul(doc, 'button');
      tab.setAttribute('label', label);
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      tab.setAttribute('selected', index === 0 ? 'true' : 'false');
      tab.setAttribute('tabindex', index === 0 ? '0' : '-1');
      tabstrip.appendChild(tab);

      const panel = createXul(doc, 'vbox');
      panel.id = `midori-msidebar-edit-tabpanel-${panelId}-${index}`;
      panel.classList.add('midori-msidebar-edit-section');
      tab.setAttribute('aria-controls', panel.id);
      setBoolAttr(panel, 'hidden', index !== 0);
      tabpanels.appendChild(panel);

      const content = createXul(doc, 'vbox');
      content.classList.add('midori-msidebar-edit-content');
      panel.appendChild(content);
      const selectTab = () => {
        for (const [buttonIndex, button] of [...tabstrip.children].entries()) {
          const selected = buttonIndex === index;
          button.setAttribute('selected', selected ? 'true' : 'false');
          button.setAttribute('aria-selected', selected ? 'true' : 'false');
          button.setAttribute('tabindex', selected ? '0' : '-1');
          setBoolAttr(tabpanels.children[buttonIndex], 'hidden', !selected);
        }
        scrollBox.scrollTop = 0;
      };
      tab.addEventListener('click', selectTab, true);
      tab.addEventListener('command', selectTab, true);
      return content;
    }

    tabstrip.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const items = [...tabstrip.children];
      const current = Math.max(0, items.indexOf(doc.activeElement));
      const next = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? items.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
      event.preventDefault();
      items[next]?.focus?.();
      items[next]?.click?.();
    }, true);

    // Helper: Create form row
    let editControlCounter = 0;
    function formRow(label, control) {
      const hbox = createXul(doc, 'hbox');
      hbox.classList.add('midori-msidebar-edit-form-row');
      const lbl = createXul(doc, 'label');
      lbl.classList.add('midori-msidebar-edit-form-label');
      lbl.setAttribute('value', label);
      if (!control.id) control.id = `midori-msidebar-edit-control-${editControlCounter++}`;
      control.classList.add('midori-msidebar-edit-control');
      lbl.setAttribute('control', control.id);
      hbox.appendChild(lbl);
      hbox.appendChild(control);
      return hbox;
    }

    function formColumn(label, control) {
      const box = createXul(doc, 'vbox');
      box.classList.add('midori-msidebar-edit-form-column');
      const lbl = createXul(doc, 'label');
      lbl.classList.add('midori-msidebar-edit-form-label');
      lbl.setAttribute('value', label);
      if (!control.id) control.id = `midori-msidebar-edit-control-${editControlCounter++}`;
      control.classList.add('midori-msidebar-edit-control');
      lbl.setAttribute('control', control.id);
      box.appendChild(lbl);
      box.appendChild(control);
      return box;
    }

    function editGroup(parent, title, help = '') {
      const group = createXul(doc, 'vbox');
      group.classList.add('midori-msidebar-edit-group');
      const heading = createXul(doc, 'label');
      heading.classList.add('midori-msidebar-edit-group-title');
      heading.setAttribute('value', title);
      group.appendChild(heading);
      if (help) {
        const description = createXul(doc, 'description');
        description.classList.add('midori-msidebar-edit-group-help');
        description.textContent = help;
        group.appendChild(description);
      }
      parent.appendChild(group);
      return group;
    }

    // TAB 1: General
    const pnGeneral = mkTab('General');
    {
      const generalHelp = createXul(doc, 'description');
      generalHelp.classList.add('midori-msidebar-edit-help');
      generalHelp.textContent = 'Cambia la dirección, el nombre y cómo se conserva este panel.';
      pnGeneral.appendChild(generalHelp);
      const pageGroup = editGroup(pnGeneral, 'Página');

      const txtUrl = createHtml(doc, 'input');
      txtUrl.type = 'url';
      txtUrl.value = panel.url || '';
      txtUrl.setAttribute('placeholder', 'https://ejemplo.com');
      pageGroup.appendChild(formRow('Dirección', txtUrl));

      const chkPinned = createXul(doc, 'checkbox');
      chkPinned.setAttribute('label', 'Mantener abierto — evita que se oculte automáticamente');
      chkPinned.setAttribute('checked', panel.pinned ? 'true' : 'false');

      const uaMenu = createXul(doc, 'menulist');
      uaMenu.setAttribute('style', 'min-width: 240px;');
      const uaPopup = createXul(doc, 'menupopup');
      for (const opt of [
        { label: 'Escritorio', value: 'desktop' },
        { label: 'Móvil', value: 'mobile' },
      ]) {
        const mi = createXul(doc, 'menuitem');
        mi.setAttribute('label', opt.label);
        mi.setAttribute('value', opt.value);
        uaPopup.appendChild(mi);
      }
      uaMenu.appendChild(uaPopup);
      uaMenu.value = panel.mobile ? 'mobile' : 'desktop';
      pageGroup.appendChild(formRow('Vista', uaMenu));

      const containerMenu = createXul(doc, 'menulist');
      containerMenu.setAttribute('style', 'min-width: 240px;');
      const containerPopup = createXul(doc, 'menupopup');
      for (const opt of containerOptions()) {
        const mi = createXul(doc, 'menuitem');
        mi.setAttribute('label', opt.label);
        mi.setAttribute('value', String(opt.id));
        if (opt.color) mi.style.setProperty('--midori-msidebar-container-color', opt.color);
        containerPopup.appendChild(mi);
      }
      containerMenu.appendChild(containerPopup);
      containerMenu.value = String(panel.userContextId || 0);
      pageGroup.appendChild(formRow('Contenedor', containerMenu));

      const lifetimeGroup = editGroup(
        pnGeneral,
        'Al cerrar la barra',
        'Elige si el panel permanece disponible y si conserva la página abierta.'
      );
      lifetimeGroup.classList.add('midori-msidebar-edit-options');
      lifetimeGroup.appendChild(chkPinned);

      const chkTemporary = createXul(doc, 'checkbox');
      chkTemporary.setAttribute('label', 'Temporal — se elimina al cerrar la ventana');
      chkTemporary.setAttribute('checked', panel.temporary ? 'true' : 'false');
      lifetimeGroup.appendChild(chkTemporary);

      const chkKeepAlive = createXul(doc, 'checkbox');
      chkKeepAlive.setAttribute('label', 'Conservar activo — mantiene la sesión al cerrar la barra');
      chkKeepAlive.setAttribute('checked', panel.unloadOnClose ? 'false' : 'true');
      lifetimeGroup.appendChild(chkKeepAlive);

      const chkRestoreLast = createXul(doc, 'checkbox');
      chkRestoreLast.setAttribute('label', 'Volver a la última página visitada');
      chkRestoreLast.setAttribute('checked', panel.restoreLastUrl ? 'true' : 'false');
      lifetimeGroup.appendChild(chkRestoreLast);

      const chkMuted = createXul(doc, 'checkbox');
      chkMuted.setAttribute('label', 'Silenciar audio');
      chkMuted.setAttribute('checked', panel.muted ? 'true' : 'false');
      lifetimeGroup.appendChild(chkMuted);

      const syncPanelLifetime = () => {
        if (chkTemporary.checked) chkPinned.checked = false;
        setBoolAttr(chkPinned, 'disabled', !!chkTemporary.checked);
      };
      chkTemporary.addEventListener('command', syncPanelLifetime, true);
      chkPinned.addEventListener('command', () => {
        if (chkPinned.checked) chkTemporary.checked = false;
        syncPanelLifetime();
      }, true);
      syncPanelLifetime();

      pnGeneral._controls = { txtUrl, chkPinned, uaMenu, containerMenu, chkTemporary, chkKeepAlive, chkRestoreLast, chkMuted };
    }

    const pnTitleFavicon = editGroup(
      pnGeneral,
      'Identidad',
      'Usa el título y el icono del sitio o reemplázalos para reconocer el panel más rápido.'
    );
    {
      const titleModeMenu = createXul(doc, 'menulist');
      const titleModePopup = createXul(doc, 'menupopup');
      for (const opt of [
        { label: 'Usar título de la página', value: 'dynamic' },
        { label: 'Nombre personalizado', value: 'static' },
      ]) {
        const mi = createXul(doc, 'menuitem');
        mi.setAttribute('label', opt.label);
        mi.setAttribute('value', opt.value);
        titleModePopup.appendChild(mi);
      }
      titleModeMenu.appendChild(titleModePopup);
      titleModeMenu.value = panel.title?.mode === 'static' ? 'static' : 'dynamic';
      pnTitleFavicon.appendChild(formRow('Nombre del panel', titleModeMenu));

      const txtTitle = createHtml(doc, 'input');
      txtTitle.type = 'text';
      txtTitle.value = panel.title?.value || '';
      txtTitle.setAttribute('placeholder', 'Escribe un nombre');
      const titleValueRow = formRow('Nombre personalizado', txtTitle);
      pnTitleFavicon.appendChild(titleValueRow);

      const favModeMenu = createXul(doc, 'menulist');
      const favModePopup = createXul(doc, 'menupopup');
      for (const opt of [
        { label: 'Usar icono de la página', value: 'dynamic' },
        { label: 'Icono personalizado', value: 'static' },
      ]) {
        const mi = createXul(doc, 'menuitem');
        mi.setAttribute('label', opt.label);
        mi.setAttribute('value', opt.value);
        favModePopup.appendChild(mi);
      }
      favModeMenu.appendChild(favModePopup);
      favModeMenu.value = panel.favicon?.mode === 'static' ? 'static' : 'dynamic';
      pnTitleFavicon.appendChild(formRow('Icono del panel', favModeMenu));

      const txtFavicon = createHtml(doc, 'input');
      txtFavicon.type = 'url';
      txtFavicon.value = panel.favicon?.value || '';
      txtFavicon.setAttribute('placeholder', 'https://ejemplo.com/icono.png');
      const faviconValueRow = formRow('URL del icono', txtFavicon);
      pnTitleFavicon.appendChild(faviconValueRow);

      pnTitleFavicon._controls = {
        txtTitle,
        titleModeMenu,
        titleValueRow,
        txtFavicon,
        favModeMenu,
        faviconValueRow,
      };
    }

    const pnPosition = mkTab('Comportamiento');
    {
      const behaviorHelp = createXul(doc, 'description');
      behaviorHelp.classList.add('midori-msidebar-edit-help');
      behaviorHelp.textContent = 'El panel se muestra acoplado a la barra. Activa el modo flotante sólo si quieres colocarlo encima de la página.';
      pnPosition.appendChild(behaviorHelp);
      const floatingGroup = editGroup(pnPosition, 'Panel flotante');

      const chkFloating = createXul(doc, 'checkbox');
      chkFloating.setAttribute('label', 'Usar como panel flotante');
      chkFloating.setAttribute('checked', panel.floating?.enabled ? 'true' : 'false');
      floatingGroup.appendChild(chkFloating);

      const floatingDetails = createXul(doc, 'vbox');
      floatingDetails.classList.add('midori-msidebar-edit-nested');
      floatingGroup.appendChild(floatingDetails);

      const chkAlwaysOnTop = createXul(doc, 'checkbox');
      chkAlwaysOnTop.setAttribute('label', 'Mantener visible sobre el contenido');
      chkAlwaysOnTop.setAttribute('checked', panel.floating?.alwaysOnTop ? 'true' : 'false');
      floatingDetails.appendChild(chkAlwaysOnTop);

      const anchorOptions = [
        { label: 'Superior izquierda', value: 'tl' },
        { label: 'Superior derecha', value: 'tr' },
        { label: 'Inferior izquierda', value: 'bl' },
        { label: 'Inferior derecha', value: 'br' },
        { label: 'Centro', value: 'center' },
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
      floatingDetails.appendChild(formRow('Posición', anchorMenu));

      const geometryButton = createXul(doc, 'button');
      geometryButton.setAttribute('label', 'Ajustar posición y tamaño');
      geometryButton.setAttribute('aria-expanded', 'false');
      floatingDetails.appendChild(geometryButton);
      const geometryBox = createXul(doc, 'vbox');
      geometryBox.setAttribute('hidden', 'true');
      geometryBox.classList.add('midori-msidebar-edit-geometry');
      floatingDetails.appendChild(geometryBox);

      const txtX = createHtml(doc, 'input');
      txtX.value = String(panel.floating?.x ?? 0);
      txtX.type = 'number';
      geometryBox.appendChild(formRow('Desplazamiento horizontal', txtX));

      const txtY = createHtml(doc, 'input');
      txtY.value = String(panel.floating?.y ?? 0);
      txtY.type = 'number';
      geometryBox.appendChild(formRow('Desplazamiento vertical', txtY));

      const txtW = createHtml(doc, 'input');
      txtW.value = String(panel.floating?.w ?? 480);
      txtW.type = 'number';
      geometryBox.appendChild(formRow('Ancho', txtW));

      const txtH = createHtml(doc, 'input');
      txtH.value = String(panel.floating?.h ?? 640);
      txtH.type = 'number';
      geometryBox.appendChild(formRow('Alto', txtH));

      geometryButton.addEventListener('click', () => {
        const expanded = geometryBox.getAttribute('hidden') === 'true';
        setBoolAttr(geometryBox, 'hidden', !expanded);
        geometryButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        geometryButton.setAttribute('label', expanded ? 'Ocultar posición y tamaño' : 'Ajustar posición y tamaño');
      }, true);

      const syncFloatingControls = () => {
        const enabled = !!chkFloating.checked;
        setBoolAttr(floatingDetails, 'hidden', !enabled);
      };
      chkFloating.addEventListener('command', syncFloatingControls, true);
      syncFloatingControls();

      pnPosition._controls = { chkFloating, chkAlwaysOnTop, anchorMenu, txtX, txtY, txtW, txtH };
    }

    const pnLoading = editGroup(
      pnPosition,
      'Actualización automática',
      'Úsala sólo si el sitio no actualiza su contenido por sí mismo.'
    );
    {
      const chkPeriodicReload = createXul(doc, 'checkbox');
      chkPeriodicReload.setAttribute('label', 'Recargar este panel automáticamente');
      chkPeriodicReload.setAttribute('checked', panel.periodicReload?.enabled ? 'true' : 'false');
      pnLoading.appendChild(chkPeriodicReload);

      const txtReloadSecs = createHtml(doc, 'input');
      txtReloadSecs.value = String(Math.max(30, panel.periodicReload?.seconds || 300));
      txtReloadSecs.type = 'number';
      txtReloadSecs.setAttribute('min', '30');
      const reloadRow = formRow('Cada cuántos segundos', txtReloadSecs);
      pnLoading.appendChild(reloadRow);

      const syncReloadControls = () => {
        setBoolAttr(reloadRow, 'hidden', !chkPeriodicReload.checked);
      };
      chkPeriodicReload.addEventListener('command', syncReloadControls, true);
      syncReloadControls();

      pnLoading._controls = { chkPeriodicReload, txtReloadSecs };
    }

    const pnShortcut = mkTab('Avanzado');
    {
      const advancedHelp = createXul(doc, 'description');
      advancedHelp.classList.add('midori-msidebar-edit-help');
      advancedHelp.textContent = 'Opciones para atajos y sitios que necesitan una vista personalizada. Puedes dejarlas sin cambiar.';
      pnShortcut.appendChild(advancedHelp);
      const shortcutGroup = editGroup(pnShortcut, 'Acceso rápido');

      const txtShortcut = createHtml(doc, 'input');
      txtShortcut.type = 'text';
      txtShortcut.value = panel.shortcut || '';
      txtShortcut.setAttribute('placeholder', 'Por ejemplo: Ctrl+Mayús+E');
      shortcutGroup.appendChild(formRow('Atajo de teclado', txtShortcut));

      pnShortcut._controls = { txtShortcut };
    }

    const pnCSS = editGroup(
      pnShortcut,
      'Contenido del sitio',
      'Limita el panel a una zona concreta sólo cuando el sitio lo necesite.'
    );
    {
      const chkCssEnabled = createXul(doc, 'checkbox');
      chkCssEnabled.setAttribute('label', 'Elegir contenido mediante un selector CSS');
      chkCssEnabled.setAttribute('checked', panel.cssSelector?.enabled ? 'true' : 'false');
      pnCSS.appendChild(chkCssEnabled);

      const txtCss = createHtml(doc, 'textarea');
      txtCss.value = panel.cssSelector?.value || '';
      txtCss.setAttribute('rows', '5');
      txtCss.setAttribute('style', 'font-family:monospace;resize:vertical;min-height:104px;');
      const cssRow = formColumn('Selector CSS', txtCss);
      const cssHelp = createXul(doc, 'description');
      cssHelp.classList.add('midori-msidebar-edit-help');
      cssHelp.textContent = 'Sólo para usuarios que conocen la estructura CSS del sitio. Un selector incorrecto puede ocultar todo el contenido.';
      cssRow.insertBefore(cssHelp, txtCss);
      pnCSS.appendChild(cssRow);

      pnCSS._controls = { chkCssEnabled, txtCss, cssRow };
    }

    const pnHide = editGroup(
      pnShortcut,
      'Controles visibles',
      'Oculta únicamente los elementos que no necesitas en este panel.'
    );
    pnHide.classList.add('midori-msidebar-edit-options');
    {
      const chkHideToolbar = createXul(doc, 'checkbox');
      chkHideToolbar.setAttribute('label', 'Ocultar controles del panel');
      chkHideToolbar.setAttribute('checked', panel.hide?.toolbar ? 'true' : 'false');
      pnHide.appendChild(chkHideToolbar);

      const chkHideSoundIcon = createXul(doc, 'checkbox');
      chkHideSoundIcon.setAttribute('label', 'Ocultar indicador de sonido');
      chkHideSoundIcon.setAttribute('checked', panel.hide?.soundIcon ? 'true' : 'false');
      pnHide.appendChild(chkHideSoundIcon);

      const chkHideNotifBadge = createXul(doc, 'checkbox');
      chkHideNotifBadge.setAttribute('label', 'Ocultar contador de notificaciones');
      chkHideNotifBadge.setAttribute('checked', panel.hide?.notificationBadge ? 'true' : 'false');
      pnHide.appendChild(chkHideNotifBadge);

      pnHide._controls = { chkHideToolbar, chkHideSoundIcon, chkHideNotifBadge };
    }

    function syncEditorValidation() {
      const tf = pnTitleFavicon._controls;
      const general = pnGeneral._controls;
      const sc = pnShortcut._controls;
      const cs = pnCSS._controls;
      const values = {
        url: general.txtUrl.value,
        shortcut: sc.txtShortcut.value,
        cssSelector: cs.chkCssEnabled.checked ? cs.txtCss.value : '',
      };
      const validity = validatePanelEditInput(values);
      const invalidUrl = !validity.url;
      const invalidShortcut = !validity.shortcut;
      const invalidSelector = !validity.cssSelector;
      general.txtUrl.setAttribute('invalid', invalidUrl ? 'true' : 'false');
      sc.txtShortcut.setAttribute('invalid', invalidShortcut ? 'true' : 'false');
      cs.txtCss.setAttribute('invalid', invalidSelector ? 'true' : 'false');
      try {
        setBoolAttr(cs.cssRow, 'hidden', !cs.chkCssEnabled.checked);
        setBoolAttr(tf.titleValueRow, 'hidden', tf.titleModeMenu.value !== 'static');
        setBoolAttr(tf.faviconValueRow, 'hidden', tf.favModeMenu.value !== 'static');
        btnOK.disabled = invalidUrl || invalidShortcut || invalidSelector;
      } catch {}
    }

    for (const control of [
      pnGeneral._controls.txtUrl,
      pnTitleFavicon._controls.titleModeMenu,
      pnTitleFavicon._controls.favModeMenu,
      pnShortcut._controls.txtShortcut,
      pnCSS._controls.chkCssEnabled,
      pnCSS._controls.txtCss,
    ]) {
      try {
        control.addEventListener('command', syncEditorValidation, true);
        control.addEventListener('input', syncEditorValidation, true);
      } catch {}
    }

    // Dialog buttons
    const btnOK = createXul(doc, 'button');
    btnOK.setAttribute('label', 'Guardar');
    btnOK.setAttribute('data-primary', 'true');

    const btnCancel = createXul(doc, 'button');
    btnCancel.setAttribute('label', 'Cancelar');

    dlg.appendChild(tabs);
    const buttonBox = createXul(doc, 'hbox');
    buttonBox.classList.add('midori-msidebar-edit-footer');
    buttonBox.appendChild(btnCancel);
    buttonBox.appendChild(btnOK);
    dlgWrapper.appendChild(buttonBox);

    btnOK.addEventListener('command', () => {
      updatePanel(panelId, (p) => {
        const g = pnGeneral._controls;
        p.url = sanitizeUrl(g.txtUrl.value) || p.url;
        p.pinned = g.chkPinned.checked && !g.chkTemporary.checked;
        p.mobile = g.uaMenu.value === 'mobile';
        p.userContextId = parseInt(g.containerMenu.value, 10) || 0;
        if (!p.mobile) {
          desktopReloadPanels.delete(panelId);
        }
        p.temporary = g.chkTemporary.checked;
        p.unloadOnClose = !g.chkKeepAlive.checked;
        p.lifecycle = {
          mode: g.chkKeepAlive.checked ? 'keep-alive' : 'idle',
          idleMinutes: p.lifecycle?.idleMinutes || 15,
        };
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
        p.shortcut = normalizePanelShortcut(sc.txtShortcut.value);

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

      closeEditor({ force: true });
    }, true);

    btnCancel.addEventListener('command', () => {
      closeEditor();
    }, true);
    btnCloseEditor.addEventListener('command', () => {
      closeEditor();
    }, true);

    doc.documentElement.appendChild(dlgWrapper);
    _ahPopupOpen = true;
    let editorDirty = false;
    dlgWrapper.addEventListener('input', () => { editorDirty = true; }, true);
    dlgWrapper.addEventListener('command', (event) => {
      if (
        event.target !== btnCancel &&
        event.target !== btnOK &&
        event.target !== btnCloseEditor &&
        !tabstrip.contains(event.target)
      ) {
        editorDirty = true;
      }
    }, true);
    function closeEditor({ force = false } = {}) {
      if (!force && editorDirty) {
        const confirm = Services.prompt.confirm(win, 'Descartar cambios', 'Hay cambios sin guardar. ¿Quieres cerrar?');
        if (!confirm) return false;
      }
      dlgWrapper.removeEventListener('keydown', onEditorKeyDown, true);
      backdrop.remove();
      dlgWrapper.remove();
      _ahPopupOpen = false;
      try {
        previousFocus?.focus?.();
      } catch {}
      return true;
    }
    function onEditorKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeEditor();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...dlgWrapper.querySelectorAll('button,input,textarea,checkbox,menulist,[tabindex="0"]')]
        .filter((node) => !node.disabled && node.getAttribute('hidden') !== 'true');
      if (!focusable.length) return;
      if (event.shiftKey && doc.activeElement === focusable[0]) {
        event.preventDefault();
        focusable.at(-1).focus();
      } else if (!event.shiftKey && doc.activeElement === focusable.at(-1)) {
        event.preventDefault();
        focusable[0].focus();
      }
    }
    dlgWrapper.addEventListener('keydown', onEditorKeyDown, true);
    syncEditorValidation();
    // Focus the first input for better UX
    try {
      const firstInput = dlgWrapper.querySelector('input, textarea, checkbox, menulist');
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
      main.removeEventListener('focusin', _ahShow);
      boxArea.removeEventListener('focusin', _ahCancelHide);
      main.removeEventListener('focusout', _ahScheduleHide);
      boxArea.removeEventListener('focusout', _ahScheduleHide);
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
      settingsPanel.remove();
      commandPanel.remove();
      panelMenu.remove();
      doc.getElementById('midori-msidebar-add-dialog')?.remove?.();
      doc.getElementById('midori-msidebar-edit-dialog-wrapper')?.remove?.();
      doc.querySelector('.midori-msidebar-dialog-backdrop')?.remove?.();
      doc.getElementById('midori-msidebar-edit-dialog-backdrop')?.remove?.();
    } catch {}
    try {
      if (faviconPumpTimer) win.clearTimeout(faviconPumpTimer);
      faviconPumpTimer = null;
      faviconQueue.length = 0;
      faviconQueued.clear();
    } catch {}
    try {
      doc.getElementById(PANEL_KEYSET_ID)?.remove?.();
    } catch {}
    try {
      doc.documentElement.removeAttribute('midori-msidebar-injected');
    } catch {}
  }

  function refresh() {
    syncToolbarPrefs();
    syncRailExpansion();
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
    addPanelFromContext(options = {}) {
      return addPanel(options);
    },
    openCommandPalette() {
      openCommandPalette(btnCommands);
    },
    get settingsAnchor() {
      return btnSettings;
    },
  };
}
