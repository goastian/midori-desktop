/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, MidoriSyncTransport, add_task */

const { MidoriSyncAccount } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncAccount.sys.mjs");
const { MidoriSyncConnection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncConnection.sys.mjs");
const { MidoriSyncVault } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncVault.sys.mjs");
const { createSyncVaultFileStore, authorizeSyncSecretStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncSecretStore.sys.mjs");
const { createNativeSyncKeys } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncNativeKeys.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
const { MidoriSyncRecordTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswordTracker.sys.mjs");
const { MidoriSyncPermissions } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPermissions.sys.mjs");
const { MidoriBlockerService } = ChromeUtils.importESModule("resource:///modules/MidoriBlockerService.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const { SyncProtocolError } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncProtocol.sys.mjs");
const { Sqlite } = ChromeUtils.importESModule("resource://gre/modules/Sqlite.sys.mjs");
const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
const collection = "site-permissions";
const origin = "https://permissions-live.example.invalid";
const permissionTypes = ["popup", "cookie", "midori-blocker", "camera", "microphone", "geo", "desktop-notification"];

add_task(async function site_permissions_round_trip_without_transferring_sensitive_grants() {
  const stage = Services.env.get("MIDORI_SYNC_H2_STAGE");
  Assert.ok(["A", "B", "C", "D", "E", "F", "G"].includes(stage));
  Assert.ok(Services.env.get("MIDORI_SYNC_TEST_KEYRING_ROOT"));
  const fixture = await IOUtils.readJSON(Services.env.get("MIDORI_SYNC_TEST_FIXTURE"));
  Assert.equal(fixture.version, 1);
  Assert.ok(["http://localhost:8000/", "http://127.0.0.1:8000/"].includes(fixture.baseURL));
  const statePath = Services.env.get("MIDORI_SYNC_H2_STATE");
  const state = stage === "A" ? { devices: {}, stage: null } : await IOUtils.readJSON(statePath);
  const expectedPrevious = { A: null, B: "A", C: "B", D: "C", E: "D", F: "E", G: "F" };
  Assert.equal(state.stage, expectedPrevious[stage]);
  const side = ["A", "C", "E", "G"].includes(stage) ? "A" : "B";
  const first = stage === side;
  if (first) { state.devices[side] = { profileId: uuid(), storeId: uuid() }; }
  const descriptor = state.devices[side];
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  Assert.ok(keyStore.isOSBacked);
  const tokenFactory = () => Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
  const connection = new MidoriSyncConnection({ baseURL: fixture.baseURL, allowLocalHTTP: true, saveServer: () => {},
    transportFactory: (url, options) => new MidoriSyncTransport(url, options) });
  const vault = new MidoriSyncVault({ store: createSyncVaultFileStore(PathUtils.join(PathUtils.profileDir, "permissions-vault")),
    keyStore, profileId: descriptor.profileId, createId: uuid,
    authorize: options => authorizeSyncSecretStore(keyStore, tokenFactory, options) });
  const account = new MidoriSyncAccount({ connection, vaultFactory: () => vault,
    transportFactory: (url, options) => new MidoriSyncTransport(url, options) });
  const keys = createNativeSyncKeys(account);
  let journal;
  let engine;
  let tracker;
  let loseResponse = false;
  try {
    if (first) {
      await account.pair(fixture.profiles[side].pairing_token, `Permissions synthetic profile ${side}`);
    } else {
      await account.initialize();
      if (account.snapshot.status === "locked") { await account.unlock({ interactive: false }); }
    }
    Assert.equal(account.snapshot.status, "connected");
    Assert.ok(account.snapshot.collectionSupport[collection], "The real service explicitly negotiates portable site permissions");
    await keys.refresh();
    if (stage === "A") {
      Assert.equal(keys.snapshot.status, "empty");
      state.recoveryCode = await keys.prepareCreation();
      await keys.confirmCreation({ recoveryCodeSaved: true });
    } else if (stage === "B") {
      await keys.recover(state.recoveryCode);
    }
    await keys.refresh();
    Assert.equal(keys.snapshot.status, "ready");
    Assert.equal(keys.snapshot.custody, "client");
    descriptor.deviceId ??= account.snapshot.device.id;
    Assert.equal(account.snapshot.device.id, descriptor.deviceId);
    journal = await openSyncStore({ directory: PathUtils.join(PathUtils.profileDir, "permissions-journal"),
      storeId: descriptor.storeId, deviceId: descriptor.deviceId, keys, create: first });
    const principal = Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);
    const native = permission => Services.perms.getPermissionObject(principal, permission, true);
    const edit = (permission, capability) => Services.perms.addFromPrincipal(principal, permission, capability);
    const verifyNative = async () => {
      const current = permissionTypes.map(permission => native(permission));
      if (!current.some(Boolean)) { return; }
      const db = await Sqlite.openConnection({ path: PathUtils.join(PathUtils.profileDir, "permissions.sqlite") });
      try {
        for (const [index, permission] of permissionTypes.entries()) {
          const rows = await db.execute("SELECT permission, expireType, expireTime FROM moz_perms WHERE origin = :origin AND type = :type", { origin, type: permission });
          Assert.equal(rows.length, current[index] ? 1 : 0, "Native state is durable before feed acknowledgement");
          if (current[index]) {
            Assert.equal(rows[0].getResultByName("permission"), current[index].capability);
            Assert.equal(rows[0].getResultByName("expireType"), current[index].expireType);
            Assert.equal(rows[0].getResultByName("expireTime"), current[index].expireTime);
          }
        }
      } finally { await db.close(); }
    };
    const adapter = new MidoriSyncPermissions({ deriveRecordId: (name, bytes) => keys.deriveRecordId(name, bytes),
      record: id => engine.record(id) });
    engine = new MidoriSyncCollection({ collection, adapter, journal, keys,
      entryId: syncJournalEntryId, createId: uuid, pageByteBudget: true,
      request: async (path, options) => {
        if (path.endsWith("/ack")) { await verifyNative(); }
        if (path.endsWith("/changes")) { options = { ...options, query: { ...options.query, limit: 2 } }; }
        for (let attempt = 0; ; ++attempt) {
          let response;
          try { response = await account.withSecrets(lease => lease.request(path, options)); }
          catch (error) {
            if (error.code !== "rate_limited" || attempt >= 4) { throw error; }
            await new Promise(resolve => setTimeout(resolve, Math.max(1, Math.min(error.retryAfter, 60)) * 1000));
            continue;
          }
          if (loseResponse && path.endsWith("/operations")) {
            loseResponse = false;
            throw new SyncProtocolError("network_error");
          }
          return response;
        }
      } });
    await engine.initialize();
    tracker = new MidoriSyncRecordTracker({ engine, adapter });
    const capture = async () => {
      tracker.requestInventory();
      for (let pass = 0; tracker.snapshot.more && pass < 10; ++pass) { await tracker.run({ limit: 100 }); }
      Assert.ok(!tracker.snapshot.more);
      for (const row of await journal.list(collection, "outbox")) {
        Assert.equal(JSON.parse(row.value.operation.payload).context.collection, collection);
        Assert.ok(!["camera", "microphone", "geo", "desktop-notification"].includes(row.value.value?.permission) ||
          row.value.value.action !== "allow", "No outgoing operation carries a sensitive grant");
      }
    };
    const drain = async () => {
      for (let pass = 0; pass < 15; ++pass) {
        await engine.run({ maxPages: 100 });
        if (engine.snapshot.initialized) { await capture(); }
        await engine.run({ maxPages: 100 });
        if (!engine.snapshot.more && !tracker.snapshot.more) { return; }
      }
      throw new Error("permissions_live_did_not_settle");
    };
    if (stage === "A") {
      await engine.run();
      edit("popup", Services.perms.DENY_ACTION);
      edit("cookie", 8);
      MidoriBlockerService.addSiteException(new URL(origin).hostname);
      for (const permission of ["camera", "geo", "desktop-notification"]) { edit(permission, Services.perms.DENY_ACTION); }
      edit("microphone", Services.perms.PROMPT_ACTION);
      await drain();
      Assert.equal((await adapter.listIds()).length, 7);
    } else if (stage === "B") {
      edit("camera", Services.perms.ALLOW_ACTION);
      Assert.ok(await Services.perms.persistPermissionFromPrincipal(principal, "camera"));
      await drain();
      Assert.equal(native("cookie").capability, 8);
      Assert.equal(native("camera").capability, Services.perms.ALLOW_ACTION);
      Assert.ok(MidoriBlockerService.isSiteExcepted(new URL(origin).hostname));
      const conflict = (await engine.conflictPage({ summaries: true })).entries.find(row => row.reason === "permission_changed");
      Assert.ok(conflict);
      const preview = await engine.conflictPreview(conflict);
      Assert.equal(preview.local.localReason, "sensitive-grant");
      Assert.ok(preview.local.fields.some(field => field.l10nId === "midori-sync-permission-action-allow"));
      state.cameraGrantExpiration = Date.now() + 86400000;
      Services.perms.addFromPrincipal(principal, "camera", Services.perms.ALLOW_ACTION, Services.perms.EXPIRE_TIME, state.cameraGrantExpiration);
      await Assert.rejects(engine.resolveConflict({ ...conflict, choice: "remote", localRevision: preview.localRevision }), /conflict_changed/);
      const fresh = await engine.conflictPreview(conflict);
      await engine.resolveConflict({ ...conflict, choice: "local", localRevision: fresh.localRevision });
      await drain();
      edit("cookie", Services.perms.ALLOW_ACTION);
      await drain();
      Assert.equal(native("camera").capability, Services.perms.ALLOW_ACTION);
    } else if (stage === "C") {
      Assert.equal(native("cookie").capability, 8, "A's native decision survives reopening before journal replay");
      await drain();
      Assert.equal(native("cookie").capability, Services.perms.ALLOW_ACTION);
      Assert.equal(native("camera"), null, "The other device can withdraw a block without transferring its camera grant");
      edit("cookie", 8);
      await capture();
      Assert.equal(engine.snapshot.pending, 1);
    } else if (stage === "D") {
      Assert.equal(native("camera").capability, Services.perms.ALLOW_ACTION);
      Assert.equal(native("camera").expireTime, state.cameraGrantExpiration);
      edit("cookie", Services.perms.DENY_ACTION);
      await drain();
      MidoriBlockerService.removeSiteException(new URL(origin).hostname);
      await capture();
      Assert.equal(engine.snapshot.pending, 1);
      loseResponse = true;
      await Assert.rejects(engine.run(), /network_error/);
      Assert.equal(engine.snapshot.pending, 1);
      state.clearOperation = (await journal.list(collection, "outbox"))[0].value.operation;
      Assert.ok(state.clearOperation.deleted);
    } else if (stage === "E") {
      Assert.equal(native("cookie").capability, 8);
      await drain();
      Assert.equal(native("cookie").capability, 8, "The simultaneous local edit stays visible as a conflict");
      Assert.ok(!MidoriBlockerService.isSiteExcepted(new URL(origin).hostname));
      const conflict = (await engine.conflictPage()).entries.find(row => row.canAcceptRemote);
      Assert.ok(conflict);
      const preview = await engine.conflictPreview(conflict);
      await engine.resolveConflict({ ...conflict, choice: "remote", localRevision: preview.localRevision });
      await drain();
      Assert.equal(native("cookie").capability, Services.perms.DENY_ACTION);
      Assert.equal(native("camera"), null);
    } else if (stage === "F") {
      Assert.deepEqual((await journal.list(collection, "outbox"))[0].value.operation, state.clearOperation,
        "Reopening retains the accepted operation's exact ID and ciphertext");
      await drain();
      Assert.equal(native("cookie").capability, Services.perms.DENY_ACTION);
      Assert.equal(native("camera").capability, Services.perms.ALLOW_ACTION);
      Assert.equal(native("camera").expireTime, state.cameraGrantExpiration);
    } else {
      await drain();
      Assert.equal(native("cookie").capability, Services.perms.DENY_ACTION);
      Assert.equal(native("camera"), null);
      Assert.ok(!MidoriBlockerService.isSiteExcepted(new URL(origin).hostname));
    }
    await verifyNative();
    Assert.equal(engine.snapshot.conflicts, 0);
    Assert.equal(engine.snapshot.deferred, 0);
    if (!["C", "D"].includes(stage)) { Assert.equal(engine.snapshot.pending, 0); }
    const filters = await account.withSecrets(lease => lease.request("api/v1/sync/collections/midori-privacy/changes"));
    Assert.equal(filters.data.changes.length, 0, "Permission records do not enter the custom-filter stream");
    state.stage = stage;
    await IOUtils.writeJSON(statePath, state, { permissions: 0o600, flush: true });
    Services.prefs.savePrefFile(null);
  } finally {
    tracker?.close();
    engine?.close();
    await journal?.close();
    keys.close();
    account.close();
    connection.close();
  }
});
