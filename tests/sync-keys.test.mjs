/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { MidoriSyncKeys, validateNativeCryptoState } from "../src/browser/components/sync/MidoriSyncKeys.sys.mjs";

const epoch = "107cf1f2-bfdc-4cde-a416-a8ec8576a36b";
const scope = JSON.stringify(["http://localhost:8000/", "urn:midori:sync:local", "fixture-a"]);

function setup() {
  const state = {
    remote: { crypto_state_version: 1, epoch, revision: "0", mode: "legacy", active_key_id: null, keys: [], incompatible_sessions: 0, migration_required: false,
      server_recovery: false, custody: "client", password_unlock: false, identity_key: null, registry_auth: null, rotation: null },
    local: null, requests: [], writes: 0, localAccesses: 0, instances: [], wraps: new Map(), counter: 0, scope,
    writeError: false, afterWriteError: false, responseLost: false, stateError: false, activationError: false,
    beforeWrap: null, beforeOpen: null, randomBuffers: [], openedBytes: null,
    enrollmentServer(path, options) {
      const [, , , , id, action] = path.split("/");
      const rows = (this.enrollments ??= new Map());
      const method = options.method ?? "GET";
      if (!id) {
        if (method === "POST") {
          const row = { id: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", public_key: options.body.public_key,
            device_name: options.body.device_name ?? "", status: "pending",
            expires_at: new Date(Date.now() + 600000).toISOString() };
          rows.set(row.id, row);
          return { id: row.id, status: "pending", expires_at: row.expires_at };
        }
        return { enrollments: [...rows.values()].filter(row => row.status === "pending") };
      }
      const row = rows.get(id);
      if (action === "approve") {
        Object.assign(row, { status: "approved", approver_public_key: options.body.approver_public_key, payload: options.body.payload });
        return null;
      }
      if (action === "deny") {
        row.status = "denied";
        return null;
      }
      if (method === "DELETE") {
        rows.delete(id);
        return null;
      }
      return structuredClone(row);
    },
    retireResponseLost: false, retireError: null, retireNoop: false, retireBadMac: false, afterRetire: null,
  };
  const account = {
    snapshot: { status: "connected", generation: 1, registryAuthVersion: 2 }, listeners: new Set(),
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); },
    invalidate() { ++this.snapshot.generation; for (const listener of this.listeners) { listener(this.snapshot); } },
    withLocalSecrets(work) { ++state.localAccesses; return this.withSecrets(work); },
    async withSecrets(work) {
      return work({
        scope: state.scope, deviceId: "device-a", generation: this.snapshot.generation,
        readLocalKeys: () => structuredClone(state.local),
        async writeLocalKeys(value) {
          ++state.writes;
          if (state.writeError) { throw { code: "vault_unavailable" }; }
          state.local = structuredClone(value);
          if (state.afterWriteError) { throw { code: "vault_unavailable" }; }
        },
        async request(path, options = {}) {
          state.requests.push({ path, options: structuredClone(options) });
          if (path === "api/v1/devices") {
            return { data: { devices: state.devices ?? [{ id: "device-a" }] } };
          } else if (path === "api/v1/crypto/reset") {
            assert.equal(options.body.confirm, true);
            assert.deepEqual(options.body.crypto, { epoch: state.remote.epoch, revision: state.remote.revision });
            state.remote = { ...state.remote, epoch: "207cf1f2-bfdc-4cde-a416-a8ec8576a36b", revision: "0", mode: "native", active_key_id: null,
              keys: [], identity_key: null, registry_auth: null };
            return { data: structuredClone(state.remote) };
          } else if (path.startsWith("api/v1/crypto/enrollments")) {
            return { data: state.enrollmentServer(path, options) };
          } else if (path === "api/v1/crypto/password") {
            if (options.method === "PUT") {
              assert.deepEqual(options.body.crypto, { epoch: state.remote.epoch, revision: state.remote.revision });
              state.passwordCapsule = structuredClone(options.body.capsule);
              state.remote.password_unlock = true;
              return { data: null };
            }
            return { data: { epoch: state.remote.epoch, capsule: structuredClone(state.passwordCapsule) } };
          } else if (path === "api/v1/crypto/state") {
            if (state.stateError) { throw typeof state.stateError === "object" ? state.stateError : { code: "network_error" }; }
          } else if (path === "api/v1/crypto/rotation") {
            assert.ok(state.local.rotation, "The rotation intent is durable before publication");
            assert.deepEqual(options.body.crypto, { epoch, revision: state.remote.revision });
            assert.equal(Object.hasOwn(options.body, "recovery_secret"), false);
            if (state.activationError) { throw { code: "network_error" }; }
            const sourceIds = state.remote.keys.map(key => key.key_id);
            state.remote = { ...state.remote, revision: String(Number(state.remote.revision) + 1),
              keys: options.body.keys, active_key_id: options.body.key_id,
              identity_key: options.body.identity_key, registry_auth: options.body.registry_auth, registry_auth_version: options.body.registry_auth_version ?? 1, custody: "transition",
              rotation: { operation_id: options.body.operation_id, target_key_id: options.body.key_id,
                source_key_ids: sourceIds, phase: "rewriting", live_records: 1, journal_records: 1 } };
            if (state.responseLost) { throw { code: "network_error" }; }
          } else if (path === "api/v1/crypto/rotation/complete") {
            assert.equal(options.body.operation_id, state.remote.rotation.operation_id);
            if (state.remote.rotation.live_records) { throw { code: "rotation_incomplete" }; }
            state.remote = { ...state.remote, revision: String(Number(state.remote.revision) + 1),
              custody: "client", server_recovery: false, registry_auth: options.body.registry_auth, registry_auth_version: options.body.registry_auth_version ?? 1,
              rotation: { ...state.remote.rotation, phase: "complete" } };
            if (state.responseLost) { throw { code: "network_error" }; }
          } else if (path.startsWith("api/v1/crypto/native-keys/")) {
            assert.equal(options.method, "DELETE");
            assert.deepEqual(options.body.crypto, { epoch, revision: state.remote.revision });
            const id = path.split("/").at(-1);
            assert.notEqual(id, state.remote.active_key_id);
            assert.notEqual(id, state.remote.identity_key.key_id);
            assert.ok(state.remote.keys.some(key => key.key_id === id));
            assert.match(options.body.registry_auth, /^[0-9a-f]{64}$/);
            if (state.retireError) { throw { code: state.retireError }; }
            if (!state.retireNoop) {
              state.remote = { ...state.remote, revision: String(Number(state.remote.revision) + 1),
                keys: state.remote.keys.filter(key => key.key_id !== id),
                registry_auth: state.retireBadMac ? "0".repeat(64) : options.body.registry_auth,
                registry_auth_version: options.body.registry_auth_version ?? 1 };
            }
            await state.afterRetire?.();
            if (state.retireResponseLost) { throw { code: "network_error" }; }
          } else {
            assert.equal(path, "api/v1/crypto/activate");
            assert.ok(state.local?.pending, "local persistence precedes publication");
            assert.deepEqual(options.body.crypto, { epoch: state.remote.epoch, revision: state.remote.revision });
            assert.equal(options.method, "POST");
            if (state.activationError) { throw { code: "network_error" }; }
            assert.equal(state.remote.keys.length, 0);
            const { key_id, encrypted_bundle } = options.body;
            assert.equal(Object.hasOwn(options.body, "recovery_secret"), false);
            assert.equal(options.body.custody, "client");
            assert.ok(options.body.identity_key);
            state.remote = { ...state.remote, revision: String(Number(state.remote.revision) + 1), mode: "native", active_key_id: key_id, keys: [{ key_id, encrypted_bundle }],
              identity_key: options.body.identity_key, registry_auth: options.body.registry_auth, registry_auth_version: options.body.registry_auth_version ?? 1, incompatible_sessions: 0,
              custody: "client", server_recovery: false };
            if (state.responseLost) { throw { code: "network_error" }; }
          }
          return { data: structuredClone(state.remote) };
        },
      });
    },
  };
  const options = {
    account,
    randomBytes(length) {
      const bytes = new Uint8Array(length).fill(++state.counter);
      state.randomBuffers.push(bytes);
      return bytes;
    },
    cryptoFactory() {
      const handles = new Map();
      const crypto = {
        closed: false,
        async generateNativeKey(keyScope) {
          assert.equal(this.closed, false);
          assert.ok(handles.size < 8, "Native rings never exceed their eight-key capacity");
          const handle = ++state.counter;
          handles.set(handle, { scope: keyScope, keyId: Buffer.alloc(16, handle).toString("base64url") });
          return handle;
        },
        async nativeKeyId(handle) {
          assert.equal(this.closed, false);
          return handles.get(handle).keyId;
        },
        async wrapNativeKey(handle, passphrase) {
          await state.beforeWrap?.();
          assert.equal(this.closed, false);
          const stored = handles.get(handle);
          const bundle = JSON.stringify({ bundle_version: 2, crypto_version: 2, key_id: stored.keyId,
            kdf: { algorithm: "argon2id13", memory_kib: 65536, iterations: 3, parallelism: 1 },
            salt: Buffer.alloc(16, ++state.counter).toString("base64"), nonce: Buffer.alloc(24).toString("base64"),
            ciphertext: createHash("sha384").update(passphrase).digest("base64"),
          });
          state.wraps.set(bundle, { ...stored, password: Buffer.from(passphrase).toString("hex") });
          return bundle;
        },
        async recoverNativeKey(keyScope, passphrase, bundle) {
          assert.equal(this.closed, false);
          const stored = state.wraps.get(bundle);
          if (stored?.scope !== keyScope || stored.password !== Buffer.from(passphrase).toString("hex")) {
            throw new Error("wrong recovery secret or account");
          }
          assert.ok(handles.size < 8, "Native rings never exceed their eight-key capacity");
          const handle = ++state.counter;
          handles.set(handle, stored);
          return handle;
        },
        async deriveNativeRecordId(handle, collection, input) {
          assert.equal(this.closed, false);
          const key = handles.get(handle);
          return createHash("sha256").update(key.scope).update(key.keyId).update(collection).update(input).digest("hex");
        },
        async sealNative(handle, purpose, context, plaintext) {
          assert.equal(this.closed, false);
          assert.ok([0, 1].includes(purpose));
          return JSON.stringify({ key_id: handles.get(handle).keyId, context: JSON.parse(context), testPayload: Buffer.from(plaintext).toString("base64") });
        },
        async openNative(handle, purpose, expected, envelope) {
          assert.equal(this.closed, false);
          assert.ok([0, 1].includes(purpose));
          if (purpose === 1) {
            assert.deepEqual(Object.keys(JSON.parse(expected)).sort(), ["collection", "generation", "id"]);
          }
          assert.equal(handles.get(handle).keyId, JSON.parse(envelope).key_id);
          assert.equal(JSON.parse(expected).id, JSON.parse(envelope).context.id);
          const bytes = new Uint8Array(Buffer.from(JSON.parse(envelope).testPayload, "base64"));
          state.openedBytes = bytes;
          await state.beforeOpen?.();
          return bytes;
        },
        close() { this.closed = true; handles.clear(); },
      };
      state.instances.push(crypto);
      return crypto;
    },
  };
  return { state, account, keys: new MidoriSyncKeys(options), create: () => new MidoriSyncKeys(options) };
}

async function activate(keys) {
  const code = await keys.prepareCreation();
  await keys.confirmCreation({ recoveryCodeSaved: true });
  await keys.refresh();
  return code;
}

test("offline keys reopen only the last verified registry and can protect durable local work without HTTP", async () => {
  const f = setup();
  await activate(f.keys);
  const context = { collection: "bookmarks", id: "offline-fixture", generation: epoch, schema_version: 1, base_revision: "0" };
  const envelope = await f.keys.sealLocal(context, new TextEncoder().encode("public offline fixture"));
  const before = f.keys.writeContext;
  const requests = f.state.requests.length;
  f.keys.close();
  f.account.snapshot.status = "local";
  ++f.account.snapshot.generation;
  const access = f.account.withSecrets.bind(f.account);
  f.account.withLocalSecrets = work => access(work);
  f.account.withSecrets = async () => { throw { code: "remote_access_unavailable" }; };
  const keys = f.create();
  await keys.unlockLocal();
  assert.equal(keys.snapshot.status, "ready");
  assert.equal(keys.snapshot.localOnly, true);
  assert.equal(keys.snapshot.canRotate, false);
  assert.deepEqual(keys.writeContext, before);
  const plain = await keys.openLocal({ collection: context.collection, id: context.id, generation: context.generation }, envelope);
  assert.equal(new TextDecoder().decode(plain), "public offline fixture");
  plain.fill(0);
  const queued = await keys.sealRecord(context, new TextEncoder().encode("public queued change"));
  assert.deepEqual(queued.crypto, before);
  assert.equal(f.state.requests.length, requests);
  await assert.rejects(keys.refresh(), /remote_access_unavailable/);
  assert.equal(f.state.requests.length, requests);
  keys.close();
});

test("offline opening rejects missing, stale or tampered registry snapshots without contacting the service", async () => {
  for (const alter of [
    local => { delete local.verified_state; },
    local => { local.verified_state.revision = String(Number(local.revision) + 1); },
    local => { local.verified_state.registry_auth_version = 1; },
    local => { local.verified_state.registry_auth = "0".repeat(64); },
  ]) {
    const f = setup();
    await activate(f.keys);
    f.keys.close();
    alter(f.state.local);
    f.account.snapshot.status = "local";
    ++f.account.snapshot.generation;
    const requests = f.state.requests.length;
    const keys = f.create();
    await assert.rejects(keys.unlockLocal(), /offline_keys_unavailable|registry_authentication_failed/);
    assert.equal(keys.snapshot.status, "locked");
    assert.equal(keys.snapshot.localOnly, false);
    assert.equal(f.state.requests.length, requests);
    keys.close();
  }
});

test("a local key session cannot be reused as an online session before verification", async () => {
  const f = setup();
  await activate(f.keys);
  f.keys.close();
  f.account.snapshot.status = "local";
  ++f.account.snapshot.generation;
  const keys = f.create();
  await keys.unlockLocal();
  f.account.snapshot.status = "connected";
  assert.throws(() => keys.writeContext, /keys_locked/);
  await keys.refresh();
  assert.equal(keys.snapshot.localOnly, false);
  assert.equal(keys.snapshot.status, "ready");
  keys.close();
});

test("the optional offline snapshot cannot inflate a large existing custody record", async () => {
  const f = setup();
  await activate(f.keys);
  const original = f.state.local.keys[0];
  const wrapped = f.state.wraps.get(original.encrypted_bundle);
  for (let index = 0; index < 15; ++index) {
    const keyId = Buffer.alloc(16, 100 + index).toString("base64url");
    const value = { ...JSON.parse(original.encrypted_bundle), key_id: keyId };
    const bundle = JSON.stringify(value).padEnd(2048);
    f.state.wraps.set(bundle, { ...wrapped, keyId });
    f.state.local.keys.push({ key_id: keyId, encrypted_bundle: bundle });
  }
  await f.keys.refresh();
  assert.equal(f.keys.snapshot.status, "ready");
  assert.equal(f.keys.snapshot.localKeyCount, 16);
  assert.equal(f.state.local.keys.length, 16);
  assert.equal(f.state.local.verified_state, undefined, "Optional caching yields to retained keys and the vault's size limit");
  f.keys.close();
});

test("creation is staged, persists before publication, and restores after a restart", async () => {
  const { keys, state, create } = setup();
  const snapshots = [];
  keys.subscribe(value => snapshots.push(value));
  await keys.refresh();
  assert.equal(keys.snapshot.status, "empty");
  const code = await keys.prepareCreation();
  assert.match(code, /^MS2-(?:[0-9A-F]{8}-){7}[0-9A-F]{8}$/);
  assert.equal(state.writes, 0);
  assert.equal(state.requests.filter(request => request.options.method === "POST").length, 0);
  assert.equal(keys.snapshot.status, "backup-required");
  assert.ok(state.randomBuffers.every(bytes => bytes.every(value => value === 0)));
  await keys.confirmCreation({ recoveryCodeSaved: true });
  assert.equal(state.local.pending, null);
  assert.notEqual(state.local.keys[0].encrypted_bundle, state.remote.keys[0].encrypted_bundle);
  assert.ok(!JSON.stringify(state.local).includes(code.slice(4).replaceAll("-", "").toLowerCase()));
  assert.ok(!JSON.stringify(snapshots).includes(code));
  keys.close();
  assert.ok(state.instances.every(crypto => crypto.closed));
  const restarted = create();
  await restarted.refresh();
  assert.equal(restarted.snapshot.status, "ready");
  restarted.close();
});

test("automatic setup activates client-owned encryption and keeps the recovery code local", async () => {
  const { keys, state, create } = setup();
  await keys.refresh();
  assert.equal(keys.snapshot.status, "empty");
  assert.equal(await keys.bootstrap(), true);
  assert.equal(keys.snapshot.status, "ready");
  assert.equal(keys.snapshot.backupPending, true);
  assert.equal(state.remote.keys.length, 1);
  assert.equal(state.remote.server_recovery, false);
  assert.ok(state.remote.identity_key);
  assert.equal(await keys.bootstrap(), false);
  const code = await keys.revealRecoveryCode();
  assert.match(code, /^MS2-(?:[0-9A-F]{8}-){7}[0-9A-F]{8}$/);
  const requests = JSON.stringify(state.requests);
  assert.ok(!requests.includes(code));
  assert.ok(!requests.includes(code.slice(4).replaceAll("-", "").toLowerCase()));
  assert.ok(!requests.includes("recovery_secret"));
  await keys.acknowledgeRecoveryBackup();
  assert.equal(keys.snapshot.backupPending, false);
  assert.equal(await keys.revealRecoveryCode(), code);
  keys.close();
  const restarted = create();
  await restarted.refresh();
  assert.equal(restarted.snapshot.status, "ready");
  assert.equal(restarted.snapshot.backupPending, false);
  assert.equal(await restarted.revealRecoveryCode(), code);
  restarted.close();
});

test("manual setup still requires the recovery backup confirmation", async () => {
  const { keys, state } = setup();
  await keys.refresh();
  const code = await keys.prepareCreation();
  await assert.rejects(keys.confirmCreation(), /recovery_backup_required/);
  assert.equal(state.local, null);
  await keys.confirmCreation({ recoveryCodeSaved: true });
  await keys.refresh();
  assert.equal(keys.snapshot.status, "ready");
  assert.equal(keys.snapshot.backupPending, false);
  assert.ok(!JSON.stringify(state.requests).includes(code));
  keys.close();
});

test("the revealed backup unlocks a new profile after acknowledgement and restart", async () => {
  const { keys, state, create } = setup();
  await keys.refresh();
  await keys.bootstrap();
  const code = await keys.revealRecoveryCode();
  await keys.acknowledgeRecoveryBackup();
  keys.close();
  state.local = null;
  const other = create();
  await other.recover(code);
  assert.equal(other.snapshot.status, "ready");
  assert.equal(await other.revealRecoveryCode(), code);
  other.close();
});

test("the account password unlocks existing keys on another profile and can be changed without rewriting data", async () => {
  const { keys, state, create } = setup();
  await activate(keys);
  const original = structuredClone(state.remote);
  await keys.setAccountPassword("Astian fixture password 🔑");
  assert.equal(keys.snapshot.passwordUnlockAvailable, true);
  assert.deepEqual(state.remote, { ...original, password_unlock: true });
  assert.ok(!JSON.stringify(state.requests).includes("Astian fixture password"));
  keys.close();
  state.local = null;
  const other = create();
  await other.refresh();
  assert.equal(other.snapshot.status, "recovery-required");
  await assert.rejects(other.unlockWithAccountPassword("wrong password"), /password_unlock_failed/);
  assert.equal(state.local, null);
  await other.unlockWithAccountPassword("Astian fixture password 🔑");
  assert.equal(other.snapshot.status, "ready");
  assert.equal(other.snapshot.identityKeyId, original.identity_key.key_id);
  const code = await other.revealRecoveryCode();
  await other.setAccountPassword("updated Astian fixture password");
  other.close();
  state.local = null;
  const third = create();
  await assert.rejects(third.unlockWithAccountPassword("Astian fixture password 🔑"), /password_unlock_failed/);
  await third.unlockWithAccountPassword("updated Astian fixture password");
  assert.equal(third.snapshot.activeKeyId, original.active_key_id);
  assert.equal(await third.revealRecoveryCode(), code);
  assert.equal(state.remote.revision, original.revision);
  third.close();
});

test("password unlock rejects a capsule from a different epoch without saving keys", async () => {
  const { keys, state, create } = setup();
  await activate(keys);
  await keys.setAccountPassword("fixture password");
  keys.close();
  state.local = null;
  state.remote.epoch = "207cf1f2-bfdc-4cde-a416-a8ec8576a36b";
  const other = create();
  await assert.rejects(other.unlockWithAccountPassword("fixture password"));
  assert.equal(state.local, null);
  other.close();
});

test("key errors preserve rate limiting metadata for background retries", async () => {
  const { keys, state } = setup();
  state.stateError = { code: "rate_limited", status: 429, retryAfter: 120 };
  await assert.rejects(keys.refresh(), error => error.code === "rate_limited" && error.status === 429 && error.retryAfter === 120);
  keys.close();
});

test("an empty server custody account creates client-owned encryption without migration", async () => {
  const { keys, state } = setup();
  state.remote.custody = "server";
  await keys.refresh();
  assert.equal(keys.snapshot.status, "empty");
  assert.equal(await keys.bootstrap(), true);
  assert.equal(keys.snapshot.status, "ready");
  assert.equal(keys.snapshot.custody, "client");
  assert.equal(keys.snapshot.serverRecovery, false);
  assert.equal(state.remote.keys.length, 1);
  assert.ok(!state.requests.some(request => request.path.includes("/crypto/rotation")));
  keys.close();
});

test("legacy automatic activation stays paused without publishing its recovery secret", async () => {
  const { keys, state, create } = setup();
  await keys.prepareCreation();
  state.activationError = true;
  await assert.rejects(keys.confirmCreation({ recoveryCodeSaved: true }), /activation_unconfirmed/);
  delete state.local.recovery_confirmed;
  delete state.local.identity_key;
  delete state.local.pending.identity_key;
  state.local.pending.recovery_secret = "a".repeat(64);
  const saved = structuredClone(state.local);
  keys.close();
  const restarted = create();
  await restarted.refresh();
  assert.equal(restarted.snapshot.status, "migration-required");
  await assert.rejects(restarted.confirmCreation(), /legacy_migration_required/);
  assert.deepEqual(state.local, saved);
  assert.equal(state.remote.keys.length, 0);
  assert.ok(!JSON.stringify(state.requests).includes("recovery_secret"));
  restarted.close();
});

test("a new device requires the recovery code and a wrong code never replaces saved keys", async () => {
  const { keys, state, create } = setup();
  const code = await activate(keys);
  keys.close();
  state.local = null;
  const other = create();
  await other.refresh();
  assert.equal(other.snapshot.status, "recovery-required");
  await assert.rejects(other.recover("f".repeat(64)), /recovery_failed/);
  assert.equal(state.local, null);
  await other.recover(code.toLowerCase().replaceAll("-", "-\n"));
  assert.equal(other.snapshot.status, "ready");
  const saved = structuredClone(state.local);
  await assert.rejects(other.recover("f".repeat(64)), /recovery_failed/);
  assert.deepEqual(state.local, saved);
  assert.notEqual(other.snapshot.status, "ready");
  await other.refresh();
  assert.equal(other.snapshot.status, "ready");
  other.close();
});

test("refresh preserves client custody and never uploads or downloads a recovery secret", async () => {
  const { keys, state, create } = setup();
  await activate(keys);
  const remote = structuredClone(state.remote);
  await keys.refresh();
  assert.deepEqual(state.remote, remote);
  assert.equal(keys.snapshot.status, "ready");
  const local = structuredClone(state.local);
  state.remote.server_recovery = true;
  state.remote.custody = "server";
  await assert.rejects(keys.refresh(), /crypto_state_conflict/);
  assert.equal(keys.snapshot.custody, "client");
  assert.equal(keys.snapshot.canRotate, false);
  assert.deepEqual(state.local, local);
  keys.close();
  state.local = null;
  const other = create();
  await other.refresh();
  assert.equal(other.snapshot.status, "migration-required");
  assert.equal(other.snapshot.canRotate, false);
  assert.equal(state.local, null);
  assert.ok(!state.requests.some(request => request.path === "api/v1/crypto/recovery"));
  other.close();
});

test("a lost activation response is reconciled without generating or publishing another key", async () => {
  const { keys, state } = setup();
  await keys.prepareCreation();
  state.responseLost = true;
  await keys.confirmCreation({ recoveryCodeSaved: true });
  await keys.refresh();
  assert.equal(keys.snapshot.status, "ready");
  assert.equal(state.remote.keys.length, 1);
  assert.equal(state.requests.filter(request => request.options.method === "POST").length, 1);
  keys.close();
});

test("an interrupted activation survives restart and retries the exact saved bundle", async () => {
  const { keys, state, create } = setup();
  await keys.prepareCreation();
  state.activationError = true;
  await assert.rejects(keys.confirmCreation({ recoveryCodeSaved: true }), /activation_unconfirmed/);
  assert.equal(keys.snapshot.status, "pending");
  const pending = structuredClone(state.local.pending);
  keys.close();
  const restarted = create();
  await restarted.refresh();
  assert.equal(restarted.snapshot.status, "pending");
  state.activationError = false;
  await restarted.confirmCreation({ recoveryCodeSaved: true });
  assert.deepEqual(state.remote.keys[0], { key_id: pending.key_id, encrypted_bundle: pending.encrypted_bundle });
  await restarted.refresh();
  assert.equal(restarted.snapshot.status, "ready");
  restarted.close();
});

test("uncertain local persistence never publishes and can be resolved on refresh", async () => {
  for (const error of ["writeError", "afterWriteError"]) {
    const { keys, state } = setup();
    await keys.prepareCreation();
    state[error] = true;
    await assert.rejects(keys.confirmCreation({ recoveryCodeSaved: true }), /vault_unavailable/);
    assert.equal(state.remote.keys.length, 0);
    assert.equal(keys.snapshot.status, "locked");
    state[error] = false;
    await keys.refresh();
    assert.equal(keys.snapshot.status, error === "writeError" ? "empty" : "pending");
    keys.close();
  }
});

test("legacy data and incompatible clients require distinct explicit handling", async () => {
  const { keys, state } = setup();
  state.remote.migration_required = true;
  await keys.refresh();
  assert.equal(keys.snapshot.status, "migration-required");
  await assert.rejects(keys.prepareCreation(), /legacy_migration_required/);
  assert.equal(state.instances.length, 0);
  state.remote.migration_required = false;
  state.remote.incompatible_sessions = 2;
  await keys.prepareCreation();
  await assert.rejects(keys.confirmCreation({ recoveryCodeSaved: true }), /incompatible_devices/);
  assert.equal(state.local, null);
  await keys.confirmCreation({ revokeIncompatible: true, recoveryCodeSaved: true });
  assert.equal(state.requests.find(request => request.options.method === "POST").options.body.revoke_incompatible, true);
  keys.close();
});

test("a server reset or revision rollback preserves local recovery material and locks active keys", async () => {
  for (const reset of [true, false]) {
    const { keys, state } = setup();
    await activate(keys);
    const saved = structuredClone(state.local);
    if (reset) {
      state.remote.epoch = "107cf1f2-bfdc-4cde-a416-a8ec8576a36c";
    } else {
      state.local.revision = "5";
      saved.revision = "5";
    }
    await assert.rejects(keys.refresh(), /crypto_state_conflict/);
    assert.deepEqual(state.local, saved);
    assert.notEqual(keys.snapshot.status, "ready");
    assert.ok(state.instances.every(crypto => crypto.closed));
    keys.close();
  }
});

test("account changes invalidate drafts and Rust handles", async () => {
  const { keys, account, state } = setup();
  await keys.prepareCreation();
  account.invalidate();
  assert.equal(keys.snapshot.status, "locked");
  assert.ok(state.instances.every(crypto => crypto.closed));
  await assert.rejects(keys.confirmCreation({ recoveryCodeSaved: true }), /no_pending_key/);
  assert.equal(state.local, null);
  await activate(keys);
  account.invalidate();
  assert.equal(keys.snapshot.status, "locked");
  assert.ok(state.instances.every(crypto => crypto.closed));
  keys.close();
});

test("closing the popup while generation is running cannot publish a late recovery code", async () => {
  const { keys, state } = setup();
  let resume;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  state.beforeWrap = () => { entered(); return new Promise(resolve => { resume = resolve; }); };
  const preparing = keys.prepareCreation();
  await started;
  await assert.rejects(keys.refresh(), /busy/);
  keys.cancelDraft();
  resume();
  await assert.rejects(preparing, /cancelled/);
  assert.ok(state.instances.every(crypto => crypto.closed));
  assert.equal(state.local, null);
  assert.equal(state.remote.keys.length, 0);
  keys.close();
});

test("recovery rejects account relocation and malformed or excessive cryptographic input", async () => {
  const { keys, state } = setup();
  const code = await activate(keys);
  state.local = null;
  state.scope = JSON.stringify(["http://localhost:8000/", "urn:midori:sync:local", "fixture-b"]);
  await assert.rejects(keys.recover(code), /recovery_failed/);
  for (const value of ["short", "MS2-" + "g".repeat(64), "a".repeat(257)]) {
    await assert.rejects(keys.recover(value), /invalid_recovery_code/);
  }
  const correct = structuredClone(state.remote);
  for (const modify of [
    value => { value.keys.push(value.keys[0]); },
    value => { value.revision = 1; },
    value => { value.revision = "2147483648"; },
    value => { value.active_key_id = "unknown"; },
    value => { value.keys[0].encrypted_bundle = "x".repeat(2049); },
    value => { const bundle = JSON.parse(value.keys[0].encrypted_bundle); bundle.kdf.memory_kib = 4294967295; value.keys[0].encrypted_bundle = JSON.stringify(bundle); },
    value => { delete value.migration_required; },
    value => { delete value.custody; },
    value => { delete value.server_recovery; },
    value => { value.server_recovery = null; },
    value => { delete value.identity_key; },
    value => { value.identity_key = false; },
    value => { delete value.registry_auth; },
    value => { value.registry_auth_version = 0; },
    value => { value.registry_auth_version = 3; },
    value => { value.registry_auth_version = "2"; },
    value => { value.identity_key = null; },
    value => { value.legacy_frozen = "true"; },
    value => { value.legacy_frozen = true; },
  ]) {
    const invalid = structuredClone(correct);
    modify(invalid);
    assert.throws(() => validateNativeCryptoState(invalid), /invalid_crypto_state/);
  }
  keys.close();
});

test("record operations bind the active crypto revision and reject late plaintext after logout", async () => {
  const { keys, state, account } = setup();
  await activate(keys);
  const context = { collection: "bookmarks", id: "fixture", generation: epoch, schema_version: 1, base_revision: "0" };
  const bytes = new TextEncoder().encode("public test data");
  const sealed = await keys.sealRecord(context, bytes);
  assert.deepEqual(sealed.crypto, { epoch, revision: "1" });
  const expected = { collection: "bookmarks", id: "fixture", generation: epoch };
  assert.deepEqual(await keys.openRecord(expected, sealed.payload), bytes);
  await assert.rejects(keys.openRecord(expected, "x".repeat(262145)), /invalid_record/);
  await assert.rejects(keys.openRecord(expected, JSON.stringify({ key_id: "unknown" })), /unknown_key/);
  let resume;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  state.beforeOpen = () => { entered(); return new Promise(resolve => { resume = resolve; }); };
  const reading = keys.openRecord(expected, sealed.payload);
  await started;
  account.invalidate();
  resume();
  await assert.rejects(reading, /keys_locked|cancelled/);
  assert.ok(state.openedBytes.every(value => value === 0), "Late plaintext is cleared before rejection");
  await assert.rejects(keys.sealRecord(context, bytes), /keys_locked/);
  keys.close();
});

test("removing an old key without an epoch reset does not discard local recovery material", async () => {
  const { keys, state } = setup();
  await activate(keys);
  const saved = structuredClone(state.local);
  state.remote.keys = [];
  state.remote.active_key_id = null;
  state.remote.revision = "2";
  await assert.rejects(keys.refresh(), /crypto_state_conflict/);
  assert.deepEqual(state.local, saved);
  keys.close();
});

test("one popup cannot replace or confirm another popup's recovery draft", async () => {
  const { keys, state } = setup();
  const firstWindow = {};
  const otherWindow = {};
  await keys.prepareCreation(firstWindow);
  keys.cancelDraft(otherWindow);
  assert.equal(keys.snapshot.status, "backup-required");
  await assert.rejects(keys.prepareCreation(otherWindow), /draft_in_another_window/);
  await assert.rejects(keys.refresh(otherWindow), /draft_in_another_window/);
  await assert.rejects(keys.confirmCreation({ owner: otherWindow, recoveryCodeSaved: true }), /draft_in_another_window/);
  assert.equal(state.local, null);
  assert.equal(state.remote.keys.length, 0);
  await keys.confirmCreation({ owner: firstWindow, recoveryCodeSaved: true });
  await keys.refresh(firstWindow);
  assert.equal(keys.snapshot.status, "ready");
  keys.close();
});

test("rotation requires a saved code, preserves identity, and recovers every data key with the new code", async () => {
  const { keys, state, create } = setup();
  const originalCode = await activate(keys);
  const originalId = keys.snapshot.activeKeyId;
  const identityId = keys.snapshot.identityKeyId;
  const identity = await keys.deriveRecordId("history", ["https://example.invalid/", 86400000000]);
  const context = { collection: "bookmarks", id: "rotate-record", generation: epoch, schema_version: 2, base_revision: "0" };
  const plaintext = new TextEncoder().encode("encrypted record before rotation");
  const sealed = await keys.sealRecord(context, plaintext);
  const newCode = await keys.prepareRotation();
  await assert.rejects(keys.confirmRotation(), /recovery_backup_required/);
  assert.equal(state.remote.active_key_id, originalId);
  await keys.confirmRotation({ recoveryCodeSaved: true });
  await keys.refresh();
  assert.equal(keys.snapshot.status, "ready");
  assert.equal(keys.snapshot.custody, "transition");
  assert.equal(keys.snapshot.rotation.phase, "rewriting");
  assert.equal(keys.snapshot.canRotate, false);
  assert.notEqual(keys.snapshot.activeKeyId, originalId);
  assert.equal(keys.snapshot.identityKeyId, identityId);
  assert.equal(await keys.deriveRecordId("history", ["https://example.invalid/", 86400000000]), identity);
  assert.deepEqual(await keys.openRecord(context, sealed.payload), plaintext);
  const reencrypted = await keys.reencryptRecord({ ...context, base_revision: "1" }, sealed.payload);
  assert.equal(JSON.parse(reencrypted.payload).key_id, keys.snapshot.activeKeyId);
  assert.ok(state.openedBytes.every(value => value === 0), "Re-encryption clears its intermediate plaintext");
  const local = structuredClone(state.local);
  await assert.rejects(keys.recover(originalCode), /recovery_failed/);
  assert.deepEqual(state.local, local);
  keys.close();
  state.local = null;
  const recovered = create();
  await recovered.recover(newCode);
  assert.equal(recovered.snapshot.status, "ready");
  assert.equal(state.local.keys.length, 2);
  assert.equal(await recovered.deriveRecordId("history", ["https://example.invalid/", 86400000000]), identity);
  assert.deepEqual(await recovered.openRecord(context, sealed.payload), plaintext);
  assert.deepEqual(await recovered.openRecord(context, reencrypted.payload), plaintext);
  for (const code of [originalCode, newCode]) {
    assert.ok(!JSON.stringify(state.requests).includes(code));
    assert.ok(!JSON.stringify(state.requests).includes(code.slice(4).replaceAll("-", "").toLowerCase()));
  }
  recovered.close();
});

test("an interrupted rotation resumes its exact durable operation after restart", async () => {
  const { keys, state, create } = setup();
  await activate(keys);
  await keys.prepareRotation();
  state.activationError = true;
  await assert.rejects(keys.confirmRotation({ recoveryCodeSaved: true }), /rotation_unconfirmed/);
  assert.equal(keys.snapshot.status, "rotation-pending");
  const intent = structuredClone(state.local.rotation);
  assert.equal(state.local.keys.length, 2);
  keys.close();
  const restarted = create();
  await restarted.refresh();
  assert.equal(restarted.snapshot.status, "rotation-pending");
  state.activationError = false;
  await restarted.confirmRotation();
  await restarted.refresh();
  assert.equal(restarted.snapshot.status, "ready");
  assert.equal(restarted.snapshot.rotation.operation_id, intent.operation_id);
  assert.deepEqual(state.requests.filter(request => request.path === "api/v1/crypto/rotation")
    .map(request => request.options.body), [intent, intent]);
  assert.equal(state.local.rotation, null);
  restarted.close();
});

test("a lost rotation response reconciles the published keys and keeps old data keys", async () => {
  const { keys, state } = setup();
  await activate(keys);
  const oldId = keys.snapshot.activeKeyId;
  await keys.prepareRotation();
  state.responseLost = true;
  await keys.confirmRotation({ recoveryCodeSaved: true });
  await keys.refresh();
  assert.equal(keys.snapshot.status, "ready");
  assert.equal(state.local.rotation, null);
  assert.ok(state.local.keys.some(key => key.key_id === oldId));
  assert.equal(state.requests.filter(request => request.path === "api/v1/crypto/rotation").length, 1);
  keys.close();
});

test("uncertain rotation persistence never publishes before its durable intent is confirmed", async () => {
  for (const error of ["writeError", "afterWriteError"]) {
    const { keys, state, create } = setup();
    await activate(keys);
    const previous = structuredClone(state.remote);
    await keys.prepareRotation();
    state[error] = true;
    await assert.rejects(keys.confirmRotation({ recoveryCodeSaved: true }), /vault_unavailable/);
    assert.deepEqual(state.remote, previous);
    assert.equal(state.requests.filter(request => request.path === "api/v1/crypto/rotation").length, 0);
    state[error] = false;
    keys.close();
    const restarted = create();
    await restarted.refresh();
    assert.equal(restarted.snapshot.status, error === "writeError" ? "ready" : "rotation-pending");
    restarted.close();
  }
});

test("legacy server custody migrates with a fresh data key and stable identity without retrieving escrow", async () => {
  const { keys, state } = setup();
  await activate(keys);
  const oldId = keys.snapshot.activeKeyId;
  state.remote.server_recovery = true;
  state.remote.custody = "server";
  state.remote.identity_key = null;
  delete state.local.identity_key;
  state.remote.registry_auth = null;
  delete state.local.custody;
  delete state.local.active_key_id;
  await keys.refresh();
  assert.equal(keys.snapshot.status, "migration-required");
  await assert.rejects(keys.sealRecord({}, new Uint8Array()), /keys_locked/);
  const code = await keys.prepareRotation();
  await keys.confirmRotation({ recoveryCodeSaved: true });
  await keys.refresh();
  assert.equal(keys.snapshot.status, "ready");
  assert.equal(keys.snapshot.serverRecovery, true);
  assert.ok(keys.snapshot.identityKeyId);
  assert.notEqual(keys.snapshot.activeKeyId, oldId);
  assert.ok(state.remote.keys.some(key => key.key_id === oldId));
  assert.ok(!state.requests.some(request => request.path === "api/v1/crypto/recovery"));
  const operationId = keys.snapshot.rotation.operation_id;
  const saved = structuredClone(state.local);
  await assert.rejects(keys.completeRotation(operationId), /rotation_incomplete/);
  assert.deepEqual(state.local, saved);
  assert.equal(state.remote.server_recovery, true);
  state.remote.rotation.live_records = 0;
  state.responseLost = true;
  const completed = await keys.completeRotation(operationId);
  assert.equal(completed.custody, "client");
  assert.equal(completed.serverRecovery, false);
  assert.equal(completed.rotation.phase, "complete");
  assert.equal(state.local.keys.length, 2, "Historical journal keys are not retired by completing a rotation");
  assert.equal(state.remote.rotation.journal_records, 1);
  await keys.recover(code);
  assert.equal(keys.snapshot.status, "ready");
  keys.close();
});

test("identity replacement and malformed rotation state never discard local recovery material", async () => {
  const { keys, state } = setup();
  await activate(keys);
  const saved = structuredClone(state.local);
  state.remote.identity_key = state.remote.keys[0];
  await assert.rejects(keys.refresh(), /invalid_crypto_state/);
  assert.deepEqual(state.local, saved);
  state.remote.identity_key = saved.identity_key;
  const correct = structuredClone(state.remote);
  for (const rotation of [
    { operation_id: epoch, target_key_id: state.remote.active_key_id, source_key_ids: [], phase: "rewriting" },
    { operation_id: epoch, target_key_id: "unknown", source_key_ids: [state.remote.active_key_id], phase: "complete" },
    { operation_id: epoch, target_key_id: state.remote.active_key_id, source_key_ids: [state.remote.active_key_id], phase: "rewriting" },
  ]) {
    assert.throws(() => validateNativeCryptoState({ ...correct, rotation }), /invalid_crypto_state/);
  }
  keys.close();
});

test("a second window cannot publish or cancel another window's rotation draft", async () => {
  const { keys, state } = setup();
  await activate(keys);
  const owner = {};
  const other = {};
  const before = structuredClone(state.remote);
  await keys.prepareRotation(owner);
  keys.cancelDraft(other);
  assert.equal(keys.snapshot.status, "rotation-backup-required");
  await assert.rejects(keys.prepareRotation(other), /draft_in_another_window/);
  await assert.rejects(keys.confirmRotation({ owner: other, recoveryCodeSaved: true }), /draft_in_another_window/);
  assert.deepEqual(state.remote, before);
  await keys.confirmRotation({ owner, recoveryCodeSaved: true });
  await keys.refresh(owner);
  assert.equal(keys.snapshot.status, "ready");
  keys.close();
});

test("authenticated registry rejects a changed active key even when every bundle is valid", async () => {
  const { keys, state } = setup();
  await activate(keys);
  const oldId = keys.snapshot.activeKeyId;
  await keys.prepareRotation();
  await keys.confirmRotation({ recoveryCodeSaved: true });
  await keys.refresh();
  const local = structuredClone(state.local);
  state.remote.active_key_id = oldId;
  await assert.rejects(keys.refresh(), /crypto_state_conflict/);
  assert.deepEqual(state.local, local);
  assert.notEqual(keys.snapshot.status, "ready");
  keys.close();
});

test("first recovery rejects an omitted historical key before replacing the local vault", async () => {
  const { keys, state, create } = setup();
  await activate(keys);
  const code = await keys.prepareRotation();
  await keys.confirmRotation({ recoveryCodeSaved: true });
  await keys.refresh();
  keys.close();
  state.local = null;
  state.remote.rotation = null;
  state.remote.keys = state.remote.keys.filter(key => key.key_id === state.remote.active_key_id);
  const other = create();
  await assert.rejects(other.recover(code), /registry_authentication_failed/);
  assert.equal(state.local, null);
  assert.notEqual(other.snapshot.status, "ready");
  other.close();
});

test("removing the independent identity does not silently convert a client account into legacy custody", async () => {
  const { keys, state } = setup();
  await activate(keys);
  const local = structuredClone(state.local);
  state.remote.identity_key = null;
  state.remote.registry_auth = null;
  await assert.rejects(keys.refresh(), /crypto_state_conflict/);
  assert.deepEqual(state.local, local);
  keys.close();
});

test("an existing second device needs the new recovery code after another device rotates", async () => {
  const { keys, state, create } = setup();
  await activate(keys);
  const oldLocal = structuredClone(state.local);
  const code = await keys.prepareRotation();
  await keys.confirmRotation({ recoveryCodeSaved: true });
  await keys.refresh();
  keys.close();
  state.local = oldLocal;
  const second = create();
  await second.refresh();
  assert.equal(second.snapshot.status, "recovery-required");
  assert.equal(second.snapshot.canRotate, false);
  assert.deepEqual(state.local, { ...oldLocal, revision: state.remote.revision });
  assert.equal(state.local.registry_auth_version, 2, "The authenticated newer registry is pinned before recovery");
  await second.recover(code);
  assert.equal(second.snapshot.status, "ready");
  assert.equal(state.local.keys.length, 2);
  second.close();
});

test("closing a rotation draft during wrapping preserves the original keys without publication", async () => {
  const { keys, state } = setup();
  await activate(keys);
  const saved = structuredClone(state.local);
  const remote = structuredClone(state.remote);
  let resume;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  state.beforeWrap = () => { entered(); return new Promise(resolve => { resume = resolve; }); };
  const owner = {};
  const preparing = keys.prepareRotation(owner);
  await started;
  keys.cancelDraft(owner);
  resume();
  await assert.rejects(preparing, /cancelled/);
  assert.deepEqual(state.local, saved);
  assert.deepEqual(state.remote, remote);
  assert.equal(keys.snapshot.status, "ready");
  assert.equal(state.requests.filter(request => request.path === "api/v1/crypto/rotation").length, 0);
  keys.close();
  assert.ok(state.instances.every(instance => instance.closed));
});

test("first recovery authenticates custody and escrow policy before persisting any keys", async () => {
  const { keys, state, create } = setup();
  const code = await activate(keys);
  const original = structuredClone(state.remote);
  keys.close();
  state.local = null;
  for (const change of [
    remote => { remote.custody = "server"; },
    remote => { remote.custody = "transition"; },
    remote => { remote.server_recovery = true; },
  ]) {
    state.remote = structuredClone(original);
    change(state.remote);
    const other = create();
    await assert.rejects(other.recover(code), /registry_authentication_failed/);
    assert.equal(state.local, null);
    assert.equal(other.snapshot.custody, null, "Unverified policy is never published to record readers");
    other.close();
  }
});

test("rotation control fields are authenticated while progress counters remain server estimates", async () => {
  const { keys, state, create } = setup();
  await activate(keys);
  const code = await keys.prepareRotation();
  await keys.confirmRotation({ recoveryCodeSaved: true });
  await keys.refresh();
  state.remote.rotation.live_records = 42;
  state.remote.rotation.journal_records = 51;
  await keys.refresh();
  assert.equal(keys.snapshot.rotation.live_records, 42);
  const original = structuredClone(state.remote);
  keys.close();
  state.local = null;
  for (const change of [
    remote => { remote.rotation = null; },
    remote => { remote.rotation.phase = "complete"; },
    remote => { remote.rotation.operation_id = epoch; },
    remote => { remote.custody = "client"; },
  ]) {
    state.remote = structuredClone(original);
    change(state.remote);
    const other = create();
    await assert.rejects(other.recover(code), /registry_authentication_failed/);
    assert.equal(state.local, null);
    other.close();
  }
});

test("a completed device rejects replay of its valid transition registry even with an inflated revision", async () => {
  const { keys, state, create } = setup();
  await activate(keys);
  await keys.prepareRotation();
  await keys.confirmRotation({ recoveryCodeSaved: true });
  await keys.refresh();
  const transition = structuredClone(state.remote);
  state.remote.rotation.live_records = 0;
  await keys.completeRotation(state.remote.rotation.operation_id);
  assert.notEqual(state.remote.registry_auth, transition.registry_auth);
  const saved = structuredClone(state.local);
  keys.close();
  state.remote = { ...transition, revision: "100" };
  const restarted = create();
  await assert.rejects(restarted.refresh(), /crypto_state_conflict/);
  assert.deepEqual(state.local, saved);
  assert.equal(restarted.snapshot.custody, null);
  restarted.close();
});

test("completed rotation authentication survives response loss and retains historical key identity", async () => {
  const { keys, state } = setup();
  await activate(keys);
  await keys.prepareRotation();
  await keys.confirmRotation({ recoveryCodeSaved: true });
  await keys.refresh();
  const transitionTag = state.remote.registry_auth;
  const operationId = state.remote.rotation.operation_id;
  state.remote.rotation.live_records = 0;
  state.responseLost = true;
  await keys.completeRotation(operationId);
  const request = state.requests.find(item => item.path === "api/v1/crypto/rotation/complete");
  assert.match(request.options.body.registry_auth, /^[0-9a-f]{64}$/);
  assert.notEqual(request.options.body.registry_auth, transitionTag);
  assert.equal(state.remote.registry_auth, request.options.body.registry_auth);
  const historical = state.remote.rotation.source_key_ids;
  const retired = { ...state.remote, keys: state.remote.keys.filter(key => key.key_id === state.remote.active_key_id) };
  assert.deepEqual(validateNativeCryptoState(retired).rotation.source_key_ids, historical);
  keys.close();
});

test("a saved rotation intent reconciles a rotation completed by another device", async () => {
  const { keys, state, create } = setup();
  await activate(keys);
  await keys.prepareRotation();
  state.activationError = true;
  await assert.rejects(keys.confirmRotation({ recoveryCodeSaved: true }), /rotation_unconfirmed/);
  const pendingLocal = structuredClone(state.local);
  state.activationError = false;
  await keys.confirmRotation();
  await keys.refresh();
  state.remote.rotation.live_records = 0;
  await keys.completeRotation(state.remote.rotation.operation_id);
  const completedTag = state.remote.registry_auth;
  keys.close();
  state.local = pendingLocal;
  const restarted = create();
  await restarted.refresh();
  assert.equal(restarted.snapshot.status, "ready");
  assert.equal(restarted.snapshot.rotation.phase, "complete");
  assert.equal(state.local.rotation, null);
  assert.equal(state.local.custody, "client");
  assert.equal(state.remote.registry_auth, completedTag);
  restarted.close();
});

async function completedRotation(fixture) {
  const { keys, state } = fixture;
  await activate(keys);
  const code = await keys.prepareRotation();
  await keys.confirmRotation({ recoveryCodeSaved: true });
  await keys.refresh();
  state.remote.rotation.live_records = 0;
  await keys.completeRotation(state.remote.rotation.operation_id);
  return code;
}

test("key retirement verifies the local journal before removing only historical data keys", async () => {
  const f = setup();
  const code = await completedRotation(f);
  const activeId = f.keys.snapshot.activeKeyId;
  const identityId = f.keys.snapshot.identityKeyId;
  const previousTag = f.state.remote.registry_auth;
  let checks = 0;
  assert.equal(f.keys.snapshot.keyCount, 2);
  await f.keys.retireUnusedKeys({ async assertOnlyKey(id, { accountKeyIds }) {
    ++checks;
    assert.equal(id, activeId);
    assert.deepEqual(new Set(accountKeyIds), new Set(f.state.local.keys.map(key => key.key_id)));
    assert.equal(f.state.requests.filter(request => request.options.method === "DELETE").length, 0);
  } });
  assert.equal(checks, 1);
  assert.equal(f.keys.snapshot.keyCount, 1);
  assert.equal(f.keys.snapshot.identityKeyId, identityId);
  assert.notEqual(f.state.remote.registry_auth, previousTag);
  assert.deepEqual(f.state.local.keys.map(key => key.key_id), [activeId]);
  assert.deepEqual(f.state.remote.keys.map(key => key.key_id), [activeId]);
  assert.equal(f.keys.snapshot.canRotate, true);
  f.keys.close();
  f.state.local = null;
  const restored = f.create();
  await restored.recover(code);
  assert.equal(restored.snapshot.activeKeyId, activeId);
  assert.equal(restored.snapshot.identityKeyId, identityId);
  restored.close();
});

test("an unverified or old-key local journal blocks retirement before any server mutation", async () => {
  for (const journal of [null, {}, { async assertOnlyKey() { throw { code: "local_key_in_use" }; } },
    { async assertOnlyKey() { throw { code: "saved_journals_require_review" }; } }]) {
    const f = setup();
    await completedRotation(f);
    const local = structuredClone(f.state.local);
    const remote = structuredClone(f.state.remote);
    await assert.rejects(f.keys.retireUnusedKeys(journal), error =>
      ["local_key_in_use", "local_key_verification_required", "saved_journals_require_review"].includes(error.code));
    assert.deepEqual(f.state.local, local);
    assert.deepEqual(f.state.remote, remote);
    assert.equal(f.state.requests.filter(request => request.options.method === "DELETE").length, 0);
    f.keys.close();
  }
});

test("retirement reconciles a lost DELETE response against the authenticated registry", async () => {
  const f = setup();
  await completedRotation(f);
  f.state.retireResponseLost = true;
  await f.keys.retireUnusedKeys({ async assertOnlyKey() {} });
  assert.equal(f.state.remote.keys.length, 1);
  assert.equal(f.state.local.keys.length, 1);
  assert.equal(f.state.requests.filter(request => request.options.method === "DELETE").length, 1);
  await f.keys.retireUnusedKeys({ async assertOnlyKey() {} });
  assert.equal(f.state.requests.filter(request => request.options.method === "DELETE").length, 1,
    "An already retired key does not trigger another deletion");
  f.keys.close();
});

test("unauthenticated, refused and unconfirmed retirement responses preserve local historical keys", async () => {
  for (const [flag, failure] of [["retireBadMac", "registry_authentication_failed"],
    ["retireNoop", "key_retirement_unconfirmed"], ["retireError", "key_in_use"]]) {
    const f = setup();
    await completedRotation(f);
    const local = structuredClone(f.state.local);
    f.state[flag] = flag === "retireError" ? "key_in_use" : true;
    await assert.rejects(f.keys.retireUnusedKeys({ async assertOnlyKey() {} }), { code: failure });
    assert.deepEqual(f.state.local, local);
    assert.equal(f.state.local.keys.length, 2);
    f.keys.close();
  }
});

test("failed local persistence after server retirement keeps historical keys until a verified retry", async () => {
  const f = setup();
  await completedRotation(f);
  const local = structuredClone(f.state.local);
  f.state.writeError = true;
  await assert.rejects(f.keys.retireUnusedKeys({ async assertOnlyKey() {} }), { code: "vault_unavailable" });
  assert.equal(f.state.remote.keys.length, 1);
  assert.deepEqual(f.state.local, local);
  f.state.writeError = false;
  await f.keys.refresh();
  assert.equal(f.state.local.keys.length, 2, "Refresh alone does not discard a key needed by an offline journal");
  await f.keys.retireUnusedKeys({ async assertOnlyKey() {} });
  assert.equal(f.state.local.keys.length, 1);
  assert.equal(f.state.requests.filter(request => request.options.method === "DELETE").length, 1);
  f.keys.close();
});

test("another offline device retains retired data keys until its own journal has been reencrypted", async () => {
  const f = setup();
  await completedRotation(f);
  const offlineLocal = structuredClone(f.state.local);
  await f.keys.retireUnusedKeys({ async assertOnlyKey() {} });
  f.keys.close();
  f.state.local = offlineLocal;
  const offline = f.create();
  await offline.refresh();
  assert.equal(offline.snapshot.status, "ready");
  assert.equal(offline.snapshot.keyCount, 1);
  assert.equal(offline.snapshot.localKeyCount, 2);
  assert.equal(f.state.local.keys.length, 2);
  await assert.rejects(offline.retireUnusedKeys({ async assertOnlyKey() { throw { code: "local_key_in_use" }; } }),
    { code: "local_key_in_use" });
  assert.equal(f.state.local.keys.length, 2);
  await offline.retireUnusedKeys({ async assertOnlyKey() {} });
  assert.equal(f.state.local.keys.length, 1);
  offline.close();
});

test("an active-key change while the local journal is being checked cancels retirement", async () => {
  const f = setup();
  await completedRotation(f);
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const retiring = f.keys.retireUnusedKeys({ assertOnlyKey: () => waiting });
  await f.keys.refresh();
  release();
  await assert.rejects(retiring, { code: "cancelled" });
  assert.equal(f.state.requests.filter(request => request.options.method === "DELETE").length, 0);
  assert.equal(f.state.local.keys.length, 2);
  f.keys.close();
});

test("nine successive rotations stay below the eight-key registry limit after verified retirement", async () => {
  const f = setup();
  await activate(f.keys);
  const identityId = f.keys.snapshot.identityKeyId;
  const identity = await f.keys.deriveRecordId("history", ["https://example.invalid/", 86400000000]);
  for (let iteration = 0; iteration < 9; ++iteration) {
    await f.keys.prepareRotation();
    await f.keys.confirmRotation({ recoveryCodeSaved: true });
    await f.keys.refresh();
    assert.equal(f.state.remote.keys.length, 2);
    f.state.remote.rotation.live_records = 0;
    await f.keys.completeRotation(f.state.remote.rotation.operation_id);
    await f.keys.retireUnusedKeys({ async assertOnlyKey(id) { assert.equal(id, f.keys.snapshot.activeKeyId); } });
    assert.equal(f.state.remote.keys.length, 1);
    assert.equal(f.state.local.keys.length, 1);
    assert.equal(f.keys.snapshot.identityKeyId, identityId);
    assert.equal(await f.keys.deriveRecordId("history", ["https://example.invalid/", 86400000000]), identity);
    assert.equal(f.keys.snapshot.canRotate, true);
  }
  f.keys.close();
});

test("recovery retains eight historical local keys across bounded native rings without republishing them", async () => {
  const f = setup();
  await activate(f.keys);
  const expected = { collection: "bookmarks", id: "offline-before-rotation", generation: epoch };
  const firstId = f.keys.snapshot.activeKeyId;
  const oldRecord = await f.keys.sealRecord(expected, new TextEncoder().encode("offline preserved"));
  for (let iteration = 0; iteration < 7; ++iteration) {
    await f.keys.prepareRotation();
    await f.keys.confirmRotation({ recoveryCodeSaved: true });
    await f.keys.refresh();
    f.state.remote.rotation.live_records = 0;
    await f.keys.completeRotation(f.state.remote.rotation.operation_id);
    f.state.remote.rotation = null;
    f.state.remote.registry_auth = await f.keys.deriveRecordId("devices", ["MidoriSync/key-registry/v2",
      epoch, f.state.remote.revision, f.state.remote.active_key_id, f.state.remote.identity_key,
      [...f.state.remote.keys].sort((left, right) => left.key_id < right.key_id ? -1 : 1), "client", false, null]);
    await f.keys.refresh();
  }
  const offlineLocal = structuredClone(f.state.local);
  assert.equal(offlineLocal.keys.length, 8);
  await f.keys.retireUnusedKeys({ async assertOnlyKey() {} });
  const code = await f.keys.prepareRotation();
  await f.keys.confirmRotation({ recoveryCodeSaved: true });
  await f.keys.refresh();
  f.state.remote.rotation.live_records = 0;
  await f.keys.completeRotation(f.state.remote.rotation.operation_id);
  await f.keys.retireUnusedKeys({ async assertOnlyKey() {} });
  const remoteId = f.keys.snapshot.activeKeyId;
  f.keys.close();
  f.state.local = offlineLocal;
  const offline = f.create();
  await offline.recover(code);
  assert.equal(offline.snapshot.keyCount, 1);
  assert.equal(offline.snapshot.localKeyCount, 9);
  assert.ok(offline.hasLocalKey(firstId));
  assert.ok(offline.hasLocalKey(remoteId));
  assert.equal(offline.hasLocalKey("not-a-key"), false);
  assert.equal(new TextDecoder().decode(await offline.openRecord(expected, oldRecord.payload)), "offline preserved");
  await offline.refresh();
  assert.equal(offline.snapshot.localKeyCount, 9, "The saved expanded local keyring survives reopening");
  await offline.prepareRotation();
  await offline.confirmRotation({ recoveryCodeSaved: true });
  await offline.refresh();
  assert.equal(f.state.remote.keys.length, 2, "Retired local-only keys never return to the server registry");
  assert.equal(f.state.local.keys.length, 10);
  assert.deepEqual(f.state.remote.rotation.source_key_ids, [remoteId]);
  assert.equal(f.state.remote.keys.some(key => key.key_id === firstId), false);
  f.state.remote.rotation.live_records = 0;
  await offline.completeRotation(f.state.remote.rotation.operation_id);
  await offline.retireUnusedKeys({ async assertOnlyKey() {} });
  assert.equal(offline.snapshot.localKeyCount, 1);
  assert.equal(offline.hasLocalKey(firstId), false);
  offline.close();
  assert.ok(f.state.instances.every(instance => instance.closed), "All native rings are closed and clear their handles");
});


test("a completed rotation must retire its server keys before another rotation can be prepared", async () => {
  const f = setup();
  await completedRotation(f);
  assert.equal(f.keys.snapshot.canRotate, false);
  const local = structuredClone(f.state.local);
  const remote = structuredClone(f.state.remote);
  await assert.rejects(f.keys.prepareRotation(), { code: "rotation_cleanup_required" });
  assert.deepEqual(f.state.local, local);
  assert.deepEqual(f.state.remote, remote);
  await f.keys.refresh();
  await f.keys.retireUnusedKeys({ async assertOnlyKey() {} });
  assert.equal(f.keys.snapshot.canRotate, true);
  await f.keys.prepareRotation();
  assert.equal(f.keys.snapshot.status, "rotation-backup-required");
  f.keys.close();
});


function registryTagForFixture(state, version = state.registry_auth_version ?? 1) {
  const key = value => ({ key_id: value.key_id, encrypted_bundle: value.encrypted_bundle });
  const rotation = state.rotation ? { operation_id: state.rotation.operation_id,
    target_key_id: state.rotation.target_key_id, source_key_ids: [...state.rotation.source_key_ids].sort(),
    phase: state.rotation.phase } : null;
  const input = [`MidoriSync/key-registry/v${version}`, state.epoch, ...(version === 2 ? [state.revision] : []),
    state.active_key_id, key(state.identity_key), state.keys.map(key).sort((a, b) => a.key_id < b.key_id ? -1 : 1),
    state.custody, state.server_recovery === true, rotation];
  return createHash("sha256").update(scope).update(state.identity_key.key_id).update("devices").update(JSON.stringify(input)).digest("hex");
}

async function rotateAndRetire(f) {
  const code = await f.keys.prepareRotation();
  await f.keys.confirmRotation({ recoveryCodeSaved: true });
  await f.keys.refresh();
  f.state.remote.rotation.live_records = 0;
  await f.keys.completeRotation(f.state.remote.rotation.operation_id);
  await f.keys.retireUnusedKeys({ async assertOnlyKey() {} });
  return code;
}

test("new registry mutations authenticate the exact committed revision and pin version two", async () => {
  const f = setup();
  f.state.remote.revision = "11";
  await activate(f.keys);
  assert.equal(f.state.remote.revision, "12", "Activation authenticates CAS+1 instead of a hard-coded first revision");
  assert.equal(f.state.remote.registry_auth_version, 2);
  assert.equal(f.state.remote.registry_auth, registryTagForFixture(f.state.remote));
  assert.equal(f.state.local.registry_auth_version, 2);
  assert.equal(f.keys.snapshot.registryAuthVersion, 2);
  assert.equal(f.keys.snapshot.registryUpgradeRequired, false);
  await rotateAndRetire(f);
  assert.equal(f.state.remote.registry_auth, registryTagForFixture(f.state.remote));
  assert.equal(f.state.local.revision, f.state.remote.revision);
  for (const request of f.state.requests.filter(value => ["POST", "DELETE"].includes(value.options.method))) {
    assert.equal(request.options.body.registry_auth_version, 2);
  }
  f.keys.close();
});

test("replaying a retired registry with an inflated revision cannot restore an old key", async () => {
  const f = setup();
  const oldCode = await activate(f.keys);
  const oldRemote = structuredClone(f.state.remote);
  await rotateAndRetire(f);
  const current = structuredClone(f.state.remote);
  const local = structuredClone(f.state.local);
  const oldId = oldRemote.active_key_id;
  assert.equal(local.keys.some(key => key.key_id === oldId), false);
  f.keys.close();
  for (const revision of [oldRemote.revision, "100"]) {
    f.state.remote = { ...oldRemote, revision };
    const restarted = f.create();
    const error = revision === "100" ? "registry_authentication_failed" : "crypto_state_conflict";
    await assert.rejects(restarted.refresh(), { code: error });
    await assert.rejects(restarted.recover(oldCode), { code: error });
    assert.deepEqual(f.state.local, local);
    assert.notEqual(restarted.snapshot.status, "ready");
    restarted.close();
  }
  f.state.remote = current;
  const resumed = f.create();
  await resumed.refresh();
  assert.equal(resumed.snapshot.activeKeyId, current.active_key_id);
  resumed.close();
});

test("an offline device rejects an unknown intermediate key after pinning a newer registry", async () => {
  const f = setup();
  await activate(f.keys);
  const offlineLocal = structuredClone(f.state.local);
  const middleCode = await rotateAndRetire(f);
  const middle = structuredClone(f.state.remote);
  const latestCode = await rotateAndRetire(f);
  const latest = structuredClone(f.state.remote);
  f.keys.close();
  f.state.local = offlineLocal;
  const offline = f.create();
  await offline.refresh();
  assert.equal(offline.snapshot.status, "recovery-required");
  assert.equal(f.state.local.revision, latest.revision);
  assert.equal(f.state.local.registry_auth_version, 2);
  const pinned = structuredClone(f.state.local);
  assert.equal(pinned.keys.some(key => key.key_id === middle.active_key_id), false);
  offline.close();
  for (const revision of [middle.revision, "100"]) {
    f.state.remote = { ...middle, revision };
    const restarted = f.create();
    const error = revision === "100" ? "registry_authentication_failed" : "crypto_state_conflict";
    await assert.rejects(restarted.refresh(), { code: error });
    await assert.rejects(restarted.recover(middleCode), { code: error });
    assert.deepEqual(f.state.local, pinned);
    restarted.close();
  }
  f.state.remote = latest;
  const recovered = f.create();
  await recovered.recover(latestCode);
  assert.equal(recovered.snapshot.status, "ready");
  assert.equal(recovered.snapshot.activeKeyId, latest.active_key_id);
  assert.equal(f.state.local.registry_auth_version, 2);
  assert.ok(f.state.local.keys.some(key => key.key_id === offlineLocal.active_key_id), "Offline journal keys remain available locally");
  recovered.close();
});

test("legacy registry reads require upgrade and cannot downgrade an authenticated version-two pin", async () => {
  const f = setup();
  const oldCode = await activate(f.keys);
  f.state.remote.registry_auth_version = 1;
  f.state.remote.registry_auth = registryTagForFixture(f.state.remote);
  f.state.local.registry_auth_version = 1;
  await f.keys.refresh();
  assert.equal(f.keys.snapshot.registryAuthVersion, 1);
  assert.equal(f.keys.snapshot.registryUpgradeRequired, true);
  assert.equal(f.keys.snapshot.status, "ready", "Legacy data remains readable until explicit rotation");
  const oldRemote = structuredClone(f.state.remote);
  await rotateAndRetire(f);
  const local = structuredClone(f.state.local);
  assert.equal(local.registry_auth_version, 2);
  assert.equal(f.keys.snapshot.registryUpgradeRequired, false);
  f.keys.close();
  for (const version of [1, undefined, 2]) {
    f.state.remote = { ...oldRemote, revision: "100", registry_auth_version: version };
    const restarted = f.create();
    const error = version === 2 ? "registry_authentication_failed" : "crypto_state_conflict";
    await assert.rejects(restarted.refresh(), { code: error });
    await assert.rejects(restarted.recover(oldCode), { code: error });
    assert.deepEqual(f.state.local, local);
    restarted.close();
  }
});

test("legacy local state without a version can recover version one and then pin an explicit upgrade", async () => {
  const f = setup();
  const code = await activate(f.keys);
  f.state.remote.registry_auth_version = 1;
  f.state.remote.registry_auth = registryTagForFixture(f.state.remote);
  delete f.state.remote.registry_auth_version;
  f.keys.close();
  f.state.local = null;
  const recovered = f.create();
  await recovered.recover(code);
  assert.equal(f.state.local.registry_auth_version, 1);
  assert.equal(recovered.snapshot.registryUpgradeRequired, true);
  delete f.state.local.registry_auth_version;
  await recovered.refresh();
  assert.equal(f.state.local.registry_auth_version, 1);
  recovered.close();
});

test("unpublished legacy activation intents are upgraded durably without changing their key material", async () => {
  const f = setup();
  await f.keys.prepareCreation();
  f.state.activationError = true;
  await assert.rejects(f.keys.confirmCreation({ recoveryCodeSaved: true }), { code: "activation_unconfirmed" });
  const pending = f.state.local.pending;
  pending.registry_auth_version = 1;
  pending.registry_auth = registryTagForFixture({ epoch, revision: "1", active_key_id: pending.key_id,
    identity_key: pending.identity_key, keys: [pending], custody: "client", server_recovery: false, rotation: null }, 1);
  const original = structuredClone(pending);
  f.state.activationError = false;
  await f.keys.confirmCreation();
  await f.keys.refresh();
  assert.equal(f.state.remote.registry_auth_version, 2);
  assert.equal(f.state.local.registry_auth_version, 2);
  assert.equal(f.state.remote.active_key_id, original.key_id);
  assert.equal(f.state.remote.keys[0].encrypted_bundle, original.encrypted_bundle);
  assert.equal(f.state.remote.registry_auth, registryTagForFixture(f.state.remote));
  f.keys.close();
});

test("unpublished legacy rotation intents upgrade their MAC and preserve the original operation", async () => {
  const f = setup();
  await activate(f.keys);
  await f.keys.prepareRotation();
  f.state.activationError = true;
  await assert.rejects(f.keys.confirmRotation({ recoveryCodeSaved: true }), { code: "rotation_unconfirmed" });
  const pending = f.state.local.rotation;
  pending.registry_auth_version = 1;
  pending.registry_auth = registryTagForFixture({ epoch, revision: String(Number(pending.crypto.revision) + 1),
    active_key_id: pending.key_id, identity_key: pending.identity_key, keys: pending.keys, custody: "transition", server_recovery: false,
    rotation: { operation_id: pending.operation_id, target_key_id: pending.key_id,
      source_key_ids: f.state.remote.keys.map(key => key.key_id), phase: "rewriting" } }, 1);
  const original = structuredClone(pending);
  f.state.activationError = false;
  await f.keys.confirmRotation();
  await f.keys.refresh();
  assert.equal(f.state.remote.registry_auth_version, 2);
  assert.equal(f.state.local.registry_auth_version, 2);
  assert.equal(f.state.remote.rotation.operation_id, original.operation_id);
  assert.deepEqual(f.state.remote.keys, original.keys);
  assert.equal(f.state.remote.registry_auth, registryTagForFixture(f.state.remote));
  f.keys.close();
});


test("a legacy activation already published before a lost response is reconciled without another write", async () => {
  const f = setup();
  await f.keys.prepareCreation();
  f.state.responseLost = true;
  f.state.afterWriteError = true;
  await assert.rejects(f.keys.confirmCreation({ recoveryCodeSaved: true }), { code: "vault_unavailable" });
  f.state.afterWriteError = false;
  const pending = f.state.local.pending;
  f.state.remote = { ...f.state.remote, revision: "1", mode: "native", active_key_id: pending.key_id,
    keys: [{ key_id: pending.key_id, encrypted_bundle: pending.encrypted_bundle }], identity_key: pending.identity_key,
    registry_auth_version: 1 };
  f.state.remote.registry_auth = registryTagForFixture(f.state.remote);
  pending.registry_auth = f.state.remote.registry_auth;
  pending.registry_auth_version = 1;
  f.keys.close();
  const before = f.state.requests.length;
  const restarted = f.create();
  await restarted.refresh();
  assert.equal(restarted.snapshot.status, "ready");
  assert.equal(restarted.snapshot.registryUpgradeRequired, true);
  assert.equal(f.state.local.pending, null);
  assert.equal(f.state.local.registry_auth_version, 1);
  assert.ok(f.state.requests.slice(before).every(request => request.options.method !== "POST"));
  restarted.close();
});


test("an older server cannot receive a version-two activation or rotation registry", async () => {
  for (const capability of [undefined, 0, 1]) {
    const f = setup();
    f.account.snapshot.registryAuthVersion = capability;
    await f.keys.refresh();
    await assert.rejects(f.keys.prepareCreation(), { code: "registry_auth_unsupported" });
    assert.equal(f.state.requests.some(request => ["POST", "DELETE"].includes(request.options.method)), false);
    assert.equal(f.state.local, null);
    f.account.snapshot.registryAuthVersion = 2;
    await activate(f.keys);
    const local = structuredClone(f.state.local);
    const remote = structuredClone(f.state.remote);
    const before = f.state.requests.length;
    f.account.snapshot.registryAuthVersion = capability;
    await f.keys.refresh();
    await assert.rejects(f.keys.prepareRotation(), { code: "registry_auth_unsupported" });
    assert.deepEqual(f.state.local, local);
    assert.deepEqual(f.state.remote, remote);
    assert.equal(f.state.requests.slice(before).some(request => ["POST", "DELETE"].includes(request.options.method)), false);
    f.keys.close();
  }
});

test("publication rechecks server support after a creation or rotation code was prepared", async () => {
  for (const kind of ["Creation", "Rotation"]) {
    const f = setup();
    if (kind === "Rotation") {
      await activate(f.keys);
    }
    await f.keys[`prepare${kind}`]();
    const local = structuredClone(f.state.local);
    const remote = structuredClone(f.state.remote);
    const before = f.state.requests.length;
    f.account.snapshot.registryAuthVersion = 1;
    await assert.rejects(f.keys[`confirm${kind}`]({ recoveryCodeSaved: true }), { code: "registry_auth_unsupported" });
    assert.deepEqual(f.state.local, local);
    assert.deepEqual(f.state.remote, remote);
    assert.equal(f.state.requests.slice(before).some(request => ["POST", "DELETE"].includes(request.options.method)), false);
    f.keys.close();
  }
});

test("completion and retirement reject missing capability before any registry mutation", async () => {
  const f = setup();
  await activate(f.keys);
  await f.keys.prepareRotation();
  await f.keys.confirmRotation({ recoveryCodeSaved: true });
  await f.keys.refresh();
  f.state.remote.rotation.live_records = 0;
  let before = f.state.requests.length;
  f.account.snapshot.registryAuthVersion = 0;
  await assert.rejects(f.keys.completeRotation(f.state.remote.rotation.operation_id), { code: "registry_auth_unsupported" });
  assert.equal(f.state.requests.slice(before).some(request => ["POST", "DELETE"].includes(request.options.method)), false);
  f.account.snapshot.registryAuthVersion = 2;
  await f.keys.completeRotation(f.state.remote.rotation.operation_id);
  before = f.state.requests.length;
  f.account.snapshot.registryAuthVersion = 0;
  await assert.rejects(f.keys.retireUnusedKeys({ async assertOnlyKey() {} }), { code: "registry_auth_unsupported" });
  assert.equal(f.state.requests.slice(before).some(request => ["POST", "DELETE"].includes(request.options.method)), false);
  f.keys.close();
});


test("a new device is approved by an unlocked device without a recovery code", async () => {
  const { keys, state, create } = setup();
  await activate(keys);
  const approverLocal = structuredClone(state.local);
  state.local = null;
  const other = create();
  await other.refresh();
  assert.equal(other.snapshot.status, "recovery-required");
  await assert.rejects(keys.approveEnrollment("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d", "0000000000"), /enrollment_unavailable/);
  const { code } = await other.beginEnrollment();
  assert.match(code, /^\d{5} \d{5}$/);
  assert.equal(await other.pollEnrollment(), "pending");
  const listed = await keys.listEnrollments();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].code, code);
  await assert.rejects(keys.approveEnrollment(listed[0].id, "0000000000"), /enrollment_changed/);
  await keys.approveEnrollment(listed[0].id, listed[0].code);
  assert.equal(await other.pollEnrollment(), "approved");
  assert.equal(other.snapshot.status, "ready");
  assert.equal(other.snapshot.enrollment, null);
  assert.equal(state.local.keys.length, approverLocal.keys.length);
  assert.ok(!JSON.stringify(state.requests).includes("recovery_secret"));
  keys.close();
  other.close();
});

test("a denied enrollment leaves the device locked", async () => {
  const { keys, state, create } = setup();
  await activate(keys);
  state.local = null;
  const other = create();
  await other.refresh();
  await other.beginEnrollment();
  const [request] = await keys.listEnrollments();
  await keys.denyEnrollment(request.id);
  assert.equal(await other.pollEnrollment(), "denied");
  assert.equal(other.snapshot.status, "recovery-required");
  assert.equal(other.snapshot.error, "enrollment_denied");
  assert.equal(other.snapshot.enrollment, null);
  await other.beginEnrollment();
  const [expired] = state.enrollments.values();
  expired.status = "expired";
  assert.equal(await other.pollEnrollment(), "expired");
  assert.equal(other.snapshot.error, "enrollment_expired");
  assert.equal(other.snapshot.status, "recovery-required");
  assert.equal(other.snapshot.enrollment, null);
  keys.close();
  other.close();
});

test("a lone device with unreadable server keys resets and bootstraps fresh keys", async () => {
  const { keys, state, create } = setup();
  await activate(keys);
  keys.close();
  state.local = null;
  state.devices = [{ id: "device-a" }, { id: "other" }];
  const other = create();
  await other.refresh();
  assert.equal(other.snapshot.status, "recovery-required");
  await assert.rejects(other.resetEncryption({ onlyIfAlone: true }), /other_devices_exist/);
  assert.equal(other.snapshot.status, "recovery-required");
  state.devices = [{ id: "device-a" }];
  await other.resetEncryption({ onlyIfAlone: true });
  await other.refresh();
  assert.equal(other.snapshot.status, "empty");
  assert.equal(await other.bootstrap(), true);
  assert.equal(other.snapshot.status, "ready");
  other.close();
});
