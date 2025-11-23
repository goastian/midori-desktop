/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */

import { WorkspacesWindowIdUtils } from "resource://floorp/WorkspacesWindowIdUtils.mjs";
import { WorkspacesDataSaver } from "./WorkspacesDataSaver.mjs";

export const WorkspacesIdUtils = {
  async getWorkspaceByIdAndWindowId(workspaceId, windowId) {
    let workspacesData = await WorkspacesWindowIdUtils.getWindowWorkspacesData(
      windowId
    );
    return workspacesData[workspaceId];
  },

  async workspaceIdExists(workspaceId, windowId) {
    let workspacesData = await WorkspacesWindowIdUtils.getWindowWorkspacesData(
      windowId
    );
    return workspacesData.hasOwnProperty(workspaceId);
  },

  async getWorkspaceContainerUserContextId(workspaceId, windowId) {
    let workspace = await this.getWorkspaceByIdAndWindowId(
      workspaceId,
      windowId
    );

    if (!workspace.userContextId) {
      return 0;
    }

    /* If the workspace is a private container workspace, we need to get the
       userContextId from the private container. Private Container doesn't
       has fixed userContextId. */
    if (workspace.isPrivateContainerWorkspace) {
      return window.gFloorpPrivateContainer.getPrivateContainerUserContextId();
    }

    return workspace.userContextId;
  },

  async getWorkspaceIcon(workspaceId, windowId) {
    let workspace = await this.getWorkspaceByIdAndWindowId(
      workspaceId,
      windowId
    );
    return workspace.icon;
  },

  async removeWorkspaceById(workspaceId, windowId) {
    let workspacesData = await WorkspacesWindowIdUtils.getWindowWorkspacesData(
      windowId
    );
    delete workspacesData[workspaceId];
    await WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },
};
