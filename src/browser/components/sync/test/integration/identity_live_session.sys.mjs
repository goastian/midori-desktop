/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

import { MidoriSyncAccount } from "resource://midori-sync-test/MidoriSyncAccount.sys.mjs";
import { MidoriSyncConnection } from "resource://midori-sync-test/MidoriSyncConnection.sys.mjs";
import { MidoriSyncVault } from "resource://midori-sync-test/MidoriSyncVault.sys.mjs";
import { createSyncVaultFileStore, authorizeSyncSecretStore } from "resource://midori-sync-test/MidoriSyncSecretStore.sys.mjs";
import { createNativeSyncKeys } from "resource://midori-sync-test/MidoriSyncNativeKeys.sys.mjs";
import { MidoriSyncTransport } from "resource://midori-sync-test/MidoriSyncTransport.sys.mjs";
import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

class LiveIdentityTransport extends MidoriSyncTransport {
  async request(path, options) {
    for (let attempt = 0; ; ++attempt) {
      try {
        return await super.request(path, options);
      } catch (error) {
        if (error.code !== "rate_limited" || attempt >= 4 || error.retryAfter > 60) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, Math.max(1, error.retryAfter) * 1000));
      }
    }
  }
}

export async function openLiveIdentitySession({ side, stage, family, state, fixturePath, createId }) {
  const fixture = await IOUtils.readJSON(fixturePath);
  if (fixture.version !== 1 || fixture.kind !== "h1-live" ||
      !["http://127.0.0.1:8000/", "http://localhost:8000/"].includes(fixture.baseURL) ||
      !fixture.subject?.startsWith("synthetic-h1:") || !Services.env.get("MIDORI_SYNC_TEST_KEYRING_ROOT")) {
    throw new Error("live_identity_requires_isolated_local_fixture");
  }
  state.subject ??= fixture.subject;
  if (state.subject !== fixture.subject) {
    throw new Error("live_identity_account_changed");
  }
  state.profiles ??= {};
  if (stage === "seed") {
    state.profiles[side] = { id: createId() };
  }
  const profile = state.profiles[side];
  const connection = new MidoriSyncConnection({ baseURL: fixture.baseURL, allowLocalHTTP: true,
    saveServer: () => {}, transportFactory: (url, options) => new LiveIdentityTransport(url, options) });
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  if (!keyStore.isOSBacked) {
    connection.close();
    throw new Error("live_identity_requires_private_secret_service");
  }
  const tokenFactory = () => Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
  const vault = new MidoriSyncVault({ profileId: profile.id, keyStore, createId,
    store: createSyncVaultFileStore(PathUtils.join(PathUtils.profileDir, "identity-vault")),
    authorize: options => authorizeSyncSecretStore(keyStore, tokenFactory, options) });
  const account = new MidoriSyncAccount({ connection, vaultFactory: () => vault,
    transportFactory: (url, options) => new LiveIdentityTransport(url, options) });
  const keys = createNativeSyncKeys(account);
  const close = () => { keys.close(); account.close(); connection.close(); };
  try {
    if (stage === "seed") {
      await account.pair(fixture.profiles[side].pairing_token, `Synthetic identity convergence ${side}`);
    } else {
      await account.initialize();
      if (account.snapshot.status === "locked") {
        await account.unlock({ interactive: false });
      }
    }
    if (account.snapshot.status !== "connected" || account.snapshot.collectionSupport?.[family] !== true) {
      throw new Error("live_identity_collection_not_available");
    }
    await keys.refresh();
    if (stage === "seed" && side === "A") {
      if (keys.snapshot.status !== "empty") {
        throw new Error("live_identity_requires_fresh_synthetic_account");
      }
      state.recoveryCode = await keys.prepareCreation();
      await keys.confirmCreation({ recoveryCodeSaved: true });
      await keys.refresh();
    } else if (stage === "seed" && side === "B") {
      await keys.recover(state.recoveryCode);
    }
    if (keys.snapshot.status !== "ready" || keys.snapshot.custody !== "client") {
      throw new Error("live_identity_keys_not_ready");
    }
    profile.deviceId ??= account.snapshot.device.id;
    if (profile.deviceId !== account.snapshot.device.id) {
      throw new Error("live_identity_device_changed_on_restart");
    }
    state.devices[side] = profile.deviceId;
    const request = async (path, options) => {
      const response = await account.withSecrets(lease => lease.request(path, options));
      if (path.endsWith("/changes")) {
        for (const { record } of response.data.changes) {
          const previous = state.records[record.id];
          if (!previous || BigInt(previous.revision) <= BigInt(record.revision)) {
            state.records[record.id] = { id: record.id, deleted: record.deleted, revision: record.revision };
          }
        }
      } else if (path.endsWith("/operations")) {
        for (const result of response.data.results) {
          if (result.status === "applied") {
            const operation = options.body.operations[result.index];
            state.records[operation.id] = { id: operation.id, deleted: operation.deleted, revision: result.revision };
          }
        }
      }
      return response;
    };
    return { keys, request, close };
  } catch (error) {
    close();
    throw error;
  }
}
