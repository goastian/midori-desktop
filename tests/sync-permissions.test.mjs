import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MidoriSyncPermissions } from "../src/browser/components/sync/MidoriSyncPermissions.sys.mjs";
import { deriveSyncPermissionId } from "../src/browser/components/sync/MidoriSyncPermissionModel.sys.mjs";
import { fixture, origin, now } from "./sync-permission-fixtures.mjs";

const value = (permission = "popup", action = "deny", expiresAt = null) => ({
  version: 1, type: "site-permission", origin, permission, action, expiresAt });

async function adapterFixture(permission = "popup") {
  const f = fixture();
  const records = new Map();
  const deriveRecordId = async (collection, bytes) => createHmac("sha256", "public adapter fixture").update(collection).update(bytes).digest("hex");
  const id = await deriveSyncPermissionId(origin, permission, deriveRecordId);
  const adapter = new MidoriSyncPermissions({ store: f.store, deriveRecordId, now: () => now,
    record: async id => records.get(id) ?? null });
  const incoming = data => ({ id, deleted: false, authenticatedSchema: 2, value: data });
  return { ...f, records, adapter, deriveRecordId, id, incoming };
}

test("capture includes portable decisions and excludes defaults, local grants, policy and private data", async () => {
  const f = await adapterFixture("geo");
  f.edit(2, "geo");
  f.edit(1, "camera");
  f.edit(1, "cookie", 3);
  f.edit(1, "popup");
  f.rows.get(f.key(f.principal(origin), "popup")).default = true;
  f.permissions.addFromPrincipal({ origin: "https://private.example.invalid^privateBrowsingId=1",
    originAttributes: { privateBrowsingId: 1 } }, "camera", 1, 1);
  assert.deepEqual(await f.adapter.listIds(), [f.id]);
  assert.deepEqual(await f.adapter.read(f.id), value("geo"));
  assert.equal(await f.adapter.countUnsupported(), 2);
  assert.equal(f.permissions.persistence, 0, "Listing and reading do not force unrelated native writes");
  await f.adapter.flush();
  assert.equal(f.permissions.persistence, 1);
});

test("application persists a received decision and heals the same native value after an I/O failure", async () => {
  const f = await adapterFixture();
  const incoming = f.incoming(value());
  const plan = await f.adapter.prepare(incoming);
  f.permissions.beforePersist = () => { throw new Error("synthetic write failure"); };
  await assert.rejects(f.adapter.applyPrepared(plan), { code: "native_write_failed" });
  assert.deepEqual(await f.adapter.read(f.id), value());
  assert.equal(f.disk.size, 0);
  f.permissions.beforePersist = null;
  assert.deepEqual(await f.adapter.applyPrepared(plan), { status: "applied" });
  assert.equal([...f.disk.values()][0].capability, 2);
  assert.equal(f.permissions.additions, 1);
});

test("a concurrent local edit defeats a prepared write and remains visible as a conflict", async () => {
  const f = await adapterFixture();
  const incoming = f.incoming(value());
  const plan = await f.adapter.prepare(incoming);
  f.edit(1);
  assert.deepEqual(await f.adapter.applyPrepared(plan), { status: "deferred", reason: "permission_local_changed" });
  assert.equal(f.store.read(origin, "popup").capability, 1);
  assert.deepEqual(await f.adapter.apply(incoming), { status: "conflict", reason: "permission_changed" });
  const choice = await f.adapter.prepare(incoming, null, { resolution: { choice: "remote" } });
  assert.deepEqual(await f.adapter.applyPrepared(choice), { status: "applied" });
  assert.deepEqual(await f.adapter.read(f.id), value());
});

test("sensitive grants stay local while removing a previous portable block requires their native persistence", async () => {
  const f = await adapterFixture("camera");
  f.edit(1, "camera");
  f.records.set(f.id, { remote: f.incoming(value("camera")) });
  assert.equal(await f.adapter.read(f.id), null);
  assert.ok(await f.adapter.canDelete(f.id, value("camera")));
  f.permissions.beforePersist = () => { throw new Error("grant was not saved"); };
  await assert.rejects(f.adapter.flush(), { code: "native_write_failed" });
  f.permissions.beforePersist = null;
  assert.equal(await f.adapter.read(f.id), null);
  await f.adapter.flush();
  assert.equal([...f.disk.values()][0].capability, 1, "The existing local grant is saved without publishing it");
  await assert.rejects(f.adapter.validate(f.id, value("camera", "allow")), { code: "invalid_record" });
  assert.deepEqual(await f.adapter.apply({ id: f.id, deleted: true, authenticatedSchema: 2 }, f.incoming(value("camera"))), { status: "applied" });
  assert.equal(f.store.read(origin, "camera").capability, 1, "A remote unblock cannot revoke a device-local grant");
});

test("conflict review describes a device-local grant and binds its native snapshot without publishing it", async () => {
  const f = await adapterFixture("camera");
  f.edit(1, "camera");
  assert.equal(await f.adapter.read(f.id, value("camera")), null);
  const before = f.adapter.conflictValue(null);
  const summary = f.adapter.localConflictSummary(f.id, null);
  assert.equal(summary.deleted, false);
  assert.equal(summary.localReason, "sensitive-grant");
  assert.deepEqual(summary.fields, [
    { name: "website", value: origin },
    { name: "permission", l10nId: "midori-sync-permission-type-camera" },
    { name: "permission-action", l10nId: "midori-sync-permission-action-allow" },
  ]);
  f.permissions.addFromPrincipal(f.principal(origin), "camera", 1, 2, now + 3600000);
  assert.equal(await f.adapter.read(f.id, value("camera")), null);
  assert.notDeepEqual(f.adapter.conflictValue(null), before, "A newer local grant invalidates an open conflict preview");
  await assert.rejects(f.adapter.validate(f.id, value("camera", "allow")), { code: "invalid_record" });
  f.adapter.close();
  assert.throws(() => f.adapter.conflictValue(null), { code: "cancelled" });
});

test("a reviewed remote choice cannot overwrite a newer device-local grant before or after preparing it", async () => {
  for (const timing of ["before-prepare", "after-prepare", "during-save"]) {
    const f = await adapterFixture("camera");
    f.edit(1, "camera");
    const denied = f.incoming(value("camera"));
    assert.equal(await f.adapter.read(f.id, denied.value), null);
    const edit = () => f.permissions.addFromPrincipal(f.principal(origin), "camera", 1, 2, now + 3600000);
    if (timing === "before-prepare") { edit(); }
    const plan = await f.adapter.prepare(denied, null, { resolution: { choice: "remote" } });
    if (timing === "after-prepare") { edit(); }
    if (timing === "during-save") { f.permissions.beforePersist = edit; }
    assert.deepEqual(await f.adapter.applyPrepared(plan), { status: "conflict", reason: "permission_local_changed" }, timing);
    assert.equal(f.store.read(origin, "camera").capability, 1);
    assert.equal(f.store.read(origin, "camera").expireTime, now + 3600000);
  }
});

test("session and policy decisions defer remote application and cannot infer deletions", async () => {
  for (const [expireType, reason] of [[1, "session"], [3, "policy"]]) {
    const f = await adapterFixture();
    f.edit(1, "popup", expireType);
    const incoming = f.incoming(value());
    const plan = await f.adapter.prepare(incoming, null, { resolution: { choice: "remote" } });
    assert.deepEqual(await f.adapter.applyPrepared(plan), { status: "deferred", reason: `permission_${reason}` });
    assert.equal(await f.adapter.canDelete(f.id, value()), false);
    assert.equal(f.permissions.persistence, 0);
    f.permissions.removeFromPrincipal(f.principal(origin), "popup");
    const reopened = new MidoriSyncPermissions({ store: f.store, deriveRecordId: f.deriveRecordId,
      record: async () => null, now: () => now });
    assert.deepEqual(await reopened.applyPrepared(structuredClone(plan)),
      { status: "conflict", reason: "permission_local_changed" }, "An earlier choice needs a fresh review after the local constraint changes");
    assert.equal(f.store.read(origin, "popup"), null);
    reopened.close();
  }
});

test("unknown authenticated tombstones and expiry cannot erase native decisions", async () => {
  const f = await adapterFixture();
  f.edit(1);
  assert.deepEqual(await f.adapter.apply({ id: f.id, deleted: true, authenticatedSchema: 2 }), { status: "applied" });
  assert.equal(f.store.read(origin, "popup").capability, 1);
  assert.deepEqual(await f.adapter.apply(f.incoming(value("popup", "deny", now - 1))), { status: "applied" });
  assert.equal(f.store.read(origin, "popup").capability, 1);
  assert.equal(await f.adapter.canDelete(f.id, value("popup", "deny", now - 1)), false);
});

test("equivalent concurrent records can be adopted only after native persistence", async () => {
  const f = await adapterFixture();
  f.edit(2);
  const incoming = f.incoming(value());
  assert.equal(await f.adapter.canAdoptRecord({ ...incoming, authenticatedSchema: 1 }), false);
  assert.equal(f.permissions.persistence, 0);
  f.permissions.beforePersist = () => { throw new Error("synthetic native failure"); };
  await assert.rejects(f.adapter.canAdoptRecord(incoming), { code: "native_write_failed" });
  f.permissions.beforePersist = null;
  assert.equal(await f.adapter.canAdoptRecord(incoming), true);
  f.edit(1);
  assert.equal(await f.adapter.canAdoptRecord(incoming), false);
});

test("account identities, inventory errors and observer lifetime remain isolated", async () => {
  const f = await adapterFixture();
  await assert.rejects(f.adapter.validate(`p1:${"0".repeat(64)}`, value()), { code: "invalid_record" });
  f.adapter.observe(() => {});
  assert.equal(f.listeners.size, 1);
  f.permissions.getPermissionSourceFromPrincipal = () => { throw new Error("synthetic read failure"); };
  await assert.rejects(f.adapter.read(f.id, value()), /synthetic read failure/);
  f.adapter.close();
  f.adapter.close();
  assert.equal(f.listeners.size, 0);
  await assert.rejects(f.adapter.listIds(), { code: "cancelled" });
});
