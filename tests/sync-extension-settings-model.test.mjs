import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { normalizeSyncExtensionSettings, parseSyncExtensionSettings, serializeSyncExtensionSettings, deriveSyncExtensionSettingsId, createSyncExtensionSettingsBundle,
  validateSyncExtensionSettingsRecord, assembleSyncExtensionSettings, mergeSyncExtensionSettings } from
  "../src/browser/components/sync/MidoriSyncExtensionSettingsModel.sys.mjs";
import { createSyncTextBundle } from "../src/browser/components/sync/MidoriSyncTextBundle.sys.mjs";

const addonId = "@portable-extension";
const digest = async text => createHash("sha256").update(text).digest("hex");
const options = (key = "public settings account A") => ({ digest,
  deriveRecordId: async (collection, bytes) => createHmac("sha256", key).update(collection).update(bytes).digest("hex") });
const assemble = (bundle, parts = bundle.parts, opts = options()) => {
  const records = new Map(parts.map(part => [part.id, part.value]));
  return assembleSyncExtensionSettings(bundle.manifest, id => records.get(id), opts);
};

test("native JSON never silently rounds legacy integer values that JavaScript cannot represent", () => {
  assert.deepEqual(parseSyncExtensionSettings('{"number":100000000000000000000,"float":1e20}'), { number: 1e20, float: 1e20 });
  assert.deepEqual(parseSyncExtensionSettings('{"number":9007199254740992}'), { number: 9007199254740992 });
  for (const text of ['{"number":9007199254740993}', '{"number":18446744073709551615}',
    '{"number":-9007199254740993}', '{"number":1e400}', '"not an object"', "{broken"]) {
    assert.throws(() => parseSyncExtensionSettings(text), { code: "invalid_record" });
  }
});

test("canonical documents sort integer-looking and Unicode keys consistently and preserve array order", () => {
  const data = { "2": "two", "10": "ten", nested: [{ "2": 2, "10": 10 }], "\r": "return",
    "\u0080": "control", "€": "euro", "😀": "emoji", "\ufb33": "letter" };
  assert.equal(serializeSyncExtensionSettings(data),
    '{"\\r":"return","10":"ten","2":"two","nested":[{"10":10,"2":2}],"\u0080":"control","€":"euro","😀":"emoji","\ufb33":"letter"}');
  assert.equal(serializeSyncExtensionSettings({ numbers: [1e20, 1e21, 1e-6, 1e-7, -0, Number.MIN_VALUE, Number.MAX_VALUE] }),
    '{"numbers":[100000000000000000000,1e+21,0.000001,1e-7,0,5e-324,1.7976931348623157e+308]}');
});

test("validly hashed but noncanonical or duplicate-key documents cannot cause cross-client rewrite loops", async () => {
  for (const text of ['{"z":1,"a":2}', '{"a": 1}', '{"a":1,"a":1}', '{"a":-0}']) {
    const opts = options();
    const raw = await createSyncTextBundle("extension-settings", text, { digest,
      entryId: (_type, hash) => deriveSyncExtensionSettingsId("amo", addonId, opts.deriveRecordId, hash) });
    const wrap = bundle => ({ version: 1, type: "extension-settings", catalog: "amo", addonId, bundle });
    const bundle = { manifest: { id: await deriveSyncExtensionSettingsId("amo", addonId, opts.deriveRecordId), value: wrap(raw.manifest) },
      parts: raw.parts.map(part => ({ id: part.id, value: wrap(part.value) })) };
    await assert.rejects(assemble(bundle), { code: "invalid_record" });
  }
});

test("settings normalize plain JSON, object order and prototype-shaped keys without invoking accessors", () => {
  const data = JSON.parse('{"z":0,"__proto__":{"polluted":true},"constructor":"own value","a":{"y":2,"x":1}}');
  const normalized = normalizeSyncExtensionSettings(data);
  assert.equal(Object.getPrototypeOf(normalized), Object.prototype);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(Object.hasOwn(normalized, "__proto__"), true);
  assert.deepEqual(normalized.a, { x: 1, y: 2 });
  assert.equal(normalized.constructor, "own value");
  assert.equal(Object.is(normalizeSyncExtensionSettings({ zero: -0 }).zero, -0), false);
  const getter = Object.defineProperty({}, "secret", { enumerable: true, get() { throw new Error("must not invoke getter"); } });
  const circular = {}; circular.self = circular;
  const sparse = Array(3); sparse[0] = 1; sparse[2] = 3;
  for (const invalid of [null, [], new Date(), getter, circular, { a: undefined }, { a: Infinity }, { a: NaN },
    { a: 1n }, { a: () => {} }, { a: new Map() }, { a: sparse }, { a: "\ud800" }, { [Symbol("key")]: 1 }]) {
    assert.throws(() => normalizeSyncExtensionSettings(invalid), { code: "invalid_record" });
  }
});

test("settings enforce bounded complete documents without confusing an empty value with deletion", async () => {
  const bundle = await createSyncExtensionSettingsBundle("amo", addonId, {}, options());
  assert.deepEqual(await assemble(bundle), {});
  assert.equal(bundle.manifest.value.bundle.byte_count, 2);
  assert.ok(bundle.parts.length > 0);
  assert.throws(() => normalizeSyncExtensionSettings(Object.fromEntries(Array.from({ length: 513 }, (_, i) => [i, 0]))), { code: "invalid_record" });
  assert.throws(() => normalizeSyncExtensionSettings({ value: "x".repeat(2 * 1024 * 1024) }), { code: "invalid_record" });
  let nested = 0;
  for (let depth = 0; depth < 140; ++depth) { nested = { nested }; }
  assert.throws(() => normalizeSyncExtensionSettings(nested), { code: "invalid_record" });
});

test("large numeric configurations use individually bounded parts and survive arbitrary arrival order", async () => {
  const data = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`key-${i}`, Array(1000).fill(1e20)]));
  assert.ok(new TextEncoder().encode(JSON.stringify(data)).length > 190000);
  const bundle = await createSyncExtensionSettingsBundle("amo", addonId, data, options());
  assert.ok(bundle.parts.length > 1);
  for (const part of bundle.parts) {
    assert.ok(new TextEncoder().encode(JSON.stringify({ version: 2, deleted: false, ttl: null, value: part.value })).length < 190000);
    assert.deepEqual(await validateSyncExtensionSettingsRecord(part.id, part.value, options()), part.value);
  }
  assert.deepEqual(await assemble(bundle, [...bundle.parts].reverse()), normalizeSyncExtensionSettings(data));
  assert.equal(await assemble(bundle, bundle.parts.slice(1)), null);
});

test("part identities bind the account and extension even for identical configuration text", async () => {
  const first = await createSyncExtensionSettingsBundle("amo", addonId, { same: true }, options());
  const otherAccount = await createSyncExtensionSettingsBundle("amo", addonId, { same: true }, options("public settings account B"));
  const otherExtension = await createSyncExtensionSettingsBundle("amo", "@different-extension", { same: true }, options());
  assert.notEqual(first.manifest.id, otherAccount.manifest.id);
  assert.notEqual(first.parts[0].id, otherAccount.parts[0].id);
  assert.notEqual(first.manifest.id, otherExtension.manifest.id);
  assert.notEqual(first.parts[0].id, otherExtension.parts[0].id);
  await assert.rejects(assemble(first, first.parts, options("public settings account B")), { code: "invalid_record" });
  await assert.rejects(assemble(first, [{ id: first.parts[0].id, value: otherExtension.parts[0].value }]), { code: "invalid_record" });
});

test("closed records and authenticated manifests reject modified or substituted content", async () => {
  const original = await createSyncExtensionSettingsBundle("amo", addonId, { same: true }, options());
  for (const change of [value => { value.extra = true; }, value => { value.catalog = "untrusted"; },
    value => { value.addonId = "@other-extension"; }, value => { value.type = "extensions"; },
    value => { value.bundle.digest = "0".repeat(64); }, value => { value.bundle.parts[0].byte_count++; value.bundle.byte_count++; }]) {
    const bundle = structuredClone(original);
    change(bundle.manifest.value);
    await assert.rejects(assemble(bundle), { code: "invalid_record" });
  }
  const corrupt = structuredClone(original);
  corrupt.parts[0].value.bundle.text = '{"same":false}';
  await assert.rejects(assemble(corrupt), { code: "invalid_record" });
});

test("identity derivation uses independent manifest and part domains and erases its input", async () => {
  let input;
  const seen = [];
  const derive = async (collection, bytes) => {
    assert.equal(collection, "extension-settings");
    input = bytes;
    seen.push(JSON.parse(new TextDecoder().decode(bytes)));
    return createHmac("sha256", "public key").update(bytes).digest("hex");
  };
  const manifest = await deriveSyncExtensionSettingsId("amo", addonId, derive);
  assert.match(manifest, /^xm1:[0-9a-f]{64}$/);
  assert.deepEqual(seen[0], [1, "extension-settings", "amo", addonId]);
  assert.ok(input.every(byte => byte === 0));
  const hash = await digest("test");
  const part = await deriveSyncExtensionSettingsId("amo", addonId, derive, hash);
  assert.match(part, /^xp1:[0-9a-f]{64}$/);
  assert.deepEqual(seen[1], [1, "extension-settings-part", "amo", addonId, hash]);
  assert.ok(input.every(byte => byte === 0));
  await assert.rejects(deriveSyncExtensionSettingsId("amo", addonId, async () => "invalid"), { code: "invalid_record" });
});

test("three-way merge preserves disjoint changes and deliberate removals and treats null as a value", () => {
  const base = { untouched: true, removed: 1, edited: 0 };
  const local = { untouched: true, edited: 0, local: [1], nullable: null };
  const remote = { untouched: true, removed: 1, edited: 2, remote: { color: "green" } };
  assert.deepEqual(mergeSyncExtensionSettings(base, local, remote), { status: "merged",
    data: { untouched: true, edited: 2, local: [1], nullable: null, remote: { color: "green" } } });
  assert.deepEqual(mergeSyncExtensionSettings({ key: null }, {}, { key: null }), { status: "merged", data: {} });
  assert.deepEqual(mergeSyncExtensionSettings({}, { key: null }, {}), { status: "merged", data: { key: null } });
});

test("conflicting edits, delete-versus-edit and a merged quota overflow require explicit resolution", () => {
  for (const [base, local, remote] of [[{ key: 1 }, { key: 2 }, { key: 3 }],
    [{ key: 1 }, {}, { key: 2 }], [{ key: [1] }, { key: [2] }, { key: [3] }]]) {
    assert.deepEqual(mergeSyncExtensionSettings(base, local, remote), { status: "conflict", reason: "extension_settings_changed" });
  }
  const local = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`local-${i}`, true]));
  const remote = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`remote-${i}`, true]));
  assert.deepEqual(mergeSyncExtensionSettings({}, local, remote), { status: "conflict", reason: "extension_settings_quota" });
});
