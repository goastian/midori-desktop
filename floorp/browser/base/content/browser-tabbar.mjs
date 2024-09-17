/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with This
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { gFloorpDesign } from "./browser-design.mjs";

try {
  var { gBmsWindow } = await import(
    "chrome://floorp/content/browser-bms-window.mjs"
  );
} catch (e) { }

/**
 * Object of Floorp Tab Bar style code.
 *
 * @typedef {object} gFloorpTabBarStyle
 * @property {boolean} _initialized - Flag indicating if the tab bar style has been initialized.
 * @property {Function} modifyCSS - Function to modify the CSS of the tab bar.
 * @property {HTMLElement} PanelUIMenuButton - The Panel UI menu button element.
 * @property {string} tabbarDisplayStylePref - The preference key for the tab bar display style.
 * @property {HTMLElement} tabbarElement - The tab bar element.
 * @property {HTMLElement} titleBarElement - The title bar element.
 * @property {HTMLElement} navbarElement - The navigation bar element.
 * @property {HTMLElement} tabbarWindowManageContainer - The container element for managing the tab bar window.
 * @property {HTMLElement} navigatorToolboxtabbarElement - The tab bar element within the navigator toolbox.
 * @property {HTMLElement} browserElement - The browser element.
 * @property {Function} init - Function to initialize the tab bar style.
 * @property {Function} setTabbarDisplayStyle - Function to set the tab bar display style.
 * @property {Function} revertToDefaultStyle - Function to revert to the default tab bar style.
 * @property {Function} setMultirowTabMaxHeight - Function to set the maximum height of multi-row tabs.
 */

export const gFloorpTabBarStyle = {
  _initialized: false,
  modifyCSS: null,

  get PanelUIMenuButton() {
    return document.querySelector("#PanelUI-menu-button");
  },
  get tabbarDisplayStylePref() {
    return "floorp.browser.tabbar.settings";
  },
  get tabbarElement() {
    return document.querySelector("#TabsToolbar");
  },
  get titleBarElement() {
    return document.querySelector("#titlebar");
  },
  get navbarElement() {
    return document.querySelector("#nav-bar");
  },
  get navbarCustomElement() {
    return document.querySelector("#nav-bar-customization-target");
  },
  get tabbarWindowManageContainer() {
    return document.querySelector(
      "#TabsToolbar > .titlebar-buttonbox-container"
    );
  },
  get navigatorToolboxtabbarElement() {
    return document.querySelector("#navigator-toolbox");
  },
  get browserElement() {
    return document.querySelector("#browser");
  },

  init() {
    if (this._initialized || gBmsWindow?.isBmsWindow) {
      return;
    }

    gFloorpTabBarStyle.tabbarElement.setAttribute(
      "floorp-tabbar-display-style",
      Services.prefs.getIntPref(gFloorpTabBarStyle.tabbarDisplayStylePref)
    );
    gFloorpTabBarStyle.tabbarWindowManageContainer.id =
      "floorp-tabbar-window-manage-container";

    if (
      Services.prefs.getIntPref("floorp.tabbar.style") == 1 ||
      Services.prefs.getIntPref("floorp.tabbar.style") == 2
    ) {
      gFloorpTabBarStyle.setMultirowTabMaxHeight();
    }

    Services.prefs.addObserver(
      "floorp.browser.tabbar.multirow.max.row",
      gFloorpTabBarStyle.setMultirowTabMaxHeight
    );
    Services.prefs.addObserver(
      "floorp.browser.tabbar.multirow.max.enabled",
      gFloorpTabBarStyle.setMultirowTabMaxHeight
    );
    Services.prefs.addObserver(
      "floorp.verticaltab.paddingtop.enabled",
      gFloorpTabBarStyle.enablePadding
    );

    function applyMultitab() {
      const tabbarStyle = Services.prefs.getIntPref("floorp.tabbar.style");

      if (tabbarStyle == 1 || tabbarStyle == 2) {
        gFloorpDesign.setBrowserDesign();
        gFloorpTabBarStyle.setMultirowTabMaxHeight();
      } else {
        gFloorpTabBarStyle.removeMultirowTabMaxHeight();
        gFloorpDesign.setBrowserDesign();
      }
    }
    Services.prefs.addObserver("floorp.tabbar.style", applyMultitab);

    const tabs = document.querySelector(`#tabbrowser-tabs`);
    tabs.on_wheel = event => {
      if (Services.prefs.getBoolPref("toolkit.tabbox.switchByScrolling")) {
        if (
          event.deltaY > 0 !=
          Services.prefs.getBoolPref("floorp.tabscroll.reverse")
        ) {
          tabs.advanceSelectedTab(
            1,
            Services.prefs.getBoolPref("floorp.tabscroll.wrap")
          );
        } else {
          tabs.advanceSelectedTab(
            -1,
            Services.prefs.getBoolPref("floorp.tabscroll.wrap")
          );
        }
        event.preventDefault();
        event.stopPropagation();
      }
    };

    // Apply the tabbar display style
    gFloorpTabBarStyle.setTabbarDisplayStyle();

    //listen
    Services.prefs.addObserver(
      gFloorpTabBarStyle.tabbarDisplayStylePref,
      gFloorpTabBarStyle.setTabbarDisplayStyle
    );

    this._initialized = true;
  },

  setTabbarDisplayStyle() {
    gFloorpTabBarStyle.tabbarElement.setAttribute(
      "floorp-tabbar-display-style",
      Services.prefs.getIntPref(gFloorpTabBarStyle.tabbarDisplayStylePref)
    );

    switch (
    Services.prefs.getIntPref(gFloorpTabBarStyle.tabbarDisplayStylePref)
    ) {
      default:
        //default style
        gFloorpTabBarStyle.revertToDefaultStyle();
        gFloorpTabBarStyle.navigatorToolboxtabbarElement.setAttribute(
          "floorp-tabbar-display-style",
          "0"
        );
        break;
      case 1:
        gFloorpTabBarStyle.revertToDefaultStyle();

        //hide tabbar
        gFloorpTabBarStyle.modifyCSS = document.createElement("style");
        gFloorpTabBarStyle.modifyCSS.id = "floorp-tabbar-modify-css";
        gFloorpTabBarStyle.modifyCSS.textContent = `
           #TabsToolbar-customization-target {
             display: none !important;
           }
         `;
        document
          .querySelector("head")
          .appendChild(gFloorpTabBarStyle.modifyCSS);
        gFloorpTabBarStyle.tabbarElement.setAttribute(
          "floorp-tabbar-display-style",
          "1"
        );
        break;

      case 2:
        gFloorpTabBarStyle.revertToDefaultStyle();

        //optimize vertical tabbar
        gFloorpTabBarStyle.tabbarElement.setAttribute("hidden", "true");
        gFloorpTabBarStyle.navbarElement.appendChild(
          document.querySelector("#floorp-tabbar-window-manage-container")
        );
        gFloorpTabBarStyle.modifyCSS = document.createElement("style");
        gFloorpTabBarStyle.modifyCSS.id = "floorp-tabbar-modify-css";
        gFloorpTabBarStyle.modifyCSS.textContent = `
           #toolbar-menubar > .titlebar-buttonbox-container {
             display: none !important;
           }
           #titlebar {
             display: inherit;
             appearance: none !important;
           }
           :root[sizemode="fullscreen"] #titlebar[id] {
             flex-basis: auto;
           }
           #TabsToolbar #firefox-view-button[flex] > .toolbarbutton-icon {
             height: 16px !important;
             width: 16px !important;
             padding: 0px !important;
             margin: 0px !important;
             margin-inline-start: 7px !important;
           }
         `;

        gFloorpTabBarStyle.enablePadding();

        document
          .querySelector("head")
          .appendChild(gFloorpTabBarStyle.modifyCSS);
        gFloorpTabBarStyle.tabbarElement.setAttribute(
          "floorp-tabbar-display-style",
          "1"
        );

        window.setTimeout(() => { }, 3000);
        break;
      case 3:
        gFloorpTabBarStyle.revertToDefaultStyle();

        //move tabbar to navigator-toolbox's bottom
        gFloorpTabBarStyle.navigatorToolboxtabbarElement.appendChild(
          gFloorpTabBarStyle.tabbarElement
        );
        if (AppConstants.platform == "macosx") {
          gFloorpTabBarStyle.navbarCustomElement.after(
            document.querySelector("#floorp-tabbar-window-manage-container")
          );
        } else {
          gFloorpTabBarStyle.PanelUIMenuButton.after(
            document.querySelector("#floorp-tabbar-window-manage-container")
          );
        }
        gFloorpTabBarStyle.modifyCSS = document.createElement("style");
        gFloorpTabBarStyle.modifyCSS.id = "floorp-tabbar-modify-css";
        gFloorpTabBarStyle.modifyCSS.textContent = `
             #toolbar-menubar > .titlebar-buttonbox-container {
               display: none !important;
             }
             #titlebar {
               appearance: none !important;
             }
             #TabsToolbar #workspace-button[label] > .toolbarbutton-icon,
             #TabsToolbar #firefox-view-button > .toolbarbutton-icon {
               height: 16px !important;
               width: 16px !important;
               padding: 0px !important;
             }
           `;
        if (AppConstants.platform == "macosx") {
          gFloorpTabBarStyle.modifyCSS.textContent += `
             #floorp-tabbar-window-manage-container {
               order: -1;
             }
           `;
        }
        document
          .querySelector("head")
          .appendChild(gFloorpTabBarStyle.modifyCSS);
        gFloorpTabBarStyle.tabbarElement.setAttribute(
          "floorp-tabbar-display-style",
          "2"
        );
        break;
      case 4:
        gFloorpTabBarStyle.revertToDefaultStyle();

        //move tabbar to window's bottom
        gFloorpTabBarStyle.browserElement.after(
          gFloorpTabBarStyle.titleBarElement
        );
        if (AppConstants.platform == "macosx") {
          gFloorpTabBarStyle.navbarCustomElement.after(
            document.querySelector("#floorp-tabbar-window-manage-container")
          );
        } else {
          gFloorpTabBarStyle.PanelUIMenuButton.after(
            document.querySelector("#floorp-tabbar-window-manage-container")
          );
        }
        gFloorpTabBarStyle.modifyCSS = document.createElement("style");
        gFloorpTabBarStyle.modifyCSS.id = "floorp-tabbar-modify-css";
        gFloorpTabBarStyle.modifyCSS.textContent = `
           #toolbar-menubar > .titlebar-buttonbox-container {
             display: none !important;
           }
           :root[inFullscreen]:not([macOSNativeFullscreen]) #titlebar {
             display: none !important;
           }
         `;
        if (AppConstants.platform == "macosx") {
          gFloorpTabBarStyle.modifyCSS.textContent += `
             #floorp-tabbar-window-manage-container {
               order: -1;
             }
           `;
        }
        document
          .querySelector("head")
          .appendChild(gFloorpTabBarStyle.modifyCSS);
        gFloorpTabBarStyle.tabbarElement.setAttribute(
          "floorp-tabbar-display-style",
          "3"
        );
        // set margin to the top of urlbar container & allow moving the window
        document.getElementById("urlbar-container").style.marginTop = "5px";
        break;
    }
  },

  revertToDefaultStyle() {
    gFloorpTabBarStyle.tabbarElement.removeAttribute(
      "floorp-tabbar-display-style"
    );
    gFloorpTabBarStyle.tabbarElement.removeAttribute("hidden");
    gFloorpTabBarStyle.tabbarElement.appendChild(
      document.querySelector("#floorp-tabbar-window-manage-container")
    );
    gFloorpTabBarStyle.titleBarElement.appendChild(
      gFloorpTabBarStyle.tabbarElement
    );
    gFloorpTabBarStyle.navigatorToolboxtabbarElement.prepend(
      gFloorpTabBarStyle.titleBarElement
    );
    document.querySelector("#floorp-tabbar-modify-css")?.remove();
    gFloorpTabBarStyle.tabbarElement.removeAttribute(
      "floorp-tabbar-display-style"
    );
    // Remove tabbar margin from the top (when tabs are at the bottom)
    document
      .getElementById("urlbar-container")
      ?.style.removeProperty("margin-top");
  },

  setMultirowTabMaxHeight() {
    const arrowscrollbox = document.querySelector("#tabbrowser-arrowscrollbox");
    const scrollbox =
      arrowscrollbox.shadowRoot.querySelector("[part=scrollbox]");

    arrowscrollbox.style.maxHeight = "";
    scrollbox.removeAttribute("style");

    const isMultiRowTabEnabled = Services.prefs.getBoolPref(
      "floorp.browser.tabbar.multirow.max.enabled"
    );
    const rowValue = Services.prefs.getIntPref(
      "floorp.browser.tabbar.multirow.max.row"
    );

    const tabHeight = document.querySelector(
      ".tabbrowser-tab:not([hidden='true'])"
    ).clientHeight;

    if (
      isMultiRowTabEnabled &&
      Services.prefs.getIntPref("floorp.tabbar.style") == 1
    ) {
      scrollbox.setAttribute(
        "style",
        `max-height: ${tabHeight * rowValue}px !important;`
      );
      arrowscrollbox.style.maxHeight = "";
    } else {
      arrowscrollbox.style.maxHeight = "unset";
    }
  },

  removeMultirowTabMaxHeight() {
    const scrollbox = document
      .querySelector("#tabbrowser-arrowscrollbox")
      .shadowRoot.querySelector("[part=scrollbox]");
    scrollbox.removeAttribute("style");
  },

  enablePadding() {
    const isPaddingTopEnabled = Services.prefs.getBoolPref(
      "floorp.verticaltab.paddingtop.enabled",
      false
    );
    document.getElementById("titlebar").style.padding = isPaddingTopEnabled
      ? "5px"
      : "0px";
  },
};

gFloorpTabBarStyle.init();
