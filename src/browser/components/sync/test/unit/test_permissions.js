/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_setup, add_task, registerCleanupFunction */

const { MidoriSyncPermissions } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPermissions.sys.mjs");
const { deriveSyncPermissionId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPermissionModel.sys.mjs");
const { Sqlite } = ChromeUtils.importESModule("resource://gre/modules/Sqlite.sys.mjs");
const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
const origin = "https://sync-permissions.example.invalid";
const principal = Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);
const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
let handle;
const deriveRecordId = (collection, bytes) => crypto.deriveNativeRecordId(handle, collection, bytes);
const value = (permission = "popup", action = "deny", expiresAt = null) => ({
  version: 1, type: "site-permission", origin, permission, action, expiresAt });
const idFor = permission => deriveSyncPermissionId(origin, permission, deriveRecordId);
const incoming = async data => ({ id: await idFor(data.permission), deleted: false, authenticatedSchema: 2, value: data });
const adapter = () => new MidoriSyncPermissions({ deriveRecordId, record: async () => null });

async function withPermissionDatabase(task) {
  const db = await Sqlite.openConnection({ path: PathUtils.join(PathUtils.profileDir, "permissions.sqlite") });
  try { await task(db); } finally { await db.close(); }
}

async function saved(db, permission) {
  const rows = await db.execute("SELECT permission FROM moz_perms WHERE origin = :origin AND type = :type", { origin, type: permission });
  Assert.ok(rows.length <= 1);
  return rows.length ? rows[0].getResultByName("permission") : null;
}

add_setup(async function prepare_native_permission_identity() {
  handle = await crypto.generateNativeKey(JSON.stringify(["http://localhost:9/", "urn:midori:sync:local", "public-permission-adapter-fixture"]));
  registerCleanupFunction(() => crypto.close());
});

add_task(async function received_permissions_reach_sqlite_and_local_edits_request_capture() {
  const current = adapter();
  let hints = 0;
  const stop = current.observe(() => ++hints);
  try {
    const received = await incoming(value());
    Assert.deepEqual(await current.apply(received), { status: "applied" });
    Assert.equal(Services.perms.getPermissionSourceFromPrincipal(principal, "popup"), "user");
    await withPermissionDatabase(async db => { Assert.equal(await saved(db, "popup"), Services.perms.DENY_ACTION); });
    Assert.ok((await current.listIds()).includes(received.id));
    Services.perms.addFromPrincipal(principal, "popup", Services.perms.ALLOW_ACTION);
    Assert.ok(hints > 0, "Native permission edits wake the Sync tracker");
    Assert.deepEqual(await current.read(received.id, received.value), value("popup", "allow"));
    await current.flush();
    await withPermissionDatabase(async db => { Assert.equal(await saved(db, "popup"), Services.perms.ALLOW_ACTION); });
    const clear = { id: received.id, deleted: true, authenticatedSchema: 2 };
    Assert.deepEqual(await current.apply(clear, await incoming(value("popup", "allow"))), { status: "applied" });
    await withPermissionDatabase(async db => { Assert.equal(await saved(db, "popup"), null); });
  } finally {
    stop();
    current.close();
    Services.perms.removeFromPrincipal(principal, "popup");
  }
});

add_task(async function native_write_failure_can_replay_without_changing_the_permission_again() {
  const current = adapter();
  try {
    const previous = await incoming(value());
    Assert.deepEqual(await current.apply(previous), { status: "applied" });
    const changed = await incoming(value("popup", "allow"));
    const plan = await current.prepare(changed, previous);
    await withPermissionDatabase(async db => {
      await db.execute(`CREATE TRIGGER sync_permission_adapter_failure BEFORE INSERT ON moz_perms
        WHEN NEW.origin = '${origin}' AND NEW.type = 'popup'
        BEGIN SELECT RAISE(ABORT, 'synthetic permission adapter failure'); END`);
      try {
        await Assert.rejects(current.applyPrepared(plan), /native_write_failed/);
      } finally {
        await db.execute("DROP TRIGGER sync_permission_adapter_failure");
      }
      const native = Services.perms.getPermissionObject(principal, "popup", true);
      Assert.equal(native.capability, Services.perms.ALLOW_ACTION);
      Assert.deepEqual(await current.applyPrepared(plan), { status: "applied" });
      Assert.equal(Services.perms.getPermissionObject(principal, "popup", true).modificationTime, native.modificationTime,
        "Idempotent recovery waits for SQLite without inventing a new native change");
      Assert.equal(await saved(db, "popup"), Services.perms.ALLOW_ACTION);
    });
  } finally {
    current.close();
    Services.perms.removeFromPrincipal(principal, "popup");
  }
});

add_task(async function native_sensitive_grants_stay_local_and_are_not_replaced_by_background_sync() {
  const current = adapter();
  try {
    const denied = await incoming(value("camera"));
    Services.perms.addFromPrincipal(principal, "camera", Services.perms.ALLOW_ACTION);
    Assert.deepEqual(await current.apply(denied), { status: "conflict", reason: "permission_changed" });
    Assert.equal(Services.perms.getPermissionObject(principal, "camera", true).capability, Services.perms.ALLOW_ACTION);
    const chosen = await current.prepare(denied, null, { resolution: { choice: "remote" } });
    Assert.deepEqual(await current.applyPrepared(chosen), { status: "applied" });
    Services.perms.addFromPrincipal(principal, "camera", Services.perms.ALLOW_ACTION);
    Assert.equal(await current.read(denied.id, denied.value), null, "A local sensitive grant is never an outgoing value");
    Assert.ok(await current.canDelete(denied.id, denied.value));
    await current.flush();
    await withPermissionDatabase(async db => { Assert.equal(await saved(db, "camera"), Services.perms.ALLOW_ACTION); });
    await Assert.rejects(current.validate(denied.id, value("camera", "allow")), /invalid_record/);
    Assert.deepEqual(await current.apply({ id: denied.id, deleted: true, authenticatedSchema: 2 }, denied), { status: "applied" });
    Assert.equal(Services.perms.getPermissionObject(principal, "camera", true).capability, Services.perms.ALLOW_ACTION);
  } finally {
    current.close();
    Services.perms.removeFromPrincipal(principal, "camera");
  }
});

add_task(async function a_reviewed_remote_block_preserves_a_newer_native_grant() {
  for (const timing of ["before-prepare", "after-prepare", "native-observer"]) {
    const current = adapter();
    const expiresAt = Date.now() + 3600000;
    let observing = false;
    let edited = false;
    const edit = () => Services.perms.addFromPrincipal(principal, "camera", Services.perms.ALLOW_ACTION,
      Services.perms.EXPIRE_TIME, expiresAt);
    const observer = { observe(subject) {
      const permission = subject.QueryInterface(Ci.nsIPermission);
      if (!edited && permission.type === "camera" && permission.principal.origin === origin &&
          permission.capability === Services.perms.DENY_ACTION) {
        edited = true;
        edit();
      }
    } };
    try {
      Services.perms.addFromPrincipal(principal, "camera", Services.perms.ALLOW_ACTION);
      const denied = await incoming(value("camera"));
      Assert.equal(await current.read(denied.id, denied.value), null);
      Assert.equal(current.localConflictSummary(denied.id, null).localReason, "sensitive-grant");
      const reviewed = current.conflictValue(null);
      if (timing === "before-prepare") { edit(); }
      const plan = await current.prepare(denied, null, { resolution: { choice: "remote" } });
      if (timing === "after-prepare") { edit(); }
      if (timing === "native-observer") {
        Services.obs.addObserver(observer, "perm-changed");
        observing = true;
      }
      Assert.deepEqual(await current.applyPrepared(plan), { status: "conflict", reason: "permission_local_changed" }, timing);
      const native = Services.perms.getPermissionObject(principal, "camera", true);
      Assert.equal(native.capability, Services.perms.ALLOW_ACTION);
      Assert.equal(native.expireTime, expiresAt);
      Assert.equal(await current.read(denied.id, denied.value), null);
      Assert.notDeepEqual(current.conflictValue(null), reviewed, "A newer native grant invalidates its earlier review");
    } finally {
      if (observing) { Services.obs.removeObserver(observer, "perm-changed"); }
      current.close();
      Services.perms.removeFromPrincipal(principal, "camera");
    }
  }
});

add_task(async function a_received_blocker_exception_uses_the_active_native_producer_and_excludes_private_sessions() {
  const { MidoriBlockerService } = ChromeUtils.importESModule("resource:///modules/MidoriBlockerService.sys.mjs");
  const current = adapter();
  const host = new URL(origin).hostname;
  try {
    const allowed = await incoming(value("midori-blocker", "allow"));
    Assert.deepEqual(await current.apply(allowed), { status: "applied" });
    Assert.ok(MidoriBlockerService.isSiteExcepted(host), "The active blocker recognizes the received exception");
    Assert.ok(MidoriBlockerService.isSiteExcepted(`child.${host}`), "Parent-host matching retains its native meaning");
    Assert.ok((await current.listIds()).includes(allowed.id));
    Assert.deepEqual(await current.apply({ id: allowed.id, deleted: true, authenticatedSchema: 2 }, allowed), { status: "applied" });
    Assert.ok(!MidoriBlockerService.isSiteExcepted(host));
    const unsupported = await current.countUnsupported();
    MidoriBlockerService.allowSiteForSession(host, { isPrivate: true });
    Assert.ok(MidoriBlockerService.isSiteExcepted(host, { isPrivate: true }));
    Assert.ok(!MidoriBlockerService.isSiteExcepted(host));
    Assert.equal(await current.countUnsupported(), unsupported, "Private-session decisions do not affect account coverage counts");
    Assert.ok(!(await current.listIds()).includes(allowed.id));
    await Assert.rejects(current.validate(allowed.id, { ...allowed.value, origin: origin.replace("https:", "http:") }), /invalid_record/);
  } finally {
    current.close();
    MidoriBlockerService.removeSiteException(host);
    MidoriBlockerService.removeSiteException(host, { isPrivate: true });
  }
});

add_task(async function defaults_and_policies_cannot_be_published_as_user_decisions() {
  const current = adapter();
  let policyAdded = false;
  try {
    const data = await incoming(value("geo"));
    Services.perms.addDefaultFromPrincipal(principal, "geo", Services.perms.ALLOW_ACTION);
    Assert.equal(Services.perms.getPermissionSourceFromPrincipal(principal, "geo"), "default");
    Assert.ok(!(await current.listIds()).includes(data.id));
    Assert.equal(await current.read(data.id, data.value), null);
    Services.perms.addDefaultFromPrincipal(principal, "geo", Services.perms.UNKNOWN_ACTION);
    Services.perms.addFromPrincipal(principal, "geo", Services.perms.ALLOW_ACTION, Services.perms.EXPIRE_POLICY);
    policyAdded = true;
    Assert.equal(await current.read(data.id, data.value), null);
    Assert.equal(current.localConflictSummary(data.id, null).localReason, "policy");
    const plan = await current.prepare(data, null, { resolution: { choice: "remote" } });
    Assert.deepEqual(await current.applyPrepared(plan), { status: "deferred", reason: "permission_policy" });
    Assert.ok(!await current.canDelete(data.id, data.value));
    Assert.equal(Services.perms.getPermissionObject(principal, "geo", true).capability, Services.perms.ALLOW_ACTION);
  } finally {
    current.close();
    if (policyAdded) {
      Services.perms.addFromPrincipal(principal, "geo", Services.perms.UNKNOWN_ACTION, Services.perms.EXPIRE_POLICY);
    }
    Services.perms.addDefaultFromPrincipal(principal, "geo", Services.perms.UNKNOWN_ACTION);
  }
});

add_task(async function authenticated_clear_removes_expired_native_rows() {
  const current = adapter();
  try {
    const expiresAt = Date.now() + 500;
    Services.perms.addFromPrincipal(principal, "popup", Services.perms.ALLOW_ACTION, Services.perms.EXPIRE_TIME, expiresAt);
    Assert.equal(Services.perms.getPermissionSourceFromPrincipal(principal, "popup"), "user");
    await Services.perms.persistPermissionFromPrincipal(principal, "popup");
    await new Promise(resolve => setTimeout(resolve, Math.max(0, expiresAt - Date.now() + 20)));
    Assert.equal(Services.perms.getPermissionSourceFromPrincipal(principal, "popup"), "expired");
    const previous = await incoming(value("popup", "allow", expiresAt));
    Assert.deepEqual(await current.apply({ id: previous.id, deleted: true, authenticatedSchema: 2 }, previous), { status: "applied" });
    await withPermissionDatabase(async db => { Assert.equal(await saved(db, "popup"), null); });
    Assert.equal(Services.perms.getPermissionSourceFromPrincipal(principal, "popup"), "absent");
  } finally {
    current.close();
    Services.perms.removeFromPrincipal(principal, "popup");
  }
});

add_task(async function removing_temporary_or_managed_rules_does_not_delete_the_earlier_portable_decision() {
  for (const expireType of [Services.perms.EXPIRE_SESSION, Services.perms.EXPIRE_POLICY]) {
    const current = adapter();
    try {
      const previous = await incoming(value());
      Assert.deepEqual(await current.apply(previous), { status: "applied" });
      Services.perms.addFromPrincipal(principal, "popup", Services.perms.ALLOW_ACTION, expireType);
      Assert.equal(await current.canDelete(previous.id, previous.value), false);
      Services.perms.addFromPrincipal(principal, "popup", Services.perms.UNKNOWN_ACTION, expireType);
      Assert.equal(Services.perms.getPermissionSourceFromPrincipal(principal, "popup"), "omitted");
      Assert.equal(await current.canDelete(previous.id, previous.value), false);
      const local = await current.read(previous.id, previous.value);
      Assert.ok(current.matchesLocal(previous.id, local, previous.value));
      const remote = await incoming(value("popup", "allow"));
      Assert.deepEqual(await current.apply(remote, previous), { status: "applied" }, "A new compatible remote decision can replace the automatic omission");
      Assert.equal(Services.perms.getPermissionSourceFromPrincipal(principal, "popup"), "user");
      await withPermissionDatabase(async db => {
        Assert.equal(await saved(db, "popup"), Services.perms.ALLOW_ACTION);
        Assert.equal(await saved(db, "midori-sync-omitted^popup"), null);
      });
    } finally {
      current.close();
      Services.perms.addFromPrincipal(principal, "popup", Services.perms.DENY_ACTION);
      Services.perms.removeFromPrincipal(principal, "popup");
    }
  }
});

add_task(async function an_unobserved_local_expiry_is_not_published_as_a_deliberate_deletion() {
  const current = adapter();
  try {
    const previous = await incoming(value());
    Assert.deepEqual(await current.apply(previous), { status: "applied" });
    const expiresAt = Date.now() + 500;
    Services.perms.addFromPrincipal(principal, "popup", Services.perms.DENY_ACTION, Services.perms.EXPIRE_TIME, expiresAt);
    await Services.perms.persistPermissionFromPrincipal(principal, "popup");
    await new Promise(resolve => setTimeout(resolve, Math.max(0, expiresAt - Date.now() + 20)));
    Assert.equal(Services.perms.testExactPermissionFromPrincipal(principal, "popup"), Services.perms.UNKNOWN_ACTION);
    Assert.equal(await current.canDelete(previous.id, previous.value), false,
      "Native expiry cleanup cannot masquerade as a deliberate removal of the earlier permanent decision");
    const omitted = await current.read(previous.id, previous.value);
    Assert.equal(omitted, null);
    Assert.ok(current.matchesLocal(previous.id, omitted, previous.value), "An automatic omission does not leave capture retrying forever");
    Assert.equal(current.localConflictSummary(previous.id, omitted).localReason, "excluded");
    Services.perms.addFromPrincipal(principal, "popup", Services.perms.ALLOW_ACTION);
    Services.perms.removeFromPrincipal(principal, "popup");
    Assert.ok(await current.canDelete(previous.id, previous.value), "A later deliberate removal remains portable");
  } finally {
    current.close();
    Services.perms.removeFromPrincipal(principal, "popup");
  }
});
