/* This Source Code Form is subject to the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";
import { SYNC_PERMISSION_SPECS, validateSyncPermission, validateSyncPermissionIdentity,
  classifySyncPermission, syncPermissionNativeValue } from "./MidoriSyncPermissionModel.sys.mjs";

const nativeFields = ["origin", "permission", "capability", "expireType", "expireTime", "modificationTime", "scope"];
export const sameNativeSyncPermission = (left, right) => left === null || right === null ? left === right :
  nativeFields.every(field => left[field] === right[field]);
const sameValue = (left, right) => left === null || right === null ? left === right :
  ["origin", "permission", "action", "expiresAt"].every(field => left[field] === right[field]);

export function createSyncPermissionStore({ permissions = Services.perms, observers = Services.obs,
  principalForOrigin = origin => Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin),
  asPermission = subject => subject.QueryInterface(Ci.nsIPermission), now = Date.now } = {}) {
  if (["getPermissionObject", "getPermissionSourceFromPrincipal", "addFromPrincipal", "removeFromPrincipal", "persistPermissionFromPrincipal"]
    .some(name => typeof permissions?.[name] !== "function") ||
      typeof principalForOrigin !== "function" || typeof asPermission !== "function" || typeof now !== "function") {
    throw new SyncProtocolError("invalid_adapter");
  }
  const snapshot = (permission, source) => {
    if (permission === null) {
      return null;
    }
    return { origin: permission.principal.origin, permission: permission.type,
      capability: permission.capability, expireType: permission.expireType,
      expireTime: permission.expireTime, modificationTime: permission.modificationTime, scope: source };
  };
  const read = (origin, type) => {
    validateSyncPermissionIdentity(origin, type);
    const principal = principalForOrigin(origin);
    for (let attempt = 0; attempt < 3; ++attempt) {
      const source = permissions.getPermissionSourceFromPrincipal(principal, type);
      if (source === "absent") { return null; }
      if (["default", "expired", "unsupported", "omitted"].includes(source)) {
        return { origin, permission: type, capability: 0, expireType: 0, expireTime: 0, modificationTime: 0, scope: source };
      }
      const permission = permissions.getPermissionObject(principal, type, true);
      if (permission && source === permissions.getPermissionSourceFromPrincipal(principal, type)) {
        return snapshot(permission, source);
      }
    }
    throw new SyncProtocolError("native_read_failed");
  };
  const persist = async (origin, type, expected) => {
    expected = structuredClone(expected);
    if (!sameNativeSyncPermission(read(origin, type), expected)) {
      return false;
    }
    let saved;
    try {
      saved = await permissions.persistPermissionFromPrincipal(principalForOrigin(origin), type);
    } catch {
      throw new SyncProtocolError("native_write_failed");
    }
    if (typeof saved !== "boolean") {
      throw new SyncProtocolError("invalid_adapter_result");
    }
    return saved && sameNativeSyncPermission(read(origin, type), expected);
  };
  return {
    list: () => Array.from(permissions.all).filter(permission => permission.type !== "midori-blocker-pb" &&
      !permission.type.startsWith("midori-sync-omitted^"))
      .map(permission => snapshot(permission,
        permissions.getPermissionSourceFromPrincipal(permission.principal, permission.type))),
    read,
    persist,
    async write({ origin, permission, expected, desired }) {
      validateSyncPermissionIdentity(origin, permission);
      expected = structuredClone(expected);
      desired = desired === null ? null : validateSyncPermission(desired);
      if (desired && (desired.origin !== origin || desired.permission !== permission)) {
        throw new SyncProtocolError("invalid_application");
      }
      if (desired?.expiresAt !== null && desired?.expiresAt !== undefined && desired.expiresAt <= now()) {
        return { status: "applied" };
      }
      const current = read(origin, permission);
      const projection = classifySyncPermission(current, now());
      if (projection.kind === "local" && ["session", "policy", "private"].includes(projection.reason)) {
        return { status: "deferred", reason: `permission_${projection.reason}` };
      }
      if (projection.kind === "local" && projection.reason === "unsupported") {
        return { status: "conflict", reason: "permission_unsupported" };
      }
      const matching = projection.kind !== "local" && !(["expired", "excluded"].includes(projection.kind) && desired === null) &&
        sameValue(projection.kind === "portable" ? projection.value : null, desired);
      if (!matching && !sameNativeSyncPermission(current, expected)) {
        return { status: "deferred", reason: "permission_local_changed" };
      }
      if (!matching) {
        const principal = principalForOrigin(origin);
        if (desired === null) {
          if (projection.kind === "local") {
            return { status: "conflict", reason: "permission_changed" };
          }
          permissions.removeFromPrincipal(principal, permission);
        } else {
          const value = syncPermissionNativeValue(desired);
          permissions.addFromPrincipal(principal, permission, value.capability, value.expireType, value.expireTime);
        }
      }
      const after = read(origin, permission);
      const actual = classifySyncPermission(after, now());
      if (actual.kind === "local" || !sameValue(actual.kind === "portable" ? actual.value : null, desired)) {
        return { status: "deferred", reason: "permission_local_changed" };
      }
      return await persist(origin, permission, after) ? { status: "applied" } :
        { status: "deferred", reason: "permission_local_changed" };
    },
    observe(listener) {
      if (typeof listener !== "function") {
        throw new SyncProtocolError("invalid_capture_query");
      }
      const observer = { observe(subject, _topic, reason) {
        if (reason === "cleared") {
          listener({ rescan: true });
          return;
        }
        if (!subject) { return; }
        const permission = asPermission(subject);
        if (Object.hasOwn(SYNC_PERMISSION_SPECS, permission.type) && !permission.principal.originAttributes.privateBrowsingId) {
          listener({ rescan: true });
        }
      } };
      observers.addObserver(observer, "perm-changed");
      let active = true;
      return () => {
        if (active) {
          active = false;
          observers.removeObserver(observer, "perm-changed");
        }
      };
    },
  };
}
