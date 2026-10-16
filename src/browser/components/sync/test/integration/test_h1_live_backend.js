/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncAccount } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncAccount.sys.mjs");
const { MidoriSyncConnection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncConnection.sys.mjs");
const { MidoriSyncVault } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncVault.sys.mjs");
const { createSyncVaultFileStore, authorizeSyncSecretStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncSecretStore.sys.mjs");
const { createNativeSyncKeys } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncNativeKeys.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
const { MidoriSyncHistory, historyRecordId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncHistory.sys.mjs");
const { MidoriSyncHistoryTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncHistoryTracker.sys.mjs");
const { MidoriSyncRotation } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncRotation.sys.mjs");
const { openSyncRecord, sealSyncRecord } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncRecord.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const { SyncProtocolError } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncProtocol.sys.mjs");
const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");

add_task(async function h1_client_custody_survives_recovery_rotation_and_restart() {
  const fixturePath = Services.env.get("MIDORI_SYNC_TEST_FIXTURE");
  Assert.ok(fixturePath, "MIDORI_SYNC_TEST_FIXTURE is required for this opt-in live test");
  const fixture = await IOUtils.readJSON(fixturePath);
  Assert.equal(fixture.version, 1);
  Assert.equal(fixture.kind, "h1-live");
  Assert.ok(["http://localhost:8000/", "http://127.0.0.1:8000/"].includes(fixture.baseURL),
    "Use the existing authorized backend on port 8000");
  Assert.ok(["A", "B", "C"].every(name => typeof fixture.profiles?.[name]?.pairing_token === "string"));
  Assert.ok(Services.env.get("MIDORI_SYNC_TEST_KEYRING_ROOT"),
    "Run scripts/test-sync-native.sh h1 with its private keyring session");
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  info(keyStore.isOSBacked ? "Vault backend: isolated Linux Secret Service" : "Vault backend: test-profile NSS");
  const tokenFactory = () => Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
  let primaryToken;
  if (!keyStore.isOSBacked) {
    primaryToken = tokenFactory();
    await primaryToken.changePassword("", "public h1 integration primary password");
  }
  const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
  const devices = [];
  const historyURL = "https://example.invalid/h1-live-history";
  const legacyHistoryURL = "https://example.invalid/h1-legacy-history";
  const day = Math.floor(Date.now() / 86400000) * 86400000000;
  const request = (device, path, options) => device.account.withSecrets(lease => lease.request(path, options));
  const restartJournal = async device => {
    device.engine?.close();
    if (device.historyEngine) {
      device.historyEngine.close();
      device.historyEngine = null;
      device.history = new MidoriSyncHistory({ deriveRecordId: (collection, bytes) =>
        device.keys.deriveRecordId(collection, bytes) });
    }
    await device.journal.close();
    device.journal = await openSyncStore({ ...device.journalOptions, keys: device.keys, create: false });
    device.engine = device.createEngine();
  };
  let rotation;
  let tracker;
  try {
    const connectDevice = async name => {
      const connection = new MidoriSyncConnection({
        baseURL: fixture.baseURL, allowLocalHTTP: true, saveServer: () => {},
        transportFactory: (url, options) => new MidoriSyncTransport(url, options),
      });
      const store = createSyncVaultFileStore(PathUtils.join(PathUtils.profileDir, `h1-live-${name}`));
      const profileId = uuid();
      const createVault = () => new MidoriSyncVault({
        store, keyStore, profileId, createId: uuid,
        authorize: options => authorizeSyncSecretStore(keyStore, tokenFactory, options),
      });
      const device = { connection, store, createVault, vault: createVault(), values: new Map(), clock: null,
        recoveryWrites: 0, secretSent: false, tamperRegistry: false, rotationPublications: [] };
      device.createAccount = () => new MidoriSyncAccount({
        connection, vaultFactory: () => device.vault,
        transportFactory: (url, options) => {
          const transport = new MidoriSyncTransport(url, options);
          return {
            async request(path, requestOptions) {
              if (device.blockCryptoReads && path === "api/v1/crypto/state") {
                throw new SyncProtocolError("network_error");
              }
              if (requestOptions?.body && Object.hasOwn(requestOptions.body, "recovery_secret")) {
                device.secretSent = true;
              }
              if (path === "api/v1/crypto/recovery" && requestOptions?.method === "POST") {
                ++device.recoveryWrites;
              }
              if (path === "api/v1/crypto/rotation" && requestOptions?.method === "POST") {
                device.rotationPublications.push(structuredClone(requestOptions.body));
              }
              const response = await transport.request(path, requestOptions);
              if (device.loseRegistryResponse && path === "api/v1/crypto/rotation" && requestOptions?.method === "POST") {
                device.loseRegistryResponse = false;
                device.blockCryptoReads = true;
                throw new SyncProtocolError("network_error");
              }
              if (path === "api/v1/crypto/state") {
                const data = { ...response.data };
                if (device.tamperRegistry) {
                  data.registry_auth = "0".repeat(64);
                }
                if (device.tamperCustody) {
                  data.custody = "server";
                }
                if (device.tamperServerRecovery) {
                  data.server_recovery = true;
                }
                return { ...response, data };
              }
              return response;
            },
            close() { transport.close(); },
          };
        },
      });
      device.account = device.createAccount();
      device.keys = createNativeSyncKeys(device.account);
      devices.push(device);
      await device.account.pair(fixture.profiles[name].pairing_token, `H1 synthetic device ${name}`);
      Assert.equal(device.account.snapshot.status, "connected");
      return device;
    };
    for (const name of ["A", "B"]) {
      await connectDevice(name);
    }
    const [a, b] = devices;
    Assert.notEqual(a.account.snapshot.device.id, b.account.snapshot.device.id);
    await a.keys.refresh();
    Assert.equal(a.keys.snapshot.status, "empty", "Generate a fresh synthetic fixture for every run");
    const recoveryCode = await a.keys.prepareCreation();
    await Assert.rejects(a.keys.confirmCreation(), error => error.code === "recovery_backup_required");
    const inactive = await request(a, "api/v1/crypto/state");
    Assert.equal(inactive.data.keys.length, 0, "Activation waits for explicit backup confirmation");
    await a.keys.confirmCreation({ recoveryCodeSaved: true });
    await a.keys.refresh();
    Assert.equal(a.keys.snapshot.status, "ready");
    Assert.equal(a.keys.snapshot.custody, "client");
    Assert.equal(a.keys.snapshot.serverRecovery, false);
    await b.keys.refresh();
    Assert.equal(b.keys.snapshot.status, "recovery-required", "An account session cannot decrypt Sync by itself");
    await Assert.rejects(b.keys.recover(), error => error.code === "invalid_recovery_code");
    await Assert.rejects(b.keys.recover(`MS2-${Array(8).fill("00000000").join("-")}`),
      error => error.code === "recovery_failed");
    b.tamperCustody = true;
    await Assert.rejects(b.keys.recover(recoveryCode), error => error.code === "registry_authentication_failed");
    b.tamperCustody = false;
    b.tamperServerRecovery = true;
    await Assert.rejects(b.keys.recover(recoveryCode), error => error.code === "registry_authentication_failed");
    b.tamperServerRecovery = false;
    await b.keys.recover(recoveryCode);
    Assert.equal(b.keys.snapshot.status, "ready");
    Assert.equal(b.keys.snapshot.activeKeyId, a.keys.snapshot.activeKeyId);
    Assert.equal(b.keys.snapshot.identityKeyId, a.keys.snapshot.identityKeyId);
    const state = await request(a, "api/v1/crypto/state");
    Assert.equal(state.data.custody, "client");
    Assert.equal(state.data.server_recovery, false);
    Assert.ok(typeof state.data.registry_auth === "string" && state.data.registry_auth.length === 64);
    Assert.ok(!JSON.stringify(state.data).includes(recoveryCode));
    await Assert.rejects(request(b, "api/v1/crypto/recovery"), error => error.status === 409);

    const openDeviceJournal = async device => {
      device.history = new MidoriSyncHistory({ deriveRecordId: (collection, input) =>
        device.keys.deriveRecordId(collection, input) });
      device.journalOptions = {
        directory: PathUtils.join(PathUtils.profileDir, "h1-live-journals"), storeId: uuid(),
        deviceId: device.account.snapshot.device.id, keys: device.keys, create: true,
      };
      device.journal = await openSyncStore(device.journalOptions);
      device.createEngine = () => new MidoriSyncCollection({
        collection: "bookmarks", journal: device.journal, keys: device.keys,
        createId: uuid, entryId: syncJournalEntryId, now: () => device.clock ?? Date.now(),
        request: async (path, options) => {
          const response = await request(device, path, options);
          if (device.loseResponse && path.endsWith("/operations")) {
            device.loseResponse = false;
            throw new SyncProtocolError("network_error");
          }
          return response;
        },
        adapter: {
          validate(_id, value) {
            if (typeof value?.title !== "string" || typeof value.url !== "string") {
              throw new SyncProtocolError("invalid_record");
            }
            return structuredClone(value);
          },
          ttlOf(value) { return value.expires_at ?? null; },
          async apply(record) {
            if (record.deleted) {
              device.values.delete(record.id);
            } else {
              device.values.set(record.id, record.value);
            }
            return { status: "applied" };
          },
        },
      });
      device.engine = device.createEngine();
      await device.engine.run();
      const disk = JSON.stringify(await device.store.read());
      const local = (await device.vault.load()).data;
      Assert.ok(!disk.includes(recoveryCode) && !disk.includes(local.token) &&
        !disk.includes(local.crypto.secret), "Recovery material and credentials are encrypted in the vault");
    };
    for (const device of devices) {
      await openDeviceJournal(device);
    }
    const historyId = await a.history.rememberLocal(historyURL, day);
    Assert.ok(/^h2:[0-9a-f]{64}$/.test(historyId));
    Assert.equal(await b.history.rememberLocal(historyURL, day), historyId, "Recovered identity derives the same opaque locator");
    Assert.notEqual(await b.history.rememberLocal(historyURL, day + 86400000000), historyId);
    const input = new TextEncoder().encode(JSON.stringify([historyURL, day]));
    try {
      Assert.notEqual(await a.keys.deriveRecordId("bookmarks", input), historyId.slice(3), "Identity is separated by collection");
    } finally {
      input.fill(0);
    }

    const original = { title: "H1 cifrado ñ", url: "https://example.invalid/h1-live-bookmark" };
    const bookmarkId = "h1-live-bookmark";
    a.values.set(bookmarkId, original);
    const queuedId = await a.engine.enqueue(bookmarkId, original);
    await restartJournal(a);
    a.loseResponse = true;
    await Assert.rejects(a.engine.run(), error => error.code === "network_error");
    Assert.equal(a.engine.snapshot.pending, 1);
    Assert.ok(await a.journal.read(queuedId), "A lost response preserves the durable encrypted operation");
    await restartJournal(a);
    await a.engine.run();
    Assert.equal(a.engine.snapshot.pending, 0);
    Assert.equal((await a.engine.record(bookmarkId)).remote.revision, "1", "Receipt replay does not duplicate a write");
    await b.engine.run();
    Assert.deepEqual(b.values.get(bookmarkId), original);
    const page = await request(b, "api/v1/sync/collections/bookmarks/changes");
    const record = page.data.changes.find(change => change.record.id === bookmarkId).record;
    const expected = { collection: "bookmarks", id: bookmarkId, generation: page.data.generation };
    Assert.equal(JSON.parse(record.payload).context.schema_version, 2);
    Assert.ok(!record.payload.includes(original.title) && !record.payload.includes(original.url));
    Assert.deepEqual(await openSyncRecord(b.keys, expected, record), original);
    await Assert.rejects(openSyncRecord(b.keys, expected, { ...record, deleted: true }),
      error => error.code === "record_authentication_failed");
    await Assert.rejects(openSyncRecord(b.keys, expected, { ...record, ttl: new Date(Date.now() + 60000).toISOString() }),
      error => error.code === "record_authentication_failed");
    await Assert.rejects(openSyncRecord(b.keys, expected, { ...record, deleted: true, payload: "" }),
      error => error.code === "record_authentication_failed");

    const localBefore = JSON.stringify((await b.vault.load()).data.crypto);
    b.tamperRegistry = true;
    await Assert.rejects(b.keys.refresh(), error => error.code === "registry_authentication_failed");
    Assert.ok(JSON.stringify((await b.vault.load()).data.crypto) === localBefore,
      "An unauthenticated registry cannot replace saved recovery material");
    b.tamperRegistry = false;
    b.tamperCustody = true;
    await Assert.rejects(b.keys.refresh(), error => error.code === "crypto_state_conflict");
    b.tamperCustody = false;
    await b.keys.refresh();
    Assert.equal(b.keys.snapshot.status, "ready");

    const expiry = Math.floor(Date.now() / 1000) * 1000 - 1000;
    const expiringId = "h1-live-expiring";
    const expiring = { title: "TTL autenticado", url: "https://example.invalid/h1-live-expiring",
      expires_at: new Date(expiry).toISOString() };
    a.clock = expiry - 1000;
    a.values.set(expiringId, expiring);
    await a.engine.enqueue(expiringId, expiring);
    await a.engine.run();
    a.clock = null;
    await b.engine.run();
    Assert.ok(!b.values.has(expiringId), "The receiver honors the authenticated expiry");
    const expiredRemote = (await b.engine.record(expiringId)).remote;
    Assert.equal(expiredRemote.deleted, false, "The server preserves ciphertext even after the actual TTL deadline");
    Assert.ok(expiredRemote.payload.length > 0);

    a.values.delete(bookmarkId);
    await a.engine.enqueue(bookmarkId, null, { deleted: true });
    await a.engine.run();
    await b.engine.run();
    Assert.ok(!b.values.has(bookmarkId));
    const tombstone = (await b.engine.record(bookmarkId)).remote;
    Assert.equal(tombstone.deleted, true);
    Assert.ok(tombstone.payload.length > 0, "Deletion carries authenticated ciphertext");
    Assert.equal(JSON.parse(tombstone.payload).context.schema_version, 2);
    Assert.equal(await openSyncRecord(b.keys, expected, tombstone), null);

    const historyValue = { version: 1, url: historyURL, title: "H1 historial ñ", dayStartUsec: day,
      visits: [{ atUsec: day + 1234567, transition: 1, count: 1 }] };
    a.historyEngine = new MidoriSyncCollection({ collection: "history", journal: a.journal, keys: a.keys,
      createId: uuid, entryId: syncJournalEntryId, adapter: a.history,
      request: (path, options) => request(a, path, options) });
    await a.historyEngine.run();
    await a.historyEngine.enqueue(historyId, historyValue);
    await a.historyEngine.run();
    const legacyHistoryValue = { ...historyValue, url: legacyHistoryURL, title: "Historial anterior a identidad privada" };
    const legacyHistoryId = historyRecordId(legacyHistoryURL, day);
    const migratedHistoryId = await a.history.rememberLocal(legacyHistoryURL, day);
    const historyGeneration = (await request(a, "api/v1/sync/collections/history/changes")).data.generation;
    const legacyHistoryRecord = await sealSyncRecord(a.keys, {
      collection: "history", id: legacyHistoryId, generation: historyGeneration, base_revision: "0",
    }, { deleted: false, ttl: null, value: legacyHistoryValue });
    const seedLegacyHistory = await request(a, "api/v1/sync/collections/history/operations", {
      method: "POST", body: { generation: historyGeneration, crypto: legacyHistoryRecord.crypto,
        operations: [{ operation_id: uuid(), id: legacyHistoryId, base_revision: "0", deleted: false,
          ttl: null, payload: legacyHistoryRecord.payload }] },
    });
    Assert.equal(seedLegacyHistory.data.results[0].status, "applied");
    Assert.notEqual(legacyHistoryId, migratedHistoryId);

    b.engine.close();
    await b.journal.close();
    b.keys.close();
    b.account.close();
    b.vault = b.createVault();
    b.account = b.createAccount();
    b.keys = createNativeSyncKeys(b.account);
    await b.account.unlock();
    await b.keys.refresh();
    Assert.equal(b.keys.snapshot.status, "ready", "Restart restores local client custody without the recovery code");
    b.journal = await openSyncStore({ ...b.journalOptions, keys: b.keys, create: false });
    b.engine = b.createEngine();
    b.history.close();
    b.history = new MidoriSyncHistory({ deriveRecordId: (collection, bytes) => b.keys.deriveRecordId(collection, bytes) });
    Assert.equal(await b.history.rememberLocal(historyURL, day), historyId, "Restart preserves history identity");

    const oldKeyId = a.keys.snapshot.activeKeyId;
    const identityKeyId = a.keys.snapshot.identityKeyId;
    const rotationCode = await a.keys.prepareRotation();
    await Assert.rejects(a.keys.confirmRotation(), error => error.code === "recovery_backup_required");
    a.loseRegistryResponse = true;
    await Assert.rejects(a.keys.confirmRotation({ recoveryCodeSaved: true }), error => error.code === "network_error");
    const pendingRotation = (await a.vault.load()).data.crypto.rotation;
    Assert.ok(pendingRotation, "A lost registry response preserves the encrypted local rotation intent");
    const publishedRotation = (await request(b, "api/v1/crypto/state")).data;
    Assert.equal(publishedRotation.rotation.operation_id, pendingRotation.operation_id);
    Assert.equal(publishedRotation.active_key_id, pendingRotation.key_id);
    Assert.ok(publishedRotation.keys.length === pendingRotation.keys.length && pendingRotation.keys.every(key =>
      publishedRotation.keys.some(published => published.key_id === key.key_id && published.encrypted_bundle === key.encrypted_bundle)),
      "The server published the complete recovery registry before the response was lost");
    Assert.ok(JSON.stringify(publishedRotation.identity_key) === JSON.stringify(pendingRotation.identity_key) &&
      publishedRotation.registry_auth === pendingRotation.registry_auth,
      "Identity and authenticated custody were committed with the same recovery registry");
    a.engine.close();
    a.historyEngine.close();
    a.historyEngine = null;
    await a.journal.close();
    a.keys.close();
    a.account.close();
    a.blockCryptoReads = false;
    a.vault = a.createVault();
    a.account = a.createAccount();
    a.keys = createNativeSyncKeys(a.account);
    await a.account.unlock();
    await a.keys.refresh();
    Assert.equal(a.keys.snapshot.status, "ready", "Restart reconciles the published recovery registry");
    Assert.equal(a.keys.snapshot.rotation.operation_id, pendingRotation.operation_id);
    Assert.equal(a.rotationPublications.length, 1, "Restart does not publish another rotation or recovery registry");
    Assert.equal((await a.vault.load()).data.crypto.rotation, null);
    a.journal = await openSyncStore({ ...a.journalOptions, keys: a.keys, create: false });
    a.engine = a.createEngine();
    a.history = new MidoriSyncHistory({ deriveRecordId: (collection, bytes) => a.keys.deriveRecordId(collection, bytes) });
    Assert.notEqual(a.keys.snapshot.activeKeyId, oldKeyId);
    Assert.equal(a.keys.snapshot.identityKeyId, identityKeyId);
    Assert.equal(await a.history.rememberLocal(historyURL, day), historyId, "Data-key rotation retains stable history IDs");
    await b.keys.refresh();
    Assert.equal(b.keys.snapshot.status, "recovery-required", "A peer must recover the new data key");
    await Assert.rejects(b.keys.recover(recoveryCode), error => error.code === "recovery_failed");
    await b.keys.recover(rotationCode);
    Assert.equal(b.keys.snapshot.activeKeyId, a.keys.snapshot.activeKeyId);
    Assert.equal(await b.history.rememberLocal(historyURL, day), historyId);
    const createRotation = () => new MidoriSyncRotation({ keys: a.keys, journal: a.journal,
      createId: uuid, entryId: syncJournalEntryId,
      history: new MidoriSyncHistory({ allowLegacy: true,
        deriveRecordId: (collection, bytes) => a.keys.deriveRecordId(collection, bytes) }),
      request: async (path, options) => {
        const response = await request(a, path, options);
        if (a.loseRotationResponse && path.endsWith("/operations")) {
          a.loseRotationResponse = false;
          throw new SyncProtocolError("network_error");
        }
        return response;
      },
    });
    rotation = createRotation();
    a.loseRotationResponse = true;
    await Assert.rejects(rotation.run({ limit: 1 }), error => error.code === "network_error");
    const progressId = await syncJournalEntryId("devices", "metadata", "key-rotation-v1");
    Assert.ok((await a.journal.read(progressId)).value.pending, "Rotation saves its exact request before transport");
    rotation.close();
    await restartJournal(a);
    rotation = createRotation();
    let result;
    for (let attempts = 0; attempts < 100; ++attempts) {
      result = await rotation.run({ limit: 2 });
      if (result.done) {
        break;
      }
    }
    Assert.equal(result.done, true, "Restarted rotation completes within its bounded fixture workload");
    Assert.equal(await a.journal.read(progressId), null);
    const completed = await request(a, "api/v1/crypto/state");
    Assert.equal(completed.data.rotation.phase, "complete");
    Assert.equal(completed.data.custody, "client");
    Assert.equal(completed.data.server_recovery, false);
    await a.keys.refresh();
    await b.keys.refresh();
    await Assert.rejects(openSyncRecord(b.keys, expected, record),
      error => error.code === "record_key_retired",
      "A key retained for recovery cannot authenticate current records after its retirement");
    Assert.equal(await a.history.rememberLocal(historyURL, day), historyId);
    await b.engine.run();
    Assert.equal(JSON.parse((await b.engine.record(bookmarkId)).remote.payload).key_id, a.keys.snapshot.activeKeyId,
      "Rotation reencrypts existing tombstones as well as live values");
    b.historyEngine = new MidoriSyncCollection({ collection: "history", journal: b.journal, keys: b.keys,
      createId: uuid, entryId: syncJournalEntryId, adapter: b.history,
      request: (path, options) => request(b, path, options) });
    await b.historyEngine.run();
    Assert.equal(b.historyEngine.snapshot.conflicts, 0);
    Assert.deepEqual(await b.history.read(historyId), historyValue, "The peer applies reencrypted native history without duplicated visits");
    const finalHistory = (await b.historyEngine.record(historyId)).remote;
    Assert.equal(JSON.parse(finalHistory.payload).key_id, a.keys.snapshot.activeKeyId);
    const retiredHistory = (await b.historyEngine.record(legacyHistoryId)).remote;
    Assert.equal(retiredHistory.deleted, true, "Migration retires the public history locator");
    Assert.equal(JSON.parse(retiredHistory.payload).key_id, a.keys.snapshot.activeKeyId);
    Assert.deepEqual(await b.history.read(migratedHistoryId), legacyHistoryValue,
      "The authenticated retirement of the old locator does not delete migrated visits");
    tracker = new MidoriSyncHistoryTracker({ engine: b.historyEngine, adapter: b.history });
    const inventory = await tracker.run();
    Assert.equal(inventory.conflicts, 0);
    Assert.equal(inventory.queued, 0, "A native inventory does not republish already rotated history");
    const c = await connectDevice("C");
    await c.keys.refresh();
    Assert.equal(c.keys.snapshot.status, "recovery-required");
    await c.keys.recover(rotationCode);
    await openDeviceJournal(c);
    Assert.equal(c.engine.snapshot.conflicts, 0, "A fresh device reconciles superseded encrypted journal entries");
    Assert.ok(!c.values.has(bookmarkId), "A fresh device does not resurrect a bookmark deleted before rotation");
    Assert.ok(!c.values.has(expiringId), "A fresh device retains authenticated expiration after rotation");
    c.historyEngine = new MidoriSyncCollection({ collection: "history", journal: c.journal, keys: c.keys,
      createId: uuid, entryId: syncJournalEntryId, adapter: c.history,
      request: (path, options) => request(c, path, options) });
    await c.historyEngine.run();
    Assert.equal(c.historyEngine.snapshot.conflicts, 0);
    Assert.deepEqual(await c.history.read(historyId), historyValue);
    Assert.deepEqual(await c.history.read(migratedHistoryId), legacyHistoryValue);
    Assert.equal((await c.historyEngine.record(legacyHistoryId)).remote.deleted, true);
    Assert.ok(devices.every(device => !device.secretSent && device.recoveryWrites === 0),
      "Activation, recovery and rotation never send a recovery secret to the server");
  } finally {
    tracker?.close();
    rotation?.close();
    for (const device of devices) {
      device.engine?.close();
      device.historyEngine?.close();
      device.history?.close();
      await device.journal?.close();
      device.keys.close();
      try {
        await device.account.disconnect();
      } finally {
        await device.vault.clear();
        device.account.close();
        device.connection.close();
      }
    }
    await PlacesUtils.history.remove(historyURL);
    await PlacesUtils.history.remove(legacyHistoryURL);
    if (primaryToken) {
      await primaryToken.changePassword("public h1 integration primary password", "");
    }
  }
});
