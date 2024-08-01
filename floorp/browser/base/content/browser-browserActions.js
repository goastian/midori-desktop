/* eslint-disable no-undef */
/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { CustomizableUI } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableUI.sys.mjs"
);
const { SessionStore } = ChromeUtils.import(
  "resource:///modules/sessionstore/SessionStore.jsm"
);

async function UCTFirst() {
  const widgetId = "undo-closed-tab";
  const widget = CustomizableUI.getWidget(widgetId);
  if (widget && widget.type != "custom") {
    return;
  }
  const l10n = new Localization(["browser/floorp.ftl"]);
  const l10nText =
    (await l10n.formatValue("undo-closed-tab")) ?? "Undo close tab";
  CustomizableUI.createWidget({
    id: widgetId,
    type: "button",
    label: l10nText,
    tooltiptext: l10nText,
    onCreated(aNode) {
      const fragment = window.MozXULElement.parseXULToFragment(
        `<stack xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul" class="toolbarbutton-badge-stack"><image class="toolbarbutton-icon" label="閉じたタブを開く"/><html:label xmlns:html="http://www.w3.org/1999/xhtml" class="toolbarbutton-badge" ></html:label></stack>`
      );
      aNode.appendChild(fragment);
    },
    onCommand() {
      undoCloseTab();
    },
  });
  if (
    ChromeUtils.importESModule("resource:///modules/FloorpStartup.sys.mjs")
    .isFirstRun
  ) {
    CustomizableUI.addWidgetToArea(widgetId, CustomizableUI.AREA_NAVBAR, -1);
  }
}

UCTFirst();

async function switchSidebarPositionButton() {
  const widgetId = "sidebar-reverse-position-toolbar";
  const widget = CustomizableUI.getWidget(widgetId);
  if (widget && widget.type !== "custom") {
    return;
  }
  const l10n = new Localization(["browser/floorp.ftl"]);
  const l10nText = await l10n.formatValue("sidebar-reverse-position-toolbar");
  CustomizableUI.createWidget({
    id: widgetId,
    type: "button",
    label: l10nText,
    tooltiptext: l10nText,
    onCreated(aNode) {
      const fragment = window.MozXULElement.parseXULToFragment(
        `<stack xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul" class="toolbarbutton-badge-stack"><image class="toolbarbutton-icon" label="閉じたタブを開く"/><html:label xmlns:html="http://www.w3.org/1999/xhtml" class="toolbarbutton-badge" ></html:label></stack>`
      );
      aNode.appendChild(fragment);
    },
    onCommand() {
      SidebarUI.reversePosition();
    },
  });
  if (
    ChromeUtils.importESModule("resource:///modules/FloorpStartup.sys.mjs")
    .isFirstRun
  ) {
    CustomizableUI.addWidgetToArea(
      "sidebar-button",
      CustomizableUI.AREA_NAVBAR,
      3
    );
    CustomizableUI.addWidgetToArea("sidebar-reverse-position-toolbar", CustomizableUI.AREA_NAVBAR, 4);
  }
}

switchSidebarPositionButton();

async function profileManager() {
  const widgetId = "profile-manager";
  const widget = CustomizableUI.getWidget(widgetId);
  if (widget && widget.type !== "custom") {
    return;
  }
  const l10n = new Localization(["browser/floorp.ftl"]);
  const l10nText = await l10n.formatValue("floorp-profile-manager");
  CustomizableUI.createWidget({
    id: widgetId,
    type: "button",
    label: l10nText,
    tooltiptext: l10nText,
    onCreated(aNode) {
      aNode.setAttribute("type", "menu");
      const popup = window.MozXULElement.parseXULToFragment(`
        <menupopup id="profile-manager-popup" position="after_start" style="--panel-padding: 0 !important;">
          <browser id="profile-switcher-browser" src="chrome://browser/content/profile-manager/profile-switcher.xhtml" flex="1" type="content" disablehistory="true" disableglobalhistory="true" context="profile-popup-contextmenu" />
        </menupopup>
      `);
      aNode.style = "--panel-padding: 0 !important;";
      aNode.appendChild(popup);
    },
    onCommand() {
      const popup = document.getElementById("profile-manager-popup");
      popup.openPopup(
        document.getElementById("profile-manager-popup"),
        "after_start",
        0,
        0,
        false,
        false
      );
    },
  });
}

if (
  Services.prefs.getBoolPref("floorp.browser.profile-manager.enabled", false)
) {
  profileManager();
}

async function workspacesToolbarButton() {
  let { WorkspacesElementService } = ChromeUtils.importESModule(
    "resource:///modules/WorkspacesElementService.sys.mjs"
  );

  const widgetId = "workspaces-toolbar-button";
  const widget = CustomizableUI.getWidget(widgetId);
  if (widget && widget.type !== "custom") {
    return;
  }
  const l10n = new Localization(["browser/floorp.ftl", "branding/brand.ftl"]);
  const l10nText = await l10n.formatValue("workspaces-toolbar-button");
  CustomizableUI.createWidget({
    id: widgetId,
    type: "button",
    label: l10nText,
    tooltiptext: l10nText,
    overflows: false,
    removable: true,
    onCreated(aNode) {
      aNode.setAttribute("type", "menu");
      const popup = window.MozXULElement.parseXULToFragment(
        WorkspacesElementService.panelElement
      );
      aNode.appendChild(popup);
    },
    onCommand() {
      let currentWindow = Services.wm.getMostRecentWindow("navigator:browser");
      const panel = currentWindow.document.getElementById(
        "workspacesToolbarButtonPanel"
      );
      panel.openPopup(
        document.getElementById("workspaces-toolbar-button"),
        "bottomright topright",
        0,
        0,
        false,
        false
      );
    },
  });
  if (
    ChromeUtils.importESModule("resource:///modules/FloorpStartup.sys.mjs")
      .isFirstRun
  ) {
    CustomizableUI.addWidgetToArea(widgetId, CustomizableUI.AREA_TABSTRIP);
    CustomizableUI.moveWidgetWithinArea(widgetId, -1);
  }
}
