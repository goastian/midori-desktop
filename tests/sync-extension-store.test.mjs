import test from "node:test";
import assert from "node:assert/strict";
import { isSyncExtensionDownload } from "../src/browser/components/sync/MidoriSyncExtensionStore.sys.mjs";
import { extensionStoreFixture, addonId, value, gate, turn } from "./sync-extension-fixtures.mjs";

const read = f => f.store.read("amo", addonId);
const write = async (f, desired, expected = undefined) => f.store.write({ catalog: "amo", addonId, desired,
  expected: expected === undefined ? await read(f) : expected });

test("native inventory distinguishes runtime blocks, policies, unsigned and device-local extensions", async () => {
  const f = extensionStoreFixture();
  const addon = f.makeAddon(); f.installed.set(addonId, addon);
  assert.equal((await read(f)).scope, "user");
  addon.appDisabled = true;
  assert.equal((await read(f)).enabled, true);
  assert.equal((await read(f)).availability, "blocked");
  addon.isCompatible = false;
  assert.equal((await read(f)).availability, "incompatible");
  for (const [patch, scope] of [[{ signedState: 1 }, "unsupported"], [{ temporarilyInstalled: true }, "temporary"],
    [{ isSystem: true }, "system"], [{ permissions: 0 }, "policy"]]) {
    f.installed.set(addonId, f.makeAddon(addonId, patch));
    assert.equal((await read(f)).scope, scope);
  }
  f.installed.set(addonId, f.makeAddon()); f.managed = true;
  assert.equal((await read(f)).scope, "policy");
});

test("a changed native instance defeats a prepared operation without overwriting its user choice", async () => {
  const f = extensionStoreFixture(); f.installed.set(addonId, f.makeAddon());
  const expected = await read(f);
  f.installed.set(addonId, f.makeAddon(addonId, { syncGUID: "replacement" }));
  assert.deepEqual(await write(f, value(false), expected), { status: "deferred", reason: "extension_local_changed" });
  assert.equal(f.calls.length, 0);
});

test("native state is persisted in both files and a failed startup barrier can retry without a second edit", async () => {
  const f = extensionStoreFixture(); f.installed.set(addonId, f.makeAddon());
  const expected = await read(f);
  f.failStartup = true;
  await assert.rejects(write(f, value(false), expected), { code: "native_write_failed" });
  assert.equal((await read(f)).enabled, false);
  f.failStartup = false;
  assert.deepEqual(await write(f, value(false), expected), { status: "applied" });
  assert.equal(f.calls.filter(call => call === "disable").length, 1);
  assert.deepEqual(f.calls.slice(-4), ["track", "database", "startup", "preferences"]);
});

test("received removals carry Sync provenance and absence alone never creates a user receipt", async () => {
  const f = extensionStoreFixture();
  assert.equal(await read(f), null);
  assert.deepEqual(await write(f, null), { status: "applied" });
  assert.equal(f.tracked.size, 0);
  f.installed.set(addonId, f.makeAddon());
  await f.store.persist("amo", addonId, await read(f));
  assert.deepEqual(await write(f, null), { status: "applied" });
  assert.equal((await read(f)).removedByUser, false);
  assert.ok(f.calls.includes("uninstall:sync"));
});

test("catalog downloads accept only official HTTPS origins and download paths", () => {
  for (const url of ["https://addons.mozilla.org/firefox/downloads/file/1/test.xpi", "https://addons.mozilla.net/user-media/addons/1/test.xpi"]) {
    assert.ok(isSyncExtensionDownload(url));
  }
  for (const url of ["http://addons.mozilla.org/firefox/downloads/file/1/a.xpi", "https://addons.mozilla.org.evil.invalid/firefox/downloads/a.xpi",
    "https://user@addons.mozilla.org/firefox/downloads/a.xpi", "https://addons.mozilla.org:8443/firefox/downloads/a.xpi",
    "file:///tmp/addon.xpi", "https://addons.mozilla.org/redirect?url=https://evil.invalid/a.xpi"]) {
    assert.equal(isSyncExtensionDownload(url), false);
  }
});

test("catalog transport errors remain retryable while invalid responses and cancellation keep their own semantics", async () => {
  const f = extensionStoreFixture();
  const controller = new AbortController();
  const options = { desired: value(), expected: null, signal: controller.signal, beforePermissionPrompt: async () => {} };
  f.catalogGate = Promise.reject(new Error("synthetic offline catalog"));
  assert.deepEqual(await f.store.install(options), { status: "deferred", reason: "extension_download_failed" });
  assert.equal(f.installed.size, 0);
  assert.ok(!f.calls.includes("native-prompt"));
  f.catalogGate = null;
  f.results = null;
  await assert.rejects(f.store.install(options), { code: "invalid_adapter_result" });
  controller.abort();
  await assert.rejects(f.store.install(options), { code: "cancelled" });
});

test("automatic installation binds ID and type, asks native permissions and persists a disabled reference", async () => {
  const f = extensionStoreFixture();
  const result = await f.store.install({ desired: value(false), expected: null, signal: new AbortController().signal,
    beforePermissionPrompt: async () => { f.calls.push("durable-permission-checkpoint"); } });
  assert.deepEqual(result, { status: "applied" });
  assert.equal(f.installOptions.id, addonId);
  assert.equal(f.installOptions.type, "extension");
  assert.deepEqual(f.catalogIDs, [addonId]);
  assert.equal(f.promptBrowser, f.browser);
  assert.ok(f.calls.indexOf("durable-permission-checkpoint") < f.calls.indexOf("native-prompt"));
  assert.ok(f.calls.indexOf("disable") < f.calls.indexOf("track"));
  assert.deepEqual(f.calls.slice(-4), ["track", "database", "startup", "preferences"]);
  assert.equal((await read(f)).enabled, false);
});

test("permission denial cannot install or create native Sync tracking", async () => {
  const f = extensionStoreFixture(); f.approve = false;
  assert.deepEqual(await f.store.install({ desired: value(), expected: null, signal: new AbortController().signal,
    beforePermissionPrompt: async () => {} }), { status: "deferred", reason: "extension_permission_declined" });
  assert.equal(f.installed.size, 0); assert.equal(f.tracked.size, 0);
});

test("a signature exemption cannot pass a catalog installation even when the browser permits unsigned add-ons", async () => {
  const f = extensionStoreFixture(); f.downloadedSignedState = 1;
  assert.deepEqual(await f.store.install({ desired: value(), expected: null, signal: new AbortController().signal,
    beforePermissionPrompt: async () => { assert.fail("Unsigned metadata must not reach the permission prompt"); } }),
  { status: "deferred", reason: "extension_unavailable" });
  assert.equal(f.installed.size, 0); assert.equal(f.tracked.size, 0);
});

test("cancellation or a local installation during a catalog lookup cannot start an install", async () => {
  for (const cancel of [true, false]) {
    const f = extensionStoreFixture(); const catalog = gate(); f.catalogGate = catalog.promise;
    const controller = new AbortController();
    const pending = f.store.install({ desired: value(), expected: null, signal: controller.signal, beforePermissionPrompt: async () => {} });
    await turn();
    if (cancel) { controller.abort(); } else { f.installed.set(addonId, f.makeAddon()); }
    catalog.resolve();
    await assert.rejects(pending, { code: cancel ? "cancelled" : "extension_local_changed" });
    assert.ok(!f.calls.includes("native-installer"));
  }
});

test("a policy or missing normal window defers without a catalog request", async () => {
  for (const reason of ["extension_policy", "extension_window_required"]) {
    const f = extensionStoreFixture(); f.managed = reason === "extension_policy"; f.browser = null;
    assert.deepEqual(await f.store.install({ desired: value(), expected: null, signal: new AbortController().signal,
      beforePermissionPrompt: async () => {} }), { status: "deferred", reason });
    assert.equal(f.calls.length, 0);
  }
});

test("catalog identity and download origin mismatches never enter the native installer", async () => {
  for (const patch of [{ id: "different@provider" }, { type: "theme" }, { sourceURI: { spec: "https://untrusted.invalid/a.xpi" } }]) {
    const f = extensionStoreFixture(); f.results[0] = { ...f.results[0], ...patch };
    assert.deepEqual(await f.store.install({ desired: value(), expected: null, signal: new AbortController().signal,
      beforePermissionPrompt: async () => {} }), { status: "deferred", reason: "extension_unavailable" });
    assert.ok(!f.calls.includes("prepare"));
  }
});

test("a failing final native comparison vetoes installation instead of escaping through a native listener", async () => {
  const f = extensionStoreFixture();
  f.database.getSyncAddonByID = () => { throw new Error("unreadable native snapshot"); };
  await assert.rejects(f.store.install({ desired: value(), expected: null, signal: new AbortController().signal,
    beforePermissionPrompt: async () => {} }), /unreadable native snapshot/);
  assert.equal(f.installed.size, 0);
});

test("failure to save the UUID preference rejects persistence even after both native addon files succeed", async () => {
  const f = extensionStoreFixture(); f.installed.set(addonId, f.makeAddon()); f.failPreferences = true;
  await assert.rejects(write(f, value(false)), { code: "native_write_failed" });
  assert.deepEqual(f.calls.slice(-4), ["track", "database", "startup", "preferences"]);
  f.failPreferences = false;
  assert.deepEqual(await write(f, value(false)), { status: "applied" });
  assert.equal(f.calls.filter(call => call === "disable").length, 1);
});

test("pausing cancels a catalog lookup immediately without waiting for its HTTP reply", async () => {
  const f = extensionStoreFixture(); const catalog = gate(); f.catalogGate = catalog.promise;
  const controller = new AbortController();
  let settled = false;
  const pending = f.store.install({ desired: value(), expected: null, signal: controller.signal, beforePermissionPrompt: async () => {} })
    .then(() => { settled = true; return null; }, error => { settled = true; return error.code; });
  try {
    await turn(); controller.abort(); await turn();
    assert.equal(settled, true, "A slow catalog must not retain a cancelled installation job");
    assert.equal(await pending, "cancelled");
    assert.ok(!f.calls.includes("native-installer"));
  } finally { catalog.resolve(); await pending; }
});

test("an incompatible or blocked download never reaches native permission confirmation", async () => {
  for (const [properties, reason] of [[{ isCompatible: false }, "extension_incompatible"], [{ appDisabled: true }, "extension_blocked"]]) {
    const f = extensionStoreFixture(); f.downloadedProperties = properties;
    assert.deepEqual(await f.store.install({ desired: value(), expected: null, signal: new AbortController().signal,
      beforePermissionPrompt: async () => { assert.fail("An incompatible download must not prompt"); } }), { status: "deferred", reason });
    assert.equal(f.installed.size, 0);
    assert.equal(f.tracked.size, 0);
  }
});

test("a policy applied while the native permission prompt is open vetoes installation", async () => {
  const f = extensionStoreFixture(); f.beforePrompt = async () => { f.managed = true; };
  assert.deepEqual(await f.store.install({ desired: value(), expected: null, signal: new AbortController().signal,
    beforePermissionPrompt: async () => {} }), { status: "deferred", reason: "extension_policy" });
  assert.equal(f.installed.size, 0);
  assert.equal((await read(f)).scope, "policy", "An uninstalled policy-managed reference is a local constraint, not an absence");
});

test("a new runtime block during native confirmation prevents installing the downloaded package", async () => {
  const f = extensionStoreFixture(); f.beforePrompt = async () => { f.install.addon.appDisabled = true; };
  assert.deepEqual(await f.store.install({ desired: value(), expected: null, signal: new AbortController().signal,
    beforePermissionPrompt: async () => {} }), { status: "deferred", reason: "extension_blocked" });
  assert.equal(f.installed.size, 0);
});

test("durable local removal clears legacy data while a received Sync removal preserves it", async () => {
  for (const source of ["user", "policy", "unknown", "sync"]) {
    const f = extensionStoreFixture();
    f.tracked.set(addonId, { source, token: `receipt:${source}` });
    f.localData.set(addonId, { retained: "local data" });
    assert.equal(await f.store.persist("amo", addonId, await read(f)), true);
    assert.equal(f.localData.has(addonId), source === "sync");
    assert.equal(f.calls.includes("storage-removal"), source !== "sync");
  }
});

test("a settings-only metadata barrier preserves local storage and optional grants for absent extensions", async () => {
  for (const source of [null, "user", "sync"]) {
    const f = extensionStoreFixture();
    if (source !== null) { f.tracked.set(addonId, { source, token: `receipt:${source}` }); }
    f.localData.set(addonId, { retained: "local data" });
    f.grants.set(addonId, ["clipboardRead"]);
    assert.equal(await f.store.persist("amo", addonId, await read(f), { preserveData: true }), true);
    assert.deepEqual(f.localData.get(addonId), { retained: "local data" });
    assert.deepEqual(f.grants.get(addonId), ["clipboardRead"]);
    assert.ok(!f.calls.includes("storage-removal") && !f.calls.includes("permission-removal"));
    assert.deepEqual(f.calls.slice(-3), ["database", "startup", "preferences"]);
  }
});

test("a reinstall during legacy-file loading prevents stale cleanup and publication", async () => {
  const f = extensionStoreFixture();
  f.tracked.set(addonId, { source: "user", token: "old receipt" });
  f.localData.set(addonId, { retained: "new data" });
  f.beforeRemovalPersist = async () => {
    f.installed.set(addonId, f.makeAddon()); f.tracked.set(addonId, null);
  };
  assert.equal(await f.store.persist("amo", addonId, await read(f)), false);
  assert.deepEqual(f.localData.get(addonId), { retained: "new data" });
  assert.ok(!f.calls.includes("database"));
});

test("a failed native storage deletion rejects persistence and retries the same receipt", async () => {
  const f = extensionStoreFixture();
  f.tracked.set(addonId, { source: "user", token: "durable receipt" });
  f.localData.set(addonId, { retained: "old data" }); f.failRemoval = true;
  const expected = await read(f);
  await assert.rejects(f.store.persist("amo", addonId, expected), { code: "native_write_failed" });
  assert.ok(!f.calls.includes("database"));
  f.failRemoval = false;
  assert.equal(await f.store.persist("amo", addonId, expected), true);
  assert.equal(f.localData.has(addonId), false);
});

test("a new signed installation cannot inherit optional grants from an earlier uninstalled extension", async () => {
  const f = extensionStoreFixture(); f.grants.set(addonId, ["clipboardRead"]);
  f.beforePrompt = async () => { assert.equal(f.grants.has(addonId), false); };
  assert.deepEqual(await f.store.install({ desired: value(), expected: null, signal: new AbortController().signal,
    beforePermissionPrompt: async () => {} }), { status: "applied" });
  assert.ok(f.calls.indexOf("permission-removal") < f.calls.indexOf("native-prompt"));
});

test("an optional-permission persistence failure blocks an unchanged extension and can be retried", async () => {
  const f = extensionStoreFixture(); f.installed.set(addonId, f.makeAddon());
  f.failPermissionWrite = true;
  const expected = await read(f);
  await assert.rejects(f.store.persist("amo", addonId, expected), { code: "native_write_failed" });
  assert.ok(!f.calls.includes("database"));
  f.failPermissionWrite = false;
  assert.equal(await f.store.persist("amo", addonId, expected), true);
});
