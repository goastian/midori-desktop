/* eslint-disable no-undef */
/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */

const { PrivateContainer } = ChromeUtils.importESModule(
  "resource:///modules/PrivateContainer.sys.mjs"
);

export const gFloorpPrivateContainer = {
  initialized: false,
  init() {
    if (this.initialized) {
      return;
    }

    // Create a private container.
    PrivateContainer.Functions.StartupCreatePrivateContainer();
    PrivateContainer.Functions.removePrivateContainerData();

    SessionStore.promiseInitialized.then(() => {
      gBrowser.tabContainer.addEventListener(
        "TabClose",
        gFloorpPrivateContainer.removeDataIfPrivateContainerTabNotExist
      );

      gBrowser.tabContainer.addEventListener("TabOpen", gFloorpPrivateContainer.handleTabModifications);

      // Add a tab context menu to reopen in private container.
      let beforeElem = document.getElementById("context_selectAllTabs");
      let menuitemElem = window.MozXULElement.parseXULToFragment(`
        <menuitem id="context_toggleToPrivateContainer" data-l10n-id="floorp-toggle-private-container" accesskey="D" oncommand="gFloorpPrivateContainer.reopenInPrivateContainer(event);"/>
      `);
      beforeElem.before(menuitemElem);

      // add URL link a context menu to open in private container.
      gFloorpContextMenu.addContextBox(
        "open_in_private_container",
        "open-in_private-container",
        "context-openlink",
        "gFloorpPrivateContainer.openWithPrivateContainer(gContextMenu.linkURL);",
        "context-openlink",
        function () {
          document.getElementById("open_in_private_container").hidden =
            document.getElementById("context-openlink").hidden;
        }
      );
    });

    this.initialized = true;
  },

  checkPrivateContainerTabExist() {
    let privateContainer = PrivateContainer.Functions.getPrivateContainer();
    if (!privateContainer || !privateContainer.userContextId) {
      return false;
    }

    let tabs = gBrowser.tabs;
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].userContextId === privateContainer.userContextId) {
        return true;
      }
    }
    return false;
  },

  removeDataIfPrivateContainerTabNotExist() {
    let privateContainerUserContextID =
      PrivateContainer.Functions.getPrivateContainerUserContextId();
    window.setTimeout(() => {
      if (!gFloorpPrivateContainer.checkPrivateContainerTabExist()) {
        PrivateContainer.Functions.removePrivateContainerData();
      }

      let tabs = gBrowser.tabs;
      let result = [];
      for (let i = 0; i < tabs.length; i++) {
        if (tabs[i].userContextId === privateContainerUserContextID) {
          result.push(tabs[i]);
        }
      }
      return result;
    }, 400);
  },

  tabIsSaveHistory(tab) {
    return tab.getAttribute("historydisabled") === "true";
  },

  applyDoNotSaveHistoryToTab(tab) {
    tab.linkedBrowser.setAttribute("disablehistory", "true");
    tab.linkedBrowser.setAttribute("disableglobalhistory", "true");
    tab.setAttribute("floorp-disablehistory", "true");
  },

  checkTabIsPrivateContainer(tab) {
    let privateContainerUserContextID =
      PrivateContainer.Functions.getPrivateContainerUserContextId();
    return tab.userContextId === privateContainerUserContextID;
  },

  handleTabModifications() {
    let tabs = gBrowser.tabs;
    for (let i = 0; i < tabs.length; i++) {
      if (gFloorpPrivateContainer.checkTabIsPrivateContainer(tabs[i]) && !gFloorpPrivateContainer.tabIsSaveHistory(tabs[i])) {
        gFloorpPrivateContainer.applyDoNotSaveHistoryToTab(tabs[i]);
      }
    }
  },

  openWithPrivateContainer(url) {
    let relatedToCurrent = false; //"relatedToCurrent" decide where to open the new tab. Default work as last tab (right side). Floorp use this.
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
    }
    let privateContainerUserContextID =
      PrivateContainer.Functions.getPrivateContainerUserContextId();
    Services.obs.notifyObservers(
      {
        wrappedJSObject: new Promise(resolve => {
          openTrustedLinkIn(url, "tab", {
            relatedToCurrent,
            resolveOnNewTabCreated: resolve,
            userContextId: privateContainerUserContextID,
          });
        }),
      },
      "browser-open-newtab-start"
    );
  },
  reopenInPrivateContainer() {
    let userContextId =
      PrivateContainer.Functions.getPrivateContainerUserContextId();
    let reopenedTabs = TabContextMenu.contextTab.multiselected
      ? gBrowser.selectedTabs
      : [TabContextMenu.contextTab];

    for (let tab of reopenedTabs) {
      /* Create a triggering principal that is able to load the new tab
         For content principals that are about: chrome: or resource: we need system to load them.
         Anything other than system principal needs to have the new userContextId.
      */
      let triggeringPrincipal;

      if (tab.linkedPanel) {
        triggeringPrincipal = tab.linkedBrowser.contentPrincipal;
      } else {
        // For lazy tab browsers, get the original principal
        // from SessionStore
        let tabState = JSON.parse(SessionStore.getTabState(tab));
        try {
          triggeringPrincipal = E10SUtils.deserializePrincipal(
            tabState.triggeringPrincipal_base64
          );
        } catch (ex) {
          continue;
        }
      }

      if (!triggeringPrincipal || triggeringPrincipal.isNullPrincipal) {
        // Ensure that we have a null principal if we couldn't
        // deserialize it (for lazy tab browsers) ...
        // This won't always work however is safe to use.
        triggeringPrincipal = Services.scriptSecurityManager.createNullPrincipal({
          userContextId,
        });
      } else if (triggeringPrincipal.isContentPrincipal) {
        triggeringPrincipal = Services.scriptSecurityManager.principalWithOA(
          triggeringPrincipal,
          {
            userContextId,
          }
        );
      }

      let currentTabUserContextId = tab.getAttribute("usercontextid");
      if (currentTabUserContextId == userContextId) {
        userContextId = 0;
      }

      let newTab = gBrowser.addTab(tab.linkedBrowser.currentURI.spec, {
        userContextId,
        pinned: tab.pinned,
        index: tab._tPos + 1,
        triggeringPrincipal,
      });

      if (gBrowser.selectedTab == tab) {
        gBrowser.selectedTab = newTab;
      }
      if (tab.muted && !newTab.muted) {
        newTab.toggleMuteAudio(tab.muteReason);
      }

      gBrowser.removeTab(tab);
    }
  },
};

gFloorpPrivateContainer.init();