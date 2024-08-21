/* eslint-disable no-undef */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { AppConstants } = ChromeUtils.import(
	"resource://gre/modules/AppConstants.jsm",
);

ChromeUtils.defineLazyGetter(this, "L10n", () => {
	return new Localization(["branding/brand.ftl", "browser/floorp"]);
});

const gNotesPane = {
	_pane: null,
	init() {
		this._pane = document.getElementById("paneNotes");
		document
			.getElementById("backtogeneral__")
			.addEventListener("command", () => {
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
						const userConfirm = await confirmRestartPrompt(null);
						if (userConfirm == CONFIRM_RESTART_PROMPT_RESTART_NOW) {
							Services.startup.quit(
								Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart,
							);
						}
					})();
				} else {
					window.setTimeout(() => {
						Services.startup.quit(
							Services.startup.eAttemptQuit | Services.startup.eRestart,
						);
					}, 500);
				}
			});
		}

		getAllBackupedNotes().then((content) => {
			const keys = Object.keys(content.data);
			keys.forEach((key, i) => {
				if (i > 9) {
					document.querySelector(".backup-item").remove();
				}
				const elem = window.MozXULElement.parseXULToFragment(`
              <richlistitem class="backup-item">
                <label value="${convertToDateAndTime(Number(key))}" class="backup-date"/>
                <button class="restore-button" id="${key}" data-l10n-id="restore-button"/>
              </richlistitem>
            `);
				document.getElementById("backup-list").appendChild(elem);
			});

			const elems = Array.from(
				document.getElementsByClassName("restore-button"),
			);
			elems.forEach((elem) => {
				elem.onclick = () => restoreNote(elem.id);
			});
		});
	},
};
//convert timestamp to date and time
function convertToDateAndTime(timestamp) {
	const date = new Date(timestamp);
	return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

function getAllBackupedNotes() {
	const filePath = PathUtils.join(
		Services.dirsvc.get("ProfD", Ci.nsIFile).path,
		"floorp_notes_backup.json",
	);
	return IOUtils.readUTF8(filePath).then((content) => {
		content = content.slice(0, -1) + "}}";
		return JSON.parse(content);
	});
}

async function restoreNote(timestamp) {
	const l10n = new Localization(
		["browser/floorp.ftl", "branding/brand.ftl"],
		true,
	);
	const prompts = Services.prompt;
	const check = {
		value: false,
	};
	const flags =
		prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_OK +
		prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_CANCEL;
	const result = prompts.confirmEx(
		null,
		l10n.formatValueSync("restore-from-backup-prompt-title"),
		`${l10n.formatValueSync(
			"restore-from-this-backup",
		)}\n${l10n.formatValueSync("backuped-time")}: ${convertToDateAndTime(
			Number(timestamp),
		)}`,
		flags,
		"",
		null,
		"",
		null,
		check,
	);
	if (result == 0) {
		const content = await getAllBackupedNotes();
		const note = `{${content.data[timestamp]}}`;
		Services.prefs.setCharPref("floorp.browser.note.memos", note);
	}
}
