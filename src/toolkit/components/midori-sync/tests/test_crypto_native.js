/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let vectors;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const RECORD_PURPOSE = Ci.nsIMidoriSyncCrypto.PURPOSE_RECORD;
const LOCAL_PURPOSE = Ci.nsIMidoriSyncCrypto.PURPOSE_LOCAL;

function createCrypto() {
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(
    Ci.nsIMidoriSyncCrypto
  );
  registerCleanupFunction(() => crypto.close());
  return crypto;
}

function locator(context) {
  const { collection, id, generation } = context;
  return JSON.stringify({ collection, id, generation });
}

function isResult(expected) {
  return error => error.result === expected;
}

function recover(crypto, scope = vectors.scope) {
  return crypto.recoverNativeKey(
    JSON.stringify(scope),
    encoder.encode(vectors.passphrase),
    JSON.stringify(vectors.bundle)
  );
}

add_setup(async function () {
  vectors = await IOUtils.readJSON(do_get_file("native-sodium.json").path);
});

add_task(async function bookmark_model_merges_in_rust_and_copies_requests() {
  const crypto = createCrypto();
  const base = { version: 1, kind: "bookmark", parentGuid: "toolbar_____", index: 0,
    title: "Título ñ", url: "https://example.invalid/one", dateAdded: 1000 };
  const local = { ...base, title: "Edición local" };
  const remote = { ...base, url: "https://example.invalid/two" };
  const input = encoder.encode(JSON.stringify({ action: "merge", id: "bookmark____", base, local, remote }));
  const pending = crypto.processBookmark(input);
  input.fill(0);
  const result = JSON.parse(await pending);
  Assert.equal(result.status, "apply");
  Assert.equal(result.value.title, local.title);
  Assert.equal(result.value.url, remote.url);
  const replay = JSON.parse(await crypto.processBookmark(encoder.encode(JSON.stringify({
    action: "merge", id: "bookmark____", base, local: result.value, remote,
  }))));
  Assert.equal(replay.status, "keep_local", "Replaying a merge preserves the combined local result");
  const conflict = JSON.parse(await crypto.processBookmark(encoder.encode(JSON.stringify({
    action: "merge", id: "bookmark____", base, local, remote: { ...base, title: "Edición remota" },
  }))));
  Assert.equal(conflict.status, "conflict");
  Assert.deepEqual(conflict.fields, ["title"]);
});

add_task(async function bookmark_model_rejects_invalid_data_and_late_results() {
  const crypto = createCrypto();
  const value = { version: 1, kind: "bookmark", parentGuid: "toolbar_____", index: 0,
    title: "Fixture", url: "https://example.invalid/", dateAdded: 1000 };
  const input = encoder.encode(JSON.stringify({ action: "validate", id: "bookmark____", value }));
  Assert.deepEqual(JSON.parse(await crypto.processBookmark(input)), value);
  for (const mutation of [{ version: 2 }, { parentGuid: "bookmark____" }, { title: "x".repeat(4097) }, { index: -1 }, { url: null }]) {
    await Assert.rejects(crypto.processBookmark(encoder.encode(JSON.stringify({
      action: "validate", id: "bookmark____", value: { ...value, ...mutation },
    }))), isResult(Cr.NS_ERROR_INVALID_ARG));
  }
  Assert.throws(() => crypto.processBookmark(new Uint8Array(524289)), isResult(Cr.NS_ERROR_INVALID_ARG));
  await Assert.rejects(crypto.processBookmark(new Uint8Array([255])), isResult(Cr.NS_ERROR_INVALID_ARG));
  await Assert.rejects(crypto.processBookmark(encoder.encode(JSON.stringify({
    action: "merge", id: "bookmark____", base: value, local: value,
  }))), isResult(Cr.NS_ERROR_INVALID_ARG));
  const pending = crypto.processBookmark(input);
  crypto.close();
  await Assert.rejects(pending, isResult(Cr.NS_ERROR_ABORT));
  Assert.throws(() => crypto.processBookmark(input), isResult(Cr.NS_ERROR_NOT_AVAILABLE));
});

add_task(async function native_unicode_fixtures_match_sodium() {
  const crypto = createCrypto();
  const id = await recover(crypto);
  Assert.ok(Number.isInteger(id) && id > 0);
  Assert.equal(await crypto.nativeKeyId(id), vectors.key_id);
  for (const [collection, formats] of Object.entries(vectors.records)) {
    for (const [purpose, name] of [[RECORD_PURPOSE, "record"], [LOCAL_PURPOSE, "local"]]) {
      const envelope = formats[name].envelope;
      const bytes = await crypto.openNative(
        id, purpose, locator(envelope.context), JSON.stringify(envelope)
      );
      Assert.ok(bytes instanceof Uint8Array);
      Assert.equal(decoder.decode(bytes), vectors.plaintext, `${collection}/${name}`);
      bytes.fill(0);
    }
  }
  for (let field = 0; field < 3; field++) {
    const scope = [...vectors.scope];
    scope[field] += "other";
    await Assert.rejects(recover(crypto, scope), error => error.name === "OperationError");
  }
});

add_task(async function generated_keys_round_trip_and_recover_in_another_instance() {
  const crypto = createCrypto();
  const context = vectors.records.passwords.record.envelope.context;
  const id = await crypto.generateNativeKey(JSON.stringify(vectors.scope));
  const publicId = await crypto.nativeKeyId(id);
  Assert.ok(/^[A-Za-z0-9_-]{22}$/.test(publicId));
  const plaintext = encoder.encode(vectors.plaintext);
  const pending = crypto.sealNative(id, RECORD_PURPOSE, JSON.stringify(context), plaintext);
  plaintext.fill(0);
  const envelope = await pending;
  Assert.equal(JSON.parse(envelope).context.id, "registro-ñ");
  Assert.equal(JSON.parse(envelope).context.base_revision, "9007199254740993");
  Assert.equal(JSON.parse(envelope).key_id, publicId);
  Assert.equal(decoder.decode(await crypto.openNative(id, RECORD_PURPOSE, locator(context), envelope)), vectors.plaintext);
  const again = await crypto.sealNative(id, RECORD_PURPOSE, JSON.stringify(context), encoder.encode(vectors.plaintext));
  Assert.notEqual(JSON.parse(envelope).nonce, JSON.parse(again).nonce);
  const passphrase = encoder.encode(vectors.passphrase);
  const wrapping = crypto.wrapNativeKey(id, passphrase);
  passphrase.fill(0);
  const bundle = await wrapping;
  const other = createCrypto();
  const restored = await other.recoverNativeKey(JSON.stringify(vectors.scope), encoder.encode(vectors.passphrase), bundle);
  Assert.equal(await other.nativeKeyId(restored), publicId);
  Assert.equal(decoder.decode(await other.openNative(restored, RECORD_PURPOSE, locator(context), envelope)), vectors.plaintext);
  await crypto.forgetKey(id);
  await Assert.rejects(crypto.nativeKeyId(id), isResult(Cr.NS_ERROR_NOT_AVAILABLE));
  Assert.equal(await other.nativeKeyId(restored), publicId);
  for (const length of [0, 190000]) {
    const bytes = new Uint8Array(length).fill(173);
    const encrypted = await other.sealNative(restored, LOCAL_PURPOSE, JSON.stringify(context), bytes);
    Assert.deepEqual(await other.openNative(restored, LOCAL_PURPOSE, locator(context), encrypted), bytes);
    bytes.fill(0);
  }
  Assert.throws(() => other.sealNative(restored, RECORD_PURPOSE, JSON.stringify(context), new Uint8Array(190001)), isResult(Cr.NS_ERROR_INVALID_ARG));
});

add_task(async function native_authentication_rejects_relocation_and_tampering() {
  const crypto = createCrypto();
  const id = await recover(crypto);
  const fixture = vectors.records.bookmarks.record.envelope;
  for (const field of ["id", "collection", "generation", "base_revision"]) {
    const envelope = JSON.parse(JSON.stringify(fixture));
    envelope.context[field] = {
      id: "different",
      collection: "history",
      generation: "00000000-0000-4000-8000-000000000002",
      base_revision: "9007199254740994",
    }[field];
    await Assert.rejects(crypto.openNative(id, RECORD_PURPOSE, locator(envelope.context), JSON.stringify(envelope)), error => error.name === "OperationError");
  }
  const expected = locator(fixture.context);
  await Assert.rejects(crypto.openNative(id, LOCAL_PURPOSE, expected, JSON.stringify(fixture)), error => error.name === "OperationError");
  for (const field of ["nonce", "ciphertext"]) {
    const envelope = JSON.parse(JSON.stringify(fixture));
    const value = atob(envelope[field]);
    envelope[field] = btoa(String.fromCharCode(value.charCodeAt(0) ^ 1) + value.slice(1));
    await Assert.rejects(crypto.openNative(id, RECORD_PURPOSE, expected, JSON.stringify(envelope)), error => error.name === "OperationError");
  }
  const unknownVersion = { ...fixture, crypto_version: 1 };
  await Assert.rejects(crypto.openNative(id, RECORD_PURPOSE, expected, JSON.stringify(unknownVersion)), error => error.name === "NotSupportedError");
  const expensiveBundle = JSON.parse(JSON.stringify(vectors.bundle));
  expensiveBundle.kdf.memory_kib = 4294967295;
  await Assert.rejects(crypto.recoverNativeKey(JSON.stringify(vectors.scope), encoder.encode(vectors.passphrase), JSON.stringify(expensiveBundle)), error => error.name === "NotSupportedError");
  Assert.equal(decoder.decode(await crypto.openNative(id, RECORD_PURPOSE, expected, JSON.stringify(fixture))), vectors.plaintext);
});

add_task(async function native_capacity_and_shutdown_discard_pending_results() {
  const crypto = createCrypto();
  const scope = JSON.stringify(vectors.scope);
  const ids = [];
  for (let i = 0; i < 8; i++) {
    ids.push(await crypto.generateNativeKey(scope));
  }
  await Assert.rejects(crypto.generateNativeKey(scope), error => error.name === "QuotaExceededError");
  await crypto.forgetKey(ids[0]);
  Assert.ok(await crypto.generateNativeKey(scope) > ids[7]);
  const pending = crypto.wrapNativeKey(ids[1], encoder.encode(vectors.passphrase));
  crypto.close();
  await Assert.rejects(pending, isResult(Cr.NS_ERROR_ABORT));
  Assert.throws(() => crypto.nativeKeyId(ids[1]), isResult(Cr.NS_ERROR_NOT_AVAILABLE));
});
