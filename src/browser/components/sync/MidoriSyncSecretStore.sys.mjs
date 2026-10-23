/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MidoriSyncVault, SyncVaultError, MAX_VAULT_FILE_BYTES } from "./MidoriSyncVault.sys.mjs";
import { MidoriSyncSavedCustody } from "./MidoriSyncSavedCustody.sys.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function authorizeSyncSecretStore(keyStore, tokenFactory, { interactive = true } = {}) {
  if (typeof keyStore.isOSBacked !== "boolean") {
    throw new SyncVaultError("vault_unavailable");
  }
  if (keyStore.isOSBacked) {
    return;
  }
  const token = tokenFactory();
  if (!token.hasPassword) {
    throw new SyncVaultError("primary_password_required");
  }
  if (!token.isLoggedIn) {
    if (!interactive) {
      throw new SyncVaultError("vault_locked");
    }
    try {
      await token.login();
    } catch {
      throw new SyncVaultError("vault_locked");
    }
  }
  if (!token.hasPassword || !token.isLoggedIn) {
    throw new SyncVaultError("vault_locked");
  }
}

export function createSyncVaultFileStore(directory) {
  const path = PathUtils.join(directory, "account.json");
  return {
    async read() {
      let bytes;
      try {
        bytes = await IOUtils.read(path, { maxBytes: MAX_VAULT_FILE_BYTES + 1 });
      } catch (error) {
        if (error.name === "NotFoundError") {
          return null;
        }
        throw error;
      }
      if (bytes.length > MAX_VAULT_FILE_BYTES) {
        throw new SyncVaultError("vault_corrupt");
      }
      try {
        return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      } catch {
        throw new SyncVaultError("vault_corrupt");
      }
    },
    async write(record) {
      await IOUtils.makeDirectory(directory, { ignoreExisting: true, permissions: 0o700 });
      await IOUtils.setPermissions(directory, 0o700);
      await IOUtils.writeJSON(path, record, { tmpPath: `${path}.tmp`, flush: true });
      await IOUtils.setPermissions(path, 0o600);
    },
    async remove() {
      await IOUtils.remove(path, { ignoreAbsent: true });
      await IOUtils.remove(`${path}.tmp`, { ignoreAbsent: true });
    },
  };
}

export async function createProfileSyncVault() {
  const directory = PathUtils.join(PathUtils.profileDir, "midori-sync");
  const identityPath = PathUtils.join(directory, "profile-id");
  const createId = () => Services.uuid.generateUUID().toString().slice(1, -1);
  const store = createSyncVaultFileStore(directory);
  let profileId;
  try {
    const bytes = await IOUtils.read(identityPath, { maxBytes: 37 });
    profileId = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error.name !== "NotFoundError") {
      throw new SyncVaultError("vault_corrupt");
    }
    const savedKeys = PathUtils.join(directory, "saved-keys");
    if (await store.read() !== null ||
        (await IOUtils.exists(savedKeys)) && (await IOUtils.getChildren(savedKeys)).length) {
      throw new SyncVaultError("vault_corrupt");
    }
    profileId = createId();
    await IOUtils.makeDirectory(directory, { ignoreExisting: true, permissions: 0o700 });
    await IOUtils.writeUTF8(identityPath, profileId, { tmpPath: `${identityPath}.tmp`, flush: true });
    await IOUtils.setPermissions(identityPath, 0o600);
  }
  if (!UUID.test(profileId)) {
    throw new SyncVaultError("vault_corrupt");
  }
  return profileVault(store, profileId, createId);
}

function profileVault(store, profileId, createId = () => Services.uuid.generateUUID().toString().slice(1, -1)) {
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  return new MidoriSyncVault({
    store,
    keyStore,
    profileId,
    createId,
    authorize: options => authorizeSyncSecretStore(keyStore, () =>
      Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token), options),
  });
}

export function createProfileSyncSavedCustody() {
  const root = PathUtils.join(PathUtils.profileDir, "midori-sync");
  const pathFor = async (storeId, archiveId = null) => {
    if (!UUID.test(storeId) || (archiveId !== null && !UUID.test(archiveId))) {
      throw new SyncVaultError("saved_custody_invalid");
    }
    let directory = root;
    for (const part of ["saved-keys", storeId, ...(archiveId === null ? [] : [archiveId])]) {
      directory = PathUtils.join(directory, part);
      if (await IOUtils.exists(directory)) {
        const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        file.initWithPath(directory);
        if (file.isSymlink() || !file.isDirectory()) {
          throw new SyncVaultError("saved_custody_invalid");
        }
      }
    }
    return directory;
  };
  return new MidoriSyncSavedCustody({
    async vaultFactory(storeId, archiveId) {
      const directory = await pathFor(storeId, archiveId);
      const bytes = await IOUtils.read(PathUtils.join(root, "profile-id"), { maxBytes: 37 });
      const profileId = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (!UUID.test(profileId)) { throw new SyncVaultError("vault_corrupt"); }
      const store = createSyncVaultFileStore(directory);
      const check = async () => {
        await pathFor(storeId, archiveId);
        for (const name of ["account.json", "account.json.tmp"]) {
          const path = PathUtils.join(directory, name);
          if (!(await IOUtils.exists(path))) { continue; }
          const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
          file.initWithPath(path);
          if (file.isSymlink() || !file.isFile()) { throw new SyncVaultError("saved_custody_invalid"); }
        }
      };
      return profileVault({
        async read() { await check(); return store.read(); },
        async write(record) { await check(); return store.write(record); },
      }, profileId);
    },
    async list(storeId, { after, limit }) {
      if ((after !== null && !UUID.test(after)) || !Number.isInteger(limit) || limit < 1 || limit > 25) {
        throw new SyncVaultError("saved_custody_invalid");
      }
      const directory = await pathFor(storeId);
      if (!(await IOUtils.exists(directory))) { return []; }
      const ids = (await IOUtils.getChildren(directory)).map(path => PathUtils.filename(path))
        .filter(id => UUID.test(id) && (after === null || id > after)).sort();
      return ids.slice(0, limit);
    },
  });
}
