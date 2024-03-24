/* eslint-disable no-undef */
/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 import { tabStacksExternalFileService } from "resource:///modules/tabStacksExternalFileService.sys.mjs";

 export const EXPORTED_SYMBOLS = ["TabStacksToolbarService"];
 
 export const TabStacksToolbarService = {
     toolbarElement:
       `<toolbar id="tabStacksToolbar" toolbarname="tab stacks toolbar" customizable="true" style="border-top: 1px solid var(--chrome-content-separator-color)"
                class="browser-toolbar customization-target" mode="icons" context="toolbar-context-menu" accesskey="A">
                   <hbox id="tabStacksToolbarContent" align="center" flex="1" class="statusbar-padding"/>
 
                   <toolbarbutton id="tabStacksCreateNewTabStackButton" class="toolbarbutton-1 chromeclass-toolbar-additional" label="Create new tab stack" tooltiptext="Create new tab stack"
                   oncommand="gTabStack.createNoNameTabStack();" />
                   <toolbarbutton id="tabStacksManageTabStacksButton" class="toolbarbutton-1 chromeclass-toolbar-additional" label="Manage tab stacks" tooltiptext="Manage tab stacks"
                                  oncommand="tabStacksService.openTabStacksManager();" />
       </toolbar>`,
 
     injectionCSS: `
         .toolbar-items {
           display: flex;
           flex-direction: column;
         }
         #TabsToolbar-customization-target {
           width: 100% !important;
         }
         #tabStacksToolbar {
           width: 100% !important;
         }
         #tabStacksToolbarContent {
           background: inherit !important;
           height: var(--tab-min-height) !important;
           max-width: fit-content !important;
         }
         #tabStacksToolbar {
           background: inherit !important;
         }
         .tabStackButton label,
         .tabStackButton image {
           display: inherit !important;
           background-color: unset !important;
           color: var(--tab-text-color) !important;
         }
         .tabStackButton[selected="true"] {
           background-color: var(--tab-selected-bgcolor, var(--toolbar-bgcolor));
           box-shadow: 0 0 4px rgba(0,0,0,.4);
         }
         .tabStackButton {
           list-style-image: url("chrome://branding/content/icon32.png");
           border-radius: var(--tab-border-radius);
           margin-right: 5px !important;
         }
         #tabStacksCreateNewTabStackButton {
           list-style-image: url(chrome://global/skin/icons/plus.svg);
         }
         #tabStacksManageTabStacksButton {
           list-style-image: url("chrome://browser/skin/settings.svg");
         }
      `,
      
      tabStackBlockElement(tabStackId, tabStackName, selected) {
         return `<toolbarbutton id="tabStack-${tabStackId}" context="tabStacksToolbarItemContextMenu"
                                class="toolbarbutton-1 chromeclass-toolbar-additional tabStackButton"
                                label="${tabStackName}" tooltiptext="TabStack ${tabStackName}"
                                ${selected ? "selected=\"true\"" : ""}
                                oncommand="gTabStack.functions.changeTabStack('${tabStackId}');" />
                `
      },
 
      async getAllTabStacksBlockElements(windowId) {
        let tabStacksData = await tabStacksExternalFileService.getWindowTabStacksDataWithoutPreferences(windowId);
         let selectedTabStackId = await tabStacksExternalFileService.getSelectedTabStackId(windowId);
 
         let tabStackBlockElements = [];
         for (let tabStackId in tabStacksData) {
             let tabStack = tabStacksData[tabStackId];
             let selected = tabStackId == selectedTabStackId;
            tabStackBlockElements.push(this.tabStackBlockElement(tabStackId, tabStack.name, selected));
         }
         return tabStackBlockElements;
      }
 }
