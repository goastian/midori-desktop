/* eslint-disable no-undef */
/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 export const EXPORTED_SYMBOLS = [
    "tabStacksIdUtils"
];

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  tabStacksExternalFileService:
    "resource:///modules/tabStacksExternalFileService.sys.mjs",
});

export const tabStacksIdUtils = {
    async getTabStackByIdAndWindowId(tabStackId, windowId) {
        let tabStacksData = await lazy.tabStacksExternalFileService.getWindowTabStacksData(windowId);
        return tabStacksData[tabStackId];
    },

    async getTabStackIdByTab(tab, windowId) {
        let tabStacksData = await lazy.tabStacksExternalFileService.getWindowTabStacksData(windowId);
        for (let tabStackId in tabStacksData) {
            let tabStack = tabStacksData[tabStackId];
            if (!tabStack.tabs) {
                return null;
            }

            if (tabStack.tabs.includes(tab.tabStackId)) {
                return tabStackId;
            }
        }
        return null;
    },

    async removeTabStackById(tabStackId, windowId) {
        let tabStacksData = await lazy.tabStacksExternalFileService.getWindowTabStacksData(windowId);
        delete tabStacksData[tabStackId];
        await lazy.tabStacksExternalFileService.saveTabStacksData(tabStacksData, windowId);
    },

    async removeWindowTabStacksDataById(windowId) {
        let json = await IOUtils.readJSON(lazy.tabStacksExternalFileService._tabStacksStoreFile);
        delete json.windows[windowId];

        await IOUtils.writeJSON(lazy.tabStacksExternalFileService._tabStacksStoreFile, json);
    },

    async removeWindowTabsDataById(windowId) { 
        let json = await IOUtils.readJSON(lazy.tabStacksExternalFileService._tabStacksStoreFile);
        let windowTabStacksData = json.windows[windowId];
        for (let tabStackId in windowTabStacksData) {
            let tabStack = windowTabStacksData[tabStackId];
            tabStack.tabs = [];
        }

        await IOUtils.writeJSON(lazy.tabStacksExternalFileService._tabStacksStoreFile, json);
    }
};