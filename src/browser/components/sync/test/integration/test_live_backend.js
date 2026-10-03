/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncAccount } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncAccount.sys.mjs");
const { MidoriSyncConnection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncConnection.sys.mjs");
const { MidoriSyncVault } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncVault.sys.mjs");
const { createSyncVaultFileStore, authorizeSyncSecretStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncSecretStore.sys.mjs");
const { createNativeSyncKeys } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncNativeKeys.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const { SyncProtocolError } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncProtocol.sys.mjs");
const { MidoriSyncBookmarks } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncBookmarks.sys.mjs");
const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

function within(promise, duration) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("notification_timeout")), duration);
  })]).finally(() => clearTimeout(timer));
}

add_task(async function native_devices_exchange_encrypted_records_through_laravel() {
  const fixturePath = Services.env.get("MIDORI_SYNC_TEST_FIXTURE");
  if (!fixturePath) {
    info("Use npm run test:sync -- --native for the live PostgreSQL/Laravel integration.");
    return;
  }
  const fixture = await IOUtils.readJSON(fixturePath);
  Assert.ok(/^http:\/\/localhost:[0-9]+\/$/.test(fixture.baseURL), "Only the isolated local backend is accepted");
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  const tokenFactory = () => Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
  let primaryToken;
  if (!keyStore.isOSBacked) {
    primaryToken = tokenFactory();
    await primaryToken.changePassword("", "public integration primary password");
  }
  const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
  const devices = [];
  let nativeRoot;
  try {
    for (const name of ["A", "B"]) {
      const connection = new MidoriSyncConnection({
        baseURL: fixture.baseURL, allowLocalHTTP: true, saveServer: () => {},
        transportFactory: (url, options) => new MidoriSyncTransport(url, options),
      });
      const store = createSyncVaultFileStore(PathUtils.join(PathUtils.profileDir, `fixture-${name}`));
      const profileId = uuid();
      const createVault = () => new MidoriSyncVault({
        store, keyStore, profileId, createId: uuid,
        authorize: () => authorizeSyncSecretStore(keyStore, tokenFactory),
      });
      const device = { connection, store, createVault, vault: createVault(), clock: null, renewalOperations: [],
        omitActivationRecovery: name === "A" };
      device.createAccount = () => new MidoriSyncAccount({
        connection, vaultFactory: () => device.vault, now: () => device.clock ?? Date.now(),
        transportFactory: (url, options) => {
          const transport = new MidoriSyncTransport(url, options);
          return {
            async request(path, requestOptions) {
              if (path === "api/v1/crypto/activate" && device.omitActivationRecovery) {
                requestOptions = { ...requestOptions, body: { ...requestOptions.body } };
                delete requestOptions.body.recovery_secret;
              }
              const response = await transport.request(path, requestOptions);
              if (path === "api/v1/auth/refresh" && requestOptions.method === "POST") {
                device.renewalOperations.push(requestOptions.body.operation_id);
                if (device.loseRenewalResponse) {
                  device.loseRenewalResponse = false;
                  throw new SyncProtocolError("network_error");
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
      await device.account.pair(fixture.profiles[name].pairing_token, `Native integration ${name}`);
      device.pairedAt = Date.now();
      Assert.equal(device.account.snapshot.status, "connected");
      Assert.equal((await device.vault.load()).data.renewal.version, 1, "Laravel issued a renewable native session");
    }
    const [a, b] = devices;
    Assert.notEqual(a.account.snapshot.device.id, b.account.snapshot.device.id, "Devices have distinct identities");
    await a.keys.refresh();
    Assert.equal(a.keys.snapshot.status, "empty");
    const recoveryCode = await a.keys.prepareCreation();
    await a.keys.confirmCreation();
    const beforeEscrow = await a.account.withSecrets(lease => lease.request("api/v1/crypto/state"));
    Assert.equal(beforeEscrow.data.server_recovery, false, "The fixture starts with an older native account");
    await a.keys.refresh();
    Assert.equal(a.keys.snapshot.status, "ready");
    const afterEscrow = await a.account.withSecrets(lease => lease.request("api/v1/crypto/state"));
    Assert.equal(afterEscrow.data.server_recovery, true, "The existing browser enables server recovery automatically");
    await b.keys.refresh();
    Assert.equal(b.keys.snapshot.status, "ready", "A second browser recovers the key from its authenticated session");
    for (const device of devices) {
      device.journalOptions = {
        directory: PathUtils.join(PathUtils.profileDir, "native-journals"), storeId: uuid(),
        deviceId: device.account.snapshot.device.id, keys: device.keys, create: true,
      };
      device.journal = await openSyncStore(device.journalOptions);
      device.journalOptions.create = false;
    }
    Assert.notDeepEqual(await a.store.read(), await b.store.read(), "Each local vault has independent encryption");
    for (const device of devices) {
      const disk = JSON.stringify(await device.store.read());
      Assert.ok(!disk.includes(recoveryCode) && !disk.includes("Native integration"), "The local account file contains ciphertext only");
    }
    const collection = "api/v1/sync/collections/bookmarks";
    const initial = await a.account.withSecrets(lease => lease.request(`${collection}/changes`));
    const context = { collection: "bookmarks", id: "native-integration-bookmark", generation: initial.data.generation, schema_version: 1, base_revision: "0" };
    const plaintext = new TextEncoder().encode(JSON.stringify({ title: "Marcador ñ", url: "https://example.invalid/native" }));
    const sealed = await a.keys.sealRecord(context, plaintext);
    const operation = { operation_id: uuid(), id: context.id, base_revision: "0", payload: sealed.payload };
    const body = { crypto: sealed.crypto, generation: context.generation, operations: [operation] };
    const outgoing = { id: operation.operation_id, collection: "bookmarks", kind: "outbox", expectedRevision: 0, value: body };
    await a.journal.commit([outgoing]);
    await a.journal.close();
    a.journal = await openSyncStore(a.journalOptions);
    const savedBody = (await a.journal.read(outgoing.id)).value;
    Assert.deepEqual(savedBody, body, "The exact operation and ciphertext survive reopening the local journal");
    const applied = await a.account.withSecrets(lease => lease.request(`${collection}/operations`, { method: "POST", body: savedBody }));
    Assert.equal(applied.data.results[0].status, "applied", "Laravel accepts the actual Rust V2 envelope");
    await a.journal.close();
    a.journal = await openSyncStore(a.journalOptions);
    const retryBody = (await a.journal.read(outgoing.id)).value;
    const replayed = await a.account.withSecrets(lease => lease.request(`${collection}/operations`, { method: "POST", body: retryBody }));
    Assert.deepEqual(replayed.data, applied.data, "An actual encrypted retry reuses its receipt");
    await a.journal.commit([
      { ...outgoing, expectedRevision: 1, deleted: true },
      { id: uuid(), collection: "bookmarks", kind: "metadata", expectedRevision: 0, value: applied.data },
    ]);
    Assert.equal(await a.journal.read(outgoing.id), null, "Only an accepted receipt removes the pending operation");
    const page = await b.account.withSecrets(lease => lease.request(`${collection}/changes`));
    const incoming = { id: uuid(), collection: "bookmarks", kind: "inbox", expectedRevision: 0, value: page.data };
    await b.journal.commit([incoming]);
    await b.journal.close();
    b.journal = await openSyncStore(b.journalOptions);
    const savedPage = (await b.journal.read(incoming.id)).value;
    const downloaded = savedPage.changes.find(change => change.record.id === context.id);
    Assert.ok(downloaded, "The second device receives the encrypted change");
    const expected = { collection: "bookmarks", id: context.id, generation: savedPage.generation };
    const recovered = await b.keys.openRecord(expected, downloaded.record.payload);
    Assert.deepEqual(recovered, plaintext, "The second native client decrypts the original Unicode bookmark");
    recovered.fill(0);
    plaintext.fill(0);
    await Assert.rejects(b.keys.openRecord({ ...expected, id: "relocated" }, downloaded.record.payload), error => error.name === "OperationError");
    const checkpoint = { id: uuid(), collection: "bookmarks", kind: "metadata", expectedRevision: 0,
      value: { cursor: savedPage.next_cursor, sequence: savedPage.snapshot_sequence, generation: savedPage.generation } };
    await b.journal.commit([{ ...incoming, expectedRevision: 1, deleted: true }, checkpoint]);
    const savedCheckpoint = (await b.journal.read(checkpoint.id)).value;
    await b.account.withSecrets(lease => lease.request(`${collection}/ack`, { method: "POST", body: { cursor: savedCheckpoint.cursor } }));
    Assert.equal(await b.journal.read(incoming.id), null, "Inbox completion and its encrypted cursor are one transaction");
    for (const device of devices) {
      device.values = new Map();
      device.createEngine = () => new MidoriSyncCollection({
        collection: "bookmarks", journal: device.journal, keys: device.keys,
        createId: uuid, entryId: syncJournalEntryId,
        request: async (path, options) => {
          const response = await device.account.withSecrets(lease => lease.request(path, options));
          if (path.endsWith("/ack")) {
            device.ackRequests = (device.ackRequests ?? 0) + 1;
          }
          if (device.loseResponse && path.endsWith("/operations")) {
            device.loseResponse = false;
            throw new SyncProtocolError("network_error");
          }
          return response;
        },
        adapter: device.nativeBookmarks ? (device.bookmarkAdapter = new MidoriSyncBookmarks()) : {
          validate(_id, value) {
            if (typeof value?.title !== "string" || typeof value.url !== "string") {
              throw new SyncProtocolError("invalid_record");
            }
            return { title: value.title, url: value.url };
          },
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
      Assert.equal(device.values.get(context.id).title, "Marcador ñ", "The collection engine reads the original native record");
    }
    const restartEngine = async device => {
      device.engine.close();
      await device.journal.close();
      device.journal = await openSyncStore(device.journalOptions);
      device.engine = device.createEngine();
    };
    const engineId = "native-engine-bookmark";
    const original = { title: "Cola persistente ñ", url: "https://example.invalid/engine" };
    a.values.set(engineId, original);
    const queuedId = await a.engine.enqueue(engineId, original);
    await restartEngine(a);
    a.loseResponse = true;
    await Assert.rejects(a.engine.run(), /network_error/);
    Assert.equal(a.engine.snapshot.pending, 1, "A lost HTTP response keeps the operation pending");
    Assert.ok(await a.journal.read(queuedId), "The pending operation is still encrypted on disk");
    await restartEngine(a);
    await a.engine.run();
    Assert.equal(a.engine.snapshot.pending, 0, "Restart and receipt replay drain the outbox");
    Assert.equal((await a.engine.record(engineId)).remote.revision, "1", "The server applied the replayed operation once");
    await b.engine.run();
    Assert.deepEqual(b.values.get(engineId), original, "The second engine applies the encrypted Unicode record");
    const edits = ["Edición A", "Edición B"];
    for (const [index, device] of devices.entries()) {
      const value = { ...original, title: edits[index] };
      device.values.set(engineId, value);
      await device.engine.enqueue(engineId, value);
    }
    await a.engine.run();
    await b.engine.run();
    Assert.equal(b.values.get(engineId).title, edits[1], "A conflict preserves the second device's local edit");
    Assert.equal((await b.engine.record(engineId)).remote.value.title, edits[0], "The remote edit is retained separately");
    Assert.equal(b.engine.snapshot.conflicts, 2, "Upload and download conflict material is retained for resolution");
    const conflicts = await b.journal.list("bookmarks", "conflict");
    Assert.equal(conflicts.find(entry => entry.value.source === "upload").value.queued.value.title, edits[1]);
    await restartEngine(b);
    await b.engine.initialize();
    Assert.equal(b.engine.snapshot.conflicts, 2, "Conflict state survives closing and reopening the encrypted journal");
    await Assert.rejects(b.engine.enqueue(engineId, original), /record_conflict/);
    a.values.delete(context.id);
    await a.engine.enqueue(context.id, null, { deleted: true });
    await a.engine.run();
    await b.engine.run();
    Assert.equal(b.values.has(context.id), false, "The peer applies the tombstone through the same collection engine");
    Assert.equal(b.engine.snapshot.more, false, "The collection finishes at a complete snapshot boundary");

    const bookmarks = PlacesUtils.bookmarks;
    nativeRoot = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "Live native Sync fixture" });
    b.engine.close();
    b.nativeBookmarks = true;
    b.engine = b.createEngine();
    const folderId = "livefolder__";
    const childId = "livechild___";
    const separatorId = "livesepar___";
    const folderValue = { version: 1, kind: "folder", parentGuid: nativeRoot.guid, index: 0,
      title: "Carpeta nativa ñ", url: null, dateAdded: 1000 };
    const childValue = { ...folderValue, kind: "bookmark", parentGuid: folderId,
      title: "Hijo antes del padre", url: "https://example.invalid/native-child" };
    const publish = async (id, value, baseRevision = "0") => {
      const deleted = value === null;
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      let encrypted;
      try {
        encrypted = deleted ? null : await a.keys.sealRecord({ collection: "bookmarks", id,
          generation: context.generation, schema_version: 1, base_revision: baseRevision }, bytes);
      } finally {
        bytes.fill(0);
      }
      const response = await a.account.withSecrets(lease => lease.request(`${collection}/operations`, {
        method: "POST", body: { generation: context.generation, crypto: a.keys.writeContext,
          operations: [{ operation_id: uuid(), id, base_revision: baseRevision, deleted,
            ...(deleted ? {} : { payload: encrypted.payload }) }] },
      }));
      Assert.equal(response.data.results[0].status, "applied", "Laravel accepts the native Places record or tombstone");
    };
    await publish(childId, childValue);
    const beforeDependency = b.ackRequests;
    await b.engine.run();
    Assert.equal(b.engine.snapshot.deferred, 1);
    Assert.equal(b.ackRequests, beforeDependency, "The backend is not told an unresolved child was applied");
    Assert.equal(await bookmarks.fetch(childId), null);
    const [waiting] = await b.journal.list("bookmarks", "application");
    Assert.equal(waiting.value.incoming.id, childId);
    Assert.equal(waiting.value.phase, "waiting");
    await restartEngine(b);
    await b.engine.initialize();
    Assert.equal(b.engine.snapshot.deferred, 1, "A dependency survives reopening the encrypted SQLite journal");
    const journalDisk = new TextDecoder().decode(await IOUtils.read(PathUtils.join(b.journalOptions.directory, `${b.journalOptions.storeId}.sqlite`)));
    Assert.ok(!journalDisk.includes(childValue.title) && !journalDisk.includes(childValue.url), "Application intents are encrypted on disk");
    await publish(folderId, folderValue);
    await b.engine.run();
    Assert.equal(b.engine.snapshot.deferred, 0);
    Assert.ok(b.ackRequests > beforeDependency);
    Assert.equal((await bookmarks.fetch(childId)).parentGuid, folderId);
    Assert.equal((await bookmarks.fetch(childId)).title, childValue.title);

    await bookmarks.update({ guid: childId, title: "Edición local conservada" });
    await publish(childId, { ...childValue, url: "https://example.invalid/remote-update" }, "1");
    await b.engine.run();
    Assert.equal((await bookmarks.fetch(childId)).title, "Edición local conservada");
    Assert.equal((await bookmarks.fetch(childId)).url.href, "https://example.invalid/remote-update");
    Assert.equal((await b.engine.capture(childId)).status, "queued", "Native capture discovers the merged local field without a caller supplying its value");
    Assert.equal((await b.engine.capture(childId)).status, "pending", "Repeating capture preserves the queued operation");
    await b.engine.run();
    Assert.equal((await b.engine.record(childId)).remote.revision, "3", "An explicit native capture uploads the merged local value");
    Assert.equal((await b.engine.capture(childId)).status, "unchanged", "The accepted native change is not echoed");

    await publish(separatorId, { ...folderValue, kind: "separator", parentGuid: folderId, index: 1, title: "" });
    const commit = b.journal.commit.bind(b.journal);
    b.journal.commit = changes => {
      if (changes.some(change => change.kind === "application" && change.value?.phase === "projecting")) {
        throw new SyncProtocolError("test_checkpoint_interrupted");
      }
      return commit(changes);
    };
    const beforeInterrupted = b.ackRequests;
    await Assert.rejects(b.engine.run(), /test_checkpoint_interrupted/);
    Assert.equal((await bookmarks.fetch(separatorId)).type, bookmarks.TYPE_SEPARATOR, "Places wrote before the injected checkpoint failure");
    Assert.equal((await b.journal.list("bookmarks", "application"))[0].value.phase, "applying");
    Assert.equal(b.ackRequests, beforeInterrupted);
    await restartEngine(b);
    await b.engine.run();
    Assert.equal((await b.bookmarkAdapter.readPage(folderId)).entries.length, 2, "Recovery replays the separator without duplicating it");
    Assert.equal((await b.journal.list("bookmarks", "application")).length, 0);

    await publish(folderId, null, "1");
    const beforeDeletion = b.ackRequests;
    await b.engine.run();
    Assert.equal(b.engine.snapshot.deferred, 1, "A folder tombstone waits for its children");
    Assert.equal(b.ackRequests, beforeDeletion);
    Assert.equal((await bookmarks.fetch(childId)).title, "Edición local conservada");
    await publish(childId, null, "3");
    await publish(separatorId, null, "1");
    await b.engine.run();
    Assert.equal(await bookmarks.fetch(folderId), null);
    Assert.equal(await bookmarks.fetch(childId), null);
    Assert.equal(await bookmarks.fetch(separatorId), null);
    Assert.equal(b.engine.snapshot.deferred, 0);
    Assert.equal(b.engine.snapshot.more, false);

    await bookmarks.remove(nativeRoot.guid);
    nativeRoot = null;

    const renewalDelay = Math.max(...devices.map(device => device.pairedAt)) + 61000 - Date.now();
    if (renewalDelay > 0) {
      info("Waiting for the real backend's minimum renewal interval");
      await new Promise(resolve => do_timeout(renewalDelay, resolve));
    }
    const renewalBookmark = { title: "Renovación conservada", url: "https://example.invalid/native-renewal" };
    a.values.set("native-renewal", renewalBookmark);
    const renewalBookmarkId = await a.engine.enqueue("native-renewal", renewalBookmark);
    const queuedBookmark = await a.journal.read(renewalBookmarkId);
    const savedAccount = (await a.vault.load()).data;
    const generation = a.account.snapshot.generation;
    const writeContext = a.keys.writeContext;
    a.clock = Date.parse(savedAccount.account.expires_at) + 1;
    a.loseRenewalResponse = true;
    await Assert.rejects(a.account.renew(), /network_error/);
    Assert.equal(a.account.snapshot.status, "renewal-required");
    Assert.equal(a.keys.snapshot.status, "ready", "Lost renewal response preserves the native key handle");
    Assert.equal((await a.vault.load()).data.renewal.pending, a.renewalOperations[0]);
    await a.account.renew();
    Assert.equal(a.account.snapshot.status, "connected");
    Assert.equal(a.account.snapshot.generation, generation, "Renewal does not replace the custody owner");
    Assert.deepEqual(a.keys.writeContext, writeContext);
    Assert.equal(a.renewalOperations.length, 2);
    Assert.equal(a.renewalOperations[0], a.renewalOperations[1], "Laravel recovers the same renewal operation");
    const renewedAccount = (await a.vault.load()).data;
    Assert.equal(renewedAccount.renewal.pending, null);
    Assert.equal(renewedAccount.renewal.expires_at, savedAccount.renewal.expires_at);
    for (const field of ["crypto", "journal"]) {
      Assert.ok(JSON.stringify(renewedAccount[field]) === JSON.stringify(savedAccount[field]), `Renewal preserves ${field} custody`);
    }
    const renewedDisk = JSON.stringify(await a.store.read());
    Assert.ok(!renewedDisk.includes(renewedAccount.token) && !renewedDisk.includes(renewedAccount.renewal.token), "Both renewed credentials remain encrypted");
    Assert.deepEqual(await a.journal.read(renewalBookmarkId), queuedBookmark, "The pending encrypted Sync operation survives rotation");
    a.clock = null;
    await a.engine.run();
    Assert.equal(a.engine.snapshot.pending, 0);
    const savedPeer = (await b.vault.load()).data;
    b.clock = Date.parse(savedPeer.account.expires_at) + 1;
    b.loseRenewalResponse = true;
    await Assert.rejects(b.account.renew(), /network_error/);
    b.engine.close();
    await b.journal.close();
    b.keys.close();
    b.account.close();
    b.vault = b.createVault();
    b.account = b.createAccount();
    b.keys = createNativeSyncKeys(b.account);
    await b.account.unlock();
    Assert.equal(b.account.snapshot.status, "connected", "Reopening the real vault recovers Laravel's renewal receipt");
    Assert.equal(b.account.snapshot.device.id, savedPeer.account.device.id);
    Assert.equal(b.renewalOperations.length, 2);
    Assert.equal(b.renewalOperations[0], b.renewalOperations[1]);
    Assert.equal((await b.vault.load()).data.renewal.pending, null);
    b.clock = null;
    await b.keys.refresh();
    Assert.equal(b.keys.snapshot.status, "ready", "Renewal recovery restores the native Sync key custody");
    b.journalOptions.keys = b.keys;
    b.journal = await openSyncStore(b.journalOptions);
    Assert.equal((await b.journal.list("bookmarks", "conflict")).length, 2, "Recovery retains the previous encrypted conflicts");
    await a.account.disconnect();
    Assert.equal(a.keys.snapshot.status, "locked", "Revocation clears the first client's in-memory keys");
    Assert.equal(b.keys.snapshot.status, "ready", "The other device remains usable");
    await b.keys.refresh();
    Assert.equal(b.keys.snapshot.status, "ready", "Server and local recovery material still agree after revocation");
  } finally {
    for (const { keys, account, connection, vault, journal, engine } of devices) {
      engine?.close();
      await journal?.close();
      keys.close();
      try {
        await account.disconnect();
      } finally {
        await vault.clear();
        account.close();
        connection.close();
      }
    }
    if (primaryToken) {
      await primaryToken.changePassword("public integration primary password", "");
    }
  }
});
