/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_ID = /^[A-Za-z0-9_-]{21}[AQgw]$/;
const HEX_SECRET = /^[0-9a-f]{64}$/;
const RECOVERY_CODE = /^MS2-(?:[0-9A-F]{8}-){7}[0-9A-F]{8}$/;
const encoder = new TextEncoder();

export class SyncKeysError extends Error {
  constructor(code) {
    super(code);
    this.name = "SyncKeysError";
    this.code = code;
  }
}

function fail(code = "invalid_crypto_state") {
  throw new SyncKeysError(code);
}

function validRevision(value) {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,9})$/.test(value) && Number(value) <= 2147483647;
}

function validateKey(key) {
  if (!KEY_ID.test(key?.key_id) || typeof key.encrypted_bundle !== "string" || key.encrypted_bundle.length > 2048) {
    fail();
  }
  let bundle;
  try {
    bundle = JSON.parse(key.encrypted_bundle);
  } catch {
    fail();
  }
  if (bundle?.bundle_version !== 2 || bundle.crypto_version !== 2 || bundle.key_id !== key.key_id ||
      bundle.kdf?.algorithm !== "argon2id13" || bundle.kdf.memory_kib !== 65536 ||
      bundle.kdf.iterations !== 3 || bundle.kdf.parallelism !== 1 ||
      !/^[A-Za-z0-9+/]{21}[AQgw]==$/.test(bundle.salt) ||
      !/^[A-Za-z0-9+/]{32}$/.test(bundle.nonce) || !/^[A-Za-z0-9+/]{64}$/.test(bundle.ciphertext)) {
    fail();
  }
  return { key_id: key.key_id, encrypted_bundle: key.encrypted_bundle };
}

export function validateNativeCryptoState(value) {
  if (value?.crypto_state_version !== 1 || !UUID.test(value.epoch) || !validRevision(value.revision) ||
      !["legacy", "native"].includes(value.mode) || typeof value.migration_required !== "boolean" ||
      (value.legacy_frozen !== undefined && typeof value.legacy_frozen !== "boolean") ||
      (value.server_recovery !== undefined && typeof value.server_recovery !== "boolean") ||
      (value.legacy_frozen === true && value.mode !== "legacy") ||
      !Number.isSafeInteger(value.incompatible_sessions) || value.incompatible_sessions < 0 ||
      !Array.isArray(value.keys) || value.keys.length > 8) {
    fail();
  }
  const keys = value.keys.map(validateKey);
  const ids = new Set(keys.map(key => key.key_id));
  if (ids.size !== keys.length || (keys.length ? value.mode !== "native" || value.revision === "0" || !ids.has(value.active_key_id) || value.migration_required : value.active_key_id !== null)) {
    fail();
  }
  return {
    epoch: value.epoch, revision: value.revision, mode: value.mode,
    active_key_id: value.active_key_id, keys,
    migration_required: value.migration_required, legacy_frozen: value.legacy_frozen === true,
    incompatible_sessions: value.incompatible_sessions,
    server_recovery: value.server_recovery ?? null,
  };
}

function validateLocal(value) {
  if (!value) {
    return null;
  }
  if (value.version !== 1 || !UUID.test(value.epoch) || !validRevision(value.revision) ||
      !HEX_SECRET.test(value.secret) || !Array.isArray(value.keys) || !value.keys.length || value.keys.length > 8) {
    fail("local_keys_invalid");
  }
  const keys = value.keys.map(validateKey);
  if (new Set(keys.map(key => key.key_id)).size !== keys.length) {
    fail("local_keys_invalid");
  }
  if (value.pending !== null && (!value.pending || !keys.some(key => key.key_id === value.pending.key_id))) {
    fail("local_keys_invalid");
  }
  const pending = value.pending ? { ...validateKey(value.pending),
    ...(value.pending.recovery_secret === undefined ? {} : { recovery_secret: value.pending.recovery_secret }) } : null;
  if (pending?.recovery_secret !== undefined && !HEX_SECRET.test(pending.recovery_secret)) {
    fail("local_keys_invalid");
  }
  const backup = value.backup;
  if (backup !== undefined && (!RECOVERY_CODE.test(backup?.code) ||
      !keys.some(key => key.key_id === backup.key_id))) {
    fail("local_keys_invalid");
  }
  return { version: 1, epoch: value.epoch, revision: value.revision, secret: value.secret, keys, pending,
    ...(backup === undefined ? {} : { backup: { key_id: backup.key_id, code: backup.code } }) };
}

function hex(bytes) {
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

function unhex(value) {
  return Uint8Array.from(value.match(/../g), byte => parseInt(byte, 16));
}

function recoveryBytes(value) {
  if (typeof value !== "string" || value.length > 256) {
    fail("invalid_recovery_code");
  }
  const normalized = value.trim().replace(/^MS2-/i, "").replace(/[- \t\r\n]/g, "").toLowerCase();
  if (!HEX_SECRET.test(normalized)) {
    fail("invalid_recovery_code");
  }
  return encoder.encode(normalized);
}

export async function recoverLocalSyncKeys({ scope, value, cryptoFactory }) {
  const local = validateLocal(structuredClone(value));
  if (!local || local.pending) {
    fail("local_keys_invalid");
  }
  const crypto = cryptoFactory();
  const handles = new Map();
  const secret = unhex(local.secret);
  let closed = false;
  const ensureOpen = () => {
    if (closed) {
      fail("cancelled");
    }
  };
  try {
    for (const key of local.keys) {
      const handle = await crypto.recoverNativeKey(scope, secret, key.encrypted_bundle);
      if (await crypto.nativeKeyId(handle) !== key.key_id) {
        fail("local_keys_invalid");
      }
      handles.set(key.key_id, handle);
    }
    return {
      async openLocal(expected, envelope) {
        ensureOpen();
        if (typeof envelope !== "string" || encoder.encode(envelope).length > 262144) {
          fail("invalid_record");
        }
        let keyId;
        try {
          keyId = JSON.parse(envelope).key_id;
        } catch {
          fail("invalid_record");
        }
        const handle = handles.get(keyId);
        if (!handle) {
          fail("unknown_key");
        }
        const bytes = await crypto.openNative(handle, 1, JSON.stringify(expected), envelope);
        try {
          ensureOpen();
          return bytes;
        } catch (error) {
          bytes.fill(0);
          throw error;
        }
      },
      close() {
        closed = true;
        handles.clear();
        crypto.close();
      },
    };
  } catch (error) {
    crypto.close();
    throw error;
  } finally {
    secret.fill(0);
  }
}

export class MidoriSyncKeys {
  #account;
  #cryptoFactory;
  #randomBytes;
  #generation;
  #unsubscribe;
  #instances = new Set();
  #active = null;
  #draft = null;
  #version = 0;
  #closed = false;
  #operation = null;
  #operationOwner = null;
  #status = "locked";
  #error = null;
  #incompatible = 0;
  #backupPending = false;
  #listeners = new Set();

  constructor({ account, cryptoFactory, randomBytes }) {
    this.#account = account;
    this.#cryptoFactory = cryptoFactory;
    this.#randomBytes = randomBytes;
    this.#generation = account.snapshot.generation;
    this.#unsubscribe = account.subscribe(snapshot => {
      if (snapshot.generation !== this.#generation || !["connected", "renewal-required"].includes(snapshot.status)) {
        this.#generation = snapshot.generation;
        this.#dropMemory();
        this.#status = "locked";
        this.#error = null;
        this.#notify();
      }
    });
  }

  get snapshot() {
    return Object.freeze({ status: this.#status, busy: this.#operation !== null, error: this.#error,
      incompatibleSessions: this.#incompatible, backupPending: this.#backupPending });
  }

  subscribe(listener) {
    if (this.#closed) {
      fail("cancelled");
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async refresh(owner = null) {
    if (this.#operation) {
      fail("busy");
    }
    this.cancelDraft(owner);
    if (this.#draft) {
      fail("draft_in_another_window");
    }
    return this.#run("refresh", async (lease, version) => {
      const state = await this.#state(lease, version);
      const local = validateLocal(lease.readLocalKeys());
      if (!local) {
        this.#discardActive();
        this.#backupPending = false;
        if (state.keys.length && state.server_recovery === true) {
          const { data } = await lease.request("api/v1/crypto/recovery", { maxBytes: 2048 });
          this.#assert(version);
          if (data?.epoch !== state.epoch || data.revision !== state.revision || !HEX_SECRET.test(data.recovery_secret)) {
            fail("invalid_crypto_state");
          }
          const passphrase = recoveryBytes(data.recovery_secret);
          try {
            await this.#restore(lease, version, state, passphrase);
          } finally {
            passphrase.fill(0);
          }
          return;
        }
        this.#status = state.migration_required ? "migration-required" : state.keys.length ? "recovery-required" : "empty";
        return;
      }
      this.#checkContinuity(local, state);
      this.#backupPending = !!local.backup;
      if (local.pending) {
        if (!this.#published(local.pending, state)) {
          if (state.revision !== local.revision || state.keys.length || state.migration_required) {
            fail("crypto_state_conflict");
          }
          this.#status = "pending";
          return;
        }
        local.pending = null;
      }
      if (state.keys.some(key => !local.keys.some(saved => saved.key_id === key.key_id))) {
        this.#discardActive();
        this.#status = "recovery-required";
        return;
      }
      if (!state.keys.length) {
        fail("crypto_state_conflict");
      }
      local.revision = state.revision;
      const candidate = this.#candidate();
      const secret = unhex(local.secret);
      try {
        for (const key of local.keys) {
          const handle = await candidate.crypto.recoverNativeKey(lease.scope, secret, key.encrypted_bundle);
          this.#assert(version);
          if (await candidate.crypto.nativeKeyId(handle) !== key.key_id) {
            fail("local_keys_invalid");
          }
          candidate.handles.set(key.key_id, handle);
        }
        this.#assert(version);
        const activeState = state.server_recovery === false ?
          await this.#escrow(lease, version, state, candidate) : state;
        local.revision = activeState.revision;
        if (activeState.server_recovery) {
          delete local.backup;
          this.#backupPending = false;
        }
        await lease.writeLocalKeys(local);
        this.#assert(version);
        this.#install(candidate, activeState);
      } finally {
        secret.fill(0);
        this.#discardUnused(candidate);
      }
    });
  }

  async prepareCreation(owner = null) {
    return this.#prepareCreation(owner, false);
  }

  async bootstrap() {
    if (this.#status !== "empty" || this.#operation || this.#draft || this.#incompatible) {
      return false;
    }
    await this.#prepareCreation(null, false);
    try {
      await this.confirmCreation();
      await this.refresh();
      return this.#status === "ready";
    } catch (error) {
      this.cancelDraft();
      throw error;
    }
  }

  async #prepareCreation(owner, keepBackup) {
    if (this.#operation) {
      fail("busy");
    }
    this.cancelDraft(owner);
    if (this.#draft) {
      fail("draft_in_another_window");
    }
    return this.#run("prepare", async (lease, version) => {
      const state = await this.#state(lease, version);
      if (lease.readLocalKeys()) {
        fail("local_keys_exist");
      }
      if (state.migration_required) {
        fail("legacy_migration_required");
      }
      if (state.keys.length) {
        fail("native_keys_already_active");
      }
      const candidate = this.#candidate();
      const random = this.#random();
      const secret = this.#random();
      const code = hex(random);
      const passphrase = encoder.encode(code);
      random.fill(0);
      try {
        const handle = await candidate.crypto.generateNativeKey(lease.scope);
        this.#assert(version);
        const keyId = await candidate.crypto.nativeKeyId(handle);
        const cloud = validateKey({ key_id: keyId, encrypted_bundle: await candidate.crypto.wrapNativeKey(handle, passphrase) });
        this.#assert(version);
        const key = validateKey({ key_id: keyId, encrypted_bundle: await candidate.crypto.wrapNativeKey(handle, secret) });
        this.#assert(version);
        candidate.handles.set(keyId, handle);
        const formattedCode = `MS2-${code.toUpperCase().match(/.{8}/g).join("-")}`;
        this.#draft = {
          candidate, owner, scope: lease.scope, generation: lease.generation,
          local: { version: 1, epoch: state.epoch, revision: state.revision, secret: hex(secret), keys: [key],
            pending: { ...cloud, recovery_secret: code },
            ...(keepBackup ? { backup: { key_id: keyId, code: formattedCode } } : {}) },
        };
        this.#status = "backup-required";
        return formattedCode;
      } finally {
        passphrase.fill(0);
        secret.fill(0);
        this.#discardUnused(candidate);
      }
    }, owner);
  }

  async confirmCreation({ revokeIncompatible = false, owner = null } = {}) {
    return this.#run("confirm", async (lease, version) => {
      const draft = this.#draft;
      if (draft && draft.owner !== owner) {
        fail("draft_in_another_window");
      }
      let local = validateLocal(lease.readLocalKeys());
      if (draft) {
        if (draft.scope !== lease.scope || draft.generation !== lease.generation || local) {
          fail("crypto_state_conflict");
        }
        local = validateLocal(draft.local);
      }
      if (!local?.pending) {
        fail("no_pending_key");
      }
      let state = await this.#state(lease, version);
      this.#checkContinuity(local, state);
      if (!this.#published(local.pending, state)) {
        if (state.revision !== local.revision || state.keys.length) {
          fail("crypto_state_conflict");
        }
        if (state.migration_required) {
          fail("legacy_migration_required");
        }
        if (state.incompatible_sessions && revokeIncompatible !== true) {
          fail("incompatible_devices");
        }
        try {
          await lease.writeLocalKeys(local);
        } finally {
          this.#draft = null;
          this.#status = "locked";
        }
        this.#assert(version);
        this.#status = "pending";
        const body = { crypto: { epoch: local.epoch, revision: local.revision }, ...local.pending, revoke_incompatible: revokeIncompatible === true };
        try {
          const response = await lease.request("api/v1/crypto/activate", { method: "POST", body, maxBytes: 32768 });
          state = validateNativeCryptoState(response.data);
        } catch (error) {
          this.#assert(version);
          if (!["network_error", "timeout", "server_error", "invalid_response", "crypto_state_conflict"].includes(error.code)) {
            throw error;
          }
          state = await this.#state(lease, version);
        }
        this.#assert(version);
        this.#checkContinuity(local, state);
        if (!this.#published(local.pending, state)) {
          fail("activation_unconfirmed");
        }
      }
      local.pending = null;
      local.revision = state.revision;
      this.#assert(version);
      await lease.writeLocalKeys(local);
      this.#assert(version);
      this.#draft = null;
      this.#status = "locked";
    });
  }

  async recover(code) {
    const passphrase = recoveryBytes(code);
    try {
      return await this.#run("recover", async (lease, version) => {
        const state = await this.#state(lease, version);
        await this.#restore(lease, version, state, passphrase);
      });
    } finally {
      passphrase.fill(0);
    }
  }

  async #restore(lease, version, state, passphrase) {
    const saved = validateLocal(lease.readLocalKeys());
    if (saved) {
      this.#checkContinuity(saved, state);
      if (saved.pending) {
        fail("activation_unconfirmed");
      }
    }
    if (!state.keys.length) {
      fail(state.migration_required ? "legacy_migration_required" : "native_keys_required");
    }
    const candidate = this.#candidate();
    const secret = this.#random();
    const keys = [];
    try {
      for (const key of state.keys) {
        let handle;
        try {
          handle = await candidate.crypto.recoverNativeKey(lease.scope, passphrase, key.encrypted_bundle);
        } catch {
          fail("recovery_failed");
        }
        this.#assert(version);
        if (await candidate.crypto.nativeKeyId(handle) !== key.key_id) {
          fail("recovery_failed");
        }
        candidate.handles.set(key.key_id, handle);
        keys.push(validateKey({ key_id: key.key_id, encrypted_bundle: await candidate.crypto.wrapNativeKey(handle, secret) }));
        this.#assert(version);
      }
      await lease.writeLocalKeys({ version: 1, epoch: state.epoch, revision: state.revision, secret: hex(secret), keys, pending: null });
      this.#assert(version);
      this.#install(candidate, state);
    } finally {
      secret.fill(0);
      this.#discardUnused(candidate);
    }
  }

  async #escrow(lease, version, state, candidate) {
    const random = this.#random();
    const code = hex(random);
    const passphrase = encoder.encode(code);
    random.fill(0);
    try {
      const keys = [];
      for (const key of state.keys) {
        const handle = candidate.handles.get(key.key_id);
        keys.push(validateKey({ key_id: key.key_id,
          encrypted_bundle: await candidate.crypto.wrapNativeKey(handle, passphrase) }));
        this.#assert(version);
      }
      let published;
      try {
        const response = await lease.request("api/v1/crypto/recovery", { method: "POST", body: {
          crypto: { epoch: state.epoch, revision: state.revision }, keys, recovery_secret: code,
        }, maxBytes: 32768 });
        published = validateNativeCryptoState(response.data);
      } catch (error) {
        if (!["network_error", "timeout", "server_error", "invalid_response"].includes(error.code)) {
          throw error;
        }
        published = await this.#state(lease, version);
      }
      this.#assert(version);
      if (published.epoch !== state.epoch || published.server_recovery !== true ||
          !keys.every(key => this.#published(key, published))) {
        fail("crypto_state_conflict");
      }
      return published;
    } finally {
      passphrase.fill(0);
    }
  }

  async revealRecoveryCode() {
    this.#requireActive();
    return this.#run("reveal-backup", async lease => {
      const local = validateLocal(lease.readLocalKeys());
      if (!local?.backup || !this.#active?.state.keys.some(key => key.key_id === local.backup.key_id)) {
        fail("backup_unavailable");
      }
      return local.backup.code;
    }, null, true);
  }

  async acknowledgeRecoveryBackup() {
    this.#requireActive();
    return this.#run("acknowledge-backup", async lease => {
      const local = validateLocal(lease.readLocalKeys());
      if (!local?.backup || !this.#active?.state.keys.some(key => key.key_id === local.backup.key_id)) {
        fail("backup_unavailable");
      }
      delete local.backup;
      await lease.writeLocalKeys(local);
      this.#backupPending = false;
    }, null, true);
  }

  async sealRecord(context, plaintext) {
    return this.#seal(0, context, plaintext);
  }

  get writeContext() {
    const { state } = this.#requireActive();
    return Object.freeze({ epoch: state.epoch, revision: state.revision });
  }

  async sealLocal(context, plaintext) {
    return (await this.#seal(1, context, plaintext)).payload;
  }

  async #seal(purpose, context, plaintext) {
    const active = this.#requireActive();
    const { candidate, state } = active;
    const handle = candidate.handles.get(state.active_key_id);
    const payload = await candidate.crypto.sealNative(handle, purpose, JSON.stringify(context), plaintext);
    this.#requireSameActive(active);
    return { payload, crypto: { epoch: state.epoch, revision: state.revision } };
  }

  async openRecord(expected, envelope) {
    return this.#open(0, expected, envelope);
  }

  async openLocal(expected, envelope) {
    return this.#open(1, expected, envelope);
  }

  async #open(purpose, expected, envelope) {
    const active = this.#requireActive();
    if (typeof envelope !== "string" || encoder.encode(envelope).length > 262144) {
      fail("invalid_record");
    }
    let keyId;
    try {
      keyId = JSON.parse(envelope).key_id;
    } catch {
      fail("invalid_record");
    }
    const handle = active.candidate.handles.get(keyId);
    if (!handle) {
      fail("unknown_key");
    }
    const bytes = await active.candidate.crypto.openNative(handle, purpose, JSON.stringify(expected), envelope);
    try {
      this.#requireSameActive(active);
      return bytes;
    } catch (error) {
      bytes.fill(0);
      throw error;
    }
  }

  cancelDraft(owner = null) {
    if (this.#operation === "prepare" && this.#operationOwner === owner) {
      ++this.#version;
    }
    if (this.#operation === "confirm") {
      return;
    }
    if (this.#draft?.owner === owner) {
      const { candidate } = this.#draft;
      this.#draft = null;
      this.#discardUnused(candidate);
      this.#status = "locked";
      this.#notify();
    }
  }

  close() {
    this.#closed = true;
    this.#unsubscribe();
    this.#dropMemory();
    this.#listeners.clear();
  }

  async #state(lease, version) {
    const { data } = await lease.request("api/v1/crypto/state", { maxBytes: 32768 });
    this.#assert(version);
    const state = validateNativeCryptoState(data);
    this.#incompatible = state.incompatible_sessions;
    return state;
  }

  #published(pending, state) {
    return state.keys.some(key => key.key_id === pending.key_id && key.encrypted_bundle === pending.encrypted_bundle);
  }

  #checkContinuity(local, state) {
    if (local.epoch !== state.epoch || Number(local.revision) > Number(state.revision) ||
        (!local.pending && local.keys.some(saved => !state.keys.some(key => key.key_id === saved.key_id)))) {
      fail("crypto_state_conflict");
    }
  }

  #requireActive() {
    if (this.#closed) {
      fail("cancelled");
    }
    if (this.#operation) {
      fail("busy");
    }
    if (!["connected", "renewal-required"].includes(this.#account.snapshot.status)) {
      this.#dropMemory();
      this.#status = "locked";
      this.#notify();
      fail("auth_required");
    }
    if (!this.#active || this.#status !== "ready") {
      fail("keys_locked");
    }
    return this.#active;
  }

  #requireSameActive(active) {
    if (this.#requireActive() !== active) {
      fail("cancelled");
    }
  }

  #random() {
    const bytes = this.#randomBytes(32);
    if (!(bytes instanceof Uint8Array) || bytes.length !== 32) {
      fail("crypto_unavailable");
    }
    return bytes;
  }

  #candidate() {
    const candidate = { crypto: this.#cryptoFactory(), handles: new Map() };
    this.#instances.add(candidate);
    return candidate;
  }

  #install(candidate, state) {
    this.#discardActive();
    this.#active = { candidate, state };
    this.#status = "ready";
  }

  #discardActive() {
    const candidate = this.#active?.candidate;
    this.#active = null;
    if (this.#status === "ready") {
      this.#status = "locked";
    }
    if (candidate) {
      this.#discardUnused(candidate);
    }
  }

  #discardUnused(candidate) {
    if (candidate !== this.#active?.candidate && candidate !== this.#draft?.candidate) {
      candidate.crypto.close();
      this.#instances.delete(candidate);
    }
  }

  #dropMemory() {
    ++this.#version;
    for (const candidate of this.#instances) {
      candidate.crypto.close();
    }
    this.#instances.clear();
    this.#active = this.#draft = null;
    this.#incompatible = 0;
    this.#backupPending = false;
  }

  #assert(version) {
    if (this.#closed || version !== this.#version) {
      fail("cancelled");
    }
  }

  async #run(operation, work, owner = null, localOnly = false) {
    if (this.#closed) {
      fail("cancelled");
    }
    if (this.#operation) {
      fail("busy");
    }
    this.#operation = operation;
    this.#operationOwner = owner;
    this.#error = null;
    const version = this.#version;
    this.#notify();
    try {
      const access = localOnly ? this.#account.withLocalSecrets.bind(this.#account) : this.#account.withSecrets.bind(this.#account);
      const result = await access(lease => work(lease, version));
      this.#assert(version);
      return result;
    } catch (error) {
      if (!this.#closed && version === this.#version) {
        this.#error = error.code ?? "keys_failed";
        this.#discardActive();
      }
      throw new SyncKeysError(error.code ?? "keys_failed");
    } finally {
      for (const candidate of this.#instances) {
        this.#discardUnused(candidate);
      }
      this.#operation = null;
      this.#operationOwner = null;
      this.#notify();
    }
  }

  #notify() {
    if (!this.#closed) {
      for (const listener of this.#listeners) {
        try {
          listener(this.snapshot);
        } catch {}
      }
    }
  }
}
