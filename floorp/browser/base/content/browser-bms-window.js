/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 var { BrowserManagerSidebarPanelWindowUtils } = ChromeUtils.importESModule(
    "resource:///modules/BrowserManagerSidebar.sys.mjs"
);


// global variables
var gBrowser = window.gBrowser;

var gBmsWindow = {
    _initialized: false,

    get mainWindow() {
        return document.getElementById("main-window");
    },

    get loadURL() {
        return window.bmsLoadedURI;
    },

    get webpanelId() {
        return this.mainWindow.getAttribute("BMS-webpanelid");
    },

    get userContextId() {
        return this.mainWindow.getAttribute("BMS-usercontextid");
    },

    get userAgent() {
        return this.mainWindow.getAttribute("BMS-useragent");
    },

    init() {
        if (this._initialized) {
            return;
        }

        let loadURL = window.location.toString().split("?")[1];
        if (!loadURL) {
            return;
        }

        // Against session restore issue
        window.IsWebpanelWindow = true;

        document.addEventListener("DOMContentLoaded", () => {
            window.SessionStore.promiseInitialized.then(() => {
                this.createWebpanelWindow();
            });
        });

        // finish initialization
        this._initialized = true;
    },

    createWebpanelWindow() {
        let arry = window.location.toString().split("?");
        let loadURL = arry[1];
        let userContextId = Number(arry[2]);
        let userAgent = arry[3] == "true";
        let webPanelId = arry[4];

        this.mainWindow.setAttribute("BSM-window", "true");
        this.mainWindow.setAttribute("BMS-usercontextid", userContextId);
        this.mainWindow.setAttribute("BMS-useragent", userAgent);
        this.mainWindow.setAttribute("BMS-webpanelid", webPanelId);
        window.bmsLoadedURI = loadURL;

        // Remove "navigator:browser" from window-main attribute
        this.mainWindow.setAttribute("windowtype", "navigator:webpanel");


        // Tab modifications
        gBrowser.loadURI(Services.io.newURI(loadURL), {
            triggeringPrincipal:
                Services.scriptSecurityManager.getSystemPrincipal(),
        });

        // userContextId
        if (userContextId != 0) {
            window.setTimeout(() => {
                BrowserManagerSidebarPanelWindowUtils.reopenInSelectContainer(
                    window,
                    webPanelId,
                    userContextId,
                    false
                );
            }, 0);
        }

        // Resolve the issue that open url by anoter application and that is not loaded on main window.
        window.setTimeout(() => {
            let tab = window.gBrowser.addTrustedTab("about:blank");
            window.gBrowser.removeTab(tab);
        }, 0);


        // Windows moficiations
        this.mainWindow
            .setAttribute(
                "chromehidden",
                "toolbar",
                "menubar directories extrachrome chrome,location=yes,centerscreen,dialog=no,resizable=yes,scrollbars=yes",
            );

        const BMSSyleElement = document.createElement("style");
        BMSSyleElement.textContent = `
       @import url("chrome://browser/content/browser-bms-window.css");
     `;
        document.head.appendChild(BMSSyleElement);

        let setZoomLebelInterval = window.setInterval(() => {
            if (window.closed) {
                window.clearInterval(setZoomLebelInterval);
                return;
            }

            gBmsWindow.setZoomLevel();
        }, 100);
    },
    setZoomLevel() {
        let zoomLevel = gBmsWindow.webapnelData.zoomLevel;
        if (zoomLevel) {
            window.ZoomManager.zoom = zoomLevel;
        }
    }
};
if (Services.prefs.getBoolPref("floorp.browser.sidebar2.addons.enabled")) {
    gBmsWindow.init();
}