/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

export const EXPORTED_SYMBOLS = ["SiteSpecificBrowserIdUtils"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SiteSpecificBrowserExternalFileService:
    "resource:///modules/SiteSpecificBrowserExternalFileService.sys.mjs",
  SiteSpecificBrowser: "resource:///modules/SiteSpecificBrowserService.sys.mjs",
});

if (AppConstants.platform == "win") {
  ChromeUtils.defineESModuleGetters(lazy, {
    WindowsSupport: "resource:///modules/ssb/WindowsSupport.sys.mjs",
  });
}

export let SiteSpecificBrowserIdUtils = {
  async runSsbById(id) {
    let ssb = await lazy.SiteSpecificBrowser.load(id);
    if (!ssb) {
      return;
    }

    createSsbWidow(ssb);
  },

  async runSsbByUrlAndId(url, id) {
    let ssb = await lazy.SiteSpecificBrowser.load(id);
    if (!ssb) {
      return;
    }

    ssb.startURI = url;
    createSsbWidow(ssb);
  },

  async getIconBySSBId(id, size) {
    let ssb = await lazy.SiteSpecificBrowser.load(id);

    if (!ssb._iconSizes) {
      ssb._iconSizes = buildIconList(ssb.manifest.icons);
    }

    if (!ssb._iconSizes.length) {
      return null;
    }

    let i = 0;
    while (i < ssb._iconSizes.length && ssb._iconSizes[i].size < size) {
      i++;
    }

    return i < ssb._iconSizes.length
      ? ssb._iconSizes[i].icon
      : ssb._iconSizes[ssb._iconSizes.length - 1].icon;
  },

  async uninstallById(id) {
    let ssb = await lazy.SiteSpecificBrowser.load(id);

    if (AppConstants.platform == "win") {
      await lazy.WindowsSupport.uninstall(ssb);
    }

    // Remve the SSB from ssb.json
    await lazy.SiteSpecificBrowserExternalFileService.removeSsbData(ssb.id);

    Services.obs.notifyObservers(
      null,
      "site-specific-browser-uninstall",
      ssb.id,
    );
  },

  async getIdByUrl(uri) {
    const { SiteSpecificBrowserExternalFileService } = ChromeUtils.import(
      "resource:///modules/SiteSpecificBrowserExternalFileService.jsm",
    );
    let ssbData =
      await SiteSpecificBrowserExternalFileService.getCurrentSsbData();

    // check start with url
    for (let key in ssbData) {
      if (key == uri) {
        return ssbData[key];
      }
    }

    // Search for host
    for (let key in ssbData) {
      if (uri.startsWith(key)) {
        return ssbData[key];
      }
    }

    return null;
  },
};

function createSsbWidow(ssb) {
  if (ssb) {
    let browserWindowFeatures =
      "chrome,location=yes,centerscreen,dialog=no,resizable=yes,scrollbars=yes";
    //"chrome,location=yes,centerscreen,dialog=no,resizable=yes,scrollbars=yes";

    let args = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString,
    );

    // URL
    args.data = `${ssb.startURI},${ssb.id},?FloorpEnableSSBWindow=true`;

    let win = Services.ww.openWindow(
      null,
      AppConstants.BROWSER_CHROME_URL,
      "_blank",
      browserWindowFeatures,
      args,
    );

    if (Services.appinfo.OS == "WINNT") {
      lazy.WindowsSupport.applyOSIntegration(ssb, win);
    }
  }
}

function buildIconList(icons) {
  let iconList = [];

  for (let icon of icons) {
    for (let sizeSpec of icon.sizes) {
      let size =
        sizeSpec == "any" ? Number.MAX_SAFE_INTEGER : parseInt(sizeSpec);

      iconList.push({
        icon,
        size,
      });
    }
  }

  iconList.sort((a, b) => {
    // Given that we're using MAX_SAFE_INTEGER adding a value to that would
    // overflow and give odd behaviour. And we're using numbers supplied by a
    // website so just compare for safety.
    if (a.size < b.size) {
      return -1;
    }

    if (a.size > b.size) {
      return 1;
    }

    return 0;
  });
  return iconList;
}
