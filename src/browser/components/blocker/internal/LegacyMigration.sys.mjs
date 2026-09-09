/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ExtensionCommon } from "resource://gre/modules/ExtensionCommon.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  ExtensionStorageIDB: "resource://gre/modules/ExtensionStorageIDB.sys.mjs",
});

export const LEGACY_WIDGET_ID =
  "midori-protection_astian_org-browser-action";
export const MIGRATION_VERSION = 1;

const PREF_MIGRATION_VERSION = "midori.blocker.legacyMigrationVersion";
const PREF_MIGRATION_NOTICE = "midori.blocker.legacyMigrationNotice";
const PREF_ENABLED = "midori.blocker.enabled";
const PREF_SHOW_BADGE = "midori.blocker.showBadge";
const PREF_ENABLED_LISTS = "midori.blocker.enabledLists";
const PREF_FILTER_LIST_URLS = "midori.blocker.filterListUrls";
const PREF_CUSTOM_FILTERS_ENABLED = "midori.blocker.customFiltersEnabled";
const UUID_MAP_PREF = "extensions.webextensions.uuids";
const IDB_MIGRATED_PREF_BRANCH =
  "extensions.webextensions.ExtensionStorageIDB.migrated";
const WEBEXT_STORAGE_USER_CONTEXT_ID = -1 >>> 0;
const BACKUP_FILE_NAME = "legacy-blocker-backup.json";

const STORAGE_KEYS = [
  "dynamicFilteringString",
  "externalLists",
  "hostnameSwitchesString",
  "importedLists",
  "netWhitelist",
  "selectedFilterLists",
  "showIconBadge",
  "urlFilteringString",
  "user-filters",
  "userFiltersTrusted",
  "version",
];

const DEFAULT_DYNAMIC_RULES = new Set([
  "behind-the-scene * * noop",
  "behind-the-scene * image noop",
  "behind-the-scene * 3p noop",
  "behind-the-scene * inline-script noop",
  "behind-the-scene * 1p-script noop",
  "behind-the-scene * 3p-script noop",
  "behind-the-scene * 3p-frame noop",
]);

const DEFAULT_HOSTNAME_SWITCHES = new Set([
  "no-large-media: behind-the-scene false",
  "no-csp-reports: * true",
]);

const LEGACY_LIST_GROUPS = {
  "core-easylist": ["easylist"],
  "core-easyprivacy": ["easyprivacy"],
  "core-ublock-filters": ["ublock-filters"],
  "core-ublock-quick-fixes": ["ublock-quick-fixes"],
  "core-ublock-unbreak": ["ublock-unbreak"],
  "privacy-ublock-badware": ["ublock-badware"],
  "privacy-ublock-privacy": ["ublock-privacy"],
  "peter-lowe-adservers": ["plowe-0"],
  "annoyances-easylist-cookie": ["fanboy-cookiemonster"],
  "annoyances-ublock-cookies": [
    "ublock-cookies-adguard",
    "ublock-cookies-easylist",
  ],
  "regional-arabic": ["ara-0"],
  "regional-bulgarian": ["BGR-0"],
  "regional-chinese": ["CHN-0"],
  "regional-czech-slovak": ["CZE-0"],
  "regional-dutch": ["NLD-0"],
  "regional-estonian": ["EST-0"],
  "regional-finnish": ["FIN-0"],
  "regional-french": ["FRA-0"],
  "regional-german": ["DEU-0"],
  "regional-hebrew": ["ISR-0"],
  "regional-hindi": ["IND-0"],
  "regional-hungarian": ["HUN-0"],
  "regional-icelandic": ["ISL-0"],
  "regional-indonesian": ["IDN-0"],
  "regional-italian": ["ITA-0"],
  "regional-japanese": ["JPN-1"],
  "regional-latvian": ["LVA-0"],
  "regional-lithuanian": ["LTU-0"],
  "regional-macedonian": ["MKD-0"],
  "regional-nordic": ["NOR-0"],
  "regional-persian": ["IRN-0"],
  "regional-polish": ["POL-0"],
  "regional-romanian": ["ROU-1"],
  "regional-russian-ruadlist": ["RUS-0", "RUS-1"],
  "regional-slovenian": ["SVN-0"],
  "regional-spanish": ["spa-0"],
  "regional-spanish-portuguese": ["spa-1"],
  "regional-swedish": ["SWE-1"],
  "regional-thai": ["THA-0"],
  "regional-turkish": ["TUR-0"],
  "regional-vietnamese": ["VIE-1"],
  "optional-fanboy-social": ["fanboy-social"],
  "optional-fanboy-newsletter": ["easylist-newsletters"],
  "optional-fanboy-chat-apps": ["easylist-chat"],
  "optional-fanboy-mobile-notifications": ["easylist-notifications"],
};

const LEGACY_LIST_SOURCES = {
  "ALB-0":
    "https://raw.githubusercontent.com/AnXh3L0/blocklist/master/albanian-easylist-addition/Albania.txt",
  "GRC-0": "https://www.void.gr/kargig/void-gr-filters.txt",
  "HRV-0":
    "https://raw.githubusercontent.com/DandelionSprout/adfilt/master/SerboCroatianList.txt",
  "KOR-1":
    "https://cdn.jsdelivr.net/npm/@list-kr/filterslists@latest/dist/filterslist-uBlockOrigin-classic.txt",
  "POL-3": "https://hole.cert.pl/domains/v2/domains_ublock.txt",
  "UKR-0": "https://filters.adtidy.org/extension/ublock/filters/23.txt",
  "adguard-cookies": "https://filters.adtidy.org/extension/ublock/filters/18.txt",
  "adguard-generic":
    "https://filters.adtidy.org/extension/ublock/filters/2_without_easylist.txt",
  "adguard-mobile": "https://filters.adtidy.org/extension/ublock/filters/11.txt",
  "adguard-mobile-app-banners":
    "https://filters.adtidy.org/extension/ublock/filters/20.txt",
  "adguard-other-annoyances":
    "https://filters.adtidy.org/extension/ublock/filters/21.txt",
  "adguard-popup-overlays":
    "https://filters.adtidy.org/extension/ublock/filters/19.txt",
  "adguard-social": "https://filters.adtidy.org/extension/ublock/filters/4.txt",
  "adguard-spyware-url":
    "https://ublockorigin.github.io/uAssets/filters/privacy-removeparam.txt",
  "adguard-widgets": "https://filters.adtidy.org/extension/ublock/filters/22.txt",
  "block-lan": "https://ublockorigin.github.io/uAssets/filters/lan-block.txt",
  "curben-phishing":
    "https://malware-filter.gitlab.io/phishing-filter/phishing-filter.txt",
  "dpollock-0": "https://someonewhocares.org/hosts/hosts",
  "easylist-annoyances":
    "https://ublockorigin.github.io/uAssets/thirdparties/easylist-annoyances.txt",
  "fanboy-ai-suggestions":
    "https://ublockorigin.github.io/uAssets/thirdparties/easylist-ai.txt",
  "fanboy-thirdparty_social":
    "https://secure.fanboy.co.nz/fanboy-antifacebook.txt",
  "ublock-annoyances":
    "https://ublockorigin.github.io/uAssets/filters/annoyances.txt",
  "ublock-badlists":
    "https://ublockorigin.github.io/uAssets/filters/badlists.txt",
  "ublock-experimental":
    "https://ublockorigin.github.io/uAssets/filters/experimental.txt",
  "urlhaus-1":
    "https://malware-filter.gitlab.io/urlhaus-filter/urlhaus-filter-ag-online.txt",
};

const LEGACY_INTEGRATED_LIST_KEYS = new Set([
  ...Object.values(LEGACY_LIST_GROUPS).flat(),
  ...Object.keys(LEGACY_LIST_SOURCES),
  "user-filters",
]);

function parseObjectPref(name, fallback) {
  try {
    const parsed = JSON.parse(Services.prefs.getStringPref(name, ""));
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

function splitLines(value) {
  if (Array.isArray(value)) {
    return value.map(entry => String(entry || "").trim()).filter(Boolean);
  }
  return String(value || "")
    .split(/[\r\n]+/)
    .map(entry => entry.trim())
    .filter(Boolean);
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" ? url.href : "";
  } catch (_) {
    return "";
  }
}

function nonDefaultRules(value, defaults = null) {
  return splitLines(value).filter(line => !defaults?.has(line));
}

export function parseLegacyWhitelist(value) {
  const domains = [];
  const unsupported = [];
  let globallyDisabled = false;

  for (const directive of splitLines(value)) {
    if (directive.startsWith("#")) {
      continue;
    }
    if (directive === "*") {
      globallyDisabled = true;
      continue;
    }
    if (
      directive === "chrome-extension-scheme" ||
      directive === "moz-extension-scheme" ||
      directive === ".astian.org" ||
      directive === ".astiango.com"
    ) {
      continue;
    }
    if (/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(directive)) {
      domains.push(directive.toLowerCase());
      continue;
    }
    unsupported.push(directive);
  }

  return {
    domains: [...new Set(domains)],
    globallyDisabled,
    unsupported,
  };
}

export function mapLegacyLists(selectedValue, importedValue, externalValue) {
  if (!Array.isArray(selectedValue)) {
    return {
      customUrls: [],
      disabledCustomUrls: [],
      hasSelection: false,
      overrides: {},
      unsupported: [],
      userFiltersEnabled: true,
    };
  }

  const selected = new Set(selectedValue.map(value => String(value)));
  const overrides = {};
  for (const [nativeId, legacyKeys] of Object.entries(LEGACY_LIST_GROUPS)) {
    overrides[nativeId] = legacyKeys.some(key => selected.has(key));
  }

  const imported = new Set([
    ...splitLines(importedValue),
    ...splitLines(externalValue),
  ]);
  const customUrls = new Set();
  const disabledCustomUrls = [];
  const unsupported = [];

  for (const key of selected) {
    const directUrl = safeHttpsUrl(key);
    if (directUrl) {
      customUrls.add(directUrl);
      continue;
    }
    if (LEGACY_INTEGRATED_LIST_KEYS.has(key)) {
      const fallbackUrl = safeHttpsUrl(LEGACY_LIST_SOURCES[key]);
      if (fallbackUrl) {
        customUrls.add(fallbackUrl);
      }
      continue;
    }
    unsupported.push(key);
  }

  for (const value of imported) {
    if (value.startsWith("!") || value.startsWith("#")) {
      continue;
    }
    const url = safeHttpsUrl(value);
    if (!url) {
      unsupported.push(value);
    } else if (selected.has(value) || selected.has(url)) {
      customUrls.add(url);
    } else {
      disabledCustomUrls.push(url);
    }
  }

  return {
    customUrls: [...customUrls],
    disabledCustomUrls: [...new Set(disabledCustomUrls)],
    hasSelection: true,
    overrides,
    unsupported: [...new Set(unsupported)],
    userFiltersEnabled: selected.has("user-filters"),
  };
}

function getIdentityFromUuidMap() {
  const uuidMap = parseObjectPref(UUID_MAP_PREF, {});
  for (const [id, uuid] of Object.entries(uuidMap)) {
    if (
      `${ExtensionCommon.makeWidgetId(id)}-browser-action` ===
      LEGACY_WIDGET_ID
    ) {
      return { id, uuid: String(uuid || "") };
    }
  }
  return null;
}

async function getIdentityFromJsonStorage() {
  const root = PathUtils.join(PathUtils.profileDir, "browser-extension-data");
  if (!(await IOUtils.exists(root))) {
    return null;
  }

  for (const path of await IOUtils.getChildren(root)) {
    const id = PathUtils.filename(path);
    if (
      `${ExtensionCommon.makeWidgetId(id)}-browser-action` ===
        LEGACY_WIDGET_ID &&
      (await IOUtils.exists(PathUtils.join(path, "storage.js")))
    ) {
      return { id, uuid: "" };
    }
  }
  return null;
}

export async function findLegacyExtensionIdentity() {
  return getIdentityFromUuidMap() || (await getIdentityFromJsonStorage());
}

async function readJsonStorage(id) {
  const path = PathUtils.join(
    PathUtils.profileDir,
    "browser-extension-data",
    id,
    "storage.js"
  );
  if (!(await IOUtils.exists(path))) {
    return {};
  }

  const parsed = JSON.parse(await IOUtils.readUTF8(path));
  return parsed && typeof parsed === "object" ? parsed : {};
}

async function readIdbStorage({ id, uuid }) {
  if (
    !uuid ||
    !Services.prefs.getBoolPref(
      `${IDB_MIGRATED_PREF_BRANCH}.${id}`,
      false
    )
  ) {
    return {};
  }

  let policy = WebExtensionPolicy.getByID(id);
  let temporaryPolicy = false;
  if (!policy) {
    policy = new WebExtensionPolicy({
      id,
      mozExtensionHostname: uuid,
      baseURL: "resource://gre/",
      version: "1",
      allowedOrigins: new MatchPatternSet([]),
      localizeCallback: () => "",
    });
    policy.active = true;
    temporaryPolicy = true;
  }

  try {
    const principal =
      Services.scriptSecurityManager.createContentPrincipal(
        Services.io.newURI(policy.getURL()),
        { userContextId: WEBEXT_STORAGE_USER_CONTEXT_ID }
      );
    const db = await lazy.ExtensionStorageIDB.open(principal, false);
    try {
      return await db.get(STORAGE_KEYS);
    } finally {
      db.close();
    }
  } finally {
    if (temporaryPolicy) {
      policy.active = false;
    }
  }
}

async function readLegacyStorage(identity) {
  const [jsonResult, idbResult] = await Promise.allSettled([
    readJsonStorage(identity.id),
    readIdbStorage(identity),
  ]);

  const errors = [jsonResult, idbResult]
    .filter(result => result.status === "rejected")
    .map(result => result.reason);
  if (errors.length) {
    throw new AggregateError(
      errors,
      "Unable to read previous blocker storage"
    );
  }

  const jsonData = jsonResult.value;
  const idbData = idbResult.value;
  const storage = { ...jsonData, ...idbData };
  const selected = {};
  for (const key of STORAGE_KEYS) {
    if (Object.hasOwn(storage, key)) {
      selected[key] = storage[key];
    }
  }
  return selected;
}

function migrationBackupPath(listStore) {
  return PathUtils.join(listStore.cacheRootPath(), BACKUP_FILE_NAME);
}

async function writeBackup(listStore, identity, storage, analysis) {
  await listStore.ensureRootDir();
  const path = migrationBackupPath(listStore);
  const backup = {
    formatVersion: 1,
    migratedAt: new Date().toISOString(),
    sourceExtensionId: identity.id,
    sourceVersion: String(storage.version || ""),
    storage,
    unsupported: analysis,
  };
  await IOUtils.writeUTF8(path, JSON.stringify(backup, null, 2), {
    tmpPath: `${path}.tmp`,
  });
  return path;
}

function mergeCustomFilters(current, previous) {
  const existing = String(current || "").trim();
  const legacy = String(previous || "").trim();
  if (!legacy || existing === legacy || existing.includes(legacy)) {
    return existing;
  }
  if (!existing) {
    return legacy;
  }
  return `${existing}\n\n! Migrated rules\n${legacy}`;
}

function baseDomain(host) {
  const normalized = String(host || "").replace(/^\[|\]$/g, "");
  try {
    return Services.eTLD.getBaseDomainFromHost(normalized);
  } catch (_) {
    return normalized;
  }
}

export const LegacyMigration = {
  async migrate({ listStore, siteExceptions }) {
    if (
      Services.prefs.getIntPref(PREF_MIGRATION_VERSION, 0) >=
      MIGRATION_VERSION
    ) {
      return null;
    }

    const identity = await findLegacyExtensionIdentity();
    if (!identity) {
      Services.prefs.setIntPref(PREF_MIGRATION_VERSION, MIGRATION_VERSION);
      return null;
    }

    const storage = await readLegacyStorage(identity);
    const whitelist = parseLegacyWhitelist(storage.netWhitelist);
    const lists = mapLegacyLists(
      storage.selectedFilterLists,
      storage.importedLists,
      storage.externalLists
    );
    const unsupported = {
      customFilters: [],
      disabledCustomLists: lists.disabledCustomUrls,
      dynamicRules: nonDefaultRules(
        storage.dynamicFilteringString,
        DEFAULT_DYNAMIC_RULES
      ),
      hostnameSwitches: nonDefaultRules(
        storage.hostnameSwitchesString,
        DEFAULT_HOSTNAME_SWITCHES
      ),
      listKeys: lists.unsupported,
      urlRules: nonDefaultRules(storage.urlFilteringString),
      whitelistDirectives: whitelist.unsupported,
    };
    if (storage.userFiltersTrusted === true) {
      unsupported.customFilters.push("trusted-filter-capability");
    }

    let mergedFilters = null;
    if (typeof storage["user-filters"] === "string") {
      try {
        const currentFilters = await listStore.getCustomFiltersText();
        mergedFilters = listStore.normalizeCustomFiltersText(
          mergeCustomFilters(currentFilters, storage["user-filters"])
        );
      } catch (err) {
        unsupported.customFilters.push(
          String(err?.message || "custom-filters-could-not-be-migrated")
        );
      }
    }
    const backupPath = await writeBackup(
      listStore,
      identity,
      storage,
      unsupported
    );

    for (const domain of whitelist.domains) {
      siteExceptions.addPermanentSiteException(baseDomain(domain));
    }

    if (
      whitelist.globallyDisabled &&
      !Services.prefs.prefHasUserValue(PREF_ENABLED)
    ) {
      Services.prefs.setBoolPref(PREF_ENABLED, false);
    }
    if (
      typeof storage.showIconBadge === "boolean" &&
      !Services.prefs.prefHasUserValue(PREF_SHOW_BADGE)
    ) {
      Services.prefs.setBoolPref(PREF_SHOW_BADGE, storage.showIconBadge);
    }

    if (lists.hasSelection) {
      const currentOverrides = parseObjectPref(PREF_ENABLED_LISTS, {});
      Services.prefs.setStringPref(
        PREF_ENABLED_LISTS,
        JSON.stringify({ ...lists.overrides, ...currentOverrides })
      );

      const currentUrls = parseObjectPref(PREF_FILTER_LIST_URLS, []);
      const mergedUrls = [
        ...(Array.isArray(currentUrls) ? currentUrls : []),
        ...lists.customUrls,
      ];
      Services.prefs.setStringPref(
        PREF_FILTER_LIST_URLS,
        JSON.stringify([...new Set(mergedUrls)])
      );
      if (!Services.prefs.prefHasUserValue(PREF_CUSTOM_FILTERS_ENABLED)) {
        Services.prefs.setBoolPref(
          PREF_CUSTOM_FILTERS_ENABLED,
          lists.userFiltersEnabled
        );
      }
    }

    if (mergedFilters !== null) {
      await listStore.setCustomFiltersText(mergedFilters);
    }

    const unsupportedCount = Object.values(unsupported).reduce(
      (count, entries) => count + entries.length,
      0
    );
    Services.prefs.setStringPref(
      PREF_MIGRATION_NOTICE,
      JSON.stringify({
        backupPath,
        migrated: true,
        unsupportedCount,
      })
    );
    Services.prefs.setIntPref(PREF_MIGRATION_VERSION, MIGRATION_VERSION);

    return { backupPath, unsupportedCount };
  },
};
