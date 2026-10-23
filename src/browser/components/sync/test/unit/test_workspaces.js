/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriWorkspaces } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriWorkspaces.sys.mjs");
const { MidoriSyncWorkspaces } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncWorkspaces.sys.mjs");
const { MidoriSyncService } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncService.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { sealSyncRecord } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncRecord.sys.mjs");
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
const path = PathUtils.join(PathUtils.profileDir, "midori-workspaces.json");
const id = "w1:11111111-1111-4111-8111-111111111111";
const value = (name = "Research", icon = "research") => ({ version: 1, name, icon });
const resetCache = () => { MidoriWorkspaces._storeCache = null; MidoriWorkspaces._catalog = null; };

add_setup(async function legacy_workspace_fixture() {
  await IOUtils.writeJSON(path, { windows: { fixture: { selectedId: "default", tabs: { tab: "default" }, workspaces: [
    { id: "default", name: "Default", icon: "default", isDefault: true },
    { id: id.slice(3), name: "Research", icon: "research", isDefault: false },
  ] } } });
  registerCleanupFunction(async () => {
    await MidoriWorkspaces._flushSave({ strict: true });
    resetCache();
    await IOUtils.remove(path, { ignoreAbsent: true });
  });
});

add_task(async function concurrent_native_loads_publish_one_durable_migration_identity() {
  const original = await IOUtils.readJSON(path);
  const legacy = structuredClone(original);
  legacy.windows.fixture.workspaces[1].id = "legacy-workspace-without-uuid";
  await IOUtils.writeJSON(path, legacy);
  const adapter = new MidoriSyncWorkspaces();
  try {
    const inventories = await Promise.all(Array.from({ length: 4 }, () => adapter.listIds()));
    Assert.equal(inventories[0].length, 1);
    const [portableId] = inventories[0];
    Assert.ok(/^w1:[0-9a-f-]{36}$/.test(portableId));
    for (const inventory of inventories) {
      Assert.deepEqual(inventory, [portableId], "Concurrent readers share the same migrated identity");
    }
    Assert.deepEqual((await IOUtils.readJSON(path)).sync.records[portableId], value());
  } finally {
    adapter.close();
    await IOUtils.writeJSON(path, original);
    resetCache();
  }
});

add_task(async function native_workspace_migration_and_failed_write_never_acknowledge_volatile_metadata() {
  const adapter = new MidoriSyncWorkspaces();
  try {
    Assert.deepEqual(await adapter.listIds(), [id]);
    const saved = await IOUtils.readJSON(path);
    Assert.deepEqual(saved.sync.records[id], value());
    Assert.equal(saved.windows.fixture.selectedId, "default");
    Assert.deepEqual(saved.windows.fixture.tabs, { tab: "default" });
    await IOUtils.makeDirectory(path + ".tmp");
    await Assert.rejects(adapter.apply({ id, deleted: false, value: value("Write pending") },
      { id, deleted: false, value: value() }), /./, "A native write failure cannot acknowledge an application");
    await Assert.rejects(adapter.read(id), /./, "Capture also refuses volatile data until the store is durable");
    Assert.deepEqual((await IOUtils.readJSON(path)).sync.records[id], value());
    await IOUtils.remove(path + ".tmp", { recursive: true });
    Assert.deepEqual(await adapter.read(id), value("Write pending"));
    Assert.deepEqual((await IOUtils.readJSON(path)).sync.records[id], value("Write pending"));
    resetCache();
    Assert.deepEqual(await adapter.read(id), value("Write pending"), "The value survives reopening the native store");
    const future = await IOUtils.readJSON(path);
    future.sync.version = 99;
    await IOUtils.writeJSON(path, future);
    resetCache();
    await Assert.rejects(adapter.listIds(), /invalid_workspace_catalog/);
    Assert.deepEqual(await IOUtils.readJSON(path), future, "An unsupported store is left intact");
    future.sync.version = 1;
    await IOUtils.writeJSON(path, future);
    const current = await adapter.read(id);
    Assert.deepEqual(await adapter.apply({ id, deleted: true }, { id, deleted: false, value: current }), { status: "applied" });
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value: current }), { status: "conflict", reason: "deletion_edit" },
      "Losing the mirror does not authorize resurrecting native deletion markers");
    Assert.equal(await adapter.read(id), null);
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value: current }, { id, deleted: true, value: null }),
      { status: "applied" }, "A later restoration with an authenticated deleted base remains possible");
  } finally {
    adapter.close();
  }
});

const { SYNC_DESKTOP_COLLECTIONS } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncProtocol.sys.mjs");
if (SYNC_DESKTOP_COLLECTIONS.includes("workspaces")) {
add_task(async function workspace_native_crypto_journal_replays_and_resolves_without_losing_local_membership() {
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const handle = await crypto.generateNativeKey(JSON.stringify(["http://localhost:9/", "urn:midori:sync:local", "workspace-fixture"]));
  const context = { epoch: uuid(), revision: "1" };
  const keys = { snapshot: { status: "ready", custody: "client", activeKeyId: await crypto.nativeKeyId(handle) }, writeContext: context,
    sealRecord: async (expected, bytes) => ({ crypto: context, payload: await crypto.sealNative(handle, 0, JSON.stringify(expected), bytes) }),
    openRecord: (expected, payload) => crypto.openNative(handle, 0, JSON.stringify(expected), payload),
    sealLocal: (expected, bytes) => crypto.sealNative(handle, 1, JSON.stringify(expected), bytes),
    openLocal: (expected, payload) => crypto.openNative(handle, 1, JSON.stringify(expected), payload) };
  const generation = uuid();
  const changes = [];
  const records = new Map();
  const receipts = new Map();
  let requests = 0;
  let lose = false;
  const append = record => {
    records.set(record.id, record);
    changes.push({ sequence: String(changes.length + 1), record });
  };
  const request = async (route, { body, query }) => {
    ++requests;
    if (route.endsWith("/ack")) {
      return { data: { generation, acknowledged_sequence: body.cursor } };
    }
    if (route.endsWith("/changes")) {
      return { data: { generation, changes: structuredClone(changes.slice(Number(query?.cursor ?? 0))),
        has_more: false, snapshot_sequence: String(changes.length), next_cursor: String(changes.length), control_revision: "0", control: null } };
    }
    const results = body.operations.map((operation, index) => {
      if (receipts.has(operation.operation_id)) {
        const receipt = receipts.get(operation.operation_id);
        Assert.deepEqual(operation, receipt.operation, "A lost response replays the exact encrypted operation");
        return { ...receipt.result, index };
      }
      const revision = records.get(operation.id)?.revision ?? "0";
      Assert.equal(operation.base_revision, revision);
      const result = { operation_id: operation.operation_id, id: operation.id, status: "applied", revision: String(Number(revision) + 1) };
      append({ id: operation.id, revision: result.revision, deleted: operation.deleted, payload: operation.payload, ttl: null });
      receipts.set(operation.operation_id, { operation: structuredClone(operation), result });
      return { ...result, index };
    });
    if (lose) {
      lose = false;
      throw Object.assign(new Error("network_error"), { code: "network_error" });
    }
    return { data: { generation, results } };
  };
  const options = { directory: PathUtils.join(PathUtils.profileDir, "workspace-journal"), storeId: uuid(), deviceId: uuid(), keys };
  let store = await openSyncStore({ ...options, create: true });
  const service = MidoriSyncService;
  const names = service.syncCollectionsSnapshot.map(item => item.name);
  const prefs = ["midori.sync.enabled", ...names.map(name => `midori.sync.collection.${name}.enabled`)];
  const originalPrefs = prefs.map(pref => Services.prefs.prefHasUserValue(pref) ? Services.prefs.getBoolPref(pref) : null);
  const originalOffline = Services.io.offline;
  const account = { snapshot: { status: "connected", generation: 1, busy: false, interactionBusy: false, device: { id: options.deviceId } },
    async withSecrets(work) { return work({ generation: 1, request }); } };
  const replacements = { account, keys, connection: { snapshot: { capabilities: { collectionSupport: { workspaces: true } } } } };
  const originals = new Map([...Object.keys(replacements), "journal"].map(name => [name, Object.getOwnPropertyDescriptor(service, name)]));
  for (const [name, replacement] of Object.entries(replacements)) {
    Object.defineProperty(service, name, { configurable: true, value: replacement });
  }
  Object.defineProperty(service, "journal", { configurable: true, get: () => store });
  let engine;
  const openEngine = async () => {
    service.setCollectionEnabled("workspaces", false);
    service.setCollectionEnabled("workspaces", true);
    engine = await service.collection("workspaces");
  };
  const edit = async name => {
    const data = MidoriWorkspaces._storeCache.windows.fixture;
    data.workspaces.find(workspace => workspace.syncId === id).name = name;
    MidoriWorkspaces._catalog.publish(data.workspaces.find(workspace => workspace.syncId === id));
    MidoriWorkspaces._scheduleSave();
    await engine.capture(id);
  };
  try {
    Services.io.offline = false;
    service.setSyncEnabled(true);
    for (const name of names) {
      service.setCollectionEnabled(name, name === "workspaces");
    }
    await openEngine();
    await engine.run();
    await engine.capture(id);
    await engine.run();
    await edit("Offline edit");
    lose = true;
    await Assert.rejects(engine.run(), /network_error/);
    const pending = await store.list("workspaces", "outbox", { limit: 25 });
    Assert.equal(pending.length, 1);
    Assert.ok(!pending[0].value.operation.payload.includes("Offline edit"), "The outgoing payload hides workspace metadata");
    engine.close();
    await store.close();
    resetCache();
    store = await openSyncStore(options);
    await openEngine();
    await engine.run();
    Assert.equal((await store.list("workspaces", "outbox", { limit: 25 })).length, 0);
    const native = await MidoriWorkspaces.readSyncCatalog();
    Assert.deepEqual(native.records[id], value("Offline edit"));
    const previous = records.get(id);
    const remote = await sealSyncRecord(keys, { collection: "workspaces", id, generation, base_revision: previous.revision },
      { deleted: true, value: null });
    append({ id, revision: String(Number(previous.revision) + 1), deleted: true, payload: remote.payload, ttl: null });
    const data = MidoriWorkspaces._storeCache.windows.fixture;
    data.tabs.tab = data.workspaces.find(workspace => workspace.syncId === id).id;
    MidoriWorkspaces._scheduleSave();
    await engine.run();
    Assert.equal(engine.snapshot.conflicts, 1, "A remote deletion preserves a workspace with local tabs");
    const page = await engine.conflictPage({ limit: 25 });
    const entry = page.entries[0];
    const preview = await engine.conflictPreview(entry);
    await engine.resolveConflict({ ...entry, localRevision: preview.localRevision, choice: "remote" });
    await engine.run();
    Assert.equal(engine.snapshot.conflicts, 0);
    Assert.equal((await MidoriWorkspaces.readSyncCatalog()).records[id], undefined);
    Assert.equal(data.tabs.tab, "default", "Explicit deletion keeps the tab and reassigns its local workspace");
    Assert.equal(data.selectedId, "default");
    Assert.deepEqual((await IOUtils.readJSON(path)).windows.fixture.tabs, { tab: "default" });
    Assert.deepEqual(MidoriWorkspaces._catalog.apply(id, value("Restored offline")), { status: "applied" });
    MidoriWorkspaces._scheduleSave();
    Services.obs.notifyObservers(null, "midori-workspace-catalog-changed", "publish");
    Services.io.offline = true;
    const beforeOffline = requests;
    const offline = await service.syncNow({ inventory: true });
    Assert.deepEqual(offline.errors, {});
    Assert.equal(offline.collections.workspaces.offline, true);
    Assert.equal(requests, beforeOffline, "The public service captures workspace edits with no HTTP request while offline");
    Assert.equal(engine.snapshot.pending, 1);
    const offlineRows = await store.list("workspaces", "outbox", { limit: 25 });
    Assert.equal(offlineRows.length, 1);
    engine.close();
    await store.close();
    resetCache();
    store = await openSyncStore(options);
    await openEngine();
    Assert.deepEqual(await store.list("workspaces", "outbox", { limit: 25 }), offlineRows,
      "Restart preserves the exact encrypted offline workspace operation");
    Services.io.offline = false;
    await service.syncWorkspaces({ inventory: true });
    Assert.equal(engine.snapshot.pending, 0);
    Assert.deepEqual((await engine.record(id)).remote.value, value("Restored offline"));
  } finally {
    engine?.close();
    service.setCollectionEnabled("workspaces", false);
    await store.close();
    Services.io.offline = originalOffline;
    for (const [name, descriptor] of originals) {
      Object.defineProperty(service, name, descriptor);
    }
    for (let index = 0; index < prefs.length; index++) {
      if (originalPrefs[index] === null) {
        Services.prefs.clearUserPref(prefs[index]);
      } else {
        Services.prefs.setBoolPref(prefs[index], originalPrefs[index]);
      }
    }
    crypto.close();
  }
});

}
