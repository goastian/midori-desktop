/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const MAINTENANCE_INTERVAL_SECONDS = 7 * 86400;

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PlacesDBUtils: "resource://gre/modules/PlacesDBUtils.sys.mjs",
});

export function PlacesDBUtilsIdleMaintenance() {}

PlacesDBUtilsIdleMaintenance.prototype = {
  observe(subject, topic) {
    switch (topic) {
      case "idle-daily": {
        // Once a week run places.sqlite maintenance tasks.
        let lastMaintenance = Services.prefs.getIntPref(
          "places.database.lastMaintenance",
          0
        );
        let nowSeconds = Math.floor(Date.now() / 1000);
        if (lastMaintenance < nowSeconds - MAINTENANCE_INTERVAL_SECONDS) {
          lazy.PlacesDBUtils.maintenanceOnIdle();
        }
        break;
      }
      default:
        throw new Error("Trying to handle an unknown category.");
    }
  },
  classID: Components.ID("d38926e0-29c1-11eb-8588-0800200c9a66"),
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
};
