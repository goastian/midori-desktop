import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { MidoriSyncSavedCustody } from "../src/browser/components/sync/MidoriSyncSavedCustody.sys.mjs";

const scope = JSON.stringify(["https://sync.example/", "https://identity.example/", "synthetic-user"]);
const keyId = Buffer.alloc(16, 1).toString("base64url");
const key = { key_id: keyId, encrypted_bundle: JSON.stringify({ bundle_version: 2, crypto_version: 2, key_id: keyId,
  kdf: { algorithm: "argon2id13", memory_kib: 65536, iterations: 3, parallelism: 1 },
  salt: Buffer.alloc(16).toString("base64"), nonce: Buffer.alloc(24).toString("base64"), ciphertext: Buffer.alloc(48).toString("base64") }) };
const entryId = (...parts) => {
  const hex = createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
const clone = value => structuredClone(value);

function fixture() {
  const records = new Map();
  const state = { writes: 0, recoveries: 0, closes: 0, failWrite: false, afterWrite: null, pages: 0 };
  const options = { id: randomUUID(), fingerprint: "a".repeat(64), scope, deviceId: randomUUID(),
    localKeys: { version: 1, epoch: randomUUID(), revision: "1", secret: "1".repeat(64), keys: [key], pending: null,
      backup: { key_id: keyId, code: `MS2-${Array(8).fill("A".repeat(8)).join("-")}`, acknowledged: true },
      identity_key: null, token: "never-export-this-account-field" } };
  const manager = new MidoriSyncSavedCustody({ entryId,
    async list(id, { after, limit }) {
      assert.equal(id, options.id);
      ++state.pages;
      return [...records.keys()].filter(value => after === null || value > after).sort().slice(0, Math.min(limit, 2));
    },
    async vaultFactory(id, archiveId) {
      assert.equal(id, options.id);
      return {
        async load(expected) {
          const value = records.get(archiveId) ?? null;
          if (value && expected !== null && value.scope !== expected) {
            throw { code: "account_scope_mismatch" };
          }
          return clone(value);
        },
        async save(expected, value) {
          if (state.failWrite) { throw { code: "vault_unavailable" }; }
          ++state.writes;
          records.set(archiveId, { scope: expected, data: clone(value) });
          await state.afterWrite?.();
        },
        close() {},
      };
    },
    cryptoFactory() {
      return {
        async recoverNativeKey(expected, secret, bundle) {
          assert.equal(expected, scope);
          assert.ok(secret.every(value => value === 17));
          ++state.recoveries;
          return JSON.parse(bundle).key_id;
        },
        async nativeKeyId(handle) { return handle; },
        close() { ++state.closes; },
      };
    },
  });
  return { manager, options, state, records };
}

test("saved custody exports only bounded read keys and is idempotent without changing source custody", async () => {
  const { manager, options, state, records } = fixture();
  const original = clone(options.localKeys);
  const first = await manager.save(options);
  assert.deepEqual(await manager.save(options), first);
  assert.equal(state.writes, 1);
  const saved = records.get(first.archiveId).data;
  assert.deepEqual(Object.keys(saved.crypto).sort(), ["epoch", "keys", "pending", "revision", "secret", "version"]);
  assert.equal(saved.crypto.pending, null);
  assert.ok(!JSON.stringify(saved).includes("never-export"));
  assert.ok(!JSON.stringify(saved).includes("MS2-"));
  assert.deepEqual(options.localKeys, original);
  const reopened = await manager.open({ ...options, requiredKeyIds: [keyId] });
  assert.equal(reopened.scope, scope);
  assert.equal(reopened.keys.sealLocal, undefined);
  reopened.keys.close();
  assert.equal(state.recoveries, state.closes);
});

test("an archive is bound to copy bytes, account scope and every key being released", async () => {
  const { manager, options, records } = fixture();
  await manager.save(options);
  for (const patch of [{ fingerprint: "b".repeat(64) }, { scope: '["other","issuer","user"]' },
    { requiredKeyIds: [Buffer.alloc(16, 2).toString("base64url")] }]) {
    assert.equal(await manager.open({ ...options, ...patch }), null);
    assert.equal(records.size, 1);
  }
});

test("archives remain readable without an active account and partial listing does not end discovery", async () => {
  const { manager, options, records, state } = fixture();
  const { archiveId } = await manager.save(options);
  for (let index = 0; index < 6; ++index) {
    const id = `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`;
    records.set(id, null);
  }
  const opened = await manager.open({ id: options.id, fingerprint: options.fingerprint, scope: null });
  assert.ok(state.pages > 1);
  assert.ok(records.has(archiveId));
  assert.equal(opened.deviceId, options.deviceId);
  opened.keys.close();
});

test("write failures and stale account generations cannot report a successful backup", async () => {
  const { manager, options, state, records } = fixture();
  state.failWrite = true;
  await assert.rejects(manager.save(options), { code: "vault_unavailable" });
  assert.equal(records.size, 0);
  state.failWrite = false;
  let current = true;
  state.afterWrite = () => { current = false; };
  await assert.rejects(manager.save({ ...options, assertCurrent() {
    if (!current) { throw { code: "cancelled" }; }
  } }), { code: "cancelled" });
  assert.equal(records.size, 1, "A durable backup is preserved if shutdown follows its write");
  await assert.rejects(manager.open({ ...options, assertCurrent() { throw { code: "cancelled" }; } }), { code: "cancelled" });
});

test("damaged archives and unknown custody are kept and cannot authorize key release", async () => {
  const { manager, options, records } = fixture();
  const { archiveId } = await manager.save(options);
  records.get(archiveId).data.crypto.token = "unexpected-field";
  assert.equal(await manager.open(options), null);
  await assert.rejects(manager.save(options), { code: "saved_custody_invalid" });
  assert.equal(records.size, 1);
  options.localKeys.version = 99;
  await assert.rejects(manager.save(options), { code: "local_keys_invalid" });
  assert.equal(records.size, 1);
});

test("recovery tries another protected key set when the first cannot authenticate the saved copy", async () => {
  const { manager, options, records, state } = fixture();
  await manager.save(options);
  await manager.save({ ...options, deviceId: randomUUID() });
  assert.equal(records.size, 2);
  let attempts = 0;
  const opened = await manager.open({ ...options, async accept() { return ++attempts === 2; } });
  assert.equal(attempts, 2);
  assert.ok(opened);
  opened.keys.close();
  assert.equal(state.recoveries, state.closes);
});
