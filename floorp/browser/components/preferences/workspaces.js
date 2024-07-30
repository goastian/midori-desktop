/* eslint-disable no-undef */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from preferences.js */

var { workspacesPreferences } = ChromeUtils.importESModule(
  "resource://floorp/WorkspacesService.mjs",
);

XPCOMUtils.defineLazyGetter(this, "L10n", () => {
  return new Localization(["branding/brand.ftl", "browser/floorp"]);
});

Preferences.addAll([
  {
    id: workspacesPreferences.WORKSPACES_CLOSE_POPUP_AFTER_CLICK_PREF,
    type: "bool",
  },
  { id: workspacesPreferences.WORKSPACES_MANAGE_ON_BMS_PREF, type: "bool" },
  {
    id: workspacesPreferences.WORKSPACE_SHOW_WORKSPACE_NAME_PREF,
    type: "bool",
  },
  {
    id: workspacesPreferences.WORKSPACES_ENABLED_PREF,
    type: "bool",
  },
]);

const gWorkspacesPane = {
  _pane: null,
  init() {
    this._pane = document.getElementById("paneWorkspaces");

    const needreboot = document.getElementsByClassName("needreboot");
    for (let i = 0; i < needreboot.length; i++) {
      if (needreboot[i].getAttribute("rebootELIsSet") == "true") {
        continue;
      }
      needreboot[i].setAttribute("rebootELIsSet", "true");
      needreboot[i].addEventListener("click", function () {
        if (!Services.prefs.getBoolPref("floorp.enable.auto.restart", false)) {
          (async () => {
            let userConfirm = await confirmRestartPrompt(null);
            if (userConfirm == CONFIRM_RESTART_PROMPT_RESTART_NOW) {
              Services.startup.quit(
                Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart,
              );
            }
          })();
        } else {
          window.setTimeout(function () {
            Services.startup.quit(
              Services.startup.eAttemptQuit | Services.startup.eRestart,
            );
          }, 500);
        }
      });
    }
  },
};
