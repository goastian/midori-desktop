/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createEffect, createSignal } from "solid-js";
import type { } from "solid-styled-jsx";
export const [showDownloadbar, setShowDownloadbar] = createSignal(
  Services.prefs.getBoolPref("floorp.browser.native.downloadbar.enabled", false),
);
export class DownloadBarManager {
  constructor() {
    createEffect(() => {
      Services.prefs.setBoolPref("floorp.browser.native.downloadbar.enabled", showDownloadbar());
    });


    //move elem to bottom of window
    document
      .querySelector("#appcontent")
      ?.appendChild(document.getElementById("downloadsPanel")!);
      this.observeDownloadbar();
  }

  //if we use just method, `this` will be broken
  private observeDownloadbar() {
    Services.prefs.addObserver("floorp.browser.native.downloadbar.enabled", () =>
      setShowDownloadbar(() => Services.prefs.getBoolPref("floorp.browser.native.downloadbar.enabled")),
    );
  }
}
