/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncAccount } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncAccount.sys.mjs");
const { MidoriSyncConnection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncConnection.sys.mjs");
const { MidoriSyncVault } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncVault.sys.mjs");
const { createSyncVaultFileStore, authorizeSyncSecretStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncSecretStore.sys.mjs");
const { createNativeSyncKeys } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncNativeKeys.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
const { MidoriSyncRecordTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswordTracker.sys.mjs");
const { MidoriSyncPrivacyFilters, SYNC_FILTERS_ID } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPrivacyFilters.sys.mjs");
const { MidoriBlockerService, normalizeCustomFiltersText } = ChromeUtils.importESModule("resource:///modules/MidoriBlockerService.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const { SyncProtocolError } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncProtocol.sys.mjs");
const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
const bText = "||privacy-edited-on-b.example.invalid^\n";
const offlineA = "||privacy-offline-a.example.invalid^\n";
const offlineB = "||privacy-offline-b.example.invalid^\n";

function largeFilters() {
  const lines = [];
  let length = 0;
  const size = 2 * 1024 * 1024;
  for (let index = 0; ; ++index) {
    const line = `||privacy-${String(index).padStart(6, "0")}.example.invalid^\n`;
    if (length + line.length > size - 2) { break; }
    lines.push(line);
    length += line.length;
  }
  lines.push(`!${"x".repeat(size - length - 2)}\n`);
  return lines.join("");
}

add_task(async function custom_filters_round_trip_conflict_and_lost_response_across_cold_profiles() {
  const stage = Services.env.get("MIDORI_SYNC_H2_STAGE");
  Assert.ok(["A", "B", "C", "D", "E", "F", "H", "G"].includes(stage));
  Assert.ok(Services.env.get("MIDORI_SYNC_TEST_KEYRING_ROOT"));
  const fixture = await IOUtils.readJSON(Services.env.get("MIDORI_SYNC_TEST_FIXTURE"));
  Assert.equal(fixture.version, 1);
  Assert.ok(["http://localhost:8000/", "http://127.0.0.1:8000/"].includes(fixture.baseURL));
  const statePath = Services.env.get("MIDORI_SYNC_H2_STATE");
  const state = stage === "A" ? { devices: {}, stage: null } : await IOUtils.readJSON(statePath);
  const expectedPrevious = { A: null, B: "A", C: "B", D: "C", E: "D", F: "E", H: "F", G: "H" };
  Assert.equal(state.stage, expectedPrevious[stage]);
  const side = ["A", "C", "E", "G"].includes(stage) ? "A" : "B";
  const first = stage === side;
  if (first) { state.devices[side] = { profileId: uuid(), storeId: uuid() }; }
  const descriptor = state.devices[side];
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  Assert.ok(keyStore.isOSBacked);
  const tokenFactory = () => Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
  const connection = new MidoriSyncConnection({ baseURL: fixture.baseURL, allowLocalHTTP: true, saveServer: () => {},
    transportFactory: (url, options) => new MidoriSyncTransport(url, options) });
  const vault = new MidoriSyncVault({ store: createSyncVaultFileStore(PathUtils.join(PathUtils.profileDir, "privacy-vault")),
    keyStore, profileId: descriptor.profileId, createId: uuid,
    authorize: options => authorizeSyncSecretStore(keyStore, tokenFactory, options) });
  const account = new MidoriSyncAccount({ connection, vaultFactory: () => vault,
    transportFactory: (url, options) => new MidoriSyncTransport(url, options) });
  const keys = createNativeSyncKeys(account);
  let journal;
  let engine;
  let tracker;
  let loseResponse = false;
  try {
    if (first) {
      await account.pair(fixture.profiles[side].pairing_token, `Privacy synthetic profile ${side}`);
    } else {
      await account.initialize();
      if (account.snapshot.status === "locked") { await account.unlock({ interactive: false }); }
    }
    Assert.equal(account.snapshot.status, "connected");
    Assert.ok(account.snapshot.collectionSupport["midori-privacy"], "The real service explicitly negotiates custom filters");
    await keys.refresh();
    if (stage === "A") {
      Assert.equal(keys.snapshot.status, "empty");
      state.recoveryCode = await keys.prepareCreation();
      await keys.confirmCreation({ recoveryCodeSaved: true });
    } else if (stage === "B") {
      await keys.recover(state.recoveryCode);
    }
    await keys.refresh();
    Assert.equal(keys.snapshot.status, "ready");
    Assert.equal(keys.snapshot.custody, "client");
    descriptor.deviceId ??= account.snapshot.device.id;
    Assert.equal(account.snapshot.device.id, descriptor.deviceId);
    journal = await openSyncStore({ directory: PathUtils.join(PathUtils.profileDir, "privacy-journal"),
      storeId: descriptor.storeId, deviceId: descriptor.deviceId, keys, create: first });
    const adapter = new MidoriSyncPrivacyFilters({ producer: MidoriBlockerService,
      deriveRecordId: (collection, bytes) => keys.deriveRecordId(collection, bytes),
      record: id => engine.record(id), normalize: normalizeCustomFiltersText });
    engine = new MidoriSyncCollection({ collection: "midori-privacy", adapter, journal, keys,
      entryId: syncJournalEntryId, createId: uuid, pageByteBudget: true,
      request: async (path, options) => {
        for (let attempt = 0; ; ++attempt) {
          let response;
          try {
            response = await account.withSecrets(lease => lease.request(path, options));
          } catch (error) {
            if (error.code !== "rate_limited" || attempt >= 4) { throw error; }
            await new Promise(resolve => setTimeout(resolve, Math.max(1, Math.min(error.retryAfter, 60)) * 1000));
            continue;
          }
          if (loseResponse && path.endsWith("/operations")) {
            loseResponse = false;
            throw new SyncProtocolError("network_error");
          }
          return response;
        }
      } });
    await engine.initialize();
    tracker = new MidoriSyncRecordTracker({ engine, adapter });
    const capture = async () => {
      tracker.requestInventory();
      for (let pass = 0; tracker.snapshot.more && pass < 10; ++pass) { await tracker.run({ limit: 100 }); }
      Assert.ok(!tracker.snapshot.more);
    };
    const drain = async () => {
      for (let pass = 0; pass < 20; ++pass) {
        await engine.run({ maxPages: 100 });
        if (engine.snapshot.initialized) { await capture(); }
        await engine.run({ maxPages: 100 });
        if (!engine.snapshot.more && !tracker.snapshot.more) { return; }
      }
      throw new Error("privacy_live_did_not_settle");
    };
    const text = async () => (await MidoriBlockerService.readCustomFiltersSnapshot()).text;
    if (stage === "A") {
      Assert.ok(!(await MidoriBlockerService.readCustomFiltersSnapshot()).present);
      await engine.run();
      await MidoriBlockerService.setCustomFiltersText(largeFilters());
      await drain();
      Assert.equal(new TextEncoder().encode(await text()).length, 2 * 1024 * 1024);
    } else if (stage === "B") {
      await drain();
      Assert.ok(await text() === largeFilters(), "A fresh profile receives the entire two MiB file");
      await MidoriBlockerService.setCustomFiltersText(bText);
      await drain();
    } else if (stage === "C") {
      Assert.ok(await text() === largeFilters(), "The sender's native file survives a cold restart");
      await drain();
      Assert.equal(await text(), bText, "The second device's edit reaches the first device");
      await MidoriBlockerService.setCustomFiltersText(offlineA);
      await capture();
      Assert.equal(engine.snapshot.pending, 2);
    } else if (stage === "D") {
      Assert.equal(await text(), bText);
      await MidoriBlockerService.setCustomFiltersText(offlineB);
      await capture();
      await drain();
    } else if (stage === "E") {
      Assert.equal(await text(), offlineA, "The offline edit survives reopening its profile");
      await drain();
      Assert.equal(await text(), offlineA, "A simultaneous edit is preserved as a visible conflict");
      Assert.ok(engine.snapshot.conflicts > 0);
      const entry = (await engine.conflictPage()).entries.find(row => row.canAcceptRemote);
      Assert.ok(entry);
      const preview = await engine.conflictPreview(entry);
      await engine.resolveConflict({ ...entry, choice: "remote", localRevision: preview.localRevision });
      await drain();
      Assert.equal(await text(), offlineB);
    } else if (stage === "F") {
      await drain();
      Assert.equal(await text(), offlineB);
      await MidoriBlockerService.setCustomFiltersText("");
      await capture();
      Assert.equal(engine.snapshot.pending, 1);
      loseResponse = true;
      await Assert.rejects(engine.run(), /network_error/);
      Assert.equal(engine.snapshot.pending, 1, "The accepted clear remains queued after losing its response");
      state.clearOperation = (await journal.list("midori-privacy", "outbox"))[0].value.operation;
    } else if (stage === "H") {
      Assert.deepEqual((await journal.list("midori-privacy", "outbox"))[0].value.operation, state.clearOperation,
        "Restart retains the original clear operation and ciphertext");
      await drain();
      Assert.equal(await text(), "");
    } else {
      Assert.equal(await text(), offlineB);
      await drain();
      Assert.deepEqual(await MidoriBlockerService.readCustomFiltersSnapshot(), { present: true, text: "" });
      Assert.equal((await adapter.read(SYNC_FILTERS_ID)).byte_count, 0);
    }
    Assert.equal(engine.snapshot.conflicts, 0);
    if (!["C", "F"].includes(stage)) { Assert.equal(engine.snapshot.pending, 0); }
    state.stage = stage;
    await IOUtils.writeJSON(statePath, state, { permissions: 0o600, flush: true });
    Services.prefs.savePrefFile(null);
  } finally {
    tracker?.close();
    engine?.close();
    await journal?.close();
    keys.close();
    account.close();
    connection.close();
  }
});
