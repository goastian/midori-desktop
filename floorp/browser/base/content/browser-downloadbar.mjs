/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { gFloorpCommands } from "./browser-commands.mjs";

export const gFloorpLegacyStyleDownloadBar = {
  _initialized: false,

  get legacyStyleDownloadBarCSS() {
    return "@import url('chrome://floorp/skin/designs/options/legacy-style-downloadbar.css');";
  },

  init() {
    if (this._initialized) {
      return;
    }

    // Set scroll event to the downloadsListBox
    const scrollElem = document.getElementById("downloadsListBox");
    scrollElem.addEventListener("wheel", e => {
      if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) {
        return;
      }
      e.preventDefault();
      scrollElem.scrollLeft += e.deltaY * 8;
    });

    // Move the downloadsPanel to the appcontent element
    document
      .getElementById("appcontent")
      .appendChild(document.getElementById("downloadsPanel"));
    document
      .getElementById("downloadsFooter")
      .appendChild(document.getElementById("downloadsSummary"));
    document.getElementById("downloadsPanel").style.display = "block";
    document.getElementById("downloadsPanel").hidden = false;
    document.querySelector("#downloadsFooter > stack").remove();

    // Change the tagName of the XUL elements
    gFloorpCommands.changeXULElementTagName(
      document.getElementById("downloadsPanel"),
      "vbox"
    );
    gFloorpCommands.changeXULElementTagName(
      document.getElementById("downloadsPanel-multiView"),
      "vbox"
    );
    gFloorpCommands.changeXULElementTagName(
      document.getElementById("downloadsPanel-mainView"),
      "vbox"
    );
    gFloorpCommands.changeXULElementTagName(
      document.getElementById("downloadsFooter"),
      "richlistitem"
    );

    // Add the close button
    const elem = document.createElement("div");
    elem.id = "close";
    elem.textContent = `X`;
    elem.setAttribute("flex", "1");
    document.head.appendChild(elem);

    const Tag = document.createElement("style");
    Tag.textContent = this.legacyStyleDownloadBarCSS;
    document.head.appendChild(Tag);

    //delete all downloads button

    const downloadsFooterButtonElem =
      document.getElementById("downloadsFooter");
    const hideAllDownloadButtonElem = window.MozXULElement.parseXULToFragment(`
      <toolbarbutton id="hide-downloads-button" class="toolbarbutton-1" command="downloadsCmd_clearList"
                     data-l10n-id="floorp-delete-all-downloads" />
    `);
    const showAllDownloadTextAndButtonElem = window.MozXULElement
      .parseXULToFragment(`
      <toolbarbutton id="show-downloads-button" class="toolbarbutton-1" oncommand="BrowserDownloadsUI();"
                     data-l10n-id="floorp-show-all-downloads" />
    `);

    document
      .getElementById("downloadsListBox")
      .appendChild(downloadsFooterButtonElem);
    document
      .getElementById("downloadsListBox")
      .appendChild(showAllDownloadTextAndButtonElem);
    document
      .getElementById("downloadsListBox")
      .appendChild(hideAllDownloadButtonElem);

    this._initialized = true;
  },
};

if (Services.prefs.getBoolPref("floorp.browser.native.downloadbar.enabled")) {
  gFloorpLegacyStyleDownloadBar.init();
}
