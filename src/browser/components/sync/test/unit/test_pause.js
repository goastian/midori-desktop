/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task, registerCleanupFunction, HttpServer, respondJSON */

const { MidoriSyncService: service } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncService.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);

add_task(async function pausing_or_unselecting_preserves_native_ciphertext_and_ignores_late_receipts() {
  let schema = 2;
  const metadata = new HttpServer();
  metadata.registerPathHandler("/api/v1/capabilities", (_request, response) => respondJSON(response, {
    protocol: "MSP", changes_version: 1, operations_version: 1, native_ready: false,
    features: ["opaque_cursors", "snapshot_fence", "tombstones", "device_acknowledgements",
      "conditional_operations", "idempotent_operations", "bookmark_labels"],
    collections: ["bookmarks"], data_schemas: { bookmarks: schema },
    limits: { change_page_records: 100, change_page_payload_bytes: 4194304, record_payload_bytes: 262144,
      operation_batch_records: 100, operation_batch_bytes: 4194304 },
  }));
  metadata.start(-1);
  const previousServer = Services.prefs.getStringPref("midori.sync.serverConfig");
  registerCleanupFunction(async () => {
    Services.prefs.setStringPref("midori.sync.serverConfig", previousServer);
    await new Promise(resolve => metadata.stop(resolve));
  });
  const connection = service.connection;
  await connection.checkAndUseServer(`http://localhost:${metadata.identity.primaryPort}/`, { allowLocalHTTP: true });
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const scope = JSON.stringify(["http://localhost:9/", "urn:midori:sync:local", "pause-fixture"]);
  const handle = await crypto.generateNativeKey(scope);
  const context = { epoch: uuid(), revision: "1" };
  const keys = {
    snapshot: { status: "ready", rotation: null, custody: "server", activeKeyId: await crypto.nativeKeyId(handle) }, writeContext: context,
    sealLocal: (expected, bytes) => crypto.sealNative(handle, 1, JSON.stringify(expected), bytes),
    openLocal: (expected, value) => crypto.openNative(handle, 1, JSON.stringify(expected), value),
    sealRecord: async (expected, bytes) => ({ crypto: context, payload: await crypto.sealNative(handle, 0, JSON.stringify(expected), bytes) }),
    openRecord: (expected, value) => crypto.openNative(handle, 0, JSON.stringify(expected), value),
  };
  const deviceId = uuid();
  const store = await openSyncStore({ directory: PathUtils.join(PathUtils.profileDir, "pause-journals"),
    storeId: uuid(), deviceId, keys, create: true });
  const server = { generation: uuid(), changes: [], records: new Map(), receipts: new Map(), requests: [], hold: null };
  const account = { snapshot: { status: "connected", generation: 1, busy: false, interactionBusy: false, device: { id: deviceId } },
    async withSecrets(work) {
      return work({ generation: 1, async request(path, options) {
        const action = path.split("/").at(-1);
        server.requests.push(action);
        if (action === "changes") {
          const cursor = options.query?.cursor ? JSON.parse(options.query.cursor).sequence : 0;
          const changes = server.changes.slice(cursor);
          return { data: { generation: server.generation, changes, has_more: false,
            snapshot_sequence: String(server.changes.length), next_cursor: JSON.stringify({ sequence: server.changes.length }) } };
        }
        if (action === "ack") {
          return { data: { generation: server.generation, acknowledged_sequence: String(JSON.parse(options.body.cursor).sequence) } };
        }
        Assert.equal(action, "operations");
        const results = options.body.operations.map((operation, index) => {
          if (server.receipts.has(operation.operation_id)) {
            const previous = server.receipts.get(operation.operation_id);
            Assert.deepEqual(operation, previous.operation, "Receipt retries retain every operation field");
            return { ...previous.result, index };
          }
          const current = server.records.get(operation.id);
          Assert.equal(operation.base_revision, current?.revision ?? "0");
          const record = { id: operation.id, revision: String(Number(current?.revision ?? "0") + 1),
            deleted: operation.deleted, payload: operation.payload, ttl: operation.ttl ?? null };
          server.records.set(record.id, record);
          server.changes.push({ sequence: String(server.changes.length + 1), record });
          const result = { operation_id: operation.operation_id, id: operation.id, status: "applied", revision: record.revision };
          server.receipts.set(operation.operation_id, { operation: structuredClone(operation), result });
          return { ...result, index };
        });
        await server.hold?.(options.signal);
        return { data: { generation: server.generation, results } };
      } });
    } };
  const values = new Map();
  const adapter = { validate: (_id, value) => value, read: async id => structuredClone(values.get(id) ?? null),
    matchesLocal: (_id, current, base) => JSON.stringify(current) === JSON.stringify(base),
    async apply(incoming) { values.set(incoming.id, incoming.value); return { status: "applied" }; } };
  const replacements = { account, keys, journal: store, connection };
  const originals = new Map(Object.keys(replacements).map(name => [name, Object.getOwnPropertyDescriptor(service, name)]));
  const prefs = ["midori.sync.enabled", "midori.sync.collection.bookmarks.enabled"];
  const previous = prefs.map(name => Services.prefs.prefHasUserValue(name) ? Services.prefs.getBoolPref(name) : null);
  for (const [name, value] of Object.entries(replacements)) {
    Object.defineProperty(service, name, { configurable: true, value });
  }
  let engine;
  try {
    service.setSyncEnabled(true);
    service.setCollectionEnabled("bookmarks", true);
    engine = await service.collection("bookmarks", adapter);
    await engine.run();
    for (const [index, mode] of ["global", "collection", "capabilities"].entries()) {
      const revision = String(index + 1);
      const value = { title: `Synthetic ${mode} paused change` };
      values.set("pause-guid", value);
      await engine.capture("pause-guid");
      const before = await store.list("bookmarks", "outbox", { limit: 100 });
      let entered;
      let release;
      const accepted = new Promise(resolve => { entered = resolve; });
      const gate = new Promise(resolve => { release = resolve; });
      let signal;
      server.hold = async requestSignal => { signal = requestSignal; entered(); await gate; };
      const running = engine.run();
      await accepted;
      if (mode === "global") { service.setSyncEnabled(false); }
      else if (mode === "collection") { service.setCollectionEnabled("bookmarks", false); }
      else {
        schema = 99;
        await connection.refreshCapabilities({ background: true });
      }
      Assert.ok(signal.aborted, "Pausing aborts the in-flight transport signal");
      const count = server.requests.length;
      if (mode === "global") {
        await Assert.rejects(service.syncNow(), /sync_paused/);
        await Assert.rejects(service.runBackgroundSync(), /sync_paused/);
        await Assert.rejects(service.runEncryptionMigration(), /sync_paused/);
        for (const method of ["syncTabs", "syncHistory", "syncPasswords", "syncCreditCards", "syncFormHistory", "syncAddresses", "syncWorkspaces", "syncPreferences"]) {
          await Assert.rejects(service[method](), /sync_paused/);
        }
      }
      const expectedError = { global: /sync_paused/, collection: /collection_disabled/, capabilities: /collection_unsupported/ }[mode];
      await Assert.rejects(service.syncBookmarks(), expectedError);
      Assert.equal(server.requests.length, count, "Paused actions never open a new request");
      Assert.equal(server.records.get("pause-guid").revision, revision, "The service may already have accepted the sent operation");
      if (mode === "global") { service.setSyncEnabled(true); }
      else if (mode === "collection") { service.setCollectionEnabled("bookmarks", true); }
      else {
        schema = 2;
        await connection.refreshCapabilities({ background: true });
      }
      server.hold = null;
      release();
      await Assert.rejects(running, /cancelled/, "Resuming before a late response does not revive the cancelled pass");
      Assert.deepEqual(await store.list("bookmarks", "outbox", { limit: 100 }), before);
      Assert.equal(engine.snapshot.pending, 1);
      Assert.equal(service.syncCollectionsSnapshot.find(item => item.name === "bookmarks").pending, 1);
      Assert.equal(engine.snapshot.error, null, "A requested pause is not a collection failure");
      Assert.equal(await service.collection("bookmarks", adapter), engine, "Selection preserves the live engine and its local hints");
      await engine.run();
      Assert.equal(engine.snapshot.pending, 0);
      Assert.equal(server.records.get("pause-guid").revision, revision, "The exact replay does not apply a second logical change");
      Assert.deepEqual(values.get("pause-guid"), value);
    }
  } finally {
    engine?.close();
    service.setCollectionEnabled("bookmarks", false);
    await store.close();
    crypto.close();
    for (const [name, descriptor] of originals) { Object.defineProperty(service, name, descriptor); }
    for (const [index, name] of prefs.entries()) {
      if (previous[index] === null) { Services.prefs.clearUserPref(name); }
      else { Services.prefs.setBoolPref(name, previous[index]); }
    }
  }
});

add_task(async function a_paused_manual_pass_cannot_start_another_collection_after_its_current_one() {
  const previous = Services.prefs.prefHasUserValue("midori.sync.enabled") ? Services.prefs.getBoolPref("midori.sync.enabled") : null;
  const calls = [];
  const fake = { account: { snapshot: { generation: 1, collectionSupport: { tabs: true, bookmarks: true } } },
    async syncTabs() { calls.push("tabs"); service.setSyncEnabled(false); return { more: false }; },
    async syncBookmarks() { calls.push("bookmarks"); return { more: false }; } };
  try {
    service.setSyncEnabled(true);
    await Assert.rejects(service.syncNow.call(fake), /sync_paused/);
    Assert.deepEqual(calls, ["tabs"]);
    Assert.throws(() => service.setSyncEnabled("true"), /invalid_collection_selection/);
  } finally {
    if (previous === null) { Services.prefs.clearUserPref("midori.sync.enabled"); }
    else { Services.prefs.setBoolPref("midori.sync.enabled", previous); }
  }
});
