/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */

export const EXPORTED_SYMBOLS = ["WorkspacesIdUtils"];

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  WorkspacesExternalFileService:
    "resource:///modules/WorkspacesExternalFileService.sys.mjs",
  WorkspacesWindowIdUtils:
    "resource:///modules/WorkspacesWindowIdUtils.sys.mjs",
  WorkspacesDataSaver: "resource:///modules/WorkspacesDataSaver.sys.mjs",
  PrivateContainer: "resource:///modules/PrivateContainer.sys.mjs",
});

export const WorkspacesIdUtils = {
  async getWorkspaceByIdAndWindowId(workspaceId, windowId) {
    let workspacesData =
      await lazy.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    return workspacesData[workspaceId];
  },

  async workspaceIdExists(workspaceId, windowId) {
    let workspacesData =
      await lazy.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    return workspacesData.hasOwnProperty(workspaceId);
  },

  async getWorkspaceContainerUserContextId(workspaceId, windowId) {
    let workspace = await this.getWorkspaceByIdAndWindowId(
      workspaceId,
      windowId,
    );

    if (!workspace.userContextId) {
      return 0;
    }

    /* If the workspace is a private container workspace, we need to get the
       userContextId from the private container. Private Container doesn't
       has fixed userContextId. */
    if (workspace.isPrivateContainerWorkspace) {
      return lazy.PrivateContainer.Functions.getPrivateContainerUserContextId();
    }

    return workspace.userContextId;
  },

  async getWorkspaceIcon(workspaceId, windowId) {
    let workspace = await this.getWorkspaceByIdAndWindowId(
      workspaceId,
      windowId,
    );
    return workspace.icon;
  },

  async removeWorkspaceById(workspaceId, windowId) {
    let workspacesData =
      await lazy.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    delete workspacesData[workspaceId];
    await lazy.WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

  async removeWindowWorkspacesDataById(windowId) {
    let json = await IOUtils.readJSON(
      lazy.WorkspacesExternalFileService._workspacesStoreFile,
    );
    delete json.windows[windowId];

    await IOUtils.writeJSON(
      lazy.WorkspacesExternalFileService._workspacesStoreFile,
      json,
    );
  },

  async removeWindowTabsDataById(windowId) {
    let json = await IOUtils.readJSON(
      lazy.WorkspacesExternalFileService._workspacesStoreFile,
    );
    let windowWorkspacesData = json.windows[windowId];
    for (let workspaceId in windowWorkspacesData) {
      let workspace = windowWorkspacesData[workspaceId];
      if (workspace.tabs) {
        let workspace = windowWorkspacesData[workspaceId];
        workspace.tabs = [];
      }
    }

    await IOUtils.writeJSON(
      lazy.WorkspacesExternalFileService._workspacesStoreFile,
      json,
    );
  },
};