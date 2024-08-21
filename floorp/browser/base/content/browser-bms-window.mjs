/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */

import { BrowserManagerSidebarPanelWindowUtils } from "./modules/bms/BrowserManagerSidebarPanelWindowUtils.mjs";

export const gBmsWindow = {
  _initialized: false,
  currentURL: new URL(window.location.href),

  get mainWindow() {
    return document.getElementById("main-window");
  },

  get loadURL() {
    return this.webpanelData.url;
  },

  get webpanelId() {
    return this.currentURL.searchParams.get("floorpWebPanelId");
  },

  get userContextId() {
    return this.webpanelData.usercontext ? this.webpanelData.usercontext : 0;
  },

  get userAgent() {
    return this.webpanelData?.userAgent ? this.webpanelData.userAgent : false;
  },

  get webpanelData() {
    const id = this.webpanelId;
    return BrowserManagerSidebarPanelWindowUtils.BROWSER_SIDEBAR_DATA.data[id];
  },

  get isBmsWindow() {
    return Boolean(this.webpanelId);
  },

  init() {
    if (this._initialized || !this.webpanelId) {
      return;
    }

    // Against session restore issue
    window.floorpWebPanelWindow = true;
    window.SessionStore.promiseInitialized.then(() =>
      this.createWebpanelWindow()
    );

    // Finish initialization
    this._initialized = true;
  },

  createWebpanelWindow() {
    const { userContextId, userAgent, loadURL, mainWindow } = this;

    mainWindow.setAttribute("BSM-window", "true");
    mainWindow.setAttribute("BMS-usercontextid", userContextId);
    mainWindow.setAttribute("BMS-useragent", userAgent);
    mainWindow.setAttribute("BMS-webpanelid", this.webpanelId);
    window.bmsLoadedURI = loadURL;

    // Remove "navigator:browser" from window-main attribute
    mainWindow.setAttribute("windowtype", "navigator:webpanel");

    // Tab modifications
    window.gBrowser.loadURI(Services.io.newURI(loadURL), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });

    // Attribute modifications
    window.gBrowser.selectedTab.setAttribute("BMS-webpanel-tab", "true");

    // Handle issue of opening URL by another application and not loading on the main window
    window.setTimeout(() => {
      const tab = window.gBrowser.addTrustedTab("about:blank");
      window.gBrowser.removeTab(tab);
    }, 0);

    // User context handling

    (async () => {
      BrowserManagerSidebarPanelWindowUtils.reopenInSelectContainer(
        window,
        this.webpanelId,
        userContextId,
        false
      );
    })();

    // Window modifications
    mainWindow.setAttribute(
      "chromehidden",
      "toolbar menubar directories extrachrome",
      "chrome,location=yes,centerscreen,dialog=no,resizable=yes,scrollbars=yes"
    );

    const BMSStyleElement = document.createElement("style");
    BMSStyleElement.textContent = `
      @import url("chrome://floorp/content/browser-bms-window.css");
    `;
    document.head.appendChild(BMSStyleElement);

    const setZoomLevelInterval = window.setInterval(() => {
      if (window.closed) {
        window.clearInterval(setZoomLevelInterval);
        return;
      }

      this.setZoomLevel();
    }, 100);
  },

  setZoomLevel() {
    const zoomLevel = this.webpanelData?.zoomLevel;
    if (zoomLevel) {
      window.ZoomManager.zoom = zoomLevel;
    }
  },
};

gBmsWindow.init();
