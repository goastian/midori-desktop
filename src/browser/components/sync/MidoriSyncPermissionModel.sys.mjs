/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";

export const SYNC_PERMISSION_SPECS = Object.freeze(Object.fromEntries(Object.entries({
  cookie: { allow: 1, deny: 2, "session-cookies": 8 },
  popup: { allow: 1, deny: 2 },
  "midori-blocker": { allow: 1, deny: 2 },
  camera: { deny: 2, prompt: 3 },
  microphone: { deny: 2, prompt: 3 },
  geo: { deny: 2 },
  "desktop-notification": { deny: 2 },
}).map(([name, states]) => [name, Object.freeze(states)])));

const SENSITIVE = new Set(["camera", "microphone", "geo", "desktop-notification"]);
const encoder = new TextEncoder();
const fields = ["version", "type", "origin", "permission", "action", "expiresAt"];
const same = (left, right) => left === null || right === null ? left === right :
  fields.every(field => left[field] === right[field]);
const validTime = value => Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;

export function validateSyncPermissionIdentity(origin, permission) {
  let parsed;
  try { parsed = new URL(origin); } catch {}
  if (typeof origin !== "string" || origin.length > 2048 || !parsed ||
      !["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin ||
      (permission === "midori-blocker" && parsed.protocol !== "https:") ||
      !Object.hasOwn(SYNC_PERMISSION_SPECS, permission)) {
    throw new SyncProtocolError("invalid_record");
  }
}

export function validateSyncPermission(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== fields.length || !fields.every(field => Object.hasOwn(value, field)) ||
      value.version !== 1 || value.type !== "site-permission") {
    throw new SyncProtocolError("invalid_record");
  }
  validateSyncPermissionIdentity(value.origin, value.permission);
  if (!Object.hasOwn(SYNC_PERMISSION_SPECS[value.permission], value.action) ||
      (value.expiresAt !== null && !validTime(value.expiresAt))) {
    throw new SyncProtocolError("invalid_record");
  }
  return Object.fromEntries(fields.map(field => [field, value[field]]));
}

export function classifySyncPermission(native, now = Date.now()) {
  if (native?.scope === "omitted") {
    return { kind: "excluded" };
  }
  if (native === null || native?.scope === "default") {
    return { kind: "absent" };
  }
  if (native?.scope === "expired") {
    return { kind: "expired" };
  }
  if (native?.scope !== "user") {
    return { kind: "local", reason: ["private", "session", "policy"].includes(native?.scope) ? native.scope : "unsupported" };
  }
  try { validateSyncPermissionIdentity(native.origin, native.permission); } catch {
    return { kind: "local", reason: "unsupported" };
  }
  if (![0, 2].includes(native.expireType) || (native.expireType === 2 && !validTime(native.expireTime))) {
    return { kind: "local", reason: "unsupported" };
  }
  if (native.expireType === 2 && native.expireTime <= now) {
    return { kind: "expired" };
  }
  const action = Object.keys(SYNC_PERMISSION_SPECS[native.permission])
    .find(name => SYNC_PERMISSION_SPECS[native.permission][name] === native.capability);
  if (!action) {
    return { kind: "local", reason: native.capability === 1 && SENSITIVE.has(native.permission) ? "sensitive-grant" : "unsupported" };
  }
  return { kind: "portable", value: { version: 1, type: "site-permission", origin: native.origin,
    permission: native.permission, action, expiresAt: native.expireType === 2 ? native.expireTime : null } };
}

export function syncPermissionNativeValue(value) {
  value = validateSyncPermission(value);
  return { capability: SYNC_PERMISSION_SPECS[value.permission][value.action],
    expireType: value.expiresAt === null ? 0 : 2, expireTime: value.expiresAt ?? 0 };
}

export function planSyncPermission(incoming, previous, native, { now = Date.now(), resolution = null } = {}) {
  if (typeof incoming?.deleted !== "boolean") {
    throw new SyncProtocolError("invalid_record");
  }
  if (incoming.deleted && incoming.authenticatedSchema !== 2) {
    return { status: "conflict", reason: "unverified_deletion" };
  }
  const desired = incoming.deleted ? null : validateSyncPermission(incoming.value);
  const previousValue = previous && !previous.deleted ? validateSyncPermission(previous.value) : null;
  const descriptor = desired ?? previousValue;
  if (!descriptor) {
    return { status: "keep_local" };
  }
  if ((desired && previousValue && (desired.origin !== previousValue.origin || desired.permission !== previousValue.permission)) ||
      (native && (native.origin !== descriptor.origin || native.permission !== descriptor.permission))) {
    throw new SyncProtocolError("invalid_record");
  }
  if (desired?.expiresAt !== null && desired?.expiresAt !== undefined && desired.expiresAt <= now) {
    return { status: "keep_local" };
  }
  const current = classifySyncPermission(native, now);
  if (current.kind === "local" && ["session", "policy", "private"].includes(current.reason)) {
    return { status: "deferred", reason: `permission_${current.reason}` };
  }
  if (current.kind === "local" && current.reason === "sensitive-grant" && desired === null) {
    return { status: "keep_local" };
  }
  const currentValue = current.kind === "portable" ? current.value : null;
  if (current.kind !== "local" && same(currentValue, desired)) {
    return { status: "persist", desired };
  }
  if (same(previousValue, desired)) {
    return { status: "keep_local" };
  }
  const base = ["excluded", "expired"].includes(current.kind) ||
    (previousValue?.expiresAt !== null && previousValue?.expiresAt !== undefined && previousValue.expiresAt <= now) ? null : previousValue;
  if (resolution?.choice !== "remote" && (current.kind === "local" || !same(currentValue, base))) {
    return { status: "conflict", reason: "permission_changed" };
  }
  if (current.kind === "local" && current.reason === "unsupported") {
    return { status: "conflict", reason: "permission_unsupported" };
  }
  return { status: "apply", desired };
}

export function canDeleteSyncPermission(previous, native, now = Date.now()) {
  const base = validateSyncPermission(previous);
  if (base.expiresAt !== null && base.expiresAt <= now) {
    return false;
  }
  if (native && (native.origin !== base.origin || native.permission !== base.permission)) {
    return false;
  }
  const current = classifySyncPermission(native, now);
  return current.kind === "absent" || (current.kind === "local" && current.reason === "sensitive-grant");
}

export async function deriveSyncPermissionId(origin, permission, deriveRecordId) {
  validateSyncPermissionIdentity(origin, permission);
  if (typeof deriveRecordId !== "function") {
    throw new SyncProtocolError("invalid_adapter");
  }
  const bytes = encoder.encode(JSON.stringify([1, "site-permission", origin, permission]));
  try {
    const result = await deriveRecordId("site-permissions", bytes);
    if (typeof result !== "string" || !/^[0-9a-f]{64}$/.test(result)) {
      throw new SyncProtocolError("invalid_record");
    }
    return `p1:${result}`;
  } finally {
    bytes.fill(0);
  }
}
