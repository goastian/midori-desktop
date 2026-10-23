/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task, do_timeout, registerCleanupFunction */

const { Sqlite } = ChromeUtils.importESModule("resource://gre/modules/Sqlite.sys.mjs");
const permissionType = "midori-sync-persistence-fixture";
const principal = Services.scriptSecurityManager.createContentPrincipal(
  Services.io.newURI("https://permission-persistence.example.invalid"), {});
const otherPrincipal = Services.scriptSecurityManager.createContentPrincipal(
  Services.io.newURI("https://permission-independent.example.invalid"), {});
const persist = (owner = principal, type = permissionType) => Services.perms.persistPermissionFromPrincipal(owner, type);

async function withPermissionDatabase(task) {
  const db = await Sqlite.openConnection({ path: PathUtils.join(PathUtils.profileDir, "permissions.sqlite") });
  try {
    await task(db);
  } finally {
    await db.close();
  }
}

async function savedPermission(db, owner = principal, type = permissionType) {
  const rows = await db.execute("SELECT permission, expireType, expireTime, modificationTime FROM moz_perms WHERE origin = :origin AND type = :type",
    { origin: owner.origin, type });
  Assert.ok(rows.length <= 1, "Persistence cannot leave duplicate rows for one permission");
  return rows.length ? {
    action: rows[0].getResultByName("permission"), expireType: rows[0].getResultByName("expireType"),
    expireTime: rows[0].getResultByName("expireTime"), modificationTime: rows[0].getResultByName("modificationTime"),
  } : null;
}

add_task(async function profiles_without_permission_sync_do_not_record_local_omissions() {
  Services.perms.addFromPrincipal(principal, "popup", Services.perms.ALLOW_ACTION, Services.perms.EXPIRE_SESSION);
  Services.perms.removeFromPrincipal(principal, "popup");
  await persist();
  await withPermissionDatabase(async db => {
    const rows = await db.execute("SELECT type FROM moz_perms WHERE type GLOB 'midori-sync-omitted^*'");
    Assert.equal(rows.length, 0, "Ordinary profiles retain native session behavior without Sync metadata");
  });
});

add_task(async function current_permissions_and_removals_are_committed_without_touching_other_origins() {
  Assert.equal(Services.perms.getPermissionSourceFromPrincipal(principal, permissionType), "absent");
  Services.perms.addFromPrincipal(principal, permissionType, Services.perms.ALLOW_ACTION);
  Services.perms.addFromPrincipal(otherPrincipal, permissionType, Services.perms.DENY_ACTION);
  Assert.ok(await persist());
  Assert.equal(Services.perms.getPermissionSourceFromPrincipal(principal, permissionType), "user");
  Assert.ok(await persist(otherPrincipal));
  await withPermissionDatabase(async db => {
    Assert.equal((await savedPermission(db)).action, Services.perms.ALLOW_ACTION);
    Assert.equal((await savedPermission(db, otherPrincipal)).action, Services.perms.DENY_ACTION);
    const expiration = Date.now() + 3600000;
    Services.perms.addFromPrincipal(principal, permissionType, Services.perms.DENY_ACTION,
      Services.perms.EXPIRE_TIME, expiration);
    Assert.ok(await persist());
    const saved = await savedPermission(db);
    Assert.equal(saved.action, Services.perms.DENY_ACTION);
    Assert.equal(saved.expireType, Services.perms.EXPIRE_TIME);
    Assert.equal(saved.expireTime, expiration);
    Services.perms.removeFromPrincipal(principal, permissionType);
    Assert.ok(await persist());
    Assert.equal(Services.perms.getPermissionSourceFromPrincipal(principal, permissionType), "absent");
    Assert.equal(await savedPermission(db), null);
    Assert.equal((await savedPermission(db, otherPrincipal)).action, Services.perms.DENY_ACTION);
  });
});

add_task(async function an_unchanged_native_value_repairs_a_missing_database_row() {
  Services.perms.addFromPrincipal(principal, permissionType, Services.perms.DENY_ACTION);
  Assert.ok(await persist());
  const native = Services.perms.getPermissionObject(principal, permissionType, true);
  await withPermissionDatabase(async db => {
    await db.execute("DELETE FROM moz_perms WHERE origin = :origin AND type = :type", { origin: principal.origin, type: permissionType });
    Assert.equal(await savedPermission(db), null);
    Assert.equal(Services.perms.getPermissionObject(principal, permissionType, true).capability, native.capability);
    Assert.ok(await persist(), "Idempotent application must retry persistence even when native memory already matches");
    const saved = await savedPermission(db);
    Assert.equal(saved.action, native.capability);
    Assert.equal(saved.modificationTime, native.modificationTime);
  });
});

add_task(async function an_sqlite_failure_rejects_rolls_back_and_can_be_retried() {
  Services.perms.addFromPrincipal(principal, permissionType, Services.perms.DENY_ACTION);
  Assert.ok(await persist());
  await withPermissionDatabase(async db => {
    await db.execute("UPDATE moz_perms SET permission = :action WHERE origin = :origin AND type = :type",
      { action: Services.perms.ALLOW_ACTION, origin: principal.origin, type: permissionType });
    await db.execute(`CREATE TRIGGER midori_sync_fail_permission BEFORE INSERT ON moz_perms
      WHEN NEW.type = '${permissionType}' BEGIN SELECT RAISE(ABORT, 'synthetic permission persistence failure'); END`);
    try {
      await Assert.rejects(persist(), /NS_ERROR/,
        "SQLite failure must reach the caller rather than reporting a successful queue marker");
      Assert.equal((await savedPermission(db)).action, Services.perms.ALLOW_ACTION,
        "A failed replacement restores the earlier database row");
      Assert.equal(Services.perms.getPermissionObject(principal, permissionType, true).capability, Services.perms.DENY_ACTION,
        "Persistence failure does not erase the user's native decision");
    } finally {
      await db.execute("DROP TRIGGER midori_sync_fail_permission");
    }
    Assert.ok(await persist());
    Assert.equal((await savedPermission(db)).action, Services.perms.DENY_ACTION);
  });
});

add_task(async function a_concurrent_native_edit_or_removal_invalidates_the_saved_snapshot() {
  Services.perms.addFromPrincipal(principal, permissionType, Services.perms.ALLOW_ACTION);
  Assert.ok(await persist());
  const saving = persist();
  Services.perms.addFromPrincipal(principal, permissionType, Services.perms.DENY_ACTION);
  Assert.equal(await saving, false, "A newer native decision cannot be acknowledged as the earlier snapshot");
  Assert.ok(await persist());
  await withPermissionDatabase(async db => {
    Assert.equal((await savedPermission(db)).action, Services.perms.DENY_ACTION);
    const removing = persist();
    Services.perms.removeFromPrincipal(principal, permissionType);
    Assert.equal(await removing, false);
    Assert.ok(await persist());
    Assert.equal(await savedPermission(db), null);
  });
});

add_task(async function session_policy_and_private_permissions_are_never_materialized() {
  const privatePrincipal = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI("https://permission-private.example.invalid"), { privateBrowsingId: 1 });
  for (const expireType of [Services.perms.EXPIRE_SESSION, Services.perms.EXPIRE_POLICY]) {
    const type = `${permissionType}-${expireType}`;
    Services.perms.addFromPrincipal(principal, type, Services.perms.DENY_ACTION, expireType);
    Assert.equal(Services.perms.getPermissionSourceFromPrincipal(principal, type),
      expireType === Services.perms.EXPIRE_POLICY ? "policy" : "session");
    try {
      await Assert.rejects(Promise.resolve().then(() => persist(principal, type)), /NS_ERROR_NOT_AVAILABLE/);
    } finally {
      Services.perms.addFromPrincipal(principal, type, Services.perms.UNKNOWN_ACTION, expireType);
    }
  }
  await Assert.rejects(Promise.resolve().then(() => persist(privatePrincipal)), error => error.result === Cr.NS_ERROR_INVALID_ARG);
  Assert.equal(Services.perms.getPermissionSourceFromPrincipal(privatePrincipal, permissionType), "private");
  await Assert.rejects(Promise.resolve().then(() => persist(Services.scriptSecurityManager.getSystemPrincipal())), error => error.result === Cr.NS_ERROR_INVALID_ARG);
});

add_task(async function built_in_defaults_are_distinct_from_user_decisions_and_stay_out_of_sqlite() {
  const owner = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI("https://permission-default.example.invalid"), {});
  Services.perms.addDefaultFromPrincipal(owner, permissionType, Services.perms.ALLOW_ACTION);
  try {
    Assert.equal(Services.perms.getPermissionSourceFromPrincipal(owner, permissionType), "default");
    Assert.equal(Services.perms.getPermissionObject(owner, permissionType, true).capability, Services.perms.ALLOW_ACTION);
    Assert.ok(await persist(owner));
    await withPermissionDatabase(async db => {
      Assert.equal(await savedPermission(db, owner), null, "A built-in default is not materialized as a user's database decision");
      Services.perms.addFromPrincipal(owner, permissionType, Services.perms.DENY_ACTION);
      Assert.equal(Services.perms.getPermissionSourceFromPrincipal(owner, permissionType), "user");
      Assert.ok(await persist(owner));
      Assert.equal((await savedPermission(db, owner)).action, Services.perms.DENY_ACTION);
      Services.perms.removeFromPrincipal(owner, permissionType);
      Assert.equal(Services.perms.getPermissionSourceFromPrincipal(owner, permissionType), "default");
      Assert.ok(await persist(owner));
      Assert.equal(await savedPermission(db, owner), null);
      Assert.equal(Services.perms.getPermissionObject(owner, permissionType, true).capability, Services.perms.ALLOW_ACTION);
    });
  } finally {
    Services.perms.addDefaultFromPrincipal(owner, permissionType, Services.perms.UNKNOWN_ACTION);
  }
});

add_task(async function expiry_metadata_is_atomic_retryable_and_part_of_the_saved_snapshot() {
  const type = "popup";
  const markerType = "midori-sync-omitted^popup";
  const expiresAt = Date.now() + 500;
  try {
    Services.perms.addFromPrincipal(principal, type, Services.perms.DENY_ACTION, Services.perms.EXPIRE_TIME, expiresAt);
    Assert.ok(await persist(principal, type));
    await withPermissionDatabase(async db => {
      await db.execute(`CREATE TRIGGER midori_sync_fail_omission BEFORE INSERT ON moz_perms
        WHEN NEW.type = '${markerType}' BEGIN SELECT RAISE(ABORT, 'synthetic omission persistence failure'); END`);
      try {
        await new Promise(resolve => do_timeout(Math.max(0, expiresAt - Date.now() + 20), resolve));
        Assert.equal(Services.perms.testExactPermissionFromPrincipal(principal, type), Services.perms.UNKNOWN_ACTION);
        Assert.equal(Services.perms.getPermissionSourceFromPrincipal(principal, type), "omitted");
        await Assert.rejects(persist(principal, type), /NS_ERROR/);
        Assert.equal((await savedPermission(db, principal, type)).expireTime, expiresAt,
          "Failed omission insertion preserves the expired source row instead of deleting the evidence");
        Assert.equal(await savedPermission(db, principal, markerType), null);
      } finally {
        await db.execute("DROP TRIGGER midori_sync_fail_omission");
      }
      Assert.ok(await persist(principal, type));
      Assert.equal(await savedPermission(db, principal, type), null);
      Assert.equal((await savedPermission(db, principal, markerType)).action, Services.perms.DENY_ACTION);
      const saving = persist(principal, type);
      Services.perms.addFromPrincipal(principal, type, Services.perms.UNKNOWN_ACTION, Services.perms.EXPIRE_POLICY);
      Assert.equal(await saving, false, "A change of omission metadata invalidates the saved snapshot too");
      Assert.ok(await persist(principal, type));
      Assert.equal((await savedPermission(db, principal, markerType)).action, 4);
    });
  } finally {
    Services.perms.addFromPrincipal(principal, type, Services.perms.DENY_ACTION);
    Services.perms.removeFromPrincipal(principal, type);
    await persist(principal, type);
  }
});

add_task(async function private_permissions_do_not_create_public_omission_origins() {
  const owner = Services.scriptSecurityManager.createContentPrincipal(
    Services.io.newURI("https://private-omission.example.invalid"), { privateBrowsingId: 1 });
  try {
    for (const type of ["popup", "cookie"]) {
      Services.perms.addFromPrincipal(owner, type, Services.perms.DENY_ACTION, Services.perms.EXPIRE_SESSION);
      Services.perms.removeFromPrincipal(owner, type);
    }
    await persist();
    await withPermissionDatabase(async db => {
      const rows = await db.execute("SELECT type FROM moz_perms WHERE origin LIKE :origin AND type GLOB 'midori-sync-omitted^*'",
        { origin: "%private-omission.example.invalid%" });
      Assert.equal(rows.length, 0, "Private activity cannot introduce a persistent public origin through cookie normalization");
    });
  } finally {
    for (const type of ["popup", "cookie"]) { Services.perms.removeFromPrincipal(owner, type); }
  }
});

registerCleanupFunction(async () => {
  for (const owner of [principal, otherPrincipal]) {
    Services.perms.removeFromPrincipal(owner, permissionType);
    await persist(owner);
  }
});
