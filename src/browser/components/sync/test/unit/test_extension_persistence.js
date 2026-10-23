/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_setup, add_task, registerCleanupFunction */

const { AddonTestUtils } = ChromeUtils.importESModule("resource://testing-common/AddonTestUtils.sys.mjs");
const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
const { XPIExports } = ChromeUtils.importESModule("resource://gre/modules/addons/XPIExports.sys.mjs");
const addonId = "@sync-persistence-fixture";
const databasePath = PathUtils.join(PathUtils.profileDir, "extensions.json");
const startupPath = PathUtils.join(PathUtils.profileDir, "addonStartup.json.lz4");
const saveBoth = async () => {
  await XPIExports.XPIDatabase.saveSyncChanges();
  await XPIExports.XPIInternal.XPIStates.saveSyncChanges();
};
const saved = async () => (await IOUtils.readJSON(databasePath)).addons.find(addon => addon.id === addonId);
const installFixture = async (id = addonId) => {
  const xpi = AddonTestUtils.createTempWebExtensionFile({ manifest: {
    manifest_version: 2, name: "Sync persistence fixture", version: "1",
    browser_specific_settings: { gecko: { id } },
  } });
  await AddonTestUtils.promiseInstallFile(xpi);
};

add_setup(async function prepare_real_addon_manager() {
  AddonTestUtils.init(globalThis);
  AddonTestUtils.overrideCertDB();
  AddonTestUtils.createAppInfo("xpcshell@tests.mozilla.org", "XPCShell", "1", "42");
  await AddonTestUtils.promiseStartupManager();
  registerCleanupFunction(() => AddonTestUtils.promiseShutdownManager());
  await installFixture();
});

add_task(async function enabling_and_disabling_are_saved_to_both_native_files() {
  const addon = await AddonManager.getAddonByID(addonId);
  Assert.ok(addon);
  Assert.equal(XPIExports.XPIDatabase.getSyncAddonByID(addonId).syncGUID, addon.syncGUID);
  Assert.equal(XPIExports.XPIDatabase.getSyncAddonByID("@absent-sync-fixture"), null);
  for (const enabled of [false, true]) {
    await (enabled ? addon.enable() : addon.disable());
    await saveBoth();
    Assert.equal((await saved()).userDisabled, !enabled);
    const startup = await IOUtils.readJSON(startupPath, { decompress: true });
    const entry = Object.values(startup).map(location => location.addons?.[addonId]).find(Boolean);
    Assert.ok(entry, "A received extension has a native startup entry");
    Assert.equal(entry.enabled, enabled);
  }
});

add_task(async function database_write_errors_reject_and_an_unchanged_native_value_can_retry() {
  const db = XPIExports.XPIDatabase;
  const addon = await AddonManager.getAddonByID(addonId);
  const failingPath = PathUtils.join(PathUtils.profileDir, "extension-database-is-a-directory");
  await IOUtils.makeDirectory(failingPath);
  const before = await saved();
  const original = db.jsonFilePath;
  try {
    db.jsonFilePath = failingPath;
    await addon.disable();
    await Assert.rejects(db.saveSyncChanges(), /Error/);
    Assert.equal((await saved()).userDisabled, before.userDisabled, "A failed write preserves the previous native database");
    Assert.equal((await AddonManager.getAddonByID(addonId)).userDisabled, true);
  } finally { db.jsonFilePath = original; }
  await saveBoth();
  Assert.equal((await saved()).userDisabled, true);
  Assert.equal(db.lastError, null, "A successful retry clears the earlier save error");
});

add_task(async function startup_write_errors_reject_without_finalizing_the_producer() {
  const states = XPIExports.XPIInternal.XPIStates;
  await saveBoth();
  const file = states._jsonFile;
  const original = file.path;
  const failingPath = PathUtils.join(PathUtils.profileDir, "extension-startup-is-a-directory");
  await IOUtils.makeDirectory(failingPath);
  try {
    file.path = failingPath;
    await Assert.rejects(states.saveSyncChanges(), /Error/);
  } finally { file.path = original; }
  await saveBoth();
  const addon = await AddonManager.getAddonByID(addonId);
  await addon.enable();
  await saveBoth();
  Assert.equal((await saved()).userDisabled, false, "The native producer accepts later changes after the retry");
});

add_task(async function concurrent_barriers_and_a_restart_preserve_the_current_extension_state() {
  const addon = await AddonManager.getAddonByID(addonId);
  await addon.disable();
  const first = saveBoth();
  await addon.enable();
  await Promise.all([first, saveBoth(), saveBoth()]);
  Assert.equal((await saved()).userDisabled, false);
  await AddonTestUtils.promiseRestartManager();
  await XPIExports.XPIDatabase.asyncLoadDB();
  Assert.equal((await AddonManager.getAddonByID(addonId)).userDisabled, false);
  await saveBoth();
  Assert.equal((await saved()).userDisabled, false);
});

add_task(async function ordinary_profiles_do_not_create_sync_uninstall_metadata() {
  await (await AddonManager.getAddonByID(addonId)).uninstall();
  await saveBoth();
  Assert.equal((await IOUtils.readJSON(databasePath)).midoriSync, undefined);
  Assert.equal(XPIExports.XPIDatabase.getSyncAddonState(addonId), null);
  await installFixture();
});

add_task(async function tracked_user_uninstalls_retain_their_cause_and_reinstall_clears_it() {
  await XPIExports.XPIDatabase.trackSyncAddon(addonId);
  Assert.deepEqual(XPIExports.XPIDatabase.getSyncAddonState(addonId), { tracked: true, removal: null });
  await (await AddonManager.getAddonByID(addonId)).uninstall();
  await saveBoth();
  Assert.equal(await AddonManager.getAddonByID(addonId), null);
  const proof = XPIExports.XPIDatabase.getSyncAddonState(addonId).removal;
  Assert.equal(proof.source, "user");
  Assert.ok(/^[a-f0-9-]{36}$/.test(proof.token));
  Assert.deepEqual((await IOUtils.readJSON(databasePath)).midoriSync.removals, [proof]);
  await AddonTestUtils.promiseRestartManager();
  await XPIExports.XPIDatabase.asyncLoadDB();
  Assert.deepEqual(XPIExports.XPIDatabase.getSyncAddonState(addonId).removal, proof);
  await installFixture();
  await saveBoth();
  Assert.deepEqual(XPIExports.XPIDatabase.getSyncAddonState(addonId), { tracked: true, removal: null });
  Assert.deepEqual((await IOUtils.readJSON(databasePath)).midoriSync.removals, []);
});

add_task(async function administrative_and_received_sync_removals_do_not_claim_user_intent() {
  for (const syncSource of ["policy", "sync"]) {
    await (await AddonManager.getAddonByID(addonId)).uninstall(false, { syncSource });
    await saveBoth();
    Assert.equal(XPIExports.XPIDatabase.getSyncAddonState(addonId).removal.source, syncSource);
    await AddonTestUtils.promiseRestartManager();
  await XPIExports.XPIDatabase.asyncLoadDB();
    Assert.equal(XPIExports.XPIDatabase.getSyncAddonState(addonId).removal.source, syncSource);
    await installFixture();
    await saveBoth();
    Assert.equal(XPIExports.XPIDatabase.getSyncAddonState(addonId).removal, null);
  }
});

add_task(async function undo_invalidates_the_removal_and_a_failed_intent_write_keeps_the_addon() {
  const addon = await AddonManager.getAddonByID(addonId);
  await addon.uninstall(true);
  Assert.ok(addon.pendingOperations & AddonManager.PENDING_UNINSTALL);
  Assert.equal(XPIExports.XPIDatabase.getSyncAddonState(addonId).removal.source, "user");
  addon.cancelUninstall();
  await saveBoth();
  Assert.equal(XPIExports.XPIDatabase.getSyncAddonState(addonId).removal, null);
  await AddonTestUtils.promiseRestartManager();
  await XPIExports.XPIDatabase.asyncLoadDB();
  const db = XPIExports.XPIDatabase;
  const original = db.jsonFilePath;
  try {
    db.jsonFilePath = PathUtils.join(PathUtils.profileDir, "extension-database-is-a-directory");
    await Assert.rejects((await AddonManager.getAddonByID(addonId)).uninstall(), /Error/);
    Assert.ok(await AddonManager.getAddonByID(addonId), "Failure to persist the removal intent stops the physical uninstall");
    Assert.ok(await saved(), "The previous native database still contains the installed extension");
  } finally { db.jsonFilePath = original; }
  await saveBoth();
});

add_task(async function future_metadata_is_preserved_by_native_edits_and_blocks_old_sync_readers() {
  const db = XPIExports.XPIDatabase;
  const previous = structuredClone(db._syncMetadata);
  const future = { version: 2, tracked: [addonId], newField: { preserve: true } };
  try {
    db._syncMetadata = structuredClone(future);
    await (await AddonManager.getAddonByID(addonId)).disable();
    await saveBoth();
    Assert.deepEqual((await IOUtils.readJSON(databasePath)).midoriSync, future);
    Assert.throws(() => db.getSyncAddonState(addonId), /Unsupported/);
    await Assert.rejects(db.trackSyncAddon(addonId), /Unsupported/);
  } finally {
    db._syncMetadata = previous;
    await (await AddonManager.getAddonByID(addonId)).enable();
    await saveBoth();
  }
});

add_task(async function concurrent_registration_preserves_each_extension_identity() {
  const ids = ["@sync-persistence-concurrent-a", "@sync-persistence-concurrent-b"];
  for (const id of ids) { await installFixture(id); }
  await Promise.all(ids.map(id => XPIExports.XPIDatabase.trackSyncAddon(id)));
  const metadata = (await IOUtils.readJSON(databasePath)).midoriSync;
  Assert.equal(new Set(metadata.tracked).size, metadata.tracked.length);
  for (const id of [addonId, ...ids]) {
    Assert.ok(metadata.tracked.includes(id));
    Assert.deepEqual(XPIExports.XPIDatabase.getSyncAddonState(id), { tracked: true, removal: null });
  }
});

add_task(async function a_signature_exemption_never_becomes_an_official_catalog_extension() {
  const db = XPIExports.XPIDatabase;
  const internal = [...db.addonDB.values()].find(addon => addon.id === addonId);
  const signedState = internal.signedState;
  try {
    internal.signedState = AddonManager.SIGNEDSTATE_NOT_REQUIRED;
    const addon = await AddonManager.getAddonByID(addonId);
    Assert.ok(addon.isCorrectlySigned, "Gecko's exemption flag alone does not prove a catalog signature");
    await Assert.rejects(db.trackSyncAddon(addonId), /non-portable/);
    await addon.uninstall();
    await saveBoth();
    Assert.equal(db.getSyncAddonState(addonId).removal.source, "unknown",
      "Removing an unsupported local replacement cannot delete the earlier official extension on other devices");
  } finally {
    internal.signedState = signedState;
    if (!await AddonManager.getAddonByID(addonId)) { await installFixture(); }
    await saveBoth();
  }
});

add_task(async function received_uninstalls_preserve_local_data_but_remove_permission_grants() {
  const { ExtensionStorage } = ChromeUtils.importESModule("resource://gre/modules/ExtensionStorage.sys.mjs");
  const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
  const { Management } = ChromeUtils.importESModule("resource://gre/modules/Extension.sys.mjs");
  const id = "@sync-local-extension-data";
  for (const source of ["sync", "user", "policy", "unknown"]) {
    await installFixture(id);
    await XPIExports.XPIDatabase.trackSyncAddon(id);
    const uuid = JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))[id];
    Assert.ok(uuid);
    await ExtensionStorage.set(id, { retained: "this device only" });
    await (await ExtensionStorage.getFile(id)).saveNow();
    await ExtensionPermissions.add(id, { permissions: ["clipboardWrite"], origins: [] });
    const cleaned = new Promise(resolve => Management.once("cleanupAfterUninstall", (_event, addon, tasks) => {
      Assert.equal(addon, id);
      resolve(Promise.all(tasks.map(task => task.promise)));
    }));
    await (await AddonManager.getAddonByID(id)).uninstall(false, { syncSource: source });
    await cleaned;
    await saveBoth();
    const uuids = JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"));
    Assert.equal(uuids[id], source === "sync" ? uuid : undefined);
    Assert.deepEqual(await ExtensionStorage.get(id, null), source === "sync" ? { retained: "this device only" } : {});
    Assert.deepEqual((await ExtensionPermissions.get(id)).permissions, [], "A synced install never inherits old optional grants");
    if (source === "sync") {
      await installFixture(id);
      Assert.equal(JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))[id], uuid);
      Assert.deepEqual(await ExtensionStorage.get(id, null), { retained: "this device only" });
      const cleared = new Promise(resolve => Management.once("cleanupAfterUninstall", (_event, _id, tasks) => {
        resolve(Promise.all(tasks.map(task => task.promise)));
      }));
      await (await AddonManager.getAddonByID(id)).uninstall();
      await cleared;
    }
  }
});

add_task(async function checked_legacy_storage_removal_preserves_reinstalls_and_recovers_after_write_failure() {
  const { ExtensionStorage } = ChromeUtils.importESModule("resource://gre/modules/ExtensionStorage.sys.mjs");
  const id = "@sync-checked-storage-removal";
  const data = { retained: "before uninstall" };
  await ExtensionStorage.set(id, data);
  const file = await ExtensionStorage.getFile(id);
  await file.saveNow();
  Assert.equal(await ExtensionStorage.persistSyncRemoval(id, () => false), false);
  Assert.deepEqual(await ExtensionStorage.get(id, null), data);
  Assert.deepEqual(await IOUtils.readJSON(file.path), data);
  const original = file.path;
  const failingPath = PathUtils.join(PathUtils.profileDir, "extension-storage-is-a-directory");
  await IOUtils.makeDirectory(failingPath);
  try {
    file.path = failingPath;
    await Assert.rejects(ExtensionStorage.persistSyncRemoval(id, () => true), /Error/);
    Assert.deepEqual(await IOUtils.readJSON(original), data, "A failed cleanup keeps the last durable file");
  } finally { file.path = original; }
  ExtensionStorage.jsonFilePromises.delete(id);
  Assert.deepEqual(await ExtensionStorage.get(id, null), data, "Reopening the old file does not mistake the earlier memory clear for persistence");
  Assert.equal(await ExtensionStorage.persistSyncRemoval(id, () => true), true);
  Assert.deepEqual(await IOUtils.readJSON(original), {});
});

add_task(async function permission_removal_is_durable_in_both_stores_and_the_startup_cache() {
  const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
  const { StartupCache } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
  const startup = Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup);
  const id = "@sync-checked-permission-removal";
  const originalLegacy = ExtensionPermissions._getStore().constructor.name === "LegacyPermissionStore";
  const originalFlag = ExtensionPermissions._useLegacyStorageBackend;
  const readCache = async path => startup.decodeBlob((await IOUtils.read(path)).buffer).get("permissions");
  try {
    for (const legacy of [true, false]) {
      ExtensionPermissions._useLegacyStorageBackend = legacy;
      await ExtensionPermissions._uninit();
      Assert.equal(ExtensionPermissions._getStore().constructor.name, legacy ? "LegacyPermissionStore" : "PermissionStore");
      await ExtensionPermissions.add(id, { permissions: ["clipboardWrite"], origins: [] });
      Assert.equal(await ExtensionPermissions.persistSyncChanges(id, () => true), true);
      Assert.ok((await readCache(StartupCache.file)).get(id).permissions.includes("clipboardWrite"));
      Assert.equal(await ExtensionPermissions.persistSyncRemoval(id, () => false), false);
      Assert.ok((await ExtensionPermissions.get(id)).permissions.includes("clipboardWrite"));
      const original = StartupCache.file;
      const failingPath = PathUtils.join(PathUtils.profileDir, `permission-cache-is-a-directory-${legacy}`);
      await IOUtils.makeDirectory(failingPath);
      try {
        StartupCache.file = failingPath;
        await Assert.rejects(ExtensionPermissions.persistSyncRemoval(id, () => true), /Error/);
        Assert.ok((await readCache(original)).get(id).permissions.includes("clipboardWrite"), "A failed cache write preserves the last durable permission entry");
      } finally { StartupCache.file = original; }
      Assert.equal(await ExtensionPermissions.persistSyncRemoval(id, () => true), true);
      Assert.deepEqual((await ExtensionPermissions._get(id)).permissions, []);
      Assert.ok(!(await readCache(original)).has(id));
      await ExtensionPermissions.add(id, { permissions: ["clipboardWrite"], origins: [] });
      Assert.equal(await ExtensionPermissions.persistSyncChanges(id, () => true), true,
        "The native stores and cache remain writable after a checked retry");
      Assert.ok((await readCache(original)).get(id).permissions.includes("clipboardWrite"));
      await ExtensionPermissions.persistSyncRemoval(id, () => true);
    }
  } finally {
    ExtensionPermissions._useLegacyStorageBackend = originalLegacy;
    await ExtensionPermissions._uninit();
    ExtensionPermissions._useLegacyStorageBackend = originalFlag;
  }
});
