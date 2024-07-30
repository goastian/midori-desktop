/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Object of Floorp flex order module.
 *
 * @typedef {object} gFloorpFlexOrder
 * @property {boolean} _flexOrderInitialized - Whether the flex order has been initialized.
 * @property {Function} init - Initialize the flex order.
 * @property {Function} setFlexOrder - Set the flex order of the elements.
 */
export const gFloorpFlexOrder = {
  _flexOrderInitialized: false,

  get fxSidebarId() {
    return "sidebar-box";
  },
  get fxSidebarSplitterId() {
    return "sidebar-splitter";
  },
  get floorpSidebarId() {
    return "sidebar2-box";
  },
  get floorpSidebarSplitterId() {
    return "sidebar-splitter2";
  },
  get floorpSidebarSelectBoxId() {
    return "sidebar-select-box";
  },
  get verticalTabBarId() {
    return "TabsToolbar";
  },
  get verticalTabBarSplitterId() {
    return "verticaltab-splitter";
  },
  get getBrowserBoxId() {
    return "appcontent";
  },

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

  applyNewFlexOrder(orders) {
    if (document.getElementById("floorp-flex-order")) {
      document.getElementById("floorp-flex-order").remove();
    }

    const newStyleSheetElem = document.createElement("style");
    newStyleSheetElem.id = "floorp-flex-order";
    newStyleSheetElem.textContent = `
      #${gFloorpFlexOrder.fxSidebarId} {
        order: ${orders.fxSidebar} !important;
      }
      #${gFloorpFlexOrder.fxSidebarSplitterId} {
        order: ${orders.fxSidebarSplitter} !important;
      }
      #${gFloorpFlexOrder.floorpSidebarId} {
        order: ${orders.floorpSidebar} !important;
      }
      #${gFloorpFlexOrder.floorpSidebarSplitterId} {
        order: ${orders.floorpSidebarSplitter} !important;
      }
      #${gFloorpFlexOrder.floorpSidebarSelectBoxId} {
        order: ${orders.floorpSidebarSelectBox} !important;
      }
      #${gFloorpFlexOrder.getBrowserBoxId} {
        order: ${orders.browserBox} !important;
      }
      #${gFloorpFlexOrder.verticalTabBarId} {
        order: ${orders.verticaltabbar} !important;
      }
      #${gFloorpFlexOrder.verticalTabBarSplitterId} {
        order: ${orders.verticaltabbarSplitter} !important;
      }
    `;
    document.head.appendChild(newStyleSheetElem);
  },

  setFlexOrder() {
    const fxSidebarPosition = "sidebar.position_start";
    const floorpSidebarPosition = "floorp.browser.sidebar.right";
    const fxSidebarPositionPref = Services.prefs.getBoolPref(fxSidebarPosition);
    const floorpSidebarPositionPref = Services.prefs.getBoolPref(
      floorpSidebarPosition
    );
    const verticaltabPositionPref = Services.prefs.getBoolPref(
      "floorp.browser.tabs.verticaltab.right"
    );
    const verticaltabbar = document.getElementById("TabsToolbar");
    // Set flex order to all elements
    // floorpSidebarSelectBox has to always be the window's last child
    // Vetical tab bar has to always be the window's first child.
    // Fx's sidebar has to always be between the vertical tab bar and the floorp's sidebar.
    // Seeking opinions on whether we should nest.

    if (verticaltabPositionPref) {
      if (fxSidebarPositionPref && floorpSidebarPositionPref) {
        // Default
        // Fx's sidebar -> browser -> Vertical tab bar -> Floorp's sidebar
        const orders = {
          fxSidebar: 0,
          fxSidebarSplitter: 1,
          browserBox: 2,
          verticaltabbarSplitter: 3,
          verticaltabbar: 4,
          floorpSidebarSplitter: 5,
          floorpSidebar: 6,
          floorpSidebarSelectBox: 7,
        };
        gFloorpFlexOrder.applyNewFlexOrder(orders);
      } else if (fxSidebarPositionPref && !floorpSidebarPositionPref) {
        // Floorp sidebar -> Fx's sidebar -> browser -> Vertical tab bar
        const orders = {
          floorpSidebarSelectBox: 0,
          floorpSidebar: 1,
          floorpSidebarSplitter: 2,
          fxSidebar: 3,
          fxSidebarSplitter: 4,
          browserBox: 5,
          verticaltabbarSplitter: 6,
          verticaltabbar: 7,
        };

        gFloorpFlexOrder.applyNewFlexOrder(orders);
      } else if (!fxSidebarPositionPref && floorpSidebarPositionPref) {
        // browser -> Vertical tab bar -> Fx's sidebar -> Floorp's sidebar
        const orders = {
          browserBox: 0,
          verticaltabbarSplitter: 1,
          verticaltabbar: 2,
          fxSidebar: 3,
          fxSidebarSplitter: 4,
          floorpSidebarSplitter: 5,
          floorpSidebar: 6,
          floorpSidebarSelectBox: 7,
        };
        gFloorpFlexOrder.applyNewFlexOrder(orders);
      } else {
        // !fxSidebarPositionPref && !floorpSidebarPositionPref
        // Floorp's sidebar -> browser -> Vertical tab bar -> Fx's sidebar
        const orders = {
          floorpSidebarSelectBox: 0,
          floorpSidebar: 1,
          floorpSidebarSplitter: 2,
          browserBox: 3,
          verticaltabbarSplitter: 4,
          verticaltabbar: 5,
          fxSidebar: 6,
          fxSidebarSplitter: 7,
        };
        gFloorpFlexOrder.applyNewFlexOrder(orders);
      }

      // Add attribute to vertical tab bar
      verticaltabbar?.setAttribute("positionend", "true");
    } else if (!verticaltabPositionPref) {
      if (fxSidebarPositionPref && floorpSidebarPositionPref) {
        // Fx's sidebar -> vertical tab bar -> browser -> Floorp's sidebar
        const orders = {
          fxSidebar: 0,
          fxSidebarSplitter: 1,
          verticaltabbar: 2,
          verticaltabbarSplitter: 3,
          browserBox: 4,
          floorpSidebarSplitter: 5,
          floorpSidebar: 6,
          floorpSidebarSelectBox: 7,
        };

        gFloorpFlexOrder.applyNewFlexOrder(orders);
      } else if (fxSidebarPositionPref && !floorpSidebarPositionPref) {
        // Floorp sidebar -> Fx's sidebar -> vertical tab bar -> browser
        const orders = {
          floorpSidebarSelectBox: 0,
          floorpSidebar: 1,
          floorpSidebarSplitter: 2,
          fxSidebar: 3,
          fxSidebarSplitter: 4,
          verticaltabbar: 5,
          verticaltabbarSplitter: 6,
          browserBox: 7,
        };
        gFloorpFlexOrder.applyNewFlexOrder(orders);
      } else if (!fxSidebarPositionPref && floorpSidebarPositionPref) {
        // vertical tab bar -> browser -> Fx's sidebar -> Floorp's sidebar
        const orders = {
          verticaltabbar: 0,
          verticaltabbarSplitter: 1,
          browserBox: 2,
          fxSidebarSplitter: 3,
          fxSidebar: 4,
          floorpSidebarSplitter: 5,
          floorpSidebar: 6,
          floorpSidebarSelectBox: 7,
        };

        gFloorpFlexOrder.applyNewFlexOrder(orders);
      } else {
        // !fxSidebarPositionPref && !floorpSidebarPositionPref
        // Floorp's sidebar -> browser -> vertical tab bar -> Fx's sidebar
        const orders = {
          floorpSidebarSelectBox: 0,
          floorpSidebar: 1,
          floorpSidebarSplitter: 2,
          browserBox: 3,
          verticaltabbar: 4,
          verticaltabbarSplitter: 5,
          fxSidebar: 6,
          fxSidebarSplitter: 7,
        };
        gFloorpFlexOrder.applyNewFlexOrder(orders);
      }
      // Remove attribute from vertical tab bar
      verticaltabbar?.removeAttribute("positionend");
    }
  },
};

gFloorpFlexOrder.init();
