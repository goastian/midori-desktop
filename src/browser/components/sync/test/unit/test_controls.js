/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { signSyncControl, verifySyncControl } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncControl.sys.mjs");

add_task(async function control_proofs_match_independent_sodium_vectors() {
  const fixture = await IOUtils.readJSON(do_get_file("fixtures/h1-controls.json").path);
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const encoder = new TextEncoder();
  const passphrase = encoder.encode(fixture.passphrase);
  try {
    const handle = await crypto.recoverNativeKey(JSON.stringify(fixture.scope), passphrase, JSON.stringify(fixture.bundle));
    const keys = {
      writeContext: { epoch: fixture.cases[0].control.epoch },
      async deriveRecordId(collection, input) {
        const bytes = encoder.encode(JSON.stringify(input));
        try {
          return await crypto.deriveNativeRecordId(handle, collection, bytes);
        } finally {
          bytes.fill(0);
        }
      },
    };
    for (const entry of fixture.cases) {
      Assert.deepEqual(await signSyncControl(keys, entry.control), entry.control,
        "Desktop produces the independent PHP/libsodium proof");
      const expected = { collection: entry.control.collection, generation: entry.control.generation, minimumRevision: "2" };
      await verifySyncControl(keys, entry.control, expected);
      for (const changed of [
        { ...entry.control, proof: "0".repeat(64) },
        { ...entry.control, operation_id: "00000000-0000-4000-8000-000000000007" },
        { ...entry.control, previous_generation: "00000000-0000-4000-8000-000000000007" },
        { ...entry.control, control_revision: "3" },
      ]) {
        await Assert.rejects(verifySyncControl(keys, changed, expected), error => error.code === "control_authentication_failed");
      }
      await Assert.rejects(verifySyncControl(keys, entry.control, { ...expected, minimumRevision: "3" }),
        error => error.code === "control_authentication_failed");
      await Assert.rejects(verifySyncControl(keys, entry.control, { ...expected, collection: "passwords" }),
        error => error.code === "control_authentication_failed");
    }
  } finally {
    passphrase.fill(0);
    crypto.close();
  }
});
