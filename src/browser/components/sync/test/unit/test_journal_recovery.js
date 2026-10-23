/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncService } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncService.sys.mjs");
const { openSyncStore, openDiscoveredSyncStore, createSyncJournalFiles, assertSavedSyncCopiesIndependent } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { createProfileSyncVault, createProfileSyncSavedCustody } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncSecretStore.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);

add_task(async function native_saved_copy_review_restores_the_pointer_without_rewriting_pending_operations() {
  const owner = MidoriSyncService.account;
  await owner.initialize();
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const scope = JSON.stringify(["http://localhost:9/", "urn:midori:sync:local", "journal-recovery-fixture"]);
  const deviceId = uuid();
  const handle = await crypto.generateNativeKey(scope);
  const secret = new Uint8Array(32).fill(17);
  const localKeys = { version: 1, epoch: uuid(), revision: "1", secret: "11".repeat(32), pending: null,
    keys: [{ key_id: await crypto.nativeKeyId(handle), encrypted_bundle: await crypto.wrapNativeKey(handle, secret) }] };
  secret.fill(0);
  const keys = {
    sealLocal: (context, bytes) => crypto.sealNative(handle, 1, JSON.stringify(context), bytes),
    openLocal: (context, payload) => crypto.openNative(handle, 1, JSON.stringify(context), payload),
  };
  const directory = PathUtils.join(PathUtils.profileDir, "midori-sync", "journals");
  const files = createSyncJournalFiles(directory);
  const activeId = uuid();
  const savedId = uuid();
  const options = { directory, deviceId, keys, create: true };
  const active = await openSyncStore({ ...options, storeId: activeId });
  await active.close();
  const saved = await openSyncStore({ ...options, storeId: savedId });
  const operationId = uuid();
  const generation = uuid();
  const operation = { operation_id: operationId, id: "fixture-guid", base_revision: "0", deleted: false,
    payload: "synthetic immutable encrypted operation" };
  const queued = { version: 1, generation, epoch: localKeys.epoch, operation, value: { title: "Synthetic bookmark" } };
  await saved.commit([
    { id: syncJournalEntryId("bookmarks", "metadata", "collection-state-v1"), collection: "bookmarks", kind: "metadata", expectedRevision: 0,
      value: { version: 3, generation, initialized: true, cursor: "opaque fixture cursor", sequence: "0", fence: null,
        inbox: null, index: 0, ack: null, pending: 1, conflicts: 0, deferred: 0, activeApplication: null, applicationAfter: null } },
    { id: syncJournalEntryId("bookmarks", "record", operation.id), collection: "bookmarks", kind: "record", expectedRevision: 0,
      value: { version: 1, id: operation.id, pending: operationId, blocked: false, applying: null, remote: null } },
    { id: operationId, collection: "bookmarks", kind: "outbox", expectedRevision: 0, value: queued },
  ]);
  await saved.close();
  const fingerprint = await files.fingerprint(savedId);
  let identity = { version: 1, store_id: activeId, device_id: deviceId, initialized: true };
  let failWrite = false;
  let enter;
  let release;
  const state = { status: "connected", generation: 1, busy: false, interactionBusy: false, device: { id: deviceId } };
  const lease = { scope, deviceId,
    readLocalKeys: () => structuredClone(localKeys), readJournalIdentity: () => structuredClone(identity),
    async writeJournalIdentity(value) {
      if (failWrite) { throw Object.assign(new Error("disk_full"), { code: "disk_full" }); }
      identity = structuredClone(value);
    } };
  const replacements = {
    snapshot: { configurable: true, get: () => state },
    initialize: { configurable: true, value: async () => {} },
    withLocalSecrets: { configurable: true, value: async work => {
      if (enter) {
        enter();
        await new Promise(resolve => { release = resolve; });
      }
      return work(lease);
    } },
  };
  const original = new Map(Object.keys(replacements).map(name => [name, Object.getOwnPropertyDescriptor(owner, name)]));
  Object.defineProperties(owner, replacements);
  try {
    const page = await MidoriSyncService.savedJournalPage();
    Assert.deepEqual(page.entries.map(entry => entry.id), [savedId]);
    await Assert.rejects(MidoriSyncService.reviewSavedJournal(activeId), /store_in_use/);
    const review = await MidoriSyncService.reviewSavedJournal(savedId);
    Assert.equal(review.status, "recoverable");
    Assert.equal(review.collections[0].pending, 1);
    Assert.equal(await files.fingerprint(savedId), fingerprint, "A review does not modify original data or sidecars");
    failWrite = true;
    await Assert.rejects(MidoriSyncService.restoreSavedJournal(savedId, review.token), /disk_full/);
    Assert.equal(identity.store_id, activeId, "A failed vault write keeps the original active identity");
    Assert.equal(await files.fingerprint(savedId), fingerprint);
    failWrite = false;
    await MidoriSyncService.restoreSavedJournal(savedId, review.token);
    Assert.equal(identity.store_id, savedId);
    Assert.equal(await files.fingerprint(savedId), fingerprint, "Restoration does not reseal or renew a pending operation");
    const reopened = await openSyncStore({ ...options, storeId: savedId, create: false });
    Assert.deepEqual((await reopened.read(operationId)).value, queued);
    await reopened.close();
    const old = await MidoriSyncService.reviewSavedJournal(activeId);
    Assert.equal(old.status, "empty");
    await MidoriSyncService.deleteSavedJournal(activeId, old.token);
    Assert.ok(!(await IOUtils.exists(PathUtils.join(directory, `${activeId}.sqlite`))));
    Assert.equal(await files.fingerprint(savedId), fingerprint, "Deleting an inactive empty copy preserves the active pending queue");
    const entered = new Promise(resolve => { enter = resolve; });
    const listing = MidoriSyncService.savedJournalPage();
    await entered;
    Assert.throws(() => MidoriSyncService.journal, /busy/, "A concurrent view cannot reopen the journal during maintenance");
    await Assert.rejects(MidoriSyncService.collection("bookmarks"), /busy/);
    state.generation = 2;
    release();
    await Assert.rejects(listing, /cancelled/, "A changed account cannot receive an old saved-copy list");
    enter = null;
    Assert.deepEqual((await MidoriSyncService.savedJournalPage()).entries, []);
  } finally {
    for (const [name, descriptor] of original) {
      if (descriptor) { Object.defineProperty(owner, name, descriptor); }
      else { delete owner[name]; }
    }
    await files.remove(savedId, await files.fingerprint(savedId));
    crypto.close();
  }
});

add_task(async function independent_native_key_backup_preserves_saved_work_after_clearing_the_account_vault() {
  const owner = MidoriSyncService.account;
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  let primaryToken;
  if (!keyStore.isOSBacked) {
    primaryToken = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
    await primaryToken.changePassword("", "synthetic saved custody primary password");
  }
  const scope = JSON.stringify(["http://localhost:9/", "urn:midori:sync:local", "independent-custody-fixture"]);
  const deviceId = uuid();
  const sourceCrypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const handle = await sourceCrypto.generateNativeKey(scope);
  const secret = new Uint8Array(32).fill(27);
  let localKeys = { version: 1, epoch: uuid(), revision: "1", secret: "1b".repeat(32), pending: null,
    keys: [{ key_id: await sourceCrypto.nativeKeyId(handle), encrypted_bundle: await sourceCrypto.wrapNativeKey(handle, secret) }] };
  secret.fill(0);
  const keyIds = localKeys.keys.map(key => key.key_id);
  const accountVault = await createProfileSyncVault();
  await accountVault.save(scope, { token: "synthetic-token-must-not-be-archived", crypto: localKeys });
  const directory = PathUtils.join(PathUtils.profileDir, "midori-sync", "journals");
  const files = createSyncJournalFiles(directory);
  const id = uuid();
  const store = await openSyncStore({ directory, storeId: id, deviceId, create: true, keys: {
    sealLocal: (context, bytes) => sourceCrypto.sealNative(handle, 1, JSON.stringify(context), bytes),
    openLocal: (context, payload) => sourceCrypto.openNative(handle, 1, JSON.stringify(context), payload),
  } });
  const operationId = uuid();
  const generation = uuid();
  const queued = { version: 1, epoch: localKeys.epoch, generation,
    operation: { operation_id: operationId, id: "preserved-guid", base_revision: "0", deleted: false,
      payload: "synthetic immutable operation payload" }, value: { title: "Saved synthetic work" } };
  await store.commit([
    { id: syncJournalEntryId("bookmarks", "metadata", "collection-state-v1"), collection: "bookmarks", kind: "metadata", expectedRevision: 0,
      value: { version: 3, generation, initialized: true, cursor: "opaque preserved cursor", sequence: "0", fence: null,
        inbox: null, index: 0, ack: null, pending: 1, conflicts: 0, deferred: 0, activeApplication: null, applicationAfter: null } },
    { id: syncJournalEntryId("bookmarks", "record", queued.operation.id), collection: "bookmarks", kind: "record", expectedRevision: 0,
      value: { version: 1, id: queued.operation.id, pending: operationId, blocked: false, applying: null, remote: null } },
    { id: operationId, collection: "bookmarks", kind: "outbox", expectedRevision: 0, value: queued },
  ]);
  await store.close();
  const fingerprint = await files.fingerprint(id);
  const state = { status: "connected", generation: 10, busy: false, interactionBusy: false, device: { id: deviceId } };
  const replacements = {
    snapshot: { configurable: true, get: () => state },
    initialize: { configurable: true, value: async () => {} },
    withLocalSecrets: { configurable: true, value: async work => work({ scope, deviceId,
      readLocalKeys: () => structuredClone(localKeys), readJournalIdentity: () => null }) },
  };
  const descriptors = new Map(Object.keys(replacements).map(name => [name, Object.getOwnPropertyDescriptor(owner, name)]));
  Object.defineProperties(owner, replacements);
  try {
    await Assert.rejects(assertSavedSyncCopiesIndependent({ directory, keyIds, scope }), /saved_journals_require_review/);
    const review = await MidoriSyncService.reviewSavedJournal(id);
    Assert.ok(review.canProtect);
    await MidoriSyncService.protectSavedJournal(id, review.token);
    Assert.equal(await files.fingerprint(id), fingerprint, "Protecting keys preserves every original file byte and timestamp");
    const savedCustody = createProfileSyncSavedCustody();
    const protectedKeys = await savedCustody.open({ id, fingerprint, scope, requiredKeyIds: keyIds });
    Assert.ok(protectedKeys, "The independent native vault contains verified read keys");
    protectedKeys.keys.close();
    await assertSavedSyncCopiesIndependent({ directory, keyIds, scope, activeId: null });
    Assert.ok((await accountVault.inspect()).present, "Preflight does not clear the active account itself");
    await accountVault.clear();
    sourceCrypto.close();
    localKeys = null;
    state.status = "signed-out";
    state.generation = 11;
    Assert.ok(!(await accountVault.inspect()).present, "Only the active account vault was removed");
    const archivedReview = await MidoriSyncService.reviewSavedJournal(id);
    Assert.equal(archivedReview.status, "archived");
    Assert.equal(archivedReview.collections[0].pending, 1);
    Assert.ok(!archivedReview.canRestore, "A key archive does not authorize replay under another session");
    Assert.ok(!archivedReview.canProtect, "Signed-out diagnostics cannot create new custody");
    const archived = await savedCustody.open({ id, fingerprint, scope: null });
    const reopened = await openDiscoveredSyncStore({ directory, storeId: id, keys: archived.keys });
    try {
      Assert.deepEqual((await reopened.store.read(operationId)).value, queued, "All queued operation fields survive active-key deletion");
      Assert.equal(reopened.deviceId, deviceId, "The original device is still authenticated by the saved manifest");
    } finally {
      await reopened.store.close();
      archived.keys.close();
    }
    Assert.equal(await files.fingerprint(id), fingerprint);
    const identityPath = PathUtils.join(PathUtils.profileDir, "midori-sync", "profile-id");
    const profileId = await IOUtils.readUTF8(identityPath);
    await IOUtils.remove(identityPath);
    try {
      await Assert.rejects(createProfileSyncVault(), /vault_corrupt/, "Saved keys prevent inventing a replacement profile identity");
    } finally {
      await IOUtils.writeUTF8(identityPath, profileId, { flush: true });
      await IOUtils.setPermissions(identityPath, 0o600);
    }
    const path = PathUtils.join(directory, `${id}.sqlite`);
    const bytes = await IOUtils.read(path);
    await new Promise(resolve => do_timeout(20, resolve));
    await IOUtils.write(path, bytes, { flush: true });
    bytes.fill(0);
    Assert.notEqual(await files.fingerprint(id), fingerprint, "A changed file requires a newly reviewed backup");
    await Assert.rejects(assertSavedSyncCopiesIndependent({ directory, keyIds, scope }), /saved_journals_require_review/);
    const oldBackup = await savedCustody.open({ id, fingerprint, scope });
    Assert.ok(oldBackup, "A stale fingerprint never deletes the independent keys");
    oldBackup.keys.close();
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) { Object.defineProperty(owner, name, descriptor); }
      else { delete owner[name]; }
    }
    sourceCrypto.close();
    accountVault.close();
    if (primaryToken) { await primaryToken.changePassword("synthetic saved custody primary password", ""); }
  }
});
