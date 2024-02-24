/* eslint-disable no-undef */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const toolbarElem = window.MozXULElement.parseXULToFragment(
  `
    <toolbar id="statusBar" toolbarname="Status bar" customizable="true" style="border-top: 1px solid var(--chrome-content-separator-color)"
             class="browser-toolbar customization-target" mode="icons" context="toolbar-context-menu" accesskey="A">
             <hbox id="status-text" align="center" flex="1" class="statusbar-padding"/>
    </toolbar>
    `
);

//If the status bar is hidden, we need to add this CSS
const hideedStatusBar = `
    #statusBar {
        display: none;
    }
    :root[customizing] #statusBar {
        display: inherit !important;
    }
`;

const displayStatusbar = `
        background: none !important;
        border: none !important;
        box-shadow: none !important;
`;

document.getElementById("navigator-toolbox").appendChild(toolbarElem);
CustomizableUI.registerArea("statusBar", {
  type: CustomizableUI.TYPE_TOOLBAR,
  defaultPlacements: [
    "screenshot-button",
    "fullscreen-button",
  ],
});
CustomizableUI.registerToolbarNode(document.getElementById("statusBar"));

//move elem to bottom of window
document.body.appendChild(document.getElementById("statusBar"));

//menuitem for status bar
let contextMenu = document.createXULElement("menuitem");
contextMenu.setAttribute("data-l10n-id", "status-bar");
contextMenu.setAttribute("type", "checkbox");
contextMenu.id = "toggle_statusBar";
contextMenu.setAttribute(
  "checked",
  Services.prefs.getBoolPref("browser.display.statusbar")
);
contextMenu.setAttribute("oncommand", "changeStatusbarVisibility();");
document.getElementById("toolbarItemsMenuSeparator").after(contextMenu);

//observe menuitem
function changeStatusbarVisibility() {
  let checked =
    document.getElementById("toggle_statusBar").getAttribute("checked") ==
    "true";
  Services.prefs.setBoolPref("browser.display.statusbar", checked);
}

function showStatusbar() {
  let statuspanel_label = document.getElementById("statuspanel-label");
  document.getElementById("statusBarCSS")?.remove();
  document.getElementById("status-text").style.overflow = "hidden";
  document.getElementById("status-text").appendChild(statuspanel_label);
  statuspanel_label.setAttribute("style", displayStatusbar);
}

function hideStatusbar() {
  let statuspanel_label = document.getElementById("statuspanel-label");
  let Tag = document.createElement("style");
  Tag.setAttribute("id", "statusBarCSS");
  Tag.innerText = hideedStatusBar;
  document
    .getElementsByTagName("head")[0]
    .insertAdjacentElement("beforeend", Tag);
  document.getElementById("status-text").style.overflow = "";
  document.getElementById("statuspanel").appendChild(statuspanel_label);
  statuspanel_label.removeAttribute("style");
}

const toggleStatusBar = () => {
  const checked = Services.prefs.getBoolPref("browser.display.statusbar", false);
  const toggleElement = document.getElementById("toggle_statusBar");
  toggleElement.setAttribute("checked", String(checked));

  const showOrHide = checked ? showStatusbar : hideStatusbar;
  showOrHide();
};

const handlePrefChange = () => {
  const checked = Services.prefs.getBoolPref("browser.display.statusbar", false);
  const toggleElement = document.getElementById("toggle_statusBar");
  toggleElement.setAttribute("checked", String(checked));
  if (checked) {
    showStatusbar();
  } else {
    hideStatusbar();
  }
};

const observeStatusbar = () => {
  const statuspanel = document.getElementById("statuspanel");
  const statusText = document.getElementById("status-text");
  let observer;
  const onPrefChanged = () => {
    observer?.disconnect();
    statusText.style.visibility = "";
    if (Services.prefs.getBoolPref("browser.display.statusbar", false)) {
      observer = new MutationObserver((mutationsList, observer) => {
        if (statuspanel.getAttribute("inactive") === "true") {
          statusText.style.visibility = "hidden";
        } else {
          statusText.style.visibility = "";
        }
      });
      observer.observe(statuspanel, { attributes: true });
    }
  };
  Services.prefs.addObserver("browser.display.statusbar", onPrefChanged);
  onPrefChanged();
};

toggleStatusBar();
Services.prefs.addObserver("browser.display.statusbar", handlePrefChange);
observeStatusbar();
