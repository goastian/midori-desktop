/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 export const EXPORTED_SYMBOLS = ["WorkspacesWindowIdUtils"];

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  WorkspacesExternalFileService:
  "resource:///modules/WorkspacesExternalFileService.sys.mjs",
});

export const WorkspacesWindowIdUtils = {
  get _workspacesStoreFile() {
    return lazy.WorkspacesExternalFileService._workspacesStoreFile;
  },

  async getAllWindowAndWorkspacesData() {
    let fileExists = await IOUtils.exists(this._workspacesStoreFile);
    if (!fileExists) {
      IOUtils.writeJSON(this._workspacesStoreFile, {});
      return {};
    }

    let json = await IOUtils.readJSON(this._workspacesStoreFile);
    return json;
  },

  async getWindowWorkspacesData(windowId) {
    let fileExists = await IOUtils.exists(this._workspacesStoreFile);
    if (!fileExists) {
      let obj = {
        windows: {},
      };

      IOUtils.writeJSON(this._workspacesStoreFile, obj);
      return obj;
    }

    let json = await IOUtils.readJSON(this._workspacesStoreFile);
    let result = json.windows[windowId] || {};
    return result;
  },

  async getWindowWorkspacesDataWithoutPreferences(windowId) {
    let workspacesData = await this.getWindowWorkspacesData(windowId);
    delete workspacesData.preferences;
    return workspacesData;
  },

  async getWindowWorkspacesCount(windowId) {
    let workspacesData = await this.getWindowWorkspacesData(windowId);
    let workspacesCount = Object.keys(workspacesData).length;
    return workspacesCount;
  },

  async getDefaultWorkspaceId(windowId) {
    let workspacesData = await this.getWindowWorkspacesData(windowId);
    for (let workspaceId in workspacesData) {
      let workspace = workspacesData[workspaceId];
      if (workspace.defaultWorkspace) {
        return workspaceId;
      }
    }
    return null;
  },

  async getSelectedWorkspaceId(windowId) {
    let workspacesData = await this.getWindowWorkspacesData(windowId);
    let preferences = workspacesData.preferences || {};
    if (preferences.selectedWorkspaceId) {
      return preferences.selectedWorkspaceId;
    }

    let defaultWorkspaceId = await this.getDefaultWorkspaceId(windowId);
    if (defaultWorkspaceId) {
      return defaultWorkspaceId;
    }

    return null;
  },

  async getAllWorkspacesId(windowId) {
    let workspacesData =
      await this.getWindowWorkspacesDataWithoutPreferences(windowId);
    let workspacesIds = Object.keys(workspacesData);
    return workspacesIds;
  },
};
