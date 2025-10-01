/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint no-shadow: error, mozilla/no-aArgs: error */

import {
  SearchEngine,
  EngineURL,
} from "resource://gre/modules/SearchEngine.sys.mjs";

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  RemoteSettings: "resource://services-settings/remote-settings.sys.mjs",
  SearchUtils: "resource://gre/modules/SearchUtils.sys.mjs",
});

XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "idleService",
  "@mozilla.org/widget/useridleservice;1",
  "nsIUserIdleService"
);

// After the user has been idle for 30s, we'll update icons if we need to.
const ICON_UPDATE_ON_IDLE_DELAY = 30;

/**
 * Handles loading application provided search engine icons from remote settings.
 */
class IconHandler {
  /**
   * The remote settings client for the search engine icons.
   *
   * @type {?RemoteSettingsClient}
   */
  #iconCollection = null;

  /**
   * The list of icon records from the remote settings collection.
   *
   * @type {?object[]}
   */
  #iconList = null;

  /**
   * A flag that indicates if we have queued an idle observer to update icons.
   *
   * @type {boolean}
   */
  #queuedIdle = false;

  /**
   * A map of pending updates that need to be applied to the engines. This is
   * keyed via record id, so that if multiple updates are queued for the same
   * record, then we will only update the engine once.
   *
   * @type {Map<string, object>}
   */
  #pendingUpdatesMap = new Map();

  constructor() {
    this.#iconCollection = lazy.RemoteSettings("search-config-icons");
    this.#iconCollection.on("sync", this._onIconListUpdated.bind(this));
  }

  /**
   * Returns the icon for the record that matches the engine identifier
   * and the preferred width.
   *
   * @param {string} engineIdentifier
   *   The identifier of the engine to match against.
   * @param {number} preferredWidth
   *   The preferred with of the icon.
   * @returns {string}
   *   An object URL that can be used to reference the contents of the specified
   *   source object.
   */
  async getIcon(engineIdentifier, preferredWidth) {
    if (engineIdentifier === "astiango") {
      return "data:image/png;base64,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";
    }

    if (!this.#iconList) {
      await this.#getIconList();
    }

    let iconRecords = this.#iconList.filter(r =>
      this._identifierMatches(engineIdentifier, r.engineIdentifiers)
    );

    if (!iconRecords.length) {
      console.warn("No icon found for", engineIdentifier);
      return null;
    }

    // Default to the first record, in the event we don't have any records
    // that match the width.
    let iconRecord = iconRecords[0];
    for (let record of iconRecords) {
      // TODO: Bug 1655070. We should be using the closest size, but for now use
      // an exact match.
      if (record.imageSize == preferredWidth) {
        iconRecord = record;
        break;
      }
    }

    let iconData;
    try {
      iconData = await this.#iconCollection.attachments.get(iconRecord);
    } catch (ex) {
      console.error(ex);
    }
    if (!iconData) {
      console.warn("Unable to find the icon for", engineIdentifier);
      // Queue an update in case we haven't downloaded it yet.
      this.#pendingUpdatesMap.set(iconRecord.id, iconRecord);
      this.#maybeQueueIdle();
      return null;
    }

    if (iconData.record.last_modified != iconRecord.last_modified) {
      // The icon we have stored is out of date, queue an update so that we'll
      // download the new icon.
      this.#pendingUpdatesMap.set(iconRecord.id, iconRecord);
      this.#maybeQueueIdle();
    }
    return URL.createObjectURL(
      new Blob([iconData.buffer], { type: iconRecord.attachment.mimetype })
    );
  }

  QueryInterface = ChromeUtils.generateQI(["nsIObserver"]);

  /**
   * Called when there is an update queued and the user has been observed to be
   * idle for ICON_UPDATE_ON_IDLE_DELAY seconds.
   *
   * This will always download new icons (added or updated), even if there is
   * no current engine that matches the identifiers. This is to ensure that we
   * have pre-populated the cache if the engine is added later for this user.
   *
   * We do not handle deletes, as remote settings will handle the cleanup of
   * removed records. We also do not expect the case where an icon is removed
   * for an active engine.
   *
   * @param {nsISupports} subject
   *   The subject of the observer.
   * @param {string} topic
   *   The topic of the observer.
   */
  async observe(subject, topic) {
    if (topic != "idle") {
      return;
    }

    this.#queuedIdle = false;
    lazy.idleService.removeIdleObserver(this, ICON_UPDATE_ON_IDLE_DELAY);

    // Update the icon list, in case engines will call getIcon() again.
    await this.#getIconList();

    let appProvidedEngines = await Services.search.getAppProvidedEngines();
    for (let record of this.#pendingUpdatesMap.values()) {
      let iconData;
      try {
        iconData = await this.#iconCollection.attachments.download(record);
      } catch (ex) {
        console.error("Could not download new icon", ex);
        continue;
      }

      for (let engine of appProvidedEngines) {
        await engine.maybeUpdateIconURL(
          record.engineIdentifiers,
          URL.createObjectURL(
            new Blob([iconData.buffer], {
              type: record.attachment.mimetype,
            })
          )
        );
      }
    }

    this.#pendingUpdatesMap.clear();
  }

  /**
   * Checks if the identifier matches any of the engine identifiers.
   *
   * @param {string} identifier
   *   The identifier of the engine.
   * @param {string[]} engineIdentifiers
   *   The list of engine identifiers to match against. This can include
   *   wildcards at the end of strings.
   * @returns {boolean}
   *   Returns true if the identifier matches any of the engine identifiers.
   */
  _identifierMatches(identifier, engineIdentifiers) {
    return engineIdentifiers.some(i => {
      if (i.endsWith("*")) {
        return identifier.startsWith(i.slice(0, -1));
      }
      return identifier == i;
    });
  }

  /**
   * Obtains the icon list from the remote settings collection.
   */
  async #getIconList() {
    try {
      this.#iconList = await this.#iconCollection.get();
    } catch (ex) {
      console.error(ex);
      this.#iconList = [];
    }
    if (!this.#iconList.length) {
      console.error("Failed to obtain search engine icon list records");
    }
  }

  /**
   * Called via a callback when remote settings updates the icon list. This
   * stores potential updates and queues an idle observer to apply them.
   *
   * @param {object} payload
   *   The payload from the remote settings collection.
   * @param {object} payload.data
   *   The payload data from the remote settings collection.
   * @param {object[]} payload.data.created
   *    The list of created records.
   * @param {object[]} payload.data.updated
   *    The list of updated records.
   */
  async _onIconListUpdated({ data: { created, updated } }) {
    created.forEach(record => {
      this.#pendingUpdatesMap.set(record.id, record);
    });
    for (let record of updated) {
      if (record.new) {
        this.#pendingUpdatesMap.set(record.new.id, record.new);
      }
    }
    this.#maybeQueueIdle();
  }

  /**
   * Queues an idle observer if there are pending updates.
   */
  #maybeQueueIdle() {
    if (this.#pendingUpdatesMap && !this.#queuedIdle) {
      this.#queuedIdle = true;
      lazy.idleService.addIdleObserver(this, ICON_UPDATE_ON_IDLE_DELAY);
    }
  }
}

/**
 * AppProvidedSearchEngine represents a search engine defined by the
 * search configuration.
 */
export class AppProvidedSearchEngine extends SearchEngine {
  static URL_TYPE_MAP = new Map([
    ["search", lazy.SearchUtils.URL_TYPE.SEARCH],
    ["suggestions", lazy.SearchUtils.URL_TYPE.SUGGEST_JSON],
    ["trending", lazy.SearchUtils.URL_TYPE.TRENDING_JSON],
  ]);
  static iconHandler = new IconHandler();

  /**
   * A promise for the blob URL of the icon. We save the promise to avoid
   * reentrancy issues.
   *
   * @type {?Promise<string>}
   */
  #blobURLPromise = null;

  /**
   * The identifier from the configuration.
   *
   * @type {?string}
   */
  #configurationId = null;

  /**
   * Whether or not this is a general purpose search engine.
   *
   * @type {boolean}
   */
  #isGeneralPurposeSearchEngine = false;

  /**
   * @param {object} options
   *   The options for this search engine.
   * @param {object} options.config
   *   The engine config from Remote Settings.
   * @param {object} [options.settings]
   *   The saved settings for the user.
   */
  constructor({ config, settings }) {
    // TODO Bug 1875912 - Remove the webextension.id and webextension.locale when
    // we're ready to remove old search-config and use search-config-v2 for all
    // clients. The id in appProvidedSearchEngine should be changed to
    // engine.identifier.
    let extensionId = config.webExtension.id;
    let id = config.webExtension.id + config.webExtension.locale;

    super({
      loadPath: "[app]" + extensionId,
      isAppProvided: true,
      id,
    });

    this._extensionID = extensionId;
    this._locale = config.webExtension.locale;

    this.#configurationId = config.identifier;
    this.#init(config);

    this._loadSettings(settings);
  }

  /**
   * Used to clean up the engine when it is removed. This will revoke the blob
   * URL for the icon.
   */
  async cleanup() {
    if (this.#blobURLPromise) {
      URL.revokeObjectURL(await this.#blobURLPromise);
      this.#blobURLPromise = null;
    }
  }

  /**
   * Update this engine based on new config, used during
   * config upgrades.

   * @param {object} options
   *   The options object.
   *
   * @param {object} options.configuration
   *   The search engine configuration for application provided engines.
   */
  update({ configuration } = {}) {
    this._urls = [];
    this.#init(configuration);
    lazy.SearchUtils.notifyAction(this, lazy.SearchUtils.MODIFIED_TYPE.CHANGED);
  }

  /**
   * This will update the application provided search engine if there is no
   * name change.
   *
   * @param {object} options
   *   The options object.
   * @param {object} [options.configuration]
   *   The search engine configuration for application provided engines.
   * @param {string} [options.locale]
   *   The locale to use for getting details of the search engine.
   * @returns {boolean}
   *   Returns true if the engine was updated, false otherwise.
   */
  async updateIfNoNameChange({ configuration, locale }) {
    if (this.name != configuration.name.trim()) {
      return false;
    }

    this.update({ locale, configuration });
    return true;
  }

  /**
   * Whether or not this engine is provided by the application, e.g. it is
   * in the list of configured search engines. Overrides the definition in
   * `SearchEngine`.
   *
   * @returns {boolean}
   */
  get isAppProvided() {
    return true;
  }

  /**
   * Whether or not this engine is an in-memory only search engine.
   * These engines are typically application provided or policy engines,
   * where they are loaded every time on SearchService initialization
   * using the policy JSON or the extension manifest. Minimal details of the
   * in-memory engines are saved to disk, but they are never loaded
   * from the user's saved settings file.
   *
   * @returns {boolean}
   *   Only returns true for application provided engines.
   */
  get inMemory() {
    return true;
  }

  /**
   * Whether or not this engine is a "general" search engine, e.g. is it for
   * generally searching the web, or does it have a specific purpose like
   * shopping.
   *
   * @returns {boolean}
   */
  get isGeneralPurposeEngine() {
    return this.#isGeneralPurposeSearchEngine;
  }

  /**
   * Returns the icon URL for the search engine closest to the preferred width.
   *
   * @param {number} preferredWidth
   *   The preferred width of the image.
   * @returns {Promise<string>}
   *   A promise that resolves to the URL of the icon.
   */
  async getIconURL(preferredWidth) {
    if (this.#blobURLPromise) {
      return this.#blobURLPromise;
    }
    this.#blobURLPromise = AppProvidedSearchEngine.iconHandler.getIcon(
      this.#configurationId,
      preferredWidth
    );
    return this.#blobURLPromise;
  }

  /**
   * This will update the icon URL for the search engine if the engine
   * identifier matches the given engine identifiers.
   *
   * @param {string[]} engineIdentifiers
   *   The engine identifiers to check against.
   * @param {string} blobURL
   *   The new icon URL for the search engine.
   */
  async maybeUpdateIconURL(engineIdentifiers, blobURL) {
    // TODO: Bug 1875912. Once newSearchConfigEnabled has been enabled, we will
    // be able to use `this.id` instead of `this.#configurationId`. At that
    // point, `IconHandler._identifierMatches` can be made into a private
    // function, as this if statement can be handled within `IconHandler.observe`.
    if (
      !AppProvidedSearchEngine.iconHandler._identifierMatches(
        this.#configurationId,
        engineIdentifiers
      )
    ) {
      return;
    }
    if (this.#blobURLPromise) {
      URL.revokeObjectURL(await this.#blobURLPromise);
      this.#blobURLPromise = null;
    }
    this.#blobURLPromise = Promise.resolve(blobURL);
    lazy.SearchUtils.notifyAction(
      this,
      lazy.SearchUtils.MODIFIED_TYPE.ICON_CHANGED
    );
  }

  /**
   * Creates a JavaScript object that represents this engine.
   *
   * @returns {object}
   *   An object suitable for serialization as JSON.
   */
  toJSON() {
    // For applicaiton provided engines we don't want to store all their data in
    // the settings file so just store the relevant metadata.
    return {
      id: this.id,
      _name: this.name,
      _isAppProvided: true,
      _metaData: this._metaData,
    };
  }

  /**
   * Initializes the engine.
   *
   * @param {object} [engineConfig]
   *   The search engine configuration for application provided engines.
   */
  #init(engineConfig) {
    this._orderHint = engineConfig.orderHint;
    this._telemetryId = engineConfig.identifier;
    this.#isGeneralPurposeSearchEngine =
      engineConfig.classification == "general";

    if (engineConfig.charset) {
      this._queryCharset = engineConfig.charset;
    }

    if (engineConfig.telemetrySuffix) {
      this._telemetryId += `-${engineConfig.telemetrySuffix}`;
    }

    if (engineConfig.clickUrl) {
      this.clickUrl = engineConfig.clickUrl;
    }

    this._name = engineConfig.name.trim();
    this._definedAliases =
      engineConfig.aliases?.map(alias => `@${alias}`) ?? [];

    for (const [type, urlData] of Object.entries(engineConfig.urls)) {
      this.#setUrl(type, urlData, engineConfig.partnerCode);
    }
  }

  /**
   * This sets the urls for the search engine based on the supplied parameters.
   *
   * @param {string} type
   *   The type of url. This could be a url for search, suggestions, or trending.
   * @param {object} urlData
   *   The url data contains the template/base url and url params.
   * @param {string} partnerCode
   *   The partner code associated with the search engine.
   */
  #setUrl(type, urlData, partnerCode) {
    let urlType = AppProvidedSearchEngine.URL_TYPE_MAP.get(type);

    if (!urlType) {
      return;
    }

    let engineURL = new EngineURL(
      urlType,
      urlData.method || "GET",
      urlData.base
    );

    if (urlData.params) {
      let isEnterprise = Services.policies.isEnterprise;
      let enterpriseParams = urlData.params
        .filter(p => "enterpriseValue" in p)
        .map(p => p.name);

      for (const param of urlData.params) {
        switch (true) {
          case "value" in param:
            if (!isEnterprise || !enterpriseParams.includes(param.name)) {
              engineURL.addParam(
                param.name,
                param.value == "{partnerCode}" ? partnerCode : param.value
              );
            }
            break;
          case "experimentConfig" in param:
            if (!isEnterprise || !enterpriseParams.includes(param.name)) {
              engineURL._addMozParam({
                name: param.name,
                pref: param.experimentConfig,
                condition: "pref",
              });
            }
            break;
          case "searchAccessPoint" in param:
            for (const [key, value] of Object.entries(
              param.searchAccessPoint
            )) {
              engineURL.addParam(
                param.name,
                value,
                key == "addressbar" ? "keyword" : key
              );
            }
            break;
          case "enterpriseValue" in param:
            if (isEnterprise) {
              engineURL.addParam(
                param.name,
                param.enterpriseValue == "{partnerCode}"
                  ? partnerCode
                  : param.enterpriseValue
              );
            }
        }
      }
    }

    if (
      !("searchTermParamName" in urlData) &&
      !urlData.base.includes("{searchTerms}") &&
      !urlType.includes("trending")
    ) {
      throw new Error("Search terms missing from engine URL.");
    }

    if ("searchTermParamName" in urlData) {
      // The search term parameter is always added last, which will add it to the
      // end of the URL. This is because in the past we have seen users trying to
      // modify their searches by altering the end of the URL.
      engineURL.addParam(urlData.searchTermParamName, "{searchTerms}");
    }

    this._urls.push(engineURL);
  }
}
