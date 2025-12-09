/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Midori Workspaces Integration

var gWorkspaces = {
  _initialized: false,
  _currentWorkspaceId: null,

  async init() {
    if (this._initialized) {
      return;
    }

    console.log("[Midori Workspaces] Initializing...");

    try {
      // Import workspace services first
      console.log("[Midori Workspaces] Loading modules...");
      const { WorkspacesService } = ChromeUtils.importESModule(
        "resource://browser-content/modules/workspace/WorkspacesService.mjs"
      );
      const { WorkspacesWindowIdUtils } = ChromeUtils.importESModule(
        "resource://browser-content/modules/workspace/WorkspacesWindowIdUtils.mjs"
      );

      this.WorkspacesService = WorkspacesService;
      this.WorkspacesWindowIdUtils = WorkspacesWindowIdUtils;
      console.log("[Midori Workspaces] Modules loaded successfully");

      // Check if workspaces are enabled
      const workspacesEnabled = Services.prefs.getBoolPref(
        "midori.workspaces.enabled",
        true  // Default to true
      );
      
      if (!workspacesEnabled) {
        console.log("[Midori Workspaces] Workspaces are disabled in preferences");
        this._initialized = true; // Mark as initialized even if disabled
        return;
      }

      // Initialize UI
      console.log("[Midori Workspaces] Initializing UI...");
      await this._initializeUI();

      // Load current workspace
      console.log("[Midori Workspaces] Loading current workspace...");
      await this._loadCurrentWorkspace();

      this._initialized = true;
      console.log("[Midori Workspaces] Successfully initialized");
    } catch (error) {
      console.error("[Midori Workspaces] Initialization error:", error);
      console.error("[Midori Workspaces] Stack trace:", error.stack);
    }
  },

  async _initializeUI() {
    const popup = document.getElementById("workspacesToolbarButtonPopup");
    if (popup) {
      console.log("[Midori Workspaces] Popup found, adding event listener");
      popup.addEventListener("popupshowing", () => {
        this._updateWorkspacesList();
        this._updateButtonLabel();
      });
    } else {
      console.log("[Midori Workspaces] Popup NOT found");
    }

    // Handle "New Workspace" button click
    const createButton = document.getElementById("workspacesCreateNewWorkspace");
    if (createButton) {
      console.log("[Midori Workspaces] Create button found, adding event listener");
      createButton.addEventListener("command", () => {
        this._openWorkspaceCreationPanel();
      });
    } else {
      console.log("[Midori Workspaces] Create button NOT found");
    }
    
    // Handle "Learn more" link
    const learnMoreLink = document.getElementById("workspacesLearnMore");
    if (learnMoreLink) {
      learnMoreLink.addEventListener("click", () => {
        gBrowser.addTab("https://support.mozilla.org/kb/containers", {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        });
      });
    }
    
    // Setup workspace creation panel
    this._setupCreationPanel();
  },
  
  _setupCreationPanel() {
    const panel = document.getElementById("workspaceCreationPanel");
    if (!panel) return;
    
    // Selected icon tracking
    let selectedIcon = "📊"; // Default icon
    
    // Icon selection handlers
    const iconButtons = document.querySelectorAll(".workspace-icon-btn");
    iconButtons.forEach(btn => {
      // Hover effects
      btn.addEventListener("mouseenter", () => {
        if (!btn.classList.contains("selected")) {
          btn.style.backgroundColor = "#e3f2fd";
          btn.style.transform = "scale(1.05)";
        }
      });
      btn.addEventListener("mouseleave", () => {
        if (!btn.classList.contains("selected")) {
          btn.style.backgroundColor = "#f9f9fb";
          btn.style.transform = "scale(1)";
        }
      });
      
      // Click handler
      btn.addEventListener("click", (e) => {
        // Remove selection from all buttons
        iconButtons.forEach(b => {
          b.style.border = "2px solid #e0e0e2";
          b.style.backgroundColor = "#f9f9fb";
          b.style.transform = "scale(1)";
          b.classList.remove("selected");
        });
        // Highlight selected button
        btn.style.border = "3px solid #0060df";
        btn.style.backgroundColor = "#e3f2fd";
        btn.style.transform = "scale(1.1)";
        btn.classList.add("selected");
        selectedIcon = btn.textContent;
      });
    });
    
    // Create button handler
    const createBtn = document.getElementById("workspaceCreateBtn");
    if (createBtn) {
      // Hover effects
      createBtn.addEventListener("mouseenter", () => {
        createBtn.style.backgroundColor = "#0050c8";
        createBtn.style.transform = "translateY(-1px)";
        createBtn.style.boxShadow = "0 4px 10px rgba(0,96,223,0.4)";
      });
      createBtn.addEventListener("mouseleave", () => {
        createBtn.style.backgroundColor = "#0060df";
        createBtn.style.transform = "translateY(0)";
        createBtn.style.boxShadow = "0 2px 6px rgba(0,96,223,0.3)";
      });
      
      createBtn.addEventListener("click", async () => {
        const nameInput = document.getElementById("workspaceNameInput");
        const name = nameInput?.value || "New Workspace";
        
        await this._createNewWorkspace(name, selectedIcon);
        panel.hidePopup();
        
        // Reset form
        if (nameInput) nameInput.value = "New Workspace";
        iconButtons.forEach(b => {
          b.style.border = "2px solid #e0e0e2";
          b.style.backgroundColor = "#f9f9fb";
          b.style.transform = "scale(1)";
          b.classList.remove("selected");
        });
        selectedIcon = "📊";
      });
    }
    
    // Cancel button handler
    const cancelBtn = document.getElementById("workspaceCancelBtn");
    if (cancelBtn) {
      // Hover effects
      cancelBtn.addEventListener("mouseenter", () => {
        cancelBtn.style.backgroundColor = "#e0e0e4";
      });
      cancelBtn.addEventListener("mouseleave", () => {
        cancelBtn.style.backgroundColor = "#f0f0f4";
      });
      
      cancelBtn.addEventListener("click", () => {
        panel.hidePopup();
      });
    }
  },
  
  _openWorkspaceCreationPanel() {
    const panel = document.getElementById("workspaceCreationPanel");
    const button = document.getElementById("workspaces-toolbar-button");
    
    if (panel && button) {
      // Close the workspace menu first
      const popup = document.getElementById("workspacesToolbarButtonPopup");
      if (popup) popup.hidePopup();
      
      // Open creation panel
      panel.openPopup(button, "after_start", 0, 0, false, false);
    }
  },
  
  _updateButtonLabel() {
    const labelElement = document.getElementById("workspaces-button-label");
    if (!labelElement) return;
    
    // Get current workspace name
    if (this._currentWorkspaceId) {
      this.WorkspacesWindowIdUtils.getWindowWorkspacesData(this._currentWorkspaceId.split('-')[1])
        .then(workspacesData => {
          const workspace = workspacesData[this._currentWorkspaceId];
          if (workspace) {
            const label = workspace.icon ? `${workspace.icon} ${workspace.name}` : workspace.name;
            labelElement.setAttribute("value", label);
          }
        });
    } else {
      labelElement.setAttribute("value", "Default");
    }
  },

  async _loadCurrentWorkspace() {
    const windowId = this.WorkspacesWindowIdUtils.getWindowId(window);
    let workspacesData = await this.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    
    // Create default workspace if none exists
    const workspaceIds = Object.keys(workspacesData).filter(key => key !== 'preferences');
    if (workspaceIds.length === 0) {
      console.log("[Midori Workspaces] Creating default workspace...");
      const defaultWorkspaceId = await this.WorkspacesService.createWorkspace(
        "Default Workspace",
        windowId,
        true, // defaultWorkspace
        "", // icon
        true  // setSelected
      );
      this._currentWorkspaceId = defaultWorkspaceId;
      console.log("[Midori Workspaces] Default workspace created:", defaultWorkspaceId);
      
      // Reload workspaces data
      workspacesData = await this.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    } else if (workspacesData && workspacesData.preferences) {
      this._currentWorkspaceId = workspacesData.preferences.selectedWorkspaceId;
      console.log("[Midori Workspaces] Current workspace:", this._currentWorkspaceId);
    } else if (workspaceIds.length > 0) {
      // Set first workspace as current if no preference is set
      this._currentWorkspaceId = workspaceIds[0];
      console.log("[Midori Workspaces] Using first workspace:", this._currentWorkspaceId);
    }
  },

  async _updateWorkspacesList() {
    const windowId = this.WorkspacesWindowIdUtils.getWindowId(window);
    const workspacesData = await this.WorkspacesWindowIdUtils.getWindowWorkspacesDataWithoutPreferences(windowId);
    
    console.log("[Midori Workspaces] Workspaces data:", workspacesData);
    
    // Update UI with workspaces list
    const listContainer = document.getElementById("workspacesListContainer");
    if (!listContainer) {
      return;
    }
    
    // Clear existing items
    while (listContainer.firstChild) {
      listContainer.removeChild(listContainer.firstChild);
    }
    
    // Add workspace items
    const workspaceIds = Object.keys(workspacesData);
    if (workspaceIds.length === 0) {
      const emptyLabel = document.createXULElement("label");
      emptyLabel.setAttribute("value", "No workspaces");
      emptyLabel.style.color = "gray";
      listContainer.appendChild(emptyLabel);
    } else {
      for (const workspaceId of workspaceIds) {
        const workspace = workspacesData[workspaceId];
        const workspaceItem = document.createXULElement("hbox");
        workspaceItem.setAttribute("align", "center");
        workspaceItem.style.padding = "10px 12px";
        workspaceItem.style.cursor = "pointer";
        workspaceItem.style.borderRadius = "6px";
        workspaceItem.style.marginBottom = "4px";
        workspaceItem.style.transition = "all 0.2s";
        
        if (workspaceId === this._currentWorkspaceId) {
          workspaceItem.style.backgroundColor = "#e3f2fd";
          workspaceItem.style.border = "2px solid #0060df";
        } else {
          workspaceItem.style.backgroundColor = "transparent";
          workspaceItem.style.border = "2px solid transparent";
        }
        
        // Hover effect
        workspaceItem.addEventListener("mouseenter", () => {
          if (workspaceId !== this._currentWorkspaceId) {
            workspaceItem.style.backgroundColor = "#f5f5f5";
          }
        });
        workspaceItem.addEventListener("mouseleave", () => {
          if (workspaceId !== this._currentWorkspaceId) {
            workspaceItem.style.backgroundColor = "transparent";
          }
        });
        
        // Icon
        const iconLabel = document.createXULElement("label");
        iconLabel.setAttribute("value", workspace.icon || "📁");
        iconLabel.style.fontSize = "18px";
        iconLabel.style.marginRight = "10px";
        
        // Name
        const nameLabel = document.createXULElement("label");
        nameLabel.setAttribute("value", workspace.name || "Unnamed Workspace");
        nameLabel.style.flex = "1";
        nameLabel.style.fontSize = "13px";
        nameLabel.style.fontWeight = workspaceId === this._currentWorkspaceId ? "600" : "400";
        nameLabel.style.color = workspaceId === this._currentWorkspaceId ? "#0060df" : "#1c1c1c";
        
        workspaceItem.appendChild(iconLabel);
        workspaceItem.appendChild(nameLabel);
        
        workspaceItem.addEventListener("click", () => {
          this.changeWorkspace(workspaceId);
        });
        
        listContainer.appendChild(workspaceItem);
      }
    }
  },

  async _createNewWorkspace(name, icon) {
    try {
      const windowId = this.WorkspacesWindowIdUtils.getWindowId(window);
      const workspaceName = name || `Workspace ${Date.now()}`;
      const workspaceIcon = icon || "📊"; // default icon
      
      const workspaceId = await this.WorkspacesService.createWorkspace(
        workspaceName,
        windowId,
        false,
        workspaceIcon,
        true // set as selected
      );
      
      console.log("[Midori Workspaces] Created workspace:", workspaceId);
      await this._updateWorkspacesList();
      await this.changeWorkspace(workspaceId);
    } catch (error) {
      console.error("[Midori Workspaces] Error creating workspace:", error);
    }
  },
  
  async createNoNameWorkspace() {
    await this._createNewWorkspace(`Workspace ${Date.now()}`, "💼");
  },

  async changeWorkspace(workspaceId) {
    try {
      console.log("[Midori Workspaces] Changing to workspace:", workspaceId);
      
      // Don't change if already in this workspace
      if (this._currentWorkspaceId === workspaceId) {
        console.log("[Midori Workspaces] Already in this workspace");
        return;
      }
      
      console.log("[Midori Workspaces] Step 1: Getting window ID");
      const windowId = this.WorkspacesWindowIdUtils.getWindowId(window);
      console.log("[Midori Workspaces] Window ID:", windowId);
      
      // Save current tabs to current workspace
      if (this._currentWorkspaceId) {
        console.log("[Midori Workspaces] Step 2: Saving current tabs");
        await this._saveCurrentTabs(this._currentWorkspaceId, windowId);
        console.log("[Midori Workspaces] Step 2: Current tabs saved");
      }
      
      // Load tabs from new workspace
      console.log("[Midori Workspaces] Step 3: Loading workspace tabs");
      await this._loadWorkspaceTabs(workspaceId, windowId);
      console.log("[Midori Workspaces] Step 3: Workspace tabs loaded");
      
      // Update selected workspace
      console.log("[Midori Workspaces] Step 4: Updating preferences");
      const workspacesData = await this.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
      workspacesData.preferences = {
        selectedWorkspaceId: workspaceId,
      };
      
      console.log("[Midori Workspaces] Step 5: Saving preferences");
      const { WorkspacesDataSaver } = ChromeUtils.importESModule(
        "resource://browser-content/modules/workspace/WorkspacesDataSaver.mjs"
      );
      await WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
      console.log("[Midori Workspaces] Step 5: Preferences saved");
      
      this._currentWorkspaceId = workspaceId;
      
      console.log("[Midori Workspaces] Step 6: Updating workspaces list");
      await this._updateWorkspacesList();
      console.log("[Midori Workspaces] Step 6: List updated");
      
      console.log("[Midori Workspaces] Workspace changed successfully");
    } catch (error) {
      console.error("[Midori Workspaces] Error changing workspace:", error);
      console.error("[Midori Workspaces] Stack:", error.stack);
    }
  },

  async _saveCurrentTabs(workspaceId, windowId) {
    console.log("[Midori Workspaces] _saveCurrentTabs: Getting tabs");
    // Get all tabs
    const tabs = Array.from(gBrowser.tabs);
    console.log("[Midori Workspaces] _saveCurrentTabs: Found", tabs.length, "tabs");
    
    const tabsData = tabs.map(tab => ({
      url: tab.linkedBrowser.currentURI.spec,
      title: tab.label,
    }));
    console.log("[Midori Workspaces] _saveCurrentTabs: Mapped tab data");
    
    // Save to workspace
    console.log("[Midori Workspaces] _saveCurrentTabs: Getting workspaces data");
    const workspacesData = await this.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    console.log("[Midori Workspaces] _saveCurrentTabs: Got workspaces data");
    
    if (workspacesData[workspaceId]) {
      workspacesData[workspaceId].tabs = tabsData;
      
      console.log("[Midori Workspaces] _saveCurrentTabs: Loading WorkspacesDataSaver");
      const { WorkspacesDataSaver } = ChromeUtils.importESModule(
        "resource://browser-content/modules/workspace/WorkspacesDataSaver.mjs"
      );
      console.log("[Midori Workspaces] _saveCurrentTabs: Saving data");
      await WorkspacesDataSaver.saveWorkspacesData(workspacesData, windowId);
      console.log("[Midori Workspaces] _saveCurrentTabs: Data saved");
    }
  },

  async _loadWorkspaceTabs(workspaceId, windowId) {
    console.log("[Midori Workspaces] _loadWorkspaceTabs: Getting workspaces data");
    const workspacesData = await this.WorkspacesWindowIdUtils.getWindowWorkspacesData(windowId);
    console.log("[Midori Workspaces] _loadWorkspaceTabs: Got workspaces data");
    
    const workspace = workspacesData[workspaceId];
    console.log("[Midori Workspaces] _loadWorkspaceTabs: Workspace tabs count:", workspace?.tabs?.length || 0);
    
    if (!workspace || !workspace.tabs || workspace.tabs.length === 0) {
      console.log("[Midori Workspaces] _loadWorkspaceTabs: No tabs in workspace, loading new tab");
      // No tabs in workspace, close all but one tab and open about:newtab
      const tabs = Array.from(gBrowser.tabs);
      console.log("[Midori Workspaces] _loadWorkspaceTabs: Current tabs count:", tabs.length);
      
      for (let i = tabs.length - 1; i > 0; i--) {
        console.log("[Midori Workspaces] _loadWorkspaceTabs: Removing tab", i);
        gBrowser.removeTab(tabs[i]);
      }
      
      console.log("[Midori Workspaces] _loadWorkspaceTabs: Loading about:newtab");
      // Replace the content of the remaining tab
      gBrowser.selectedTab.linkedBrowser.loadURI(
        Services.io.newURI("about:newtab"),
        { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() }
      );
      console.log("[Midori Workspaces] _loadWorkspaceTabs: Finished empty workspace load");
      return;
    }
    
    console.log("[Midori Workspaces] _loadWorkspaceTabs: Getting current tabs");
    // Get current tabs (we'll close all but the first one)
    const currentTabs = Array.from(gBrowser.tabs);
    console.log("[Midori Workspaces] _loadWorkspaceTabs: Current tabs count:", currentTabs.length);
    
    console.log("[Midori Workspaces] _loadWorkspaceTabs: Opening workspace tabs");
    // Open workspace tabs first
    for (const tabData of workspace.tabs) {
      console.log("[Midori Workspaces] _loadWorkspaceTabs: Opening tab:", tabData.url);
      gBrowser.addTab(tabData.url, {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      });
    }
    console.log("[Midori Workspaces] _loadWorkspaceTabs: All workspace tabs opened");
    
    console.log("[Midori Workspaces] _loadWorkspaceTabs: Closing old tabs");
    // Now close the old tabs (keep at least the new ones)
    for (const tab of currentTabs) {
      console.log("[Midori Workspaces] _loadWorkspaceTabs: Removing old tab");
      gBrowser.removeTab(tab);
    }
    console.log("[Midori Workspaces] _loadWorkspaceTabs: All old tabs closed");
  },

  async manageWorkspaceFromDialog() {
    // Open workspace management dialog
    console.log("[Midori Workspaces] Opening workspace management dialog");
    // TODO: Implement dialog
  },

  uninit() {
    console.log("[Midori Workspaces] Uninitializing...");
    this._initialized = false;
  },
};

// Initialize workspaces when browser is ready
window.addEventListener("load", () => {
  gWorkspaces.init();
});

window.addEventListener("unload", () => {
  gWorkspaces.uninit();
});
