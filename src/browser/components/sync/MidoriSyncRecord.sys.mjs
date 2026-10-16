/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError, validSyncCounter } from "./MidoriSyncProtocol.sys.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_PLAINTEXT_BYTES = 190000;

export function protectedSyncRecords(keys) {
  const state = keys.snapshot;
  if (state?.status !== "ready" || state.busy === true || !["server", "client", "transition"].includes(state.custody)) {
    throw new SyncProtocolError("keys_locked");
  }
  return state.custody !== "server";
}

export async function sealSyncRecord(keys, context, { deleted, ttl = null, value }) {
  const authenticated = protectedSyncRecords(keys);
  if (deleted && !authenticated) {
    return { payload: "", crypto: keys.writeContext };
  }
  const bytes = encoder.encode(JSON.stringify(authenticated ?
    { version: 2, deleted, ttl, value: deleted ? null : value } : value));
  try {
    if (bytes.length > MAX_PLAINTEXT_BYTES) {
      throw new SyncProtocolError("record_too_large");
    }
    return await keys.sealRecord({ ...context, schema_version: authenticated ? 2 : 1 }, bytes);
  } finally {
    bytes.fill(0);
  }
}

export async function openSyncRecord(keys, expected, record) {
  const authenticated = protectedSyncRecords(keys);
  if (!record.payload) {
    if (record.deleted && !authenticated) {
      return null;
    }
    throw new SyncProtocolError("record_authentication_failed");
  }
  let envelope;
  try {
    envelope = JSON.parse(record.payload);
  } catch {
    throw new SyncProtocolError("invalid_record");
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new SyncProtocolError("invalid_record");
  }
  const state = keys.snapshot;
  if (state.custody === "client" && (!state.activeKeyId || envelope.key_id !== state.activeKeyId)) {
    const retired = state.activeKeyId && state.rotation?.phase === "complete" &&
      state.rotation.source_key_ids?.includes(envelope.key_id) &&
      Object.entries(expected).every(([name, value]) => envelope.context?.[name] === value);
    throw new SyncProtocolError(retired ? "record_key_retired" : "record_authentication_failed");
  }
  const schema = envelope.context?.schema_version;
  if (![1, 2].includes(schema) ||
      (schema !== 2 && (keys.snapshot?.custody === "client" || record.deleted))) {
    throw new SyncProtocolError("record_version_unsupported");
  }
  const bytes = await keys.openRecord(expected, record.payload);
  try {
    if (!validSyncCounter(envelope.context.base_revision) ||
        BigInt(envelope.context.base_revision) + 1n !== BigInt(record.revision)) {
      throw new SyncProtocolError("record_revision_mismatch");
    }
    let value;
    try {
      value = JSON.parse(decoder.decode(bytes));
    } catch {
      throw new SyncProtocolError("invalid_record");
    }
    if (schema === 1) {
      return value;
    }
    if (!value || Object.keys(value).length !== 4 || value.version !== 2 ||
        typeof value.deleted !== "boolean" || !Object.hasOwn(value, "value") ||
        (value.ttl !== null && (typeof value.ttl !== "string" || !Number.isFinite(Date.parse(value.ttl)))) ||
        value.deleted !== record.deleted || (value.deleted && value.value !== null) ||
        (value.ttl === null ? record.ttl !== null : record.ttl === null || Date.parse(value.ttl) !== Date.parse(record.ttl))) {
      throw new SyncProtocolError("record_authentication_failed");
    }
    return value.value;
  } finally {
    bytes.fill(0);
  }
}
