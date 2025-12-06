/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Midori Sidebar initialization script

(async function initMidoriSidebar() {
  console.log("[Midori Sidebar] Starting initialization...");
  
  try {
    // Wait for browser delayed startup
    await window.delayedStartupPromise;
    console.log("[Midori Sidebar] Browser delayed startup complete");
    
    // Import the sidebar injector
    const { SidebarInjector } = ChromeUtils.importESModule(
      "chrome://browser/content/modules/msidebar/sidebar_injector.mjs"
    );
    
    // Inject the sidebar into the window
    const success = SidebarInjector.inject();
    
    if (success) {
      console.log("[Midori Sidebar] Successfully initialized");
    } else {
      console.warn("[Midori Sidebar] Failed to initialize (likely a popup window)");
    }
  } catch (error) {
    console.error("[Midori Sidebar] Initialization error:", error);
    console.error(error.stack);
  }
})();
