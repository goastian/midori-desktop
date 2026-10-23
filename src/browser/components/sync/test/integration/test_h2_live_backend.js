/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncAccount } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncAccount.sys.mjs");
const { MidoriSyncConnection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncConnection.sys.mjs");
const { MidoriSyncVault } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncVault.sys.mjs");
const { createSyncVaultFileStore, authorizeSyncSecretStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncSecretStore.sys.mjs");
const { createNativeSyncKeys } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncNativeKeys.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
const { MidoriSyncAddresses } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncAddresses.sys.mjs");
const { MidoriSyncFormHistory } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncFormHistory.sys.mjs");
const { MidoriSyncWorkspaces } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncWorkspaces.sys.mjs");
const { MidoriWorkspaces } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriWorkspaces.sys.mjs");
const { MidoriSyncRecordTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswordTracker.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const { SyncProtocolError } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncProtocol.sys.mjs");
const { FormHistory } = ChromeUtils.importESModule("resource://gre/modules/FormHistory.sys.mjs");
const { formAutofillStorage } = ChromeUtils.importESModule("resource://autofill/FormAutofillStorage.sys.mjs");
const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
const workspaceSentinels = ["H5 initial workspace", "H5 renamed on B", "H5 offline A", "H5 offline B"];

add_task(async function h2_encrypted_native_profiles_round_trip_and_recover_interrupted_work() {
  const stage = Services.env.get("MIDORI_SYNC_H2_STAGE");
  const includeWorkspaces = Services.env.get("MIDORI_SYNC_INCLUDE_WORKSPACES") === "1";
  const fixturePath = Services.env.get("MIDORI_SYNC_TEST_FIXTURE");
  const statePath = Services.env.get("MIDORI_SYNC_H2_STATE");
  Assert.ok(["A", "B", "C", "D", "E", "F"].includes(stage), "Use the opt-in H2 profile harness");
  Assert.ok(fixturePath && statePath && Services.env.get("MIDORI_SYNC_TEST_KEYRING_ROOT"));
  const fixture = await IOUtils.readJSON(fixturePath);
  Assert.equal(fixture.version, 1);
  Assert.ok(["http://localhost:8000/", "http://127.0.0.1:8000/"].includes(fixture.baseURL));
  const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
  const name = ["A", "C", "E"].includes(stage) ? "A" : "B";
  const first = stage === name;
  const state = stage === "A" ? { version: 1, devices: {}, stage: null } : await IOUtils.readJSON(statePath);
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  Assert.ok(keyStore.isOSBacked, "This live test uses its private Linux Secret Service session");
  const tokenFactory = () => Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
  if (first) {
    state.devices[name] = { profileId: uuid(), storeId: uuid() };
  }
  const descriptor = state.devices[name];
  const connection = new MidoriSyncConnection({ baseURL: fixture.baseURL, allowLocalHTTP: true, saveServer: () => {},
    transportFactory: (url, options) => new MidoriSyncTransport(url, options) });
  const vaultStore = createSyncVaultFileStore(PathUtils.join(PathUtils.profileDir, "h2-vault"));
  const vault = new MidoriSyncVault({ store: vaultStore, keyStore, profileId: descriptor.profileId, createId: uuid,
    authorize: options => authorizeSyncSecretStore(keyStore, tokenFactory, options) });
  const account = new MidoriSyncAccount({ connection, vaultFactory: () => vault,
    transportFactory: (url, options) => new MidoriSyncTransport(url, options) });
  const keys = createNativeSyncKeys(account);
  let journal;
  const engines = new Map();
  const adapters = new Map();
  const trackers = new Map();
  let loseAddressResponse = false;
  let loseWorkspaceResponse = false;
  const request = async (path, options) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await account.withSecrets(lease => lease.request(path, options));
      } catch (error) {
        if (error.code !== "rate_limited" || attempt >= 4) {
          throw error;
        }
        const seconds = Math.max(1, Math.min(error.retryAfter, 60));
        info(`Respecting the live backend rate limit for ${seconds} seconds`);
        await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      }
    }
  };
  try {
    if (first) {
      await account.pair(fixture.profiles[name].pairing_token, `H2 synthetic profile ${name}`);
    } else {
      await account.initialize();
      if (account.snapshot.status === "locked") {
        await account.unlock({ interactive: false });
      }
    }
    Assert.equal(account.snapshot.status, "connected");
    Assert.ok(account.snapshot.formHistorySupported && account.snapshot.addressesSupported,
      "The actual backend advertises both H2 collections");
    if (includeWorkspaces) {
      Assert.ok(account.snapshot.workspacesSupported, "The backend also advertises the workspace schema");
    }
    await keys.refresh();
    if (stage === "A") {
      Assert.equal(keys.snapshot.status, "empty", "H2 requires a fresh synthetic account");
      state.recoveryCode = await keys.prepareCreation();
      await keys.confirmCreation({ recoveryCodeSaved: true });
      await keys.refresh();
    } else if (stage === "B") {
      Assert.equal(keys.snapshot.status, "recovery-required");
      await keys.recover(state.recoveryCode);
    }
    Assert.equal(keys.snapshot.status, "ready");
    Assert.equal(keys.snapshot.custody, "client");
    descriptor.deviceId ??= account.snapshot.device.id;
    Assert.equal(account.snapshot.device.id, descriptor.deviceId, "Restart keeps device identity");
    journal = await openSyncStore({ directory: PathUtils.join(PathUtils.profileDir, "h2-journals"),
      storeId: descriptor.storeId, deviceId: descriptor.deviceId, keys, create: first });
    await formAutofillStorage.initialize();
    adapters.set("addresses", new MidoriSyncAddresses());
    adapters.set("form-history", new MidoriSyncFormHistory({
      deriveRecordId: (collection, input) => keys.deriveRecordId(collection, input) }));
    if (includeWorkspaces) {
      if (first) {
        const data = { selectedId: "default", tabs: { kept: "default" }, workspaces: [
          { id: "default", name: "Default", icon: "default", isDefault: true },
        ] };
        if (stage === "A") {
          const localId = uuid();
          state.workspaceId = `w1:${localId}`;
          state.workspaceBase = { version: 1, name: "H5 initial workspace", icon: "research" };
          data.workspaces.push({ id: localId, name: state.workspaceBase.name, icon: state.workspaceBase.icon, isDefault: false });
        }
        await IOUtils.writeJSON(PathUtils.join(PathUtils.profileDir, "midori-workspaces.json"), { windows: { fixture: data } });
      }
      adapters.set("workspaces", new MidoriSyncWorkspaces());
    }
    for (const [collection, adapter] of adapters) {
      const engine = new MidoriSyncCollection({ collection, adapter, journal, keys, createId: uuid,
        entryId: syncJournalEntryId, request: async (path, options) => {
          const response = await request(path, options);
          if (loseAddressResponse && path === "api/v1/sync/collections/addresses/operations") {
            loseAddressResponse = false;
            throw new SyncProtocolError("network_error");
          }
          if (loseWorkspaceResponse && path === "api/v1/sync/collections/workspaces/operations") {
            loseWorkspaceResponse = false;
            throw new SyncProtocolError("network_error");
          }
          return response;
        } });
      engines.set(collection, engine);
      await engine.initialize();
      trackers.set(collection, new MidoriSyncRecordTracker({ engine, adapter }));
    }
    const addresses = adapters.get("addresses");
    const forms = adapters.get("form-history");
    const addressEngine = engines.get("addresses");
    const formEngine = engines.get("form-history");
    const drain = async collection => {
      const engine = engines.get(collection);
      const tracker = trackers.get(collection);
      tracker.requestInventory();
      for (let pass = 0; pass < 30; pass++) {
        await engine.run();
        if (!engine.snapshot.initialized) {
          continue;
        }
        await tracker.run({ limit: 100 });
        await engine.run();
        if (!tracker.snapshot.more && !engine.snapshot.more && !engine.snapshot.pending) {
          return;
        }
      }
      info(JSON.stringify({ collection, engine: engine.snapshot, tracker: tracker.snapshot,
        applications: (await journal.list(collection, "application")).map(row => ({
          id: row.value.incoming.id, phase: row.value.phase, reason: row.value.reason,
          decision: row.value.plan?.decision?.status,
        })),
        records: (await journal.list(collection, "record")).map(row => ({ id: row.value.id,
          pending: row.value.pending, blocked: row.value.blocked, applying: row.value.applying,
          replacementId: row.value.replacementId, deleted: row.value.remote?.deleted,
        })),
      }));
      throw new Error(`h2_${collection}_did_not_settle`);
    };
    const editAddress = async (id, changes) => {
      const current = await addresses.read(id);
      await formAutofillStorage.addresses.update(id, { ...current.fields, ...changes });
    };
    if (stage === "A") {
      await addressEngine.run();
      await formEngine.run();
      state.addressId = await formAutofillStorage.addresses.add({ name: "María H2 日本語",
        "street-address": "Calle H2 123\nPiso 2", "address-level2": "Bogotá", "postal-code": "110111",
        country: "CO", tel: "+57123456789", email: "h2-a@example.invalid" });
      state.addressBase = await addresses.read(state.addressId);
      await FormHistory.update({ op: "add", fieldname: "midori-h2-live-city", value: "Bogotá 日本語 H2",
        firstUsed: Date.now() * 1000 - 2000000, lastUsed: Date.now() * 1000 - 1000000, timesUsed: 3 });
      [state.formId] = await forms.listIds();
      Assert.ok(/^f1:[0-9a-f]{64}$/.test(state.formId));
      state.formBase = await forms.read(state.formId);
      await drain("form-history");
      Assert.equal((await addressEngine.capture(state.addressId)).status, "queued");
      loseAddressResponse = true;
      await Assert.rejects(addressEngine.run(), error => error.code === "network_error");
      Assert.equal(addressEngine.snapshot.pending, 1, "A lost HTTP response leaves a durable pending operation");
    } else if (stage === "B") {
      await drain("addresses");
      await drain("form-history");
      Assert.deepEqual(await addresses.read(state.addressId), state.addressBase, "Profile B receives canonical address fields and dates");
      Assert.deepEqual(await forms.read(state.formId), state.formBase, "Profile B receives saved form data");
      Assert.equal((await FormHistory.getAutoCompleteResults("Bog", { fieldname: state.formBase.fieldname }))[0].text,
        state.formBase.value, "Received form values reach native suggestions");
      await editAddress(state.addressId, { email: "h2-b@example.invalid" });
      await FormHistory.update({ op: "bump", fieldname: state.formBase.fieldname, value: state.formBase.value });
      await drain("addresses");
      await drain("form-history");
      state.afterB = { address: await addresses.read(state.addressId), form: await forms.read(state.formId) };
      state.duplicateId = await formAutofillStorage.addresses.add(state.afterB.address.fields);
      Assert.notEqual(state.duplicateId, state.addressId);
      trackers.get("addresses").requestInventory();
      await drain("addresses");
    } else if (stage === "C") {
      await drain("addresses");
      await drain("form-history");
      state.canonicalId = [state.addressId, state.duplicateId].sort()[0];
      state.redundantId = [state.addressId, state.duplicateId].sort()[1];
      Assert.equal(addressEngine.snapshot.pending, 0, "Restart replays the original receipt without an extra write");
      Assert.deepEqual(await addresses.listIds(), [state.canonicalId], "Exact duplicate GUIDs converge to one native address");
      Assert.equal((await addresses.read(state.canonicalId)).fields.email, "h2-b@example.invalid", "B edits arrive back at A");
      Assert.deepEqual(await forms.read(state.formId), state.afterB.form, "Usage is not multiplied by receipt replay");
      await editAddress(state.canonicalId, { organization: "H2 office A" });
      await FormHistory.update({ op: "bump", fieldname: state.formBase.fieldname, value: state.formBase.value });
      state.conflictId = await formAutofillStorage.addresses.add({ name: "H2 conflict base",
        "street-address": "Different 45", country: "US", email: "conflict@example.invalid" });
      trackers.get("addresses").requestInventory();
      await drain("addresses");
      await drain("form-history");
      state.afterC = { address: await addresses.read(state.canonicalId), form: await forms.read(state.formId) };
      await editAddress(state.conflictId, { name: "H2 offline A" });
      Assert.equal((await addressEngine.capture(state.conflictId)).status, "queued");
      Assert.equal(addressEngine.snapshot.pending, 1, "An offline change remains in the encrypted journal across process restart");
    } else if (stage === "D") {
      await drain("addresses");
      await drain("form-history");
      Assert.equal(await addresses.read(state.redundantId), null, "The redundant authenticated tombstone keeps the canonical address");
      Assert.deepEqual(await addresses.read(state.canonicalId), state.afterC.address, "A changes round-trip to B");
      Assert.deepEqual(await forms.read(state.formId), state.afterC.form);
      await editAddress(state.conflictId, { name: "H2 offline B" });
      await drain("addresses");
    } else if (stage === "E") {
      await addressEngine.run();
      await formEngine.run();
      Assert.ok(addressEngine.snapshot.conflicts > 0, "Simultaneous offline edits retain an explicit conflict");
      Assert.equal((await addresses.read(state.conflictId)).fields.name, "H2 offline A",
        "The server winner does not silently replace A's conflicting edit");
      const conflicts = await journal.list("addresses", "conflict");
      Assert.ok(JSON.stringify(conflicts).includes("H2 offline A"), "The encrypted conflict journal keeps the queued local version");
      Assert.equal((await addressEngine.record(state.conflictId)).remote.value.fields.name, "H2 offline B",
        "The encrypted mirror retains the conflicting remote version");
      await formAutofillStorage.addresses.remove(state.canonicalId);
      await FormHistory.update({ op: "remove", fieldname: state.formBase.fieldname, value: state.formBase.value });
      Assert.equal((await addressEngine.capture(state.canonicalId)).status, "queued");
      Assert.equal((await formEngine.capture(state.formId)).status, "queued");
      await addressEngine.run();
      await formEngine.run();
    } else {
      await addressEngine.run();
      await formEngine.run();
      Assert.equal(await addresses.read(state.canonicalId), null, "A deleted address disappears on B after restarting");
      Assert.equal(await addresses.read(state.redundantId), null, "Redundant copies do not resurrect after deletion");
      Assert.equal(await forms.read(state.formId, state.formBase), null);
      Assert.equal((await FormHistory.getAutoCompleteResults("Bog", { fieldname: state.formBase.fieldname })).length, 0,
        "Deleted form data is removed from native suggestions");
      Assert.equal((await addresses.read(state.conflictId)).fields.name, "H2 offline B", "B keeps its own explicit conflict version");
    }
    if (includeWorkspaces) {
      const workspaces = adapters.get("workspaces");
      const engine = engines.get("workspaces");
      const edit = async changes => {
        await MidoriWorkspaces.readSyncCatalog();
        const workspace = MidoriWorkspaces._storeCache.windows.fixture.workspaces.find(item => item.syncId === state.workspaceId);
        Object.assign(workspace, changes);
        MidoriWorkspaces._catalog.publish(workspace);
        MidoriWorkspaces._scheduleSave();
        Services.obs.notifyObservers(null, "midori-workspace-catalog-changed", "publish");
      };
      if (stage === "A") {
        await engine.run();
        Assert.equal((await engine.capture(state.workspaceId)).status, "queued");
        loseWorkspaceResponse = true;
        await Assert.rejects(engine.run(), error => error.code === "network_error");
        Assert.equal(engine.snapshot.pending, 1, "A lost workspace response survives the process boundary");
      } else if (stage === "B") {
        await drain("workspaces");
        Assert.deepEqual(await workspaces.read(state.workspaceId), state.workspaceBase);
        await edit({ name: "H5 renamed on B" });
        await drain("workspaces");
        state.workspaceAfterB = await workspaces.read(state.workspaceId);
      } else if (stage === "C") {
        await drain("workspaces");
        Assert.deepEqual(await workspaces.read(state.workspaceId), state.workspaceAfterB, "B's workspace metadata arrives back at A");
        Assert.equal(engine.snapshot.pending, 0, "Restart replays the lost workspace receipt");
        Assert.equal((await engine.record(state.workspaceId)).remote.revision, "2", "Receipt replay does not create an extra workspace revision");
        await edit({ icon: "work" });
        await drain("workspaces");
        state.workspaceAfterC = await workspaces.read(state.workspaceId);
        await edit({ name: "H5 offline A" });
        Assert.equal((await engine.capture(state.workspaceId)).status, "queued");
      } else if (stage === "D") {
        await drain("workspaces");
        Assert.deepEqual(await workspaces.read(state.workspaceId), state.workspaceAfterC, "A's icon change arrives back at B with the stable ID");
        await edit({ name: "H5 offline B" });
        await drain("workspaces");
      } else if (stage === "E") {
        await engine.run();
        Assert.ok(engine.snapshot.conflicts > 0, "Competing offline workspace names are preserved as a conflict");
        Assert.equal((await workspaces.read(state.workspaceId)).name, "H5 offline A");
        Assert.equal((await engine.record(state.workspaceId)).remote.value.name, "H5 offline B");
        const entry = (await engine.conflictPage()).entries.find(item => item.canKeepLocal);
        const preview = await engine.conflictPreview(entry);
        await engine.resolveConflict({ ...entry, localRevision: preview.localRevision, choice: "local" });
        await engine.run();
        Assert.equal(engine.snapshot.conflicts, 0);
        Assert.deepEqual(MidoriWorkspaces._catalog.apply(state.workspaceId, null), { status: "applied" });
        MidoriWorkspaces._scheduleSave();
        Services.obs.notifyObservers(null, "midori-workspace-catalog-changed", "delete");
        Assert.equal((await engine.capture(state.workspaceId)).status, "queued");
        await engine.run();
      } else {
        await drain("workspaces");
        Assert.equal(await workspaces.read(state.workspaceId), null, "A deliberate workspace deletion reaches B without resurrection");
        Assert.equal((await engine.record(state.workspaceId)).remote.revision, "6");
        Assert.equal((await engine.record(state.workspaceId)).remote.deleted, true);
      }
      const saved = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, "midori-workspaces.json"));
      Assert.equal(saved.windows.fixture.selectedId, "default");
      Assert.deepEqual(saved.windows.fixture.tabs, { kept: "default" }, "Workspace transport preserves native selection and tab membership");
    }
    for (const collection of adapters.keys()) {
      const page = await request(`api/v1/sync/collections/${collection}/changes`);
      Assert.ok(page.data.changes.length > 0);
      for (const { record } of page.data.changes) {
        Assert.equal(JSON.parse(record.payload).context.schema_version, 2);
        Assert.ok(!record.payload.includes("h2-a@example.invalid") && !record.payload.includes("h2-b@example.invalid") &&
          !record.payload.includes("Bogotá") && !record.payload.includes("midori-h2-live-city") &&
          workspaceSentinels.every(text => !record.payload.includes(text)),
        "The backend transports encrypted live records and encrypted deletions");
      }
    }
    state.stage = stage;
    const journalDirectory = PathUtils.join(PathUtils.profileDir, "h2-journals");
    for (const path of await IOUtils.getChildren(journalDirectory)) {
      const bytes = await IOUtils.read(path);
      const encoded = new TextDecoder().decode(bytes);
      Assert.ok(!encoded.includes("h2-a@example.invalid") && !encoded.includes("h2-b@example.invalid") &&
        !encoded.includes("midori-h2-live-city") && !encoded.includes("H2 offline") &&
        workspaceSentinels.every(text => !encoded.includes(text)),
      "Native journal files do not persist the synchronized form and address content in plaintext");
      bytes.fill(0);
    }
    await IOUtils.writeJSON(statePath, state, { mode: "overwrite", permissions: 0o600 });
    await IOUtils.setPermissions(statePath, 0o600);
    await formAutofillStorage._saveImmediately();
    Services.prefs.savePrefFile(null);
  } finally {
    for (const tracker of trackers.values()) {
      tracker.close();
    }
    for (const engine of engines.values()) {
      engine.close();
    }
    await journal?.close();
    keys.close();
    account.close();
    connection.close();
  }
});
