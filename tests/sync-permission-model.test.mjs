import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validateSyncPermission, classifySyncPermission, syncPermissionNativeValue, planSyncPermission,
  canDeleteSyncPermission, deriveSyncPermissionId } from "../src/browser/components/sync/MidoriSyncPermissionModel.sys.mjs";

const origin = "https://permissions.example.invalid";
const now = 1792544000000;
const value = (permission = "popup", action = "deny", expiresAt = null) => ({ version: 1,
  type: "site-permission", origin, permission, action, expiresAt });
const native = (permission = "popup", capability = 2, scope = "user", expiresAt = null) => ({
  origin, permission, capability, scope, expireType: expiresAt === null ? 0 : 2, expireTime: expiresAt ?? 0 });
const incoming = data => ({ deleted: false, authenticatedSchema: 2, value: data });
const deleted = { deleted: true, authenticatedSchema: 2, value: null };

test("wire permissions have closed fields, canonical origins and no sensitive grants", () => {
  assert.deepEqual(validateSyncPermission(value()), value());
  for (const patch of [{ extra: true }, { origin: `${origin}/` }, { origin: "https://user:password@example.invalid" },
    { origin: "file:///private" }, { origin: `${origin}^userContextId=2` }, { permission: "unknown" },
    { action: "unknown" }, { expiresAt: NaN }, { expiresAt: 0 }, { expiresAt: 8640000000000001 }]) {
    assert.throws(() => validateSyncPermission({ ...value(), ...patch }), { code: "invalid_record" });
  }
  for (const permission of ["camera", "microphone", "geo", "desktop-notification"]) {
    assert.throws(() => validateSyncPermission(value(permission, "allow")), { code: "invalid_record" });
    assert.deepEqual(validateSyncPermission(value(permission)), value(permission));
    assert.deepEqual(classifySyncPermission(native(permission, 1), now), { kind: "local", reason: "sensitive-grant" });
  }
  assert.throws(() => validateSyncPermission({ ...value("midori-blocker", "allow"), origin: "http://permissions.example.invalid" }),
    { code: "invalid_record" }, "Blocker exceptions use the native producer's HTTPS principal");
});

test("native projection distinguishes cookie lifetime from permission session scope", () => {
  assert.deepEqual(classifySyncPermission(native("cookie", 8), now), { kind: "portable", value: value("cookie", "session-cookies") });
  assert.deepEqual(syncPermissionNativeValue(value("cookie", "session-cookies")), { capability: 8, expireType: 0, expireTime: 0 });
  for (const scope of ["session", "policy", "private"]) {
    assert.deepEqual(classifySyncPermission(native("popup", 1, scope), now), { kind: "local", reason: scope });
  }
  assert.deepEqual(classifySyncPermission(native("popup", 2, "user", now - 1), now), { kind: "expired" });
  assert.deepEqual(classifySyncPermission(null, now), { kind: "absent" });
  assert.deepEqual(classifySyncPermission(native("popup", 2, "default"), now), { kind: "absent" });
  assert.deepEqual(classifySyncPermission(native("popup", 0, "omitted"), now), { kind: "excluded" });
  assert.equal(canDeleteSyncPermission(value(), native("popup", 0, "omitted"), now), false);
  assert.deepEqual(planSyncPermission(incoming(value("popup", "allow")), incoming(value()), native("popup", 0, "omitted"), { now }),
    { status: "apply", desired: value("popup", "allow") });
});

test("an unchanged native value still requires successful persistence", () => {
  assert.deepEqual(planSyncPermission(incoming(value()), null, native(), { now }), { status: "persist", desired: value() });
  assert.deepEqual(planSyncPermission(deleted, incoming(value()), null, { now }), { status: "persist", desired: null });
});

test("new and unchanged remote decisions preserve local edits", () => {
  assert.deepEqual(planSyncPermission(incoming(value()), null, null, { now }), { status: "apply", desired: value() });
  assert.deepEqual(planSyncPermission(incoming(value()), incoming(value()), native("popup", 1), { now }), { status: "keep_local" });
  assert.deepEqual(planSyncPermission(incoming(value()), null, native("popup", 1), { now }), { status: "conflict", reason: "permission_changed" });
  assert.deepEqual(planSyncPermission(deleted, incoming(value()), native("popup", 1), { now }), { status: "conflict", reason: "permission_changed" });
});

test("a local sensitive grant survives background blocks and remote unblocking", () => {
  for (const permission of ["camera", "microphone", "geo", "desktop-notification"]) {
    const local = native(permission, 1);
    assert.deepEqual(planSyncPermission(incoming(value(permission)), null, local, { now }), { status: "conflict", reason: "permission_changed" });
    assert.deepEqual(planSyncPermission(deleted, incoming(value(permission)), local, { now }), { status: "keep_local" });
    assert.equal(canDeleteSyncPermission(value(permission), local, now), true, "A local grant may remove a portable block without publishing the grant");
    assert.deepEqual(planSyncPermission(incoming(value(permission)), null, local, { now, resolution: { choice: "remote" } }),
      { status: "apply", desired: value(permission) });
  }
});

test("explicit conflict choices cannot replace session, policy or private permissions", () => {
  for (const scope of ["session", "policy", "private"]) {
    assert.deepEqual(planSyncPermission(incoming(value()), null, native("popup", 1, scope), { now, resolution: { choice: "remote" } }),
      { status: "deferred", reason: `permission_${scope}` });
    assert.equal(canDeleteSyncPermission(value(), native("popup", 1, scope), now), false);
  }
});

test("expiration is not inferred as a deliberate deletion and stale grants have no effect", () => {
  const expired = value("popup", "allow", now - 1);
  assert.deepEqual(planSyncPermission(incoming(expired), null, native(), { now }), { status: "keep_local" });
  assert.equal(canDeleteSyncPermission(expired, null, now), false);
  assert.equal(canDeleteSyncPermission(value(), null, now), true);
  assert.deepEqual(planSyncPermission(incoming(value()), incoming(expired), null, { now }), { status: "apply", desired: value() });
  assert.deepEqual(planSyncPermission({ ...deleted, authenticatedSchema: 1 }, incoming(value()), native(), { now }),
    { status: "conflict", reason: "unverified_deletion" });
  assert.deepEqual(planSyncPermission(deleted, null, null, { now }), { status: "keep_local" });
  assert.throws(() => planSyncPermission(incoming(value()), incoming(value("cookie")), native(), { now }), { code: "invalid_record" });
});

test("record identity separates account, type and origin, and erases the derivation buffer", async () => {
  let bytes;
  const inputs = [];
  const derive = key => async (collection, input) => {
    bytes = input;
    inputs.push(JSON.parse(new TextDecoder().decode(input)));
    assert.equal(collection, "site-permissions");
    return createHmac("sha256", key).update(input).digest("hex");
  };
  const a = await deriveSyncPermissionId(origin, "popup", derive("public fixture A"));
  assert.deepEqual(inputs[0], [1, "site-permission", origin, "popup"]);
  assert.match(a, /^p1:[0-9a-f]{64}$/);
  assert.ok(bytes.every(byte => byte === 0));
  assert.notEqual(a, await deriveSyncPermissionId(origin, "cookie", derive("public fixture A")));
  assert.notEqual(a, await deriveSyncPermissionId("https://other.example.invalid", "popup", derive("public fixture A")));
  assert.notEqual(a, await deriveSyncPermissionId(origin, "popup", derive("public fixture B")));
  await assert.rejects(deriveSyncPermissionId(origin, "popup", async () => "not-a-native-id"), { code: "invalid_record" });
});
