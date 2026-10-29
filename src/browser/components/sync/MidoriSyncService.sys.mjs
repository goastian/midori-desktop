/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MidoriSyncConnection } from "./MidoriSyncConnection.sys.mjs";
import { MidoriSyncAccount } from "./MidoriSyncAccount.sys.mjs";
import { MidoriSyncCollection } from "./MidoriSyncCollection.sys.mjs";
import { syncJournalEntryId } from "./MidoriSyncIndex.sys.mjs";
import { createNativeSyncKeys } from "./MidoriSyncNativeKeys.sys.mjs";
import { openSyncStore, openDiscoveredSyncStore, createSyncJournalFiles, assertSavedSyncCopiesIndependent } from "./MidoriSyncStore.sys.mjs";
import { SYNC_STORE_UUID, SyncStoreError } from "./MidoriSyncLocalCodec.sys.mjs";
import { SYNC_DESKTOP_COLLECTIONS, syncCollectionSupported } from "./MidoriSyncProtocol.sys.mjs";
import { createProfileSyncVault, createProfileSyncSavedCustody } from "./MidoriSyncSecretStore.sys.mjs";
import { MidoriSyncTransport } from "./MidoriSyncTransport.sys.mjs";
import { MIDORI_SYNC_OFFICIAL_SERVER } from "./MidoriSyncServerConfig.sys.mjs";
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
let journalClosing = Promise.resolve();
let journalRecovery = null;
let journalRecoveryGeneration = null;
let journalMaintenance = false;
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
let encryptionMigration = null;
let encryptionMigrationPromise = null;
let encryptionTransitionPending = false;
let enrollmentTimer = null;
let enrollmentRequests = [];
let enrollmentRefresh = null;
const collections = new Map();
const syncStatuses = new Map();
const remoteTabsCache = new Map();
const syncStatusListeners = new Set();
const SYNC_COLLECTION_NAMES = SYNC_DESKTOP_COLLECTIONS;
const SELECTABLE_COLLECTIONS = SYNC_COLLECTION_NAMES;
const COLLECTION_PREF = "midori.sync.collection.";
let syncControlVersion = 0;
let syncEnabled = Services.prefs.getBoolPref("midori.sync.enabled", false);
const selectedCollections = new Map(SELECTABLE_COLLECTIONS.map(name => [name, collectionEnabled(name)]));
let stopped = false;
let sleeping = false;
let memoryPressure = false;
const SYNC_TOPICS = ["network:offline-status-changed", "sleep_notification", "wake_notification", "memory-pressure", "memory-pressure-stop"];

function collectionEnabled(name) {
  return SELECTABLE_COLLECTIONS.includes(name) && Services.prefs.getBoolPref(`${COLLECTION_PREF}${name}.enabled`, true);
}

function assertSyncTransferAllowed(name = null) {
  if (!Services.prefs.getBoolPref("midori.sync.enabled", false)) {
    throw new SyncStoreError("sync_paused");
  }
  if (name !== null && !collectionEnabled(name)) {
    throw new SyncStoreError("collection_disabled");
  }
}

function updateSyncControls() {
  const enabled = Services.prefs.getBoolPref("midori.sync.enabled", false);
  if (syncEnabled !== enabled) {
    syncEnabled = enabled;
    ++syncControlVersion;
    if (!enabled) {
      for (const current of collections.values()) { current.engine?.cancel(); }
      encryptionMigration?.driver.close();
      encryptionMigration?.abort.abort();
    }
  }
  for (const name of SELECTABLE_COLLECTIONS) {
    const selected = collectionEnabled(name);
    if (selectedCollections.get(name) !== selected) {
      selectedCollections.set(name, selected);
      ++syncControlVersion;
      if (!selected) { collections.get(name)?.engine?.cancel(); }
    }
  }
}

async function selectedSyncCollection(service, name) {
  assertSyncTransferAllowed(name);
  const engine = await service.collection(name);
  assertSyncTransferAllowed(name);
  return engine;
}

async function syncTrackedCollection(service, name, { limit = 100, inventory = false } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof inventory !== "boolean") {
    throw new SyncStoreError("invalid_capture_query");
  }
  const engine = await selectedSyncCollection(service, name);
  const current = collections.get(name);
  if (!current?.tracker) {
    throw new SyncStoreError("capture_unavailable");
  }
  if (inventory) {
    current.tracker.requestInventory();
  }
  current.syncing ??= (async () => {
    if (!engine.snapshot.initialized || engine.snapshot.more) {
      await engine.run();
      if (!engine.snapshot.initialized) {
        return { capture: null, collection: engine.snapshot, more: true };
      }
    }
    let capture;
    try {
      capture = await current.tracker.run({ limit });
    } catch (error) {
      if (error.code !== "application_recovery_required") {
        throw error;
      }
      await engine.run();
      capture = await current.tracker.run({ limit });
    }
    await engine.run();
    return { capture, collection: engine.snapshot, more: current.tracker.snapshot.more || engine.snapshot.more };
  })().finally(() => { current.syncing = null; });
  return current.syncing;
}

async function captureOfflineCollection(service, name, { limit, inventory }) {
  const engine = await selectedSyncCollection(service, name);
  const current = collections.get(name);
  if (inventory) {
    current.tracker?.requestInventory();
  }
  current.syncing ??= (async () => {
    const recovered = await engine.recoverLocal();
    if (!recovered.captureReady) {
      return { capture: null, collection: engine.snapshot, more: recovered.more, offline: true };
    }
    let capture;
    if (current.tracker) {
      capture = await current.tracker.run({ limit });
    } else {
      capture = { checked: 0, queued: 0, pending: 0, conflicts: 0 };
      let ids;
      if (name === "tabs") {
        const deviceId = service.account.snapshot.device.id;
        const mirror = await engine.record(deviceId);
        const queued = mirror?.pending ? await (await service.journal).read(mirror.pending) : null;
        const previous = mirror?.localChange?.value ?? queued?.value.value ?? mirror?.remote?.value ?? null;
        ids = await current.adapter.beginCapture({ previous });
      } else if (name === "browser-settings") {
        ids = Object.keys(SYNC_PREFERENCE_SPECS);
      } else {
        throw new SyncStoreError("capture_unavailable");
      }
      try {
        for (const id of ids) {
          const result = await engine.capture(id);
          ++capture.checked;
          const counter = { queued: "queued", pending: "pending", conflict: "conflicts" }[result.status];
          if (counter) {
            ++capture[counter];
          } else if (result.status !== "unchanged") {
            throw new SyncStoreError("invalid_adapter_result");
          }
        }
      } finally {
        current.adapter.endCapture?.();
      }
    }
    return { capture, collection: engine.snapshot, more: current.tracker?.snapshot.more ?? false, offline: true };
  })().finally(() => { current.syncing = null; });
  return current.syncing;
}

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

const TABS_DEBOUNCE_MS = 1500;
let tabsTimer = null;
let tabsRunning = false;
let tabsAgain = false;

function hintTabs() {
  if (!syncBackgroundEligible()) {
    return;
  }
  const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
  if (tabsTimer !== null) {
    clearTimeout(tabsTimer);
  }
  tabsTimer = setTimeout(() => {
    tabsTimer = null;
    runTabsNow();
  }, TABS_DEBOUNCE_MS);
}

async function runTabsNow() {
  if (tabsRunning) {
    tabsAgain = true;
    return;
  }
  if (!syncBackgroundEligible() || !collectionEnabled("tabs") || manualSyncs) {
    syncScheduler?.hint();
    return;
  }
  tabsRunning = true;
  try {
    if (Services.io.offline || MidoriSyncService.account.snapshot.status === "local") {
      await captureOfflineCollection(MidoriSyncService, "tabs", { limit: 50, inventory: false });
    } else {
      await MidoriSyncService.syncTabs({ limit: 50 });
    }
  } catch {
    syncScheduler?.hint();
  } finally {
    tabsRunning = false;
    if (tabsAgain) {
      tabsAgain = false;
      hintTabs();
    }
  }
}

function attachSyncHints() {
  syncHints ??= new MidoriSyncHints({
    onChange: () => syncScheduler?.hint(),
    onTabsChange: hintTabs,
  });
  syncHints.start();
}

function detachSyncHints() {
  if (tabsTimer !== null) {
    const { clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
    clearTimeout(tabsTimer);
    tabsTimer = null;
  }
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

const ENROLLMENT_POLL_MS = 3000;

function enrollmentSupported() {
  return connection?.snapshot.capabilities?.deviceEnrollment === true;
}

function stopEnrollmentPolling() {
  if (enrollmentTimer !== null) {
    const { clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
    clearTimeout(enrollmentTimer);
    enrollmentTimer = null;
  }
}

function scheduleEnrollmentPoll(generation) {
  const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
  stopEnrollmentPolling();
  enrollmentTimer = setTimeout(async () => {
    enrollmentTimer = null;
    if (stopped || account?.snapshot.generation !== generation || !keys?.snapshot.enrollment) {
      return;
    }
    let result = "pending";
    try {
      result = await keys.pollEnrollment();
    } catch (error) {
      if (!["cancelled", "busy", "auth_required"].includes(error.code)) {
        console.error("Midori Sync could not complete device approval", error.name, error.code);
      }
      result = "failed";
    }
    if (result === "pending" && account?.snapshot.generation === generation) {
      scheduleEnrollmentPoll(generation);
    } else if (result === "approved") {
      updateSyncScheduling();
      updateNotificationScheduling();
      syncScheduler?.hint({ urgent: true });
    }
    notifySyncStatus();
  }, ENROLLMENT_POLL_MS);
}

function resumeBackgroundAccount() {
  if (!backgroundStarted || stopped || sleeping || memoryPressure ||
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
    if (Services.io.offline) {
      if (["locked", "error"].includes(owner.snapshot.status) &&
          !["vault_locked", "primary_password_required"].includes(owner.snapshot.error)) {
        await owner.unlock({ interactive: false, localOnly: true });
      }
      if (owner.snapshot.status === "local" && keyManager.snapshot.status !== "ready") {
        await keyManager.unlockLocal();
      }
      succeeded = true;
      return;
    }
    const reconnecting = owner.snapshot.status === "local";
    if (reconnecting) {
      if (manualSyncs) {
        throw new SyncStoreError("busy");
      }
      syncScheduler?.setAvailable(false);
      await backgroundSyncPromise?.catch(() => {});
    }
    if (reconnecting || !connection.snapshot.capabilities) {
      await connection.refreshCapabilities({ background: true });
    }
    if (["locked", "local"].includes(owner.snapshot.status) &&
        !["vault_locked", "primary_password_required"].includes(owner.snapshot.error)) {
      await owner.unlock({ interactive: false });
    }
    if (backgroundStarted && startup === backgroundStartup &&
        owner.snapshot.status === "connected" &&
        (keyManager.snapshot.localOnly || keyManager.snapshot.accountRecoverySupported && !keyManager.snapshot.accountRecoveryAvailable ||
          !["ready", "empty", "recovery-required", "migration-required"].includes(keyManager.snapshot.status))) {
      await keyManager.refresh();
    }
    if (backgroundStarted && startup === backgroundStartup &&
        owner.snapshot.status === "connected" && keyManager.snapshot.status === "empty") {
      await keyManager.bootstrap();
    }
    if (owner.snapshot.status === "connected" && keyManager.snapshot.status === "account-recovery-pending") {
      throw new SyncStoreError("account_recovery_pending");
    }
    if (backgroundStarted && startup === backgroundStartup &&
        owner.snapshot.status === "connected" && keyManager.snapshot.status === "recovery-required" &&
        !keyManager.snapshot.passwordUnlockAvailable &&
        !keyManager.snapshot.busy && !keyManager.snapshot.enrollment && enrollmentSupported()) {
      await MidoriSyncService.startEnrollment();
    }
    if (backgroundStarted && startup === backgroundStartup && owner.snapshot.status === "connected" &&
        keyManager.snapshot.status === "ready" &&
        (keyManager.snapshot.rotation?.phase === "rewriting" ||
          keyManager.snapshot.rotation?.phase === "complete" &&
          (keyManager.snapshot.keyCount > 1 || keyManager.snapshot.localKeyCount > 1))) {
      await MidoriSyncService.migrateEncryption();
    }
    backgroundResumeFailures = 0;
    succeeded = true;
  })().catch(async error => {
    if (!backgroundStarted || startup !== backgroundStartup) {
      return;
    }
    if (["network_error", "timeout", "server_error", "rate_limited", "busy", "activation_unconfirmed", "account_recovery_pending"].includes(error.code)) {
      if (["network_error", "timeout", "server_error"].includes(error.code) &&
          ["locked", "error"].includes(owner.snapshot.status)) {
        try {
          await owner.unlock({ interactive: false, localOnly: true });
          if (owner.snapshot.status === "local") {
            await keyManager.unlockLocal();
          }
        } catch (localError) {
          if (!["vault_locked", "primary_password_required", "offline_keys_unavailable", "keys_locked"].includes(localError.code)) {
            console.error("Midori Sync could not open local custody", localError.name, localError.code);
          }
        }
      }
      const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
      const backoff = error.code === "account_recovery_pending" ? 30000 : Math.min(15 * 60000, 30000 * 2 ** Math.min(backgroundResumeFailures++, 5));
      const retryAfter = Number.isFinite(error.retryAfter) ? Math.min(86400, Math.max(0, error.retryAfter)) * 1000 : 0;
      const delay = Math.max(backoff, retryAfter);
      backgroundResumeTimer = setTimeout(() => {
        backgroundResumeTimer = null;
        resumeBackgroundAccount();
      }, delay);
    } else if (!["vault_locked", "primary_password_required", "offline_keys_unavailable", "auth_required", "refresh_unavailable", "incompatible_devices"].includes(error.code)) {
      console.error("Midori Sync could not resume in the background", error.name, error.code);
    }
  }).finally(() => {
    backgroundResumePromise = null;
    updateSyncScheduling();
    updateNotificationScheduling();
    notifySyncStatus();
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
  const available = !sleeping && !memoryPressure && !backgroundResumePromise && manualSyncs === 0 &&
    !encryptionTransitionPending && !keys.snapshot.busy && keys.snapshot.rotation?.phase !== "rewriting";
  syncScheduler.setAvailable(Boolean(available));
  attachSyncHints();
}

function updateNotificationScheduling() {
  const state = account?.snapshot;
  const syncAvailable = Services.prefs.getBoolPref(SYNC_BACKGROUND_PREF, false) && keys?.snapshot.status === "ready";
  const eligible = backgroundStarted && !stopped && !sleeping && !memoryPressure && !Services.io.offline &&
    Services.prefs.getBoolPref("midori.sync.enabled", false) &&
    ["connected", "renewal-required"].includes(state?.status) &&
    syncAvailable && !keys.snapshot.localOnly;
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
  if (topic === "nsPref:changed" && (data.startsWith(COLLECTION_PREF) || data === "midori.sync.enabled")) {
    updateSyncControls();
    syncScheduler?.hint({ urgent: true });
  }
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
  if (topic === "wake_notification" || topic === "network:offline-status-changed" ||
      (topic === "nsPref:changed" && ["midori.sync.enabled", SYNC_BACKGROUND_PREF].includes(data))) {
    resumeBackgroundAccount();
  }
}

function shutdown() {
  stopped = true;
  backgroundStarted = false;
  ++backgroundStartup;
  cancelBackgroundResumeTimer();
  stopEnrollmentPolling();
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
  Services.prefs.removeObserver(COLLECTION_PREF, observeSyncEnvironment);
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
  const current = journal;
  journal = null;
  encryptionMigration?.driver.close();
  encryptionMigration?.abort.abort();
  for (const current of collections.values()) {
    closeCollection(current);
  }
  collections.clear();
  syncStatuses.clear();
  remoteTabsCache.clear();
  const closing = journalClosing.then(() => current?.promise.then(store => store.close(), () => {}));
  journalClosing = closing.catch(() => {});
  notifySyncStatus();
  return closing;
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

function assertCurrentAccount(owner, generation) {
  if (owner !== account || owner.snapshot.generation !== generation) {
    throw new SyncStoreError("cancelled");
  }
}


async function prepareDisconnect(context) {
  try {
    await closeJournal();
  } catch {
    throw new SyncStoreError("sync_disconnect_unavailable");
  }
  const { assertSyncAccountSettled } = ChromeUtils.importESModule(new URL("./MidoriSyncDisconnect.sys.mjs", import.meta.url).href);
  await assertSyncAccountSettled({
    ...context, identity: context.journal,
    directory: PathUtils.join(PathUtils.profileDir, "midori-sync", "journals"), openStore: openSyncStore,
    assertSavedCopies: assertSavedSyncCopiesIndependent,
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

function savedJournals() {
  if (!journalRecovery) {
    const { MidoriSyncJournalRecovery } = ChromeUtils.importESModule(new URL("./MidoriSyncJournalRecovery.sys.mjs", import.meta.url).href);
    const directory = PathUtils.join(PathUtils.profileDir, "midori-sync", "journals");
    journalRecovery = new MidoriSyncJournalRecovery({
      files: createSyncJournalFiles(directory),
      openStore: options => openDiscoveredSyncStore({ ...options, directory }),
      createId: () => Services.uuid.generateUUID().toString().slice(1, -1),
    });
  }
  return journalRecovery;
}

async function maintainSavedJournals(work) {
  const owner = MidoriSyncService.account;
  await owner.initialize();
  if (manualSyncs || journalMaintenance || encryptionTransitionPending || encryptionMigrationPromise || owner.snapshot.interactionBusy) {
    throw new SyncStoreError("busy");
  }
  const generation = owner.snapshot.generation;
  ++manualSyncs;
  syncScheduler?.setAvailable(false);
  try {
    await backgroundSyncPromise?.catch(() => {});
    await journalClosing;
    assertCurrentAccount(owner, generation);
    journalMaintenance = true;
    if (owner.snapshot.status === "signed-out") {
      return await owner.withSignedOutState(async () => {
        assertCurrentAccount(owner, generation);
        const result = await work({ activeId: null, deviceId: null, lease: null,
          assertCurrent: () => assertCurrentAccount(owner, generation) });
        assertCurrentAccount(owner, generation);
        return result;
      });
    }
    if (!["connected", "renewal-required", "local"].includes(owner.snapshot.status)) {
      throw new SyncStoreError("keys_locked");
    }
    return await withLocalSecretsWhenIdle(owner, generation, async lease => {
      assertCurrentAccount(owner, generation);
      const identity = lease.readJournalIdentity();
      if (identity !== null && (identity.version !== 1 || !SYNC_STORE_UUID.test(identity.store_id) || identity.device_id !== lease.deviceId)) {
        throw new SyncStoreError("invalid_store_identity");
      }
      const result = await work({ activeId: identity?.store_id ?? null, deviceId: lease.deviceId, lease,
        assertCurrent: () => assertCurrentAccount(owner, generation) });
      assertCurrentAccount(owner, generation);
      return result;
    });
  } finally {
    journalMaintenance = false;
    --manualSyncs;
    updateSyncScheduling();
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
    stopEnrollmentPolling();
    backgroundResumeAgain = false;
    updateSyncScheduling();
    updateNotificationScheduling();
  },

  get backgroundSnapshot() {
    return Object.freeze({
      globalEnabled: Services.prefs.getBoolPref("midori.sync.enabled", false),
      enabled: Services.prefs.getBoolPref(SYNC_BACKGROUND_PREF, false),
      offline: Services.io.offline,
      suspended: sleeping || memoryPressure,
      account: account?.snapshot.status ?? null,
      keys: keys?.snapshot.status ?? null,
      scheduler: syncScheduler?.snapshot ?? null,
      notifications: syncNotifications?.snapshot ?? null,
      hints: syncHints?.snapshot ?? null,
    });
  },

  get syncCollectionsSnapshot() {
    const enabled = Services.prefs.getBoolPref("midori.sync.enabled", false);
    const connected = ["connected", "renewal-required", "local"].includes(account?.snapshot.status);
    const ready = connected && keys?.snapshot.status === "ready";
    return Object.freeze(SYNC_COLLECTION_NAMES.map(name => {
      const current = collections.get(name);
      const engine = current?.engine?.snapshot;
      const last = syncStatuses.get(name);
      const pending = engine?.pending ?? 0;
      const conflicts = engine?.conflicts ?? 0;
      const error = last ? last.error : engine?.error ?? null;
      const selected = collectionEnabled(name);
      const status = !selected ? "disabled" : !syncCollectionSupported(name, account?.snapshot, connection?.snapshot) ? "unsupported" :
        !enabled ? "disabled" : !ready ? "paused" : current?.syncing || engine?.busy ? "syncing" :
          conflicts ? "conflict" : ["passwords_locked", "cards_locked"].includes(error) ? "locked" :
            error ? "error" : Services.io.offline || account?.snapshot.status === "local" ? "offline" :
            pending ? "pending" : engine?.more || current?.tracker?.snapshot.more ? "more" :
              engine?.lastCompletedAt ? "completed" : "ready";
      return Object.freeze({ name, status, enabled: selected, pending, conflicts, deferred: engine?.deferred ?? 0,
        error, lastSuccessAt: engine?.lastCompletedAt ?? null });
    }));
  },

  setCollectionEnabled(name, enabled) {
    if (!SELECTABLE_COLLECTIONS.includes(name) || typeof enabled !== "boolean") {
      throw new SyncStoreError("invalid_collection_selection");
    }
    Services.prefs.setBoolPref(`${COLLECTION_PREF}${name}.enabled`, enabled);
    updateSyncControls();
    const current = collections.get(name);
    if (!enabled && current?.engine?.snapshot.phase === "closed") {
      closeCollection(current);
      collections.delete(name);
    }
    syncScheduler?.hint({ urgent: true });
    notifySyncStatus();
  },

  setSyncEnabled(enabled) {
    if (typeof enabled !== "boolean") { throw new SyncStoreError("invalid_collection_selection"); }
    Services.prefs.setBoolPref("midori.sync.enabled", enabled);
    updateSyncControls();
    updateSyncScheduling();
    updateNotificationScheduling();
    notifySyncStatus();
  },

  subscribeSyncStatus(listener) {
    syncStatusListeners.add(listener);
    return () => syncStatusListeners.delete(listener);
  },

  async resetEncryption() {
    await this.keys.resetEncryption();
    await this.finishReset();
  },

  async finishReset() {
    await this.keys.refresh();
    if (this.keys.snapshot.status === "empty") {
      await this.keys.bootstrap();
    }
    updateSyncScheduling();
    updateNotificationScheduling();
    syncScheduler?.hint({ urgent: true });
    notifySyncStatus();
  },

  async startEnrollment() {
    const owner = this.account;
    const manager = this.keys;
    await manager.beginEnrollment();
    scheduleEnrollmentPoll(owner.snapshot.generation);
    notifySyncStatus();
  },

  cancelEnrollment() {
    stopEnrollmentPolling();
    keys?.cancelEnrollment();
    notifySyncStatus();
  },

  get enrollmentRequests() {
    return enrollmentRequests;
  },

  refreshEnrollmentRequests() {
    if (enrollmentRefresh) {
      return enrollmentRefresh;
    }
    enrollmentRefresh = (async () => {
      let next = [];
      if (enrollmentSupported() && keys?.snapshot.status === "ready" &&
          ["connected", "renewal-required"].includes(account?.snapshot.status)) {
        try {
          next = await keys.listEnrollments();
        } catch {
          return enrollmentRequests;
        }
      }
      if (JSON.stringify(next) !== JSON.stringify(enrollmentRequests)) {
        enrollmentRequests = next;
        notifySyncStatus();
      }
      return enrollmentRequests;
    })().finally(() => {
      enrollmentRefresh = null;
    });
    return enrollmentRefresh;
  },

  async approveEnrollment(id, code) {
    await this.keys.approveEnrollment(id, code);
    enrollmentRequests = enrollmentRequests.filter(request => request.id !== id);
    notifySyncStatus();
  },

  async denyEnrollment(id) {
    await this.keys.denyEnrollment(id);
    enrollmentRequests = enrollmentRequests.filter(request => request.id !== id);
    notifySyncStatus();
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
      let supported = SYNC_COLLECTION_NAMES.map(name => syncCollectionSupported(name, account.snapshot, connection.snapshot));
      connection.subscribe(snapshot => {
        const next = SYNC_COLLECTION_NAMES.map(name => syncCollectionSupported(name, account.snapshot, snapshot));
        if (next.every((value, index) => value === supported[index])) {
          return;
        }
        supported = next;
        for (const [name, current] of collections) {
          if (!syncCollectionSupported(name, account.snapshot, snapshot)) {
            current.engine?.cancel();
          }
        }
        syncScheduler?.hint({ urgent: true });
        notifySyncStatus();
      });
      let lastConnectedGeneration = null;
      account.subscribe(snapshot => {
        if (journalRecoveryGeneration !== snapshot.generation) {
          journalRecovery?.clear();
          journalRecoveryGeneration = snapshot.generation;
        }
        if (journal && (snapshot.generation !== journal.generation || !["connected", "renewal-required", "local"].includes(snapshot.status))) {
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
      Services.prefs.addObserver(COLLECTION_PREF, observeSyncEnvironment);
      if (!Services.io.offline) {
        connection.refreshCapabilities({ background: true }).catch(() => {});
      }
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
    if (journalMaintenance) {
      throw new SyncStoreError("busy");
    }
    const owner = this.account;
    if (!journal) {
      const current = { generation: owner.snapshot.generation };
      current.promise = journalClosing.then(() => {
        assertCurrentAccount(owner, current.generation);
        if (journal !== current) {
          throw new SyncStoreError("cancelled");
        }
        return createJournal();
      }).catch(error => {
        if (journal === current) {
          journal = null;
        }
        throw error;
      });
      journal = current;
    }
    return journal.promise;
  },

  savedJournalPage(options = {}) {
    return maintainSavedJournals(({ activeId }) => savedJournals().list({ ...options, activeId }));
  },

  reviewSavedJournal(id) {
    return maintainSavedJournals(async context => {
      let inspectionKeys = null;
      try {
        if (context.lease) {
          const { recoverLocalSyncKeys } = ChromeUtils.importESModule(new URL("./MidoriSyncKeys.sys.mjs", import.meta.url).href);
          try {
            inspectionKeys = await recoverLocalSyncKeys({ scope: context.lease.scope,
              value: context.lease.readLocalKeys(), allowPendingRotation: true,
              cryptoFactory: () => Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto) });
          } catch {
            context.assertCurrent();
          }
        }
        let result = await savedJournals().review({ id, ...context, keys: inspectionKeys });
        if (["locked", "unreadable"].includes(result.status)) {
          inspectionKeys?.close();
          inspectionKeys = null;
          const fingerprint = await createSyncJournalFiles(PathUtils.join(PathUtils.profileDir, "midori-sync", "journals")).fingerprint(id);
          const archived = await createProfileSyncSavedCustody().open({ id, fingerprint,
            scope: context.lease?.scope ?? null, interactive: true, assertCurrent: context.assertCurrent,
            accept: async opened => {
              const reviewed = await savedJournals().review({ id, ...context, keys: opened.keys, allowRestore: false });
              if (reviewed.status !== "archived") { return false; }
              result = reviewed;
              return true;
            } });
          if (archived) {
            inspectionKeys = archived.keys;
          }
        }
        return { ...result, canProtect: !!context.lease && result.status !== "empty" };
      } finally {
        inspectionKeys?.close();
      }
    });
  },

  async restoreSavedJournal(id, token) {
    await maintainSavedJournals(context => savedJournals().restore({ id, token, ...context,
      prepare: async () => {
        context.assertCurrent();
        await closeJournal();
        context.assertCurrent();
        const { assertSyncStoreSettled } = ChromeUtils.importESModule(new URL("./MidoriSyncDisconnect.sys.mjs", import.meta.url).href);
        await assertSyncStoreSettled({ identity: context.lease.readJournalIdentity(), localKeys: context.lease.readLocalKeys(),
          scope: context.lease.scope, deviceId: context.deviceId,
          directory: PathUtils.join(PathUtils.profileDir, "midori-sync", "journals"), openStore: openSyncStore });
      },
      writeIdentity: identity => {
        context.assertCurrent();
        return context.lease.writeJournalIdentity(identity);
      },
    }));
    syncScheduler?.hint({ urgent: true });
    notifySyncStatus();
  },

  deleteSavedJournal(id, token) {
    return maintainSavedJournals(context => savedJournals().remove({ id, token, activeId: context.activeId,
      assertCurrent: context.assertCurrent }));
  },

  protectSavedJournal(id, token) {
    return maintainSavedJournals(context => {
      if (!context.lease) { throw new SyncStoreError("keys_locked"); }
      return savedJournals().protect({ id, token, activeId: context.activeId,
        save: fingerprint => createProfileSyncSavedCustody().save({ id, fingerprint,
          scope: context.lease.scope, deviceId: context.deviceId,
          localKeys: context.lease.readLocalKeys(), assertCurrent: context.assertCurrent }) });
    });
  },

  async prepareEncryptionRotation({ allowPendingRotation = false } = {}) {
    if (manualSyncs) {
      throw new SyncStoreError("busy");
    }
    const owner = this.account;
    const generation = owner.snapshot.generation;
    ++manualSyncs;
    syncScheduler?.setAvailable(false);
    try {
      await backgroundSyncPromise?.catch(() => {});
      assertCurrentAccount(owner, generation);
      await closeJournal();
      assertCurrentAccount(owner, generation);
      const { assertSyncStoreSettled } = ChromeUtils.importESModule(new URL("./MidoriSyncDisconnect.sys.mjs", import.meta.url).href);
      await withLocalSecretsWhenIdle(owner, generation, lease => assertSyncStoreSettled({
        identity: lease.readJournalIdentity(), localKeys: lease.readLocalKeys(),
        scope: lease.scope, deviceId: lease.deviceId, allowPendingRotation,
        directory: PathUtils.join(PathUtils.profileDir, "midori-sync", "journals"), openStore: openSyncStore,
      }));
    } finally {
      --manualSyncs;
      updateSyncScheduling();
    }
  },

  async confirmEncryptionRotation(options) {
    if (encryptionTransitionPending || manualSyncs) {
      throw new SyncStoreError("busy");
    }
    encryptionTransitionPending = true;
    try {
      await this.prepareEncryptionRotation({ allowPendingRotation: true });
      return await this.keys.confirmRotation(options);
    } finally {
      encryptionTransitionPending = false;
      updateSyncScheduling();
    }
  },

  migrateEncryption(options = {}) {
    if (!encryptionMigrationPromise) {
      encryptionMigrationPromise = this.runEncryptionMigration(options).finally(() => {
        encryptionMigrationPromise = null;
      });
    }
    return encryptionMigrationPromise;
  },

  async runEncryptionMigration({ limit = 100, legacyDeletionDecisions = [] } = {}) {
    assertSyncTransferAllowed();
    if (manualSyncs || encryptionTransitionPending) {
      throw new SyncStoreError("busy");
    }
    const owner = this.account;
    const generation = owner.snapshot.generation;
    const { MidoriSyncRotation, finishSyncRotation } = ChromeUtils.importESModule(new URL("./MidoriSyncRotation.sys.mjs", import.meta.url).href);
    const { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
    const { MidoriSyncHistory } = ChromeUtils.importESModule(new URL("./MidoriSyncHistory.sys.mjs", import.meta.url).href);
    ++manualSyncs;
    syncScheduler?.setAvailable(false);
    let current;
    let store;
    let ownedJournal;
    try {
      await backgroundSyncPromise?.catch(() => {});
      assertCurrentAccount(owner, generation);
      await closeJournal();
      assertCurrentAccount(owner, generation);
      const opening = this.journal;
      ownedJournal = journal;
      store = await opening;
      assertCurrentAccount(owner, generation);
      const abort = new AbortController();
      const driver = new MidoriSyncRotation({
        keys: this.keys, journal: store, entryId: syncJournalEntryId,
        createId: () => Services.uuid.generateUUID().toString().slice(1, -1),
        history: new MidoriSyncHistory({ deriveRecordId: (collection, input) => this.keys.deriveRecordId(collection, input), allowLegacy: true }),
        request: (path, options) => {
          assertSyncTransferAllowed();
          return withAccountSecretsWhenIdle(owner, generation, lease => {
            assertSyncTransferAllowed();
            return lease.request(path, { ...options, signal: abort.signal });
          }, { signal: abort.signal });
        },
      });
      current = { driver, abort, promise: null };
      encryptionMigration = current;
      current.promise = finishSyncRotation(driver, { limit, legacyDeletionDecisions,
        onBatch: async () => {
          assertCurrentAccount(owner, generation);
          assertSyncTransferAllowed();
          await this.keys.refresh();
        },
        yieldControl: () => new Promise(resolve => setTimeout(resolve, 0)),
      });
      const result = await current.promise;
      if (!result.done) {
        await this.keys.refresh();
      }
      return { ...result, remaining: this.keys.snapshot.rotation?.live_records ?? result.remaining };
    } finally {
      if (current && encryptionMigration === current) {
        encryptionMigration = null;
      }
      current?.driver.close();
      try {
        if (ownedJournal && journal === ownedJournal) {
          await closeJournal();
        } else {
          await store?.close();
        }
      } finally {
        --manualSyncs;
        updateSyncScheduling();
      }
    }
  },















  async syncBookmarks({ limit = 100, inventory = false } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof inventory !== "boolean") {
      throw new SyncStoreError("invalid_capture_query");
    }
    const engine = await selectedSyncCollection(this, "bookmarks");
    const current = collections.get("bookmarks");
    if (!current?.tracker) {
      throw new SyncStoreError("capture_unavailable");
    }
    if (inventory) {
      current.tracker.requestInventory();
    }
    current.syncing ??= (async () => {
      if (!engine.snapshot.initialized || engine.snapshot.more) {
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
    const engine = await selectedSyncCollection(this, "history");
    const current = collections.get("history");
    if (!current?.tracker) {
      throw new SyncStoreError("capture_unavailable");
    }
    if (inventory) {
      current.tracker.requestInventory();
    }
    current.syncing ??= (async () => {
      const bootstrapping = !engine.snapshot.initialized;
      if (bootstrapping || engine.snapshot.more) {
        await engine.run();
        if (!engine.snapshot.initialized) {
          return { capture: null, collection: engine.snapshot, more: true };
        }
        if (bootstrapping) {
          current.tracker.restartAfterBootstrap();
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

  async clearHistory() {
    const engine = await selectedSyncCollection(this, "history");
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
    const engine = await selectedSyncCollection(this, "tabs");
    const current = collections.get("tabs");
    current.syncing ??= (async () => {
      if (!engine.snapshot.initialized || engine.snapshot.more) {
        await engine.run();
        if (!engine.snapshot.initialized) {
          return { capture: null, collection: engine.snapshot, more: true };
        }
      }
      const deviceId = this.account.snapshot.device.id;
      const previous = (await engine.record(deviceId))?.remote?.value ?? null;
      const capture = { checked: 0, queued: 0, pending: 0, conflicts: 0 };
      try {
        for (const id of await current.adapter.beginCapture({ previous })) {
          const result = await engine.capture(id);
          capture.checked++;
          if (result.status === "queued") {
            capture.queued++;
          } else if (result.status === "pending") {
            capture.pending++;
          } else if (result.status === "conflict") {
            capture.conflicts++;
          }
        }
      } finally {
        current.adapter.endCapture();
      }
      await engine.run();
      return { capture, collection: engine.snapshot, more: engine.snapshot.more };
    })().finally(() => { current.syncing = null; });
    return current.syncing;
  },

  async conflictPage(name, options) {
    if (manualSyncs || encryptionTransitionPending || sleeping || memoryPressure) {
      throw new SyncStoreError("busy");
    }
    return (await this.collection(name)).conflictPage(options);
  },

  async conflictPreview(name, options) {
    if (manualSyncs || encryptionTransitionPending || sleeping || memoryPressure) {
      throw new SyncStoreError("busy");
    }
    return (await this.collection(name)).conflictPreview(options);
  },

  async resolveConflict(name, options) {
    if (manualSyncs || encryptionTransitionPending) {
      throw new SyncStoreError("busy");
    }
    const owner = this.account;
    const generation = owner.snapshot.generation;
    ++manualSyncs;
    syncScheduler?.setAvailable(false);
    try {
      await backgroundSyncPromise?.catch(() => {});
      if (this.account !== owner || owner.snapshot.generation !== generation) {
        throw new SyncStoreError("cancelled");
      }
      const result = await (await this.collection(name)).resolveConflict(options);
      if (this.account !== owner || owner.snapshot.generation !== generation) {
        throw new SyncStoreError("cancelled");
      }
      syncStatuses.set(name, { error: null });
      notifySyncStatus();
      return result;
    } finally {
      --manualSyncs;
      updateSyncScheduling();
      syncScheduler?.hint({ urgent: true });
    }
  },

  async remoteTabs() {
    if (manualSyncs || encryptionTransitionPending || sleeping || memoryPressure) {
      throw new SyncStoreError("busy");
    }
    const deviceId = this.account.snapshot.device?.id;
    if (!SYNC_STORE_UUID.test(deviceId)) {
      throw new SyncStoreError("account_locked");
    }
    const { validateTabsRecord, assembleTabsSnapshot, defaultTabsDigest, tabsFragmentId } =
      ChromeUtils.importESModule(new URL("./MidoriSyncTabs.sys.mjs", import.meta.url).href);
    const store = await this.journal;
    const live = new Map();
    let after = null;
    for (let rows = await store.list("tabs", "record", { after, limit: 100 }); rows.length && live.size < 5000;
      rows = await store.list("tabs", "record", { after, limit: 100 })) {
      for (const row of rows) {
        const remote = row.value?.remote;
        if (!remote?.deleted && remote?.value && !(remote.ttl && Date.parse(remote.ttl) <= Date.now())) {
          live.set(remote.id, remote.value);
        }
      }
      after = rows.at(-1).id;
    }
    const result = [];
    for (const [id, value] of live) {
      if (id === deviceId || !SYNC_STORE_UUID.test(id) || result.length >= 32) {
        continue;
      }
      let manifest;
      try {
        manifest = validateTabsRecord(id, value);
      } catch {
        continue;
      }
      if (Date.parse(manifest.expires_at) <= Date.now()) {
        continue;
      }
      let snapshot = null;
      try {
        snapshot = await assembleTabsSnapshot(manifest, index => {
          const fragment = live.get(tabsFragmentId(id, index));
          return fragment ? validateTabsRecord(tabsFragmentId(id, index), fragment) : null;
        }, defaultTabsDigest);
      } catch {
        snapshot = null;
      }
      if (snapshot) {
        remoteTabsCache.set(id, snapshot);
      }
      const shown = snapshot ?? remoteTabsCache.get(id) ?? null;
      if (shown && Date.parse(shown.expires_at) > Date.now()) {
        result.push(shown);
      }
    }
    for (const id of remoteTabsCache.keys()) {
      if (!live.has(id)) {
        remoteTabsCache.delete(id);
      }
    }
    return result.sort((a, b) => a.device_name.localeCompare(b.device_name));
  },

  async syncPreferences({ limit = 100 } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new SyncStoreError("invalid_capture_query");
    }
    const engine = await selectedSyncCollection(this, "browser-settings");
    const current = collections.get("browser-settings");
    current.syncing ??= (async () => {
      if (!engine.snapshot.initialized || engine.snapshot.more) {
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
    const engine = await selectedSyncCollection(this, "passwords");
    const current = collections.get("passwords");
    if (!current?.tracker) {
      throw new SyncStoreError("capture_unavailable");
    }
    if (inventory) {
      current.tracker.requestInventory();
    }
    current.syncing ??= (async () => {
      if (!engine.snapshot.initialized || engine.snapshot.more) {
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
    const engine = await selectedSyncCollection(this, "credit-cards");
    const current = collections.get("credit-cards");
    if (!current?.tracker) {
      throw new SyncStoreError("capture_unavailable");
    }
    if (inventory) {
      current.tracker.requestInventory();
    }
    current.syncing ??= (async () => {
      if (!engine.snapshot.initialized || engine.snapshot.more) {
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

  syncFormHistory(options) {
    return syncTrackedCollection(this, "form-history", options);
  },

  syncWorkspaces(options) {
    return syncTrackedCollection(this, "workspaces", options);
  },

  syncPrivacyFilters(options) {
    return syncTrackedCollection(this, "midori-privacy", options);
  },

  syncPermissions(options) {
    return syncTrackedCollection(this, "site-permissions", options);
  },

  syncExtensionSettings(options) {
    return syncTrackedCollection(this, "extension-settings", options);
  },

  syncExtensions(options) {
    return syncTrackedCollection(this, "extensions", options);
  },

  async extensionInstallPage(options) {
    if (manualSyncs || encryptionTransitionPending || sleeping || memoryPressure) { throw new SyncStoreError("busy"); }
    const owner = this.account;
    const generation = owner.snapshot.generation;
    const engine = await selectedSyncCollection(this, "extensions");
    const page = await engine.pendingApplicationPage(options);
    if (this.account !== owner || owner.snapshot.generation !== generation) { throw new SyncStoreError("cancelled"); }
    return page;
  },

  async reviewExtensionInstall(options) {
    if (manualSyncs || encryptionTransitionPending) { throw new SyncStoreError("busy"); }
    const owner = this.account;
    const generation = owner.snapshot.generation;
    const ensureCurrent = () => {
      if (this.account !== owner || owner.snapshot.generation !== generation) { throw new SyncStoreError("cancelled"); }
    };
    ++manualSyncs;
    syncScheduler?.setAvailable(false);
    try {
      await backgroundSyncPromise?.catch(() => {});
      ensureCurrent();
      const engine = await selectedSyncCollection(this, "extensions");
      ensureCurrent();
      await engine.reviewApplication(options);
      ensureCurrent();
      assertSyncTransferAllowed("extensions");
    } finally {
      --manualSyncs;
      updateSyncScheduling();
      syncScheduler?.hint({ urgent: true });
      notifySyncStatus();
    }
  },

  syncAddresses(options) {
    return syncTrackedCollection(this, "addresses", options);
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

  async runBackgroundSync({ inventory = false } = {}) {
    assertSyncTransferAllowed();
    if (!Services.io.offline && this.account.snapshot.status !== "local") {
      this.refreshEnrollmentRequests().catch(() => {});
    }
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
    if (this === MidoriSyncService && (encryptionTransitionPending || this.keys.snapshot.rotation?.phase === "rewriting")) {
      throw new SyncStoreError("encryption_rotation_required");
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || typeof inventory !== "boolean" ||
        typeof promptPasswords !== "boolean" || typeof background !== "boolean" || (background && promptPasswords)) {
      throw new SyncStoreError("invalid_capture_query");
    }
    assertSyncTransferAllowed();
    updateSyncControls();
    const controlsVersion = syncControlVersion;
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
      if (this === MidoriSyncService && !Services.io.offline &&
          ["connected", "renewal-required"].includes(owner?.snapshot.status) &&
          SYNC_COLLECTION_NAMES.some(name => collectionEnabled(name) &&
            !syncCollectionSupported(name, owner.snapshot, this.connection.snapshot))) {
        await this.connection.refreshCapabilities({ maxAge: 300000, background: true });
      }
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
      for (const [name, method] of [["tabs", "syncTabs"], ["bookmarks", "syncBookmarks"], ["history", "syncHistory"],
        ["passwords", "syncPasswords"], ["credit-cards", "syncCreditCards"],
        ["form-history", "syncFormHistory"], ["addresses", "syncAddresses"], ["workspaces", "syncWorkspaces"],
        ["midori-privacy", "syncPrivacyFilters"], ["site-permissions", "syncPermissions"],
        ["extension-settings", "syncExtensionSettings"], ["extensions", "syncExtensions"], ["browser-settings", "syncPreferences"]]) {
        assertSyncTransferAllowed();
        if (syncControlVersion !== controlsVersion) { throw new SyncStoreError("cancelled"); }
        if (!collectionEnabled(name) || !syncCollectionSupported(name, owner?.snapshot, this.connection?.snapshot)) {
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
          collectionsResult[name] = this === MidoriSyncService && (Services.io.offline || owner.snapshot.status === "local") ?
            await captureOfflineCollection(this, name, { limit, inventory }) : await this[method]({ limit, inventory });
          assertSyncTransferAllowed();
          if (syncControlVersion !== controlsVersion) { throw new SyncStoreError("cancelled"); }
          if (this === MidoriSyncService && owner.snapshot.generation === generation &&
              collectionsResult[name]?.collection?.initialized) {
            if (!collectionsResult[name].offline && !collectionsResult[name].more) {
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
          assertSyncTransferAllowed();
          if (syncControlVersion !== controlsVersion) { throw new SyncStoreError("cancelled"); }
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
    if (this === MidoriSyncService && journalMaintenance) {
      throw new SyncStoreError("busy");
    }
    if (this === MidoriSyncService && (encryptionTransitionPending || this.keys.snapshot.rotation?.phase === "rewriting")) {
      throw new SyncStoreError("encryption_rotation_required");
    }
    const owner = this.account;
    if (!collectionEnabled(name)) {
      throw new SyncStoreError("collection_disabled");
    }
    if (!syncCollectionSupported(name, owner?.snapshot, this.connection?.snapshot)) {
      throw new SyncStoreError("collection_unsupported");
    }
    const generation = owner.snapshot.generation;
    let current = collections.get(name);
    if (current) {
      if (adapter !== undefined && current.adapter !== adapter) {
        throw new SyncStoreError("collection_in_use");
      }
      return current.promise;
    }
    const nativeCapture = adapter === undefined && SYNC_COLLECTION_NAMES.includes(name);
    if (adapter === undefined) {
      if (!nativeCapture) {
        throw new SyncStoreError("collection_adapter_unavailable");
      }
      if (name === "bookmarks") {
        const { MidoriSyncBookmarks } = ChromeUtils.importESModule(new URL("./MidoriSyncBookmarks.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncBookmarks();
      } else if (name === "history") {
        const { MidoriSyncHistory } = ChromeUtils.importESModule(new URL("./MidoriSyncHistory.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncHistory({
          deriveRecordId: (collection, input) => this.keys.deriveRecordId(collection, input),
          allowLegacy: this.keys.snapshot.custody === "transition",
        });
      } else if (name === "tabs") {
        const { MidoriSyncTabs } = ChromeUtils.importESModule(new URL("./MidoriSyncTabs.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncTabs({ deviceId: owner.snapshot.device.id, deviceName: owner.snapshot.device.name });
      } else if (name === "credit-cards") {
        const { MidoriSyncCreditCards } = ChromeUtils.importESModule(new URL("./MidoriSyncCreditCards.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncCreditCards();
      } else if (name === "form-history") {
        const { MidoriSyncFormHistory } = ChromeUtils.importESModule(new URL("./MidoriSyncFormHistory.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncFormHistory({
          deriveRecordId: (collection, input) => this.keys.deriveRecordId(collection, input),
        });
      } else if (name === "addresses") {
        const { MidoriSyncAddresses } = ChromeUtils.importESModule(new URL("./MidoriSyncAddresses.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncAddresses();
      } else if (name === "workspaces") {
        const { MidoriSyncWorkspaces } = ChromeUtils.importESModule(new URL("./MidoriSyncWorkspaces.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncWorkspaces();
      } else if (name === "midori-privacy") {
        const { MidoriSyncPrivacyFilters } = ChromeUtils.importESModule(new URL("./MidoriSyncPrivacyFilters.sys.mjs", import.meta.url).href);
        const { MidoriBlockerService, normalizeCustomFiltersText } = ChromeUtils.importESModule("resource:///modules/MidoriBlockerService.sys.mjs");
        adapter = new MidoriSyncPrivacyFilters({ producer: MidoriBlockerService,
          deriveRecordId: (collection, input) => this.keys.deriveRecordId(collection, input),
          record: id => current.engine.record(id), normalize: normalizeCustomFiltersText });
      } else if (name === "site-permissions") {
        const { MidoriSyncPermissions } = ChromeUtils.importESModule(new URL("./MidoriSyncPermissions.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncPermissions({
          deriveRecordId: (collection, input) => this.keys.deriveRecordId(collection, input),
          record: id => current.engine.record(id),
        });
      } else if (name === "extension-settings") {
        const { MidoriSyncExtensionSettings } = ChromeUtils.importESModule(new URL("./MidoriSyncExtensionSettings.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncExtensionSettings({
          deriveRecordId: (collection, input) => this.keys.deriveRecordId(collection, input),
          record: id => current.engine.record(id),
        });
      } else if (name === "extensions") {
        const { MidoriSyncExtensions } = ChromeUtils.importESModule(new URL("./MidoriSyncExtensions.sys.mjs", import.meta.url).href);
        adapter = new MidoriSyncExtensions({
          deriveRecordId: (collection, input) => this.keys.deriveRecordId(collection, input),
          record: id => current.engine.record(id),
        });
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
        pageByteBudget: this.connection.snapshot.capabilities?.pageByteBudget === true,
        createId: () => Services.uuid.generateUUID().toString().slice(1, -1),
        request: (path, options) => {
          assertSyncTransferAllowed(name);
          if (!syncCollectionSupported(name, owner.snapshot, this.connection?.snapshot)) {
            throw new SyncStoreError("collection_unsupported");
          }
          return withAccountSecretsWhenIdle(owner, generation, async lease => {
            assertSyncTransferAllowed(name);
            if (!syncCollectionSupported(name, owner.snapshot, this.connection?.snapshot)) {
              throw new SyncStoreError("collection_unsupported");
            }
            if (lease.generation !== generation) {
              throw new SyncStoreError("cancelled");
            }
            if (Services.io.offline || owner.snapshot.status === "local" || this.keys.snapshot.localOnly) {
              throw new SyncStoreError("remote_access_unavailable");
            }
            return lease.request(path, options);
          }, { signal: options.signal });
        },
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
      } else if (nativeCapture && ["credit-cards", "workspaces", "midori-privacy", "site-permissions", "extensions", "extension-settings"].includes(name)) {
        const { MidoriSyncRecordTracker } = ChromeUtils.importESModule(new URL("./MidoriSyncPasswordTracker.sys.mjs", import.meta.url).href);
        current.tracker = new MidoriSyncRecordTracker({ engine, adapter,
          onChange: () => syncScheduler?.hint({ urgent: true }) });
      } else if (nativeCapture && name === "form-history") {
        const { MidoriSyncFormHistoryTracker } = ChromeUtils.importESModule(new URL("./MidoriSyncFormHistoryTracker.sys.mjs", import.meta.url).href);
        current.tracker = new MidoriSyncFormHistoryTracker({ engine, adapter,
          onChange: () => syncScheduler?.hint({ urgent: true }) });
      } else if (nativeCapture && name === "addresses") {
        const { MidoriSyncAddressTracker } = ChromeUtils.importESModule(new URL("./MidoriSyncAddressTracker.sys.mjs", import.meta.url).href);
        current.tracker = new MidoriSyncAddressTracker({ engine, adapter,
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
