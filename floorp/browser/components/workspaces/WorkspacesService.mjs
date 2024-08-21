/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */

import { WorkspacesWindowIdUtils } from "resource://floorp/WorkspacesWindowIdUtils.mjs";
import { WorkspacesDataSaver } from "chrome://floorp/content/modules/workspaces/WorkspacesDataSaver.mjs";

function generateUuid() {
  return Services.uuid.generateUUID().toString();
}

export const WorkspacesService = {
  /**
   * Returns the attribution ID for the workspaces tab.
   *
   * @returns {string} The attribution ID for the workspaces tab.
   */
  get workspacesTabAttributionId() {
    return "floorpWorkspaceId";
  },

  /**
   * Returns the last show ID for the workspace.
   *
   * @returns {string} The last show ID for the workspace.
   */
  get workspaceLastShowId() {
    return "floorpWorkspaceLastShowId";
  },

  /**
   * Returns whether workspaces are enabled.
   *
   * @returns {boolean} Whether workspaces are enabled.
   */
  get workspaceEnabled() {
    return Services.prefs.getBoolPref(
      workspacesPreferences.WORKSPACES_ENABLED_PREF,
      false
    );
  },

  /**
   * Creates a new workspace.
   *
   * @param {string} workspaceName - The name of the workspace.
   * @param {number} windowId - The ID of the window.
   * @param {boolean} [defaultWorkspace=false] - Whether the workspace is the default workspace.
   * @returns {Promise<string>} A promise that resolves with the ID of the created workspace.
   */
  async createWorkspace(
    workspaceName,
    windowId,
    defaultWorkspace,
    icon,
    setSelected
  ) {
    let workspacesData = await WorkspacesWindowIdUtils.getWindowWorkspacesData(
      windowId
    );
    let workspaceId = generateUuid();
    let workspaceData = {
      name: workspaceName,
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

    await WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
    return workspaceId;
  },

  /**
   * Deletes a workspace.
   *
   * @param {string} workspaceId - The ID of the workspace to delete.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the workspace is deleted.
   */
  async deleteWorkspace(workspaceId, windowId) {
    let workspacesData = await WorkspacesWindowIdUtils.getWindowWorkspacesData(
      windowId
    );
    delete workspacesData[workspaceId];
    await WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

  /**
   * Renames a workspace.
   *
   * @param {string} workspaceId - The ID of the workspace to rename.
   * @param {string} newName - The new name for the workspace.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the workspace is renamed.
   */
  async renameWorkspace(workspaceId, newName, windowId) {
    let workspacesData = await WorkspacesWindowIdUtils.getWindowWorkspacesData(
      windowId
    );
    workspacesData[workspaceId].name = newName;
    await WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

  /**
   * Sets a workspace as the default workspace.
   *
   * @param {string} workspaceId - The ID of the workspace to set as default.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the default workspace is set.
   */
  async setDefaultWorkspace(workspaceId, windowId) {
    let workspacesData = await WorkspacesWindowIdUtils.getWindowWorkspacesData(
      windowId
    );
    workspacesData.preferences = {
      defaultWorkspace: workspaceId,
    };
    await WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

  /**
   * Sets a workspace as the selected workspace.
   *
   * @param {string} workspaceId - The ID of the workspace to set as selected.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the selected workspace is set.
   */
  async setSelectWorkspace(workspaceId, windowId) {
    let workspacesData = await WorkspacesWindowIdUtils.getWindowWorkspacesData(
      windowId
    );

    if (!workspacesData.preferences) {
      workspacesData.preferences = {};
    }

    workspacesData.preferences.selectedWorkspaceId = workspaceId;

    await WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

  /**
   * Sets the user context ID and icon for a workspace container.
   *
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
    windowId
  ) {
    let workspacesData = await WorkspacesWindowIdUtils.getWindowWorkspacesData(
      windowId
    );
    workspacesData[workspaceId].userContextId = userContextId;
    workspacesData[workspaceId].icon = icon;
    workspacesData[workspaceId].isPrivateContainerWorkspace = false;

    // Check selected container is private container
    let privateContainerId =
      window.gFloorpPrivateContainer.getPrivateContainerUserContextId();
    if (privateContainerId && userContextId == privateContainerId) {
      workspacesData[workspaceId].isPrivateContainerWorkspace = true;
    }

    await WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

  /**
   * Sets the icon for a workspace.
   *
   * @param {string} workspaceId - The ID of the workspace.
   * @param {string} icon - The icon for the workspace.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the icon is set.
   */
  async setWorkspaceIcon(workspaceId, icon, windowId) {
    let workspacesData = await WorkspacesWindowIdUtils.getWindowWorkspacesData(
      windowId
    );
    workspacesData[workspaceId].icon = icon;
    await WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

  /**
   * Sets the user context ID for a workspace container.
   *
   * @param {string} workspaceId - The ID of the workspace.
   * @param {string} userContextId - The user context ID for the workspace container.
   * @param {number} windowId - The ID of the window.
   * @returns {Promise<void>} A promise that resolves when the user context ID is set.
   */
  async setWorkspaceContainerUserContextId(
    workspaceId,
    userContextId,
    windowId
  ) {
    let workspacesData = await WorkspacesWindowIdUtils.getWindowWorkspacesData(
      windowId
    );
    workspacesData[workspaceId].userContextId = userContextId;
    await WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },
};

/**
 * Reorders a workspace group before another workspace within a window.
 *
 * @param {string} workspaceId - The ID of the workspace to be reordered.
 * @param {string} beforeWorkspaceId - The ID of the workspace before which the target workspace should be placed.
 * @param {string} windowId - The ID of the window containing the workspaces.
 */
export const WorkspacesReorderService = {
  /**
   * Reorders a workspace to before one
   *
   * @param {string} workspaceId - The ID of the workspace to be reordered.
   * @param {string} windowId - The ID of the window containing the workspaces.
   */
  async reorderWorkspaceUp(workspaceId, windowId) {
    const currentWorkspacesData =
      await WorkspacesWindowIdUtils.getWindowWorkspacesDataWithoutPreferences(
        windowId
      );
    const keys = Object.keys(currentWorkspacesData);
    const index = keys.indexOf(workspaceId);

    if (index > 0) {
      keys.splice(index, 1);
      keys.splice(index - 1, 0, workspaceId);

      let newWorkspacesData = {};
      keys.forEach(key => {
        newWorkspacesData[key] = currentWorkspacesData[key];
      });

      await WorkspacesDataSaver.saveWorkspacesDataWithoutOverwritingPreferences(
        newWorkspacesData,
        windowId
      );
    } else {
      console.error("Cannot move the first workspace before.");
    }
  },

  /**
   * Reorders a workspace to after one
   *
   * @param {string} workspaceId - The ID of the workspace to be reordered.
   * @param {string} windowId - The ID of the window containing the workspaces.
   */

  async reorderWorkspaceDown(workspaceId, windowId) {
    const currentWorkspacesData =
      await WorkspacesWindowIdUtils.getWindowWorkspacesDataWithoutPreferences(
        windowId
      );
    const keys = Object.keys(currentWorkspacesData);
    const index = keys.indexOf(workspaceId);

    if (index < keys.length - 1 && index > -1) {
      keys.splice(index, 1);
      keys.splice(index + 1, 0, workspaceId);

      let newWorkspacesData = {};
      keys.forEach(key => {
        newWorkspacesData[key] = currentWorkspacesData[key];
      });
      await WorkspacesDataSaver.saveWorkspacesDataWithoutOverwritingPreferences(
        newWorkspacesData,
        windowId
      );
    } else {
      console.error("Cannot move the first workspace after.");
    }
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
    return "chrome://floorp/skin/workspace-icons/fingerprint.svg";
  }
  return `chrome://floorp/skin/workspace-icons/${icon}.svg`;
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
