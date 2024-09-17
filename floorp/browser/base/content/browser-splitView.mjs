/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @class SplitView
 * @description The SplitView class is responsible for handling the split view functionality.
 * @license MPL2.0 : This code inspired by the split view feature in the Zen Browser Thanks to the Zen Browser team!
 */
export class SplitView {
  constructor() {
    this._data = [];
    this._syncData = {
      sync: false,
      options: {
        flexType: "flex",
        reverse: false,
        method: "row",
        syncMode: true,
      },
      syncTab: null,
    };
    this.currentView = -1;
    this._tabBrowserPanel = null;
    this.__modifierElement = null;
    this.__hasSetMenuListener = false;

    Services.prefs.setBoolPref("floorp.browser.splitView.working", false);
    window.addEventListener("TabClose", event => this.handleTabClose(event));
    this.initializeContextMenu();
    this.insertPageActionButtonAndPanel();
  }

  /**
   * @param {Event} event - The event that triggered the tab close.
   * @description Handles the tab close event.7
   */
  handleTabClose(event) {
    const tab = event.target;

    if (this._syncData.syncTab === tab) {
      this._syncData.syncTab = null;
      this._syncData.sync = false;
      this.hideSplitViewManager();
    }

    const groupIndex = this._data.findIndex(group => group.tabs.includes(tab));
    if (groupIndex < 0) {
      return;
    }
    this.removeTabFromGroup(tab, groupIndex, event.forUnsplit);
  }

  /**
   * Removes a tab from a group.
   *
   * @param {Tab} tab - The tab to remove.
   * @param {number} groupIndex - The index of the group.
   * @param {boolean} forUnsplit - Indicates if the tab is being removed for unsplitting.
   */
  removeTabFromGroup(tab, groupIndex, forUnsplit) {
    const group = this._data[groupIndex];
    const tabIndex = group.tabs.indexOf(tab);
    group.tabs.splice(tabIndex, 1);

    this.resetTabState(tab, forUnsplit);

    if (group.tabs.length < 2) {
      this.removeGroup(groupIndex);
    } else {
      this.updateSplitView(group.tabs[group.tabs.length - 1]);
    }
  }

  /**
   * Resets the state of a tab.
   *
   * @param {Tab} tab - The tab to reset.
   * @param {boolean} forUnsplit - Indicates if the tab is being reset for unsplitting.
   */
  resetTabState(tab, forUnsplit) {
    tab.splitView = false;
    tab.linkedBrowser.spliting = false;
    const container = tab.linkedBrowser.closest(".browserSidebarContainer");
    container.removeAttribute("split");
    container.removeAttribute("style");

    if (!forUnsplit) {
      tab.linkedBrowser.docShellIsActive = false;
      container.style.display = "none";
    } else {
      container.style.flex = "";
      container.style.order = "";
    }
  }

  /**
   * Removes a group.
   *
   * @param {number} groupIndex - The index of the group to remove.
   */
  removeGroup(groupIndex) {
    if (this.currentView === groupIndex) {
      this.resetSplitView();
    }
    this._data.splice(groupIndex, 1);
  }

  /**
   * Resets the split view.
   */
  resetSplitView() {
    for (const tab of this._data[this.currentView].tabs) {
      this.resetTabState(tab, true);
    }

    this.currentView = -1;
    this.tabBrowserPanel.removeAttribute("split-view");
    this.tabBrowserPanel.style.display = "";
    this.tabBrowserPanel.style.flexDirection = "";
    Services.prefs.setBoolPref("floorp.browser.splitView.working", false);
  }

  /**
   * Inserts the split view tab context menu item.
   */
  insertSplitViewTabContextMenu() {
    const element = window.MozXULElement.parseXULToFragment(`
      <menuseparator/>
        <menuitem id="context_splittabs" data-l10n-id="floorp-split-view-open-menu" oncommand="gSplitView.contextSplitTabs();"/>
        <menuitem id="context_split_fixedtab" data-l10n-id="floorp-split-view-fixed-menu" oncommand="gSplitView.splitToFixedTab();"/>
      <menuseparator/>
    `);
    document.getElementById("context_closeDuplicateTabs").after(element);
  }

  insertPageActionButtonAndPanel() {
    const element = window.MozXULElement.parseXULToFragment(`
      <hbox data-l10n-id="splitView-action" class="urlbar-page-action" role="button"
            popup="splitView-panel" id="splitView-action" hidden="true">
        <image id="splitView-image" class="urlbar-icon"/>
        <panel id="splitView-panel" type="arrow" position="bottomleft topleft" onpopupshowing="gSplitView.updateSelectedItemState()">
          <vbox id="splitView-box">
            <vbox class="panel-header">
              <html:h1>
                <html:span data-l10n-id="split-view-title"/>
              </html:h1>
            </vbox>
            <toolbarseparator/>
            <vbox id="splitView-vbox">
             <html:h3 data-l10n-id="split-view-position" class="splitView-title"/>
             <hbox id="splitView-position-selector">
              <vbox id="splitView-position-selector-left" class="splitView-select-box" onclick="gSplitView.handleSplitViewPanelRevseOptionClick('false')">
                <label data-l10n-id="split-view-position-left" class="splitView-select-label"/>
                <hbox id="splitView-position-selector-content-left" class="splitView-select-content-box">
                  <box/>
                  <box/>
                </hbox>
              </vbox>
              <vbox id="splitView-position-selector-right" class="splitView-select-box" onclick="gSplitView.handleSplitViewPanelRevseOptionClick('true')">
                <label data-l10n-id="split-view-position-right" class="splitView-select-label"/>
                <hbox id="splitView-position-selector-content-right" class="splitView-select-content-box">
                  <box/>
                  <box/>
                </hbox>
              </vbox>
             </hbox>
             <toolbarseparator/>
             <html:h3 data-l10n-id="split-view-flex-type" class="splitView-title"/>
             <hbox id="splitView-flex-selector">
              <vbox id="splitView-flex-selector-row" class="splitView-select-box" onclick="gSplitView.handleSplitViewPanelTypeOptionClick('row')">
                <label data-l10n-id="split-view-flex-row" class="splitView-select-label"/>
                <hbox id="splitView-flex-selector-content-row" class="splitView-select-content-box">
                  <box/>
                  <box/>
                </hbox>
              </vbox>
              <vbox id="splitView-flex-selector-column" class="splitView-select-box" onclick="gSplitView.handleSplitViewPanelTypeOptionClick('column')">
                <label data-l10n-id="split-view-flex-column" class="splitView-select-label"/>
                <vbox id="splitView-flex-selector-content-column" class="splitView-select-content-box">
                  <box/>
                  <box/>
                </vbox>
              </vbox>
             </hbox>
             <button id="splitView-remove-button" data-l10n-id="split-view-remove-button"
                     class="footer-button" oncommand="gSplitView.unsplitCurrentView();"/>
            </vbox>
          </vbox>
        </panel>
     </hbox>
     `);

    document.getElementById("identity-box").appendChild(element);
  }

  /**
   * @description Handles the popup showing event.
   * @returns {void}
   */
  updateSelectedItemState() {
    // Remove Selected class from all the elements
    const elements = document.querySelectorAll(".splitView-select-box");
    for (const element of elements) {
      element.classList.remove("selected");
    }

    const currentData = this._data[this.currentView];
    const reverse = currentData.reverse;
    const method = currentData.method;

    if (reverse) {
      document
        .getElementById("splitView-position-selector-right")
        .classList.add("selected");
    } else {
      document
        .getElementById("splitView-position-selector-left")
        .classList.add("selected");
    }

    if (method === "column") {
      document
        .getElementById("splitView-flex-selector-column")
        .classList.add("selected");
    } else {
      document
        .getElementById("splitView-flex-selector-row")
        .classList.add("selected");
    }
  }

  /**
   * @description Handles the panel splitter command.
   * @param {reverse} reverse - Selects the reverse option.
   * @returns {void}
   */
  handleSplitViewPanelRevseOptionClick(reverse) {
    this.updateSplitView(window.gBrowser.selectedTab, reverse === "true", null);
    this.updateSelectedItemState();
  }

  /**
   * @description Handles the panel splitter command.
   * @param {string} type - Selects the flex type option.
   * @returns {void}
   */
  handleSplitViewPanelTypeOptionClick(type) {
    this.updateSplitView(window.gBrowser.selectedTab, null, type);
    this.updateSelectedItemState();
  }

  /**
   * @description Enables the panel.
   * @returns {void}
   */
  showSplitViewManager() {
    document.getElementById("splitView-action").removeAttribute("hidden");
  }

  /**
   * @description hide the panel.
   * @returns {void}
   */
  hideSplitViewManager() {
    document.getElementById("splitView-action").setAttribute("hidden", true);
  }

  /**
   * Initializes the context menu.
   */
  initializeContextMenu() {
    this.insertSplitViewTabContextMenu();
    this.addMainPopupShowingListener();
  }

  /**
   * @description Adds the main popup showing listener.
   * @returns {void}
   */
  addMainPopupShowingListener() {
    const mainPopup = document.getElementById("mainPopupSet");
    mainPopup?.addEventListener("popupshowing", () => {
      const elem = document.getElementById("context_splittabs");
      const excludeSyncedDataList = this._data.filter(
        group => group.syncMode !== true
      );

      elem.disabled =
        window.gBrowser.selectedTab === window.TabContextMenu.contextTab ||
        excludeSyncedDataList.some(group =>
          group.tabs.includes(window.TabContextMenu.contextTab)
        ) ||
        excludeSyncedDataList.some(group =>
          group.tabs.includes(window.gBrowser.selectedTab)
        );

      if (elem.getAttribute("disabled") === "true") {
        document.l10n.setAttributes(
          elem,
          "floorp-split-view-open-menu-disabled"
        );
      } else {
        document.l10n.setAttributes(elem, "floorp-split-view-open-menu");
      }
    });
  }

  /**
   * Gets the tab browser panel.
   *
   * @returns {Element} The tab browser panel.
   */
  get tabBrowserPanel() {
    if (!this._tabBrowserPanel) {
      this._tabBrowserPanel = document.getElementById("tabbrowser-tabpanels");
    }
    return this._tabBrowserPanel;
  }

  /**
   * Splits the selected tabs.
   */
  contextSplitTabs() {
    if (window.TabContextMenu.contextTab === window.gBrowser.selectedTab) {
      return;
    }
    const tab = [window.TabContextMenu.contextTab, window.gBrowser.selectedTab];
    this.splitTabs(tab);
  }

  splitToFixedTab() {
    const tab = window.TabContextMenu.contextTab;
    this._syncData.syncTab = tab;
    this._syncData.sync = true;
    this.updateSplitView(window.gBrowser.selectedTab);
  }

  /**
   * Splits the selected tabs.
   */
  splitFromCsk() {
    const tab = [this.getAnotherTab(), window.gBrowser.selectedTab];
    this.splitTabs(tab);
  }

  getAnotherTab() {
    let result =
      window.gBrowser.tabs[
        window.gBrowser.tabs.indexOf(window.gBrowser.selectedTab) - 1
      ];
    if (!result) {
      result =
        window.gBrowser.tabs[
          window.gBrowser.tabs.indexOf(window.gBrowser.selectedTab) + 1
        ];
    }

    return result ?? null;
  }

  /**
   * Handles the location change event.
   *
   * @param {Browser} browser - The browser instance.
   */
  onLocationChange(browser) {
    const tab = window.gBrowser.getTabForBrowser(browser);
    if (tab) {
      this.updateSplitView(tab);
      // Need to set the docShellIsActive to true for switching the unsplit tab.
      tab.linkedBrowser.docShellIsActive = true;
    }
  }

  /**
   * Splits the given tabs.
   *
   * @param {Tab[]} tabs - The tabs to split.
   */
  splitTabs(tabs) {
    if (tabs.length < 2 || tabs.includes(null)) {
      return;
    }
    const existingSplitTab = tabs.find(tab => tab.splitView);
    if (existingSplitTab) {
      const groupIndex = this._data.findIndex(
        group =>
          group.tabs.includes(existingSplitTab) && group.syncMode !== true
      );
      if (groupIndex >= 0) {
        this.updateSplitView(existingSplitTab);
        return;
      }
    }

    this._data.push({
      tabs,
      flexType: "flex",
    });
    window.gBrowser.selectedTab = tabs[0];
    this.updateSplitView(tabs[0]);
  }

  /**
   * Updates the split view.
   *
   * @param {Tab} tab - The tab to update the split view for.
   * @param {boolean} reverse - Indicates if the split view should be reversed.
   * @param {string} method - The type of split view.
   */
  updateSplitView(tab, reverse = null, method = null) {
    // If current view is sync's view, before update view, we should remove the sync view.
    const syncIndex = this._data.findIndex(group => group.syncMode === true);
    if (syncIndex >= 0) {
      this._syncData.options = {
        ...this._data[syncIndex],
        reverse: reverse === null ? this._data[syncIndex].reverse : reverse,
        method: method === null ? this._data[syncIndex].method : method,
      };
      this.removeGroup(syncIndex);
    }

    const splitData = this._data.find(group => group.tabs.includes(tab));
    const index = this._data.indexOf(splitData);
    let newSplitData = {
      ...splitData,
      // Default configuration
      method: method === null ? splitData?.method ?? "row" : method,
      reverse: reverse === null ? splitData?.reverse ?? false : reverse,
    };

    if (
      !splitData ||
      (this.currentView >= 0 &&
        !this._data[this.currentView].tabs.includes(tab))
    ) {
      if (this.currentView >= 0) {
        this.deactivateSplitView();
      }
      if (!splitData && !this._syncData.sync) {
        return;
      }

      // Sync split view
      newSplitData = {
        ...this._syncData.options,
        tabs: [this._syncData.syncTab, tab],
      };
      // Push temporarily sync view data.
      this._data.push(newSplitData);
    }
    if (index >= 0) {
      this._data[index] = newSplitData;
    }
    this.activateSplitView(newSplitData, tab);
  }

  /**
   * Deactivates the split view.
   */
  deactivateSplitView() {
    for (const tab of window.gBrowser.tabs) {
      const container = tab.linkedBrowser.closest(".browserSidebarContainer");
      this.resetContainerStyle(container);
      container.removeEventListener("click", this.handleTabClick);
    }
    this.tabBrowserPanel.removeAttribute("split-view");
    this.tabBrowserPanel.style.flexTemplateAreas = "";
    Services.prefs.setBoolPref("floorp.browser.splitView.working", false);
    this.setTabsDocShellState(this._data[this.currentView].tabs, false);
    this.currentView = -1;
    this.hideSplitViewManager();
  }

  /**
   * Activates the split view.
   *
   * @param {object} splitData - The split data.
   * @param {Tab} activeTab - The active tab.
   */
  activateSplitView(splitData, activeTab) {
    this.tabBrowserPanel.setAttribute("split-view", "true");
    Services.prefs.setBoolPref("floorp.browser.splitView.working", true);
    this.currentView = this._data.indexOf(splitData);

    const flexType = splitData.flexType || "flex";
    this.applyFlexBoxLayout(
      splitData.tabs,
      flexType,
      activeTab,
      splitData.reverse,
      splitData.method
    );

    this.setTabsDocShellState(splitData.tabs, true);
    this.showSplitViewManager();
  }

  /**
   * Applies the flex layout to the tabs.
   *
   * @param {Tab[]} tabs - The tabs to apply the flex layout to.
   * @param {string} flexType - The type of flex layout.
   * @param {Tab} activeTab - The active tab.
   * @param {boolean} reverse - Indicates if the split view should be reversed.
   * @param {string} method - The type of split view.
   */
  applyFlexBoxLayout(
    tabs,
    flexType,
    activeTab,
    reverse = true,
    method = "column"
  ) {
    this.tabBrowserPanel.style.flexDirection = this.getFlexDirection(
      reverse,
      method
    );
    tabs.forEach((tab, index) => {
      tab.splitView = true;
      const container = tab.linkedBrowser.closest(".browserSidebarContainer");
      this.styleContainer(
        container,
        tab === activeTab,
        index,
        flexType,
        method,
        reverse
      );
    });
  }

  getFlexDirection(reverse, method) {
    if (method === "column") {
      return reverse ? "column-reverse" : "column";
    }
    return reverse ? "row-reverse" : "row";
  }

  /**
   * Styles the container for a tab.
   *
   * @param {Element} container - The container element.
   * @param {boolean} isActive - Indicates if the tab is active.
   * @param {number} index - The index of the tab.
   * @param {string} flexType - The type of flex layout.
   */
  styleContainer(container, isActive, index, flexType) {
    container.removeAttribute("split-active");
    if (isActive) {
      container.setAttribute("split-active", "true");
    }
    container.setAttribute("split-anim", "true");
    container.addEventListener("click", this.handleTabClick);

    if (flexType === "flex") {
      container.style.flex = "1";
      container.style.order = index;
    }
  }

  /**
   * Handles the tab click event.
   *
   * @param {Event} event - The click event.
   */
  handleTabClick = event => {
    const container = event.currentTarget;
    const tab = window.gBrowser.tabs.find(
      t => t.linkedBrowser.closest(".browserSidebarContainer") === container
    );
    if (tab && tab !== this._syncData.syncTab) {
      window.gBrowser.selectedTab = tab;
    }
  };

  /**
   * Sets the docshell state for the tabs.
   *
   * @param {Tab[]} tabs - The tabs.
   * @param {boolean} active - Indicates if the tabs are active.
   */
  setTabsDocShellState(tabs, active) {
    for (const tab of tabs) {
      tab.linkedBrowser.spliting = active;
      tab.linkedBrowser.docShellIsActive = active;
      const browser = tab.linkedBrowser.closest(".browserSidebarContainer");
      if (active) {
        browser.setAttribute("split", "true");
        const currentStyle = browser.getAttribute("style");
        browser.setAttribute(
          "style",
          `${currentStyle}
          -moz-subtree-hidden-only-visually: 0;
          visibility: visible !important;`
        );
      } else {
        browser.removeAttribute("split");
        browser.removeAttribute("style");
      }
    }
  }

  /**
   * Resets the container style.
   *
   * @param {Element} container - The container element.
   */
  resetContainerStyle(container) {
    container.removeAttribute("split-active");
    container.classList.remove("deck-selected");
    container.style.flex = "";
    container.style.order = "";
  }

  /**
   * Gets the modifier element.
   *
   * @returns {Element} The modifier element.
   */
  get modifierElement() {
    if (!this.__modifierElement) {
      const wrapper = document.getElementById("template-split-view-modifier");
      const panel = wrapper.content.firstElementChild;
      wrapper.replaceWith(wrapper.content);
      this.__modifierElement = panel;
    }
    return this.__modifierElement;
  }

  /**
   * @description unsplit the current view.]
   */
  unsplitCurrentView() {
    const currentTab = window.gBrowser.selectedTab;
    let tabs = this._data[this.currentView].tabs;
    if (this._data[this.currentView].syncMode) {
      this._syncData.syncTab = null;
      this._syncData.sync = false;
      tabs = [currentTab];
    }
    for (const tab of tabs) {
      this.handleTabClose({ target: tab, forUnsplit: true });
    }
    window.gBrowser.selectedTab = currentTab;
    this.hideSplitViewManager();
  }
}
