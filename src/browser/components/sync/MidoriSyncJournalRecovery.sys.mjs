/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncStoreError, SYNC_STORE_UUID } from "./MidoriSyncLocalCodec.sys.mjs";
import { validateSyncCollectionState } from "./MidoriSyncCollection.sys.mjs";
import { validSyncCounter, validSyncRecordId } from "./MidoriSyncProtocol.sys.mjs";
import { syncJournalEntryId } from "./MidoriSyncIndex.sys.mjs";
import { validateSyncPasswordRetirementSnapshot } from "./MidoriSyncPasswordIdentity.sys.mjs";

const COLLECTIONS = new Set(["bookmarks", "history", "passwords", "credit-cards", "form-history", "addresses", "workspaces", "midori-privacy", "site-permissions", "extensions", "extension-settings", "tabs", "browser-settings"]);

async function summarize(store, entryId) {
  const collections = new Map();
  const rows = new Map();
  const mirrors = [];
  let after = null;
  while (true) {
    const page = await store.scan({ after, limit: 25 });
    if (!page.length) { break; }
    for (const row of page) {
      if (!COLLECTIONS.has(row.collection) || rows.has(row.id) || rows.size >= 10000) {
        throw new SyncStoreError("store_version_unsupported");
      }
      const current = collections.get(row.collection) ?? { name: row.collection, state: null,
        outbox: 0, conflict: 0, application: 0, inbox: 0, localChanges: 0 };
      collections.set(row.collection, current);
      rows.set(row.id, { kind: row.kind, collection: row.collection });
      if (row.kind === "metadata") {
        if (current.state || row.id !== await entryId(row.collection, "metadata", "collection-state-v1")) {
          throw new SyncStoreError("store_corrupt");
        }
        current.state = validateSyncCollectionState(row.value);
      } else if (row.kind === "record") {
        const value = row.value;
        if (![1, 2].includes(value?.version) || (value.version === 2) !== (value.retirementSnapshot !== undefined) ||
            (value.retirementSnapshot !== undefined && row.collection !== "passwords") || !validSyncRecordId(value.id) ||
            row.id !== await entryId(row.collection, "record", value.id) || typeof value.blocked !== "boolean") {
          throw new SyncStoreError("store_corrupt");
        }
        if (value.retirementSnapshot !== undefined) {
          validateSyncPasswordRetirementSnapshot(value.id, value.retirementSnapshot);
        }
        current.localChanges += value.localChange ? 1 : 0;
        mirrors.push({ collection: row.collection, pending: value.pending, applying: value.applying });
      } else if (["outbox", "conflict", "application", "inbox"].includes(row.kind)) {
        ++current[row.kind];
        if (row.kind === "outbox") {
          const value = row.value;
          if (value?.version !== 1 || !SYNC_STORE_UUID.test(value.generation) || !SYNC_STORE_UUID.test(value.epoch) ||
              value.operation?.operation_id !== row.id || !validSyncRecordId(value.operation.id) ||
              !validSyncCounter(value.operation.base_revision, 2147483647n) || typeof value.operation.deleted !== "boolean") {
            throw new SyncStoreError("store_version_unsupported");
          }
        }
      } else {
        throw new SyncStoreError("store_version_unsupported");
      }
    }
    after = page.at(-1).id;
  }
  for (const mirror of mirrors) {
    for (const [id, kind] of [[mirror.pending, "outbox"], [mirror.applying, "application"]]) {
      if (id != null && (rows.get(id)?.kind !== kind || rows.get(id).collection !== mirror.collection)) {
        throw new SyncStoreError("store_corrupt");
      }
    }
  }
  return [...collections.values()].map(current => {
    const state = current.state;
    if (!state || state.pending !== current.outbox || state.conflicts !== current.conflict ||
        state.deferred !== current.application || (state.localChanges ?? 0) !== current.localChanges ||
        current.inbox !== (state.inbox ? 1 : 0) ||
        (state.inbox && rows.get(state.inbox)?.kind !== "inbox") ||
        (state.activeApplication && rows.get(state.activeApplication)?.kind !== "application")) {
      throw new SyncStoreError("store_corrupt");
    }
    return { name: current.name, pending: current.outbox + current.localChanges, conflicts: current.conflict,
      unfinished: current.application + current.inbox + Number(!!(state.ack || state.pendingReset || state.pendingClear || state.resolution)) };
  });
}

export class MidoriSyncJournalRecovery {
  #files;
  #openStore;
  #entryId;
  #createId;
  #reviews = new Map();

  constructor({ files, openStore, entryId = syncJournalEntryId, createId }) {
    this.#files = files;
    this.#openStore = openStore;
    this.#entryId = entryId;
    this.#createId = createId;
  }

  clear() { this.#reviews.clear(); }

  async list(options) {
    const entries = await this.#files.list(options);
    return { entries, nextAfter: entries.at(-1)?.id ?? null };
  }

  async review({ id, activeId, deviceId, keys, allowRestore = true }) {
    this.#requireOrphan(id, activeId);
    const fingerprint = await this.#files.fingerprint(id);
    let opened;
    let collections = [];
    let originalDevice = null;
    let status = "locked";
    if (keys) {
      try {
        opened = await this.#openStore({ storeId: id, keys });
        originalDevice = opened.deviceId;
        collections = await summarize(opened.store, this.#entryId);
        status = !allowRestore ? "archived" : originalDevice === deviceId ? "recoverable" : "other-device";
      } catch (error) {
        if (error.code === "store_busy") { throw error; }
        status = error.code === "store_empty" ? "empty" : "unreadable";
      } finally {
        await opened?.store.close();
      }
    }
    if (fingerprint !== await this.#files.fingerprint(id)) {
      throw new SyncStoreError("store_changed");
    }
    const token = this.#createId();
    this.#reviews.set(token, { id, activeId, originalDevice, fingerprint, status });
    while (this.#reviews.size > 25) { this.#reviews.delete(this.#reviews.keys().next().value); }
    return { id, token, status, collections, canRestore: status === "recoverable" };
  }

  async restore({ id, token, activeId, deviceId, prepare, writeIdentity }) {
    const review = this.#review(id, token, activeId);
    if (review.status !== "recoverable" || review.originalDevice !== deviceId) {
      throw new SyncStoreError("store_recovery_unavailable");
    }
    await prepare();
    if (review.fingerprint !== await this.#files.fingerprint(id)) {
      throw new SyncStoreError("store_changed");
    }
    await writeIdentity({ version: 1, store_id: id, device_id: deviceId, initialized: true });
    this.clear();
  }

  async remove({ id, token, activeId, assertCurrent = () => {} }) {
    const review = this.#review(id, token, activeId);
    await this.#files.remove(id, review.fingerprint, assertCurrent);
    this.clear();
  }

  async protect({ id, token, activeId, save }) {
    const review = this.#review(id, token, activeId);
    if (review.fingerprint !== await this.#files.fingerprint(id)) {
      throw new SyncStoreError("store_changed");
    }
    await save(review.fingerprint);
    if (review.fingerprint !== await this.#files.fingerprint(id)) {
      throw new SyncStoreError("store_changed");
    }
    this.clear();
  }

  #requireOrphan(id, activeId) {
    if (!SYNC_STORE_UUID.test(id) || (activeId !== null && !SYNC_STORE_UUID.test(activeId))) {
      throw new SyncStoreError("invalid_store_identity");
    }
    if (id === activeId) { throw new SyncStoreError("store_in_use"); }
  }

  #review(id, token, activeId) {
    this.#requireOrphan(id, activeId);
    const review = this.#reviews.get(token);
    if (!SYNC_STORE_UUID.test(token) || review?.id !== id || review.activeId !== activeId) {
      throw new SyncStoreError("store_changed");
    }
    return review;
  }
}
