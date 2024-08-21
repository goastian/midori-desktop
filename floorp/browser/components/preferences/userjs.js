/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { UserjsUtilsFunctions } = ChromeUtils.importESModule(
  "resource://floorp/UserjsUtils.sys.mjs"
);
var { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);

const l10n = new Localization(["browser/floorp.ftl"], true);

// eslint-disable-next-line no-undef
ChromeUtils.defineLazyGetter(this, "L10n", () => {
  return new Localization(["branding/brand.ftl", "browser/floorp"]);
});

const gUserjsPane = {
  _pane: null,
  init() {
    this._pane = document.getElementById("paneUserjs");
    document
      .getElementById("backtogeneral___")
      .addEventListener("command", () => {
        // eslint-disable-next-line no-undef
        gotoPref("general");
      });

    const needreboot = document.getElementsByClassName("needreboot");
    for (let i = 0; i < needreboot.length; i++) {
      if (needreboot[i].getAttribute("rebootELIsSet") == "true") {
        continue;
      }
      needreboot[i].setAttribute("rebootELIsSet", "true");
      needreboot[i].addEventListener("click", () => {
        if (!Services.prefs.getBoolPref("floorp.enable.auto.restart", false)) {
          (async () => {
            // eslint-disable-next-line no-undef
            const userConfirm = await confirmRestartPrompt(null);
            // eslint-disable-next-line no-undef
            if (userConfirm == CONFIRM_RESTART_PROMPT_RESTART_NOW) {
              Services.startup.quit(
                Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart
              );
            }
          })();
        } else {
          window.setTimeout(() => {
            Services.startup.quit(
              Services.startup.eAttemptQuit | Services.startup.eRestart
            );
          }, 500);
        }
      });
    }

    const buttons = document.getElementsByClassName("apply-userjs-button");
    for (const button of buttons) {
      button.addEventListener("click", async event => {
        const url = event.target.getAttribute("data-url");
        const id = event.target.getAttribute("id");
        const prompts = Services.prompt;
        const check = { value: false };
        const flags =
          prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_OK +
          prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_CANCEL;
        const result = prompts.confirmEx(
          null,
          l10n.formatValueSync("userjs-prompt"),
          `${l10n.formatValueSync(
            "apply-userjs-attention"
          )}\n${l10n.formatValueSync("apply-userjs-attention2")}`,
          flags,
          "",
          null,
          "",
          null,
          check
        );
        if (result == 0) {
          if (!url) {
            await UserjsUtilsFunctions.resetPreferencesWithUserJsContents();
            window.setTimeout(async () => {
              try {
                const PROFILE_DIR = Services.dirsvc.get(
                  "ProfD",
                  Ci.nsIFile
                ).path;
                const path = PathUtils.join(PROFILE_DIR, "user.js");
                IOUtils.remove(path);
              } catch (e) {}
              Services.prefs.clearUserPref("floorp.user.js.customize");
              Services.startup.quit(
                Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart
              );
            }, 3000);
          } else {
            await UserjsUtilsFunctions.resetPreferencesWithUserJsContents();
            window.setTimeout(async () => {
              await UserjsUtilsFunctions.setUserJSWithURL(url);
              Services.prefs.setStringPref("floorp.user.js.customize", id);
            }, 3000);
          }
        }
      });
    }
  },
};
