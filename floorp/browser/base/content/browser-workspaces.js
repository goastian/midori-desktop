/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 var { WorkspacesMigratorUtils } = ChromeUtils.importESModule(
  "resource:///modules/WorkspacesMigratorUtils.sys.mjs"
);

var { WorkspacesService } = ChromeUtils.importESModule(
  "resource:///modules/WorkspacesService.sys.mjs"
);

var { getWorkspaceIconUrl } = ChromeUtils.importESModule(
  "resource:///modules/WorkspacesService.sys.mjs"
);

var { workspacesPreferences } = ChromeUtils.importESModule(
  "resource:///modules/WorkspacesService.sys.mjs"
);

var { WorkspacesWindowUuidService } = ChromeUtils.importESModule(
  "resource:///modules/WorkspacesService.sys.mjs"
);

var { WorkspacesIdUtils } = ChromeUtils.importESModule(
  "resource:///modules/WorkspacesIdUtils.sys.mjs"
);

var { WorkspacesElementService } = ChromeUtils.importESModule(
  "resource:///modules/WorkspacesElementService.sys.mjs"
);

var { WorkspacesWindowIdUtils } = ChromeUtils.importESModule(
  "resource:///modules/WorkspacesWindowIdUtils.sys.mjs"
);

var { WorkspacesDataSaver } = ChromeUtils.importESModule(
  "resource:///modules/WorkspacesDataSaver.sys.mjs"
);

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

XPCOMUtils.defineLazyScriptGetter(
  this,
  "gWorkspacesWindowUtils",
  "chrome://browser/content/browser-workspaces.js"
);

// global variable
var gBrowser = window.gBrowser;
var TabContextMenu = window.TabContextMenu;

var gWorkspaces = {
  _initialized: false,
  _windowId: null,
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
    if (this.workspacesToolbarButton) {
      this.workspacesToolbarButton.setAttribute("label", workspace.name);
      this.workspacesToolbarButton.style.listStyleImage = `url(${getWorkspaceIconUrl(
        workspace.icon
      )})`;
    }

    let popupElements = this.workspaceButtons;

    for (let popupElement of popupElements) {
      let workspaceId = popupElement.getAttribute("workspaceId");
      let workspace = await this.getWorkspaceById(workspaceId);
      popupElement.setAttribute("label", workspace.name);
      popupElement.setAttribute("tooltiptext", workspace.name);
      popupElement.style.listStyleImage = `url(${getWorkspaceIconUrl(
        workspace.icon
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

    const CSS = WorkspacesElementService.manageOnBmsInjectionCSS;
    document.head.appendChild(document.createElement("style")).textContent =
      CSS;
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

  /* get Workspaces infomation */
  getCurrentWindowId() {
    let windowId = gWorkspaces._windowId;
    if (windowId == null) {
      windowId = WorkspacesWindowUuidService.getGeneratedUuid();
      gWorkspaces._windowId = windowId;
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
  async saveWorkspacesData(workspacesData) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
  },

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
    await this.saveWorkspacesData(workspacesData);
  },

  async removeWorkspaceById(workspaceId) {
    let windowId = this.getCurrentWindowId();
    await WorkspacesIdUtils.removeWorkspaceById(workspaceId, windowId);
    this.removeWorkspaceTabs(workspaceId);
  },

  async removeWindowWorkspacesDataById() {
    let windowId = this.getCurrentWindowId();
    await WorkspacesIdUtils.removeWindowWorkspacesDataById(windowId);
  },

  /* Workspaces manager */
  async createWorkspace(name, defaultWorkspace, addNewTab = false) {
    let windowId = this.getCurrentWindowId();
    let createdWorkspaceId = await WorkspacesService.createWorkspace(
      name,
      windowId,
      defaultWorkspace
    );
    this.changeWorkspace(
      createdWorkspaceId,
      defaultWorkspace ? 1 : 2,
      addNewTab
    );
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
      this.changeWorkspace(
        await WorkspacesWindowIdUtils.getDefaultWorkspaceId(windowId)
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
    for (let tab of gBrowser.tabs) {
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

  changeWorkspace(workspaceId, option, addNewTab = false) {
    if (!this.workspaceEnabled) {
      return;
    }

    // Change Workspace
    let willChangeWorkspaceLastShowTab =
      document.querySelector(
        `[${WorkspacesService.workspaceLastShowId}="${workspaceId}"]`
      ) || null;

    if (willChangeWorkspaceLastShowTab) {
      gBrowser.selectedTab = willChangeWorkspaceLastShowTab;
    } else if (addNewTab) {
      let tab = gWorkspaces.createTabForWorkspace(workspaceId);
      gBrowser.selectedTab = tab;
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

    gWorkspaces.setSelectWorkspace(workspaceId);

    switch (option) {
      case 1:
        // rebuild the workspaces Toolbar
        gWorkspaces.rebuildWorkspacesToolbar();
        gWorkspaces.changeToolbarSelectedWorkspaceView(workspaceId);
        gWorkspaces.updateToolbarButtonAndPopupContentIconAndLabel(workspaceId);
        break;
      case 2:
        // Append Workspaces Toolbar Workspace Button
        gWorkspaces.addToolbarWorkspaceButtonToAppend(workspaceId);
        gWorkspaces.changeToolbarSelectedWorkspaceView(workspaceId);
        break;
      default:
        // Change Workspaces Toolbar Selected Workspace View
        gWorkspaces.changeToolbarSelectedWorkspaceView(workspaceId);
        break;
    }
    gWorkspaces.checkAllTabsForVisibility();
  },

  async changeWorkspaceToDefaultWorkspace() {
    let windowId = await gWorkspaces.getDefaultWorkspaceId();
    this.changeWorkspace(windowId);
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
          this.changeWorkspace(nextValue);
        } else {
          this.changeWorkspace(allWorkspacesId[0]);
        }
      } else if (previousValue) {
        this.changeWorkspace(previousValue);
      } else {
        this.changeWorkspace(allWorkspacesId[allWorkspacesId.length - 1]);
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

  moveTabToWorkspace(workspaceId, tab) {
    let oldWorkspaceId = this.getWorkspaceIdFromAttribute(tab);
    this.setWorkspaceIdToAttribute(tab, workspaceId);
    if (tab === gBrowser.selectedTab) {
      gWorkspaces.switchToAnotherWorkspaceTab(oldWorkspaceId, workspaceId);
    } else {
      gWorkspaces.checkAllTabsForVisibility();
    }
  },

  moveTabsToWorkspace(workspaceId, tabs) {
    for (let tab of tabs) {
      this.setWorkspaceIdToAttribute(tab, workspaceId);

      if (tab === gBrowser.selectedTab) {
        gWorkspaces.changeWorkspace(workspaceId);
        gWorkspaces.checkAllTabsForVisibility();
      }
    }

    gWorkspaces.checkAllTabsForVisibility();
  },

  moveTabsToWorkspaceFromTabContextMenu(workspaceId) {
    let reopenedTabs = TabContextMenu.contextTab.multiselected
      ? gBrowser.selectedTabs
      : [TabContextMenu.contextTab];

    for (let tab of reopenedTabs) {
      this.moveTabToWorkspace(workspaceId, tab);
      if (tab == gBrowser.selectedTab) {
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

    let tabs = gBrowser.tabs;
    for (let tab of tabs) {
      if (!tab.hasAttribute(this.workspacesTabAttributionId)) {
        this.setWorkspaceIdToAttribute(tab, workspaceId);
        return tab;
      }
    }

    let tab = gBrowser.addTab(url, {
      skipAnimation: true,
      inBackground: false,
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    this.setWorkspaceIdToAttribute(tab, workspaceId);
    return tab;
  },

  getWorkspaceFirstTab(workspaceId) {
    for (let tab of gBrowser.tabs) {
      if (tab.getAttribute(this.workspacesTabAttributionId) == workspaceId) {
        return tab;
      }
    }
    return null;
  },

  checkWorkspaceHasTab(workspaceId) {
    let firstTab = this.getWorkspaceFirstTab(workspaceId);
    if (firstTab) {
      return true;
    }
    return false;
  },

  getWorkspaceselectedTab(workspaceId) {
    for (let tab of gBrowser.tabs) {
      if (
        tab.getAttribute(WorkspacesService.workspaceLastShowId) == workspaceId
      ) {
        return tab;
      }
    }
    return null;
  },

  removeWorkspaceTabs(workspaceId) {
    for (let tab of gBrowser.tabs) {
      if (tab.getAttribute(this.workspacesTabAttributionId) == workspaceId) {
        gBrowser.removeTab(tab);
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
      gBrowser.selectedTab = tab;
    } else {
      gBrowser.selectedTab = workspaceTabs[0];
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
      "chrome://browser/content/hiddenWindowMac.xhtml"
    ) {
      parentWindow = null;
    }
    if (parentWindow?.gDialogBox) {
      parentWindow.gDialogBox.open(
        "chrome://browser/content/preferences/dialogs/manageWorkspace.xhtml",
        object
      );
    } else {
      Services.ww.openWindow(
        parentWindow,
        "chrome://browser/content/preferences/dialogs/manageWorkspace.xhtml",
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

    this.updateToolbarButtonAndPopupContentIconAndLabel(workspaceId);
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

    // Get Current Window Id
    let windowId = gWorkspaces.getCurrentWindowId();
    // Remove all tab infomation from json
    await WorkspacesIdUtils.removeWindowTabsDataById(windowId);

    // Get Current Workspace & Workspace Id
    let currentWorkspaceId = await gWorkspaces.getCurrentWorkspaceId();
    let workspacesCount = await gWorkspaces.getCurrentWorkspacesCount();

    // Last Show Workspace Attribute
    let selectedTab = gBrowser.selectedTab;
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
    let tabs = gBrowser.tabs;
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
          gBrowser.showTab(tabs[i]);
        } else {
          gBrowser.hideTab(tabs[i]);
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
      console.log(e);
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

  /* init */
  async init() {
    if (this._initialized) {
      return;
    }

    // Add toolbar popup for context menu
    gFloorpContextMenu.addToolbarContentMenuPopupSet(
    `<popupset>
    <menupopup id="workspaces-toolbar-item-context-menu" onpopupshowing="gWorkspaces.contextMenu.createWorkspacesContextMenuItems(event);" />
    </popupset>
          `
    );

    if (Services.prefs.getBoolPref(workspacesPreferences.WORKSPACES_ENABLED_PREF)) {
      let isWebpanelWindow = window.location.toString().split("?")[1];
      let isSsWindow = window.floorpSsbWindow
      if (isWebpanelWindow || isSsWindow) {
        return;
      }
    }

    if (!this.workspaceEnabled) {
      return;
    }

    // toolbar button
    // eslint-disable-next-line no-undef
    workspacesToolbarButton();

    // Initialized complete
    this._initialized = true;

    let currentWorkspace = await gWorkspaces.getCurrentWorkspace();

    // Check Workspaces Need migrate from Legacy Workspaces
    await WorkspacesMigratorUtils.importDataFromLegacyWorkspaces(
      gBrowser.tabs,
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

    async function onLocationChange() {
      await gWorkspaces.checkAllTabsForVisibility();
    }

    document.addEventListener("floorpOnLocationChangeEvent", function () {
      onLocationChange();
    });

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
      // A notification intended to be useful for modular peformance tracking
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

      let contextWorkspaceId = event.explicitOriginalTarget.id.replace(
        "workspace-",
        ""
      );
      let defaultWorkspaceId =
        await WorkspacesWindowIdUtils.getDefaultWorkspaceId(
          gWorkspaces.getCurrentWindowId()
        );
      let isDefaultWorkspace = contextWorkspaceId == defaultWorkspaceId;

      //create context menu
      let menuItem = window.MozXULElement.parseXULToFragment(`
          <menuitem data-l10n-id="rename-this-workspace" accesskey="R" oncommand="gWorkspaces.renameWorkspaceWithCreatePrompt('${contextWorkspaceId}')"></menuitem>
          <menuitem data-l10n-id="delete-this-workspace" accesskey="D" ${isDefaultWorkspace ? 'disabled="true"' : ""
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
          TabContextMenu.contextTab
        );

        if (tabWorkspaceId == workspaceId) {
          continue;
        }

        let workspaceData = await gWorkspaces.getWorkspaceById(workspaceId);
        let name = workspaceData.name;
        let icon = workspaceData.icon;
        let menuItem = window.MozXULElement.parseXULToFragment(`
          <menuitem id="context_MoveTabToOtherWorkspace"
                    class="menuitem-iconic"
                    style="list-style-image: url(${getWorkspaceIconUrl(icon)})"
                    oncommand="gWorkspaces.moveTabsToWorkspaceFromTabContextMenu('${workspaceId}')"
        />`);

        // Against XSS
        menuItem.firstChild.setAttribute("label", name);

        let parentElem = document.getElementById("workspacesTabContextMenu");
        parentElem.appendChild(menuItem);
      }
    },
  },
};

document.addEventListener("DOMContentLoaded", () => {
  window.SessionStore.promiseInitialized.then(() => {
    window.setTimeout(() => {
      gWorkspaces.init();
    }, 1000);
  });
}, { once: true });
