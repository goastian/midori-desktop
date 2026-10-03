/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MidoriSyncConnection } from "./MidoriSyncConnection.sys.mjs";
import { MidoriSyncAccount } from "./MidoriSyncAccount.sys.mjs";
import { MidoriSyncCollection } from "./MidoriSyncCollection.sys.mjs";
import { syncJournalEntryId } from "./MidoriSyncIndex.sys.mjs";
import { createNativeSyncKeys } from "./MidoriSyncNativeKeys.sys.mjs";
import { openSyncStore } from "./MidoriSyncStore.sys.mjs";
import { SYNC_STORE_UUID, SyncStoreError } from "./MidoriSyncLocalCodec.sys.mjs";
import { createProfileSyncVault } from "./MidoriSyncSecretStore.sys.mjs";
import { MidoriSyncTransport } from "./MidoriSyncTransport.sys.mjs";
import { MIDORI_SYNC_OFFICIAL_SERVER } from "./MidoriSyncServerConfig.sys.mjs";
import { validateTabsSnapshot } from "./MidoriSyncTabs.sys.mjs";
import { SYNC_PREFERENCE_SPECS } from "./MidoriSyncPreferences.sys.mjs";
import { MidoriSyncScheduler, canScheduleSync } from "./MidoriSyncScheduler.sys.mjs";
import { MidoriSyncHints } from "./MidoriSyncHints.sys.mjs";
import { MidoriSyncNotifications } from "./MidoriSyncNotifications.sys.mjs";

const SERVER_PREF = "midori.sync.serverConfig";
const SYNC_BACKGROUND_PREF = "midori.sync.background.enabled";
let connection = null;
let account = null;
let keys = null;
let journal = null;
let syncScheduler = null;
let syncSchedulerGeneration = null;
let syncHints = null;
let syncNotifications = null;
let syncNotificationsGeneration = null;
let backgroundSyncPromise = null;
let backgroundStarted = false;
let backgroundStartup = 0;
let backgroundResumePromise = null;
let backgroundResumeAgain = false;
let backgroundResumeTimer = null;
let backgroundResumeFailures = 0;
let manualSyncs = 0;
const collections = new Map();
const syncStatuses = new Map();
const syncStatusListeners = new Set();
const SYNC_COLLECTION_NAMES = ["bookmarks", "history", "passwords", "credit-cards", "tabs", "browser-settings"];
let stopped = false;
let sleeping = false;
let memoryPressure = false;
const SYNC_TOPICS = ["network:offline-status-changed", "sleep_notification", "wake_notification", "memory-pressure", "memory-pressure-stop"];

function notifySyncStatus() {
  for (const listener of syncStatusListeners) {
    try {
      listener();
    } catch {}
  }
}

async function waitForAccountIdle(owner, generation, signal = null) {
  if (owner.snapshot.generation !== generation) {
    throw new SyncStoreError("cancelled");
  }
  if (signal?.aborted) {
    throw new SyncStoreError("cancelled");
  }
  if (!owner.snapshot.busy) {
    return;
  }
  const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
  await new Promise((resolve, reject) => {
    let timer;
    let unsubscribe = () => {};
    let onAbort;
    let settled = false;
    const finish = error => {
      if (settled) {
        return;
      }
      settled = true;
      unsubscribe();
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      error ? reject(error) : resolve();
    };
    onAbort = () => finish(new SyncStoreError("cancelled"));
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => finish(new SyncStoreError("busy")), 10000);
    unsubscribe = owner.subscribe(snapshot => {
      if (snapshot.generation !== generation) {
        finish(new SyncStoreError("cancelled"));
      } else if (!snapshot.busy) {
        finish();
      }
    });
    if (settled) {
      unsubscribe();
    }
    if (!owner.snapshot.busy) {
      finish();
    } else if (signal?.aborted) {
      onAbort();
    }
  });
}

async function withLocalSecretsWhenIdle(owner, generation, work) {
  for (let attempt = 0; attempt < 3; ++attempt) {
    await waitForAccountIdle(owner, generation);
    try {
      return await owner.withLocalSecrets(work);
    } catch (error) {
      if (error.code !== "busy" || attempt === 2) {
        throw error;
      }
    }
  }
}

async function withAccountSecretsWhenIdle(owner, generation, work, options) {
  for (let attempt = 0; attempt < 3; ++attempt) {
    await waitForAccountIdle(owner, generation, options.signal);
    try {
      return await owner.withSecrets(work, options);
    } catch (error) {
      if (error.code !== "busy" || attempt === 2) {
        throw error;
      }
    }
  }
}

function attachSyncHints() {
  syncHints ??= new MidoriSyncHints({ onChange: () => syncScheduler?.hint() });
  syncHints.start();
}

function detachSyncHints() {
  syncHints?.close();
  syncHints = null;
}

function cancelBackgroundResumeTimer() {
  if (backgroundResumeTimer !== null) {
    const { clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
    clearTimeout(backgroundResumeTimer);
    backgroundResumeTimer = null;
  }
}

function resumeBackgroundAccount() {
  if (!backgroundStarted || stopped || sleeping || memoryPressure || Services.io.offline ||
      !Services.prefs.getBoolPref("midori.sync.enabled", false) ||
      !Services.prefs.getBoolPref(SYNC_BACKGROUND_PREF, false)) {
    return backgroundResumePromise;
  }
  if (backgroundResumePromise) {
    backgroundResumeAgain = true;
    return backgroundResumePromise;
  }
  cancelBackgroundResumeTimer();
  const startup = backgroundStartup;
  const owner = MidoriSyncService.account;
  const keyManager = MidoriSyncService.keys;
  let succeeded = false;
  backgroundResumePromise = (async () => {
    await owner.initialize();
    if (!backgroundStarted || startup !== backgroundStartup) {
      return;
    }
    if (owner.snapshot.status === "locked" &&
        !["vault_locked", "primary_password_required"].includes(owner.snapshot.error)) {
      await owner.unlock({ interactive: false });
    }
    if (backgroundStarted && startup === backgroundStartup &&
        owner.snapshot.status === "connected" &&
        !["ready", "empty", "recovery-required", "migration-required"].includes(keyManager.snapshot.status)) {
      await keyManager.refresh();
    }
    if (backgroundStarted && startup === backgroundStartup && owner.snapshot.status === "connected" &&
        Services.prefs.getBoolPref(SYNC_BACKGROUND_PREF, false)) {
      const { status, incompatibleSessions } = keyManager.snapshot;
      if (status === "empty" && incompatibleSessions === 0) {
        await keyManager.bootstrap();
      } else if (status === "pending" && incompatibleSessions === 0) {
        await keyManager.confirmCreation();
        await keyManager.refresh();
      }
    }
    backgroundResumeFailures = 0;
    succeeded = true;
  })().catch(error => {
    if (!backgroundStarted || startup !== backgroundStartup) {
      return;
    }
    if (["network_error", "timeout", "server_error", "busy", "activation_unconfirmed"].includes(error.code)) {
      const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
      const delay = Math.min(15 * 60000, 30000 * 2 ** Math.min(backgroundResumeFailures++, 5));
      backgroundResumeTimer = setTimeout(() => {
        backgroundResumeTimer = null;
        resumeBackgroundAccount();
      }, delay);
    } else if (!["vault_locked", "primary_password_required", "auth_required", "refresh_unavailable"].includes(error.code)) {
      console.error("Midori Sync could not resume in the background", error.name, error.code);
    }
  }).finally(() => {
    backgroundResumePromise = null;
    if (backgroundResumeAgain) {
      backgroundResumeAgain = false;
      if (succeeded) {
        resumeBackgroundAccount();
      }
    }
  });
  return backgroundResumePromise;
}


function syncBackgroundEligible() {
  return backgroundStarted && !stopped && canScheduleSync({
    enabled: Services.prefs.getBoolPref("midori.sync.enabled", false),
    backgroundEnabled: Services.prefs.getBoolPref(SYNC_BACKGROUND_PREF, false),
    account: account?.snapshot, keys: keys?.snapshot,
  });
}

function updateSyncScheduling() {
  const eligible = syncBackgroundEligible();
  if (!eligible || syncSchedulerGeneration !== account.snapshot.generation) {
    detachSyncHints();
    syncScheduler?.close();
    syncScheduler = null;
    syncSchedulerGeneration = null;
  }
  if (!eligible) {
    return;
  }
  if (!syncScheduler) {
    const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
    syncScheduler = new MidoriSyncScheduler({
      run: options => MidoriSyncService.runBackgroundSync(options),
      setTimer: setTimeout, clearTimer: clearTimeout,
    });
    syncSchedulerGeneration = account.snapshot.generation;
  }
  const available = !sleeping && !memoryPressure && !Services.io.offline && manualSyncs === 0 &&
    !keys.snapshot.busy;
  syncScheduler.setAvailable(Boolean(available));
  attachSyncHints();
}

function updateNotificationScheduling() {
  const state = account?.snapshot;
  const syncAvailable = Services.prefs.getBoolPref(SYNC_BACKGROUND_PREF, false) && keys?.snapshot.status === "ready";
  const eligible = backgroundStarted && !stopped && !sleeping && !memoryPressure && !Services.io.offline &&
    Services.prefs.getBoolPref("midori.sync.enabled", false) &&
    ["connected", "renewal-required"].includes(state?.status) &&
    syncAvailable;
  if (!eligible || syncNotificationsGeneration !== state.generation) {
    syncNotifications?.close();
    syncNotifications = null;
    syncNotificationsGeneration = null;
  }
  if (!eligible || syncNotifications) {
    return;
  }
  const owner = account;
  const generation = state.generation;
  const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
  syncNotifications = new MidoriSyncNotifications({
    server: connection.snapshot.server,
    requestTicket: signal => withAccountSecretsWhenIdle(owner, generation,
      lease => lease.request("api/v1/sync/notifications/ticket", {
        method: "POST", signal, maxBytes: 512, timeout: 10000,
      }), { signal }),
    transportFactory: (url, options) => new MidoriSyncTransport(url, options),
    onChange: () => {
      if (owner.snapshot.generation !== generation) {
        return;
      }
      syncScheduler?.hint({ urgent: true });
    },
    setTimer: setTimeout, clearTimer: clearTimeout,
  });
  syncNotificationsGeneration = generation;
  syncNotifications.start();
}



function observeSyncEnvironment(_subject, topic, data) {
  if (topic === "sleep_notification") {
    sleeping = true;
  } else if (topic === "wake_notification") {
    sleeping = false;
  } else if (topic === "memory-pressure" && data !== "heap-minimize") {
    memoryPressure = true;
  } else if (topic === "memory-pressure-stop") {
    memoryPressure = false;
  }
  updateSyncScheduling();
  updateNotificationScheduling();
  notifySyncStatus();
  if (topic === "wake_notification" || (topic === "network:offline-status-changed" && !Services.io.offline) ||
      (topic === "nsPref:changed" && ["midori.sync.enabled", SYNC_BACKGROUND_PREF].includes(data))) {
    resumeBackgroundAccount();
  }
}

function shutdown() {
  stopped = true;
  backgroundStarted = false;
  ++backgroundStartup;
  cancelBackgroundResumeTimer();
  backgroundResumeAgain = false;
  detachSyncHints();
  syncNotifications?.close();
  syncNotifications = null;
  syncNotificationsGeneration = null;
  syncScheduler?.close();
  syncScheduler = null;
  syncSchedulerGeneration = null;
  for (const topic of SYNC_TOPICS) {
    Services.obs.removeObserver(observeSyncEnvironment, topic);
  }
  Services.prefs.removeObserver("midori.sync.enabled", observeSyncEnvironment);
  Services.prefs.removeObserver(SYNC_BACKGROUND_PREF, observeSyncEnvironment);
  closeJournal().catch(() => {});
  keys?.close();
  keys = null;
  account?.close();
  account = null;
  connection?.close();
  connection = null;
  Services.obs.removeObserver(shutdown, "profile-before-change");
}

function closeJournal() {
  for (const current of collections.values()) {
    closeCollection(current);
  }
  collections.clear();
  syncStatuses.clear();
  notifySyncStatus();
  const current = journal;
  journal = null;
  return current?.promise.then(store => store.close(), () => {}) ?? Promise.resolve();
}

function closeCollection(current) {
  if (!current.closed) {
    current.closed = true;
    current.unsubscribeStatus?.();
    current.tracker?.close();
    if (current.engine) {
      current.engine.close();
    } else {
      current.adapter?.close?.();
    }
  }
}


async function prepareDisconnect(context) {
  try {
    await closeJournal();
  } catch {
    throw new SyncStoreError("sync_disconnect_unavailable");
  }
  const { assertSyncStoreSettled } = ChromeUtils.importESModule(new URL("./MidoriSyncDisconnect.sys.mjs", import.meta.url).href);
  await assertSyncStoreSettled({
    ...context, identity: context.journal,
    directory: PathUtils.join(PathUtils.profileDir, "midori-sync", "journals"), openStore: openSyncStore,
  });
}


async function createJournal() {
  let store;
  try {
    return await withLocalSecretsWhenIdle(account, account.snapshot.generation, async lease => {
      if (keys?.snapshot.status !== "ready" || keys.snapshot.busy) {
        throw new SyncStoreError("keys_locked");
      }
      let identity = lease.readJournalIdentity();
      if (!identity) {
        identity = { version: 1, store_id: Services.uuid.generateUUID().toString().slice(1, -1), device_id: lease.deviceId, initialized: false };
        await lease.writeJournalIdentity(identity);
      }
      if (identity.version !== 1 || !SYNC_STORE_UUID.test(identity.store_id) || identity.device_id !== lease.deviceId || typeof identity.initialized !== "boolean") {
        throw new SyncStoreError("invalid_store_identity");
      }
      store = await openSyncStore({
        directory: PathUtils.join(PathUtils.profileDir, "midori-sync", "journals"),
        storeId: identity.store_id, deviceId: identity.device_id, keys, create: !identity.initialized,
      });
      if (!identity.initialized) {
        await lease.writeJournalIdentity({ ...identity, initialized: true });
      }
      return store;
    });
  } catch (error) {
    await store?.close();
    throw error;
  }
}

export const MidoriSyncService = {
  init() {
    if (stopped || backgroundStarted) {
      return;
    }
    backgroundStarted = true;
    ++backgroundStartup;
    this.account;
    this.keys;
    updateSyncScheduling();
    updateNotificationScheduling();
    resumeBackgroundAccount();
  },

  uninit() {
    backgroundStarted = false;
    ++backgroundStartup;
    cancelBackgroundResumeTimer();
    backgroundResumeAgain = false;
    updateSyncScheduling();
    updateNotificationScheduling();
  },

  get backgroundSnapshot() {
    return Object.freeze({
      globalEnabled: Services.prefs.getBoolPref("midori.sync.enabled", false),
      enabled: Services.prefs.getBoolPref(SYNC_BACKGROUND_PREF, false),
      account: account?.snapshot.status ?? null,
      keys: keys?.snapshot.status ?? null,
      scheduler: syncScheduler?.snapshot ?? null,
      notifications: syncNotifications?.snapshot ?? null,
      hints: syncHints?.snapshot ?? null,
    });
  },

  get syncCollectionsSnapshot() {
    const enabled = Services.prefs.getBoolPref("midori.sync.enabled", false);
    const connected = ["connected", "renewal-required"].includes(account?.snapshot.status);
    const ready = connected && keys?.snapshot.status === "ready";
    const cardsSupported = Boolean(account?.snapshot.creditCardsSupported || connection?.snapshot.capabilities?.creditCards);
    return Object.freeze(SYNC_COLLECTION_NAMES.map(name => {
      const current = collections.get(name);
      const engine = current?.engine?.snapshot;
      const last = syncStatuses.get(name);
      const pending = engine?.pending ?? 0;
      const conflicts = engine?.conflicts ?? 0;
      const error = last ? last.error : engine?.error ?? null;
      const status = name === "credit-cards" && !cardsSupported ? "unsupported" :
        !enabled ? "disabled" : !ready ? "paused" : current?.syncing || engine?.busy ? "syncing" :
          conflicts ? "conflict" : ["passwords_locked", "cards_locked"].includes(error) ? "locked" :
            error ? "error" : Services.io.offline ? "offline" :
            pending ? "pending" : engine?.more || current?.tracker?.snapshot.more ? "more" :
              engine?.lastCompletedAt ? "completed" : "ready";
      return Object.freeze({ name, status, pending, conflicts, error, lastSuccessAt: engine?.lastCompletedAt ?? null });
    }));
  },

  subscribeSyncStatus(listener) {
    syncStatusListeners.add(listener);
    return () => syncStatusListeners.delete(listener);
  },

  get connection() {
    if (stopped) {
      throw new Error("profile_closed");
    }
    if (!connection) {
      const config = JSON.parse(Services.prefs.getStringPref(SERVER_PREF,
        JSON.stringify({ baseURL: MIDORI_SYNC_OFFICIAL_SERVER, allowLocalHTTP: false })));
      connection = new MidoriSyncConnection({
        baseURL: config.baseURL,
        allowLocalHTTP: config.allowLocalHTTP === true,
        transportFactory: (url, options) => new MidoriSyncTransport(url, options),
        saveServer: server => Services.prefs.setStringPref(SERVER_PREF, JSON.stringify(server)),
        prepareServerChange: server => account.prepareServerChange(server),
      });
      account = new MidoriSyncAccount({
        connection, vaultFactory: createProfileSyncVault, prepareDisconnect,
        transportFactory: (url, options) => new MidoriSyncTransport(url, options),
      });
      let lastConnectedGeneration = null;
      account.subscribe(snapshot => {
        if (journal && (snapshot.generation !== journal.generation || !["connected", "renewal-required"].includes(snapshot.status))) {
          closeJournal().catch(() => {});
        }
        updateSyncScheduling();
        updateNotificationScheduling();
        if (snapshot.status === "connected" && !snapshot.busy &&
            snapshot.generation !== lastConnectedGeneration) {
          lastConnectedGeneration = snapshot.generation;
          resumeBackgroundAccount();
        }
      });
      Services.obs.addObserver(shutdown, "profile-before-change");
      for (const topic of SYNC_TOPICS) {
        Services.obs.addObserver(observeSyncEnvironment, topic);
      }
      Services.prefs.addObserver("midori.sync.enabled", observeSyncEnvironment);
      Services.prefs.addObserver(SYNC_BACKGROUND_PREF, observeSyncEnvironment);
    }
    return connection;
  },

  get account() {
    this.connection;
    account.initialize();
    return account;
  },

  get keys() {
    if (!keys) {
      keys = createNativeSyncKeys(this.account);
      keys.subscribe(() => {
        updateSyncScheduling();
        updateNotificationScheduling();
      });
      updateSyncScheduling();
      updateNotificationScheduling();
    }
    return keys;
  },

  get journal() {
    this.account;
    if (!journal) {
      const current = { generation: account.snapshot.generation };
      current.promise = createJournal().catch(error => {
        if (journal === current) {
          journal = null;
        }
        throw error;
      });
      journal = current;
    }
    return journal.promise;
  },















  async syncBookmarks({ limit = 100, inventory = false } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof inventory !== "boolean") {
      throw new SyncStoreError("invalid_capture_query");
    }
    const engine = await this.collection("bookmarks");
    const current = collections.get("bookmarks");
    if (!current?.tracker) {
      throw new SyncStoreError("capture_unavailable");
    }
    if (inventory) {
      current.tracker.requestInventory();
    }
    current.syncing ??= (async () => {
      if (!engine.snapshot.initialized) {
        await engine.run();
        if (!engine.snapshot.initialized) {
          return { capture: null, collection: engine.snapshot, more: true };
        }
      }
      let captured;
      try {
        captured = await current.tracker.run({ limit });
      } catch (error) {
        if (error.code !== "application_recovery_required") {
          throw error;
        }
        await engine.run();
        captured = await current.tracker.run({ limit });
      }
      await engine.run();
      return { capture: captured, collection: engine.snapshot, more: current.tracker.snapshot.more || engine.snapshot.more };
    })().finally(() => { current.syncing = null; });
    return current.syncing;
  },

  async syncHistory({ limit = 100, inventory = false } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof inventory !== "boolean") {
      throw new SyncStoreError("invalid_capture_query");
    }
    const engine = await this.collection("history");
    const current = collections.get("history");
    if (!current?.tracker) {
      throw new SyncStoreError("capture_unavailable");
    }
    if (inventory) {
      current.tracker.requestInventory();
    }
    current.syncing ??= (async () => {
      if (!engine.snapshot.initialized) {
        await engine.run();
        if (!engine.snapshot.initialized) {
          return { capture: null, collection: engine.snapshot, more: true };
        }
        current.tracker.restartAfterBootstrap();
      }
      let captured;
      try {
        captured = await current.tracker.run({ limit });
      } catch (error) {
        if (error.code !== "application_recovery_required") {
          throw error;
        }
        await engine.run();
        captured = await current.tracker.run({ limit });
      }
      await engine.run();
      return { capture: captured, collection: engine.snapshot, more: current.tracker.snapshot.more || engine.snapshot.more };
    })().finally(() => { current.syncing = null; });
    return current.syncing;
  },

  async clearHistory() {
    const engine = await this.collection("history");
    const current = collections.get("history");
    if (current.syncing) {
      await current.syncing;
    }
    const result = await engine.clearHistory();
    current.tracker?.resetAfterClear();
    return result;
  },

  async syncTabs({ limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new SyncStoreError("invalid_capture_query");
    }
    const engine = await this.collection("tabs");
    const current = collections.get("tabs");
    current.syncing ??= (async () => {
      if (!engine.snapshot.initialized) {
        await engine.run();
        if (!engine.snapshot.initialized) {
          return { capture: null, collection: engine.snapshot, more: true };
        }
      }
      const capture = await engine.capture(this.account.snapshot.device.id);
      await engine.run();
      return { capture, collection: engine.snapshot, more: engine.snapshot.more };
    })().finally(() => { current.syncing = null; });
    return current.syncing;
  },

  async remoteTabs() {
    const deviceId = this.account.snapshot.device?.id;
    if (!SYNC_STORE_UUID.test(deviceId)) {
      throw new SyncStoreError("account_locked");
    }
    const store = await this.journal;
    const result = [];
    let after = null;
    while (result.length < 32) {
      const rows = await store.list("tabs", "record", { after, limit: 50 });
      if (!rows.length) {
        break;
      }
      for (const row of rows) {
        const remote = row.value?.remote;
        if (remote?.deleted || !remote?.value || remote.id === deviceId ||
            (remote.ttl && Date.parse(remote.ttl) <= Date.now())) {
          continue;
        }
        const value = validateTabsSnapshot(remote.id, remote.value);
        if (Date.parse(value.expires_at) > Date.now()) {
          result.push(value);
        }
      }
      after = rows.at(-1).id;
    }
    return result.sort((a, b) => a.device_name.localeCompare(b.device_name));
  },

  async syncPreferences({ limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new SyncStoreError("invalid_capture_query");
    }
    const engine = await this.collection("browser-settings");
    const current = collections.get("browser-settings");
    current.syncing ??= (async () => {
      if (!engine.snapshot.initialized) {
        await engine.run();
        if (!engine.snapshot.initialized) {
          return { capture: null, collection: engine.snapshot, more: true };
        }
      }
      const capture = { checked: 0, queued: 0, conflicts: 0, pending: 0 };
      for (const name of Object.keys(SYNC_PREFERENCE_SPECS)) {
        const result = await engine.capture(name);
        capture.checked++;
        if (result.status === "queued") {
          capture.queued++;
        } else if (result.status === "conflict") {
          capture.conflicts++;
        } else if (result.status === "pending") {
          capture.pending++;
        }
      }
      await engine.run();
      return { capture, collection: engine.snapshot, more: engine.snapshot.more };
    })().finally(() => { current.syncing = null; });
    return current.syncing;
  },




  async syncPasswords({ limit = 100, inventory = false } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof inventory !== "boolean") {
      throw new SyncStoreError("invalid_capture_query");
    }
    const engine = await this.collection("passwords");
    const current = collections.get("passwords");
    if (!current?.tracker) {
      throw new SyncStoreError("capture_unavailable");
    }
    if (inventory) {
      current.tracker.requestInventory();
    }
    current.syncing ??= (async () => {
      if (!engine.snapshot.initialized) {
        await engine.run();
        if (!engine.snapshot.initialized) {
          return { capture: null, collection: engine.snapshot, more: true };
        }
      }
      let captured;
      try {
        captured = await current.tracker.run({ limit });
      } catch (error) {
        if (error.code !== "application_recovery_required") {
          throw error;
        }
        await engine.run();
        captured = await current.tracker.run({ limit });
      }
      await engine.run();
      return { capture: captured, collection: engine.snapshot, more: current.tracker.snapshot.more || engine.snapshot.more };
    })().finally(() => { current.syncing = null; });
    return current.syncing;
  },

  async syncCreditCards({ limit = 100, inventory = false } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof inventory !== "boolean") {
      throw new SyncStoreError("invalid_capture_query");
    }
    const engine = await this.collection("credit-cards");
    const current = collections.get("credit-cards");
    if (!current?.tracker) {
      throw new SyncStoreError("capture_unavailable");
    }
    if (inventory) {
      current.tracker.requestInventory();
    }
    current.syncing ??= (async () => {
      if (!engine.snapshot.initialized) {
        await engine.run();
        if (!engine.snapshot.initialized) {
          return { capture: null, collection: engine.snapshot, more: true };
        }
      }
      const capture = await current.tracker.run({ limit });
      await engine.run();
      return { capture, collection: engine.snapshot, more: current.tracker.snapshot.more || engine.snapshot.more };
    })().finally(() => { current.syncing = null; });
    return current.syncing;
  },

  async unlockPasswords() {
    const { LoginHelper } = ChromeUtils.importESModule("resource://gre/modules/LoginHelper.sys.mjs");
    if (!LoginHelper.isPrimaryPasswordSet()) {
      return;
    }
    const token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
    if (!token.isLoggedIn) {
      try {
        await token.login();
      } catch {
        throw new SyncStoreError("passwords_locked");
      }
    }
    if (!token.isLoggedIn) {
      throw new SyncStoreError("passwords_locked");
    }
  },

  runBackgroundSync({ inventory = false } = {}) {
    if (backgroundSyncPromise) {
      return backgroundSyncPromise;
    }
    const task = this.syncNow({ limit: 50, inventory, background: true });
    backgroundSyncPromise = task;
    return task.finally(() => {
      if (backgroundSyncPromise === task) {
        backgroundSyncPromise = null;
      }
    });
  },

  async syncNow({ limit = 100, inventory = false, promptPasswords = false, background = false } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof inventory !== "boolean" ||
        typeof promptPasswords !== "boolean" || typeof background !== "boolean" || (background && promptPasswords)) {
      throw new SyncStoreError("invalid_capture_query");
    }
    const manual = this === MidoriSyncService && !background;
    const requestedGeneration = manual ? this.account.snapshot.generation : null;
    let manualSuccess = false;
    let manualMore = false;
    if (manual) {
      ++manualSyncs;
      syncScheduler?.setAvailable(false);
    }
    try {
      if (manual) {
        await backgroundSyncPromise?.catch(() => {});
        if (this.account.snapshot.generation !== requestedGeneration) {
          throw new SyncStoreError("cancelled");
        }
      }
      const owner = this.account;
      const generation = owner?.snapshot.generation;
      const collectionsResult = {};
      const errors = {};
      let retryAfter = 0;
      if (promptPasswords) {
        try {
          await this.unlockPasswords();
        } catch (error) {
          errors.passwords = error.code ?? "passwords_locked";
          if (this === MidoriSyncService && owner.snapshot.generation === generation) {
            syncStatuses.set("passwords", { ...syncStatuses.get("passwords"), error: errors.passwords });
            notifySyncStatus();
          }
        }
      }
      for (const [name, method] of [["bookmarks", "syncBookmarks"], ["history", "syncHistory"],
        ["passwords", "syncPasswords"], ["credit-cards", "syncCreditCards"], ["tabs", "syncTabs"],
        ["browser-settings", "syncPreferences"]]) {
        if (name === "credit-cards" && !owner?.snapshot?.creditCardsSupported &&
            !this.connection?.snapshot?.capabilities?.creditCards) {
          continue;
        }
        if (owner && owner.snapshot.generation !== generation) {
          throw new SyncStoreError("cancelled");
        }
        if (background && manualSyncs) {
          return Object.freeze({ collections: collectionsResult, errors, retryAfter, more: true });
        }
        if (errors[name]) {
          continue;
        }
        try {
          collectionsResult[name] = await this[method]({ limit, inventory });
          if (this === MidoriSyncService && owner.snapshot.generation === generation &&
              collectionsResult[name]?.collection?.initialized) {
            if (!collectionsResult[name].more) {
              const engine = collections.get(name).engine;
              try {
                await engine.markCompleted();
                collectionsResult[name] = { ...collectionsResult[name], collection: engine.snapshot };
              } catch (error) {
                if (!["store_busy", "store_conflict"].includes(error.code)) {
                  throw error;
                }
              }
            }
            syncStatuses.set(name, { error: null });
            notifySyncStatus();
          }
        } catch (error) {
          errors[name] = error.code ?? "sync_failed";
          if (this === MidoriSyncService && owner.snapshot.generation === generation) {
            syncStatuses.set(name, { ...syncStatuses.get(name), error: errors[name] });
            notifySyncStatus();
          }
          retryAfter = Math.max(retryAfter, Number.isInteger(error.retryAfter) ? error.retryAfter : 0);
        }
      }
      if (owner && owner.snapshot.generation !== generation) {
        throw new SyncStoreError("cancelled");
      }
      manualSuccess = manual && !Object.keys(errors).length;
      manualMore = Object.values(collectionsResult).some(result => result.more);
      return Object.freeze({ collections: collectionsResult, errors, retryAfter,
        more: manualMore });
    } finally {
      if (manual) {
        --manualSyncs;
        updateSyncScheduling();
        updateNotificationScheduling();
        if (manualSuccess) {
          syncScheduler?.manualCompleted({ more: manualMore });
        }
      }
    }
  },

  async collection(name, adapter) {
    const owner = this.account;
    const generation = owner.snapshot.generation;
    let current = collections.get(name);
    if (current) {
      if (adapter !== undefined && current.adapter !== adapter) {
        throw new SyncStoreError("collection_in_use");
      }
      return current.promise;
    }
    const nativeCapture = adapter === undefined && ["bookmarks", "history", "passwords", "credit-cards", "tabs", "browser-settings"].includes(name);
    if (adapter === undefined) {
      if (!nativeCapture) {
        throw new SyncStoreError("collection_adapter_unavailable");
      }
      if (name === "bookmarks") {
        const { MidoriSyncBookmarks } = ChromeUtils.importESModule(new URL("./MidoriSyncBookmarks.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncBookmarks();
      } else if (name === "history") {
        const { MidoriSyncHistory } = ChromeUtils.importESModule(new URL("./MidoriSyncHistory.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncHistory();
      } else if (name === "tabs") {
        const { MidoriSyncTabs } = ChromeUtils.importESModule(new URL("./MidoriSyncTabs.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncTabs({ deviceId: owner.snapshot.device.id, deviceName: owner.snapshot.device.name });
      } else if (name === "credit-cards") {
        const { MidoriSyncCreditCards } = ChromeUtils.importESModule(new URL("./MidoriSyncCreditCards.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncCreditCards();
      } else if (name === "browser-settings") {
        const { MidoriSyncPreferences } = ChromeUtils.importESModule(new URL("./MidoriSyncPreferences.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncPreferences();
      } else {
        const { MidoriSyncPasswords } = ChromeUtils.importESModule(new URL("./MidoriSyncPasswords.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncPasswords();
      }
    }
    current = { adapter, engine: null, closed: false };
    collections.set(name, current);
    current.promise = (async () => {
      const store = await this.journal;
      if (stopped || collections.get(name) !== current || owner.snapshot.generation !== generation) {
        throw new SyncStoreError("cancelled");
      }
      const engine = new MidoriSyncCollection({
        collection: name, journal: store, keys: this.keys, adapter, entryId: syncJournalEntryId,
        createId: () => Services.uuid.generateUUID().toString().slice(1, -1),
        request: (path, options) => withAccountSecretsWhenIdle(owner, generation, async lease => {
          if (lease.generation !== generation) {
            throw new SyncStoreError("cancelled");
          }
          const response = await lease.request(path, options);
          return response;
        }, { signal: options.signal }),
      });
      current.engine = engine;
      current.unsubscribeStatus = engine.subscribe(notifySyncStatus);
      notifySyncStatus();
      await engine.initialize();
      if (nativeCapture && name === "bookmarks") {
        const { MidoriSyncBookmarkTracker } = ChromeUtils.importESModule(new URL("./MidoriSyncBookmarkTracker.sys.mjs", import.meta.url).href);
        const { SYNC_BOOKMARK_ROOTS } = ChromeUtils.importESModule(new URL("./MidoriSyncBookmarks.sys.mjs", import.meta.url).href);
        current.tracker = new MidoriSyncBookmarkTracker({ engine, adapter, roots: SYNC_BOOKMARK_ROOTS,
          onChange: () => syncScheduler?.hint({ urgent: true }) });
      } else if (nativeCapture && name === "history") {
        const { MidoriSyncHistoryTracker } = ChromeUtils.importESModule(new URL("./MidoriSyncHistoryTracker.sys.mjs", import.meta.url).href);
        current.tracker = new MidoriSyncHistoryTracker({ engine, adapter,
          onChange: () => syncScheduler?.hint({ urgent: true }) });
      } else if (nativeCapture && name === "passwords") {
        const { MidoriSyncPasswordTracker } = ChromeUtils.importESModule(new URL("./MidoriSyncPasswordTracker.sys.mjs", import.meta.url).href);
        current.tracker = new MidoriSyncPasswordTracker({ engine, adapter,
          onChange: () => syncScheduler?.hint({ urgent: true }) });
      } else if (nativeCapture && name === "credit-cards") {
        const { MidoriSyncRecordTracker } = ChromeUtils.importESModule(new URL("./MidoriSyncPasswordTracker.sys.mjs", import.meta.url).href);
        current.tracker = new MidoriSyncRecordTracker({ engine, adapter,
          onChange: () => syncScheduler?.hint({ urgent: true }) });
      }
      return engine;
    })().catch(error => {
      closeCollection(current);
      if (collections.get(name) === current) {
        collections.delete(name);
      }
      throw error;
    });
    return current.promise;
  },
};
