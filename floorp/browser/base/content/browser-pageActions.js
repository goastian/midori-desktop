/* eslint-disable no-undef */
/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/****************************************************** QR Code ******************************************************/

var { SiteSpecificBrowserExternalFileService } = ChromeUtils.importESModule(
  "resource:///modules/SiteSpecificBrowserExternalFileService.sys.mjs"
);

var { SiteSpecificBrowser } = ChromeUtils.importESModule(
  "resource:///modules/SiteSpecificBrowserService.sys.mjs"
);

var { SiteSpecificBrowserIdUtils } = ChromeUtils.importESModule(
  "resource:///modules/SiteSpecificBrowserIdUtils.sys.mjs"
);

let gFloorpPageAction = {
  Ssb: {
    SsbPageActionButton: window.MozXULElement.parseXULToFragment(`
    <hbox id="ssbPageAction" data-l10n-id="ssb-page-action"
     class="urlbar-page-action" tooltiptext="ssb-page-action"
     role="button" popup="ssb-panel">
     <image id="ssbPageAction-image" class="urlbar-icon"/>
     <panel id="ssb-panel" type="arrow" position="bottomright topright" onpopupshowing="gSsbChromeManager.functions.setImageToInstallButton();">
     <vbox id="ssb-box">
       <vbox class="panel-header">
         <html:h1>
           <html:span data-l10n-id="ssb-page-action-title"></html:span>
         </html:h1>
       </vbox>
       <toolbarseparator/>
       <hbox id="ssb-content-hbox">
        <vbox id="ssb-content-icon-vbox">
         <html:img id="ssb-content-icon" width="48" height="48"/>
        </vbox>
        <vbox id="ssb-content-label-vbox">
         <html:h2>
          <label id="ssb-content-label"></label>
         </html:h2>
         <description id="ssb-content-description"></description>
        </vbox>
       </hbox>
       <hbox id="ssb-button-hbox">
        <vbox id="ssb-installing-vbox">
          <html:img id="ssb-installing-icon" hidden="true" src="chrome://browser/skin/pwa/installing.gif" width="48" height="48"/>
        </vbox>
        <button id="ssb-app-install-button" class="panel-button ssb-install-buttons" oncommand="gFloorpPageAction.Ssb.onCommand()"/>
        <button id="ssb-app-cancel-button" class="panel-button ssb-install-buttons" data-l10n-id="ssb-app-cancel-button" oncommand="gFloorpPageAction.Ssb.closePopup()"/>
        </hbox>
      </vbox>
     </panel>
    </hbox>
   `),

    async onCommand() {
      gSsbChromeManager.functions.installOrRunCurrentPageAsSsb(true);

      // Show installing gif
      let installingGif = document.getElementById("ssb-installing-icon");
      installingGif?.removeAttribute("hidden");

      // Hide install button
      let installButtons = document.getElementsByClassName(
        "ssb-install-buttons"
      );
      for (let installButton of installButtons) {
        installButton?.setAttribute("hidden", true);
      }
    },

    closePopup() {
      document.getElementById("ssb-panel").hidePopup();
      // Show installing gif
      let installingGif = document.getElementById("ssb-installing-icon");
      installingGif?.setAttribute("hidden", true);

      // Hide install button
      let installButtons = document.getElementsByClassName(
        "ssb-install-buttons"
      );
      for (let installButton of installButtons) {
        installButton?.removeAttribute("hidden");
      }
    },
  },
};

SessionStore.promiseInitialized.then(() => {
  document
    .getElementById("star-button-box")

  if (Services.prefs.getBoolPref("floorp.browser.ssb.enabled")) {
    document
      .getElementById("star-button-box")
      .before(gFloorpPageAction.Ssb.SsbPageActionButton);
  }
});
