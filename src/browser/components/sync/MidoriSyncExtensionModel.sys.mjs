/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";

const fields = ["version", "type", "catalog", "addonId", "enabled"];
const addonIdPattern = /^(?:\{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}|[a-z0-9._-]*@[a-z0-9._-]+)$/i;
const encoder = new TextEncoder();
const same = (left, right) => left === null || right === null ? left === right :
  fields.every(field => left[field] === right[field]);

export function validateSyncExtensionIdentity(catalog, addonId) {
  if (catalog !== "amo" || typeof addonId !== "string" || addonId.length > 255 || !addonIdPattern.test(addonId)) {
    throw new SyncProtocolError("invalid_record");
  }
}

export function validateSyncExtension(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== fields.length || !fields.every(field => Object.hasOwn(value, field)) ||
      value.version !== 1 || value.type !== "extension" || typeof value.enabled !== "boolean") {
    throw new SyncProtocolError("invalid_record");
  }
  validateSyncExtensionIdentity(value.catalog, value.addonId);
  return Object.fromEntries(fields.map(field => [field, value[field]]));
}

export function classifySyncExtension(native) {
  if (native === null) { return { kind: "missing" }; }
  try { validateSyncExtensionIdentity(native?.catalog, native?.addonId); } catch {
    return { kind: "local", reason: "unsupported" };
  }
  if (native.scope === "absent") {
    return { kind: native.removedByUser === true ? "removed" : "missing" };
  }
  if (native.scope !== "user") {
    return { kind: "local", reason: ["policy", "private", "system", "temporary", "unavailable"].includes(native.scope) ? native.scope : "unsupported" };
  }
  if (typeof native.enabled !== "boolean" || !["ready", "incompatible", "blocked"].includes(native.availability)) {
    return { kind: "local", reason: "unsupported" };
  }
  return { kind: "portable", value: { version: 1, type: "extension", catalog: native.catalog,
    addonId: native.addonId, enabled: native.enabled }, availability: native.availability };
}

export function planSyncExtension(incoming, previous, native, { resolution = null } = {}) {
  if (typeof incoming?.deleted !== "boolean") { throw new SyncProtocolError("invalid_record"); }
  if (incoming.deleted && incoming.authenticatedSchema !== 2) {
    return { status: "conflict", reason: "unverified_deletion" };
  }
  const desired = incoming.deleted ? null : validateSyncExtension(incoming.value);
  const base = previous && !previous.deleted ? validateSyncExtension(previous.value) : null;
  const descriptor = desired ?? base;
  if (!descriptor) { return { status: "keep_local" }; }
  if ((desired && base && (desired.catalog !== base.catalog || desired.addonId !== base.addonId)) ||
      (native && (native.catalog !== descriptor.catalog || native.addonId !== descriptor.addonId))) {
    throw new SyncProtocolError("invalid_record");
  }
  const current = classifySyncExtension(native);
  if (current.kind === "local") {
    return current.reason === "unsupported" ? { status: "conflict", reason: "extension_unsupported" } :
      { status: "deferred", reason: `extension_${current.reason}` };
  }
  const localValue = current.kind === "portable" ? current.value : null;
  if (current.kind === "removed" && desired !== null && base === null && resolution?.choice !== "remote") {
    return { status: "conflict", reason: "extension_changed" };
  }
  if (current.kind === "portable" && desired?.enabled && current.availability !== "ready") {
    return { status: "deferred", reason: `extension_${current.availability}` };
  }
  if (same(localValue, desired)) { return { status: "persist", desired }; }
  if (same(base, desired)) { return { status: "keep_local" }; }
  if (resolution?.choice !== "remote" && !same(localValue, base)) {
    return { status: "conflict", reason: "extension_changed" };
  }
  return { status: "apply", desired };
}

export function canDeleteSyncExtension(previous, native) {
  const base = validateSyncExtension(previous);
  return native?.catalog === base.catalog && native?.addonId === base.addonId &&
    classifySyncExtension(native).kind === "removed";
}

export async function deriveSyncExtensionId(catalog, addonId, deriveRecordId) {
  validateSyncExtensionIdentity(catalog, addonId);
  if (typeof deriveRecordId !== "function") { throw new SyncProtocolError("invalid_adapter"); }
  const bytes = encoder.encode(JSON.stringify([1, "extension", catalog, addonId]));
  try {
    const result = await deriveRecordId("extensions", bytes);
    if (typeof result !== "string" || !/^[0-9a-f]{64}$/.test(result)) {
      throw new SyncProtocolError("invalid_record");
    }
    return `e1:${result}`;
  } finally {
    bytes.fill(0);
  }
}
