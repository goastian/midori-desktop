/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task */

const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
const { MidoriSyncPermissions } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPermissions.sys.mjs");
const { deriveSyncPermissionId, syncPermissionNativeValue } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPermissionModel.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const { sealSyncRecord } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncRecord.sys.mjs");
const { Sqlite } = ChromeUtils.importESModule("resource://gre/modules/Sqlite.sys.mjs");
const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
const scope = JSON.stringify(["http://localhost:9/", "urn:midori:sync:local", "public-permission-durability"]);
const passphrase = new TextEncoder().encode("public synthetic permission durability passphrase");
const origin = "https://durable-permissions.example.invalid";

async function omissionSurvivesRestart(stage, change) {
  const owner = Services.scriptSecurityManager.createContentPrincipalFromOrigin("https://omitted-permissions.example.invalid");
  const type = "popup";
  const markerType = "midori-sync-omitted^popup";
  const expiring = change.startsWith("expired-");
  const reason = expiring ? 2 : change === "removed-session" ? 3 : 4;
  const oldValue = { version: 1, type: "site-permission", origin: owner.origin, permission: type, action: "deny", expiresAt: null };
  if (stage === "apply") {
    Services.perms.addFromPrincipal(owner, type, Services.perms.DENY_ACTION);
    Assert.ok(await Services.perms.persistPermissionFromPrincipal(owner, type));
    if (expiring) {
      const expiresAt = Date.now() + 1000;
      Services.perms.addFromPrincipal(owner, type, Services.perms.DENY_ACTION, Services.perms.EXPIRE_TIME, expiresAt);
      Assert.ok(await Services.perms.persistPermissionFromPrincipal(owner, type));
      if (change === "expired-with-stale-marker") {
        const db = await Sqlite.openConnection({ path: PathUtils.join(PathUtils.profileDir, "permissions.sqlite") });
        try {
          await db.execute(`INSERT INTO moz_perms (id, origin, type, permission, expireType, expireTime, modificationTime)
            SELECT MAX(id) + 1, :origin, :type, 3, 0, 0, 0 FROM moz_perms`, { origin: owner.origin, type: markerType });
        } finally { await db.close(); }
      }
      await new Promise(resolve => setTimeout(resolve, Math.max(0, expiresAt - Date.now() + 20)));
    } else {
      const expireType = change === "removed-session" ? Services.perms.EXPIRE_SESSION : Services.perms.EXPIRE_POLICY;
      Services.perms.addFromPrincipal(owner, type, Services.perms.ALLOW_ACTION, expireType);
      Services.perms.addFromPrincipal(owner, type, Services.perms.UNKNOWN_ACTION, expireType);
      Assert.ok(await Services.perms.persistPermissionFromPrincipal(owner, type));
    }
    await IOUtils.writeJSON(Services.env.get("MIDORI_SYNC_DURABILITY_CHECKPOINT"), {
      pid: Services.appinfo.processID, profile: PathUtils.profileDir, acknowledged: ["site-permissions"], change, backend: "native",
    }, { flush: true, permissions: 0o600 });
    await new Promise(() => {});
  }
  Assert.equal(Services.perms.getPermissionSourceFromPrincipal(owner, type), "omitted",
    "Startup retains the local reason even before Sync or permission queries run");
  Assert.equal(Services.perms.getPermissionObject(owner, type, true), null);
  const db = await Sqlite.openConnection({ path: PathUtils.join(PathUtils.profileDir, "permissions.sqlite") });
  try {
    const rows = await db.execute("SELECT type, permission FROM moz_perms WHERE origin = :origin", { origin: owner.origin });
    Assert.equal(rows.length, 1);
    Assert.equal(rows[0].getResultByName("type"), markerType);
    Assert.equal(rows[0].getResultByName("permission"), reason);
  } finally { await db.close(); }
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  let adapter;
  try {
    const handle = await crypto.generateNativeKey(scope);
    const deriveRecordId = (collection, bytes) => crypto.deriveNativeRecordId(handle, collection, bytes);
    adapter = new MidoriSyncPermissions({ deriveRecordId, record: async () => null });
    const id = await deriveSyncPermissionId(owner.origin, type, deriveRecordId);
    Assert.equal(await adapter.canDelete(id, oldValue), false, "Cold startup cannot turn an omission into a remote deletion");
    Assert.equal(await adapter.read(id, oldValue), null);
    Assert.ok(adapter.matchesLocal(id, null, oldValue), "An omitted local value does not cause an endless capture loop");
    Services.perms.addFromPrincipal(owner, type, Services.perms.DENY_ACTION);
    Services.perms.removeFromPrincipal(owner, type);
    Assert.ok(await Services.perms.persistPermissionFromPrincipal(owner, type));
    Assert.ok(await adapter.canDelete(id, oldValue), "A new deliberate user deletion is distinguishable after restart");
  } finally {
    adapter?.close();
    crypto.close();
  }
}

add_task(async function acknowledged_site_permissions_survive_sigkill_before_any_journal_replay() {
  const stage = Services.env.get("MIDORI_SYNC_DURABILITY_STAGE");
  const change = Services.env.get("MIDORI_SYNC_DURABILITY_CHANGE");
  Assert.ok(["apply", "verify"].includes(stage));
  if (["expired-offline", "expired-with-stale-marker", "removed-session", "removed-policy"].includes(change)) {
    await omissionSurvivesRestart(stage, change);
    return;
  }
  Assert.ok(["create", "update", "delete"].includes(change));
  const fresh = stage === "apply" && change === "create";
  const statePath = PathUtils.join(PathUtils.profileDir, "permission-durability-state.json");
  const state = fresh ? { storeId: uuid(), deviceId: uuid(), epoch: uuid(), generation: uuid(), changes: [] } : await IOUtils.readJSON(statePath);
  const fixtures = Object.entries(change === "create" ? { popup: "deny", cookie: "session-cookies", camera: "deny" } :
    { popup: "allow", cookie: "deny", camera: "prompt" }).map(([permission, action]) => ({ version: 1,
    type: "site-permission", origin, permission, action, expiresAt: null }));
  const principal = Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);
  const verifyNative = async () => {
    const db = await Sqlite.openConnection({ path: PathUtils.join(PathUtils.profileDir, "permissions.sqlite") });
    try {
      for (const value of fixtures) {
        const expected = change === "delete" ? null : syncPermissionNativeValue(value);
        const native = Services.perms.getPermissionObject(principal, value.permission, true);
        Assert.equal(native?.capability ?? null, expected?.capability ?? null,
          "The acknowledged native decision survives before journal replay");
        Assert.equal(Services.perms.getPermissionSourceFromPrincipal(principal, value.permission), expected ? "user" : "absent");
        const rows = await db.execute("SELECT permission, expireType, expireTime FROM moz_perms WHERE origin = :origin AND type = :type",
          { origin, type: value.permission });
        Assert.equal(rows.length, expected ? 1 : 0);
        if (expected) {
          Assert.equal(rows[0].getResultByName("permission"), expected.capability);
          Assert.equal(rows[0].getResultByName("expireType"), expected.expireType);
          Assert.equal(rows[0].getResultByName("expireTime"), expected.expireTime);
        }
      }
    } finally { await db.close(); }
  };
  if (stage === "verify") { await verifyNative(); }
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  let journal;
  let engine;
  try {
    const handle = fresh ? await crypto.generateNativeKey(scope) : await crypto.recoverNativeKey(scope, passphrase, state.bundle);
    const writeContext = { epoch: state.epoch, revision: "1" };
    const keys = { snapshot: { status: "ready", custody: "client", activeKeyId: await crypto.nativeKeyId(handle) }, writeContext,
      sealRecord: async (context, bytes) => ({ crypto: writeContext, payload: await crypto.sealNative(handle, 0, JSON.stringify(context), bytes) }),
      openRecord: (context, payload) => crypto.openNative(handle, 0, JSON.stringify(context), payload),
      sealLocal: (context, bytes) => crypto.sealNative(handle, 1, JSON.stringify(context), bytes),
      openLocal: (context, payload) => crypto.openNative(handle, 1, JSON.stringify(context), payload) };
    const deriveRecordId = (collection, bytes) => crypto.deriveNativeRecordId(handle, collection, bytes);
    if (stage === "apply") {
      state.bundle ??= await crypto.wrapNativeKey(handle, passphrase);
      for (const value of fixtures) {
        const id = await deriveSyncPermissionId(origin, value.permission, deriveRecordId);
        const previous = state.changes.findLast(item => item.record.id === id)?.record;
        const base_revision = previous?.revision ?? "0";
        const sealed = await sealSyncRecord(keys, { collection: "site-permissions", id, generation: state.generation, base_revision },
          { deleted: change === "delete", value: change === "delete" ? null : value });
        state.changes.push({ sequence: String(state.changes.length + 1), record: { id,
          revision: String(Number(base_revision) + 1), deleted: change === "delete", payload: sealed.payload, ttl: null } });
      }
      await IOUtils.writeJSON(statePath, state, { flush: true, permissions: 0o600 });
    }
    journal = await openSyncStore({ keys, storeId: state.storeId, deviceId: state.deviceId, create: fresh,
      directory: PathUtils.join(PathUtils.profileDir, "permission-durability-journal") });
    const adapter = new MidoriSyncPermissions({ deriveRecordId, record: id => engine.record(id) });
    let acknowledged = false;
    engine = new MidoriSyncCollection({ collection: "site-permissions", adapter, keys, journal,
      entryId: syncJournalEntryId, createId: uuid, request: async (route, { body, query }) => {
        if (route.endsWith("/ack")) {
          await verifyNative();
          acknowledged = true;
          return { data: { generation: state.generation, acknowledged_sequence: body.cursor } };
        }
        Assert.ok(route.endsWith("/changes"));
        const offset = Number(query?.cursor ?? 0);
        return { data: { generation: state.generation, changes: state.changes.slice(offset), has_more: false,
          snapshot_sequence: String(state.changes.length), next_cursor: String(state.changes.length), control_revision: "0", control: null } };
      } });
    await engine.run();
    Assert.equal(engine.snapshot.pending, 0);
    Assert.equal(engine.snapshot.conflicts, 0);
    Assert.equal(engine.snapshot.deferred, 0);
    Assert.ok(engine.snapshot.initialized);
    await verifyNative();
    if (stage === "apply") {
      Assert.ok(acknowledged);
      await IOUtils.writeJSON(Services.env.get("MIDORI_SYNC_DURABILITY_CHECKPOINT"), {
        pid: Services.appinfo.processID, profile: PathUtils.profileDir, acknowledged: ["site-permissions"], change, backend: "native",
      }, { flush: true, permissions: 0o600 });
      await new Promise(() => {});
    }
  } finally {
    engine?.close();
    await journal?.close();
    crypto.close();
    passphrase.fill(0);
  }
});
