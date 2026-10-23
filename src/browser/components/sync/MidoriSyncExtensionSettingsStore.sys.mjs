/* This Source Code Form is subject to the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";
import { classifySyncExtension, validateSyncExtensionIdentity } from "./MidoriSyncExtensionModel.sys.mjs";
import { createSyncExtensionStore, sameNativeSyncExtension } from "./MidoriSyncExtensionStore.sys.mjs";
import { parseSyncExtensionSettings, normalizeSyncExtensionSettings, serializeSyncExtensionSettings } from "./MidoriSyncExtensionSettingsModel.sys.mjs";

const TOPIC = "midori-sync-extension-settings-changed";
const sameScope = (left, right) => left.catalog === right.catalog && left.addonId === right.addonId &&
  left.status === right.status && left.source === right.source && left.reason === right.reason &&
  sameNativeSyncExtension(left.native, right.native);
export const sameNativeSyncExtensionSettings = (left, right) => !!left && !!right &&
  Object.hasOwn(left, "native") && Object.hasOwn(right, "native") && left.native !== undefined && right.native !== undefined &&
  sameScope(left, right) && left.raw === right.raw;

export function createSyncExtensionSettingsStore(options = {}) {
  const references = options.references ?? createSyncExtensionStore();
  const storage = options.storage ?? ChromeUtils.importESModule("resource://gre/modules/ExtensionStorageSync.sys.mjs").extensionStorageSync;
  const observers = options.observers ?? Services.obs;
  const permissions = options.permissions ?? ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs").ExtensionPermissions;
  const removalSource = options.removalSource ?? (id => ChromeUtils.importESModule("resource://gre/modules/addons/XPIExports.sys.mjs")
    .XPIExports.XPIDatabase.getSyncAddonState(id)?.removal?.source ?? null);
  const hasPermission = options.hasPermission ?? (async id => {
    const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    const addon = await AddonManager.getAddonByID(id);
    return addon?.userPermissions?.permissions.includes("storage") || (await permissions.get(id)).permissions.includes("storage");
  });
  const isQuotaError = options.isQuotaError ?? (error => error instanceof ChromeUtils.importESModule(
    "moz-src:///toolkit/components/uniffi-bindgen-gecko-js/components/generated/RustWebextstorage.sys.mjs").QuotaError);
  if (["read", "persist", "list", "observe"].some(name => typeof references?.[name] !== "function") ||
      ["readSyncSnapshot", "replaceSyncSnapshot"].some(name => typeof storage?.[name] !== "function") ||
      ["addObserver", "removeObserver"].some(name => typeof observers?.[name] !== "function") ||
      ["addListener", "removeListener"].some(name => typeof permissions?.[name] !== "function") ||
      [removalSource, hasPermission, isQuotaError].some(callback => typeof callback !== "function")) {
    throw new SyncProtocolError("invalid_adapter");
  }
  const read = async (catalog, addonId) => {
    validateSyncExtensionIdentity(catalog, addonId);
    try {
      const native = await references.read(catalog, addonId);
      const projected = classifySyncExtension(native);
      const source = native?.scope === "absent" ? removalSource(addonId) : null;
      let status;
      let reason = null;
      if (projected.kind === "local") {
        status = "local";
        reason = `extension_settings_${projected.reason}`;
      } else if (projected.kind === "portable") {
        status = await hasPermission(addonId) ? "portable" : "local";
        if (status === "local") { reason = "extension_settings_permission"; }
      } else if (projected.kind === "removed") {
        status = "removed";
      } else if (source === null || source === "sync") {
        status = "cached";
      } else {
        status = "local";
        reason = source === "policy" ? "extension_settings_policy" : "extension_settings_unavailable";
      }
      const raw = status === "local" ? null : await storage.readSyncSnapshot(addonId);
      const data = raw === null ? null : parseSyncExtensionSettings(raw);
      if (!sameNativeSyncExtension(await references.read(catalog, addonId), native)) {
        throw new SyncProtocolError("native_read_failed");
      }
      return { catalog, addonId, native: structuredClone(native), source, status, reason,
        raw, data: status === "removed" ? null : data };
    } catch { throw new SyncProtocolError("native_read_failed"); }
  };
  const persist = async (catalog, addonId, expected) => {
    expected = structuredClone(expected);
    const current = await read(catalog, addonId);
    if (!sameNativeSyncExtensionSettings(current, expected) || current.status === "local") { return false; }
    try {
      const desired = current.status === "removed" ? "{}" : current.raw;
      if (!await storage.replaceSyncSnapshot(addonId, current.raw, desired)) { return false; }
      const after = await read(catalog, addonId);
      if (!sameScope(current, after) || after.raw !== desired) { return false; }
      if (!await references.persist(catalog, addonId, current.native, { preserveData: true })) { return false; }
      return sameNativeSyncExtensionSettings(await read(catalog, addonId), after);
    } catch { throw new SyncProtocolError("native_write_failed"); }
  };
  const write = async ({ catalog, addonId, desired, expected }) => {
    validateSyncExtensionIdentity(catalog, addonId);
    desired = desired === null ? null : normalizeSyncExtensionSettings(desired);
    expected = structuredClone(expected);
    const current = await read(catalog, addonId);
    if (current.status === "local") { return { status: "deferred", reason: current.reason }; }
    if (!sameNativeSyncExtensionSettings(current, expected)) { return { status: "deferred", reason: "extension_settings_local_changed" }; }
    if (current.status === "removed" && desired !== null) {
      return { status: "deferred", reason: "extension_settings_uninstalled" };
    }
    try {
      const raw = desired === null ? "{}" : serializeSyncExtensionSettings(desired);
      if (!await storage.replaceSyncSnapshot(addonId, current.raw, raw)) {
        return { status: "deferred", reason: "extension_settings_local_changed" };
      }
      const after = await read(catalog, addonId);
      if (!sameScope(current, after) || serializeSyncExtensionSettings(after.data ?? {}) !== raw) {
        return { status: "deferred", reason: "extension_settings_local_changed" };
      }
      if (!await references.persist(catalog, addonId, current.native, { preserveData: true }) ||
          !sameNativeSyncExtensionSettings(await read(catalog, addonId), after)) {
        return { status: "deferred", reason: "extension_settings_local_changed" };
      }
      return { status: "applied" };
    } catch (error) {
      if (isQuotaError(error)) { return { status: "deferred", reason: "extension_settings_quota" }; }
      throw new SyncProtocolError("native_write_failed");
    }
  };
  return {
    read, persist, write,
    async list() {
      const inventory = await references.list();
      if (!Array.isArray(inventory)) { throw new SyncProtocolError("native_read_failed"); }
      const entries = [];
      for (const native of inventory) { entries.push(await read(native.catalog, native.addonId)); }
      return entries;
    },
    observe(listener) {
      if (typeof listener !== "function") { throw new SyncProtocolError("invalid_capture_query"); }
      let active = true;
      const changed = addonId => {
        if (!active || typeof addonId !== "string") { return; }
        try { validateSyncExtensionIdentity("amo", addonId); } catch { return; }
        listener({ catalog: "amo", addonId });
      };
      const observer = (_subject, _topic, addonId) => changed(addonId);
      const permission = (...args) => changed(args.at(-1)?.extensionId);
      const stop = references.observe(event => { if (active) { listener(event); } });
      observers.addObserver(observer, TOPIC);
      permissions.addListener(permission);
      return () => {
        if (!active) { return; }
        active = false;
        stop();
        observers.removeObserver(observer, TOPIC);
        permissions.removeListener(permission);
      };
    },
  };
}
