/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { openSyncStore, openDiscoveredSyncStore, createSyncJournalFiles, assertSavedSyncCopiesIndependent } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
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

add_task(async function new_journals_use_small_pages_and_preserve_existing_page_sizes() {
  const options = await fixture();
  const path = PathUtils.join(options.directory, `${options.storeId}.sqlite`);
  const pageSize = async () => {
    const bytes = await IOUtils.read(path, { offset: 16, maxBytes: 2 });
    return bytes[0] * 256 + bytes[1];
  };
  const entry = { id: uuid(), collection: "passwords", kind: "outbox", expectedRevision: 0,
    value: { password: "synthetic journal page fixture", operation_id: uuid() } };
  let store = await openSyncStore(options);
  try {
    await store.commit([entry]);
  } finally {
    await store.close();
  }
  Assert.equal(await pageSize(), 4096, "New journals avoid rewriting 32 KiB pages for small transitions");
  const database = await Sqlite.openConnection({ path });
  try {
    await database.execute("PRAGMA page_size = 32768");
    await database.execute("VACUUM");
  } finally {
    await database.close();
  }
  Assert.equal(await pageSize(), 32768, "The fixture represents an existing journal with larger pages");
  const files = createSyncJournalFiles(options.directory);
  const before = await files.fingerprint(options.storeId);
  store = await openSyncStore({ ...options, create: false });
  try {
    Assert.deepEqual((await store.read(entry.id)).value, entry.value);
  } finally {
    await store.close();
  }
  Assert.equal(await files.fingerprint(options.storeId), before, "Opening an existing journal preserves its bytes");
  store = await openSyncStore({ ...options, create: false });
  try {
    await store.commit([{ ...entry, expectedRevision: 1, value: { ...entry.value, edited: true } }]);
    Assert.deepEqual((await store.read(entry.id)).value, { ...entry.value, edited: true });
  } finally {
    await store.close();
  }
  Assert.equal(await pageSize(), 32768, "Updating an existing journal does not rewrite its page format");
});

add_task(async function encryption_policy_keeps_the_connection_page_size() {
  const preference = "security.storage.encryption.sqlite.enabled";
  const hadValue = Services.prefs.prefHasUserValue(preference);
  const previous = Services.prefs.getBoolPref(preference, false);
  const wasLocked = Services.prefs.prefIsLocked(preference);
  if (wasLocked) {
    Services.prefs.unlockPref(preference);
  }
  Services.prefs.setBoolPref(preference, true);
  let store;
  try {
    Assert.ok(Services.prefs.getBoolPref(preference), "The encryption policy is enabled for this case");
    const options = await fixture();
    const path = PathUtils.join(options.directory, `${options.storeId}.sqlite`);
    await IOUtils.makeDirectory(options.directory);
    const reference = await Sqlite.openConnection({ path: PathUtils.join(options.directory, "reference.sqlite") });
    let expectedPageSize;
    try {
      const [row] = await reference.execute("PRAGMA page_size");
      expectedPageSize = row.getResultByIndex(0);
    } finally {
      await reference.close();
    }
    const entry = { id: uuid(), collection: "bookmarks", kind: "outbox", expectedRevision: 0,
      value: { title: "Synthetic whole-file encryption fixture" } };
    Assert.ok(Services.prefs.getBoolPref(preference), "The policy remains enabled when opening the journal");
    store = await openSyncStore(options);
    await store.commit([entry]);
    await store.close();
    const header = await IOUtils.read(path, { maxBytes: 24 });
    Assert.equal(header[16] * 256 + header[17], 8192, "The encrypted file has obfsvfs pages");
    Assert.equal(header[20], 32, "The encrypted file retains the obfsvfs reserved bytes");
    const database = await Sqlite.openConnection({ path, readOnly: true });
    try {
      const [row] = await database.execute("PRAGMA page_size");
      Assert.equal(row.getResultByIndex(0), expectedPageSize,
        "The encryption policy preserves the size chosen by the storage connection");
    } finally {
      await database.close();
    }
    store = await openSyncStore({ ...options, create: false });
    Assert.deepEqual((await store.read(entry.id)).value, entry.value, "The journal remains readable after reopen");
  } finally {
    await store?.close();
    if (hadValue) {
      Services.prefs.setBoolPref(preference, previous);
    } else {
      Services.prefs.clearUserPref(preference);
    }
    if (wasLocked) {
      Services.prefs.lockPref(preference);
    }
  }
});

add_task(async function orphan_discovery_authenticates_the_original_device_without_writing() {
  const options = await fixture();
  const files = createSyncJournalFiles(options.directory);
  const store = await openSyncStore(options);
  const entry = { id: uuid(), collection: "bookmarks", kind: "outbox", expectedRevision: 0,
    value: { title: "Synthetic orphan", operation_id: uuid() } };
  await store.commit([entry]);
  await Assert.rejects(openDiscoveredSyncStore(options), /store_busy/);
  await store.close();
  const before = await files.fingerprint(options.storeId);
  const opened = await openDiscoveredSyncStore(options);
  try {
    Assert.equal(opened.deviceId, options.deviceId, "The device comes from an authenticated encrypted manifest");
    Assert.deepEqual((await opened.store.scan())[0].value, entry.value);
    await Assert.rejects(opened.store.clearCollection("bookmarks"), /read.?only/i,
      "Inspection cannot clear or rewrite the original database");
    await Assert.rejects(files.remove(options.storeId, before), /store_busy/);
  } finally {
    await opened.store.close();
  }
  Assert.equal(await files.fingerprint(options.storeId), before, "Review preserves every stored byte and sidecar");
  Assert.equal((await files.list())[0].id, options.storeId);
  Assert.deepEqual(await files.list({ activeId: options.storeId }), [], "The active journal is not an orphan");
  Assert.deepEqual(await files.list({ after: options.storeId }), []);
  const other = await fixture();
  await Assert.rejects(openDiscoveredSyncStore({ ...options, keys: other.keys }), () => true,
    "Another account or key cannot claim this saved journal");
  Assert.equal(await files.fingerprint(options.storeId), before);
  const missing = uuid();
  await Assert.rejects(openDiscoveredSyncStore({ ...options, storeId: missing }), /store_missing/);
  Assert.ok(!(await IOUtils.exists(PathUtils.join(options.directory, `${missing}.sqlite`))),
    "Looking for a missing journal never creates an empty replacement");
  await Assert.rejects(files.remove(options.storeId, "changed"), /store_changed/);
  Assert.equal(await files.fingerprint(options.storeId), before);
  await files.remove(options.storeId, before);
  Assert.deepEqual(await files.list(), [], "Only an explicitly confirmed saved copy is removed");
});

add_task(async function incomplete_journal_groups_are_visible_and_never_follow_symlinks() {
  const options = await fixture();
  await IOUtils.makeDirectory(options.directory);
  const sidecar = PathUtils.join(options.directory, `${options.storeId}.sqlite-wal`);
  await IOUtils.writeUTF8(sidecar, "synthetic interrupted database sidecar");
  const files = createSyncJournalFiles(options.directory);
  const [entry] = await files.list();
  Assert.equal(entry.id, options.storeId);
  Assert.ok(entry.incomplete, "A leftover WAL is diagnosed even without the main database");
  const token = await files.fingerprint(options.storeId);
  await IOUtils.writeUTF8(sidecar, "changed synthetic interrupted database sidecar");
  await Assert.rejects(files.remove(options.storeId, token), /store_changed/);
  await files.remove(options.storeId, await files.fingerprint(options.storeId));
  Assert.ok(!(await IOUtils.exists(sidecar)));
  if (Services.appinfo.OS === "Linux") {
    const target = PathUtils.join(options.directory, "keep.txt");
    await IOUtils.writeUTF8(target, "unrelated file");
    const link = PathUtils.join(options.directory, `${uuid()}.sqlite`);
    const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");
    const process = await Subprocess.call({ command: "/bin/ln", arguments: ["-s", target, link] });
    Assert.equal((await process.wait()).exitCode, 0);
    await Assert.rejects(files.list(), /store_file_unsupported/);
    Assert.equal(await IOUtils.readUTF8(target), "unrelated file");
  }
});

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

add_task(async function collection_reset_atomically_keeps_its_authenticated_control_pin() {
  const options = await fixture();
  let store = await openSyncStore(options);
  options.create = false;
  const stateId = uuid();
  const pendingId = uuid();
  const otherId = uuid();
  const oldPin = { version: 3, generation: uuid(), controlRevision: "4", cursor: "before reset" };
  const newPin = { version: 3, generation: uuid(), controlRevision: "5", clearBefore: 1700000000000 };
  try {
    await store.commit([
      { id: stateId, collection: "history", kind: "metadata", expectedRevision: 0, value: oldPin },
      { id: pendingId, collection: "history", kind: "outbox", expectedRevision: 0, value: { url: "https://private.invalid/" } },
      { id: otherId, collection: "bookmarks", kind: "record", expectedRevision: 0, value: { title: "Preserved" } },
    ]);
    const replacement = { id: stateId, collection: "history", kind: "metadata", revision: 1, value: structuredClone(newPin) };
    const clearing = store.clearHistory({ replacement });
    replacement.value.controlRevision = "999";
    Assert.equal(await clearing, 2);
    Assert.deepEqual((await store.read(stateId)).value, newPin, "The control pin is captured before asynchronous encryption");
    Assert.equal(await store.read(pendingId), null);
    Assert.equal((await store.read(otherId)).value.title, "Preserved");
    await store.close();
    store = await openSyncStore(options);
    Assert.deepEqual((await store.read(stateId)).value, newPin, "The authenticated pin survives a journal restart");
    Assert.equal(await store.clearCollection("bookmarks"), 1);
    Assert.deepEqual((await store.read(stateId)).value, newPin);
  } finally {
    await store.close();
  }
});

add_task(async function failed_replacement_insert_rolls_back_the_collection_deletion_and_control_pin() {
  const options = await fixture();
  let store = await openSyncStore(options);
  options.create = false;
  const stateId = uuid();
  const recordId = uuid();
  const oldPin = { generation: uuid(), controlRevision: "7" };
  const replacement = { id: stateId, collection: "history", kind: "metadata", revision: 1,
    value: { generation: uuid(), controlRevision: "8" } };
  const path = PathUtils.join(options.directory, `${options.storeId}.sqlite`);
  try {
    await store.commit([
      { id: stateId, collection: "history", kind: "metadata", expectedRevision: 0, value: oldPin },
      { id: recordId, collection: "history", kind: "record", expectedRevision: 0, value: { title: "Kept on failure" } },
    ]);
    await store.close();
    let database = await Sqlite.openConnection({ path });
    await database.execute(`CREATE TRIGGER reject_test_metadata BEFORE INSERT ON sync_entries
      WHEN NEW.collection = 'history' AND NEW.kind = 'metadata'
      BEGIN SELECT RAISE(ABORT, 'synthetic replacement failure'); END`);
    await database.close();
    store = await openSyncStore(options);
    await Assert.rejects(store.clearCollection("history", { replacement }), /synthetic replacement failure/);
    Assert.deepEqual((await store.read(stateId)).value, oldPin);
    Assert.equal((await store.read(recordId)).value.title, "Kept on failure",
      "The DELETE rolls back when the replacement INSERT fails");
    await store.close();
    database = await Sqlite.openConnection({ path });
    await database.execute("DROP TRIGGER reject_test_metadata");
    await database.close();
    store = await openSyncStore(options);
    Assert.deepEqual((await store.read(stateId)).value, oldPin, "Failure preserves the pin on disk as well");
    await store.clearCollection("history", { replacement });
    Assert.deepEqual((await store.read(stateId)).value, replacement.value);
    Assert.equal(await store.read(recordId), null);
  } finally {
    await store.close();
  }
});

add_task(async function collection_replacement_cannot_overwrite_another_collections_entry() {
  const options = await fixture();
  const store = await openSyncStore(options);
  const historyId = uuid();
  const otherId = uuid();
  try {
    await store.commit([
      { id: historyId, collection: "history", kind: "record", expectedRevision: 0, value: { title: "History" } },
      { id: otherId, collection: "bookmarks", kind: "metadata", expectedRevision: 0, value: { cursor: "Preserved" } },
    ]);
    await Assert.rejects(store.clearCollection("history", { replacement: {
      id: otherId, collection: "history", kind: "metadata", revision: 1, value: { controlRevision: "2" },
    } }), /store_conflict/);
    Assert.equal((await store.read(historyId)).value.title, "History");
    Assert.equal((await store.read(otherId)).value.cursor, "Preserved");
    await Assert.rejects(store.clearCollection("history", { replacement: {
      id: uuid(), collection: "bookmarks", kind: "metadata", revision: 1, value: {},
    } }), /invalid_store_entry/);
    await Assert.rejects(store.clearCollection("history", { replacement: {
      id: uuid(), collection: "history", kind: "record", revision: 1, value: {},
    } }), /invalid_store_entry/);
  } finally {
    await store.close();
  }
});

add_task(async function retirement_checks_every_local_chunk_and_requires_reencryption_before_pruning() {
  const options = await fixture();
  const oldKeyId = await options.crypto.nativeKeyId(options.handle);
  const newHandle = await options.crypto.generateNativeKey(options.scope);
  const newKeyId = await options.crypto.nativeKeyId(newHandle);
  const openOld = options.keys.openLocal;
  options.keys.openLocal = (context, payload) => JSON.parse(payload).key_id === newKeyId ?
    options.crypto.openNative(newHandle, Ci.nsIMidoriSyncCrypto.PURPOSE_LOCAL, JSON.stringify(context), payload) :
    openOld(context, payload);
  const store = await openSyncStore(options);
  const id = uuid();
  const value = { content: "x".repeat(300000) };
  try {
    await store.commit([{ id, collection: "passwords", kind: "outbox", expectedRevision: 0, value }]);
    await store.assertOnlyKey(oldKeyId);
    await Assert.rejects(store.assertOnlyKey(newKeyId), /local_key_in_use/);
    Assert.deepEqual((await store.read(id)).value, value, "A blocked retirement never deletes offline data");
    options.keys.sealLocal = (context, bytes) =>
      options.crypto.sealNative(newHandle, Ci.nsIMidoriSyncCrypto.PURPOSE_LOCAL, JSON.stringify(context), bytes);
    await store.commit([{ id, collection: "passwords", kind: "outbox", expectedRevision: 1, value }]);
    await store.assertOnlyKey(newKeyId);
    await Assert.rejects(store.assertOnlyKey(oldKeyId), /local_key_in_use/);
    await Assert.rejects(store.assertOnlyKey("invalid"), /invalid_key_id/);
  } finally {
    await store.close();
  }
});

add_task(async function saved_copies_hold_custody_until_explicit_review_even_when_the_active_store_is_reencrypted() {
  const options = await fixture();
  const oldKeyId = await options.crypto.nativeKeyId(options.handle);
  const newHandle = await options.crypto.generateNativeKey(options.scope);
  const newKeyId = await options.crypto.nativeKeyId(newHandle);
  const oldSeal = options.keys.sealLocal;
  const oldOpen = options.keys.openLocal;
  options.keys.openLocal = (context, payload) => JSON.parse(payload).key_id === newKeyId ?
    options.crypto.openNative(newHandle, 1, JSON.stringify(context), payload) : oldOpen(context, payload);
  options.keys.sealLocal = (context, bytes) => options.crypto.sealNative(newHandle, 1, JSON.stringify(context), bytes);
  const active = await openSyncStore(options);
  const files = createSyncJournalFiles(options.directory);
  const accountKeyIds = [oldKeyId, newKeyId];
  const check = () => active.assertOnlyKey(newKeyId, { accountKeyIds });
  try {
    await active.commit([{ id: uuid(), collection: "bookmarks", kind: "record", expectedRevision: 0, value: { title: "Active fixture" } }]);
    await check();
    for (let index = 0; index < 25; ++index) {
      const empty = await openSyncStore({ ...options,
        storeId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}` });
      await empty.close();
    }
    const savedId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const savedOptions = { ...options, storeId: savedId, keys: { ...options.keys, sealLocal: oldSeal } };
    let saved = await openSyncStore(savedOptions);
    const id = uuid();
    const value = { payload: "synthetic pending old-key ciphertext" };
    await saved.commit([{ id, collection: "history", kind: "outbox", expectedRevision: 0, value }]);
    await saved.close();
    const fingerprint = await files.fingerprint(savedId);
    await Assert.rejects(check(), /saved_journals_require_review/, "Every saved copy is checked across file pages");
    Assert.equal(await files.fingerprint(savedId), fingerprint);
    await Assert.rejects(assertSavedSyncCopiesIndependent({ directory: options.directory, activeId: options.storeId,
      keyIds: [oldKeyId, newKeyId] }), /saved_journals_require_review/, "Disconnect cannot abandon the saved key dependency");
    saved = await openSyncStore({ ...options, storeId: savedId, create: false });
    Assert.deepEqual((await saved.read(id)).value, value, "Blocked key cleanup preserves the exact pending value");
    await saved.commit([{ id, collection: "history", kind: "outbox", expectedRevision: 1, value }]);
    await saved.close();
    await Assert.rejects(check(), /saved_journals_require_review/,
      "An active-key wrapper does not prove that saved pending payloads no longer need older keys");
    await files.remove(savedId, await files.fingerprint(savedId));
    const unrelated = await fixture();
    const other = await openSyncStore({ ...unrelated, directory: options.directory });
    await other.commit([{ id: uuid(), collection: "passwords", kind: "outbox", expectedRevision: 0, value: { fixture: "other account" } }]);
    await other.close();
    await Assert.rejects(check(), /saved_journals_require_review/,
      "A different key tag does not prove that a saved copy is independent of the retiring custody");
    await files.remove(unrelated.storeId, await files.fingerprint(unrelated.storeId));
    await check();
    await assertSavedSyncCopiesIndependent({ directory: options.directory, activeId: options.storeId, keyIds: accountKeyIds });
    const incompleteId = uuid();
    await IOUtils.writeUTF8(PathUtils.join(options.directory, `${incompleteId}.sqlite-wal`), "synthetic orphan WAL");
    await Assert.rejects(check(), /saved_journals_require_review/, "Unverifiable sidecars do not prove that releasing keys is safe");
    await files.remove(incompleteId, await files.fingerprint(incompleteId));
    await check();
  } finally {
    await active.close();
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
