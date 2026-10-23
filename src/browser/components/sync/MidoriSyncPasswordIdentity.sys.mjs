/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError, validSyncCounter, validSyncPasswordId, validSyncRecordId, validateRemoteRecord } from "./MidoriSyncProtocol.sys.mjs";

const encoder = new TextEncoder();
const DIGEST = /^[0-9a-f]{64}$/;
const LOGIN_FIELDS = ["version", "origin", "formActionOrigin", "httpRealm", "username", "password",
  "usernameField", "passwordField", "timeCreated", "timePasswordChanged"];
const ALIAS_FIELDS = ["version", "kind", "targetId", "sourceRevision", "targetRevision", "sourceDigest", "targetDeleted", "targetDigest"];

function exactFields(value, fields) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
}

async function digest(bytes) {
  try {
    return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
  } finally {
    bytes.fill(0);
  }
}

export function validSyncPasswordReplacement(sourceId, targetId) {
  return validSyncRecordId(sourceId) && validSyncPasswordId(targetId) && sourceId !== targetId &&
    (!validSyncPasswordId(sourceId) || targetId < sourceId);
}

export function isSyncPasswordIdentityAlias(value) {
  return value !== null && typeof value === "object" && value.kind === "identity-alias";
}

export function validateSyncPasswordIdentityAlias(id, value, revision = null) {
  if (!exactFields(value, ALIAS_FIELDS) || value.version !== 2 || value.kind !== "identity-alias" ||
      !validSyncPasswordReplacement(id, value.targetId) ||
      !validSyncCounter(value.sourceRevision, 2147483647n) || value.sourceRevision === "0" ||
      !validSyncCounter(value.targetRevision, 2147483647n) || value.targetRevision === "0" ||
      typeof value.sourceDigest !== "string" || !DIGEST.test(value.sourceDigest) || typeof value.targetDeleted !== "boolean" ||
      (value.targetDeleted ? value.targetDigest !== null : typeof value.targetDigest !== "string" || !DIGEST.test(value.targetDigest)) ||
      (revision !== null && (!validSyncCounter(revision, 2147483647n) || BigInt(revision) <= BigInt(value.sourceRevision)))) {
    throw new SyncProtocolError("invalid_record");
  }
  return Object.fromEntries(ALIAS_FIELDS.map(field => [field, value[field]]));
}

function passwordDigestInput(value) {
  if (!exactFields(value, LOGIN_FIELDS) || value.version !== 1 ||
      ["origin", "username", "password", "usernameField", "passwordField"].some(field => typeof value[field] !== "string") ||
      ["formActionOrigin", "httpRealm"].some(field => value[field] !== null && typeof value[field] !== "string") ||
      LOGIN_FIELDS.some(field => typeof value[field] === "string" && !value[field].isWellFormed()) ||
      ["timeCreated", "timePasswordChanged"].some(field => !Number.isSafeInteger(value[field]) ||
        value[field] < 0 || value[field] > 253402300799999)) {
    throw new SyncProtocolError("invalid_record");
  }
  return encoder.encode(JSON.stringify(["midori-sync-password-value", 1, ...LOGIN_FIELDS.map(field => value[field])]));
}

export async function syncPasswordValueDigest(value) {
  return digest(passwordDigestInput(value));
}

export function validateSyncPasswordRetirementSnapshot(id, value) {
  if (!exactFields(value, ["version", "sourceId", "targetId", "remote", "native"]) || value.version !== 1 ||
      value.sourceId !== id || !validSyncPasswordReplacement(id, value.targetId) ||
      (value.remote === null && value.native === null)) {
    throw new SyncProtocolError("engine_state_corrupt");
  }
  try {
    if (value.remote !== null) {
      validateRemoteRecord(value.remote);
      if (value.remote.id !== id || value.remote.deleted) {
        throw new SyncProtocolError("invalid_record");
      }
      passwordDigestInput(value.remote.value).fill(0);
    }
    if (value.native !== null) {
      if (!exactFields(value.native, ["id", "value"]) || typeof value.native.id !== "string" ||
          !value.native.id.length || value.native.id.length > 65536) {
        throw new SyncProtocolError("invalid_record");
      }
      passwordDigestInput(value.native.value).fill(0);
    }
  } catch {
    throw new SyncProtocolError("engine_state_corrupt");
  }
  return value;
}

export async function deriveSyncPasswordMigrationId(deriveRecordId, sourceId) {
  if (typeof deriveRecordId !== "function" || typeof sourceId !== "string" || !sourceId.length || sourceId.length > 65536) {
    throw new SyncProtocolError("invalid_record");
  }
  const sourceDigest = await digest(encoder.encode(JSON.stringify(["midori-sync-password-source", 1, sourceId])));
  const input = encoder.encode(JSON.stringify(["midori-sync-password-identity", 1, sourceDigest]));
  try {
    const id = await deriveRecordId("passwords", input);
    if (typeof id !== "string" || !DIGEST.test(id)) {
      throw new SyncProtocolError("invalid_record");
    }
    return id;
  } finally {
    input.fill(0);
  }
}
