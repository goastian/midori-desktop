/**
 * Global browser objects that need to be accessible to msidebar modules
 * These are initialized by msidebar-init.js before loading other modules
 */

export let window = null;
export let document = null;
export let ZoomManager = null;
export let gBrowser = null;
export let AppConstants = null;

/**
 * Initialize the globals with values from the browser window
 * @param {Window} win - The browser window object
 */
export function initGlobals(win) {
  window = win;
  document = win.document;
  ZoomManager = win.ZoomManager;
  gBrowser = win.gBrowser;
  
  // Import AppConstants from system module
  const { AppConstants: AC } = ChromeUtils.importESModule(
    "resource://gre/modules/AppConstants.sys.mjs"
  );
  AppConstants = AC;
}
