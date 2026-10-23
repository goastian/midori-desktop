import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { validateSyncExtension, classifySyncExtension, planSyncExtension, canDeleteSyncExtension,
  deriveSyncExtensionId } from "../src/browser/components/sync/MidoriSyncExtensionModel.sys.mjs";

const addonId = "@portable-extension";
const value = (enabled = true) => ({ version: 1, type: "extension", catalog: "amo", addonId, enabled });
const native = (enabled = true, availability = "ready") => ({ scope: "user", catalog: "amo", addonId, enabled, availability });
const incoming = data => ({ deleted: false, authenticatedSchema: 2, value: data });
const deleted = { deleted: true, authenticatedSchema: 2 };

test("extension references have a closed catalog contract and preserve Gecko IDs", () => {
  for (const id of [addonId, "uBlock0@raymondhill.net", "{12345678-ABCD-4ef0-9234-1234567890ab}"]) {
    assert.equal(validateSyncExtension({ ...value(), addonId: id }).addonId, id);
  }
  for (const patch of [{ sourceURL: "https://untrusted.invalid/install.xpi" }, { enabled: 1 }, { catalog: "unknown" },
    { addonId: " ../extension@provider" }, { addonId: "no-provider" }, { addonId: "id@provider\n" },
    { addonId: "á@provider" }, { addonId: `${"a".repeat(255)}@x` }, { version: 2 }, { type: "theme" }]) {
    assert.throws(() => validateSyncExtension({ ...value(), ...patch }), { code: "invalid_record" });
  }
  assert.throws(() => validateSyncExtension(Object.create(value())), { code: "invalid_record" });
});

test("runtime incompatibility does not change the user's enabled preference", () => {
  for (const availability of ["ready", "incompatible", "blocked"]) {
    assert.deepEqual(classifySyncExtension(native(true, availability)), { kind: "portable", value: value(), availability });
  }
  assert.deepEqual(classifySyncExtension(native(true, "unknown")), { kind: "local", reason: "unsupported" });
});

test("missing extensions and unsupported producers never imply a deliberate deletion", () => {
  assert.equal(canDeleteSyncExtension(value(), null), false);
  assert.equal(canDeleteSyncExtension(value(), { scope: "absent", catalog: "amo", addonId }), false);
  assert.equal(canDeleteSyncExtension(value(), { scope: "absent", catalog: "amo", addonId, removedByUser: true }), true);
  for (const scope of ["policy", "private", "system", "temporary", "unavailable", "unsupported"]) {
    assert.equal(canDeleteSyncExtension(value(), { ...native(), scope, removedByUser: true }), false);
  }
  assert.equal(canDeleteSyncExtension(value(), { scope: "absent", catalog: "amo", addonId: "other@provider", removedByUser: true }), false);
});

test("new references install automatically and matching native values still require persistence", () => {
  assert.deepEqual(planSyncExtension(incoming(value()), null, null), { status: "apply", desired: value() });
  assert.deepEqual(planSyncExtension(incoming(value(false)), null, null), { status: "apply", desired: value(false) });
  assert.deepEqual(planSyncExtension(incoming(value()), null, native()), { status: "persist", desired: value() });
  assert.deepEqual(planSyncExtension(deleted, incoming(value()), null), { status: "persist", desired: null });
});

test("unchanged server references preserve a local uninstall or enablement edit", () => {
  assert.deepEqual(planSyncExtension(incoming(value()), incoming(value()), null), { status: "keep_local" });
  assert.deepEqual(planSyncExtension(incoming(value()), incoming(value()), native(false)), { status: "keep_local" });
  assert.deepEqual(planSyncExtension(deleted, incoming(value()), native(false)), { status: "conflict", reason: "extension_changed" });
  assert.deepEqual(planSyncExtension(incoming(value(false)), incoming(value()), null), { status: "conflict", reason: "extension_changed" });
  assert.deepEqual(planSyncExtension(deleted, incoming(value()), native(false), { resolution: { choice: "remote" } }),
    { status: "apply", desired: null });
});

test("explicit conflict resolution cannot bypass local policy or platform availability", () => {
  for (const scope of ["policy", "private", "system", "temporary", "unavailable"]) {
    assert.deepEqual(planSyncExtension(incoming(value()), null, { ...native(), scope }, { resolution: { choice: "remote" } }),
      { status: "deferred", reason: `extension_${scope}` });
  }
  for (const availability of ["incompatible", "blocked"]) {
    assert.deepEqual(planSyncExtension(incoming(value()), null, native(true, availability), { resolution: { choice: "remote" } }),
      { status: "deferred", reason: `extension_${availability}` });
  }
});

test("unverified removals and mixed identities cannot uninstall another extension", () => {
  assert.deepEqual(planSyncExtension({ ...deleted, authenticatedSchema: 1 }, incoming(value()), native()),
    { status: "conflict", reason: "unverified_deletion" });
  assert.throws(() => planSyncExtension(incoming(value()), incoming({ ...value(), addonId: "other@provider" }), native()),
    { code: "invalid_record" });
  assert.throws(() => planSyncExtension(deleted, incoming(value()), { ...native(), addonId: "other@provider" }),
    { code: "invalid_record" });
});

test("extension identity is account-bound, excludes enabled state and erases temporary bytes", async () => {
  let buffer;
  const derive = key => async (collection, bytes) => {
    assert.equal(collection, "extensions");
    assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)), [1, "extension", "amo", addonId]);
    buffer = bytes;
    return createHmac("sha256", key).update(collection).update(bytes).digest("hex");
  };
  const a = await deriveSyncExtensionId("amo", addonId, derive("account-a"));
  assert.match(a, /^e1:[a-f0-9]{64}$/);
  assert.ok(buffer.every(byte => byte === 0));
  assert.equal(await deriveSyncExtensionId("amo", addonId, derive("account-a")), a);
  assert.notEqual(await deriveSyncExtensionId("amo", addonId, derive("account-b")), a);
  await assert.rejects(deriveSyncExtensionId("amo", addonId, async (_collection, bytes) => {
    buffer = bytes;
    throw new Error("derivation_failed");
  }), /derivation_failed/);
  assert.ok(buffer.every(byte => byte === 0));
  await assert.rejects(deriveSyncExtensionId("amo", addonId, async () => "wrong"), { code: "invalid_record" });
});

test("a durable user uninstall conflicts with a new remote reference even without an old mirror", () => {
  const removed = { catalog: "amo", addonId, scope: "absent", removedByUser: true, removalToken: "explicit local receipt" };
  assert.deepEqual(planSyncExtension(incoming(value()), null, removed), { status: "conflict", reason: "extension_changed" });
  assert.deepEqual(planSyncExtension(incoming(value()), null, removed, { resolution: { choice: "remote" } }),
    { status: "apply", desired: value() });
});
