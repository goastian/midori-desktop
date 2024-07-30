# -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

<script type="text/javascript">
// This ESM has build configuration constants.
var { FloorpAppConstants } = ChromeUtils.importESModule(
  "resource://floorp/FloorpAppConstants.sys.mjs"
);

import("chrome://nora/content/content.js");

import("chrome://floorp/content/browser-ua-data.mjs");
import("chrome://floorp/content/browser-overrides.mjs");
import("chrome://floorp/content/browser-commands.mjs").then(
  ({ gFloorpCommands }) => {
    window.gFloorpCommands = gFloorpCommands;
  }
);

import("chrome://floorp/content/browser-bms-window.mjs").then(
  ({ gBmsWindow }) => {
    window.gBmsWindow = gBmsWindow;
  }
);

// This function is called when the floorp browser window is loaded. needs Delay.
document.addEventListener(
  "DOMContentLoaded",
  () => {
    import("chrome://floorp/content/browser-context-menu.mjs").then(
      ({ gFloorpContextMenu }) => {
        window.gFloorpContextMenu = gFloorpContextMenu;
      }
    );
    import("chrome://floorp/content/browser-onlocation-change.mjs").then(
      ({ gFloorpOnLocationChange }) => {
        window.gFloorpOnLocationChange = gFloorpOnLocationChange;
      }
    );
    import("chrome://floorp/content/browser-floorp-pageActions.mjs").then(
      ({ gFloorpPageAction }) => {
        window.gFloorpPageAction = gFloorpPageAction;
      }
    );
    import("chrome://floorp/content/browser-manager-sidebar.mjs").then(
      ({ gBrowserManagerSidebar }) => {
        window.gBrowserManagerSidebar = gBrowserManagerSidebar;
      }
    );
    import("chrome://floorp/content/browser-preferences.mjs").then(
      ({ gFloorpPreferences }) => {
        window.gFloorpPreferences = gFloorpPreferences;
      }
    );
    import("chrome://floorp/content/browser-UI-custom.mjs").then(
      ({ gFloorpObservePreference }) => {
        window.gFloorpObservePreference = gFloorpObservePreference;
      }
    );
    import("chrome://floorp/content/browser-chromeCSS.mjs");

    import("chrome://floorp/content/browser-custom-keyboard-shortcut.mjs").then(
      ({
        gFloorpCustomShortcutKeys,
        gFloorpCustomActionFunctions,
        gFloorpCSKActionFunctions,
      }) => {
        window.gFloorpCustomShortcutKeys = gFloorpCustomShortcutKeys;
        window.gFloorpCustomActionFunctions = gFloorpCustomActionFunctions;
        window.gFloorpCSKActionFunctions = gFloorpCSKActionFunctions;
      }
    );
    import("chrome://floorp/content/browser-favicon-color.mjs").then(
      ({ gFloorpFaviconColor }) => {
        window.gFloorpFaviconColor = gFloorpFaviconColor;
      }
    );
    import("chrome://floorp/content/browser-splitView.mjs").then(
      ({ gSplitView }) => {
        window.gSplitView = gSplitView;
      }
    );

    // If script need more delay, use the following code.
    window.SessionStore.promiseInitialized.then(() => {
      import("chrome://floorp/content/browser-downloadbar.mjs").then(
        ({ gFloorpLegacyStyleDownloadBar }) => {
          window.gFloorpLegacyStyleDownloadBar = gFloorpLegacyStyleDownloadBar;
        }
      );
      import("chrome://floorp/content/browser-pinned-tabs-title.mjs").then(
        ({ gFloorpPinnedTabsTitle }) => {
          window.gFloorpPinnedTabsTitle = gFloorpPinnedTabsTitle;
        }
      );
      import("chrome://floorp/content/browser-ssb-support.mjs").then(
        ({ gSsbSupport }) => {
          window.gSsbSupport = gSsbSupport;
        }
      );
      import("chrome://floorp/content/browser-tabbar.mjs").then(
        ({ gFloorpTabBarStyle }) => {
          window.gFloorpTabBarStyle = gFloorpTabBarStyle;
        }
      );
      import("chrome://floorp/content/browser-design.mjs").then(
        ({ gFloorpDesign }) => {
          window.gFloorpDesign = gFloorpDesign;
        }
      );
      import("chrome://floorp/content/browser-verticaltabs.mjs").then(
        ({ gFloorpVerticalTabBar }) => {
          window.gFloorpVerticalTabBar = gFloorpVerticalTabBar;
        }
      );
      import("chrome://floorp/content/browser-flex-order.mjs").then(
        ({ gFloorpFlexOrder }) => {
          window.gFloorpFlexOrder = gFloorpFlexOrder;
        }
      );

      import("chrome://floorp/content/browser-UI-customizing-menu.mjs").then(
        ({ gFloorpCustomizeMode }) => {
          window.gFloorpCustomizeMode = gFloorpCustomizeMode;
        }
      );
      import("chrome://floorp/content/browser-workspaces.mjs").then(
        ({ gWorkspaces }) => {
          window.gWorkspaces = gWorkspaces;
        }
      );
    });
  },
  { once: true }
);
</script>
