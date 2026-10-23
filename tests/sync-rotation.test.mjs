/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { finishSyncRotation, MidoriSyncRotation } from "../src/browser/components/sync/MidoriSyncRotation.sys.mjs";
import { bundle as extensionSettingsBundle } from "./sync-extension-settings-fixtures.mjs";

const copy = value => structuredClone(value);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

test("confirmed rotation continues across bounded batches and yields between them", async () => {
  const order = [];
  let passes = 0;
  const decisions = [{ decision: "delete", revision: "3" }];
  const driver = { async run(options) {
    order.push("run");
    assert.equal(options.limit, 100);
    assert.deepEqual(options.legacyDeletionDecisions, passes ? [] : decisions);
    ++passes;
    return { done: passes === 3, processed: passes === 3 ? 15 : 100, remaining: passes === 3 ? 0 : null };
  } };
  const result = await finishSyncRotation(driver, { limit: 100, legacyDeletionDecisions: decisions,
    onBatch: async () => { order.push("refresh"); }, yieldControl: async () => { order.push("yield"); } });
  assert.deepEqual(order, ["run", "refresh", "yield", "run", "refresh", "yield", "run"]);
  assert.deepEqual(result, { done: true, processed: 215, remaining: 0 });
});

test("rotation continuation stops at network errors, required decisions and absent progress", async () => {
  for (const code of ["network_error", "legacy_tombstone_review_required", "cancelled"]) {
    let passes = 0;
    const driver = { async run() {
      ++passes;
      if (passes === 2) { throw Object.assign(new Error(code), { code }); }
      return { done: false, processed: 100 };
    } };
    await assert.rejects(finishSyncRotation(driver), error => error.code === code);
    assert.equal(passes, 2);
  }
  for (const progress of [{ done: false, processed: 0 }, { done: false, processed: 101 }, { done: "yes", processed: 1 }]) {
    let passes = 0;
    await assert.rejects(finishSyncRotation({ async run() { ++passes; return progress; } }),
      /rotation_no_progress|invalid_rotation_progress/);
    assert.equal(passes, 1);
  }
});

function fixture({ workspaces = false, permissions = false, extensions = false, extensionSettings = false } = {}) {
  const generation = randomUUID();
  const rotationId = randomUUID();
  const metadataId = randomUUID();
  const crypto = { epoch: randomUUID(), revision: "2" };
  const rows = new Map();
  const records = new Map();
  const receipts = new Map();
  const compactions = new Map();
  const sequences = new Map();
  const requests = [];
  const state = { loseResponse: false, loseCompletion: false, completions: 0, failCommit: false, failDelete: null,
    conflictOnce: false, historyResponse: null, historyConflict: null, targetResponse: null,
    loseCompaction: false, compactionConflict: false, compactionResponse: null, noCompaction: false,
    retireFailure: false, retirements: 0, failCompactionIntent: false };
  const collectionNames = ["bookmarks", "history", "passwords", "credit-cards", "form-history", "addresses", "tabs",
    "browser-settings", "devices", "midori-tab", "midori-privacy"];
  if (workspaces) { collectionNames.push("workspaces"); }
  if (permissions) { collectionNames.push("site-permissions"); }
  if (extensions) { collectionNames.push("extensions"); }
  if (extensionSettings) { collectionNames.push("extension-settings"); }
  const keys = {
    snapshot: { status: "ready", custody: "transition", keyCount: 2, localKeyCount: 2,
      rotation: { operation_id: rotationId, phase: "rewriting" } },
    writeContext: crypto,
    async openRecord(expected, payload) {
      const envelope = JSON.parse(payload);
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(envelope.context[key], value);
      }
      return encoder.encode(JSON.stringify(envelope.fixture));
    },
    async sealRecord(context, bytes) {
      return { crypto: copy(crypto), payload: JSON.stringify({ key_id: "new", context, fixture: JSON.parse(decoder.decode(bytes)) }) };
    },
    async completeRotation(id) {
      assert.equal(id, rotationId);
      assert.equal([...records.values()].filter(item => JSON.parse(item.record.payload).key_id !== "new").length, 0);
      state.completions++;
      keys.snapshot.rotation.phase = "complete";
      keys.snapshot.custody = "client";
      if (state.loseCompletion) {
        state.loseCompletion = false;
        throw Object.assign(new Error("network_error"), { code: "network_error" });
      }
    },
    async retireUnusedKeys(receivedJournal) {
      assert.equal(receivedJournal, journal);
      assert.equal(compactions.size, collectionNames.length, "Every collection is compacted before key retirement");
      if (state.retireFailure) {
        state.retireFailure = false;
        throw Object.assign(new Error("network_error"), { code: "network_error" });
      }
      state.retirements++;
      keys.snapshot.keyCount = 1;
      keys.snapshot.localKeyCount = 1;
    },
  };
  const journal = {
    async read(id) { return copy(rows.get(id) ?? null); },
    async scan({ after, limit }) {
      return copy([...rows.values()].filter(row => after === null || row.id > after)
        .sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit));
    },
    async commit(changes) {
      if (state.failCommit) {
        state.failCommit = false;
        throw Object.assign(new Error("disk_full"), { code: "disk_full" });
      }
      for (const change of changes) {
        if (state.failCompactionIntent && change.value?.pending?.kind === "compact") {
          state.failCompactionIntent = false;
          throw Object.assign(new Error("disk_full"), { code: "disk_full" });
        }
        assert.equal(rows.get(change.id)?.revision ?? 0, change.expectedRevision);
        if (change.deleted) {
          if (state.failDelete === "before") {
            state.failDelete = null;
            throw Object.assign(new Error("disk_full"), { code: "disk_full" });
          }
          rows.delete(change.id);
          if (state.failDelete === "after") {
            state.failDelete = null;
            throw Object.assign(new Error("disk_full"), { code: "disk_full" });
          }
        } else {
          rows.set(change.id, copy({ ...change, revision: change.expectedRevision + 1, encryptedWith: "new" }));
        }
      }
    },
  };
  const request = async (path, options = {}) => {
    requests.push(copy({ path, options }));
    if (path.endsWith("/capabilities")) {
      return { data: { features: state.noCompaction ? [] : ["journal_compaction"], collections: collectionNames } };
    }
    if (path.endsWith("/changes")) {
      const collection = path.split("/").at(-2);
      return { data: { generation, snapshot_sequence: sequences.get(collection) ?? "10" } };
    }
    if (path.endsWith("/compact")) {
      const collection = path.split("/").at(-2);
      const operation = options.body;
      if (state.compactionConflict) {
        state.compactionConflict = false;
        sequences.set(collection, String(Number(operation.snapshot_sequence) + 1));
        throw Object.assign(new Error("snapshot_conflict"), { code: "snapshot_conflict", status: 409 });
      }
      let receipt = compactions.get(collection);
      if (receipt) {
        assert.deepEqual(operation, receipt.operation);
      } else {
        assert.equal(operation.snapshot_sequence, sequences.get(collection) ?? "10");
        receipt = { operation: copy(operation), result: { operation_id: operation.operation_id, generation,
          compacted_through: operation.snapshot_sequence, snapshot_sequence: String(Number(operation.snapshot_sequence) + 1), records: 1 } };
        compactions.set(collection, receipt);
        sequences.set(collection, receipt.result.snapshot_sequence);
      }
      if (state.loseCompaction) {
        state.loseCompaction = false;
        throw Object.assign(new Error("network_error"), { code: "network_error" });
      }
      return { data: { ...copy(receipt.result), ...state.compactionResponse } };
    }
    if (path.endsWith("/records")) {
      const pending = [...records.values()].filter(item => !item.record.payload || JSON.parse(item.record.payload).key_id !== "new");
      return { data: { rotation_id: rotationId, records: copy(pending.slice(0, options.query.limit)), has_more: pending.length > options.query.limit } };
    }
    if (path.endsWith("/history-target")) {
      return { data: { generation, rotation_id: rotationId,
        record: copy(records.get(options.body.id)?.record ?? null), ...state.targetResponse } };
    }
    const operation = path.endsWith("/history-id") ? options.body : options.body.operations[0];
    let receipt = receipts.get(operation.operation_id);
    if (receipt) {
      assert.deepEqual(operation, receipt.operation, "Retry preserves exact ciphertext and idempotency ID");
    } else {
      if (path.endsWith("/history-id")) {
        const stored = records.get(operation.source_id).record;
        if (state.historyConflict) {
          const error = state.historyConflict;
          state.historyConflict = null;
          if (error.code === "history_source_conflict" && error.status === 409) {
            const envelope = JSON.parse(stored.payload);
            envelope.context.base_revision = stored.revision;
            envelope.fixture.title = "Concurrent history edit";
            stored.payload = JSON.stringify(envelope);
            stored.revision = String(Number(stored.revision) + 1);
          }
          if (error.code === "history_target_conflict" && error.status === 409) {
            const target = records.get(operation.target_id).record;
            const envelope = JSON.parse(target.payload);
            envelope.context.base_revision = target.revision;
            envelope.fixture.value.visits.push({ atUsec: 300, transition: 1, count: 1 });
            target.payload = JSON.stringify(envelope);
            target.revision = String(Number(target.revision) + 1);
          }
          throw Object.assign(new Error(error.code), error);
        }
        assert.equal(stored.revision, operation.source_revision);
        assert.equal(records.get(operation.target_id)?.record.revision ?? "0", operation.target_revision);
        assert.equal(operation.target_ttl, JSON.parse(operation.target_payload).fixture.ttl);
        stored.payload = operation.source_payload;
        stored.deleted = true;
        stored.ttl = null;
        stored.revision = String(Number(stored.revision) + 1);
        const targetRevision = String(Number(operation.target_revision) + 1);
        records.set(operation.target_id, { collection: "history", generation,
          record: { id: operation.target_id, revision: targetRevision, deleted: operation.target_deleted,
            ttl: operation.target_ttl, payload: operation.target_payload } });
        receipt = { operation: copy(operation), result: { operation_id: operation.operation_id,
          rotation_id: rotationId, generation, source_id: operation.source_id, target_id: operation.target_id,
          source_revision: stored.revision, target_revision: targetRevision, target_deleted: operation.target_deleted } };
      } else {
        const stored = records.get(operation.id).record;
        assert.equal(stored.revision, operation.base_revision);
        let status = "applied";
        if (state.conflictOnce) {
          state.conflictOnce = false;
          status = "conflict";
          const envelope = JSON.parse(stored.payload);
          envelope.fixture.title = "Concurrent server edit";
          envelope.context.base_revision = stored.revision;
          stored.payload = JSON.stringify(envelope);
        } else {
          stored.payload = operation.payload;
          stored.deleted = operation.deleted;
          stored.ttl = operation.ttl;
        }
        stored.revision = String(Number(stored.revision) + 1);
        receipt = { operation: copy(operation), result: { index: 0, id: operation.id,
          operation_id: operation.operation_id, status, revision: stored.revision } };
      }
      receipts.set(operation.operation_id, receipt);
    }
    if (state.loseResponse) {
      state.loseResponse = false;
      throw Object.assign(new Error("network_error"), { code: "network_error" });
    }
    if (path.endsWith("/history-id")) {
      return { data: { ...copy(receipt.result), ...state.historyResponse } };
    }
    return { data: { generation, results: [copy(receipt.result)] } };
  };
  const targetId = "h2:" + "b".repeat(64);
  const history = {
    async validate(id, value) {
      assert.match(id, /^h[12]:[0-9a-f]{64}$/);
      assert.equal(value.url, "https://history.invalid/");
      return value;
    },
    async migrationId(value) {
      assert.equal(value.url, "https://history.invalid/");
      return targetId;
    },
    async mergeForMigration(source, target) {
      const visits = new Map();
      for (const visit of [...target.visits ?? [], ...source.visits ?? []]) {
        const id = `${visit.atUsec}:${visit.transition}`;
        visits.set(id, { ...visit, count: Math.max(visit.count, visits.get(id)?.count ?? 0) });
      }
      return { ...target, visits: [...visits.values()].sort((a, b) => a.atUsec - b.atUsec) };
    },
    close() {},
  };
  const create = () => new MidoriSyncRotation({ keys, journal, request, entryId: async () => metadataId, createId: randomUUID, history });
  const add = (id, title, { collection = "bookmarks" } = {}) => {
    records.set(id, { collection, generation, record: { id, revision: "1", deleted: false, ttl: null,
      payload: JSON.stringify({ key_id: "old", context: { collection, id, generation, schema_version: 1, base_revision: "0" }, fixture: { title } }) } });
  };
  const addHistory = (ttl = null) => {
    const id = "h1:" + "a".repeat(64);
    records.set(id, { collection: "history", generation, record: { id, revision: "1", deleted: false, ttl,
      payload: JSON.stringify({ key_id: "old", context: { collection: "history", id, generation, schema_version: 1, base_revision: "0" },
        fixture: { url: "https://history.invalid/", day: 86400000000 } }) } });
    return { sourceId: id, targetId };
  };
  const addHistoryTarget = ({ deleted = false, ttl = null, payload = true, visits = [] } = {}) => {
    records.set(targetId, { collection: "history", generation, record: { id: targetId, revision: "4", deleted, ttl,
      payload: payload ? JSON.stringify({ key_id: "new", context: { collection: "history", id: targetId,
        generation, schema_version: 2, base_revision: "3" }, fixture: { version: 2, deleted, ttl,
        value: deleted ? null : { url: "https://history.invalid/", day: 86400000000, visits } } }) : "" } });
    return targetId;
  };
  return { state, keys, rows, records, receipts, compactions, sequences, requests, create, add, addHistory, addHistoryTarget, metadataId };
}

async function finish(driver) {
  for (let attempt = 0; attempt < 20; ++attempt) {
    const result = await driver.run({ limit: 2 });
    if (result.done) {
      return result;
    }
  }
  assert.fail("Rotation did not converge within its bounded runs");
}

test("automatic continuation finishes more than one hundred records, local rows and all compactions", async () => {
  const f = fixture();
  for (let index = 0; index < 125; ++index) {
    f.add(`record-${index}`, `Title ${index}`);
    const id = randomUUID();
    f.rows.set(id, { id, collection: "bookmarks", kind: "record", revision: 1, value: { title: `Local ${index}` } });
  }
  let yields = 0;
  const result = await finishSyncRotation(f.create(), { limit: 100,
    yieldControl: async () => { ++yields; } });
  assert.equal(result.done, true);
  assert.ok(result.processed > 250);
  assert.ok(yields >= 2);
  assert.equal(f.receipts.size, 125);
  assert.equal(f.compactions.size, 11);
  assert.equal(f.state.retirements, 1);
  assert.equal(f.keys.snapshot.keyCount, 1);
  assert.equal(f.keys.snapshot.localKeyCount, 1);
  assert.equal(f.rows.has(f.metadataId), false);
});

test("rotation resumes exact pending writes after a lost response and restart", async () => {
  const f = fixture();
  f.add("one", "First");
  f.add("two", "Second");
  f.state.loseResponse = true;
  const first = f.create();
  await assert.rejects(first.run(), { code: "network_error" });
  assert.ok(f.rows.get(f.metadataId).value.pending);
  first.close();
  await finish(f.create());
  assert.equal(f.receipts.size, 2);
  assert.equal(f.rows.size, 0);
  assert.equal(f.state.completions, 1);
  for (const { record } of f.records.values()) {
    const envelope = JSON.parse(record.payload);
    assert.equal(envelope.context.schema_version, 2);
    assert.equal(envelope.fixture.deleted, false);
    assert.equal(envelope.fixture.ttl, null);
  }
});

test("workspace ciphertext and its journal are included when the server advertises that stream", async () => {
  const f = fixture({ workspaces: true });
  f.add("workspace-record", "Workspace value", { collection: "workspaces" });
  await finish(f.create());
  assert.equal(f.compactions.size, 12);
  assert.ok(f.compactions.has("workspaces"));
  assert.equal(f.state.retirements, 1);
});

test("site permissions are rewritten and compacted independently when the server advertises them", async () => {
  const f = fixture({ workspaces: true, permissions: true });
  f.add("permission-record", "Permission value", { collection: "site-permissions" });
  const localId = randomUUID();
  f.rows.set(localId, { id: localId, collection: "site-permissions", kind: "record", revision: 1,
    value: { permission: "popup", action: "deny" }, encryptedWith: "old" });
  await finish(f.create());
  assert.equal(JSON.parse(f.records.get("permission-record").record.payload).key_id, "new");
  assert.equal(f.rows.get(localId).encryptedWith, "new");
  assert.ok(f.compactions.has("site-permissions"));
  assert.ok(f.compactions.has("midori-privacy"));
  assert.equal(f.compactions.size, 13);
  assert.equal(f.state.retirements, 1);
});

test("extension references and durable install decisions survive key rotation and compaction", async () => {
  const f = fixture({ workspaces: true, permissions: true, extensions: true });
  f.add("extension-record", "Catalog reference", { collection: "extensions" });
  const localId = randomUUID();
  const progress = { phase: "declined", reason: "extension_permission_declined" };
  f.rows.set(localId, { id: localId, collection: "extensions", kind: "application", revision: 1,
    value: { progress }, encryptedWith: "old" });
  await finish(f.create());
  assert.equal(JSON.parse(f.records.get("extension-record").record.payload).key_id, "new");
  assert.equal(f.rows.get(localId).encryptedWith, "new");
  assert.deepEqual(f.rows.get(localId).value.progress, progress);
  assert.equal(f.compactions.size, 14);
  assert.ok(f.compactions.has("extensions"));
  assert.equal(f.state.retirements, 1);
});

test("extension settings preserve complete bundles, tombstones and pending applications through rotation retries", async () => {
  const f = fixture({ workspaces: true, permissions: true, extensions: true, extensionSettings: true });
  const bundle = await extensionSettingsBundle({ value: "portable settings" });
  for (const record of [...bundle.parts, bundle.manifest]) {
    f.add(record.id, "fixture", { collection: "extension-settings" });
    const stored = f.records.get(record.id).record;
    const envelope = JSON.parse(stored.payload);
    envelope.context.schema_version = 2;
    envelope.fixture = { version: 2, deleted: false, ttl: null, value: record.value };
    stored.payload = JSON.stringify(envelope);
  }
  const removedId = "xm1:" + "e".repeat(64);
  f.add(removedId, "fixture", { collection: "extension-settings" });
  const removed = f.records.get(removedId).record;
  const envelope = JSON.parse(removed.payload);
  envelope.context.schema_version = 2;
  envelope.fixture = { version: 2, deleted: true, ttl: null, value: null };
  removed.payload = JSON.stringify(envelope); removed.deleted = true;
  const localId = randomUUID();
  const intent = { id: bundle.manifest.id, remote: bundle.manifest.value, current: { data: { local: true } } };
  f.rows.set(localId, { id: localId, collection: "extension-settings", kind: "application", revision: 1,
    value: intent, encryptedWith: "old" });
  f.state.loseCompaction = true;
  await assert.rejects(finish(f.create()), { code: "network_error" });
  assert.equal(f.state.retirements, 0);
  await finish(f.create());
  for (const record of [...bundle.parts, bundle.manifest]) {
    const opened = JSON.parse(f.records.get(record.id).record.payload);
    assert.equal(opened.key_id, "new");
    assert.deepEqual(opened.fixture.value, record.value);
    assert.equal(opened.context.collection, "extension-settings");
  }
  const tombstone = JSON.parse(f.records.get(removedId).record.payload);
  assert.equal(tombstone.key_id, "new"); assert.equal(tombstone.fixture.deleted, true);
  assert.equal(tombstone.fixture.value, null); assert.equal(f.records.get(removedId).record.deleted, true);
  assert.equal(f.rows.get(localId).encryptedWith, "new");
  assert.deepEqual(f.rows.get(localId).value, intent);
  assert.equal(f.compactions.size, 15); assert.ok(f.compactions.has("extension-settings"));
  assert.equal(f.state.retirements, 1);
});

test("an unknown collection stops rotation before rewriting records or retiring keys", async () => {
  const f = fixture();
  f.add("future-record", "Future value", { collection: "future-collection" });
  const original = copy(f.records.get("future-record"));
  await assert.rejects(f.create().run(), { code: "invalid_rotation_page" });
  assert.deepEqual(f.records.get("future-record"), original);
  assert.equal(f.receipts.size, 0);
  assert.equal(f.compactions.size, 0);
  assert.equal(f.state.completions, 0);
  assert.equal(f.state.retirements, 0);
  assert.equal(f.keys.snapshot.keyCount, 2);
  assert.equal(f.rows.get(f.metadataId).value.phase, "remote");
});

test("rotation does not send a mutation before its durable intent is saved", async () => {
  const f = fixture();
  f.add("one", "First");
  f.state.failCommit = true;
  await assert.rejects(f.create().run(), { code: "disk_full" });
  assert.equal(f.requests.length, 0);
  assert.equal(f.receipts.size, 0);
});

test("local journal entries are reencrypted before migration completion", async () => {
  const f = fixture();
  const id = randomUUID();
  const value = { title: "Local encrypted content" };
  f.rows.set(id, { id, collection: "bookmarks", kind: "record", revision: 3, value, encryptedWith: "old" });
  await finish(f.create());
  assert.deepEqual(f.rows.get(id).value, value);
  assert.equal(f.rows.get(id).encryptedWith, "new");
  assert.equal(f.state.completions, 1);
  assert.equal(f.rows.has(f.metadataId), false);
});

test("lost completion is reconciled without repeating record migration", async () => {
  const f = fixture();
  f.add("one", "First");
  f.state.loseCompletion = true;
  await assert.rejects(finish(f.create()), { code: "network_error" });
  const mutations = f.receipts.size;
  await finish(f.create());
  assert.equal(f.receipts.size, mutations);
  assert.equal(f.rows.has(f.metadataId), false);
});

test("a completed rotation resumes after local completion cleanup fails or its response is lost", async () => {
  for (const failDelete of ["before", "after"]) {
    const f = fixture();
    f.add("one", "Current content");
    f.state.failDelete = failDelete;
    const first = f.create();
    await assert.rejects(finish(first), { code: "disk_full" });
    assert.equal(f.keys.snapshot.rotation.phase, "complete");
    assert.equal(f.keys.snapshot.custody, "client");
    assert.equal(f.rows.has(f.metadataId), failDelete === "before");
    const requests = f.requests.length;
    const records = copy([...f.records]);
    first.close();
    await finish(f.create());
    assert.equal(f.requests.length, requests, "Cleanup never repeats remote data operations");
    assert.deepEqual([...f.records], records);
    assert.equal(f.rows.has(f.metadataId), false);
  }
});

test("legacy unauthenticated tombstones require review before being signed", async () => {
  const f = fixture();
  f.add("one", "First");
  Object.assign(f.records.get("one").record, { deleted: true, payload: "" });
  await assert.rejects(f.create().run(), { code: "legacy_tombstone_review_required" });
  assert.equal(f.receipts.size, 0);
  assert.equal(f.state.completions, 0);
});

test("a definitive CAS conflict discards its receipt and reseals the latest server record", async () => {
  const f = fixture();
  f.add("one", "Original content");
  f.state.conflictOnce = true;
  const first = f.create();
  await assert.rejects(first.run(), { code: "rotation_conflict_retry" });
  assert.equal(f.rows.get(f.metadataId).value.pending, null);
  assert.equal(f.state.completions, 0);
  first.close();
  await finish(f.create());
  const operations = [...f.receipts.values()].map(receipt => receipt.operation);
  assert.equal(operations.length, 2);
  assert.notEqual(operations[0].operation_id, operations[1].operation_id);
  assert.equal(operations[0].base_revision, "1");
  assert.equal(operations[1].base_revision, "2");
  const updated = JSON.parse(f.records.get("one").record.payload);
  assert.equal(updated.fixture.value.title, "Concurrent server edit");
  assert.equal(updated.context.base_revision, "2");
  assert.equal(f.state.completions, 1);
});

test("history identity migration retries both exact ciphertexts after a lost response and restart", async () => {
  const f = fixture();
  const { sourceId, targetId } = f.addHistory();
  f.state.loseResponse = true;
  const first = f.create();
  await assert.rejects(first.run(), { code: "network_error" });
  const pending = copy(f.rows.get(f.metadataId).value.pending);
  assert.equal(pending.path, "api/v1/crypto/rotation/history-id");
  first.close();
  await finish(f.create());
  const sent = f.requests.filter(request => request.path === pending.path);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].options.body, pending.body);
  assert.deepEqual(sent[1].options.body, pending.body);
  assert.equal(f.receipts.size, 1);
  assert.equal(f.records.size, 2);
  const source = f.records.get(sourceId).record;
  const target = f.records.get(targetId).record;
  assert.equal(source.deleted, true);
  assert.equal(source.revision, "2");
  assert.equal(JSON.parse(source.payload).fixture.deleted, true);
  assert.equal(target.deleted, false);
  assert.equal(target.revision, "1");
  assert.equal(JSON.parse(target.payload).fixture.value.url, "https://history.invalid/");
  assert.equal(f.rows.size, 0);
});

test("history migration preserves its pending operation until the exact atomic receipt is verified", async () => {
  for (const historyResponse of [
    { rotation_id: randomUUID() }, { generation: randomUUID() },
    { source_id: "unrelated" }, { target_id: "unrelated" },
    { source_revision: "3" }, { target_revision: "2" },
  ]) {
    const f = fixture();
    f.addHistory();
    f.state.historyResponse = historyResponse;
    const first = f.create();
    await assert.rejects(first.run(), { code: "invalid_rotation_result" });
    assert.ok(f.rows.get(f.metadataId).value.pending);
    assert.equal(f.state.completions, 0);
    first.close();
    f.state.historyResponse = null;
    await finish(f.create());
    assert.equal(f.receipts.size, 1);
    assert.equal(f.state.completions, 1);
  }
});

test("migration marks collection journals for a fresh inventory without losing their durable state", async () => {
  const f = fixture();
  const id = randomUUID();
  const value = { version: 3, initialized: true, generation: randomUUID(), cursor: "17", reconciled: true };
  f.rows.set(id, { id, collection: "history", kind: "metadata", revision: 4, value, encryptedWith: "old" });
  await finish(f.create());
  assert.deepEqual(f.rows.get(id).value, { ...value, initialized: false });
  assert.equal(f.rows.get(id).encryptedWith, "new");
});

test("a definitive history source conflict refetches the changed source and preserves target expiration", async () => {
  const f = fixture();
  const ttl = "2027-01-01T00:00:00Z";
  const { sourceId, targetId } = f.addHistory(ttl);
  f.state.historyConflict = { code: "history_source_conflict", status: 409 };
  const first = f.create();
  await assert.rejects(first.run(), { code: "rotation_conflict_retry" });
  assert.equal(f.rows.get(f.metadataId).value.pending, null);
  assert.equal(f.records.has(targetId), false);
  first.close();
  await finish(f.create());
  const operations = f.requests.filter(request => request.path.endsWith("/history-id")).map(request => request.options.body);
  assert.equal(operations.length, 2);
  assert.notEqual(operations[0].operation_id, operations[1].operation_id);
  assert.equal(operations[0].source_revision, "1");
  assert.equal(operations[1].source_revision, "2");
  assert.equal(f.records.get(sourceId).record.revision, "3");
  const target = f.records.get(targetId).record;
  assert.equal(target.ttl, ttl);
  assert.equal(JSON.parse(target.payload).fixture.value.title, "Concurrent history edit");
});

test("ambiguous history failures keep the exact durable operation", async () => {
  for (const error of [
    { code: "history_source_conflict", status: 500 },
    { code: "timeout", status: 0 },
  ]) {
    const f = fixture();
    f.addHistory();
    f.state.historyConflict = error;
    const first = f.create();
    await assert.rejects(first.run(), error);
    const pending = copy(f.rows.get(f.metadataId).value.pending);
    assert.ok(pending);
    assert.equal(f.state.completions, 0);
    first.close();
    await finish(f.create());
    const sent = f.requests.filter(request => request.path === pending.path);
    assert.deepEqual(sent[1].options.body, pending.body);
  }
});

test("reviewed legacy deletions persist explicit consent before signing and resume after a lost response", async () => {
  const f = fixture();
  f.add("legacy-deletion", "Deleted");
  Object.assign(f.records.get("legacy-deletion").record, { deleted: true, payload: "" });
  const first = f.create();
  let review;
  await assert.rejects(first.run(), error => {
    assert.equal(error.code, "legacy_tombstone_review_required");
    [review] = error.review;
    return true;
  });
  assert.equal(review.id, "legacy-deletion");
  assert.equal(review.decision, null);
  assert.deepEqual(f.rows.get(f.metadataId).value.review, review);
  first.close();
  f.state.loseResponse = true;
  const second = f.create();
  await assert.rejects(second.run({ legacyDeletionDecisions: [{ ...review, decision: "delete" }] }), { code: "network_error" });
  const saved = f.rows.get(f.metadataId).value;
  assert.equal(saved.review.decision, "delete");
  const pending = copy(saved.pending);
  assert.equal(pending.body.operations[0].deleted, true);
  assert.equal(JSON.parse(pending.body.operations[0].payload).fixture.deleted, true);
  second.close();
  await finish(f.create());
  assert.equal(f.receipts.size, 1);
  assert.equal(f.state.completions, 1);
  assert.equal(f.records.get("legacy-deletion").record.deleted, true);
  assert.equal(f.requests.filter(item => item.options.body?.operations).length, 2);
});

test("legacy deletion approval is scoped to the exact persisted rotation, generation, record and revision", async () => {
  for (const changed of [{ rotation_id: randomUUID() }, { generation: randomUUID() },
    { id: "another" }, { revision: "2" }, { collection: "history" },
    { ttl: "2027-01-01T00:00:00Z" }, { decision: "restore" }]) {
    const f = fixture();
    f.add("deleted", "Deleted");
    Object.assign(f.records.get("deleted").record, { deleted: true, payload: "" });
    const first = f.create();
    await assert.rejects(first.run(), { code: "legacy_tombstone_review_required" });
    const review = copy(f.rows.get(f.metadataId).value.review);
    await assert.rejects(first.run({ legacyDeletionDecisions: [{ ...review, decision: "delete", ...changed }] }),
      { code: "invalid_legacy_review" });
    assert.equal(f.receipts.size, 0);
    assert.equal(f.rows.get(f.metadataId).value.review.decision, null);
    first.close();
  }
});

test("a changed legacy tombstone needs a fresh review and failed consent persistence sends no mutation", async () => {
  const f = fixture();
  f.add("deleted", "Deleted");
  const stored = f.records.get("deleted").record;
  Object.assign(stored, { deleted: true, payload: "" });
  const driver = f.create();
  await assert.rejects(driver.run(), { code: "legacy_tombstone_review_required" });
  const decision = { ...f.rows.get(f.metadataId).value.review, decision: "delete" };
  f.state.failCommit = true;
  await assert.rejects(driver.run({ legacyDeletionDecisions: [decision] }), { code: "disk_full" });
  assert.equal(f.rows.get(f.metadataId).value.review.decision, null);
  assert.equal(f.receipts.size, 0);
  stored.revision = "2";
  await assert.rejects(driver.run({ legacyDeletionDecisions: [decision] }), error => {
    assert.equal(error.code, "legacy_tombstone_review_required");
    assert.equal(error.review[0].revision, "2");
    assert.equal(error.review[0].decision, null);
    return true;
  });
  assert.equal(f.receipts.size, 0);
});

test("a history target collision unions visits and uses CAS on both records with the earliest TTL", async () => {
  const f = fixture();
  const { sourceId, targetId } = f.addHistory("2027-02-01T00:00:00Z");
  const source = JSON.parse(f.records.get(sourceId).record.payload);
  source.fixture.visits = [{ atUsec: 100, transition: 1, count: 2 }];
  f.records.get(sourceId).record.payload = JSON.stringify(source);
  f.addHistoryTarget({ ttl: "2027-01-01T00:00:00Z", visits: [
    { atUsec: 100, transition: 1, count: 1 }, { atUsec: 200, transition: 1, count: 1 },
  ] });
  await finish(f.create());
  const target = f.records.get(targetId).record;
  assert.equal(target.revision, "5");
  assert.equal(target.ttl, "2027-01-01T00:00:00Z");
  assert.deepEqual(JSON.parse(target.payload).fixture.value.visits, [
    { atUsec: 100, transition: 1, count: 2 }, { atUsec: 200, transition: 1, count: 1 },
  ]);
  assert.equal(f.records.get(sourceId).record.deleted, true);
  const sent = f.requests.find(item => item.path.endsWith("/history-id")).options.body;
  assert.equal(sent.target_revision, "4");
  assert.equal(sent.source_revision, "1");
  assert.equal(sent.target_deleted, false);
});

test("an existing deleted or expired history target remains deleted after identity migration", async () => {
  for (const target of [{ deleted: true }, { ttl: "2020-01-01T00:00:00Z" }]) {
    const f = fixture();
    const { sourceId, targetId } = f.addHistory();
    f.addHistoryTarget(target);
    await finish(f.create());
    const result = f.records.get(targetId).record;
    assert.equal(result.deleted, true);
    assert.equal(result.ttl, null);
    assert.equal(result.revision, "5");
    assert.deepEqual(JSON.parse(result.payload).fixture, { version: 2, deleted: true, ttl: null, value: null });
    assert.equal(f.records.get(sourceId).record.deleted, true);
  }
});

test("an unauthenticated deleted target requires explicit review and is never resurrected", async () => {
  const f = fixture();
  const { targetId } = f.addHistory();
  f.addHistoryTarget({ deleted: true, payload: false });
  const driver = f.create();
  await assert.rejects(driver.run(), error => {
    assert.equal(error.code, "legacy_tombstone_review_required");
    assert.equal(error.review[0].id, targetId);
    assert.equal(error.review[0].revision, "4");
    return true;
  });
  assert.equal(f.receipts.size, 0);
  const decision = { ...f.rows.get(f.metadataId).value.review, decision: "delete" };
  await driver.run({ legacyDeletionDecisions: [decision] });
  await finish(driver);
  assert.equal(f.records.get(targetId).record.deleted, true);
  assert.equal(f.records.get(targetId).record.revision, "5");
});

test("history target CAS conflicts refetch and preserve the newly arrived visits", async () => {
  const f = fixture();
  f.addHistory();
  const targetId = f.addHistoryTarget({ visits: [{ atUsec: 100, transition: 1, count: 1 }] });
  f.state.historyConflict = { code: "history_target_conflict", status: 409 };
  const first = f.create();
  await assert.rejects(first.run(), { code: "rotation_conflict_retry" });
  assert.equal(f.rows.get(f.metadataId).value.pending, null);
  first.close();
  await finish(f.create());
  const operations = f.requests.filter(item => item.path.endsWith("/history-id")).map(item => item.options.body);
  assert.equal(operations.length, 2);
  assert.notEqual(operations[0].operation_id, operations[1].operation_id);
  assert.equal(operations[0].target_revision, "4");
  assert.equal(operations[1].target_revision, "5");
  assert.deepEqual(JSON.parse(f.records.get(targetId).record.payload).fixture.value.visits, [
    { atUsec: 100, transition: 1, count: 1 }, { atUsec: 300, transition: 1, count: 1 },
  ]);
});

test("a first-insert history collision also discards its confirmed failed intent before retrying", async () => {
  const f = fixture();
  f.addHistory();
  f.state.historyConflict = { code: "history_target_exists", status: 409 };
  await assert.rejects(f.create().run(), { code: "rotation_conflict_retry" });
  assert.equal(f.rows.get(f.metadataId).value.pending, null);
  f.addHistoryTarget({ visits: [{ atUsec: 100, transition: 1, count: 1 }] });
  await finish(f.create());
  assert.equal(f.state.completions, 1);
});

test("history target responses must match the current account collection generation and rotation", async () => {
  for (const targetResponse of [{ generation: randomUUID() }, { rotation_id: randomUUID() },
    { record: { id: "unrelated" } }, { record: undefined }]) {
    const f = fixture();
    f.addHistory();
    f.state.targetResponse = targetResponse;
    await assert.rejects(f.create().run(), { code: "invalid_rotation_target" });
    assert.equal(f.receipts.size, 0);
    assert.equal(f.rows.get(f.metadataId).value.pending, null);
  }
});

test("rotation compacts every collection before retiring data keys and removing its checkpoint", async () => {
  const f = fixture();
  f.add("one", "Current record");
  await finish(f.create());
  assert.equal(f.compactions.size, 11);
  assert.equal(f.state.retirements, 1);
  assert.equal(f.rows.has(f.metadataId), false);
  assert.equal(f.keys.snapshot.custody, "client");
  assert.ok(f.compactions.has("form-history"));
  assert.ok(f.compactions.has("addresses"));
});

test("compaction recovers an exact durable receipt after a lost response and driver restart", async () => {
  const f = fixture();
  f.state.loseCompaction = true;
  const first = f.create();
  await assert.rejects(finish(first), { code: "network_error" });
  const checkpoint = f.rows.get(f.metadataId).value;
  assert.equal(checkpoint.phase, "compact");
  assert.equal(checkpoint.pending.kind, "compact");
  const pending = copy(checkpoint.pending);
  assert.equal(f.state.retirements, 0);
  first.close();
  await finish(f.create());
  const sent = f.requests.filter(item => item.path === pending.path);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].options.body, pending.body);
  assert.deepEqual(sent[1].options.body, pending.body);
  assert.equal(f.state.retirements, 1);
});

test("compaction must persist its exact intent before deleting any server journal history", async () => {
  const f = fixture();
  f.state.failCompactionIntent = true;
  await assert.rejects(finish(f.create()), { code: "disk_full" });
  assert.equal(f.requests.some(item => item.path.endsWith("/compact")), false);
  assert.equal(f.compactions.size, 0);
  assert.equal(f.state.retirements, 0);
  await finish(f.create());
  assert.equal(f.state.retirements, 1);
});

test("compaction snapshot CAS conflicts refetch the high-water mark with a new operation ID", async () => {
  const f = fixture();
  f.state.compactionConflict = true;
  const first = f.create();
  await assert.rejects(finish(first), { code: "rotation_conflict_retry" });
  assert.equal(f.rows.get(f.metadataId).value.pending, null);
  assert.equal(f.rows.get(f.metadataId).value.phase, "compact");
  first.close();
  await finish(f.create());
  const sent = f.requests.filter(item => item.path.endsWith("/bookmarks/compact"));
  assert.equal(sent.length, 2);
  assert.equal(sent[0].options.body.snapshot_sequence, "10");
  assert.equal(sent[1].options.body.snapshot_sequence, "11");
  assert.notEqual(sent[0].options.body.operation_id, sent[1].options.body.operation_id);
});

test("unverified compaction receipts retain their exact intent and cannot retire keys", async () => {
  for (const compactionResponse of [{ generation: randomUUID() }, { operation_id: randomUUID() },
    { compacted_through: "0" }, { snapshot_sequence: "0" }, { records: -1 }]) {
    const f = fixture();
    f.state.compactionResponse = compactionResponse;
    await assert.rejects(finish(f.create()), { code: "invalid_compaction_result" });
    assert.equal(f.state.retirements, 0);
    assert.equal(f.rows.get(f.metadataId).value.pending.kind, "compact");
    f.state.compactionResponse = null;
    await finish(f.create());
    assert.equal(f.state.retirements, 1);
  }
});

test("servers without compaction support keep old keys and leave the update resumable", async () => {
  const f = fixture();
  f.state.noCompaction = true;
  await assert.rejects(finish(f.create()), { code: "journal_compaction_unsupported" });
  assert.equal(f.rows.get(f.metadataId).value.phase, "compact");
  assert.equal(f.state.retirements, 0);
  assert.equal(f.compactions.size, 0);
  f.state.noCompaction = false;
  await finish(f.create());
  assert.equal(f.state.retirements, 1);
});

test("failed key retirement resumes its own checkpoint without repeating server compaction", async () => {
  const f = fixture();
  f.state.retireFailure = true;
  const first = f.create();
  await assert.rejects(finish(first), { code: "network_error" });
  assert.equal(f.rows.get(f.metadataId).value.phase, "retire");
  assert.equal(f.compactions.size, 11);
  const requests = f.requests.length;
  first.close();
  await finish(f.create());
  assert.equal(f.requests.length, requests);
  assert.equal(f.state.retirements, 1);
  assert.equal(f.rows.has(f.metadataId), false);
});

test("completed rotations from older clients reencrypt local journals, compact and retire retained keys", async () => {
  const f = fixture();
  f.keys.snapshot.rotation.phase = "complete";
  f.keys.snapshot.custody = "client";
  const id = randomUUID();
  f.rows.set(id, { id, collection: "bookmarks", kind: "record", revision: 1,
    value: { title: "Offline local data" }, encryptedWith: "old" });
  await finish(f.create());
  assert.equal(f.rows.get(id).encryptedWith, "new");
  assert.equal(f.compactions.size, 11);
  assert.equal(f.state.retirements, 1);
  assert.equal(f.keys.snapshot.keyCount, 1);
  const requests = f.requests.length;
  const again = await f.create().run();
  assert.deepEqual(again, { done: true, processed: 0, remaining: 0 });
  assert.equal(f.requests.length, requests, "Checking an already retired rotation does not recompact streams");
});
