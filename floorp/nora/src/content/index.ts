/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { CustomShortcutKey } from "../components/custom-shortcut-key";
import { initBrowserContextMenu } from "./context-menu";
import { initDownloadbar } from "./downloadbar";
import { initPrivateContainer } from "./private-container";
import { initProfileManager } from "./profile-manager";
import { initReverseSidebarPosition } from "./reverse-sidebar-position";
import { initShareMode } from "./share-mode";
import { initStatusbar } from "./statusbar";
import { initUndoClosedTab } from "./undo-closed-tab";
CustomShortcutKey.getInstance();

window.SessionStore.promiseInitialized.then(() => {
  initBrowserContextMenu();
  initPrivateContainer();
  initShareMode();
  initStatusbar();
  initDownloadbar();
  initReverseSidebarPosition();
  initUndoClosedTab();
  initProfileManager();
});
