/* eslint-disable no-undef */
/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const CustomKeyboardShortcutUtils = ChromeUtils.importESModule(
  "resource:///modules/CustomKeyboardShortcutUtils.sys.mjs",
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const keyboradShortcutConfig = JSON.parse(
  Services.prefs.getStringPref(
    CustomKeyboardShortcutUtils.SHORTCUT_KEY_AND_ACTION_PREF,
    "",
  ),
);

const buildShortCutkeyFunctions = {
  init() {
    let IsBMSWindow = window.location.toString().split("?")[1];
    if (IsBMSWindow) {
        return;
    }
    Services.prefs.clearUserPref(
      CustomKeyboardShortcutUtils.SHORTCUT_KEY_CHANGED_ARRAY_PREF,
    );

    if (
      Services.prefs.getBoolPref(
        CustomKeyboardShortcutUtils.SHORTCUT_KEY_DISABLE_FX_DEFAULT_SCKEY_PREF,
        false,
      )
    ) {
      window.SessionStore.promiseInitialized.then(() => {
        buildShortCutkeyFunctions.disableAllCustomKeyShortcut();
        console.info("Remove already exist shortcut keys");
      });
    }

    const keyboradShortcutConfig = JSON.parse(
      Services.prefs.getStringPref(
        CustomKeyboardShortcutUtils.SHORTCUT_KEY_AND_ACTION_PREF,
        "",
      ),
    );

    if (
      keyboradShortcutConfig.length === 0 &&
      CustomKeyboardShortcutUtils.SHORTCUT_KEY_AND_ACTION_ENABLED_PREF
    ) {
      return;
    }

    for (let shortcutObj of keyboradShortcutConfig) {
      let name = shortcutObj.actionName;
      let key = shortcutObj.key;
      let keyCode = shortcutObj.keyCode;
      let modifiers = shortcutObj.modifiers;

      if ((key && name) || (keyCode && name)) {
        buildShortCutkeyFunctions.buildShortCutkeyFunction(
          name,
          key,
          keyCode,
          modifiers,
        );
      } else {
        console.error("Invalid shortcut key config: " + shortcutObj);
      }
    }
  },

  buildShortCutkeyFunction(name, key, keyCode, modifiers) {
    let functionCode =
      CustomKeyboardShortcutUtils.keyboradShortcutActions[name][0];
    if (!functionCode) {
      // Remove invalid shortcut key config.
      CustomKeyboardShortcutUtils.removeKeyboradShortcutByActionName(name);
      return;
    }

    // Remove " " from modifiers.
    modifiers = modifiers.replace(/ /g, "");

    let keyElement = window.MozXULElement.parseXULToFragment(`
            <key id="${name}" class="floorpCustomShortcutKey"
                 modifiers="${modifiers}"
                 key="${key}"
                 oncommand="${functionCode}"
             />
         `);

    if (keyCode) {
      keyElement = window.MozXULElement.parseXULToFragment(`
           <key id="${name}" class="floorpCustomShortcutKey"
                oncommand="${functionCode}"
                keycode="${keyCode}"
             />`);
    }

    document.getElementById("mainKeyset").appendChild(keyElement);
  },

  removeAlreadyExistShortCutkeys() {
    let mainKeyset = document.getElementById("mainKeyset");
    while (mainKeyset.firstChild) {
      mainKeyset.firstChild.remove();
    }
  },

  disableAllCustomKeyShortcut() {
    let keyElems = document.querySelector("#mainKeyset").childNodes;
    for (let keyElem of keyElems) {
      if (!keyElem.classList.contains("floorpCustomShortcutKey")) {
        keyElem.setAttribute("disabled", true);
      }
    }
  },

  disableAllCustomKeyShortcutElemets() {
    let keyElems = document.querySelectorAll(".floorpCustomShortcutKey");
    for (let keyElem of keyElems) {
      keyElem.remove();
    }
  },

  enableAllCustomKeyShortcutElemets() {
    let keyElems = document.querySelectorAll(".floorpCustomShortcutKey");
    for (let keyElem of keyElems) {
      keyElem.removeAttribute("disabled");
    }
  },

  removeCustomKeyShortcutElemets() {
    let keyElems = document.querySelectorAll(".floorpCustomShortcutKey");
    for (let keyElem of keyElems) {
      keyElem.remove();
    }
  },
};

let customActionsFunctions = {
  evalCustomeActionWithNum(num) {
    let action = Services.prefs.getStringPref(
      `floorp.custom.shortcutkeysAndActions.customAction${num}`,
    );
    Function(action)();
  },
};

buildShortCutkeyFunctions.init();

/** 
 * Midori's custom functions used for CSK
 * If you need add actions for CSK, you can add it here.
 */

const floorpCustomCSKActions = {
  PictureInPicture: {
    // PictureInPicture.onCommand only works if browser is focused.
    // So, we need to focus the browser window after calling PictureInPicture.onCommand.
    togglePictureInPicture(event) {
      window.PictureInPicture.onCommand(event);
      window.setTimeout(() => {
        window.focus();
      }, 500);
    }
  }
}
