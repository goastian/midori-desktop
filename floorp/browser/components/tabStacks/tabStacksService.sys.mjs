/* eslint-disable no-undef */
/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 export const EXPORTED_SYMBOLS = [
  "tabStacksService",
  "tabStacksPreferences",
  "TabStacksGroupService",
  ];
  
  const lazy = {};
  ChromeUtils.defineESModuleGetters(lazy, {
    tabStacksExternalFileService:
      "resource:///modules/tabStacksExternalFileService.sys.mjs",
  });
  
  function generateUuid() {
    return Services.uuid.generateUUID().toString();
  }
  
  export const tabStacksService = {
    get tabStacksTabAttributionId() {
      return "floorpTabStackId";
    },
  
    get tabStackLastShowId() {
      return "floorpTabStackLastShowId";
    },
    get tabStackEnabled() {
      return Services.prefs.getBoolPref(
        tabStacksPreferences.TAB_STACKS_ENABLED_PREF,
        false
      );
    },
  
    async createTabStack(name, windowId, defaultTabStack) {
      let tabStacksData =
      await lazy.tabStacksExternalFileService.getWindowTabStacksData(windowId);
      let tabStackId = generateUuid();
  
      tabStacksData[tabStackId] = {
        name,
        tabs: [],
        defaultTabStack: defaultTabStack || false,
        id: tabStackId,
      };
      await lazy.tabStacksExternalFileService.getWindowTabStacksData(windowId);
    },
  
    async deleteTabStack(tabStackId, windowId) {
      let tabStacksData =
        await lazy.tabStacksExternalFileService.getWindowTabStacksData(
          windowId
        );
      delete tabStacksData[tabStackId];
      await lazy.tabStacksExternalFileService.saveTabStacksData(
        tabStacksData,
        windowId
      );
    },
  
    async renameTabStack(tabStackId, newName, windowId) {
      let tabStacksData =
      await lazy.tabStacksExternalFileService.getWindowTabStacksData(windowId);
      tabStacksData[tabStackId].name = newName;
      await lazy.tabStacksExternalFileService.saveTabStacksData(
        tabStacksData,
        windowId
      );
    },
  
    async addTabToTabStack(tabStackId, tabs, windowId) {
      let tabStacksData =
      await lazy.tabStacksExternalFileService.getWindowTabStacksData(windowId);
      for (let tab of tabs) {
        tabStacksData[tabStackId].tabs.push(tab.tabStackId);
      }
      await lazy.tabStacksExternalFileService.saveTabStacksData(
        tabStacksData,
        windowId
      );
    },
  
    async setDefaultTabStack(tabStackId, windowId) {
      let tabStacksData =
      await lazy.tabStacksExternalFileService.getWindowTabStacksData(windowId);
        tabStacksData.preferences = {
          defaultTabStack: tabStackId,
        };
      await lazy.tabStacksExternalFileService.saveTabStacksData(
        tabStacksData,
        windowId
      );
    },
  
    async setSelectTabStack(tabStackId, windowId) {
      let tabStacksData =
      await lazy.tabStacksExternalFileService.getWindowTabStacksData(windowId);

    if (!tabStacksData.preferences) {
      tabStacksData.preferences = {};
        }

        tabStacksData.preferences.selectedTabStackId = tabStackId;
    
        console.log(tabStacksData);
      await lazy.tabStacksExternalFileService.saveTabStacksData(
        tabStacksData,
        windowId
      );
    },
  };
  
  export const TabStacksGroupService = {
    reorderingTabStackGroupBefore(tabStackId, beforeTabStackId, windowId) {
      let tabStacksData =
        lazy.tabStacksExternalFileService.getWindowTabStacksData(windowId);
      let tabStackIds = Object.keys(tabStacksData);
      let index = tabStackIds.indexOf(tabStackId);
      let beforeIndex = tabStackIds.indexOf(beforeTabStackId);
      tabStackIds.splice(index, 1);
      tabStackIds.splice(beforeIndex, 0, tabStackId);
      tabStacksData[tabStackId].tabs = tabStackIds;
      lazy.tabStacksExternalFileService.saveTabStacksData(
        tabStacksData,
        windowId
      );
    },
  };
  
  export const tabStacksPreferences = {
    TAB_STACKS_ENABLED_PREF: "floorp.browser.tabstack.enabled",
  };