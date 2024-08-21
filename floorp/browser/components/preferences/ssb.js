/* eslint-disable no-undef */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from preferences.js */

var { SiteSpecificBrowserExternalFileService } = ChromeUtils.importESModule(
	"chrome://floorp/content/modules/ssb/SiteSpecificBrowserExternalFileService.mjs",
);

var { SiteSpecificBrowserIdUtils } = ChromeUtils.importESModule(
	"chrome://floorp/content/modules/ssb/SiteSpecificBrowserIdUtils.mjs",
);

ChromeUtils.defineLazyGetter(this, "L10n", () => {
	return new Localization(["branding/brand.ftl", "browser/floorp"]);
});

Preferences.addAll([
	{
		id: "floorp.browser.ssb.enabled",
		type: "bool",
	},
	{
		id: "floorp.browser.ssb.toolbars.disabled",
		type: "bool",
	},
]);

const gSsbPane = {
	_pane: null,

	uninstallSsb(ssbId) {
		document.querySelector(`[ssbId="${ssbId}"]`).hidden = true;
		SiteSpecificBrowserIdUtils.uninstallById(ssbId);
	},

	uninstallSsbFromPreferecesPage(ssbId, name) {
		const prompts = Services.prompt;
		const L10n = new Localization(
			["browser/floorp.ftl", "branding/brand.ftl"],
			true,
		);
		const title = L10n.formatValueSync("ssb-uninstall-title");
		const message = L10n.formatValueSync("ssb-uninstall-message");
		const check = {
			value: false,
		};

		const flags =
			prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_OK +
			prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_CANCEL;
		const result = prompts.confirmEx(
			null,
			title,
			message,
			flags,
			"",
			null,
			"",
			null,
			check,
		);

		if (result == 0) {
			this.uninstallSsb(ssbId);
		}
	},

	async init() {
		this._pane = document.getElementById("paneSsb");

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

		// Build the list of installed SSBs & PWAs
		const parentElem = document.getElementById("ssb-installed-apps-list");
		const list =
			await SiteSpecificBrowserExternalFileService.getCurrentSsbData();

		for (const key in list) {
			const id = list[key].id;
			const name = list[key].name;
			const icon = list[key].manifest.icons[0].src; // Base64 encoded icon
			const startUrl = list[key].manifest.start_url;

			try {
				const elem = window.MozXULElement.parseXULToFragment(`
        <hbox class="csks-box-item" ssbId="${id}">
          <image class="ssb-image"/>
          <vbox class="csks-box-item-content">
            <label class="sbb-name-label">${name}</label>
            <label class="ssb-url-label">${startUrl}</label>
          </vbox>
          <spacer flex="1"/> 
          <button class="ssb-uninstall-button" value="${id}" data-l10n-id="ssb-uninstall-button" />
        </hbox>
      `);
				parentElem?.appendChild(elem);

				const iconElem = document
					.querySelector(`.csks-box-item[ssbId="${id}"]`)
					.querySelector(`.ssb-image`);
				iconElem.style.listStyleImage = `url(${icon})`;

				const button = document
					.querySelector(`.csks-box-item[ssbId="${id}"]`)
					.querySelector(`.ssb-uninstall-button`);
				if (!button.getAttribute("uninstallIsSet")) {
					button.addEventListener("click", () => {
						this.uninstallSsbFromPreferecesPage(id, name);
					});
					button.setAttribute("uninstallIsSet", "true");
				}
			} catch (e) {}
		}
	},
};
