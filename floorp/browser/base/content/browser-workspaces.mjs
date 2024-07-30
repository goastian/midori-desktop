/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */

import { WorkspacesMigratorUtils } from "./modules/workspaces/WorkspacesMigratorUtils.mjs";
import { WorkspacesIdUtils } from "./modules/workspaces/WorkspacesIdUtils.mjs";
import { WorkspacesElementService } from "./modules/workspaces/WorkspacesElementService.mjs";
import { WorkspacesDataSaver } from "./modules/workspaces/WorkspacesDataSaver.mjs";
import { WorkspacesWindowIdUtils } from "resource://floorp/WorkspacesWindowIdUtils.mjs";
import {
  WorkspacesService,
  WorkspacesReorderService,
  workspacesPreferences,
  WorkspacesWindowUuidService,
  getWorkspaceIconUrl,
} from "resource://floorp/WorkspacesService.mjs";

import { gFloorpContextMenu } from "chrome://floorp/content/browser-context-menu.mjs";
import { gBmsWindow } from "./browser-bms-window.mjs";

/* Mozilla's ES Module. It can be impoted via ChromeUtils */
var { CustomizableUI } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableUI.sys.mjs"
);

/**
 *
 * @typedef {object} gWorkspaces - Object of Floorp's Workspaces feature.
 * @property {boolean} _initialized - Indicates if the workspaces object has been initialized.
 * @property {string|null} _currentWorkspaceId - The ID of the current workspace.
 * @property {boolean} _popuppanelNotFound - Indicates if the popup panel is not found.
 * @property {boolean} _workspaceToolbarButtonNotFound - Indicates if the workspace toolbar button is not found.
 * @property {boolean} _workspaceManageOnBMSMode - Indicates if the workspace management is in BMS mode.
 * @property {boolean} _workspacesTemporarilyDisabled - Indicates if the workspaces are temporarily disabled.
 *
 * @property {HTMLElement} titlebar - The titlebar element.
 * @property {HTMLElement} TabsToolbar - The TabsToolbar element.
 * @property {HTMLElement} workspacesToolbarButtonPanel - The workspaces toolbar button panel element.
 * @property {HTMLElement} workspacesToolbarButton - The workspaces toolbar button element.
 * @property {HTMLElement} workspacesPopupContent - The workspaces popup content element.
 * @property {HTMLElement} arrowscrollbox - The arrowscrollbox element.
 * @property {HTMLElement} TabsToolbartoolbarItems - The toolbar items in the TabsToolbar.
 * @property {NodeList} workspaceButtons - The list of workspace buttons.
 *
 * @property {Localization} l10n - The localization object.
 *
 * @property {Function} rebuildWorkspacesToolbar - Rebuilds the workspaces toolbar.
 * @property {Function} rebuildWorkspacesLabels - Rebuilds the workspaces labels.
 * @property {Function} addToolbarWorkspaceButtonToAppend - Adds a toolbar workspace button to append.
 * @property {Function} changeToolbarSelectedWorkspaceView - Changes the selected workspace view in the toolbar.
 * @property {Function} updateToolbarButtonAndPopupContentIconAndLabel - Updates the toolbar button and popup content icon and label.
 * @property {Function} enableWorkspacesManageOnBMSMode - Enables the workspace management in BMS mode.
 *
 * @property {boolean} workspaceEnabled - Indicates if the workspace is enabled.
 *
 * @property {string} getCurrentWindowId - Gets the current window ID.
 * @property {object} getCurrentWorkspace - Gets the current workspace.
 * @property {string} getCurrentWorkspaceId - Gets the current workspace ID.
 * @property {object} getCurrentWorkspacesData - Gets the current workspaces data.
 * @property {object} getCurrentWorkspacesDataWithoutPreferences - Gets the current workspaces data without preferences.
 * @property {number} getCurrentWorkspacesCount - Gets the current workspaces count.
 * @property {object} getDefaultWorkspace - Gets the default workspace.
 * @property {string} getDefaultWorkspaceId - Gets the default workspace ID.
 * @property {Array<string>} getAllWorkspacesBlockElements - Gets all workspace block elements.
 * @property {string} getWorkspaceBlockElement - Gets a workspace block element string. Parse it to a fragment before appending it to the DOM.
 * @property {object} getWorkspaceById - Gets a workspace by ID.
 * @property {Array<string>} getAllWorkspacesId - Gets all workspace IDs.
 *
 * @property {Function} saveWorkspacesDataWithoutOverwritingPreferences - Saves the workspaces data without overwriting preferences.
 * @property {Function} saveWorkspaceData - Saves the workspace data. It overrites the existing all preferences.
 * @property {Function} saveWindowPreferences - Saves the current window's workspaces preferences.
 *
 * @property {string} getWorkspaceIdFromAttribute - Gets the workspace ID from an attribute.
 * @property {Function} setWorkspaceIdToAttribute - Sets the workspace ID to an attribute.
 * @property {Function} removeTabFromWorkspace - Removes a tab from a workspace.
 * @property {Function} removeWorkspaceById - Removes a workspace by ID.
 * @property {Function} removeWindowWorkspacesDataById - Removes the window's workspaces data by ID.
 *
 * @property {Function} createWorkspace - Creates a workspace.
 * @property {Function} createNoNameWorkspace - Creates a workspace with no name.
 * @property {Function} deleteWorkspace - Deletes a workspace.
 * @property {Function} renameWorkspace - Renames a workspace.
 * @property {Function} setDefaultWorkspace - Sets the default workspace.
 *
 * @property {Function} checkWorkspacesHasTab - Checks if a workspace has a tab.
 * @property {Function} checkAllWorkspacesHasTab - Checks if all workspaces have a tab.
 *
 * @property {Function} changeWorkspace - Changes the workspace.
 * @property {Function} changeWorkspaceToDefaultWorkspace - Changes the workspace to the default workspace.
 * @property {Function} changeWorkspaceToNextOrBeforeWorkspace - Changes the workspace to the next or before workspace.
 * @property {Function} workspaceIdExists - Checks if a workspace ID exists in the current window.
 * @property {Function} setSelectWorkspace - Sets the selected workspace. Use chnageWorkspace instead of this function.
 *
 * @property {string} workspacesTabAttributionId - The workspaces tab attribution ID.
 *
 * @property {Function} moveTabToWorkspace - Moves a tab to a workspace.
 * @property {Function} moveTabsToWorkspace - Moves tabs to a workspace.
 * @property {Function} moveTabsToWorkspaceFromTabContextMenu - Moves tabs to a workspace from the selected tabs from tab context menu.
 * @property {Function} createTabForWorkspace - Creates a tab for a workspace.
 *
 * @property {Function} getWorkspaceFirstTab - Gets the first tab of a workspace.
 * @property {Function} getWorkspaceSelectedTab - Gets the selected tab of a workspace.
 *
 * @property {Function} removeWorkspaceTabs - Removes the tabs of a workspace.
 *
 * @property {Function} switchToAnotherWorkspaceTab - Switches to another workspace tab.
 *
 * @property {Function} renameWorkspaceWithCreatePrompt - Renames a workspace with a create prompt.
 * @property {Function} manageWorkspaceFromDialog - Manages a workspace from a dialog.
 *
 * @property {Function} getWorkspaceIcon - Gets the workspace's icon.
 * @property {Function} setWorkspaceIcon - Sets the workspace's icon.
 * @property {Function} getWorkspaceContainerUserContextId - Gets the workspace container user context ID.
 * @property {Function} setWorkspaceContainerUserContextId - Sets the workspace container user context ID.
 * @property {Function} setWorkspaceContainerUserContextIdAndIcon - Sets the workspace container user context ID and icon.
 *
 * @property {Function} checkAllTabsForVisibility - Checks all tabs for visibility by the workspace.
 *
 * @property {Function} reorderWorkspaceDown - Reorders the workspace down.
 * @property {Function} reorderWorkspaceUp - Reorders the workspace up.
 *
 * @property {Function} createWorkspacesToolbarButton - Creates the workspaces toolbar button.
 *
 * @property {Function} init - Initializes the workspaces feature.
 *
 */
export const gWorkspaces = {
  _initialized: false,
  _currentWorkspaceId: null,
  _popuppanelNotFound: false,
  _workspaceToolbarButtonNotFound: false,
  _workspaceManageOnBMSMode: false,
  _workspacesTemporarilyDisabled: false,

  /** Elements */
  get titlebar() {
    return document.getElementById("titlebar");
  },

  get TabsToolbar() {
    return document.getElementById("TabsToolbar");
  },

  get workspacesToolbarButtonPanel() {
    return document.getElementById("workspacesToolbarButtonPanel");
  },

  get workspacesToolbarButton() {
    return document.getElementById("workspaces-toolbar-button");
  },

  get workspacesPopupContent() {
    return document.getElementById("workspacesBmsContent")
      ? document.getElementById("workspacesBmsContent")
      : document.getElementById("workspacesPopupContent");
  },

  get arrowscrollbox() {
    return document.getElementById("tabbrowser-arrowscrollbox");
  },

  get TabsToolbartoolbarItems() {
    return document.querySelector("#TabsToolbar .toolbar-items");
  },

  get workspaceButtons() {
    return document.querySelectorAll(".workspaceButton");
  },

  get l10n() {
    const l10n = new Localization(
      ["browser/floorp.ftl", "branding/brand.ftl"],
      true
    );
    return l10n;
  },

  /** Workspaces Toolbar */
  async rebuildWorkspacesToolbar() {
    if (!gWorkspaces.workspacesPopupContent) {
      gWorkspaces._popuppanelNotFound = true;
      return;
    }
    gWorkspaces._popuppanelNotFound = false;

    // Remove all Workspaces toolbar
    while (gWorkspaces.workspaceButtons.length) {
      gWorkspaces.workspacesPopupContent.firstChild.remove();
    }

    // Add all Workspaces toolbar
    let workspaceBlockElements =
      await gWorkspaces.getAllWorkspacesBlockElements();
    for (let workspaceBlockElement of workspaceBlockElements) {
      let workspaceBlockElementFragment =
        window.MozXULElement.parseXULToFragment(workspaceBlockElement);
      gWorkspaces.workspacesPopupContent.appendChild(
        workspaceBlockElementFragment
      );
    }

    if (gWorkspaces._workspaceManageOnBMSMode) {
      for (let workspaceButton of gWorkspaces.workspaceButtons) {
        workspaceButton.classList.add("sidepanel-icon");
      }
    }

    await this.updateToolbarButtonAndPopupContentIconAndLabel(
      await this.getCurrentWorkspaceId()
    );

    // Against XSS
    this.rebuildWorkspacesLabels();
  },

  async rebuildWorkspacesLabels() {
    let workspacesData = await this.getCurrentWorkspacesData();
    for (let workspaceId in workspacesData) {
      let workspace = workspacesData[workspaceId];
      let workspaceToolbarButton = document.getElementById(
        `workspace-${workspaceId}`
      );
      if (workspaceToolbarButton) {
        workspaceToolbarButton.setAttribute("label", workspace.name);
      }
    }
  },

  async addToolbarWorkspaceButtonToAppend(workspaceId) {
    let toolbarWorkspaceButton = await this.getWorkspaceBlockElement(
      workspaceId,
      this._workspaceManageOnBMSMode
    );
    let toolbarWorkspaceButtonFragment =
      window.MozXULElement.parseXULToFragment(toolbarWorkspaceButton);
    this.workspacesPopupContent.appendChild(toolbarWorkspaceButtonFragment);

    let workspace = await this.getWorkspaceById(workspaceId);

    let elem = document.querySelector(
      `.workspaceButton[workspaceId="${workspaceId}"]`
    );
    elem.setAttribute("label", workspace.name);
    elem.setAttribute("tooltiptext", workspace.name);
    elem.style.listStyleImage = `url(${getWorkspaceIconUrl(workspace.icon)})`;
  },

  async changeToolbarSelectedWorkspaceView(workspaceId) {
    let selectedWorkspaceToolbarButton = document.querySelector(
      `.workspaceButton[selected="true"]`
    );

    if (selectedWorkspaceToolbarButton) {
      selectedWorkspaceToolbarButton.removeAttribute("selected");
    }

    let workspaceToolbarButton = document.getElementById(
      `workspace-${workspaceId}`
    );

    if (workspaceToolbarButton) {
      workspaceToolbarButton.setAttribute("selected", true);
    }

    await this.updateToolbarButtonAndPopupContentIconAndLabel(workspaceId);
  },

  async updateToolbarButtonAndPopupContentIconAndLabel(workspaceId) {
    let workspace = await this.getWorkspaceById(workspaceId);
    if (!workspace) {
      console.error(new Error("Workspace not found " + workspaceId));
      return;
    }

    if (this.workspacesToolbarButton) {
      this.workspacesToolbarButton.setAttribute("label", workspace.name);
      this.workspacesToolbarButton.style.listStyleImage = `url(${getWorkspaceIconUrl(
        workspace.icon
      )})`;
    }

    let popupElements = this.workspaceButtons;

    for (let popupElement of popupElements) {
      let popupElementWorkspaceId = popupElement.getAttribute("workspaceId");
      let gotWorkspace = await this.getWorkspaceById(popupElementWorkspaceId);
      if (!gotWorkspace) {
        console.warn(
          "Workspace not found. It may removed or not created " +
            popupElementWorkspaceId
        );
        continue;
      }

      popupElement.setAttribute("label", gotWorkspace.name);
      popupElement.setAttribute("tooltiptext", gotWorkspace.name);
      popupElement.style.listStyleImage = `url(${getWorkspaceIconUrl(
        gotWorkspace.icon
      )})`;
    }
  },

  enableWorkspacesManageOnBMSMode() {
    if (this._workspaceManageOnBMSMode) {
      return;
    }

    let bmsSidebar = document.getElementById("sidebar-select-box");
    if (!bmsSidebar) {
      this._workspaceManageOnBMSMode = false;
      return;
    }

    let workspacesPopupContentFragment =
      window.MozXULElement.parseXULToFragment(
        WorkspacesElementService.manageOnBmsInjectionXHTML
      );

    bmsSidebar.prepend(workspacesPopupContentFragment);

    this.workspacesPopupContent.removeAttribute("flex");

    const styleSheet = WorkspacesElementService.manageOnBmsInjectionCSS;
    document.head.appendChild(document.createElement("style")).textContent =
      styleSheet;
    for (let workspaceButton of this.workspaceButtons) {
      workspaceButton.classList.add("sidepanel-icon");

      // Move to BMS Sidebar
      this.workspacesPopupContent.appendChild(workspaceButton);
    }

    this.rebuildWorkspacesToolbar();
    this._workspaceManageOnBMSMode = true;
  },

  /* Preferences */
  get workspaceEnabled() {
    return Services.prefs.getBoolPref(
      workspacesPreferences.WORKSPACES_ENABLED_PREF,
      false
    );
  },

  /* get Workspaces information */
  getCurrentWindowId() {
    let windowId = window.workspacesWindowId;
    if (windowId == null) {
      windowId = WorkspacesWindowUuidService.getGeneratedUuid();
      window.workspacesWindowId = windowId;
    }

    return windowId;
  },

  async getCurrentWorkspace() {
    let windowId = this.getCurrentWindowId();
    let workspaceId = await WorkspacesWindowIdUtils.getSelectedWorkspaceId(
      windowId
    );

    if (workspaceId == null) {
      let id = await WorkspacesWindowIdUtils.getDefaultWorkspaceId(windowId);
      let workspace = await WorkspacesIdUtils.getWorkspaceByIdAndWindowId(
        id,
        windowId
      );
      return workspace;
    }

    let workspace = await WorkspacesIdUtils.getWorkspaceByIdAndWindowId(
      workspaceId,
      windowId
    );
    return workspace;
  },

  async getCurrentWorkspaceId() {
    let currentWorkspace = await this.getCurrentWorkspace();
    if (!currentWorkspace) {
      return null;
    }
    return currentWorkspace.id;
  },

  async getCurrentWorkspacesData() {
    let windowId = this.getCurrentWindowId();
    let workspacesData = await WorkspacesWindowIdUtils.getWindowWorkspacesData(
      windowId
    );
    return workspacesData;
  },

  async getCurrentWorkspacesDataWithoutPreferences() {
    let windowId = this.getCurrentWindowId();
    let workspacesData =
      await WorkspacesWindowIdUtils.getWindowWorkspacesDataWithoutPreferences(
        windowId
      );
    return workspacesData;
  },

  async getCurrentWorkspacesCount() {
    let windowId = this.getCurrentWindowId();
    let workspacesCount =
      await WorkspacesWindowIdUtils.getWindowWorkspacesCount(windowId);
    return workspacesCount;
  },

  async getDefaultWorkspace() {
    let windowId = this.getCurrentWindowId();
    let defaultWorkspaceId =
      await WorkspacesWindowIdUtils.getDefaultWorkspaceId(windowId);
    let defaultWorkspace = await WorkspacesIdUtils.getWorkspaceByIdAndWindowId(
      defaultWorkspaceId,
      windowId
    );
    return defaultWorkspace;
  },

  async getDefaultWorkspaceId() {
    let windowId = this.getCurrentWindowId();
    let defaultWorkspaceId =
      await WorkspacesWindowIdUtils.getDefaultWorkspaceId(windowId);
    return defaultWorkspaceId;
  },

  async getAllWorkspacesBlockElements() {
    let windowId = this.getCurrentWindowId();
    let result = await WorkspacesElementService.getAllWorkspacesBlockElements(
      windowId,
      this._workspaceManageOnBMSMode
    );
    return result;
  },

  async getWorkspaceBlockElement(workspaceId) {
    let windowId = this.getCurrentWindowId();
    let result = await WorkspacesElementService.getWorkspaceBlockElement(
      workspaceId,
      windowId,
      this._workspaceManageOnBMSMode
    );
    return result;
  },

  async getWorkspaceById(workspaceId) {
    let windowId = this.getCurrentWindowId();
    let result = await WorkspacesIdUtils.getWorkspaceByIdAndWindowId(
      workspaceId,
      windowId
    );
    return result;
  },

  async getAllWorkspacesId() {
    let windowId = this.getCurrentWindowId();
    let allWorkspacesId = await WorkspacesWindowIdUtils.getAllWorkspacesId(
      windowId
    );

    return allWorkspacesId;
  },

  /* Workspaces saver */
  async saveWorkspacesDataWithoutOverwritingPreferences(workspacesData) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesDataSaver.saveWorkspacesDataWithoutOverwritingPreferences(
      workspacesData,
      windowId
    );
  },

  async saveWorkspaceData(workspaceData) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesDataSaver.saveWorkspaceData(workspaceData, windowId);
  },

  async saveWindowPreferences(preferences) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesDataSaver.saveWindowPreferences(preferences, windowId);
  },

  /* tab attribute */
  getWorkspaceIdFromAttribute(tab) {
    let workspaceId = tab.getAttribute(this.workspacesTabAttributionId);
    return workspaceId;
  },

  setWorkspaceIdToAttribute(tab, workspaceId) {
    tab.setAttribute(this.workspacesTabAttributionId, workspaceId);
  },

  /* Workspaces remover */
  async removeTabFromWorkspace(workspaceId, tab) {
    let workspacesData = await this.getCurrentWorkspacesData();
    let index = workspacesData[workspaceId].tabs.indexOf(
      tab.getAttribute(this.workspacesTabAttributionId)
    );
    workspacesData[workspaceId].tabs.splice(index, 1);
  },

  async removeWorkspaceById(workspaceId) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesIdUtils.removeWorkspaceById(workspaceId, windowId);
    this.removeWorkspaceTabs(workspaceId);
  },

  async removeWindowWorkspacesDataById() {
    let windowId = this.getCurrentWindowId();
    await WorkspacesWindowIdUtils.removeWindowWorkspacesDataById(windowId);
  },

  /* Workspaces manager */
  async createWorkspace(
    workspaceName,
    defaultWorkspace,
    addNewTab = false,
    change = true,
    icon,
    currentTabMigration = false
  ) {
    let windowId = this.getCurrentWindowId();
    let createdWorkspaceId = await WorkspacesService.createWorkspace(
      workspaceName,
      windowId,
      defaultWorkspace,
      icon ? icon : null,
      change
    );

    if (change) {
      await this.changeWorkspace(
        createdWorkspaceId,
        1,
        addNewTab,
        currentTabMigration,
        false
      );
    } else {
      await this.rebuildWorkspacesToolbar();
    }
  },

  async createNoNameWorkspace() {
    await this.createWorkspace(
      this.l10n.formatValueSync("workspace-new-default-name"),
      false,
      true
    );
  },

  async deleteWorkspace(workspaceId) {
    let windowId = this.getCurrentWindowId();
    let currentWorkspaceId = await this.getCurrentWorkspaceId();
    await WorkspacesService.deleteWorkspace(workspaceId, windowId);
    this.removeWorkspaceTabs(workspaceId);
    if (workspaceId == currentWorkspaceId) {
      await this.changeWorkspace(
        await WorkspacesWindowIdUtils.getDefaultWorkspaceId(windowId),
        0
      );
    }
    this.rebuildWorkspacesToolbar();
  },

  async renameWorkspace(workspaceId, newName) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesService.renameWorkspace(workspaceId, newName, windowId);
  },

  async setDefaultWorkspace(workspaceId) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesService.setDefaultWorkspace(workspaceId, windowId);

    // rebuild the workspacesToolbar
    gWorkspaces.rebuildWorkspacesToolbar(windowId);
  },

  async checkWorkspacesHasTab(workspaceId) {
    for (let tab of window.gBrowser.tabs) {
      if (tab.getAttribute(this.workspacesTabAttributionId) == workspaceId) {
        return true;
      }
    }
    return false;
  },

  async checkAllWorkspacesHasTab() {
    let windowId = this.getCurrentWindowId();
    let allWorkspacesId = await WorkspacesWindowIdUtils.getAllWorkspacesId(
      windowId
    );

    for (let workspaceId of allWorkspacesId) {
      let workspaceHasTab = await this.checkWorkspacesHasTab(workspaceId);
      if (workspaceHasTab) {
        return true;
      }
    }
    return false;
  },

  async changeWorkspace(
    workspaceId,
    option,
    addNewTab = false,
    currentTabMigration = false,
    saveSelectWorkspace = true
  ) {
    if (!this.workspaceEnabled) {
      return;
    }

    // Change Workspace
    let willChangeWorkspaceLastShowTab =
      document.querySelector(
        `[${WorkspacesService.workspaceLastShowId}="${workspaceId}"]`
      ) || null;

    if (willChangeWorkspaceLastShowTab && !currentTabMigration) {
      if (window.gBrowser.selectedTab == willChangeWorkspaceLastShowTab) {
        gWorkspaces.switchToAnotherWorkspaceTab(workspaceId);
      } else {
        window.gBrowser.selectedTab = willChangeWorkspaceLastShowTab;
      }
    } else if (addNewTab) {
      let tab = gWorkspaces.createTabForWorkspace(workspaceId);
      window.gBrowser.selectedTab = tab;
    } else if (currentTabMigration) {
      let tab = window.gBrowser.selectedTab;
      await gWorkspaces.moveTabToWorkspace(workspaceId, tab, true);
    } else {
      gWorkspaces.switchToAnotherWorkspaceTab(workspaceId);
    }

    // Close workspace popup check
    if (
      Services.prefs.getBoolPref(
        workspacesPreferences.WORKSPACES_CLOSE_POPUP_AFTER_CLICK_PREF
      )
    ) {
      gWorkspaces.workspacesToolbarButton.click();
    }

    if (saveSelectWorkspace) {
      await gWorkspaces.setSelectWorkspace(workspaceId);
    }

    switch (option) {
      case 1:
        // rebuild the workspaces Toolbar
        await gWorkspaces.rebuildWorkspacesToolbar();
        await gWorkspaces.changeToolbarSelectedWorkspaceView(workspaceId);
        await gWorkspaces.updateToolbarButtonAndPopupContentIconAndLabel(
          workspaceId
        );
        break;
      case 2:
        // Append Workspaces Toolbar Workspace Button
        await gWorkspaces.addToolbarWorkspaceButtonToAppend(workspaceId);
        await gWorkspaces.changeToolbarSelectedWorkspaceView(workspaceId);
        break;
      default:
        // Change Workspaces Toolbar Selected Workspace View
        await gWorkspaces.changeToolbarSelectedWorkspaceView(workspaceId);
        break;
    }
    await gWorkspaces.checkAllTabsForVisibility();
  },

  async changeWorkspaceToDefaultWorkspace() {
    let windowId = await gWorkspaces.getDefaultWorkspaceId();
    await this.changeWorkspace(windowId);
  },

  async changeWorkspaceToNextOrBeforeWorkspace(isNext) {
    let currentWorkspaceId = await gWorkspaces.getCurrentWorkspaceId();
    let allWorkspacesId = await gWorkspaces.getAllWorkspacesId();
    const targetIndex = allWorkspacesId.indexOf(currentWorkspaceId);

    if (targetIndex !== -1) {
      const previousValue = allWorkspacesId[targetIndex - 1];
      const nextValue = allWorkspacesId[targetIndex + 1];

      if (isNext) {
        if (nextValue) {
          await this.changeWorkspace(nextValue);
        } else {
          await this.changeWorkspace(allWorkspacesId[0]);
        }
      } else if (previousValue) {
        await this.changeWorkspace(previousValue);
      } else {
        await this.changeWorkspace(allWorkspacesId[allWorkspacesId.length - 1]);
      }
    }
  },

  async workspaceIdExists(workspaceId) {
    let windowId = this.getCurrentWindowId();
    let result = await WorkspacesIdUtils.workspaceIdExists(
      workspaceId,
      windowId
    );
    return result;
  },

  async setSelectWorkspace(workspaceId) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesService.setSelectWorkspace(workspaceId, windowId);
  },

  /* tab manager */
  get workspacesTabAttributionId() {
    return WorkspacesService.workspacesTabAttributionId;
  },

  async moveTabToWorkspace(workspaceId, tab, disableMove = false) {
    let oldWorkspaceId = this.getWorkspaceIdFromAttribute(tab);
    this.setWorkspaceIdToAttribute(tab, workspaceId);
    if (tab === window.gBrowser.selectedTab && !disableMove) {
      gWorkspaces.switchToAnotherWorkspaceTab(oldWorkspaceId, workspaceId);
    } else {
      gWorkspaces.checkAllTabsForVisibility();
    }
  },

  async moveTabsToWorkspace(workspaceId, tabs) {
    for (let tab of tabs) {
      this.setWorkspaceIdToAttribute(tab, workspaceId);

      if (tab === window.gBrowser.selectedTab) {
        await gWorkspaces.changeWorkspace(workspaceId);
        gWorkspaces.checkAllTabsForVisibility();
      }
    }

    gWorkspaces.checkAllTabsForVisibility();
  },

  moveTabsToWorkspaceFromTabContextMenu(workspaceId) {
    let reopenedTabs = window.TabContextMenu.contextTab.multiselected
      ? window.gBrowser.selectedTabs
      : [window.TabContextMenu.contextTab];

    for (let tab of reopenedTabs) {
      this.moveTabToWorkspace(workspaceId, tab);
      if (tab == window.gBrowser.selectedTab) {
        this.switchToAnotherWorkspaceTab(workspaceId, tab);
      }

      gWorkspaces.checkAllTabsForVisibility();
    }

    gWorkspaces.checkAllTabsForVisibility();
  },

  createTabForWorkspace(workspaceId, url) {
    if (!url) {
      url = Services.prefs.getStringPref("browser.startup.homepage");
    }

    let tabs = window.gBrowser.tabs;
    for (let tab of tabs) {
      if (!tab.hasAttribute(this.workspacesTabAttributionId)) {
        this.setWorkspaceIdToAttribute(tab, workspaceId);
        return tab;
      }
    }

    let tab = window.gBrowser.addTab(url, {
      skipAnimation: true,
      inBackground: false,
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    this.setWorkspaceIdToAttribute(tab, workspaceId);
    return tab;
  },

  getWorkspaceFirstTab(workspaceId) {
    for (let tab of window.gBrowser.tabs) {
      if (tab.getAttribute(this.workspacesTabAttributionId) == workspaceId) {
        return tab;
      }
    }
    return null;
  },

  getWorkspaceSelectedTab(workspaceId) {
    for (let tab of window.gBrowser.tabs) {
      if (
        tab.getAttribute(WorkspacesService.workspaceLastShowId) == workspaceId
      ) {
        return tab;
      }
    }
    return null;
  },

  removeWorkspaceTabs(workspaceId) {
    for (let tab of window.gBrowser.tabs) {
      if (tab.getAttribute(this.workspacesTabAttributionId) == workspaceId) {
        window.gBrowser.removeTab(tab);
      }
    }
  },

  switchToAnotherWorkspaceTab(workspaceId) {
    let workspaceTabs = document.querySelectorAll(
      `[${this.workspacesTabAttributionId}="${workspaceId}"]`
    );

    if (!workspaceTabs.length) {
      let tab = this.createTabForWorkspace(workspaceId);
      this.moveTabToWorkspace(workspaceId, tab);
      window.gBrowser.selectedTab = tab;
    } else {
      window.gBrowser.selectedTab = workspaceTabs[0];
    }
  },

  /* Popup & dialog functions */
  async renameWorkspaceWithCreatePrompt(workspaceId) {
    let prompts = Services.prompt;
    let workspace = await gWorkspaces.getWorkspaceById(workspaceId);
    let input = { value: workspace.name };
    let result = await prompts.prompt(
      window,
      this.l10n.formatValueSync("rename-workspace-prompt-title"),
      this.l10n.formatValueSync("rename-workspace-prompt-text"),
      input,
      null,
      { value: 0 }
    );

    if (result) {
      await gWorkspaces.renameWorkspace(workspaceId, input.value);
      gWorkspaces.rebuildWorkspacesLabels();
    }
  },

  async manageWorkspaceFromDialog(workspaceId = null) {
    if (!workspaceId) {
      workspaceId = await gWorkspaces.getDefaultWorkspaceId();
    }

    let parentWindow = window;
    let object = { workspaceId };
    if (
      parentWindow?.document.documentURI ==
      "chrome://floorp/content/hiddenWindowMac.xhtml"
    ) {
      parentWindow = null;
    }
    if (parentWindow?.gDialogBox) {
      parentWindow.gDialogBox.open(
        "chrome://floorp/content/preferences/dialogs/manageWorkspace.xhtml",
        object
      );
    } else {
      Services.ww.openWindow(
        parentWindow,
        "chrome://floorp/content/preferences/dialogs/manageWorkspace.xhtml",
        null,
        "chrome,titlebar,dialog,centerscreen,modal",
        object
      );
    }
  },

  /* workspace icon Service */
  async getWorkspaceIcon(workspaceId) {
    let windowId = this.getCurrentWindowId();
    let icon = await WorkspacesIdUtils.getWorkspaceIconByIdAndWindowId(
      workspaceId,
      windowId
    );
    return icon;
  },

  async setWorkspaceIcon(workspaceId, icon) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesService.setWorkspaceIcon(workspaceId, icon, windowId);
  },

  /* userContext Service */
  async getWorkspaceContainerUserContextId(workspaceId) {
    let windowId = this.getCurrentWindowId();
    let userContextId =
      await WorkspacesIdUtils.getWorkspaceContainerUserContextId(
        workspaceId,
        windowId
      );
    return userContextId;
  },

  async setWorkspaceContainerUserContextId(workspaceId, userContextId) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesService.setWorkspaceContainerUserContextId(
      workspaceId,
      userContextId,
      windowId
    );
  },

  async setWorkspaceContainerUserContextIdAndIcon(
    workspaceId,
    userContextId,
    icon
  ) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesService.setWorkspaceContainerUserContextIdAndIcon(
      workspaceId,
      userContextId,
      icon,
      windowId
    );

    await this.updateToolbarButtonAndPopupContentIconAndLabel(workspaceId);
  },

  /* Visibility Service */
  async checkAllTabsForVisibility(initialized = false) {
    // BMS Sidebar mode
    if (
      !this._workspaceManageOnBMSMode &&
      Services.prefs.getBoolPref(
        workspacesPreferences.WORKSPACES_MANAGE_ON_BMS_PREF
      )
    ) {
      gWorkspaces.enableWorkspacesManageOnBMSMode();
    }

    if (!this.workspacesToolbarButton && !this._workspaceManageOnBMSMode) {
      return;
    }

    if (gWorkspaces._popuppanelNotFound) {
      gWorkspaces.rebuildWorkspacesToolbar();
    }

    if (this._workspaceToolbarButtonNotFound && this.workspacesToolbarButton) {
      this._workspaceToolbarButtonNotFound = true;
      this.rebuildWorkspacesToolbar();
    }

    // Get Current Workspace & Workspace Id
    let currentWorkspaceId = await gWorkspaces.getCurrentWorkspaceId();
    let workspacesCount = await gWorkspaces.getCurrentWorkspacesCount();

    // Last Show Workspace Attribute
    let selectedTab = window.gBrowser.selectedTab;
    if (
      selectedTab &&
      !selectedTab.hasAttribute(WorkspacesService.workspaceLastShowId) &&
      selectedTab.getAttribute(WorkspacesService.workspacesTabAttributionId) ==
        currentWorkspaceId
    ) {
      let lastShowWorkspaceTabs = document.querySelectorAll(
        `[${WorkspacesService.workspaceLastShowId}="${currentWorkspaceId}"]`
      );

      for (let lastShowWorkspaceTab of lastShowWorkspaceTabs) {
        lastShowWorkspaceTab.removeAttribute(
          WorkspacesService.workspaceLastShowId
        );
      }

      selectedTab.setAttribute(
        WorkspacesService.workspaceLastShowId,
        currentWorkspaceId
      );
    }

    // Check all tabs for visibility
    let tabs = window.gBrowser.tabs;
    for (let i = 0; i < tabs.length; i++) {
      // Set workspaceId if workspaceId is null
      let workspaceId = gWorkspaces.getWorkspaceIdFromAttribute(tabs[i]);
      if (
        !(
          workspaceId !== "" &&
          workspaceId !== null &&
          workspaceId !== undefined
        )
      ) {
        gWorkspaces.setWorkspaceIdToAttribute(tabs[i], currentWorkspaceId);
      }

      let chackedWorkspaceId = gWorkspaces.getWorkspaceIdFromAttribute(tabs[i]);
      if (workspacesCount > 1) {
        if (chackedWorkspaceId == currentWorkspaceId) {
          window.gBrowser.showTab(tabs[i]);
        } else {
          window.gBrowser.hideTab(tabs[i]);
        }
      }
    }

    // Workspace toolbar button label visibility
    try {
      if (
        Services.prefs.getBoolPref(
          workspacesPreferences.WORKSPACE_SHOW_WORKSPACE_NAME_PREF
        )
      ) {
        gWorkspaces.workspacesToolbarButton?.setAttribute("showlabel", true);
      } else {
        gWorkspaces.workspacesToolbarButton?.removeAttribute("showlabel");
      }

      gWorkspaces._currentWorkspaceId = currentWorkspaceId;
    } catch (e) {
      console.error(e);
    }

    // check popuppanel has child element
    if (
      gWorkspaces._popuppanelNotFound &&
      gWorkspaces.workspacesPopupContent.childElementCount == 0 &&
      !initialized
    ) {
      gWorkspaces.rebuildWorkspacesToolbar();
    }
  },

  /* Reorder Service */
  async reorderWorkspaceDown(workspaceId) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesReorderService.reorderWorkspaceDown(
      workspaceId,
      windowId
    ).then(async () => {
      await this.changeWorkspace(workspaceId, 1);
    });
  },

  async reorderWorkspaceUp(workspaceId) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesReorderService.reorderWorkspaceUp(
      workspaceId,
      windowId
    ).then(async () => {
      await this.changeWorkspace(workspaceId, 1);
    });
  },

  /* Toolbar Button */
  async createWorkspacesToolbarButton() {
    const widgetId = "workspaces-toolbar-button";
    const widget = CustomizableUI.getWidget(widgetId);
    if (widget && widget.type !== "custom") {
      return;
    }
    const l10n = new Localization(["browser/floorp.ftl", "branding/brand.ftl"]);
    const l10nText = await l10n.formatValue("workspaces-toolbar-button");
    CustomizableUI.createWidget({
      id: widgetId,
      type: "button",
      label: l10nText,
      tooltiptext: l10nText,
      overflows: false,
      removable: true,
      onCreated(aNode) {
        aNode.setAttribute("type", "menu");
        const popup = window.MozXULElement.parseXULToFragment(
          WorkspacesElementService.panelElement
        );
        aNode.appendChild(popup);
      },
      onCommand() {
        let currentWindow =
          Services.wm.getMostRecentWindow("navigator:browser");
        const panel = currentWindow.document.getElementById(
          "workspacesToolbarButtonPanel"
        );
        panel.openPopup(
          document.getElementById("workspaces-toolbar-button"),
          "bottomright topright",
          0,
          0,
          false,
          false
        );
      },
    });
    if (
      ChromeUtils.importESModule("resource://floorp/FloorpStartup.sys.mjs")
        .isFirstRun
    ) {
      CustomizableUI.addWidgetToArea(widgetId, CustomizableUI.AREA_TABSTRIP);
      CustomizableUI.moveWidgetWithinArea(widgetId, -1);
    }
  },

  /* init */
  async init() {
    if (this._initialized || gBmsWindow.isBmsWindow) {
      return;
    }

    // Add toolbar popup for context menu
    gFloorpContextMenu.addToolbarContentMenuPopupSet(
      `<popupset>
        <menupopup id="workspaces-toolbar-item-context-menu" onpopupshowing="gWorkspaces.contextMenu.createWorkspacesContextMenuItems(event);" />
      </popupset>
      `
    );

    if (
      Services.prefs.getBoolPref(workspacesPreferences.WORKSPACES_ENABLED_PREF)
    ) {
      // if Id exists, it is webpanel window.
      let isWebpanelWindow = new URL(window.location.href).searchParams.get(
        "floorpWebPanelId"
      );
      let isSsWindow = window.floorpSsbWindow;
      if (isWebpanelWindow || isSsWindow) {
        return;
      }
    }

    if (!this.workspaceEnabled) {
      return;
    }

    // toolbar button
    // eslint-disable-next-line no-undef
    await this.createWorkspacesToolbarButton();

    // Initialized complete
    this._initialized = true;
    let currentWorkspace = await gWorkspaces.getCurrentWorkspace();

    // Check Workspaces Need migrate from Legacy Workspaces
    await WorkspacesMigratorUtils.importDataFromLegacyWorkspaces(
      window.gBrowser.tabs,
      this.getCurrentWindowId()
    );

    if (
      !currentWorkspace ||
      currentWorkspace == null ||
      currentWorkspace == undefined
    ) {
      await gWorkspaces.createWorkspace(
        this.l10n.formatValueSync("workspace-default-name"),
        true,
        false
      );

      // Set default Workspace
      let workspaceId = await gWorkspaces.getCurrentWorkspaceId();
      await gWorkspaces.setSelectWorkspace(workspaceId);
    }

    // Add injection CSS
    let styleElemInjectToToolbar = document.createElement("style");
    styleElemInjectToToolbar.id = "workspacesInjectionCSS";
    styleElemInjectToToolbar.textContent =
      WorkspacesElementService.injectionCSS;
    document.head.appendChild(styleElemInjectToToolbar);

    // build Workspaces toolbar
    await gWorkspaces.rebuildWorkspacesToolbar();

    // Set current Workspace Id
    this._currentWorkspaceId = await this.getCurrentWorkspaceId();
    this.checkAllTabsForVisibility(true);

    // set selected Workspace
    this.changeToolbarSelectedWorkspaceView(this._currentWorkspaceId);

    // Create Context Menu
    this.contextMenu.createWorkspacesTabContextMenuItems();

    document.addEventListener("floorpOnLocationChangeEvent", function () {
      gWorkspaces.checkAllTabsForVisibility();
    });

    setInterval(() => {
      gWorkspaces.checkAllTabsForVisibility();
    }, 100);

    // Override the default newtab opening position in tabbar.
    //copy from browser.js (./browser/base/content/browser.js)
    // eslint-disable-next-line no-undef
    BrowserOpenTab = async function ({
      event,
      // eslint-disable-next-line no-undef
      url = BROWSER_NEW_TAB_URL,
    } = {}) {
      let relatedToCurrent = false; //"relatedToCurrent" decide where to open the new tab. Default work as last tab (right side). Floorp use this.
      let where = "tab";
      let currentWorkspaceContextId =
        await gWorkspaces.getWorkspaceContainerUserContextId(
          await gWorkspaces.getCurrentWorkspaceId()
        );
      let _OPEN_NEW_TAB_POSITION_PREF = Services.prefs.getIntPref(
        "floorp.browser.tabs.openNewTabPosition"
      );

      switch (_OPEN_NEW_TAB_POSITION_PREF) {
        case 0:
          // Open the new tab as unrelated to the current tab.
          relatedToCurrent = false;
          break;
        case 1:
          // Open the new tab as related to the current tab.
          relatedToCurrent = true;
          break;
        default:
          if (event) {
            // eslint-disable-next-line no-undef
            where = whereToOpenLink(event, false, true);
            switch (where) {
              case "tab":
              case "tabshifted":
                // When accel-click or middle-click are used, open the new tab as
                // related to the current tab.
                relatedToCurrent = true;
                break;
              case "current":
                where = "tab";
                break;
            }
          }
      }

      //Wrote by Mozilla(Firefox)
      // A notification intended to be useful for modular performance tracking
      // starting as close as is reasonably possible to the time when the user
      // expressed the intent to open a new tab.  Since there are a lot of
      // entry points, this won't catch every single tab created, but most
      // initiated by the user should go through here.
      //
      // Note 1: This notification gets notified with a promise that resolves
      //         with the linked browser when the tab gets created
      // Note 2: This is also used to notify a user that an extension has changed
      //         the New Tab page.
      Services.obs.notifyObservers(
        {
          wrappedJSObject: new Promise(resolve => {
            // eslint-disable-next-line no-undef
            openTrustedLinkIn(url, where, {
              relatedToCurrent,
              resolveOnNewTabCreated: resolve,
              userContextId: gWorkspaces.workspaceEnabled
                ? currentWorkspaceContextId
                : 0,
            });
          }),
        },
        "browser-open-newtab-start"
      );
    };
  },

  eventListeners: {
    async onTabBarStateChanged(reason) {
      // Change Workspaces toolbar visibility
      await gWorkspaces.checkAllTabsForVisibility();
    },
  },

  contextMenu: {
    async createWorkspacesContextMenuItems(event) {
      //delete already exsist items
      let menuElem = document.getElementById(
        "workspaces-toolbar-item-context-menu"
      );
      while (menuElem.firstChild) {
        menuElem.firstChild.remove();
      }

      const contextWorkspaceId = event.explicitOriginalTarget.id.replace(
        "workspace-",
        ""
      );
      const defaultWorkspaceId =
        await WorkspacesWindowIdUtils.getDefaultWorkspaceId(
          gWorkspaces.getCurrentWindowId()
        );
      const beforeSiblingElem =
        event.explicitOriginalTarget.previousElementSibling?.getAttribute(
          "workspaceId"
        ) || null;
      const afterSiblingElem =
        event.explicitOriginalTarget.nextElementSibling?.getAttribute(
          "workspaceId"
        ) || null;
      const isDefaultWorkspace = contextWorkspaceId == defaultWorkspaceId;
      const isBeforeSiblingDefaultWorkspace =
        beforeSiblingElem == defaultWorkspaceId;
      const isAfterSiblingExist = afterSiblingElem != null;
      const needDisableBefore =
        isDefaultWorkspace || isBeforeSiblingDefaultWorkspace;
      const needDisableAfter = isDefaultWorkspace || !isAfterSiblingExist;

      //create context menu
      let menuItem = window.MozXULElement.parseXULToFragment(`
          <menuitem data-l10n-id="reorder-this-workspace-to-up" disabled="${needDisableBefore}"
                    oncommand="gWorkspaces.reorderWorkspaceUp('${contextWorkspaceId}')"/>
          <menuitem data-l10n-id="reorder-this-workspace-to-down" disabled="${needDisableAfter}"
                    oncommand="gWorkspaces.reorderWorkspaceDown('${contextWorkspaceId}')"/>
          <menuseparator class="workspaces-context-menu-separator"/>
          <menuitem data-l10n-id="rename-this-workspace" accesskey="R" oncommand="gWorkspaces.renameWorkspaceWithCreatePrompt('${contextWorkspaceId}')"></menuitem>
          <menuitem data-l10n-id="delete-this-workspace" accesskey="D" ${
            isDefaultWorkspace ? 'disabled="true"' : ""
          } oncommand="gWorkspaces.deleteWorkspace('${contextWorkspaceId}')"></menuitem>
          <menuitem data-l10n-id="manage-this-workspaces" oncommand="gWorkspaces.manageWorkspaceFromDialog('${contextWorkspaceId}')"></menuitem>
        `);
      let parentElem = document.getElementById(
        "workspaces-toolbar-item-context-menu"
      );
      parentElem.appendChild(menuItem);
    },

    createWorkspacesTabContextMenuItems() {
      const beforeElem = document.getElementById("context_moveTabOptions");
      const menuitemElem = window.MozXULElement.parseXULToFragment(`
      <menu id="context_MoveTabToOtherWorkspace" data-l10n-id="move-tab-another-workspace" accesskey="D">
          <menupopup id="workspacesTabContextMenu"
                     onpopupshowing="gWorkspaces.contextMenu.createTabWorkspacesContextMenuItems()"/>
      </menu>
      `);
      beforeElem.before(menuitemElem);
    },

    async createTabWorkspacesContextMenuItems() {
      //delete already exsist items
      let menuElem = document.getElementById("workspacesTabContextMenu");
      while (menuElem.firstChild) {
        menuElem.firstChild.remove();
      }

      //create context menu
      let allWorkspacesId = await gWorkspaces.getAllWorkspacesId();
      for (let workspaceId of allWorkspacesId) {
        let tabWorkspaceId = gWorkspaces.getWorkspaceIdFromAttribute(
          window.TabContextMenu.contextTab
        );

        if (tabWorkspaceId == workspaceId) {
          continue;
        }

        let workspaceData = await gWorkspaces.getWorkspaceById(workspaceId);
        let workspaceName = workspaceData.name;
        let workspaceIcon = workspaceData.icon;
        let menuItem = window.MozXULElement.parseXULToFragment(`
          <menuitem id="context_MoveTabToOtherWorkspace"
                    class="menuitem-iconic"
                    style="list-style-image: url(${getWorkspaceIconUrl(
                      workspaceIcon
                    )})"
                    oncommand="gWorkspaces.moveTabsToWorkspaceFromTabContextMenu('${workspaceId}')"
        />`);

        // Against XSS
        menuItem.firstChild.setAttribute("label", workspaceName);

        let parentElem = document.getElementById("workspacesTabContextMenu");
        parentElem.appendChild(menuItem);
      }
    },
  },
};

window.setTimeout(() => {
  gWorkspaces.init();
}, 1000);
