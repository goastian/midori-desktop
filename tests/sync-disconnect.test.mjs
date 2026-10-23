/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { assertSyncStoreSettled, assertSyncAccountSettled } from "../src/browser/components/sync/MidoriSyncDisconnect.sys.mjs";
import { recoverLocalSyncKeys } from "../src/browser/components/sync/MidoriSyncKeys.sys.mjs";

const keyId = Buffer.alloc(16, 1).toString("base64url");
const bundle = JSON.stringify({ bundle_version: 2, crypto_version: 2, key_id: keyId,
  kdf: { algorithm: "argon2id13", memory_kib: 65536, iterations: 3, parallelism: 1 },
  salt: Buffer.alloc(16).toString("base64"), nonce: Buffer.alloc(24).toString("base64"), ciphertext: Buffer.alloc(48).toString("base64") });
const entryId = (...parts) => {
  const hash = createHash("sha256").update(JSON.stringify(parts)).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
};
const settled = () => ({ version: 3, generation: randomUUID(), cursor: "fixture-cursor", sequence: "1", fence: null,
  inbox: null, index: 0, ack: null, initialized: true, pending: 0, conflicts: 0, deferred: 0,
  activeApplication: null, applicationAfter: null });

function setup() {
  const deviceId = randomUUID();
  const state = { rows: [], opens: 0, scans: 0, storeClosed: 0, cryptoClosed: 0, secret: null, beforeOpen: null, beforeScan: null };
  const options = {
    identity: { version: 1, store_id: randomUUID(), device_id: deviceId, initialized: true },
    deviceId, scope: '["https://sync.example/","https://identity.example/","test-user"]', directory: "/fixture", entryId,
    localKeys: { version: 1, epoch: randomUUID(), revision: "1", secret: "a".repeat(64), keys: [{ key_id: keyId, encrypted_bundle: bundle }], pending: null },
    cryptoFactory: () => ({
      async recoverNativeKey(scope, secret, wrapped) {
        assert.equal(scope, options.scope);
        assert.ok(options.localKeys.keys.some(key => key.encrypted_bundle === wrapped));
        state.secret = secret;
        return JSON.parse(wrapped).key_id;
      },
      async nativeKeyId(handle) { return handle; },
      async openNative(_handle, purpose, expected, envelope) {
        assert.equal(purpose, 1, "Offline custody authorizes only local envelopes");
        assert.equal(JSON.parse(expected).id, "fixture");
        assert.equal(JSON.parse(envelope).key_id, keyId);
        await state.beforeOpen?.();
        state.plaintext = new Uint8Array([1, 2, 3]);
        return state.plaintext;
      },
      close() { ++state.cryptoClosed; },
    }),
    async openStore(args) {
      ++state.opens;
      assert.equal(args.create, false);
      assert.equal(args.deviceId, deviceId);
      assert.equal(args.storeId, options.identity.store_id);
      assert.equal(args.keys.sealLocal, undefined, "Inspection cannot write encrypted rows");
      return {
        async read(id) { return structuredClone(state.rows.find(row => row.id === id) ?? null); },
        async scan({ after, limit }) {
          ++state.scans;
          await state.beforeScan?.();
          return structuredClone(state.rows.filter(row => after === null || row.id > after).sort((a, b) => a.id.localeCompare(b.id)).slice(0, Math.min(2, limit)));
        },
        async close() { ++state.storeClosed; },
      };
    },
  };
  const metadata = (collection = "bookmarks", value = settled()) => ({ id: entryId(collection, "metadata", "collection-state-v1"), collection, kind: "metadata", value });
  const record = (id, collection = "bookmarks") => ({ id: entryId(collection, "record", id), collection, kind: "record", value: {
    version: 1, id, pending: null, blocked: false, applying: null,
    remote: { id, revision: "1", deleted: true, payload: "", ttl: null, value: null },
  } });
  return { options, state, metadata, record, check: () => assertSyncStoreSettled(options) };
}

function pendingRotation(options) {
  const key = index => {
    const key_id = Buffer.alloc(16, index).toString("base64url");
    return { key_id, encrypted_bundle: JSON.stringify({ ...JSON.parse(bundle), key_id }) };
  };
  const target = key(2);
  options.localKeys.keys.push(target);
  options.localKeys.identity_key = key(3);
  options.localKeys.recovery_confirmed = true;
  options.localKeys.active_key_id = keyId;
  options.localKeys.rotation = {
    crypto: { epoch: options.localKeys.epoch, revision: options.localKeys.revision },
    operation_id: randomUUID(), ...target, keys: structuredClone(options.localKeys.keys),
    identity_key: structuredClone(options.localKeys.identity_key), registry_auth: "b".repeat(64),
  };
}

test("all authenticated pages and collections are inspected before releasing custody", async () => {
  const { state, metadata, record, check } = setup();
  state.rows = [metadata(), metadata("passwords"), record("one"), record("two"), record("three", "passwords")];
  const before = structuredClone(state.rows);
  await check();
  assert.equal(state.scans, 4, "A short page does not imply the end of the journal");
  assert.deepEqual(state.rows, before);
  assert.ok(state.secret.every(byte => byte === 0));
  assert.equal(state.storeClosed, 1);
  assert.equal(state.cryptoClosed, 1);
});

test("disconnect verifies saved copies even if the active journal identity was lost", async () => {
  for (const missing of [false, true]) {
    const { options, state, metadata } = setup();
    state.rows = [metadata()];
    if (missing) { options.identity = null; }
    let checked = 0;
    const localKeys = structuredClone(options.localKeys);
    const assertSavedCopies = async value => {
      ++checked;
      assert.deepEqual(value, { directory: options.directory, activeId: options.identity?.store_id ?? null, keyIds: [keyId], scope: options.scope });
      throw { code: "saved_journals_require_review" };
    };
    await assert.rejects(assertSyncAccountSettled({ ...options, assertSavedCopies }), { code: "saved_journals_require_review" });
    assert.equal(checked, 1);
    assert.deepEqual(options.localKeys, localKeys);
    assert.equal(state.storeClosed, missing ? 0 : 1);
    assert.equal(state.cryptoClosed, missing ? 0 : 1);
  }
});

test("an unsettled active journal stops before any other custody check", async () => {
  const { options, state, metadata } = setup();
  state.rows = [metadata("bookmarks", { ...settled(), pending: 1 })];
  await assert.rejects(assertSyncAccountSettled({ ...options,
    assertSavedCopies() { throw new Error("Must settle the active copy first"); } }), /sync_pending_operations/);
  await assert.rejects(assertSyncAccountSettled(options), /sync_disconnect_unavailable/);
});

test("unrecognized custody cannot be cleared just because the active journal identity is missing", async () => {
  for (const mutate of [
    () => ({ version: 99, futureCustody: "preserve" }),
    value => ({ ...value, version: 99 }),
    value => ({ ...value, keys: {} }),
    value => ({ ...value, keys: [null] }),
    value => ({ ...value, keys: [] }),
    value => ({ ...value, secret: "unknown" }),
    () => undefined,
  ]) {
    const { options, state } = setup();
    options.identity = null;
    options.localKeys = mutate(options.localKeys);
    const before = structuredClone(options.localKeys);
    await assert.rejects(assertSyncAccountSettled({ ...options,
      assertSavedCopies() { throw new Error("Unknown custody is not a saved-file review failure"); } }), /sync_disconnect_unavailable/);
    assert.deepEqual(options.localKeys, before);
    assert.equal(state.opens, 0);
  }
});

test("missing journal identity still verifies saved copies for draft custody without recovering native keys", async () => {
  const { options, state } = setup();
  options.identity = null;
  options.localKeys.pending = structuredClone(options.localKeys.keys[0]);
  const before = structuredClone(options.localKeys);
  let checked = false;
  await assertSyncAccountSettled({ ...options, assertSavedCopies(value) {
    checked = true;
    assert.deepEqual(value.keyIds, [keyId]);
    assert.equal(value.activeId, null);
  } });
  assert.equal(checked, true);
  assert.deepEqual(options.localKeys, before);
  assert.equal(state.opens, 0);
  assert.equal(state.cryptoClosed, 0);
});

test("H2 form and address journals can disconnect only when their durable work is settled", async () => {
  for (const collection of ["form-history", "addresses"]) {
    const { state, metadata, record, check } = setup();
    state.rows = [metadata(collection), record("h2-record", collection)];
    const before = structuredClone(state.rows);
    await check();
    assert.deepEqual(state.rows, before);
    state.rows.push({ id: randomUUID(), collection, kind: "outbox", value: { fixture: true } });
    await assert.rejects(check(), /sync_pending_operations/);
  }
});

test("a pending rotation prevents disconnect and ordinary offline recovery", async () => {
  const { options, state, check } = setup();
  pendingRotation(options);
  await assert.rejects(check(), /sync_disconnect_unavailable/);
  await assert.rejects(recoverLocalSyncKeys({
    scope: options.scope, value: options.localKeys, cryptoFactory: options.cryptoFactory,
  }), /local_keys_invalid/);
  assert.equal(state.opens, 0);
  assert.equal(state.cryptoClosed, 0);
});

test("rotation preflight may read a settled journal without changing its saved intent", async () => {
  const { options, state, metadata, record, check } = setup();
  pendingRotation(options);
  options.allowPendingRotation = true;
  state.rows = [metadata(), record("one")];
  const before = structuredClone({ localKeys: options.localKeys, rows: state.rows });
  await check();
  assert.deepEqual({ localKeys: options.localKeys, rows: state.rows }, before);
  assert.equal(state.storeClosed, 1);
  assert.equal(state.cryptoClosed, 1);
  assert.ok(state.secret.every(byte => byte === 0));
});

test("rotation preflight still rejects durable work even when counters claim zero", async () => {
  const { options, state, metadata, check } = setup();
  pendingRotation(options);
  options.allowPendingRotation = true;
  state.rows = [metadata(), { id: "ffffffff-ffff-ffff-ffff-ffffffffffff", collection: "bookmarks", kind: "outbox", value: { fixture: true } }];
  const before = structuredClone({ localKeys: options.localKeys, rows: state.rows });
  await assert.rejects(check(), /sync_pending_operations/);
  assert.deepEqual({ localKeys: options.localKeys, rows: state.rows }, before);
  assert.equal(state.storeClosed, 1);
  assert.equal(state.cryptoClosed, 1);
});

test("rotation preflight never bypasses activation, intent validation or an explicit opt in", async () => {
  for (const mutate of [
    options => { options.localKeys.pending = options.localKeys.keys[0]; },
    options => { options.localKeys.rotation.keys.pop(); },
    options => { options.localKeys.rotation.crypto.epoch = randomUUID(); },
    options => { options.allowPendingRotation = "true"; },
  ]) {
    const { options, state, check } = setup();
    pendingRotation(options);
    options.allowPendingRotation = true;
    mutate(options);
    await assert.rejects(check(), /sync_disconnect_unavailable/);
    assert.equal(state.opens, 0);
    assert.equal(state.cryptoClosed, 0);
  }
});

test("unknown collection state retains encrypted custody", async () => {
  const { state, metadata, check } = setup();
  state.rows = [metadata("retired-collection")];
  await assert.rejects(check(), /sync_disconnect_unavailable/);
});

for (const kind of ["outbox", "inbox", "application", "conflict"]) {
  test(`a durable ${kind} preserves custody even when counters claim zero`, async () => {
    const { state, metadata, check } = setup();
    state.rows = [metadata(), { id: "ffffffff-ffff-ffff-ffff-ffffffffffff", collection: "passwords", kind, value: { fixture: true } }];
    await assert.rejects(check(), /sync_pending_operations/);
    assert.equal(state.storeClosed, 1);
    assert.equal(state.cryptoClosed, 1);
    assert.equal(state.rows.length, 2);
  });
}

test("collection and record markers prevent disconnect even if their work rows are missing", async () => {
  for (const field of ["pending", "conflicts", "deferred", "ack", "fence"]) {
    const { state, metadata, check } = setup();
    const value = settled();
    value[field] = field === "ack" ? value.cursor : field === "fence" ? "2" : 1;
    state.rows = [metadata("bookmarks", value)];
    await assert.rejects(check(), /sync_pending_operations/);
  }
  for (const patch of [{ pending: randomUUID() }, { applying: randomUUID() }, { blocked: true }]) {
    const { state, metadata, record, check } = setup();
    const row = record("one");
    Object.assign(row.value, patch);
    state.rows = [metadata(), row];
    await assert.rejects(check(), /sync_pending_operations/);
  }
});

test("unrecognized state and missing collection metadata never count as a settled journal", async () => {
  for (const mutate of [
    rows => { rows[0].value.version = 999; },
    rows => { rows[0].id = randomUUID(); },
    rows => { rows[1].value.remote.id = "someone-else"; },
    rows => { rows.shift(); },
    rows => { rows[1].kind = "unknown"; },
  ]) {
    const { state, metadata, record, check } = setup();
    state.rows = [metadata(), record("one")];
    mutate(state.rows);
    await assert.rejects(check(), /sync_disconnect_unavailable/);
  }
});

test("missing custody, incomplete initialization, another device and bad key material preserve the account", async () => {
  for (const mutate of [
    options => { options.identity.initialized = false; },
    options => { options.identity.device_id = randomUUID(); },
    options => { options.localKeys = null; },
    options => { options.localKeys.pending = options.localKeys.keys[0]; },
    options => { options.localKeys.keys[0].key_id = Buffer.alloc(16, 2).toString("base64url"); },
  ]) {
    const { options, state, check } = setup();
    mutate(options);
    await assert.rejects(check(), /sync_disconnect_unavailable/);
    assert.equal(state.opens, 0);
  }
  const { options, state, check } = setup();
  options.identity = null;
  await check();
  assert.equal(state.opens, 0);
});

test("a decryption failure on a later page closes inspection and cannot authorize deletion", async () => {
  const { state, metadata, record, check } = setup();
  state.rows = [metadata(), record("one"), record("two")];
  state.beforeScan = () => { if (state.scans === 2) { throw new DOMException("synthetic corruption", "OperationError"); } };
  await assert.rejects(check(), /sync_disconnect_unavailable/);
  assert.equal(state.storeClosed, 1);
  assert.equal(state.cryptoClosed, 1);
});

test("offline key recovery exposes only local reads and clears plaintext if closed during a read", async () => {
  const { options, state } = setup();
  const keys = await recoverLocalSyncKeys({ scope: options.scope, value: options.localKeys, cryptoFactory: options.cryptoFactory });
  assert.equal(keys.sealLocal, undefined);
  assert.equal(keys.openRecord, undefined);
  assert.ok(state.secret.every(byte => byte === 0));
  const envelope = JSON.stringify({ key_id: keyId });
  assert.deepEqual(await keys.openLocal({ id: "fixture" }, envelope), new Uint8Array([1, 2, 3]));
  await assert.rejects(keys.openLocal({ id: "fixture" }, JSON.stringify({ key_id: "unknown" })), /unknown_key/);
  state.beforeOpen = () => keys.close();
  await assert.rejects(keys.openLocal({ id: "fixture" }, envelope), /cancelled/);
  assert.ok(state.plaintext.every(byte => byte === 0));
});
