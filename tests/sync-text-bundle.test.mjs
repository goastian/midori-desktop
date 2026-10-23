import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import {
  MAX_SYNC_TEXT_BYTES, MAX_SYNC_TEXT_PART_BYTES,
  createSyncTextBundle, assembleSyncTextBundle, validateSyncTextManifest,
} from "../src/browser/components/sync/MidoriSyncTextBundle.sys.mjs";

const encoder = new TextEncoder();
const digest = async text => createHash("sha256").update(text).digest("hex");
const options = (key = "public synthetic bundle index key") => ({
  digest,
  entryId: async (type, hash) => createHmac("sha256", key)
    .update(JSON.stringify([1, "text-part", type, hash])).digest("hex"),
});
const assemble = (manifest, parts, type = "filters") => {
  const records = new Map(parts.map(part => [part.id, part.value]));
  return assembleSyncTextBundle(type, manifest, id => records.get(id), digest);
};

test("large UTF-8 and escaped content fits encrypted-record budgets and survives reordering", async () => {
  const pattern = 'é🦊\0\x1f\n"\\';
  const text = pattern.repeat(Math.floor(MAX_SYNC_TEXT_BYTES / encoder.encode(pattern).length));
  const bundle = await createSyncTextBundle("filters", text, options());
  assert.equal(bundle.manifest.byte_count, encoder.encode(text).length);
  assert.ok(bundle.manifest.parts.length > 1);
  for (const part of bundle.parts) {
    assert.ok(part.value.text.isWellFormed());
    assert.ok(encoder.encode(JSON.stringify(part.value.text)).length <= MAX_SYNC_TEXT_PART_BYTES);
    assert.ok(encoder.encode(JSON.stringify(part.value)).length < MAX_SYNC_TEXT_PART_BYTES + 256);
    assert.notEqual(part.id, part.value.digest, "Record IDs do not reveal the plaintext digest");
  }
  assert.equal(await assemble(bundle.manifest, [...bundle.parts].reverse()), text);
});

test("empty content is an explicit complete value without fragments", async () => {
  const bundle = await createSyncTextBundle("filters", "", options());
  assert.equal(bundle.manifest.byte_count, 0);
  assert.deepEqual(bundle.parts, []);
  assert.equal(await assemble(bundle.manifest, bundle.parts), "");
});

test("missing fragments never produce partial text", async () => {
  const bundle = await createSyncTextBundle("filters", "a".repeat(MAX_SYNC_TEXT_PART_BYTES), options());
  assert.equal(await assemble(bundle.manifest, bundle.parts.slice(1)), null);
  assert.equal(await assemble(bundle.manifest, bundle.parts), "a".repeat(MAX_SYNC_TEXT_PART_BYTES));
});

test("corrupt or substituted fragments are rejected", async () => {
  const bundle = await createSyncTextBundle("filters", "abc", options());
  for (const mutate of [
    value => { value.text = "abd"; },
    value => { value.type = "notes"; },
    value => { value.digest = "0".repeat(64); },
    value => { value.extra = true; },
    value => { value.version = 2; },
  ]) {
    const parts = structuredClone(bundle.parts);
    mutate(parts[0].value);
    await assert.rejects(assemble(bundle.manifest, parts), /invalid_record/);
  }
});

test("manifests authenticate byte counts, order and complete content", async () => {
  const text = "a".repeat(MAX_SYNC_TEXT_PART_BYTES) + "b";
  const bundle = await createSyncTextBundle("filters", text, options());
  for (const mutate of [
    value => { value.byte_count++; },
    value => { value.parts[0].byte_count++; value.byte_count++; },
    value => { value.parts[0].digest = "0".repeat(64); },
    value => { value.parts.reverse(); },
    value => { value.digest = "0".repeat(64); },
    value => { value.extra = true; },
  ]) {
    const manifest = structuredClone(bundle.manifest);
    mutate(manifest);
    await assert.rejects(assemble(manifest, bundle.parts), /invalid_record/);
  }
});

test("boundaries preserve surrogate pairs and reject oversized or malformed sources", async () => {
  const text = "a".repeat(MAX_SYNC_TEXT_PART_BYTES - 3) + "🦊";
  const bundle = await createSyncTextBundle("filters", text, options());
  assert.equal(bundle.parts.length, 2);
  assert.equal(await assemble(bundle.manifest, bundle.parts), text);
  for (const invalid of ["a".repeat(MAX_SYNC_TEXT_BYTES + 1), "\ud800", "\udfff", null]) {
    await assert.rejects(createSyncTextBundle("filters", invalid, options()), /invalid_record/);
  }
});

test("identical chunks are stored once and can be referenced repeatedly", async () => {
  const text = "a".repeat((MAX_SYNC_TEXT_PART_BYTES - 2) * 2);
  const bundle = await createSyncTextBundle("filters", text, options());
  assert.equal(bundle.parts.length, 1);
  assert.equal(bundle.manifest.parts.length, 2);
  assert.equal(bundle.manifest.parts[0].id, bundle.manifest.parts[1].id);
  assert.equal(await assemble(bundle.manifest, bundle.parts), text);
  const bad = structuredClone(bundle.manifest);
  bad.parts[1].byte_count--;
  bad.byte_count--;
  assert.throws(() => validateSyncTextManifest("filters", bad), /invalid_record/);
});

test("account and type domains separate IDs and accidental collisions are rejected", async () => {
  const one = await createSyncTextBundle("filters", "same", options("public account one"));
  const two = await createSyncTextBundle("filters", "same", options("public account two"));
  const notes = await createSyncTextBundle("notes", "same", options("public account one"));
  assert.notEqual(one.parts[0].id, two.parts[0].id);
  assert.notEqual(one.parts[0].id, notes.parts[0].id);
  await assert.rejects(createSyncTextBundle("filters", "text"), /invalid_record/);
  await assert.rejects(createSyncTextBundle("filters", "a".repeat(MAX_SYNC_TEXT_PART_BYTES),
    { digest, entryId: async () => "same-id" }), /invalid_record/);
});

test("asynchronous lookups preserve the validated manifest and fragment values", async () => {
  const bundle = await createSyncTextBundle("filters", "abc", options());
  const manifest = structuredClone(bundle.manifest);
  const part = structuredClone(bundle.parts[0].value);
  const text = await assembleSyncTextBundle("filters", manifest, async () => {
    manifest.digest = "0".repeat(64);
    return part;
  }, async value => {
    part.text = "def";
    return digest(value);
  });
  assert.equal(text, "abc", "A lookup cannot change the value after it was validated");
});
