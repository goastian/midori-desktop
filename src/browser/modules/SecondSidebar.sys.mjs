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

  /**
   * Initialize the Second Sidebar
   * Called during browser startup
   */
  async init() {
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
   * Cleanup when browser window closes
   */
  uninit() {
    console.log("Second Sidebar: Cleaning up...");
    this._initialized = false;
    // Cleanup code will be added here if needed
  },
};

// Auto-initialize when the browser window is ready
// This mimics the behavior of the original userChrome.js script
if (typeof window !== "undefined" && window.delayedStartupPromise) {
  window.delayedStartupPromise.then(() => {
    SecondSidebar.init();
  });
}
