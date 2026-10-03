/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_SECRET_BYTES = 65536;
export const MAX_VAULT_FILE_BYTES = 131072;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export class SyncVaultError extends Error {
  constructor(code) {
    super(code);
    this.name = "SyncVaultError";
    this.code = code;
  }
}

function validateScope(scope) {
  try {
    if (typeof scope !== "string" || scope.length > 8192) {
      throw new Error();
    }
    const fields = JSON.parse(scope);
    if (!Array.isArray(fields) || fields.length !== 3 || fields.some((value, index) =>
      typeof value !== "string" || !value || /\p{Cc}/u.test(value) ||
      encoder.encode(value).length > [2048, 2048, 255][index])) {
      throw new Error();
    }
  } catch {
    throw new SyncVaultError("invalid_account_scope");
  }
}

export class MidoriSyncVault {
  #store;
  #keyStore;
  #authorize;
  #profileId;
  #createId;
  #queue = Promise.resolve();
  #pending = 0;
  #closed = false;

  constructor({ store, keyStore, authorize, profileId, createId }) {
    if (!UUID.test(profileId)) {
      throw new SyncVaultError("vault_corrupt");
    }
    this.#store = store;
    this.#keyStore = keyStore;
    this.#authorize = authorize;
    this.#profileId = profileId;
    this.#createId = createId;
  }

  inspect() {
    return this.#enqueue(async () => ({ present: (await this.#record()) !== null }));
  }

  unlock() {
    return this.#enqueue(() => this.#authorize());
  }

  load(expectedScope = null, { interactive = true } = {}) {
    if (expectedScope !== null) {
      validateScope(expectedScope);
    }
    return this.#enqueue(async () => {
      const record = await this.#record();
      if (!record) {
        return null;
      }
      await this.#authorizeAccess(interactive);
      this.#ensureOpen();
      const value = await this.#decrypt(record, interactive);
      if (expectedScope !== null && expectedScope !== value.scope) {
        throw new SyncVaultError("account_scope_mismatch");
      }
      return value;
    });
  }

  save(scope, data, { interactive = true } = {}) {
    validateScope(scope);
    this.#ensureOpen();
    if (this.#pending >= 4) {
      throw new SyncVaultError("busy");
    }
    let bytes;
    try {
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new Error();
      }
      bytes = encoder.encode(JSON.stringify({ version: 1, profile: this.#profileId, scope, data }));
      if (bytes.length > MAX_SECRET_BYTES) {
        throw new Error();
      }
    } catch {
      bytes?.fill(0);
      throw new SyncVaultError("invalid_secret_data");
    }
    return this.#enqueue(async () => {
      await this.#authorizeAccess(interactive);
      this.#ensureOpen();
      const existing = await this.#record();
      let label = existing?.label;
      let generated = false;
      let writeAttempted = false;
      try {
        if (existing) {
          const previous = await this.#decrypt(existing, interactive);
          if (previous.scope !== scope) {
            throw new SyncVaultError("account_scope_mismatch");
          }
        } else {
          if (!interactive) {
            throw new SyncVaultError("vault_locked");
          }
          const id = this.#createId();
          if (!UUID.test(id)) {
            throw new SyncVaultError("vault_unavailable");
          }
          label = `Midori Sync ${this.#profileId} ${id}`;
          if (await this.#keyStore.asyncSecretAvailable(label)) {
            throw new SyncVaultError("vault_unavailable");
          }
          this.#ensureOpen();
          await this.#keyStore.asyncGenerateSecret(label);
          generated = true;
        }
        this.#ensureOpen();
        const ciphertext = await this.#keyStore.asyncEncryptBytes(label, bytes, !interactive);
        this.#ensureOpen();
        const record = { version: 1, label, ciphertext };
        this.#validateRecord(record);
        writeAttempted = true;
        await this.#store.write(record);
      } catch (error) {
        if (generated && !writeAttempted) {
          try {
            await this.#keyStore.asyncDeleteSecret(label);
          } catch {}
        }
        throw error;
      }
    }, () => bytes.fill(0));
  }

  clear() {
    return this.#enqueue(async () => {
      let record;
      try {
        record = await this.#record();
      } catch (error) {
        if (!(error instanceof SyncVaultError) || error.code !== "vault_corrupt") {
          throw error;
        }
      }
      this.#ensureOpen();
      await this.#store.remove();
      if (!record) {
        return { keyDeleted: record === null };
      }
      try {
        await this.#authorize();
        await this.#keyStore.asyncDeleteSecret(record.label);
        return { keyDeleted: true };
      } catch {
        return { keyDeleted: false };
      }
    });
  }

  close() {
    this.#closed = true;
  }

  #validateRecord(record) {
    const prefix = `Midori Sync ${this.#profileId} `;
    if (record?.version !== 1 || typeof record.label !== "string" ||
        !record.label.startsWith(prefix) || !UUID.test(record.label.slice(prefix.length)) ||
        typeof record.ciphertext !== "string" || !record.ciphertext ||
        record.ciphertext.length > 90000 || !/^[a-zA-Z0-9+/]+={0,2}$/.test(record.ciphertext) ||
        Object.keys(record).sort().join(",") !== "ciphertext,label,version") {
      throw new SyncVaultError("vault_corrupt");
    }
    return record;
  }

  async #record() {
    const record = await this.#store.read();
    this.#ensureOpen();
    return record === null ? null : this.#validateRecord(record);
  }

  async #authorizeAccess(interactive) {
    if (typeof interactive !== "boolean") {
      throw new SyncVaultError("invalid_vault_access");
    }
    if (!interactive && this.#keyStore.supportsNonInteractiveAccess !== true) {
      throw new SyncVaultError("vault_unavailable");
    }
    await this.#authorize({ interactive });
  }

  async #decrypt(record, interactive) {
    if (!(await this.#keyStore.asyncSecretAvailable(record.label, !interactive))) {
      throw new SyncVaultError("local_secret_missing");
    }
    this.#ensureOpen();
    let raw;
    let bytes;
    try {
      raw = await this.#keyStore.asyncDecryptBytes(record.label, record.ciphertext, !interactive);
      this.#ensureOpen();
      if ((!Array.isArray(raw) && !(raw instanceof Uint8Array)) || raw.length > MAX_SECRET_BYTES) {
        throw new SyncVaultError("vault_corrupt");
      }
      bytes = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
      const value = JSON.parse(decoder.decode(bytes));
      if (value?.version !== 1 || value.profile !== this.#profileId ||
          !value.data || typeof value.data !== "object" || Array.isArray(value.data) ||
          Object.keys(value).sort().join(",") !== "data,profile,scope,version") {
        throw new SyncVaultError("vault_corrupt");
      }
      validateScope(value.scope);
      return { scope: value.scope, data: value.data };
    } catch (error) {
      if (error instanceof SyncVaultError) {
        throw error;
      }
      if (error.result === 0x80004004) {
        throw new SyncVaultError("vault_locked");
      }
      throw new SyncVaultError("vault_unreadable");
    } finally {
      bytes?.fill(0);
      raw?.fill?.(0);
    }
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncVaultError("cancelled");
    }
  }

  #enqueue(work, cleanup = () => {}) {
    try {
      this.#ensureOpen();
      if (this.#pending >= 4) {
        throw new SyncVaultError("busy");
      }
    } catch (error) {
      cleanup();
      throw error;
    }
    ++this.#pending;
    const result = this.#queue.then(async () => {
      this.#ensureOpen();
      const value = await work();
      this.#ensureOpen();
      return value;
    }).catch(error => {
      throw error instanceof SyncVaultError ? error : new SyncVaultError(error.result === 0x80004004 ? "vault_locked" : "vault_unavailable");
    }).finally(() => {
      --this.#pending;
      cleanup();
    });
    this.#queue = result.catch(() => {});
    return result;
  }
}
