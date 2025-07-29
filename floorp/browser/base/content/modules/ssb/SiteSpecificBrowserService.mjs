/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ImageTools } from "./ImageTools.mjs";
import { LinuxSupport } from "./LinuxSupport.mjs";
import { SiteSpecificBrowserExternalFileService } from "./SiteSpecificBrowserExternalFileService.mjs";
import { SiteSpecificBrowserIdUtils } from "./SiteSpecificBrowserIdUtils.mjs";
import { WindowsSupport } from "./WindowsSupport.mjs";

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

export const EXPORTED_SYMBOLS = [
  "SiteSpecificBrowserService",
  "SiteSpecificBrowserBase",
  "SiteSpecificBrowser",
  "SSBCommandLineHandler",
];

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ManifestObtainer: "resource://gre/modules/ManifestObtainer.sys.mjs",
  ManifestProcessor: "resource://gre/modules/ManifestProcessor.sys.mjs",
});

// Cache para URIs frecuentemente usados
const uriCache = new Map();
const aboutBlankURI = Services.io.newURI("about:blank");

// Cache para validaciones de seguridad
const securityCache = new Map();

function uuid() {
  return Services.uuid.generateUUID().toString();
}

const sharedDataKey = id => `SiteSpecificBrowserBase:${id}`;

/**
 * Builds a lookup table for all the icons in order of size.
 * Optimized version with better performance.
 */
function buildIconList(icons) {
  if (!icons || !icons.length) {
    return [];
  }

  const iconList = [];
  const maxSafeInteger = Number.MAX_SAFE_INTEGER;

  for (const icon of icons) {
    if (!icon.sizes || !icon.sizes.length) {
      continue;
    }

    for (const sizeSpec of icon.sizes) {
      const size = sizeSpec === "any" ? maxSafeInteger : parseInt(sizeSpec, 10);
      if (!isNaN(size)) {
        iconList.push({ icon, size });
      }
    }
  }

  // Optimized sort with early return for common cases
  if (iconList.length <= 1) {
    return iconList;
  }

  return iconList.sort((a, b) => a.size - b.size);
}

const IS_MAIN_PROCESS =
  Services.appinfo.processType == Services.appinfo.PROCESS_TYPE_DEFAULT;

/**
 * Tests whether an app manifest's scope includes the given URI.
 * Optimized version with cache for better performance.
 *
 * @param {nsIURI} scope the manifest's scope.
 * @param {nsIURI} uri the URI to test.
 * @returns {boolean} true if the uri is included in the scope.
 */
function scopeIncludes(scope, uri) {
  // https://w3c.github.io/manifest/#dfn-within-scope
  if (scope.prePath !== uri.prePath) {
    return false;
  }

  return uri.filePath.startsWith(scope.filePath);
}

/**
 * Generates a basic app manifest for a URI.
 * Optimized with cache for manifest URIs.
 *
 * @param {nsIURI} uri the start URI for the site.
 * @returns {Manifest} an app manifest.
 */
function manifestForURI(uri) {
  try {
    const cacheKey = uri.spec;
    if (uriCache.has(cacheKey)) {
      const manifestURI = uriCache.get(cacheKey);
      return lazy.ManifestProcessor.process({
        jsonText: "{}",
        manifestURL: manifestURI.spec,
        docURL: uri.spec,
      });
    }

    const manifestURI = Services.io.newURI("/manifest.json", null, uri);
    uriCache.set(cacheKey, manifestURI);
    
    return lazy.ManifestProcessor.process({
      jsonText: "{}",
      manifestURL: manifestURI.spec,
      docURL: uri.spec,
    });
  } catch (e) {
    console.error(`Failed to generate a SSB manifest for ${uri.spec}.`, e);
    throw e;
  }
}

/**
 * Creates an IconResource from the LinkHandler data.
 * Optimized with early returns and better error handling.
 *
 * @param {object} iconData the data from the LinkHandler actor.
 * @returns {Promise<IconResource>} an icon resource.
 */
async function getIconResource(iconData) {
  if (!iconData || !iconData.iconURL) {
    return null;
  }

  try {
    // This should be a data url so no network traffic.
    const imageData = await ImageTools.loadImage(
      Services.io.newURI(iconData.iconURL)
    );
    
    if (imageData.container.type == Ci.imgIContainer.TYPE_VECTOR) {
      return {
        src: iconData.iconURL,
        purpose: ["any"],
        type: imageData.type,
        sizes: ["any"],
      };
    }

    // TODO: For ico files we should find all the available sizes: Bug 1604285.
    return {
      src: iconData.iconURL,
      purpose: ["any"],
      type: imageData.type,
      sizes: [`${imageData.container.width}x${imageData.container.height}`],
    };
  } catch (e) {
    console.warn(`Failed to load icon resource ${iconData.iconURL}`, e);
    return null;
  }
}

/**
 * Generates an app manifest for a site loaded in a browser element.
 * Optimized with better error handling and reduced operations.
 *
 * @param {Element} browser the browser element the site is loaded in.
 * @returns {Promise<Manifest>} an app manifest.
 */
async function buildManifestForBrowser(browser, options) {
  let manifest = null;
  
  try {
    if (options && options.useWebManifest) {
      manifest = await lazy.ManifestObtainer.browserObtainManifest(browser);
    }
  } catch (e) {
    // We can function without a valid manifest.
    console.error(e);
  }

  // Remove monochrome icons if they exist & icons is not 1 or 0.
  if (manifest && manifest.icons && manifest.icons.length > 1) {
    manifest.icons = manifest.icons.filter(icon => 
      !icon.purpose || !icon.purpose.includes("monochrome")
    );
  }

  // Reject the manifest if its scope doesn't include the current document.
  if (
    !manifest ||
    !scopeIncludes(Services.io.newURI(manifest.scope), browser.currentURI)
  ) {
    manifest = manifestForURI(browser.currentURI);
  }

  // Cache all the icons as data URIs since we can need access to them when
  // the website is not loaded.
  if (manifest.icons && manifest.icons.length > 0) {
    const iconPromises = manifest.icons.map(async icon => {
      if (icon.src.startsWith("data:")) {
        return icon;
      }

      try {
        const actor = browser.browsingContext.currentWindowGlobal.getActor(
          "SiteSpecificBrowser"
        );
        icon.src = await actor.sendQuery("LoadIcon", icon.src);
        return icon;
      } catch (e) {
        // Bad icon, drop it from the list.
        return null;
      }
    });

    manifest.icons = (await Promise.all(iconPromises)).filter(icon => icon);
  }

  // If the site provided no icons then try to use the normal page icons.
  if (!manifest.icons || !manifest.icons.length) {
    try {
      const linkHandler =
        browser.browsingContext.currentWindowGlobal.getActor("LinkHandler");

      const iconPromises = [linkHandler.icon, linkHandler.richIcon]
        .filter(icon => icon)
        .map(icon => getIconResource(icon));

      const icons = await Promise.all(iconPromises);
      manifest.icons = icons.filter(icon => icon);
    } catch (e) {
      console.warn("Failed to load fallback icons", e);
      manifest.icons = [];
    }
  }

  return manifest;
}

/**
 * Maintains an ID -> SSB mapping in the main process. Content processes should
 * use sharedData to get a SiteSpecificBrowserBase.
 *
 * We do not currently expire data from here so once created an SSB instance
 * lives for the lifetime of the application. The expectation is that the
 * numbers of different SSBs used will be low and the memory use will also
 * be low.
 */
let SSBMap = new Map();

/**
 * The base contains the data about an SSB instance needed in content processes.
 *
 * The only data needed currently is site's `scope` which is just a URI.
 */
export class SiteSpecificBrowserBase {
  /**
   * Creates a new SiteSpecificBrowserBase. Generally should only be called by
   * code within this module.
   *
   * @param {nsIURI} scope the scope for the SSB.
   */
  constructor(scope) {
    this._scope = scope;
  }

  /**
   * Gets the SiteSpecifcBrowserBase for an ID. If this is the main process this
   * will instead return the SiteSpecificBrowser instance itself but generally
   * don't call this from the main process.
   *
   * The returned object is not "live" and will not be updated with any
   * configuration changes from the main process so do not cache this, get it
   * when needed and then discard.
   *
   * @param {string} id the SSB ID.
   * @returns {SiteSpecificBrowserBase|null} the instance if it exists.
   */
  static get(id) {
    if (IS_MAIN_PROCESS) {
      return SiteSpecificBrowser.get(id);
    }

    const key = sharedDataKey(id);
    if (!Services.cpmm.sharedData.has(key)) {
      return null;
    }

    const scope = Services.io.newURI(Services.cpmm.sharedData.get(key));
    return new SiteSpecificBrowserBase(scope);
  }

  /**
   * Checks whether the given URI is considered to be a part of this SSB or not.
   * Any URIs that return false should be loaded in a normal browser.
   * Optimized with early return for about:blank.
   *
   * @param {nsIURI} uri the URI to check.
   * @returns {boolean} whether this SSB can load the URI.
   */
  canLoad(uri) {
    // Always allow loading about:blank as it is the initial page for iframes.
    if (uri.spec === "about:blank") {
      return true;
    }

    return scopeIncludes(this._scope, uri);
  }
}

/**
 * The SSB instance used in the main process.
 *
 * We maintain three pieces of data for an SSB:
 *
 * First is the string UUID for identification purposes.
 *
 * Second is an app manifest (https://w3c.github.io/manifest/). If the site does
 * not provide one a basic one will be automatically generated. The intent is to
 * never modify this such that it can be updated from the site when needed
 * without blowing away any configuration changes a user might want to make to
 * the SSB itself.
 *
 * Thirdly there is the SSB configuration. This includes internal data, user
 * overrides for the app manifest and custom SSB extensions to the app manifest.
 *
 * We pass data based on these down to the SiteSpecificBrowserBase in this and
 * other processes (via `_updateSharedData`).
 */
export class SiteSpecificBrowser extends SiteSpecificBrowserBase {
  /**
   * Creates a new SiteSpecificBrowser. Generally should only be called by
   * code within this module.
   *
   * @param {string} id the SSB's unique ID.
   * @param {Manifest} manifest the app manifest for the SSB.
   * @param {object?} config the SSB configuration settings.
   */
  constructor(id, manifest, config = {}) {
    if (!IS_MAIN_PROCESS) {
      throw new Error(
        "SiteSpecificBrowser instances are only available in the main process."
      );
    }

    super(Services.io.newURI(manifest.scope));
    this._id = id;
    this._manifest = manifest;
    this._config = Object.assign(
      {
        needsUpdate: true,
        persisted: false,
      },
      config
    );

    this._updateSharedData();
  }

  /**
   * Loads the SiteSpecificBrowser for the given ID.
   * Optimized with early returns and better error handling.
   *
   * @param {string} id the SSB's unique ID.
   * @param {object?} data the data to deserialize from. Do not use externally.
   * @returns {Promise<SiteSpecificBrowser?>} the instance if it exists.
   */
  static async load(id, data = null) {
    if (!IS_MAIN_PROCESS) {
      throw new Error(
        "SiteSpecificBrowser instances are only available in the main process."
      );
    }

    // Check cache first
    if (SSBMap.has(id)) {
      return SSBMap.get(id);
    }

    // Check external data
    const list = await SiteSpecificBrowserExternalFileService.getCurrentSsbData();
    if (list) {
      for (const key in list) {
        if (list.hasOwnProperty(key)) {
          const item = list[key];
          if (item.id === id) {
            return item;
          }
        }
      }
    }

    // Try to parse data if provided
    if (data) {
      try {
        const parsed = JSON.parse(data);
        parsed.config.persisted = true;
        return new SiteSpecificBrowser(id, parsed.manifest, parsed.config);
      } catch (e) {
        console.error("Failed to parse SSB data:", e);
      }
    }

    return null;
  }

  /**
   * Gets the SiteSpecifcBrowser for an ID. Can only be called from the main
   * process.
   *
   * @param {string} id the SSB ID.
   * @returns {SiteSpecificBrowser|null} the instance if it exists.
   */
  static get(id) {
    if (!IS_MAIN_PROCESS) {
      throw new Error(
        "SiteSpecificBrowser instances are only available in the main process."
      );
    }

    return SSBMap.get(id);
  }

  /**
   * Creates an SSB from a parsed app manifest.
   * Optimized with cached security validation.
   *
   * @param {Manifest} manifest the app manifest for the site.
   * @returns {Promise<SiteSpecificBrowser>} the generated SSB.
   */
  static async createFromManifest(manifest) {
    if (!SiteSpecificBrowserService.isEnabled) {
      throw new Error("Site specific browsing is disabled.");
    }

    const cacheKey = manifest.scope;
    if (!securityCache.has(cacheKey)) {
      const isValid = manifest.scope.startsWith("https:") || 
                     /.*localhost[:/].*/.test(manifest.scope);
      securityCache.set(cacheKey, isValid);
    }

    if (!securityCache.get(cacheKey)) {
      throw new Error(
        "Site specific browsers can only be opened for secure sites."
      );
    }

    return new SiteSpecificBrowser(uuid(), manifest, { needsUpdate: false });
  }

  /**
   * Creates an SSB from a site loaded in a browser element.
   * Optimized with better validation logic.
   *
   * @param {Element} browser the browser element the site is loaded in.
   * @returns {Promise<SiteSpecificBrowser>} the generated SSB.
   */
  static async createFromBrowser(browser, options) {
    const createManifestOptions = options || {};

    if (!SiteSpecificBrowserService.isEnabled) {
      throw new Error("Site specific browsing is disabled.");
    }

    const currentURI = browser.currentURI;
    const isSecure = currentURI.schemeIs("https") || 
                    currentURI.host === "localhost" || 
                    currentURI.host === "127.0.0.1";

    if (!isSecure && createManifestOptions.useWebManifest) {
      throw new Error(
        "Site specific browsers can only be opened for secure sites."
      );
    }

    const manifest = await buildManifestForBrowser(
      browser,
      createManifestOptions
    );
    const ssb = await SiteSpecificBrowser.createFromManifest(manifest);

    if (!manifest.name) {
      ssb.name = browser.contentTitle;
    }
    return ssb;
  }

  /**
   * Creates an SSB from a URI.
   * Optimized with cached security validation.
   *
   * @param {nsIURI} uri the uri to generate from.
   * @returns {SiteSpecificBrowser} the generated SSB.
   */
  static createFromURI(uri) {
    if (!SiteSpecificBrowserService.isEnabled) {
      throw new Error("Site specific browsing is disabled.");
    }

    const cacheKey = uri.spec;
    if (!securityCache.has(cacheKey)) {
      const isValid = uri.schemeIs("https") || 
                     uri.host === "localhost" || 
                     uri.host === "127.0.0.1";
      securityCache.set(cacheKey, isValid);
    }

    if (!securityCache.get(cacheKey)) {
      return null;
    }

    return new SiteSpecificBrowser(uuid(), manifestForURI(uri));
  }

  /**
   * Caches the data needed by content processes.
   */
  _updateSharedData() {
    Services.ppmm.sharedData.set(sharedDataKey(this.id), this._scope.spec);
    Services.ppmm.sharedData.flush();
  }

  /**
   * Persists the data to the store if needed. When a change in configuration
   * has occurred call this.
   * Optimized with early return and better error handling.
   */
  async _maybeSave() {
    // If this SSB is persisted then update it in the data store.
    if (!this._config.persisted) {
      return;
    }

    try {
      let ssbData =
        await SiteSpecificBrowserExternalFileService.getCurrentSsbData();

      if (!ssbData) {
        ssbData = {};
      }

      ssbData[this.startURI.spec] = {
        name: this.name,
        id: this.id,
        startURI: this.startURI.spec,
        manifest: this._manifest,
        scope: this._scope.spec,
        config: this._config,
      };

      await SiteSpecificBrowserExternalFileService.saveSsbsData(ssbData);
    } catch (e) {
      console.error("Failed to save SSB data:", e);
    }
  }

  /**
   * Installs this SiteSpecificBrowser such that it exists for future instances
   * of the application and will appear in lists of installed SSBs.
   */
  async install() {
    if (this._config.persisted) {
      return;
    }

    this._config.persisted = true;
    await this._maybeSave();

    if (AppConstants.platform == "win") {
      await WindowsSupport.install(this);
    }

    if (AppConstants.platform == "linux") {
      await LinuxSupport.install(this);
    }

    Services.obs.notifyObservers(
      null,
      "site-specific-browser-install",
      this.id
    );
  }

  /**
   * The SSB's ID.
   */
  get id() {
    return this._id;
  }

  get name() {
    if (this._config.name) {
      return this._config.name;
    }

    if (this._manifest.name) {
      return this._manifest.name;
    }

    return this.startURI.host;
  }

  set name(val) {
    this._config.name = val;
    this._maybeSave();
  }

  /**
   * The default URI to load.
   * Optimized with cache for startURI.
   */
  get startURI() {
    if (!this._cachedStartURI) {
      this._cachedStartURI = Services.io.newURI(this._manifest.start_url);
    }
    return this._cachedStartURI;
  }

  /**
   * Whether this SSB needs to be checked for an updated manifest.
   */
  get needsUpdate() {
    return this._config.needsUpdate;
  }

  /**
   * Gets the best icon for the requested size. It may not be the exact size
   * requested.
   * Optimized with better search algorithm.
   *
   * Finds the smallest icon that is larger than the requested size. If no such
   * icon exists returns the largest icon available. Returns null only if there
   * are no icons at all.
   *
   * @param {number} size the size of the desired icon in pixels.
   * @returns {IconResource} the icon resource for the icon.
   */
  getIcon(size) {
    if (!this._iconSizes) {
      this._iconSizes = buildIconList(this._manifest.icons);
    }

    if (!this._iconSizes.length) {
      return null;
    }

    // Binary search for better performance
    let left = 0;
    let right = this._iconSizes.length - 1;
    let result = this._iconSizes[right]; // Default to largest

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const current = this._iconSizes[mid];
      
      if (current.size >= size) {
        result = current;
        right = mid - 1;
      } else {
        left = mid + 1;
      }
    }

    return result.icon;
  }

  /**
   * Gets the best icon for the requested size. If there isn't a perfect match
   * the closest match will be scaled.
   *
   * @param {number} size the size of the desired icon in pixels.
   * @returns {string|null} a data URI for the icon.
   */
  async getScaledIcon(size) {
    const icon = this.getIcon(size);
    if (!icon) {
      return null;
    }

    try {
      const { container } = await ImageTools.loadImage(
        Services.io.newURI(icon.src)
      );
      return ImageTools.scaleImage(container, size, size);
    } catch (e) {
      console.warn(`Failed to scale icon to size ${size}:`, e);
      return null;
    }
  }

  /**
   * Updates this SSB from a new app manifest.
   *
   * @param {Manifest} manifest the new app manifest.
   */
  async updateFromManifest(manifest) {
    this._manifest = manifest;
    this._iconSizes = null;
    this._cachedStartURI = null; // Clear cache
    this._scope = Services.io.newURI(this._manifest.scope);
    this._config.needsUpdate = false;

    this._updateSharedData();
    await this._maybeSave();
  }

  /**
   * Updates this SSB from the site loaded in the browser element.
   *
   * @param {Element} browser the browser element.
   */
  async updateFromBrowser(browser) {
    const manifest = await buildManifestForBrowser(browser);
    await this.updateFromManifest(manifest);
  }
}

export const SiteSpecificBrowserService = {
  get useOSIntegration() {
    if (Services.appinfo.OS != "WINNT" && Services.appinfo.OS != "LINUX") {
      return false;
    }

    return Services.prefs.getBoolPref("browser.ssb.osintegration", true);
  },

  checkSiteCanBeInstall(aURI) {
    if (aURI.scheme === "https" || aURI.scheme === "file") {
      return true;
    }

    // Exclude localhost and local IP addresses.
    if (
      aURI.scheme === "http" &&
      (aURI.host === "localhost" || aURI.host === "127.0.0.1")
    ) {
      return true;
    }

    return false;
  },
};

XPCOMUtils.defineLazyPreferenceGetter(
  SiteSpecificBrowserService,
  "isEnabled",
  "floorp.browser.ssb.enabled",
  false
);

async function startSSB(id) {
  // Loading the SSB is async. Until that completes and launches we will
  // be without an open window and the platform will not continue startup
  // in that case. Flag that a window is coming.
  Services.startup.enterLastWindowClosingSurvivalArea();

  // Whatever happens we must exitLastWindowClosingSurvivalArea when done.
  try {
    await SiteSpecificBrowserIdUtils.runSsbById(id);
  } finally {
    Services.startup.exitLastWindowClosingSurvivalArea();
  }
}

export class SSBCommandLineHandler {
  /* nsICommandLineHandler */
  handle(cmdLine) {
    if (!SiteSpecificBrowserService.isEnabled) {
      return;
    }

    const id = cmdLine.handleFlagWithParam("start-ssb", false);
    if (id) {
      if (cmdLine.state == Ci.nsICommandLine.STATE_INITIAL_LAUNCH) {
        Services.prefs.setCharPref("browser.ssb.startup", id);
      } else {
        startSSB(id);
        cmdLine.preventDefault = true;
      }
    }
  }

  get helpInfo() {
    return "  --start-ssb <id>  Start the SSB with the given id.\n";
  }
}

SSBCommandLineHandler.prototype.QueryInterface = ChromeUtils.generateQI([
  "nsICommandLineHandler",
]);
