/* eslint-disable no-undef */
/* eslint-disable no-unused-vars */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* SplitView is a feature that provides show a tab on the left or right side of the window. */

let gSplitView = {
  Functions: {
    init() {
      gSplitView.Functions.tabContextMenu.addContextMenuToTabContext();
      Services.prefs.setBoolPref("floorp.browser.splitView.working", false);
    },
    setSplitView(tab, side) {
      try {
        this.removeSplitView();
      } catch (e) {}
      Services.prefs.setBoolPref("floorp.browser.splitView.working", true);

      let panel = gSplitView.Functions.getlinkedPanel(tab.linkedPanel);
      let browser = tab.linkedBrowser;
      let browserRenderLayers = browser.renderLayers;
      let browserDocShellIsActiveState = browser.docShellIsActive;

      // Check if the a tab is already in split view
      let tabs = gBrowser.tabs;
      for (let i = 0; i < tabs.length; i++) {
        if (tabs[i].hasAttribute("splitView")) {
          gSplitView.Functions.removeSplitView(tabs[i]);
        }
      }

      let CSSElem = document.getElementById("splitViewCSS");
      if (!CSSElem) {
        let elem = document.createElement("style");
        elem.setAttribute("id", "splitViewCSS");
        elem.textContent = `
        #tabbrowser-tabpanels > * {
          flex: 0;
        }
        
        .deck-selected {
          flex: 1 !important;
          order: 1 !important;
        }
        
        .deck-selected[splitview="right"] {
          order: 3 !important;
        }
        
        .deck-selected[splitview="left"] {
          order: 0 !important;
        }
        
        #tabbrowser-tabpanels {
          display: flex !important;
        }
        `;
        document.head.appendChild(elem);
      }

      tab.setAttribute("splitView", true);
      panel.setAttribute("splitview", side);
      panel.setAttribute("splitviewtab", true);
      panel.classList.add("deck-selected");
      browserRenderLayers = true;

      if (!browserDocShellIsActiveState) {
        browser.docShellIsActive = true;
      }

      gSplitView.Functions.setRenderLayersEvent();
    },

    removeSplitView() {
      Services.prefs.setBoolPref("floorp.browser.splitView.working", false);

      let tab = document.querySelector(`.tabbrowser-tab[splitView="true"]`);

      if (!tab) {
        return;
      }

      // remove style
      let panel = gSplitView.Functions.getlinkedPanel(tab.linkedPanel);
      let CSSElem = document.getElementById("splitViewCSS");
      CSSElem?.remove();

      tab.removeAttribute("splitView");
      panel.removeAttribute("splitview");
      panel.removeAttribute("splitviewtab");
      panel.classList.remove("deck-selected");
      browserRenderLayers = false;

      if (browser.docShellIsActive) {
        browser.docShellIsActive = false;
      }

      gSplitView.Functions.removeRenderLayersEvent();

      // set renderLayers to true & Set class to deck-selected
      gBrowser.selectedTab = tab;
    },

    getlinkedPanel(id) {
      let panel = document.getElementById(id);
      return panel;
    },

    setRenderLayersEvent() {
      document.addEventListener("floorpOnLocationChangeEvent", function () {
        gSplitView.Functions.handleTabEvent();
      });
    },

    removeRenderLayersEvent() {
      document.removeEventListener("floorpOnLocationChangeEvent", function () {
        gSplitView.Functions.handleTabEvent();
      });
    },

    handleTabEvent() {
      if (!Services.prefs.getBoolPref("floorp.browser.splitView.working")) {
        return;
      }

      let currentSplitViewTab = document.querySelector(
        `.tabbrowser-tab[splitView="true"]`,
      );
      let currentSplitViewPanel = gSplitView.Functions.getlinkedPanel(
        currentSplitViewTab?.linkedPanel,
      );
      let currentSplitViewBrowser = currentSplitViewTab?.linkedBrowser;

      if (!currentSplitViewBrowser) {
        return;
      }

      // set renderLayers to true & Set class to deck-selected
      currentSplitViewBrowser.renderLayers = true;
      currentSplitViewPanel?.classList.add("deck-selected");

      if (!currentSplitViewBrowser.docShellIsActive) {
        currentSplitViewBrowser.docShellIsActive = true;
      }

      function applySplitView() {
        currentSplitViewBrowser.renderLayers = true;
        currentSplitViewPanel?.classList.add("deck-selected");

        if (!browser.docShellIsActive) {
          browser.docShellIsActive = true;
        }
      }

      (function modifyDeckSelectedClass() {
        let tabs = gBrowser.tabs;
        for (let i = 0; i < tabs.length; i++) {
          let panel = gSplitView.Functions.getlinkedPanel(tabs[i].linkedPanel);
          if (
            tabs[i].hasAttribute("splitView") ||
            tabs[i] == gBrowser.selectedTab
          ) {
            panel?.classList.add("deck-selected");
          } else {
            panel?.classList.remove("deck-selected");
          }
        }
      })();

      window.setTimeout(applySplitView, 1000);
    },

    tabContextMenu: {
      addContextMenuToTabContext() {
        let beforeElem = document.getElementById("context_selectAllTabs");
        let menuitemElem = window.MozXULElement.parseXULToFragment(`
               <menu id="context_splitView" data-l10n-id="floorp-split-view-menu" accesskey="D">
                   <menupopup id="splitViewTabContextMenu"
                              onpopupshowing="gSplitView.Functions.tabContextMenu.onPopupShowing(event);"/>
               </menu>
               <menuitem id="splitViewTabContextMenuClose" data-l10n-id="splitview-close-split-tab"  oncommand="gSplitView.Functions.removeSplitView();"/>
               `);
        beforeElem.before(menuitemElem);
      },

      onPopupShowing(event) {
        //delete already exsist items
        let menuElem = document.getElementById("splitViewTabContextMenu");
        while (menuElem.firstChild) {
          menuElem.firstChild.remove();
        }

        //Rebuild context menu
        if (event.target == gBrowser.selectedTab) {
          let menuItem = window.MozXULElement.parseXULToFragment(`
                   <menuitem data-l10n-id="workspace-context-menu-selected-tab" disabled="true"/>
                  `);
          let parentElem = document.getElementById("workspaceTabContextMenu");
          parentElem.appendChild(menuItem);
          return;
        }

        let menuItem = window.MozXULElement.parseXULToFragment(`
                  <menuitem id="splitViewTabContextMenuLeft" data-l10n-id="splitview-show-on-left"  oncommand="gSplitView.Functions.setSplitView(TabContextMenu.contextTab, 'left');"/>
                  <menuitem id="splitViewTabContextMenuRight" data-l10n-id="splitview-show-on-right" oncommand="gSplitView.Functions.setSplitView(TabContextMenu.contextTab, 'right');"/>
                `);

        let parentElem = document.getElementById("splitViewTabContextMenu");
        parentElem.appendChild(menuItem);
      },

      setSplitView(event, side) {
        let tab = event.target;
        gSplitView.Functions.setSplitView(tab, side);
      },
    },
  },
};

// Init
gSplitView.Functions.init();
