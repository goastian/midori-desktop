/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { gFloorpTabBarStyle } from "./browser-tabbar.mjs";
import { gFloorpCommands } from "./browser-commands.mjs";

try {
  var { gBmsWindow } = await import(
    "chrome://floorp/content/browser-bms-window.mjs"
  );
} catch (e) {}

export var gFloorpVerticalTabBar = {
  _initialized: false,
  _widthObserver: null,
  _listenerAdded: false,
  get VERTICAL_TABS_WIDTH_PREF() {
    return "floorp.browser.tabs.verticaltab.width";
  },

  get enabled() {
    return Services.prefs.getBoolPref("floorp.browser.tabs.verticaltab", false);
  },

  get hoverModeEnabled() {
    return Services.prefs.getBoolPref(
      "floorp.verticaltab.hover.enabled",
      false
    );
  },

  get tabsToolbar() {
    return document.getElementById("TabsToolbar");
  },

  get titlebarContainer() {
    return document.getElementById("titlebar");
  },

  get browserBox() {
    return document.getElementById("browser");
  },

  get arrowscrollbox() {
    return document.getElementById("tabbrowser-arrowscrollbox");
  },

  get tabbrowserTabs() {
    return document.getElementById("tabbrowser-tabs");
  },

  get toolbarModificationStyle() {
    return document.getElementById("verticalTabsStyle");
  },

  get hoverStyleElem() {
    return document.getElementById("floorp-vthover");
  },

  get splitter() {
    return document.getElementById("verticaltab-splitter");
  },

  get tabContextCloseTabsToTheStart() {
    return document.getElementById("context_closeTabsToTheStart");
  },

  get tabContextCloseTabsToTheEnd() {
    return document.getElementById("context_closeTabsToTheEnd");
  },

  init() {
    if (this._initialized || gBmsWindow?.isBmsWindow) {
      return;
    }

    Services.prefs.addObserver("floorp.tabbar.style", function () {
      if (Services.prefs.getIntPref("floorp.tabbar.style") == 2) {
        Services.prefs.setIntPref(gFloorpTabBarStyle.tabbarDisplayStylePref, 2);
      }
      gFloorpVerticalTabBar.setVerticalTabs();
    });

    this.setVerticalTabs();
    this._initialized = true;
  },

  enableVerticalTabBar() {
    // pref
    Services.prefs.setBoolPref("floorp.browser.tabs.verticaltab", true);
    Services.prefs.setIntPref("floorp.browser.tabbar.settings", 2);

    // Move Tab Bar
    this.browserBox?.prepend(this.tabsToolbar || "");

    // Replace orientation
    this.arrowScrollbox = document.getElementById("tabbrowser-arrowscrollbox");
    this.tabBrowserTabs = document.getElementById("tabbrowser-tabs");
    this.arrowScrollbox?.setAttribute("orient", "vertical");
    this.tabBrowserTabs?.setAttribute("orient", "vertical");

    // Disable Overflow detection
    this.arrowScrollbox?.removeAttribute("overflowing");

    // Lepton Integration
    this.tabsToolbar?.setAttribute("multibar", "true");

    document
      .querySelector("#TabsToolbar .toolbar-items")
      ?.setAttribute("align", "start");

    this.tabsToolbar?.removeAttribute("flex");

    //toolbar modification
    let Tag = document.createElement("style");
    Tag.id = "verticalTabsStyle";
    Tag.textContent = `@import url("chrome://floorp/content/browser-verticaltabs.css");`;
    document.head.appendChild(Tag);

    // Hover effect CSS check
    if (this.hoverStyleElem == null && this.hoverModeEnabled) {
      window.setTimeout(() => {
        Tag = document.createElement("style");
        Tag.innerText = `@import url(chrome://floorp/skin/designs/options/native-verticaltab-hover.css)`;
        Tag.setAttribute("id", "floorp-vthover");
        document.head.appendChild(Tag);
      }, 1000);
    }

    //splitter
    this.splitter.removeAttribute("hidden");

    // TabsToolbar hidden
    this.tabsToolbar?.removeAttribute("hidden");

    // Change Scroll elem tag
    gFloorpCommands.changeXULElementTagName(
      this.arrowscrollbox.shadowRoot.querySelector(
        "scrollbox[part='scrollbox']"
      ),
      "vbox"
    );

    // Width observer
    this._widthObserver = new MutationObserver(this.mutationObserverCallback);

    if (this.tabsToolbar) {
      this._widthObserver.observe(this.tabsToolbar, {
        attributes: true,
      });
    }

    document
      .getElementById("TabsToolbar")
      ?.setAttribute(
        "width",
        Services.prefs.getIntPref(
          gFloorpVerticalTabBar.VERTICAL_TABS_WIDTH_PREF,
          200
        )
      );

    if (this.tabsToolbar) {
      document.getElementById(
        "TabsToolbar"
      ).style.width = `${Services.prefs.getIntPref(
        gFloorpVerticalTabBar.VERTICAL_TABS_WIDTH_PREF,
        200
      )}px`;
    }

    // Context menu localization
    this.tabContextCloseTabsToTheStart?.setAttribute(
      "data-lazy-l10n-id",
      "close-tabs-to-the-start-on-vertical-tab-bar"
    );

    this.tabContextCloseTabsToTheEnd?.setAttribute(
      "data-lazy-l10n-id",
      "close-tabs-to-the-end-on-vertical-tab-bar"
    );

    // fix cannot use middle click to open new tab
    if (!this._listenerAdded) {
      this.arrowscrollbox?.addEventListener("click", event =>
        this.mouseMiddleClickEventListener(event)
      );
      this._listenerAdded = true;
    }
  },

  disableVerticalTabBar() {
    Services.prefs.setBoolPref("floorp.browser.tabs.verticaltab", false);
    Services.prefs.setIntPref("floorp.browser.tabbar.settings", 0);

    this.titlebarContainer?.prepend(this.tabsToolbar || "");

    this.arrowScrollbox?.setAttribute("orient", "horizontal");
    this.tabBrowserTabs?.setAttribute("orient", "horizontal");

    document
      .querySelector("#TabsToolbar .toolbar-items")
      ?.setAttribute("align", "end");

    this.tabsToolbar?.setAttribute("flex", "1");

    //toolbar modification
    this.toolbarModificationStyle?.remove();

    // Hover effect CSS
    this.hoverStyleElem?.remove();

    // Splitter
    this.splitter?.setAttribute("hidden", "true");

    // Change Scroll elem tag
    gFloorpCommands.changeXULElementTagName(
      this.arrowscrollbox.shadowRoot.querySelector("vbox[part='scrollbox']"),
      "scrollbox"
    );

    // Observer
    if (this._widthObserver) {
      this._widthObserver.disconnect();
      this._widthObserver = null;
    }

    // Context menu localization
    this.tabContextCloseTabsToTheStart?.removeAttribute("data-lazy-l10n-id");

    this.tabContextCloseTabsToTheEnd?.removeAttribute("data-lazy-l10n-id");
  },

  setVerticalTabs() {
    if (Services.prefs.getIntPref("floorp.tabbar.style") == 2) {
      this.enableVerticalTabBar();
    } else {
      Services.prefs.setBoolPref("floorp.browser.tabs.verticaltab", false);
    }
  },

  // Functions
  mutationObserverCallback(mutations) {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName == "width") {
        Services.prefs.setIntPref(
          gFloorpVerticalTabBar.VERTICAL_TABS_WIDTH_PREF,
          parseInt(mutation.target.style.width)
        );
      }
    }
  },

  mouseMiddleClickEventListener(event) {
    if (event.button != 1 || event.target != this.arrowscrollbox) {
      return;
    }
    window.gBrowser.handleNewTabMiddleClick(this.arrowscrollbox, event);
  },
};

gFloorpVerticalTabBar.init();
