/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";
import { validateSyncExtension, validateSyncExtensionIdentity, classifySyncExtension } from "./MidoriSyncExtensionModel.sys.mjs";

const nativeFields = ["catalog", "addonId", "scope", "enabled", "availability", "instance", "version", "removalToken", "removedByUser"];
export const sameNativeSyncExtension = (left, right) => left === null || right === null ? left === right :
  nativeFields.every(field => left[field] === right[field]);
const sameValue = (native, desired) => {
  const current = classifySyncExtension(native);
  return desired === null ? ["missing", "removed"].includes(current.kind) :
    current.kind === "portable" && current.value.enabled === desired.enabled;
};

export function isSyncExtensionDownload(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["addons.mozilla.org", "addons.mozilla.net"].includes(url.hostname) &&
      ["/firefox/downloads/", "/user-media/addons/"].some(prefix => url.pathname.startsWith(prefix));
  } catch { return false; }
}

function normalBrowser() {
  const { PrivateBrowsingUtils } = ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs");
  for (const window of Services.wm.getEnumerator("navigator:browser")) {
    if (!window.closed && !PrivateBrowsingUtils.isWindowPrivate(window) && window.gBrowser?.selectedBrowser) {
      return window.gBrowser.selectedBrowser;
    }
  }
  return null;
}

function waitForCatalog(promise, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (complete, value) => {
      if (settled) { return; }
      settled = true;
      signal.removeEventListener("abort", abort);
      complete(value);
    };
    const abort = () => finish(reject, new SyncProtocolError("cancelled"));
    signal.addEventListener("abort", abort, { once: true });
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
    if (signal.aborted) { abort(); }
  });
}

export function createSyncExtensionStore(options = {}) {
  const addons = options.addons ?? ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs").AddonManager;
  const repository = options.repository ?? ChromeUtils.importESModule("resource://gre/modules/addons/AddonRepository.sys.mjs").AddonRepository;
  const exports = options.native ?? ChromeUtils.importESModule("resource://gre/modules/addons/XPIExports.sys.mjs").XPIExports;
  const extensionStorage = options.extensionStorage ?? ChromeUtils.importESModule("resource://gre/modules/ExtensionStorage.sys.mjs").ExtensionStorage;
  const extensionPermissions = options.extensionPermissions ?? ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs").ExtensionPermissions;
  const database = () => exports.XPIDatabase;
  const states = () => exports.XPIInternal.XPIStates;
  const getBrowser = options.getBrowser ?? normalBrowser;
  const persistPreferences = options.persistPreferences ?? (() => Services.prefs.flushPrefFile());
  const isManaged = options.isManaged ?? (id => {
    const setting = Services.policies?.getExtensionSettings(id);
    return setting?.installation_mode && setting.installation_mode !== "allowed";
  });
  const signed = addon => typeof addon?.signedState === "number" &&
    [addons.SIGNEDSTATE_SIGNED, addons.SIGNEDSTATE_PRIVILEGED].includes(addon.signedState);
  const snapshot = (addonId, addon) => {
    const removal = database().getSyncAddonState(addonId)?.removal;
    if (!addon) {
      if (isManaged(addonId)) { return { catalog: "amo", addonId, scope: "policy", removalToken: removal?.token ?? null }; }
      return removal ? { catalog: "amo", addonId, scope: "absent", removedByUser: removal.source === "user", removalToken: removal.token } : null;
    }
    let scope = "user";
    if (addon.temporarilyInstalled) { scope = "temporary"; }
    else if (addon.isSystem || addon.isBuiltin) { scope = "system"; }
    else if (!addon.isSyncable || addon.type !== "extension" || !signed(addon)) { scope = "unsupported"; }
    else if (isManaged(addonId) || !(addon.permissions & addons.PERM_CAN_UNINSTALL)) { scope = "policy"; }
    return { catalog: "amo", addonId, scope, enabled: !addon.userDisabled,
      availability: !addon.isCompatible ? "incompatible" : addon.appDisabled ? "blocked" : "ready",
      instance: addon.syncGUID, version: addon.version, removalToken: removal?.token ?? null };
  };
  const read = async (catalog, addonId) => {
    validateSyncExtensionIdentity(catalog, addonId);
    await database().asyncLoadDB();
    return snapshot(addonId, await addons.getAddonByID(addonId));
  };
  const saveBoth = async () => {
    try {
      await database().saveSyncChanges();
      await states().saveSyncChanges();
      await persistPreferences();
    } catch { throw new SyncProtocolError("native_write_failed"); }
  };
  const persist = async (catalog, addonId, expected, { preserveData = false } = {}) => {
    expected = structuredClone(expected);
    if (!sameNativeSyncExtension(await read(catalog, addonId), expected)) { return false; }
    const isCurrent = () => sameNativeSyncExtension(snapshot(addonId, database().getSyncAddonByID(addonId)), expected);
    if (classifySyncExtension(expected).kind === "portable") {
      try {
        if (!await extensionPermissions.persistSyncChanges(addonId, isCurrent)) { return false; }
      } catch { throw new SyncProtocolError("native_write_failed"); }
      await database().trackSyncAddon(addonId);
    } else if (!preserveData && (expected === null || expected.scope === "absent")) {
      try {
        if (!await extensionPermissions.persistSyncRemoval(addonId, isCurrent)) { return false; }
        if (expected?.scope === "absent" && database().getSyncAddonState(addonId)?.removal?.source !== "sync" &&
            !await extensionStorage.persistSyncRemoval(addonId, isCurrent)) { return false; }
      } catch { throw new SyncProtocolError("native_write_failed"); }
    }
    await saveBoth();
    return sameNativeSyncExtension(await read(catalog, addonId), expected);
  };
  const write = async ({ catalog, addonId, desired, expected }) => {
    validateSyncExtensionIdentity(catalog, addonId);
    desired = desired === null ? null : validateSyncExtension(desired);
    if (desired && (desired.catalog !== catalog || desired.addonId !== addonId)) { throw new SyncProtocolError("invalid_application"); }
    expected = structuredClone(expected);
    const current = await read(catalog, addonId);
    const projection = classifySyncExtension(current);
    if (projection.kind === "local") { return { status: "deferred", reason: `extension_${projection.reason}` }; }
    if (!sameValue(current, desired) && !sameNativeSyncExtension(current, expected)) {
      return { status: "deferred", reason: "extension_local_changed" };
    }
    if (desired?.enabled && projection.kind === "portable" && projection.availability !== "ready") {
      return { status: "deferred", reason: `extension_${projection.availability}` };
    }
    if (!sameValue(current, desired)) {
      const addon = await addons.getAddonByID(addonId);
      if (!sameNativeSyncExtension(snapshot(addonId, addon), current)) { return { status: "deferred", reason: "extension_local_changed" }; }
      if (!addon) { return { status: "deferred", reason: "extension_install_required" }; }
      if (desired === null) {
        await addon.uninstall(false, { syncSource: "sync" });
      } else {
        const permission = desired.enabled ? addons.PERM_CAN_ENABLE : addons.PERM_CAN_DISABLE;
        if (!(addon.permissions & permission)) { return { status: "deferred", reason: "extension_policy" }; }
        await (desired.enabled ? addon.enable() : addon.disable());
      }
    }
    const after = await read(catalog, addonId);
    if (!sameValue(after, desired)) { return { status: "deferred", reason: "extension_local_changed" }; }
    return await persist(catalog, addonId, after) ? { status: "applied" } : { status: "deferred", reason: "extension_local_changed" };
  };
  return {
    read, persist, write,
    async list() {
      await database().asyncLoadDB();
      const inventory = await addons.getAddonsByTypes(["extension"]);
      const ids = new Set(inventory.map(addon => addon.id));
      return [...inventory.map(addon => snapshot(addon.id, addon)),
        ...database().getSyncAddonStates().filter(item => !ids.has(item.addonId)).map(item => snapshot(item.addonId, null))];
    },
    async install({ desired, expected, signal, beforePermissionPrompt }) {
      desired = validateSyncExtension(desired);
      if (typeof beforePermissionPrompt !== "function" || !signal || typeof signal.addEventListener !== "function") {
        throw new SyncProtocolError("invalid_application");
      }
      const ensureActive = () => { if (signal.aborted) { throw new SyncProtocolError("cancelled"); } };
      const checkCurrent = async () => {
        ensureActive();
        if (!sameNativeSyncExtension(await read(desired.catalog, desired.addonId), expected)) {
          throw new SyncProtocolError("extension_local_changed");
        }
        ensureActive();
      };
      ensureActive();
      if (isManaged(desired.addonId)) { return { status: "deferred", reason: "extension_policy" }; }
      await checkCurrent();
      const browser = getBrowser();
      if (!browser) { return { status: "deferred", reason: "extension_window_required" }; }
      let results;
      try { results = await waitForCatalog(repository.getAddonsByIDs([desired.addonId]), signal); }
      catch {
        ensureActive();
        return { status: "deferred", reason: "extension_download_failed" };
      }
      await checkCurrent();
      if (!Array.isArray(results)) { throw new SyncProtocolError("invalid_adapter_result"); }
      const matches = results.filter(addon => addon.id === desired.addonId && addon.type === "extension");
      if (matches.length !== 1 || !isSyncExtensionDownload(matches[0].sourceURI?.spec)) {
        return { status: "deferred", reason: "extension_unavailable" };
      }
      const result = matches[0];
      const install = await addons.getInstallForURL(result.sourceURI.spec, {
        id: desired.addonId, type: "extension", name: result.name,
        telemetryInfo: { source: "sync" }, browser,
      });
      let prompted = false;
      let vetoReason = null;
      try {
        await checkCurrent();
        if (!install) { return { status: "deferred", reason: "extension_unavailable" }; }
        const validInstall = () => install.addon?.id === desired.addonId && install.addon.type === "extension" && signed(install.addon);
        const blockReason = () => !validInstall() ? "extension_unavailable" : isManaged(desired.addonId) ? "extension_policy" :
          install.addon.isCompatible !== true ? "extension_incompatible" : install.addon.appDisabled ? "extension_blocked" : null;
        return await new Promise((resolve, reject) => {
          let finished = false;
          const finish = (value, error = null) => {
            if (finished) { return; }
            finished = true;
            install.removeListener(listener);
            signal.removeEventListener("abort", abort);
            if (error) { reject(error); } else { resolve(value); }
          };
          const abort = () => {
            finish(null, new SyncProtocolError("cancelled"));
            try { install.cancel(); } catch {}
          };
          const cancelled = () => {
            try {
              const unchanged = sameNativeSyncExtension(snapshot(desired.addonId, database().getSyncAddonByID(desired.addonId)), expected);
              finish({ status: "deferred", reason: !unchanged ? "extension_local_changed" : vetoReason ?? (prompted ? "extension_permission_declined" : "extension_cancelled") });
            } catch (error) { finish(null, error); }
          };
          const listener = {
            onDownloadCancelled: cancelled, onInstallCancelled: cancelled,
            onDownloadFailed: () => finish({ status: "deferred", reason: "extension_download_failed" }),
            onInstallFailed: () => finish({ status: "deferred", reason: "extension_install_failed" }),
            onDownloadEnded() {
              const reason = blockReason();
              if (reason) {
                finish({ status: "deferred", reason });
                install.cancel();
                return false;
              }
              return true;
            },
            onInstallStarted() {
              try {
                if (signal.aborted) { abort(); return false; }
                const reason = blockReason();
                if (reason) { finish({ status: "deferred", reason }); return false; }
                if (!sameNativeSyncExtension(snapshot(desired.addonId, database().getSyncAddonByID(desired.addonId)), expected)) {
                  finish({ status: "deferred", reason: "extension_local_changed" });
                  return false;
                }
                if (!desired.enabled) { install.addon.disable().catch(error => finish(null, error)); }
                return true;
              } catch (error) { finish(null, error); return false; }
            },
            onInstallEnded(_install, addon) {
              (async () => {
                ensureActive();
                if (addon.id !== desired.addonId || !signed(addon)) { throw new SyncProtocolError("invalid_adapter_result"); }
                const current = await read(desired.catalog, desired.addonId);
                if (current?.instance !== addon.syncGUID || !sameValue(current, desired)) {
                  return { status: "deferred", reason: "extension_local_changed" };
                }
                return await persist(desired.catalog, desired.addonId, current) ? { status: "applied" } :
                  { status: "deferred", reason: "extension_local_changed" };
              })().then(value => finish(value), error => finish(null, error));
            },
          };
          install.addListener(listener);
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) { abort(); return; }
          try {
            addons.installAddonFromAOMWithOptions(browser, result.sourceURI, install, {
              beforePermissionPrompt: async () => {
                try {
                  await checkCurrent();
                  let reason = blockReason();
                  if (reason) { throw new SyncProtocolError(reason); }
                  if (!await persist(desired.catalog, desired.addonId, expected)) {
                    throw new SyncProtocolError("extension_local_changed");
                  }
                  await beforePermissionPrompt();
                  await checkCurrent();
                  reason = blockReason();
                  if (reason) { throw new SyncProtocolError(reason); }
                  prompted = true;
                } catch (error) {
                  if (/^extension_[a-z_]{1,49}$/.test(error.code)) { vetoReason = error.code; }
                  throw error;
                }
              },
            });
          } catch (error) { finish(null, error); try { install.cancel(); } catch {} }
        });
      } catch (error) {
        try { install?.cancel(); } catch {}
        throw error;
      }
    },
    observe(listener) {
      const changed = addon => listener({ catalog: "amo", addonId: addon.id });
      const observer = Object.fromEntries(["onInstalled", "onEnabled", "onDisabled", "onUninstalled", "onOperationCancelled", "onPropertyChanged"]
        .map(name => [name, changed]));
      addons.addAddonListener(observer);
      return () => addons.removeAddonListener(observer);
    },
  };
}
