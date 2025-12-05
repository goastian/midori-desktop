/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Second Sidebar Initialization Script
 * This script is loaded in each browser window to initialize the Second Sidebar
 */

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

  // Import and initialize the Second Sidebar module
  try {
    const { SecondSidebar } = ChromeUtils.importESModule(
      "resource:///modules/second_sidebar/SecondSidebar.sys.mjs"
    );
    
    await SecondSidebar.init();
  } catch (error) {
    console.error("Second Sidebar: Failed to load module:", error);
  }
})();
