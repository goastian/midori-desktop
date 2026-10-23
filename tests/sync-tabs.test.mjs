import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { MidoriSyncTabs, assembleTabsSnapshot, tabsFragmentId, validateTabsRecord, validateTabsSnapshot } from
  "../src/browser/components/sync/MidoriSyncTabs.sys.mjs";

const deviceId = randomUUID();
const NOW = Date.parse("2026-10-02T00:00:00.000Z");
const digest = async tabs => createHash("sha256").update(JSON.stringify(tabs)).digest("hex");
const tab = (url, title = "Page", extra = {}) => ({ linkedBrowser: { currentURI: { spec: url } }, label: title,
  getAttribute: name => extra.workspace && name === "midori-workspace-id" ? extra.workspace : null, ...extra });

function adapterFor(windows, now = () => Date.parse("2026-10-01T00:00:00.000Z")) {
  return new MidoriSyncTabs({ deviceId, deviceName: "Desktop\nA", now, windows: () => windows, digest,
    isPrivate: win => win.private, workspaceId: (_win, id) => id });
}

async function capture(adapter, previous = null) {
  const records = new Map();
  for (const id of await adapter.beginCapture({ previous })) {
    const value = await adapter.read(id, id === deviceId ? previous : null);
    if (value) { records.set(id, value); }
  }
  adapter.endCapture();
  return records;
}

test("a device snapshot excludes private and non-web tabs without sending credentials", async () => {
  let now = Date.parse("2026-10-01T00:00:00.000Z");
  const adapter = adapterFor([
    { private: false, gBrowser: { tabs: [tab("https://example.invalid/page", "Title\nOne"),
      tab("about:config"), tab("https://user:secret@example.invalid/")] } },
    { private: true, gBrowser: { tabs: [tab("https://private.invalid/")] } },
  ], () => now);
  const records = await capture(adapter);
  const manifest = records.get(deviceId);
  assert.equal(adapter.canResolveConflict("local", deviceId), true);
  assert.equal(adapter.canResolveConflict("local", tabsFragmentId(deviceId, 0)), true);
  assert.equal(adapter.canResolveConflict("remote", deviceId), false);
  assert.equal(adapter.canResolveConflict("merge", deviceId), false);
  assert.equal(adapter.canResolveConflict("local", randomUUID()), false);
  assert.deepEqual(adapter.conflictValue(manifest), adapter.conflictValue({ ...manifest,
    updated_at: "2026-10-01T01:00:00.000Z", expires_at: "2026-10-08T01:00:00.000Z" }));
  assert.equal(manifest.version, 2);
  assert.equal(manifest.device_name, "Desktop A");
  assert.equal(manifest.tab_count, 1);
  assert.equal(manifest.expires_at, "2026-10-08T00:00:00.000Z");
  assert.equal(adapter.ttlOf(manifest), manifest.expires_at);
  const fragment = records.get(tabsFragmentId(deviceId, 0));
  assert.deepEqual(fragment.tabs, [{ url: "https://example.invalid/page", title: "Title One", window: 0, index: 0,
    pinned: false, group: null, workspace: null }]);
  assert.equal(await adapter.read(deviceId, manifest), manifest);
  now += 86400000;
  assert.equal((await capture(adapter, manifest)).get(deviceId).updated_at, "2026-10-02T00:00:00.000Z");
  adapter.close();
  await assert.rejects(adapter.read(deviceId), /cancelled/);
});

test("windows, order, pinned tabs, groups and workspaces survive in a stable layout", async () => {
  const adapter = adapterFor([
    { private: false, gBrowser: { tabs: [tab("https://a.invalid/", "A", { pinned: true }),
      tab("https://b.invalid/", "B", { group: { id: "g1", label: "Research" }, workspace: "ws-1" }),
      tab("https://c.invalid/", "C", { closing: true })] } },
    { private: false, gBrowser: { tabs: [tab("https://d.invalid/", "D")] } },
  ]);
  const records = await capture(adapter);
  const manifest = records.get(deviceId);
  assert.deepEqual(manifest.windows, [{ id: 0, tabs: 2 }, { id: 1, tabs: 1 }]);
  const snapshot = await assembleTabsSnapshot(manifest, index => records.get(tabsFragmentId(deviceId, index)), digest, NOW);
  assert.deepEqual(snapshot.tabs.map(entry => [entry.window, entry.index, entry.title, entry.pinned]),
    [[0, 0, "A", true], [0, 1, "B", false], [1, 0, "D", false]]);
  assert.deepEqual(snapshot.tabs[1].group, { id: "g1", label: "Research" });
  assert.equal(snapshot.tabs[1].workspace, "ws-1");
  adapter.close();
});

test("large tab sets use fragments without omissions and an atomic manifest", async () => {
  const adapter = adapterFor([{ private: false, gBrowser: { tabs: Array.from({ length: 450 }, (_, index) =>
    tab(`https://example.invalid/${index}`)) } }]);
  const records = await capture(adapter);
  const manifest = records.get(deviceId);
  assert.equal(manifest.tab_count, 450);
  assert.equal(manifest.omitted, 0);
  assert.deepEqual(manifest.fragments.map(fragment => fragment.count), [200, 200, 50]);
  assert.deepEqual([...records.keys()], [tabsFragmentId(deviceId, 0), tabsFragmentId(deviceId, 1),
    tabsFragmentId(deviceId, 2), deviceId], "Fragments are captured before the manifest that publishes them");
  const snapshot = await assembleTabsSnapshot(manifest, index => records.get(tabsFragmentId(deviceId, index)), digest, NOW);
  assert.equal(snapshot.tabs.length, 450);
  const broken = new Map(records);
  broken.set(tabsFragmentId(deviceId, 1), { ...records.get(tabsFragmentId(deviceId, 1)),
    tabs: records.get(tabsFragmentId(deviceId, 1)).tabs.slice(1) });
  assert.equal(await assembleTabsSnapshot(manifest, index => broken.get(tabsFragmentId(deviceId, index)), digest), null,
    "A stale or altered fragment makes the whole snapshot incomplete");
  broken.delete(tabsFragmentId(deviceId, 2));
  assert.equal(await assembleTabsSnapshot(manifest, index => broken.get(tabsFragmentId(deviceId, index)), digest), null);
  adapter.close();
});

test("shrinking a snapshot deletes stale fragments and unchanged fragments are not rewritten", async () => {
  const many = Array.from({ length: 450 }, (_, index) => tab(`https://example.invalid/${index}`));
  const windows = [{ private: false, gBrowser: { tabs: many } }];
  const adapter = adapterFor(windows);
  const first = await capture(adapter);
  const previousManifest = first.get(deviceId);
  windows[0].gBrowser.tabs = many.slice(0, 210);
  const ids = await adapter.beginCapture({ previous: previousManifest });
  assert.deepEqual(ids, [tabsFragmentId(deviceId, 0), tabsFragmentId(deviceId, 1), tabsFragmentId(deviceId, 2), deviceId]);
  assert.equal(await adapter.read(tabsFragmentId(deviceId, 0), first.get(tabsFragmentId(deviceId, 0))),
    first.get(tabsFragmentId(deviceId, 0)), "An identical fragment is not rewritten");
  assert.notEqual(await adapter.read(tabsFragmentId(deviceId, 1), first.get(tabsFragmentId(deviceId, 1))),
    first.get(tabsFragmentId(deviceId, 1)));
  assert.equal(await adapter.read(tabsFragmentId(deviceId, 2), first.get(tabsFragmentId(deviceId, 2))), null,
    "A fragment past the new end is absent locally so the engine records a deletion");
  adapter.endCapture();
  adapter.close();
});

test("remote records enforce device identity, URL safety, bounds, expiry and legacy snapshots", async () => {
  const value = { version: 1, device_id: deviceId, device_name: "Desktop",
    updated_at: "2026-10-01T00:00:00.000Z", expires_at: "2026-10-08T00:00:00.000Z",
    tabs: [{ url: "https://example.invalid/", title: "Page" }], omitted: 0 };
  assert.deepEqual(validateTabsSnapshot(deviceId, value), value);
  for (const changed of [
    { device_id: randomUUID() }, { expires_at: "2026-10-09T00:00:00.000Z" },
    { tabs: [{ url: "javascript:alert(1)", title: "Bad" }] },
    { tabs: [{ url: "https://user:secret@example.invalid/", title: "Bad" }] },
    { omitted: -1 },
  ]) {
    assert.throws(() => validateTabsSnapshot(deviceId, { ...value, ...changed }), /invalid_record/);
  }
  const legacy = await assembleTabsSnapshot(value, () => null, digest, NOW);
  assert.deepEqual(legacy.tabs, [{ url: "https://example.invalid/", title: "Page", window: 0, index: 0, pinned: false,
    group: null, workspace: null }]);
  const adapter = adapterFor([{ private: false, gBrowser: { tabs: [tab("https://example.invalid/")] } }]);
  const records = await capture(adapter);
  const fragment = records.get(tabsFragmentId(deviceId, 0));
  assert.throws(() => validateTabsRecord(tabsFragmentId(deviceId, 0), { ...fragment, device_id: randomUUID() }), /invalid_record/);
  assert.throws(() => validateTabsRecord(tabsFragmentId(deviceId, 1), fragment), /invalid_record/);
  assert.throws(() => validateTabsRecord(tabsFragmentId(deviceId, 0),
    { ...fragment, tabs: [{ ...fragment.tabs[0], url: "javascript:alert(1)" }] }), /invalid_record/);
  assert.throws(() => validateTabsRecord(deviceId, { ...records.get(deviceId), tab_count: 99 }), /invalid_record/);
  assert.deepEqual(await adapter.apply(), { status: "applied" });
  adapter.close();
});

test("receiving or expiring tabs never opens, closes or reads local tabs", async () => {
  let touched = 0;
  const adapter = new MidoriSyncTabs({ deviceId, deviceName: "Desktop", digest,
    windows: () => { touched++; return []; }, isPrivate: () => false });
  assert.deepEqual(await adapter.apply({ id: randomUUID(), deleted: false, value: {} }), { status: "applied" });
  assert.deepEqual(await adapter.apply({ id: `${randomUUID()}:0`, deleted: true }), { status: "applied" });
  assert.equal(touched, 0, "Applying remote tab records never touches local windows");
  adapter.close();
});
