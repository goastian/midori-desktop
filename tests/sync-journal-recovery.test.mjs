import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { MidoriSyncJournalRecovery } from "../src/browser/components/sync/MidoriSyncJournalRecovery.sys.mjs";

const clone = value => structuredClone(value);
const entryId = (...input) => {
  const hex = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

function fixture() {
  const id = randomUUID();
  const deviceId = randomUUID();
  const generation = randomUUID();
  const operationId = randomUUID();
  const rows = [
    { id: entryId("bookmarks", "metadata", "collection-state-v1"), collection: "bookmarks", kind: "metadata", revision: 1,
      value: { version: 3, generation, initialized: true, cursor: "opaque", sequence: "1", fence: null, inbox: null,
        index: 0, ack: null, pending: 1, conflicts: 0, deferred: 0, activeApplication: null, applicationAfter: null } },
    { id: entryId("bookmarks", "record", "bookmark-id"), collection: "bookmarks", kind: "record", revision: 1,
      value: { version: 1, id: "bookmark-id", pending: operationId, applying: null, blocked: false,
        remote: null, title: "Sensitive fixture title" } },
    { id: operationId, collection: "bookmarks", kind: "outbox", revision: 1,
      value: { version: 1, generation, epoch: randomUUID(),
        operation: { operation_id: operationId, id: "bookmark-id", base_revision: "0", deleted: false },
        value: { title: "Sensitive fixture title" } } },
  ].sort((a, b) => a.id.localeCompare(b.id));
  const saved = new Map([[id, { deviceId, rows, fingerprint: "original ciphertext digest" }]]);
  const state = { opens: 0, closes: 0, scans: 0, writes: [], preparations: 0 };
  const files = {
    async list({ activeId, after = null, limit = 25 }) {
      return [...saved.keys()].sort().filter(value => value !== activeId && (after === null || value > after)).slice(0, limit)
        .map(value => ({ id: value, bytes: 1234, modified: 1700000000000, incomplete: false }));
    },
    async fingerprint(value) {
      if (!saved.has(value)) { throw Object.assign(new Error("store_missing"), { code: "store_missing" }); }
      return saved.get(value).fingerprint;
    },
    async remove(value, token) {
      if (saved.get(value)?.fingerprint !== token) { throw Object.assign(new Error("store_changed"), { code: "store_changed" }); }
      saved.delete(value);
    },
  };
  const manager = new MidoriSyncJournalRecovery({ files, entryId, createId: randomUUID,
    async openStore({ storeId, keys }) {
      ++state.opens;
      if (keys !== "current account keys") { throw Object.assign(new Error("unknown_key"), { code: "unknown_key" }); }
      const source = saved.get(storeId);
      return { deviceId: source.deviceId, store: {
        async scan({ after, limit }) {
          ++state.scans;
          return clone(source.rows.filter(row => after === null || row.id > after).slice(0, Math.min(limit, 2)));
        },
        async close() { ++state.closes; },
      } };
    } });
  const options = { id, activeId: null, deviceId, keys: "current account keys" };
  const restore = review => manager.restore({ ...options, token: review.token,
    async prepare() { ++state.preparations; },
    async writeIdentity(identity) { state.writes.push(identity); } });
  return { id, deviceId, rows, saved, state, manager, options, restore };
}

test("listing saved journals excludes the active identity and does not decrypt anything", async () => {
  const { id, manager, state } = fixture();
  const page = await manager.list({ activeId: null, limit: 1 });
  assert.equal(page.entries[0].id, id);
  assert.equal(page.nextAfter, id);
  assert.deepEqual((await manager.list({ activeId: id })).entries, []);
  assert.deepEqual((await manager.list({ activeId: null, after: id })).entries, []);
  assert.equal(state.opens, 0);
});

test("review authenticates all pages and returns only bounded counts, then restores the same device", async () => {
  const { id, deviceId, manager, state, options, restore } = fixture();
  const review = await manager.review(options);
  assert.equal(review.status, "recoverable");
  assert.equal(review.canRestore, true);
  assert.deepEqual(review.collections, [{ name: "bookmarks", pending: 1, conflicts: 0, unfinished: 0 }]);
  assert.ok(!JSON.stringify(review).includes("Sensitive fixture"));
  assert.equal(state.scans, 3, "A short decoded page does not terminate discovery");
  assert.equal(state.closes, 1);
  await restore(review);
  assert.equal(state.preparations, 1);
  assert.deepEqual(state.writes, [{ version: 1, store_id: id, device_id: deviceId, initialized: true }]);
  await assert.rejects(restore(review), /store_changed/, "The review cannot be reused after activation");
});

test("saved extension-settings journals retain their pending manifest and expose only recovery counts", async () => {
  const f = fixture();
  const collection = "extension-settings";
  const recordId = "xm1:" + "a".repeat(64);
  for (const row of f.rows) {
    row.collection = collection;
    if (row.kind === "metadata") { row.id = entryId(collection, "metadata", "collection-state-v1"); }
    if (row.kind === "record") {
      row.id = entryId(collection, "record", recordId); row.value.id = recordId;
    }
    if (row.kind === "outbox") { row.value.operation.id = recordId; }
  }
  f.rows.sort((a, b) => a.id.localeCompare(b.id));
  const before = clone(f.rows);
  const review = await f.manager.review(f.options);
  assert.equal(review.status, "recoverable");
  assert.deepEqual(review.collections, [{ name: collection, pending: 1, conflicts: 0, unfinished: 0 }]);
  assert.ok(!JSON.stringify(review).includes("Sensitive fixture"));
  await f.restore(review);
  assert.deepEqual(f.rows, before, "Restoring the identity does not rewrite or acknowledge the pending configuration");
  assert.equal(f.state.preparations, 1);
});

test("device changes are diagnosed without replaying another device's cursors or operation receipts", async () => {
  const { manager, options, restore, state, saved } = fixture();
  saved.get(options.id).deviceId = randomUUID();
  const review = await manager.review(options);
  assert.equal(review.status, "other-device");
  assert.equal(review.canRestore, false);
  await assert.rejects(restore(review), /store_recovery_unavailable/);
  assert.equal(state.preparations, 0);
  assert.equal(state.writes.length, 0);
  assert.equal(saved.size, 1);
});

test("locked, damaged and future journals remain present and cannot be activated", async () => {
  for (const change of [source => { source.options.keys = null; }, source => { source.options.keys = "wrong account"; },
    source => { source.rows[0].collection = "unknown-future-family"; },
    source => { source.rows.find(row => row.kind === "metadata").value.pending = 2; },
    source => { source.rows.find(row => row.kind === "record").value.pending = randomUUID(); }]) {
    const source = fixture();
    change(source);
    const review = await source.manager.review(source.options);
    assert.ok(["locked", "unreadable"].includes(review.status));
    assert.equal(review.canRestore, false);
    await assert.rejects(source.restore(review), /store_recovery_unavailable/);
    assert.equal(source.saved.size, 1);
    assert.equal(source.state.writes.length, 0);
    assert.equal(source.state.opens, source.state.closes + Number(source.options.keys === "wrong account"));
  }
});

test("a changed copy, account identity or cleared review cannot authorize deletion or restoration", async () => {
  const source = fixture();
  const review = await source.manager.review(source.options);
  const remove = extra => source.manager.remove({ ...source.options, token: review.token, ...extra });
  await assert.rejects(remove({ activeId: source.id }), /store_in_use/);
  await assert.rejects(remove({ activeId: randomUUID() }), /store_changed/);
  source.saved.get(source.id).fingerprint = "later encrypted data";
  await assert.rejects(remove(), /store_changed/);
  await assert.rejects(source.restore(review), /store_changed/);
  assert.equal(source.state.writes.length, 0);
  source.manager.clear();
  await assert.rejects(remove(), /store_changed/);
  assert.equal(source.saved.size, 1);
});

test("failure to settle the active journal never replaces or merges its queues", async () => {
  const source = fixture();
  source.options.activeId = randomUUID();
  const review = await source.manager.review(source.options);
  await assert.rejects(source.manager.restore({ ...source.options, token: review.token,
    async prepare() { throw new Error("sync_pending_operations"); },
    async writeIdentity() { throw new Error("Must preserve the active pointer"); } }), /sync_pending_operations/);
  assert.equal(source.saved.size, 1);
});

test("confirmed removal needs a current review even when no keys are available", async () => {
  const source = fixture();
  source.options.keys = null;
  const review = await source.manager.review(source.options);
  assert.equal(source.saved.size, 1);
  await source.manager.remove({ ...source.options, token: review.token });
  assert.equal(source.saved.size, 0);
});

test("protected-key diagnostics do not authorize replay with the active account", async () => {
  const source = fixture();
  const review = await source.manager.review({ ...source.options, allowRestore: false });
  assert.equal(review.status, "archived");
  assert.equal(review.canRestore, false);
  assert.equal(review.collections[0].pending, 1);
  await assert.rejects(source.restore(review), /store_recovery_unavailable/);
  assert.equal(source.state.writes.length, 0);
});

test("protecting keys requires a current review and never changes the original copy", async () => {
  const source = fixture();
  const review = await source.manager.review(source.options);
  let saves = 0;
  const protect = () => source.manager.protect({ ...source.options, token: review.token, async save(fingerprint) {
    ++saves;
    assert.equal(fingerprint, source.saved.get(source.id).fingerprint);
  } });
  const before = clone([...source.saved]);
  await protect();
  assert.equal(saves, 1);
  assert.deepEqual([...source.saved], before);
  await assert.rejects(protect(), /store_changed/);
  const changed = await source.manager.review(source.options);
  source.saved.get(source.id).fingerprint = "changed copy";
  await assert.rejects(source.manager.protect({ ...source.options, token: changed.token,
    save() { throw new Error("Changed files must not be backed up under an obsolete review"); } }), /store_changed/);
});
