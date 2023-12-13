/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 export const EXPORTED_SYMBOLS = ["tabStacksExternalFileService"];

 export const tabStacksExternalFileService = {
     get _tabStacksStoreFile() {
         return PathUtils.join(PathUtils.profileDir, "tabstacks", "tabstacks.json");
     },
 
     async getAllWindowAndTabStacksData() {
         let fileExists = await IOUtils.exists(this._tabStacksStoreFile);
         if (!fileExists) {
             IOUtils.writeJSON(this._tabStacksStoreFile, {});
             return {};
         }
 
         let json = await IOUtils.readJSON(this._tabStacksStoreFile);
         return json;
     },
 
     async getWindowTabStacksData(windowId) {
         let fileExists = await IOUtils.exists(this._tabStacksStoreFile);
         if (!fileExists) {
             let obj = {
                 windows: {}
             };
 
             IOUtils.writeJSON(this._tabStacksStoreFile, obj);
             return obj;
         }
 
         let json = await IOUtils.readJSON(this._tabStacksStoreFile);
         let result = json.windows[windowId] || {};
         return result;
     },

     async getWindowTabStacksDataWithoutPreferences(windowId) {
        let tabStacksData = await this.getWindowTabStacksData(windowId);
        delete tabStacksData.preferences;
        return tabStacksData;
    },
 
     async getDefaultTabStackId(windowId) {
         let tabStacksData = await this.getWindowTabStacksData(windowId);
         for (let tabStackId in tabStacksData) {
             let tabStack = tabStacksData[tabStackId];
             if (tabStack.defaultTabStack) {
                 return tabStackId;
             }
         }
         return null;
     },

     async getSelectedTabStackId(windowId) {
        let tabStacksData = await this.getWindowTabStacksData(windowId);
        let preferences = tabStacksData.preferences || {};
        if (preferences.selectedTabStackId) {
            return preferences.selectedTabStackId;
        }
        let defaultTabStackId = await this.getDefaultTabStackId(windowId);
        if (defaultTabStackId) {
            return defaultTabStackId;
        }
        return null;
    },
 
     async saveTabStacksData(tabStacksData, windowId) {
         let json = await IOUtils.readJSON(this._tabStacksStoreFile);
         json.windows[windowId] = tabStacksData;
 
         console.log(json);
 
         await IOUtils.writeJSON(this._tabStacksStoreFile, json);
     },

     async saveTabStacksDataWithoutOverwritingPreferences(tabStacksData, windowId) {
        let json = await IOUtils.readJSON(this._tabStacksStoreFile);
        let preferences = json.windows[windowId].preferences;
        json.windows[windowId] = tabStacksData;
        json.windows[windowId].preferences = preferences;

        await IOUtils.writeJSON(this._tabStacksStoreFile, json);
    },

    async saveWindowPreferences(preferences, windowId) {
        let json = await IOUtils.readJSON(this._tabStacksStoreFile);
        json.windows[windowId].preferences = preferences;

        await IOUtils.writeJSON(this._tabStacksStoreFile, json);
    }
 }