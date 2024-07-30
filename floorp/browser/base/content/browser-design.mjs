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

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

/**
 * Object of Floorp design preferences.
 *
 * @typedef {object} gFloorpDesign
 * @property {boolean} _initialized - Flag indicating if the design has been initialized.
 * @property {number} updateDateAndTime - The current date and time in milliseconds.
 * @property {object} themeCSSs - Object containing different theme CSS imports.
 * @property {Function} init - Initializes the design configuration.
 * @property {Function} setBrowserDesign - Sets the browser design based on the configuration.
 * @property {Function} setPhotonUI - Sets the browser design to Photon UI.
 * @property {Function} setLeptonUI - Sets the browser design to Lepton UI.
 * @property {Function} setProtonFixUI - Sets the browser design to Proton Fix UI.
 * @property {Function} hideUserInterface - Toggles the visibility of the browser toolbar.
 * @property {Function} toggleNavigationPanel - Toggles the visibility of the navigation panel
 */
export const gFloorpDesign = {
  _initialized: false,

  get updateDateAndTime() {
    return new Date().getTime();
  },
  get themeCSSs() {
    return {
      LeptonUI: `@import url(chrome://floorp/skin/designs/lepton/leptonChrome.css?${this.updateDateAndTime}); @import url(chrome://floorp/skin/designs/lepton/leptonContent.css?${this.updateDateAndTime});`,
      fluentUI: `@import url(chrome://floorp/skin/designs/fluentUI/fluentUI.css);`,
      gnomeUI: `@import url(chrome://floorp/skin/designs/gnomeUI/gnomeUI.css);`,
      FluerialUI: `@import url(chrome://floorp/skin/designs/fluerialUI/fluerialUI.css?${this.updateDateAndTime});`,
      FluerialUIMultitab: `@import url(chrome://floorp/skin/designs/fluerialUI/fluerialUI.css?${this.updateDateAndTime}); @import url(chrome://floorp/skin/designs/fluerialUI/fluerial-multitab.css);`,

      // Vertical Tabs CSS Injection
      LeptonVerticalTabs: `@import url(chrome://floorp/skin/designs/lepton/leptonVerticalTabs.css);`,
      fluentVerticalTabs: `@import url(chrome://floorp/skin/designs/fluentUI/fluentVerticalTabs.css);`,
      gnomeVerticalTabs: `@import url(chrome://floorp/skin/designs/gnomeUI/gnomeVerticalTabs.css);`,
      FluerialVerticalTabs: `@import url(chrome://floorp/skin/designs/fluerialUI/fluerialUI-verticalTabs.css?${this.updateDateAndTime});`,
    };
  },

  init() {
    if (this._initialized || gBmsWindow?.isBmsWindow) {
      return;
    }

    this.setBrowserDesign();
    Services.prefs.addObserver(
      "floorp.browser.user.interface",
      gFloorpDesign.setBrowserDesign
    );
    Services.prefs.addObserver(
      "floorp.fluerial.roundVerticalTabs",
      gFloorpDesign.setBrowserDesign
    );
    Services.obs.addObserver(
      gFloorpDesign.setBrowserDesign,
      "update-photon-pref"
    );
    Services.obs.addObserver(gFloorpDesign.setPhotonUI, "set-photon-ui");
    Services.obs.addObserver(gFloorpDesign.setLeptonUI, "set-lepton-ui");
    Services.obs.addObserver(gFloorpDesign.setProtonFixUI, "set-protonfix-ui");

    // Add browser-floorp.css to the browser
    const browserCssTag = document.createElement("link");
    browserCssTag.setAttribute("id", "browser-floorp-css");
    browserCssTag.rel = "stylesheet";
    browserCssTag.href = "chrome://floorp/content/browser-floorp.css";

    document.head?.appendChild(browserCssTag);
    window.gURLBar._updateLayoutBreakoutDimensions();

    this._initialized = true;
  },

  setBrowserDesign() {
    const browserDesign = document.getElementById("browserdesign");
    if (browserDesign) {
      browserDesign.remove();
    }

    const floorpInterfaceNum = Services.prefs.getIntPref(
      "floorp.browser.user.interface"
    );
    const tag = document.createElement("style");
    tag.setAttribute("id", "browserdesign");
    const enableMultitab =
      Services.prefs.getIntPref("floorp.tabbar.style") == 1;
    const enableVerticalTabs =
      Services.prefs.getIntPref("floorp.browser.tabbar.settings") == 2;

    switch (floorpInterfaceNum) {
      case 1:
        break;
      case 3:
        tag.innerText = enableVerticalTabs
          ? gFloorpDesign.themeCSSs.LeptonUI +
            gFloorpDesign.themeCSSs.LeptonVerticalTabs
          : gFloorpDesign.themeCSSs.LeptonUI;
        break;
      case 5:
        if (AppConstants.platform !== "linux") {
          tag.innerText = enableVerticalTabs
            ? gFloorpDesign.themeCSSs.fluentUI +
              gFloorpDesign.themeCSSs.fluentVerticalTabs
            : gFloorpDesign.themeCSSs.fluentUI;
        }
        break;
      case 6:
        if (AppConstants.platform == "linux") {
          tag.innerText = enableVerticalTabs
            ? gFloorpDesign.themeCSSs.gnomeUI +
              gFloorpDesign.themeCSSs.gnomeVerticalTabs
            : gFloorpDesign.themeCSSs.gnomeUI;
        }
        break;
      case 8:
        if (enableMultitab) {
          tag.innerText = gFloorpDesign.themeCSSs.FluerialUIMultitab;
        } else if (enableVerticalTabs) {
          tag.innerText =
            gFloorpDesign.themeCSSs.FluerialUI +
            gFloorpDesign.themeCSSs.FluerialVerticalTabs;
        } else {
          tag.innerText = gFloorpDesign.themeCSSs.FluerialUI;
        }
        break;
    }

    document.head.appendChild(tag);

    // recalculate sidebar width
    setTimeout(() => {
      window.gURLBar._updateLayoutBreakoutDimensions();
    }, 100);

    setTimeout(() => {
      window.gURLBar._updateLayoutBreakoutDimensions();
    }, 500);

    setTimeout(() => {
      gFloorpTabBarStyle.setMultirowTabMaxHeight();
    }, 1000);

    if (floorpInterfaceNum == 3) {
      gFloorpCommands.loadStyleSheetWithNsStyleSheetService(
        "chrome://floorp/skin/designs/lepton/leptonContent.css"
      );
    } else {
      gFloorpCommands.unloadStyleSheetWithNsStyleSheetService(
        "chrome://floorp/skin/designs/lepton/leptonContent.css"
      );
    }
  },

  setPhotonUI() {
    Services.prefs.setIntPref("floorp.lepton.interface", 1);
    Services.prefs.setBoolPref("userChrome.tab.connect_to_window", true);
    Services.prefs.setBoolPref("userChrome.tab.color_like_toolbar", true);

    Services.prefs.setBoolPref("userChrome.tab.lepton_like_padding", false);
    Services.prefs.setBoolPref("userChrome.tab.photon_like_padding", true);

    Services.prefs.setBoolPref("userChrome.tab.dynamic_separator", false);
    Services.prefs.setBoolPref("userChrome.tab.static_separator", true);
    Services.prefs.setBoolPref(
      "userChrome.tab.static_separator.selected_accent",
      false
    );
    Services.prefs.setBoolPref("userChrome.tab.bar_separator", false);

    Services.prefs.setBoolPref("userChrome.tab.newtab_button_like_tab", false);
    Services.prefs.setBoolPref("userChrome.tab.newtab_button_smaller", true);
    Services.prefs.setBoolPref("userChrome.tab.newtab_button_proton", false);

    Services.prefs.setBoolPref("userChrome.icon.panel_full", false);
    Services.prefs.setBoolPref("userChrome.icon.panel_photon", true);

    Services.prefs.setBoolPref("userChrome.tab.box_shadow", false);
    Services.prefs.setBoolPref("userChrome.tab.bottom_rounded_corner", false);

    Services.prefs.setBoolPref("userChrome.tab.photon_like_contextline", true);
    Services.prefs.setBoolPref("userChrome.rounding.square_tab", true);
    gFloorpDesign.setBrowserDesign();
  },

  setLeptonUI() {
    Services.prefs.setIntPref("floorp.lepton.interface", 2);
    Services.prefs.setBoolPref("userChrome.tab.connect_to_window", true);
    Services.prefs.setBoolPref("userChrome.tab.color_like_toolbar", true);

    Services.prefs.setBoolPref("userChrome.tab.lepton_like_padding", true);
    Services.prefs.setBoolPref("userChrome.tab.photon_like_padding", false);

    Services.prefs.setBoolPref("userChrome.tab.dynamic_separator", true);
    Services.prefs.setBoolPref("userChrome.tab.static_separator", false);
    Services.prefs.setBoolPref(
      "userChrome.tab.static_separator.selected_accent",
      false
    );
    Services.prefs.setBoolPref("userChrome.tab.bar_separator", false);

    Services.prefs.setBoolPref("userChrome.tab.newtab_button_like_tab", true);
    Services.prefs.setBoolPref("userChrome.tab.newtab_button_smaller", false);
    Services.prefs.setBoolPref("userChrome.tab.newtab_button_proton", false);

    Services.prefs.setBoolPref("userChrome.icon.panel_full", true);
    Services.prefs.setBoolPref("userChrome.icon.panel_photon", false);

    Services.prefs.setBoolPref("userChrome.tab.box_shadow", false);
    Services.prefs.setBoolPref("userChrome.tab.bottom_rounded_corner", true);

    Services.prefs.setBoolPref("userChrome.tab.photon_like_contextline", false);
    Services.prefs.setBoolPref("userChrome.rounding.square_tab", false);
    gFloorpDesign.setBrowserDesign();
  },

  setProtonFixUI() {
    Services.prefs.setIntPref("floorp.lepton.interface", 3);

    Services.prefs.setBoolPref("userChrome.tab.connect_to_window", false);
    Services.prefs.setBoolPref("userChrome.tab.color_like_toolbar", false);

    Services.prefs.setBoolPref("userChrome.tab.lepton_like_padding", false);
    Services.prefs.setBoolPref("userChrome.tab.photon_like_padding", false);

    Services.prefs.setBoolPref("userChrome.tab.dynamic_separator", true);
    Services.prefs.setBoolPref("userChrome.tab.static_separator", false);
    Services.prefs.setBoolPref(
      "userChrome.tab.static_separator.selected_accent",
      false
    );
    Services.prefs.setBoolPref("userChrome.tab.bar_separator", false);

    Services.prefs.setBoolPref("userChrome.tab.newtab_button_like_tab", false);
    Services.prefs.setBoolPref("userChrome.tab.newtab_button_smaller", false);
    Services.prefs.setBoolPref("userChrome.tab.newtab_button_proton", true);

    Services.prefs.setBoolPref("userChrome.icon.panel_full", true);
    Services.prefs.setBoolPref("userChrome.icon.panel_photon", false);

    Services.prefs.setBoolPref("userChrome.tab.box_shadow", false);
    Services.prefs.setBoolPref("userChrome.tab.bottom_rounded_corner", false);

    Services.prefs.setBoolPref("userChrome.tab.photon_like_contextline", false);
    Services.prefs.setBoolPref("userChrome.rounding.square_tab", false);

    gFloorpDesign.setBrowserDesign();
  },

  toggleNavigationPanel(){
    const navigationBar = document.getElementById("nav-bar");
    navigationBar.style.display = navigationBar.style.display ? "" : "none";
  },

  hideUserInterface() {
    let shownElementAmount = 0;

    const navigationToolboxElements = document.getElementById("navigator-toolbox").children;
    const navigationBar = navigationToolboxElements[1];

    for (const element of navigationToolboxElements) {
      element.style.display = element.style.display ? "" : "none";
      if (element.style.display === "") {
        shownElementAmount++;
      }
    }

    if (shownElementAmount > 1 && navigationBar.style.display !== "") {
      navigationBar.style.display = "";
    }
  }
};

gFloorpDesign.init();
