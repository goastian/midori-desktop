/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MidoriSyncVault, SyncVaultError, MAX_VAULT_FILE_BYTES } from "./MidoriSyncVault.sys.mjs";

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
    if (await store.read() !== null) {
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
