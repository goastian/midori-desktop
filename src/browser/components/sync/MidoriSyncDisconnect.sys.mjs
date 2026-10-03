/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncStoreError, SYNC_STORE_UUID } from "./MidoriSyncLocalCodec.sys.mjs";
import { recoverLocalSyncKeys } from "./MidoriSyncKeys.sys.mjs";
import { validateSyncCollectionState } from "./MidoriSyncCollection.sys.mjs";
import { validSyncRecordId, validateRemoteRecord } from "./MidoriSyncProtocol.sys.mjs";
import { syncJournalEntryId } from "./MidoriSyncIndex.sys.mjs";

const SYNC_COLLECTIONS = new Set(["bookmarks", "history", "passwords", "credit-cards", "tabs", "browser-settings"]);

export async function assertSyncStoreSettled({
  identity, localKeys, scope, deviceId, directory, openStore, entryId = syncJournalEntryId,
  cryptoFactory = () => Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto),
}) {
  if (identity === null) {
    return;
  }
  if (identity?.version !== 1 || !SYNC_STORE_UUID.test(identity.store_id) || identity.device_id !== deviceId ||
      identity.initialized !== true || Object.keys(identity).sort().join(",") !== "device_id,initialized,store_id,version") {
    throw new SyncStoreError("sync_disconnect_unavailable");
  }
  let keys;
  let store;
  try {
    keys = await recoverLocalSyncKeys({ scope, value: localKeys, cryptoFactory });
    store = await openStore({ directory, storeId: identity.store_id, deviceId, keys, create: false });
    const collections = new Set();
    const states = new Set();
    let after = null;
    while (true) {
      const entries = await store.scan({ after, limit: 25 });
      if (!entries.length) {
        break;
      }
      for (const entry of entries) {
        if (!SYNC_COLLECTIONS.has(entry.collection)) {
          throw new SyncStoreError("sync_disconnect_unavailable");
        }
        collections.add(entry.collection);
        if (["outbox", "inbox", "application", "conflict"].includes(entry.kind)) {
          throw new SyncStoreError("sync_pending_operations");
        }
        if (entry.kind === "metadata") {
          if (entry.id !== await entryId(entry.collection, "metadata", "collection-state-v1")) {
            throw new SyncStoreError("sync_disconnect_unavailable");
          }
          const state = validateSyncCollectionState(entry.value);
          if (state.pending || state.conflicts || state.deferred || state.inbox || state.activeApplication || state.ack || state.fence) {
            throw new SyncStoreError("sync_pending_operations");
          }
          states.add(entry.collection);
        } else if (entry.kind === "record") {
          const value = entry.value;
          if (value?.version !== 1 || !validSyncRecordId(value.id) ||
              entry.id !== await entryId(entry.collection, "record", value.id) || typeof value.blocked !== "boolean" ||
              (value.pending !== null && !SYNC_STORE_UUID.test(value.pending)) ||
              (value.applying != null && !SYNC_STORE_UUID.test(value.applying))) {
            throw new SyncStoreError("sync_disconnect_unavailable");
          }
          if (value.pending || value.blocked || value.applying) {
            throw new SyncStoreError("sync_pending_operations");
          }
          validateRemoteRecord(value.remote);
          if (value.remote.id !== value.id) {
            throw new SyncStoreError("sync_disconnect_unavailable");
          }
        } else {
          throw new SyncStoreError("sync_disconnect_unavailable");
        }
      }
      after = entries.at(-1).id;
    }
    if ([...collections].some(collection => !states.has(collection))) {
      throw new SyncStoreError("sync_disconnect_unavailable");
    }
  } catch (error) {
    throw new SyncStoreError(error.code === "sync_pending_operations" ? error.code : "sync_disconnect_unavailable");
  } finally {
    keys?.close();
    await store?.close();
  }
}
