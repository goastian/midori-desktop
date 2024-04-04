/* eslint-disable no-undef */
/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { SiteSpecificBrowserIdUtils } = ChromeUtils.importESModule(
  "resource:///modules/SiteSpecificBrowserIdUtils.sys.mjs",
);

var { SiteSpecificBrowser } = ChromeUtils.importESModule(
  "resource:///modules/SiteSpecificBrowserService.sys.mjs",
);

let gSsbSupport = {
  _initialized: false,

  get ssbWindowId() {
    return document.documentElement.getAttribute("FloorpSSBId");
  },

  get urlbar() {
    return document.getElementById("urlbar");
  },

  get searchbar() {
    return document.getElementById("searchbar");
  },

  get TabsToolbar() {
    return document.getElementById("TabsToolbar");
  },

  get panelUIBUtton() {
    return document.getElementById("PanelUI-menu-button");
  },

  get navToolbar() {
    return document.getElementById("nav-bar");
  },

  get pageActionBox() {
    return document.getElementById("page-action-buttons");
  },

  get identityBox() {
    return document.getElementById("identity-box");
  },

  get disableToolbar() {
    return Services.prefs.getBoolPref(
      "floorp.browser.ssb.toolbars.disabled",
      false
    );
  },

  async getSsbObj(id) {
    let result = await SiteSpecificBrowser.load(id);
    return result;
  },

  getIconShouldBlackOrWhite(color) {
    let r, g, b, hsp;
    if (color.match(/^rgb/)) {
      color = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      r = color[1];
      g = color[2];
      b = color[3];
    } else {
      color = +(
        "0x" + color.slice(1).replace(color.length < 5 && /./g, "$&$&")
      );
      r = color >> 16;
      g = (color >> 8) & 255;
      b = color & 255;
    }
    hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
    return hsp > 127.5 ? "black" : "white";
  },

  async init() {
    let styleElement = document.createElement("style");
    styleElement.id = "ssb-support";
    styleElement.textContent = `@import url("chrome://browser/content/browser-ssb-support.css");`;
    document.head.appendChild(styleElement);

    if (this.disableToolbar) {
      styleElement.textContent += `
        #nav-bar, #status-bar, #PersonalToolbar, #titlebar {
          display: none;
        }
      `;
    }

    this.identityBox.after(this.pageActionBox);

    gBrowser.tabs.forEach((tab) => {
      tab.setAttribute("floorpSSB", "true");
    });
    window.floorpSsbWindow = true;

    this._initialized = true;
  },
};

gSsbSupport.init();
