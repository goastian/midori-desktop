/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gFloorpOnLocationChange = {
  webProgress: null,
  request: null,
  locationURI: null,
  flags: null,
  isSimulated: null,

  init() {
    window.floorpOnLocationChangeEvent = new CustomEvent(
      "floorpOnLocationChangeEvent",
      {
        bubbles: true,
        cancelable: true,
      },
    );
  },

  // This is called when the location of the browser changes from Firefox's browser.js
  onLocationChange(aWebProgress, aRequest, aLocationURI, aFlags, aIsSimulated) {
    this.webProgress = aWebProgress;
    this.request = aRequest;
    this.locationURI = aLocationURI;
    this.flags = aFlags;
    this.isSimulated = aIsSimulated;

    // Dispatch the event
    document.dispatchEvent(window.floorpOnLocationChangeEvent);
  },
};

gFloorpOnLocationChange.init();
