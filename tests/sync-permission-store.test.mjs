import test from "node:test";
import assert from "node:assert/strict";
import { fixture, origin, now } from "./sync-permission-fixtures.mjs";
import { classifySyncPermission } from "../src/browser/components/sync/MidoriSyncPermissionModel.sys.mjs";

const value = (permission = "popup", action = "deny", expiresAt = null) => ({
  version: 1, type: "site-permission", origin, permission, action, expiresAt });



test("a failed native save remains retryable when memory already contains the desired value", async () => {
  const f = fixture();
  f.permissions.beforePersist = () => { throw new Error("synthetic SQLite failure"); };
  await assert.rejects(f.write(value()), { code: "native_write_failed" });
  assert.equal(f.store.read(origin, "popup").capability, 2);
  assert.equal(f.disk.size, 0);
  f.permissions.beforePersist = null;
  assert.deepEqual(await f.write(value()), { status: "applied" });
  assert.equal(f.permissions.additions, 1, "Reapplication retries storage rather than inventing another native edit");
  assert.equal(f.permissions.persistence, 2);
  assert.equal([...f.disk.values()][0].capability, 2);
});

test("a later native edit is preserved before and during persistence", async () => {
  const f = fixture();
  f.edit(2);
  assert.deepEqual(await f.write(value("popup", "allow")), { status: "deferred", reason: "permission_local_changed" });
  assert.equal(f.permissions.persistence, 0);
  const expected = f.store.read(origin, "popup");
  f.permissions.beforePersist = () => { f.edit(2); };
  assert.deepEqual(await f.write(value("popup", "allow"), expected), { status: "deferred", reason: "permission_local_changed" });
  assert.equal(f.store.read(origin, "popup").capability, 2);
});

test("native observers may replace a value reentrantly without being overwritten", async () => {
  const f = fixture();
  f.permissions.afterAdd = () => {
    f.permissions.afterAdd = null;
    f.edit(2);
  };
  assert.deepEqual(await f.write(value("popup", "allow")), { status: "deferred", reason: "permission_local_changed" });
  assert.equal(f.permissions.persistence, 0);
  assert.equal(f.store.read(origin, "popup").capability, 2);
});

test("a deletion is explicitly persisted even when the permission is already absent", async () => {
  const f = fixture();
  assert.deepEqual(await f.write(null), { status: "applied" });
  assert.equal(f.permissions.persistence, 1);
  f.edit(2);
  const expected = f.store.read(origin, "popup");
  assert.deepEqual(await f.write(null, expected), { status: "applied" });
  assert.equal(f.store.read(origin, "popup"), null);
  assert.equal(f.permissions.persistence, 2);
});

test("policy, sessions, unsupported actions and expired incoming values cannot replace native decisions", async () => {
  for (const [expiration, reason] of [[1, "session"], [3, "policy"], [4, "session"]]) {
    const f = fixture();
    f.edit(1, "popup", expiration);
    assert.deepEqual(await f.write(value(), f.store.read(origin, "popup")), { status: "deferred", reason: `permission_${reason}` });
    assert.equal(f.permissions.persistence, 0);
  }
  const f = fixture();
  f.edit(99);
  assert.deepEqual(await f.write(value(), f.store.read(origin, "popup")), { status: "conflict", reason: "permission_unsupported" });
  assert.equal(f.store.read(origin, "popup").capability, 99);
  assert.deepEqual(await f.write(value("popup", "deny", now - 1)), { status: "applied" });
  assert.equal(f.store.read(origin, "popup").capability, 99);
  await assert.rejects(f.write(value("camera", "allow")), { code: "invalid_record" });
});

test("a broken inventory or read propagates instead of being treated as a deletion", () => {
  const f = fixture();
  f.permissions.getPermissionSourceFromPrincipal = () => { throw new Error("synthetic permission inventory failure"); };
  assert.throws(() => f.store.read(origin, "popup"), /synthetic permission inventory failure/);
  Object.defineProperty(f.permissions, "all", { get() { throw new Error("synthetic full inventory failure"); } });
  assert.throws(() => f.store.list(), /synthetic full inventory failure/);
});

test("native observation ignores private and unrelated permissions and unsubscribes exactly once", () => {
  const f = fixture();
  let changes = 0;
  const stop = f.store.observe(() => ++changes);
  const listener = [...f.listeners][0];
  const permission = { type: "camera", principal: { originAttributes: { privateBrowsingId: 1 } } };
  listener.observe(permission, "perm-changed", "added");
  permission.principal.originAttributes.privateBrowsingId = 0;
  listener.observe(permission, "perm-changed", "changed");
  permission.type = "unrelated-native-permission";
  listener.observe(permission, "perm-changed", "deleted");
  listener.observe(null, "perm-changed", "cleared");
  assert.equal(changes, 2);
  stop();
  stop();
  assert.equal(f.listeners.size, 0);
});

test("the blocker's private-session type stays out of account inventories even with a non-private principal", () => {
  const f = fixture();
  f.edit(1, "midori-blocker-pb", 1);
  f.edit(2, "midori-sync-omitted^popup");
  assert.equal(f.permissions.all.length, 2, "Native private-session entries and omission metadata remain local");
  f.permissions.getPermissionSourceFromPrincipal = () => { throw new Error("The private type must not be inspected for capture"); };
  assert.deepEqual(f.store.list(), []);
});

test("built-in defaults are visible in native enumeration without becoming portable user decisions", async () => {
  const f = fixture();
  f.edit(1);
  const row = [...f.rows.values()][0];
  row.default = true;
  assert.equal(f.permissions.all.length, 1, "Gecko also enumerates default permissions");
  assert.deepEqual(classifySyncPermission(f.store.list()[0], now), { kind: "absent" });
  assert.deepEqual(classifySyncPermission(f.store.read(origin, "popup"), now), { kind: "absent" });
  assert.equal(f.permissions.persistence, 0);
  assert.deepEqual(await f.write(null, f.store.read(origin, "popup")), { status: "applied" });
  assert.equal(f.rows.size, 1, "Clearing a user exception preserves the built-in default");
  assert.equal([...f.disk.values()][0], null);
});

test("an authenticated clear removes an expired native row instead of leaving a grant that could reactivate after clock rollback", async () => {
  const f = fixture();
  f.permissions.addFromPrincipal(f.principal(origin), "popup", 1, 2, now - 1);
  const expected = f.store.read(origin, "popup");
  assert.equal(expected.scope, "expired");
  assert.deepEqual(await f.write(null, expected), { status: "applied" });
  assert.equal(f.rows.size, 0);
  assert.equal([...f.disk.values()][0], null);
});
