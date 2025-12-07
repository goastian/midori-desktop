/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Midori Sidebar initialization script

(async function initMidoriSidebar() {
  console.log("[Midori Sidebar] Starting initialization...");
  
  try {
    // Check if msidebar is enabled
    const enabled = Services.prefs.getBoolPref("midori.msidebar.enabled", false);
    
    if (!enabled) {
      console.log("[Midori Sidebar] Disabled by preference");
      return;
    }
    
    // Wait for browser delayed startup
    await window.delayedStartupPromise;
    console.log("[Midori Sidebar] Browser delayed startup complete");
    
    // Load Midori Sidebar using resource:// protocol
    console.log("[Midori Sidebar] Loading sidebar injector...");
    
    // Initialize globals module first
    const globalsModule = ChromeUtils.importESModule(
      "resource://browser-content/modules/msidebar/globals.mjs"
    );
    globalsModule.initGlobals(window);
    console.log("[Midori Sidebar] Globals initialized");
    
    let SidebarInjector;
    let success = false;
    try {
      // Load the sidebar injector module
      const module = ChromeUtils.importESModule(
        "resource://browser-content/modules/msidebar/sidebar_injector.mjs"
      );
      SidebarInjector = module.SidebarInjector;
      
      console.log("[Midori Sidebar] Module loaded successfully");
      
      // Inject the sidebar into the window
      // Note: We keep these globals in globalThis permanently as the sidebar needs them
      success = SidebarInjector.inject();
    } catch (error) {
      console.error("[Midori Sidebar] Initialization error:", error);
      console.error(error.stack);
      throw error;
    }
    
    if (success) {
      console.log("[Midori Sidebar] Successfully initialized");
      
      // Add preference observer for dynamic enable/disable
      const prefObserver = {
        observe(subject, topic, data) {
          if (topic === "nsPref:changed" && data === "midori.msidebar.enabled") {
            const newValue = Services.prefs.getBoolPref("midori.msidebar.enabled", false);
            console.log("[Midori Sidebar] Preference changed to:", newValue);
            
            if (newValue) {
              // Re-inject if enabled
              SidebarInjector.inject();
            } else {
              // Remove sidebar if disabled
              SidebarInjector.remove();
            }
          }
        }
      };
      
      Services.prefs.addObserver("midori.msidebar.enabled", prefObserver, false);
      
      // Clean up observer on window unload
      window.addEventListener("unload", () => {
        Services.prefs.removeObserver("midori.msidebar.enabled", prefObserver);
      });
    } else {
      console.warn("[Midori Sidebar] Failed to initialize (likely a popup window)");
    }
  } catch (error) {
    console.error("[Midori Sidebar] Initialization error:", error);
    console.error(error.stack);
  }
})();
