/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Lazy load msidebar modules from the content directory
const { AppConstants } = ChromeUtils.importESModule("resource://gre/modules/AppConstants.sys.mjs");

// Get the chrome registry to resolve the chrome:// URL to file path
const chromeRegistry = Cc["@mozilla.org/chrome/chrome-registry;1"].getService(Ci.nsIChromeRegistry);

// Resolve chrome://browser/content/ to its actual location
const chromeURI = Services.io.newURI("chrome://browser/content/modules/msidebar/sidebar_injector.mjs");
const fileURI = chromeRegistry.convertChromeURL(chromeURI);

// Now we can import using the resource protocol by constructing the path
// Import using a dynamic import that loads with the proper context
export const SidebarInjector = (await import(fileURI.spec)).SidebarInjector;
