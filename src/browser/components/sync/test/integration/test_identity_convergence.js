/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task, do_get_file, registerCleanupFunction */

const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
const { MidoriSyncCreditCards } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCreditCards.sys.mjs");
const { formAutofillStorage } = ChromeUtils.importESModule("resource://autofill/FormAutofillStorage.sys.mjs");
const { MidoriSyncPasswords } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswords.sys.mjs");
const { MidoriSyncPasswordTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswordTracker.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);

add_task(async function populated_native_profiles_converge_without_losing_their_shared_record() {
  const side = Services.env.get("MIDORI_SYNC_CONVERGENCE_SIDE");
  const stage = Services.env.get("MIDORI_SYNC_CONVERGENCE_STAGE");
  const path = Services.env.get("MIDORI_SYNC_CONVERGENCE_STATE");
  Assert.ok(["A", "B"].includes(side));
  Assert.ok(["seed", "1", "2", "3", "4", "5", "edit", "6", "7", "delete", "8", "9"].includes(stage));
  const family = Services.env.get("MIDORI_SYNC_CONVERGENCE_FAMILY");
  Assert.ok(["passwords", "credit-cards"].includes(family));
  const cards = family === "credit-cards";
  const expectedBackend = Services.env.get("MIDORI_SYNC_CONVERGENCE_BACKEND");
  let backend;
  if (cards) {
    await formAutofillStorage.initialize();
    const className = formAutofillStorage.creditCards.constructor.name;
    Assert.equal(className, expectedBackend === "rust" ? "RustAutofillCreditCardsAdapter" : "CreditCards",
      "The intended native card backend is active");
    backend = expectedBackend;
  } else {
    await Services.logins.initializationPromise;
    backend = Services.logins.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIVariant)._storage.backendName;
    Assert.equal(backend, expectedBackend, "The intended native login backend is active");
  }
  const fresh = !await IOUtils.exists(path);
  const fixturePath = Services.env.get("MIDORI_SYNC_CONVERGENCE_FIXTURE");
  const crypto = fixturePath ? null : Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const scope = JSON.stringify(["http://localhost:9/", "urn:midori:sync:local", `native-convergence-fixture:${family}`]);
  const password = new TextEncoder().encode("public synthetic convergence bundle password");
  const state = fresh ? { generation: uuid(), epoch: uuid(), records: {}, changes: [], receipts: {}, snapshots: [],
    stores: { A: uuid(), B: uuid() }, devices: { A: uuid(), B: uuid() } } : await IOUtils.readJSON(path);
  const handle = crypto ? (fresh ? await crypto.generateNativeKey(scope) : await crypto.recoverNativeKey(scope, password, state.bundle)) : null;
  if (crypto) {
    state.bundle ??= await crypto.wrapNativeKey(handle, password);
  }
  const context = { epoch: state.epoch, revision: "1" };
  const simulatedKeys = crypto ? { snapshot: { status: "ready", custody: "client", activeKeyId: await crypto.nativeKeyId(handle) }, writeContext: context,
    sealRecord: async (expected, bytes) => ({ crypto: context, payload: await crypto.sealNative(handle, 0, JSON.stringify(expected), bytes) }),
    openRecord: (expected, payload) => crypto.openNative(handle, 0, JSON.stringify(expected), payload),
    sealLocal: (expected, bytes) => crypto.sealNative(handle, 1, JSON.stringify(expected), bytes),
    openLocal: (expected, payload) => crypto.openNative(handle, 1, JSON.stringify(expected), payload) } : null;
  const simulatedRequest = async (route, { query, body }) => {
    if (route.endsWith("/changes")) {
      return { data: { generation: state.generation, changes: structuredClone(state.changes.slice(Number(query?.cursor ?? 0))),
        has_more: false, snapshot_sequence: String(state.changes.length), next_cursor: String(state.changes.length),
        control_revision: "0", control: null } };
    }
    if (route.endsWith("/ack")) {
      return { data: { generation: state.generation, acknowledged_sequence: body.cursor } };
    }
    Assert.ok(route.endsWith("/operations"));
    const results = body.operations.map((operation, index) => {
      const receipt = state.receipts[operation.operation_id];
      if (receipt) {
        Assert.deepEqual(receipt.operation, operation);
        return { ...receipt.result, index };
      }
      const previous = state.records[operation.id]?.revision ?? "0";
      const applied = previous === operation.base_revision;
      const revision = applied ? String(Number(previous) + 1) : previous;
      const result = { operation_id: operation.operation_id, id: operation.id,
        status: applied ? "applied" : "conflict", revision };
      state.receipts[operation.operation_id] = { operation: structuredClone(operation), result };
      if (applied) {
        const record = { id: operation.id, revision, deleted: operation.deleted, payload: operation.payload, ttl: null };
        state.records[operation.id] = record;
        state.changes.push({ sequence: String(state.changes.length + 1), record });
      }
      return { ...result, index };
    });
    return { data: { generation: state.generation, results } };
  };
  let liveSession;
  if (fixturePath) {
    const resources = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
    resources.setSubstitution("midori-sync-identity-test", Services.io.newFileURI(do_get_file(".")));
    registerCleanupFunction(() => resources.setSubstitution("midori-sync-identity-test", null));
    const { openLiveIdentitySession } = ChromeUtils.importESModule("resource://midori-sync-identity-test/identity_live_session.sys.mjs");
    liveSession = await openLiveIdentitySession({ side, stage, family, state, fixturePath, createId: uuid });
  }
  const keys = liveSession?.keys ?? simulatedKeys;
  const request = liveSession?.request ?? simulatedRequest;
  const journal = await openSyncStore({ keys, storeId: state.stores[side], deviceId: state.devices[side], create: stage === "seed",
    directory: PathUtils.join(PathUtils.profileDir, "convergence-journal") });
  const adapter = cards ? new MidoriSyncCreditCards() : new MidoriSyncPasswords();
  const engine = new MidoriSyncCollection({ collection: family, adapter, keys, journal, request,
    entryId: syncJournalEntryId, createId: uuid });
  const tracker = new MidoriSyncPasswordTracker({ adapter, engine });
  const origin = "https://populated-convergence.example.invalid";
  const readNative = async () => cards ? formAutofillStorage.creditCards.getAll() : Services.logins.searchLoginsAsync({ origin });

  try {
    if (stage === "seed") {
      await engine.run();
      const useFirstId = (side === "A") !== (Services.env.get("MIDORI_SYNC_CONVERGENCE_ORDER") === "reverse");
      const id = cards ? (useFirstId ? "card00000001" : "card00000002") :
        (useFirstId ? "{11111111-1111-4111-8111-111111111111}" : "{22222222-2222-4222-8222-222222222222}");
      const value = cards ? { version: 1, name: "Public fixture", number: "4111111111111111", month: 12, year: 2032 } :
        { version: 1, origin, formActionOrigin: origin, httpRealm: null, username: "same fixture user",
        password: "public synthetic identical password", usernameField: "user", passwordField: "password",
        timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
      state.expectedValue ??= value;
      await adapter.apply({ id, deleted: false, value });
      await tracker.run({ limit: 100 });
      Assert.equal(engine.snapshot.pending, 1, "Both populated profiles have captured before either publishes");
    } else {
      if (stage === "edit" && side === "A") {
        const [record] = await readNative();
        Assert.ok(record, "The first profile can edit its synchronized record");
        if (cards) {
          await formAutofillStorage.creditCards.update(record.guid, { "cc-name": "Edited fixture",
            "cc-number": "4111111111111111", "cc-exp-month": 11, "cc-exp-year": 2032 });
        } else {
          const edit = record.clone();
          edit.password = "public synthetic edited password";
          await Services.logins.modifyLoginAsync(record, edit);
        }
        state.expectedValue = await adapter.read(record.guid);
      }
      if (stage === "delete" && side === "A") {
        for (const record of await readNative()) {
          if (cards) { await formAutofillStorage.creditCards.remove(record.guid); }
          else { await Services.logins.removeLoginAsync(record); }
        }
      }
      for (let pass = 0; pass < 10; ++pass) {
        await tracker.run({ limit: 100 });
        await engine.run();
        if (!tracker.snapshot.more && !engine.snapshot.more) {
          break;
        }
      }
      Assert.ok(!tracker.snapshot.more && !engine.snapshot.more, "The bounded passes exhaust capture and transfer work");
    }
    const native = await readNative();
    const values = await Promise.all(native.map(record => adapter.read(record.guid)));
    state.snapshots.push({ family, side, stage, backend, transport: liveSession ? "http-8000" : "simulated",
      nativeIds: native.map(record => record.guid),
      allExpected: values.every(value => JSON.stringify(value) === JSON.stringify(state.expectedValue)),
      pending: engine.snapshot.pending, conflicts: engine.snapshot.conflicts,
      localChanges: engine.snapshot.localChanges, deferred: engine.snapshot.deferred, more: engine.snapshot.more, trackerMore: tracker.snapshot.more,
      issues: (await engine.conflictPage({ limit: 100 })).entries.map(entry => ({source: entry.source, reason: entry.reason, recordId: entry.recordId, remoteRevision: entry.remoteRevision})),
      liveRemote: Object.values(state.records).filter(record => !record.deleted).map(record => record.id) });
    await IOUtils.writeJSON(path, state, { flush: true, permissions: 0o600 });
  } finally {
    tracker.close();
    engine.close();
    adapter.close();
    await journal.close();
    liveSession?.close();
    crypto?.close();
  }
});
