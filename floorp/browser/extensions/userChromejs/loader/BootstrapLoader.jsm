const EXPORTED_SYMBOLS = [];

const { XPCOMUtils } = ChromeUtils.import(
	"resource://gre/modules/XPCOMUtils.jsm",
);

XPCOMUtils.defineLazyModuleGetters(this, {
	Blocklist: "resource://gre/modules/Blocklist.jsm",
	ConsoleAPI: "resource://gre/modules/Console.jsm",
	InstallRDF: "chrome://userchromejs/content/RDFManifestConverter.jsm",
	Services: "resource://gre/modules/Services.jsm",
});

Services.obs.addObserver((doc) => {
	if (
		doc.location.protocol + doc.location.pathname === "about:addons" ||
		doc.location.protocol + doc.location.pathname ===
			"chrome:/content/extensions/aboutaddons.html"
	) {
		const win = doc.defaultView;
		const handleEvent_orig =
			win.customElements.get("addon-card").prototype.handleEvent;
		win.customElements.get("addon-card").prototype.handleEvent = function (e) {
			if (
				e.type === "click" &&
				e.target.getAttribute("action") === "preferences" &&
				this.addon.optionsType == 1 /*AddonManager.OPTIONS_TYPE_DIALOG*/
			) {
				var windows = Services.wm.getEnumerator(null);
				while (windows.hasMoreElements()) {
					var win2 = windows.getNext();
					if (win2.closed) {
						continue;
					}
					if (win2.document.documentURI == this.addon.optionsURL) {
						win2.focus();
						return;
					}
				}
				var features = "chrome,titlebar,toolbar,centerscreen";
				var instantApply = Services.prefs.getBoolPref(
					"browser.preferences.instantApply",
				);
				features += instantApply ? ",dialog=no" : "";
				win.docShell.rootTreeItem.domWindow.openDialog(
					this.addon.optionsURL,
					this.addon.id,
					features,
				);
			} else {
				handleEvent_orig.apply(this, arguments);
			}
		};
		const update_orig =
			win.customElements.get("addon-options").prototype.update;
		win.customElements.get("addon-options").prototype.update = function (
			card,
			addon,
		) {
			update_orig.apply(this, arguments);
			if (addon.optionsType == 1 /*AddonManager.OPTIONS_TYPE_DIALOG*/)
				this.querySelector(
					'panel-item[data-l10n-id="preferences-addon-button"]',
				).hidden = false;
		};
	}
}, "chrome-document-loaded");

const { AddonManager } = ChromeUtils.import(
	"resource://gre/modules/AddonManager.jsm",
);
const { XPIDatabase, AddonInternal } = ChromeUtils.import(
	"resource://gre/modules/addons/XPIDatabase.jsm",
);

const { defineAddonWrapperProperty } = Cu.import(
	"resource://gre/modules/addons/XPIDatabase.jsm",
);
defineAddonWrapperProperty("optionsType", function optionsType() {
	if (!this.isActive) {
		return null;
	}

	const addon = this.__AddonInternal__;
	const hasOptionsURL = !!this.optionsURL;

	if (addon.optionsType) {
		switch (Number.parseInt(addon.optionsType, 10)) {
			case 1 /*AddonManager.OPTIONS_TYPE_DIALOG*/:
			case AddonManager.OPTIONS_TYPE_TAB:
			case AddonManager.OPTIONS_TYPE_INLINE_BROWSER:
				return hasOptionsURL ? addon.optionsType : null;
		}
		return null;
	}

	return null;
});

XPIDatabase.isDisabledLegacy = () => false;

ChromeUtils.defineLazyGetter(this, "BOOTSTRAP_REASONS", () => {
	const { XPIProvider } = ChromeUtils.import(
		"resource://gre/modules/addons/XPIProvider.jsm",
	);
	return XPIProvider.BOOTSTRAP_REASONS;
});

const { Log } = ChromeUtils.import("resource://gre/modules/Log.jsm");
var logger = Log.repository.getLogger("addons.bootstrap");

/**
 * Valid IDs fit this pattern.
 */
var gIDTest =
	/^(\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}|[a-z0-9-\._]*\@[a-z0-9-\._]+)$/i;

// Properties that exist in the install manifest
const PROP_METADATA = [
	"id",
	"version",
	"type",
	"internalName",
	"updateURL",
	"optionsURL",
	"optionsType",
	"aboutURL",
	"iconURL",
];
const PROP_LOCALE_SINGLE = ["name", "description", "creator", "homepageURL"];
const PROP_LOCALE_MULTI = ["developers", "translators", "contributors"];

// Map new string type identifiers to old style nsIUpdateItem types.
// Retired values:
// 32 = multipackage xpi file
// 8 = locale
// 256 = apiextension
// 128 = experiment
// theme = 4
const TYPES = {
	extension: 2,
	dictionary: 64,
};

const COMPATIBLE_BY_DEFAULT_TYPES = {
	extension: true,
	dictionary: true,
};

const hasOwnProperty = Function.call.bind(Object.prototype.hasOwnProperty);

function isXPI(filename) {
	const ext = filename.slice(-4).toLowerCase();
	return ext === ".xpi" || ext === ".zip";
}

/**
 * Gets an nsIURI for a file within another file, either a directory or an XPI
 * file. If aFile is a directory then this will return a file: URI, if it is an
 * XPI file then it will return a jar: URI.
 *
 * @param {nsIFile} aFile
 *        The file containing the resources, must be either a directory or an
 *        XPI file
 * @param {string} aPath
 *        The path to find the resource at, '/' separated. If aPath is empty
 *        then the uri to the root of the contained files will be returned
 * @returns {nsIURI}
 *        An nsIURI pointing at the resource
 */
function getURIForResourceInFile(aFile, aPath) {
	if (!isXPI(aFile.leafName)) {
		const resource = aFile.clone();
		if (aPath) aPath.split("/").forEach((part) => resource.append(part));

		return Services.io.newFileURI(resource);
	}

	return buildJarURI(aFile, aPath);
}

/**
 * Creates a jar: URI for a file inside a ZIP file.
 *
 * @param {nsIFile} aJarfile
 *        The ZIP file as an nsIFile
 * @param {string} aPath
 *        The path inside the ZIP file
 * @returns {nsIURI}
 *        An nsIURI for the file
 */
function buildJarURI(aJarfile, aPath) {
	let uri = Services.io.newFileURI(aJarfile);
	uri = "jar:" + uri.spec + "!/" + aPath;
	return Services.io.newURI(uri);
}

var BootstrapLoader = {
	name: "bootstrap",
	manifestFile: "install.rdf",
	async loadManifest(pkg) {
		/**
		 * Reads locale properties from either the main install manifest root or
		 * an em:localized section in the install manifest.
		 *
		 * @param {Object} aSource
		 *        The resource to read the properties from.
		 * @param {boolean} isDefault
		 *        True if the locale is to be read from the main install manifest
		 *        root
		 * @param {string[]} aSeenLocales
		 *        An array of locale names already seen for this install manifest.
		 *        Any locale names seen as a part of this function will be added to
		 *        this array
		 * @returns {Object}
		 *        an object containing the locale properties
		 */
		function readLocale(aSource, isDefault, aSeenLocales) {
			const locale = {};
			if (!isDefault) {
				locale.locales = [];
				for (const localeName of aSource.locales || []) {
					if (!localeName) {
						logger.warn("Ignoring empty locale in localized properties");
						continue;
					}
					if (aSeenLocales.includes(localeName)) {
						logger.warn("Ignoring duplicate locale in localized properties");
						continue;
					}
					aSeenLocales.push(localeName);
					locale.locales.push(localeName);
				}

				if (locale.locales.length == 0) {
					logger.warn("Ignoring localized properties with no listed locales");
					return null;
				}
			}

			for (const prop of [...PROP_LOCALE_SINGLE, ...PROP_LOCALE_MULTI]) {
				if (hasOwnProperty(aSource, prop)) {
					locale[prop] = aSource[prop];
				}
			}

			return locale;
		}

		const manifestData = await pkg.readString("install.rdf");
		const manifest = InstallRDF.loadFromString(manifestData).decode();

		const addon = new AddonInternal();
		for (const prop of PROP_METADATA) {
			if (hasOwnProperty(manifest, prop)) {
				addon[prop] = manifest[prop];
			}
		}

		if (!addon.type) {
			addon.type = "extension";
		} else {
			const type = addon.type;
			addon.type = null;
			for (const name in TYPES) {
				if (TYPES[name] == type) {
					addon.type = name;
					break;
				}
			}
		}

		if (!(addon.type in TYPES))
			throw new Error("Install manifest specifies unknown type: " + addon.type);

		if (!addon.id) throw new Error("No ID in install manifest");
		if (!gIDTest.test(addon.id))
			throw new Error("Illegal add-on ID " + addon.id);
		if (!addon.version) throw new Error("No version in install manifest");

		addon.strictCompatibility =
			!(addon.type in COMPATIBLE_BY_DEFAULT_TYPES) ||
			manifest.strictCompatibility == "true";

		// Only read these properties for extensions.
		if (addon.type == "extension") {
			if (manifest.bootstrap != "true") {
				throw new Error("Non-restartless extensions no longer supported");
			}

			if (
				addon.optionsType &&
				addon.optionsType != 1 /*AddonManager.OPTIONS_TYPE_DIALOG*/ &&
				addon.optionsType != AddonManager.OPTIONS_TYPE_INLINE_BROWSER &&
				addon.optionsType != AddonManager.OPTIONS_TYPE_TAB
			) {
				throw new Error(
					"Install manifest specifies unknown optionsType: " +
						addon.optionsType,
				);
			}

			if (addon.optionsType)
				addon.optionsType = Number.parseInt(addon.optionsType);
		}

		addon.defaultLocale = readLocale(manifest, true);

		const seenLocales = [];
		addon.locales = [];
		for (const localeData of manifest.localized || []) {
			const locale = readLocale(localeData, false, seenLocales);
			if (locale) addon.locales.push(locale);
		}

		const dependencies = new Set(manifest.dependencies);
		addon.dependencies = Object.freeze(Array.from(dependencies));

		const seenApplications = [];
		addon.targetApplications = [];
		for (const targetApp of manifest.targetApplications || []) {
			if (!targetApp.id || !targetApp.minVersion || !targetApp.maxVersion) {
				logger.warn(
					"Ignoring invalid targetApplication entry in install manifest",
				);
				continue;
			}
			if (seenApplications.includes(targetApp.id)) {
				logger.warn(
					"Ignoring duplicate targetApplication entry for " +
						targetApp.id +
						" in install manifest",
				);
				continue;
			}
			seenApplications.push(targetApp.id);
			addon.targetApplications.push(targetApp);
		}

		// Note that we don't need to check for duplicate targetPlatform entries since
		// the RDF service coalesces them for us.
		addon.targetPlatforms = [];
		for (const targetPlatform of manifest.targetPlatforms || []) {
			const platform = {
				os: null,
				abi: null,
			};

			const pos = targetPlatform.indexOf("_");
			if (pos != -1) {
				platform.os = targetPlatform.substring(0, pos);
				platform.abi = targetPlatform.substring(pos + 1);
			} else {
				platform.os = targetPlatform;
			}

			addon.targetPlatforms.push(platform);
		}

		addon.userDisabled = false;
		addon.softDisabled = addon.blocklistState == Blocklist.STATE_SOFTBLOCKED;
		addon.applyBackgroundUpdates = AddonManager.AUTOUPDATE_DEFAULT;

		addon.userPermissions = null;

		addon.icons = {};
		if (await pkg.hasResource("icon.png")) {
			addon.icons[32] = "icon.png";
			addon.icons[48] = "icon.png";
		}

		if (await pkg.hasResource("icon64.png")) {
			addon.icons[64] = "icon64.png";
		}

		return addon;
	},

	loadScope(addon) {
		const file = addon.file || addon._sourceBundle;
		const uri = getURIForResourceInFile(file, "bootstrap.js").spec;
		const principal = Services.scriptSecurityManager.getSystemPrincipal();

		const sandbox = new Cu.Sandbox(principal, {
			sandboxName: uri,
			addonId: addon.id,
			wantGlobalProperties: ["ChromeUtils"],
			metadata: { addonID: addon.id, URI: uri },
		});

		try {
			Object.assign(sandbox, BOOTSTRAP_REASONS);

			ChromeUtils.defineLazyGetter(
				sandbox,
				"console",
				() => new ConsoleAPI({ consoleID: `addon/${addon.id}` }),
			);

			Services.scriptloader.loadSubScript(uri, sandbox);
		} catch (e) {
			logger.warn(`Error loading bootstrap.js for ${addon.id}`, e);
		}

		function findMethod(name) {
			if (sandbox[name]) {
				return sandbox[name];
			}

			try {
				const method = Cu.evalInSandbox(name, sandbox);
				return method;
			} catch (err) {}

			return () => {
				logger.warn(`Add-on ${addon.id} is missing bootstrap method ${name}`);
			};
		}

		const install = findMethod("install");
		const uninstall = findMethod("uninstall");
		const startup = findMethod("startup");
		const shutdown = findMethod("shutdown");

		return {
			install(...args) {
				install(...args);
				// Forget any cached files we might've had from this extension.
				Services.obs.notifyObservers(null, "startupcache-invalidate");
			},

			uninstall(...args) {
				uninstall(...args);
				// Forget any cached files we might've had from this extension.
				Services.obs.notifyObservers(null, "startupcache-invalidate");
			},

			startup(...args) {
				if (addon.type == "extension") {
					logger.debug(`Registering manifest for ${file.path}\n`);
					Components.manager.addBootstrappedManifestLocation(file);
				}
				return startup(...args);
			},

			shutdown(data, reason) {
				try {
					return shutdown(data, reason);
				} catch (err) {
					throw err;
				} finally {
					if (reason != BOOTSTRAP_REASONS.APP_SHUTDOWN) {
						logger.debug(`Removing manifest for ${file.path}\n`);
						Components.manager.removeBootstrappedManifestLocation(file);
					}
				}
			},
		};
	},
};

AddonManager.addExternalExtensionLoader(BootstrapLoader);

if (AddonManager.isReady) {
	AddonManager.getAllAddons().then((addons) => {
		addons.forEach((addon) => {
			if (
				addon.type == "extension" &&
				!addon.isWebExtension &&
				!addon.userDisabled
			) {
				addon.reload();
			}
		});
	});
}
