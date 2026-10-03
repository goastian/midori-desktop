/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { Sqlite } = ChromeUtils.importESModule("resource://gre/modules/Sqlite.sys.mjs");
const { MidoriSyncLocalCodec, MAX_LOCAL_VALUE_BYTES } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncLocalCodec.sys.mjs");
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
const encoder = new TextEncoder();

async function fixture() {
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const scope = JSON.stringify(["http://localhost:8000/", "urn:midori:sync:local", "public-store-fixture"]);
  const handle = await crypto.generateNativeKey(scope);
  const keys = {
    sealLocal: (context, bytes) => crypto.sealNative(handle, Ci.nsIMidoriSyncCrypto.PURPOSE_LOCAL, JSON.stringify(context), bytes),
    openLocal: (context, value) => crypto.openNative(handle, Ci.nsIMidoriSyncCrypto.PURPOSE_LOCAL, JSON.stringify(context), value),
  };
  registerCleanupFunction(() => crypto.close());
  return { keys, crypto, scope, handle, storeId: uuid(), deviceId: uuid(), directory: PathUtils.join(PathUtils.profileDir, `store-${uuid()}`), create: true };
}

add_task(async function local_journal_commits_atomically_and_survives_restart() {
  const options = await fixture();
  let store = await openSyncStore(options);
  options.create = false;
  const id = uuid();
  const cursorId = uuid();
  const entry = { id, collection: "bookmarks", kind: "outbox", expectedRevision: 0, value: { operation_id: uuid(), title: "Marcador secreto ñ", url: "https://private.example.invalid/", payload: "x".repeat(300000) } };
  const expected = JSON.parse(JSON.stringify(entry.value));
  const cursor = { id: cursorId, collection: "bookmarks", kind: "metadata", expectedRevision: 0, value: { cursor: "opaque private cursor", sequence: "9007199254740993" } };
  try {
    await Assert.rejects(openSyncStore(options), /store_busy/, "There is one owner per local journal");
    const committing = store.commit([entry, cursor]);
    entry.value.title = "caller changed after submission";
    await committing;
    Assert.deepEqual((await store.read(id)).value, expected, "Values are captured before asynchronous encryption");
    await store.close();
    const bytes = await IOUtils.read(PathUtils.join(options.directory, `${options.storeId}.sqlite`));
    const disk = new TextDecoder().decode(bytes);
    Assert.ok(!disk.includes("Marcador secreto") && !disk.includes("private.example.invalid") && !disk.includes("opaque private cursor"), "SQLite stores neither data nor cursors as plaintext");
    store = await openSyncStore(options);
    Assert.deepEqual((await store.read(id)).value, expected, "Encrypted state survives reopen");
    Assert.equal((await store.read(cursorId)).value.sequence, "9007199254740993", "Server counters remain exact strings");
    await Assert.rejects(store.commit([
      { ...entry, expectedRevision: 1, value: { title: "must roll back" } },
      { ...cursor, expectedRevision: 0 },
    ]), /store_conflict/);
    Assert.equal((await store.read(id)).revision, 1, "A later conflict rolls back earlier writes in the transaction");
    Assert.deepEqual((await store.read(id)).value, expected);
    const result = await store.commit([
      { ...entry, expectedRevision: 1, deleted: true },
      { ...cursor, expectedRevision: 1, value: { cursor: "after applying the entire page" } },
    ]);
    Assert.equal(result[0].deleted, true);
    Assert.equal(await store.read(id), null);
    Assert.equal((await store.read(cursorId)).revision, 2);
    Assert.equal((await store.list("bookmarks", "metadata")).length, 1);
    await Assert.rejects(store.commit([{ ...entry, value: "x".repeat(MAX_LOCAL_VALUE_BYTES) }]), /store_value_too_large/);
    await Assert.rejects(store.commit([entry, entry]), /invalid_store_batch/);
    await store.close();
    await Assert.rejects(store.read(cursorId), /store_closed/);
  } finally {
    await store.close();
  }
});

add_task(async function history_reset_removes_only_history_journal_rows() {
  const options = await fixture();
  let store = await openSyncStore(options);
  options.create = false;
  const historyId = uuid();
  const bookmarkId = uuid();
  try {
    await store.commit([
      { id: historyId, collection: "history", kind: "outbox", expectedRevision: 0, value: { title: "Old private visit" } },
      { id: bookmarkId, collection: "bookmarks", kind: "record", expectedRevision: 0, value: { title: "Keep bookmark" } },
    ]);
    Assert.equal(await store.clearHistory(), 1);
    Assert.equal(await store.clearHistory(), 0, "Replaying local cleanup is harmless");
    Assert.equal(await store.read(historyId), null);
    Assert.equal((await store.read(bookmarkId)).value.title, "Keep bookmark");
    await store.close();
    store = await openSyncStore(options);
    Assert.equal(await store.read(historyId), null);
    Assert.equal((await store.read(bookmarkId)).value.title, "Keep bookmark");
  } finally {
    await store.close();
  }
});

add_task(async function local_chunks_authenticate_identity_order_and_completeness() {
  const options = await fixture();
  const codec = new MidoriSyncLocalCodec({ ...options, createId: uuid });
  const entry = { id: uuid(), collection: "passwords", kind: "inbox", revision: 1 };
  const value = { confidential: "ñ".repeat(150000) };
  const bytes = encoder.encode(JSON.stringify(value));
  const ciphertext = await codec.encode(entry, bytes);
  bytes.fill(0);
  Assert.deepEqual(await codec.decode(entry, ciphertext), value);
  for (const change of [
    data => { data.chunks.pop(); },
    data => { [data.chunks[1], data.chunks[2]] = [data.chunks[2], data.chunks[1]]; },
    data => { data.generation = uuid(); },
  ]) {
    const altered = JSON.parse(ciphertext);
    change(altered);
    await Assert.rejects(codec.decode(entry, JSON.stringify(altered)), error => error.code === "store_corrupt" || error.name === "OperationError");
  }
  for (const changed of [
    { ...entry, id: uuid() }, { ...entry, collection: "history" },
    { ...entry, kind: "outbox" }, { ...entry, revision: 2 },
  ]) {
    await Assert.rejects(codec.decode(changed, ciphertext), error => error.code === "store_corrupt" || error.name === "OperationError");
  }
  for (const changed of [{ storeId: uuid() }, { deviceId: uuid() }]) {
    const other = new MidoriSyncLocalCodec({ ...options, ...changed, createId: uuid });
    await Assert.rejects(other.decode(entry, ciphertext), error => error.code === "store_corrupt" || error.name === "OperationError");
  }
});

add_task(async function unknown_schema_and_corrupt_ciphertext_are_not_recreated() {
  const options = await fixture();
  await Assert.rejects(openSyncStore({ ...options, create: false }), /store_missing/);
  let store = await openSyncStore(options);
  options.create = false;
  const id = uuid();
  await store.commit([{ id, collection: "history", kind: "conflict", expectedRevision: 0, value: { secret: "fixture" } }]);
  await store.close();
  const path = PathUtils.join(options.directory, `${options.storeId}.sqlite`);
  let database = await Sqlite.openConnection({ path });
  await database.execute("UPDATE sync_entries SET ciphertext = 'invalid cipher' WHERE id = :id", { id });
  await database.close();
  store = await openSyncStore(options);
  try {
    await Assert.rejects(store.read(id), /store_corrupt/);
  } finally {
    await store.close();
  }
  database = await Sqlite.openConnection({ path });
  await database.setSchemaVersion(999);
  await database.close();
  await Assert.rejects(openSyncStore(options), /store_version_unsupported/);
  database = await Sqlite.openConnection({ path });
  Assert.equal(await database.getSchemaVersion(), 999);
  Assert.equal((await database.execute("SELECT COUNT(*) FROM sync_entries"))[0].getInt32(0), 1, "An unreadable journal is retained");
  await database.close();
});

add_task(async function closing_rejects_queued_work_without_writing_a_partial_entry() {
  const options = await fixture();
  let started;
  let resume;
  const ready = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { resume = resolve; });
  const seal = options.keys.sealLocal;
  let first = true;
  options.keys.sealLocal = async (...args) => {
    if (first) {
      first = false;
      started();
      await gate;
    }
    return seal(...args);
  };
  const store = await openSyncStore(options);
  options.create = false;
  const id = uuid();
  const pending = store.commit([{ id, collection: "bookmarks", kind: "outbox", expectedRevision: 0, value: { title: "not committed" } }]);
  const results = Promise.allSettled([pending, store.read(id), store.read(id), store.read(id)]);
  await ready;
  try {
    await Assert.rejects(store.read(id), /store_busy/);
    const closing = store.close();
    resume();
    for (const result of await results) {
      Assert.equal(result.status, "rejected");
      Assert.equal(result.reason.code, "store_closed");
    }
    await closing;
    const reopened = await openSyncStore(options);
    try {
      Assert.equal(await reopened.read(id), null, "Closing during encryption cannot leave a partial write");
    } finally {
      await reopened.close();
    }
  } finally {
    resume();
    await store.close();
  }
});





add_task(async function disconnect_checks_real_encrypted_rows_using_offline_native_custody() {
  const { assertSyncStoreSettled } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncDisconnect.sys.mjs");
  const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
  const options = await fixture();
  const secret = new Uint8Array(32).fill(7);
  const keyId = await options.crypto.nativeKeyId(options.handle);
  const bundle = await options.crypto.wrapNativeKey(options.handle, secret);
  const localKeys = { version: 1, epoch: uuid(), revision: "1", secret: Array.from(secret, byte => byte.toString(16).padStart(2, "0")).join(""),
    keys: [{ key_id: keyId, encrypted_bundle: bundle }], pending: null };
  secret.fill(0);
  const guard = {
    identity: { version: 1, store_id: options.storeId, device_id: options.deviceId, initialized: true },
    localKeys, scope: options.scope, deviceId: options.deviceId, directory: options.directory, openStore: openSyncStore,
  };
  let store = await openSyncStore(options);
  options.create = false;
  const state = { version: 3, generation: uuid(), cursor: "fixture-cursor", sequence: "1", fence: null,
    inbox: null, index: 0, ack: null, initialized: true, pending: 0, conflicts: 0, deferred: 0,
    activeApplication: null, applicationAfter: null };
  const rows = [{ id: syncJournalEntryId("bookmarks", "metadata", "collection-state-v1"), collection: "bookmarks", kind: "metadata", expectedRevision: 0, value: state }];
  for (let index = 0; index < 30; ++index) {
    const id = `confirmed-${index}`;
    rows.push({ id: syncJournalEntryId("bookmarks", "record", id), collection: "bookmarks", kind: "record", expectedRevision: 0,
      value: { version: 1, id, pending: null, blocked: false, applying: null,
        remote: { id, revision: "1", deleted: true, payload: "", ttl: null, value: null } } });
  }
  const pendingId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
  const pending = { id: pendingId, collection: "passwords", kind: "outbox", expectedRevision: 0, value: { title: "Preserved synthetic operation" } };
  try {
    await store.commit(rows);
    await store.close();
    await assertSyncStoreSettled(guard);
    Assert.ok(true, "Confirmed records across several encrypted pages permit disconnection");
    store = await openSyncStore(options);
    Assert.equal((await store.scan({ limit: 25 })).length, 25, "The inspection API respects its page limit");
    await store.commit([pending]);
    await store.close();
    await Assert.rejects(assertSyncStoreSettled(guard), /sync_pending_operations/, "A later password outbox row prevents losing Sync custody");
    store = await openSyncStore(options);
    Assert.equal((await store.read(pendingId)).value.title, pending.value.title);
    await store.commit([{ ...pending, expectedRevision: 1, deleted: true }]);
    await store.commit([{ ...pending, collection: "history", kind: "conflict" }]);
    await store.close();
    await Assert.rejects(assertSyncStoreSettled(guard), /sync_pending_operations/, "An unresolved encrypted conflict also preserves custody");
    const path = PathUtils.join(options.directory, `${options.storeId}.sqlite`);
    const database = await Sqlite.openConnection({ path });
    try {
      await database.execute("UPDATE sync_entries SET kind = 'record' WHERE id = :id", { id: pendingId });
    } finally {
      await database.close();
    }
    await Assert.rejects(assertSyncStoreSettled(guard), /sync_disconnect_unavailable/, "Changing an index cannot disguise an authenticated conflict as a confirmed record");
    await Assert.rejects(assertSyncStoreSettled({ ...guard, identity: { ...guard.identity, initialized: false } }), /sync_disconnect_unavailable/);
    await Assert.rejects(assertSyncStoreSettled({ ...guard, identity: { ...guard.identity, store_id: uuid() } }), /sync_disconnect_unavailable/, "A missing initialized journal is not recreated");
    Assert.ok(await IOUtils.exists(path), "Refused disconnection retains the encrypted file");
  } finally {
    await store.close();
  }
});
