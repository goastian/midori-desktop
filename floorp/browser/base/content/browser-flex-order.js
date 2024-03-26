/* eslint-disable no-undef */
/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let gFlexOrder = {
  _flexOrderInitialized: false,

  init() {
    this.setFlexOrder();
    this._flexOrderInitialized = true;

    // Override Firefox's sidebar position & Floorp sidebar position.
    // Listen to "sidebarcommand" event.
    // Firefox pref: true = left, false = right
    // Floorp pref: true = right, false = left
    const fxSidebarPosition = "sidebar.position_start";
    const floorpSidebarPosition = "floorp.browser.sidebar.right";
    const verticaltabPosition = "floorp.browser.tabs.verticaltab.right";
    Services.prefs.addObserver(fxSidebarPosition, this.setFlexOrder);
    Services.prefs.addObserver(floorpSidebarPosition, this.setFlexOrder);
    Services.prefs.addObserver(verticaltabPosition, this.setFlexOrder);
  },

  setFlexOrder() {
    const fxSidebarPosition = "sidebar.position_start";
    const floorpSidebarPosition = "floorp.browser.sidebar.right";
    let fxSidebarPositionPref = Services.prefs.getBoolPref(fxSidebarPosition);
    let floorpSidebarPositionPref = Services.prefs.getBoolPref(
      floorpSidebarPosition,
    );
    let verticaltabPositionPref = Services.prefs.getBoolPref(
      "floorp.browser.tabs.verticaltab.right",
    );

    let fxSidebar = document.getElementById("sidebar-box");
    let fxSidebarSplitter = document.getElementById("sidebar-splitter");

    let floorpSidebar = document.getElementById("sidebar2-box");
    let floorpSidebarSplitter = document.getElementById("sidebar-splitter2");
    let floorpSidebarSelectBox = document.getElementById("sidebar-select-box");

    let verticaltabbar = document.getElementById("TabsToolbar");
    let verticaltabbarSplitter = document.getElementById(
      "verticaltab-splitter",
    );

    let browserBox = document.getElementById("appcontent");

    // Set flex order to all elements
    // floorpSidebarSelectBox has to always be the window's last child
    // Vetical tab bar has to always be the window's first child.
    // Fx's sidebar has to always be between the vertical tab bar and the floorp's sidebar.
    // Seeking opinions on whether we should nest.

    if (verticaltabPositionPref) {
      if (fxSidebarPositionPref && floorpSidebarPositionPref) {
        // Default
        // Fx's sidebar -> browser -> Vertical tab bar -> Floorp's sidebar
        fxSidebar.style.order = "0";
        fxSidebarSplitter.style.order = "1";
        browserBox.style.order = "2";
        verticaltabbarSplitter.style.order = "3";
        verticaltabbar.style.order = "4";
        floorpSidebarSplitter.style.order = "5";
        floorpSidebar.style.order = "6";
        floorpSidebarSelectBox.style.order = "7";
      } else if (fxSidebarPositionPref && !floorpSidebarPositionPref) {
        // Floorp sidebar -> Fx's sidebar -> browser -> Vertical tab bar
        floorpSidebarSelectBox.style.order = "0";
        floorpSidebar.style.order = "1";
        floorpSidebarSplitter.style.order = "2";
        fxSidebar.style.order = "3";
        fxSidebarSplitter.style.order = "4";
        browserBox.style.order = "5";
        verticaltabbarSplitter.style.order = "6";
        verticaltabbar.style.order = "7";
      } else if (!fxSidebarPositionPref && floorpSidebarPositionPref) {
        // browser -> Vertical tab bar -> Fx's sidebar -> Floorp's sidebar
        browserBox.style.order = "0";
        verticaltabbarSplitter.style.order = "1";
        verticaltabbar.style.order = "2";
        fxSidebar.style.order = "3";
        fxSidebarSplitter.style.order = "4";
        floorpSidebarSplitter.style.order = "5";
        floorpSidebar.style.order = "6";
        floorpSidebarSelectBox.style.order = "7";
      } else {
        // !fxSidebarPositionPref && !floorpSidebarPositionPref
        // Floorp's sidebar -> browser -> Vertical tab bar -> Fx's sidebar
        floorpSidebarSelectBox.style.order = "0";
        floorpSidebar.style.order = "1";
        floorpSidebarSplitter.style.order = "2";
        browserBox.style.order = "3";
        verticaltabbarSplitter.style.order = "4";
        verticaltabbar.style.order = "5";
        fxSidebar.style.order = "6";
        fxSidebarSplitter.style.order = "7";
      }

      // Add attribute to vertical tab bar
      verticaltabbar?.setAttribute("positionend", "true");
    } else if (!verticaltabPositionPref) {
      if (fxSidebarPositionPref && floorpSidebarPositionPref) {
        // Fx's sidebar -> vertical tab bar -> browser -> Floorp's sidebar
        fxSidebar.style.order = "0";
        fxSidebarSplitter.style.order = "1";
        verticaltabbar.style.order = "2";
        verticaltabbarSplitter.style.order = "3";
        browserBox.style.order = "4";
        floorpSidebarSplitter.style.order = "5";
        floorpSidebar.style.order = "6";
        floorpSidebarSelectBox.style.order = "7";
      } else if (fxSidebarPositionPref && !floorpSidebarPositionPref) {
        // Floorp sidebar -> Fx's sidebar -> vertical tab bar -> browser
        floorpSidebarSelectBox.style.order = "0";
        floorpSidebar.style.order = "1";
        floorpSidebarSplitter.style.order = "2";
        fxSidebar.style.order = "3";
        fxSidebarSplitter.style.order = "4";
        verticaltabbar.style.order = "5";
        verticaltabbarSplitter.style.order = "6";
        browserBox.style.order = "7";
      } else if (!fxSidebarPositionPref && floorpSidebarPositionPref) {
        // vertical tab bar -> browser -> Fx's sidebar -> Floorp's sidebar
        verticaltabbar.style.order = "0";
        verticaltabbarSplitter.style.order = "1";
        browserBox.style.order = "2";
        fxSidebarSplitter.style.order = "3";
        fxSidebar.style.order = "4";
        floorpSidebarSplitter.style.order = "5";
        floorpSidebar.style.order = "6";
        floorpSidebarSelectBox.style.order = "7";
      } else {
        // !fxSidebarPositionPref && !floorpSidebarPositionPref
        // Floorp's sidebar -> browser -> vertical tab bar -> Fx's sidebar
        floorpSidebarSelectBox.style.order = "0";
        floorpSidebar.style.order = "1";
        floorpSidebarSplitter.style.order = "2";
        browserBox.style.order = "3";
        verticaltabbar.style.order = "4";
        verticaltabbarSplitter.style.order = "5";
        fxSidebar.style.order = "6";
        fxSidebarSplitter.style.order = "7";
      }
      // Remove attribute from vertical tab bar
      verticaltabbar?.removeAttribute("positionend");
    }
  },
};

gFlexOrder.init();
