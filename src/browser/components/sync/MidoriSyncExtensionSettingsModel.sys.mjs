/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";
import { validateSyncExtensionIdentity } from "./MidoriSyncExtensionModel.sys.mjs";
import { MAX_SYNC_TEXT_BYTES, createSyncTextBundle, assembleSyncTextBundle,
  validateSyncTextManifest, validateSyncTextPart, syncTextDigest } from "./MidoriSyncTextBundle.sys.mjs";

export const SYNC_EXTENSION_SETTINGS_TYPE = "extension-settings";
const TYPE = SYNC_EXTENSION_SETTINGS_TYPE;
const fields = ["version", "type", "catalog", "addonId", "bundle"];
const encoder = new TextEncoder();
const hash = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const invalid = () => { throw new SyncProtocolError("invalid_record"); };

export function normalizeSyncExtensionSettings(data) {
  const ancestors = new Set();
  let bytes = 0;
  const charge = text => {
    bytes += encoder.encode(text).length;
    if (bytes > MAX_SYNC_TEXT_BYTES) { invalid(); }
  };
  const text = value => {
    if (!value.isWellFormed() || value.length > MAX_SYNC_TEXT_BYTES) { invalid(); }
    charge(JSON.stringify(value));
    return value;
  };
  const normalize = (value, depth) => {
    if (depth > 128) { invalid(); }
    if (value === null || typeof value === "boolean") { charge(String(value)); return value; }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) { invalid(); }
      charge(JSON.stringify(value));
      return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value === "string") { return text(value); }
    if (!value || typeof value !== "object" || ancestors.has(value)) { invalid(); }
    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== null && Object.getPrototypeOf(prototype) !== null) { invalid(); }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some(key => typeof key !== "string")) { invalid(); }
    const keys = Object.keys(value);
    if (keys.some(key => !Object.hasOwn(descriptors[key], "value"))) { invalid(); }
    ancestors.add(value);
    let result;
    if (Array.isArray(value)) {
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) { invalid(); }
      charge("[]" + ",".repeat(Math.max(0, value.length - 1)));
      result = value.map(item => normalize(item, depth + 1));
    } else {
      charge("{}" + ",".repeat(Math.max(0, keys.length - 1)));
      result = Object.fromEntries(keys.sort().map(key => {
        text(key);
        charge(":");
        return [key, normalize(descriptors[key].value, depth + 1)];
      }));
    }
    ancestors.delete(value);
    return result;
  };
  if (!data || typeof data !== "object" || Array.isArray(data) || Object.keys(data).length > 512) { invalid(); }
  return normalize(data, 0);
}

export function parseSyncExtensionSettings(text) {
  if (typeof text !== "string" || !text.isWellFormed() || text.length > MAX_SYNC_TEXT_BYTES ||
      encoder.encode(text).length > MAX_SYNC_TEXT_BYTES) { invalid(); }
  let data;
  try {
    data = JSON.parse(text, (_key, value, context) => {
      if (typeof value === "number" && (!Number.isFinite(value) ||
          (Number.isInteger(value) && !Number.isSafeInteger(value) &&
            (!context?.source || (/^-?\d+$/.test(context.source) && BigInt(context.source) !== BigInt(value)))))) { invalid(); }
      return value;
    });
  } catch { invalid(); }
  return normalizeSyncExtensionSettings(data);
}

export function serializeSyncExtensionSettings(data) {
  const serialize = value => {
    if (Array.isArray(value)) { return `[${value.map(serialize).join(",")}]`; }
    if (value !== null && typeof value === "object") {
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${serialize(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
  };
  return serialize(normalizeSyncExtensionSettings(data));
}

export async function deriveSyncExtensionSettingsId(catalog, addonId, deriveRecordId, digest = null) {
  validateSyncExtensionIdentity(catalog, addonId);
  if (typeof deriveRecordId !== "function" || (digest !== null && !hash(digest))) { invalid(); }
  const bytes = encoder.encode(JSON.stringify(digest === null ? [1, TYPE, catalog, addonId] :
    [1, "extension-settings-part", catalog, addonId, digest]));
  try {
    const id = await deriveRecordId(TYPE, bytes);
    if (!hash(id)) { invalid(); }
    return `${digest === null ? "xm1" : "xp1"}:${id}`;
  } finally { bytes.fill(0); }
}

const wrap = (catalog, addonId, bundle) => ({ version: 1, type: TYPE, catalog, addonId, bundle });

export async function createSyncExtensionSettingsBundle(catalog, addonId, data,
  { deriveRecordId, digest = syncTextDigest } = {}) {
  validateSyncExtensionIdentity(catalog, addonId);
  const bundle = await createSyncTextBundle(TYPE, serializeSyncExtensionSettings(data), {
    digest, entryId: (_type, hash) => deriveSyncExtensionSettingsId(catalog, addonId, deriveRecordId, hash),
  });
  return {
    manifest: { id: await deriveSyncExtensionSettingsId(catalog, addonId, deriveRecordId), value: wrap(catalog, addonId, bundle.manifest) },
    parts: bundle.parts.map(part => ({ id: part.id, value: wrap(catalog, addonId, part.value) })),
  };
}

export async function validateSyncExtensionSettingsRecord(id, value,
  { deriveRecordId, digest = syncTextDigest } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== fields.length ||
      !fields.every(field => Object.hasOwn(value, field)) || value.version !== 1 || value.type !== TYPE) { invalid(); }
  validateSyncExtensionIdentity(value.catalog, value.addonId);
  const { catalog, addonId } = value;
  let bundle;
  if (value.bundle?.kind === "text-manifest") {
    bundle = structuredClone(validateSyncTextManifest(TYPE, value.bundle));
    if (id !== await deriveSyncExtensionSettingsId(catalog, addonId, deriveRecordId)) { invalid(); }
    for (const part of bundle.parts) {
      if (part.id !== await deriveSyncExtensionSettingsId(catalog, addonId, deriveRecordId, part.digest)) { invalid(); }
    }
  } else {
    bundle = await validateSyncTextPart(TYPE, value.bundle, digest);
    if (id !== await deriveSyncExtensionSettingsId(catalog, addonId, deriveRecordId, bundle.digest)) { invalid(); }
  }
  return wrap(catalog, addonId, bundle);
}

export async function assembleSyncExtensionSettings(record, partAt, options = {}) {
  const manifest = await validateSyncExtensionSettingsRecord(record?.id, record?.value, options);
  if (manifest.bundle.kind !== "text-manifest" || typeof partAt !== "function") { invalid(); }
  const text = await assembleSyncTextBundle(TYPE, manifest.bundle, async id => {
    const value = await partAt(id);
    if (value == null) { return null; }
    const part = await validateSyncExtensionSettingsRecord(id, value, options);
    if (part.catalog !== manifest.catalog || part.addonId !== manifest.addonId) { invalid(); }
    return part.bundle;
  }, options.digest ?? syncTextDigest);
  if (text === null) { return null; }
  const data = parseSyncExtensionSettings(text);
  if (serializeSyncExtensionSettings(data) !== text) { invalid(); }
  return data;
}

export function mergeSyncExtensionSettings(base, local, remote) {
  base = normalizeSyncExtensionSettings(base);
  local = normalizeSyncExtensionSettings(local);
  remote = normalizeSyncExtensionSettings(remote);
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  const equal = (left, right, key) => Object.hasOwn(left, key) === Object.hasOwn(right, key) &&
    JSON.stringify(left[key]) === JSON.stringify(right[key]);
  const result = [];
  for (const key of keys) {
    let source;
    if (equal(local, remote, key) || equal(remote, base, key)) { source = local; }
    else if (equal(local, base, key)) { source = remote; }
    else { return { status: "conflict", reason: "extension_settings_changed" }; }
    if (Object.hasOwn(source, key)) { result.push([key, source[key]]); }
  }
  try { return { status: "merged", data: normalizeSyncExtensionSettings(Object.fromEntries(result)) }; }
  catch (error) {
    if (error.code !== "invalid_record") { throw error; }
    return { status: "conflict", reason: "extension_settings_quota" };
  }
}
