/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PrivateBrowsingUtils } from "resource://gre/modules/PrivateBrowsingUtils.sys.mjs";

export const EXPORTED_SYMBOLS = ["FloorpServices"];

export const FloorpServices = {
  wm: {
    getMainWindowExcludeFloorpSpecialWindows(options = {}) {
      const wins = Services.wm.getEnumerator("navigator:browser");
      for (const win of wins) {
        if (
          !this.IsFloorpSpecialWindow(win) &&
          !win.closed &&
          (options.allowPopups || win.toolbar.visible) &&
          (!("private" in options) ||
            !PrivateBrowsingUtils.isWindowPrivate(win) ||
            PrivateBrowsingUtils.permanentPrivateBrowsing)
        ) {
          return win;
        }
      }
      return null;
    },

    IsFloorpSpecialWindow(win) {
      if (win.floorpSsbWindow || win.floorpWebPanelWindow) {
        return true;
      }
      return false;
    },
  },

  SessionStore: {
    filterFloorpSpecificWindowAndTabs(browserState) {
      for (let i = browserState.windows.length - 1; i >= 0; i--) {
        const win = browserState.windows[i];
        if (win.floorpShouldNotRestore) {
          browserState.windows.splice(i, 1);

          if (browserState.selectedWindow >= i) {
            browserState.selectedWindow--;
          }
        }
      }

      // Remove private closed windows.
      browserState._closedWindows = browserState._closedWindows.filter(
        win => !win.floorpShouldNotRestore
      );
      return browserState;
    },
  },
};
