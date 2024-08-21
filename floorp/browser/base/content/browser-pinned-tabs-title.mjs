/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Object representing the pinned tabs title functionality in the browser.
 *
 * @typedef {object} gFloorpPinnedTabsTitle - The pinned tabs title object.
 * @property {boolean} _initialized - Flag indicating if the object has been initialized.
 * @property {boolean} isShowPinnedTabsTitleEnabled - Flag indicating if the pinned tabs title is enabled.
 * @property {number} tabMinWidth - The minimum width of a tab.
 * @property {HTMLElement} showPinnedTabsTitleCssElem - The CSS element for showing the pinned tabs title.
 * @property {string} pinnedTabsTitleCSS - The CSS styles for the pinned tabs title.
 *
 * @function init - Initializes the pinned tabs title functionality.
 * @function applyShowPinnedTabsTitle - Applies the pinned tabs title based on the preferences.
 */

export const gFloorpPinnedTabsTitle = {
  _initialized: false,

  get isShowPinnedTabsTitleEnabled() {
    return Services.prefs.getBoolPref("floorp.tabs.showPinnedTabsTitle", false);
  },

  get tabMinWidth() {
    return Services.prefs.getIntPref("browser.tabs.tabMinWidth", 76);
  },

  get tabMinHeight() {
    return Services.prefs.getIntPref("floorp.browser.tabs.tabMinHeight", 30);
  },

  get showPinnedTabsTitleCssElem() {
    return document.getElementById("showPinnedTabsTitle-css");
  },

  get pinnedTabsTitleCSS() {
    return `
      .tab-label-container[pinned] {
        width: unset !important;
      }
      .tabbrowser-tab[pinned] {
        width: ${this.tabMinWidth}px !important;
        height: ${this.tabMinHeight}px !important;
      }
      .tab-throbber[pinned], .tab-icon-pending[pinned], 
      .tab-icon-image[pinned], .tab-sharing-icon-overlay[pinned], 
      .tab-icon-overlay[pinned] {
        margin-inline-end: 5.5px !important;
      }
    `;
  },

  init() {
    if (this._initialized) {
      return;
    }

    Services.prefs.addObserver(
      "floorp.tabs.showPinnedTabsTitle",
      this.applyShowPinnedTabsTitle.bind(this)
    );
    Services.prefs.addObserver(
      "browser.tabs.tabMinWidth",
      this.applyShowPinnedTabsTitle.bind(this)
    );
    Services.prefs.addObserver(
      "floorp.browser.tabs.tabMinHeight",
      this.applyShowPinnedTabsTitle.bind(this)
    );

    this.applyShowPinnedTabsTitle();
    this._initialized = true;
  },

  applyShowPinnedTabsTitle() {
    const cssElem = this.showPinnedTabsTitleCssElem;
    if (cssElem) {
      cssElem.remove();
    }

    if (this.isShowPinnedTabsTitleEnabled) {
      const styleElement = document.createElement("style");
      styleElement.id = "showPinnedTabsTitle-css";
      styleElement.textContent = this.pinnedTabsTitleCSS;
      document.body.appendChild(styleElement);
    }

    const tabBrowserTabs = document.getElementById("tabbrowser-tabs");
    if (tabBrowserTabs) {
      tabBrowserTabs._pinnedTabsLayoutCache = null;
      tabBrowserTabs._positionPinnedTabs();
    }
  },
};

gFloorpPinnedTabsTitle.init();
