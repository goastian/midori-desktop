/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from /toolkit/content/preferencesBindings.js */
const { ContextualIdentityService } = ChromeUtils.importESModule(
  "resource://gre/modules/ContextualIdentityService.sys.mjs"
);
const { BrowserManagerSidebar } = ChromeUtils.importESModule(
  "chrome://floorp/content/modules/bms/BrowserManagerSidebar.mjs"
);
function setTitle() {
  const params = window.arguments[0] || {};
  const winElem = document.documentElement;
  if (params.new) {
    document.l10n.setAttributes(winElem, "bsb-add-title");
  } else {
    document.l10n.setAttributes(winElem, "bsb-setting-title");
  }
}

setTitle();
let bsbObject = {};
let panelId = "";
let newPanel = false;
let userContextId = -1;

function onLoad() {
  bsbObject = JSON.parse(
    // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
    Services.prefs.getStringPref(`floorp.browser.sidebar2.data`, undefined)
  );
  let params = {};
  if (window.arguments[0].id ?? false) {
    params = window.arguments[0];
  } else if (window.arguments[0].wrappedJSObject.id ?? false) {
    params = window.arguments[0].wrappedJSObject;
  }

  newPanel = params.new;
  panelId = params.id;
  userContextId = params.userContext ?? -1;

  if (!newPanel) {
    Services.obs.notifyObservers(
      { eventType: "mouseOver", id: `BSB-${panelId}` },
      "obs-panel-re"
    );
  }
  const panelUserAgent = newPanel
    ? false
    : bsbObject.data[panelId].userAgent ?? false;
  const panelWidth = newPanel ? 0 : bsbObject.data[panelId].width ?? 0;

  document.addEventListener("dialogaccept", setPref);

  for (const elem in BrowserManagerSidebar.STATIC_SIDEBAR_DATA) {
    const floorpWebpanelMenuitem = document.createXULElement("menuitem");
    floorpWebpanelMenuitem.setAttribute("flex", 1);
    floorpWebpanelMenuitem.setAttribute(
      "data-l10n-id",
      `bsb-${BrowserManagerSidebar.STATIC_SIDEBAR_DATA[elem].l10n}`
    );
    floorpWebpanelMenuitem.value = elem;
    document
      .querySelector("#pageSelect > menupopup")
      .appendChild(floorpWebpanelMenuitem);
  }

  const url = params.url ?? (newPanel ? "" : bsbObject.data[params.id].url);
  if (url in BrowserManagerSidebar.STATIC_SIDEBAR_DATA) {
    document.querySelector("#pageSelect").value = url;
  } else if (url.startsWith("extension,")) {
    const haveSidebarPanelExtensionsObjPref =
      "floorp.extensions.webextensions.sidebar-action";
    const extensionObj = JSON.parse(
      Services.prefs.getStringPref(haveSidebarPanelExtensionsObjPref)
    );
    document.querySelector("#pageSelect").value = url;
    document
      .querySelector("#pageSelect")
      .setAttribute("label", extensionObj.data[url.split(",")[2]].title);
  } else {
    document.querySelector(".URLBox").value = url;
  }

  setTimeout(() => setBox(userContextId), 500);

  document.querySelector("#userAgentCheck").checked = panelUserAgent;
  document.querySelector("#widthBox").value = panelWidth;

  const container_list = document.querySelector("#userContextPopup");
  let menuitem = document.createXULElement("menuitem");
  menuitem.value = 0;
  menuitem.setAttribute("flex", 1);
  menuitem.setAttribute("data-l10n-id", "floorp-no-workspace-container");
  container_list.appendChild(menuitem);

  for (const elem of ContextualIdentityService.getPublicIdentities()) {
    menuitem = document.createXULElement("menuitem");
    menuitem.value = elem.userContextId;
    menuitem.setAttribute("flex", 1);
    const containerName = ContextualIdentityService.getUserContextLabel(
      elem.userContextId
    );
    menuitem.setAttribute("label", containerName);
    container_list.appendChild(menuitem);
  }

  if (userContextId != -1) {
    document.querySelector("#userContext").value = userContextId;
  }

  // Sidebar panel extensions
  const { AddonManager } = ChromeUtils.importESModule(
    "resource://gre/modules/AddonManager.sys.mjs"
  );
  const haveSidebarPanelExtensionsObjPref =
    "floorp.extensions.webextensions.sidebar-action";
  const extensionObj = JSON.parse(
    Services.prefs.getStringPref(haveSidebarPanelExtensionsObjPref)
  );
  const extensionIDs = Object.keys(extensionObj.data);

  for (const extensionID of extensionIDs) {
    AddonManager.getAddonByID(extensionID).then(addon => {
      if (addon && addon.isActive) {
        const menuitem = document.createXULElement("menuitem");
        menuitem.value = extensionID;
        menuitem.setAttribute("flex", 1);
        menuitem.setAttribute("label", extensionObj.data[addon.id].title);
        menuitem.setAttribute(
          "value",
          `extension,${extensionObj.data[addon.id].title},${extensionID},${
            extensionObj.data[addon.id].panel
          },${extensionObj.data[addon.id].icon}`
        );
        document.querySelector("#pageSelect > menupopup").appendChild(menuitem);
      }
    });
  }
}

function encodeObjectURL(text) {
  var remove_whitespace = /^\s+/;
  var box_value = text;
  box_value = box_value.replace(remove_whitespace, "");
  / * Removing whitespace from the beginning of a line * /;
  if (box_value == "") {
    /* empty */
  } else if (
    !box_value.startsWith("http://") &&
    !box_value.startsWith("https://")
  ) {
    / * Checks if url in the sidebar contains https in the beginning of a line * /;
    if (
      !box_value.startsWith("file://") &&
      !box_value.startsWith("resource://") &&
      !box_value.startsWith("about:") &&
      !box_value.startsWith("jar:") &&
      !box_value.startsWith("about:") &&
      !box_value.startsWith("chrome://") &&
      !box_value.startsWith("moz-extension://")
    ) {
      / * Checks if given URL is other protocol * /;
      box_value = `https://${box_value}`;
    }
  }
  return box_value;
}

function setPref() {
  const page = Number(document.querySelector("#pageSelect").value);
  const url = document.querySelector(".URLBox").value;
  const container = Number(document.querySelector("#userContext").value);
  const userAgent = document.querySelector("#userAgentCheck").checked;
  const width = Number(document.querySelector("#widthBox").value);

  const dataObject = {};
  if (page != 0) {
    dataObject.url = document.querySelector("#pageSelect").value;
  } else {
    if (url.length === 0) {
      return;
    }

    dataObject.url = encodeObjectURL(url);
    if (container != 0) {
      dataObject.usercontext = container;
    }
    if (userAgent != 0) {
      dataObject.userAgent = userAgent;
    }
  }
  if (width != 0) {
    dataObject.width = width;
  }

  bsbObject.data[panelId] = dataObject;
  if (newPanel) {
    bsbObject.index.push(panelId);
  }

  Services.prefs.setStringPref(
    "floorp.browser.sidebar2.data",
    JSON.stringify(bsbObject)
  );
}

function setBox(userContextId) {
  const style =
    document.querySelector("#pageSelect").value == 0 ? "" : "hidden";
  const elems = document.querySelectorAll(".invisible");
  for (const elem of elems) {
    elem.style.visibility = style;
  }

  document.querySelector("#userContext").value = userContextId;
}

function onunload() {
  if (!newPanel) {
    Services.obs.notifyObservers(
      { eventType: "mouseOut", id: `BSB-${panelId}` },
      "obs-panel-re"
    );
  }
}
