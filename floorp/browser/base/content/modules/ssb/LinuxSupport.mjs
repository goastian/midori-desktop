/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SiteSpecificBrowserIdUtils } from "./SiteSpecificBrowserIdUtils.mjs";
import { ImageTools } from "./ImageTools.mjs";

const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);

export const LinuxSupport = {
  get nsIFile() {
    return Components.Constructor(
      "@mozilla.org/file/local;1",
      Ci.nsIFile,
      "initWithPath"
    );
  },

  /**
   * Installs an SSB by creating a .desktop file to launch it.
   *
   * @param {SiteSpecificBrowser} ssb the SSB to install.
   */
  async install(ssb) {
    let iconDir = "~/.local/share/icons/Floorp_Web_Apps";
    await IOUtils.makeDirectory(iconDir, {
      from: "~/.local/share/icons",
      ignoreExisting: true,
    });

    let iconFile = new LinuxSupport.nsIFile(
      PathUtils.join(iconDir, `${ssb.name}.png`)
    );
    let icon = await SiteSpecificBrowserIdUtils.getIconBySSBId(ssb.id, 128);
    if (icon) {
      let { container } = await ImageTools.loadImage(
        Services.io.newURI(icon.src)
      );
      ImageTools.saveIcon(container, 128, 128, iconFile);
    } else {
      // TODO use a default icon file.
      iconFile = null;
    }

    let command = Services.dirsvc.get("XREExeF",Ci.nsIFile).path;
    if (FileUtils.File("/.flatpak-info").exists()) {
      command = "flatpak run org.astian.midori";
    }
    let applicationDir = "~/.local/share/applications";
    let desktopFile = PathUtils.join(
      applicationDir,
      `midori-${ssb.name}-${ssb.id}.desktop`
    );
    await IOUtils.write(
      desktopFile,
      new TextEncoder().encode(
        `[Desktop Entry]
Type=Application
Terminal=false
Name=${ssb.name}
Exec=${command} --profile "${PathUtils.profileDir}" --start-ssb "${ssb.id}"
Icon=${iconFile.path}`
      )
    );
  },

  /**
   * Uninstalls an SSB by removing the .desktop file.
   *
   * @param {SiteSpecificBrowser} ssb the SSB to uninstall.
   */
  async uninstall(ssb) {
    try {
      let applicationDir = "~/.local/share/applications";
      let desktopFile = PathUtils.join(
        applicationDir,
        `midori-${ssb.name}-${ssb.id}.desktop`
      );
      await IOUtils.remove(desktopFile);
    } catch (e) {
      console.error(e);
    }

    let icon = `~/.local/share/icons/Midori_Web_Apps/${ssb.name}.png`;
    try {
      await IOUtils.remove(icon, {
        recursive: true,
        ignoreAbsent: true,
      });
    } catch (e) {
      console.error(e);
    }
  },
};
