/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 import { WorkspacesWindowIdUtils } from "resource:///modules/WorkspacesWindowIdUtils.sys.mjs";

 export const EXPORTED_SYMBOLS = ["WorkspacesElementService"];

export const WorkspacesElementService = {
  panelElement: `<panel id="workspacesToolbarButtonPanel" type="arrow" position="bottom top">
          <vbox id="workspacesToolbarButtonPanelBox">
            <arrowscrollbox id="workspacesPopupBox" flex="1">
                <vbox id="workspacesPopupContent" align="center" flex="1" orient="vertical"
                                clicktoscroll="true" class="statusbar-padding" />
            </arrowscrollbox>
            <toolbarseparator class="toolbarbutton-1 chromeclass-toolbar-additional" id="workspacesPopupSeparator" />
            <hbox id="workspacesPopupFooter" align="center" pack="center">
              <toolbarbutton id="workspacesCreateNewWorkspaceButton" class="toolbarbutton-1 chromeclass-toolbar-additional"
                           data-l10n-id="workspaces-create-new-workspace-button" context="tab-stacks-toolbar-item-context-menu"
                           oncommand="gWorkspaces.createNoNameWorkspace();" />
              <toolbarbutton id="workspacesManageWorkspacesButton" class="toolbarbutton-1 chromeclass-toolbar-additional"
                           data-l10n-id="workspaces-manage-workspaces-button" context="tab-stacks-toolbar-item-context-menu"
                           oncommand="gWorkspaces.manageWorkspaceFromDialog();" />
            </hbox>
          </vbox>
        </panel>
        `,

  manageOnBmsInjectionXHTML: `
  <vbox id="workspacesBmsContent" align="center" flex="1" orient="vertical"
        clicktoscroll="true" class="statusbar-padding" />
  <toolbarbutton id="workspacesCreateNewWorkspaceButton" class="sidepanel-icon toolbarbutton-1 chromeclass-toolbar-additional"
        data-l10n-id="workspaces-create-new-workspace-button" context="tab-stacks-toolbar-item-context-menu"
        oncommand="gWorkspaces.createNoNameWorkspace();" />
  <spacer id="workspacesPopupSpacer" flex="1" />
  `,

  manageOnBmsInjectionCSS: `
    .workspaceButton {
      margin-right: unset !important;
      width: unset !important;
      min-height: unset !important;
      margin-right: 3px !important;
    }
    #workspacesToolbarButtonPanel {
      display: none !important;
      background-color: unset !important;
      background-image: unset !important;
      background: unset !important;
    }
    #workspaces-toolbar-button {
      background-color: unset !important;
      background-image: unset !important;
      background: unset !important;
    }
    #workspacesPopupContent {
      max-height: unset !important;
      padding: 0px 0px 0px 0px !important;
      width: inherit !important;
      overflow: unset !important;
    }
    .workspaceButton label{
      display: none !important;
    }
    #workspacesCreateNewWorkspaceButton{
      margin-right: unset !important;
      width: unset !important;
      min-height: unset !important;
    }
    #workspacesCreateNewWorkspaceButton label {
      display: none !important;
    }
     `,

  workspaceBlockElement(
    workspaceId,
    workspaceName,
    selected,
    workspaceManageOnBMSMode,
  ) {
    return `<toolbarbutton id="workspace-${workspaceId}" context="workspaces-toolbar-item-context-menu"
                               class="toolbarbutton-1 chromeclass-toolbar-additional workspaceButton ${
                                 workspaceManageOnBMSMode
                                   ? "sidepanel-icon"
                                   : ""
                               }"
                               ${
                                 selected ? 'selected="true"' : ""
                               } workspaceId="${workspaceId}"
                               oncommand="gWorkspaces.changeWorkspace('${workspaceId}');" />
               `;
  },

  async getWorkspaceBlockElement(
    workspaceId,
    windowId,
    workspaceManageOnBMSMode,
  ) {
    let workspacesData =
      await WorkspacesWindowIdUtils.getWindowWorkspacesDataWithoutPreferences(
        windowId,
      );
    let workspace = workspacesData[workspaceId];
    let selectedWorkspaceId =
      await WorkspacesWindowIdUtils.getSelectedWorkspaceId(windowId);
    let selected = workspaceId == selectedWorkspaceId;
    return this.workspaceBlockElement(
      workspaceId,
      workspace.name,
      selected,
      workspaceManageOnBMSMode,
    );
  },

  async getAllWorkspacesBlockElements(windowId, workspaceManageOnBMSMode) {
    let workspacesData =
      await WorkspacesWindowIdUtils.getWindowWorkspacesDataWithoutPreferences(
        windowId,
      );
    let selectedWorkspaceId =
      await WorkspacesWindowIdUtils.getSelectedWorkspaceId(windowId);

    let workspaceBlockElements = [];
    for (let workspaceId in workspacesData) {
      let workspace = workspacesData[workspaceId];
      let selected = workspaceId == selectedWorkspaceId;
      workspaceBlockElements.push(
        this.workspaceBlockElement(
          workspaceId,
          workspace.name,
          selected,
          workspaceManageOnBMSMode,
        ),
      );
    }
    return workspaceBlockElements;
  },
};
