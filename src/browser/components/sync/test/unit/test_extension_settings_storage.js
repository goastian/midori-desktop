/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task, browser, registerCleanupFunction */

const { storageSyncService } = ChromeUtils.importESModule("resource://gre/modules/ExtensionStorageComponents.sys.mjs");
const { createSyncExtensionSettingsBundle, assembleSyncExtensionSettings } =
  ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncExtensionSettingsModel.sys.mjs");
const { Sqlite } = ChromeUtils.importESModule("resource://gre/modules/Sqlite.sys.mjs");
const { JsonError } = ChromeUtils.importESModule("moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustWebextstorage.sys.mjs");
const addonId = "@settings-native-quota-fixture";

add_task(async function native_numeric_settings_require_fragmentation_without_exceeding_native_quotas() {
  const native = await storageSyncService.getStorageAreaInstance();
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const data = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`key-${i}`, Array(1000).fill(1e20)]));
  try {
    await native.set(addonId, JSON.stringify(data));
    const raw = await native.get(addonId, "null");
    const usage = await native.getBytesInUse(addonId, "null");
    Assert.ok(usage <= 102400, "The actual native producer accepts this data within its quota");
    const snapshot = JSON.parse(raw);
    Assert.deepEqual(snapshot, data);
    Assert.ok(new TextEncoder().encode(JSON.stringify(snapshot)).length > 190000,
      "The transport representation needs multiple records despite fitting the native quota");
    const handle = await crypto.generateNativeKey(JSON.stringify([
      "https://sync.example.invalid/", "https://accounts.example.invalid/", "public-settings-quota-fixture",
    ]));
    const options = { deriveRecordId: (collection, bytes) => crypto.deriveNativeRecordId(handle, collection, bytes) };
    const bundle = await createSyncExtensionSettingsBundle("amo", addonId, snapshot, options);
    Assert.ok(bundle.parts.length > 1);
    const generation = Services.uuid.generateUUID().toString().slice(1, -1);
    const parts = new Map();
    for (const part of bundle.parts) {
      const plaintext = new TextEncoder().encode(JSON.stringify({ version: 2, deleted: false, ttl: null, value: part.value }));
      Assert.ok(plaintext.length < 190000);
      const context = JSON.stringify({ collection: "extension-settings", id: part.id, generation, schema_version: 2, base_revision: "0" });
      const envelope = await crypto.sealNative(handle, Ci.nsIMidoriSyncCrypto.PURPOSE_RECORD, context, plaintext);
      Assert.ok(new TextEncoder().encode(envelope).length <= 262144);
      const locator = JSON.stringify({ collection: "extension-settings", id: part.id, generation });
      const opened = await crypto.openNative(handle, Ci.nsIMidoriSyncCrypto.PURPOSE_RECORD, locator, envelope);
      const value = JSON.parse(new TextDecoder().decode(opened)).value;
      Assert.deepEqual(value, part.value);
      parts.set(part.id, value);
    }
    Assert.deepEqual(await assembleSyncExtensionSettings(bundle.manifest, id => parts.get(id), options), data);
    parts.delete(bundle.parts.at(-1).id);
    Assert.equal(await assembleSyncExtensionSettings(bundle.manifest, id => parts.get(id), options), null);
    for (const extra of [{ tooLarge: "x".repeat(8192) },
      Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`extra-${i}`, "x".repeat(4000)]))]) {
      await Assert.rejects(native.set(addonId, JSON.stringify(extra)), /Quota/);
      Assert.deepEqual(JSON.parse(await native.get(addonId, "null")), data,
        "Native quota rejection rolls back without disturbing the prior namespace");
    }
  } finally { crypto.close(); await native.clear(addonId); }
});

add_task(async function namespace_replacement_compares_fresh_state_and_removes_keys_in_one_transaction() {
  const native = await storageSyncService.getStorageAreaInstance();
  const before = { keep: null, remove: "old", edited: false };
  const after = { keep: null, edited: true, added: [1, 2] };
  const otherId = "@settings-other-namespace-fixture";
  try {
    await native.set(addonId, JSON.stringify(before));
    await native.set(otherId, '{"untouched":true}');
    Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(addonId)), before);
    Assert.equal(await native.compareAndReplace(addonId, "{}", JSON.stringify(after)), null);
    Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(addonId)), before);
    const changes = await native.compareAndReplace(addonId, JSON.stringify(before), JSON.stringify(after));
    Assert.ok(changes);
    Assert.equal(changes.changes.length, 3);
    Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(addonId)), after);
    Assert.deepEqual((await native.compareAndReplace(addonId, JSON.stringify(after), JSON.stringify(after))).changes, []);
    Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(otherId)), { untouched: true });
    Assert.ok(await native.compareAndReplace(addonId, JSON.stringify(after), "{}"));
    Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(addonId)), {});
  } finally { await native.clear(addonId); await native.clear(otherId); }
});

add_task(async function concurrent_replacements_cannot_both_consume_the_same_native_snapshot() {
  const native = await storageSyncService.getStorageAreaInstance();
  try {
    await native.set(addonId, '{"value":"before"}');
    const expected = await native.getSyncSnapshot(addonId);
    const results = await Promise.all(["one", "two"].map(value => native.compareAndReplace(addonId,
      expected, JSON.stringify({ value }))));
    Assert.equal(results.filter(Boolean).length, 1);
    Assert.equal(results.filter(value => value === null).length, 1);
    const winner = results[0] ? "one" : "two";
    Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(addonId)), { value: winner });
  } finally { await native.clear(addonId); }
});

add_task(async function quota_and_sql_errors_roll_back_removals_and_allow_a_checked_retry() {
  const native = await storageSyncService.getStorageAreaInstance();
  const db = await Sqlite.openConnection({ path: PathUtils.join(PathUtils.profileDir, "storage-sync-v2.sqlite") });
  const before = { keep: "before", remove: true };
  try {
    await native.set(addonId, JSON.stringify(before));
    for (const after of [{ tooLarge: "x".repeat(8192) },
      Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`item-${i}`, "x".repeat(4000)]))]) {
      await Assert.rejects(native.compareAndReplace(addonId, JSON.stringify(before), JSON.stringify(after)), /Quota/);
      Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(addonId)), before);
    }
    await db.execute(`CREATE TRIGGER midori_sync_settings_write_failure BEFORE INSERT ON storage_sync_data
      WHEN NEW.ext_id = '@settings-native-quota-fixture' AND instr(NEW.data, 'fail-write') > 0
      BEGIN SELECT RAISE(FAIL, 'synthetic-settings-write'); END`);
    await Assert.rejects(native.compareAndReplace(addonId, JSON.stringify(before), '{"replacement":"fail-write"}'), /synthetic-settings-write/);
    Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(addonId)), before,
      "The failed insertion cannot commit the earlier key removals");
    await db.execute("DROP TRIGGER midori_sync_settings_write_failure");
    Assert.ok(await native.compareAndReplace(addonId, JSON.stringify(before), '{"replacement":"after-retry"}'));
    Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(addonId)), { replacement: "after-retry" });
  } finally {
    await db.execute("DROP TRIGGER IF EXISTS midori_sync_settings_write_failure");
    await db.close();
    await native.clear(addonId);
  }
});

add_task(async function malformed_native_rows_cannot_be_mistaken_for_empty_settings_or_replaced() {
  const native = await storageSyncService.getStorageAreaInstance();
  const db = await Sqlite.openConnection({ path: PathUtils.join(PathUtils.profileDir, "storage-sync-v2.sqlite") });
  try {
    await native.set(addonId, '{"before":true}');
    for (const data of ["[]", "false", "null", '"string"', "{invalid"]) {
      await db.execute("UPDATE storage_sync_data SET data = :data WHERE ext_id = :id", { data, id: addonId });
      await Assert.rejects(native.getSyncSnapshot(addonId), error => error instanceof JsonError);
      await Assert.rejects(native.compareAndReplace(addonId, "{}", "{}"), error => error instanceof JsonError);
      const rows = await db.execute("SELECT data FROM storage_sync_data WHERE ext_id = :id", { id: addonId });
      Assert.equal(rows.length, 1);
      Assert.equal(rows[0].getResultByName("data"), data);
    }
  } finally {
    await db.execute("DELETE FROM storage_sync_data WHERE ext_id = :id", { id: addonId });
    await db.close();
  }
});

add_task(async function committed_replacements_notify_only_the_scoped_extension_after_persistence() {
  const { extensionStorageSync } = ChromeUtils.importESModule("resource://gre/modules/ExtensionStorageSync.sys.mjs");
  const native = await storageSyncService.getStorageAreaInstance();
  const events = [];
  const values = [];
  const extension = { id: addonId };
  const observer = (subject, topic, id) => {
    Assert.equal(subject, null);
    Assert.equal(topic, "midori-sync-extension-settings-changed");
    events.push(id);
    values.push(native.getSyncSnapshot(id));
  };
  const changes = [];
  const listener = value => changes.push(value);
  Services.obs.addObserver(observer, "midori-sync-extension-settings-changed");
  extensionStorageSync.addOnChangedListener(extension, listener);
  try {
    await native.set(addonId, '{"before":true}');
    const before = await extensionStorageSync.readSyncSnapshot(addonId);
    Assert.ok(await extensionStorageSync.replaceSyncSnapshot(addonId, before, '{"after":true}'));
    Assert.deepEqual(events, [addonId]);
    Assert.deepEqual(JSON.parse((await Promise.all(values))[0]), { after: true });
    Assert.deepEqual(changes, [{ before: { oldValue: true }, after: { newValue: true } }]);
    const after = await extensionStorageSync.readSyncSnapshot(addonId);
    Assert.ok(await extensionStorageSync.replaceSyncSnapshot(addonId, after, after));
    Assert.equal(await extensionStorageSync.replaceSyncSnapshot(addonId, before, "{}"), false);
    await Assert.rejects(extensionStorageSync.replaceSyncSnapshot(addonId, after,
      JSON.stringify({ tooLarge: "x".repeat(8192) })), /Quota/);
    Assert.equal(events.length, 1, "Matching barriers, stale comparisons and failed transactions publish no changes");
    Assert.equal(changes.length, 1);
    Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(addonId)), { after: true });
  } finally {
    extensionStorageSync.removeOnChangedListener(extension, listener);
    Services.obs.removeObserver(observer, "midori-sync-extension-settings-changed");
    await native.clear(addonId);
  }
});

add_task(async function a_real_extension_reads_received_settings_edits_them_and_keeps_local_data_and_grants() {
  const { AddonTestUtils } = ChromeUtils.importESModule("resource://testing-common/AddonTestUtils.sys.mjs");
  const { ExtensionTestUtils } = ChromeUtils.importESModule("resource://testing-common/ExtensionXPCShellUtils.sys.mjs");
  const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
  const { ExtensionStorage } = ChromeUtils.importESModule("resource://gre/modules/ExtensionStorage.sys.mjs");
  const { createSyncExtensionSettingsStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncExtensionSettingsStore.sys.mjs");
  const { MidoriSyncExtensionSettings } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncExtensionSettings.sys.mjs");
  const pref = "extensions.webextensions.remote";
  const previous = Services.prefs.prefHasUserValue(pref) ? Services.prefs.getBoolPref(pref) : null;
  Services.prefs.setBoolPref(pref, false);
  registerCleanupFunction(() => previous === null ? Services.prefs.clearUserPref(pref) : Services.prefs.setBoolPref(pref, previous));
  AddonTestUtils.init(globalThis);
  AddonTestUtils.overrideCertDB();
  AddonTestUtils.createAppInfo("xpcshell@tests.mozilla.org", "XPCShell", "1", "42");
  ExtensionTestUtils.init(globalThis);
  await AddonTestUtils.promiseStartupManager();
  registerCleanupFunction(() => AddonTestUtils.promiseShutdownManager());
  const id = "@sync-settings-extension-api";
  const futureId = "@sync-settings-before-install";
  const extension = ExtensionTestUtils.loadExtension({
    useAddonManager: "permanent",
    manifest: { manifest_version: 2, permissions: ["storage"], optional_permissions: ["clipboardRead"],
      browser_specific_settings: { gecko: { id } } },
    async background() {
      await browser.storage.local.set({ device: "local only" });
      browser.test.onMessage.addListener(async (message, data) => {
        if (message === "read") {
          browser.test.sendMessage("state", { sync: await browser.storage.sync.get(null), local: await browser.storage.local.get(null) });
        } else if (message === "edit") {
          await browser.storage.sync.set(data);
          browser.test.sendMessage("edited");
        }
      });
      browser.test.sendMessage("ready");
    },
  });
  const { createSyncExtensionStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncExtensionStore.sys.mjs");
  Assert.throws(() => Services.prefs.flushPrefFile(), error => error.result === Cr.NS_ERROR_NOT_INITIALIZED);
  const prefFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  prefFile.initWithPath(PathUtils.join(PathUtils.profileDir, "sync-extension-preferences-fixture.js"));
  const references = createSyncExtensionStore({ persistPreferences: () => Services.prefs.backupPrefFile(prefFile) });
  const store = createSyncExtensionSettingsStore({ references });
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const records = new Map();
  let adapter;
  let stop;
  const native = await storageSyncService.getStorageAreaInstance();
  const state = async () => { extension.sendMessage("read"); return extension.awaitMessage("state"); };
  const edit = async data => { extension.sendMessage("edit", data); await extension.awaitMessage("edited"); };
  try {
    await extension.startup(); await extension.awaitMessage("ready");
    const snapshot = await store.read("amo", id);
    Assert.equal(snapshot.status, "portable");
    Assert.deepEqual(snapshot.data, {});
    const handle = await crypto.generateNativeKey(JSON.stringify([
      "https://sync.example.invalid/", "https://accounts.example.invalid/", "public-settings-extension-api",
    ]));
    const options = { deriveRecordId: (collection, bytes) => crypto.deriveNativeRecordId(handle, collection, bytes) };
    adapter = new MidoriSyncExtensionSettings({ store, ...options, record: key => records.get(key) ?? null });
    let hints = 0; stop = adapter.observe(() => ++hints);
    const remote = await createSyncExtensionSettingsBundle("amo", id, { remote: true, nullable: null }, options);
    for (const part of remote.parts) { records.set(part.id, { remote: { ...part, deleted: false } }); }
    const incoming = { ...remote.manifest, deleted: false, authenticatedSchema: 2 };
    Assert.deepEqual(await adapter.apply(incoming), { status: "applied" });
    Assert.ok((await IOUtils.readUTF8(prefFile.path)).includes(id), "The explicit native preference backup committed the extension UUID");
    Assert.deepEqual(await state(), { sync: { remote: true, nullable: null }, local: { device: "local only" } });
    Assert.ok(hints > 0, "A committed native application requests a bounded rescan");
    const beforeHints = hints;
    await edit({ localEdit: true });
    Assert.ok(hints > beforeHints, "Writes made through browser.storage.sync are observed automatically");
    const captureIds = await adapter.listIds();
    Assert.ok(captureIds.some(value => value.startsWith("xp1:")));
    Assert.ok(captureIds.includes(remote.manifest.id));
    await adapter.read(remote.manifest.id, incoming.value); await adapter.flush();
    const fresh = await store.read("amo", id);
    Assert.deepEqual(await store.write({ catalog: "amo", addonId: id, expected: fresh,
      desired: { tooLarge: "x".repeat(8192) } }), { status: "deferred", reason: "extension_settings_quota" });
    Assert.deepEqual((await state()).sync, { remote: true, nullable: null, localEdit: true });
    const next = await createSyncExtensionSettingsBundle("amo", id, { remote: false, nullable: null }, options);
    for (const part of next.parts) { records.set(part.id, { remote: { ...part, deleted: false } }); }
    const plan = await adapter.prepare({ ...next.manifest, deleted: false, authenticatedSchema: 2 }, incoming);
    await edit({ afterPlan: true });
    Assert.deepEqual(await adapter.applyPrepared(plan), { status: "deferred", reason: "extension_settings_local_changed" });
    Assert.equal((await state()).sync.afterPlan, true);
    const beforeGrants = hints;
    await ExtensionPermissions.add(id, { permissions: ["clipboardRead"], origins: [] });
    Assert.ok(hints > beforeGrants, "Native permission changes request a new settings inventory");
    const removal = { id: remote.manifest.id, deleted: true, value: null, authenticatedSchema: 2 };
    const stale = await adapter.prepare(removal, incoming, { resolution: { choice: "remote" } });
    Assert.deepEqual(await adapter.applyPrepared(stale), { status: "conflict", reason: "extension_settings_local_changed" });
    await adapter.read(remote.manifest.id, incoming.value);
    const resolved = await adapter.prepare(removal, incoming, { resolution: { choice: "remote" } });
    Assert.deepEqual(await adapter.applyPrepared(resolved), { status: "applied" });
    Assert.deepEqual(await state(), { sync: {}, local: { device: "local only" } });
    Assert.ok((await ExtensionPermissions.get(id)).permissions.includes("clipboardRead"),
      "A settings tombstone cannot revoke locally granted optional permissions");
    await ExtensionPermissions.add(futureId, { permissions: ["clipboardRead"], origins: [] });
    await ExtensionStorage.set(futureId, { retained: "local file" });
    const missing = await store.read("amo", futureId);
    Assert.equal(missing.status, "cached");
    Assert.deepEqual(await store.write({ catalog: "amo", addonId: futureId, desired: { beforeInstall: true }, expected: missing }), { status: "applied" });
    Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(futureId)), { beforeInstall: true });
    Assert.deepEqual(await ExtensionStorage.get(futureId, null), { retained: "local file" });
    Assert.ok((await ExtensionPermissions.get(futureId)).permissions.includes("clipboardRead"));
  } finally {
    stop?.(); adapter?.close(); crypto.close();
    await extension.unload();
    await native.clear(futureId);
    await ExtensionPermissions.persistSyncRemoval(futureId, () => true);
    await ExtensionStorage.persistSyncRemoval(futureId, () => true);
  }
});
