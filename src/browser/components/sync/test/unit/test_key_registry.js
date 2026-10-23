/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncKeys } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncKeys.sys.mjs");

add_task(async function registry_revision_matches_independent_sodium_and_rejects_tampering() {
  const fixture = await IOUtils.readJSON(do_get_file("fixtures/h1-key-registry.json").path);
  let remote = structuredClone(fixture.state);
  let local = { version: 1, epoch: remote.epoch, revision: remote.revision,
    secret: fixture.local_secret, keys: structuredClone(remote.keys), identity_key: structuredClone(remote.identity_key),
    active_key_id: remote.active_key_id, custody: "client", registry_auth_version: 2,
    pending: null, recovery_confirmed: true };
  let writes = 0;
  let requests = 0;
  const account = {
    snapshot: { status: "connected", generation: 1 },
    subscribe() { return () => {}; },
    async withLocalSecrets(work) {
      return work({ scope: JSON.stringify(fixture.scope), generation: this.snapshot.generation,
        readLocalKeys: () => structuredClone(local),
        async writeLocalKeys(value) { ++writes; local = structuredClone(value); },
        async request() { throw new Error("Offline custody must never contact the service"); },
      });
    },
    async withSecrets(work) {
      if (this.snapshot.status === "local") {
        throw Object.assign(new Error("remote_access_unavailable"), { code: "remote_access_unavailable" });
      }
      return work({
        scope: JSON.stringify(fixture.scope), generation: 1,
        readLocalKeys: () => structuredClone(local),
        async writeLocalKeys(value) { ++writes; local = structuredClone(value); },
        async request(path) {
          ++requests;
          Assert.equal(path, "api/v1/crypto/state");
          return { data: structuredClone(remote) };
        },
      });
    },
  };
  const options = { account,
    cryptoFactory: () => Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto) };
  let keys = new MidoriSyncKeys(options);
  try {
    await keys.refresh();
    Assert.equal(keys.snapshot.status, "ready", "The native bridge verifies the independent PHP/libsodium registry");
    Assert.equal(keys.snapshot.registryAuthVersion, 2);
    Assert.equal(keys.snapshot.registryUpgradeRequired, false);
    const verified = structuredClone(local);
    const savedWrites = writes;
    const savedRequests = requests;
    keys.close();
    account.snapshot.status = "local";
    ++account.snapshot.generation;
    keys = new MidoriSyncKeys(options);
    await keys.unlockLocal();
    Assert.equal(keys.snapshot.status, "ready");
    Assert.equal(keys.snapshot.localOnly, true);
    Assert.equal(keys.snapshot.canRotate, false);
    const context = { collection: "bookmarks", id: "offline-native-registry", generation: remote.epoch,
      schema_version: 1, base_revision: "0" };
    const plaintext = new TextEncoder().encode("public offline native fixture");
    const envelope = await keys.sealLocal(context, plaintext);
    const opened = await keys.openLocal({ collection: context.collection, id: context.id, generation: context.generation }, envelope);
    Assert.equal(new TextDecoder().decode(opened), "public offline native fixture");
    opened.fill(0);
    plaintext.fill(0);
    Assert.equal(requests, savedRequests, "Recovering and using local keys never sends HTTP");
    Assert.equal(writes, savedWrites);
    keys.close();
    local.verified_state.registry_auth = "0".repeat(64);
    keys = new MidoriSyncKeys(options);
    await Assert.rejects(keys.unlockLocal(), error => error.code === "registry_authentication_failed");
    Assert.equal(writes, savedWrites, "A tampered cached registry cannot advance protected custody");
    keys.close();
    local = structuredClone(verified);
    account.snapshot.status = "connected";
    ++account.snapshot.generation;
    keys = new MidoriSyncKeys(options);
    remote.revision = "100";
    await Assert.rejects(keys.refresh(), error => error.code === "registry_authentication_failed",
      "An inflated counter cannot reuse a previously valid MAC after reopening");
    Assert.equal(writes, savedWrites, "An unauthenticated counter never advances the vault checkpoint");
    Assert.deepEqual(local, verified);
    remote = { ...structuredClone(fixture.state), registry_auth_version: 1 };
    await Assert.rejects(keys.refresh(), error => error.code === "crypto_state_conflict",
      "A profile pinned to v2 refuses a downgrade to the older registry");
    Assert.equal(writes, savedWrites);
    remote = structuredClone(fixture.state);
    await keys.refresh();
    Assert.equal(keys.snapshot.status, "ready", "The legitimate registry remains usable after rejected responses");
  } finally {
    keys.close();
  }
});

add_task(async function a_password_capsule_recovers_retained_keys_and_rejects_tampering_and_account_changes() {
  const { createNativeSyncKeys } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncNativeKeys.sys.mjs");
  const fixture = await IOUtils.readJSON(do_get_file("fixtures/h1-key-registry.json").path);
  const remote = { ...structuredClone(fixture.state), password_unlock: false };
  let scope = JSON.stringify(fixture.scope);
  let local = { version: 1, epoch: remote.epoch, revision: remote.revision,
    secret: fixture.local_secret, keys: structuredClone(remote.keys), identity_key: structuredClone(remote.identity_key),
    active_key_id: remote.active_key_id, custody: "client", registry_auth_version: 2,
    pending: null, recovery_confirmed: true };
  let capsule;
  let writes = 0;
  const password = "public native password fixture 🔑";
  const options = {
    account: {
      snapshot: { status: "connected", generation: 1 },
      subscribe() { return () => {}; },
      async withSecrets(work) {
        return work({
          scope, generation: 1,
          readLocalKeys: () => structuredClone(local),
          async writeLocalKeys(value) { ++writes; local = structuredClone(value); },
          async request(path, request = {}) {
            if (path === "api/v1/crypto/state") {
              return { data: structuredClone(remote) };
            }
            Assert.equal(path, "api/v1/crypto/password");
            if (request.method === "PUT") {
              Assert.ok(!JSON.stringify(request.body).includes(password), "No plaintext password is sent");
              capsule = structuredClone(request.body.capsule);
              remote.password_unlock = true;
              return { data: null };
            }
            return { data: { epoch: remote.epoch, capsule: structuredClone(capsule) } };
          },
        });
      },
    },
  };
  let keys = createNativeSyncKeys(options.account);
  try {
    await keys.refresh();
    Assert.equal(keys.snapshot.status, "ready");
    Assert.equal(keys.snapshot.recoveryCodeAvailable, false, "An old profile does not invent a missing recovery code");
    const identity = await keys.deriveRecordId("history", ["https://example.invalid/password-capsule", 0]);
    await keys.setAccountPassword(password);
    Assert.equal(keys.snapshot.passwordUnlockAvailable, true);
    keys.close();
    local = null;
    keys = createNativeSyncKeys(options.account);
    await keys.refresh();
    Assert.equal(keys.snapshot.status, "recovery-required");
    const beforeUnlock = writes;
    await Assert.rejects(keys.unlockWithAccountPassword("wrong fixture password"), error => error.code === "password_unlock_failed");
    Assert.equal(writes, beforeUnlock);
    const originalPayload = capsule.payload;
    const payload = JSON.parse(originalPayload);
    payload.ciphertext = (payload.ciphertext[0] === "A" ? "B" : "A") + payload.ciphertext.slice(1);
    capsule.payload = JSON.stringify(payload);
    await Assert.rejects(keys.unlockWithAccountPassword(password), error => error.code === "password_unlock_failed");
    Assert.equal(writes, beforeUnlock, "An altered capsule cannot install keys");
    capsule.payload = originalPayload;
    scope = JSON.stringify([...fixture.scope.slice(0, 2), "another-synthetic-subject"]);
    await Assert.rejects(keys.unlockWithAccountPassword(password), error => error.code === "password_unlock_failed");
    Assert.equal(writes, beforeUnlock, "The same password cannot cross the authenticated account scope");
    scope = JSON.stringify(fixture.scope);
    await keys.unlockWithAccountPassword(password);
    Assert.equal(keys.snapshot.status, "ready");
    Assert.equal(await keys.deriveRecordId("history", ["https://example.invalid/password-capsule", 0]), identity,
      "The recovered native identity remains unchanged");
    Assert.ok(local.secret !== fixture.local_secret, "A recovered profile uses its own local wrapping secret");
  } finally {
    keys.close();
  }
});
