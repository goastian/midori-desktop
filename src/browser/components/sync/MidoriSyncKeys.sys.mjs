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
      typeof value.server_recovery !== "boolean" ||
      !["server", "client", "transition"].includes(value.custody) ||
      (value.legacy_frozen === true && value.mode !== "legacy") ||
      !Number.isSafeInteger(value.incompatible_sessions) || value.incompatible_sessions < 0 ||
      !Array.isArray(value.keys) || value.keys.length > 8) {
    fail();
  }
  const keys = value.keys.map(validateKey);
  const identityKey = value.identity_key === null ? null : validateKey(value.identity_key);
  if ((identityKey && !HEX_SECRET.test(value.registry_auth)) ||
      (!identityKey && value.registry_auth !== null)) {
    fail();
  }
  const ids = new Set(keys.map(key => key.key_id));
  if (ids.size !== keys.length || ids.has(identityKey?.key_id) ||
      (keys.length ? value.mode !== "native" || value.revision === "0" || !ids.has(value.active_key_id) || value.migration_required : value.active_key_id !== null)) {
    fail();
  }
  const rotation = validateRotation(value.rotation ?? null, keys);
  return {
    epoch: value.epoch, revision: value.revision, mode: value.mode,
    active_key_id: value.active_key_id, keys,
    migration_required: value.migration_required, legacy_frozen: value.legacy_frozen === true,
    incompatible_sessions: value.incompatible_sessions,
    server_recovery: value.server_recovery, custody: value.custody,
    identity_key: identityKey, registry_auth: value.registry_auth, rotation,
  };
}

function validateRotation(value, keys) {
  if (value === null) {
    return null;
  }
  if (!UUID.test(value?.operation_id) || !KEY_ID.test(value.target_key_id) ||
      !keys.some(key => key.key_id === value.target_key_id) ||
      !Array.isArray(value.source_key_ids) || !value.source_key_ids.length ||
      new Set(value.source_key_ids).size !== value.source_key_ids.length ||
      value.source_key_ids.some(id => !KEY_ID.test(id) || id === value.target_key_id ||
        (value.phase === "rewriting" && !keys.some(key => key.key_id === id))) ||
      !["rewriting", "complete"].includes(value.phase)) {
    fail();
  }
  for (const field of ["live_records", "journal_records"]) {
    if (value[field] !== undefined && (!Number.isSafeInteger(value[field]) || value[field] < 0)) {
      fail();
    }
  }
  return structuredClone(value);
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
  const identityKey = value.identity_key ? validateKey(value.identity_key) : null;
  if (keys.some(key => key.key_id === identityKey?.key_id) ||
      (value.custody !== undefined && !["server", "client", "transition"].includes(value.custody)) ||
      (value.active_key_id !== undefined && !keys.some(key => key.key_id === value.active_key_id)) ||
      (value.recovery_confirmed !== undefined && typeof value.recovery_confirmed !== "boolean")) {
    fail("local_keys_invalid");
  }
  const rotation = value.rotation ? structuredClone(value.rotation) : null;
  if (rotation && (!UUID.test(rotation.operation_id) || !KEY_ID.test(rotation.key_id) ||
      rotation.crypto?.epoch !== value.epoch || !validRevision(rotation.crypto?.revision) ||
      !Array.isArray(rotation.keys) || rotation.keys.length !== keys.length ||
      !keys.every(key => rotation.keys.some(cloud => cloud.key_id === key.key_id)) ||
      rotation.identity_key?.key_id !== identityKey?.key_id || !HEX_SECRET.test(rotation.registry_auth))) {
    fail("local_keys_invalid");
  }
  if (rotation) {
    rotation.keys = rotation.keys.map(validateKey);
    rotation.identity_key = validateKey(rotation.identity_key);
    validateKey(rotation);
  }
  if (value.pending?.identity_key) {
    pending.identity_key = validateKey(value.pending.identity_key);
    pending.registry_auth = value.pending.registry_auth;
    if (pending.identity_key.key_id !== identityKey?.key_id || !HEX_SECRET.test(pending.registry_auth)) {
      fail("local_keys_invalid");
    }
  }
  return { version: 1, epoch: value.epoch, revision: value.revision, secret: value.secret, keys, pending,
    identity_key: identityKey, rotation, recovery_confirmed: value.recovery_confirmed === true,
    ...(value.custody === undefined ? {} : { custody: value.custody }),
    ...(value.active_key_id === undefined ? {} : { active_key_id: value.active_key_id }),
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

export async function recoverLocalSyncKeys({ scope, value, cryptoFactory, allowPendingRotation = false }) {
  const local = validateLocal(structuredClone(value));
  if (!local || local.pending || (local.rotation && allowPendingRotation !== true)) {
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
  #remoteState = null;
  #hasLocalKeys = false;
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
      incompatibleSessions: this.#incompatible, backupPending: this.#backupPending,
      activeKeyId: this.#remoteState?.active_key_id ?? null,
      identityKeyId: this.#remoteState?.identity_key?.key_id ?? null,
      custody: this.#remoteState?.custody ?? null,
      serverRecovery: this.#remoteState?.server_recovery === true,
      rotation: this.#remoteState?.rotation ? structuredClone(this.#remoteState.rotation) : null,
      canRotate: this.#hasLocalKeys && !!this.#active && ["ready", "migration-required"].includes(this.#status) &&
        !!this.#remoteState?.keys.length &&
        this.#remoteState.keys.length < 8 && this.#remoteState.rotation?.phase !== "rewriting" });
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
      this.#hasLocalKeys = !!local;
      if (!local) {
        this.#discardActive();
        this.#backupPending = false;
        this.#status = state.migration_required || (state.keys.length && state.custody === "server") ?
          "migration-required" : state.keys.length ? "recovery-required" : "empty";
        return;
      }
      this.#checkContinuity(local, state);
      this.#backupPending = !!local.backup;
      if (local.pending) {
        if (!this.#published(local.pending, state)) {
          if (state.revision !== local.revision || state.keys.length || state.migration_required) {
            fail("crypto_state_conflict");
          }
          this.#status = local.recovery_confirmed && local.pending.identity_key ? "pending" : "migration-required";
          return;
        }
        local.pending = null;
      }
      if (local.rotation) {
        if (!this.#rotationPublished(local.rotation, state)) {
          if (local.rotation.crypto.revision !== state.revision) {
            fail("crypto_state_conflict");
          }
          this.#status = "rotation-pending";
          return;
        }
        local.rotation = null;
      }
      if (state.keys.some(key => !local.keys.some(saved => saved.key_id === key.key_id))) {
        this.#discardActive();
        this.#status = "recovery-required";
        return;
      }
      if (state.identity_key && local.identity_key?.key_id !== state.identity_key.key_id) {
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
        await this.#unlockLocal(candidate, local, lease.scope, secret, version);
        await this.#verifyRegistry(candidate, state, version);
        this.#pin(local, state);
        await lease.writeLocalKeys(local);
        this.#assert(version);
        this.#install(candidate, state);
      } finally {
        secret.fill(0);
        this.#discardUnused(candidate);
      }
    });
  }

  async prepareCreation(owner = null) {
    return this.#prepareCreation(owner);
  }

  async bootstrap() {
    return false;
  }

  async #prepareCreation(owner) {
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
        const identity = await this.#createIdentity(candidate, lease.scope, passphrase, secret, version);
        const registryAuth = await this.#registryAuth(candidate, {
          epoch: state.epoch, active_key_id: keyId, keys: [cloud], identity_key: identity.cloud,
          custody: "client", server_recovery: false, rotation: null,
        }, version);
        const formattedCode = `MS2-${code.toUpperCase().match(/.{8}/g).join("-")}`;
        this.#draft = {
          kind: "creation", candidate, owner, scope: lease.scope, generation: lease.generation,
          local: { version: 1, epoch: state.epoch, revision: state.revision, secret: hex(secret), keys: [key],
            identity_key: identity.local, pending: { ...cloud, identity_key: identity.cloud, registry_auth: registryAuth }, recovery_confirmed: false },
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

  async confirmCreation({ revokeIncompatible = false, recoveryCodeSaved = false, owner = null } = {}) {
    return this.#run("confirm", async (lease, version) => {
      const draft = this.#draft;
      if (draft && draft.owner !== owner) {
        fail("draft_in_another_window");
      }
      let local = validateLocal(lease.readLocalKeys());
      if (draft) {
        if (draft.kind !== "creation" || draft.scope !== lease.scope || draft.generation !== lease.generation || local) {
          fail("crypto_state_conflict");
        }
        if (recoveryCodeSaved !== true) {
          fail("recovery_backup_required");
        }
        local = validateLocal(draft.local);
        local.recovery_confirmed = true;
      }
      if (!local?.pending) {
        fail("no_pending_key");
      }
      if (!local.recovery_confirmed || !local.pending.identity_key) {
        fail("legacy_migration_required");
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
        const body = { crypto: { epoch: local.epoch, revision: local.revision }, ...validateKey(local.pending),
          identity_key: local.pending.identity_key, registry_auth: local.pending.registry_auth,
          custody: "client", revoke_incompatible: revokeIncompatible === true };
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
      this.#hasLocalKeys = true;
      this.#assert(version);
      await this.#saveVerified(lease, local, state, version);
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
      if (saved.rotation) {
        fail("rotation_unconfirmed");
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
      let identityKey = null;
      if (state.identity_key) {
        try {
          candidate.identityHandle = await candidate.identityCrypto.recoverNativeKey(lease.scope, passphrase, state.identity_key.encrypted_bundle);
          if (await candidate.identityCrypto.nativeKeyId(candidate.identityHandle) !== state.identity_key.key_id) {
            fail("recovery_failed");
          }
        } catch {
          fail("recovery_failed");
        }
        this.#assert(version);
        identityKey = validateKey({ key_id: state.identity_key.key_id,
          encrypted_bundle: await candidate.identityCrypto.wrapNativeKey(candidate.identityHandle, secret) });
        this.#assert(version);
      }
      await this.#verifyRegistry(candidate, state, version);
      const local = { version: 1, epoch: state.epoch, revision: state.revision, secret: hex(secret), keys,
        identity_key: identityKey, pending: null, recovery_confirmed: true };
      this.#pin(local, state);
      await lease.writeLocalKeys(local);
      this.#assert(version);
      this.#hasLocalKeys = true;
      this.#install(candidate, state);
    } finally {
      secret.fill(0);
      this.#discardUnused(candidate);
    }
  }

  async prepareRotation(owner = null) {
    if (this.#operation) {
      fail("busy");
    }
    this.cancelDraft(owner);
    if (this.#draft) {
      fail("draft_in_another_window");
    }
    return this.#run("prepare", async (lease, version) => {
      const state = await this.#state(lease, version);
      const local = validateLocal(lease.readLocalKeys());
      if (!local || local.pending) {
        fail("recovery_required");
      }
      this.#checkContinuity(local, state);
      if (local.rotation || state.rotation?.phase === "rewriting") {
        fail("rotation_in_progress");
      }
      if (state.keys.length >= 8) {
        fail("key_capacity");
      }
      if (state.keys.some(key => !local.keys.some(saved => saved.key_id === key.key_id)) ||
          (state.identity_key && local.identity_key?.key_id !== state.identity_key.key_id)) {
        fail("recovery_required");
      }
      const candidate = this.#candidate();
      const secret = unhex(local.secret);
      const random = this.#random();
      const code = hex(random);
      const passphrase = encoder.encode(code);
      random.fill(0);
      try {
        await this.#unlockLocal(candidate, local, lease.scope, secret, version);
        await this.#verifyRegistry(candidate, state, version);
        const handle = await candidate.crypto.generateNativeKey(lease.scope);
        this.#assert(version);
        const keyId = await candidate.crypto.nativeKeyId(handle);
        candidate.handles.set(keyId, handle);
        local.keys.push(validateKey({ key_id: keyId, encrypted_bundle: await candidate.crypto.wrapNativeKey(handle, secret) }));
        this.#assert(version);
        const cloudKeys = [];
        for (const key of local.keys) {
          cloudKeys.push(validateKey({ key_id: key.key_id,
            encrypted_bundle: await candidate.crypto.wrapNativeKey(candidate.handles.get(key.key_id), passphrase) }));
          this.#assert(version);
        }
        let cloudIdentity;
        if (local.identity_key) {
          cloudIdentity = validateKey({ key_id: local.identity_key.key_id,
            encrypted_bundle: await candidate.identityCrypto.wrapNativeKey(candidate.identityHandle, passphrase) });
          this.#assert(version);
        } else {
          const identity = await this.#createIdentity(candidate, lease.scope, passphrase, secret, version);
          local.identity_key = identity.local;
          cloudIdentity = identity.cloud;
        }
        const operationId = this.#newOperationId();
        const registryAuth = await this.#registryAuth(candidate, {
          epoch: state.epoch, active_key_id: keyId, identity_key: cloudIdentity, keys: cloudKeys,
          custody: "transition", server_recovery: state.server_recovery === true,
          rotation: { operation_id: operationId, target_key_id: keyId,
            source_key_ids: state.keys.map(key => key.key_id), phase: "rewriting" },
        }, version);
        local.rotation = { crypto: { epoch: state.epoch, revision: state.revision },
          operation_id: operationId, ...cloudKeys.find(key => key.key_id === keyId),
          keys: cloudKeys, identity_key: cloudIdentity, registry_auth: registryAuth };
        this.#draft = { kind: "rotation", candidate, owner, scope: lease.scope, generation: lease.generation, local };
        this.#status = "rotation-backup-required";
        return `MS2-${code.toUpperCase().match(/.{8}/g).join("-")}`;
      } finally {
        secret.fill(0);
        passphrase.fill(0);
        this.#discardUnused(candidate);
      }
    }, owner);
  }

  async confirmRotation({ recoveryCodeSaved = false, owner = null } = {}) {
    return this.#run("confirm", async (lease, version) => {
      const draft = this.#draft;
      let local = validateLocal(lease.readLocalKeys());
      if (draft) {
        if (draft.owner !== owner) {
          fail("draft_in_another_window");
        }
        if (draft.kind !== "rotation" || draft.scope !== lease.scope || draft.generation !== lease.generation) {
          fail("crypto_state_conflict");
        }
        if (recoveryCodeSaved !== true) {
          fail("recovery_backup_required");
        }
        local = validateLocal(draft.local);
        local.recovery_confirmed = true;
      }
      if (!local?.rotation || !local.recovery_confirmed) {
        fail("no_pending_rotation");
      }
      let state = await this.#state(lease, version);
      this.#checkContinuity(local, state);
      if (!this.#rotationPublished(local.rotation, state)) {
        if (state.revision !== local.rotation.crypto.revision || state.rotation?.phase === "rewriting") {
          fail("crypto_state_conflict");
        }
        try {
          await lease.writeLocalKeys(local);
        } finally {
          this.#draft = null;
          this.#status = "locked";
        }
        this.#assert(version);
        this.#status = "rotation-pending";
        try {
          const response = await lease.request("api/v1/crypto/rotation", {
            method: "POST", body: local.rotation, maxBytes: 32768,
          });
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
        if (!this.#rotationPublished(local.rotation, state)) {
          fail("rotation_unconfirmed");
        }
      }
      local.rotation = null;
      local.revision = state.revision;
      delete local.backup;
      await this.#saveVerified(lease, local, state, version);
      this.#assert(version);
      this.#draft = null;
      this.#backupPending = false;
      this.#status = "locked";
    });
  }

  async completeRotation(operationId) {
    if (!UUID.test(operationId)) {
      fail("invalid_rotation");
    }
    await this.#run("complete-rotation", async (lease, version) => {
      let state = await this.#state(lease, version);
      const local = validateLocal(lease.readLocalKeys());
      if (!local || local.pending || local.rotation) {
        fail("local_keys_invalid");
      }
      this.#checkContinuity(local, state);
      if (state.rotation?.operation_id !== operationId) {
        fail("crypto_state_conflict");
      }
      const candidate = this.#candidate();
      const secret = unhex(local.secret);
      try {
        await this.#unlockLocal(candidate, local, lease.scope, secret, version);
        await this.#verifyRegistry(candidate, state, version);
        if (state.rotation.phase !== "complete") {
          const registryAuth = await this.#registryAuth(candidate, {
            ...state, custody: "client", server_recovery: false,
            rotation: { ...state.rotation, phase: "complete" },
          }, version);
          try {
            const response = await lease.request("api/v1/crypto/rotation/complete", { method: "POST", body: {
              crypto: { epoch: state.epoch, revision: state.revision }, operation_id: operationId,
              registry_auth: registryAuth,
            }, maxBytes: 32768 });
            state = validateNativeCryptoState(response.data);
          } catch (error) {
            this.#assert(version);
            if (!["network_error", "timeout", "server_error", "invalid_response", "crypto_state_conflict"].includes(error.code)) {
              throw error;
            }
            state = await this.#state(lease, version);
          }
          this.#assert(version);
        }
        if (state.rotation?.operation_id !== operationId || state.rotation.phase !== "complete" ||
            state.custody !== "client" || state.server_recovery !== false) {
          fail("rotation_unconfirmed");
        }
        this.#checkContinuity(local, state);
        await this.#verifyRegistry(candidate, state, version);
        this.#pin(local, state);
        local.revision = state.revision;
        await lease.writeLocalKeys(local);
        this.#assert(version);
      } finally {
        secret.fill(0);
        this.#discardUnused(candidate);
      }
    });
    await this.refresh();
    return this.snapshot;
  }

  async #unlockLocal(candidate, local, scope, secret, version) {
    for (const key of local.keys) {
      const handle = await candidate.crypto.recoverNativeKey(scope, secret, key.encrypted_bundle);
      this.#assert(version);
      if (await candidate.crypto.nativeKeyId(handle) !== key.key_id) {
        fail("local_keys_invalid");
      }
      candidate.handles.set(key.key_id, handle);
    }
    if (local.identity_key) {
      candidate.identityHandle = await candidate.identityCrypto.recoverNativeKey(scope, secret, local.identity_key.encrypted_bundle);
      this.#assert(version);
      if (await candidate.identityCrypto.nativeKeyId(candidate.identityHandle) !== local.identity_key.key_id) {
        fail("local_keys_invalid");
      }
    }
    this.#assert(version);
  }

  async #createIdentity(candidate, scope, passphrase, secret, version) {
    candidate.identityHandle = await candidate.identityCrypto.generateNativeKey(scope);
    this.#assert(version);
    const keyId = await candidate.identityCrypto.nativeKeyId(candidate.identityHandle);
    const cloud = validateKey({ key_id: keyId,
      encrypted_bundle: await candidate.identityCrypto.wrapNativeKey(candidate.identityHandle, passphrase) });
    this.#assert(version);
    const local = validateKey({ key_id: keyId,
      encrypted_bundle: await candidate.identityCrypto.wrapNativeKey(candidate.identityHandle, secret) });
    this.#assert(version);
    return { cloud, local };
  }

  async #registryAuth(candidate, state, version) {
    const keys = state.keys.map(validateKey).sort((left, right) => left.key_id < right.key_id ? -1 : left.key_id > right.key_id ? 1 : 0);
    const rotation = state.rotation ? {
      operation_id: state.rotation.operation_id, target_key_id: state.rotation.target_key_id,
      source_key_ids: [...state.rotation.source_key_ids].sort(), phase: state.rotation.phase,
    } : null;
    const bytes = encoder.encode(JSON.stringify(["MidoriSync/key-registry/v1", state.epoch,
      state.active_key_id, validateKey(state.identity_key), keys,
      state.custody, state.server_recovery === true, rotation]));
    try {
      if (bytes.length > 16384) {
        fail("invalid_crypto_state");
      }
      const tag = await candidate.identityCrypto.deriveNativeRecordId(candidate.identityHandle, "devices", bytes);
      this.#assert(version);
      if (!HEX_SECRET.test(tag)) {
        fail("invalid_crypto_state");
      }
      return tag;
    } finally {
      bytes.fill(0);
    }
  }

  async #verifyRegistry(candidate, state, version) {
    if (state.identity_key && await this.#registryAuth(candidate, state, version) !== state.registry_auth) {
      fail("registry_authentication_failed");
    }
  }

  async #saveVerified(lease, local, state, version) {
    const candidate = this.#candidate();
    const secret = unhex(local.secret);
    try {
      await this.#unlockLocal(candidate, local, lease.scope, secret, version);
      await this.#verifyRegistry(candidate, state, version);
      this.#pin(local, state);
      await lease.writeLocalKeys(local);
      this.#assert(version);
    } finally {
      secret.fill(0);
      this.#discardUnused(candidate);
    }
  }

  #pin(local, state) {
    local.custody = state.custody;
    local.active_key_id = state.active_key_id;
  }

  #newOperationId() {
    const bytes = this.#random();
    try {
      bytes[6] = bytes[6] & 15 | 64;
      bytes[8] = bytes[8] & 63 | 128;
      const value = hex(bytes.subarray(0, 16));
      return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
    } finally {
      bytes.fill(0);
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

  async reencryptRecord(context, envelope) {
    const plaintext = await this.openRecord({ collection: context.collection, id: context.id, generation: context.generation }, envelope);
    try {
      return await this.sealRecord(context, plaintext);
    } finally {
      plaintext.fill(0);
    }
  }

  async deriveRecordId(collection, input) {
    const active = this.#requireActive();
    if (active.candidate.identityHandle === null) {
      fail("identity_key_required");
    }
    const bytes = input instanceof Uint8Array ? new Uint8Array(input) : encoder.encode(JSON.stringify(input));
    try {
      if (!bytes.length || bytes.length > 16384) {
        fail("invalid_record");
      }
      const digest = await active.candidate.identityCrypto.deriveNativeRecordId(active.candidate.identityHandle, collection, bytes);
      this.#requireSameActive(active);
      if (!HEX_SECRET.test(digest)) {
        fail("invalid_record");
      }
      return digest;
    } finally {
      bytes.fill(0);
    }
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
    return state.keys.some(key => key.key_id === pending.key_id && key.encrypted_bundle === pending.encrypted_bundle) &&
      (!pending.identity_key || (JSON.stringify(pending.identity_key) === JSON.stringify(state.identity_key) &&
        pending.registry_auth === state.registry_auth));
  }

  #rotationPublished(pending, state) {
    return state.rotation?.operation_id === pending.operation_id && state.active_key_id === pending.key_id &&
      state.keys.length === pending.keys.length &&
      JSON.stringify(pending.identity_key) === JSON.stringify(state.identity_key) &&
      (state.rotation.phase === "complete" || pending.registry_auth === state.registry_auth) &&
      pending.keys.every(key => this.#published(key, state));
  }

  #checkContinuity(local, state) {
    if (local.epoch !== state.epoch || Number(local.revision) > Number(state.revision) ||
        (["client", "transition"].includes(local.custody) && state.custody === "server") ||
        (local.custody === "client" && state.custody === "transition" &&
          state.active_key_id === local.active_key_id && local.rotation?.operation_id !== state.rotation?.operation_id) ||
        (local.active_key_id && state.active_key_id !== local.active_key_id &&
          local.keys.some(key => key.key_id === state.active_key_id) && state.active_key_id !== local.rotation?.key_id) ||
        (!local.pending && local.keys.some(saved => !state.keys.some(key => key.key_id === saved.key_id) &&
          saved.key_id !== local.rotation?.key_id)) ||
        (local.identity_key && state.identity_key && local.identity_key.key_id !== state.identity_key.key_id) ||
        (local.identity_key && !local.pending && !local.rotation && !state.identity_key)) {
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
    const crypto = this.#cryptoFactory();
    try {
      const candidate = { crypto, identityCrypto: this.#cryptoFactory(), identityHandle: null, handles: new Map() };
      this.#instances.add(candidate);
      return candidate;
    } catch (error) {
      crypto.close();
      throw error;
    }
  }

  #install(candidate, state) {
    this.#discardActive();
    this.#active = { candidate, state };
    this.#remoteState = state;
    this.#status = state.custody === "server" || !state.identity_key ? "migration-required" : "ready";
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
      candidate.identityCrypto.close();
      this.#instances.delete(candidate);
    }
  }

  #dropMemory() {
    ++this.#version;
    for (const candidate of this.#instances) {
      candidate.crypto.close();
      candidate.identityCrypto.close();
    }
    this.#instances.clear();
    this.#active = this.#draft = null;
    this.#incompatible = 0;
    this.#backupPending = false;
    this.#hasLocalKeys = false;
    this.#remoteState = null;
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
