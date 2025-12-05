/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Second Sidebar Initialization Script
 * This script is loaded in each browser window to initialize the Second Sidebar
 * It loads the main SecondSidebar.sys.mjs module directly as a script to preserve window context
 */

// Second Sidebar Initialization
// This script runs in the window context and provides window/document to the modules

(async function() {
  "use strict";

  // Wait for the browser window to be fully loaded
  if (window.delayedStartupPromise) {
    await window.delayedStartupPromise;
  }

  // Check if Second Sidebar is enabled
  const enabled = Services.prefs.getBoolPref("midori.second-sidebar.enabled", true);
  if (!enabled) {
    console.log("Second Sidebar: Disabled by preference");
    return;
  }

  try {
    console.log("Second Sidebar: Initializing...");
    
    // Import the Second Sidebar module
    // Now that browser_elements.mjs uses getters, window will be available when accessed
    const { SecondSidebar } = ChromeUtils.importESModule(
      "chrome://browser/content/modules/second_sidebar/SecondSidebar.sys.mjs"
    );
    
    // Initialize the sidebar with the window object
    await SecondSidebar.init(window);
    
    console.log("Second Sidebar: Successfully initialized");
  } catch (error) {
    console.error("Second Sidebar: Failed to initialize:", error);
  }
})();
