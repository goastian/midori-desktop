/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const EXPORTED_SYMBOLS = [];

import {
	clearInterval,
	setInterval,
} from "resource://gre/modules/Timer.sys.mjs";
import { ExtensionCommon } from "resource://gre/modules/ExtensionCommon.sys.mjs";

const L10N = new Localization(["browser/floorp.ftl"]);

const TAB_SLEEP_ENABLED_PREF = "floorp.tabsleep.enabled";
const TAB_SLEEP_TESTMODE_ENABLED_PREF = "floorp.tabsleep.testmode.enabled";
const TAB_SLEEP_TAB_TIMEOUT_MINUTES_PREF = "floorp.tabsleep.tabTimeoutMinutes";
const TAB_SLEEP_EXCLUDE_HOSTS_PREF = "floorp.tabsleep.excludeHosts";

const EXCLUDE_URL_PATTERNS = [
	"auth",
	"verify",
	"verification",
	"create",
	"delete",
	"remove",
	"move",
	"edit",
	"signin",
	"signup",
	"sign-in",
	"sign-up",
	"login",
	"log-in",
	"modify",
	"form",
	"setting",
	"config",
	"token",
	"secure",
	"secret",
	"new",
	"wp-admin",
	"cart",
	"upload",
	"write",
	"preference",
	"^about:",
	"^chrome://",
	"^resource://",
];

const EXCLUDE_URL_PATTERNS_COMPILED = [];

for (const EXCLUDE_URL_PATTERN of EXCLUDE_URL_PATTERNS) {
	EXCLUDE_URL_PATTERNS_COMPILED.push(new RegExp(EXCLUDE_URL_PATTERN));
}

function getAllTabs() {
	let tabs = [];
	for (const win of Services.wm.getEnumerator("navigator:browser")) {
		if (win.gBrowser && win.gBrowser.tabs) {
			tabs = tabs.concat(win.gBrowser.tabs);
		}
	}
	return tabs;
}

function tabObserve(callback) {
	function listener(event) {
		callback(event);
	}

	const statusListener = {
		onStateChange(browser, webProgress, request, stateFlags, statusCode) {
			if (!webProgress.isTopLevel) {
				return;
			}

			let status;
			if (stateFlags & Ci.nsIWebProgressListener.STATE_IS_WINDOW) {
				if (stateFlags & Ci.nsIWebProgressListener.STATE_START) {
					status = "loading";
				} else if (stateFlags & Ci.nsIWebProgressListener.STATE_STOP) {
					status = "complete";
				}
			} else if (
				stateFlags & Ci.nsIWebProgressListener.STATE_STOP &&
				statusCode == Cr.NS_BINDING_ABORTED
			) {
				status = "complete";
			}

			if (status) {
				const nativeTab =
					browser.ownerGlobal.gBrowser.getTabForBrowser(browser);
				if (nativeTab) {
					callback({
						type: "TabStateChange",
						target: nativeTab,
						status,
					});
				}
			}
		},
		onLocationChange(browser, webProgress, request, locationURI, flags) {
			if (webProgress.isTopLevel) {
				// let status = webProgress.isLoadingDocument ? "loading" : "complete";
				const nativeTab =
					browser.ownerGlobal.gBrowser.getTabForBrowser(browser);
				if (nativeTab) {
					callback({
						type: "TabLocationChange",
						target: nativeTab,
						locationURI,
					});
				}
			}
		},
	}; // https://searchfox.org/mozilla-esr102/source/toolkit/components/extensions/parent/ext-tabs-base.js#1413-1448

	for (const domwindow of Services.wm.getEnumerator("navigator:browser")) {
		domwindow.addEventListener("TabAttrModified", listener);
		domwindow.addEventListener("TabPinned", listener);
		domwindow.addEventListener("TabUnpinned", listener);
		domwindow.addEventListener("TabBrowserInserted", listener);
		domwindow.addEventListener("TabBrowserDiscarded", listener);
		domwindow.addEventListener("TabShow", listener);
		domwindow.addEventListener("TabHide", listener);
		domwindow.addEventListener("TabOpen", listener);
		domwindow.addEventListener("TabClose", listener);
		domwindow.addEventListener("TabSelect", listener);
		domwindow.addEventListener("TabMultiSelect", listener);
		domwindow.gBrowser.addTabsProgressListener(statusListener);
	}

	const windowListener = {
		onOpenWindow(aXulWin) {
			const domwindow = aXulWin.docShell.domWindow;
			domwindow.addEventListener(
				"load",
				() => {
					if (
						domwindow.location.href === "chrome://browser/content/browser.xhtml"
					) {
						listener({
							type: "WindowOpen",
							targets:
								typeof domwindow.gBrowser.tabs !== "undefined"
									? domwindow.gBrowser.tabs
									: [],
						}); // https://searchfox.org/mozilla-esr102/source/browser/components/extensions/parent/ext-browser.js#590-611
						domwindow.addEventListener("TabAttrModified", listener);
						domwindow.addEventListener("TabPinned", listener);
						domwindow.addEventListener("TabUnpinned", listener);
						domwindow.addEventListener("TabBrowserInserted", listener);
						domwindow.addEventListener("TabBrowserDiscarded", listener);
						domwindow.addEventListener("TabShow", listener);
						domwindow.addEventListener("TabHide", listener);
						domwindow.addEventListener("TabOpen", listener);
						domwindow.addEventListener("TabClose", listener);
						domwindow.addEventListener("TabSelect", listener);
						domwindow.addEventListener("TabMultiSelect", listener);
						domwindow.gBrowser.addTabsProgressListener(statusListener);
					}
				},
				{ once: true },
			);
		},
		onCloseWindow(aWindow) {
			const domwindow = aWindow.docShell.domWindow;
			if (
				domwindow.location.href === "chrome://browser/content/browser.xhtml"
			) {
				listener({
					type: "WindowClose",
					targets:
						typeof domwindow.gBrowser.tabs !== "undefined"
							? domwindow.gBrowser.tabs
							: [],
				}); // https://searchfox.org/mozilla-esr102/source/browser/components/extensions/parent/ext-browser.js#621-627
				domwindow.removeEventListener("TabAttrModified", listener);
				domwindow.removeEventListener("TabPinned", listener);
				domwindow.removeEventListener("TabUnpinned", listener);
				domwindow.removeEventListener("TabBrowserInserted", listener);
				domwindow.removeEventListener("TabBrowserDiscarded", listener);
				domwindow.removeEventListener("TabShow", listener);
				domwindow.removeEventListener("TabHide", listener);
				domwindow.removeEventListener("TabOpen", listener);
				domwindow.removeEventListener("TabClose", listener);
				domwindow.removeEventListener("TabSelect", listener);
				domwindow.removeEventListener("TabMultiSelect", listener);
				domwindow.gBrowser.removeTabsProgressListener(statusListener);
			}
		},
	};
	Services.wm.addListener(windowListener);

	return {
		disconnect() {
			Services.wm.removeListener(windowListener);
			for (const domwindow of Services.wm.getEnumerator("navigator:browser")) {
				domwindow.removeEventListener("TabAttrModified", listener);
				domwindow.removeEventListener("TabPinned", listener);
				domwindow.removeEventListener("TabUnpinned", listener);
				domwindow.removeEventListener("TabBrowserInserted", listener);
				domwindow.removeEventListener("TabBrowserDiscarded", listener);
				domwindow.removeEventListener("TabShow", listener);
				domwindow.removeEventListener("TabHide", listener);
				domwindow.removeEventListener("TabOpen", listener);
				domwindow.removeEventListener("TabClose", listener);
				domwindow.removeEventListener("TabSelect", listener);
				domwindow.removeEventListener("TabMultiSelect", listener);
				domwindow.gBrowser.removeTabsProgressListener(statusListener);
			}
		},
	};
}

let tabSleepEnabled = false;
let TAB_TIMEOUT_MINUTES;
let tabObserve_ = null;
let interval = null;
let isEnabled = false;
let isTestMode = false;

function enableTabSleep() {
	if (tabSleepEnabled) {
		return;
	}
	tabSleepEnabled = true;
	let tabs = getAllTabs();
	tabObserve_ = tabObserve((event) => {
		if (isTestMode) {
			console.log(`Tab Sleep: event type => ${event.type}`);
		}
		const nativeTab = event.target;
		const currentTime = Date.now();
		switch (event.type) {
			case "TabAttrModified":
				const changed = event.detail.changed;
				if (
					changed.includes("muted") ||
					changed.includes("soundplaying") ||
					changed.includes("label") ||
					changed.includes("attention")
				) {
					nativeTab.lastActivity = currentTime;
				}
				break;
			case "TabPinned":
				break;
			case "TabUnpinned":
				break;
			case "TabBrowserInserted":
				break;
			case "TabBrowserDiscarded":
				break;
			case "TabShow":
				break;
			case "TabHide":
				break;
			case "TabOpen":
				if (!tabs.includes(nativeTab)) {
					tabs.push(nativeTab);
				}
				nativeTab.lastActivity = currentTime;
				break;
			case "TabClose":
				tabs = tabs.filter((nativeTab_) => nativeTab_ !== nativeTab);
				break;
			case "TabSelect":
				nativeTab.lastActivity = currentTime;
				break;
			case "TabMultiSelect":
				break;
			case "TabStateChange":
				nativeTab.lastActivity = currentTime;
				break;
			case "TabLocationChange":
				nativeTab.lastActivity = currentTime;
				break;
			case "WindowOpen":
				for (const nativeTab of event.targets) {
					if (!tabs.includes(nativeTab)) {
						tabs.push(nativeTab);
					}
					nativeTab.lastActivity = currentTime;
				}
				break;
			case "WindowClose":
				for (const nativeTab of event.targets) {
					tabs = tabs.filter((nativeTab_) => nativeTab_ !== nativeTab);
				}
				break;
		}
		if (isTestMode) {
			console.log(`Tab Sleep: tabs => ${tabs.length}`);
		}
	});

	interval = setInterval(() => {
		const currentTime = Date.now();
		const excludeHosts = Services.prefs
			.getStringPref(TAB_SLEEP_EXCLUDE_HOSTS_PREF, "")
			.split(",")
			.map((host) => host.trim());
		for (const nativeTab of tabs) {
			if (nativeTab.isTabSleepExcludeTab) {
				continue;
			}
			if (nativeTab.selected) {
				continue;
			}
			if (nativeTab.multiselected) {
				continue;
			}
			if (nativeTab.pinned) {
				continue;
			}
			if (nativeTab.attention) {
				continue;
			}
			if (nativeTab.soundPlaying) {
				continue;
			}
			if (!nativeTab.linkedPanel) {
				continue;
			}
			if (nativeTab.getAttribute("busy") === "true") {
				continue;
			}
			if (
				nativeTab.hasAttribute("splitView") &&
				nativeTab.getAttribute("splitView") === "true"
			) {
				continue;
			}

			try {
				if (
					excludeHosts.includes(nativeTab.linkedBrowser.documentURI.hostPort)
				) {
					continue;
				}
			} catch (e) {
				if (e.result != Cr.NS_ERROR_FAILURE) {
					throw e;
				}
			}

			let target = true;
			for (const EXCLUDE_URL_PATTERN_COMPILED of EXCLUDE_URL_PATTERNS_COMPILED) {
				if (
					EXCLUDE_URL_PATTERN_COMPILED.test(
						nativeTab.linkedBrowser.documentURI.spec,
					)
				) {
					target = false;
				}
			}
			if (!target) {
				continue;
			}
			if (
				currentTime - nativeTab.lastAccessed >
					TAB_TIMEOUT_MINUTES * 60 * 1000 &&
				(typeof nativeTab.lastActivity === "undefined" ||
					currentTime - nativeTab.lastActivity >
						TAB_TIMEOUT_MINUTES * 60 * 1000)
			) {
				const linkedPanel = nativeTab.linkedPanel;
				nativeTab.ownerGlobal.gBrowser.discardBrowser(nativeTab);
				if (isTestMode) {
					console.log(
						`Tab Sleep: ${nativeTab.label} (${linkedPanel}) => discarded`,
					);
				}
			}
		}
	}, 30 * 1000);

	for (const window_ of Services.wm.getEnumerator("navigator:browser")) {
		createTabContextElement(window_.document);
	}
}

function disableTabSleep() {
	if (!tabSleepEnabled) {
		return;
	}
	tabSleepEnabled = false;
	tabObserve_?.disconnect();
	tabObserve_ = null;
	if (interval !== null) {
		clearInterval(interval);
		interval = null;
	}
	for (const window_ of Services.wm.getEnumerator("navigator:browser")) {
		removeTabContextElement(window_.document);
	}
}

async function createTabContextElement(document_) {
	const tabContextMenu = document_.querySelector("#tabContextMenu");
	const tabSleepExcludeTab = document_.createXULElement("menuitem");
	tabSleepExcludeTab.setAttribute("type", "checkbox");
	tabSleepExcludeTab.setAttribute("checked", "false");
	tabSleepExcludeTab.id = "context_tabSleepExcludeTab";
	tabSleepExcludeTab.label = await L10N.formatValue(
		"tab-sleep-tab-context-menu-excludetab",
	);
	tabSleepExcludeTab.addEventListener("command", (e) => {
		const window_ = e.currentTarget.ownerGlobal;
		window_.TabContextMenu.contextTab.isTabSleepExcludeTab =
			!window_.TabContextMenu.contextTab.isTabSleepExcludeTab;
	});
	tabContextMenu.addEventListener("popupshowing", async (e) => {
		const window_ = e.currentTarget.ownerGlobal;
		e.currentTarget
			.querySelector("#context_tabSleepExcludeTab")
			.setAttribute(
				"checked",
				Boolean(window_.TabContextMenu.contextTab.isTabSleepExcludeTab),
			);
	});
	tabContextMenu
		.querySelector("#context_undoCloseTab")
		.insertAdjacentElement("afterend", tabSleepExcludeTab);
}

function removeTabContextElement(document_) {
	document_.querySelector("#context_tabSleepExcludeTab")?.remove();
}

const seenDocuments = new WeakSet();
const documentObserver = {
	observe(doc) {
		if (
			ExtensionCommon.instanceOf(doc, "HTMLDocument") &&
			!seenDocuments.has(doc)
		) {
			seenDocuments.add(doc);
			if (!isEnabled) {
				return;
			}
			const window_ = doc.defaultView;
			const document_ = window_.document;
			const uriObj = Services.io.newURI(window_.location.href);
			const uriWithoutQueryRef = uriObj.prePath + uriObj.filePath;
			if (uriWithoutQueryRef == "chrome://browser/content/browser.xhtml") {
				createTabContextElement(document_);
			}
		}
	},
};
Services.obs.addObserver(documentObserver, "chrome-document-interactive");

{
	isEnabled = Services.prefs.getBoolPref(TAB_SLEEP_ENABLED_PREF, false);
	isTestMode = Services.prefs.getBoolPref(
		TAB_SLEEP_TESTMODE_ENABLED_PREF,
		false,
	);

	const systemMemory = Services.sysinfo.getProperty("memsize");
	const systemMemoryGB = systemMemory / 1024 / 1024 / 1024;
	if (isTestMode) {
		console.log(`Tab Sleep: System Memory (GB) => ${systemMemoryGB}`);
	}

	const tabTimeoutMinutesDefault = Math.floor(systemMemoryGB * 5);
	Services.prefs
		.getDefaultBranch(null)
		.setIntPref(TAB_SLEEP_TAB_TIMEOUT_MINUTES_PREF, tabTimeoutMinutesDefault);

	const timeoutMinutesPrefHandle = () => {
		TAB_TIMEOUT_MINUTES = Services.prefs.getIntPref(
			TAB_SLEEP_TAB_TIMEOUT_MINUTES_PREF,
			tabTimeoutMinutesDefault,
		);
		if (isTestMode) {
			console.log(`Tab Sleep: TAB_TIMEOUT_MINUTES => ${TAB_TIMEOUT_MINUTES}`);
		}
	};
	timeoutMinutesPrefHandle();
	Services.prefs.addObserver(
		TAB_SLEEP_TAB_TIMEOUT_MINUTES_PREF,
		timeoutMinutesPrefHandle,
	);

	if (isEnabled) {
		enableTabSleep();
	}

	Services.prefs.addObserver(TAB_SLEEP_ENABLED_PREF, () => {
		isEnabled = Services.prefs.getBoolPref(TAB_SLEEP_ENABLED_PREF, false);
		if (isEnabled) {
			enableTabSleep();
		} else {
			disableTabSleep();
		}
	});

	Services.prefs.addObserver(TAB_SLEEP_TESTMODE_ENABLED_PREF, () => {
		isTestMode = Services.prefs.getBoolPref(
			TAB_SLEEP_TESTMODE_ENABLED_PREF,
			false,
		);
	});
}
