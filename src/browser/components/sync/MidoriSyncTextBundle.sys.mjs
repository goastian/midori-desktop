/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError, validSyncRecordId } from "./MidoriSyncProtocol.sys.mjs";

export const MAX_SYNC_TEXT_BYTES = 2 * 1024 * 1024;
export const MAX_SYNC_TEXT_PART_BYTES = 96 * 1024;
const MAX_PARTS = 256;
const encoder = new TextEncoder();
const validDigest = value => typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
const validType = value => typeof value === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(value);
const fields = (value, names) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));

function invalid() {
  throw new SyncProtocolError("invalid_record");
}

export async function syncTextDigest(text) {
  const bytes = encoder.encode(text);
  const hash = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
  hash.init(Ci.nsICryptoHash.SHA256);
  hash.update(bytes, bytes.length);
  return Array.from(hash.finish(false), byte => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

function splitText(text) {
  if (typeof text !== "string" || !text.isWellFormed() || encoder.encode(text).length > MAX_SYNC_TEXT_BYTES) {
    invalid();
  }
  const parts = [];
  let start = 0;
  let cost = 2;
  for (let offset = 0; offset < text.length;) {
    const point = text.codePointAt(offset);
    const encoded = point < 32 ? ([8, 9, 10, 12, 13].includes(point) ? 2 : 6) :
      point === 34 || point === 92 ? 2 : point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
    if (cost + encoded > MAX_SYNC_TEXT_PART_BYTES) {
      parts.push(text.slice(start, offset));
      start = offset;
      cost = 2;
    }
    cost += encoded;
    offset += point > 65535 ? 2 : 1;
  }
  if (start < text.length) {
    parts.push(text.slice(start));
  }
  return parts;
}

export async function createSyncTextBundle(type, text, { entryId, digest = syncTextDigest } = {}) {
  if (!validType(type) || typeof entryId !== "function" || typeof digest !== "function") {
    invalid();
  }
  const parts = new Map();
  const references = [];
  for (const chunk of splitText(text)) {
    const hash = await digest(chunk);
    if (!validDigest(hash)) {
      invalid();
    }
    const id = await entryId(type, hash);
    if (!validSyncRecordId(id)) {
      invalid();
    }
    const value = { version: 1, type, kind: "text-part", digest: hash, text: chunk };
    if (parts.has(id) && parts.get(id).text !== chunk) {
      invalid();
    }
    parts.set(id, value);
    references.push({ id, digest: hash, byte_count: encoder.encode(chunk).length });
  }
  const manifest = { version: 1, type, kind: "text-manifest", digest: await digest(text),
    byte_count: encoder.encode(text).length, parts: references };
  validateSyncTextManifest(type, manifest);
  return { manifest, parts: Array.from(parts, ([id, value]) => ({ id, value })) };
}

export function validateSyncTextManifest(type, value) {
  if (!validType(type) || !fields(value, ["version", "type", "kind", "digest", "byte_count", "parts"]) ||
      value.version !== 1 || value.type !== type || value.kind !== "text-manifest" || !validDigest(value.digest) ||
      !Number.isSafeInteger(value.byte_count) || value.byte_count < 0 || value.byte_count > MAX_SYNC_TEXT_BYTES ||
      !Array.isArray(value.parts) || value.parts.length > MAX_PARTS) {
    invalid();
  }
  const identities = new Map();
  let bytes = 0;
  for (const part of value.parts) {
    if (!fields(part, ["id", "digest", "byte_count"]) || !validSyncRecordId(part.id) || !validDigest(part.digest) ||
        !Number.isSafeInteger(part.byte_count) || part.byte_count < 1 || part.byte_count > MAX_SYNC_TEXT_PART_BYTES ||
        (identities.has(part.id) && identities.get(part.id) !== JSON.stringify([part.digest, part.byte_count]))) {
      invalid();
    }
    identities.set(part.id, JSON.stringify([part.digest, part.byte_count]));
    bytes += part.byte_count;
  }
  if (bytes !== value.byte_count) {
    invalid();
  }
  return value;
}

export async function validateSyncTextPart(type, value, digest = syncTextDigest) {
  if (!validType(type) || !fields(value, ["version", "type", "kind", "digest", "text"]) ||
      value.version !== 1 || value.type !== type || value.kind !== "text-part" || !validDigest(value.digest) ||
      typeof value.text !== "string" || !value.text.isWellFormed() ||
      encoder.encode(JSON.stringify(value.text)).length > MAX_SYNC_TEXT_PART_BYTES) {
    invalid();
  }
  const part = { version: 1, type, kind: "text-part", digest: value.digest, text: value.text };
  if (await digest(part.text) !== part.digest) {
    invalid();
  }
  return part;
}

export async function assembleSyncTextBundle(type, manifest, partAt, digest = syncTextDigest) {
  const snapshot = structuredClone(validateSyncTextManifest(type, manifest));
  if (typeof partAt !== "function" || typeof digest !== "function") {
    invalid();
  }
  const chunks = [];
  for (const reference of snapshot.parts) {
    const part = await partAt(reference.id);
    if (part === null || part === undefined) {
      return null;
    }
    const validated = await validateSyncTextPart(type, part, digest);
    if (validated.digest !== reference.digest || encoder.encode(validated.text).length !== reference.byte_count) {
      invalid();
    }
    chunks.push(validated.text);
  }
  const text = chunks.join("");
  if (await digest(text) !== snapshot.digest) {
    invalid();
  }
  return text;
}
