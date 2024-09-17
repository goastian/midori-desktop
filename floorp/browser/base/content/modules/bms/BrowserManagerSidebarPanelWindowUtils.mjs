/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */

import { BrowserManagerSidebar } from "chrome://floorp/content/modules/bms/BrowserManagerSidebar.mjs";

export const EXPORTED_SYMBOLS = ["BrowserManagerSidebarPanelWindowUtils"];

export const BrowserManagerSidebarPanelWindowUtils = {
  get STATIC_SIDEBAR_DATA() {
    return BrowserManagerSidebar.STATIC_SIDEBAR_DATA;
  },

  get BROWSER_SIDEBAR_DATA() {
    return JSON.parse(
      Services.prefs.getStringPref("floorp.browser.sidebar2.data", undefined)
    );
  },

  getWindowByWebpanelId(webpanelId, parentWindow) {
    const webpanelBrowserId = "webpanel" + webpanelId;
    const webpanelBrowser =
      parentWindow.document.getElementById(webpanelBrowserId);

    if (!webpanelBrowser) {
      return null;
    }

    return webpanelBrowser.browsingContext.associatedWindow;
  },

  toggleMutePanel(aWindow, webpanelId, isParentWindow) {
    let targetPanelWindow = null;

    if (isParentWindow) {
      targetPanelWindow = this.getWindowByWebpanelId(webpanelId, window);
    } else {
      targetPanelWindow = window;
    }

    if (!targetPanelWindow) {
      return;
    }

    const tab = targetPanelWindow.gBrowser.selectedTab;
    const audioMuted = tab.linkedBrowser.audioMuted;

    if (audioMuted) {
      tab.linkedBrowser.unmute();
    } else {
      tab.linkedBrowser.mute();
    }
  },

  reloadPanel(aWindow, webpanelId, isParentWindow) {
    let targetPanelWindow = null;

    if (isParentWindow) {
      targetPanelWindow = this.getWindowByWebpanelId(webpanelId, aWindow);
    } else {
      targetPanelWindow = aWindow;
    }

    if (!targetPanelWindow) {
      return;
    }

    const tab = targetPanelWindow.gBrowser.selectedTab;
    tab.linkedBrowser.reload();
  },

  goForwardPanel(aWindow, webpanelId, isParentWindow) {
    let targetPanelWindow = null;

    if (isParentWindow) {
      targetPanelWindow = this.getWindowByWebpanelId(webpanelId, aWindow);
    } else {
      targetPanelWindow = aWindow;
    }

    if (!targetPanelWindow) {
      return;
    }

    const tab = targetPanelWindow.gBrowser.selectedTab;
    tab.linkedBrowser.goForward();
  },

  goBackPanel(aWindow, webpanelId, isParentWindow) {
    let targetPanelWindow = null;

    if (isParentWindow) {
      targetPanelWindow = this.getWindowByWebpanelId(webpanelId, aWindow);
    } else {
      targetPanelWindow = aWindow;
    }

    if (!targetPanelWindow) {
      return;
    }

    const tab = targetPanelWindow.gBrowser.selectedTab;
    tab.linkedBrowser.goBack();
  },

  goIndexPagePanel(aWindow, webpanelId, isParentWindow) {
    let targetPanelWindow = null;

    if (isParentWindow) {
      targetPanelWindow = this.getWindowByWebpanelId(webpanelId, aWindow);
    } else {
      targetPanelWindow = aWindow;
    }

    if (!targetPanelWindow) {
      return;
    }

    const uri = targetPanelWindow.bmsLoadedURI;
    targetPanelWindow.gBrowser.loadURI(Services.io.newURI(uri), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  },

  reopenInSelectContainer(aWindow, webpanelId, userContextId, isParentWindow) {
    let targetPanelWindow = null;

    if (isParentWindow) {
      targetPanelWindow = this.getWindowByWebpanelId(webpanelId, aWindow);
    } else {
      targetPanelWindow = aWindow;
    }

    if (!targetPanelWindow) {
      return;
    }

    let tab = targetPanelWindow.gBrowser.selectedTab;
    if (tab.getAttribute("usercontextid") == userContextId) {
      return;
    }
    let triggeringPrincipal;

    if (tab.linkedPanel) {
      triggeringPrincipal = tab.linkedBrowser.contentPrincipal;
    } else {
      let tabState = JSON.parse(
        targetPanelWindow.SessionStore.getTabState(tab)
      );
      try {
        triggeringPrincipal = targetPanelWindow.E10SUtils.deserializePrincipal(
          tabState.triggeringPrincipal_base64
        );
      } catch (ex) {
        console.error(
          "Failed to deserialize triggeringPrincipal for lazy tab browser",
          ex
        );
      }
    }

    if (!triggeringPrincipal || triggeringPrincipal.isNullPrincipal) {
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

    let newTab = targetPanelWindow.gBrowser.addTab(
      targetPanelWindow.bmsLoadedURI,
      {
        userContextId,
        triggeringPrincipal,
      }
    );

    if (targetPanelWindow.gBrowser.selectedTab == tab) {
      targetPanelWindow.gBrowser.selectedTab = newTab;
    }

    targetPanelWindow.gBrowser.removeTab(tab);
  },

  saveZoomLevel(webpanelId, zoomLevel) {
    const currentBSMData = this.BROWSER_SIDEBAR_DATA;
    currentBSMData.data[webpanelId].zoomLevel = zoomLevel;
    Services.prefs.setStringPref(
      "floorp.browser.sidebar2.data",
      JSON.stringify(currentBSMData)
    );
  },

  zoomInPanel(aWindow, webpanelId, isParentWindow) {
    let targetPanelWindow = null;

    if (isParentWindow) {
      targetPanelWindow = this.getWindowByWebpanelId(webpanelId, window);
    } else {
      targetPanelWindow = window;
    }

    if (!targetPanelWindow) {
      return;
    }

    targetPanelWindow.ZoomManager.enlarge();

    const zoomLevel = targetPanelWindow.ZoomManager.zoom;
    this.saveZoomLevel(webpanelId, zoomLevel);
  },

  zoomOutPanel(aWindow, webpanelId, isParentWindow) {
    let targetPanelWindow = null;

    if (isParentWindow) {
      targetPanelWindow = this.getWindowByWebpanelId(webpanelId, window);
    } else {
      targetPanelWindow = window;
    }

    if (!targetPanelWindow) {
      return;
    }

    targetPanelWindow.ZoomManager.reduce();

    const zoomLevel = targetPanelWindow.ZoomManager.zoom;
    this.saveZoomLevel(webpanelId, zoomLevel);
  },

  resetZoomPanel(aWindow, webpanelId, isParentWindow) {
    let targetPanelWindow = null;

    if (isParentWindow) {
      targetPanelWindow = this.getWindowByWebpanelId(webpanelId, window);
    } else {
      targetPanelWindow = window;
    }

    if (!targetPanelWindow) {
      return;
    }

    targetPanelWindow.ZoomManager.zoom = 1;

    const zoomLevel = targetPanelWindow.ZoomManager.zoom;
    this.saveZoomLevel(webpanelId, zoomLevel);
  },
};
