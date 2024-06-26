/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 export const EXPORTED_SYMBOLS = [
  "WorkspacesService",
  "workspacesPreferences",
  "WorkspacesGroupService",
  "WorkspacesWindowUuidService",
  "workspaceIcons",
  "getWorkspaceIconUrl",
];

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  WorkspacesWindowIdUtils:
  "resource:///modules/WorkspacesWindowIdUtils.sys.mjs",
  WorkspacesDataSaver: "resource:///modules/WorkspacesDataSaver.sys.mjs",
  PrivateContainer: "resource:///modules/PrivateContainer.sys.mjs",
});

function generateUuid() {
  return Services.uuid.generateUUID().toString();
}

export const WorkspacesService = {
  /**
   * Returns the attribution ID for the workspaces tab.
   * @returns {string} The attribution ID for the workspaces tab.
   */
  get workspacesTabAttributionId() {
    return "floorpWorkspaceId";
  },

  /**
   * Returns the last show ID for the workspace.
   * @returns {string} The last show ID for the workspace.
   */
  get workspaceLastShowId() {
    return "floorpWorkspaceLastShowId";
  },

  /**
   * Returns whether workspaces are enabled.
   * @returns {boolean} Whether workspaces are enabled.
   */
  get workspaceEnabled() {
    return Services.prefs.getBoolPref(
      workspacesPreferences.WORKSPACES_ENABLED_PREF,
      false,
    );
  },

  /**
   * Creates a new workspace.
   * @param {string} name - The name of the workspace.
   * @param {number} windowId - The ID of the window.
   * @param {boolean} [defaultWorkspace=false] - Whether the workspace is the default workspace.
   * @returns {Promise<string>} A promise that resolves with the ID of the created workspace.
   */
  async createWorkspace(name, windowId, defaultWorkspace, icon, setSelected) {
    let workspacesData =
      await lazy.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    let workspaceId = generateUuid();

    let workspaceData = {
      name,
      tabs: [],
      defaultWorkspace: defaultWorkspace || false,
      id: workspaceId,
      icon,
    };
    workspacesData[workspaceId] = workspaceData;
    if (setSelected) {
      workspacesData.preferences = {
        selectedWorkspaceId: workspaceId,
      };
    }

    await lazy.WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
    return workspaceId;
  },

  /**
   * Deletes a workspace.
   * @param {string} workspaceId - The ID of the workspace to delete.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the workspace is deleted.
   */
  async deleteWorkspace(workspaceId, windowId) {
    let workspacesData =
      await lazy.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    delete workspacesData[workspaceId];
    await lazy.WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

  /**
   * Renames a workspace.
   * @param {string} workspaceId - The ID of the workspace to rename.
   * @param {string} newName - The new name for the workspace.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the workspace is renamed.
   */
  async renameWorkspace(workspaceId, newName, windowId) {
    let workspacesData =
      await lazy.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    workspacesData[workspaceId].name = newName;
    await lazy.WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

  /**
   * Sets a workspace as the default workspace.
   * @param {string} workspaceId - The ID of the workspace to set as default.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the default workspace is set.
   */
  async setDefaultWorkspace(workspaceId, windowId) {
    let workspacesData =
      await lazy.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    workspacesData.preferences = {
      defaultWorkspace: workspaceId,
    };
    await lazy.WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

  /**
   * Sets a workspace as the selected workspace.
   * @param {string} workspaceId - The ID of the workspace to set as selected.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the selected workspace is set.
   */
  async setSelectWorkspace(workspaceId, windowId) {
    let workspacesData =
      await lazy.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);

    if (!workspacesData.preferences) {
      workspacesData.preferences = {};
    }

    workspacesData.preferences.selectedWorkspaceId = workspaceId;

    await lazy.WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

  /**
   * Sets the user context ID and icon for a workspace container.
   * @param {string} workspaceId - The ID of the workspace.
   * @param {string} userContextId - The user context ID for the workspace container.
   * @param {string} icon - The icon for the workspace container.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the user context ID and icon are set.
   */
  async setWorkspaceContainerUserContextIdAndIcon(
    workspaceId,
    userContextId,
    icon,
    windowId,
  ) {
    let workspacesData =
      await lazy.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    workspacesData[workspaceId].userContextId = userContextId;
    workspacesData[workspaceId].icon = icon;
    await lazy.WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

  /**
   * Sets the icon for a workspace.
   * @param {string} workspaceId - The ID of the workspace.
   * @param {string} icon - The icon for the workspace.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the icon is set.
   */
  async setWorkspaceIcon(workspaceId, icon, windowId) {
    let workspacesData =
      await lazy.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    workspacesData[workspaceId].icon = icon;
    workspacesData[workspaceId].isPrivateContainerWorkspace = false;

    // Check selected container is private container
    let privateContainerId = lazy.PrivateContainer.Functions.getPrivateContainerUserContextId();
    if (privateContainerId && userContextId == privateContainerId) {
      workspacesData[workspaceId].isPrivateContainerWorkspace = true;
    }
    await lazy.WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

  /**
   * Sets the user context ID for a workspace container.
   * @param {string} workspaceId - The ID of the workspace.
   * @param {string} userContextId - The user context ID for the workspace container.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the user context ID is set.
   */
  async setWorkspaceContainerUserContextId(
    workspaceId,
    userContextId,
    windowId,
  ) {
    let workspacesData =
      await lazy.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    workspacesData[workspaceId].userContextId = userContextId;
    await lazy.WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },
};

/**
 * Reorders a workspace group before another workspace within a window.
 * @param {string} workspaceId - The ID of the workspace to be reordered.
 * @param {string} beforeWorkspaceId - The ID of the workspace before which the target workspace should be placed.
 * @param {string} windowId - The ID of the window containing the workspaces.
 */
export const WorkspacesGroupService = {
  reorderingWorkspacesGroupBefore(workspaceId, beforeWorkspaceId, windowId) {
    let workspacesData =
      lazy.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    let workspaceIds = Object.keys(workspacesData);
    let index = workspaceIds.indexOf(workspaceId);
    let beforeIndex = workspaceIds.indexOf(beforeWorkspaceId);
    workspaceIds.splice(index, 1);
    workspaceIds.splice(beforeIndex, 0, workspaceId);
    workspacesData[workspaceId].tabs = workspaceIds;
    lazy.WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },
};

export const workspaceIcons = new Set([
  "article",
  "book",
  "briefcase",
  "cart",
  "chat",
  "chill",
  "circle",
  "compass",
  "code",
  "dollar",
  "fence",
  "fingerprint",
  "food",
  "fruit",
  "game",
  "gear",
  "gift",
  "key",
  "lightning",
  "network",
  "notes",
  "paint",
  "photo",
  "pin",
  "pet",
  "question",
  "smartphone",
  "star",
  "tree",
  "vacation",
  "love",
  "moon",
  "music",
  "user",
]);

export function getWorkspaceIconUrl(icon) {
  if (!workspaceIcons.has(icon) || icon == undefined) {
    return "chrome://browser/skin/workspace-icons/fingerprint.svg";
  }
  return `chrome://browser/skin/workspace-icons/${icon}.svg`;
}

export const workspacesPreferences = {
  workspacesIsFirstRun() {
    let result = Services.prefs.getBoolPref(
      "floorp.browser.workspaces.isFirstRun",
      true
    );
    Services.prefs.setBoolPref("floorp.browser.workspaces.isFirstRun", false);
    return result;
  },
  WORKSPACES_ENABLED_PREF: "floorp.browser.workspaces.enabled",
  WORKSPACES_CLOSE_POPUP_AFTER_CLICK_PREF:
    "floorp.browser.workspace.closePopupAfterClick",
  WORKSPACES_MANAGE_ON_BMS_PREF: "floorp.browser.workspace.manageOnBMS",
  WORKSPACE_SHOW_WORKSPACE_NAME_PREF:
    "floorp.browser.workspace.showWorkspaceName",
};

export const WorkspacesWindowUuidService = {
  getGeneratedUuid() {
    return generateUuid();
  },
};
