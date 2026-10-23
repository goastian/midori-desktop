/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task, registerCleanupFunction */

const modules = "resource:///modules/";
const { MidoriSyncAccount } = ChromeUtils.importESModule(`${modules}MidoriSyncAccount.sys.mjs`);
const { MidoriSyncConnection } = ChromeUtils.importESModule(`${modules}MidoriSyncConnection.sys.mjs`);
const { MidoriSyncTransport } = ChromeUtils.importESModule(`${modules}MidoriSyncTransport.sys.mjs`);
const { MidoriSyncVault } = ChromeUtils.importESModule(`${modules}MidoriSyncVault.sys.mjs`);
const { createSyncVaultFileStore, authorizeSyncSecretStore } = ChromeUtils.importESModule(`${modules}MidoriSyncSecretStore.sys.mjs`);
const { createNativeSyncKeys } = ChromeUtils.importESModule(`${modules}MidoriSyncNativeKeys.sys.mjs`);
const { openSyncStore } = ChromeUtils.importESModule(`${modules}MidoriSyncStore.sys.mjs`);
const { MidoriSyncCollection } = ChromeUtils.importESModule(`${modules}MidoriSyncCollection.sys.mjs`);
const { MidoriSyncExtensions } = ChromeUtils.importESModule(`${modules}MidoriSyncExtensions.sys.mjs`);
const { createSyncExtensionStore } = ChromeUtils.importESModule(`${modules}MidoriSyncExtensionStore.sys.mjs`);
const { deriveSyncExtensionId } = ChromeUtils.importESModule(`${modules}MidoriSyncExtensionModel.sys.mjs`);
const { syncJournalEntryId } = ChromeUtils.importESModule(`${modules}MidoriSyncIndex.sys.mjs`);
const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
const { AddonTestUtils } = ChromeUtils.importESModule("resource://testing-common/AddonTestUtils.sys.mjs");
const { ExtensionStorage } = ChromeUtils.importESModule("resource://gre/modules/ExtensionStorage.sys.mjs");
const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
const { XPIExports } = ChromeUtils.importESModule("resource://gre/modules/addons/XPIExports.sys.mjs");
const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
const addonId = "amosigned-xpi@tests.mozilla.org";
const collection = "extensions";
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);

add_task(async function encrypted_extension_references_survive_an_interrupted_prompt_between_profiles() {
  const stage = Services.env.get("MIDORI_SYNC_EXTENSIONS_STAGE");
  Assert.ok(["A", "B", "C", "D", "E", "F", "G"].includes(stage));
  const side = ["A", "D", "F"].includes(stage) ? "A" : "B";
  const root = Services.env.get("MIDORI_SYNC_TEST_KEYRING_ROOT");
  Assert.ok(root.startsWith("/tmp/midori-sync-native-"));
  Assert.equal(PathUtils.profileDir, PathUtils.join(root, `extensions-live-${side}`));
  const fixture = await IOUtils.readJSON(Services.env.get("MIDORI_SYNC_TEST_FIXTURE"));
  Assert.equal(fixture.kind, "h1-live");
  Assert.ok(fixture.subject.startsWith("synthetic-h1:"));
  Assert.ok(["http://127.0.0.1:8000/", "http://localhost:8000/"].includes(fixture.baseURL));
  const statePath = PathUtils.join(root, "extensions-live-state.json");
  const state = stage === "A" ? { devices: {}, stage: null } : await IOUtils.readJSON(statePath);
  Assert.equal(state.stage, { A: null, B: "A", C: "B", D: "C", E: "D", F: "E", G: "F" }[stage]);
  const first = ["A", "B"].includes(stage);
  if (first) { state.devices[side] = { profileId: uuid(), storeId: uuid() }; }
  const descriptor = state.devices[side];
  const window = Services.wm.getMostRecentWindow("navigator:browser");
  const browser = window.gBrowser.selectedBrowser;
  AddonTestUtils.initMochitest({ Assert, registerCleanupFunction, info() {} });
  const xpi = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  xpi.initWithPath(Services.env.get("MIDORI_SYNC_SIGNED_EXTENSION_FIXTURE"));
  const uri = Services.io.newURI("https://addons.mozilla.org/firefox/downloads/file/1/synthetic-fixture.xpi");
  let catalogRequests = 0;
  let prompts = 0;
  const store = createSyncExtensionStore({ getBrowser: () => browser,
    addons: { ...AddonManager, async getInstallForURL(url, options) {
      Assert.equal(url, uri.spec);
      Assert.equal(options.id, addonId);
      Assert.equal(options.type, "extension");
      const install = await AddonManager.getInstallForFile(xpi);
      Assert.equal(install.addon.signedState, AddonManager.SIGNEDSTATE_SIGNED);
      return install;
    } },
    repository: { async getAddonsByIDs(ids) {
      ++catalogRequests;
      Assert.deepEqual(ids, [addonId]);
      return [{ id: addonId, type: "extension", name: "Signed Sync fixture", sourceURI: uri }];
    } },
  });
  const approve = () => {
    const notification = window.PopupNotifications.getNotification("addon-webext-permissions", browser);
    if (notification) {
      ++prompts;
      Assert.ok(["C", "G"].includes(stage), "Only an explicit review or a fresh reference can request permissions");
      window.document.getElementById("addon-webext-permissions-notification").button.click();
    }
  };
  window.PopupNotifications.panel.addEventListener("popupshown", approve);
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  Assert.ok(keyStore.isOSBacked);
  const connection = new MidoriSyncConnection({ baseURL: fixture.baseURL, allowLocalHTTP: true, saveServer() {},
    transportFactory: (url, options) => new MidoriSyncTransport(url, options) });
  const vault = new MidoriSyncVault({ store: createSyncVaultFileStore(PathUtils.join(PathUtils.profileDir, "extension-vault")),
    keyStore, profileId: descriptor.profileId, createId: uuid,
    authorize: options => authorizeSyncSecretStore(keyStore, () =>
      Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token), options) });
  const account = new MidoriSyncAccount({ connection, vaultFactory: () => vault,
    transportFactory: (url, options) => new MidoriSyncTransport(url, options) });
  const keys = createNativeSyncKeys(account);
  let journal;
  let engine;
  let adapter;
  let acknowledgements = 0;
  const data = () => ({ retained: `Device ${side} local extension settings` });
  const checkNative = async () => {
    const addon = await AddonManager.getAddonByID(addonId);
    const database = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, "extensions.json"));
    const saved = database.addons.find(item => item.id === addonId);
    Assert.equal(!!saved, !!addon, "Native add-on database is durable before ACK");
    const startup = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, "addonStartup.json.lz4"), { decompress: true });
    const entry = Object.values(startup).map(location => location.addons?.[addonId]).find(Boolean);
    Assert.equal(!!entry, !!addon, "Native startup state is durable before ACK");
    if (addon) {
      Assert.equal(addon.signedState, AddonManager.SIGNEDSTATE_SIGNED);
      Assert.equal(saved.userDisabled, addon.userDisabled);
      Assert.equal(entry.enabled, !addon.userDisabled);
    }
  };
  try {
    if (first) { await account.pair(fixture.profiles[side].pairing_token, `Extensions synthetic profile ${side}`); }
    else {
      await account.initialize();
      if (account.snapshot.status === "locked") { await account.unlock({ interactive: false }); }
    }
    Assert.equal(account.snapshot.status, "connected");
    Assert.ok(account.snapshot.collectionSupport.extensions);
    await keys.refresh();
    if (stage === "A") {
      Assert.equal(keys.snapshot.status, "empty");
      state.recoveryCode = await keys.prepareCreation();
      await keys.confirmCreation({ recoveryCodeSaved: true });
    } else if (stage === "B") { await keys.recover(state.recoveryCode); }
    await keys.refresh();
    Assert.equal(keys.snapshot.status, "ready");
    Assert.equal(keys.snapshot.custody, "client");
    journal = await openSyncStore({ directory: PathUtils.join(PathUtils.profileDir, "extension-journal"),
      storeId: descriptor.storeId, deviceId: account.snapshot.device.id, keys, create: first });
    const deriveRecordId = (name, bytes) => keys.deriveRecordId(name, bytes);
    const recordId = await deriveSyncExtensionId("amo", addonId, deriveRecordId);
    adapter = new MidoriSyncExtensions({ store, deriveRecordId, record: id => engine.record(id) });
    engine = new MidoriSyncCollection({ collection, adapter, journal, keys, entryId: syncJournalEntryId,
      createId: uuid, pageByteBudget: true, request: async (path, options) => {
        if (path.endsWith("/ack")) {
          ++acknowledgements;
          Assert.notEqual(stage, "B", "The interrupted install cannot acknowledge its feed position");
          await checkNative();
        }
        if (path.endsWith("/operations")) {
          for (const operation of options.body.operations) {
            Assert.ok(!operation.payload.includes(addonId), "Wire references are encrypted");
            Assert.equal(JSON.parse(operation.payload).context.collection, collection);
          }
        }
        return account.withSecrets(lease => lease.request(path, options));
      } });
    await engine.initialize();
    const saveState = async () => {
      state.stage = stage;
      await IOUtils.writeJSON(statePath, state, { permissions: 0o600, flush: true });
    };
    if (stage === "B") {
      const install = store.install;
      store.install = options => install({ ...options, beforePermissionPrompt: async () => {
        await options.beforePermissionPrompt();
        const applications = await journal.list(collection, "application");
        Assert.equal(applications.length, 1);
        Assert.equal(applications[0].value.progress.phase, "awaiting-user");
        Assert.equal(acknowledgements, 0);
        Assert.equal(prompts, 0);
        state.application = { id: applications[0].id, revision: applications[0].revision };
        await saveState();
        await IOUtils.writeJSON(Services.env.get("MIDORI_SYNC_EXTENSIONS_CHECKPOINT"), {
          pid: Services.appinfo.processID, profile: PathUtils.profileDir, stage,
          phase: "awaiting-user", acknowledgements, prompts,
        }, { permissions: 0o600, flush: true });
        await new Promise(() => {});
      } });
    }
    const settle = async () => {
      for (let pass = 0; pass < 200; ++pass) {
        await engine.run({ maxPages: 100 });
        if (!engine.snapshot.more && engine.snapshot.deferred === 0) { return; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error(`extensions_live_did_not_settle:${JSON.stringify(engine.snapshot)}`);
    };
    const capture = async () => {
      await adapter.listIds();
      const result = await engine.capture(recordId);
      Assert.equal(result.status, "queued");
      Assert.equal((await journal.list(collection, "outbox")).length, 1);
      await settle();
    };
    const setLocalData = async () => {
      await ExtensionStorage.set(addonId, data());
      await (await ExtensionStorage.getFile(addonId)).saveNow();
      await ExtensionPermissions.add(addonId, { permissions: ["clipboardWrite"], origins: [] });
      Assert.ok(await store.persist("amo", addonId, await store.read("amo", addonId)));
      descriptor.uuid = JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))[addonId];
    };
    if (stage === "A") {
      await settle();
      await AddonTestUtils.promiseInstallFile(xpi);
      await setLocalData();
      await capture();
    } else if (stage === "B") {
      await settle();
      throw new Error("interrupted_install_returned_without_SIGKILL");
    } else if (stage === "C") {
      Assert.equal(await AddonManager.getAddonByID(addonId), null, "Cold reopening has not replayed the application");
      const applications = await journal.list(collection, "application");
      Assert.equal(applications.length, 1);
      Assert.equal(applications[0].id, state.application.id);
      Assert.equal(applications[0].revision, state.application.revision);
      Assert.equal(applications[0].value.progress.phase, "awaiting-user");
      for (let pass = 0; pass < 3; ++pass) { await engine.run(); }
      Assert.equal(catalogRequests, 0, "Reopening and polling never repeat an interrupted permission request");
      Assert.equal(prompts, 0);
      Assert.equal(acknowledgements, 0);
      const pending = (await engine.pendingApplicationPage()).entries;
      Assert.equal(pending.length, 1);
      Assert.equal(pending[0].summary.canReview, true);
      await engine.reviewApplication(pending[0]);
      await settle();
      Assert.equal(prompts, 1);
      Assert.deepEqual((await ExtensionPermissions.get(addonId)).permissions, [], "A received reference transfers no optional grants");
      await setLocalData();
      await (await AddonManager.getAddonByID(addonId)).disable();
      await capture();
    } else if (stage === "D") {
      Assert.deepEqual(await ExtensionStorage.get(addonId, null), data());
      await settle();
      Assert.equal((await AddonManager.getAddonByID(addonId)).userDisabled, true, "B's change reaches A");
      await (await AddonManager.getAddonByID(addonId)).uninstall();
      await capture();
      Assert.deepEqual(await ExtensionStorage.get(addonId, null), {});
    } else if (stage === "E") {
      await settle();
      Assert.equal(await AddonManager.getAddonByID(addonId), null);
      Assert.equal(XPIExports.XPIDatabase.getSyncAddonState(addonId).removal.source, "sync");
      Assert.deepEqual(await ExtensionStorage.get(addonId, null), data(), "Incoming deletion retains this device's local settings");
      Assert.equal(JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))[addonId], descriptor.uuid);
      Assert.deepEqual((await ExtensionPermissions.get(addonId)).permissions, []);
    } else if (stage === "F") {
      Assert.equal(await AddonManager.getAddonByID(addonId), null);
      await settle();
      await AddonTestUtils.promiseInstallFile(xpi);
      await capture();
    } else {
      Assert.equal(await AddonManager.getAddonByID(addonId), null);
      Assert.deepEqual(await ExtensionStorage.get(addonId, null), data(), "A cold received uninstall retains local data before replay");
      await settle();
      Assert.equal(prompts, 1);
      Assert.equal((await AddonManager.getAddonByID(addonId)).userDisabled, false);
      Assert.deepEqual(await ExtensionStorage.get(addonId, null), data());
      Assert.equal(JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))[addonId], descriptor.uuid);
      Assert.deepEqual((await ExtensionPermissions.get(addonId)).permissions, []);
    }
    await checkNative();
    Assert.equal(engine.snapshot.deferred, 0);
    Assert.equal(engine.snapshot.pending, 0);
    Assert.equal(engine.snapshot.conflicts, 0);
    await saveState();
  } finally {
    window.PopupNotifications.panel.removeEventListener("popupshown", approve);
    adapter?.close();
    engine?.close();
    await journal?.close();
    keys.close();
    account.close();
    connection.close();
  }
});
