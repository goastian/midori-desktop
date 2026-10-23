/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task, info */

const { MidoriSyncTransport } = ChromeUtils.importESModule("resource:///modules/MidoriSyncTransport.sys.mjs");
const { MidoriSyncService: service } = ChromeUtils.importESModule("resource:///modules/MidoriSyncService.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource:///modules/MidoriSyncIndex.sys.mjs");
const { syncSummary } = ChromeUtils.importESModule("resource:///modules/MidoriSyncUi.sys.mjs");
const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
const { FormHistory } = ChromeUtils.importESModule("resource://gre/modules/FormHistory.sys.mjs");
const { formAutofillStorage } = ChromeUtils.importESModule("resource://autofill/FormAutofillStorage.sys.mjs");
const { MidoriSyncTabs } = ChromeUtils.importESModule("resource:///modules/MidoriSyncTabs.sys.mjs");
const { MidoriSyncAccount } = ChromeUtils.importESModule("resource:///modules/MidoriSyncAccount.sys.mjs");
const { MidoriSyncConnection } = ChromeUtils.importESModule("resource:///modules/MidoriSyncConnection.sys.mjs");
const { MidoriSyncVault } = ChromeUtils.importESModule("resource:///modules/MidoriSyncVault.sys.mjs");
const { createProfileSyncVault, createSyncVaultFileStore, authorizeSyncSecretStore } = ChromeUtils.importESModule("resource:///modules/MidoriSyncSecretStore.sys.mjs");
const { recoverLocalSyncKeys } = ChromeUtils.importESModule("resource:///modules/MidoriSyncKeys.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource:///modules/MidoriSyncStore.sys.mjs");
const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

add_task(async function automatic_offline_capture_survives_a_lost_receipt_and_process_kill() {
  const stage = Services.env.get("MIDORI_SYNC_H4_STAGE");
  Assert.ok(["A", "B", "C", "D"].includes(stage));
  const scenario = Services.env.get("MIDORI_SYNC_H4_CASE") || "recovery";
  Assert.ok(["recovery", "revoked", "epoch"].includes(scenario));
  const fixture = await IOUtils.readJSON(Services.env.get("MIDORI_SYNC_TEST_FIXTURE"));
  Assert.equal(fixture.version, 1);
  Assert.equal(fixture.kind, "h1-live");
  Assert.ok(typeof fixture.subject === "string" && fixture.subject.startsWith("synthetic-h1:"));
  Assert.ok(["http://127.0.0.1:8000/", "http://localhost:8000/"].includes(fixture.baseURL));
  const statePath = Services.env.get("MIDORI_SYNC_H4_STATE");
  const state = stage === "A" ? {} : await IOUtils.readJSON(statePath);
  const selected = ["bookmarks", "history", "browser-settings", "passwords", "credit-cards", "tabs", "addresses", "form-history"];
  Services.io.manageOfflineStatus = false;
  Services.io.offline = ["B", "C"].includes(stage);
  Services.prefs.setStringPref("midori.sync.serverConfig", JSON.stringify({ baseURL: fixture.baseURL, allowLocalHTTP: true }));
  Services.prefs.setBoolPref("midori.sync.enabled", true);
  Services.prefs.setBoolPref("midori.sync.background.enabled", false);
  Services.prefs.setBoolPref("browser.formfill.enable", true);
  for (const name of ["bookmarks", "history", "browser-settings", "passwords", "credit-cards", "tabs", "addresses", "form-history"]) {
    Services.prefs.setBoolPref(`midori.sync.collection.${name}.enabled`, selected.includes(name));
  }
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  const wait = async (condition, message) => {
    for (let attempt = 0; attempt < (stage === "D" ? 1800 : 300); ++attempt) {
      if (await condition()) { Assert.ok(true, message); return; }
      await pause();
    }
    info(JSON.stringify({ background: service.backgroundSnapshot, collections: service.syncCollectionsSnapshot }));
    Assert.ok(false, message);
  };
  const history = () => service.collection("history");
  const bookmarks = () => service.collection("bookmarks");
  const addressFields = { name: "Offline fixture", "street-address": "123 Example Street", "address-level2": "Example City",
    "address-level1": "CA", "postal-code": "94043", country: "US" };
  const cardFields = { "cc-name": "Offline fixture", "cc-number": "4111111111111111", "cc-exp-month": 12, "cc-exp-year": 2032 };
  const editLogin = async password => {
    const original = (await Services.logins.searchLoginsAsync({ guid: state.passwordId }))[0];
    const updated = original.clone();
    updated.password = password;
    await Services.logins.modifyLoginAsync(original, updated);
  };
  const originalTabs = MidoriSyncTabs.prototype.snapshot;
  MidoriSyncTabs.prototype.snapshot = function() {
    const count = Services.prefs.getIntPref("midori.sync.test.tabCount", 1);
    return { windows: [{ id: 0, tabs: count }], omitted: 0, tabs: Array.from({ length: count }, (_, index) => ({
      url: `https://example.invalid/h4-tab-${index}`, title: "Offline tab fixture", window: 0, index,
      pinned: false, group: null, workspace: null })) };
  };
  const originalRequest = MidoriSyncTransport.prototype.request;
  const requests = [];
  let operationReplayed = false;
  let protectedBefore = null;
  if (stage === "D" && scenario !== "recovery") {
    protectedBefore = await (await createProfileSyncVault()).load();
    const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
    const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
    const controllerVault = new MidoriSyncVault({ profileId: uuid(), createId: uuid, keyStore,
      store: createSyncVaultFileStore(PathUtils.join(PathUtils.profileDir, "h4-controller")),
      authorize: options => authorizeSyncSecretStore(keyStore, () =>
        Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token), options) });
    const connection = new MidoriSyncConnection({ baseURL: fixture.baseURL, allowLocalHTTP: true, saveServer: () => {},
      transportFactory: (url, options) => new MidoriSyncTransport(url, options) });
    const controller = new MidoriSyncAccount({ connection, vaultFactory: () => controllerVault,
      transportFactory: (url, options) => new MidoriSyncTransport(url, options) });
    try {
      await controller.pair(fixture.profiles.B.pairing_token, "H4 control device");
      await controller.withSecrets(async lease => {
        Assert.ok(lease.scope === protectedBefore.scope, "The control device belongs to this synthetic account");
        Assert.ok(JSON.parse(lease.scope)[2] === fixture.subject, "Only the generated synthetic identity can be changed");
        if (scenario === "revoked") {
          await lease.request(`api/v1/devices/${state.records.tabs}`, { method: "DELETE", maxBytes: 512 });
        } else {
          const { data } = await lease.request("api/v1/crypto/state", { maxBytes: 32768 });
          const response = await lease.request("api/v1/crypto/reset", { method: "POST", maxBytes: 32768,
            body: { confirm: true, crypto: { epoch: data.epoch, revision: data.revision } } });
          Assert.ok(response.data.epoch !== data.epoch, "The test explicitly resets only the synthetic account's epoch");
        }
      });
    } finally {
      controller.close();
      connection.close();
    }
  }
  MidoriSyncTransport.prototype.request = async function(path, options) {
    requests.push(path);
    Assert.ok(!Services.io.offline, "The offline service makes no HTTP requests");
    if (stage === "D" && path.endsWith("/operations")) {
      const name = path.split("/").at(-2);
      for (const operation of options.body.operations) {
        if (operation.operation_id === state.operations?.[name]?.id) {
          Assert.equal(syncJournalEntryId(name, "outbox", JSON.stringify(operation)), state.operations[name].digest,
            "Restart replays the exact durable operation, including its ciphertext");
          operationReplayed = true;
        }
      }
    }
    const result = await originalRequest.call(this, path, options);
    if (stage === "C" && path.endsWith("/operations")) {
      Assert.ok(requests.some(value => value === "api/v1/account"), "The saved account is verified before transmission");
      Assert.ok(requests.some(value => value === "api/v1/crypto/state"), "The registry is verified before transmission");
      await IOUtils.writeJSON(Services.env.get("MIDORI_SYNC_H4_CHECKPOINT"), { pid: Services.appinfo.processID,
        profile: PathUtils.profileDir, stage, scenario, receiptReceived: true }, { flush: true });
      await new Promise(() => {});
    }
    return result;
  };
  try {
    if (stage === "A") {
      const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
      if (!keyStore.isOSBacked) {
        const token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
        await token.changePassword("", "public offline test password");
      }
      await service.account.initialize();
      await wait(() => !service.connection.snapshot.checking, "Initial capabilities settle");
      await service.account.pair(fixture.profiles.A.pairing_token, "H4 offline fixture");
      await service.keys.refresh();
      Assert.equal(service.keys.snapshot.status, "empty");
      await service.keys.prepareCreation();
      await service.keys.confirmCreation({ recoveryCodeSaved: true });
      await service.keys.refresh();
      const item = await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.unfiledGuid,
        title: "Online baseline", url: "https://example.invalid/h4-offline-bookmark" });
      state.bookmarkId = item.guid;
      state.url = "https://example.invalid/h4-offline-history";
      const date = new Date();
      state.day = Math.floor(date.getTime() / 86400000) * 86400000000;
      state.visitMs = date.getTime();
      await PlacesUtils.history.insert({ url: state.url, title: "Online baseline", visits: [{ date, transition: 1 }] });
      state.historyId = `h2:${await service.keys.deriveRecordId("history", [state.url, state.day])}`;
      const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
      login.init("https://example.invalid", "https://example.invalid", null,
        "offline-fixture", "public baseline fixture", "username", "password");
      const inserted = await Services.logins.addLoginAsync(login);
      state.passwordId = inserted.QueryInterface(Ci.nsILoginMetaInfo).guid;
      await formAutofillStorage.initialize();
      state.cardId = await formAutofillStorage.creditCards.add(cardFields);
      state.addressId = await formAutofillStorage.addresses.add(addressFields);
      await FormHistory.update({ op: "bump", fieldname: "h4-offline-city", value: "Example City" });
      state.formId = `f1:${await service.keys.deriveRecordId("form-history", ["h4-offline-city", "Example City"])}`;
      state.records = { bookmarks: state.bookmarkId, history: state.historyId, passwords: state.passwordId,
        "credit-cards": state.cardId, addresses: state.addressId, "form-history": state.formId,
        tabs: service.account.snapshot.device.id, "browser-settings": "midori.verticaltabs.width" };
      Services.prefs.setIntPref("midori.verticaltabs.width", 320);
      Services.prefs.setIntPref("midori.sync.test.tabCount", 1);
      for (let attempt = 0; attempt < 30; ++attempt) {
        const result = await service.syncNow({ inventory: attempt === 0 });
        Assert.deepEqual(result.errors, {});
        if (!result.more) { break; }
      }
      Assert.ok(service.syncCollectionsSnapshot.filter(row => selected.includes(row.name)).every(row => row.lastSuccessAt));
      for (const [name, id] of Object.entries(state.records)) {
        Assert.ok((await (await service.collection(name)).record(id))?.remote?.value, `The online baseline includes ${name}`);
      }
      state.lastSuccessAt = Object.fromEntries(service.syncCollectionsSnapshot.map(row => [row.name, row.lastSuccessAt]));
    } else {
      Services.prefs.setBoolPref("midori.sync.background.enabled", true);
      service.init();
      if (stage === "D" && scenario !== "recovery") {
        await wait(() => scenario === "revoked" ? service.account.snapshot.status === "expired" :
          service.keys.snapshot.error === "crypto_state_conflict", "Remote revocation or epoch change stops the restored profile");
      } else {
        await wait(() => service.account.snapshot.status === (["B", "C"].includes(stage) ? "local" : "connected") &&
          service.keys.snapshot.status === "ready", "Background startup opens the saved account and keys");
      }
      if (stage !== "D") {
        Assert.equal(requests.length, 0, "Cold offline startup does not query capabilities or the account");
        Assert.equal(service.keys.snapshot.localOnly, true);
        Assert.equal(syncSummary(service), "offline");
      }
      if (stage === "B") {
        await wait(() => selected.every(name => service.syncCollectionsSnapshot.find(row => row.name === name)?.status === "offline"),
          "Previously initialized collections open offline");
        await PlacesUtils.bookmarks.update({ guid: state.bookmarkId, title: "Offline first edit" });
        await PlacesUtils.history.insert({ url: state.url, visits: [{ date: new Date(state.visitMs + 1000), transition: 1 }] });
        await editLogin("public first offline fixture");
        await formAutofillStorage.initialize();
        await formAutofillStorage.creditCards.update(state.cardId, { ...cardFields, "cc-name": "First offline edit" });
        await formAutofillStorage.addresses.update(state.addressId, { ...addressFields, name: "First offline edit" });
        await FormHistory.update({ op: "bump", fieldname: "h4-offline-city", value: "Example City" });
        Services.prefs.setIntPref("midori.verticaltabs.width", 360);
        Services.prefs.setIntPref("midori.sync.test.tabCount", 2);
        await wait(async () => {
          for (const [name, id] of Object.entries(state.records)) {
            if (!(await (await service.collection(name)).record(id))?.pending) { return false; }
          }
          return true;
        }, "Eight collections are captured automatically without network");
        await PlacesUtils.history.remove(state.url);
        await PlacesUtils.bookmarks.update({ guid: state.bookmarkId, title: "Offline final edit" });
        await editLogin("public final offline fixture");
        await formAutofillStorage.creditCards.update(state.cardId, { ...cardFields, "cc-name": "Offline final edit" });
        await formAutofillStorage.addresses.update(state.addressId, { ...addressFields, name: "Offline final edit" });
        await FormHistory.update({ op: "remove", fieldname: "h4-offline-city", value: "Example City" });
        Services.prefs.setIntPref("midori.verticaltabs.width", 404);
        Services.prefs.setIntPref("midori.sync.test.tabCount", 3);
        await wait(async () => {
          for (const [name, id] of Object.entries(state.records)) {
            if (!(await (await service.collection(name)).record(id))?.localChange) { return false; }
          }
          return (await (await history()).record(state.historyId)).localChange.deleted &&
            (await (await bookmarks()).record(state.bookmarkId)).localChange.value.title === "Offline final edit";
        }, "Further edits and deliberate deletions are durable while the first operations are pending");
        state.operations = {};
        const journal = await service.journal;
        for (const name of selected) {
          const [entry] = await journal.list(name, "outbox");
          state.operations[name] = { id: entry.id, digest: syncJournalEntryId(name, "outbox", JSON.stringify(entry.value.operation)) };
        }
        Assert.ok(service.syncCollectionsSnapshot.every(row => row.lastSuccessAt === state.lastSuccessAt[row.name]),
          "Offline capture never advances remote completion times");
        Assert.equal(requests.length, 0);
      } else if (stage === "C") {
        Assert.ok((await (await history()).record(state.historyId)).localChange.deleted, "The deliberate deletion survives a new process");
        Services.io.offline = false;
        await new Promise(() => {});
      } else if (scenario !== "recovery") {
        service.uninit();
        await wait(() => !service.account.snapshot.busy && !service.keys.snapshot.busy, "Verification settles before inspecting saved work");
        Assert.ok(service.keys.snapshot.status !== "ready", "Unverified keys cannot authorize uploads");
        Assert.equal(syncSummary(service), scenario === "revoked" ? "reconnect" : "attention");
        Assert.ok(!requests.some(path => path.endsWith("/operations") || path.endsWith("/ack") ||
          ["api/v1/crypto/reset", "api/v1/crypto/activate", "api/v1/crypto/recovery"].includes(path)),
        "Background verification sends no data or reset after the remote state changed");
        const saved = await (await createProfileSyncVault()).load();
        Assert.ok(JSON.stringify(saved.data.crypto) === JSON.stringify(protectedBefore.data.crypto),
          "Remote rejection preserves the original local recovery material and verified cache");
        Assert.ok(JSON.stringify(saved.data.journal) === JSON.stringify(protectedBefore.data.journal));
        const localKeys = await recoverLocalSyncKeys({ scope: saved.scope, value: saved.data.crypto,
          cryptoFactory: () => Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto) });
        let journal;
        try {
          journal = await openSyncStore({ directory: PathUtils.join(PathUtils.profileDir, "midori-sync", "journals"),
            storeId: saved.data.journal.store_id, deviceId: saved.data.journal.device_id, keys: localKeys, create: false });
          for (const [name, id] of Object.entries(state.records)) {
            const operation = await journal.read(state.operations[name].id);
            Assert.ok(operation && syncJournalEntryId(name, "outbox", JSON.stringify(operation.value.operation)) ===
              state.operations[name].digest, `The exact encrypted ${name} operation remains available`);
            const mirror = await journal.read(syncJournalEntryId(name, "record", id));
            Assert.ok(mirror.value.localChange, `The subsequent ${name} capture remains encrypted and recoverable`);
            const metadata = await journal.read(syncJournalEntryId(name, "metadata", "collection-state-v1"));
            Assert.equal(metadata.value.version, 5);
            Assert.equal(metadata.value.lastCompletedAt, state.lastSuccessAt[name]);
          }
          Assert.ok((await journal.read(syncJournalEntryId("history", "record", state.historyId))).value.localChange.deleted);
        } finally {
          await journal?.close();
          localKeys.close();
        }
      } else {
        await wait(async () => (await (await history()).record(state.historyId))?.remote?.deleted === true &&
          (await (await bookmarks()).record(state.bookmarkId))?.remote?.value.title === "Offline final edit" &&
          syncSummary(service) === "synced", "Automatic reconnect finishes both captured intentions after the abrupt kill");
        Assert.equal(service.keys.snapshot.localOnly, false);
        Assert.ok(operationReplayed, "A receipt committed before the kill is recovered through the original operation");
        Assert.equal(await PlacesUtils.bookmarks.fetch(state.bookmarkId).then(item => item.title), "Offline final edit");
        Assert.equal((await (await history()).record(state.historyId)).localChange, null);
        Assert.equal((await (await bookmarks()).record(state.bookmarkId)).localChange, null);
        const expected = { passwords: value => value.password === "public final offline fixture",
          "credit-cards": value => value.name === "Offline final edit", addresses: value => value.fields.name === "Offline final edit",
          tabs: value => value.tab_count === 3, "browser-settings": value => value.value === 404 };
        for (const [name, check] of Object.entries(expected)) {
          const record = await (await service.collection(name)).record(state.records[name]);
          Assert.ok(check(record.remote.value), `The final offline value reaches ${name}`);
          Assert.equal(record.localChange, null);
        }
        Assert.ok((await (await service.collection("form-history")).record(state.formId)).remote.deleted);
        Assert.equal(await FormHistory.count({ fieldname: "h4-offline-city", value: "Example City" }), 0);
      }
    }
    await IOUtils.writeJSON(statePath, state, { flush: true });
  } finally {
    service.uninit();
    if (stage !== "C") {
      for (const name of selected) {
        await wait(() => !service.syncCollectionsSnapshot.some(row => row.name === name && row.status === "syncing"), "Collection work settles");
        service.setCollectionEnabled(name, false);
        service.setCollectionEnabled(name, true);
      }
      if (!(stage === "D" && scenario !== "recovery")) {
        await (await service.journal).close();
        await formAutofillStorage._saveImmediately();
      }
      const preferences = Services.dirsvc.get("ProfD", Ci.nsIFile);
      preferences.append("prefs.js");
      Services.prefs.savePrefFile(preferences);
      Assert.ok(preferences.exists(), "The next process receives the profile's native preferences");
    }
    MidoriSyncTransport.prototype.request = originalRequest;
    MidoriSyncTabs.prototype.snapshot = originalTabs;
  }
});
