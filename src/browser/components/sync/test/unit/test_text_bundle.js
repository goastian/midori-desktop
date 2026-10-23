/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { createSyncTextBundle, assembleSyncTextBundle, syncTextDigest, MAX_SYNC_TEXT_BYTES } =
  ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncTextBundle.sys.mjs");
const encoder = new TextEncoder();

add_task(async function native_text_hashes_match_independent_vectors() {
  Assert.equal(await syncTextDigest(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  Assert.equal(await syncTextDigest("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

add_task(async function large_text_parts_fit_actual_native_envelopes_and_reassemble() {
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  try {
    const scope = JSON.stringify(["https://sync.example.invalid/", "https://accounts.example.invalid/", "public-text-bundle-fixture"]);
    const handle = await crypto.generateNativeKey(scope);
    const entryId = async (type, digest) => `t1:${await crypto.deriveNativeRecordId(handle, "midori-privacy",
      encoder.encode(JSON.stringify([1, "text-part", type, digest])))}`;
    const pattern = 'é🦊\0\x1f\n"\\';
    const text = pattern.repeat(Math.floor(MAX_SYNC_TEXT_BYTES / encoder.encode(pattern).length));
    const bundle = await createSyncTextBundle("filters", text, { entryId });
    Assert.ok(bundle.manifest.parts.length > 1);
    const received = new Map();
    const generation = Services.uuid.generateUUID().toString().slice(1, -1);
    const records = [...bundle.parts, { id: "filters", value: bundle.manifest }];
    for (const record of records) {
      const context = JSON.stringify({ collection: "midori-privacy", id: record.id, generation,
        schema_version: 2, base_revision: "0" });
      const plaintext = encoder.encode(JSON.stringify({ version: 2, deleted: false, ttl: null, value: record.value }));
      const envelope = await crypto.sealNative(handle, Ci.nsIMidoriSyncCrypto.PURPOSE_RECORD, context, plaintext);
      Assert.ok(encoder.encode(envelope).length <= 262144, "The actual encrypted envelope fits the transport limit");
      const locator = JSON.stringify({ collection: "midori-privacy", id: record.id, generation });
      const opened = await crypto.openNative(handle, Ci.nsIMidoriSyncCrypto.PURPOSE_RECORD, locator, envelope);
      const value = JSON.parse(new TextDecoder().decode(opened)).value;
      Assert.ok(JSON.stringify(value) === JSON.stringify(record.value), "Native encryption preserves the complete record");
      received.set(record.id, value);
    }
    const last = bundle.parts.at(-1);
    const part = received.get(last.id);
    received.delete(last.id);
    Assert.equal(await assembleSyncTextBundle("filters", received.get("filters"), id => received.get(id)), null,
      "A missing encrypted part cannot become partial filters");
    received.set(last.id, part);
    const assembled = await assembleSyncTextBundle("filters", received.get("filters"), id => received.get(id));
    Assert.equal(assembled.length, text.length);
    Assert.ok(assembled === text, "All bytes survive native sealing, opening and assembly");
    const other = await crypto.generateNativeKey(JSON.stringify([
      "https://sync.example.invalid/", "https://accounts.example.invalid/", "public-other-bundle-account",
    ]));
    const input = encoder.encode(JSON.stringify([1, "text-part", "filters", bundle.parts[0].value.digest]));
    Assert.notEqual(await crypto.deriveNativeRecordId(handle, "midori-privacy", input),
      await crypto.deriveNativeRecordId(other, "midori-privacy", input), "Account keys separate fragment identities");
  } finally {
    crypto.close();
  }
});
