/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { z } from "zod";

export const csk_category = [
  "tab-action",
  "history-action",
  "page-action",
  "visible-action",
  "search-action",
  "tools-action",
  "pip-action",
  "bookmark-action",
  "open-page-action",
  "sidebar-action",
  "workspaces-action",
  "bms-action",
  "custom-action",
  "downloads-action",
  "split-view-action",
] as const;

const zCommands = z.record(
  z.union([z.string().startsWith("gecko-"), z.string().startsWith("floorp-")]),
  z.object({ command: z.function(), type: z.enum(csk_category) }),
);

type Commands = z.infer<typeof zCommands>;

export const commands: Commands = {
  "gecko-open-new-tab": {
    command: () => document.getElementById("cmd_newNavigatorTab")?.doCommand(),
    type: "tab-action",
  },
  "gecko-close-tab": {
    command: () => document.getElementById("cmd_close")?.doCommand(),
    type: "tab-action",
  },
  "gecko-open-new-window": {
    command: () => document.getElementById("cmd_newNavigator")?.doCommand(),
    type: "tab-action",
  },
  "gecko-open-new-private-window": {
    command: () => OpenBrowserWindow({ private: true }),
    type: "tab-action",
  },
  "gecko-close-window": {
    command: () => document.getElementById("cmd_closeWindow")?.doCommand(),
    type: "tab-action",
  },
  "gecko-restore-last-session": {
    command: () => SessionStore.restoreLastSession(),
    type: "history-action",
  },
  "gecko-restore-last-window": {
    command: () => undoCloseWindow("0"),
    type: "tab-action",
  },
  "gecko-show-next-tab": {
    command: () => gBrowser.tabContainer.advanceSelectedTab(1, true),
    type: "tab-action",
  },
  "gecko-show-previous-tab": {
    command: () => gBrowser.tabContainer.advanceSelectedTab(-1, true),
    type: "tab-action",
  },
  "gecko-show-all-tabs-panel": {
    command: () => gTabsPanel.showAllTabsPanel(),
    type: "tab-action",
  },
  "gecko-send-with-mail": {
    command: () =>
      MailIntegration.sendLinkForBrowser(gBrowser.selectedBrowser),
    type: "page-action",
  },
  "gecko-save-page": {
    command: () => saveBrowser(gBrowser.selectedBrowser),
    type: "page-action",
  },
  "gecko-print-page": {
    command: () =>
      PrintUtils.startPrintWindow(
        gBrowser.selectedBrowser.browsingContext,
      ),
    type: "page-action",
  },
  "gecko-mute-current-tab": {
    command: () =>
      gBrowser.toggleMuteAudioOnMultiSelectedTabs(gBrowser.selectedTab),
    type: "page-action",
  },
  "gecko-show-source-of-page": {
    command: () => BrowserCommands.viewSource(window.gBrowser.selectedBrowser),
    type: "page-action",
  },
  "gecko-show-page-info": {
    command: (event: Event) => gIdentityHandler.handleMoreInfoClick(event),
    type: "page-action",
  },
  "floorp-rest-mode": {
    command: () => gFloorpCommands.enableRestMode(),
    type: "page-action",
  },
  "gecko-zoom-in": {
    command: () => FullZoom.enlarge(),
    type: "visible-action",
  },
  "gecko-zoom-out": {
    command: () => FullZoom.reduce(),
    type: "visible-action",
  },
  "gecko-reset-zoom": {
    command: () => FullZoom.reset(),
    type: "visible-action",
  },
  "floorp-hide-user-interface": {
    command: () => gFloorpDesign.hideUserInterface(),
    type: "visible-action",
  },
  "floorp-toggle-navigation-panel": {
    command: () => gFloorpDesign.toggleNavigationPanel(),
    type: "visible-action",
  },
  "gecko-back": {
    command: () => document.getElementById("Browser:Back")?.doCommand(),
    type: "history-action"
  },
  "gecko-forward": {
    command: () => document.getElementById("Browser:Forward")?.doCommand(),
    type: "history-action",
  },
  "gecko-stop": {
    command: () => document.getElementById("Browser:stop")?.doCommand(),
    type: "history-action"
  },
  "gecko-reload": {
    command: () => document.getElementById("Browser:Reload")?.doCommand(),
    type: "history-action",
  },
  "gecko-force-reload": {
    command: () => document.getElementById("Browser:ReloadSkipCache")?.doCommand(),
    type: "history-action",
  },
  "gecko-search-in-this-page": {
    command: () => gLazyFindCommand("onFindCommand"),
    type: "search-action",
  },
  "gecko-show-next-search-result": {
    command: () => gLazyFindCommand("onFindAgainCommand", false),
    type: "search-action",
  },
  "gecko-show-previous-search-result": {
    command: () => gLazyFindCommand("onFindAgainCommand", true),
    type: "search-action",
  },
  "gecko-search-the-web": {
    command: () => BrowserSearch.webSearch(),
    type: "search-action",
  },
  "gecko-open-migration-wizard": {
    command: () =>
      MigrationUtils.showMigrationWizard(window, {
        entrypoint: window.MigrationUtils.MIGRATION_ENTRYPOINTS.FILE_MENU,
      }),
    type: "tools-action",
  },
  "gecko-quit-from-application": {
    command: () => Services.startup.quit(Ci.nsIAppStartup.eForceQuit),
    type: "tools-action",
  },
  "gecko-enter-into-customize-mode": {
    command: () => gCustomizeMode.enter(),
    type: "tools-action",
  },
  "gecko-enter-into-offline-mode": {
    command: () => BrowserOffline.toggleOfflineStatus(),
    type: "tools-action",
  },
  "gecko-gecko-open-screen-capture": {
    command: () =>  ScreenshotsUtils.start(gBrowser.selectedBrowser) ,
    type: "tools-action",
  },
  "floorp-show-pip": {
    command: (event: Event) =>
      gFloorpCSKActionFunctions.PictureInPicture.togglePictureInPicture(
        event,
      ),
    type: "pip-action",
  },
  "gecko-bookmark-this-page": {
    command: (event: Event) =>
      BrowserPageActions.doCommandForAction(
        window.PageActions.actionForID("bookmark"),
        event,
        this,
      ),
    type: "bookmark-action",
  },
  "gecko-open-bookmark-add-tool": {
    command: () =>
      PlacesUIUtils.showBookmarkPagesDialog(
        window.PlacesCommandHook.uniqueCurrentPages,
      ),
    type: "bookmark-action",
  },
  "gecko-open-bookmarks-manager": {
    command: () => SidebarController.show('viewBookmarksSidebar'),
    type: "bookmark-action",
  },
  "gecko-toggle-bookmark-toolbar": {
    command: () =>
      BookmarkingUI.toggleBookmarksToolbar("bookmark-tools"),
    type: "bookmark-action",
  },
  "gecko-open-general-preferences": {
    command: () => openPreferences(),
    type: "open-page-action",
  },
  "gecko-open-privacy-preferences": {
    command: () => openPreferences("panePrivacy"),
    type: "open-page-action",
  },
  "gecko-open-workspaces-preferences": {
    command: () => openPreferences("paneWorkspaces"),
    type: "open-page-action",
  },
  "gecko-open-containers-preferences": {
    command: () => openPreferences("paneContainers"),
    type: "open-page-action",
  },
  "gecko-open-search-preferences": {
    command: () => openPreferences("paneSearch"),
    type: "open-page-action",
  },
  "gecko-open-sync-preferences": {
    command: () => openPreferences("paneSync"),
    type: "open-page-action",
  },
  "gecko-open-task-manager": {
    command: () => switchToTabHavingURI("about:processes", true),
    type: "open-page-action",
  },
  "gecko-open-addons-manager": {
    command: () => document.getElementById("Tools:Addons")?.doCommand(),
    type: "open-page-action",
  },
  "gecko-open-home-page": {
    command: () => switchToTabHavingURI("about:home", true),
    type: "open-page-action",
  },
  "gecko-forget-history": {
    command: () => Sanitizer.showUI(window),
    type: "history-action",
  },
  "gecko-quick-forget-history": {
    command: () => PlacesUtils.history.clear(true),
    type: "history-action",
  },
  "gecko-clear-recent-history": {
    command: () => document.getElementById("cmd_closeWindow")?.doCommand(),
    type: "history-action",
  },
  "gecko-search-history": {
    command: () => PlacesCommandHook.searchHistory(),
    type: "history-action",
  },
  "gecko-manage-history": {
    command: () => PlacesCommandHook.showPlacesOrganizer("History"),
    type: "history-action",
  },
  "gecko-open-downloads": {
    command: () => DownloadsPanel.showDownloadsHistory(),
    type: "downloads-action",
  },
  "gecko-show-bookmark-sidebar": {
    command: () => SidebarUI.show("viewBookmarksSidebar"),
    type: "sidebar-action",
  },
  "gecko-show-history-sidebar": {
    command: () => SidebarController.show("viewHistorySidebar"),
    type: "sidebar-action",
  },
  "gecko-show-synced-tabs-sidebar": {
    command: () => SidebarController.show("viewTabsSidebar"),
    type: "sidebar-SidebarController",
  },
  "gecko-reverse-sidebar": {
    command: () => SidebarController.reversePosition(),
    type: "sidebar-action",
  },
  "gecko-hide-sidebar": {
    command: () => SidebarController.hide(),
    type: "sidebar-action",
  },
  "gecko-toggle-sidebar": {
    command: () => SidebarController.toggle(),
    type: "sidebar-action",
  },
  "floorp-open-previous-workspace": {
    command: () => gWorkspaces.changeWorkspaceToNextOrBeforeWorkspace(),
    type: "workspaces-action",
  },
  "floorp-open-next-workspace": {
    command: () =>
      gWorkspaces.changeWorkspaceToNextOrBeforeWorkspace(true),
    type: "workspaces-action",
  },
  "floorp-show-bsm": {
    command: () =>
      gBrowserManagerSidebar.controllFunctions.toggleBMSShortcut(),
    type: "bms-action",
  },
  "floorp-show-panel-1": {
    command: () => gBrowserManagerSidebar.contextMenu.showWithNumber(0),
    type: "bms-action",
  },
  "floorp-show-panel-2": {
    command: () => gBrowserManagerSidebar.contextMenu.showWithNumber(1),
    type: "bms-action",
  },
  "floorp-show-panel-3": {
    command: () => gBrowserManagerSidebar.contextMenu.showWithNumber(2),
    type: "bms-action",
  },
  "floorp-show-panel-4": {
    command: () => gBrowserManagerSidebar.contextMenu.showWithNumber(3),
    type: "bms-action",
  },
  "floorp-show-panel-5": {
    command: () => gBrowserManagerSidebar.contextMenu.showWithNumber(4),
    type: "bms-action",
  },
  "floorp-show-panel-6": {
    command: () => gBrowserManagerSidebar.contextMenu.showWithNumber(5),
    type: "bms-action",
  },
  "floorp-show-panel-7": {
    command: () => gBrowserManagerSidebar.contextMenu.showWithNumber(6),
    type: "bms-action",
  },
  "floorp-show-panel-8": {
    command: () => gBrowserManagerSidebar.contextMenu.showWithNumber(7),
    type: "bms-action",
  },
  "floorp-show-panel-9": {
    command: () => gBrowserManagerSidebar.contextMenu.showWithNumber(8),
    type: "bms-action",
  },
  "floorp-show-panel-10": {
    command: () => gBrowserManagerSidebar.contextMenu.showWithNumber(9),
    type: "bms-action",
  },
  "floorp-open-split-view-on-left": {
    command: () =>
      gSplitView.splitFromCsk(),
    type: "split-view-action",
  },
  "floorp-close-split-view": {
    command: () => gSplitView.resetSplitView(),
    type: "split-view-action",
  },
  "floorp-custom-action-1": {
    command: () =>
      gFloorpCustomActionFunctions.evalCustomeActionWithNum(1),
    type: "custom-action",
  },
  "floorp-custom-action-2": {
    command: () =>
      gFloorpCustomActionFunctions.evalCustomeActionWithNum(2),
    type: "custom-action",
  },
  "floorp-custom-action-3": {
    command: () =>
      gFloorpCustomActionFunctions.evalCustomeActionWithNum(3),
    type: "custom-action",
  },
  "floorp-custom-action-4": {
    command: () =>
      gFloorpCustomActionFunctions.evalCustomeActionWithNum(4),
    type: "custom-action",
  },
  "floorp-custom-action-5": {
    command: () =>
      gFloorpCustomActionFunctions.evalCustomeActionWithNum(5),
    type: "custom-action",
  },
};
