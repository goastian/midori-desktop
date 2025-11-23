/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const BrowserManagerSidebar = {
  STATIC_SIDEBAR_DATA: {
    "midori//bmt": {
      url: "chrome://browser/content/places/places.xhtml",
      l10n: `browser-manager-sidebar`,
      defaultWidth: 600,
    },
    "midori//bookmarks": {
      url: "chrome://browser/content/places/bookmarksSidebar.xhtml",
      l10n: `bookmark-sidebar`,
      defaultWidth: 415,
    },
    "midori//history": {
      url: "chrome://browser/content/places/historySidebar.xhtml",
      l10n: `history-sidebar`,
      defaultWidth: 415,
    },
    "midori//downloads": {
      url: "about:downloads",
      l10n: `download-sidebar`,
      defaultWidth: 415,
    },
  },

  BrowserManagerSidebarXULElement: `
<vbox id="sidebar2-box" style="min-width: 18em; z-index: 1" class="browser-sidebar2 chromeclass-extrachrome">
  <box id="sidebar2-header" style="min-height: 2.5em" align="center">
    <toolbarbutton id="sidebar2-reload" class="sidebar2-icon" style="margin-left: 0.5em;"
      data-l10n-id="sidebar-reload-button" oncommand="gBrowserManagerSidebar.sidebarButtons(2);" />
    <spacer flex="1" />
    <toolbarbutton id="sidebar2-close" class="sidebar2-icon" style="margin-right: 0.5em;"
      data-l10n-id="sidebar2-close-button"
      oncommand="gBrowserManagerSidebar.controllFunctions.changeVisibilityOfWebPanel();" />
  </box>
</vbox>
<splitter id="sidebar-splitter2" class="browser-sidebar2 chromeclass-extrachrome" hidden="false" />
<vbox id="sidebar-select-box" style="overflow: hidden auto; z-index: 1" class="webpanel-box chromeclass-extrachrome">
   <vbox id="panelBox">
     <toolbarbutton class="sidepanel-browser-icon" data-l10n-id="sidebar-add-button"  oncommand="gBrowserManagerSidebar.openAdditionalWebPanelWindow();" id="add-button"/>
   </vbox>
   <spacer flex="1"/>
   <vbox id="bottomButtonBox">
     <toolbarbutton class="sidepanel-browser-icon" data-l10n-id="sidebar2-hide-sidebar"  oncommand="Services.prefs.setBoolPref('midori.browser.sidebar.enable', false);" id="sidebar-hide-icon"/>
     <toolbarbutton class="sidepanel-browser-icon" data-l10n-id="sidebar-preferences-button"  oncommand="openPreferences();" id="preferences-icon"/>
   </vbox>
</vbox>
`,

  BrowserManagerSidebarToolbarContextMenuElement: `
<popupset>
  <menupopup id="webpanel-context" onpopupshowing="gBrowserManagerSidebar.contextMenu.show(event);">
    <menuitem id="unloadWebpanelMenu" class="needLoadedWebpanel" data-l10n-id="sidebar2-unload-panel"
      label="Unload this webpanel" accesskey="U" oncommand="gBrowserManagerSidebar.contextMenu.unloadWebpanel();" />
    <menuitem id="muteMenu" class="needLoadedWebpanel" data-l10n-id="sidebar2-mute-and-unmute"
      label="Mute/Unmute this webpanel" accesskey="M" oncommand="gBrowserManagerSidebar.contextMenu.muteWebpanel();" />
    <menuseparator class="context-webpanel-separator" />
    <menuitem id="deleteWebpanelMenu" data-l10n-id="sidebar2-delete-panel" accesskey="D"
      oncommand="gBrowserManagerSidebar.contextMenu.deleteWebpanel();" />
  </menupopup>

  <menupopup id="all-panel-context" onpopupshowing="gBrowserManagerSidebar.contextMenu.show(event);">
    <menuitem id="unloadWebpanelMenu" class="needLoadedWebpanel" data-l10n-id="sidebar2-unload-panel"
      label="Unload this webpanel" accesskey="U" oncommand="gBrowserManagerSidebar.contextMenu.unloadWebpanel();" />
    <menuseparator class="context-webpanel-separator" />
    <menuitem id="deleteWebpanelMenu" data-l10n-id="sidebar2-delete-panel" accesskey="D"
      oncommand="gBrowserManagerSidebar.contextMenu.deleteWebpanel();" />
  </menupopup>
</popupset>
`,

  DEFAULT_WEBPANEL: [
    "https://cloud.astian.org",
    "https://wallet.astian.org",
    "https://astian.org/community",
  ],
  prefsUpdate() {
    const defaultPref = { data: {}, index: [] };
    for (const elem in this.STATIC_SIDEBAR_DATA) {
      if (this.STATIC_SIDEBAR_DATA[elem].enabled === false) {
        delete this.STATIC_SIDEBAR_DATA[elem];
        continue;
      }
      defaultPref.data[elem.replace("//", "__")] = {
        url: elem,
        width: this.STATIC_SIDEBAR_DATA[elem].defaultWidth,
      };
      defaultPref.index.push(elem.replace("//", "__"));
    }
    for (const elem in this.DEFAULT_WEBPANEL) {
      defaultPref.data[`w${elem}`] = { url: this.DEFAULT_WEBPANEL[elem] };
      defaultPref.index.push(`w${elem}`);
    }
    Services.prefs
      .getDefaultBranch(null)
      .setStringPref(
        "midori.browser.sidebar2.data",
        JSON.stringify(defaultPref)
      );

    if (Services.prefs.prefHasUserValue("midori.browser.sidebar2.data")) {
      const prefTemp = JSON.parse(
        Services.prefs.getStringPref("midori.browser.sidebar2.data")
      );
      const setPref = { data: {}, index: [] };
      for (const elem of prefTemp.index) {
        setPref.data[elem] = prefTemp.data[elem];
        setPref.index.push(elem);
      }
      Services.prefs.setStringPref(
        "midori.browser.sidebar2.data",
        JSON.stringify(setPref)
      );
    }
  },

  getFavicon(sbar_url, elem) {
    try {
      new URL(sbar_url);
    } catch (e) {
      elem.style.removeProperty("--BMSIcon");
      return;
    }

    if (sbar_url.startsWith("http://") || sbar_url.startsWith("https://")) {
      // Use Google favicon service - simple and reliable
      const icon_url = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(sbar_url)}`;
      elem.style.setProperty("--BMSIcon", `url(${icon_url})`);
    } else if (sbar_url.startsWith("file://")) {
      elem.style.setProperty("--BMSIcon", `url(moz-icon:${sbar_url}?size=128)`);
    } else if (sbar_url.startsWith("extension")) {
      const iconURL = sbar_url.split(",")[4];
      elem.style.setProperty("--BMSIcon", `url(${iconURL})`);
      elem.className += " extension-icon";
      const listTexts = "chrome://midori/content/BMS-extension-needs-white-bg.txt";
      fetch(listTexts)
        .then(response => response.text())
        .then(text => {
          const lines = text.split(/\r?\n/);
          const addonId = sbar_url.split(",")[2];
          if (lines.includes(addonId)) {
            elem.className += " extension-icon-add-white";
          } else {
            elem.classList.remove("extension-icon-add-white");
          }
        })
        .catch(() => {
          // Silently fail if the whitelist file doesn't exist
        });
    }

    if (!sbar_url.startsWith("extension")) {
      elem.classList.remove("extension-icon");
      elem.classList.remove("extension-icon-add-white");
    }
  },
  async getAdoonSidebarPage(addonId) {
    const addonUUID = JSON.parse(
      Services.prefs.getStringPref("extensions.webextensions.uuids")
    );
    const manifestJSON = await (
      await fetch(`moz-extension://${addonUUID[addonId]}/manifest.json`)
    ).json();
    let toURL = manifestJSON.sidebar_action.default_panel;
    if (!toURL.startsWith("./")) {
      toURL = "./" + toURL;
    }
    return new URL(toURL, `moz-extension://${addonUUID[addonId]}/`).href;
  },

  addPanel(url, uc) {
    let parentWindow = Services.wm.getMostRecentWindow("navigator:browser");
    const updateNumberDate = new Date();
    const updateNumber = `w${updateNumberDate.getFullYear()}${updateNumberDate.getMonth()}${updateNumberDate.getDate()}${updateNumberDate.getHours()}${updateNumberDate.getMinutes()}${updateNumberDate.getSeconds()}`;
    const object = { new: true, id: updateNumber };
    if (url != "") {
      object.url = url;
    }
    if (uc != "") {
      object.userContext = uc;
    }
    if (
      parentWindow?.document.documentURI ==
      "chrome://midori/content/hiddenWindowMac.xhtml"
    ) {
      parentWindow = null;
    }
    if (parentWindow?.gDialogBox) {
      parentWindow.gDialogBox.open(
        "chrome://midori/content/preferences/dialogs/customURLs.xhtml",
        object
      );
    } else {
      Services.ww.openWindow(
        parentWindow,
        "chrome://midori/content/preferences/dialogs/customURLs.xhtml",
        "AddWebpanel",
        "chrome,titlebar,dialog,centerscreen,modal",
        object
      );
    }
  },
};
