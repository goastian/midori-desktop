import test from "node:test";
import assert from "node:assert/strict";
import { MidoriSyncExtensionSettings } from "../src/browser/components/sync/MidoriSyncExtensionSettings.sys.mjs";
import { MidoriSyncRecordTracker } from "../src/browser/components/sync/MidoriSyncPasswordTracker.sys.mjs";
import { addonId, bundle, incoming, deleted, fixture } from "./sync-extension-settings-fixtures.mjs";


test("complete configuration waits for all parts and a saved plan replays without another write", async () => {
  const remote = await bundle({ theme: "green", values: Array(25000).fill(1e20) });
  assert.ok(remote.parts.length > 1);
  const f = fixture(); const plan = await f.adapter.prepare(incoming(remote.manifest));
  assert.equal(JSON.stringify(plan).includes("100000000000000000000"), false);
  f.stage({ parts: remote.parts.slice(0, -1) });
  assert.deepEqual(await f.adapter.applyPrepared(plan), { status: "deferred", reason: "extension_settings_parts_missing" });
  assert.equal(f.writes, 0);
  f.stage(remote);
  assert.deepEqual(await f.adapter.applyPrepared(plan), { status: "applied" });
  assert.equal(f.writes, 1);
  f.adapter.close(); f.adapter = new MidoriSyncExtensionSettings(f.options);
  assert.deepEqual(await f.adapter.applyPrepared(structuredClone(plan)), { status: "applied" });
  assert.equal(f.writes, 1);
  assert.equal(f.barriers, 1);
  assert.deepEqual(f.data(), { theme: "green", values: Array(25000).fill(1e20) });
});

test("capture places extension-scoped parts before its manifest and checks native persistence", async () => {
  const f = fixture({ theme: "green" }); f.set({ other: true }, "other@example.invalid");
  const ids = await f.adapter.listIds();
  assert.equal(ids.length, 4);
  assert.ok(ids[0].startsWith("xp1:")); assert.ok(ids[1].startsWith("xm1:"));
  assert.ok(ids[2].startsWith("xp1:")); assert.ok(ids[3].startsWith("xm1:"));
  assert.equal(new Set(ids).size, 4);
  for (const id of ids) { assert.ok(await f.adapter.read(id)); await f.adapter.flush(); }
  assert.equal(f.barriers, 4);
  const manifest = await f.adapter.read(ids[1]);
  assert.equal(f.adapter.matchesLocal(ids[1], manifest, structuredClone(manifest)), true);
  f.set({ edit: true });
  await assert.rejects(f.adapter.flush(), { code: "native_write_failed" });
});

test("parts remain immutable and cannot manufacture deletion after an extension edit", async () => {
  const old = await bundle({ old: true }); const f = fixture({ newer: true }); f.stage(old, true);
  assert.deepEqual(await f.adapter.read(old.parts[0].id), old.parts[0].value);
  assert.equal(await f.adapter.canDelete(old.parts[0].id, old.parts[0].value), false);
  assert.deepEqual(await f.adapter.apply(incoming(old.parts[0])), { status: "applied" });
  assert.equal(f.writes, 0);
});

test("disjoint keys and deliberate key removals merge against the authenticated base", async () => {
  const base = await bundle({ left: 1, right: 1, remove: true });
  const remote = await bundle({ left: 1, right: 2 });
  const f = fixture({ left: 2, right: 1, remove: true, local: null }); f.stage(base); f.stage(remote);
  const plan = await f.adapter.prepare(incoming(remote.manifest), incoming(base.manifest));
  assert.deepEqual(await f.adapter.applyPrepared(plan), { status: "applied" });
  assert.deepEqual(f.data(), { left: 2, right: 2, local: null });
  f.adapter.close(); f.adapter = new MidoriSyncExtensionSettings(f.options);
  assert.deepEqual(await f.adapter.applyPrepared(plan), { status: "applied" });
  assert.equal(f.writes, 1, "The persisted original state reproduces the same merged target after restart");
});

test("same-key edits, nested edits and delete-versus-edit keep both versions for review", async () => {
  for (const [local, remoteData] of [[{ key: 2 }, { key: 3 }], [{ key: { a: 2 } }, { key: { b: 3 } }], [{}, { key: 3 }]]) {
    const base = await bundle({ key: 1 }); const remote = await bundle(remoteData);
    const f = fixture(local); f.stage(base); f.stage(remote);
    assert.deepEqual(await f.adapter.apply(incoming(remote.manifest), incoming(base.manifest)),
      { status: "conflict", reason: "extension_settings_changed" });
    assert.deepEqual(f.data(), local); assert.equal(f.writes, 0);
  }
});

test("an unknown baseline preserves populated local configurations", async () => {
  const remote = await bundle({ remote: true }); const f = fixture({ local: true }); f.stage(remote);
  assert.deepEqual(await f.adapter.apply(incoming(remote.manifest)), { status: "conflict", reason: "extension_settings_changed" });
  assert.deepEqual(f.data(), { local: true });
});

test("unchanged remote content leaves local edits available for later capture", async () => {
  const remote = await bundle({ original: true }); const f = fixture({ local: true }); f.stage(remote);
  assert.deepEqual(await f.adapter.apply(incoming(remote.manifest), incoming(remote.manifest)), { status: "applied" });
  assert.deepEqual(f.data(), { local: true }); assert.equal(f.writes, 0);
});

test("missing base parts defer a merge without clearing the namespace", async () => {
  const base = await bundle({ one: 1, two: 1 }); const remote = await bundle({ one: 1, two: 2 });
  const f = fixture({ one: 2, two: 1 }); f.stage(remote);
  assert.deepEqual(await f.adapter.apply(incoming(remote.manifest), incoming(base.manifest)),
    { status: "deferred", reason: "extension_settings_base_missing" });
  assert.equal(f.writes, 0);
  f.stage(base);
  assert.deepEqual(await f.adapter.apply(incoming(remote.manifest), incoming(base.manifest)), { status: "applied" });
});

test("authenticated deletion clears only the scoped settings and is not recaptured as an empty object", async () => {
  const base = await bundle({ old: true }); const f = fixture({ old: true }); f.stage(base, true);
  f.set({ keep: true }, "other@example.invalid");
  const removal = deleted(base.manifest.id);
  assert.deepEqual(await f.adapter.apply(removal, incoming(base.manifest)), { status: "applied" });
  assert.deepEqual(f.data(), {}); assert.deepEqual(f.data("other@example.invalid"), { keep: true });
  f.records.set(removal.id, { remote: removal });
  assert.equal(await f.adapter.read(removal.id), null);
  assert.equal((await f.adapter.listIds()).includes(removal.id), false);
  const newer = fixture({ edited: true }); newer.stage(base);
  assert.deepEqual(await newer.adapter.apply(removal, incoming(base.manifest)),
    { status: "conflict", reason: "extension_settings_changed" });
  assert.deepEqual(newer.data(), { edited: true });
});

test("legacy unauthenticated deletions cannot clear manifests or parts", async () => {
  const base = await bundle({ old: true }); const f = fixture({ old: true }); f.stage(base);
  for (const id of [base.manifest.id, base.parts[0].id]) {
    assert.deepEqual(await f.adapter.apply({ ...deleted(id), authenticatedSchema: 1 }, incoming(base.manifest)),
      { status: "conflict", reason: "unverified_deletion" });
  }
  assert.equal(f.writes, 0);
});

test("an explicit empty object remains a portable complete value", async () => {
  const remote = await bundle({}); const base = await bundle({ old: true });
  const f = fixture({ old: true }); f.stage(remote); f.stage(base);
  assert.deepEqual(await f.adapter.apply(incoming(remote.manifest), incoming(base.manifest)), { status: "applied" });
  f.records.set(remote.manifest.id, { remote: incoming(remote.manifest) });
  assert.deepEqual(await f.adapter.read(remote.manifest.id), remote.manifest.value);
  assert.ok((await f.adapter.listIds()).includes(remote.manifest.id));
});

test("user removal permits a tombstone while absent, constrained and failed inventories do not", async () => {
  const base = await bundle({ old: true }); const f = fixture();
  for (const status of ["cached", "local", "removed"]) {
    f.set(status === "cached" ? {} : null, addonId, { status, reason: status === "local" ? "extension_settings_policy" : null });
    assert.equal(await f.adapter.read(base.manifest.id, base.manifest.value), null);
    assert.equal(await f.adapter.canDelete(base.manifest.id, base.manifest.value), status === "removed");
    if (status === "local") {
      assert.equal(f.adapter.matchesLocal(base.manifest.id, null, base.manifest.value), true);
    }
  }
  f.inventory = {};
  await assert.rejects(f.adapter.listIds(), { code: "invalid_adapter_result" });
  f.readError = true;
  await assert.rejects(f.adapter.canDelete(base.manifest.id, base.manifest.value), { code: "native_read_failed" });
});

test("unknown empty cached namespaces neither publish an empty replacement nor infer removed keys", async () => {
  const base = await bundle({ previous: true }); const remote = await bundle({ previous: true, remote: true });
  const f = fixture(); f.set({}, addonId, { status: "cached", native: null });
  assert.deepEqual(await f.adapter.listIds(), []);
  assert.equal(await f.adapter.read(base.manifest.id, base.manifest.value), null);
  assert.equal(f.adapter.matchesLocal(base.manifest.id, null, base.manifest.value), true);
  f.stage(base); f.stage(remote);
  assert.deepEqual(await f.adapter.apply(incoming(remote.manifest), incoming(base.manifest)), { status: "applied" });
  assert.deepEqual(f.data(), { previous: true, remote: true });
});

test("policy constraints defer and user-uninstalled settings require reinstall before restoring", async () => {
  const remote = await bundle({ remote: true }); const f = fixture(); f.stage(remote);
  f.set(null, addonId, { status: "local", reason: "extension_settings_policy", raw: null });
  const plan = await f.adapter.prepare(incoming(remote.manifest));
  assert.deepEqual(await f.adapter.applyPrepared(plan), { status: "deferred", reason: "extension_settings_policy" });
  f.set(null, addonId, { status: "removed", source: "user" });
  assert.deepEqual(await f.adapter.apply(incoming(remote.manifest)), { status: "deferred", reason: "extension_settings_uninstalled" });
  assert.equal(f.writes, 0);
});

test("edits and installation identity changes after planning defeat the guarded native write", async () => {
  const remote = await bundle({ remote: true }); const f = fixture(); f.stage(remote);
  const plan = await f.adapter.prepare(incoming(remote.manifest)); f.set({ user: true });
  assert.deepEqual(await f.adapter.applyPrepared(plan), { status: "deferred", reason: "extension_settings_local_changed" });
  f.set({}); const next = await f.adapter.prepare(incoming(remote.manifest));
  f.states.get(addonId).native.instance = "replacement";
  assert.deepEqual(await f.adapter.applyPrepared(next), { status: "deferred", reason: "extension_settings_local_changed" });
  assert.equal(f.writes, 0);
});

test("a lost post-commit result replays through a checked persistence barrier", async () => {
  const remote = await bundle({ remote: true }); const f = fixture(); f.stage(remote);
  const plan = await f.adapter.prepare(incoming(remote.manifest)); f.afterCommitError = true;
  await assert.rejects(f.adapter.applyPrepared(plan), { code: "native_write_failed" });
  assert.deepEqual(f.data(), { remote: true }); assert.equal(f.writes, 1);
  f.afterCommitError = false; f.adapter.close(); f.adapter = new MidoriSyncExtensionSettings(f.options);
  f.persistStale = true;
  assert.deepEqual(await f.adapter.applyPrepared(plan), { status: "deferred", reason: "extension_settings_local_changed" });
  f.persistStale = false;
  assert.deepEqual(await f.adapter.applyPrepared(plan), { status: "applied" });
  assert.equal(f.writes, 1); assert.equal(f.barriers, 2);
});

test("quota rejection leaves the guarded application pending", async () => {
  const remote = await bundle({ remote: true }); const f = fixture(); f.stage(remote); f.quota = true;
  assert.deepEqual(await f.adapter.apply(incoming(remote.manifest)), { status: "deferred", reason: "extension_settings_quota" });
  assert.deepEqual(f.data(), {}); assert.equal(f.writes, 0);
});

test("explicit remote review still checks changes after preview and before commit", async () => {
  const remote = await bundle({ remote: true }); const f = fixture({ local: true }); f.stage(remote);
  await f.adapter.read(remote.manifest.id, remote.manifest.value);
  f.set({ editedAfterPreview: true });
  const changed = await f.adapter.prepare(incoming(remote.manifest), null, { resolution: { choice: "remote" } });
  assert.deepEqual(await f.adapter.applyPrepared(changed), { status: "conflict", reason: "extension_settings_local_changed" });
  await f.adapter.read(remote.manifest.id, remote.manifest.value);
  const reviewed = await f.adapter.prepare(incoming(remote.manifest), null, { resolution: { choice: "remote" } });
  assert.deepEqual(await f.adapter.applyPrepared(reviewed), { status: "applied" });
  assert.deepEqual(f.data(), { remote: true });
});

test("adoption requires matching native data and a checked barrier; scoped parts can be staged independently", async () => {
  const remote = await bundle({ same: true }); const f = fixture({ same: true });
  assert.equal(await f.adapter.canAdoptRecord(incoming(remote.parts[0])), true);
  assert.equal(await f.adapter.canAdoptRecord(incoming(remote.manifest)), true);
  assert.equal(f.barriers, 1);
  f.persistStale = true;
  assert.equal(await f.adapter.canAdoptRecord(incoming(remote.manifest)), false);
  f.set({ different: true });
  assert.equal(await f.adapter.canAdoptRecord(incoming(remote.manifest)), false);
  assert.equal(await f.adapter.canAdoptRecord({ ...incoming(remote.parts[0]), authenticatedSchema: 1 }), false);
});

test("tampered or foreign parts never mutate native data", async () => {
  const remote = await bundle({ remote: true }); const f = fixture();
  f.stage(remote);
  f.records.get(remote.parts[0].id).remote.value.addonId = "other@example.invalid";
  await assert.rejects(f.adapter.apply(incoming(remote.manifest)), { code: "invalid_record" });
  const foreign = await bundle({ remote: true }, addonId, "other public account");
  await assert.rejects(f.adapter.validate(foreign.manifest.id, foreign.manifest.value), { code: "invalid_record" });
  assert.equal(f.writes, 0);
});

test("observers request inventories for changed namespaces and detach on close", async () => {
  const f = fixture(); const initial = await f.adapter.listIds(); f.set({ changed: true });
  for (const listener of f.listeners) { listener({ catalog: "amo", addonId }); }
  assert.equal(f.hints, 1); assert.notDeepEqual(await f.adapter.listIds(), initial);
  f.adapter.close(); assert.equal(f.listeners.size, 0);
  await assert.rejects(f.adapter.listIds(), { code: "cancelled" });
});

test("a change while the async inventory is loading schedules another bounded capture", async () => {
  let changed;
  let scans = 0;
  const captured = [];
  const adapter = {
    observe(listener) { changed = listener; return () => { changed = null; }; },
    async listIds() {
      scans++;
      if (scans === 1) { changed({ rescan: true }); return ["previous-part"]; }
      return ["current-part", "current-manifest"];
    },
  };
  const tracker = new MidoriSyncRecordTracker({ adapter, engine: {
    async capture(id) { captured.push(id); return { status: "unchanged" }; },
    async capturePage() { return { results: [], nextAfter: null }; },
  } });
  assert.equal((await tracker.run()).more, true, "A concurrent native event survives the completed inventory");
  assert.equal((await tracker.run()).more, false);
  assert.equal(scans, 2);
  assert.deepEqual(captured, ["previous-part", "current-part", "current-manifest"]);
  tracker.close(); assert.equal(changed, null);
});
