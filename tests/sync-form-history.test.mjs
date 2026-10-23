import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { MidoriSyncFormHistory } from "../src/browser/components/sync/MidoriSyncFormHistory.sys.mjs";
import { MidoriSyncFormHistoryTracker } from "../src/browser/components/sync/MidoriSyncFormHistoryTracker.sys.mjs";

const value = (changes = {}) => ({ version: 1, fieldname: "city", value: "Bogotá 日本語",
  firstUsed: 1000000, lastUsed: 2000000, timesUsed: 3, ...changes });
const deriveRecordId = (collection, input) => createHmac("sha256", "synthetic identity key")
  .update(collection).update(input).digest("hex");
const recordId = data => `f1:${deriveRecordId("form-history", new TextEncoder().encode(JSON.stringify([data.fieldname, data.value])))}`;
const record = data => ({ id: recordId(data), deleted: false, value: data });
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const rows = new Map();
  const listeners = new Set();
  let sequence = 0;
  let writes = 0;
  const notify = (guid, action = "formhistory-update") => {
    for (const listener of listeners) {
      listener({ data: guid }, "satchel-storage-changed", action);
    }
  };
  const history = {
    enabled: true,
    isAllowedEntry: (field, text) => field !== "searchbar-history" && text !== "4111111111111111",
    async search(fields, criteria) {
      return [...rows.values()].filter(row => Object.entries(criteria).every(([key, expected]) => row[key] === expected))
        .map(row => Object.fromEntries(fields.map(field => [field, row[field]])));
    },
    async update(changes) {
      ++writes;
      for (const change of Array.isArray(changes) ? changes : [changes]) {
        if (change.op === "add") {
          const guid = `form${String(++sequence).padStart(8, "0")}`;
          const entry = { ...change };
          delete entry.op;
          rows.set(guid, { ...entry, guid });
          notify(guid, "formhistory-add");
        } else if (change.op === "update") {
          const entry = { ...change };
          delete entry.op;
          if (rows.has(change.guid)) {
            Object.assign(rows.get(change.guid), entry);
          }
          notify(change.guid);
        } else if (change.op === "remove") {
          for (const [guid, row] of rows) {
            if (change.guid ? guid === change.guid : row.fieldname === change.fieldname && row.value === change.value) {
              rows.delete(guid);
              notify(guid, "formhistory-remove");
            }
          }
        }
      }
    },
  };
  const observers = {
    addObserver(callback) { listeners.add(callback); },
    removeObserver(callback) { listeners.delete(callback); },
  };
  const adapter = new MidoriSyncFormHistory({ history, observers, deriveRecordId });
  const add = (data = value(), guid = `form${String(++sequence).padStart(8, "0")}`) => {
    const entry = { ...data };
    delete entry.version;
    rows.set(guid, { ...entry, guid });
    return guid;
  };
  return { rows, history, adapter, add, notify, listeners, get writes() { return writes; } };
}

test("form identities are secret, collection-bound and validate the complete schema", async () => {
  const { adapter } = fixture();
  const data = value();
  assert.deepEqual(await adapter.validate(recordId(data), data), data);
  for (const changed of [{ secret: "bad" }, { timesUsed: 0 }, { timesUsed: Number.MAX_SAFE_INTEGER + 1 },
    { firstUsed: 0 }, { lastUsed: 1 }, { fieldname: "password" }, { fieldname: "cc-csc" },
    { fieldname: "one-time-code" }, { fieldname: "searchbar-history" }, { value: "4111111111111111" },
    { value: "x".repeat(201) }, { value: "a\u0000b" }, { version: 2 }]) {
    await assert.rejects(adapter.validate(recordId(data), { ...data, ...changed }), /invalid_record/);
  }
  await assert.rejects(adapter.validate(`f1:${"0".repeat(64)}`, data), /invalid_record/);
  const otherKey = new MidoriSyncFormHistory({ ...fixture(), history: fixture().history, observers: {},
    deriveRecordId: () => "a".repeat(64) });
  await assert.rejects(otherKey.validate(recordId(data), data), /invalid_record/);
  otherKey.close();
  adapter.close();
});

test("native GUID changes do not change a form identity, while field or value changes do", async () => {
  const source = fixture();
  const guid = source.add();
  const id = recordId(value());
  assert.deepEqual(await source.adapter.listIds(), [id]);
  const entry = source.rows.get(guid);
  source.rows.delete(guid);
  source.rows.set("replacement1", { ...entry, guid: "replacement1" });
  assert.deepEqual(await source.adapter.read(id), value());
  source.rows.get("replacement1").value = "Medellín";
  assert.equal(await source.adapter.read(id, value()), null);
  assert.deepEqual(await source.adapter.listIds(), [recordId(value({ value: "Medellín" }))]);
  source.adapter.close();
});

test("remote inserts and repeats keep one native suggestion and unchanged use counters", async () => {
  const source = fixture();
  const data = value();
  for (let attempt = 0; attempt < 5; ++attempt) {
    assert.deepEqual(await source.adapter.apply(record(data)), { status: "applied" });
  }
  assert.equal(source.rows.size, 1);
  assert.equal(source.writes, 1);
  assert.deepEqual(await source.adapter.read(recordId(data)), data);
  source.adapter.close();
});

test("simultaneous usage converges with min/max metadata and never multiplies counters on retry", async () => {
  const source = fixture();
  const base = value();
  source.add(value({ firstUsed: 500000, timesUsed: 5, lastUsed: 4000000 }));
  const remote = value({ timesUsed: 7, lastUsed: 3000000 });
  const expected = value({ firstUsed: 500000, timesUsed: 7, lastUsed: 4000000 });
  for (let attempt = 0; attempt < 3; ++attempt) {
    assert.deepEqual(await source.adapter.apply(record(remote), record(base)), { status: "applied" });
    assert.deepEqual(await source.adapter.read(recordId(base)), expected);
  }
  assert.equal(source.writes, 1);
  assert.equal(source.adapter.matchesLocal(recordId(base), expected, remote), false,
    "The merged metadata is captured for the other device");
  source.adapter.close();
});

test("a remote older counter cannot decrease already recorded local use", async () => {
  const source = fixture();
  const base = value();
  source.add(base);
  await source.adapter.apply(record(value({ timesUsed: 1, lastUsed: 1500000 })), record(base));
  assert.deepEqual(await source.adapter.read(recordId(base)), base);
  source.adapter.close();
});

test("duplicate native entries reconcile through FormHistory while retaining earliest and latest usage", async () => {
  const source = fixture();
  source.add(value({ firstUsed: 500000, timesUsed: 2 }));
  source.add(value({ lastUsed: 3000000, timesUsed: 6 }));
  const expected = value({ firstUsed: 500000, lastUsed: 3000000, timesUsed: 6 });
  assert.deepEqual(await source.adapter.listIds(), [recordId(expected)]);
  assert.deepEqual(await source.adapter.read(recordId(expected)), expected);
  assert.deepEqual(await source.adapter.apply(record(expected)), { status: "applied" });
  assert.equal(source.rows.size, 1);
  assert.deepEqual(await source.adapter.read(recordId(expected)), expected);
  source.adapter.close();
});

test("deletions respect concurrent uses, apply after upload and repeat without resurrection", async () => {
  const source = fixture();
  const base = value();
  const local = value({ timesUsed: 4, lastUsed: 3000000 });
  source.add(local);
  const deleted = { id: recordId(base), deleted: true };
  assert.deepEqual(await source.adapter.apply(deleted, record(base)), { status: "conflict", reason: "deletion_edit" });
  assert.deepEqual(await source.adapter.apply(deleted, record(local)), { status: "applied" });
  assert.deepEqual(await source.adapter.apply(deleted, record(local)), { status: "applied" });
  assert.equal(source.rows.size, 0);
  assert.deepEqual((await source.adapter.plan(record(local), record(base))).decision,
    { status: "conflict", reason: "deletion_edit" });
  source.adapter.close();
});

test("a restarted adapter can locate a tombstone by the encrypted mirror value", async () => {
  const source = fixture();
  source.add();
  assert.deepEqual(await source.adapter.apply({ id: recordId(value()), deleted: true }, record(value())), { status: "applied" });
  assert.equal(source.rows.size, 0);
  source.adapter.close();
});

test("a confirmed conflict choice applies exact counters, repeats safely and refuses a later local use", async () => {
  const source = fixture();
  const local = value({ timesUsed: 8, lastUsed: 4000000 });
  const remote = value({ timesUsed: 2 });
  const guid = source.add(local);
  assert.equal((await source.adapter.applyConflict(record(remote), record(local))).status, "applied");
  assert.deepEqual(await source.adapter.read(recordId(remote)), remote);
  assert.equal((await source.adapter.applyConflict(record(remote), record(local))).status, "applied");
  source.rows.get(guid).timesUsed = 9;
  source.rows.get(guid).lastUsed = 5000000;
  assert.deepEqual(await source.adapter.applyConflict(record(remote), record(local)),
    { status: "conflict", reason: "form_history_changed" });
  assert.equal((await source.adapter.read(recordId(local))).timesUsed, 9);
  source.adapter.close();
});

test("ignored storage writes are deferred instead of being acknowledged", async () => {
  const source = fixture();
  source.history.update = async () => {};
  assert.deepEqual(await source.adapter.apply(record(value())), { status: "deferred", reason: "form_history_changed" });
  source.add();
  assert.deepEqual(await source.adapter.apply({ id: recordId(value()), deleted: true }, record(value())),
    { status: "deferred", reason: "form_history_changed" });
  source.adapter.close();
});

test("observers track additions, usage, identity edits, deletions and expiration", async () => {
  const source = fixture();
  const seen = [];
  const unsubscribe = source.adapter.observe(event => seen.push(event));
  const guid = source.add();
  source.notify(guid, "formhistory-add");
  await flush();
  assert.deepEqual(seen.splice(0), [{ id: recordId(value()) }]);
  source.rows.get(guid).timesUsed = 4;
  source.notify(guid);
  await flush();
  assert.deepEqual(seen.splice(0), [{ id: recordId(value()) }]);
  source.rows.get(guid).value = "Medellín";
  source.notify(guid);
  await flush();
  assert.deepEqual(seen.splice(0), [{ id: recordId(value()) }, { id: recordId(value({ value: "Medellín" })) }]);
  source.rows.delete(guid);
  source.notify(guid, "formhistory-remove");
  assert.deepEqual(seen.splice(0), [{ id: recordId(value({ value: "Medellín" })) }]);
  source.notify("unknown", "formhistory-remove");
  source.notify(null, "formhistory-expireoldentries");
  assert.deepEqual(seen.splice(0), [{ rescan: true }, { rescan: true }]);
  unsubscribe();
  assert.equal(source.listeners.size, 0);
  source.adapter.close();
});

test("inventories exclude sensitive or unsupported stored fields and disabled history fails closed", async () => {
  const source = fixture();
  source.add(value({ fieldname: "password" }));
  source.add(value({ fieldname: "searchbar-history" }));
  source.add(value({ value: "4111111111111111" }));
  source.add();
  assert.deepEqual(await source.adapter.listIds(), [recordId(value())]);
  source.history.enabled = false;
  await assert.rejects(source.adapter.listIds(), /form_history_disabled/);
  await assert.rejects(source.adapter.read(recordId(value())), /form_history_disabled/);
  source.adapter.close();
  await assert.rejects(source.adapter.listIds(), /cancelled/);
});

test("the tracker inventories bounded batches and captures deletions from the mirror", async () => {
  const source = fixture();
  const id = recordId(value());
  source.add();
  const captured = [];
  let changes = 0;
  const tracker = new MidoriSyncFormHistoryTracker({ adapter: source.adapter,
    onChange: () => ++changes,
    engine: {
      async capture(candidate) { captured.push(candidate); return { status: "unchanged" }; },
      async capturePage() { return { results: [{ id, status: "queued" }], nextAfter: null }; },
    },
  });
  assert.equal((await tracker.run({ limit: 1 })).more, true);
  assert.equal((await tracker.run({ limit: 1 })).queued, 1);
  assert.equal(tracker.snapshot.more, false);
  const guid = [...source.rows.keys()][0];
  source.rows.delete(guid);
  source.notify(guid, "formhistory-remove");
  assert.equal(changes, 1);
  await tracker.run({ limit: 1 });
  assert.deepEqual(captured, [id, id]);
  tracker.close();
  source.adapter.close();
});

test("identity input bytes are erased after success and failure", async () => {
  const source = fixture();
  let input;
  const adapter = new MidoriSyncFormHistory({ history: source.history, observers: {}, deriveRecordId: (_collection, bytes) => {
    input = bytes;
    return deriveRecordId("form-history", bytes);
  } });
  await adapter.validate(recordId(value()), value());
  assert.ok(input.every(byte => byte === 0));
  adapter.close();
  const broken = new MidoriSyncFormHistory({ history: source.history, observers: {}, deriveRecordId: (_collection, bytes) => {
    input = bytes;
    throw new Error("locked");
  } });
  await assert.rejects(broken.validate(recordId(value()), value()), /locked/);
  assert.ok(input.every(byte => byte === 0));
  broken.close();
  source.adapter.close();
});
