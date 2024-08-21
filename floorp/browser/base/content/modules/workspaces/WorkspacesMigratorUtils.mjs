/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */

import { WorkspacesIdUtils } from "./WorkspacesIdUtils.mjs"
import { WorkspacesService } from "resource://floorp/WorkspacesService.mjs"

function getIconNameByWorkspaceName(workspaceName) {
  const settings = JSON.parse(
    Services.prefs.getStringPref("floorp.browser.workspace.info"),
  );

  const targetWorkspaceNumber = checkWorkspaceInfoExist(workspaceName);
  if (
    targetWorkspaceNumber === false ||
    settings[targetWorkspaceNumber][workspaceName].icon == "" ||
    settings[targetWorkspaceNumber][workspaceName].icon == undefined
  ) {
    return null;
  }
  let iconURL = settings[targetWorkspaceNumber][workspaceName].icon;
  let removeSVG = iconURL.replace("chrome://floorp/skin/workspace-icons/", "");
  let result = removeSVG.replace(".svg", "");
  return result;
}

function checkWorkspaceInfoExist(workspaceName) {
  const data = JSON.parse(
    Services.prefs.getStringPref("floorp.browser.workspace.info"),
  );
  for (let i = 0; i < data.length; i++) {
    const obj = data[i];
    const keys = Object.keys(obj);
    const workspaceValue = keys[0];

    if (workspaceValue == workspaceName) {
      // return workspaceValue;
      return i;
    }
  }
  return false;
}

function getWorkspaceUserContextId(workspaceName) {
  const settings = JSON.parse(
    Services.prefs.getStringPref("floorp.browser.workspace.info"),
  );
  const targetWorkspaceNumber = checkWorkspaceInfoExist(workspaceName);
  if (
    targetWorkspaceNumber === false ||
    settings[targetWorkspaceNumber][workspaceName].container == "" ||
    settings[targetWorkspaceNumber][workspaceName].container == undefined
  ) {
    // return string "0".
    return 0;
  }
  return Number(settings[targetWorkspaceNumber][workspaceName].container);
}

export const WorkspacesMigratorUtils = {
  get IsLegacyWorkspaceEnabled() {
    return Services.prefs.getBoolPref(
      "floorp.browser.workspace.tab.enabled",
      true,
    );
  },

  get migrated() {
    return Services.prefs.getBoolPref(
      "floorp.browser.workspace.migrated",
      false,
    );
  },

  get LegacyWorkspacesData() {
    return null;
  },

  get legacySelectedWorkspace() {
    return Services.prefs.getStringPref("floorp.browser.workspace.current");
  },

  get legacyWorkspacesAreExist() {
    return Services.prefs.getStringPref("floorp.browser.workspace.all") !== "";
  },

  get legacyDefaultWorkspace() {
    return Services.prefs
      .getStringPref("floorp.browser.workspace.all")
      .split(",")[0];
  },

  get LegacyWorkspacesAllNamesPref() {
    let pref = Services.prefs.getStringPref("floorp.browser.workspace.all");
    let result = pref.split(",");
    return result;
  },

  cleanupLegacyWorkspaces() {
    Services.prefs.clearUserPref("floorp.browser.workspace.tabs.state");
    Services.prefs.clearUserPref("floorp.browser.workspace.current");
    Services.prefs.setBoolPref("floorp.browser.workspace.tab.enabled", false);
    Services.prefs.clearUserPref("floorp.browser.workspace.all");
  },

  async importDataFromLegacyWorkspaces(tabs, windowId) {
    if (this.migrated) {
      return;
    }

    if (!this.legacyWorkspacesAreExist || !this.IsLegacyWorkspaceEnabled) {
      return;
    }

    // Set migrated flag
    Services.prefs.setBoolPref("floorp.browser.workspace.migrated", true);

    const allWorkspacesName = this.LegacyWorkspacesAllNamesPref;

    // Create Workspace with legacy workspace name
    for (const workspaceName of allWorkspacesName) {
      const workspaceId = await WorkspacesService.createWorkspace(
        workspaceName,
        windowId,
        this.legacyDefaultWorkspace === workspaceName,
      );

      const workspace =
        await WorkspacesIdUtils.getWorkspaceByIdAndWindowId(
          workspaceId,
          windowId,
        );

      if (this.legacySelectedWorkspace === workspaceName) {
        await WorkspacesService.setSelectWorkspace(workspace.id, windowId);
      }

      // Workspace Container & icon
      const userContextId = getWorkspaceUserContextId(workspaceName);
      const iconName = getIconNameByWorkspaceName(workspaceName);
      if (iconName || userContextId) {
        await WorkspacesService.setWorkspaceContainerUserContextIdAndIcon(
          workspace.id,
          userContextId || 0,
          iconName || "fingerprint",
          windowId,
        );
      }

      // Add Tabs to Workspace
      for (const tab of tabs) {
        if (tab.getAttribute("floorpWorkspace") === workspaceName) {
          tab.setAttribute(
            WorkspacesService.workspacesTabAttributionId,
            workspace.id,
          );
        }
      }
    }

    this.cleanupLegacyWorkspaces();
  },
};
