/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const {
  LegacyMigration,
  MIGRATION_VERSION,
  mapLegacyLists,
  parseLegacyWhitelist,
} = ChromeUtils.importESModule(
  "resource:///modules/internal/LegacyMigration.sys.mjs"
);
const { ListStore } = ChromeUtils.importESModule(
  "resource:///modules/internal/ListStore.sys.mjs"
);

do_get_profile();

const PREF_MIGRATION_VERSION = "midori.blocker.legacyMigrationVersion";
const PREF_MIGRATION_NOTICE = "midori.blocker.legacyMigrationNotice";
const PREF_ENABLED_LISTS = "midori.blocker.enabledLists";
const PREF_FILTER_LIST_URLS = "midori.blocker.filterListUrls";
const PREF_CUSTOM_FILTERS_ENABLED = "midori.blocker.customFiltersEnabled";
const PREF_SHOW_BADGE = "midori.blocker.showBadge";
const UUID_MAP_PREF = "extensions.webextensions.uuids";

function legacyExtensionId() {
  return `midori-protection${String.fromCharCode(64)}astian.org`;
}

registerCleanupFunction(async () => {
  for (const pref of [
    PREF_MIGRATION_VERSION,
    PREF_MIGRATION_NOTICE,
    PREF_ENABLED_LISTS,
    PREF_FILTER_LIST_URLS,
    PREF_CUSTOM_FILTERS_ENABLED,
    PREF_SHOW_BADGE,
    UUID_MAP_PREF,
  ]) {
    Services.prefs.clearUserPref(pref);
  }
  await IOUtils.remove(ListStore.cacheRootPath(), {
    ignoreAbsent: true,
    recursive: true,
  });
  await IOUtils.remove(
    PathUtils.join(
      PathUtils.profileDir,
      "browser-extension-data",
      legacyExtensionId()
    ),
    { ignoreAbsent: true, recursive: true }
  );
});

add_task(function test_whitelist_migration_separates_lossy_directives() {
  const result = parseLegacyWhitelist([
    "example.com",
    "sub.example.org",
    "*",
    "moz-extension-scheme",
    ".astian.org",
    "/tracking\\.example/",
    "https://page.example/path",
    "# retained only in the backup",
  ]);

  Assert.deepEqual(
    result.domains,
    ["example.com", "sub.example.org"],
    "Only losslessly representable host directives should migrate"
  );
  Assert.ok(result.globallyDisabled, "The global disable directive migrates");
  Assert.deepEqual(
    result.unsupported,
    ["/tracking\\.example/", "https://page.example/path"],
    "Regular expressions and page-scoped directives should be backed up"
  );
});

add_task(function test_list_migration_preserves_selection_and_custom_urls() {
  const customEnabled = "https://lists.example/enabled.txt";
  const customDisabled = "https://lists.example/disabled.txt";
  const result = mapLegacyLists(
    ["easylist", "spa-0", "POL-3", "user-filters", customEnabled],
    [customEnabled, customDisabled],
    ""
  );

  Assert.ok(result.hasSelection, "An explicit old selection should migrate");
  Assert.ok(result.overrides["core-easylist"], "Enabled core lists migrate");
  Assert.ok(result.overrides["regional-spanish"], "Enabled regional lists migrate");
  Assert.ok(
    !result.overrides["core-easyprivacy"],
    "Explicitly disabled integrated lists remain disabled"
  );
  Assert.ok(result.userFiltersEnabled, "The custom filter state migrates");
  Assert.ok(
    result.customUrls.includes(customEnabled),
    "Enabled custom lists migrate"
  );
  Assert.ok(
    result.customUrls.includes(
      "https://hole.cert.pl/domains/v2/domains_ublock.txt"
    ),
    "Selected legacy lists without a native equivalent retain their source"
  );
  Assert.deepEqual(
    result.disabledCustomUrls,
    [customDisabled],
    "Disabled custom lists are retained in the migration backup"
  );
});

add_task(function test_missing_selection_does_not_override_defaults() {
  const result = mapLegacyLists(undefined, [], "");
  Assert.ok(!result.hasSelection, "Missing old state is not a selection");
  Assert.deepEqual(result.overrides, {}, "Native defaults remain untouched");
  Assert.ok(result.userFiltersEnabled, "Native custom filters keep their default");
});

add_task(async function test_complete_json_storage_migration_and_backup() {
  const id = legacyExtensionId();
  const uuid = "9ba3c263-54d8-4c03-a8cb-07e9ca9c7591";
  Services.prefs.setStringPref(UUID_MAP_PREF, JSON.stringify({ [id]: uuid }));

  const storageDir = PathUtils.join(
    PathUtils.profileDir,
    "browser-extension-data",
    id
  );
  await IOUtils.makeDirectory(storageDir, { createAncestors: true });
  await IOUtils.writeUTF8(
    PathUtils.join(storageDir, "storage.js"),
    JSON.stringify({
      dynamicFilteringString: "example.com * 3p block",
      externalLists: "https://lists.example/custom.txt",
      importedLists: ["https://lists.example/custom.txt"],
      netWhitelist: ["allowed.example", "https://page.example/path"],
      selectedFilterLists: [
        "easylist",
        "spa-0",
        "user-filters",
        "https://lists.example/custom.txt",
      ],
      showIconBadge: false,
      "user-filters": "||user-rule.example^",
      version: "2.3.11",
    })
  );

  const migratedDomains = [];
  const result = await LegacyMigration.migrate({
    listStore: ListStore,
    siteExceptions: {
      addPermanentSiteException(domain) {
        migratedDomains.push(domain);
      },
    },
  });

  Assert.equal(
    Services.prefs.getIntPref(PREF_MIGRATION_VERSION),
    MIGRATION_VERSION,
    "A complete migration should be recorded"
  );
  Assert.deepEqual(
    migratedDomains,
    ["allowed.example"],
    "Lossless site exceptions should migrate"
  );
  Assert.ok(!Services.prefs.getBoolPref(PREF_SHOW_BADGE), "Badge state migrates");
  Assert.ok(
    Services.prefs.getBoolPref(PREF_CUSTOM_FILTERS_ENABLED),
    "Custom filter activation migrates"
  );
  Assert.equal(
    await ListStore.getCustomFiltersText(),
    "||user-rule.example^\n",
    "Custom filters migrate into the native profile file"
  );

  const overrides = JSON.parse(
    Services.prefs.getStringPref(PREF_ENABLED_LISTS)
  );
  Assert.ok(overrides["core-easylist"], "Enabled integrated lists migrate");
  Assert.ok(!overrides["core-easyprivacy"], "Disabled integrated lists migrate");
  Assert.deepEqual(
    JSON.parse(Services.prefs.getStringPref(PREF_FILTER_LIST_URLS)),
    ["https://lists.example/custom.txt"],
    "Enabled custom list URLs migrate"
  );

  const notice = JSON.parse(
    Services.prefs.getStringPref(PREF_MIGRATION_NOTICE)
  );
  Assert.ok(notice.unsupportedCount >= 2, "Lossy rules produce a user notice");
  Assert.equal(notice.backupPath, result.backupPath, "The notice links the backup");
  Assert.ok(await IOUtils.exists(result.backupPath), "The backup is written first");
  const backup = JSON.parse(await IOUtils.readUTF8(result.backupPath));
  Assert.equal(backup.sourceExtensionId, id, "The backup identifies its source");
  Assert.equal(
    backup.storage["user-filters"],
    "||user-rule.example^",
    "The original custom filters remain recoverable"
  );
});

add_task(async function test_corrupt_storage_is_retried_without_data_loss() {
  Services.prefs.clearUserPref(PREF_MIGRATION_VERSION);
  const storagePath = PathUtils.join(
    PathUtils.profileDir,
    "browser-extension-data",
    legacyExtensionId(),
    "storage.js"
  );
  await IOUtils.writeUTF8(storagePath, "{broken");

  await Assert.rejects(
    LegacyMigration.migrate({
      listStore: ListStore,
      siteExceptions: { addPermanentSiteException() {} },
    }),
    /Unable to read previous blocker storage/,
    "Corrupt previous storage should abort migration"
  );
  Assert.equal(
    Services.prefs.getIntPref(PREF_MIGRATION_VERSION, 0),
    0,
    "Failed migration remains pending for a later retry"
  );
});
