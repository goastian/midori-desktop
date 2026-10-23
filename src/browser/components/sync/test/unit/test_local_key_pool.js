/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { recoverLocalSyncKeys } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncKeys.sys.mjs");

add_task(async function local_recovery_spans_native_keyrings_without_expanding_the_remote_registry() {
  const factory = () => Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const generator = factory();
  const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
  const scope = JSON.stringify(["https://sync.example.invalid/", "https://accounts.example.invalid/", "pool-fixture"]);
  const secret = new Uint8Array(32).fill(37);
  const local = { version: 1, epoch: uuid(), revision: "9", pending: null,
    secret: Array.from(secret, byte => byte.toString(16).padStart(2, "0")).join(""), keys: [] };
  const records = [];
  let keys;
  let instances = 0;
  let closed = 0;
  const trackedFactory = () => {
    ++instances;
    const crypto = factory();
    return {
      recoverNativeKey: (...args) => crypto.recoverNativeKey(...args),
      nativeKeyId: (...args) => crypto.nativeKeyId(...args),
      openNative: (...args) => crypto.openNative(...args),
      close() { ++closed; crypto.close(); },
    };
  };
  try {
    for (let index = 0; index < 9; index++) {
      const handle = await generator.generateNativeKey(scope);
      local.keys.push({ key_id: await generator.nativeKeyId(handle),
        encrypted_bundle: await generator.wrapNativeKey(handle, secret) });
      const context = { collection: "bookmarks", id: `pool-entry-${index}`, generation: uuid(), schema_version: 1, base_revision: "0" };
      const bytes = new TextEncoder().encode(`public fixture ${index}`);
      const payload = await generator.sealNative(handle, Ci.nsIMidoriSyncCrypto.PURPOSE_LOCAL, JSON.stringify(context), bytes);
      records.push({ context, payload, expected: new TextDecoder().decode(bytes) });
      bytes.fill(0);
      await generator.forgetKey(handle);
    }
    keys = await recoverLocalSyncKeys({ scope, value: local, cryptoFactory: trackedFactory });
    Assert.equal(instances, 2, "Nine historical local keys use two native instances of at most eight");
    for (const entry of records) {
      const { schema_version, base_revision, ...locator } = entry.context;
      Assert.equal(schema_version, 1);
      Assert.equal(base_revision, "0");
      const bytes = await keys.openLocal(locator, entry.payload);
      try {
        Assert.equal(new TextDecoder().decode(bytes), entry.expected, "Overlapping numeric handles route to their own instance");
      } finally {
        bytes.fill(0);
      }
    }
    keys.close();
    keys = null;
    Assert.equal(closed, 2, "Closing recovery closes every native instance");
  } finally {
    keys?.close();
    generator.close();
    secret.fill(0);
  }
});
