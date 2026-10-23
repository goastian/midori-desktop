/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task */

const modules = "resource:///modules/";
const { MidoriSyncAccount } = ChromeUtils.importESModule(`${modules}MidoriSyncAccount.sys.mjs`);
const { MidoriSyncConnection } = ChromeUtils.importESModule(`${modules}MidoriSyncConnection.sys.mjs`);
const { MidoriSyncTransport } = ChromeUtils.importESModule(`${modules}MidoriSyncTransport.sys.mjs`);
const { MidoriSyncVault } = ChromeUtils.importESModule(`${modules}MidoriSyncVault.sys.mjs`);
const { createSyncVaultFileStore, authorizeSyncSecretStore } = ChromeUtils.importESModule(`${modules}MidoriSyncSecretStore.sys.mjs`);
const { createNativeSyncKeys } = ChromeUtils.importESModule(`${modules}MidoriSyncNativeKeys.sys.mjs`);
const { openSyncStore } = ChromeUtils.importESModule(`${modules}MidoriSyncStore.sys.mjs`);
const { MidoriSyncCollection } = ChromeUtils.importESModule(`${modules}MidoriSyncCollection.sys.mjs`);
const { MidoriSyncRecordTracker } = ChromeUtils.importESModule(`${modules}MidoriSyncPasswordTracker.sys.mjs`);
const { MidoriSyncExtensionSettings } = ChromeUtils.importESModule(`${modules}MidoriSyncExtensionSettings.sys.mjs`);
const { createSyncExtensionSettingsStore } = ChromeUtils.importESModule(`${modules}MidoriSyncExtensionSettingsStore.sys.mjs`);
const { createSyncExtensionStore } = ChromeUtils.importESModule(`${modules}MidoriSyncExtensionStore.sys.mjs`);
const { deriveSyncExtensionSettingsId } = ChromeUtils.importESModule(`${modules}MidoriSyncExtensionSettingsModel.sys.mjs`);
const { syncJournalEntryId } = ChromeUtils.importESModule(`${modules}MidoriSyncIndex.sys.mjs`);
const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
const { ExtensionStorage } = ChromeUtils.importESModule("resource://gre/modules/ExtensionStorage.sys.mjs");
const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
const { Management } = ChromeUtils.importESModule("resource://gre/modules/Extension.sys.mjs");
const { storageSyncService } = ChromeUtils.importESModule("resource://gre/modules/ExtensionStorageComponents.sys.mjs");
const { Sqlite } = ChromeUtils.importESModule("resource://gre/modules/Sqlite.sys.mjs");
const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
const collection = "extension-settings";
const addonId = "uBlock0@raymondhill.net";
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
const baseData = () => ({ left: 1, right: 1, marker: "public encrypted settings live fixture",
  ...Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`numeric-${i}`, Array(1000).fill(1e20)])) });

add_task(async function encrypted_settings_survive_before_and_after_commit_interruptions_between_native_profiles() {
  const stage = Services.env.get("MIDORI_SYNC_SETTINGS_STAGE");
  Assert.ok(["A", "B", "C", "D", "E", "F", "G"].includes(stage));
  const side = ["A", "E", "G"].includes(stage) ? "A" : "B";
  const root = Services.env.get("MIDORI_SYNC_TEST_KEYRING_ROOT");
  Assert.ok(root.startsWith("/tmp/midori-sync-native-"));
  Assert.equal(PathUtils.profileDir, PathUtils.join(root, `settings-live-${side}`));
  const fixture = await IOUtils.readJSON(Services.env.get("MIDORI_SYNC_TEST_FIXTURE"));
  Assert.equal(fixture.kind, "h1-live");
  Assert.ok(fixture.subject.startsWith("synthetic-h1:"));
  Assert.ok(["http://127.0.0.1:8000/", "http://localhost:8000/"].includes(fixture.baseURL));
  const statePath = PathUtils.join(root, "settings-live-state.json");
  const state = stage === "A" ? { devices: {}, stage: null } : await IOUtils.readJSON(statePath);
  Assert.equal(state.stage, { A: null, B: "A", C: "B", D: "C", E: "D", F: "E", G: "F" }[stage]);
  const first = ["A", "B"].includes(stage);
  if (first) { state.devices[side] = { profileId: uuid(), storeId: uuid() }; }
  const descriptor = state.devices[side];
  const saveState = async () => {
    state.stage = stage;
    await IOUtils.writeJSON(statePath, state, { permissions: 0o600, flush: true });
  };
  const window = Services.wm.getMostRecentWindow("navigator:browser");
  const browser = window.gBrowser.selectedBrowser;
  let prompts = 0;
  let promptExpected = false;
  const approve = () => {
    if (!window.PopupNotifications.getNotification("addon-webext-permissions", browser)) { return; }
    Assert.ok(promptExpected);
    ++prompts;
    window.document.getElementById("addon-webext-permissions-notification").button.click();
  };
  window.PopupNotifications.panel.addEventListener("popupshown", approve);
  const store = createSyncExtensionSettingsStore();
  const references = createSyncExtensionStore();
  const native = await storageSyncService.getStorageAreaInstance();
  const cold = JSON.parse(await native.getSyncSnapshot(addonId));
  if (stage === "C") { Assert.deepEqual(cold, {}, "The before-commit interruption left no partial native settings"); }
  if (stage === "D") { Assert.deepEqual(cold, baseData(), "Committed settings survive SIGKILL before journal completion"); }
  if (stage === "E") { Assert.deepEqual(cold, baseData()); }
  if (stage === "F") { Assert.deepEqual(cold, { ...baseData(), right: 2 }); }
  if (stage === "G") { Assert.deepEqual(cold, { ...baseData(), left: 2, right: 2 }); }
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  Assert.ok(keyStore.isOSBacked);
  const connection = new MidoriSyncConnection({ baseURL: fixture.baseURL, allowLocalHTTP: true, saveServer() {},
    transportFactory: (url, options) => new MidoriSyncTransport(url, options) });
  const vault = new MidoriSyncVault({ store: createSyncVaultFileStore(PathUtils.join(PathUtils.profileDir, "settings-vault")),
    keyStore, profileId: descriptor.profileId, createId: uuid,
    authorize: options => authorizeSyncSecretStore(keyStore, () =>
      Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token), options) });
  const account = new MidoriSyncAccount({ connection, vaultFactory: () => vault,
    transportFactory: (url, options) => new MidoriSyncTransport(url, options) });
  const keys = createNativeSyncKeys(account);
  let journal;
  let engine;
  let adapter;
  let tracker;
  let db;
  let acknowledgements = 0;
  let hints = 0;
  const localData = () => ({ device: `Settings live profile ${side}` });
  const install = async () => {
    Services.prefs.clearUserPref("extensions.getAddons.get.url");
    Assert.ok(Services.prefs.getStringPref("extensions.getAddons.get.url").startsWith("https://services.addons.mozilla.org/"));
    Assert.equal(await AddonManager.getAddonByID(addonId), null);
    const result = await references.install({ desired: { version: 1, type: "extension", catalog: "amo", addonId, enabled: false },
      expected: await references.read("amo", addonId), signal: new AbortController().signal,
      beforePermissionPrompt: async () => { promptExpected = true; } });
    Assert.deepEqual(result, { status: "applied" });
    promptExpected = false;
    Assert.equal(prompts, 1);
    const addon = await AddonManager.getAddonByID(addonId);
    Assert.ok([AddonManager.SIGNEDSTATE_SIGNED, AddonManager.SIGNEDSTATE_PRIVILEGED].includes(addon.signedState));
    Assert.ok(addon.isCompatible && addon.userDisabled && !addon.isActive);
    Assert.equal((await store.read("amo", addonId)).status, "portable");
    descriptor.addon = { version: addon.version, signedState: addon.signedState };
    await ExtensionStorage.set(addonId, localData());
    await (await ExtensionStorage.getFile(addonId)).saveNow();
    await ExtensionPermissions.add(addonId, { permissions: ["clipboardRead"], origins: [] });
  };
  try {
    if (first) { await account.pair(fixture.profiles[side].pairing_token, `Settings synthetic profile ${side}`); }
    else {
      await account.initialize();
      if (account.snapshot.status === "locked") { await account.unlock({ interactive: false }); }
    }
    Assert.equal(account.snapshot.status, "connected");
    Assert.ok(account.snapshot.collectionSupport[collection]);
    await keys.refresh();
    if (stage === "A") {
      Assert.equal(keys.snapshot.status, "empty");
      state.recoveryCode = await keys.prepareCreation();
      await keys.confirmCreation({ recoveryCodeSaved: true });
    } else if (stage === "B") { await keys.recover(state.recoveryCode); }
    await keys.refresh();
    Assert.equal(keys.snapshot.status, "ready");
    Assert.equal(keys.snapshot.custody, "client");
    journal = await openSyncStore({ directory: PathUtils.join(PathUtils.profileDir, "settings-journal"),
      storeId: descriptor.storeId, deviceId: account.snapshot.device.id, keys, create: first });
    db = await Sqlite.openConnection({ path: PathUtils.join(PathUtils.profileDir, "storage-sync-v2.sqlite"), readOnly: true });
    const deriveRecordId = (name, bytes) => keys.deriveRecordId(name, bytes);
    const recordId = await deriveSyncExtensionSettingsId("amo", addonId, deriveRecordId);
    adapter = new MidoriSyncExtensionSettings({ store, deriveRecordId, record: id => engine.record(id) });
    engine = new MidoriSyncCollection({ collection, adapter, journal, keys, entryId: syncJournalEntryId,
      createId: uuid, pageByteBudget: true, request: async (path, options) => {
        if (path.endsWith("/ack")) {
          ++acknowledgements;
          Assert.ok(!["B", "C"].includes(stage), "Interrupted applications cannot acknowledge their feed position");
          const snapshot = await store.read("amo", addonId);
          const rows = await db.execute("SELECT data FROM storage_sync_data WHERE ext_id = :id", { id: addonId });
          const saved = rows[0]?.getResultByName("data");
          Assert.deepEqual(saved ? JSON.parse(saved) : {}, JSON.parse(snapshot.raw), "Native SQLite is committed before ACK");
        }
        if (path.endsWith("/operations")) {
          for (const operation of options.body.operations) {
            if (operation.id === recordId && operation.deleted) {
              Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(addonId)), {}, "The deliberate local removal commits before its tombstone is published");
            }
            Assert.ok(!operation.payload.includes(addonId) && !operation.payload.includes("public encrypted settings live fixture"));
            Assert.equal(JSON.parse(operation.payload).context.collection, collection);
          }
        }
        return account.withSecrets(lease => lease.request(path, options));
      } });
    await engine.initialize();
    if (["B", "C"].includes(stage)) {
      const write = store.write;
      store.write = async options => {
        if (stage === "C") { Assert.deepEqual(await write(options), { status: "applied" }); }
        const applications = await journal.list(collection, "application");
        Assert.equal(applications.length, 1);
        Assert.equal(acknowledgements, 0);
        Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(addonId)), stage === "B" ? {} : baseData());
        await saveState();
        await IOUtils.writeJSON(Services.env.get("MIDORI_SYNC_SETTINGS_CHECKPOINT"), {
          pid: Services.appinfo.processID, profile: PathUtils.profileDir, stage,
          phase: stage === "B" ? "before-native" : "after-native", acknowledgements, applications: applications.length,
        }, { permissions: 0o600, flush: true });
        await new Promise(() => {});
      };
    }
    tracker = new MidoriSyncRecordTracker({ engine, adapter, onChange: () => ++hints });
    const settle = async (capture = false) => {
      for (let pass = 0; pass < 200; ++pass) {
        await engine.run({ maxPages: 100 });
        if (capture && engine.snapshot.initialized) { await tracker.run({ limit: 2 }); }
        if (!engine.snapshot.more && (!capture || !tracker.snapshot.more)) { return; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`settings_live_did_not_settle:${JSON.stringify(engine.snapshot)}`);
    };
    const write = async data => Assert.deepEqual(await store.write({ catalog: "amo", addonId, desired: data,
      expected: await store.read("amo", addonId) }), { status: "applied" });
    if (stage === "A") {
      await settle(); await install();
      await write(baseData());
      Assert.ok(hints > 0);
      await settle(true);
      Assert.ok((await adapter.listIds()).length > 2);
    } else if (["B", "C"].includes(stage)) {
      await settle();
      Assert.ok(false, "The supervisor must terminate this stage at its native checkpoint");
    } else if (stage === "D") {
      Assert.equal((await journal.list(collection, "application")).length, 1);
      let writes = 0;
      const original = store.write;
      store.write = async options => { ++writes; return original(options); };
      await settle();
      Assert.equal(writes, 0, "Replay recognizes the committed native value and checks persistence without replacing it");
      Assert.equal((await journal.list(collection, "application")).length, 0);
      await install();
      Assert.deepEqual((await store.read("amo", addonId)).data, baseData(), "First installation preserves settings received beforehand");
      await write({ ...baseData(), right: 2 });
      Assert.ok(hints > 0); await settle(true);
    } else if (stage === "E") {
      await write({ ...baseData(), left: 2 });
      await settle();
      Assert.deepEqual((await store.read("amo", addonId)).data, { ...baseData(), left: 2, right: 2 });
      await settle(true);
    } else if (stage === "F") {
      await settle();
      Assert.deepEqual((await store.read("amo", addonId)).data, { ...baseData(), left: 2, right: 2 });
      const cleanup = new Promise(resolve => Management.once("cleanupAfterUninstall", (_event, id, tasks) => {
        Assert.equal(id, addonId); resolve(Promise.all(tasks.map(task => task.promise)));
      }));
      await (await AddonManager.getAddonByID(addonId)).uninstall(); await cleanup;
      Assert.equal((await store.read("amo", addonId)).status, "removed");
      await settle(true);
      Assert.equal((await engine.record(recordId)).remote.deleted, true);
    } else {
      await settle(true);
      Assert.deepEqual((await store.read("amo", addonId)).data, {});
      Assert.equal((await engine.record(recordId)).remote.deleted, true);
      Assert.ok((await AddonManager.getAddonByID(addonId)).userDisabled, "A settings tombstone does not uninstall the local extension");
      Assert.deepEqual(await ExtensionStorage.get(addonId, null), localData());
      Assert.ok((await ExtensionPermissions.get(addonId)).permissions.includes("clipboardRead"));
    }
    Assert.equal(engine.snapshot.pending, 0); Assert.equal(engine.snapshot.deferred, 0); Assert.equal(engine.snapshot.conflicts, 0);
    if (!["A", "D"].includes(stage)) { Assert.equal(prompts, 0); }
    await saveState();
  } finally {
    window.PopupNotifications.panel.removeEventListener("popupshown", approve);
    tracker?.close(); adapter?.close(); engine?.close();
    await db?.close(); await journal?.close(); keys.close(); account.close(); connection.close();
  }
});
