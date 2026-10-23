/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SYNC_STORE_UUID, SyncStoreError } from "./MidoriSyncLocalCodec.sys.mjs";
import { localSyncKeyIds, readOnlyLocalSyncCustody, recoverLocalSyncKeys } from "./MidoriSyncKeys.sys.mjs";
import { syncJournalEntryId } from "./MidoriSyncIndex.sys.mjs";

const FINGERPRINT = /^[0-9a-f]{64}$/;

function validateCopy(id, fingerprint) {
  if (!SYNC_STORE_UUID.test(id) || !FINGERPRINT.test(fingerprint)) {
    throw new SyncStoreError("store_changed");
  }
}

function validateArchive(value, id, fingerprint) {
  if (value?.version !== 1 || value.store_id !== id || value.fingerprint !== fingerprint ||
      !SYNC_STORE_UUID.test(value.device_id) ||
      Object.keys(value).sort().join(",") !== "crypto,device_id,fingerprint,store_id,version" ||
      Object.keys(value.crypto ?? {}).sort().join(",") !== "epoch,keys,pending,revision,secret,version" ||
      JSON.stringify(value.crypto) !== JSON.stringify(readOnlyLocalSyncCustody(value.crypto))) {
    throw new SyncStoreError("saved_custody_invalid");
  }
  return value;
}

export class MidoriSyncSavedCustody {
  #vaultFactory;
  #list;
  #entryId;
  #cryptoFactory;

  constructor({ vaultFactory, list, entryId = syncJournalEntryId,
    cryptoFactory = () => Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto) }) {
    this.#vaultFactory = vaultFactory;
    this.#list = list;
    this.#entryId = entryId;
    this.#cryptoFactory = cryptoFactory;
  }

  async save({ id, fingerprint, scope, deviceId, localKeys, assertCurrent = () => {} }) {
    validateCopy(id, fingerprint);
    if (!SYNC_STORE_UUID.test(deviceId)) {
      throw new SyncStoreError("saved_custody_invalid");
    }
    const data = { version: 1, store_id: id, fingerprint, device_id: deviceId,
      crypto: readOnlyLocalSyncCustody(localKeys) };
    const archiveId = await this.#entryId("saved-custody-v1", id, JSON.stringify([scope, data]));
    const vault = await this.#vaultFactory(id, archiveId);
    let keys;
    try {
      assertCurrent();
      const existing = await vault.load(scope);
      if (existing && JSON.stringify(existing.data) !== JSON.stringify(data)) {
        throw new SyncStoreError("saved_custody_invalid");
      }
      if (!existing) {
        assertCurrent();
        await vault.save(scope, data);
      }
      assertCurrent();
      const saved = await vault.load(scope);
      if (!saved || JSON.stringify(saved.data) !== JSON.stringify(data)) {
        throw new SyncStoreError("saved_custody_invalid");
      }
      validateArchive(saved.data, id, fingerprint);
      keys = await recoverLocalSyncKeys({ scope, value: saved.data.crypto, cryptoFactory: this.#cryptoFactory });
      assertCurrent();
      return { archiveId };
    } finally {
      keys?.close();
      vault.close();
    }
  }

  async open({ id, fingerprint, scope = null, requiredKeyIds = [], interactive = false,
    assertCurrent = () => {}, accept = async () => true }) {
    validateCopy(id, fingerprint);
    if (!Array.isArray(requiredKeyIds) || requiredKeyIds.length > 32 ||
        requiredKeyIds.some(key => typeof key !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(key))) {
      throw new SyncStoreError("saved_custody_invalid");
    }
    let after = null;
    let inspected = 0;
    while (true) {
      assertCurrent();
      const page = await this.#list(id, { after, limit: 25 });
      if (!page.length) { return null; }
      for (const archiveId of page) {
        if (++inspected > 1000 || !SYNC_STORE_UUID.test(archiveId) || (after !== null && archiveId <= after)) {
          throw new SyncStoreError("saved_custody_invalid");
        }
        let vault;
        let keys;
        try {
          vault = await this.#vaultFactory(id, archiveId);
          const saved = await vault.load(scope, { interactive });
          assertCurrent();
          if (!saved) { continue; }
          const data = validateArchive(saved.data, id, fingerprint);
          const available = localSyncKeyIds(data.crypto);
          if (!requiredKeyIds.every(key => available.includes(key))) { continue; }
          keys = await recoverLocalSyncKeys({ scope: saved.scope, value: data.crypto, cryptoFactory: this.#cryptoFactory });
          assertCurrent();
          const opened = { keys, scope: saved.scope, deviceId: data.device_id };
          if (!(await accept(opened))) { continue; }
          assertCurrent();
          keys = null;
          return opened;
        } catch (error) {
          assertCurrent();
          if (["cancelled", "busy"].includes(error.code)) { throw error; }
        } finally {
          keys?.close();
          vault?.close();
        }
      }
      after = page.at(-1);
    }
  }
}
