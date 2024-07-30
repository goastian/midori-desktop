/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */

import {
	SHORTCUT_KEY_AND_ACTION_PREF,
	SHORTCUT_KEY_AND_ACTION_ENABLED_PREF,
	SHORTCUT_KEY_DISABLE_FX_DEFAULT_SCKEY_PREF,
	SHORTCUT_KEY_CHANGED_ARRAY_PREF,
	keyboradShortcutActions,
} from "./modules/csk/CustomKeyboardShortcutUtils.mjs";

/** Floorp's custom functions used for custom actions */
export const gFloorpCustomActionFunctions = {
	evalCustomeActionWithNum(num) {
		const action = Services.prefs.getStringPref(
			`floorp.custom.shortcutkeysAndActions.customAction${num}`,
		);
		Function(action)();
	},
};

/**
 * Floorp's custom functions used for CSK
 * If you need add actions for CSK, you can add it here.
 */

export const gFloorpCSKActionFunctions = {
	PictureInPicture: {
		// PictureInPicture.onCommand only works if browser is focused.
		// So, we need to focus the browser window after calling PictureInPicture.onCommand.
		togglePictureInPicture(event) {
			window.PictureInPicture.onCommand(event);
			window.setTimeout(() => {
				window.focus();
			}, 500);
		},
	},
};

export const gFloorpCustomShortcutKeys = {
	init() {
		const webPanelId = new URL(window.location.href).searchParams.get(
			"floorpWebPanelId",
		);
		if (webPanelId) {
			return;
		}

		Services.prefs.clearUserPref(SHORTCUT_KEY_CHANGED_ARRAY_PREF);

		if (
			Services.prefs.getBoolPref(
				SHORTCUT_KEY_DISABLE_FX_DEFAULT_SCKEY_PREF,
				false,
			)
		) {
			window.SessionStore.promiseInitialized.then(() => {
				gFloorpCustomShortcutKeys.disableAllCustomKeyShortcut();
				console.info("Remove already exist shortcut keys");
			});
		}

		const keyboradShortcutConfig = JSON.parse(
			Services.prefs.getStringPref(SHORTCUT_KEY_AND_ACTION_PREF, ""),
		);

		if (
			keyboradShortcutConfig.length === 0 &&
			SHORTCUT_KEY_AND_ACTION_ENABLED_PREF
		) {
			return;
		}

		for (const shortcutObj of keyboradShortcutConfig) {
			const actionName = shortcutObj.actionName;
			const key = shortcutObj.key;
			const keyCode = shortcutObj.keyCode;
			const modifiers = shortcutObj.modifiers;

			if ((key && actionName) || (keyCode && actionName)) {
				gFloorpCustomShortcutKeys.buildShortCutkeyFunction(
					actionName,
					key,
					keyCode,
					modifiers,
				);
			} else {
				console.error(`Invalid shortcut key config: ${shortcutObj}`);
			}
		}
	},

	buildShortCutkeyFunction(actionName, key, keyCode, modifiers) {
		const functionName = keyboradShortcutActions[actionName];
		if (!functionName) {
			return;
		}

		const functionCode = keyboradShortcutActions[actionName][0];

		// Remove " " from modifiers.
		modifiers = modifiers.replace(/ /g, "");

		let keyElement = window.MozXULElement.parseXULToFragment(`
            <key id="${actionName}" class="floorpCustomShortcutKey"
                 modifiers="${modifiers}"
                 key="${key}"
                 oncommand="${functionCode}"
             />
         `);

		if (keyCode) {
			keyElement = window.MozXULElement.parseXULToFragment(`
           <key id="${actionName}" class="floorpCustomShortcutKey"
                oncommand="${functionCode}"
                keycode="${keyCode}"
             />`);
		}

		document.getElementById("mainKeyset").appendChild(keyElement);
	},

	removeAlreadyExistShortCutkeys() {
		const mainKeyset = document.getElementById("mainKeyset");
		while (mainKeyset.firstChild) {
			mainKeyset.firstChild.remove();
		}
	},

	disableAllCustomKeyShortcut() {
		const keyElems = document.querySelector("#mainKeyset").childNodes;
		for (const keyElem of keyElems) {
			if (!keyElem.classList.contains("floorpCustomShortcutKey")) {
				keyElem.setAttribute("disabled", true);
			}
		}
	},

	disableAllCustomKeyShortcutElemets() {
		const keyElems = document.querySelectorAll(".floorpCustomShortcutKey");
		for (const keyElem of keyElems) {
			keyElem.remove();
		}
	},

	enableAllCustomKeyShortcutElemets() {
		const keyElems = document.querySelectorAll(".floorpCustomShortcutKey");
		for (const keyElem of keyElems) {
			keyElem.removeAttribute("disabled");
		}
	},

	removeCustomKeyShortcutElemets() {
		const keyElems = document.querySelectorAll(".floorpCustomShortcutKey");
		for (const keyElem of keyElems) {
			keyElem.remove();
		}
	},
};

// gFloorpCustomShortcutKeys.init();
