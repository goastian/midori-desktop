/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm",
);
const { SiteSpecificBrowserService } = ChromeUtils.import(
  "resource:///modules/SiteSpecificBrowserService.jsm",
);

const { SiteSpecificBrowserIdUtils } = ChromeUtils.import(
  "resource:///modules/SiteSpecificBrowserIdUtils.jsm",
);

const lazy = {};
XPCOMUtils.defineLazyModuleGetters(lazy, {
  ImageTools: "resource:///modules/ssb/ImageTools.jsm",
});

let shellService = Cc["@mozilla.org/browser/shell-service;1"].getService(
  Ci.nsIWindowsShellService,
);

const uiUtils = Cc["@mozilla.org/windows-ui-utils;1"].getService(
  Ci.nsIWindowsUIUtils,
);

const taskbar = Cc["@mozilla.org/windows-taskbar;1"].getService(
  Ci.nsIWinTaskbar,
);

const File = Components.Constructor(
  "@mozilla.org/file/local;1",
  Ci.nsIFile,
  "initWithPath",
);

function buildGroupId(id) {
  return `ablaze.floorp.ssb.${id}`;
}

export const WindowsSupport = {
  /**
   * Installs an SSB by creating a shortcut to launch it on the user's desktop.
   *
   * @param {SiteSpecificBrowser} ssb the SSB to install.
   */
  async install(ssb) {
    if (!SiteSpecificBrowserService.useOSIntegration) {
      return;
    }

    let dir = PathUtils.join(PathUtils.profileDir, "ssb", ssb.id);
    await IOUtils.makeDirectory(dir, {
      from: PathUtils.profileDir,
      ignoreExisting: true,
    });

    let iconFile = new File(PathUtils.join(dir, "icon.ico"));

    // We should be embedding multiple icon sizes, but the current icon encoder
    // does not support this. For now just embed a sensible size.
    let icon = await SiteSpecificBrowserIdUtils.getIconBySSBId(ssb.id, 128);
    if (icon) {
      let { container } = await lazy.ImageTools.loadImage(
        Services.io.newURI(icon.src),
      );
      lazy.ImageTools.saveIcon(container, 128, 128, iconFile);
    } else {
      // TODO use a default icon file.
      iconFile = null;
    }

    shellService.createShortcut(
      Services.dirsvc.get("XREExeF", Ci.nsIFile),
      ["-profile", PathUtils.profileDir, "-start-ssb", ssb.id],
      ssb.name,
      iconFile,
      0,
      buildGroupId(ssb.id),
      "Programs",
      `${ssb.name}.lnk`,
    );
  },

  /**
   * @param {SiteSpecificBrowser} ssb the SSB to uninstall.
   */
  async uninstall(ssb) {
    if (!SiteSpecificBrowserService.useOSIntegration) {
      return;
    }

    try {
      let startMenu =
        Services.dirsvc.get("Home", Ci.nsIFile).path +
        "\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\";
      await IOUtils.remove(startMenu + ssb.name + ".lnk");
    } catch (e) {
      console.error(e);
    }

    let dir = PathUtils.join(PathUtils.profileDir, "ssb", ssb.id);
    try {
      await IOUtils.remove(dir, { recursive: true });
    } catch (e) {
      console.error(e);
    }
  },

  /**
   * Applies the necessary OS integration to an open SSB.
   *
   * Sets the window icon based on the available icons.
   *
   * @param {SiteSpecificBrowser} ssb the SSB.
   * @param {DOMWindow} window the window showing the SSB.
   */
  async applyOSIntegration(ssb, window) {
    taskbar.setGroupIdForWindow(window, buildGroupId(ssb.id));
    const getIcon = async (size) => {
      let icon = await SiteSpecificBrowserIdUtils.getIconBySSBId(ssb.id, size);
      if (!icon) {
        return null;
      }

      try {
        let image = await lazy.ImageTools.loadImage(
          Services.io.newURI(icon.src),
        );
        return image.container;
      } catch (e) {
        console.error(e);
        return null;
      }
    };

    if (!SiteSpecificBrowserService.useOSIntegration) {
      return;
    }

    let icons = await Promise.all([
      getIcon(uiUtils.systemSmallIconSize),
      getIcon(uiUtils.systemLargeIconSize),
    ]);

    if (icons[0] || icons[1]) {
      uiUtils.setWindowIcon(window, icons[0], icons[1]);
    }
  },
};
