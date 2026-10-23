import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { MidoriSyncPrivacyFilters, SYNC_FILTERS_ID } from "../src/browser/components/sync/MidoriSyncPrivacyFilters.sys.mjs";
import { createSyncTextBundle } from "../src/browser/components/sync/MidoriSyncTextBundle.sys.mjs";

const TYPE = "custom-filters";
const digest = async text => createHash("sha256").update(text).digest("hex");
const derive = (key = "public privacy index fixture") => async (collection, bytes) =>
  createHmac("sha256", key).update(collection).update(bytes).digest("hex");
const entryId = async (type, hash, key) => `t1:${await derive(key)("midori-privacy",
  new TextEncoder().encode(JSON.stringify([1, "text-part", type, hash])))}`;
const bundle = (text, key) => createSyncTextBundle(TYPE, text, {
  digest, entryId: (type, hash) => entryId(type, hash, key),
});
const incoming = value => ({ id: SYNC_FILTERS_ID, deleted: false, value, authenticatedSchema: 2 });

function fixture(text = null, key) {
  const listeners = new Set();
  const records = new Map();
  const producer = {
    state: { present: text !== null, text: text ?? "" }, writes: 0,
    async readCustomFiltersSnapshot() { return structuredClone(this.state); },
    async updateCustomFiltersText(update) {
      const next = await update(structuredClone(this.state));
      if (next === null) { return false; }
      this.state = { present: true, text: next };
      this.writes++;
      for (const listener of listeners) { listener(); }
      return true;
    },
    observeCustomFilters(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    edit(next) {
      this.state = { present: true, text: next };
      for (const listener of listeners) { listener(); }
    },
  };
  let hints = 0;
  const options = { producer, deriveRecordId: derive(key), digest, normalize: value => value,
    record: async id => structuredClone(records.get(id) ?? null) };
  const adapter = new MidoriSyncPrivacyFilters(options);
  adapter.observe(() => hints++);
  const stage = value => {
    for (const part of value.parts) {
      records.set(part.id, { remote: { id: part.id, deleted: false, value: part.value, authenticatedSchema: 2 } });
    }
  };
  return { producer, records, adapter, options, stage, listeners, get hints() { return hints; } };
}

test("filters apply atomically after all parts arrive and replay after reopen", async () => {
  const text = "||public.example^\n".repeat(10000);
  const data = await bundle(text);
  const local = fixture();
  const plan = await local.adapter.prepare(incoming(data.manifest));
  assert.equal(JSON.stringify(plan).includes(text), false, "The durable plan holds references rather than the full text");
  assert.deepEqual(await local.adapter.applyPrepared(plan), { status: "deferred", reason: "privacy_parts_missing" });
  assert.deepEqual(local.producer.state, { present: false, text: "" });
  assert.equal(local.producer.writes, 0);
  local.stage(data);
  assert.deepEqual(await local.adapter.applyPrepared(plan), { status: "applied" });
  assert.equal(local.producer.state.text, text);
  assert.equal(local.producer.writes, 1);
  local.adapter.close();
  const reopened = new MidoriSyncPrivacyFilters(local.options);
  assert.deepEqual(await reopened.applyPrepared(structuredClone(plan)), { status: "applied" });
  assert.equal(local.producer.writes, 1, "Replaying a completed native write does not rewrite it");
});

test("untouched profiles and explicit empty filters have different captures", async () => {
  assert.deepEqual(await fixture().adapter.listIds(), []);
  const empty = fixture("");
  assert.deepEqual(await empty.adapter.listIds(), [SYNC_FILTERS_ID]);
  const data = await bundle("");
  const local = fixture();
  assert.deepEqual(await local.adapter.apply(incoming(data.manifest)), { status: "applied" });
  assert.deepEqual(local.producer.state, { present: true, text: "" });
});

test("existing populated profiles preserve conflicting filters", async () => {
  const local = fixture("||local.example^\n");
  const data = await bundle("||remote.example^\n");
  local.stage(data);
  assert.deepEqual(await local.adapter.apply(incoming(data.manifest)),
    { status: "conflict", reason: "privacy_filters_changed" });
  assert.equal(local.producer.state.text, "||local.example^\n");
  assert.equal(local.producer.writes, 0);
});

test("identical native filters complete even when remote parts need repair", async () => {
  const text = "||same.example^\n";
  const local = fixture(text);
  const data = await bundle(text);
  assert.deepEqual(await local.adapter.apply(incoming(data.manifest)), { status: "applied" });
  const ids = await local.adapter.listIds();
  assert.ok(ids.includes(data.parts[0].id));
  assert.deepEqual(await local.adapter.read(data.parts[0].id), data.parts[0].value);
  assert.equal(local.producer.writes, 0);
});

test("a newer native edit defeats a prepared remote write", async () => {
  const old = await bundle("||old.example^\n");
  const remote = await bundle("||remote.example^\n");
  const local = fixture("||old.example^\n");
  local.stage(remote);
  const plan = await local.adapter.prepare(incoming(remote.manifest), incoming(old.manifest));
  local.producer.edit("||newer.example^\n");
  assert.deepEqual(await local.adapter.applyPrepared(plan),
    { status: "deferred", reason: "privacy_filters_local_changed" });
  assert.equal(local.producer.state.text, "||newer.example^\n");
});

test("unchanged remote content cannot overwrite a local edit", async () => {
  const data = await bundle("||old.example^\n");
  const local = fixture("||new.example^\n");
  assert.deepEqual(await local.adapter.apply(incoming(data.manifest), incoming(data.manifest)), { status: "applied" });
  assert.equal(local.producer.state.text, "||new.example^\n");
});

test("explicit remote conflict resolution uses a guarded write", async () => {
  const data = await bundle("||remote.example^\n");
  const local = fixture("||local.example^\n");
  local.stage(data);
  const plan = await local.adapter.prepare(incoming(data.manifest), null, { resolution: { choice: "remote" } });
  assert.deepEqual(await local.adapter.applyPrepared(plan), { status: "applied" });
  assert.equal(local.producer.state.text, "||remote.example^\n");
});

test("authenticated deletion does not turn into a new empty manifest", async () => {
  const old = await bundle("||old.example^\n");
  const local = fixture("||old.example^\n");
  const removed = { id: SYNC_FILTERS_ID, deleted: true, value: null, authenticatedSchema: 2 };
  assert.deepEqual(await local.adapter.apply(removed, incoming(old.manifest)), { status: "applied" });
  local.records.set(SYNC_FILTERS_ID, { remote: removed });
  assert.equal(await local.adapter.read(SYNC_FILTERS_ID), null);
  assert.equal(local.producer.state.text, "");
  const unverified = fixture("||old.example^\n");
  assert.deepEqual(await unverified.adapter.apply({ ...removed, authenticatedSchema: 1 }, incoming(old.manifest)),
    { status: "conflict", reason: "unverified_deletion" });
  assert.equal(unverified.producer.writes, 0);
});

test("old immutable parts are retained without inferring deletions from the current file", async () => {
  const old = await bundle("||old.example^\n");
  const local = fixture("||new.example^\n");
  local.stage(old);
  assert.deepEqual(await local.adapter.read(old.parts[0].id), old.parts[0].value);
  assert.equal(local.adapter.canDelete(old.parts[0].id), false);
  const foreign = await bundle("||foreign.example^\n", "public other account");
  await assert.rejects(local.adapter.validate(SYNC_FILTERS_ID, foreign.manifest), /invalid_record/);
  const bad = structuredClone(old.parts[0]);
  bad.value.text = "||bad.example^\n";
  await assert.rejects(local.adapter.validate(bad.id, bad.value), /invalid_record/);
});

test("observers request a new inventory and detach when the adapter closes", async () => {
  const local = fixture("||old.example^\n");
  const before = await local.adapter.listIds();
  local.producer.edit("||new.example^\n");
  assert.equal(local.hints, 1);
  assert.notDeepEqual(await local.adapter.listIds(), before);
  local.adapter.close();
  assert.equal(local.listeners.size, 0);
  local.producer.edit("||after.example^\n");
  assert.equal(local.hints, 1);
  await assert.rejects(local.adapter.listIds(), /cancelled/);
});

test("JSON field order does not change cross-client manifest compatibility", async () => {
  const data = await bundle("||portable.example^\n");
  const local = fixture();
  local.stage(data);
  const reordered = Object.fromEntries(Object.entries(data.manifest).reverse());
  reordered.parts = reordered.parts.map(part => Object.fromEntries(Object.entries(part).reverse()));
  assert.deepEqual(await local.adapter.apply(incoming(reordered)), { status: "applied" });
  assert.equal(local.producer.state.text, "||portable.example^\n");
});
