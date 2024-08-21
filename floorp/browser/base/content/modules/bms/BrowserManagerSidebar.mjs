/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const BrowserManagerSidebar = {
  STATIC_SIDEBAR_DATA: {
    "floorp//bmt": {
      url: "chrome://browser/content/places/places.xhtml",
      l10n: `browser-manager-sidebar`,
      defaultWidth: 600,
    },
    "floorp//bookmarks": {
      url: "chrome://browser/content/places/bookmarksSidebar.xhtml",
      l10n: `bookmark-sidebar`,
      defaultWidth: 415,
    },
    "floorp//history": {
      url: "chrome://browser/content/places/historySidebar.xhtml",
      l10n: `history-sidebar`,
      defaultWidth: 415,
    },
    "floorp//downloads": {
      url: "about:downloads",
      l10n: `download-sidebar`,
      defaultWidth: 415,
    },
    //notes is available in floorp for v11.0.0.
    "floorp//notes": {
      url: "chrome://floorp/content/notes/notes-bms.html",
      l10n: `notes-sidebar`,
      defaultWidth: 550,
      enabled: true,
    },
  },

  BrowserManagerSidebarXULElement: `
<vbox id="sidebar2-box" style="min-width: 25em; z-index: 1" class="browser-sidebar2 chromeclass-extrachrome">
  <box id="sidebar2-header" style="min-height: 2.5em" align="center">
    <toolbarbutton id="sidebar2-back" class="sidebar2-icon" style="margin-left: 0.5em;"
      data-l10n-id="sidebar-back-button" oncommand="gBrowserManagerSidebar.sidebarButtons(0);" />
    <toolbarbutton id="sidebar2-forward" class="sidebar2-icon" style="margin-left: 1em;"
      data-l10n-id="sidebar-forward-button" oncommand="gBrowserManagerSidebar.sidebarButtons(1);" />
    <toolbarbutton id="sidebar2-reload" class="sidebar2-icon" style="margin-left: 1em;"
      data-l10n-id="sidebar-reload-button" oncommand="gBrowserManagerSidebar.sidebarButtons(2);" />
    <toolbarbutton id="sidebar2-go-index" class="sidebar2-icon" style="margin-left: 1em;"
      data-l10n-id="sidebar-go-index-button" oncommand="gBrowserManagerSidebar.sidebarButtons(3);" />
    <spacer flex="1" />
    <toolbarbutton id="sidebar2-keeppanelwidth" context="width-size-context" class="sidebar2-icon"
      style="margin-right: 0.5em;" data-l10n-id="sidebar-keepWidth-button"
      oncommand="gBrowserManagerSidebar.keepWebPanelWidth();" />
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
     <toolbarbutton class="sidepanel-browser-icon" data-l10n-id="sidebar2-hide-sidebar"  oncommand="Services.prefs.setBoolPref('floorp.browser.sidebar.enable', false);" id="sidebar-hide-icon"/>
     <toolbarbutton class="sidepanel-browser-icon" data-l10n-id="sidebar-addons-button"  oncommand="BrowserAddonUI.openAddonsMgr('addons://list/extension');" id="addons-icon"/>
     <toolbarbutton class="sidepanel-browser-icon" data-l10n-id="sidebar-passwords-button"  oncommand="LoginHelper.openPasswordManager(window, { entryPoint: 'mainmenu' });" id="passwords-icon"/>
     <toolbarbutton class="sidepanel-browser-icon" data-l10n-id="sidebar-preferences-button"  oncommand="openPreferences();" id="preferences-icon"/>
   </vbox>
</vbox>
`,

  BrowserManagerSidebarToolbarContextMenuElement: `
<popupset>
  <menupopup id="webpanel-context" onpopupshowing="gBrowserManagerSidebar.contextMenu.show(event);">
    <menuitem id="unloadWebpanelMenu" class="needLoadedWebpanel" data-l10n-id="sidebar2-unload-panel"
      label="Unload this webpanel" accesskey="U" oncommand="gBrowserManagerSidebar.contextMenu.unloadWebpanel();" />
    <menuseparator class="context-webpanel-separator" />
    <menuitem id="muteMenu" class="needLoadedWebpanel" data-l10n-id="sidebar2-mute-and-unmute"
      label="Mute/Unmute this webpanel" accesskey="M" oncommand="gBrowserManagerSidebar.contextMenu.muteWebpanel();" />
    <menu id="changeZoomLevelMenu" class="needLoadedWebpanel needRunningExtensionsPanel" data-l10n-id="sidebar2-change-zoom-level" accesskey="Z">
      <menupopup id="changeZoomLevelPopup">
        <menuitem id="zoomInMenu" accesskey="I" data-l10n-id="sidebar2-zoom-in"
          oncommand="gBrowserManagerSidebar.contextMenu.zoomIn();" />
        <menuitem id="zoomOutMenu" accesskey="O" data-l10n-id="sidebar2-zoom-out"
          oncommand="gBrowserManagerSidebar.contextMenu.zoomOut();" />
        <menuitem id="resetZoomMenu" accesskey="R" data-l10n-id="sidebar2-reset-zoom"
          oncommand="gBrowserManagerSidebar.contextMenu.resetZoom();" />
      </menupopup>
    </menu>
    <menuitem id="changeUAWebpanelMenu" data-l10n-id="sidebar2-change-ua-panel"
      label="Switch User agent to Mobile/Desktop Version at this Webpanel" accesskey="R"
      oncommand="gBrowserManagerSidebar.contextMenu.changeUserAgent();" />
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

  <menupopup id="width-size-context">
    <menuitem id="setWidthMenu" data-l10n-id="sidebar2-keep-width-for-global" label="Set width for All Panel"
      accesskey="S" oncommand="gBrowserManagerSidebar.keepWidthToGlobalValue();" />
  </menupopup>
</popupset>
`,

  DEFAULT_WEBPANEL: [
    "https://translate.google.com",
    "https://support.ablaze.one",
    "https://docs.floorp.app",
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
        "floorp.browser.sidebar2.data",
        JSON.stringify(defaultPref)
      );

    if (Services.prefs.prefHasUserValue("floorp.browser.sidebar2.data")) {
      const prefTemp = JSON.parse(
        Services.prefs.getStringPref("floorp.browser.sidebar2.data")
      );
      const setPref = { data: {}, index: [] };
      for (const elem of prefTemp.index) {
        setPref.data[elem] = prefTemp.data[elem];
        setPref.index.push(elem);
      }
      Services.prefs.setStringPref(
        "floorp.browser.sidebar2.data",
        JSON.stringify(setPref)
      );
    }
  },

  getFavicon(sbar_url, elem) {
    try {
      new URL(sbar_url);
    } catch (e) {
      elem.style.removeProperty("--BMSIcon");
    }

    if (sbar_url.startsWith("http://") || sbar_url.startsWith("https://")) {
      const iconProvider = Services.prefs.getStringPref(
        "floorp.browser.sidebar.useIconProvider",
        null
      );
      let icon_url;
      switch (iconProvider) {
        case "google":
          icon_url = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
            sbar_url
          )}`;
          break;
        case "duckduckgo":
          icon_url = `https://external-content.duckduckgo.com/ip3/${
            new URL(sbar_url).hostname
          }.ico`;
          break;
        case "yandex":
          icon_url = `https://favicon.yandex.net/favicon/v2/${
            new URL(sbar_url).origin
          }`;
          break;
        case "hatena":
          icon_url = `https://cdn-ak.favicon.st-hatena.com/?url=${encodeURIComponent(
            sbar_url
          )}`; // or `https://favicon.hatena.ne.jp/?url=${encodeURIComponent(sbar_url)}`
          break;
        default:
          icon_url = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(
            sbar_url
          )}`;
          break;
      }

      fetch(icon_url)
        .then(async response => {
          if (response.status !== 200) {
            throw new Error(`${response.status} ${response.statusText}`);
          }

          const reader = new FileReader();

          const blob_data = await response.blob();

          const icon_data_url = await new Promise(resolve => {
            reader.addEventListener("load", function () {
              resolve(this.result);
            });
            reader.readAsDataURL(blob_data);
          });

          if (
            icon_data_url ===
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWIAAYAAAwAABQABggWTzwAAAABJRU5ErkJggg=="
          ) {
            // Yandex will return a 1px size icon with status code 200 if the icon is not available. If it matches a specific Data URL, it will be considered as a failure to acquire, and this process will be aborted.
            throw new Error("Yandex returns 404. (1px size icon)");
          }
          if (elem.style.getPropertyValue("--BMSIcon") != icon_data_url) {
            elem.style.setProperty("--BMSIcon", `url(${icon_data_url})`);
          }
        })
        .catch(reject => {
          const sbar_origin = new URL(sbar_url).origin;
          const iconExtensions = ["ico", "png", "jpg", "jpeg"];

          const fetchIcon = async extension => {
            const iconUrl = `${sbar_origin}/favicon.${extension}`;
            const response = await fetch(iconUrl);
            if (
              response.ok &&
              elem.style.getPropertyValue("--BMSIcon") != iconUrl
            ) {
              elem.style.setProperty("--BMSIcon", `url(${iconUrl})`);
              return true;
            }
            return false;
          };

          const fetchIcons = iconExtensions.map(fetchIcon);

          Promise.allSettled(fetchIcons).then(results => {
            const iconFound = results.some(
              result => result.status === "fulfilled" && result.value
            );
            if (!iconFound) {
              elem.style.removeProperty("--BMSIcon");
            }
          });
        });
    } else if (sbar_url.startsWith("file://")) {
      elem.style.setProperty("--BMSIcon", `url(moz-icon:${sbar_url}?size=128)`);
    } else if (sbar_url.startsWith("extension")) {
      const iconURL = sbar_url.split(",")[4];
      elem.style.setProperty("--BMSIcon", `url(${iconURL})`);
      elem.className += " extension-icon";
      const listTexts =
        "chrome://floorp/content/BMS-extension-needs-white-bg.txt";
      fetch(listTexts)
        .then(response => {
          return response.text();
        })
        .then(text => {
          const lines = text.split(/\r?\n/);
          for (const line of lines) {
            if (line == sbar_url.split(",")[2]) {
              elem.className += " extension-icon-add-white";
              break;
            } else {
              elem.classList.remove("extension-icon-add-white");
            }
          }
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
      "chrome://floorp/content/hiddenWindowMac.xhtml"
    ) {
      parentWindow = null;
    }
    if (parentWindow?.gDialogBox) {
      parentWindow.gDialogBox.open(
        "chrome://floorp/content/preferences/dialogs/customURLs.xhtml",
        object
      );
    } else {
      Services.ww.openWindow(
        parentWindow,
        "chrome://floorp/content/preferences/dialogs/customURLs.xhtml",
        "AddWebpanel",
        "chrome,titlebar,dialog,centerscreen,modal",
        object
      );
    }
  },
};
