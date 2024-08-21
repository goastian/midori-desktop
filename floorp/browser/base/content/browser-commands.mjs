/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Object representing various commands related to the Floorp functionality.
 *
 * @typedef {object} gFloorpCommands
 * @property {boolean} initialized - Indicates whether the commands have been initialized.
 * @property {Function} sss - Returns the style-sheet-service object.
 * @property {Function} init - Initializes the commands.
 * @property {Function} OpenChromeDirectory - Opens the Chrome directory.
 * @property {Function} changeXULElementTagName - Changes the tag name of a XUL element.
 * @property {Function} enableRestMode - Enables the rest mode.
 * @property {Function} restartbrowser - Restarts the browser.
 * @property {Function} loadStyleSheetWithNsStyleSheetService - Loads a style sheet using the nsIStyleSheetService.
 * @property {Function} checkProvidedStyleSheetLoaded - Checks if a provided style sheet is loaded.
 * @property {Function} unloadStyleSheetWithNsStyleSheetService - Unloads a style sheet using the nsIStyleSheetService.
 */

export const gFloorpCommands = {
  initialized: false,

  get sss() {
    return Cc["@mozilla.org/content/style-sheet-service;1"].getService(
      Ci.nsIStyleSheetService
    );
  },

  init() {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
  },

  OpenChromeDirectory() {
    const currProfDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
    const profileDir = currProfDir.path;
    const nsLocalFile = Components.Constructor(
      "@mozilla.org/file/local;1",
      "nsIFile",
      "initWithPath"
    );
    new nsLocalFile(profileDir).reveal();
  },

  changeXULElementTagName(oldElement, newTagName) {
    const newElement = document.createElement(newTagName);
    const attrs = oldElement.attributes;

    for (let i = 0; i < attrs.length; i++) {
      newElement.setAttribute(attrs[i].name, attrs[i].value);
    }

    while (oldElement.firstChild) {
      newElement.appendChild(oldElement.firstChild);
    }
    oldElement.parentNode.replaceChild(newElement, oldElement);
  },

  enableRestMode() {
    const selectedTab = window.gBrowser.selectedTab;
    const selectedTabLocation = selectedTab.linkedBrowser.documentURI.spec;

    for (const tab of window.gBrowser.tabs) {
      window.gBrowser.discardBrowser(tab);
    }

    if (selectedTabLocation) {
      window.openTrustedLinkIn("about:blank", "current");
    }

    const tag = document.createElement("style");
    tag.textContent = `* { display:none !important; }`;
    tag.setAttribute("id", "floorp-rest-mode");
    document.head.appendChild(tag);

    const l10n = new Localization(
      ["browser/floorp.ftl", "branding/brand.ftl"],
      true
    );
    Services.prompt.alert(
      null,
      l10n.formatValueSync("rest-mode"),
      l10n.formatValueSync("rest-mode-description")
    );

    document.getElementById("floorp-rest-mode").remove();

    if (selectedTabLocation) {
      window.openTrustedLinkIn(selectedTabLocation, "current");
    }
  },

  restartbrowser() {
    Services.obs.notifyObservers(null, "startupcache-invalidate");

    const env = Services.env;
    env.set("MOZ_DISABLE_SAFE_MODE_KEY", "1");

    Services.startup.quit(
      Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart
    );
  },

  loadStyleSheetWithNsStyleSheetService(styleSheetURL) {
    const uri = Services.io.newURI(styleSheetURL);
    this.sss.loadAndRegisterSheet(uri, this.sss.USER_SHEET);
  },

  checkProvidedStyleSheetLoaded(styleSheetURL) {
    const uri = Services.io.newURI(styleSheetURL);
    if (!this.sss.sheetRegistered(uri, this.sss.USER_SHEET)) {
      this.sss.loadAndRegisterSheet(uri, this.sss.USER_SHEET);
    }
  },

  unloadStyleSheetWithNsStyleSheetService(styleSheetURL) {
    const uri = Services.io.newURI(styleSheetURL);
    this.sss.unregisterSheet(uri, this.sss.USER_SHEET);
  },
};
