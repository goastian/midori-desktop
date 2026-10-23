/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { MidoriSyncVault } from "../src/browser/components/sync/MidoriSyncVault.sys.mjs";
import { authorizeSyncSecretStore } from "../src/browser/components/sync/MidoriSyncSecretStore.sys.mjs";

const scope = JSON.stringify(["https://sync.example.invalid/", "https://accounts.example.invalid/", "usuario-ñ"]);
const data = { token: "fictional-token-only", bundle: "fictional-wrapped-key", name: "Prueba ñ" };

function setup() {
  const state = { record: null, keys: new Map(), generated: 0, authorized: 0, encryptedInput: null, decrypted: null, access: [] };
  const store = {
    async read() { return structuredClone(state.record); },
    async write(record) { state.record = structuredClone(record); },
    async remove() { state.record = null; },
  };
  const keyStore = {
    isOSBacked: true,
    supportsNonInteractiveAccess: true,
    async asyncSecretAvailable(label, preventPrompt) { state.access.push(["available", preventPrompt]); return state.keys.has(label); },
    async asyncGenerateSecret(label) {
      assert.equal(state.keys.has(label), false);
      state.generated++;
      state.keys.set(label, randomBytes(16));
    },
    async asyncEncryptBytes(label, bytes, preventPrompt) {
      state.access.push(["encrypt", preventPrompt]);
      state.encryptedInput = bytes;
      const nonce = randomBytes(12);
      const cipher = createCipheriv("aes-128-gcm", state.keys.get(label), nonce);
      return Buffer.concat([nonce, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]).toString("base64");
    },
    async asyncDecryptBytes(label, ciphertext, preventPrompt) {
      state.access.push(["decrypt", preventPrompt]);
      const encrypted = Buffer.from(ciphertext, "base64");
      const cipher = createDecipheriv("aes-128-gcm", state.keys.get(label), encrypted.subarray(0, 12));
      cipher.setAuthTag(encrypted.subarray(-16));
      state.decrypted = Uint8Array.from(Buffer.concat([cipher.update(encrypted.subarray(12, -16)), cipher.final()]));
      return state.decrypted;
    },
    async asyncDeleteSecret(label) { state.keys.delete(label); },
  };
  const options = {
    store, keyStore, profileId: randomUUID(), createId: randomUUID,
    authorize: async () => { state.authorized++; },
  };
  return { state, store, keyStore, options, vault: new MidoriSyncVault(options) };
}

function deferred() {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return { promise, resolve };
}

test("vault persists only ciphertext and wipes managed byte buffers after a round trip", async () => {
  const { vault, state, options } = setup();
  assert.deepEqual(await vault.inspect(), { present: false });
  assert.equal(state.authorized, 0);
  const input = structuredClone(data);
  const saving = vault.save(scope, input);
  input.token = "changed after submission";
  await saving;
  assert.equal(JSON.stringify(state.record).includes(data.token), false);
  assert.equal(JSON.stringify(state.record).includes("usuario"), false);
  assert.ok(state.encryptedInput.every(byte => byte === 0));
  const reopened = new MidoriSyncVault(options);
  assert.deepEqual(await reopened.load(scope), { scope, data });
  assert.ok(state.decrypted.every(byte => byte === 0));
  const label = state.record.label;
  await reopened.save(scope, { ...data, token: "replacement" });
  assert.equal(state.record.label, label);
  assert.equal(state.generated, 1);
  assert.equal((await reopened.load(scope)).data.token, "replacement");
});

test("noninteractive reads and writes prohibit prompts on every native operation", async () => {
  const { state, vault, options } = setup();
  await vault.save(scope, data);
  state.access.length = 0;
  const authorized = [];
  const quiet = new MidoriSyncVault({ ...options, authorize: args => authorized.push(args) });
  assert.deepEqual(await quiet.load(scope, { interactive: false }), { scope, data });
  await quiet.save(scope, { ...data, token: "renewed" }, { interactive: false });
  assert(state.access.length >= 5);
  assert(state.access.every(([, preventPrompt]) => preventPrompt === true));
  assert(authorized.every(args => args.interactive === false));
  assert.equal(state.generated, 1);
});

test("noninteractive access fails closed on older binaries and never creates a secret", async () => {
  const { state, vault, keyStore } = setup();
  await assert.rejects(vault.save(scope, data, { interactive: false }), { code: "vault_locked" });
  assert.equal(state.generated, 0);
  await vault.save(scope, data);
  const before = structuredClone(state.record);
  state.access.length = 0;
  delete keyStore.supportsNonInteractiveAccess;
  await assert.rejects(vault.load(scope, { interactive: false }), { code: "vault_unavailable" });
  await assert.rejects(vault.save(scope, data, { interactive: false }), { code: "vault_unavailable" });
  assert.deepEqual(state.access, []);
  assert.deepEqual(state.record, before);
  assert.equal(state.generated, 1);
});

test("a native lock before reading or writing preserves custody without falling back to prompts", async () => {
  for (const method of ["asyncSecretAvailable", "asyncDecryptBytes", "asyncEncryptBytes"]) {
    const { state, vault, keyStore } = setup();
    await vault.save(scope, data);
    const before = structuredClone(state.record);
    keyStore[method] = async (...args) => {
      assert.equal(args.at(-1), true);
      throw { result: 0x80004004 };
    };
    await assert.rejects(method === "asyncEncryptBytes"
      ? vault.save(scope, data, { interactive: false }) : vault.load(scope, { interactive: false }), { code: "vault_locked" });
    assert.deepEqual(state.record, before);
    assert.equal(state.generated, 1);
    if (state.decrypted) { assert(state.decrypted.every(byte => byte === 0)); }
  }
});

test("NSS background authorization never opens the primary password dialog", async () => {
  let prompts = 0;
  const token = { hasPassword: true, isLoggedIn: false, async login() { prompts++; this.isLoggedIn = true; } };
  await assert.rejects(authorizeSyncSecretStore({ isOSBacked: false }, () => token, { interactive: false }), { code: "vault_locked" });
  assert.equal(prompts, 0);
  await authorizeSyncSecretStore({ isOSBacked: false }, () => token);
  assert.equal(prompts, 1);
  await authorizeSyncSecretStore({ isOSBacked: false }, () => token, { interactive: false });
  assert.equal(prompts, 1);
});

test("account and profile mismatches preserve the existing ciphertext", async () => {
  const { vault, state, options } = setup();
  await vault.save(scope, data);
  const previous = structuredClone(state.record);
  const otherScope = JSON.stringify(["https://other.invalid/", "https://accounts.example.invalid/", "usuario-ñ"]);
  await assert.rejects(vault.load(otherScope), { code: "account_scope_mismatch" });
  await assert.rejects(vault.save(otherScope, data), { code: "account_scope_mismatch" });
  const other = new MidoriSyncVault({ ...options, profileId: randomUUID() });
  await assert.rejects(other.load(), { code: "vault_corrupt" });
  assert.deepEqual(state.record, previous);
  assert.equal(state.generated, 1);
});

test("a missing local key never regenerates or overwrites an existing vault", async () => {
  const { vault, state } = setup();
  await vault.save(scope, data);
  const previous = structuredClone(state.record);
  state.keys.clear();
  await assert.rejects(vault.load(scope), { code: "local_secret_missing" });
  await assert.rejects(vault.save(scope, data), { code: "local_secret_missing" });
  assert.deepEqual(state.record, previous);
  assert.equal(state.generated, 1);
});

test("malformed and unauthentic data is rejected without returning secrets", async () => {
  const { vault, state, keyStore } = setup();
  await vault.save(scope, data);
  const previous = structuredClone(state.record);
  for (const change of [{ version: 2 }, { extra: true }, { ciphertext: "!" }, { ciphertext: "x".repeat(90001) }]) {
    state.record = { ...previous, ...change };
    await assert.rejects(vault.load(), { code: "vault_corrupt" });
  }
  state.record = structuredClone(previous);
  const modified = Buffer.from(state.record.ciphertext, "base64");
  modified[modified.length - 1] ^= 1;
  state.record.ciphertext = modified.toString("base64");
  await assert.rejects(vault.load(), { code: "vault_unreadable" });
  state.record = previous;
  const invalid = new Uint8Array([255]);
  keyStore.asyncDecryptBytes = async () => invalid;
  await assert.rejects(vault.load(), { code: "vault_unreadable" });
  assert.equal(invalid[0], 0);
});

test("vault bounds work and data before starting cryptography", async () => {
  const { vault, state } = setup();
  for (const invalid of [null, [], { text: "x".repeat(65537) }]) {
    assert.throws(() => vault.save(scope, invalid), { code: "invalid_secret_data" });
  }
  assert.throws(() => vault.save('["url", "issuer", ""]', data), { code: "invalid_account_scope" });
  const jobs = Array.from({ length: 4 }, () => vault.inspect());
  assert.throws(() => vault.save(scope, data), { code: "busy" });
  await Promise.all(jobs);
  assert.equal(state.generated, 0);
  await vault.save(scope, data);
  const saving = vault.save(scope, { ...data, token: "last" });
  const clearing = vault.clear();
  await saving;
  assert.deepEqual(await clearing, { keyDeleted: true });
  assert.equal(state.record, null);
  assert.equal(state.keys.size, 0);
});

test("closing during encryption discards the result and cleans up the new key", async () => {
  const { vault, state, keyStore } = setup();
  const started = deferred();
  const finish = deferred();
  const encrypt = keyStore.asyncEncryptBytes;
  keyStore.asyncEncryptBytes = async (...args) => {
    const ciphertext = await encrypt(...args);
    started.resolve();
    await finish.promise;
    return ciphertext;
  };
  const saving = vault.save(scope, data);
  await started.promise;
  vault.close();
  finish.resolve();
  await assert.rejects(saving, { code: "cancelled" });
  assert.equal(state.record, null);
  assert.equal(state.keys.size, 0);
  assert.ok(state.encryptedInput.every(byte => byte === 0));
  assert.throws(() => vault.inspect(), { code: "cancelled" });
});

test("closing during decryption rejects and wipes the returned native bytes", async () => {
  const { vault, state, keyStore } = setup();
  await vault.save(scope, data);
  const started = deferred();
  const finish = deferred();
  const decrypt = keyStore.asyncDecryptBytes;
  keyStore.asyncDecryptBytes = async (...args) => {
    const bytes = await decrypt(...args);
    started.resolve();
    await finish.promise;
    return bytes;
  };
  const loading = vault.load(scope);
  await started.promise;
  vault.close();
  finish.resolve();
  await assert.rejects(loading, { code: "cancelled" });
  assert.ok(state.decrypted.every(byte => byte === 0));
});

test("an uncertain disk-write outcome retains the key needed for recovery", async () => {
  const { vault, state, store, options } = setup();
  const write = store.write;
  store.write = async record => {
    await write(record);
    throw new Error(`private error ${data.token}`);
  };
  await assert.rejects(vault.save(scope, data), error => error.code === "vault_unavailable" && !error.message.includes(data.token));
  assert.equal(state.keys.size, 1);
  assert.deepEqual(await new MidoriSyncVault(options).load(scope), { scope, data });
});

test("clearing never deletes a foreign label and reports an unavailable local store", async () => {
  const { vault, state, keyStore } = setup();
  await vault.save(scope, data);
  keyStore.asyncDeleteSecret = async () => { throw new Error("locked"); };
  assert.deepEqual(await vault.clear(), { keyDeleted: false });
  assert.equal(state.record, null);
  assert.equal(state.keys.size, 1);
  state.record = { version: 1, label: "a different application's label", ciphertext: "AAAA" };
  assert.deepEqual(await vault.clear(), { keyDeleted: false });
  assert.equal(state.record, null);
  assert.equal(state.keys.size, 1);
});

test("NSS persistence requires a primary password and successful unlock", async () => {
  await authorizeSyncSecretStore({ isOSBacked: true }, () => assert.fail("OS store does not require NSS login"));
  await assert.rejects(authorizeSyncSecretStore({}, () => assert.fail()), { code: "vault_unavailable" });
  const token = { hasPassword: false, isLoggedIn: false, async login() { assert.fail("No unprotected login"); } };
  await assert.rejects(authorizeSyncSecretStore({ isOSBacked: false }, () => token), { code: "primary_password_required" });
  token.hasPassword = true;
  token.login = async () => { throw new Error("cancelled"); };
  await assert.rejects(authorizeSyncSecretStore({ isOSBacked: false }, () => token), { code: "vault_locked" });
  token.login = async () => { token.isLoggedIn = true; };
  await authorizeSyncSecretStore({ isOSBacked: false }, () => token);
  token.hasPassword = false;
  await assert.rejects(authorizeSyncSecretStore({ isOSBacked: false }, () => token), { code: "primary_password_required" });
});
