/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SYNC_STORE_UUID } from "./MidoriSyncLocalCodec.sys.mjs";

export const SYNC_DESKTOP_COLLECTIONS = Object.freeze([
  "bookmarks", "history", "passwords", "credit-cards", "form-history", "addresses", "tabs", "browser-settings",
]);

const encoder = new TextEncoder();
const MAX_SEQUENCE = 9223372036854775807n;
export const MAX_ENGINE_PAGE_BYTES = 2 * 1024 * 1024;

export const SYNC_COLLECTION_SCHEMAS = Object.freeze({
  bookmarks: 2,
  history: 2,
  passwords: 1,
  "credit-cards": 1,
  "form-history": 1,
  addresses: 1,
  workspaces: 1,
  "midori-privacy": 1,
  "site-permissions": 1,
  extensions: 1,
  "extension-settings": 1,
  tabs: 2,
  "browser-settings": 1,
});

const COLLECTION_FEATURES = Object.freeze({
  bookmarks: ["bookmark_labels"],
  history: ["history_parts", "history_visit_removals"],
  "credit-cards": ["credit_cards"],
  "form-history": ["form_history"],
  addresses: ["addresses"],
  workspaces: ["workspace_metadata"],
  "midori-privacy": ["custom_filters"],
  "site-permissions": ["site_permissions"],
  extensions: ["extension_catalog"],
  "extension-settings": ["extension_settings"],
  tabs: ["tab_fragments"],
});

export function negotiateSyncCollections(value) {
  const collections = Array.isArray(value?.collections) ? value.collections : [];
  const features = Array.isArray(value?.features) ? value.features : [];
  const schemas = value?.data_schemas;
  const validSchemas = schemas !== null && typeof schemas === "object" && !Array.isArray(schemas);
  return Object.freeze(Object.fromEntries(Object.entries(SYNC_COLLECTION_SCHEMAS).map(([name, version]) => [
    name,
    collections.includes(name) && validSchemas && Object.hasOwn(schemas, name) && schemas[name] === version &&
      (COLLECTION_FEATURES[name] ?? []).every(feature => features.includes(feature)),
  ])));
}

export function syncCollectionSupported(name, account, connection) {
  if (account?.status === "local") {
    return true;
  }
  if (connection?.error === "incompatible_server") {
    return false;
  }
  const support = connection == null ? account?.collectionSupport : connection.capabilities?.collectionSupport;
  return support?.[name] === true && Object.hasOwn(support, name);
}

export class SyncProtocolError extends Error {
  constructor(code) {
    super(code);
    this.name = "SyncProtocolError";
    this.code = code;
  }
}

export function validSyncCounter(value, max = MAX_SEQUENCE) {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= max;
}

export function validSyncRecordId(value) {
  return typeof value === "string" && value.length > 0 && encoder.encode(value).length <= 255 && !/[\p{Cc}\p{Cs}]/u.test(value);
}

export function validSyncPasswordId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 64 && !/[^\x20-\x7E]|,/.test(value);
}

export function validSyncCursor(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 4096 && !/[\p{Cc}\p{Cs}]/u.test(value);
}

export function historyClearCutoff(reset) {
  if (reset?.kind !== "history_clear" || typeof reset.clear_before !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}(?:\d{3})?Z$/.test(reset.clear_before)) {
    throw new SyncProtocolError("invalid_history_reset");
  }
  const ms = Date.parse(reset.clear_before);
  if (!Number.isSafeInteger(ms) || ms < 1 || ms > Math.floor(Number.MAX_SAFE_INTEGER / 1000)) {
    throw new SyncProtocolError("invalid_history_reset");
  }
  return ms;
}

export function validateChangePage(page, state) {
  if (!SYNC_STORE_UUID.test(page?.generation) || !Array.isArray(page.changes) || page.changes.length > 100 ||
      typeof page.has_more !== "boolean" || !validSyncCounter(page.snapshot_sequence) ||
      !validSyncCursor(page.next_cursor)) {
    throw new SyncProtocolError("invalid_change_page");
  }
  if (state.generation && page.generation !== state.generation) {
    throw new SyncProtocolError("reset_required");
  }
  const floor = page.compacted_through ?? "0";
  const rebased = page.snapshot_rebased === true;
  if (!validSyncCounter(floor) || BigInt(floor) < BigInt(state.compactedThrough ?? "0") ||
      BigInt(floor) > BigInt(page.snapshot_sequence) ||
      (page.snapshot_rebased !== undefined && typeof page.snapshot_rebased !== "boolean") ||
      (rebased && BigInt(floor) < BigInt(state.sequence)) ||
      (!rebased && state.fence !== null && state.fence !== page.snapshot_sequence) ||
      BigInt(page.snapshot_sequence) < BigInt(state.sequence)) {
    throw new SyncProtocolError("invalid_change_page");
  }
  let sequence = rebased ? BigInt(floor) : BigInt(state.sequence);
  for (const change of page.changes) {
    if (!validSyncCounter(change?.sequence) || BigInt(change.sequence) <= sequence ||
        BigInt(change.sequence) > BigInt(page.snapshot_sequence) || !change.record || typeof change.record !== "object") {
      throw new SyncProtocolError("invalid_change_page");
    }
    sequence = BigInt(change.sequence);
  }
  if (page.has_more ? !page.changes.length || sequence >= BigInt(page.snapshot_sequence) : sequence !== BigInt(page.snapshot_sequence)) {
    throw new SyncProtocolError("invalid_change_page");
  }
  if (encoder.encode(JSON.stringify(page)).length > MAX_ENGINE_PAGE_BYTES) {
    throw new SyncProtocolError("change_page_too_large");
  }
  return page;
}

export function validateRemoteRecord(record) {
  if (!validSyncRecordId(record?.id) || !validSyncCounter(record.revision, 2147483647n) || record.revision === "0" ||
      typeof record.deleted !== "boolean" || typeof record.payload !== "string" || encoder.encode(record.payload).length > 262144 ||
      (record.ttl !== null && (typeof record.ttl !== "string" || record.ttl.length > 40 ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(record.ttl) || !Number.isFinite(Date.parse(record.ttl))))) {
    throw new SyncProtocolError("invalid_record");
  }
  return record;
}

export function validateOperationResults(data, generation, operations) {
  if (data?.generation !== generation || !Array.isArray(data.results) || data.results.length !== operations.length) {
    throw new SyncProtocolError("invalid_operation_results");
  }
  for (let index = 0; index < operations.length; index++) {
    const result = data.results[index];
    const operation = operations[index];
    if (result?.index !== index || result.operation_id !== operation.operation_id ||
        !["applied", "conflict", "invalid", "idempotency_conflict", "quota_exceeded"].includes(result.status)) {
      throw new SyncProtocolError("invalid_operation_results");
    }
    if (["applied", "conflict"].includes(result.status) &&
        (result.id !== operation.id || !validSyncCounter(result.revision, 2147483647n))) {
      throw new SyncProtocolError("invalid_operation_results");
    }
    if (result.status === "applied" && BigInt(result.revision) !== BigInt(operation.base_revision) + 1n) {
      throw new SyncProtocolError("invalid_operation_results");
    }
  }
  return data.results;
}
