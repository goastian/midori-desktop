/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import test from "node:test";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { MidoriSyncCollection, validateSyncCollectionState } from "../src/browser/components/sync/MidoriSyncCollection.sys.mjs";
import { MidoriSyncBookmarkTracker } from "../src/browser/components/sync/MidoriSyncBookmarkTracker.sys.mjs";
import { SyncProtocolError, validateChangePage } from "../src/browser/components/sync/MidoriSyncProtocol.sys.mjs";
import { signSyncControl } from "../src/browser/components/sync/MidoriSyncControl.sys.mjs";
import { MidoriSyncExtensions } from "../src/browser/components/sync/MidoriSyncExtensions.sys.mjs";
import { MidoriSyncExtensionSettings } from "../src/browser/components/sync/MidoriSyncExtensionSettings.sys.mjs";
import { fixture as extensionSettingsFixture, addonId as settingsExtensionId, digest as settingsDigest } from "./sync-extension-settings-fixtures.mjs";
import { deriveSyncExtensionId } from "../src/browser/components/sync/MidoriSyncExtensionModel.sys.mjs";
import { extensionStoreFixture, addonId as extensionId, value as extensionValue, gate, turn } from "./sync-extension-fixtures.mjs";
import { openSyncRecord, sealSyncRecord } from "../src/browser/components/sync/MidoriSyncRecord.sys.mjs";
import {
  isSyncPasswordIdentityAlias, syncPasswordValueDigest, validSyncPasswordReplacement,
  validateSyncPasswordIdentityAlias,
} from "../src/browser/components/sync/MidoriSyncPasswordIdentity.sys.mjs";

const epoch = randomUUID();
const activeKeyId = Buffer.alloc(16, 1).toString("base64url");
const retiredKeyId = Buffer.alloc(16, 2).toString("base64url");
const encoder = new TextEncoder();
const clone = value => structuredClone(value);
const failure = code => new SyncProtocolError(code);
const entryId = (collection, kind, id) => {
  const hex = createHash("sha256").update(JSON.stringify([collection, kind, id])).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

test("authenticated matching creates can satisfy an adapter's queued immutable value", async () => {
  const server = backend();
  const a = device(server, "midori-privacy");
  const b = device(server, "midori-privacy");
  for (const owner of [a, b]) {
    owner.keys.snapshot.custody = "client";
    owner.adapter.canAdoptRecord = () => true;
    await owner.engine.run();
    owner.data.set("same-part", { title: "Identical immutable value" });
    await owner.engine.capture("same-part");
  }
  await a.engine.run();
  await b.engine.run();
  assert.equal(b.engine.snapshot.pending, 0);
  assert.equal(b.engine.snapshot.conflicts, 0);
  assert.equal((await b.engine.record("same-part")).remote.revision, "1");
  assert.deepEqual(b.data.get("same-part"), { title: "Identical immutable value" });
});

test("matching adoption preserves the exact queued operation until an authenticated download", async () => {
  const server = backend();
  const a = device(server, "midori-privacy");
  const b = device(server, "midori-privacy");
  for (const owner of [a, b]) {
    owner.keys.snapshot.custody = "client";
    owner.adapter.canAdoptRecord = () => true;
    await owner.engine.run();
    owner.data.set("same-part", { title: "Shared" });
    await owner.engine.capture("same-part");
  }
  await a.engine.run();
  const queued = await b.store.list("midori-privacy", "outbox");
  server.state.beforeRequest = action => {
    if (action === "changes") { throw failure("network_error"); }
  };
  await assert.rejects(b.engine.run(), { code: "network_error" });
  assert.deepEqual(await b.store.list("midori-privacy", "outbox"), queued);
  assert.equal(b.engine.snapshot.conflicts, 0);
  b.engine.close();
  b.engine = b.create();
  server.state.beforeRequest = null;
  await b.engine.run();
  assert.equal(b.engine.snapshot.pending, 0);
  assert.equal(b.engine.snapshot.conflicts, 0);
});

test("a quarantined incompatible remote record cannot keep an eligible create refreshing forever", async () => {
  const server = backend();
  const local = device(server, "midori-privacy");
  const peer = device(server, "midori-privacy");
  for (const owner of [local, peer]) {
    owner.keys.snapshot.custody = "client";
    await owner.engine.run();
  }
  local.adapter.canAdoptRecord = () => true;
  const validate = local.adapter.validate;
  local.adapter.validate = (id, value) => {
    if (value?.title === "Incompatible peer value") { throw failure("invalid_record"); }
    return validate(id, value);
  };
  local.data.set("same-part", { title: "Preserved local value" });
  await local.engine.capture("same-part");
  const queued = (await local.store.list("midori-privacy", "outbox"))[0].value;
  peer.data.set("same-part", { title: "Incompatible peer value" });
  await peer.engine.capture("same-part");
  await peer.engine.run();
  server.state.requests.length = 0;
  await local.engine.run();
  assert.equal(local.engine.snapshot.pending, 1, "The original operation waits for its first authenticated refresh");
  assert.equal(local.engine.snapshot.conflicts, 1, "The incompatible peer value is retained in quarantine");
  await local.engine.run();
  assert.equal(local.engine.snapshot.pending, 0, "A known quarantined revision becomes an explicit upload conflict");
  assert.equal(local.engine.snapshot.conflicts, 2);
  assert.ok((await local.engine.record("same-part")).blocked);
  const conflicts = await local.store.list("midori-privacy", "conflict");
  assert.deepEqual(conflicts.find(row => row.value.source === "upload").value.queued, queued,
    "The original operation and ciphertext remain available for recovery");
  assert.deepEqual(local.data.get("same-part"), { title: "Preserved local value" });
  await local.engine.run();
  assert.equal(server.state.requests.filter(request => request.action === "operations").length, 2,
    "Further passes do not keep submitting the same incompatible create");
});

test("matching adoption never discards divergent values, deletions, followups or unauthenticated records", async () => {
  for (const scenario of ["different", "deleted", "followup", "unprotected", "unsupported"]) {
    const server = backend();
    const a = device(server, "midori-privacy");
    const b = device(server, "midori-privacy");
    for (const owner of [a, b]) {
      owner.keys.snapshot.custody = scenario === "unprotected" ? "server" : "client";
      if (scenario !== "unsupported") { owner.adapter.canAdoptRecord = () => true; }
      await owner.engine.run();
    }
    a.data.set("same-part", { title: "Remote" });
    b.data.set("same-part", { title: scenario === "different" ? "Local" : "Remote" });
    await a.engine.capture("same-part");
    if (scenario === "deleted") {
      b.data.delete("same-part");
      await b.engine.enqueue("same-part", null, { deleted: true });
    } else {
      await b.engine.capture("same-part");
    }
    if (scenario === "followup") {
      b.data.set("same-part", { title: "Newer local" });
      await b.engine.capture("same-part");
    }
    await a.engine.run();
    await b.engine.run();
    assert.ok(b.engine.snapshot.conflicts > 0, scenario);
    assert.deepEqual(b.data.get("same-part") ?? null,
      scenario === "deleted" ? null : { title: scenario === "followup" ? "Newer local" : scenario === "different" ? "Local" : "Remote" }, scenario);
  }
});

test("matching adoption keeps a recoverable conflict through batched cleanup and a failed final transaction", async () => {
  const server = backend();
  const a = device(server, "midori-privacy");
  const b = device(server, "midori-privacy");
  for (const owner of [a, b]) {
    owner.keys.snapshot.custody = "client";
    await owner.engine.run();
  }
  a.data.set("same-part", { title: "First remote" });
  b.data.set("same-part", { title: "Original local" });
  b.adapter.apply = async () => ({ status: "conflict", reason: "synthetic_conflict" });
  await a.engine.capture("same-part");
  await a.engine.run();
  await b.engine.run();
  const conflict = (await b.store.list("midori-privacy", "conflict"))[0];
  const state = [...b.store.rows.values()].find(row => row.collection === "midori-privacy" && row.kind === "metadata");
  const additions = Array.from({ length: 105 }, () => ({ ...clone(conflict), id: randomUUID(), expectedRevision: 0 }));
  await b.store.commit(additions);
  await b.store.commit([{ ...clone(state), expectedRevision: state.revision,
    value: { ...state.value, conflicts: state.value.conflicts + additions.length } }]);
  b.engine.close();
  b.engine = b.create();
  b.adapter.canAdoptRecord = () => true;
  a.data.set("same-part", { title: "Converged" });
  b.data.set("same-part", { title: "Converged" });
  await a.engine.capture("same-part");
  await a.engine.run();
  b.store.beforeCommit = changes => {
    assert.ok(changes.length <= 100, "Every cleanup fits the native journal's transaction limit");
    if (changes.some(change => change.kind === "record") && changes.some(change => change.kind === "conflict" && change.deleted)) {
      throw failure("synthetic_write_failure");
    }
  };
  await assert.rejects(b.engine.run(), { code: "synthetic_write_failure" });
  const retained = await b.store.list("midori-privacy", "conflict");
  assert.ok(retained.length > 0 && retained.length < 100);
  assert.ok((await b.engine.record("same-part")).blocked);
  b.engine.close();
  b.store.beforeCommit = null;
  b.engine = b.create();
  await b.engine.run();
  assert.equal(b.engine.snapshot.conflicts, 0);
  assert.equal(b.engine.snapshot.pending, 0);
  assert.equal((await b.engine.record("same-part")).remote.revision, "2");
  assert.deepEqual(b.data.get("same-part"), { title: "Converged" });
});

function journal() {
  return {
    rows: new Map(), beforeCommit: null,
    async clearHistory({ replacement = null } = {}) {
      for (const [id, row] of this.rows) {
        if (row.collection === "history") { this.rows.delete(id); }
      }
      if (replacement) { this.rows.set(replacement.id, clone(replacement)); }
    },
    async read(id) { return clone(this.rows.get(id) ?? null); },
    async list(collection, kind, { after = null, limit = 100 } = {}) {
      return clone([...this.rows.values()].filter(row => row.collection === collection && row.kind === kind && (!after || row.id > after))
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit));
    },
    async commit(changes) {
      await this.beforeCommit?.(changes);
      const next = new Map(this.rows);
      for (const change of changes) {
        const previous = next.get(change.id);
        assert.equal(previous?.revision ?? 0, change.expectedRevision, "Local transaction checks every revision");
        if (change.deleted) {
          next.delete(change.id);
        } else {
          next.set(change.id, clone({ ...change, revision: change.expectedRevision + 1 }));
        }
      }
      this.rows = next;
    },
  };
}

function backend() {
  const state = { generation: randomUUID(), reset: null, control: null, records: new Map(), changes: [], receipts: new Map(), requests: [],
    lostResponse: false, lostClearResponse: false, clearReceipts: new Map(), quota: new Set(), alterResults: null,
    beforeRequest: null, pageSize: 100, ack: "0" };
  const request = async (path, options) => {
    const action = path.split("/").at(-1);
    state.requests.push({ action, body: clone(options.body), query: clone(options.query) });
    await state.beforeRequest?.(action, options);
    if (action === "changes") {
      const cursor = options.query?.cursor ? JSON.parse(options.query.cursor) : { sequence: 0, fence: null };
      const fence = cursor.fence ?? state.changes.length;
      const changes = state.changes.slice(cursor.sequence, fence).slice(0, Math.min(state.pageSize, options.query?.limit ?? 100));
      const sequence = Number(changes.at(-1)?.sequence ?? cursor.sequence);
      const hasMore = sequence < fence;
      return { data: clone({ generation: state.generation, changes, has_more: hasMore, snapshot_sequence: String(fence),
        next_cursor: JSON.stringify({ sequence, fence: hasMore ? fence : null }),
        control_revision: state.control?.control_revision ?? "0", control: state.control,
        ...(state.reset ? { reset: state.reset } : {}) }) };
    }
    if (action === "ack") {
      state.ack = String(Math.max(Number(state.ack), JSON.parse(options.body.cursor).sequence));
      return { data: { generation: state.generation, acknowledged_sequence: state.ack } };
    }
    if (action === "clear") {
      const { operation_id: id, generation, control } = options.body;
      let receipt = state.clearReceipts.get(id);
      if (!receipt) {
        if (generation !== state.generation) { throw failure("reset_required"); }
        receipt = { operation_id: id, previous_generation: generation, generation: control?.generation ?? randomUUID(),
          clear_before: control ? new Date(control.clear_before_ms).toISOString() : "2026-10-01T00:00:00.000000Z",
          deleted_records: state.records.size, ...(control ? { control: clone(control) } : {}) };
        state.control = control ?? null;
        state.clearReceipts.set(id, receipt);
        state.generation = receipt.generation;
        state.reset = { kind: "history_clear", clear_before: receipt.clear_before };
        state.records.clear();
        state.changes = [];
        state.ack = "0";
      }
      if (state.lostClearResponse) { state.lostClearResponse = false; throw failure("network_error"); }
      return { data: clone(receipt) };
    }
    assert.equal(action, "operations");
    assert.equal(options.body.generation, state.generation);
    const results = options.body.operations.map((operation, index) => {
      const { id, operation_id: operationId } = operation;
      const receipt = state.receipts.get(operationId);
      if (receipt) {
        assert.deepEqual(receipt.operation, operation, "A replay preserves the exact operation");
        return { ...receipt.result, index };
      }
      if (state.activeKeyId && JSON.parse(operation.payload).key_id !== state.activeKeyId) {
        return { index, operation_id: operationId, status: "invalid" };
      }
      const current = state.records.get(id);
      const revision = current?.revision ?? "0";
      let result;
      if (state.quota.has(id)) {
        return { index, operation_id: operationId, id, status: "quota_exceeded" };
      }
      if (revision !== operation.base_revision) {
        result = { operation_id: operationId, id, status: "conflict", revision };
      } else {
        const record = { id, revision: String(Number(revision) + 1), deleted: operation.deleted,
          payload: operation.payload ?? "", ttl: operation.ttl ?? null };
        state.records.set(id, record);
        state.changes.push({ sequence: String(state.changes.length + 1), record });
        result = { operation_id: operationId, id, status: "applied", revision: record.revision };
      }
      state.receipts.set(operationId, { operation: clone(operation), result });
      return { ...result, index };
    });
    if (state.lostResponse) { state.lostResponse = false; throw failure("network_error"); }
    state.alterResults?.(results);
    return { data: { generation: state.generation, results } };
  };
  return { state, request };
}

function device(server, collection = "bookmarks", { pageByteBudget = false } = {}) {
  const store = journal();
  const data = new Map();
  const calls = [];
  const keys = {
    snapshot: { status: "ready", custody: "server", activeKeyId },
    writeContext: { epoch, revision: "1" }, beforeOpen: null,
    async deriveRecordId(collection, input) {
      return createHmac("sha256", "synthetic-identity-secret").update(JSON.stringify([collection, input])).digest("hex");
    },
    async sealRecord(context, bytes) {
      return { payload: JSON.stringify({ key_id: this.snapshot.activeKeyId, context, fixture: JSON.parse(new TextDecoder().decode(bytes)) }), crypto: clone(this.writeContext) };
    },
    async openRecord(expected, payload) {
      await this.beforeOpen?.();
      const envelope = JSON.parse(payload);
      if (!envelope.fixture) { throw new DOMException("Fixture authentication failure", "OperationError"); }
      for (const [key, value] of Object.entries(expected)) { assert.equal(envelope.context[key], value); }
      return encoder.encode(JSON.stringify(envelope.fixture));
    },
  };
  const adapter = {
    beforeApply: null, cutoff: null, cleared: [],
    setHistoryCutoff(ms) { this.cutoff = ms; },
    async clearBefore(ms) {
      this.setHistoryCutoff(ms);
      this.cleared.push(ms);
      for (const [id, value] of data) {
        if (value.atMs <= ms) { data.delete(id); }
      }
    },
    async read(id) { return clone(data.get(id) ?? null); },
    matchesLocal(_id, current, base, position) {
      return JSON.stringify(current) === JSON.stringify(base && position ? { ...base, ...position } : base);
    },
    validate(_id, value) {
      if (typeof value?.title !== "string") { throw failure("invalid_record"); }
      return value;
    },
    async apply(incoming) {
      calls.push(incoming.id);
      if (incoming.deleted) { data.delete(incoming.id); } else { data.set(incoming.id, incoming.value); }
      await this.beforeApply?.(incoming);
      return { status: "applied" };
    },
  };
  const clock = { now: Date.now() };
  const create = () => new MidoriSyncCollection({ collection, journal: store, keys, adapter,
    request: server.request, entryId, createId: randomUUID, now: () => clock.now, pageByteBudget });
  return { store, data, calls, keys, adapter, create, clock, engine: create() };
}


function settingsDevice(server, data = {}) {
  const owner = device(server, "extension-settings");
  owner.keys.snapshot.custody = "client";
  const native = extensionSettingsFixture(data);
  native.adapter.close();
  const reload = () => {
    owner.engine.close(); owner.settings?.close();
    owner.settings = new MidoriSyncExtensionSettings({ store: native.store,
      deriveRecordId: (...args) => owner.keys.deriveRecordId(...args), digest: settingsDigest,
      record: id => owner.engine.record(id) });
    for (const name of ["read", "matchesLocal", "validate", "prepare", "applyPrepared", "flush", "canDelete", "canAdoptRecord", "canResolveConflict", "conflictValue"]) {
      owner.adapter[name] = owner.settings[name].bind(owner.settings);
    }
    owner.engine = owner.create();
  };
  reload();
  owner.reload = reload; owner.native = native;
  owner.captureSettings = async () => {
    for (const id of await owner.settings.listIds()) { await owner.engine.capture(id); }
  };
  return owner;
}

test("extension settings keep a manifest pending across restart until all scoped parts commit", async () => {
  const server = backend(); const a = settingsDevice(server, { data: Array(15000).fill(1e20) });
  const b = settingsDevice(server);
  await a.engine.run();
  const ids = await a.settings.listIds(); const manifestId = ids.at(-1);
  assert.ok(ids.length > 2);
  await a.engine.capture(manifestId); await a.engine.run();
  server.state.requests.length = 0;
  await b.engine.run();
  assert.equal(b.engine.snapshot.deferred, 1);
  assert.deepEqual(b.native.data(), {});
  assert.equal(server.state.requests.some(request => request.action === "ack"), false,
    "A downloaded manifest cannot acknowledge an incomplete native application");
  b.reload();
  for (const id of ids.slice(0, -1)) { await a.engine.capture(id); }
  await a.engine.run();
  for (let pass = 0; pass < 4 && (b.engine.snapshot.more || !b.engine.snapshot.initialized); ++pass) { await b.engine.run(); }
  assert.equal(b.engine.snapshot.deferred, 0);
  assert.equal(b.engine.snapshot.conflicts, 0);
  assert.deepEqual(b.native.data(), a.native.data());
  assert.equal(b.native.writes, 1);
  assert.equal((await b.engine.record(manifestId)).remote.value.addonId, settingsExtensionId);
});

test("extension settings synchronize both directions and publish a complete disjoint merge", async () => {
  const server = backend(); const a = settingsDevice(server, { one: 1, two: 1 }); const b = settingsDevice(server);
  await a.engine.run(); await a.captureSettings(); await a.engine.run(); await b.engine.run();
  assert.deepEqual(b.native.data(), { one: 1, two: 1 });
  b.native.set({ one: 2, two: 1 }); a.native.set({ one: 1, two: 2 });
  await a.captureSettings(); await a.engine.run(); await b.engine.run();
  assert.equal(b.engine.snapshot.conflicts, 0);
  assert.deepEqual(b.native.data(), { one: 2, two: 2 });
  await b.captureSettings(); await b.engine.run(); await a.engine.run();
  assert.deepEqual(a.native.data(), { one: 2, two: 2 });
  const manifest = server.state.records.get((await b.settings.listIds()).at(-1));
  assert.equal(manifest.revision, "3");
  for (const owner of [a, b]) {
    await owner.engine.run(); await owner.captureSettings();
    assert.equal(owner.engine.snapshot.pending, 0, "Converged configuration does not keep uploading");
    assert.equal(owner.engine.snapshot.conflicts, 0);
  }
});

test("extension settings retain an application across native failure and a lost server receipt", async () => {
  const server = backend(); const a = settingsDevice(server, { portable: true }); const b = settingsDevice(server);
  await a.engine.run(); await a.captureSettings(); server.state.lostResponse = true;
  await assert.rejects(a.engine.run(), { code: "network_error" });
  const outbox = await a.store.list("extension-settings", "outbox");
  a.reload(); await a.engine.run();
  assert.equal(a.engine.snapshot.pending, 0);
  assert.equal(server.state.records.size, outbox.length);
  b.native.afterCommitError = true;
  await assert.rejects(b.engine.run(), { code: "native_write_failed" });
  assert.deepEqual(b.native.data(), { portable: true });
  assert.equal(b.engine.snapshot.deferred, 1);
  assert.equal((await b.store.list("extension-settings", "application")).length, 1);
  b.native.afterCommitError = false; b.reload(); await b.engine.run();
  assert.equal(b.native.writes, 1);
  assert.equal(b.engine.snapshot.deferred, 0);
  assert.equal((await b.store.list("extension-settings", "application")).length, 0);
  assert.ok(b.native.barriers > 0);
});

test("extension settings conflict resolution preserves newer local edits and scopes deliberate deletion", async () => {
  const server = backend(); const a = settingsDevice(server, { key: "base" }); const b = settingsDevice(server);
  await a.engine.run(); await a.captureSettings(); await a.engine.run(); await b.engine.run();
  b.native.set({ key: "local" }); a.native.set({ key: "remote" });
  await a.captureSettings(); await a.engine.run(); await b.engine.run();
  assert.deepEqual(b.native.data(), { key: "local" }); assert.equal(b.engine.snapshot.conflicts, 1);
  const page = await b.engine.conflictPage(); const conflict = page.entries[0];
  assert.ok(conflict);
  const preview = await b.engine.conflictPreview(conflict);
  b.native.set({ key: "newer-local" });
  await assert.rejects(b.engine.resolveConflict({ ...conflict, choice: "remote", localRevision: preview.localRevision }), { code: "conflict_changed" });
  assert.deepEqual(b.native.data(), { key: "newer-local" });
  const currentPreview = await b.engine.conflictPreview(conflict);
  await b.engine.resolveConflict({ ...conflict, choice: "remote", localRevision: currentPreview.localRevision });
  await b.engine.run();
  assert.deepEqual(b.native.data(), { key: "remote" }); assert.equal(b.engine.snapshot.conflicts, 0);
  const id = (await b.settings.listIds()).at(-1);
  b.native.set(null, settingsExtensionId, { status: "removed", source: "user",
    native: { catalog: "amo", addonId: settingsExtensionId, scope: "absent", removedByUser: true, removalToken: "fixture-user-removal" } });
  await b.engine.capture(id); await b.engine.run(); await a.engine.run();
  assert.deepEqual(a.native.data(), {});
  assert.equal(server.state.records.get(id).deleted, true);
  await a.captureSettings(); assert.equal(a.engine.snapshot.pending, 0);
});

test("native persistence failure retains the application until a successful barrier and ACK", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  await a.engine.enqueue("durable-native", { title: "Received native value" });
  await a.engine.run();
  const b = device(server);
  b.adapter.flush = async () => { throw Object.assign(new Error("synthetic native I/O failure"), { code: 0 }); };
  await assert.rejects(b.engine.run(), { code: "native_write_failed" });
  assert.deepEqual(b.data.get("durable-native"), { title: "Received native value" });
  assert.equal((await b.store.list("bookmarks", "application")).length, 1);
  assert.equal(b.engine.snapshot.deferred, 1);
  assert.equal(b.engine.snapshot.lastCompletedAt, null);
  b.engine.close();
  let persisted = false;
  b.adapter.flush = async () => { persisted = true; };
  b.engine = b.create();
  await b.engine.run();
  assert.ok(persisted);
  assert.equal((await b.store.list("bookmarks", "application")).length, 0);
  assert.equal(b.engine.snapshot.deferred, 0);
  assert.deepEqual((await b.engine.record("durable-native")).remote.value, { title: "Received native value" });
});

test("native persistence failure cannot replace a queued operation or its durable followup", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  a.data.set("durable-capture", { title: "First edit" });
  a.adapter.flush = async () => { throw failure("native_write_failed"); };
  await assert.rejects(a.engine.capture("durable-capture"), { code: "native_write_failed" });
  assert.equal((await a.store.list("bookmarks", "outbox")).length, 0);
  a.adapter.flush = async () => {};
  await a.engine.capture("durable-capture");
  const original = await a.store.list("bookmarks", "outbox");
  a.data.set("durable-capture", { title: "Second edit" });
  a.adapter.flush = async () => { throw failure("native_write_failed"); };
  await assert.rejects(a.engine.capture("durable-capture"), { code: "native_write_failed" });
  assert.deepEqual(await a.store.list("bookmarks", "outbox"), original);
  assert.equal((await a.engine.record("durable-capture")).localChange ?? null, null);
  a.adapter.flush = async () => {};
  await a.engine.capture("durable-capture");
  assert.deepEqual((await a.engine.record("durable-capture")).localChange.value, { title: "Second edit" });
  assert.deepEqual(await a.store.list("bookmarks", "outbox"), original);
});

test("unchanged inventories do not force native writes", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  let writes = 0;
  a.adapter.flush = async () => { ++writes; };
  assert.equal((await a.engine.capture("absent")).status, "unchanged");
  assert.equal(writes, 0);
});

test("negotiated page budgets are sent before downloading while older servers keep their query", async () => {
  for (const pageByteBudget of [false, true]) {
    const server = backend();
    const a = device(server, "bookmarks", { pageByteBudget });
    await a.engine.run();
    const pages = server.state.requests.filter(request => request.action === "changes");
    assert.ok(pages.length);
    for (const page of pages) {
      assert.equal(page.query.max_bytes, pageByteBudget ? 2 * 1024 * 1024 : undefined);
    }
  }
});

test("cancelling after a server receipt preserves the exact operation and reuses the live engine", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  await a.engine.enqueue("paused-record", { title: "Pending during pause" });
  const before = await a.store.list("bookmarks", "outbox");
  let signal;
  server.state.beforeRequest = (action, options) => {
    if (action === "operations") { signal = options.signal; a.engine.cancel(); }
  };
  await assert.rejects(a.engine.run(), { code: "cancelled" });
  assert.ok(signal.aborted);
  assert.equal(server.state.records.get("paused-record").revision, "1");
  assert.deepEqual(await a.store.list("bookmarks", "outbox"), before);
  assert.equal(a.engine.snapshot.pending, 1);
  assert.equal(a.engine.snapshot.error, null);
  server.state.beforeRequest = null;
  await a.engine.run();
  assert.equal(a.engine.snapshot.pending, 0);
  assert.equal(server.state.records.get("paused-record").revision, "1");
  const operations = server.state.requests.filter(request => request.action === "operations");
  assert.deepEqual(operations[0].body.operations, operations[1].body.operations);
});

test("cancellation at a journal commit reloads durable counts without discarding the new queue", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  a.data.set("paused-commit", { title: "Native value is kept" });
  a.store.beforeCommit = changes => {
    if (changes.some(change => change.kind === "outbox")) { a.engine.cancel(); }
  };
  await assert.rejects(a.engine.capture("paused-commit"), { code: "cancelled" });
  assert.equal(a.engine.snapshot.pending, 1, "The status reads the committed metadata after cancellation");
  const before = await a.store.list("bookmarks", "outbox");
  assert.equal(before.length, 1);
  assert.equal(server.state.records.size, 0);
  a.store.beforeCommit = null;
  await a.engine.run();
  assert.equal(a.engine.snapshot.pending, 0);
  assert.deepEqual(a.data.get("paused-commit"), { title: "Native value is kept" });
  assert.deepEqual(server.state.requests.find(request => request.action === "operations").body.operations[0], before[0].value.operation);
});

test("cancellation during native application retains its durable intention for resume", async () => {
  const server = backend();
  const a = device(server);
  const b = device(server);
  await a.engine.run();
  await a.engine.enqueue("paused-application", { title: "Applied before pause" });
  await a.engine.run();
  b.adapter.beforeApply = () => b.engine.cancel();
  await assert.rejects(b.engine.run(), { code: "cancelled" });
  assert.deepEqual(b.data.get("paused-application"), { title: "Applied before pause" });
  assert.equal((await b.store.list("bookmarks", "application")).length, 1);
  b.adapter.beforeApply = null;
  await b.engine.run();
  assert.equal((await b.store.list("bookmarks", "application")).length, 0);
  assert.equal(b.engine.snapshot.conflicts, 0);
  assert.deepEqual(b.data.get("paused-application"), { title: "Applied before pause" });
});

test("byte-limited local pages continue until an empty page for inventory and capture", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  for (const id of ["bookmark-a", "bookmark-b", "bookmark-c"]) {
    a.data.set(id, { title: id });
    await a.engine.capture(id);
  }
  await a.engine.run();
  const list = a.store.list.bind(a.store);
  a.store.list = (collection, kind, query) => list(collection, kind,
    { ...query, limit: kind === "record" ? 1 : query?.limit });
  for (const method of ["recordPage", "capturePage"]) {
    const ids = [];
    let after = null;
    do {
      const page = await a.engine[method]({ after, limit: 100 });
      ids.push(...(page.entries ?? page.results).map(entry => entry.id));
      after = page.nextAfter;
    } while (after);
    assert.deepEqual(ids.sort(), ["bookmark-a", "bookmark-b", "bookmark-c"]);
  }
});

test("client custody authenticates tombstones and preserves their ciphertext on retry", async () => {
  const server = backend();
  const a = device(server);
  const b = device(server);
  a.keys.snapshot = b.keys.snapshot = { status: "ready", custody: "client", activeKeyId };
  await a.engine.run();
  await a.engine.enqueue("protected", { title: "Original" });
  await a.engine.run();
  await b.engine.run();
  assert.deepEqual(b.data.get("protected"), { title: "Original" });
  await a.engine.enqueue("protected", null, { deleted: true });
  const queued = [...a.store.rows.values()].find(row => row.kind === "outbox").value.operation;
  assert.ok(queued.payload);
  assert.equal(JSON.parse(queued.payload).context.schema_version, 2);
  server.state.lostResponse = true;
  await assert.rejects(a.engine.run(), { code: "network_error" });
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  await b.engine.run();
  assert.equal(b.data.has("protected"), false);
  assert.equal(server.state.records.get("protected").payload, queued.payload);
});

test("a forged deletion flag cannot delete authenticated data", async () => {
  const server = backend();
  const a = device(server);
  const b = device(server);
  a.keys.snapshot = b.keys.snapshot = { status: "ready", custody: "client", activeKeyId };
  await a.engine.run();
  await a.engine.enqueue("protected", { title: "Original" });
  await a.engine.run();
  const record = server.state.changes[0].record;
  record.deleted = true;
  b.data.set("protected", { title: "Local preserved" });
  await b.engine.run();
  assert.deepEqual(b.data.get("protected"), { title: "Local preserved" });
  assert.equal(b.engine.snapshot.conflicts, 1);
  assert.equal(b.calls.length, 0);
});

test("an altered TTL cannot expire an authenticated record", async () => {
  const server = backend();
  const a = device(server);
  const b = device(server);
  a.keys.snapshot = b.keys.snapshot = { status: "ready", custody: "client", activeKeyId };
  a.adapter.ttlOf = () => new Date(Date.now() + 86400000).toISOString();
  await a.engine.run();
  await a.engine.enqueue("protected", { title: "Original" });
  await a.engine.run();
  server.state.changes[0].record.ttl = "2000-01-01T00:00:00+00:00";
  await b.engine.run();
  assert.equal(b.engine.snapshot.conflicts, 1);
  assert.equal(b.calls.length, 0);
});

test("client custody rejects bare tombstones and schema downgrade", async () => {
  const server = backend();
  remote(server, "legacy", "Legacy ciphertext");
  server.state.changes.push({ sequence: "2", record: {
    id: "bare", revision: "1", deleted: true, payload: "", ttl: null,
  } });
  const b = device(server);
  b.keys.snapshot = { status: "ready", custody: "client", activeKeyId };
  await b.engine.run();
  assert.equal(b.engine.snapshot.conflicts, 2);
  assert.equal(b.calls.length, 0);
});

function rotatedDevice(server, collection = "bookmarks") {
  const result = device(server, collection);
  result.keys.snapshot = { status: "ready", custody: "client", activeKeyId,
    rotation: { operation_id: randomUUID(), phase: "complete", source_key_ids: [retiredKeyId] } };
  return result;
}

function protectedRemote(server, id, revision, { keyId = activeKeyId, schema = 2, deleted = false,
  title = "Current", collection = "bookmarks", generation = server.state.generation } = {}) {
  const value = { title };
  const record = { id, revision, deleted, ttl: null, payload: JSON.stringify({ key_id: keyId,
    context: { collection, id, generation, schema_version: schema, base_revision: String(BigInt(revision) - 1n) },
    fixture: schema === 1 ? value : { version: 2, deleted, ttl: null, value: deleted ? null : value },
  }) };
  server.state.records.set(id, record);
  server.state.changes.push({ sequence: String(server.state.changes.length + 1), record });
  return record;
}

async function queuedRetiredDeletion() {
  const server = backend();
  const a = rotatedDevice(server, "passwords");
  protectedRemote(server, "a", "1", { collection: "passwords" });
  protectedRemote(server, "b", "1", { collection: "passwords" });
  await a.engine.run();
  const row = await a.store.read(entryId("passwords", "record", "b"));
  await a.store.commit([{ ...row, expectedRevision: row.revision, value: { ...row.value, replacementId: "a" } }]);
  a.data.delete("b");
  a.adapter.canDelete = async (_id, _base, { record }) => {
    const canonical = await record("a");
    return Boolean(canonical?.remote && !canonical.pending && !canonical.blocked &&
      JSON.stringify(canonical.remote.value) === JSON.stringify(a.data.get("a")));
  };
  await a.engine.capture("b");
  return { server, a, original: await a.store.list("passwords", "outbox") };
}

test("a concurrent authenticated retirement settles the original deletion after its native barrier", async () => {
  const { server, a, original } = await queuedRetiredDeletion();
  const acknowledged = server.state.ack;
  protectedRemote(server, "b", "2", { collection: "passwords", deleted: true });
  let retained = false;
  server.state.beforeRequest = async action => {
    if (action === "changes" && a.engine.snapshot.pending) {
      assert.deepEqual(await a.store.list("passwords", "outbox"), original);
      retained = true;
    }
  };
  a.adapter.flush = async () => { throw failure("native_write_failed"); };
  await assert.rejects(a.engine.run(), { code: "native_write_failed" });
  assert.equal(retained, true, "A CAS conflict retains the exact operation until the authenticated feed arrives");
  assert.deepEqual(await a.store.list("passwords", "outbox"), original);
  assert.equal(server.state.ack, acknowledged);
  a.engine.close();
  a.engine = a.create();
  a.adapter.flush = async () => {};
  await a.engine.run();
  assert.equal(a.engine.snapshot.pending, 0);
  assert.equal(a.engine.snapshot.conflicts, 0);
  assert.deepEqual(a.data.get("a"), { title: "Current" });
  assert.equal((await a.engine.record("b")).remote.revision, "2");
  assert.equal(server.state.requests.filter(request => request.action === "operations").length, 1);
});

test("retirement cannot discard a native restoration, a successor or an unauthenticated tombstone", async () => {
  for (const mode of ["restoration", "successor", "unauthenticated"]) {
    const { server, a, original } = await queuedRetiredDeletion();
    if (mode === "unauthenticated") {
      const record = { id: "b", revision: "2", deleted: true, payload: "", ttl: null };
      server.state.records.set("b", record);
      server.state.changes.push({ sequence: String(server.state.changes.length + 1), record });
    } else {
      a.data.set("b", { title: "Native restoration" });
      if (mode === "successor") {
        await a.engine.capture("b");
      }
      protectedRemote(server, "b", "2", { collection: "passwords", deleted: true });
    }
    await a.engine.run();
    assert.ok(a.engine.snapshot.conflicts > 0);
    assert.deepEqual(a.data.get("a"), { title: "Current" });
    if (mode !== "unauthenticated") {
      assert.deepEqual(a.data.get("b"), { title: "Native restoration" });
    }
    if (mode === "successor") {
      assert.deepEqual((await a.engine.record("b")).localChange.value, { title: "Native restoration" });
    } else {
      assert.deepEqual(await a.store.list("passwords", "outbox"), original);
    }
  }
});

test("a retained escrow key cannot authenticate a new deletion after migration completes", async () => {
  const server = backend();
  const a = rotatedDevice(server);
  a.data.set("protected", { title: "Preserved" });
  protectedRemote(server, "protected", "1", { keyId: retiredKeyId, deleted: true });
  let opened = 0;
  a.keys.beforeOpen = () => { ++opened; };
  await a.engine.run();
  assert.equal(opened, 0, "Retired network keys are rejected before attempting decryption");
  assert.deepEqual(a.data.get("protected"), { title: "Preserved" });
  assert.equal(a.calls.length, 0);
  assert.equal(await a.engine.record("protected"), null, "Untrusted historical content cannot become the local baseline");
  const conflicts = await a.store.list("bookmarks", "conflict");
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].value.source, "historical-key");
});

test("repeated retired journal entries share one durable quarantine and a newer active record resolves it", async () => {
  const server = backend();
  server.state.pageSize = 1;
  const a = rotatedDevice(server);
  protectedRemote(server, "migrated", "1", { keyId: retiredKeyId, schema: 1, title: "Legacy" });
  protectedRemote(server, "migrated", "1", { keyId: retiredKeyId, schema: 1, title: "Repeated legacy" });
  protectedRemote(server, "migrated", "2", { keyId: retiredKeyId, title: "Old version" });
  await a.engine.run();
  assert.equal(a.engine.snapshot.conflicts, 1);
  assert.equal((await a.store.list("bookmarks", "conflict")).length, 1);
  assert.equal(a.calls.length, 0);
  a.engine.close();
  a.engine = a.create();
  protectedRemote(server, "migrated", "3", { title: "Migrated" });
  const commits = [];
  a.store.beforeCommit = changes => commits.push(clone(changes));
  await a.engine.run();
  assert.deepEqual(a.data.get("migrated"), { title: "Migrated" });
  assert.equal(a.engine.snapshot.conflicts, 0);
  assert.equal((await a.store.list("bookmarks", "conflict")).length, 0);
  assert.ok(commits.some(changes => changes.some(change => change.kind === "conflict" && change.deleted) &&
    changes.some(change => change.kind === "application" && !change.deleted)), "Replacement is durable in the transaction that removes quarantine");
});

test("a fresh device applies only the active replacement after reading the legacy journal", async () => {
  const server = backend();
  protectedRemote(server, "migrated", "1", { keyId: retiredKeyId, schema: 1, title: "Legacy" });
  protectedRemote(server, "migrated", "2", { title: "Current" });
  const a = rotatedDevice(server);
  await a.engine.run();
  assert.deepEqual(a.calls, ["migrated"]);
  assert.deepEqual(a.data.get("migrated"), { title: "Current" });
  assert.equal(a.engine.snapshot.conflicts, 0);
});

test("a replacement removes only historical quarantine and retains local pending work and conflicts", async () => {
  const server = backend();
  const a = rotatedDevice(server);
  await a.engine.run();
  await a.engine.enqueue("migrated", { title: "Local edit" });
  server.state.quota.add("migrated");
  protectedRemote(server, "unrelated", "1", { keyId: "unknown-key" });
  protectedRemote(server, "migrated", "1", { keyId: retiredKeyId, schema: 1 });
  protectedRemote(server, "migrated", "2", { title: "Remote edit" });
  await a.engine.run();
  assert.equal(a.engine.snapshot.pending, 1);
  assert.equal(a.engine.snapshot.conflicts, 2);
  const conflicts = await a.store.list("bookmarks", "conflict");
  assert.deepEqual(conflicts.map(entry => entry.value.outcome.reason).sort(), ["local_change_pending", "record_authentication_failed"]);
  const [queued] = await a.store.list("bookmarks", "outbox");
  assert.deepEqual(queued.value.value, { title: "Local edit" });
  assert.equal((await a.engine.record("migrated")).pending, queued.id);
  assert.equal(a.calls.length, 0);
});

test("unrelated, unauthenticated, equal or older records cannot resolve historical quarantine", async () => {
  for (const replacement of [
    { id: "different", revision: "3" },
    { id: "protected", revision: "3", options: { keyId: "unknown-key" } },
    { id: "protected", revision: "3", options: { generation: randomUUID() }, corrupt: true },
    { id: "protected", revision: "2" },
    { id: "protected", revision: "1" },
  ]) {
    const server = backend();
    const a = rotatedDevice(server);
    protectedRemote(server, "protected", "2", { keyId: retiredKeyId });
    const record = protectedRemote(server, replacement.id, replacement.revision, replacement.options);
    if (replacement.corrupt) {
      const payload = JSON.parse(record.payload);
      delete payload.fixture;
      record.payload = JSON.stringify(payload);
    }
    await a.engine.run();
    const conflicts = await a.store.list("bookmarks", "conflict");
    assert.ok(conflicts.some(entry => entry.value.source === "historical-key"));
  }
});

test("only completed rotation source keys in the expected context receive historical quarantine", async () => {
  for (const mutate of [
    a => { a.keys.snapshot.rotation.phase = "rewriting"; },
    a => { a.keys.snapshot.rotation.source_key_ids = []; },
    a => { a.keys.snapshot.rotation = null; },
    a => { a.keys.snapshot.activeKeyId = null; },
  ]) {
    const server = backend();
    const a = rotatedDevice(server);
    mutate(a);
    protectedRemote(server, "protected", "1", { keyId: retiredKeyId });
    await a.engine.run();
    const [conflict] = await a.store.list("bookmarks", "conflict");
    assert.equal(conflict.value.source, "download");
    assert.equal(conflict.value.outcome.reason, "record_authentication_failed");
  }
  const server = backend();
  const a = rotatedDevice(server);
  protectedRemote(server, "protected", "1", { keyId: retiredKeyId, generation: randomUUID() });
  await a.engine.run();
  const [conflict] = await a.store.list("bookmarks", "conflict");
  assert.equal(conflict.value.source, "download");
});

test("an authenticated history retirement supersedes its legacy locator without deleting local visits", async () => {
  const server = backend();
  const a = rotatedDevice(server, "history");
  const legacyId = `h1:${"a".repeat(64)}`;
  const currentId = `h2:${"b".repeat(64)}`;
  a.data.set(legacyId, { title: "Preserved visits" });
  const apply = a.adapter.apply.bind(a.adapter);
  a.adapter.apply = incoming => incoming.id === legacyId && incoming.deleted && incoming.authenticatedSchema === 2 ?
    { status: "applied" } : apply(incoming);
  protectedRemote(server, legacyId, "1", { collection: "history", keyId: retiredKeyId, schema: 1 });
  protectedRemote(server, currentId, "1", { collection: "history", title: "Migrated visits" });
  protectedRemote(server, legacyId, "2", { collection: "history", deleted: true });
  await a.engine.run();
  assert.deepEqual(a.data.get(legacyId), { title: "Preserved visits" });
  assert.deepEqual(a.data.get(currentId), { title: "Migrated visits" });
  assert.equal(a.engine.snapshot.conflicts, 0);
  assert.equal((await a.engine.record(legacyId)).remote.deleted, true);
});

test("unknown or locked encryption policy cannot read or seal live records or bare tombstones", async () => {
  const context = { collection: "bookmarks", id: "preserved", generation: randomUUID(), base_revision: "0" };
  const payload = JSON.stringify({ context: { ...context, schema_version: 1 }, fixture: { title: "Remote" } });
  for (const snapshot of [
    undefined, {}, { status: "ready" }, { status: "ready", custody: null },
    { status: "locked", custody: "server" }, { status: "locked", custody: "client" },
    { status: "migration-required", custody: "server" }, { status: "ready", custody: "unknown" },
    { status: "ready", custody: "server", busy: true },
  ]) {
    let cryptoCalls = 0;
    const keys = { snapshot,
      async openRecord() { ++cryptoCalls; return encoder.encode('{"title":"Remote"}'); },
      async sealRecord() { ++cryptoCalls; return { payload }; },
      get writeContext() { ++cryptoCalls; return { epoch, revision: "1" }; },
    };
    for (const deleted of [false, true]) {
      const record = { id: context.id, revision: "1", deleted, ttl: null, payload: deleted ? "" : payload };
      await assert.rejects(openSyncRecord(keys, context, record), { code: "keys_locked" });
      await assert.rejects(sealSyncRecord(keys, context, { deleted, value: deleted ? null : { title: "Local" } }),
        { code: "keys_locked" });
    }
    assert.equal(cryptoCalls, 0, "No record processing starts until encryption policy is verified and ready");
  }
});

test("a bare tombstone cannot be applied or acknowledged while custody is unknown", async () => {
  const server = backend();
  server.state.changes.push({ sequence: "1", record: {
    id: "preserved", revision: "1", deleted: true, payload: "", ttl: null,
  } });
  const a = device(server);
  a.keys.snapshot = { status: "ready", custody: null };
  a.data.set("preserved", { title: "Local preserved" });
  await assert.rejects(a.engine.run(), { code: "keys_locked" });
  assert.equal(a.calls.length, 0);
  assert.deepEqual(a.data.get("preserved"), { title: "Local preserved" });
  assert.equal(server.state.ack, "0");
});

test("an unknown custody policy cannot authorize a history reset before opening records", async () => {
  const server = backend();
  server.state.reset = { kind: "history_clear", clear_before: new Date().toISOString() };
  const a = device(server, "history");
  a.keys.snapshot = { status: "ready", custody: null };
  a.data.set("preserved", { title: "Local history", atMs: 1 });
  await assert.rejects(a.engine.run(), { code: "keys_locked" });
  assert.equal(a.adapter.cleared.length, 0);
  assert.equal(a.data.has("preserved"), true);
  assert.equal(server.state.ack, "0");
});

test("unverified history reset cannot clear a client custody profile", async () => {
  const server = backend();
  server.state.reset = { kind: "history_clear", clear_before: new Date().toISOString() };
  const a = device(server, "history");
  a.keys.snapshot = { status: "ready", custody: "client", activeKeyId };
  a.data.set("preserved", { title: "Local history" });
  await assert.rejects(a.engine.run(), { code: "authenticated_control_required" });
  await assert.rejects(a.engine.clearHistory(), { code: "authenticated_control_required" });
  assert.equal(a.data.size, 1);
  assert.deepEqual(a.adapter.cleared, []);
});

function remote(server, id, title, revision = "1") {
  const record = { id, revision, deleted: false, ttl: null,
    payload: JSON.stringify({ context: { collection: "bookmarks", id, generation: server.state.generation, schema_version: 1, base_revision: String(Number(revision) - 1) }, fixture: { title } }) };
  server.state.records.set(id, record);
  server.state.changes.push({ sequence: String(server.state.changes.length + 1), record });
  return record;
}

function positionedDevice(server) {
  const a = device(server);
  a.preparations = [];
  a.applications = [];
  a.adapter.positionOf = (_id, value) => value?.parentGuid ? { parentGuid: value.parentGuid, index: value.index } : null;
  a.adapter.project = (_id, effects, items) => items.map(item => {
    const position = clone(item.position);
    if (effects.from?.parentGuid === position.parentGuid && position.index > effects.from.index) { position.index--; }
    if (effects.to?.parentGuid === position.parentGuid && position.index >= effects.to.index) { position.index++; }
    return { id: item.id, position };
  });
  a.adapter.prepare = incoming => {
    a.preparations.push(incoming.id);
    const from = a.adapter.positionOf(incoming.id, a.data.get(incoming.id));
    const to = a.adapter.positionOf(incoming.id, incoming.value);
    return { id: incoming.id, incoming, position: to, effects: JSON.stringify(from) === JSON.stringify(to) ? null : { from, to } };
  };
  a.adapter.applyPrepared = plan => {
    a.applications.push(plan.id);
    const unchanged = plan.incoming.deleted ? !a.data.has(plan.id) : JSON.stringify(a.data.get(plan.id)) === JSON.stringify(plan.incoming.value);
    if (!unchanged) {
      if (plan.effects) {
        const siblings = [...a.data].filter(([id]) => id !== plan.id).map(([id, value]) => ({ id, position: a.adapter.positionOf(id, value) }));
        for (const { id, position } of a.adapter.project(plan.id, plan.effects, siblings)) {
          a.data.set(id, { ...a.data.get(id), ...position });
        }
      }
      if (plan.incoming.deleted) { a.data.delete(plan.id); } else { a.data.set(plan.id, clone(plan.incoming.value)); }
    }
    return { status: "applied", position: plan.position, effects: plan.effects };
  };
  return a;
}

function positionedRemote(server, id, index) {
  const record = remote(server, id, id);
  const payload = JSON.parse(record.payload);
  payload.fixture = { title: id, parentGuid: "parent", index };
  record.payload = JSON.stringify(payload);
  return record;
}

function remoteDelete(server, id) {
  const record = remote(server, id, "", "2");
  record.deleted = true;
  record.payload = "";
}

function checkpointDevice(server) {
  const owner = device(server);
  owner.adapter.prepare = incoming => ({ id: incoming.id, incoming, job: randomUUID() });
  owner.adapter.applyPrepared = () => { throw new Error("The native job requires a durable checkpoint callback"); };
  owner.adapter.applyPreparedWithCheckpoint = (plan, { progress, checkpoint, signal }) => {
    owner.signal = signal;
    owner.plan = plan;
    owner.progress = progress;
    owner.checkpoint = checkpoint;
    if (progress?.stage !== "installed") { return { status: "deferred", reason: "native_confirmation" }; }
    owner.data.set(plan.id, clone(plan.incoming.value));
    return { status: "applied" };
  };
  return owner;
}

test("native job checkpoints survive reopening without applying or acknowledging the native change", async () => {
  const server = backend();
  remote(server, "native-job", "Needs permission");
  const owner = checkpointDevice(server);
  await owner.engine.run();
  assert.equal(owner.engine.snapshot.deferred, 1);
  assert.equal(owner.data.size, 0);
  const next = { id: owner.plan.id, stage: "awaiting-user" };
  await owner.checkpoint(next);
  next.stage = "tampered-after-save";
  assert.equal((await owner.store.list("bookmarks", "application"))[0].value.progress.stage, "awaiting-user");
  assert.ok(server.state.requests.every(request => request.action !== "ack"));
  const stale = owner.checkpoint;
  const originalSignal = owner.signal;
  assert.equal(originalSignal.aborted, false);
  owner.engine.cancel();
  assert.equal(originalSignal.aborted, true);
  await assert.rejects(stale({ id: owner.plan.id, stage: "installed" }), { code: "cancelled" });
  owner.engine.close();
  await assert.rejects(stale({ id: owner.plan.id, stage: "installed" }), { code: "cancelled" });
  owner.engine = owner.create();
  await owner.engine.run();
  assert.equal(owner.progress.stage, "awaiting-user");
  assert.notEqual(owner.signal, originalSignal);
  assert.equal(owner.signal.aborted, false);
  assert.equal(owner.data.size, 0);
  await owner.checkpoint({ id: owner.plan.id, stage: "installed" });
  await owner.engine.run();
  assert.equal(owner.engine.snapshot.deferred, 0);
  assert.deepEqual(owner.data.get("native-job"), { title: "Needs permission" });
});

test("native job checkpoints wait for a deferred application to release the engine", { timeout: 3000 }, async () => {
  const server = backend();
  remote(server, "native-job", "Needs permission");
  const owner = checkpointDevice(server);
  let pending;
  const apply = owner.adapter.applyPreparedWithCheckpoint;
  owner.adapter.applyPreparedWithCheckpoint = (plan, context) => {
    if (!pending) { pending = context.checkpoint({ id: plan.id, stage: "awaiting-user" }); }
    return apply(plan, context);
  };
  await owner.engine.run();
  await pending;
  assert.equal((await owner.store.list("bookmarks", "application"))[0].value.progress.stage, "awaiting-user");
  assert.equal(owner.engine.snapshot.deferred, 1);
  assert.equal(owner.data.size, 0);
});

test("native job checkpoints reject stale writers and other record identities", async () => {
  const server = backend();
  remote(server, "native-job", "Needs permission");
  const owner = checkpointDevice(server);
  await owner.engine.run();
  const first = owner.checkpoint;
  await first({ id: owner.plan.id, stage: "awaiting-user" });
  await owner.engine.run();
  const second = owner.checkpoint;
  await second({ id: owner.plan.id, stage: "installed" });
  await assert.rejects(first({ id: owner.plan.id, stage: "declined" }), { code: "application_state_changed" });
  await assert.rejects(second({ id: "another-record" }), { code: "invalid_adapter_result" });
  assert.equal((await owner.store.list("bookmarks", "application"))[0].value.progress.stage, "installed");
  assert.equal(owner.engine.snapshot.error, null, "A superseded background job does not fail the current engine");
  await owner.engine.run();
  await assert.rejects(second({ id: owner.plan.id, stage: "declined" }), { code: "application_state_changed" });
});

test("native job checkpoints are cancelled with their original engine operation", { timeout: 3000 }, async () => {
  const server = backend();
  remote(server, "native-job", "Needs permission");
  const owner = checkpointDevice(server);
  let result;
  owner.adapter.applyPreparedWithCheckpoint = (plan, { checkpoint }) => {
    result = checkpoint({ id: plan.id, stage: "awaiting-user" }).then(() => null, error => error.code);
    owner.engine.cancel();
    return { status: "deferred", reason: "native_confirmation" };
  };
  await assert.rejects(owner.engine.run(), { code: "cancelled" });
  assert.equal(await result, "cancelled");
  assert.equal((await owner.store.list("bookmarks", "application"))[0].value.progress, undefined);
  assert.equal(owner.data.size, 0);
});

test("native job checkpoints preserve the old plan after I/O failure and can retry", async () => {
  const server = backend();
  remote(server, "native-job", "Needs permission");
  const owner = checkpointDevice(server);
  await owner.engine.run();
  const checkpoint = owner.checkpoint;
  owner.store.beforeCommit = changes => {
    if (changes.some(row => row.kind === "application" && row.value?.progress?.stage === "awaiting-user")) {
      throw failure("synthetic_write_failure");
    }
  };
  await assert.rejects(checkpoint({ id: owner.plan.id, stage: "awaiting-user" }), { code: "synthetic_write_failure" });
  assert.equal((await owner.store.list("bookmarks", "application"))[0].value.progress, undefined);
  owner.store.beforeCommit = null;
  await checkpoint({ id: owner.plan.id, stage: "awaiting-user" });
  assert.equal((await owner.store.list("bookmarks", "application"))[0].value.progress.stage, "awaiting-user");
});

test("native job checkpoints cannot attach progress to a later remote revision", async () => {
  const server = backend();
  remote(server, "native-job", "First install");
  const owner = checkpointDevice(server);
  await owner.engine.run();
  const stale = owner.checkpoint;
  remote(server, "native-job", "New install", "2");
  await owner.engine.run();
  await assert.rejects(stale({ id: "native-job", stage: "awaiting-user" }), { code: "application_state_changed" });
  const row = (await owner.store.list("bookmarks", "application"))[0];
  assert.equal(row.value.incoming.revision, "2");
  assert.equal(row.value.progress, undefined);
});

test("native job checkpoints cannot start confirmation after the incoming record expires", async () => {
  const server = backend();
  const record = remote(server, "native-job", "Expiring request");
  const owner = checkpointDevice(server);
  record.ttl = new Date(owner.clock.now + 1000).toISOString();
  await owner.engine.run();
  owner.clock.now += 2000;
  await assert.rejects(owner.checkpoint({ id: "native-job", stage: "awaiting-user" }), { code: "application_state_changed" });
  assert.equal((await owner.store.list("bookmarks", "application"))[0].value.progress, undefined);
  assert.equal(owner.data.size, 0);
  assert.equal(owner.engine.snapshot.error, null);
});

test("a completed pass timestamp survives reopening the encrypted collection state", async () => {
  const a = device(backend());
  await a.engine.initialize();
  await assert.rejects(a.engine.markCompleted(123456789), /bootstrap_required/);
  await a.engine.run();
  assert.equal(a.engine.snapshot.initialized, true);
  const completedAt = 1791000000000;
  assert.equal(await a.engine.markCompleted(completedAt), completedAt);
  assert.equal(a.engine.snapshot.lastCompletedAt, completedAt);
  a.engine.close();
  a.engine = a.create();
  await a.engine.initialize();
  assert.equal(a.engine.snapshot.lastCompletedAt, completedAt);
  assert.equal(await a.engine.markCompleted(completedAt - 1000), completedAt);
  await assert.rejects(a.engine.markCompleted(0), /invalid_sync_time/);
  a.engine.close();
  a.store.rows.get(entryId("bookmarks", "metadata", "collection-state-v1")).value.lastCompletedAt = "invalid";
  a.engine = a.create();
  await assert.rejects(a.engine.initialize(), /engine_state_corrupt/);
});

test("a lost upload response survives restart and replays the same operation once", async () => {
  const server = backend();
  const a = device(server);
  await assert.rejects(a.engine.enqueue("one", { title: "A" }), /bootstrap_required/);
  await a.engine.run();
  const value = { title: "Unicode ñ" };
  const pending = a.engine.enqueue("one", value);
  value.title = "Changed after capture";
  const operationId = await pending;
  server.state.lostResponse = true;
  await assert.rejects(a.engine.run(), /network_error/);
  assert.equal(a.engine.snapshot.pending, 1);
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  assert.equal(server.state.receipts.size, 1);
  assert.equal(server.state.changes.length, 1);
  assert.equal(server.state.requests.filter(r => r.action === "operations")[1].body.operations[0].operation_id, operationId);
  assert.equal(a.engine.snapshot.pending, 0);
  assert.equal(a.engine.snapshot.more, false);
  const b = device(server);
  await b.engine.run();
  assert.deepEqual(b.data.get("one"), { title: "Unicode ñ" });
});



test("partial acceptance retains only quota-limited operations with their original identifiers", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  await a.engine.enqueue("accepted", { title: "A" });
  const pending = await a.engine.enqueue("limited", { title: "B" });
  server.state.quota.add("limited");
  await a.engine.run();
  assert.equal(a.engine.snapshot.pending, 1);
  assert.equal(a.engine.snapshot.error, "quota_exceeded");
  assert.equal((await a.store.list("bookmarks", "outbox"))[0].id, pending);
  server.state.quota.clear();
  await a.engine.run();
  assert.equal(a.engine.snapshot.pending, 0);
  assert.equal(server.state.changes.length, 2);
});

test("a device snapshot carries its server expiry through a durable upload", async () => {
  const server = backend();
  const a = device(server, "tabs");
  a.adapter.ttlOf = value => value.expires_at;
  await a.engine.run();
  const expires = new Date(Math.floor(Date.now() / 1000) * 1000 + 86400000).toISOString();
  await a.engine.enqueue(randomUUID(), { title: "Device snapshot", expires_at: expires });
  await a.engine.run();
  const normalized = expires.replace(".000Z", "+00:00");
  assert.equal(server.state.requests.find(request => request.action === "operations").body.operations[0].ttl, normalized);
  assert.equal([...server.state.records.values()][0].ttl, normalized);
  assert.equal((await a.engine.record([...server.state.records.keys()][0])).remote.ttl, normalized);
});

test("malformed batch results cannot acknowledge even the apparently accepted first operation", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  await a.engine.enqueue("one", { title: "A" });
  await a.engine.enqueue("two", { title: "B" });
  server.state.alterResults = results => { results[1].operation_id = randomUUID(); };
  await assert.rejects(a.engine.run(), /invalid_operation_results/);
  assert.equal((await a.store.list("bookmarks", "outbox")).length, 2);
  assert.equal(a.engine.snapshot.pending, 2);
  server.state.alterResults = null;
  await a.engine.run();
  assert.equal(server.state.changes.length, 2);
  assert.equal(a.engine.snapshot.pending, 0);
});

test("a restart after native application resumes the saved inbox before downloading again", async () => {
  const server = backend();
  remote(server, "one", "A");
  remote(server, "two", "B");
  const a = device(server);
  let fail = true;
  a.adapter.beforeApply = incoming => {
    if (incoming.id === "two" && fail) { fail = false; throw failure("storage_unavailable"); }
  };
  await assert.rejects(a.engine.run(), /storage_unavailable/);
  assert.equal(server.state.ack, "0");
  assert.equal((await a.store.list("bookmarks", "inbox")).length, 1);
  assert.deepEqual(a.calls, ["one", "two"]);
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  assert.deepEqual(a.calls, ["one", "two", "two"]);
  assert.equal(a.data.size, 2);
  assert.equal(server.state.ack, "2");
  assert.equal((await a.store.list("bookmarks", "inbox")).length, 0);
});

test("corrupt records are quarantined durably before ACK while unavailable keys stop progress", async () => {
  const server = backend();
  remote(server, "corrupt", "A").payload = "{}";
  remote(server, "good", "B");
  const a = device(server);
  a.keys.beforeOpen = () => { throw failure("unknown_key"); };
  await assert.rejects(a.engine.run(), /unknown_key/);
  assert.equal(server.state.ack, "0");
  a.keys.beforeOpen = null;
  server.state.beforeRequest = async action => {
    if (action === "ack") { assert.equal((await a.store.list("bookmarks", "conflict")).length, 1); }
  };
  await a.engine.run();
  assert.equal(a.engine.snapshot.conflicts, 1);
  assert.equal(a.data.has("corrupt"), false);
  assert.equal(a.data.get("good").title, "B");
  assert.equal(server.state.ack, "2");
});

test("conflicting edits retain the local value and encrypted material for resolution", async () => {
  const server = backend();
  remote(server, "one", "Original");
  const a = device(server);
  const b = device(server);
  await a.engine.run();
  await b.engine.run();
  a.data.set("one", { title: "A" });
  b.data.set("one", { title: "B" });
  await a.engine.enqueue("one", a.data.get("one"));
  await b.engine.enqueue("one", b.data.get("one"));
  await a.engine.run();
  await b.engine.run();
  assert.equal(b.data.get("one").title, "B");
  assert.equal((await b.engine.record("one")).remote.value.title, "A");
  assert.equal(b.engine.snapshot.pending, 0);
  assert.equal(b.engine.snapshot.conflicts, 2);
  await assert.rejects(b.engine.enqueue("one", { title: "Another edit" }), /record_conflict/);
  const conflicts = await b.store.list("bookmarks", "conflict");
  assert.equal(conflicts.find(row => row.value.source === "upload").value.queued.value.title, "B");
});

async function conflictedDevice() {
  const server = backend();
  remote(server, "one", "Original");
  const a = device(server);
  await a.engine.run();
  a.data.set("one", { title: "Local" });
  await a.engine.capture("one");
  remote(server, "one", "Remote", "2");
  await a.engine.run();
  assert.equal(a.engine.snapshot.conflicts, 2);
  return { server, a };
}

test("conflict pages expose only opaque locators and retaining local queues a durable CAS decision", async () => {
  const { server, a } = await conflictedDevice();
  const page = await a.engine.conflictPage({ limit: 1 });
  assert.equal(page.entries.length, 1);
  assert.equal(page.nextAfter, page.entries[0].id);
  assert.equal((await a.engine.conflictPage({ after: page.nextAfter })).entries.length, 1);
  const [conflict] = page.entries;
  assert.equal(conflict.canKeepLocal, true);
  assert.equal(conflict.remoteRevision, "2");
  assert.equal(/"Original"|"Local"|"Remote"|"payload"|"one"/.test(JSON.stringify(conflict)), false);
  a.data.set("one", { title: "Latest local edit" });
  const result = await a.engine.resolveConflict({ ...conflict, choice: "local" });
  assert.equal(result.resolving, false);
  assert.equal(a.engine.snapshot.conflicts, 0);
  const [queued] = await a.store.list("bookmarks", "outbox");
  assert.equal(queued.id, result.operationId);
  assert.equal(queued.value.value.title, "Latest local edit");
  assert.equal(queued.value.operation.base_revision, "2");
  assert.equal(queued.value.resolution.conflict_id, conflict.id);
  assert.equal((await a.engine.record("one")).blocked, false);
  await a.engine.run();
  assert.equal(server.state.records.get("one").revision, "3");
  assert.equal(a.engine.snapshot.pending, 0);
  assert.equal(a.data.get("one").title, "Latest local edit");
});

test("a failed decision transaction preserves every conflict and queues no operation", async () => {
  const { a } = await conflictedDevice();
  const [conflict] = (await a.engine.conflictPage()).entries;
  const before = clone([...a.store.rows]);
  a.store.beforeCommit = changes => {
    if (changes.some(change => change.kind === "outbox")) { throw failure("disk_full"); }
  };
  await assert.rejects(a.engine.resolveConflict({ ...conflict, choice: "local" }), /disk_full/);
  assert.deepEqual([...a.store.rows], before);
  assert.equal(a.engine.snapshot.resolving, false);
});

test("an interrupted conflict cleanup resumes before transmission and keeps the exact operation", async () => {
  const { server, a } = await conflictedDevice();
  const [conflict] = (await a.engine.conflictPage()).entries;
  a.store.beforeCommit = changes => {
    if (changes.some(change => change.kind === "conflict" && change.deleted)) { throw failure("interrupted"); }
  };
  await assert.rejects(a.engine.resolveConflict({ ...conflict, choice: "local" }), /interrupted/);
  const [queued] = await a.store.list("bookmarks", "outbox");
  assert.equal(a.engine.snapshot.resolving, true);
  assert.equal((await a.store.list("bookmarks", "metadata"))[0].value.version, 4);
  await assert.rejects(a.engine.capture("one"), /application_recovery_required/);
  await assert.rejects(a.engine.enqueue("two", { title: "Wait" }), /application_recovery_required/);
  a.engine.close();
  a.engine = a.create();
  await assert.rejects(a.engine.run(), /interrupted/);
  assert.equal(server.state.receipts.has(queued.id), false);
  a.store.beforeCommit = null;
  await a.engine.run();
  assert.equal(server.state.receipts.has(queued.id), true);
  assert.deepEqual(server.state.receipts.get(queued.id).operation, queued.value.operation);
  assert.equal(a.engine.snapshot.conflicts, 0);
  assert.equal(a.engine.snapshot.resolving, false);
  assert.equal((await a.store.list("bookmarks", "metadata"))[0].value.version, 3);
});

test("stale conflict and mirror revisions cannot authorize a local decision", async () => {
  const { a } = await conflictedDevice();
  const [conflict] = (await a.engine.conflictPage()).entries;
  for (const changed of [{ revision: conflict.revision + 1 }, { remoteRevision: "1" }]) {
    await assert.rejects(a.engine.resolveConflict({ ...conflict, ...changed, choice: "local" }), /conflict_changed/);
  }
  assert.equal(a.engine.snapshot.conflicts, 2);
  assert.equal((await a.store.list("bookmarks", "outbox")).length, 0);
});

test("a reviewed local snapshot cannot authorize overwriting an edit made after the preview", async () => {
  const { a } = await conflictedDevice();
  const [conflict] = (await a.engine.conflictPage({ summaries: true })).entries;
  assert.deepEqual(conflict.summary.fields, [{ name: "title", value: "Remote" }]);
  const preview = await a.engine.conflictPreview(conflict);
  assert.deepEqual(preview.local.fields, [{ name: "title", value: "Local" }]);
  assert.deepEqual(preview.remote.fields, [{ name: "title", value: "Remote" }]);
  a.data.set("one", { title: "Edited after preview" });
  await assert.rejects(a.engine.resolveConflict({ ...conflict, choice: "remote", localRevision: preview.localRevision }), /conflict_changed/);
  assert.equal(a.data.get("one").title, "Edited after preview");
  assert.equal(a.engine.snapshot.conflicts, 2);
  assert.equal((await a.store.list("bookmarks", "outbox")).length, 0);
});

test("excluded local state can be described for review and still invalidates a stale conflict choice", async () => {
  const { a } = await conflictedDevice();
  const [conflict] = (await a.engine.conflictPage()).entries;
  let nativeRevision = 1;
  a.adapter.read = async () => null;
  a.adapter.conflictValue = value => ({ value, nativeRevision });
  const local = { deleted: false, localReason: "sensitive-grant", fields: [
    { name: "permission-action", l10nId: "midori-sync-permission-action-allow" },
  ] };
  a.adapter.localConflictSummary = (id, current) => {
    assert.equal(id, "one");
    assert.equal(current, null, "Excluded native state is not a publishable value");
    return local;
  };
  const preview = await a.engine.conflictPreview(conflict);
  assert.deepEqual(preview.local, local);
  nativeRevision++;
  await assert.rejects(a.engine.resolveConflict({ ...conflict, choice: "remote", localRevision: preview.localRevision }),
    { code: "conflict_changed" });
  assert.equal((await a.store.list("bookmarks", "outbox")).length, 0);
  assert.equal(a.engine.snapshot.conflicts, 2);
});

test("history and form deletion conflicts retain their encrypted identity hint across reopening", async () => {
  for (const collection of ["history", "form-history"]) {
    const server = backend();
    const original = remote(server, "one", "Original identity");
    const envelope = JSON.parse(original.payload);
    envelope.context.collection = collection;
    original.payload = JSON.stringify(envelope);
    const a = device(server, collection);
    await a.engine.run();
    a.data.set("one", { title: "Local edit" });
    await a.engine.capture("one");
    remoteDelete(server, "one");
    await a.engine.run();
    assert.equal((await a.engine.record("one")).remote.deleted, true);
    a.engine.close();
    a.engine = a.create();
    const read = a.adapter.read.bind(a.adapter);
    a.adapter.read = (id, hint) => hint ? read(id) : null;
    const [conflict] = (await a.engine.conflictPage()).entries;
    const preview = await a.engine.conflictPreview(conflict);
    assert.equal(preview.local.deleted, false, "A missing in-memory identity must not look like a local deletion");
    assert.equal(preview.remote.deleted, true);
    await a.engine.resolveConflict({ ...conflict, choice: "local", localRevision: preview.localRevision });
    const [queued] = await a.store.list(collection, "outbox");
    assert.equal(queued.value.operation.deleted, false);
    assert.equal(queued.value.value.title, "Local edit");
    await a.engine.run();
    assert.equal(server.state.records.get("one").deleted, false);
  }
});

test("a newer server revision after choosing local remains a new conflict instead of being overwritten", async () => {
  const { server, a } = await conflictedDevice();
  const [conflict] = (await a.engine.conflictPage()).entries;
  await a.engine.resolveConflict({ ...conflict, choice: "local" });
  remote(server, "one", "New remote edit", "3");
  await a.engine.run();
  assert.equal(server.state.records.get("one").revision, "3");
  assert.equal((await a.engine.record("one")).remote.value.title, "New remote edit");
  assert.equal(a.data.get("one").title, "Local");
  assert.equal(a.engine.snapshot.conflicts, 2);
  assert.ok((await a.engine.conflictPage()).entries.every(entry => entry.canKeepLocal));
});

test("bounded conflict cleanup preserves other records, newer revisions and unauthenticated quarantine", async () => {
  const { server, a } = await conflictedDevice();
  const [conflict] = (await a.engine.conflictPage()).entries;
  const [source] = await a.store.list("bookmarks", "conflict");
  const rows = [];
  for (let index = 0; index < 122; ++index) {
    rows.push({ ...clone(source), id: randomUUID() });
  }
  const raw = clone(server.state.records.get("one"));
  const quarantine = { ...clone(source), id: randomUUID(), value: { version: 1, source: "download",
    change: { sequence: "2", record: { ...raw, payload: "untrusted" } },
    outcome: { status: "conflict", reason: "record_authentication_failed" } } };
  const newer = { ...clone(quarantine), id: randomUUID(), value: { ...clone(quarantine.value),
    change: { sequence: "3", record: { ...raw, revision: "3" } }, outcome: { status: "conflict", reason: "local_change_pending" } } };
  const other = { ...clone(quarantine), id: randomUUID(), value: { ...clone(quarantine.value),
    change: { sequence: "3", record: { ...raw, id: "other" } } } };
  for (const row of [...rows, quarantine, newer, other]) { a.store.rows.set(row.id, row); }
  const state = [...a.store.rows.values()].find(row => row.kind === "metadata");
  state.value.conflicts += rows.length + 3;
  a.engine.close();
  a.engine = a.create();
  const result = await a.engine.resolveConflict({ ...conflict, choice: "local" });
  assert.equal(result.resolving, true);
  assert.equal((await a.engine.record("one")).blocked, true);
  const operationsBefore = server.state.requests.filter(request => request.action === "operations").length;
  await a.engine.run();
  assert.equal(a.engine.snapshot.resolving, false);
  assert.equal(a.engine.snapshot.conflicts, 3);
  for (const row of [quarantine, newer, other]) { assert.ok(a.store.rows.has(row.id)); }
  assert.equal(server.state.requests.filter(request => request.action === "operations").length, operationsBefore + 1);
});

test("an explicitly reviewed quarantine can retire only after its exact record is authenticated", async () => {
  const { a } = await conflictedDevice();
  const downloaded = (await a.store.list("bookmarks", "conflict")).find(row => row.value.source === "download");
  a.store.rows.get(downloaded.id).value.outcome.reason = "record_authentication_failed";
  const entry = (await a.engine.conflictPage()).entries.find(row => row.id === downloaded.id);
  assert.equal(entry.canKeepLocal, true, "The exact ciphertext is now present in the authenticated mirror");
  await a.engine.resolveConflict({ ...entry, choice: "local" });
  assert.equal(a.engine.snapshot.conflicts, 0);
  assert.equal(a.store.rows.has(downloaded.id), false);
});

test("accepting remote stages the native application before queuing and retiring the old conflicts", async () => {
  const { server, a } = await conflictedDevice();
  const [conflict] = (await a.engine.conflictPage()).entries;
  a.adapter.beforeApply = async () => {
    const [intent] = await a.store.list("bookmarks", "application");
    assert.equal(intent.value.resolution.choice, "remote");
    assert.equal(intent.value.resolutionBase.value.title, "Local");
    assert.equal((await a.store.list("bookmarks", "conflict")).length, 2);
    assert.equal((await a.store.list("bookmarks", "outbox")).length, 0);
  };
  await a.engine.resolveConflict({ ...conflict, choice: "remote" });
  assert.equal(a.data.get("one").title, "Remote");
  assert.equal(a.engine.snapshot.conflicts, 0);
  assert.equal(a.engine.snapshot.deferred, 0);
  const [queued] = await a.store.list("bookmarks", "outbox");
  assert.equal(queued.value.resolution.choice, "remote");
  assert.equal(queued.value.operation.base_revision, "2");
  assert.equal(queued.value.value.title, "Remote");
  a.adapter.beforeApply = null;
  await a.engine.run();
  assert.equal(server.state.records.get("one").revision, "3");
  assert.equal(a.engine.snapshot.pending, 0);
});

test("a remote decision resumes after native application without losing its local snapshot or publishing early", async () => {
  const { server, a } = await conflictedDevice();
  const [conflict] = (await a.engine.conflictPage()).entries;
  a.store.beforeCommit = changes => {
    if (changes.some(change => change.kind === "outbox")) { throw failure("disk_full"); }
  };
  await assert.rejects(a.engine.resolveConflict({ ...conflict, choice: "remote" }), /disk_full/);
  assert.equal(a.data.get("one").title, "Remote");
  assert.equal((await a.store.list("bookmarks", "conflict")).length, 2);
  assert.equal(server.state.records.get("one").revision, "2");
  const [intent] = await a.store.list("bookmarks", "application");
  assert.equal(intent.value.resolutionBase.value.title, "Local");
  a.engine.close();
  a.engine = a.create();
  a.store.beforeCommit = null;
  await a.engine.run();
  assert.equal(a.engine.snapshot.conflicts, 0);
  assert.equal(a.engine.snapshot.deferred, 0);
  assert.equal(server.state.records.get("one").revision, "3");
});

test("a local edit during an interrupted remote decision becomes a conflict without being overwritten", async () => {
  const { a } = await conflictedDevice();
  const [conflict] = (await a.engine.conflictPage()).entries;
  a.adapter.apply = async () => { throw failure("interrupted"); };
  await assert.rejects(a.engine.resolveConflict({ ...conflict, choice: "remote" }), /interrupted/);
  a.data.set("one", { title: "New local edit" });
  let applies = 0;
  a.adapter.apply = () => { ++applies; throw new Error("Must preserve the new local edit"); };
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  assert.equal(applies, 0);
  assert.equal(a.data.get("one").title, "New local edit");
  assert.equal(a.engine.snapshot.conflicts, 3);
  assert.equal(a.engine.snapshot.deferred, 0);
  assert.equal((await a.store.list("bookmarks", "outbox")).length, 0);
  assert.ok((await a.engine.conflictPage()).entries.every(entry => entry.canKeepLocal));
});

test("a failed application-intent commit cannot apply an explicit remote choice", async () => {
  const { a } = await conflictedDevice();
  const [conflict] = (await a.engine.conflictPage()).entries;
  let applies = 0;
  a.adapter.apply = () => { ++applies; };
  a.store.beforeCommit = changes => {
    if (changes.some(change => change.kind === "application")) { throw failure("disk_full"); }
  };
  await assert.rejects(a.engine.resolveConflict({ ...conflict, choice: "remote" }), /disk_full/);
  assert.equal(applies, 0);
  assert.equal(a.data.get("one").title, "Local");
  assert.equal(a.engine.snapshot.conflicts, 2);
});

test("merge decisions publish the adapter's validated result and leave incompatible conflicts intact", async () => {
  const { server, a } = await conflictedDevice();
  const [conflict] = (await a.engine.conflictPage()).entries;
  a.adapter.plan = async () => ({ decision: { status: "conflict", reason: "title_diverged" } });
  await assert.rejects(a.engine.resolveConflict({ ...conflict, choice: "merge" }), /conflict_merge_unavailable/);
  assert.equal(a.engine.snapshot.conflicts, 2);
  assert.equal(a.engine.snapshot.pending, 0);
  a.adapter.plan = async incoming => ({ decision: { status: "apply", value: { title: `Local + ${incoming.value.title}` } } });
  await a.engine.resolveConflict({ ...conflict, choice: "merge" });
  assert.equal(a.data.get("one").title, "Local + Remote");
  const [queued] = await a.store.list("bookmarks", "outbox");
  assert.equal(queued.value.resolution.choice, "merge");
  assert.equal(queued.value.value.title, "Local + Remote");
  await a.engine.run();
  assert.equal(server.state.records.get("one").revision, "3");
  assert.equal(a.engine.snapshot.conflicts, 0);
});

test("successive rejected revisions retain the original authenticated merge base after reopening", async () => {
  const { server, a } = await conflictedDevice();
  remote(server, "one", "Newest remote", "3");
  await a.engine.run();
  a.engine.close();
  a.engine = a.create();
  await a.engine.initialize();
  const entries = (await a.engine.conflictPage()).entries;
  for (const entry of entries) {
    assert.equal((await a.store.read(entry.id)).value.base.value.title, "Original");
  }
  a.adapter.plan = async (incoming, base) => {
    assert.equal(base.revision, "1");
    assert.equal(base.value.title, "Original");
    assert.equal(incoming.value.title, "Newest remote");
    return { decision: { status: "apply", value: { title: "Merged" } } };
  };
  await a.engine.resolveConflict({ ...entries.find(entry => entry.source === "download" && entry.canKeepLocal), choice: "merge" });
  const [queued] = await a.store.list("bookmarks", "outbox");
  assert.equal(queued.value.operation.base_revision, "3");
  await a.engine.run();
  assert.equal(a.engine.snapshot.conflicts, 0);
});

test("unsupported native choices are hidden and rejected without changing the conflict", async () => {
  const { a } = await conflictedDevice();
  a.adapter.canResolveConflict = choice => choice === "local";
  a.adapter.plan = async () => { throw new Error("unsupported choice reached native planning"); };
  const [entry] = (await a.engine.conflictPage()).entries;
  assert.equal(entry.canKeepLocal, true);
  assert.equal(entry.canAcceptRemote, false);
  assert.equal(entry.canMerge, false);
  for (const choice of ["remote", "merge"]) {
    await assert.rejects(a.engine.resolveConflict({ ...entry, choice }), /conflict_resolution_unavailable/);
  }
  assert.equal(a.engine.snapshot.conflicts, 2);
  assert.equal(a.engine.snapshot.pending, 0);
});

test("bounded runs keep their snapshot fence across new writes and a restart", async () => {
  const server = backend();
  server.state.pageSize = 1;
  remote(server, "one", "A");
  remote(server, "two", "B");
  const a = device(server);
  await a.engine.run({ maxPages: 1 });
  assert.equal(a.engine.snapshot.more, true);
  assert.equal(a.engine.snapshot.initialized, false);
  remote(server, "three", "C");
  a.engine.close();
  a.engine = a.create();
  await a.engine.run({ maxPages: 1 });
  assert.equal(a.engine.snapshot.initialized, true);
  assert.equal(a.data.size, 2);
  assert.equal(a.engine.snapshot.more, false);
  await a.engine.run();
  assert.equal(a.data.size, 3);
});

test("oversized pages retry with a smaller limit without applying or acknowledging the rejected page", async () => {
  const server = backend();
  for (let i = 0; i < 24; i++) { remote(server, `entry-${i}`, "a".repeat(100000)); }
  const a = device(server);
  await a.engine.run();
  assert.equal(a.data.size, 24);
  const limits = server.state.requests.filter(r => r.action === "changes").map(r => r.query.limit);
  assert.deepEqual(limits.slice(0, 4), [100, 50, 25, 12]);
  assert.equal(server.state.ack, "24");
});

test("a server reset preserves the previous cursor and local data for explicit recovery", async () => {
  const server = backend();
  remote(server, "one", "A");
  const a = device(server);
  await a.engine.run();
  const previous = clone(a.store.rows);
  server.state.generation = randomUUID();
  await assert.rejects(a.engine.run(), /reset_required/);
  assert.deepEqual(a.store.rows, previous);
  assert.equal(a.data.get("one").title, "A");
});

test("a history clear marker lets a new device bootstrap while excluding old visits", async () => {
  const server = backend();
  server.state.reset = { kind: "history_clear", clear_before: "2026-10-01T00:00:00.000Z" };
  const a = device(server, "history");
  await a.engine.run();
  assert.equal(a.engine.snapshot.initialized, true);
  assert.equal(a.adapter.cutoff, Date.parse(server.state.reset.clear_before));
  assert.deepEqual(a.adapter.cleared, []);
  assert.equal(server.state.requests.filter(request => request.action === "operations").length, 0);
});

test("an existing history device purges old visits and pending work after a server clear", async () => {
  const server = backend();
  const a = device(server, "history");
  await a.engine.run();
  a.data.set("old", { title: "Old", atMs: 1 });
  a.data.set("new", { title: "New", atMs: Date.parse("2026-10-02T00:00:00.000Z") });
  await a.engine.enqueue("old", a.data.get("old"));
  const previousGeneration = server.state.generation;
  server.state.generation = randomUUID();
  server.state.reset = { kind: "history_clear", clear_before: "2026-10-01T00:00:00.000Z" };
  server.state.changes = [];
  await a.engine.run();
  assert.notEqual(server.state.generation, previousGeneration);
  assert.equal(a.data.has("old"), false);
  assert.equal(a.data.has("new"), true);
  assert.deepEqual(a.adapter.cleared, [Date.parse(server.state.reset.clear_before)]);
  assert.equal((await a.store.list("history", "outbox")).length, 0);
  assert.equal(a.engine.snapshot.initialized, true);
  assert.equal(server.state.requests.filter(request => request.action === "operations").length, 0);
});

test("a lost history clear response reuses its operation ID and finishes after restart", async () => {
  const server = backend();
  const a = device(server, "history");
  await a.engine.run();
  a.data.set("old", { title: "Old", atMs: 1 });
  a.data.set("new", { title: "New", atMs: Date.parse("2026-10-02T00:00:00.000Z") });
  server.state.lostClearResponse = true;
  await assert.rejects(a.engine.clearHistory(), /network_error/);
  const pending = (await a.store.list("history", "metadata"))[0].value.pendingClear;
  assert.equal(server.state.clearReceipts.size, 1);
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  assert.equal(server.state.requests.filter(request => request.action === "clear").length, 2);
  assert.equal(server.state.clearReceipts.size, 1);
  assert.equal(server.state.clearReceipts.get(pending.id).generation, server.state.generation);
  assert.equal(a.data.has("old"), false);
  assert.equal(a.data.has("new"), true);
  assert.equal((await a.store.list("history", "metadata"))[0].value.pendingClear, undefined);
});

test("shutdown rejects late responses, concurrent runs are refused, and Retry-After is preserved", async () => {
  const server = backend();
  const a = device(server);
  let started;
  let resume;
  const entered = new Promise(resolve => { started = resolve; });
  server.state.beforeRequest = async (_action, options) => {
    started();
    await new Promise(resolve => { resume = resolve; });
    assert.equal(options.signal.aborted, true);
  };
  const running = a.engine.run();
  await entered;
  await assert.rejects(a.engine.run(), /busy/);
  a.engine.close();
  resume();
  await assert.rejects(running, /cancelled/);
  assert.equal((await a.store.list("bookmarks", "inbox")).length, 0);
  a.engine = a.create();
  server.state.beforeRequest = () => { throw Object.assign(failure("rate_limited"), { retryAfter: 35 }); };
  await assert.rejects(a.engine.run(), /rate_limited/);
  assert.equal(a.engine.snapshot.retryAfter, 35);
});

test("a failed cursor transaction never ACKs the unapplied local checkpoint", async () => {
  const server = backend();
  remote(server, "one", "A");
  const a = device(server);
  a.store.beforeCommit = changes => {
    if (changes.some(change => change.kind === "inbox" && change.deleted)) { throw failure("disk_full"); }
  };
  await assert.rejects(a.engine.run(), /disk_full/);
  assert.equal(server.state.ack, "0");
  a.store.beforeCommit = null;
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  assert.deepEqual(a.calls, ["one"]);
  assert.equal(server.state.ack, "1");
});

test("inconsistent cursor metadata and malformed sequence pages are rejected without a reset", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  const id = entryId("bookmarks", "metadata", "collection-state-v1");
  a.store.rows.get(id).value.ack = "different cursor";
  await assert.rejects(a.engine.initialize(), /engine_state_corrupt/);
  const state = { generation: server.state.generation, sequence: "9007199254740992", fence: null };
  const page = { generation: state.generation, changes: [{ sequence: "9007199254740993", record: {} }],
    snapshot_sequence: "9007199254740993", has_more: false, next_cursor: "opaque" };
  assert.equal(validateChangePage(page, state), page);
  for (const invalid of [
    { ...page, snapshot_sequence: Number("9007199254740993") },
    { ...page, changes: [] },
    { ...page, changes: [page.changes[0], page.changes[0]] },
    { ...page, snapshot_sequence: "9007199254740994" },
    { ...page, next_cursor: "\n" },
  ]) { assert.throws(() => validateChangePage(invalid, state), /invalid_change_page/); }
});

test("a lost acknowledgement is retried before fetching another page", async () => {
  const server = backend();
  remote(server, "one", "A");
  const a = device(server);
  let lose = true;
  server.state.beforeRequest = (action, options) => {
    if (action === "ack" && lose) {
      lose = false;
      server.state.ack = String(JSON.parse(options.body.cursor).sequence);
      throw failure("network_error");
    }
  };
  await assert.rejects(a.engine.run(), /network_error/);
  const before = server.state.requests.length;
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  assert.equal(server.state.requests[before].action, "ack");
  assert.deepEqual(a.calls, ["one"]);
  assert.equal(a.engine.snapshot.more, false);
});

test("a crypto epoch change cannot relabel a pending encrypted operation", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  const id = await a.engine.enqueue("one", { title: "A" });
  await assert.rejects(a.engine.enqueue("one", { title: "B" }), /record_pending/);
  const queued = await a.store.read(id);
  a.keys.writeContext = { epoch: randomUUID(), revision: "1" };
  await assert.rejects(a.engine.run(), /outbox_state_mismatch/);
  assert.deepEqual(await a.store.read(id), queued);
  assert.equal(server.state.requests.some(request => request.action === "operations"), false);
});

test("local recovery replays an interrupted application and captures without ACK or HTTP", async () => {
  const server = backend();
  remote(server, "one", "Base");
  const a = device(server);
  await a.engine.run();
  await a.engine.markCompleted(1791000000000);
  remote(server, "one", "Remote update", "2");
  a.adapter.beforeApply = () => { throw failure("interrupted"); };
  await assert.rejects(a.engine.run(), /interrupted/);
  a.adapter.beforeApply = null;
  a.engine.close();
  a.engine = a.create();
  const requestCount = server.state.requests.length;
  server.state.beforeRequest = () => { throw failure("unexpected_network"); };
  assert.deepEqual(await a.engine.recoverLocal(), { captureReady: true, more: false });
  assert.equal(a.data.get("one").title, "Remote update");
  assert.equal(server.state.ack, "1", "Remote acknowledgement waits for reconnection");
  assert.equal(a.engine.snapshot.lastCompletedAt, 1791000000000);
  a.data.set("one", { title: "Offline edit" });
  await a.engine.capture("one");
  assert.equal(server.state.requests.length, requestCount);
  const [operation] = await a.store.list("bookmarks", "outbox");
  assert.equal(operation.value.operation.base_revision, "2");
  server.state.beforeRequest = null;
  await a.engine.run();
  assert.equal(server.state.records.get("one").revision, "3");
  assert.equal(JSON.parse(server.state.records.get("one").payload).fixture.title, "Offline edit");
});

test("local recovery consumes a durable inbox but leaves its acknowledgement queued", async () => {
  const server = backend();
  remote(server, "one", "Base");
  const a = device(server);
  await a.engine.run();
  remote(server, "one", "Remote update", "2");
  a.store.beforeCommit = changes => {
    if (changes.some(change => change.kind === "application")) { throw failure("disk_full"); }
  };
  await assert.rejects(a.engine.run(), /disk_full/);
  assert.equal(a.data.get("one").title, "Base");
  a.store.beforeCommit = null;
  a.engine.close();
  a.engine = a.create();
  const requestCount = server.state.requests.length;
  assert.deepEqual(await a.engine.recoverLocal(), { captureReady: true, more: false });
  assert.equal(server.state.requests.length, requestCount);
  assert.equal(a.data.get("one").title, "Remote update");
  const [metadata] = await a.store.list("bookmarks", "metadata");
  assert.equal(metadata.value.inbox, null);
  assert.equal(metadata.value.ack, metadata.value.cursor);
  assert.equal(server.state.ack, "1");
});

test("local conflict cleanup finishes its durable decision before allowing capture without transmission", async () => {
  const { server, a } = await conflictedDevice();
  const [conflict] = (await a.engine.conflictPage()).entries;
  a.store.beforeCommit = changes => {
    if (changes.some(change => change.kind === "conflict" && change.deleted)) { throw failure("interrupted"); }
  };
  await assert.rejects(a.engine.resolveConflict({ ...conflict, choice: "local" }), /interrupted/);
  const [queued] = await a.store.list("bookmarks", "outbox");
  a.store.beforeCommit = null;
  a.engine.close();
  a.engine = a.create();
  const requestCount = server.state.requests.length;
  const list = a.store.list.bind(a.store);
  a.store.list = (collection, kind, query) => list(collection, kind,
    { ...query, ...(kind === "conflict" ? { limit: 1 } : {}) });
  assert.deepEqual(await a.engine.recoverLocal(), { captureReady: false, more: true }, "Cleanup remains bounded across local pages");
  await assert.rejects(a.engine.capture("one"), /application_recovery_required/);
  assert.deepEqual(await a.engine.recoverLocal(), { captureReady: true, more: false });
  assert.equal(server.state.requests.length, requestCount);
  assert.deepEqual((await a.store.read(queued.id)).value.operation, queued.value.operation);
  assert.equal(a.engine.snapshot.resolving, false);
  assert.equal(a.engine.snapshot.conflicts, 0);
  assert.equal((await a.store.list("bookmarks", "metadata"))[0].value.version, 3);
  a.data.set("one", { title: "Edited after offline cleanup" });
  assert.equal((await a.engine.capture("one")).durable, true);
  assert.equal(a.engine.snapshot.localChanges, 1);
});

test("an incomplete bootstrap and an unconfirmed full history clear wait for connection", async () => {
  for (const clearing of [false, true]) {
    const server = backend();
    const a = device(server, "history");
    if (clearing) {
      await a.engine.run();
      server.state.beforeRequest = () => { throw failure("network_error"); };
      await assert.rejects(a.engine.clearHistory(), /network_error/);
    } else {
      await a.engine.initialize();
    }
    const requestCount = server.state.requests.length;
    assert.deepEqual(await a.engine.recoverLocal(), { captureReady: false, more: false });
    assert.equal(server.state.requests.length, requestCount);
  }
});

test("children wait durably for parents on later pages and ACK follows application after restart", async () => {
  const server = backend();
  server.state.pageSize = 1;
  remote(server, "child", "Child");
  remote(server, "parent", "Folder");
  const a = device(server);
  const apply = a.adapter.apply.bind(a.adapter);
  a.adapter.apply = incoming => incoming.id === "child" && !a.data.has("parent") ?
    { status: "deferred", reason: "bookmark_parent_missing" } : apply(incoming);
  await a.engine.run({ maxPages: 1 });
  assert.equal(a.engine.snapshot.deferred, 1);
  assert.equal(a.engine.snapshot.initialized, false);
  assert.equal(server.state.ack, "0");
  assert.equal((await a.store.list("bookmarks", "inbox")).length, 0);
  const queued = (await a.store.list("bookmarks", "application"))[0];
  assert.equal(queued.value.incoming.id, "child");
  assert.equal(queued.value.phase, "waiting");
  assert.equal((await a.engine.record("child")).remote, null);
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  assert.equal(a.data.size, 2);
  assert.equal(a.engine.snapshot.deferred, 0);
  assert.equal(a.engine.snapshot.initialized, true);
  assert.equal(a.engine.snapshot.more, false);
  assert.equal(server.state.ack, "2");
  assert.equal((await a.store.list("bookmarks", "application")).length, 0);
});

test("an orphan or cycle that never resolves is repaired after bounded retries without stalling the collection", async () => {
  const server = backend();
  remote(server, "orphan", "Orphan");
  remote(server, "cycle-a", "A");
  remote(server, "cycle-b", "B");
  const a = device(server);
  const repairs = [];
  const apply = a.adapter.apply.bind(a.adapter);
  a.adapter.repair = (value, reason, id) => {
    repairs.push([id, reason]);
    return reason === "bookmark_parent_missing" ? { ...value, title: `${value.title} (repaired)` } : null;
  };
  const needs = { orphan: "ghost", "cycle-a": "cycle-b", "cycle-b": "cycle-a" };
  a.adapter.apply = incoming => {
    const parent = needs[incoming.id];
    const resolved = incoming.value.title.endsWith("(repaired)") || a.data.has(parent);
    return parent && !resolved ? { status: "deferred", reason: "bookmark_parent_missing" } : apply(incoming);
  };
  await a.engine.run();
  assert.equal(a.engine.snapshot.deferred, 3);
  assert.equal(a.engine.snapshot.initialized, false);
  for (let attempt = 0; attempt < 5; attempt++) {
    await a.engine.run();
  }
  assert.deepEqual(repairs, [], "Missing parents may still arrive later, so nothing is repaired right away");
  a.clock.now += 11 * 60 * 1000;
  for (let attempt = 0; attempt < 6 && a.engine.snapshot.deferred; attempt++) {
    await a.engine.run();
  }
  assert.equal(a.engine.snapshot.deferred, 0);
  assert.equal(a.engine.snapshot.initialized, true);
  assert.deepEqual(repairs.map(([id]) => id).sort(), ["cycle-a", "cycle-b", "orphan"]);
  assert.deepEqual([...a.data.keys()].sort(), ["cycle-a", "cycle-b", "orphan"]);
  assert.equal(a.data.get("orphan").title, "Orphan (repaired)");
  assert.equal(server.state.ack, "3");
  assert.equal((await a.store.list("bookmarks", "application")).length, 0);
});

test("a newer remote tombstone replaces an unapplied dependency without releasing an early ACK", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  remote(server, "missing-child", "Wait for parent");
  const apply = a.adapter.apply.bind(a.adapter);
  a.adapter.apply = incoming => incoming.deleted ? apply(incoming) : { status: "deferred", reason: "bookmark_parent_missing" };
  await a.engine.run();
  await assert.rejects(a.engine.enqueue("missing-child", { title: "Local edit" }), /record_application_pending/);
  assert.equal(server.state.ack, "0");
  const tombstone = remote(server, "missing-child", "", "2");
  tombstone.deleted = true;
  tombstone.payload = "";
  server.state.beforeRequest = action => {
    if (action === "ack") { assert.equal(a.engine.snapshot.deferred, 0); }
  };
  await a.engine.run();
  assert.deepEqual(a.calls, ["missing-child"]);
  assert.equal(a.data.size, 0);
  assert.equal((await a.engine.record("missing-child")).remote.revision, "2");
  assert.equal(server.state.ack, "2");
});

test("an interrupted application preserves its intent and replays before accepting a newer revision", async () => {
  const server = backend();
  remote(server, "one", "Original");
  const a = device(server);
  let fail = true;
  a.store.beforeCommit = changes => {
    if (fail && changes.some(change => change.kind === "application" && change.deleted)) {
      fail = false;
      throw failure("disk_full");
    }
  };
  await assert.rejects(a.engine.run(), /disk_full/);
  const intent = (await a.store.list("bookmarks", "application"))[0];
  assert.equal(intent.value.phase, "applying");
  assert.equal(intent.value.source.index, 0);
  assert.equal(a.data.get("one").title, "Original");
  assert.equal(server.state.ack, "0");
  remote(server, "one", "Newer", "2");
  const titles = [];
  a.adapter.beforeApply = incoming => { titles.push(incoming.value.title); };
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  assert.deepEqual(titles, ["Original", "Newer"]);
  assert.equal((await a.store.list("bookmarks", "application")).length, 0);
  assert.equal(server.state.ack, "2");
});

test("a failed retry without an inbox resumes before another remote update can replace it", async () => {
  const server = backend();
  remote(server, "one", "Original");
  const a = device(server);
  const apply = a.adapter.apply.bind(a.adapter);
  let ready = false;
  a.adapter.apply = incoming => ready ? apply(incoming) : { status: "deferred", reason: "bookmark_position_pending" };
  await a.engine.run();
  ready = true;
  let fail = true;
  a.adapter.beforeApply = () => { if (fail) { fail = false; throw failure("storage_unavailable"); } };
  await assert.rejects(a.engine.run(), /storage_unavailable/);
  const intent = (await a.store.list("bookmarks", "application"))[0];
  assert.equal(intent.value.phase, "applying");
  assert.equal(intent.value.source, null);
  assert.equal((await a.store.list("bookmarks", "inbox")).length, 0);
  assert.equal(server.state.ack, "0");
  remote(server, "one", "Newer", "2");
  const titles = [];
  a.adapter.beforeApply = incoming => { titles.push(incoming.value.title); };
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  assert.deepEqual(titles, ["Original", "Newer"]);
  assert.equal(server.state.ack, "2");
});

test("failure to persist an application intent cannot reach the native adapter", async () => {
  const server = backend();
  remote(server, "one", "Original");
  const a = device(server);
  a.store.beforeCommit = changes => {
    if (changes.some(change => change.kind === "application")) { throw failure("disk_full"); }
  };
  await assert.rejects(a.engine.run(), /disk_full/);
  assert.equal(a.calls.length, 0);
  assert.equal(a.data.size, 0);
  assert.equal(server.state.ack, "0");
  a.store.beforeCommit = null;
  await a.engine.run();
  assert.equal(a.data.get("one").title, "Original");
});

test("bounded dependency retries paginate fairly beyond the first hundred entries", async () => {
  const server = backend();
  for (let i = 0; i < 105; i++) { remote(server, `waiting-${i}`, `Title ${i}`); }
  const a = device(server);
  const apply = a.adapter.apply.bind(a.adapter);
  let ready = new Set();
  let attempts = 0;
  a.adapter.apply = incoming => {
    attempts++;
    return ready.has(incoming.id) ? apply(incoming) : { status: "deferred", reason: "bookmark_parent_missing" };
  };
  await a.engine.run({ maxApplications: 1 });
  assert.equal(a.engine.snapshot.deferred, 105);
  const entries = [...a.store.rows.values()].filter(row => row.kind === "application").sort((a, b) => a.id.localeCompare(b.id));
  ready = new Set(entries.slice(-5).map(row => row.value.incoming.id));
  for (let i = 0; i < 6; i++) {
    const before = attempts;
    await a.engine.run({ maxApplications: 25 });
    assert.ok(attempts - before <= 25);
  }
  assert.equal(a.data.size, 5, "Unresolved earlier entries cannot starve later dependencies");
  assert.equal(server.state.ack, "0");
  ready = new Set(entries.map(row => row.value.incoming.id));
  for (let i = 0; i < 5 && a.engine.snapshot.deferred; i++) { await a.engine.run({ maxApplications: 25 }); }
  assert.equal(a.data.size, 105);
  assert.equal(server.state.ack, "105");
  assert.equal(a.engine.snapshot.more, false);
});

test("a deferred conflict is quarantined with its base before the pending cursor is acknowledged", async () => {
  const server = backend();
  remote(server, "one", "Original");
  const a = device(server);
  await a.engine.run();
  remote(server, "one", "Remote edit", "2");
  a.adapter.apply = () => ({ status: "deferred", reason: "bookmark_parent_missing" });
  await a.engine.run();
  assert.equal(server.state.ack, "1");
  a.adapter.apply = () => ({ status: "conflict", reason: "deletion_edit" });
  server.state.beforeRequest = async action => {
    if (action === "ack") {
      const conflict = (await a.store.list("bookmarks", "conflict"))[0];
      assert.equal(conflict.value.base.value.title, "Original");
      assert.equal(conflict.value.change.record.revision, "2");
    }
  };
  await a.engine.run();
  assert.equal(a.engine.snapshot.conflicts, 1);
  assert.equal(a.engine.snapshot.deferred, 0);
  assert.equal(server.state.ack, "2");
  assert.equal((await a.engine.record("one")).blocked, true);
});

test("legacy metadata migrates without changing the cursor, outbox or remote generation", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  const operation = await a.engine.enqueue("one", { title: "Pending" });
  const id = entryId("bookmarks", "metadata", "collection-state-v1");
  const metadata = a.store.rows.get(id);
  metadata.value.version = 1;
  delete metadata.value.deferred;
  delete metadata.value.activeApplication;
  delete metadata.value.applicationAfter;
  const previous = clone(metadata.value);
  const queued = await a.store.read(operation);
  a.engine.close();
  a.engine = a.create();
  await a.engine.initialize();
  assert.deepEqual((await a.store.read(id)).value, { ...previous, version: 3, deferred: 0, activeApplication: null, applicationAfter: null });
  assert.deepEqual(await a.store.read(operation), queued);
  await a.engine.run();
  assert.equal(server.state.records.get("one").revision, "1");
});

test("an inconsistent application intent stops recovery without modifying the native data", async () => {
  const server = backend();
  remote(server, "one", "Original");
  const a = device(server);
  a.adapter.beforeApply = () => { throw failure("storage_unavailable"); };
  await assert.rejects(a.engine.run(), /storage_unavailable/);
  const [entry] = await a.store.list("bookmarks", "application");
  a.store.rows.get(entry.id).value.generation = randomUUID();
  a.engine.close();
  a.engine = a.create();
  await assert.rejects(a.engine.run(), /engine_state_corrupt/);
  assert.deepEqual(a.calls, ["one"]);
  assert.equal(server.state.ack, "0");
});

test("position projections resume their durable cursor and preserve immutable queued operations", async () => {
  const server = backend();
  for (let i = 0; i < 40; i++) { positionedRemote(server, `item-${i}`, i); }
  const a = positionedDevice(server);
  await a.engine.run();
  const queuedId = await a.engine.enqueue("item-39", { ...a.data.get("item-39"), title: "Local pending edit" });
  const queuedBefore = await a.store.read(queuedId);
  a.data.set("item-39", { ...a.data.get("item-39"), title: "Final local edit" });
  await a.engine.capture("item-39");
  server.state.quota.add("item-39");
  remoteDelete(server, "item-0");
  const commit = a.store.commit.bind(a.store);
  let fail = true;
  a.store.commit = async changes => {
    await commit(changes);
    if (fail && changes.some(change => change.kind === "application" && change.value?.phase === "projecting" && change.value.projectionAfter)) {
      fail = false;
      throw failure("checkpoint_response_lost");
    }
  };
  await assert.rejects(a.engine.run(), /checkpoint_response_lost/);
  const [intent] = await a.store.list("bookmarks", "application");
  assert.equal(intent.value.phase, "projecting");
  assert.ok(intent.value.projectionAfter);
  assert.equal(server.state.ack, "40");
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  assert.equal(a.applications.filter(id => id === "item-0").length, 2, "Projection recovery does not call the native adapter again");
  for (let i = 1; i < 40; i++) {
    assert.equal((await a.engine.record(`item-${i}`)).position.index, i - 1, "Each persisted baseline moves once");
    assert.equal(a.data.get(`item-${i}`).index, i - 1);
  }
  const queuedAfter = await a.store.read(queuedId);
  assert.deepEqual(queuedAfter.value.operation, queuedBefore.value.operation, "The ciphertext and idempotency key stay unchanged");
  assert.equal(queuedAfter.value.position.index, 38);
  assert.equal((await a.engine.record("item-39")).localChange.position.index, 38);
  assert.equal((await a.engine.capture("item-39")).status, "pending");
  server.state.quota.clear();
  await a.engine.run();
  assert.equal((await a.engine.record("item-39")).position.index, 38);
  const published = JSON.parse(server.state.records.get("item-39").payload).fixture;
  assert.equal(published.index, 38);
  assert.equal(published.title, "Final local edit");
  assert.equal(a.engine.snapshot.deferred, 0);
});

test("a write completed before projection is recovered from the original prepared plan", async () => {
  const server = backend();
  positionedRemote(server, "first", 0);
  positionedRemote(server, "second", 1);
  const a = positionedDevice(server);
  await a.engine.run();
  a.preparations.length = 0;
  a.applications.length = 0;
  remoteDelete(server, "first");
  let fail = true;
  a.store.beforeCommit = changes => {
    if (fail && changes.some(change => change.kind === "application" && change.value?.phase === "projecting")) {
      fail = false;
      throw failure("disk_full");
    }
  };
  await assert.rejects(a.engine.run(), /disk_full/);
  assert.equal(a.data.has("first"), false);
  assert.equal(a.data.get("second").index, 0);
  const [intent] = await a.store.list("bookmarks", "application");
  assert.equal(intent.value.phase, "applying");
  assert.equal(intent.value.plan.effects.from.index, 0);
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  assert.deepEqual(a.preparations, ["first"], "Recovery does not recompute effects from the already changed tree");
  assert.deepEqual(a.applications, ["first", "first"]);
  assert.equal((await a.engine.record("second")).position.index, 0);
  assert.equal(a.data.get("second").index, 0);
});

test("legacy in-flight writes cannot invent a missing native plan on upgrade", async () => {
  const server = backend();
  remote(server, "one", "Original");
  const a = device(server);
  a.adapter.beforeApply = () => { throw failure("storage_unavailable"); };
  await assert.rejects(a.engine.run(), /storage_unavailable/);
  a.adapter.prepare = () => { throw new Error("Must not prepare an uncertain legacy write"); };
  a.engine.close();
  a.engine = a.create();
  await assert.rejects(a.engine.run(), /application_upgrade_required/);
  assert.equal(server.state.ack, "0");
  assert.equal((await a.store.list("bookmarks", "application")).length, 1);
});

test("projection batches reserve journal capacity for their persisted plan and cursor", async () => {
  const server = backend();
  for (let index = 0; index < 25; index++) {
    const record = positionedRemote(server, `item-${index}`, index);
    const payload = JSON.parse(record.payload);
    payload.fixture.title = "x".repeat(90000);
    record.payload = JSON.stringify(payload);
  }
  const a = positionedDevice(server);
  await a.engine.run();
  const prepare = a.adapter.prepare;
  a.adapter.prepare = incoming => ({ ...prepare(incoming), recoveryData: "p".repeat(1400000) });
  let checkpoints = 0;
  a.store.beforeCommit = changes => {
    const size = changes.reduce((total, change) => total + (change.deleted ? 0 : encoder.encode(JSON.stringify(change.value)).length), 0);
    assert.ok(size <= 4 * 1024 * 1024, "Every complete transaction fits the encrypted journal limit");
    if (changes.some(change => change.kind === "application" && change.value?.projectionAfter)) { checkpoints++; }
  };
  remoteDelete(server, "item-0");
  await a.engine.run();
  assert.ok(checkpoints > 1, "Large projected records are split before reaching the row count limit");
  assert.equal(server.state.ack, "26");
  for (let index = 1; index < 25; index++) {
    assert.equal((await a.engine.record(`item-${index}`)).position.index, index - 1);
  }
});

test("capture recovers edits made during an immutable upload and records genuine deletions", async () => {
  const server = backend();
  const a = device(server);
  await assert.rejects(a.engine.capture("one"), /bootstrap_required/);
  await a.engine.run();
  a.data.set("one", { title: "Initial" });
  const first = await a.engine.capture("one");
  assert.equal(first.status, "queued");
  a.data.set("one", { title: "Edited while pending" });
  assert.equal((await a.engine.capture("one")).status, "pending");
  server.state.lostResponse = true;
  await assert.rejects(a.engine.run(), /network_error/);
  a.engine.close();
  a.engine = a.create();
  assert.equal((await a.engine.capturePage()).results[0].status, "pending");
  await a.engine.run();
  const second = await a.engine.capture("one");
  assert.equal(second.status, "unchanged", "The captured follow-up is published without another inventory");
  assert.equal(server.state.receipts.size, 2);
  assert.equal(JSON.parse(server.state.records.get("one").payload).fixture.title, "Edited while pending");
  assert.equal(server.state.records.get("one").revision, "2");
  assert.equal((await a.engine.capture("one")).status, "unchanged");
  a.data.delete("one");
  assert.equal((await a.engine.capturePage()).results[0].status, "queued");
  await a.engine.run();
  assert.equal(server.state.records.get("one").deleted, true);
  assert.equal((await a.engine.capture("one")).status, "unchanged");
  assert.equal((await a.engine.capture("never-existed")).status, "unchanged");
});

test("create, edit and delete survive restart as an immutable operation followed by a CAS tombstone", async () => {
  const server = backend();
  const a = device(server);
  a.keys.snapshot.custody = "client";
  await a.engine.run();
  a.data.set("one", { title: "Created" });
  const first = await a.engine.capture("one");
  const original = await a.store.read(first.operationId);
  a.data.set("one", { title: "Edited" });
  await a.engine.capture("one");
  a.data.delete("one");
  await a.engine.capture("one");
  assert.deepEqual(await a.store.read(first.operationId), original);
  const metadata = () => a.store.read(entryId("bookmarks", "metadata", "collection-state-v1"));
  assert.equal((await metadata()).value.version, 5);
  assert.equal((await metadata()).value.localChanges, 1);
  server.state.lostResponse = true;
  await assert.rejects(a.engine.run(), /network_error/);
  a.engine.close();
  a.engine = a.create();
  await a.engine.run({ maxBatches: 1 });
  const [next] = await a.store.list("bookmarks", "outbox");
  assert.notEqual(next.id, first.operationId);
  assert.equal(next.value.operation.base_revision, "1");
  assert.equal(next.value.operation.deleted, true);
  assert.equal(JSON.parse(next.value.operation.payload).context.schema_version, 2);
  assert.equal((await metadata()).value.version, 3);
  assert.equal(a.engine.snapshot.localChanges, 0);
  server.state.lostResponse = true;
  await assert.rejects(a.engine.run(), /network_error/);
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  assert.equal(server.state.receipts.size, 2);
  assert.equal(server.state.records.get("one").revision, "2");
  assert.equal(server.state.records.get("one").deleted, true);
  assert.equal(a.data.has("one"), false);
});

test("a failed successor commit keeps the first operation and follow-up for exact receipt replay", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  a.data.set("one", { title: "First" });
  const first = await a.engine.capture("one");
  a.data.set("one", { title: "Final" });
  await a.engine.capture("one");
  a.store.beforeCommit = changes => {
    if (changes.some(change => change.id === first.operationId && change.deleted)) { throw failure("disk_full"); }
  };
  await assert.rejects(a.engine.run(), /disk_full/);
  assert.equal(server.state.receipts.size, 1);
  assert.equal((await a.engine.record("one")).localChange.value.title, "Final");
  assert.equal((await a.store.list("bookmarks", "outbox"))[0].id, first.operationId);
  a.store.beforeCommit = null;
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  assert.equal(server.state.receipts.size, 2);
  assert.equal(JSON.parse(server.state.records.get("one").payload).fixture.title, "Final");
  assert.equal(a.engine.snapshot.localChanges, 0);
});

test("a failed follow-up capture preserves its queue and can be retried without a duplicate", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  a.data.set("one", { title: "First" });
  const first = await a.engine.capture("one");
  a.data.delete("one");
  a.store.beforeCommit = () => { throw failure("disk_full"); };
  await assert.rejects(a.engine.capture("one"), /disk_full/);
  assert.equal((await a.engine.record("one")).localChange, undefined);
  assert.equal(a.engine.snapshot.localChanges, 0);
  a.store.beforeCommit = null;
  await a.engine.capture("one");
  assert.equal((await a.engine.record("one")).pending, first.operationId);
  await a.engine.run();
  assert.equal(server.state.receipts.size, 2);
  assert.equal(server.state.records.get("one").deleted, true);
});

test("concurrent remote changes retain the captured intent until an explicit conflict decision", async () => {
  for (const choice of ["local", "remote"]) {
    const server = backend();
    remote(server, "one", "Base");
    const a = device(server);
    await a.engine.run();
    a.data.set("one", { title: "First local" });
    await a.engine.capture("one");
    a.data.delete("one");
    await a.engine.capture("one");
    remote(server, "one", "Concurrent remote", "2");
    await a.engine.run();
    assert.equal((await a.engine.record("one")).localChange.deleted, true);
    assert.equal(a.engine.snapshot.localChanges, 1);
    assert.equal(a.data.has("one"), false);
    a.engine.close();
    a.engine = a.create();
    const page = await a.engine.conflictPage();
    const entry = page.entries.find(item => item.canKeepLocal);
    await a.engine.resolveConflict({ id: entry.id, revision: entry.revision, remoteRevision: entry.remoteRevision, choice });
    await a.engine.run();
    assert.equal(server.state.records.get("one").deleted, choice === "local");
    assert.equal(a.data.has("one"), choice === "remote");
    assert.equal(a.engine.snapshot.localChanges, 0);
    assert.equal(a.engine.snapshot.conflicts, 0);
  }
});

test("follow-up metadata requires the new version and a bounded positive count", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  const [metadata] = await a.store.list("bookmarks", "metadata");
  const state = { ...metadata.value, version: 5, localChanges: 1 };
  assert.deepEqual(validateSyncCollectionState(state), state);
  for (const invalid of [{ ...state, version: 3 }, { ...state, version: 4 },
    { ...state, localChanges: 0 }, { ...state, localChanges: -1 }, { ...state, localChanges: 10001 },
    { ...state, initialized: false }, { ...metadata.value, localChanges: 1 }]) {
    assert.throws(() => validateSyncCollectionState(invalid), /engine_state_corrupt/);
  }
});

test("resolving one record keeps the version barrier protecting another pending follow-up", async () => {
  const server = backend();
  remote(server, "one", "Base one");
  remote(server, "two", "Base two");
  const a = device(server);
  await a.engine.run();
  for (const id of ["one", "two"]) {
    a.data.set(id, { title: `First ${id}` });
    await a.engine.capture(id);
    a.data.set(id, { title: `Final ${id}` });
    await a.engine.capture(id);
  }
  remote(server, "one", "Remote conflict", "2");
  server.state.quota.add("two");
  await a.engine.run();
  const [conflict] = (await a.engine.conflictPage()).entries.filter(entry => entry.canKeepLocal);
  await a.engine.resolveConflict({ ...conflict, choice: "local" });
  const [metadata] = await a.store.list("bookmarks", "metadata");
  assert.equal(metadata.value.version, 5);
  assert.equal(metadata.value.localChanges, 1);
  assert.equal(metadata.value.resolution, null);
  a.engine.close();
  a.engine = a.create();
  server.state.quota.clear();
  await a.engine.run();
  assert.equal(a.engine.snapshot.localChanges, 0);
  assert.equal((await a.store.list("bookmarks", "metadata"))[0].value.version, 3);
  for (const id of ["one", "two"]) {
    assert.equal(JSON.parse(server.state.records.get(id).payload).fixture.title, `Final ${id}`);
  }
});

test("a corrupt follow-up predecessor stops before transmitting a queued operation", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  a.data.set("one", { title: "First" });
  await a.engine.capture("one");
  a.data.delete("one");
  await a.engine.capture("one");
  a.store.rows.get(entryId("bookmarks", "record", "one")).value.localChange.operation_id = randomUUID();
  a.engine.close();
  a.engine = a.create();
  await assert.rejects(a.engine.run(), /engine_state_corrupt/);
  assert.equal(server.state.requests.some(request => request.action === "operations"), false);
  assert.equal(server.state.records.size, 0);
});

test("an authenticated full history clear also retires pending follow-up intentions", async () => {
  const server = backend();
  const a = device(server, "history");
  a.keys.snapshot.custody = "client";
  await a.engine.run();
  a.data.set("one", { title: "First", atMs: 1 });
  await a.engine.capture("one");
  a.data.set("one", { title: "Final", atMs: 1 });
  await a.engine.capture("one");
  assert.equal(a.engine.snapshot.localChanges, 1);
  await a.engine.clearHistory();
  assert.equal(a.engine.snapshot.localChanges, 0);
  assert.equal(a.engine.snapshot.pending, 0);
  assert.equal((await a.store.list("history", "metadata"))[0].value.version, 3);
  assert.equal((await a.store.list("history", "outbox")).length, 0);
  assert.equal((await a.store.list("history", "record")).length, 0);
  assert.equal(a.data.has("one"), false);
});

test("capture does not echo remote writes or their projected sibling positions", async () => {
  const server = backend();
  positionedRemote(server, "first", 0);
  positionedRemote(server, "second", 1);
  const a = positionedDevice(server);
  await a.engine.run();
  assert.ok((await a.engine.capturePage()).results.every(result => result.status === "unchanged"));
  remoteDelete(server, "first");
  await a.engine.run();
  assert.equal(a.data.get("second").index, 0);
  assert.equal((await a.engine.record("second")).remote.value.index, 1);
  assert.ok((await a.engine.capturePage()).results.every(result => result.status === "unchanged"));
  assert.equal(server.state.requests.filter(request => request.action === "operations").length, 0);
  a.data.get("second").index = 1;
  assert.equal((await a.engine.capture("second")).status, "queued", "A later local move remains a real change");
});

test("capture retains conflicts and waits for interrupted application recovery", async () => {
  const server = backend();
  remote(server, "one", "Remote");
  const a = device(server);
  a.adapter.beforeApply = () => { throw failure("interrupted"); };
  await assert.rejects(a.engine.run(), /interrupted/);
  await assert.rejects(a.engine.capture("one"), /bootstrap_required/);
  a.adapter.beforeApply = null;
  await a.engine.run();
  remote(server, "two", "Next");
  a.adapter.beforeApply = () => { throw failure("interrupted"); };
  await assert.rejects(a.engine.run(), /interrupted/);
  await assert.rejects(a.engine.capture("two"), /application_recovery_required/);
  a.adapter.beforeApply = null;
  await a.engine.run();
  a.data.set("one", { title: "Local" });
  await a.engine.capture("one");
  remote(server, "one", "Concurrent", "2");
  await a.engine.run();
  assert.equal((await a.engine.capture("one")).status, "conflict");
  assert.equal(a.data.get("one").title, "Local");
  assert.ok((await a.store.list("bookmarks", "conflict")).length);
});

test("capture recovers an uncertain local commit without replacing its operation", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  a.data.set("one", { title: "Durable" });
  const commit = a.store.commit.bind(a.store);
  a.store.commit = async changes => { await commit(changes); throw failure("uncertain_write"); };
  await assert.rejects(a.engine.capture("one"), /uncertain_write/);
  const [saved] = await a.store.list("bookmarks", "outbox");
  a.store.commit = commit;
  assert.equal((await a.engine.capture("one")).status, "pending");
  assert.equal((await a.store.list("bookmarks", "outbox"))[0].id, saved.id);
  await a.engine.run();
  assert.equal(server.state.receipts.size, 1);
});

test("closing during a local read prevents capture writes", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  a.adapter.read = async () => { a.engine.close(); return { title: "Too late" }; };
  await assert.rejects(a.engine.capture("one"), /cancelled/);
  assert.equal((await a.store.list("bookmarks", "outbox")).length, 0);
});

function trackedDevice(server) {
  const a = positionedDevice(server);
  const root = "unfiled_____";
  let observer;
  a.adapter.observe = callback => { observer = callback; return () => { observer = null; }; };
  a.adapter.readPage = async (parent, { index, limit }) => {
    const children = [...a.data].filter(([, value]) => value.parentGuid === parent)
      .sort((left, right) => left[1].index - right[1].index).map(([id, value]) => ({ id, value: clone(value) }));
    return { entries: children.slice(index, index + limit), nextIndex: index + limit < children.length ? index + limit : null };
  };
  a.notify = (id, parents = [], subtree = false) => observer?.({ id, parents, subtree });
  a.createTracker = () => new MidoriSyncBookmarkTracker({ engine: a.engine, adapter: a.adapter, roots: [root] });
  a.insert = (id, parent = root, index = 0, kind = "bookmark") => a.data.set(id, { title: id, parentGuid: parent, index, kind });
  a.drain = async tracker => {
    for (let count = 0; count < 100; ++count) {
      const result = await tracker.run({ limit: 3 });
      assert.ok(result.checked <= 3);
      await a.engine.run();
      if (!tracker.snapshot.more) { return; }
    }
    assert.fail("The finite tree did not finish capture");
  };
  return a;
}

test("paged inventory captures a tree and a restart discovers missed insertions and deletions", async () => {
  const server = backend();
  const a = trackedDevice(server);
  await a.engine.run();
  a.insert("folder______", undefined, 0, "folder");
  a.insert("child_______", "folder______");
  a.insert("sibling_____", undefined, 1);
  let tracker = a.createTracker();
  await a.drain(tracker);
  assert.equal(server.state.records.size, 3);
  const before = server.state.changes.length;
  tracker.requestInventory();
  await a.drain(tracker);
  assert.equal(server.state.changes.length, before, "An unchanged inventory uploads nothing");
  tracker.close();
  a.data.delete("child_______");
  a.insert("missed______", "folder______");
  tracker = a.createTracker();
  await a.drain(tracker);
  assert.equal(server.state.records.get("child_______").deleted, true);
  assert.equal(server.state.records.get("missed______").deleted, false);
  assert.equal(server.state.records.get("folder______").deleted, false);
  tracker.close();
});

test("folder hints capture sibling shifts without receiving a separate event for every sibling", async () => {
  const server = backend();
  const a = trackedDevice(server);
  await a.engine.run();
  a.insert("first_______", undefined, 0);
  a.insert("second______", undefined, 1);
  const tracker = a.createTracker();
  await a.drain(tracker);
  a.data.delete("first_______");
  a.data.get("second______").index = 0;
  a.notify("first_______", ["unfiled_____"]);
  await a.drain(tracker);
  assert.equal(server.state.records.get("first_______").deleted, true);
  assert.equal(JSON.parse(server.state.records.get("second______").payload).fixture.index, 0);
  tracker.close();
});

test("an event during capture is retained and pending hints do not starve later edits", async () => {
  const server = backend();
  const a = trackedDevice(server);
  await a.engine.run();
  a.insert("first_______");
  a.insert("second______", undefined, 1);
  const tracker = a.createTracker();
  await a.drain(tracker);
  const read = a.adapter.read;
  a.adapter.read = async id => {
    const value = await read(id);
    if (id === "first_______") {
      a.adapter.read = read;
      a.data.get(id).title = "Changed during read";
      a.notify(id);
    }
    return value;
  };
  a.notify("first_______");
  await tracker.run({ limit: 1 });
  assert.equal(tracker.snapshot.dirty, 1);
  await tracker.run({ limit: 1 });
  assert.equal(a.engine.snapshot.pending, 1);
  a.notify("first_______");
  a.data.get("second______").title = "Another edit";
  a.notify("second______");
  await tracker.run({ limit: 1 });
  await tracker.run({ limit: 1 });
  assert.equal(a.engine.snapshot.pending, 2);
  await a.drain(tracker);
  assert.equal(JSON.parse(server.state.records.get("first_______").payload).fixture.title, "Changed during read");
  assert.equal(JSON.parse(server.state.records.get("second______").payload).fixture.title, "Another edit");
  tracker.close();
});

test("capture bounds observer hints and keeps inventory recovery after overflow", async () => {
  const server = backend();
  const a = trackedDevice(server);
  await a.engine.run();
  const tracker = a.createTracker();
  await a.drain(tracker);
  for (let index = 0; index < 5000; index++) { a.notify(String(index).padStart(12, "x")); }
  assert.equal(tracker.snapshot.dirty, 4096);
  assert.equal(tracker.snapshot.inventory, true);
  tracker.close();
  a.notify("closed______");
  assert.equal(tracker.snapshot.dirty, 0);
  await assert.rejects(tracker.run(), /cancelled/);
});


test("an authenticated history clear resumes the exact signed intent and rejects rollback", async () => {
  const server = backend();
  const a = device(server, "history");
  const b = device(server, "history");
  a.keys.snapshot.custody = b.keys.snapshot.custody = "client";
  await a.engine.run();
  await b.engine.run();
  a.data.set("old", { title: "Old", atMs: 1 });
  b.data.set("old", { title: "Old", atMs: 1 });
  b.data.set("future", { title: "Future", atMs: Date.now() + 60000 });
  server.state.lostClearResponse = true;
  await assert.rejects(a.engine.clearHistory(), { code: "network_error" });
  const signed = clone(server.state.control);
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  await b.engine.run();
  assert.equal(a.data.has("old"), false);
  assert.equal(b.data.has("old"), false);
  assert.equal(b.data.has("future"), true);
  const requests = server.state.requests.filter(item => item.action === "clear");
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].body, requests[1].body);
  assert.equal(b.adapter.cleared.length, 1);
  b.engine.close();
  b.engine = b.create();
  server.state.control = null;
  server.state.reset = null;
  await assert.rejects(b.engine.run(), { code: "control_rollback_detected" });
  server.state.control = signed;
  server.state.reset = { kind: "history_clear", clear_before: new Date(signed.clear_before_ms).toISOString() };
  await b.engine.run();
  assert.equal(b.adapter.cleared.length, 1, "Reopening does not apply the same destructive control twice");
});

test("a server cannot alter a signed history cutoff, generation, scope or proof", async () => {
  for (const change of [
    value => { value.clear_before_ms++; },
    value => { value.generation = randomUUID(); },
    value => { value.epoch = randomUUID(); },
    value => { value.collection = "bookmarks"; value.kind = "collection_clear"; value.clear_before_ms = 0; },
    value => { value.proof = "a".repeat(64); },
  ]) {
    const server = backend();
    const a = device(server, "history");
    a.keys.snapshot.custody = "client";
    await a.engine.run();
    a.data.set("preserved", { title: "Local", atMs: 1 });
    const nextGeneration = randomUUID();
    const control = await signSyncControl(a.keys, { collection: "history", operation_id: randomUUID(),
      previous_generation: server.state.generation, generation: nextGeneration,
      control_revision: "1", kind: "history_clear", clear_before_ms: Date.now() });
    change(control);
    server.state.control = control;
    server.state.generation = nextGeneration;
    server.state.reset = { kind: "history_clear", clear_before: new Date(control.clear_before_ms || 1).toISOString() };
    await assert.rejects(a.engine.run(), { code: "control_authentication_failed" });
    assert.equal(a.data.has("preserved"), true);
    assert.deepEqual(a.adapter.cleared, []);
  }
});

test("a signed legacy deletion resolves its quarantine without resurrecting local data", async () => {
  const server = backend();
  const a = rotatedDevice(server);
  a.data.set("old", { title: "Local" });
  server.state.changes.push({ sequence: "1", record: { id: "old", revision: "1", deleted: true, payload: "", ttl: null } });
  await a.engine.run();
  assert.equal(a.engine.snapshot.conflicts, 1);
  assert.equal(a.data.has("old"), true);
  a.engine.close();
  a.engine = a.create();
  protectedRemote(server, "old", "2", { deleted: true });
  await a.engine.run();
  assert.equal(a.engine.snapshot.conflicts, 0);
  assert.equal(a.data.has("old"), false);
});

test("compaction rebases a frozen snapshot without deleting the local outbox or native data", async () => {
  const server = backend();
  const a = device(server);
  await a.engine.run();
  a.data.set("pending", { title: "Offline" });
  await a.engine.enqueue("pending", { title: "Offline" });
  const stateId = entryId("bookmarks", "metadata", "collection-state-v1");
  const state = a.store.rows.get(stateId).value;
  state.fence = "3";
  let delivered = false;
  server.request = async (path, options) => {
    if (path.endsWith("operations")) {
      return { data: { generation: server.state.generation, results: options.body.operations.map((operation, index) => ({
        index, operation_id: operation.operation_id, id: operation.id, status: "quota_exceeded",
      })) } };
    }
    if (path.endsWith("ack")) { return { data: { generation: server.state.generation, acknowledged_sequence: "7" } }; }
    delivered = true;
    return { data: { generation: server.state.generation, changes: [], has_more: false,
      snapshot_sequence: "7", compacted_through: "7", snapshot_rebased: true, next_cursor: "after-compaction" } };
  };
  a.engine.close();
  a.engine = a.create();
  await a.engine.run({ maxBatches: 1 });
  assert.equal(delivered, true);
  assert.equal(a.engine.snapshot.pending, 1, "Pending work survives a rebased feed");
  assert.equal(a.data.get("pending").title, "Offline");
  assert.equal([...a.store.rows.values()].filter(row => row.kind === "outbox").length, 1);
  assert.equal(a.store.rows.get(stateId).value.sequence, "7");
  assert.equal(a.store.rows.get(stateId).value.fence, null);
});

test("a compacted feed cannot move its authenticated device checkpoint backwards", () => {
  const generation = randomUUID();
  const state = { generation, sequence: "20", fence: "25", compactedThrough: "10" };
  const page = { generation, changes: [{ sequence: "31", record: {} }], has_more: false,
    snapshot_sequence: "31", next_cursor: "snapshot", snapshot_rebased: true, compacted_through: "30" };
  assert.equal(validateChangePage(page, state), page);
  for (const invalid of [
    { ...page, snapshot_rebased: false }, { ...page, compacted_through: "19" },
    { ...page, compacted_through: "32" }, { ...page, changes: [] },
    { ...page, changes: [{ sequence: "30", record: {} }] },
  ]) { assert.throws(() => validateChangePage(invalid, state), { code: "invalid_change_page" }); }
});


test("an interrupted native history purge retains the verified reset and resumes after restart", async () => {
  const server = backend();
  const a = device(server, "history");
  a.keys.snapshot.custody = "client";
  await a.engine.run();
  a.data.set("old", { title: "Old", atMs: 1 });
  const clear = a.adapter.clearBefore.bind(a.adapter);
  a.adapter.clearBefore = async ms => { await clear(ms); throw failure("native_interruption"); };
  await assert.rejects(a.engine.clearHistory(), { code: "native_interruption" });
  assert.equal(a.data.has("old"), false);
  const stateId = entryId("history", "metadata", "collection-state-v1");
  assert.equal(a.store.rows.get(stateId).value.pendingReset.control.proof, server.state.control.proof);
  a.engine.close();
  a.engine = a.create();
  a.adapter.clearBefore = clear;
  const requestsBeforeRecovery = server.state.requests.length;
  assert.deepEqual(await a.engine.recoverLocal(), { captureReady: false, more: false });
  assert.equal(server.state.requests.length, requestsBeforeRecovery, "The authenticated local purge does not need another response");
  await a.engine.run();
  const current = a.store.rows.get(stateId).value;
  assert.equal(current.pendingReset, undefined);
  assert.equal(current.controlRevision, "1");
  assert.equal(current.control.proof, server.state.control.proof);
  assert.equal(current.generation, server.state.generation);
});


test("an offline operation is resealed only after its exact old-key request is confirmed invalid", async () => {
  const server = backend();
  const a = device(server);
  a.keys.snapshot.custody = "client";
  await a.engine.run();
  await a.engine.enqueue("offline", { title: "Offline original" });
  const original = clone([...a.store.rows.values()].find(row => row.kind === "outbox").value.operation);
  a.data.set("offline", { title: "Offline final" });
  await a.engine.capture("offline");
  const nextKey = Buffer.alloc(16, 3).toString("base64url");
  a.keys.snapshot.activeKeyId = server.state.activeKeyId = nextKey;
  a.keys.writeContext.revision = "3";
  let loseRewritten = true;
  server.state.beforeRequest = (action, options) => {
    if (action === "operations" && options.body.operations[0].operation_id !== original.operation_id && loseRewritten) {
      loseRewritten = false;
      server.state.lostResponse = true;
    }
  };
  await assert.rejects(a.engine.run(), { code: "network_error" });
  const rewritten = clone([...a.store.rows.values()].find(row => row.kind === "outbox").value.operation);
  assert.notEqual(rewritten.operation_id, original.operation_id);
  assert.equal(JSON.parse(rewritten.payload).key_id, nextKey);
  assert.equal(rewritten.base_revision, original.base_revision);
  assert.equal((await a.engine.record("offline")).localChange.operation_id, rewritten.operation_id);
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  const uploads = server.state.requests.filter(item => item.action === "operations");
  assert.deepEqual(uploads[0].body.operations[0], original);
  assert.deepEqual(uploads[1].body.operations[0], rewritten);
  assert.deepEqual(uploads[2].body.operations[0], rewritten);
  assert.equal(server.state.records.get("offline").revision, "2");
  assert.equal(JSON.parse(uploads[3].body.operations[0].payload).fixture.value.title, "Offline final");
  assert.equal(a.engine.snapshot.localChanges, 0);
  assert.equal(a.engine.snapshot.pending, 0);
  assert.equal(a.engine.snapshot.conflicts, 0);
});

test("a previously accepted old-key operation uses its receipt instead of issuing a new operation", async () => {
  const server = backend();
  const a = device(server);
  a.keys.snapshot.custody = "client";
  await a.engine.run();
  await a.engine.enqueue("accepted", { title: "Before rotation" });
  server.state.lostResponse = true;
  await assert.rejects(a.engine.run(), { code: "network_error" });
  const original = clone([...a.store.rows.values()].find(row => row.kind === "outbox").value.operation);
  const nextKey = Buffer.alloc(16, 3).toString("base64url");
  a.keys.snapshot.activeKeyId = server.state.activeKeyId = nextKey;
  a.keys.writeContext.revision = "3";
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  const uploads = server.state.requests.filter(item => item.action === "operations");
  assert.equal(uploads.length, 2);
  assert.deepEqual(uploads[0].body.operations[0], original);
  assert.deepEqual(uploads[1].body.operations[0], original);
  assert.equal(server.state.records.get("accepted").revision, "1");
  assert.equal(a.engine.snapshot.pending, 0);
});

test("a later authenticated clear supersedes an earlier clear with a lost response", async () => {
  const server = backend();
  const a = device(server, "history");
  const b = device(server, "history");
  a.keys.snapshot.custody = b.keys.snapshot.custody = "client";
  await a.engine.run();
  await b.engine.run();
  server.state.lostClearResponse = true;
  await assert.rejects(a.engine.clearHistory(), { code: "network_error" });
  const first = clone(server.state.control);
  await b.engine.run();
  await b.engine.clearHistory();
  const second = clone(server.state.control);
  assert.equal(second.control_revision, "2");
  a.engine.close();
  a.engine = a.create();
  await a.engine.run();
  const value = a.store.rows.get(entryId("history", "metadata", "collection-state-v1")).value;
  assert.equal(value.generation, second.generation);
  assert.equal(value.controlRevision, "2");
  assert.equal(value.pendingClear, undefined);
  assert.equal(value.pendingReset, undefined);
  assert.notEqual(first.proof, second.proof);
});

test("an inbox from several rotations ago can be superseded only when its key is retained locally", async () => {
  const server = backend();
  const a = rotatedDevice(server);
  const oldestKey = Buffer.alloc(16, 4).toString("base64url");
  a.keys.hasLocalKey = id => id === oldestKey;
  protectedRemote(server, "old-inbox", "1", { keyId: oldestKey, schema: 1 });
  await a.engine.run();
  assert.equal(a.engine.snapshot.conflicts, 1);
  assert.equal(a.calls.length, 0);
  protectedRemote(server, "old-inbox", "2", { title: "Current trusted content" });
  await a.engine.run();
  assert.equal(a.engine.snapshot.conflicts, 0);
  assert.equal(a.data.get("old-inbox").title, "Current trusted content");
});

async function extensionDevice(server) {
  const owner = device(server, "extensions");
  const native = extensionStoreFixture();
  owner.keys.snapshot.custody = "client";
  const deriveRecordId = owner.keys.deriveRecordId;
  const id = await deriveSyncExtensionId("amo", extensionId, deriveRecordId);
  const attach = () => {
    const bridge = new MidoriSyncExtensions({ store: native.store, deriveRecordId, record: id => owner.engine.record(id) });
    for (const method of ["validate", "read", "flush", "matchesLocal", "conflictValue", "canDelete", "canResolveConflict",
      "canAdoptRecord", "prepare", "applyPrepared", "applyPreparedWithCheckpoint", "applicationSummary", "reviewApplication", "apply", "close"]) {
      owner.adapter[method] = bridge[method].bind(bridge);
    }
    owner.bridge = bridge;
  };
  attach();
  const reopen = () => { owner.engine.close(); attach(); owner.engine = owner.create(); };
  const publish = (value = extensionValue(), revision = "1") => {
    const record = { id, revision, deleted: false, ttl: null, payload: JSON.stringify({ key_id: activeKeyId,
      context: { collection: "extensions", id, generation: server.state.generation, schema_version: 2, base_revision: String(Number(revision) - 1) },
      fixture: { version: 2, deleted: false, ttl: null, value } }) };
    server.state.records.set(id, record);
    server.state.changes.push({ sequence: String(server.state.changes.length + 1), record });
  };
  return Object.assign(owner, { native, id, reopen, publish });
}

test("extension prompts release the engine and ACK only after native persistence", { timeout: 3000 }, async () => {
  const server = backend(); const owner = await extensionDevice(server);
  const permission = gate(); owner.native.beforePrompt = () => permission.promise;
  owner.publish();
  await owner.engine.run(); await turn();
  assert.equal(owner.engine.snapshot.busy, false);
  assert.equal(owner.engine.snapshot.deferred, 1);
  assert.equal(server.state.ack, "0");
  const row = (await owner.store.list("extensions", "application"))[0];
  assert.equal(row.value.progress.phase, "awaiting-user");
  await owner.engine.run();
  assert.equal(owner.native.calls.filter(call => call === "native-prompt").length, 1);
  permission.resolve(); await turn();
  assert.equal((await owner.store.list("extensions", "application"))[0].value.progress.phase, "installed");
  assert.deepEqual(owner.native.calls.slice(-4), ["track", "database", "startup", "preferences"]);
  await owner.engine.run();
  assert.equal(owner.engine.snapshot.deferred, 0);
  assert.equal(server.state.ack, "1");
  owner.reopen(); await owner.engine.run();
  assert.equal(owner.native.calls.filter(call => call === "native-installer").length, 1);
  owner.engine.close();
});

test("a rejected extension permission stays deferred after engine reopening until explicit review", { timeout: 3000 }, async () => {
  const server = backend(); const owner = await extensionDevice(server);
  owner.native.approve = false; owner.publish();
  await owner.engine.run(); await turn();
  assert.equal((await owner.store.list("extensions", "application"))[0].value.progress.phase, "declined");
  owner.reopen();
  for (let attempt = 0; attempt < 3; ++attempt) { await owner.engine.run(); }
  assert.equal(owner.native.calls.filter(call => call === "native-prompt").length, 1);
  assert.equal(server.state.ack, "0");
  const page = await owner.engine.pendingApplicationPage();
  assert.equal(page.entries[0].summary.addonId, extensionId);
  assert.equal(page.entries[0].summary.canReview, true);
  assert.equal(page.entries[0].summary.reason, "extension_permission_declined");
  owner.native.approve = true;
  await owner.engine.reviewApplication(page.entries[0]);
  await owner.engine.run(); await turn(); await owner.engine.run();
  assert.equal(server.state.ack, "1");
  assert.equal(owner.native.calls.filter(call => call === "native-prompt").length, 2);
  owner.engine.close();
});

test("engine cancellation aborts a pending native extension request without later writes or ACK", { timeout: 3000 }, async () => {
  const server = backend(); const owner = await extensionDevice(server);
  const permission = gate(); owner.native.beforePrompt = () => permission.promise;
  owner.publish(); await owner.engine.run(); await turn();
  const previous = (await owner.store.list("extensions", "application"))[0].value.progress;
  owner.engine.cancel(); await turn(); permission.resolve(); await turn();
  assert.deepEqual((await owner.store.list("extensions", "application"))[0].value.progress, previous);
  assert.equal(owner.native.installed.size, 0);
  assert.equal(server.state.ack, "0");
  owner.reopen(); await owner.engine.run();
  assert.equal(owner.native.calls.filter(call => call === "native-prompt").length, 1);
  owner.engine.close();
});

test("a local edit during the permission request survives and becomes a visible conflict", { timeout: 3000 }, async () => {
  const server = backend(); const owner = await extensionDevice(server);
  const permission = gate(); owner.native.beforePrompt = () => permission.promise;
  owner.publish(); await owner.engine.run(); await turn();
  const local = owner.native.makeAddon(extensionId, { userDisabled: true, syncGUID: "local-replacement" });
  owner.native.installed.set(extensionId, local);
  permission.resolve(); await turn();
  await owner.engine.run();
  assert.equal(owner.native.installed.get(extensionId), local);
  assert.equal(local.userDisabled, true);
  assert.equal(owner.engine.snapshot.conflicts, 1);
  assert.equal(owner.native.calls.filter(call => call === "track").length, 0);
  owner.engine.close();
});

test("extension review requires a current application revision and cannot duplicate a live native prompt", { timeout: 3000 }, async () => {
  const server = backend(); const owner = await extensionDevice(server);
  const permission = gate(); owner.native.beforePrompt = () => permission.promise;
  owner.publish(); await owner.engine.run(); await turn();
  const active = (await owner.engine.pendingApplicationPage()).entries[0];
  assert.equal(active.summary.canReview, false);
  await assert.rejects(owner.engine.reviewApplication(active), { code: "application_review_unavailable" });
  owner.native.approve = false; permission.resolve(); await turn();
  const stale = (await owner.engine.pendingApplicationPage()).entries[0];
  assert.equal(stale.summary.canReview, true);
  await owner.engine.run();
  await assert.rejects(owner.engine.reviewApplication(stale), { code: "application_state_changed" });
  assert.equal(owner.native.calls.filter(call => call === "native-prompt").length, 1);
  owner.engine.close();
});

test("an extension with unsaved native preferences cannot ACK and retries without repeating permissions", { timeout: 3000 }, async () => {
  const server = backend(); const owner = await extensionDevice(server);
  owner.native.beforePrompt = async () => { owner.native.failPreferences = true; };
  owner.publish();
  await owner.engine.run(); await turn();
  assert.equal(owner.native.installed.size, 1);
  assert.equal(server.state.ack, "0");
  assert.equal(owner.engine.snapshot.deferred, 1);
  await assert.rejects(owner.engine.run(), { code: "native_write_failed" });
  assert.equal(server.state.ack, "0");
  owner.native.failPreferences = false;
  await owner.engine.run();
  assert.equal(server.state.ack, "1");
  assert.equal(owner.native.calls.filter(call => call === "native-prompt").length, 1);
  owner.engine.close();
});

test("a durable user uninstall cannot be undone by restarting an incoming download without an old mirror", { timeout: 3000 }, async () => {
  const server = backend(); const owner = await extensionDevice(server);
  const catalog = gate(); owner.native.catalogGate = catalog.promise;
  owner.publish(); await owner.engine.run(); await turn();
  assert.equal((await owner.store.list("extensions", "application"))[0].value.progress.phase, "downloading");
  owner.native.tracked.set(extensionId, { source: "user", token: "durable user uninstall while downloading" });
  owner.reopen(); await owner.engine.run();
  assert.equal(owner.engine.snapshot.conflicts, 1);
  assert.equal(owner.native.calls.filter(call => call === "catalog").length, 1);
  catalog.resolve(); await turn();
  assert.equal(owner.native.installed.size, 0);
  assert.ok(!owner.native.calls.includes("native-installer"));
  owner.engine.close();
});

test("an installed extension cannot ACK until its permission database and cache are saved", { timeout: 3000 }, async () => {
  const server = backend(); const owner = await extensionDevice(server);
  owner.native.beforePrompt = async () => { owner.native.failPermissionWrite = true; };
  owner.publish(); await owner.engine.run(); await turn();
  assert.equal(owner.native.installed.size, 1);
  assert.equal(server.state.ack, "0");
  await assert.rejects(owner.engine.run(), { code: "native_write_failed" });
  owner.native.failPermissionWrite = false;
  await owner.engine.run();
  assert.equal(server.state.ack, "1");
  assert.equal(owner.native.calls.filter(call => call === "native-prompt").length, 1);
  owner.engine.close();
});

const aliasLogin = { version: 1, origin: "https://password-alias.example.invalid", formActionOrigin: "", httpRealm: null,
  username: "fixture", password: "public synthetic alias password", usernameField: "user", passwordField: "password",
  timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };

function enablePasswordAliases(owner, sourceId = "z", targetId = "a") {
  owner.keys.snapshot.custody = "client";
  owner.adapter.validate = async (id, value) => {
    if (isSyncPasswordIdentityAlias(value)) { return validateSyncPasswordIdentityAlias(id, value); }
    await syncPasswordValueDigest(value);
    return clone(value);
  };
  const originalMatches = owner.adapter.matchesLocal;
  owner.adapter.validReplacement = validSyncPasswordReplacement;
  owner.adapter.isRetired = record => !record.deleted && isSyncPasswordIdentityAlias(record.value);
  owner.adapter.matchesLocal = (id, current, base, position) => isSyncPasswordIdentityAlias(base) ? current === null :
    originalMatches(id, current, base, position);
  owner.adapter.retirementValue = async (id, base, { record, source = null, pending = false }) => {
    if (pending) { return null; }
    const original = source ?? (await record(id))?.remote;
    const target = await record(targetId);
    if (!original || !target?.remote || target.pending || target.blocked || target.applying ||
        JSON.stringify(owner.data.get(targetId) ?? null) !== JSON.stringify(target.remote.value)) {
      return null;
    }
    return validateSyncPasswordIdentityAlias(id, { version: 2, kind: "identity-alias", targetId,
      sourceRevision: original.revision, targetRevision: target.remote.revision,
      sourceDigest: await syncPasswordValueDigest(original.value ?? base), targetDeleted: false,
      targetDigest: await syncPasswordValueDigest(target.remote.value) });
  };
  owner.adapter.retirementSnapshot = async (id, value, mirror) => {
    if (!isSyncPasswordIdentityAlias(value)) { return undefined; }
    return mirror.retirementSnapshot ?? { version: 1, sourceId: id, targetId, remote: clone(mirror.remote), native: null };
  };
  owner.adapter.backupReplacement = async (id, target, mirror, incoming, plan) => ({
    version: 1, sourceId: id, targetId: target, remote: clone(id === incoming.id ? incoming : mirror?.remote ?? null),
    native: plan.duplicate?.id === id ? clone(plan.duplicate) : null,
  });
  owner.adapter.prepare = async incoming => ({ id: incoming.id, incoming: clone(incoming),
    duplicate: incoming.id === targetId && owner.data.has(sourceId) ? { id: sourceId, value: clone(owner.data.get(sourceId)) } : null });
  owner.adapter.applyPrepared = async plan => {
    const { incoming } = plan;
    if (incoming.deleted) { owner.data.delete(incoming.id); }
    else { owner.data.set(incoming.id, clone(incoming.value)); }
    if (plan.duplicate) {
      owner.data.delete(sourceId);
      return { status: "applied", replacement: { id: sourceId, replacementId: targetId } };
    }
    return { status: "applied" };
  };
}

async function publishedPasswordReplacement() {
  const server = backend();
  const owner = device(server, "passwords");
  enablePasswordAliases(owner);
  await owner.engine.run();
  owner.data.set("z", clone(aliasLogin));
  await owner.engine.capture("z");
  await owner.engine.run();
  const peer = device(server, "passwords");
  enablePasswordAliases(peer);
  await peer.engine.run();
  peer.data.set("a", clone(aliasLogin));
  await peer.engine.capture("a");
  await peer.engine.run();
  await owner.engine.run();
  return { server, owner, peer };
}

test("password identity retirement publishes an authenticated alias and retains the original native and wire snapshots", async () => {
  const { owner, server } = await publishedPasswordReplacement();
  assert.equal(owner.data.has("z"), false);
  const before = await owner.engine.record("z");
  assert.equal(before.replacementId, "a");
  assert.deepEqual(before.retirementSnapshot.native, { id: "z", value: aliasLogin });
  assert.deepEqual(before.retirementSnapshot.remote.value, aliasLogin);
  await owner.engine.capture("z");
  const queued = (await owner.store.list("passwords", "outbox"))[0];
  assert.equal(queued.value.operation.deleted, false);
  assert.equal(queued.value.operation.id, "z");
  const envelope = JSON.parse(queued.value.operation.payload);
  assert.equal(envelope.context.schema_version, 2);
  assert.equal(envelope.fixture.version, 2);
  assert.equal(envelope.fixture.deleted, false);
  assert.ok(isSyncPasswordIdentityAlias(envelope.fixture.value));
  await owner.engine.run();
  assert.equal(server.state.records.get("z").deleted, false, "An identity retirement is distinguishable from a user's deletion");
  assert.ok(isSyncPasswordIdentityAlias((await owner.engine.record("z")).remote.value));
  assert.equal((await owner.engine.capture("z")).status, "unchanged");
  const row = [...owner.store.rows.values()].find(entry => entry.kind === "record" && entry.value.id === "z");
  assert.equal(row.value.version, 2, "Older journal readers cannot silently discard the original snapshots");
  assert.deepEqual(row.value.retirementSnapshot, before.retirementSnapshot);
});

test("an alias lost response replays its exact original ciphertext after restart", async () => {
  const { owner, server } = await publishedPasswordReplacement();
  await owner.engine.capture("z");
  const queued = clone(await owner.store.list("passwords", "outbox"));
  server.state.lostResponse = true;
  await assert.rejects(owner.engine.run(), { code: "network_error" });
  assert.deepEqual(await owner.store.list("passwords", "outbox"), queued);
  owner.engine.close();
  owner.engine = owner.create();
  await owner.engine.run();
  assert.equal(owner.engine.snapshot.pending, 0);
  assert.equal((await owner.engine.record("z")).remote.revision, "2");
  assert.deepEqual((await owner.engine.record("z")).retirementSnapshot.remote.value, aliasLogin);
});

test("a failed alias enqueue preserves the original remote credential and encrypted-journal backup", async () => {
  const { owner } = await publishedPasswordReplacement();
  const original = clone(await owner.engine.record("z"));
  owner.store.beforeCommit = changes => {
    if (changes.some(change => change.kind === "outbox" && isSyncPasswordIdentityAlias(change.value?.value))) {
      throw failure("synthetic_alias_write_failure");
    }
  };
  await assert.rejects(owner.engine.capture("z"), { code: "synthetic_alias_write_failure" });
  assert.deepEqual(await owner.engine.record("z"), original);
  assert.equal((await owner.store.list("passwords", "outbox")).length, 0);
  owner.store.beforeCommit = null;
  await owner.engine.capture("z");
  await owner.engine.run();
  assert.equal(owner.engine.snapshot.pending, 0);
});

test("an original pending password operation is retained until the canonical copy is confirmed", async () => {
  const server = backend();
  const owner = device(server, "passwords");
  enablePasswordAliases(owner);
  await owner.engine.run();
  owner.data.set("z", clone(aliasLogin));
  await owner.engine.capture("z");
  const original = clone((await owner.store.list("passwords", "outbox"))[0]);
  owner.data.delete("z");
  owner.data.set("a", clone(aliasLogin));
  const mirrorRow = [...owner.store.rows.values()].find(row => row.kind === "record" && row.value.id === "z");
  await owner.store.commit([{ ...mirrorRow, expectedRevision: mirrorRow.revision,
    value: { ...mirrorRow.value, replacementId: "a" } }]);
  assert.equal((await owner.engine.capture("z")).status, "pending");
  assert.deepEqual((await owner.store.read(original.id)).value, original.value);
  assert.equal((await owner.engine.record("z")).localChange, undefined);
  await owner.engine.capture("a");
  await owner.engine.run();
  await owner.engine.capture("z");
  await owner.engine.run();
  assert.equal(server.state.receipts.get(original.id).operation.payload, original.value.operation.payload);
  assert.ok(isSyncPasswordIdentityAlias((await owner.engine.record("z")).remote.value));
});

test("a deletion followup saved by an older client becomes an alias after its original receipt", async () => {
  const server = backend();
  const owner = device(server, "passwords");
  enablePasswordAliases(owner);
  await owner.engine.run();
  owner.data.set("z", clone(aliasLogin));
  await owner.engine.capture("z");
  const original = clone((await owner.store.list("passwords", "outbox"))[0]);
  owner.data.delete("z");
  owner.data.set("a", clone(aliasLogin));
  const source = [...owner.store.rows.values()].find(row => row.kind === "record" && row.value.id === "z");
  await owner.store.commit([{ ...source, expectedRevision: source.revision, value: { ...source.value, replacementId: "a" } }]);
  const retirement = owner.adapter.retirementValue;
  delete owner.adapter.retirementValue;
  await owner.engine.capture("z");
  owner.adapter.retirementValue = retirement;
  await owner.engine.capture("a");
  server.state.quota.add("a");
  await owner.engine.run();
  assert.deepEqual((await owner.store.read(original.id)).value, original.value);
  assert.equal(server.state.receipts.get(original.id).result.status, "applied");
  server.state.quota.delete("a");
  owner.engine.close();
  owner.engine = owner.create();
  await owner.engine.run();
  await owner.engine.run();
  assert.equal(owner.engine.snapshot.pending, 0);
  assert.ok(isSyncPasswordIdentityAlias((await owner.engine.record("z")).remote.value));
  assert.equal(server.state.receipts.get(original.id).operation.payload, original.value.operation.payload);
  assert.equal(owner.engine.snapshot.conflicts, 0, "Waiting for the destination does not turn an applied original receipt into an orphaned conflict");
  assert.equal((await owner.store.list("passwords", "conflict")).length, 0);
});
