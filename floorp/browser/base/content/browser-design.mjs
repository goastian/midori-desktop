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
      FluerialUI: `@import url(chrome://floorp/skin/designs/fluerial/fluerial.css?${this.updateDateAndTime});`,

      // Vertical Tabs CSS Injection
      // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
      LeptonVerticalTabs: `@import url(chrome://floorp/skin/designs/lepton/leptonVerticalTabs.css);`,
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
      case 8:
        tag.innerText = gFloorpDesign.themeCSSs.FluerialUI;
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
    Services.prefs.setBoolPref("svg.context-properties.content.enabled", true);
    Services.prefs.setBoolPref("browser.compactmode.show", true);
    Services.prefs.setBoolPref(
      "browser.newtabpage.activity-stream.improvesearch.handoffToAwesomebar",
      false
    );
    Services.prefs.setBoolPref("layout.css.has-selector.enabled", true);
    Services.prefs.setBoolPref("userChrome.tab.color_like_toolbar", true); // Original, Photon

    Services.prefs.setBoolPref("userChrome.tab.lepton_like_padding", false); // Original
    Services.prefs.setBoolPref("userChrome.tab.photon_like_padding", true); // Photon

    Services.prefs.setBoolPref("userChrome.tab.dynamic_separator", false); // Original, Proton
    Services.prefs.setBoolPref("userChrome.tab.static_separator", true); // Photon
    Services.prefs.setBoolPref(
      "userChrome.tab.static_separator.selected_accent",
      false
    ); // Just option
    Services.prefs.setBoolPref("userChrome.tab.bar_separator", false); // Just option

    Services.prefs.setBoolPref("userChrome.tab.newtab_button_like_tab", false); // Original
    Services.prefs.setBoolPref("userChrome.tab.newtab_button_smaller", true); // Photon
    Services.prefs.setBoolPref("userChrome.tab.newtab_button_proton", false); // Proton

    Services.prefs.setBoolPref("userChrome.icon.panel_full", false); // Original, Proton
    Services.prefs.setBoolPref("userChrome.icon.panel_photon", true); // Photon

    // Original Only
    Services.prefs.setBoolPref("userChrome.tab.box_shadow", false);
    Services.prefs.setBoolPref("userChrome.tab.bottom_rounded_corner", false);

    // Photon Only
    Services.prefs.setBoolPref("userChrome.tab.photon_like_contextline", true);
    Services.prefs.setBoolPref("userChrome.rounding.square_tab", true);

    Services.prefs.setBoolPref("userChrome.compatibility.theme", true);
    Services.prefs.setBoolPref("userChrome.compatibility.os", true);

    Services.prefs.setBoolPref("userChrome.theme.built_in_contrast", true);
    Services.prefs.setBoolPref("userChrome.theme.system_default", true);
    Services.prefs.setBoolPref("userChrome.theme.proton_color", true);
    Services.prefs.setBoolPref("userChrome.theme.proton_chrome", true); // Need proton_color
    Services.prefs.setBoolPref("userChrome.theme.fully_color", true); // Need proton_color
    Services.prefs.setBoolPref("userChrome.theme.fully_dark", true); // Need proton_color

    Services.prefs.setBoolPref("userChrome.decoration.cursor", true);
    Services.prefs.setBoolPref("userChrome.decoration.field_border", true);
    Services.prefs.setBoolPref("userChrome.decoration.download_panel", true);
    Services.prefs.setBoolPref("userChrome.decoration.animate", true);

    Services.prefs.setBoolPref("userChrome.padding.tabbar_width", true);
    Services.prefs.setBoolPref("userChrome.padding.tabbar_height", true);
    Services.prefs.setBoolPref("userChrome.padding.toolbar_button", true);
    Services.prefs.setBoolPref("userChrome.padding.navbar_width", true);
    Services.prefs.setBoolPref("userChrome.padding.urlbar", true);
    Services.prefs.setBoolPref("userChrome.padding.bookmarkbar", true);
    Services.prefs.setBoolPref("userChrome.padding.infobar", true);
    Services.prefs.setBoolPref("userChrome.padding.menu", true);
    Services.prefs.setBoolPref("userChrome.padding.bookmark_menu", true);
    Services.prefs.setBoolPref("userChrome.padding.global_menubar", true);
    Services.prefs.setBoolPref("userChrome.padding.panel", true);
    Services.prefs.setBoolPref("userChrome.padding.popup_panel", true);

    Services.prefs.setBoolPref("userChrome.tab.multi_selected", true);
    Services.prefs.setBoolPref("userChrome.tab.unloaded", true);
    Services.prefs.setBoolPref("userChrome.tab.letters_cleary", true);
    Services.prefs.setBoolPref("userChrome.tab.close_button_at_hover", true);
    Services.prefs.setBoolPref("userChrome.tab.sound_hide_label", true);
    Services.prefs.setBoolPref("userChrome.tab.sound_with_favicons", true);
    Services.prefs.setBoolPref("userChrome.tab.pip", true);
    Services.prefs.setBoolPref("userChrome.tab.container", true);
    Services.prefs.setBoolPref("userChrome.tab.crashed", true);

    Services.prefs.setBoolPref("userChrome.fullscreen.overlap", true);
    Services.prefs.setBoolPref("userChrome.fullscreen.show_bookmarkbar", true);

    Services.prefs.setBoolPref("userChrome.icon.library", true);
    Services.prefs.setBoolPref("userChrome.icon.panel", true);
    Services.prefs.setBoolPref("userChrome.icon.menu", true);
    Services.prefs.setBoolPref("userChrome.icon.context_menu", true);
    Services.prefs.setBoolPref("userChrome.icon.global_menu", true);
    Services.prefs.setBoolPref("userChrome.icon.global_menubar", true);
    Services.prefs.setBoolPref("userChrome.icon.1-25px_stroke", true);

    // -- User Content -------------------------------------------------------------
    Services.prefs.setBoolPref("userContent.player.ui", true);
    Services.prefs.setBoolPref("userContent.player.icon", true);
    Services.prefs.setBoolPref("userContent.player.noaudio", true);
    Services.prefs.setBoolPref("userContent.player.size", true);
    Services.prefs.setBoolPref("userContent.player.click_to_play", true);
    Services.prefs.setBoolPref("userContent.player.animate", true);

    Services.prefs.setBoolPref("userContent.newTab.full_icon", true);
    Services.prefs.setBoolPref("userContent.newTab.animate", true);
    Services.prefs.setBoolPref("userContent.newTab.pocket_to_last", true);
    Services.prefs.setBoolPref("userContent.newTab.searchbar", true);

    Services.prefs.setBoolPref("userContent.page.field_border", true);
    Services.prefs.setBoolPref("userContent.page.illustration", true);
    Services.prefs.setBoolPref("userContent.page.proton_color", true);
    Services.prefs.setBoolPref("userContent.page.dark_mode", true); // Need proton_color
    Services.prefs.setBoolPref("userContent.page.proton", true); // Need proton_color

    // ** Useful Options ***********************************************************
    // Tab preview
    // https://blog.nightly.mozilla.org/2024/02/06/a-preview-of-tab-previews-these-weeks-in-firefox-issue-153/
    Services.prefs.setBoolPref("browser.tabs.cardPreview.enabled", true);

    // Paste suggestion at urlbar
    // https://blog.nightly.mozilla.org/2023/12/04/url-gonna-want-to-check-this-out-these-weeks-in-firefox-issue-150/
    Services.prefs.setBoolPref("browser.urlbar.clipboard.featureGate", true);

    // Integrated calculator at urlbar
    Services.prefs.setBoolPref("browser.urlbar.suggest.calculator", true);

    gFloorpDesign.setBrowserDesign();
  },

  setLeptonUI() {
    // Fill SVG Color
    Services.prefs.setBoolPref("svg.context-properties.content.enabled", true);

    // Restore Compact Mode - 89 Above
    Services.prefs.setBoolPref("browser.compactmode.show", true);

    // about:home Search Bar - 89 Above
    Services.prefs.setBoolPref(
      "browser.newtabpage.activity-stream.improvesearch.handoffToAwesomebar",
      false
    );

    // CSS's `:has()` selector #457 - 103 Above
    Services.prefs.setBoolPref("layout.css.has-selector.enabled", true);

    // Browser Theme Based Scheme - Will be activate 95 Above
    // Services.prefs.setBoolPref("layout.css.prefers-color-scheme.content-override", 3);

    // ** Theme Related Options ****************************************************
    // == Theme Distribution Settings ==============================================
    // The rows that are located continuously must be changed `true`/`false` explicitly because there is a collision.
    // https://github.com/black7375/Firefox-UI-Fix/wiki/Options#important
    Services.prefs.setBoolPref("userChrome.tab.connect_to_window", true); // Original, Photon
    Services.prefs.setBoolPref("userChrome.tab.color_like_toolbar", true); // Original, Photon

    Services.prefs.setBoolPref("userChrome.tab.lepton_like_padding", true); // Original
    Services.prefs.setBoolPref("userChrome.tab.photon_like_padding", false); // Photon

    Services.prefs.setBoolPref("userChrome.tab.dynamic_separator", true); // Original, Proton
    Services.prefs.setBoolPref("userChrome.tab.static_separator", false); // Photon
    Services.prefs.setBoolPref(
      "userChrome.tab.static_separator.selected_accent",
      false
    ); // Just option
    Services.prefs.setBoolPref("userChrome.tab.bar_separator", false); // Just option

    Services.prefs.setBoolPref("userChrome.tab.newtab_button_like_tab", true); // Original
    Services.prefs.setBoolPref("userChrome.tab.newtab_button_smaller", false); // Photon
    Services.prefs.setBoolPref("userChrome.tab.newtab_button_proton", false); // Proton

    Services.prefs.setBoolPref("userChrome.icon.panel_full", true); // Original, Proton
    Services.prefs.setBoolPref("userChrome.icon.panel_photon", false); // Photon

    // Original Only
    Services.prefs.setBoolPref("userChrome.tab.box_shadow", true);
    Services.prefs.setBoolPref("userChrome.tab.bottom_rounded_corner", true);

    // Photon Only
    Services.prefs.setBoolPref("userChrome.tab.photon_like_contextline", false);
    Services.prefs.setBoolPref("userChrome.rounding.square_tab", false);

    Services.prefs.setBoolPref("userChrome.compatibility.theme", true);
    Services.prefs.setBoolPref("userChrome.compatibility.os", true);

    Services.prefs.setBoolPref("userChrome.theme.built_in_contrast", true);
    Services.prefs.setBoolPref("userChrome.theme.system_default", true);
    Services.prefs.setBoolPref("userChrome.theme.proton_color", true);
    Services.prefs.setBoolPref("userChrome.theme.proton_chrome", true); // Need proton_color
    Services.prefs.setBoolPref("userChrome.theme.fully_color", true); // Need proton_color
    Services.prefs.setBoolPref("userChrome.theme.fully_dark", true); // Need proton_color

    Services.prefs.setBoolPref("userChrome.decoration.cursor", true);
    Services.prefs.setBoolPref("userChrome.decoration.field_border", true);
    Services.prefs.setBoolPref("userChrome.decoration.download_panel", true);
    Services.prefs.setBoolPref("userChrome.decoration.animate", true);

    Services.prefs.setBoolPref("userChrome.padding.tabbar_width", true);
    Services.prefs.setBoolPref("userChrome.padding.tabbar_height", true);
    Services.prefs.setBoolPref("userChrome.padding.toolbar_button", true);
    Services.prefs.setBoolPref("userChrome.padding.navbar_width", true);
    Services.prefs.setBoolPref("userChrome.padding.urlbar", true);
    Services.prefs.setBoolPref("userChrome.padding.bookmarkbar", true);
    Services.prefs.setBoolPref("userChrome.padding.infobar", true);
    Services.prefs.setBoolPref("userChrome.padding.menu", true);
    Services.prefs.setBoolPref("userChrome.padding.bookmark_menu", true);
    Services.prefs.setBoolPref("userChrome.padding.global_menubar", true);
    Services.prefs.setBoolPref("userChrome.padding.panel", true);
    Services.prefs.setBoolPref("userChrome.padding.popup_panel", true);

    Services.prefs.setBoolPref("userChrome.tab.multi_selected", true);
    Services.prefs.setBoolPref("userChrome.tab.unloaded", true);
    Services.prefs.setBoolPref("userChrome.tab.letters_cleary", true);
    Services.prefs.setBoolPref("userChrome.tab.close_button_at_hover", true);
    Services.prefs.setBoolPref("userChrome.tab.sound_hide_label", true);
    Services.prefs.setBoolPref("userChrome.tab.sound_with_favicons", true);
    Services.prefs.setBoolPref("userChrome.tab.pip", true);
    Services.prefs.setBoolPref("userChrome.tab.container", true);
    Services.prefs.setBoolPref("userChrome.tab.crashed", true);

    Services.prefs.setBoolPref("userChrome.fullscreen.overlap", true);
    Services.prefs.setBoolPref("userChrome.fullscreen.show_bookmarkbar", true);

    Services.prefs.setBoolPref("userChrome.icon.library", true);
    Services.prefs.setBoolPref("userChrome.icon.panel", true);
    Services.prefs.setBoolPref("userChrome.icon.menu", true);
    Services.prefs.setBoolPref("userChrome.icon.context_menu", true);
    Services.prefs.setBoolPref("userChrome.icon.global_menu", true);
    Services.prefs.setBoolPref("userChrome.icon.global_menubar", true);
    Services.prefs.setBoolPref("userChrome.icon.1-25px_stroke", true);

    // -- User Content -------------------------------------------------------------
    Services.prefs.setBoolPref("userContent.player.ui", true);
    Services.prefs.setBoolPref("userContent.player.icon", true);
    Services.prefs.setBoolPref("userContent.player.noaudio", true);
    Services.prefs.setBoolPref("userContent.player.size", true);
    Services.prefs.setBoolPref("userContent.player.click_to_play", true);
    Services.prefs.setBoolPref("userContent.player.animate", true);

    Services.prefs.setBoolPref("userContent.newTab.full_icon", true);
    Services.prefs.setBoolPref("userContent.newTab.animate", true);
    Services.prefs.setBoolPref("userContent.newTab.pocket_to_last", true);
    Services.prefs.setBoolPref("userContent.newTab.searchbar", true);

    Services.prefs.setBoolPref("userContent.page.field_border", true);
    Services.prefs.setBoolPref("userContent.page.illustration", true);
    Services.prefs.setBoolPref("userContent.page.proton_color", true);
    Services.prefs.setBoolPref("userContent.page.dark_mode", true); // Need proton_color
    Services.prefs.setBoolPref("userContent.page.proton", true); // Need proton_color

    // ** Useful Options ***********************************************************
    // Tab preview
    // https://blog.nightly.mozilla.org/2024/02/06/a-preview-of-tab-previews-these-weeks-in-firefox-issue-153/
    Services.prefs.setBoolPref("browser.tabs.cardPreview.enabled", true);

    // Paste suggestion at urlbar
    // https://blog.nightly.mozilla.org/2023/12/04/url-gonna-want-to-check-this-out-these-weeks-in-firefox-issue-150/
    Services.prefs.setBoolPref("browser.urlbar.clipboard.featureGate", true);

    // Integrated calculator at urlbar
    Services.prefs.setBoolPref("browser.urlbar.suggest.calculator", true);

    gFloorpDesign.setBrowserDesign();
  },

  setProtonFixUI() {
    Services.prefs.setBoolPref("svg.context-properties.content.enabled", true);

    // Restore Compact Mode - 89 Above
    Services.prefs.setBoolPref("browser.compactmode.show", true);

    // about:home Search Bar - 89 Above
    Services.prefs.setBoolPref(
      "browser.newtabpage.activity-stream.improvesearch.handoffToAwesomebar",
      false
    );

    // CSS's `:has()` selector #457 - 103 Above
    Services.prefs.setBoolPref("layout.css.has-selector.enabled", true);

    Services.prefs.setBoolPref("userChrome.tab.connect_to_window", false); // Original, Photon
    Services.prefs.setBoolPref("userChrome.tab.color_like_toolbar", true); // Original, Photon

    Services.prefs.setBoolPref("userChrome.tab.lepton_like_padding", false); // Original
    Services.prefs.setBoolPref("userChrome.tab.photon_like_padding", false); // Photon

    Services.prefs.setBoolPref("userChrome.tab.dynamic_separator", true); // Original, Proton
    Services.prefs.setBoolPref("userChrome.tab.static_separator", false); // Photon
    Services.prefs.setBoolPref(
      "userChrome.tab.static_separator.selected_accent",
      false
    ); // Just option
    Services.prefs.setBoolPref("userChrome.tab.bar_separator", false); // Just option

    Services.prefs.setBoolPref("userChrome.tab.newtab_button_like_tab", false); // Original
    Services.prefs.setBoolPref("userChrome.tab.newtab_button_smaller", false); // Photon
    Services.prefs.setBoolPref("userChrome.tab.newtab_button_proton", true); // Proton

    Services.prefs.setBoolPref("userChrome.icon.panel_full", true); // Original, Proton
    Services.prefs.setBoolPref("userChrome.icon.panel_photon", false); // Photon

    // Original Only
    Services.prefs.setBoolPref("userChrome.tab.box_shadow", false);
    Services.prefs.setBoolPref("userChrome.tab.bottom_rounded_corner", false);

    // Photon Only
    Services.prefs.setBoolPref("userChrome.tab.photon_like_contextline", false);
    Services.prefs.setBoolPref("userChrome.rounding.square_tab", false);

    Services.prefs.setBoolPref("userChrome.compatibility.theme", true);
    Services.prefs.setBoolPref("userChrome.compatibility.os", true);

    Services.prefs.setBoolPref("userChrome.theme.built_in_contrast", true);
    Services.prefs.setBoolPref("userChrome.theme.system_default", true);
    Services.prefs.setBoolPref("userChrome.theme.proton_color", true);
    Services.prefs.setBoolPref("userChrome.theme.proton_chrome", true); // Need proton_color
    Services.prefs.setBoolPref("userChrome.theme.fully_color", true); // Need proton_color
    Services.prefs.setBoolPref("userChrome.theme.fully_dark", true); // Need proton_color

    Services.prefs.setBoolPref("userChrome.decoration.cursor", true);
    Services.prefs.setBoolPref("userChrome.decoration.field_border", true);
    Services.prefs.setBoolPref("userChrome.decoration.download_panel", true);
    Services.prefs.setBoolPref("userChrome.decoration.animate", true);

    Services.prefs.setBoolPref("userChrome.padding.tabbar_width", true);
    Services.prefs.setBoolPref("userChrome.padding.tabbar_height", true);
    Services.prefs.setBoolPref("userChrome.padding.toolbar_button", true);
    Services.prefs.setBoolPref("userChrome.padding.navbar_width", true);
    Services.prefs.setBoolPref("userChrome.padding.urlbar", true);
    Services.prefs.setBoolPref("userChrome.padding.bookmarkbar", true);
    Services.prefs.setBoolPref("userChrome.padding.infobar", true);
    Services.prefs.setBoolPref("userChrome.padding.menu", true);
    Services.prefs.setBoolPref("userChrome.padding.bookmark_menu", true);
    Services.prefs.setBoolPref("userChrome.padding.global_menubar", true);
    Services.prefs.setBoolPref("userChrome.padding.panel", true);
    Services.prefs.setBoolPref("userChrome.padding.popup_panel", true);

    Services.prefs.setBoolPref("userChrome.tab.multi_selected", true);
    Services.prefs.setBoolPref("userChrome.tab.unloaded", true);
    Services.prefs.setBoolPref("userChrome.tab.letters_cleary", true);
    Services.prefs.setBoolPref("userChrome.tab.close_button_at_hover", true);
    Services.prefs.setBoolPref("userChrome.tab.sound_hide_label", true);
    Services.prefs.setBoolPref("userChrome.tab.sound_with_favicons", true);
    Services.prefs.setBoolPref("userChrome.tab.pip", true);
    Services.prefs.setBoolPref("userChrome.tab.container", true);
    Services.prefs.setBoolPref("userChrome.tab.crashed", true);

    Services.prefs.setBoolPref("userChrome.fullscreen.overlap", true);
    Services.prefs.setBoolPref("userChrome.fullscreen.show_bookmarkbar", true);

    Services.prefs.setBoolPref("userChrome.icon.library", true);
    Services.prefs.setBoolPref("userChrome.icon.panel", true);
    Services.prefs.setBoolPref("userChrome.icon.menu", true);
    Services.prefs.setBoolPref("userChrome.icon.context_menu", true);
    Services.prefs.setBoolPref("userChrome.icon.global_menu", true);
    Services.prefs.setBoolPref("userChrome.icon.global_menubar", true);
    Services.prefs.setBoolPref("userChrome.icon.1-25px_stroke", true);

    // -- User Content -------------------------------------------------------------
    Services.prefs.setBoolPref("userContent.player.ui", true);
    Services.prefs.setBoolPref("userContent.player.icon", true);
    Services.prefs.setBoolPref("userContent.player.noaudio", true);
    Services.prefs.setBoolPref("userContent.player.size", true);
    Services.prefs.setBoolPref("userContent.player.click_to_play", true);
    Services.prefs.setBoolPref("userContent.player.animate", true);

    Services.prefs.setBoolPref("userContent.newTab.full_icon", true);
    Services.prefs.setBoolPref("userContent.newTab.animate", true);
    Services.prefs.setBoolPref("userContent.newTab.pocket_to_last", true);
    Services.prefs.setBoolPref("userContent.newTab.searchbar", true);

    Services.prefs.setBoolPref("userContent.page.field_border", true);
    Services.prefs.setBoolPref("userContent.page.illustration", true);
    Services.prefs.setBoolPref("userContent.page.proton_color", true);
    Services.prefs.setBoolPref("userContent.page.dark_mode", true); // Need proton_color
    Services.prefs.setBoolPref("userContent.page.proton", true); // Need proton_color

    // ** Useful Options ***********************************************************
    // Tab preview
    // https://blog.nightly.mozilla.org/2024/02/06/a-preview-of-tab-previews-these-weeks-in-firefox-issue-153/
    Services.prefs.setBoolPref("browser.tabs.cardPreview.enabled", true);

    // Paste suggestion at urlbar
    // https://blog.nightly.mozilla.org/2023/12/04/url-gonna-want-to-check-this-out-these-weeks-in-firefox-issue-150/
    Services.prefs.setBoolPref("browser.urlbar.clipboard.featureGate", true);

    // Integrated calculator at urlbar
    Services.prefs.setBoolPref("browser.urlbar.suggest.calculator", true);

    gFloorpDesign.setBrowserDesign();
  },

  toggleNavigationPanel() {
    const navigationBar = document.getElementById("nav-bar");
    navigationBar.style.display = navigationBar.style.display ? "" : "none";
  },

  hideUserInterface() {
    let shownElementAmount = 0;

    const navigationToolboxElements =
      document.getElementById("navigator-toolbox").children;
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
  },
};

gFloorpDesign.init();
