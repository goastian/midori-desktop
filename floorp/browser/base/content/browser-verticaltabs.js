/* eslint-disable no-undef */
/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 const VERTICAL_TABS_WIDTH_PREF = "floorp.browser.tabs.verticaltab.width";
 
 var gFloorpVerticalTabBar = {
   _initialized: false,
   _widthObserver: null,
   _listenerAdded: false,
 
   get enabled() {
     return Services.prefs.getBoolPref("floorp.browser.tabs.verticaltab", false);
   },
 
   get hoverModeEnabled() {
     return Services.prefs.getBoolPref(
       "floorp.verticaltab.hover.enabled",
       false,
     );
   },
 
   get tabsToolbar() {
     return document.getElementById("TabsToolbar");
   },
 
   get titlebarContainer() {
     return document.getElementById("titlebar");
   },
 
   get browserBox() {
     return document.getElementById("browser");
   },
 
   get arrowscrollbox() {
     return document.getElementById("tabbrowser-arrowscrollbox");
   },
 
   get tabbrowserTabs() {
     return document.getElementById("tabbrowser-tabs");
   },
 
   get toolbarModificationStyle() {
     return document.getElementById("verticalTabsStyle");
   },
 
   get hoverStyleElem() {
     return document.getElementById("floorp-vthover");
   },
 
   get splitter() {
     return document.getElementById("verticaltab-splitter");
   },

  get tabContextCloseTabsToTheStart() {
    return document.getElementById("context_closeTabsToTheStart");
  },

  get tabContextCloseTabsToTheEnd() {
    return document.getElementById("context_closeTabsToTheEnd");
  },
 
   init() {
     if (this._initialized) {
       return;
     }
 
     // Global
     window.gFloorpVerticalTabBar = this;
 
     Services.prefs.addObserver("floorp.tabbar.style", function () {
       if (Services.prefs.getIntPref("floorp.tabbar.style") == 2) {
         Services.prefs.setIntPref(tabbarContents.tabbarDisplayStylePref, 2);
       } else {
         Services.prefs.setIntPref(tabbarContents.tabbarDisplayStylePref, 0);
       }
       gFloorpVerticalTabBar.setVerticalTabs();
     });
 
     this.setVerticalTabs();
     this._initialized = true;
   },
 
   enableVerticalTabBar() {
     // pref
     Services.prefs.setBoolPref("floorp.browser.tabs.verticaltab", true);
     Services.prefs.setIntPref("floorp.browser.tabbar.settings", 2);
 
     // Move Tab Bar
     this.browserBox?.prepend(this.tabsToolbar || "");
 
     // Replace orientation
     this.arrowScrollbox = document.getElementById("tabbrowser-arrowscrollbox");
     this.tabBrowserTabs = document.getElementById("tabbrowser-tabs");
     this.arrowScrollbox?.setAttribute("orient", "vertical");
     this.tabBrowserTabs?.setAttribute("orient", "vertical");
 
     // Lepton Integration
     this.tabsToolbar?.setAttribute("multibar", "true");
 
     document
       .querySelector("#TabsToolbar .toolbar-items")
       ?.setAttribute("align", "start");
 
     this.tabsToolbar?.removeAttribute("flex");
 
     //toolbar modification
     let Tag = document.createElement("style");
     Tag.id = "verticalTabsStyle";
     Tag.textContent = `@import url("chrome://browser/content/browser-verticaltabs.css");`;
     document.head.appendChild(Tag);
 
     // Hover effect CSS check
     if (this.hoverStyleElem == null && this.hoverModeEnabled) {
       window.setTimeout(() => {
         Tag = document.createElement("style");
         Tag.innerText = `@import url(chrome://browser/skin/options/native-verticaltab-hover.css)`;
         Tag.setAttribute("id", "floorp-vthover");
         document.head.appendChild(Tag);
       }, 1000);
     }
 
     //splitter
     this.splitter.removeAttribute("hidden");
 
     // TabsToolbar hidden
     this.tabsToolbar?.removeAttribute("hidden");
 
     // Change Scroll elem tag
     this.changeXULElementTagName(
       this.arrowscrollbox.shadowRoot.querySelector(
         "scrollbox[part='scrollbox']",
       ),
       "vbox",
     );
 
     // Width observer
     this._widthObserver = new MutationObserver(this.mutationObserverCallback);
 
     if (this.tabsToolbar) {
       this._widthObserver.observe(this.tabsToolbar, {
         attributes: true,
       });
     }
 
     document
       .getElementById("TabsToolbar")
       ?.setAttribute(
         "width",
         Services.prefs.getIntPref(VERTICAL_TABS_WIDTH_PREF, 200),
       );
 
     if (this.tabsToolbar) {
       document.getElementById("TabsToolbar").style.width =
         `${Services.prefs.getIntPref(VERTICAL_TABS_WIDTH_PREF, 200)}px`;
     }
 
     // Observer
     this.toggleCustomizeModeVerticaltabStyle();

    // Context menu localization
    this.tabContextCloseTabsToTheStart?.setAttribute(
      "data-lazy-l10n-id",
      "close-tabs-to-the-start-on-vertical-tab-bar",
    );

    this.tabContextCloseTabsToTheEnd?.setAttribute(
      "data-lazy-l10n-id",
      "close-tabs-to-the-end-on-vertical-tab-bar",
    );

    // fix cannot use middle click to open new tab
    if (!this._listenerAdded) {
      this.arrowscrollbox?.addEventListener("click", (event) => this.mouseMiddleClickEventListener(event));
      this._listenerAdded = true;
    }
   },
 
   disableVerticalTabBar() {
     Services.prefs.setBoolPref("floorp.browser.tabs.verticaltab", false);
     Services.prefs.setIntPref("floorp.browser.tabbar.settings", 0);
 
     this.titlebarContainer?.prepend(this.tabsToolbar || "");
 
     this.arrowScrollbox?.setAttribute("orient", "horizontal");
     this.tabBrowserTabs?.setAttribute("orient", "horizontal");
 
     document
       .querySelector("#TabsToolbar .toolbar-items")
       ?.setAttribute("align", "end");
 
     this.tabsToolbar?.setAttribute("flex", "1");
 
     //toolbar modification
     this.toolbarModificationStyle?.remove();
 
     // Hover effect CSS
     this.hoverStyleElem?.remove();
 
     // Splitter
     this.splitter?.setAttribute("hidden", "true");
 
     // Change Scroll elem tag
     this.changeXULElementTagName(
       this.arrowscrollbox.shadowRoot.querySelector("vbox[part='scrollbox']"),
       "scrollbox",
     );
 
     // Observer
     if (this._widthObserver) {
       this._widthObserver.disconnect();
       this._widthObserver = null;
     }

    // Context menu localization
    this.tabContextCloseTabsToTheStart?.removeAttribute(
      "data-lazy-l10n-id",
    );

    this.tabContextCloseTabsToTheEnd?.removeAttribute(
      "data-lazy-l10n-id",
    );
   },
 
   setVerticalTabs() {
     if (Services.prefs.getIntPref("floorp.tabbar.style") == 2) {
       this.enableVerticalTabBar();
      } else {
        Services.prefs.setBoolPref("floorp.browser.tabs.verticaltab", false);
     }
   },
 
   // Functions
   changeXULElementTagName(oldElement, newTagName) {
     const newElement = document.createElement(newTagName);
 
     if (!oldElement) {
       return;
     }
 
     const attrs = oldElement.attributes;
     for (let i = 0; i < attrs.length; i++) {
       newElement.setAttribute(attrs[i].name, attrs[i].value);
     }
 
     while (oldElement.firstChild) {
       newElement.appendChild(oldElement.firstChild);
     }
     oldElement.parentNode.replaceChild(newElement, oldElement);
   },
 
   mutationObserverCallback(mutations) {
     for (const mutation of mutations) {
       if (mutation.type === "attributes" && mutation.attributeName == "width") {
         Services.prefs.setIntPref(
           VERTICAL_TABS_WIDTH_PREF,
           parseInt(mutation.target.style.width),
         );
       }
     }
   },
 
   toggleCustomizeModeVerticaltabStyle() {
     let customizationContainer = document.getElementById("nav-bar");
     let arrowscrollbox = document.getElementById("tabbrowser-arrowscrollbox");
     let observer = new MutationObserver(function (mutations) {
       mutations.forEach(function (mutation) {
         if (mutation.target.getAttribute("customizing") == "true") {
           Services.prefs.setBoolPref(
             "floorp.browser.tabs.verticaltab.temporary.disabled",
             true,
           );
           Services.prefs.setIntPref("floorp.tabbar.style", 0);
           Services.prefs.setIntPref(tabbarContents.tabbarDisplayStylePref, 0);
           arrowscrollbox.hidden = true;
         } else {
           Services.prefs.setBoolPref(
             "floorp.browser.tabs.verticaltab.temporary.disabled",
             false,
           );
           Services.prefs.setIntPref("floorp.tabbar.style", 2);
           Services.prefs.setIntPref(tabbarContents.tabbarDisplayStylePref, 2);
           arrowscrollbox.hidden = false;
         }
       });
     });
     let config = { attributes: true };
     observer.observe(customizationContainer, config);
 
     Services.prefs.addObserver("floorp.tabbar.style", function () {
       if (
         Services.prefs.getIntPref("floorp.tabbar.style") != 2 &&
         !Services.prefs.getBoolPref(
           "floorp.browser.tabs.verticaltab.temporary.disabled",
         )
       ) {
         observer.disconnect();
       } else if (
         Services.prefs.getIntPref("floorp.tabbar.style") == 2 &&
         Services.prefs.getBoolPref(
           "floorp.browser.tabs.verticaltab.temporary.disabled",
         )
       ) {
         observer.observe(customizationContainer, config);
       }
     });
   },
   mouseMiddleClickEventListener(event) {
    if (event.button != 1 || event.target != this.arrowscrollbox) {
      return;
    }
    gBrowser.handleNewTabMiddleClick(this.arrowscrollbox, event)
  },
 };
 
 window.setTimeout(() => {
   gFloorpVerticalTabBar.init();
 }, 1000);
