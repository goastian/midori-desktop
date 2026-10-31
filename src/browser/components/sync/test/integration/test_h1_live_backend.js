/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncAccount } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncAccount.sys.mjs");
const { MidoriSyncConnection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncConnection.sys.mjs");
const { MidoriSyncVault } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncVault.sys.mjs");
const { createSyncVaultFileStore, authorizeSyncSecretStore, createProfileSyncVault,
  createProfileSyncSavedCustody } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncSecretStore.sys.mjs");
const { createNativeSyncKeys } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncNativeKeys.sys.mjs");
const { openSyncStore, openDiscoveredSyncStore, createSyncJournalFiles } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
const { MidoriSyncHistory, historyRecordId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncHistory.sys.mjs");
const { MidoriSyncHistoryTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncHistoryTracker.sys.mjs");
const { MidoriSyncRotation } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncRotation.sys.mjs");
const { openSyncRecord, sealSyncRecord } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncRecord.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const { SyncProtocolError } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncProtocol.sys.mjs");
const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");
const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

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
  const requestWithBackoff = async (transport, path, options) => {
    for (let attempt = 0; ; ++attempt) {
      try {
        return await transport.request(path, options);
      } catch (error) {
        if (error.code !== "rate_limited" || attempt >= 4 || error.retryAfter > 60) {
          throw error;
        }
        const seconds = Math.max(1, error.retryAfter);
        info(`H1 respects Retry-After for ${seconds} seconds before replaying the identical request`);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      }
    }
  };
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
  let mainFailure;
  const cleanupFailures = [];
  try {
    const connectDevice = async name => {
      const backend = Services.env.get("MIDORI_SYNC_TEST_BACKEND_DIR");
      Assert.ok(backend, "Pairing refresh uses the authorized synthetic-account backend");
      const renewal = await Subprocess.call({ command: "/usr/bin/php", workdir: backend,
        arguments: ["artisan", "sync:test-account", `--output=${fixturePath}`, `--base-url=${fixture.baseURL}`], stderr: "pipe" });
      const [, , renewed] = await Promise.all([renewal.stdout.readString(), renewal.stderr.readString(), renewal.wait()]);
      Assert.equal(renewed.exitCode, 0, "A long integration run renews pairing codes instead of extending their production TTL");
      const currentFixture = await IOUtils.readJSON(fixturePath);
      for (const field of ["subject", "user_id", "database", "baseURL"]) {
        Assert.equal(currentFixture[field], fixture[field], "Pairing renewal preserves the original synthetic account and service");
      }
      fixture.profiles[name] = currentFixture.profiles[name];
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
              const response = await requestWithBackoff(transport, path, requestOptions);
              if (device.loseRegistryResponse && path === "api/v1/crypto/rotation" && requestOptions?.method === "POST") {
                device.loseRegistryResponse = false;
                device.blockCryptoReads = true;
                throw new SyncProtocolError("network_error");
              }
              if (path === "api/v1/crypto/state") {
                const data = structuredClone(device.replayRegistryState ?? response.data);
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
              if (path === "api/v1/sync/collections/history/changes") {
                if (device.replayHistoryPage) {
                  return { ...response, data: structuredClone(device.replayHistoryPage) };
                }
                if (device.tamperHistoryControl && response.data.control) {
                  return { ...response, data: { ...response.data,
                    control: { ...response.data.control, proof: "0".repeat(64) } } };
                }
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
    const accountPassword = "public synthetic Astian password 🔑";
    await a.keys.setAccountPassword(accountPassword);
    Assert.equal(a.keys.snapshot.passwordUnlockAvailable, true);
    const capsule = await request(b, "api/v1/crypto/password");
    const capsuleJSON = JSON.stringify(capsule.data);
    Assert.ok(!capsuleJSON.includes(accountPassword) && !capsuleJSON.includes(recoveryCode),
      "Only password-protected ciphertext is stored on the backend");
    const registryBeforePassword = await request(a, "api/v1/crypto/state");
    const bLocalBeforePassword = (await b.vault.load()).data.crypto;
    b.keys.close();
    await b.account.withSecrets(lease => lease.writeLocalKeys(null));
    b.keys = createNativeSyncKeys(b.account);
    await b.keys.refresh();
    Assert.ok(b.keys.snapshot.passwordUnlockSupported && b.keys.snapshot.passwordUnlockAvailable);
    await Assert.rejects(b.keys.unlockWithAccountPassword("incorrect synthetic password"),
      error => error.code === "password_unlock_failed");
    Assert.equal((await b.vault.load()).data.crypto, null, "A wrong password never persists keys");
    await b.keys.unlockWithAccountPassword(accountPassword);
    Assert.equal(b.keys.snapshot.status, "ready");
    Assert.equal(b.keys.snapshot.identityKeyId, a.keys.snapshot.identityKeyId);
    Assert.ok(await b.keys.revealRecoveryCode() === recoveryCode, "The actual recovery code survives password unlocking");
    Assert.deepEqual((await request(a, "api/v1/crypto/state")).data, registryBeforePassword.data,
      "Password unlocking preserves the registry, data keys and identities");
    Assert.ok((await b.vault.load()).data.crypto.secret !== bLocalBeforePassword.secret,
      "The recovered profile gets its own new local wrapping secret");
    const state = await request(a, "api/v1/crypto/state");
    Assert.equal(state.data.custody, "client");
    Assert.equal(state.data.server_recovery, false);
    Assert.equal(state.data.registry_auth_version, 2);
    Assert.equal((await a.vault.load()).data.crypto.registry_auth_version, 2);
    Assert.ok(typeof state.data.registry_auth === "string" && state.data.registry_auth.length === 64);
    Assert.ok(!JSON.stringify(state.data).includes(recoveryCode));
    await Assert.rejects(request(b, "api/v1/crypto/recovery"), error => error.status === 409);

    const openDeviceJournal = async device => {
      device.history = new MidoriSyncHistory({ deriveRecordId: (collection, input) =>
        device.keys.deriveRecordId(collection, input) });
      device.journalOptions = {
        directory: PathUtils.join(PathUtils.profileDir, `h1-live-journals-${device.account.snapshot.device.id}`), storeId: uuid(),
        deviceId: device.account.snapshot.device.id, keys: device.keys, create: true,
      };
      device.journal = await openSyncStore(device.journalOptions);
      device.createEngine = () => new MidoriSyncCollection({
        collection: "bookmarks", journal: device.journal, keys: device.keys,
        createId: uuid, entryId: syncJournalEntryId, now: () => device.clock ?? Date.now(),
        request: async (path, options) => {
          if (path.endsWith("/operations")) {
            device.operationBatches ??= [];
            device.operationBatches.push(structuredClone(options.body.operations));
          }
          const response = await request(device, path, options);
          if (device.cancelAfterOperation && path.endsWith("/operations")) {
            device.cancelAfterOperation = false;
            device.engine.cancel();
            Assert.ok(options.signal.aborted, "Pausing after the real server receipt aborts the old transport signal");
          }
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

    const workspaceId = `w1:${uuid()}`;
    Assert.ok(a.account.snapshot.workspacesSupported, "The live service negotiates workspace metadata before the rotation test");
    const workspaceValue = { version: 1, name: "H5 rotation workspace", icon: "research" };
    const workspaceGeneration = (await request(a, "api/v1/sync/collections/workspaces/changes")).data.generation;
    const workspaceSealed = await sealSyncRecord(a.keys,
      { collection: "workspaces", id: workspaceId, generation: workspaceGeneration, base_revision: "0" },
      { deleted: false, value: workspaceValue });
    const workspaceWrite = await request(a, "api/v1/sync/collections/workspaces/operations", { method: "POST", body: {
      crypto: a.keys.writeContext, generation: workspaceGeneration,
      operations: [{ operation_id: uuid(), id: workspaceId, base_revision: "0", deleted: false, ttl: null, payload: workspaceSealed.payload }],
    } });
    Assert.equal(workspaceWrite.data.results[0].status, "applied");

    const pausedId = "h1-paused-after-receipt";
    const pausedValue = { title: "Saved through explicit pause", url: "https://example.invalid/h1-pause" };
    a.values.set(pausedId, pausedValue);
    const pausedOperationId = await a.engine.enqueue(pausedId, pausedValue);
    const pausedOperation = await a.journal.read(pausedOperationId);
    a.cancelAfterOperation = true;
    await Assert.rejects(a.engine.run(), error => error.code === "cancelled");
    Assert.deepEqual(await a.journal.read(pausedOperationId), pausedOperation,
      "Cancellation retains the exact native encrypted operation after a real server commit");
    Assert.equal(a.engine.snapshot.pending, 1);
    Assert.equal(a.engine.snapshot.error, null);
    await a.engine.run();
    Assert.deepEqual(a.operationBatches.at(-1), [pausedOperation.value.operation], "Resume replays the original operation ID and payload");
    Assert.equal(a.engine.snapshot.pending, 0);
    Assert.equal((await a.engine.record(pausedId)).remote.revision, "1");
    await b.engine.run();
    Assert.deepEqual(b.values.get(pausedId), pausedValue, "The peer receives one logical change after resumption");

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
    const mergedLegacyHistoryValue = { ...legacyHistoryValue,
      visits: [...legacyHistoryValue.visits, { atUsec: day + 1234568, transition: 2, count: 1 }] };
    const existingTarget = await sealSyncRecord(a.keys, {
      collection: "history", id: migratedHistoryId, generation: historyGeneration, base_revision: "0",
    }, { deleted: false, ttl: null, value: mergedLegacyHistoryValue });
    const seedTarget = await request(a, "api/v1/sync/collections/history/operations", {
      method: "POST", body: { generation: historyGeneration, crypto: existingTarget.crypto,
        operations: [{ operation_id: uuid(), id: migratedHistoryId, base_revision: "0", deleted: false,
          ttl: null, payload: existingTarget.payload }] },
    });
    Assert.equal(seedTarget.data.results[0].status, "applied", "The private history identity already exists before migration");

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

    const lostOfflineId = "h1-offline-lost-response";
    const neverUploadedId = "h1-offline-never-uploaded";
    const lostOfflineValue = { title: "Offline receipt retained", url: "https://example.invalid/h1-offline-receipt" };
    const neverUploadedValue = { title: "Offline upload retained", url: "https://example.invalid/h1-offline-upload" };
    b.values.set(lostOfflineId, lostOfflineValue);
    await b.engine.enqueue(lostOfflineId, lostOfflineValue);
    b.loseResponse = true;
    await Assert.rejects(b.engine.run(), error => error.code === "network_error");
    b.values.set(neverUploadedId, neverUploadedValue);
    await b.engine.enqueue(neverUploadedId, neverUploadedValue);
    Assert.equal(b.engine.snapshot.pending, 2, "An offline peer has both an uncertain receipt and an unsent encrypted operation");

    const backendDirectory = Services.env.get("MIDORI_SYNC_TEST_BACKEND_DIR");
    Assert.ok(backendDirectory, "Use the authorized backend checkout for the synthetic legacy fixture");
    const seedProcess = await Subprocess.call({ command: "/usr/bin/php", workdir: backendDirectory,
      arguments: ["artisan", "sync:test-account", "--seed-legacy-deletion", `--output=${fixturePath}`], stderr: "pipe" });
    const [, , seedResult] = await Promise.all([seedProcess.stdout.readString(), seedProcess.stderr.readString(), seedProcess.wait()]);
    Assert.equal(seedResult.exitCode, 0, "Only the current synthetic account receives a legacy deletion fixture");
    const legacyDeletion = (await IOUtils.readJSON(fixturePath)).legacyDeletion;
    Assert.equal(legacyDeletion.collection, "bookmarks");
    Assert.ok(typeof legacyDeletion.id === "string");

    const oldKeyId = a.keys.snapshot.activeKeyId;
    const identityKeyId = a.keys.snapshot.identityKeyId;
    const savedOptions = { ...a.journalOptions, storeId: uuid() };
    const saved = await openSyncStore(savedOptions);
    const savedId = uuid();
    const savedOperationId = uuid();
    const savedValue = { title: "Synthetic saved-copy change", url: "https://saved-copy.example.invalid/" };
    const stateBeforeRotation = (await a.journal.read(syncJournalEntryId("bookmarks", "metadata", "collection-state-v1"))).value;
    const savedContext = { collection: "bookmarks", id: savedId, generation: stateBeforeRotation.generation, base_revision: "0" };
    const savedSealed = await sealSyncRecord(a.keys, savedContext, { deleted: false, value: savedValue });
    const savedOperation = { id: savedId, operation_id: savedOperationId, base_revision: "0", deleted: false, payload: savedSealed.payload };
    await saved.commit([
      { id: syncJournalEntryId("bookmarks", "metadata", "collection-state-v1"), collection: "bookmarks", kind: "metadata", expectedRevision: 0,
        value: { ...stateBeforeRotation, pending: 1 } },
      { id: syncJournalEntryId("bookmarks", "record", savedId), collection: "bookmarks", kind: "record", expectedRevision: 0,
        value: { version: 1, id: savedId, remote: null, pending: savedOperationId, blocked: false, applying: null } },
      { id: savedOperationId, collection: "bookmarks", kind: "outbox", expectedRevision: 0,
        value: { version: 1, epoch: a.keys.writeContext.epoch, generation: stateBeforeRotation.generation,
          operation: savedOperation, value: savedValue } },
    ]);
    await saved.close();
    const savedFiles = createSyncJournalFiles(savedOptions.directory);
    const savedFingerprint = await savedFiles.fingerprint(savedOptions.storeId);
    const profileVault = await createProfileSyncVault();
    profileVault.close();
    const savedCustody = createProfileSyncSavedCustody();
    let rotationCode = await a.keys.prepareRotation();
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
    const createRotation = (device = a) => new MidoriSyncRotation({ keys: device.keys, journal: device.journal,
      createId: uuid, entryId: syncJournalEntryId,
      history: new MidoriSyncHistory({ allowLegacy: true,
        deriveRecordId: (collection, bytes) => device.keys.deriveRecordId(collection, bytes) }),
      request: async (path, options) => {
        const response = await request(device, path, options);
        if (device.loseRotationResponse && path.endsWith("/operations")) {
          device.loseRotationResponse = false;
          throw new SyncProtocolError("network_error");
        }
        if (device.loseCompactionResponse && path.endsWith("/compact")) {
          device.loseCompactionResponse = false;
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
    let legacyDecisions = [];
    let reviewed = 0;
    let savedCopiesReviewed = 0;
    a.loseCompactionResponse = true;
    for (let attempts = 0; attempts < 100; ++attempts) {
      try {
        result = await rotation.run({ limit: 2, legacyDeletionDecisions: legacyDecisions });
        legacyDecisions = [];
      } catch (error) {
        if (error.code === "saved_journals_require_review") {
          Assert.equal(savedCopiesReviewed, 0);
          const retained = (await request(a, "api/v1/crypto/state")).data;
          Assert.ok(retained.keys.some(key => key.key_id === oldKeyId), "Saved copies stop server key retirement before DELETE");
          Assert.ok((await a.vault.load()).data.crypto.keys.some(key => key.key_id === oldKeyId),
            "The old local wrapping custody also remains available");
          Assert.equal(await savedFiles.fingerprint(savedOptions.storeId), savedFingerprint);
          const reopened = await openDiscoveredSyncStore({ ...savedOptions, keys: a.keys });
          try {
            Assert.deepEqual((await reopened.store.read(savedOperationId)).value.operation, savedOperation,
              "The exact old-key operation remains recoverable after remote rotation and process restart");
          } finally {
            await reopened.store.close();
          }
          await a.account.withLocalSecrets(lease => savedCustody.save({ id: savedOptions.storeId,
            fingerprint: savedFingerprint, scope: lease.scope, deviceId: lease.deviceId, localKeys: lease.readLocalKeys() }));
          Assert.equal(await savedFiles.fingerprint(savedOptions.storeId), savedFingerprint,
            "Explicit key protection keeps the pending saved copy while allowing retirement");
          ++savedCopiesReviewed;
          continue;
        }
        if (error.code === "legacy_tombstone_review_required") {
          Assert.equal(error.review.length, 1);
          Assert.equal(error.review[0].id, legacyDeletion.id);
          Assert.equal(error.review[0].revision, legacyDeletion.revision);
          Assert.equal((await a.journal.read(progressId)).value.review.decision, null,
            "An unverified deletion is saved for explicit review before being signed");
          legacyDecisions = error.review.map(item => ({ ...item, decision: "delete" }));
          ++reviewed;
          continue;
        }
        if (error.code === "network_error") {
          Assert.equal((await a.journal.read(progressId)).value.pending.kind, "compact");
          rotation.close();
          await restartJournal(a);
          rotation = createRotation();
          legacyDecisions = [];
          continue;
        }
        throw error;
      }
      if (result.done) {
        break;
      }
    }
    Assert.equal(result.done, true, "Restarted rotation completes within its bounded fixture workload");
    Assert.equal(reviewed, 1, "Exactly the persisted legacy deletion was explicitly approved");
    Assert.equal(savedCopiesReviewed, 1, "Key retirement continued after independent protected custody, without removing the saved copy");
    Assert.equal(await a.journal.read(progressId), null);
    const completed = await request(a, "api/v1/crypto/state");
    Assert.equal(completed.data.rotation.phase, "complete");
    Assert.equal(completed.data.custody, "client");
    Assert.equal(completed.data.server_recovery, false);
    Assert.equal(completed.data.keys.length, 1, "Compaction releases historical server keys before retirement");
    Assert.equal((await a.vault.load()).data.crypto.keys.length, 1);
    const archived = await savedCustody.open({ id: savedOptions.storeId, fingerprint: savedFingerprint });
    Assert.ok(archived, "Independent keys remain available after remote and active local key retirement");
    const preserved = await openDiscoveredSyncStore({ ...savedOptions, keys: archived.keys });
    try {
      const queued = (await preserved.store.read(savedOperationId)).value;
      Assert.deepEqual(queued.operation, savedOperation);
      Assert.deepEqual(queued.value, savedValue, "Saved local data survives retirement of its old server key");
    } finally {
      await preserved.store.close();
      archived.keys.close();
    }
    Assert.equal(await savedFiles.fingerprint(savedOptions.storeId), savedFingerprint);
    await savedFiles.remove(savedOptions.storeId, savedFingerprint);
    await a.keys.refresh();
    await b.keys.refresh();
    Assert.equal((await b.vault.load()).data.crypto.keys.length, 2,
      "An offline peer retains local keys for pending operations and its encrypted journal");
    await Assert.rejects(b.journal.assertOnlyKey(b.keys.snapshot.activeKeyId), error => error.code === "local_key_in_use");
    await Assert.rejects(openSyncRecord(b.keys, expected, record),
      error => error.code === "record_key_retired",
      "A key retained for recovery cannot authenticate current records after its retirement");
    Assert.equal(await a.history.rememberLocal(historyURL, day), historyId);
    await b.engine.run();
    Assert.equal(b.engine.snapshot.pending, 0, "Both the old receipt and an unsent old-key operation recover after retirement");
    Assert.equal(b.engine.snapshot.conflicts, 0);
    Assert.deepEqual(b.values.get(lostOfflineId), lostOfflineValue);
    Assert.deepEqual(b.values.get(neverUploadedId), neverUploadedValue);
    Assert.equal((await b.engine.record(lostOfflineId)).remote.revision, "2",
      "An exact receipt replay does not add another logical write after re-encryption");
    Assert.equal(JSON.parse((await b.engine.record(neverUploadedId)).remote.payload).key_id, a.keys.snapshot.activeKeyId);
    Assert.equal((await b.engine.record(legacyDeletion.id)).remote.deleted, true);
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
    Assert.deepEqual(await b.history.read(migratedHistoryId), mergedLegacyHistoryValue,
      "The native history merger reconciles an existing private locator without duplicating or deleting visits");
    tracker = new MidoriSyncHistoryTracker({ engine: b.historyEngine, adapter: b.history });
    const inventory = await tracker.run();
    Assert.equal(inventory.conflicts, 0);
    Assert.equal(inventory.queued, 0, "A native inventory does not republish already rotated history");
    tracker.close();
    tracker = null;
    rotation.close();
    rotation = createRotation(b);
    for (let attempts = 0; attempts < 100; ++attempts) {
      result = await rotation.run({ limit: 2 });
      if (result.done) {
        break;
      }
    }
    Assert.equal(result.done, true, "The offline peer finishes its own journal migration after server key retirement");
    Assert.equal(b.keys.snapshot.localKeyCount, 1);
    await b.journal.assertOnlyKey(b.keys.snapshot.activeKeyId);
    rotation.close();
    rotation = null;
    await restartJournal(b);
    b.historyEngine = new MidoriSyncCollection({ collection: "history", journal: b.journal, keys: b.keys,
      createId: uuid, entryId: syncJournalEntryId, adapter: b.history,
      request: (path, options) => request(b, path, options) });
    await b.historyEngine.run();
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
    Assert.deepEqual(await c.history.read(migratedHistoryId), mergedLegacyHistoryValue);
    Assert.equal((await c.historyEngine.record(legacyHistoryId)).remote.deleted, true);

    const anchoredRegistry = (await request(c, "api/v1/crypto/state")).data;
    const anchoredLocal = JSON.stringify((await c.vault.load()).data.crypto);
    c.replayRegistryState = { ...state.data, revision: String(Number(anchoredRegistry.revision) + 1) };
    await Assert.rejects(c.keys.refresh(), error => error.code === "registry_authentication_failed",
      "A retired registry cannot return with a forged higher revision");
    await Assert.rejects(c.keys.recover(recoveryCode), error => error.code === "registry_authentication_failed",
      "Possession of an old recovery code cannot bypass the authenticated registry revision");
    Assert.ok(JSON.stringify((await c.vault.load()).data.crypto) === anchoredLocal, "The anchored local keys remain unchanged");
    c.replayRegistryState = null;
    await c.keys.refresh();
    Assert.equal(c.keys.snapshot.activeKeyId, anchoredRegistry.active_key_id);

    const beforeClear = (await request(c, "api/v1/sync/collections/history/changes")).data;
    const cleared = await b.historyEngine.clearHistory();
    Assert.ok(cleared.deletedRecords >= 3, "A signed history clear removes the migrated history collection");
    Assert.ok(cleared.clearBeforeMs > 0);
    c.tamperHistoryControl = true;
    await Assert.rejects(c.historyEngine.run(), error => error.code === "control_authentication_failed",
      "A peer rejects a server-modified history-clear proof");
    c.tamperHistoryControl = false;
    await c.historyEngine.run();
    Assert.equal(await c.history.readDay(historyURL, day), null);
    const afterClear = (await request(c, "api/v1/sync/collections/history/changes")).data;
    Assert.equal(afterClear.control.kind, "history_clear");
    Assert.notEqual(afterClear.generation, beforeClear.generation);
    Assert.equal(afterClear.control.clear_before_ms, cleared.clearBeforeMs);
    c.replayHistoryPage = beforeClear;
    await Assert.rejects(c.historyEngine.run(), error => error.code === "control_rollback_detected",
      "A peer with an anchored clear rejects a replay of the previous server generation");
    c.replayHistoryPage = null;
    await c.historyEngine.run();
    await Assert.rejects(request(b, "api/v1/sync/collections/history/clear", {
      method: "POST", body: { operation_id: uuid(), generation: afterClear.generation, crypto: b.keys.writeContext },
    }), error => error.status === 409, "Client custody never accepts an unsigned history clear");

    const retainedId = "h1-nine-rotations";
    const retainedValue = { title: "Nine rotations retain this record", url: "https://example.invalid/h1-nine-rotations" };
    await a.engine.run();
    a.values.set(retainedId, retainedValue);
    await a.engine.enqueue(retainedId, retainedValue);
    await a.engine.run();
    let intermediateRegistry;
    let intermediateCode;
    for (let iteration = 1; iteration < 9; ++iteration) {
      info(`Live encryption rotation ${iteration + 1}/9`);
      a.engine.close();
      rotationCode = await a.keys.prepareRotation();
      await a.keys.confirmRotation({ recoveryCodeSaved: true });
      await a.keys.refresh();
      rotation = createRotation(a);
      for (let attempts = 0; attempts < 100; ++attempts) {
        result = await rotation.run({ limit: 100 });
        if (result.done) {
          break;
        }
      }
      Assert.equal(result.done, true);
      Assert.equal(a.keys.snapshot.keyCount, 1);
      Assert.equal(a.keys.snapshot.localKeyCount, 1);
      Assert.equal(a.keys.snapshot.identityKeyId, identityKeyId);
      Assert.equal(await a.history.rememberLocal(historyURL, day), historyId);
      rotation.close();
      rotation = null;
      a.engine = a.createEngine();
      await a.engine.run();
      Assert.equal(a.engine.snapshot.conflicts, 0);
      Assert.deepEqual(a.values.get(retainedId), retainedValue);
      Assert.equal(JSON.parse((await a.engine.record(retainedId)).remote.payload).key_id, a.keys.snapshot.activeKeyId);
      if (iteration === 4) {
        intermediateRegistry = (await request(a, "api/v1/crypto/state")).data;
        intermediateCode = rotationCode;
      }
    }
    await c.keys.refresh();
    Assert.equal(c.keys.snapshot.status, "recovery-required");
    const finalPin = (await c.vault.load()).data.crypto;
    Assert.equal(finalPin.registry_auth_version, 2);
    Assert.ok(!finalPin.keys.some(key => key.key_id === intermediateRegistry.active_key_id),
      "The offline peer never held the intermediate data key");
    c.replayRegistryState = { ...intermediateRegistry, revision: String(Number(finalPin.revision) + 1) };
    await Assert.rejects(c.keys.refresh(), error => error.code === "registry_authentication_failed");
    await Assert.rejects(c.keys.recover(intermediateCode), error => error.code === "registry_authentication_failed");
    Assert.ok(JSON.stringify((await c.vault.load()).data.crypto) === JSON.stringify(finalPin),
      "An unseen intermediate key cannot replace the authenticated latest pin");
    c.replayRegistryState = null;
    await c.keys.recover(rotationCode);
    await c.engine.run();
    Assert.deepEqual(c.values.get(retainedId), retainedValue,
      "A peer offline for eight complete rotations recovers the latest compacted snapshot");
    const workspacePage = (await request(c, "api/v1/sync/collections/workspaces/changes")).data;
    const workspaceRecord = workspacePage.changes.find(change => change.record.id === workspaceId).record;
    Assert.equal(JSON.parse(workspaceRecord.payload).key_id, a.keys.snapshot.activeKeyId);
    Assert.ok(!workspaceRecord.payload.includes(workspaceValue.name));
    Assert.deepEqual(await openSyncRecord(c.keys,
      { collection: "workspaces", id: workspaceId, generation: workspacePage.generation }, workspaceRecord), workspaceValue,
    "Workspace metadata survives all nine rotations and recovery with only the latest key");
    await c.historyEngine.run();
    Assert.equal((await request(c, "api/v1/sync/collections/history/changes")).data.control.proof, afterClear.control.proof,
      "The signed history-clear proof remains valid across later data-key rotations");
    Assert.ok(devices.every(device => !device.secretSent && device.recoveryWrites === 0),
      "Activation, recovery and rotation never send a recovery secret to the server");
  } catch (error) {
    mainFailure = error;
    info(`H1 failure: ${error.code ?? error.name}; status=${error.status ?? "none"}; ${error.stack}`);
    throw error;
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
      } catch (error) {
        cleanupFailures.push(error);
        info(`H1 cleanup: ${error.code ?? error.name}`);
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
  if (!mainFailure && cleanupFailures.length) {
    throw cleanupFailures[0];
  }
});
