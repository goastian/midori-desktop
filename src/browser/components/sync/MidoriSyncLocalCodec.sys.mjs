/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const MAX_LOCAL_VALUE_BYTES = 4 * 1024 * 1024;
export const MAX_LOCAL_CIPHERTEXT_BYTES = 6 * 1024 * 1024;
export const SYNC_STORE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CHUNK_BYTES = 128 * 1024;
const COLLECTIONS = new Set(["bookmarks", "history", "passwords", "credit-cards", "tabs", "browser-settings", "midori-privacy", "devices", "midori-tab"]);
const KINDS = new Set(["metadata", "outbox", "inbox", "record", "conflict", "application"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export class SyncStoreError extends Error {
  constructor(code) {
    super(code);
    this.name = "SyncStoreError";
    this.code = code;
  }
}

export function validateSyncStoreEntry({ id, collection, kind, revision }) {
  if (!SYNC_STORE_UUID.test(id) || !COLLECTIONS.has(collection) || !KINDS.has(kind) ||
      !Number.isInteger(revision) || revision < 1 || revision > 2147483647) {
    throw new SyncStoreError("invalid_store_entry");
  }
}

export class MidoriSyncLocalCodec {
  #keys;
  #storeId;
  #deviceId;
  #createId;

  constructor({ keys, storeId, deviceId, createId }) {
    if (!SYNC_STORE_UUID.test(storeId) || !SYNC_STORE_UUID.test(deviceId)) {
      throw new SyncStoreError("invalid_store_identity");
    }
    this.#keys = keys;
    this.#storeId = storeId;
    this.#deviceId = deviceId;
    this.#createId = createId;
  }

  async encode(entry, bytes) {
    validateSyncStoreEntry(entry);
    if (!ArrayBuffer.isView(bytes) || Object.prototype.toString.call(bytes) !== "[object Uint8Array]" ||
        !bytes.length || bytes.length > MAX_LOCAL_VALUE_BYTES) {
      throw new SyncStoreError("store_value_too_large");
    }
    const generation = this.#createId();
    if (!SYNC_STORE_UUID.test(generation)) {
      throw new SyncStoreError("invalid_store_identity");
    }
    const count = Math.ceil(bytes.length / CHUNK_BYTES);
    const manifest = encoder.encode(JSON.stringify({
      version: 1, device: this.#deviceId, kind: entry.kind, revision: entry.revision,
      bytes: bytes.length, chunks: count,
    }));
    const chunks = [];
    try {
      chunks.push(await this.#keys.sealLocal(this.#context(entry, generation, 0), manifest));
      for (let index = 0; index < count; index++) {
        chunks.push(await this.#keys.sealLocal(this.#context(entry, generation, index + 1), bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES)));
      }
    } finally {
      manifest.fill(0);
    }
    const value = JSON.stringify({ version: 1, generation, chunks });
    if (encoder.encode(value).length > MAX_LOCAL_CIPHERTEXT_BYTES) {
      throw new SyncStoreError("store_value_too_large");
    }
    return value;
  }

  async decode(entry, value) {
    validateSyncStoreEntry(entry);
    if (typeof value !== "string" || value.length > MAX_LOCAL_CIPHERTEXT_BYTES) {
      throw new SyncStoreError("store_corrupt");
    }
    let encoded;
    try {
      encoded = JSON.parse(value);
    } catch {
      throw new SyncStoreError("store_corrupt");
    }
    if (encoded?.version !== 1 || !SYNC_STORE_UUID.test(encoded.generation) || !Array.isArray(encoded.chunks) ||
        encoded.chunks.length < 2 || encoded.chunks.length > 33 ||
        encoded.chunks.some(chunk => typeof chunk !== "string" || chunk.length > 262144)) {
      throw new SyncStoreError("store_corrupt");
    }
    const manifestBytes = await this.#open(entry, encoded, 0);
    let manifest;
    try {
      if (manifestBytes.length > 1024) {
        throw new SyncStoreError("store_corrupt");
      }
      manifest = JSON.parse(decoder.decode(manifestBytes));
    } finally {
      manifestBytes.fill(0);
    }
    if (manifest?.version !== 1 || manifest.device !== this.#deviceId || manifest.kind !== entry.kind ||
        manifest.revision !== entry.revision || !Number.isInteger(manifest.bytes) ||
        manifest.bytes < 1 || manifest.bytes > MAX_LOCAL_VALUE_BYTES ||
        manifest.chunks !== Math.ceil(manifest.bytes / CHUNK_BYTES) || encoded.chunks.length !== manifest.chunks + 1) {
      throw new SyncStoreError("store_corrupt");
    }
    const bytes = new Uint8Array(manifest.bytes);
    try {
      for (let index = 0; index < manifest.chunks; index++) {
        const chunk = await this.#open(entry, encoded, index + 1);
        try {
          if (chunk.length !== Math.min(CHUNK_BYTES, manifest.bytes - index * CHUNK_BYTES)) {
            throw new SyncStoreError("store_corrupt");
          }
          bytes.set(chunk, index * CHUNK_BYTES);
        } finally {
          chunk.fill(0);
        }
      }
      return JSON.parse(decoder.decode(bytes));
    } finally {
      bytes.fill(0);
    }
  }

  #context(entry, generation, index) {
    return {
      collection: entry.collection, id: `${this.#storeId}/${entry.id}/${index}`, generation,
      schema_version: 1, base_revision: String(entry.revision),
    };
  }

  #open(entry, encoded, index) {
    const { collection, id, generation } = this.#context(entry, encoded.generation, index);
    return this.#keys.openLocal({ collection, id, generation }, encoded.chunks[index]);
  }
}
