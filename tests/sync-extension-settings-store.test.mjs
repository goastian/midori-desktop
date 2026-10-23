import test from "node:test";
import assert from "node:assert/strict";
import { createSyncExtensionSettingsStore } from "../src/browser/components/sync/MidoriSyncExtensionSettingsStore.sys.mjs";

const addonId = "@settings-extension";
const native = () => ({ catalog: "amo", addonId, scope: "user", enabled: true, availability: "ready",
  instance: "original", version: "1", removalToken: null });
function fixture() {
  const f = { addons: new Map([[addonId, native()]]), data: new Map(), sources: new Map(), calls: [],
    addonListeners: new Set(), storageListeners: new Set(), permissionListeners: new Set(), allowed: true };
  f.references = {
    async read(_catalog, id) { return structuredClone(f.addons.get(id) ?? null); },
    async persist(_catalog, id, expected, options) {
      assert.deepEqual(options, { preserveData: true });
      f.calls.push("reference-barrier");
      await f.beforeReferencePersist?.();
      if (f.failReference) { throw new Error("synthetic metadata write failure"); }
      return JSON.stringify(f.addons.get(id) ?? null) === JSON.stringify(expected);
    },
    async list() { return f.inventory ?? [...f.addons.values()]; },
    observe(listener) { f.addonListeners.add(listener); return () => f.addonListeners.delete(listener); },
  };
  f.store = createSyncExtensionSettingsStore({ references: f.references,
    storage: {
      async readSyncSnapshot(id) {
        f.calls.push("read-settings");
        if (f.failRead) { throw new Error("synthetic native read failure"); }
        return f.data.get(id) ?? "{}";
      },
      async replaceSyncSnapshot(id, expected, desired) {
        f.calls.push("native-transaction");
        await f.beforeCompare?.();
        if ((f.data.get(id) ?? "{}") !== expected) { return false; }
        if (f.failQuota) { throw Object.assign(new Error("quota"), { code: "quota" }); }
        if (f.failWrite) { throw new Error("synthetic native SQL failure"); }
        f.data.set(id, f.nativeEncoding ? f.nativeEncoding(desired) : desired);
        return true;
      },
    },
    observers: { addObserver(listener) { f.storageListeners.add(listener); }, removeObserver(listener) { f.storageListeners.delete(listener); } },
    permissions: { addListener(listener) { f.permissionListeners.add(listener); }, removeListener(listener) { f.permissionListeners.delete(listener); } },
    hasPermission: async () => f.allowed,
    removalSource: id => f.sources.get(id) ?? null,
    isQuotaError: error => error.code === "quota",
  });
  f.read = () => f.store.read("amo", addonId);
  f.write = async (desired, expected = undefined) => f.store.write({ catalog: "amo", addonId, desired,
    expected: expected === undefined ? await f.read() : expected });
  return f;
}

test("capture preserves native numeric serialization and a matching value still crosses both barriers", async () => {
  const f = fixture(); f.data.set(addonId, '{"number":1e+20}');
  const snapshot = await f.read();
  assert.equal(snapshot.status, "portable");
  assert.equal(snapshot.raw, '{"number":1e+20}');
  assert.deepEqual(snapshot.data, { number: 1e20 });
  assert.equal(await f.store.persist("amo", addonId, snapshot), true);
  assert.ok(f.calls.indexOf("native-transaction") < f.calls.indexOf("reference-barrier"));
});

test("unsigned, policy and permission-constrained namespaces are not inspected or replaced", async () => {
  for (const scope of ["unsupported", "policy", "temporary", "system"]) {
    const f = fixture(); f.addons.set(addonId, { ...native(), scope });
    const snapshot = await f.read();
    assert.equal(snapshot.status, "local");
    assert.equal(snapshot.raw, null);
    assert.ok(!f.calls.includes("read-settings"));
    assert.equal((await f.write({ incoming: true }, snapshot)).status, "deferred");
    assert.ok(!f.calls.includes("native-transaction"));
  }
  const f = fixture(); f.allowed = false;
  assert.equal((await f.read()).reason, "extension_settings_permission");
  assert.ok(!f.calls.includes("read-settings"));
});

test("a missing extension can cache its configuration before installation without granting permissions", async () => {
  const f = fixture(); f.addons.clear();
  const snapshot = await f.read();
  assert.equal(snapshot.status, "cached");
  assert.deepEqual(await f.write({ theme: "green" }, snapshot), { status: "applied" });
  assert.equal(f.addons.size, 0);
  f.addons.set(addonId, native());
  assert.deepEqual((await f.read()).data, { theme: "green" });
});

test("replacement removes old keys, preserves null and handles native number formatting semantically", async () => {
  const f = fixture(); f.data.set(addonId, '{"old":true}');
  f.data.set("@other-extension", '{"keep":true}');
  f.nativeEncoding = raw => raw.replaceAll("100000000000000000000", "1e+20");
  assert.deepEqual(await f.write({ number: 1e20, keep: null }), { status: "applied" });
  assert.deepEqual((await f.read()).data, { number: 1e20, keep: null });
  assert.equal(f.data.get("@other-extension"), '{"keep":true}');
});

test("a native edit after planning or during the Rust call defeats the conditional write", async () => {
  const f = fixture(); const snapshot = await f.read();
  f.data.set(addonId, '{"user":"first"}');
  assert.deepEqual(await f.write({ remote: true }, snapshot), { status: "deferred", reason: "extension_settings_local_changed" });
  assert.ok(!f.calls.includes("native-transaction"));
  const fresh = await f.read();
  f.beforeCompare = () => f.data.set(addonId, '{"user":"second"}');
  assert.deepEqual(await f.write({ remote: true }, fresh), { status: "deferred", reason: "extension_settings_local_changed" });
  assert.equal(f.data.get(addonId), '{"user":"second"}');
  assert.ok(!f.calls.includes("reference-barrier"));
});

test("a local installation change prevents application and a later metadata change prevents acknowledgement", async () => {
  const f = fixture(); const snapshot = await f.read();
  f.addons.set(addonId, { ...native(), instance: "replacement" });
  assert.equal((await f.write({ remote: true }, snapshot)).reason, "extension_settings_local_changed");
  assert.ok(!f.calls.includes("native-transaction"));
  f.beforeReferencePersist = () => f.addons.set(addonId, { ...native(), instance: "changed-again" });
  assert.equal((await f.write({ remote: true })).reason, "extension_settings_local_changed");
});

test("native errors retain the old namespace, and an unchanged successful write can retry a failed reference barrier", async () => {
  const f = fixture(); f.data.set(addonId, '{"before":true}');
  const snapshot = await f.read(); f.failWrite = true;
  await assert.rejects(f.write({ after: true }, snapshot), { code: "native_write_failed" });
  assert.equal(f.data.get(addonId), '{"before":true}');
  f.failWrite = false; f.failReference = true;
  await assert.rejects(f.write({ after: true }, snapshot), { code: "native_write_failed" });
  assert.deepEqual((await f.read()).data, { after: true });
  f.failReference = false;
  const committed = await f.read();
  assert.equal(await f.store.persist("amo", addonId, committed), true);
  assert.equal(f.calls.filter(call => call === "native-transaction").length, 3);
});

test("a native quota rejection remains pending and does not replace existing configuration", async () => {
  const f = fixture(); f.failQuota = true;
  assert.deepEqual(await f.write({ incoming: true }), { status: "deferred", reason: "extension_settings_quota" });
  assert.equal(f.data.get(addonId), undefined);
});

test("checked user removal clears pending data, while administrative and unknown absence cannot manufacture deletion", async () => {
  const f = fixture(); f.addons.set(addonId, { catalog: "amo", addonId, scope: "absent", removedByUser: true, removalToken: "user-token" });
  f.sources.set(addonId, "user"); f.data.set(addonId, '{"stale":"before uninstall"}');
  const snapshot = await f.read();
  assert.equal(snapshot.status, "removed");
  assert.equal(snapshot.data, null);
  assert.deepEqual(await f.write({ restore: true }, snapshot), { status: "deferred", reason: "extension_settings_uninstalled" });
  assert.equal(await f.store.persist("amo", addonId, snapshot), true);
  assert.equal(f.data.get(addonId), "{}");
  for (const source of ["policy", "unknown", "sync"]) {
    f.addons.set(addonId, { catalog: "amo", addonId, scope: "absent", removedByUser: false, removalToken: source });
    f.sources.set(addonId, source);
    const current = await f.read();
    assert.equal(current.status, source === "sync" ? "cached" : "local");
  }
});

test("invalid native JSON and lossy integers are local read failures, never inferred empty state", async () => {
  const f = fixture();
  for (const raw of ["null", "[]", "{broken", '{"lossy":9007199254740993}']) {
    f.data.set(addonId, raw);
    await assert.rejects(f.read(), { code: "native_read_failed" });
  }
  assert.ok(!f.calls.includes("native-transaction"));
});

test("observers expose only namespace identity and unsubscribe from data, lifecycle and permissions", () => {
  const f = fixture(); const received = [];
  const stop = f.store.observe(event => received.push(event));
  for (const listener of f.storageListeners) { listener(null, "topic", addonId); listener(null, "topic", "invalid-id"); }
  for (const listener of f.permissionListeners) { listener("change-permissions", { extensionId: addonId }); }
  for (const listener of f.addonListeners) { listener({ catalog: "amo", addonId }); }
  assert.deepEqual(received, Array(3).fill({ catalog: "amo", addonId }));
  stop(); stop();
  assert.equal(f.storageListeners.size + f.permissionListeners.size + f.addonListeners.size, 0);
});
