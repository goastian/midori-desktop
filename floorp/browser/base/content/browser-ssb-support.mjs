/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { gFloorpContextMenu } from "./browser-context-menu.mjs";
import { gFloorpPageAction } from "./browser-floorp-pageActions.mjs";
import { SiteSpecificBrowserExternalFileService } from "./modules/ssb/SiteSpecificBrowserExternalFileService.mjs";
import { SiteSpecificBrowserIdUtils } from "./modules/ssb/SiteSpecificBrowserIdUtils.mjs";
import {
  SiteSpecificBrowser,
  SiteSpecificBrowserService,
} from "./modules/ssb/SiteSpecificBrowserService.mjs";

try {
  var { gBmsWindow } = await import(
    "chrome://floorp/content/browser-bms-window.mjs"
  );
} catch (e) {}

const { ManifestObtainer } = ChromeUtils.importESModule(
  "resource://gre/modules/ManifestObtainer.sys.mjs"
);

export const gSsbSupport = {
  _initialized: false,

  init() {
    if (this._initialized || gBmsWindow?.isBmsWindow) {
      return;
    }

    const toolbarContextMenuElem = `
      <popupset>
        <menupopup id="ssbInstalledAppMenu-context" onpopupshowing="gSsbSupport.contextMenu.panelUIInstalledAppContextMenu.onPopupShowing(event);"/>
      </popupset>
    `;
    gFloorpContextMenu.addToolbarContentMenuPopupSet(toolbarContextMenuElem);

    if (Services.prefs.getBoolPref("floorp.browser.ssb.enabled", false)) {
      document.addEventListener("floorpOnLocationChangeEvent", function () {
        gSsbSupport.eventListeners.onCurrentTabChangedOrLoaded();
      });

      this._initialized = true;
    } else {
      // Hide XUL elements
      let css = `
        #ssbPageAction,
        #appMenu-ssb-button,
        #appMenu-install-or-open-ssb-current-page-button,
        #appMenu-ssb-button {
          display: none !important;
        }
      `;
      let sss = Cc["@mozilla.org/content/style-sheet-service;1"].getService(
        Ci.nsIStyleSheetService
      );
      let uri = window.makeURI("data:text/css," + encodeURIComponent(css));
      sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
    }
  },

  functions: {
    async installOrRunCurrentPageAsSsb(asPwa) {
      let isInstalled =
        await gSsbSupport.functions.checkCurrentPageIsInstalled();

      if (
        !SiteSpecificBrowserService.checkSiteCanBeInstall(
          window.gBrowser.currentURI
        )
      ) {
        return;
      }

      if (isInstalled) {
        let currentTabSsb = await gSsbSupport.functions.getCurrentTabSsb();
        let ssbObj = await SiteSpecificBrowserIdUtils.getIdByUrl(
          currentTabSsb._manifest.start_url
        );

        if (ssbObj) {
          let id = ssbObj.id;
          await SiteSpecificBrowserIdUtils.runSsbByUrlAndId(
            window.gBrowser.currentURI.spec,
            id
          );

          // The site's manifest may point to a different start page so explicitly
          // open the SSB to the current page.
          window.gBrowser.removeTab(window.gBrowser.selectedTab, {
            closeWindowWithLastTab: false,
          });
          gFloorpPageAction.Ssb.closePopup();
        }
      } else {
        let ssb = await SiteSpecificBrowser.createFromBrowser(
          window.gBrowser.selectedBrowser,
          {
            // Configure the SSB to use the site's manifest if it exists.
            useWebManifest: asPwa,
          }
        );

        await ssb.install();

        // Installing needs some time to finish. So we wait 4 seconds before
        window.setTimeout(() => {
          SiteSpecificBrowserIdUtils.runSsbById(ssb.id);

          // The site's manifest may point to a different start page so explicitly
          // open the SSB to the current page.
          window.gBrowser.removeTab(window.gBrowser.selectedTab, {
            closeWindowWithLastTab: false,
          });

          gFloorpPageAction.Ssb.closePopup();
        }, 3000);
      }
    },

    async checkCurrentPageHasSsbManifest() {
      const currentURI = window.gBrowser.currentURI;
      if (!SiteSpecificBrowserService.checkSiteCanBeInstall(currentURI)) {
        return false;
      }
      // If true, return the manifest href, otherwise return null
      let result = await ManifestObtainer.browserObtainManifest(
        window.gBrowser.selectedBrowser
      );
      return result;
    },

    async checkCurrentPageIsInstalled() {
      const currentURI = window.gBrowser.currentURI;
      if (!SiteSpecificBrowserService.checkSiteCanBeInstall(currentURI)) {
        return false;
      }

      let currentTabSsb = await gSsbSupport.functions.getCurrentTabSsb();
      let ssbData =
        await SiteSpecificBrowserExternalFileService.getCurrentSsbData();

      for (let key in ssbData) {
        if (
          key === currentTabSsb._manifest.start_url ||
          currentTabSsb._manifest.start_url.startsWith(key)
        ) {
          return true;
        }
      }
      return false;
    },

    enableInstallButton(openSsb) {
      let installButton = document.getElementById("ssbPageAction");
      installButton.removeAttribute("hidden");

      let image = document.getElementById("ssbPageAction-image");
      if (openSsb) {
        image.setAttribute("open-ssb", "true");
      } else {
        image.removeAttribute("open-ssb");
      }
    },

    disableInstallButton() {
      let installButton = document.getElementById("ssbPageAction");
      installButton.setAttribute("hidden", true);
    },

    async getCurrentTabSsb() {
      let options = {
        useWebManifest: true,
      };

      let currentURISsbObj = await SiteSpecificBrowser.createFromBrowser(
        window.gBrowser.selectedBrowser,
        options
      );

      return currentURISsbObj;
    },

    async setImageToInstallButton() {
      window.gBrowser.currentURI;

      let currentURISsbObj = await this.getCurrentTabSsb();
      let isInstalled = await this.checkCurrentPageIsInstalled();

      let currentTabTitle = currentURISsbObj.name;
      let currentTabIcon = currentURISsbObj._manifest.icons[0]?.src;
      let currentTabURL = currentURISsbObj._scope.displayHost;

      let ssbContentLabel = document.getElementById("ssb-content-label");
      let ssbContentDescription = document.getElementById(
        "ssb-content-description"
      );
      let ssbContentIcon = document.getElementById("ssb-content-icon");
      let installButton = document.querySelector("#ssb-app-install-button");

      if (ssbContentLabel) {
        ssbContentLabel.textContent = currentTabTitle;
      }

      if (ssbContentDescription) {
        ssbContentDescription.textContent = currentTabURL;
      }

      if (installButton) {
        if (isInstalled) {
          document.l10n.setAttributes(installButton, "ssb-app-open-button");
          installButton.setAttribute("open-ssb", "true");
        } else {
          document.l10n.setAttributes(installButton, "ssb-app-install-button");
          installButton.removeAttribute("open-ssb");
        }
      }

      if (ssbContentIcon) {
        ssbContentIcon.src = currentTabIcon;
      }
    },

    async onSsbSubViewOpened() {
      // Update ssb information
      let parentElem = document.getElementById("panelMenu_installedSsbMenu");
      let list =
        await SiteSpecificBrowserExternalFileService.getCurrentSsbData();

      // remove old ssb information
      let ssbAppInfoButtons = document.querySelectorAll(".ssb-app-info-button");
      for (let ssbAppInfoButton of ssbAppInfoButtons) {
        ssbAppInfoButton.remove();
      }

      for (let key in list) {
        let id = list[key].id;
        let SsbName = list[key].name;
        let SsbIcon = list[key].manifest.icons[0].src;

        let elem = window.MozXULElement.parseXULToFragment(`
          <toolbarbutton id="ssb-${id}" class="subviewbutton ssb-app-info-button" label="${SsbName}" image="${SsbIcon}"
                         ssbId="${id}" oncommand="gSsbSupport.functions.runSsbById('${id}');"/>
        `);

        parentElem?.appendChild(elem);
      }

      // Check current page ssb is installed
      let currentPageCanBeInstalled =
        SiteSpecificBrowserService.checkSiteCanBeInstall(
          window.gBrowser.currentURI
        );
      let installButtonOnPanelUI = document.getElementById(
        "appMenu-install-or-open-ssb-current-page-button"
      );

      if (currentPageCanBeInstalled === false) {
        installButtonOnPanelUI.setAttribute("disabled", "true");
        document.l10n.setAttributes(
          installButtonOnPanelUI,
          "appmenuitem-install-current-page"
        );
        installButtonOnPanelUI.removeAttribute("open-ssb");
      } else {
        let isInstalled =
          await gSsbSupport.functions.checkCurrentPageIsInstalled();
        installButtonOnPanelUI.removeAttribute("disabled");
        if (isInstalled) {
          document.l10n.setAttributes(
            installButtonOnPanelUI,
            "appmenuitem-open-current-page"
          );
          installButtonOnPanelUI.setAttribute("open-ssb", "true");
        } else {
          document.l10n.setAttributes(
            installButtonOnPanelUI,
            "appmenuitem-install-current-page"
          );
          installButtonOnPanelUI.removeAttribute("open-ssb");
        }
      }
    },

    async showSsbPanelSubView() {
      await window.PanelUI.showSubView(
        "PanelUI-ssb",
        document.getElementById("appMenu-ssb-button")
      );
      this.onSsbSubViewOpened();
    },

    async runSsbById(id) {
      SiteSpecificBrowserIdUtils.runSsbById(id);
    },
  },

  contextMenu: {
    panelUIInstalledAppContextMenu: {
      onPopupShowing(e) {
        // Create context menu
        let oldMenuItems = document.querySelectorAll(".ssb-contextmenu-items");

        for (let i = 0; i < oldMenuItems.length; i++) {
          oldMenuItems[i].remove();
        }

        let menuitemElem = window.MozXULElement.parseXULToFragment(`
          <menuitem id="run-ssb-contextmenu" class="ssb-contextmenu-items" data-l10n-id="appmenuitem-contextmenu-open-app" oncommand="gSsbSupport.contextMenu.panelUIInstalledAppContextMenu.openSsbApp('${e.explicitOriginalTarget.getAttribute(
            "ssbId"
          )}');"/>

          <menuitem id="uninstall-ssb-contextmenu" class="ssb-contextmenu-items" data-l10n-id="appmenuitem-contextmenu-uninstall-app" oncommand="gSsbSupport.contextMenu.panelUIInstalledAppContextMenu.uninstallSsbApp('${e.explicitOriginalTarget.getAttribute(
            "ssbId"
          )}');"/>
        `);

        document
          .getElementById("ssbInstalledAppMenu-context")
          .appendChild(menuitemElem);
      },
      openSsbApp(id) {
        // id is Ssb id
        SiteSpecificBrowserIdUtils.runSsbById(id);
      },
      uninstallSsbApp(id) {
        document.querySelector(`[ssbId="${id}"]`).hidden = true;
        // id is Ssb id
        SiteSpecificBrowserIdUtils.uninstallById(id);
      },
    },
  },

  eventListeners: {
    async onCurrentTabChangedOrLoaded() {
      // set image to the install button
      let currentPageCanBeInstalled =
        SiteSpecificBrowserService.checkSiteCanBeInstall(
          window.gBrowser.currentURI
        );
      let currentPageHasSsbManifest =
        await gSsbSupport.functions.checkCurrentPageHasSsbManifest();
      let currentPageIsInstalled =
        await gSsbSupport.functions.checkCurrentPageIsInstalled();

      if (
        (!currentPageCanBeInstalled || currentPageHasSsbManifest === null) &&
        !currentPageIsInstalled
      ) {
        gSsbSupport.functions.disableInstallButton();
        return;
      }

      gSsbSupport.functions.setImageToInstallButton();

      window.setTimeout(() => {
        gSsbSupport.functions.enableInstallButton(currentPageIsInstalled);
      }, 100);
    },
  },
};

gSsbSupport.init();
