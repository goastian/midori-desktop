/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const EXPORTED_SYMBOLS = [];

import { FileUtils } from "resource://gre/modules/FileUtils.sys.mjs";
import { ExtensionCommon } from "resource://gre/modules/ExtensionCommon.sys.mjs";
import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { Subprocess } from "resource://gre/modules/Subprocess.sys.mjs";
import { DesktopFileParser } from "resource://floorp/DesktopFileParser.sys.mjs";
import { EscapeShell } from "resource://floorp/EscapeShell.sys.mjs";

const platform = AppConstants.platform;
const L10N = new Localization(["browser/floorp.ftl"]);

const env = Services.env;

function getBrowsersOnWindows() {
	const browsers = [];
	const ROOT_KEYS = [
		Ci.nsIWindowsRegKey.ROOT_KEY_CURRENT_USER,
		Ci.nsIWindowsRegKey.ROOT_KEY_LOCAL_MACHINE,
	];

	for (const ROOT_KEY of ROOT_KEYS) {
		const key = Cc["@mozilla.org/windows-registry-key;1"].createInstance(
			Ci.nsIWindowsRegKey,
		);
		try {
			key.open(
				ROOT_KEY,
				"Software\\Clients\\StartMenuInternet",
				Ci.nsIWindowsRegKey.ACCESS_READ,
			);
		} catch (e) {
			console.error(e);
			continue;
		}
		for (let i = 0; i < key.childCount; i++) {
			const keyname = key.getChildName(i);
			if (keyname == "IEXPLORE.EXE") {
				continue;
			}
			if (
				browsers.filter((browser) => browser.keyName === keyname).length >= 1
			) {
				continue;
			}

			const keyBrowserName = Cc[
				"@mozilla.org/windows-registry-key;1"
			].createInstance(Ci.nsIWindowsRegKey);
			keyBrowserName.open(
				ROOT_KEY,
				`Software\\Clients\\StartMenuInternet\\${keyname}`,
				Ci.nsIWindowsRegKey.ACCESS_READ,
			);
			const browserName = keyBrowserName.readStringValue("");
			keyBrowserName.close();

			const keyPath = Cc["@mozilla.org/windows-registry-key;1"].createInstance(
				Ci.nsIWindowsRegKey,
			);
			keyPath.open(
				ROOT_KEY,
				`Software\\Clients\\StartMenuInternet\\${keyname}\\shell\\open\\command`,
				Ci.nsIWindowsRegKey.ACCESS_READ,
			);
			const browserPathRegValue = keyPath.readStringValue("");
			const browserPath = browserPathRegValue
				.replace(/^\"/, "")
				.replace(/\"$/, "");
			keyPath.close();

			const urlAssociations = {};
			const keyUrlAssociations = Cc[
				"@mozilla.org/windows-registry-key;1"
			].createInstance(Ci.nsIWindowsRegKey);
			let error = null;
			try {
				keyUrlAssociations.open(
					ROOT_KEY,
					`Software\\Clients\\StartMenuInternet\\${keyname}\\Capabilities\\URLAssociations`,
					Ci.nsIWindowsRegKey.ACCESS_READ,
				);
			} catch (e) {
				error = e;
				console.error(e);
			}
			if (error === null) {
				for (let j = 0; j < keyUrlAssociations.valueCount; j++) {
					const valuename = keyUrlAssociations.getValueName(j);
					const urlAssociationRegValue =
						keyUrlAssociations.readStringValue(valuename);
					urlAssociations[valuename] = urlAssociationRegValue;
				}
			}
			keyUrlAssociations.close();

			const fileAssociations = {};
			const keyFileAssociations = Cc[
				"@mozilla.org/windows-registry-key;1"
			].createInstance(Ci.nsIWindowsRegKey);
			let error2 = null;
			try {
				keyFileAssociations.open(
					ROOT_KEY,
					`Software\\Clients\\StartMenuInternet\\${keyname}\\Capabilities\\FileAssociations`,
					Ci.nsIWindowsRegKey.ACCESS_READ,
				);
			} catch (e) {
				error2 = e;
				console.error(e);
			}
			if (error2 === null) {
				for (let j = 0; j < keyFileAssociations.valueCount; j++) {
					const valuename = keyFileAssociations.getValueName(j);
					const fileAssociationRegValue =
						keyFileAssociations.readStringValue(valuename);
					fileAssociations[valuename] = fileAssociationRegValue;
				}
			}
			keyFileAssociations.close();

			browsers.push({
				name: browserName,
				keyName: keyname,
				path: browserPath,
				fileAssociations,
				urlAssociations,
			});
		}
		key.close();
	}
	return browsers.sort((a, b) => {
		if (a.name < b.name) {
			return -1;
		}
		if (a.name > b.name) {
			return 1;
		}
		return 0;
	});
}

function getDefaultBrowserOnWindows(protocol, browsers = null) {
	if (browsers === null) {
		browsers = getBrowsersOnWindows();
	}
	const key = Cc["@mozilla.org/windows-registry-key;1"].createInstance(
		Ci.nsIWindowsRegKey,
	);
	key.open(
		Ci.nsIWindowsRegKey.ROOT_KEY_CURRENT_USER,
		`Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\${protocol}\\UserChoice`,
		Ci.nsIWindowsRegKey.ACCESS_READ,
	);
	const regValue = key.readStringValue("ProgID");
	const targets = browsers.filter(
		(browser) => browser.urlAssociations[protocol] === regValue,
	);
	if (targets.length === 0) {
		return null;
	}
	return targets[0];
}

async function getBrowsersOnLinux() {
	const checkDirs = [];

	let xdgDataHome = env.get("XDG_DATA_HOME");
	if (xdgDataHome === "") {
		xdgDataHome = "~/.local/share/";
	}
	checkDirs.push(xdgDataHome);
	let xdgDataDirs = env.get("XDG_DATA_DIRS").split(":");
	if (xdgDataDirs[0] === "") {
		xdgDataDirs = ["/usr/local/share/", "/usr/share/"];
	}
	checkDirs.push(...xdgDataDirs);

	const desktopFilesInfo = [];
	for (const checkDir of checkDirs) {
		const applications_dir_path = PathUtils.join(checkDir, "applications");
		const dir = FileUtils.File(applications_dir_path);
		if (!dir.exists()) {
			continue;
		}
		const desktopFiles = [];
		const dir_entries = dir.directoryEntries;
		while (dir_entries.hasMoreElements()) {
			const dir_entry = dir_entries.getNext().QueryInterface(Ci.nsIFile);
			if (dir_entry.isFile() && dir_entry.leafName.endsWith(".desktop")) {
				desktopFiles.push(dir_entry);
			}
		}
		for (const desktopFile of desktopFiles) {
			if (
				desktopFilesInfo.filter(
					(desktopFileInfo) =>
						desktopFileInfo.filename === desktopFile.leafName,
				).length === 0
			) {
				const desktopFileInfo = {};
				desktopFileInfo.filename = desktopFile.leafName;
				try {
					desktopFileInfo.fileInfo = await DesktopFileParser.parseFromPath(
						desktopFile.path,
					);
				} catch (e) {
					console.log(`Failed to load ${desktopFile.path}`);
					console.error(e);
					continue;
				}
				if (!desktopFileInfo.fileInfo["Desktop Entry"]) {
					continue;
				}
				if (!desktopFileInfo.fileInfo["Desktop Entry"].Exec) {
					continue;
				}
				if (!desktopFileInfo.fileInfo["Desktop Entry"].Name) {
					continue;
				}
				const mimetypes = desktopFileInfo.fileInfo["Desktop Entry"].MimeType;
				if (
					mimetypes &&
					(mimetypes.split(";").includes("x-scheme-handler/http") ||
						mimetypes.split(";").includes("x-scheme-handler/https"))
				) {
					desktopFilesInfo.push(desktopFileInfo);
				}
			}
		}
	}
	return desktopFilesInfo.sort((a, b) => {
		if (a.filename < b.filename) {
			return -1;
		}
		if (a.filename > b.filename) {
			return 1;
		}
		return 0;
	});
}

async function getDefaultBrowserOnLinux(protocol, desktopFilesInfo = null) {
	if (desktopFilesInfo === null) {
		desktopFilesInfo = await getBrowsersOnLinux();
	}
	let output;
	try {
		output = await Subprocess.call({
			command: "/usr/bin/xdg-mime",
			arguments: ["query", "default", `x-scheme-handler/${protocol}`],
		}).then(async (proc) => {
			proc.stdin.close().catch(() => {
				// It's possible that the process exists before we close stdin.
				// In that case, we should ignore the errors.
			});
			await proc.wait();
			return proc.stdout.readString();
		});
	} catch (e) {
		console.error(e);
		return null;
	}
	if (output === "") {
		return null;
	}
	const filename = output.replace(/\n$/, "");
	const targets = desktopFilesInfo.filter(
		(desktopFileInfo) => desktopFileInfo.filename === filename,
	);
	if (targets.length === 0) {
		return null;
	}
	return targets[0];
}

async function OpenLinkInExternal(url) {
	const userSelectedBrowserId = Services.prefs.getStringPref(
		"floorp.openLinkInExternal.browserId",
		"",
	);
	let protocol;
	if (url.startsWith("http")) {
		protocol = "http";
	}
	if (url.startsWith("https")) {
		protocol = "https";
	}
	if (platform === "linux") {
		const desktopFilesInfo = await getBrowsersOnLinux();
		let browser;
		if (userSelectedBrowserId === "") {
			browser = await getDefaultBrowserOnLinux(protocol, desktopFilesInfo);
			if (browser === null) {
				Services.prompt.asyncAlert(
					null,
					null,
					await L10N.formatValue(
						"open-link-in-external-tab-dialog-title-error",
					),
					await L10N.formatValue(
						"open-link-in-external-tab-dialog-message-default-browser-not-found",
					),
				);
				return;
			}
		} else {
			const targets = desktopFilesInfo.filter(
				(desktopFileInfo) =>
					desktopFileInfo.filename === userSelectedBrowserId + ".desktop",
			);
			if (targets.length === 0) {
				Services.prompt.asyncAlert(
					null,
					null,
					await L10N.formatValue(
						"open-link-in-external-tab-dialog-title-error",
					),
					await L10N.formatValue(
						"open-link-in-external-tab-dialog-message-selected-browser-not-found",
					),
				);
				return;
			}
			browser = targets[0];
		}
		// Flatpak version will be launched that does not work properly.
		// To avoid data corruption, do not launch it.
		if (browser.fileInfo["Desktop Entry"].Exec.startsWith("/usr/bin/flatpak")) {
			return;
		}
		let shellscript = "#!/bin/sh\n";
		shellscript += browser.fileInfo["Desktop Entry"].Exec.replace(
			"/%[uU]/",
			EscapeShell(url),
		);
		const randomized = Math.random().toString(32).substring(2);
		const outputFilePath = `/tmp/floorp_openInExternal_${randomized}.sh`;
		await IOUtils.writeUTF8(outputFilePath, shellscript);
		const process = Cc["@mozilla.org/process/util;1"].createInstance(
			Ci.nsIProcess,
		);
		process.init(FileUtils.File("/bin/sh"));
		process.runAsync([outputFilePath], 1, async () => {
			await IOUtils.remove(outputFilePath);
		});
	} else if (platform === "win") {
		const browsers = getBrowsersOnWindows();
		let browser;
		if (userSelectedBrowserId === "") {
			browser = getDefaultBrowserOnWindows(protocol, browsers);
			if (browser === null) {
				Services.prompt.asyncAlert(
					null,
					null,
					await L10N.formatValue(
						"open-link-in-external-tab-dialog-title-error",
					),
					await L10N.formatValue(
						"open-link-in-external-tab-dialog-message-default-browser-not-found",
					),
				);
				return;
			}
		} else {
			const targets = browsers.filter(
				(browser) => browser.keyName === userSelectedBrowserId,
			);
			if (targets.length === 0) {
				Services.prompt.asyncAlert(
					null,
					null,
					await L10N.formatValue(
						"open-link-in-external-tab-dialog-title-error",
					),
					await L10N.formatValue(
						"open-link-in-external-tab-dialog-message-selected-browser-not-found",
					),
				);
				return;
			}
			browser = targets[0];
		}
		const browserPath = browser.path;
		const process = Cc["@mozilla.org/process/util;1"].createInstance(
			Ci.nsIProcess,
		);
		process.init(FileUtils.File(browserPath));
		process.runAsync([url], 1);
	}
}

const seenDocuments = new WeakSet();
const documentObserver = {
	observe(doc) {
		if (
			ExtensionCommon.instanceOf(doc, "HTMLDocument") &&
			!seenDocuments.has(doc)
		) {
			seenDocuments.add(doc);
			const window_ = doc.defaultView;
			const document_ = window_.document;
			const uriObj = Services.io.newURI(window_.location.href);
			const uriWithoutQueryRef = uriObj.prePath + uriObj.filePath;
			if (uriWithoutQueryRef == "chrome://browser/content/browser.xhtml") {
				(async () => {
					const tabContextMenu = document_.querySelector("#tabContextMenu");
					const openLinkInExternal = document_.createXULElement("menuitem");
					openLinkInExternal.id = "context_openLinkInExternal";
					openLinkInExternal.label = await L10N.formatValue(
						"open-link-in-external-tab-context-menu",
					);
					openLinkInExternal.addEventListener("command", (e) => {
						const window_ = e.currentTarget.ownerGlobal;
						OpenLinkInExternal(
							window_.TabContextMenu.contextTab.linkedBrowser.currentURI.spec,
						);
					});
					tabContextMenu.addEventListener("popupshowing", (e) => {
						const window_ = e.currentTarget.ownerGlobal;
						const scheme =
							window_?.TabContextMenu?.contextTab?.linkedBrowser?.currentURI
								?.scheme || "";
						e.currentTarget.querySelector(
							"#context_openLinkInExternal",
						).hidden = !/^https?$/.test(scheme);
					});
					tabContextMenu
						.querySelector("#context_sendTabToDevice")
						.insertAdjacentElement("afterend", openLinkInExternal);
				})();
				(async () => {
					const contextMenu = document_.querySelector(
						"#contentAreaContextMenu",
					);
					const openLinkInExternal = document_.createXULElement("menuitem");
					openLinkInExternal.id = "context-openlinkinexternal";
					openLinkInExternal.label = await L10N.formatValue(
						"open-link-in-external-tab-context-menu",
					);
					openLinkInExternal.addEventListener("command", (e) => {
						const window_ = e.currentTarget.ownerGlobal;
						OpenLinkInExternal(window_.gContextMenu.linkURL);
					});
					contextMenu.addEventListener("popupshowing", (e) => {
						const window_ = e.currentTarget.ownerGlobal;
						const scheme = window_?.gContextMenu?.linkURI?.scheme || "";
						e.currentTarget.querySelector(
							"#context-openlinkinexternal",
						).hidden =
							!(
								window_.gContextMenu.onSaveableLink ||
								window_.gContextMenu.onPlainTextLink
							) || !/^https?$/.test(scheme);
					});
					contextMenu
						.querySelector("#context-sendlinktodevice")
						.insertAdjacentElement("afterend", openLinkInExternal);
				})();
			} else if (
				uriWithoutQueryRef ==
					"chrome://floorp/content/preferences/preferences.xhtml" ||
				uriWithoutQueryRef == "about:preferences"
			) {
				window_.addEventListener(
					"pageshow",
					async () => {
						await window_.gMainPane.initialized;
						const browsers = [];
						if (platform === "linux") {
							const desktopFilesInfo = await getBrowsersOnLinux();
							for (const desktopFileInfo of desktopFilesInfo) {
								// Flatpak version will be launched that does not work properly.
								// To avoid data corruption, do not display them in the list.
								if (
									desktopFileInfo.fileInfo["Desktop Entry"].Exec.startsWith(
										"/usr/bin/flatpak",
									)
								) {
									continue;
								}
								browsers.push({
									name: DesktopFileParser.getCurrentLanguageNameProperty(
										desktopFileInfo,
									),
									id: desktopFileInfo.filename.replace(/\.desktop$/, ""),
									tooltiptext: desktopFileInfo.fileInfo["Desktop Entry"].Exec,
								});
							}
						} else if (platform === "win") {
							const startMenusInternet = getBrowsersOnWindows();
							for (const startMenuInternet of startMenusInternet) {
								browsers.push({
									name: startMenuInternet.name,
									id: startMenuInternet.keyName,
									tooltiptext: startMenuInternet.path,
								});
							}
						}

						const options = document_.querySelector(
							"#openLinkInExternalSelectBrowser > menupopup",
						);
						for (const browser of browsers) {
							const elem = document_.createXULElement("menuitem");
							elem.setAttribute("value", browser.id);
							elem.setAttribute("label", browser.name);
							elem.setAttribute("tooltiptext", browser.tooltiptext);
							options.appendChild(elem);
						}

						// Triggers a command event and updates the display.
						options
							.querySelector(
								`[value="${Services.prefs
									.getStringPref("floorp.openLinkInExternal.browserId", "")
									.replaceAll(`"`, `\\"`)}"]`,
							)
							?.dispatchEvent(new Event("command"));
					},
					{ once: true },
				);
			}
		}
	},
};
Services.obs.addObserver(documentObserver, "chrome-document-interactive");
