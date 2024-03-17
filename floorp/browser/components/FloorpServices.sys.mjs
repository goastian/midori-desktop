/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PrivateBrowsingUtils } from "resource://gre/modules/PrivateBrowsingUtils.sys.mjs";

export var EXPORTED_SYMBOLS = ["FloorpServices"];

export var FloorpServices = {
  wm: {
    getRecentWindowExcludeFloorpSpecialWindows(options = {}) {
      let wins = Services.wm.getEnumerator("navigator:browser");
      for (let win of wins) {
        if (
          !this.IsFloorpSpecialWindow(win) &&
          !win.closed &&
          (options.allowPopups || win.toolbar.visible) &&
          (
            !("private" in options) ||
            !PrivateBrowsingUtils.isWindowPrivate(win) ||
            PrivateBrowsingUtils.permanentPrivateBrowsing
          )
        ) {
          return win;
        }
        continue;
      }
      return null;
    },

    IsFloorpSpecialWindow(win) {
      if (
        win.floorpSsbWindow ||
        win.floorpWebPanelWindow
      ) {
        return true;
      }
      return false;
    }
  }
};
