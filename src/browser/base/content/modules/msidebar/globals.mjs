/**
 * Global browser objects that need to be accessible to msidebar modules
 * These are initialized by msidebar-init.js before loading other modules
 */

export let window = null;
export let document = null;
export let ZoomManager = null;
export let gBrowser = null;
export let AppConstants = null;
export let CustomizableUI = null;
export let gNavToolbox = null;
export let SessionStore = null;
export let NetUtil = null;
export let ContextualIdentityService = null;
export let Favicons = null;
export let BrowserCommands = null;
export let setInterval = null;
export let clearInterval = null;
export let setTimeout = null;
export let clearTimeout = null;

/**
 * Initialize the globals with values from the browser window
 * @param {Window} win - The browser window object
 */
export function initGlobals(win) {
  window = win;
  document = win.document;
  ZoomManager = win.ZoomManager;
  gBrowser = win.gBrowser;
  gNavToolbox = win.gNavToolbox;
  setInterval = win.setInterval.bind(win);
  clearInterval = win.clearInterval.bind(win);
  setTimeout = win.setTimeout.bind(win);
  clearTimeout = win.clearTimeout.bind(win);
  
  // Import AppConstants from system module
  const { AppConstants: AC } = ChromeUtils.importESModule(
    "resource://gre/modules/AppConstants.sys.mjs"
  );
  AppConstants = AC;
  
  // Import CustomizableUI from system module
  const { CustomizableUI: CUI } = ChromeUtils.importESModule(
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"
  );
  CustomizableUI = CUI;
  
  // Import NetUtil from system module
  const { NetUtil: NU } = ChromeUtils.importESModule(
    "resource://gre/modules/NetUtil.sys.mjs"
  );
  NetUtil = NU;
  
  // Import ContextualIdentityService from system module
  const { ContextualIdentityService: CIS } = ChromeUtils.importESModule(
    "resource://gre/modules/ContextualIdentityService.sys.mjs"
  );
  ContextualIdentityService = CIS;
  
  // Favicons is a global in the browser window
  Favicons = win.Favicons;
  
  // SessionStore is a global in the browser window
  SessionStore = win.SessionStore;
  
  // BrowserCommands is a global in the browser window
  BrowserCommands = win.BrowserCommands;
}
