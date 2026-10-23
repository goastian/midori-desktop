import assert from "node:assert/strict";
import test from "node:test";
import { MidoriSyncAddresses } from "../src/browser/components/sync/MidoriSyncAddresses.sys.mjs";
import { MidoriSyncAddressTracker } from "../src/browser/components/sync/MidoriSyncAddressTracker.sys.mjs";

const id = "abc123def456";
const address = (fields = {}) => ({ version: 1, nativeVersion: 1, fields: {
  name: "María José 李", organization: "Ejemplo", "street-address": "Calle 1 Nº 2\nPiso 3",
  "address-level3": "Chapinero", "address-level2": "Bogotá", "address-level1": "DC",
  "postal-code": "110111", country: "CO", tel: "+57123456789", email: "maria@example.invalid", ...fields,
}, timeCreated: 1700000000000, timeLastModified: 1700000000010, timeLastUsed: 1700000000020, timesUsed: 3 });

function fixture() {
  const entries = new Map();
  const listeners = new Set();
  let writes = 0;
  const observers = {
    addObserver(callback) { listeners.add(callback); },
    removeObserver(callback) { listeners.delete(callback); },
    notifyObservers(subject, topic, action) {
      for (const callback of listeners) {
        callback(subject, topic, action);
      }
    },
  };
  const storage = { async initialize() {}, addresses: {
    async get(guid, { rawData }) {
      assert.equal(rawData, true);
      return entries.has(guid) ? structuredClone(entries.get(guid)) : null;
    },
    async getAll({ rawData }) {
      assert.equal(rawData, true);
      return structuredClone([...entries.values()]);
    },
    async addManyWithMeta(records) {
      return records.map(record => {
        if (entries.has(record.guid)) {
          return { error: "exists" };
        }
        entries.set(record.guid, structuredClone(record));
        ++writes;
        return { guid: record.guid };
      });
    },
    async updateManyWithMeta(records) {
      return records.map(record => {
        if (!entries.has(record.guid)) {
          return { error: "missing" };
        }
        entries.set(record.guid, structuredClone(record));
        ++writes;
        return { guid: record.guid };
      });
    },
    async remove(guid, { sourceSync }) {
      entries.delete(guid);
      ++writes;
      observers.notifyObservers({ wrappedJSObject: { guid, sourceSync, collectionName: "addresses" } },
        "formautofill-storage-changed", "remove");
    },
  } };
  const adapter = new MidoriSyncAddresses({ storage, observers });
  return { adapter, storage, observers, entries, get writes() { return writes; },
    notify(guid, action, overrides = {}) {
      observers.notifyObservers({ wrappedJSObject: { guid, collectionName: "addresses", ...overrides } },
        "formautofill-storage-changed", action);
    } };
}

test("addresses preserve every canonical field, Unicode, GUID and native timestamps idempotently", async () => {
  const f = fixture();
  try {
    const incoming = { id, deleted: false, value: address() };
    assert.deepEqual(await f.adapter.apply(incoming), { status: "applied" });
    assert.deepEqual(await f.adapter.read(id), address());
    assert.deepEqual(await f.adapter.listIds(), [id]);
    assert.equal(f.entries.get(id).guid, id);
    assert.deepEqual(await f.adapter.apply(incoming), { status: "applied" });
    assert.equal(f.writes, 1, "Replays do not rewrite timestamps or multiply usage");
  } finally { f.adapter.close(); }
});

test("address schemas reject unsupported fields and versions without dropping remote content", async () => {
  const { adapter } = fixture();
  try {
    for (const value of [
      { ...address(), version: 2 }, { ...address(), nativeVersion: 2 },
      { ...address(), timesUsed: -1 }, { ...address(), timeCreated: 1.5 },
      { ...address(), timeLastUsed: Number.MAX_SAFE_INTEGER + 1 },
      { ...address(), fields: { country: "CO" } },
      address({ "cc-number": "4111111111111111" }), address({ country: "co" }),
      address({ email: "secret\0@example.invalid" }), address({ name: "x".repeat(8193) }),
    ]) {
      await assert.rejects(adapter.validate(id, value), /invalid_record/);
    }
    await assert.rejects(adapter.validate("short", address()), /invalid_record/);
    const optional = address();
    delete optional.fields.organization;
    optional.fields.email = "";
    const expected = structuredClone(optional);
    delete expected.fields.email;
    assert.deepEqual(await adapter.validate(id, optional), expected);
  } finally { adapter.close(); }
});

test("disjoint offline edits merge while competing edits and deletion versus editing remain conflicts", async () => {
  const f = fixture();
  try {
    const base = { id, deleted: false, value: address() };
    await f.adapter.apply(base);
    f.entries.get(id).name = "Nombre local";
    f.entries.get(id).timeLastModified = 1700000000040;
    const remote = { id, deleted: false, value: { ...address({ email: "remote@example.invalid" }),
      timeLastModified: 1700000000030, timeLastUsed: 1700000000050, timesUsed: 5 } };
    assert.deepEqual(await f.adapter.apply(remote, base), { status: "applied" });
    assert.deepEqual(await f.adapter.read(id), { ...remote.value,
      fields: { ...remote.value.fields, name: "Nombre local" }, timeLastModified: 1700000000040 });
    assert.deepEqual(await f.adapter.apply({ id, deleted: false, value: address({ name: "Otro nombre" }) }, base),
      { status: "conflict", reason: "address_fields_diverged" });
    assert.deepEqual(await f.adapter.apply({ id, deleted: true }, base),
      { status: "conflict", reason: "deletion_edit" });
    const latest = { id, deleted: false, value: await f.adapter.read(id) };
    assert.deepEqual(await f.adapter.apply({ id, deleted: true }, latest), { status: "applied" });
    assert.equal(await f.adapter.read(id), null);
    assert.deepEqual(await f.adapter.apply({ id, deleted: true }, latest), { status: "applied" });
  } finally { f.adapter.close(); }
});

test("address usage counters converge using maximum instead of adding replayed values", async () => {
  const f = fixture();
  try {
    const base = { id, deleted: false, value: address() };
    await f.adapter.apply(base);
    f.entries.get(id).timesUsed = 8;
    f.entries.get(id).timeLastUsed = 1700000000100;
    const remote = { id, deleted: false, value: { ...address(), timesUsed: 6, timeLastUsed: 1700000000200 } };
    await f.adapter.apply(remote, base);
    await f.adapter.apply(remote, base);
    assert.equal((await f.adapter.read(id)).timesUsed, 8);
    assert.equal((await f.adapter.read(id)).timeLastUsed, 1700000000200);
  } finally { f.adapter.close(); }
});

test("capture observes edits, use, imports and deletions, excluding other collections and remote echoes", async () => {
  const f = fixture();
  const observed = [];
  const unsubscribe = f.adapter.observe(event => observed.push(event));
  try {
    const base = { id, deleted: false, value: address() };
    await f.adapter.apply(base);
    await f.adapter.apply({ id, deleted: true }, base);
    assert.deepEqual(observed, []);
    f.notify(id, "update");
    f.notify(id, "notifyUsed");
    f.notify(id, "remove");
    f.notify(null, "migrate");
    f.notify(id, "update", { sourceSync: true });
    f.notify(id, "update", { collectionName: "creditCards" });
    assert.deepEqual(observed, [{ id }, { id }, { id }, { rescan: true }]);
    unsubscribe();
    f.notify(id, "add");
    assert.equal(observed.length, 4);
  } finally { f.adapter.close(); }
});

test("native write failures and intervening edits never acknowledge an unapplied address", async () => {
  const f = fixture();
  try {
    const base = { id, deleted: false, value: address() };
    await f.adapter.apply(base);
    f.storage.addresses.remove = async () => {};
    assert.deepEqual(await f.adapter.apply({ id, deleted: true }, base),
      { status: "deferred", reason: "address_changed" });
    f.storage.addresses.updateManyWithMeta = async () => [{ error: "failed" }];
    await assert.rejects(f.adapter.apply({ id, deleted: false, value: address({ name: "Change" }) }, base),
      /address_apply_failed/);
    assert.deepEqual(await f.adapter.read(id), address());
    const get = f.storage.addresses.get;
    let reads = 0;
    f.storage.addresses.get = async (...args) => {
      if (++reads === 2) {
        f.entries.get(id).name = "Concurrent edit";
      }
      return get(...args);
    };
    assert.deepEqual(await f.adapter.apply({ id, deleted: false, value: address({ name: "Change" }) }, base),
      { status: "conflict", reason: "address_fields_diverged" });
  } finally { f.adapter.close(); }
});

test("address tracker scans both native inventory and mirror to discover offline deletions", async () => {
  const f = fixture();
  const captures = [];
  await f.adapter.apply({ id, deleted: false, value: address() });
  const engine = {
    async capture(guid) { captures.push(guid); return { status: "queued" }; },
    async capturePage() { return { results: [{ id: "deleted12345", status: "queued" }], nextAfter: null }; },
  };
  const tracker = new MidoriSyncAddressTracker({ engine, adapter: f.adapter });
  try {
    assert.deepEqual(await tracker.run(), { checked: 2, queued: 2, pending: 0, conflicts: 0, more: false });
    assert.deepEqual(captures, [id]);
    f.notify(id, "notifyUsed");
    assert.equal(tracker.snapshot.dirty, 1);
    assert.equal((await tracker.run()).checked, 1);
  } finally { tracker.close(); f.adapter.close(); }
});

test("unsupported native versions and invalid identities are surfaced rather than silently omitted", async () => {
  const f = fixture();
  try {
    f.entries.set(id, { guid: id, version: 2, name: "Future profile" });
    await assert.rejects(f.adapter.read(id), /addresses_schema_unsupported/);
    f.entries.set("bad", { guid: "bad", version: 1, name: "Invalid identity" });
    await assert.rejects(f.adapter.listIds(), /address_identity_conflict/);
    f.adapter.close();
    await assert.rejects(f.adapter.read(id), /cancelled/);
  } finally { f.adapter.close(); }
});

test("exact duplicates select the smaller GUID and capture redundant IDs for authenticated deletion", async () => {
  for (const [localId, remoteId] of [["zzz123def456", "abc123def456"], ["abc123def456", "zzz123def456"]]) {
    const f = fixture();
    try {
      await f.adapter.apply({ id: localId, deleted: false, value: address() });
      const notifications = [];
      f.adapter.observe(event => notifications.push(event));
      const incoming = { id: remoteId, deleted: false, value: { ...address(), timesUsed: 7 } };
      const plan = await f.adapter.prepare(incoming);
      assert.equal(plan.duplicate.id, localId);
      const applied = { status: "applied", replacement: { id: "zzz123def456", replacementId: id } };
      assert.deepEqual(await f.adapter.applyPrepared(plan), applied);
      assert.deepEqual(await f.adapter.applyPrepared(plan), applied);
      assert.deepEqual(await f.adapter.listIds(), ["abc123def456"]);
      assert.equal((await f.adapter.read("abc123def456")).timesUsed, 7);
      assert.equal(await f.adapter.read("zzz123def456"), null,
        "The mirror inventory will enqueue a tombstone for the redundant GUID");
      assert.ok(notifications.some(event => event.rescan));
      assert.deepEqual(await f.adapter.apply({ id: "zzz123def456", deleted: true },
        { ...incoming, id: "zzz123def456" }),
        { status: "applied" });
      assert.equal((await f.adapter.read("abc123def456")).fields.name, address().fields.name,
        "The redundant tombstone does not remove the surviving profile");
    } finally { f.adapter.close(); }
  }
});

test("duplicate migration resumes after insertion without copying or incrementing counters twice", async () => {
  const f = fixture();
  let restarted;
  try {
    await f.adapter.apply({ id: "zzz123def456", deleted: false, value: address() });
    const plan = await f.adapter.prepare({ id, deleted: false, value: { ...address(), timesUsed: 8 } });
    const remove = f.storage.addresses.remove;
    f.storage.addresses.remove = async () => { throw new Error("simulated process interruption"); };
    await assert.rejects(f.adapter.applyPrepared(plan), /simulated process interruption/);
    assert.equal(f.entries.size, 2, "The original stays present until the canonical record exists");
    f.adapter.close();
    f.storage.addresses.remove = remove;
    restarted = new MidoriSyncAddresses({ storage: f.storage, observers: f.observers });
    assert.deepEqual(await restarted.applyPrepared(structuredClone(plan)), {
      status: "applied", replacement: { id: "zzz123def456", replacementId: id },
    });
    assert.deepEqual(await restarted.listIds(), [id]);
    assert.equal((await restarted.read(id)).timesUsed, 8);
  } finally { f.adapter.close(); restarted?.close(); }
});

test("duplicate migration preserves a concurrent edit or deletion instead of erasing it", async () => {
  for (const deleted of [false, true]) {
    const f = fixture();
    try {
      await f.adapter.apply({ id: "zzz123def456", deleted: false, value: address() });
      const plan = await f.adapter.prepare({ id, deleted: false, value: address() });
      if (deleted) {
        f.entries.delete("zzz123def456");
      } else {
        f.entries.get("zzz123def456").name = "Edited after planning";
      }
      assert.deepEqual(await f.adapter.applyPrepared(plan), { status: "conflict",
        reason: deleted ? "deletion_edit" : "address_duplicate_changed" });
      assert.equal(await f.adapter.read(id), null, "No redundant record is created after a race");
      if (!deleted) {
        assert.equal((await f.adapter.read("zzz123def456")).fields.name, "Edited after planning");
      }
    } finally { f.adapter.close(); }
  }
});

test("changing duplicate contents after the canonical insert retains both versions as a conflict", async () => {
  const f = fixture();
  try {
    await f.adapter.apply({ id: "zzz123def456", deleted: false, value: address() });
    const plan = await f.adapter.prepare({ id, deleted: false, value: address() });
    const add = f.storage.addresses.addManyWithMeta;
    f.storage.addresses.addManyWithMeta = async records => {
      const result = await add(records);
      f.entries.get("zzz123def456").email = "concurrent@example.invalid";
      return result;
    };
    assert.deepEqual(await f.adapter.applyPrepared(plan),
      { status: "conflict", reason: "address_duplicate_changed" });
    assert.equal(f.entries.size, 2);
    assert.equal((await f.adapter.read("zzz123def456")).fields.email, "concurrent@example.invalid");
  } finally { f.adapter.close(); }
});

test("redundant deletions wait for the canonical address to be confirmed despite quota or capture order", async () => {
  const f = fixture();
  const redundantId = "zzz123def456";
  const mirrors = new Map([[redundantId, { replacementId: id }]]);
  const context = { record: async guid => mirrors.get(guid) ?? null };
  try {
    await f.adapter.apply({ id, deleted: false, value: address() });
    await f.adapter.apply({ id: redundantId, deleted: false, value: address() });
    assert.equal(await f.adapter.canDelete(redundantId, address(), context), false,
      "Capturing the deletion first cannot remove the only confirmed remote copy");
    mirrors.set(id, { remote: null, pending: "canonical-upload" });
    assert.equal(await f.adapter.canDelete(redundantId, address(), context), false,
      "An upload awaiting acknowledgment does not authorize the redundant deletion");
    mirrors.set(id, { remote: null, pending: null, blocked: true });
    assert.equal(await f.adapter.canDelete(redundantId, address(), context), false,
      "A quota rejection leaves the original remote copy protected");
    mirrors.set(id, { remote: { deleted: false, value: address({ email: "older@example.invalid" }) } });
    assert.equal(await f.adapter.canDelete(redundantId, address(), context), false,
      "A canonical mirror with different fields is insufficient");
    mirrors.set(id, { remote: { deleted: false, value: address() } });
    assert.equal(await f.adapter.canDelete(redundantId, address(), context), true);
    f.entries.get(id).name = "Edited after consolidation";
    assert.equal(await f.adapter.canDelete(redundantId, address(), context), false,
      "Editing the survivor does not erase its publication dependency");
    mirrors.set(id, { remote: { deleted: false, value: await f.adapter.read(id) } });
    assert.equal(await f.adapter.canDelete(redundantId, address(), context), true);
  } finally { f.adapter.close(); }
});

test("confirmed canonical publication remains required across an adapter restart", async () => {
  const f = fixture();
  let restarted;
  try {
    await f.adapter.apply({ id, deleted: false, value: address() });
    await f.adapter.apply({ id: "zzz123def456", deleted: false, value: address() });
    f.adapter.close();
    restarted = new MidoriSyncAddresses({ storage: f.storage, observers: f.observers });
    const mirrors = new Map([["zzz123def456", { replacementId: id }]]);
    const context = { record: async guid => mirrors.get(guid) ?? null };
    assert.equal(await restarted.canDelete("zzz123def456", address(), context), false);
    mirrors.set(id, { remote: { deleted: false, value: address() } });
    assert.equal(await restarted.canDelete("zzz123def456", address(), context), true);
    f.entries.clear();
    assert.equal(await restarted.canDelete("zzz123def456", address(), context), true,
      "Deleting the last local address deliberately does not create a publication dependency");
  } finally { f.adapter.close(); restarted?.close(); }
});

test("deletion dependencies follow durable replacements without blocking unrelated conflicting addresses", async () => {
  const f = fixture();
  const middle = "mmm123def456";
  const redundant = "zzz123def456";
  const mirrors = new Map([[redundant, { replacementId: middle }], [middle, { replacementId: id }]]);
  const context = { record: async guid => mirrors.get(guid) ?? null };
  try {
    await f.adapter.apply({ id, deleted: false, value: address() });
    assert.equal(await f.adapter.canDelete(redundant, address(), context), false);
    mirrors.set(id, { remote: { deleted: false, value: address() } });
    assert.equal(await f.adapter.canDelete(redundant, address(), context), true);
    const unrelatedId = "aaa123def456";
    await f.adapter.apply({ id: unrelatedId, deleted: false, value: address({ name: "Another address" }) });
    mirrors.set(unrelatedId, { blocked: true, remote: { deleted: false, value: address({ name: "Remote conflict" }) } });
    assert.equal(await f.adapter.canDelete(redundant, address(), context), true,
      "A different address conflict does not prevent duplicate cleanup");
    assert.equal(await f.adapter.canDelete("bbb123def456", address(), context), true,
      "An ordinary user deletion has no unrelated publication dependency");
    mirrors.set(middle, { replacementId: redundant });
    await assert.rejects(f.adapter.canDelete(redundant, address(), context), /address_identity_conflict/);
  } finally { f.adapter.close(); }
});
