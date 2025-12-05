/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Second Sidebar for Midori Browser
 * Based on firefox-second-sidebar by aminought
 * https://github.com/aminought/firefox-second-sidebar
 */

import { BrowserElements } from "./browser_elements.mjs";
import { ContextualIdentityServiceWrapper } from "./wrappers/contextual_identity_service.mjs";
import { CustomizeModePatcher } from "./patchers/customize_mode_patcher.mjs";
import { SidebarDecorator } from "./sidebar_decorator.mjs";
import { SidebarInjector } from "./sidebar_injector.mjs";

export const EXPORTED_SYMBOLS = ["SecondSidebar"];

export const SecondSidebar = {
  _initialized: false,
  _window: null,
  _prefObserver: null,

  /**
   * Initialize the Second Sidebar
   * Called during browser startup
   * @param {Window} win - The browser window object
   */
  async init(win) {
    // Store window reference
    this._window = win || window;

    // Prevent multiple initializations
    if (this._initialized) {
      console.log("Second Sidebar: Already initialized");
      return;
    }

    try {
      // Check if Second Sidebar is enabled
      const enabled = Services.prefs.getBoolPref("midori.second-sidebar.enabled", true);
      if (!enabled) {
        console.log("Second Sidebar: Disabled by preference");
        return;
      }

      // Make window globally available for modules that need it
      if (!globalThis.window && this._window) {
        globalThis.window = this._window;
      }

      // Check if this is a web panel window (avoid recursive initialization)
      if (BrowserElements.root.hasClass("sb2-webpanels-window")) {
        console.log("Second Sidebar: Skipping initialization for web panel window");
        return;
      }

      console.log("Second Sidebar: Initializing...");

      // Ensure contextual identity data is ready
      ContextualIdentityServiceWrapper.ensureDataReady();

      // Inject sidebar elements into the browser
      if (SidebarInjector.inject()) {
        // Apply visual decorations
        SidebarDecorator.decorate();

        // Patch customize mode to work with our sidebar
        CustomizeModePatcher.patch();

        this._initialized = true;
        console.log("Second Sidebar: Successfully initialized");
      } else {
        console.error("Second Sidebar: Failed to inject sidebar");
      }
    } catch (error) {
      console.error("Second Sidebar: Initialization error:", error);
    }
  },

  /**
   * Setup preference observer to react to enable/disable changes
   */
  _setupPrefObserver() {
    // Only setup once
    if (this._prefObserver) {
      return;
    }

    this._prefObserver = {
      observe: (subject, topic, data) => {
        if (topic === "nsPref:changed" && data === "midori.second-sidebar.enabled") {
          const enabled = Services.prefs.getBoolPref("midori.second-sidebar.enabled", true);
          console.log("Second Sidebar: Preference changed, enabled:", enabled);
          
          if (enabled && !this._initialized) {
            // Enable sidebar
            console.log("Second Sidebar: Enabling sidebar...");
            this.init(this._window);
          } else if (!enabled && this._initialized) {
            // Disable sidebar
            console.log("Second Sidebar: Disabling sidebar...");
            this._hide();
          } else if (enabled && this._initialized) {
            // Already enabled, just show it
            console.log("Second Sidebar: Showing sidebar...");
            this._show();
          }
        }
      }
    };
    
    Services.prefs.addObserver("midori.second-sidebar.enabled", this._prefObserver);
    console.log("Second Sidebar: Preference observer registered");
  },

  /**
   * Show the sidebar
   */
  _show() {
    const sidebarBox = this._window?.document.getElementById("sb2-box");
    if (sidebarBox) {
      sidebarBox.removeAttribute("hidden");
      sidebarBox.setAttribute("data-ready", "true");
      console.log("Second Sidebar: Shown");
    }
  },

  /**
   * Hide the sidebar
   */
  _hide() {
    const sidebarBox = this._window?.document.getElementById("sb2-box");
    if (sidebarBox) {
      sidebarBox.setAttribute("hidden", "true");
      console.log("Second Sidebar: Hidden");
    }
  },

  /**
   * Cleanup when browser window closes
   */
  uninit() {
    console.log("Second Sidebar: Cleaning up...");
    
    if (this._prefObserver) {
      Services.prefs.removeObserver("midori.second-sidebar.enabled", this._prefObserver);
      this._prefObserver = null;
    }
    
    this._initialized = false;
    this._window = null;
  },
};

// Auto-initialize when the browser window is ready
// This mimics the behavior of the original userChrome.js script
if (typeof window !== "undefined" && window.delayedStartupPromise) {
  window.delayedStartupPromise.then(() => {
    // Setup preference observer first, before init
    SecondSidebar._setupPrefObserver();
    // Then try to initialize if enabled
    SecondSidebar.init();
  });
}
