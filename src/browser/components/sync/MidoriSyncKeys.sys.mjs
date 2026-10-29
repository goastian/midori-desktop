/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_ID = /^[A-Za-z0-9_-]{21}[AQgw]$/;
const HEX_SECRET = /^[0-9a-f]{64}$/;
const RECOVERY_CODE = /^MS2-(?:[0-9A-F]{8}-){7}[0-9A-F]{8}$/;
const MAX_LOCAL_KEYS = 32;
const MAX_CACHED_CUSTODY_BYTES = 32768;
const encoder = new TextEncoder();

export class SyncKeysError extends Error {
  constructor(code, { status = 0, retryAfter = 0 } = {}) {
    super(code);
    this.name = "SyncKeysError";
    this.code = code;
    this.status = Number.isInteger(status) && status >= 0 && status <= 599 ? status : 0;
    this.retryAfter = Number.isInteger(retryAfter) && retryAfter >= 0 && retryAfter <= 86400 ? retryAfter : 0;
  }
}

function fail(code = "invalid_crypto_state") {
  throw new SyncKeysError(code);
}

function sameAccountScope(left, right) {
  try {
    const scope = JSON.parse(left);
    return Array.isArray(scope) && scope.length === 3 && scope.every(value => typeof value === "string") &&
      JSON.stringify(scope) === JSON.stringify(JSON.parse(right));
  } catch {
    return false;
  }
}

function validRevision(value) {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,9})$/.test(value) && Number(value) <= 2147483647;
}

function nextRevision(value) {
  const revision = String(Number(value) + 1);
  if (!validRevision(value) || !validRevision(revision)) {
    fail("crypto_revision_exhausted");
  }
  return revision;
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
      (value.account_recovery !== undefined && typeof value.account_recovery !== "boolean") ||
      !["server", "client", "transition"].includes(value.custody) ||
      (value.legacy_frozen === true && value.mode !== "legacy") ||
      !Number.isSafeInteger(value.incompatible_sessions) || value.incompatible_sessions < 0 ||
      ![1, 2].includes(value.registry_auth_version ?? 1) ||
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
    ...(typeof value.password_unlock === "boolean" ? { password_unlock: value.password_unlock } : {}),
    ...(typeof value.account_recovery === "boolean" ? { account_recovery: value.account_recovery } : {}),
    identity_key: identityKey, registry_auth: value.registry_auth, registry_auth_version: value.registry_auth_version ?? 1, rotation,
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

function createLocalKeyPool(factory) {
  const rings = [];
  let closed = false;
  const requireHandle = token => {
    if (closed || !token || !rings.includes(token.ring)) {
      fail("cancelled");
    }
    return token.ring.crypto;
  };
  const allocate = async (method, args) => {
    if (closed) {
      fail("cancelled");
    }
    let ring = rings.find(value => value.count < 8);
    if (!ring) {
      if (rings.length >= MAX_LOCAL_KEYS / 8) {
        fail("local_key_capacity");
      }
      ring = { crypto: factory(), count: 0 };
      rings.push(ring);
    }
    ++ring.count;
    try {
      const handle = await ring.crypto[method](...args);
      if (closed) {
        fail("cancelled");
      }
      return { ring, handle };
    } catch (error) {
      --ring.count;
      throw error;
    }
  };
  return {
    generateNativeKey: (...args) => allocate("generateNativeKey", args),
    recoverNativeKey: (...args) => allocate("recoverNativeKey", args),
    nativeKeyId: token => requireHandle(token).nativeKeyId(token.handle),
    wrapNativeKey: (token, ...args) => requireHandle(token).wrapNativeKey(token.handle, ...args),
    sealNative: (token, ...args) => requireHandle(token).sealNative(token.handle, ...args),
    openNative: (token, ...args) => requireHandle(token).openNative(token.handle, ...args),
    close() {
      closed = true;
      for (const ring of rings) {
        ring.crypto.close();
      }
      rings.length = 0;
    },
  };
}

function validateLocal(value) {
  if (!value) {
    return null;
  }
  if (value.version !== 1 || !UUID.test(value.epoch) || !validRevision(value.revision) ||
      ![1, 2].includes(value.registry_auth_version ?? 1) ||
      !HEX_SECRET.test(value.secret) || !Array.isArray(value.keys) || !value.keys.length || value.keys.length > MAX_LOCAL_KEYS) {
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
      !keys.some(key => key.key_id === backup.key_id) ||
      (backup.acknowledged !== undefined && typeof backup.acknowledged !== "boolean"))) {
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
      !Array.isArray(rotation.keys) || !rotation.keys.length || rotation.keys.length > 8 ||
      new Set(rotation.keys.map(key => key.key_id)).size !== rotation.keys.length ||
      !rotation.keys.some(key => key.key_id === rotation.key_id) ||
      !rotation.keys.every(cloud => keys.some(key => key.key_id === cloud.key_id)) ||
      rotation.identity_key?.key_id !== identityKey?.key_id || !HEX_SECRET.test(rotation.registry_auth) ||
      ![1, 2].includes(rotation.registry_auth_version ?? 1))) {
    fail("local_keys_invalid");
  }
  if (rotation) {
    rotation.registry_auth_version ??= 1;
    rotation.keys = rotation.keys.map(validateKey);
    rotation.identity_key = validateKey(rotation.identity_key);
    validateKey(rotation);
  }
  if (value.pending?.identity_key) {
    pending.identity_key = validateKey(value.pending.identity_key);
    pending.registry_auth = value.pending.registry_auth;
    pending.registry_auth_version = value.pending.registry_auth_version ?? 1;
    if (pending.identity_key.key_id !== identityKey?.key_id || !HEX_SECRET.test(pending.registry_auth) ||
        ![1, 2].includes(pending.registry_auth_version)) {
      fail("local_keys_invalid");
    }
  }
  return { version: 1, epoch: value.epoch, revision: value.revision, secret: value.secret, keys, pending,
    identity_key: identityKey, rotation, registry_auth_version: value.registry_auth_version ?? 1, recovery_confirmed: value.recovery_confirmed === true,
    ...(value.custody === undefined ? {} : { custody: value.custody }),
    ...(value.active_key_id === undefined ? {} : { active_key_id: value.active_key_id }),
    ...(value.verified_state === undefined ? {} : { verified_state: structuredClone(value.verified_state) }),
    ...(backup === undefined ? {} : { backup: { key_id: backup.key_id, code: backup.code, acknowledged: backup.acknowledged === true } }) };
}

export function localSyncKeyIds(value) {
  if (value === null) {
    return [];
  }
  const local = validateLocal(structuredClone(value));
  if (!local) {
    fail("local_keys_invalid");
  }
  return local.keys.map(key => key.key_id);
}

export function readOnlyLocalSyncCustody(value) {
  const local = validateLocal(structuredClone(value));
  if (!local) {
    fail("local_keys_invalid");
  }
  return { version: 1, epoch: local.epoch, revision: local.revision, secret: local.secret,
    keys: local.keys, pending: null };
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

function accountPasswordBytes(value) {
  if (typeof value !== "string" || !value.length || value.length > 4096) {
    fail("invalid_account_password");
  }
  const bytes = encoder.encode(`MidoriSync/account-password/v1\0${value}`);
  if (bytes.length > 4096) {
    bytes.fill(0);
    fail("invalid_account_password");
  }
  return bytes;
}

function passwordBackupContext(epoch) {
  return { collection: "browser-settings", id: "sync-password-backup-v1", generation: epoch,
    schema_version: 1, base_revision: "0" };
}

export async function recoverLocalSyncKeys({ scope, value, cryptoFactory, allowPendingRotation = false }) {
  const local = validateLocal(structuredClone(value));
  if (!local || local.pending || (local.rotation && allowPendingRotation !== true)) {
    fail("local_keys_invalid");
  }
  const crypto = createLocalKeyPool(cryptoFactory);
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

const ENROLLMENT_TTL_GUARD_MS = 5000;
const ENROLLMENT_PUBLIC_KEY = /^[A-Za-z0-9+/]{87}=$/;
const ENROLLMENT_PAYLOAD_BYTES = 65536;
const ECDH = { name: "ECDH", namedCurve: "P-256" };

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

function concatBytes(...parts) {
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

async function enrollmentCode(publicRaw) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256",
    concatBytes(encoder.encode("MidoriSync/enrollment-code/v1"), publicRaw)));
  let value = 0;
  for (const byte of digest.subarray(0, 5)) {
    value = value * 256 + byte;
  }
  const digits = String(value % 10 ** 10).padStart(10, "0");
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

async function generateEnrollmentPair() {
  const pair = await globalThis.crypto.subtle.generateKey(ECDH, false, ["deriveBits"]);
  return { privateKey: pair.privateKey,
    publicRaw: new Uint8Array(await globalThis.crypto.subtle.exportKey("raw", pair.publicKey)) };
}

async function deriveTransferSecret(privateKey, peerRaw, id, requesterRaw, approverRaw) {
  const subtle = globalThis.crypto.subtle;
  const peer = await subtle.importKey("raw", peerRaw, ECDH, false, []);
  const shared = await subtle.deriveBits({ name: "ECDH", public: peer }, privateKey, 256);
  const material = await subtle.importKey("raw", shared, "HKDF", false, ["deriveBits"]);
  const bits = await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: encoder.encode(id),
    info: concatBytes(encoder.encode("MidoriSync/enrollment/v1"), requesterRaw, approverRaw) }, material, 256);
  new Uint8Array(shared).fill(0);
  return new Uint8Array(bits);
}

function validateEnrollmentPublicKey(value) {
  if (typeof value !== "string" || !ENROLLMENT_PUBLIC_KEY.test(value)) {
    fail("invalid_enrollment");
  }
  const bytes = fromBase64(value);
  if (bytes.length !== 65 || bytes[0] !== 4) {
    fail("invalid_enrollment");
  }
  return bytes;
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
  #enrollment = null;
  #deviceName;
  #listeners = new Set();

  constructor({ account, cryptoFactory, randomBytes, deviceName = "" }) {
    this.#account = account;
    this.#deviceName = String(deviceName).slice(0, 100);
    this.#cryptoFactory = cryptoFactory;
    this.#randomBytes = randomBytes;
    this.#generation = account.snapshot.generation;
    this.#unsubscribe = account.subscribe(snapshot => {
      if (snapshot.generation !== this.#generation || !["connected", "renewal-required", "local"].includes(snapshot.status)) {
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
      incompatibleSessions: this.#incompatible,
      backupPending: this.#backupPending && typeof this.#remoteState?.account_recovery !== "boolean",
      recoveryCodeAvailable: !!this.#active?.localBackup,
      passwordUnlockSupported: typeof this.#remoteState?.password_unlock === "boolean",
      passwordUnlockAvailable: this.#remoteState?.password_unlock === true,
      accountRecoverySupported: typeof this.#remoteState?.account_recovery === "boolean",
      accountRecoveryAvailable: this.#remoteState?.account_recovery === true,
      activeKeyId: this.#remoteState?.active_key_id ?? null,
      keyCount: this.#remoteState?.keys.length ?? 0,
      registryAuthVersion: this.#remoteState?.registry_auth_version ?? 1,
      registryUpgradeRequired: !!this.#remoteState?.identity_key && this.#remoteState.registry_auth_version === 1,
      localKeyCount: this.#active?.candidate.handles.size ?? 0,
      localOnly: this.#active?.localOnly === true,
      enrollment: this.#enrollment ? { code: this.#enrollment.code, expiresAt: this.#enrollment.expiresAt } : null,
      identityKeyId: this.#remoteState?.identity_key?.key_id ?? null,
      custody: this.#remoteState?.custody ?? null,
      serverRecovery: this.#remoteState?.server_recovery === true,
      rotation: this.#remoteState?.rotation ? structuredClone(this.#remoteState.rotation) : null,
      canRotate: this.#hasLocalKeys && !!this.#active && !this.#active.localOnly && this.#active.candidate.handles.size < MAX_LOCAL_KEYS &&
        ["ready", "migration-required"].includes(this.#status) &&
        !!this.#remoteState?.keys.length &&
        this.#remoteState.keys.length < 8 && this.#remoteState.rotation?.phase !== "rewriting" &&
        !(this.#remoteState.rotation?.phase === "complete" && this.#remoteState.keys.length > 1) });
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
        this.#remoteState = state;
        this.#backupPending = false;
        if (state.account_recovery === true) {
          await this.#restoreAccount(lease, version, state);
          return;
        }
        this.#status = state.migration_required || (state.keys.length && state.custody === "server") ?
          "migration-required" : state.keys.length ? "recovery-required" : "empty";
        if (state.account_recovery === false && (state.keys.length || state.migration_required)) {
          this.#status = "account-recovery-pending";
        }
        return;
      }
      this.#checkContinuity(local, state);
      this.#backupPending = !!local.backup && !local.backup.acknowledged;
      if (local.pending) {
        if (!this.#published(local.pending, state)) {
          if (state.account_recovery === true && state.keys.length && !local.verified_state) {
            await this.#restoreAccount(lease, version, state);
            return;
          }
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
        if (state.account_recovery === true) {
          await this.#restoreAccount(lease, version, state);
          return;
        }
        if (local.identity_key && state.identity_key?.key_id === local.identity_key.key_id) {
          await this.#verifySavedRegistry(lease, local, state, version);
          local.revision = state.revision;
          local.registry_auth_version = state.registry_auth_version;
          await lease.writeLocalKeys(local);
          this.#assert(version);
          this.#remoteState = state;
        }
        this.#discardActive();
        this.#status = state.account_recovery === false ? "account-recovery-pending" : "recovery-required";
        return;
      }
      if (state.identity_key && local.identity_key?.key_id !== state.identity_key.key_id) {
        if (state.account_recovery === true) {
          await this.#restoreAccount(lease, version, state);
          return;
        }
        this.#discardActive();
        this.#status = state.account_recovery === false ? "account-recovery-pending" : "recovery-required";
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
        this.#install(candidate, state, local);
        if (state.account_recovery === false && state.registry_auth_version === 2) {
          await lease.request("api/v1/crypto/account-recovery", { method: "PUT", maxBytes: 1024,
            body: { crypto: { epoch: state.epoch, revision: state.revision }, capsule: this.#accountCapsule(lease.scope, local, state) } });
          this.#assert(version);
          state.account_recovery = true;
        }
      } finally {
        secret.fill(0);
        this.#discardUnused(candidate);
      }
    });
  }

  #accountCapsule(scope, local, state) {
    if (!local.identity_key || local.identity_key.key_id !== state.identity_key?.key_id || local.epoch !== state.epoch) {
      fail("local_keys_invalid");
    }
    const keys = state.keys.map(key => {
      const saved = local.keys.find(item => item.key_id === key.key_id);
      if (!saved) { fail("local_keys_invalid"); }
      return validateKey(saved);
    });
    return { version: 1, scope, epoch: state.epoch, secret: local.secret, keys,
      identity_key: validateKey(local.identity_key) };
  }

  async #restoreAccount(lease, version, state) {
    const { data } = await lease.request("api/v1/crypto/account-recovery", { maxBytes: 65536 });
    this.#assert(version);
    const capsule = data?.capsule;
    if (data?.epoch !== state.epoch || capsule?.version !== 1 || !sameAccountScope(capsule.scope, lease.scope) ||
        capsule.epoch !== state.epoch || !HEX_SECRET.test(capsule.secret) ||
        !Array.isArray(capsule.keys) || capsule.keys.length !== state.keys.length) {
      fail("invalid_account_capsule");
    }
    const bundles = { keys: capsule.keys.map(validateKey), identity_key: validateKey(capsule.identity_key) };
    if (new Set(bundles.keys.map(key => key.key_id)).size !== state.keys.length ||
        state.keys.some(key => !bundles.keys.some(saved => saved.key_id === key.key_id))) {
      fail("invalid_account_capsule");
    }
    const secret = unhex(capsule.secret);
    capsule.secret = null;
    try {
      await this.#restore(lease, version, state, secret, bundles);
    } finally {
      secret.fill(0);
    }
  }

  async unlockLocal() {
    if (this.#account.snapshot.status !== "local") {
      fail("offline_account_required");
    }
    return this.#run("unlock-local", async (lease, version) => {
      const local = validateLocal(lease.readLocalKeys());
      if (!local?.verified_state || local.pending || local.rotation) {
        fail("offline_keys_unavailable");
      }
      const state = validateNativeCryptoState(local.verified_state);
      if (state.custody !== "client" || state.registry_auth_version !== 2 || !state.identity_key ||
          state.rotation?.phase === "rewriting" || state.epoch !== local.epoch || state.revision !== local.revision ||
          state.active_key_id !== local.active_key_id || state.identity_key.key_id !== local.identity_key?.key_id ||
          state.keys.some(key => !local.keys.some(saved => saved.key_id === key.key_id))) {
        fail("offline_keys_unavailable");
      }
      this.#checkContinuity(local, state);
      const candidate = this.#candidate();
      const secret = unhex(local.secret);
      try {
        await this.#unlockLocal(candidate, local, lease.scope, secret, version);
        await this.#verifyRegistry(candidate, state, version);
        this.#hasLocalKeys = true;
        this.#backupPending = !!local.backup && !local.backup.acknowledged;
        this.#install(candidate, state, local, true);
      } finally {
        secret.fill(0);
        this.#discardUnused(candidate);
      }
    }, null, true);
  }

  async prepareCreation(owner = null) {
    return this.#prepareCreation(owner);
  }

  async bootstrap() {
    if (this.#status !== "empty" || this.#operation) {
      return false;
    }
    const owner = {};
    await this.#prepareCreation(owner, true);
    try {
      await this.confirmCreation({ recoveryCodeSaved: true, owner });
    } catch (error) {
      this.cancelDraft(owner);
      throw error;
    }
    await this.refresh();
    return true;
  }

  async #prepareCreation(owner, deferBackup = false) {
    if (this.#operation) {
      fail("busy");
    }
    this.cancelDraft(owner);
    if (this.#draft) {
      fail("draft_in_another_window");
    }
    return this.#run("prepare", async (lease, version) => {
      const state = await this.#state(lease, version);
      this.#requireRegistrySupport();
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
          epoch: state.epoch, revision: nextRevision(state.revision), registry_auth_version: 2,
          active_key_id: keyId, keys: [cloud], identity_key: identity.cloud,
          custody: "client", server_recovery: false, rotation: null,
        }, version);
        const formattedCode = `MS2-${code.toUpperCase().match(/.{8}/g).join("-")}`;
        this.#draft = {
          kind: "creation", candidate, owner, scope: lease.scope, generation: lease.generation,
          local: { version: 1, epoch: state.epoch, revision: state.revision, secret: hex(secret), keys: [key],
            identity_key: identity.local, pending: { ...cloud, identity_key: identity.cloud, registry_auth: registryAuth, registry_auth_version: 2 }, recovery_confirmed: false,
            backup: { key_id: keyId, code: formattedCode, acknowledged: !deferBackup } },
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
        this.#requireRegistrySupport();
        await this.#upgradePendingRegistry(lease, local, state, version, "pending");
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
          registry_auth_version: local.pending.registry_auth_version,
          custody: "client", revoke_incompatible: revokeIncompatible === true };
        if (typeof state.account_recovery === "boolean") {
          body.account_recovery = this.#accountCapsule(lease.scope, local, {
            ...state, keys: [local.pending], identity_key: local.pending.identity_key,
          });
        }
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
          if (state.account_recovery === true && state.keys.length && !local.verified_state) {
            await this.#restoreAccount(lease, version, state);
            this.#draft = null;
            return;
          }
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
        const normalized = new TextDecoder().decode(passphrase).toUpperCase();
        await this.#restore(lease, version, state, passphrase, null, `MS2-${normalized.match(/.{8}/g).join("-")}`);
      });
    } finally {
      passphrase.fill(0);
    }
  }

  async setAccountPassword(password) {
    const passphrase = accountPasswordBytes(password);
    try {
      this.#requireActive();
      return await this.#run("password-backup", async (lease, version) => {
        const state = await this.#state(lease, version);
        const local = validateLocal(lease.readLocalKeys());
        if (typeof state.password_unlock !== "boolean") {
          fail("password_unlock_unsupported");
        }
        if (!local || local.pending || local.rotation || state.custody !== "client" || state.rotation?.phase === "rewriting" ||
            state.revision !== this.#active?.state.revision || state.keys.some(key => !local.keys.some(saved => saved.key_id === key.key_id))) {
          fail("password_backup_unavailable");
        }
        this.#checkContinuity(local, state);
        await this.#verifySavedRegistry(lease, local, state, version);
        const bytes = encoder.encode(JSON.stringify({ version: 1, epoch: state.epoch, secret: local.secret,
          keys: local.keys.filter(key => state.keys.some(cloud => cloud.key_id === key.key_id)), identity_key: local.identity_key,
          ...(local.backup?.key_id === state.active_key_id ? { backup: local.backup } : {}) }));
        let crypto;
        try {
          crypto = this.#cryptoFactory();
          if (bytes.length > 32768) {
            fail("invalid_crypto_state");
          }
          const handle = await crypto.generateNativeKey(lease.scope);
          this.#assert(version);
          const keyId = await crypto.nativeKeyId(handle);
          const key = validateKey({ key_id: keyId, encrypted_bundle: await crypto.wrapNativeKey(handle, passphrase) });
          this.#assert(version);
          const payload = await crypto.sealNative(handle, 1, JSON.stringify(passwordBackupContext(state.epoch)), bytes);
          this.#assert(version);
          await lease.request("api/v1/crypto/password", { method: "PUT", maxBytes: 1024,
            body: { crypto: { epoch: state.epoch, revision: state.revision }, capsule: { version: 1, key, payload } } });
          this.#assert(version);
          this.#active.state.password_unlock = true;
          this.#remoteState = this.#active.state;
        } finally {
          bytes.fill(0);
          crypto?.close();
        }
      }, null, false, true);
    } finally {
      passphrase.fill(0);
    }
  }

  async unlockWithAccountPassword(password) {
    const passphrase = accountPasswordBytes(password);
    try {
      return await this.#run("password-unlock", async (lease, version) => {
        const state = await this.#state(lease, version);
        if (!state.password_unlock) {
          fail("password_backup_unavailable");
        }
        const { data } = await lease.request("api/v1/crypto/password", { maxBytes: 65536 });
        this.#assert(version);
        if (data?.epoch !== state.epoch || data.capsule?.version !== 1 ||
            typeof data.capsule.payload !== "string" || data.capsule.payload.length > 49152) {
          fail("password_unlock_failed");
        }
        const key = validateKey(data.capsule.key);
        const crypto = this.#cryptoFactory();
        let bytes;
        let secret;
        try {
          let backup;
          try {
            const handle = await crypto.recoverNativeKey(lease.scope, passphrase, key.encrypted_bundle);
            this.#assert(version);
            const { collection, id, generation } = passwordBackupContext(state.epoch);
            bytes = await crypto.openNative(handle, 1, JSON.stringify({ collection, id, generation }), data.capsule.payload);
            this.#assert(version);
            if (bytes.length > 32768) {
              fail("password_unlock_failed");
            }
            backup = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
            if (backup?.version !== 1 || backup.epoch !== state.epoch || !HEX_SECRET.test(backup.secret) ||
                !Array.isArray(backup.keys) || backup.keys.length > 8 ||
                (backup.backup && (!RECOVERY_CODE.test(backup.backup.code) || backup.backup.key_id !== state.active_key_id))) {
              fail("password_unlock_failed");
            }
            backup.keys = backup.keys.map(validateKey);
            backup.identity_key = validateKey(backup.identity_key);
            secret = unhex(backup.secret);
            backup.secret = null;
            bytes.fill(0);
          } catch {
            this.#assert(version);
            fail("password_unlock_failed");
          }
          await this.#restore(lease, version, state, secret, backup, backup.backup?.code ?? null);
        } finally {
          bytes?.fill(0);
          secret?.fill(0);
          crypto.close();
        }
      });
    } finally {
      passphrase.fill(0);
    }
  }

  async #restore(lease, version, state, passphrase, bundles = null, recoveryCode = null) {
    let saved = validateLocal(lease.readLocalKeys());
    if (saved) {
      this.#checkContinuity(saved, state);
      if (saved.pending) {
        if (state.account_recovery === true && state.keys.length && !saved.verified_state &&
            saved.keys.length === 1 && !this.#published(saved.pending, state)) {
          saved = null;
        } else {
          fail("activation_unconfirmed");
        }
      }
      if (saved?.rotation) {
        fail("rotation_unconfirmed");
      }
    }
    if (!state.keys.length) {
      fail(state.migration_required ? "legacy_migration_required" : "native_keys_required");
    }
    if (new Set([...state.keys, ...(saved?.keys ?? [])].map(key => key.key_id)).size > MAX_LOCAL_KEYS) {
      fail("local_key_capacity");
    }
    const bundleFor = key => {
      const match = bundles ? bundles.keys.find(item => item.key_id === key.key_id) : key;
      if (!match) {
        fail("recovery_failed");
      }
      return match.encrypted_bundle;
    };
    if (bundles && state.identity_key && bundles.identity_key?.key_id !== state.identity_key.key_id) {
      fail("recovery_failed");
    }
    const candidate = this.#candidate();
    const secret = this.#random();
    const keys = [];
    try {
      for (const key of state.keys) {
        let handle;
        try {
          handle = await candidate.crypto.recoverNativeKey(lease.scope, passphrase, bundleFor(key));
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
          candidate.identityHandle = await candidate.identityCrypto.recoverNativeKey(lease.scope, passphrase,
            bundles ? bundles.identity_key.encrypted_bundle : state.identity_key.encrypted_bundle);
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
      if (saved) {
        const previousSecret = unhex(saved.secret);
        try {
          for (const key of saved.keys) {
            if (candidate.handles.has(key.key_id)) {
              continue;
            }
            const handle = await candidate.crypto.recoverNativeKey(lease.scope, previousSecret, key.encrypted_bundle);
            this.#assert(version);
            if (await candidate.crypto.nativeKeyId(handle) !== key.key_id) {
              fail("local_keys_invalid");
            }
            candidate.handles.set(key.key_id, handle);
            keys.push(validateKey({ key_id: key.key_id, encrypted_bundle: await candidate.crypto.wrapNativeKey(handle, secret) }));
            this.#assert(version);
          }
        } finally {
          previousSecret.fill(0);
        }
      }
      const local = { version: 1, epoch: state.epoch, revision: state.revision, secret: hex(secret), keys,
        identity_key: identityKey, pending: null, recovery_confirmed: true,
        ...(recoveryCode ? { backup: { key_id: state.active_key_id, code: recoveryCode.trim().toUpperCase(), acknowledged: true } } : {}) };
      this.#pin(local, state);
      await lease.writeLocalKeys(local);
      this.#assert(version);
      this.#hasLocalKeys = true;
      this.#install(candidate, state, local);
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
      this.#requireRegistrySupport();
      if (state.rotation?.phase === "complete" && state.keys.length > 1) {
        fail("rotation_cleanup_required");
      }
      if (state.keys.length >= 8) {
        fail("key_capacity");
      }
      if (local.keys.length >= MAX_LOCAL_KEYS) {
        fail("local_key_capacity");
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
        for (const key of [...state.keys, { key_id: keyId }]) {
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
          epoch: state.epoch, revision: nextRevision(state.revision), registry_auth_version: 2,
          active_key_id: keyId, identity_key: cloudIdentity, keys: cloudKeys,
          custody: "transition", server_recovery: state.server_recovery === true,
          rotation: { operation_id: operationId, target_key_id: keyId,
            source_key_ids: state.keys.map(key => key.key_id), phase: "rewriting" },
        }, version);
        local.rotation = { crypto: { epoch: state.epoch, revision: state.revision },
          operation_id: operationId, ...cloudKeys.find(key => key.key_id === keyId),
          keys: cloudKeys, identity_key: cloudIdentity, registry_auth: registryAuth, registry_auth_version: 2 };
        local.backup = { key_id: keyId, code: `MS2-${code.toUpperCase().match(/.{8}/g).join("-")}`, acknowledged: true };
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
        this.#requireRegistrySupport();
        await this.#upgradePendingRegistry(lease, local, state, version, "rotation");
        if (typeof state.account_recovery === "boolean") {
          local.rotation.account_recovery = this.#accountCapsule(lease.scope, local, {
            ...state, keys: local.rotation.keys, identity_key: local.rotation.identity_key,
          });
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
        const minimumAuthVersion = state.rotation.phase === "complete" ? state.registry_auth_version : 2;
        if (state.rotation.phase !== "complete") {
          this.#requireRegistrySupport();
          const registryAuth = await this.#registryAuth(candidate, {
            ...state, revision: nextRevision(state.revision), registry_auth_version: 2,
            custody: "client", server_recovery: false,
            rotation: { ...state.rotation, phase: "complete" },
          }, version);
          try {
            const response = await lease.request("api/v1/crypto/rotation/complete", { method: "POST", body: {
              crypto: { epoch: state.epoch, revision: state.revision }, operation_id: operationId,
              registry_auth: registryAuth, registry_auth_version: 2,
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
        if (state.registry_auth_version < minimumAuthVersion) {
          fail("registry_authentication_failed");
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

  async retireUnusedKeys(journal) {
    const active = this.#requireActive();
    if (!journal || typeof journal.assertOnlyKey !== "function") {
      fail("local_key_verification_required");
    }
    const activeId = active.state.active_key_id;
    await this.#account.withLocalSecrets(lease => journal.assertOnlyKey(activeId, { scope: lease.scope,
      accountKeyIds: [...new Set([
        ...active.candidate.handles.keys(), ...active.state.keys.map(key => key.key_id),
      ])] }));
    this.#requireSameActive(active);
    await this.#run("retire-keys", async (lease, version) => {
      let state = await this.#state(lease, version);
      const local = validateLocal(lease.readLocalKeys());
      if (!local || local.pending || local.rotation || state.custody !== "client" ||
          state.active_key_id !== activeId || state.rotation?.phase === "rewriting") {
        fail("crypto_state_conflict");
      }
      this.#checkContinuity(local, state);
      const candidate = this.#candidate();
      const secret = unhex(local.secret);
      try {
        await this.#unlockLocal(candidate, local, lease.scope, secret, version);
        await this.#verifyRegistry(candidate, state, version);
        if (state.keys.length > 1) {
          this.#requireRegistrySupport();
        }
        for (const key of [...state.keys]) {
          if (key.key_id === activeId) {
            continue;
          }
          const registryAuth = await this.#registryAuth(candidate, {
            ...state, revision: nextRevision(state.revision), registry_auth_version: 2,
            keys: state.keys.filter(value => value.key_id !== key.key_id),
          }, version);
          const body = { crypto: { epoch: state.epoch, revision: state.revision }, registry_auth: registryAuth, registry_auth_version: 2 };
          if (typeof state.account_recovery === "boolean") {
            body.account_recovery = this.#accountCapsule(lease.scope, local, {
              ...state, keys: state.keys.filter(value => value.key_id !== key.key_id),
            });
          }
          try {
            const response = await lease.request(`api/v1/crypto/native-keys/${key.key_id}`, {
              method: "DELETE", body,
              maxBytes: 32768,
            });
            state = validateNativeCryptoState(response.data);
          } catch (error) {
            this.#assert(version);
            if (!["network_error", "timeout", "server_error", "invalid_response", "crypto_state_conflict", "unknown_key"].includes(error.code)) {
              throw error;
            }
            state = await this.#state(lease, version);
          }
          this.#assert(version);
          if (state.registry_auth_version !== 2) {
            fail("registry_authentication_failed");
          }
          this.#checkContinuity(local, state);
          await this.#verifyRegistry(candidate, state, version);
          if (state.active_key_id !== activeId || state.custody !== "client" || state.keys.some(value => value.key_id === key.key_id)) {
            fail("key_retirement_unconfirmed");
          }
        }
        local.keys = local.keys.filter(key => key.key_id === activeId);
        local.revision = state.revision;
        this.#pin(local, state);
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
    const authVersion = state.registry_auth_version ?? 1;
    if (![1, 2].includes(authVersion) || (authVersion === 2 && !validRevision(state.revision))) {
      fail("invalid_crypto_state");
    }
    const bytes = encoder.encode(JSON.stringify([`MidoriSync/key-registry/v${authVersion}`, state.epoch,
      ...(authVersion === 2 ? [state.revision] : []),
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

  async #verifySavedRegistry(lease, local, state, version) {
    const candidate = this.#candidate();
    const secret = unhex(local.secret);
    try {
      candidate.identityHandle = await candidate.identityCrypto.recoverNativeKey(lease.scope, secret, local.identity_key.encrypted_bundle);
      this.#assert(version);
      if (await candidate.identityCrypto.nativeKeyId(candidate.identityHandle) !== local.identity_key.key_id) {
        fail("local_keys_invalid");
      }
      await this.#verifyRegistry(candidate, state, version);
    } finally {
      secret.fill(0);
      this.#discardUnused(candidate);
    }
  }

  async #upgradePendingRegistry(lease, local, state, version, field) {
    const pending = local[field];
    if (pending.registry_auth_version === 2) {
      return;
    }
    const candidate = this.#candidate();
    const secret = unhex(local.secret);
    try {
      await this.#unlockLocal(candidate, local, lease.scope, secret, version);
      if (field === "rotation") {
        await this.#verifyRegistry(candidate, state, version);
      }
      pending.registry_auth = await this.#registryAuth(candidate, {
        epoch: state.epoch, revision: nextRevision(state.revision), registry_auth_version: 2,
        active_key_id: pending.key_id, identity_key: pending.identity_key,
        keys: field === "rotation" ? pending.keys : [validateKey(pending)],
        custody: field === "rotation" ? "transition" : "client",
        server_recovery: field === "rotation" && state.server_recovery,
        rotation: field === "rotation" ? { operation_id: pending.operation_id, target_key_id: pending.key_id,
          source_key_ids: state.keys.map(key => key.key_id), phase: "rewriting" } : null,
      }, version);
      pending.registry_auth_version = 2;
    } finally {
      secret.fill(0);
      this.#discardUnused(candidate);
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
    local.registry_auth_version = state.registry_auth_version;
    local.custody = state.custody;
    local.active_key_id = state.active_key_id;
    local.verified_state = { crypto_state_version: 1, ...structuredClone(state) };
    const bytes = encoder.encode(JSON.stringify(local));
    try {
      if (bytes.length > MAX_CACHED_CUSTODY_BYTES) {
        delete local.verified_state;
      }
    } finally {
      bytes.fill(0);
    }
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
      if (!local?.backup || local.epoch !== this.#active?.state.epoch ||
          local.backup.key_id !== this.#active.state.active_key_id || this.#active.state.custody !== "client") {
        fail("backup_unavailable");
      }
      return local.backup.code;
    }, null, true, true);
  }

  async acknowledgeRecoveryBackup() {
    this.#requireActive();
    return this.#run("acknowledge-backup", async lease => {
      const local = validateLocal(lease.readLocalKeys());
      if (!local?.backup || !this.#active?.state.keys.some(key => key.key_id === local.backup.key_id)) {
        fail("backup_unavailable");
      }
      local.backup.acknowledged = true;
      await lease.writeLocalKeys(local);
      this.#backupPending = false;
    }, null, true);
  }

  hasLocalKey(id) {
    return KEY_ID.test(id) && this.#requireActive().candidate.handles.has(id);
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

  async beginEnrollment(owner = null) {
    if (this.#status !== "recovery-required") {
      fail("enrollment_unavailable");
    }
    const previous = this.#enrollment;
    this.#enrollment = null;
    if (previous) {
      this.#deleteEnrollment(previous.id);
    }
    return this.#run("enroll", async (lease, version) => {
      const pair = await generateEnrollmentPair();
      this.#assert(version);
      const { data } = await lease.request("api/v1/crypto/enrollments", {
        method: "POST", maxBytes: 4096,
        body: { public_key: toBase64(pair.publicRaw), ...(this.#deviceName ? { device_name: this.#deviceName } : {}) },
      });
      this.#assert(version);
      const expiresAt = Date.parse(data?.expires_at);
      if (!UUID.test(data?.id) || !Number.isFinite(expiresAt)) {
        fail("invalid_enrollment");
      }
      this.#enrollment = { id: data.id, privateKey: pair.privateKey, publicRaw: pair.publicRaw, expiresAt,
        code: await enrollmentCode(pair.publicRaw) };
      return this.snapshot.enrollment;
    }, owner);
  }

  async pollEnrollment() {
    const pending = this.#enrollment;
    if (!pending) {
      return "idle";
    }
    if (Date.now() >= pending.expiresAt - ENROLLMENT_TTL_GUARD_MS) {
      this.#enrollment = null;
      this.#error = "enrollment_expired";
      this.#deleteEnrollment(pending.id);
      this.#notify();
      return "expired";
    }
    if (this.#operation) {
      return "pending";
    }
    const version = this.#version;
    let data;
    try {
      ({ data } = await this.#account.withSecrets(lease =>
        lease.request(`api/v1/crypto/enrollments/${pending.id}`, { maxBytes: ENROLLMENT_PAYLOAD_BYTES + 4096 })));
    } catch (error) {
      if (error.status === 404 && this.#enrollment === pending) {
        this.#enrollment = null;
        this.#error = "enrollment_expired";
        this.#notify();
        return "expired";
      }
      if (["network_error", "timeout", "server_error", "rate_limited", "busy"].includes(error.code)) {
        return "pending";
      }
      throw error;
    }
    this.#assert(version);
    if (this.#enrollment !== pending) {
      fail("cancelled");
    }
    if (data?.status === "pending") {
      return "pending";
    }
    if (data?.status !== "approved") {
      this.#enrollment = null;
      this.#error = data?.status === "denied" ? "enrollment_denied" : "enrollment_expired";
      this.#notify();
      return data?.status === "denied" ? "denied" : "expired";
    }
    await this.#completeEnrollment(pending, data);
    return "approved";
  }

  async #completeEnrollment(pending, data) {
    const approverRaw = validateEnrollmentPublicKey(data.approver_public_key);
    if (typeof data.payload !== "string" || data.payload.length > ENROLLMENT_PAYLOAD_BYTES) {
      fail("invalid_enrollment");
    }
    let bundles;
    try {
      const payload = JSON.parse(data.payload);
      if (payload?.version !== 1 || !Array.isArray(payload.keys) || payload.keys.length > 16) {
        fail("invalid_enrollment");
      }
      bundles = { keys: payload.keys.map(validateKey), identity_key: validateKey(payload.identity_key) };
    } catch (error) {
      this.#enrollment = null;
      this.#notify();
      throw error instanceof SyncKeysError ? error : new SyncKeysError("invalid_enrollment");
    }
    try {
      await this.#run("enroll-finish", async (lease, version) => {
        const state = await this.#state(lease, version);
        const secret = await deriveTransferSecret(pending.privateKey, approverRaw, pending.id, pending.publicRaw, approverRaw);
        try {
          await this.#restore(lease, version, state, secret, bundles);
        } catch (error) {
          throw error?.code === "recovery_failed" ? new SyncKeysError("enrollment_failed") : error;
        } finally {
          secret.fill(0);
        }
      });
    } catch (error) {
      if (this.#enrollment === pending) {
        this.#enrollment = null;
        this.#notify();
      }
      throw error;
    }
    this.#enrollment = null;
    this.#deleteEnrollment(pending.id);
  }

  #deleteEnrollment(id) {
    this.#account.withSecrets(lease => lease.request(`api/v1/crypto/enrollments/${id}`, { method: "DELETE", maxBytes: 1024 }))
      .catch(() => {});
  }

  cancelEnrollment() {
    const pending = this.#enrollment;
    if (pending) {
      this.#enrollment = null;
      this.#deleteEnrollment(pending.id);
      this.#notify();
    }
  }

  async listEnrollments() {
    if (this.#status !== "ready") {
      return [];
    }
    const { data } = await this.#account.withSecrets(lease =>
      lease.request("api/v1/crypto/enrollments", { maxBytes: 32768 }));
    if (!Array.isArray(data?.enrollments) || data.enrollments.length > 16) {
      fail("invalid_enrollment");
    }
    const result = [];
    for (const entry of data.enrollments) {
      if (!UUID.test(entry?.id) || entry.id === this.#enrollment?.id) {
        continue;
      }
      try {
        const publicRaw = validateEnrollmentPublicKey(entry.public_key);
        result.push({ id: entry.id, deviceName: typeof entry.device_name === "string" ? entry.device_name.slice(0, 100) : "",
          code: await enrollmentCode(publicRaw), expiresAt: Date.parse(entry.expires_at) });
      } catch {}
    }
    return result;
  }

  async approveEnrollment(id, expectedCode, owner = null) {
    if (!UUID.test(id) || typeof expectedCode !== "string") {
      fail("invalid_enrollment");
    }
    return this.#run("enroll-approve", async (lease, version) => {
      if (this.#status !== "ready" || !this.#active) {
        fail("keys_locked");
      }
      const { candidate } = this.#active;
      const state = await this.#state(lease, version);
      const { data } = await lease.request("api/v1/crypto/enrollments", { maxBytes: 32768 });
      this.#assert(version);
      const entry = Array.isArray(data?.enrollments) ? data.enrollments.find(item => item.id === id) : null;
      if (!entry) {
        fail("enrollment_unavailable");
      }
      const requesterRaw = validateEnrollmentPublicKey(entry.public_key);
      if (await enrollmentCode(requesterRaw) !== expectedCode) {
        fail("enrollment_changed");
      }
      if (!state.identity_key || !candidate.identityHandle ||
          state.keys.some(key => !candidate.handles.has(key.key_id))) {
        fail("enrollment_unavailable");
      }
      const pair = await generateEnrollmentPair();
      this.#assert(version);
      const secret = await deriveTransferSecret(pair.privateKey, requesterRaw, id, requesterRaw, pair.publicRaw);
      try {
        const keys = [];
        for (const key of state.keys) {
          keys.push(validateKey({ key_id: key.key_id,
            encrypted_bundle: await candidate.crypto.wrapNativeKey(candidate.handles.get(key.key_id), secret) }));
          this.#assert(version);
        }
        const identity = validateKey({ key_id: state.identity_key.key_id,
          encrypted_bundle: await candidate.identityCrypto.wrapNativeKey(candidate.identityHandle, secret) });
        this.#assert(version);
        await lease.request(`api/v1/crypto/enrollments/${id}/approve`, { method: "POST", maxBytes: 1024,
          body: { approver_public_key: toBase64(pair.publicRaw), payload: JSON.stringify({ version: 1, keys, identity_key: identity }) } });
      } finally {
        secret.fill(0);
      }
    }, owner, false, true);
  }

  async resetEncryption({ onlyIfAlone = false } = {}, owner = null) {
    if (this.#status !== "recovery-required") {
      fail("reset_unavailable");
    }
    this.cancelEnrollment();
    return this.#run("reset", async (lease, version) => {
      if (lease.readLocalKeys()) {
        fail("local_keys_exist");
      }
      if (onlyIfAlone) {
        const { data: devices } = await lease.request("api/v1/devices", { maxBytes: 65536 });
        this.#assert(version);
        if (!Array.isArray(devices?.devices) || devices.devices.some(device => device.id !== lease.deviceId)) {
          fail("other_devices_exist");
        }
      }
      const state = await this.#state(lease, version);
      await lease.request("api/v1/crypto/reset", { method: "POST", maxBytes: 32768,
        body: { crypto: { epoch: state.epoch, revision: state.revision }, confirm: true } });
      this.#assert(version);
      this.#status = "locked";
    }, owner);
  }

  async denyEnrollment(id) {
    if (!UUID.test(id)) {
      fail("invalid_enrollment");
    }
    await this.#account.withSecrets(lease =>
      lease.request(`api/v1/crypto/enrollments/${id}/deny`, { method: "POST", maxBytes: 1024 }));
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
        (pending.registry_auth_version ?? 1) === state.registry_auth_version &&
        pending.registry_auth === state.registry_auth));
  }

  #rotationPublished(pending, state) {
    return state.rotation?.operation_id === pending.operation_id && state.active_key_id === pending.key_id &&
      state.keys.length === pending.keys.length &&
      state.registry_auth_version >= (pending.registry_auth_version ?? 1) &&
      JSON.stringify(pending.identity_key) === JSON.stringify(state.identity_key) &&
      (state.rotation.phase === "complete" || pending.registry_auth === state.registry_auth) &&
      pending.keys.every(key => this.#published(key, state));
  }

  #checkContinuity(local, state) {
    if (local.epoch !== state.epoch || Number(local.revision) > Number(state.revision) ||
        local.registry_auth_version > state.registry_auth_version ||
        (["client", "transition"].includes(local.custody) && state.custody === "server") ||
        (local.custody === "client" && state.custody === "transition" &&
          state.active_key_id === local.active_key_id && local.rotation?.operation_id !== state.rotation?.operation_id) ||
        (local.active_key_id && state.active_key_id !== local.active_key_id &&
          local.keys.some(key => key.key_id === state.active_key_id) && state.active_key_id !== local.rotation?.key_id) ||
        (!local.pending && (!state.identity_key || !["client", "transition"].includes(state.custody)) && local.keys.some(saved => !state.keys.some(key => key.key_id === saved.key_id) &&
          saved.key_id !== local.rotation?.key_id)) ||
        (local.identity_key && state.identity_key && local.identity_key.key_id !== state.identity_key.key_id) ||
        (local.identity_key && !local.pending && !local.rotation && !state.identity_key)) {
      fail("crypto_state_conflict");
    }
  }

  #requireRegistrySupport() {
    if (this.#account.snapshot.registryAuthVersion !== 2) {
      fail("registry_auth_unsupported");
    }
  }

  #requireActive() {
    if (this.#closed) {
      fail("cancelled");
    }
    if (this.#operation) {
      fail("busy");
    }
    const accountStatus = this.#account.snapshot.status;
    if (!["connected", "renewal-required", "local"].includes(accountStatus)) {
      this.#dropMemory();
      this.#status = "locked";
      this.#notify();
      fail("auth_required");
    }
    if (!this.#active || this.#status !== "ready") {
      fail("keys_locked");
    }
    if ((accountStatus === "local") !== this.#active.localOnly) {
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
    const crypto = createLocalKeyPool(this.#cryptoFactory);
    try {
      const candidate = { crypto, identityCrypto: this.#cryptoFactory(), identityHandle: null, handles: new Map() };
      this.#instances.add(candidate);
      return candidate;
    } catch (error) {
      crypto.close();
      throw error;
    }
  }

  #install(candidate, state, local, localOnly = false) {
    this.#discardActive();
    this.#active = { candidate, state, localOnly, localBackup: local?.backup?.key_id === state.active_key_id };
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
    this.#enrollment = null;
  }

  #assert(version) {
    if (this.#closed || version !== this.#version) {
      fail("cancelled");
    }
  }

  async #run(operation, work, owner = null, localOnly = false, keepActive = false) {
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
        if (!keepActive) {
          this.#error = error.code ?? "keys_failed";
          this.#discardActive();
        }
      }
      throw new SyncKeysError(error.code ?? "keys_failed", { status: error.status, retryAfter: error.retryAfter });
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
