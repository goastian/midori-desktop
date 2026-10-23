import assert from "node:assert/strict";
import test from "node:test";
import { MidoriSyncPreferences, SYNC_PREFERENCE_SPECS, validateSyncPreference } from
  "../src/browser/components/sync/MidoriSyncPreferences.sys.mjs";

function prefs() {
  const values = new Map();
  const locked = new Set();
  return {
    values, locked,
    prefIsLocked(name) { return locked.has(name); },
    prefHasUserValue(name) { return values.has(name); },
    getBoolPref(name) { return values.get(name); },
    getIntPref(name) { return values.get(name); },
    getStringPref(name) { return values.get(name); },
    setBoolPref(name, value) { values.set(name, value); },
    setIntPref(name, value) { values.set(name, value); },
    setStringPref(name, value) { values.set(name, value); },
    clearUserPref(name) { values.delete(name); },
  };
}

const record = (name, value) => ({ version: 1, name, value });
const remote = value => ({ id: value?.name ?? "midori.workspaces.enabled", deleted: value === null, value });

test("the preference schema accepts only portable names, types and ranges", () => {
  assert.ok(Object.keys(SYNC_PREFERENCE_SPECS).length > 150);
  assert.ok(!Object.keys(SYNC_PREFERENCE_SPECS).some(name => /^(midori\.sync\.|midori\.tabprotect\.|midori\.welcome\.)/.test(name)));
  assert.deepEqual(validateSyncPreference("midori.workspaces.enabled", record("midori.workspaces.enabled", true)),
    record("midori.workspaces.enabled", true));
  for (const name of ["__proto__", "constructor", "toString", "midori.sync.serverConfig", "midori.tabprotect.globalPasswordHash",
    "network.proxy.http", "security.enterprise_roots.enabled", "midori.blocker.filterListUrls"]) {
    assert.throws(() => validateSyncPreference(name, record(name, "secret")), /invalid_record/);
  }
  for (const value of ["true", 1, null]) {
    assert.throws(() => validateSyncPreference("midori.workspaces.enabled",
      record("midori.workspaces.enabled", value)), /invalid_record/);
  }
  assert.throws(() => validateSyncPreference("midori.verticaltabs.width",
    record("midori.verticaltabs.width", 10000)), /invalid_record/);
  assert.throws(() => validateSyncPreference("midori.verticaltabs.position",
    record("midori.verticaltabs.position", "other")), /invalid_record/);
  assert.throws(() => validateSyncPreference("midori.workspaces.enabled",
    { ...record("midori.workspaces.enabled", true), endpoint: "https://bad.invalid" }), /invalid_record/);
});

test("remote preferences apply conditionally and repeat without overwriting local edits", () => {
  const source = prefs();
  const adapter = new MidoriSyncPreferences({ prefs: source });
  const name = "midori.workspaces.enabled";
  const enabled = record(name, true);
  const disabled = record(name, false);
  assert.equal(adapter.read(name), null);
  assert.deepEqual(adapter.apply(remote(enabled)), { status: "applied" });
  assert.equal(source.values.get(name), true);
  assert.deepEqual(adapter.apply(remote(enabled)), { status: "applied" });
  source.values.set(name, false);
  assert.deepEqual(adapter.apply(remote(enabled), remote(enabled)),
    { status: "conflict", reason: "local_preference_changed" });
  assert.equal(source.values.get(name), false);
  assert.deepEqual(adapter.apply(remote(disabled), remote(enabled)), { status: "applied" });
  assert.deepEqual(adapter.apply(remote(null), remote(disabled)), { status: "applied" });
  assert.equal(source.values.has(name), false);
  adapter.close();
  assert.throws(() => adapter.read(name), /cancelled/);
});

test("locked preferences are neither uploaded nor overwritten", () => {
  const source = prefs();
  const adapter = new MidoriSyncPreferences({ prefs: source });
  const name = "midori.verticaltabs.width";
  const base = record(name, 248);
  source.values.set(name, 320);
  source.locked.add(name);
  assert.deepEqual(adapter.read(name, base), base);
  assert.deepEqual(adapter.apply(remote(record(name, 400)), remote(base)),
    { status: "conflict", reason: "preference_locked" });
  assert.equal(source.values.get(name), 320);
  adapter.close();
});

test("string preferences honor lengths and patterns and the allowlist covers the inventory families", () => {
  assert.deepEqual(validateSyncPreference("intl.accept_languages", record("intl.accept_languages", "es-MX, es, en-US")).value,
    "es-MX, es, en-US");
  for (const value of ["<script>", "", "x".repeat(300), "es\u0000"]) {
    assert.throws(() => validateSyncPreference("intl.accept_languages", record("intl.accept_languages", value)), /invalid_record/);
  }
  assert.throws(() => validateSyncPreference("midori.msidebar.shortcut.toggleSidebar",
    record("midori.msidebar.shortcut.toggleSidebar", "a".repeat(9000))), /invalid_record/);
  const names = Object.keys(SYNC_PREFERENCE_SPECS);
  for (const family of ["midori.modblur.", "midori.verticaltabs.", "midori.msidebar.", "privacy.", "browser.urlbar.suggest.",
    "midori.blocker.enabled", "signon.", "network.cookie.cookieBehavior"]) {
    assert.ok(names.some(name => name.startsWith(family)), `${family} is portable`);
  }
  for (const secret of ["network.proxy", "browser.download.dir", "services.sync", "identity.", "app.update"]) {
    assert.ok(!names.some(name => name.startsWith(secret)), `${secret} never syncs`);
  }
});

test("platform-specific, mismatched and locked preferences are preserved on the device", async () => {
  const store = prefs();
  store.getPrefType = name => name === "midori.workspaces.enabled" ? 32 : 0;
  const mac = new MidoriSyncPreferences({ prefs: store, platform: "macosx" });
  const linux = new MidoriSyncPreferences({ prefs: store, platform: "linux" });
  const frame = "midori.modblur.window.frame";
  assert.deepEqual(await mac.apply(remote(record(frame, true))), { status: "applied" });
  assert.equal(store.values.has(frame), false, "A setting that does not exist on macOS is acknowledged without writing it");
  assert.deepEqual(await linux.apply(remote(record(frame, true))), { status: "applied" });
  assert.equal(store.values.get(frame), true);
  store.values.set(frame, false);
  assert.equal(mac.read(frame, record(frame, true)).value, true, "A platform that cannot hold the value keeps the remote base");
  store.values.set("midori.workspaces.enabled", "text");
  assert.equal(linux.read("midori.workspaces.enabled"), null, "A local type mismatch is treated as unset");
  assert.deepEqual(await linux.apply(remote(record("midori.workspaces.enabled", true))), { status: "applied" });
  assert.equal(store.values.get("midori.workspaces.enabled"), "text", "A mismatched local type is never overwritten");
  store.values.delete(frame);
  store.locked.add(frame);
  assert.deepEqual(await linux.apply(remote(record(frame, false))), { status: "conflict", reason: "preference_locked" });
  assert.equal(store.values.has(frame), false, "A policy-locked preference never changes");
});
