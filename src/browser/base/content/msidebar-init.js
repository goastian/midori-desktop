/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Midori Sidebar initialization script

(async function initMidoriSidebar() {
  console.log("[Midori Sidebar] Starting initialization...");
  
  try {
    // CRITICAL: Only run in the main browser window, not in web panels or other internal browsers
    // Check if this is a chrome://browser/content/browser.xhtml window
    if (window.location.href !== "chrome://browser/content/browser.xhtml") {
      console.log("[Midori Sidebar] Skipping - not main browser window:", window.location.href);
      return;
    }
    
    // Check if this is an embedded browser (web panel) by checking if we have a parent window
    // Main browser windows don't have a parent, but embedded browsers do
    if (window.parent !== window) {
      console.log("[Midori Sidebar] Skipping - embedded browser detected");
      return;
    }
    
    // Check if this window is inside a <browser> element (web panel)
    if (window.browsingContext?.embedderElement?.tagName === "browser") {
      console.log("[Midori Sidebar] Skipping - inside browser element");
      return;
    }
    
    // Check if msidebar is enabled
    const enabled = Services.prefs.getBoolPref("midori.msidebar.enabled", true);
    
    if (!enabled) {
      console.log("[Midori Sidebar] Disabled by preference");
      return;
    }
    
    // Wait for browser delayed startup (this ensures gBrowser is available)
    await window.delayedStartupPromise;
    console.log("[Midori Sidebar] Browser delayed startup complete");
    
    // Check if sidebar is already initialized in this window
    if (window.document.getElementById("sb2-wrapper")) {
      console.log("[Midori Sidebar] Already initialized in this window, skipping...");
      return;
    }
    
    // Load Midori Sidebar using resource:// protocol
    console.log("[Midori Sidebar] Loading sidebar injector...");
    
    // Initialize globals module first
    const globalsModule = ChromeUtils.importESModule(
      "resource://browser-content/modules/msidebar/globals.mjs"
    );
    globalsModule.initGlobals(window);
    console.log("[Midori Sidebar] Globals initialized");
    
    // Load the sidebar injector module
    const module = ChromeUtils.importESModule(
      "resource://browser-content/modules/msidebar/sidebar_injector.mjs"
    );
    const SidebarInjector = module.SidebarInjector;
    
    console.log("[Midori Sidebar] Module loaded successfully");
    
    // Inject the sidebar into the window
    // Note: We keep these globals in globalThis permanently as the sidebar needs them
    let success = false;
    try {
      success = SidebarInjector.inject();
    } catch (error) {
      console.error("[Midori Sidebar] Initialization error:", error);
      console.error(error.stack);
      throw error;
    }
    
    if (success) {
      console.log("[Midori Sidebar] Successfully initialized");
    } else {
      console.warn("[Midori Sidebar] Failed to initialize (likely a popup window)");
    }
    
    // Add preference observer for dynamic enable/disable
    // This works regardless of whether the sidebar was initially injected
    const prefObserver = {
      observe(subject, topic, data) {
        if (topic === "nsPref:changed" && data === "midori.msidebar.enabled") {
          const newValue = Services.prefs.getBoolPref("midori.msidebar.enabled", false);
          console.log("[Midori Sidebar] Preference changed to:", newValue);
          
          if (newValue) {
            // Re-inject if enabled
            console.log("[Midori Sidebar] Attempting to inject sidebar...");
            SidebarInjector.inject();
          } else {
            // Remove sidebar if disabled
            console.log("[Midori Sidebar] Attempting to remove sidebar...");
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
  } catch (error) {
    console.error("[Midori Sidebar] Initialization error:", error);
    console.error(error.stack);
  }
})();
