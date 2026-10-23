/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriBlockerService } = ChromeUtils.importESModule("resource:///modules/MidoriBlockerService.sys.mjs");
const { ListStore, normalizeCustomFiltersText } = ChromeUtils.importESModule("resource:///modules/internal/ListStore.sys.mjs");
const { MidoriSyncPrivacyFilters, SYNC_FILTERS_ID } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPrivacyFilters.sys.mjs");
const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
const { MidoriSyncRecordTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswordTracker.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const { createSyncTextBundle, MAX_SYNC_TEXT_BYTES } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncTextBundle.sys.mjs");
const { sealSyncRecord } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncRecord.sys.mjs");
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
const encoder = new TextEncoder();

add_task(async function manifest_first_survives_journal_restart_and_applies_complete_native_filters() {
  const path = ListStore.customFiltersPath();
  Assert.ok(!(await IOUtils.exists(path)), "The isolated profile starts without custom filters");
  const originalEnabled = MidoriBlockerService.isEnabled;
  MidoriBlockerService.isEnabled = () => false;
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  let store;
  let engine;
  let tracker;
  try {
    const handle = await crypto.generateNativeKey(JSON.stringify(["http://localhost:9/", "urn:midori:sync:local", "public-privacy-fixture"]));
    const writeContext = { epoch: uuid(), revision: "1" };
    const keys = { snapshot: { status: "ready", custody: "client", activeKeyId: await crypto.nativeKeyId(handle) }, writeContext,
      sealRecord: async (context, bytes) => ({ crypto: writeContext, payload: await crypto.sealNative(handle, 0, JSON.stringify(context), bytes) }),
      openRecord: (context, payload) => crypto.openNative(handle, 0, JSON.stringify(context), payload),
      sealLocal: (context, bytes) => crypto.sealNative(handle, 1, JSON.stringify(context), bytes),
      openLocal: (context, payload) => crypto.openNative(handle, 1, JSON.stringify(context), payload) };
    const deriveRecordId = (collection, bytes) => crypto.deriveNativeRecordId(handle, collection, bytes);
    const lines = [];
    let length = 0;
    for (let index = 0; ; ++index) {
      const line = `||sync-${String(index).padStart(6, "0")}.example.invalid^\n`;
      if (length + line.length > MAX_SYNC_TEXT_BYTES - 2) { break; }
      lines.push(line);
      length += line.length;
    }
    lines.push(`!${"x".repeat(MAX_SYNC_TEXT_BYTES - length - 2)}\n`);
    const text = lines.join("");
    Assert.equal(encoder.encode(text).length, MAX_SYNC_TEXT_BYTES);
    const bundle = await createSyncTextBundle("custom-filters", text, {
      entryId: async (type, digest) => `t1:${await deriveRecordId("midori-privacy",
        encoder.encode(JSON.stringify([1, "text-part", type, digest])))}`,
    });
    Assert.ok(bundle.parts.length > 10, "The fixture has distinct parts rather than only repeated content");
    const generation = uuid();
    const changes = [];
    for (const record of [{ id: SYNC_FILTERS_ID, value: bundle.manifest }, ...bundle.parts]) {
      const sealed = await sealSyncRecord(keys, { collection: "midori-privacy", id: record.id, generation, base_revision: "0" },
        { deleted: false, value: record.value });
      changes.push({ sequence: String(changes.length + 1), record: { id: record.id, revision: "1",
        deleted: false, ttl: null, payload: sealed.payload } });
    }
    const acknowledgements = [];
    const request = async (route, { body, query }) => {
      if (route.endsWith("/ack")) {
        acknowledgements.push(body.cursor);
        return { data: { generation, acknowledged_sequence: body.cursor } };
      }
      if (!route.endsWith("/changes")) {
        throw new Error("A received snapshot must not create outgoing operations");
      }
      const offset = Number(query?.cursor ?? 0);
      const page = changes.slice(offset, offset + 1);
      return { data: { generation, changes: page, has_more: offset + page.length < changes.length,
        snapshot_sequence: String(changes.length), next_cursor: String(offset + page.length), control_revision: "0", control: null } };
    };
    const options = { directory: PathUtils.join(PathUtils.profileDir, "privacy-journal"), storeId: uuid(), deviceId: uuid(), keys };
    const open = async create => {
      store = await openSyncStore({ ...options, create });
      const adapter = new MidoriSyncPrivacyFilters({ producer: MidoriBlockerService, deriveRecordId,
        record: id => engine.record(id), normalize: normalizeCustomFiltersText });
      engine = new MidoriSyncCollection({ collection: "midori-privacy", adapter, journal: store, keys, request,
        entryId: syncJournalEntryId, createId: uuid });
      await engine.initialize();
      tracker = new MidoriSyncRecordTracker({ engine, adapter });
    };
    await open(true);
    await engine.run({ maxPages: 1 });
    Assert.equal(engine.snapshot.deferred, 1, "The manifest waits for later pages without applying partial text");
    Assert.equal(acknowledgements.length, 0, "No page is acknowledged while native filters remain incomplete");
    Assert.ok(!(await IOUtils.exists(path)));
    tracker.close();
    engine.close();
    await store.close();
    await open(false);
    await engine.run({ maxPages: 100, maxApplications: 100 });
    const snapshot = await MidoriBlockerService.readCustomFiltersSnapshot();
    Assert.ok(snapshot.present);
    Assert.ok(snapshot.text === text, "The native file contains the complete authenticated text");
    Assert.equal(engine.snapshot.deferred, 0);
    Assert.equal(engine.snapshot.conflicts, 0);
    Assert.equal(engine.snapshot.pending, 0);
    Assert.ok(engine.snapshot.initialized);
    Assert.equal(acknowledgements.at(-1), String(changes.length));
    for (let pass = 0; tracker.snapshot.more && pass < 10; ++pass) {
      await tracker.run({ limit: 100 });
    }
    Assert.ok(!tracker.snapshot.more);
    Assert.equal(engine.snapshot.pending, 0, "A received complete value is not uploaded again");
    tracker.close();
    engine.close();
    await store.close();

    const outgoingGeneration = uuid();
    const uploaded = new Map();
    const outgoingChanges = [];
    const concurrent = new Set([SYNC_FILTERS_ID, bundle.parts[0].id]);
    let collisions = 0;
    let operations = 0;
    const publish = async (route, { body, query }) => {
      if (route.endsWith("/changes")) {
        const offset = Number(query?.cursor ?? 0);
        const page = outgoingChanges.slice(offset, offset + 2);
        return { data: { generation: outgoingGeneration, changes: page,
          has_more: offset + page.length < outgoingChanges.length, snapshot_sequence: String(outgoingChanges.length),
          next_cursor: String(offset + page.length), control_revision: "0", control: null } };
      }
      if (route.endsWith("/ack")) {
        return { data: { generation: outgoingGeneration, acknowledged_sequence: body.cursor } };
      }
      Assert.ok(encoder.encode(JSON.stringify(body)).length <= 4 * 1024 * 1024, "Encrypted operations fit the server batch budget");
      const results = [];
      for (const [index, operation] of body.operations.entries()) {
        operations++;
        if (concurrent.delete(operation.id)) {
          const locator = { collection: "midori-privacy", id: operation.id, generation: outgoingGeneration };
          const opened = await crypto.openNative(handle, 0, JSON.stringify(locator), operation.payload);
          const envelope = JSON.parse(new TextDecoder().decode(opened));
          const sealed = await sealSyncRecord(keys, { ...locator, base_revision: "0" }, envelope);
          opened.fill(0);
          Assert.ok(sealed.payload !== operation.payload, "The concurrent equivalent record has independently encrypted bytes");
          const record = { id: operation.id, revision: "1", payload: sealed.payload, deleted: false, ttl: null };
          uploaded.set(record.id, record);
          outgoingChanges.push({ sequence: String(outgoingChanges.length + 1), record });
          results.push({ index, operation_id: operation.operation_id, id: operation.id, status: "conflict", revision: "1" });
          collisions++;
          continue;
        }
        Assert.equal(operation.base_revision, uploaded.get(operation.id)?.revision ?? "0");
        const revision = String(Number(operation.base_revision) + 1);
        const record = { id: operation.id, revision, payload: operation.payload,
          deleted: operation.deleted, ttl: operation.ttl ?? null };
        uploaded.set(record.id, record);
        outgoingChanges.push({ sequence: String(outgoingChanges.length + 1), record });
        results.push({ index, operation_id: operation.operation_id, id: operation.id, status: "applied", revision });
      }
      return { data: { generation: outgoingGeneration, results } };
    };
    store = await openSyncStore({ ...options, directory: PathUtils.join(PathUtils.profileDir, "privacy-outgoing-journal"),
      storeId: uuid(), deviceId: uuid(), create: true });
    const sender = new MidoriSyncPrivacyFilters({ producer: MidoriBlockerService, deriveRecordId,
      record: id => engine.record(id), normalize: normalizeCustomFiltersText });
    engine = new MidoriSyncCollection({ collection: "midori-privacy", adapter: sender, journal: store, keys, request: publish,
      entryId: syncJournalEntryId, createId: uuid });
    await engine.initialize();
    await engine.run();
    tracker = new MidoriSyncRecordTracker({ engine, adapter: sender });
    for (let pass = 0; tracker.snapshot.more && pass < 10; ++pass) {
      await tracker.run({ limit: 100 });
    }
    Assert.ok(!tracker.snapshot.more);
    Assert.equal(engine.snapshot.pending, bundle.parts.length + 1, "Local text captures immutable parts and its manifest");
    for (let pass = 0; engine.snapshot.more && pass < 10; ++pass) {
      await engine.run({ maxPages: 100 });
    }
    Assert.equal(engine.snapshot.pending, 0);
    Assert.equal(engine.snapshot.conflicts, 0);
    Assert.equal(collisions, 2, "Concurrent identical parts and manifest settle without user conflicts");
    Assert.equal(operations, bundle.parts.length + 1, "Only the expected parts and manifest are published");
    Assert.equal(uploaded.size, bundle.parts.length + 1);
    Assert.ok(uploaded.has(SYNC_FILTERS_ID));
    Assert.ok((await MidoriBlockerService.readCustomFiltersSnapshot()).text === text);
    await MidoriBlockerService.setCustomFiltersText("||later.example.invalid^\n");
    Assert.ok(tracker.snapshot.more, "A native edit requests automatic capture");
    for (let pass = 0; tracker.snapshot.more && pass < 10; ++pass) {
      await tracker.run({ limit: 100 });
    }
    Assert.equal(engine.snapshot.pending, 2, "The edit captures a new part and a changed manifest");
    await engine.run({ maxPages: 100 });
    Assert.equal(engine.snapshot.pending, 0);
    Assert.equal(engine.snapshot.conflicts, 0);
    Assert.equal(uploaded.get(SYNC_FILTERS_ID).revision, "2");
    Assert.equal(uploaded.size, bundle.parts.length + 2, "Old parts are retained until safe garbage collection is implemented");
  } finally {
    tracker?.close();
    engine?.close();
    await store?.close();
    crypto.close();
    MidoriBlockerService.isEnabled = originalEnabled;
    await IOUtils.remove(path, { ignoreAbsent: true });
  }
});
