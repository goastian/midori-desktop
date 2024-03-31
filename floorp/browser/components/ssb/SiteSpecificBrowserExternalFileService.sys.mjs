/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const EXPORTED_SYMBOLS = ["SiteSpecificBrowserExternalFileService"];

export const SiteSpecificBrowserExternalFileService = {
  get _ssbStoreFile() {
    return PathUtils.join(PathUtils.profileDir, "ssb", "ssb.json");
  },

  async getCurrentSsbData() {
    let fileExists = await IOUtils.exists(this._ssbStoreFile);
    if (!fileExists) {
      IOUtils.writeJSON(this._ssbStoreFile, {});
      return {};
    }

    let result = await IOUtils.readJSON(this._ssbStoreFile);

    return result;
  },

  async saveSsbData(ssbData) {
    await IOUtils.writeJSON(this._ssbStoreFile, ssbData);
  },

  async removeSsbData(ssbId) {
    let list = await SiteSpecificBrowserExternalFileService.getCurrentSsbData();
    for (const key in list) {
      if (list.hasOwnProperty(key)) {
        const item = list[key];
        if (item.id == ssbId) {
          delete list[key];
          await SiteSpecificBrowserExternalFileService.saveSsbData(list);
        }
      }
    }
  },
};
