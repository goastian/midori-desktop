/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncAccount } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncAccount.sys.mjs");
const { MidoriSyncConnection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncConnection.sys.mjs");
const { createProfileSyncVault } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncSecretStore.sys.mjs");
const { createNativeSyncKeys } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncNativeKeys.sys.mjs");

add_task(async function local_pairing_persists_in_the_native_vault_and_revokes_on_disconnect() {
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  let primaryToken;
  if (!keyStore.isOSBacked) {
    primaryToken = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
    await primaryToken.changePassword("", "synthetic primary password");
    await primaryToken.changePassword("synthetic primary password", "synthetic primary password");
  }
  await withSyncServer(async server => {
    const baseURL = `http://localhost:${server.identity.primaryPort}/`;
    let token = "a".repeat(64);
    let refreshProof = `mrf_${"a".repeat(64)}`;
    let clock = Date.now();
    const refreshExpiry = new Date(clock + 2592000000).toISOString();
    let receipt = null;
    let receiptProof = null;
    let rotations = 0;
    let refreshRequests = 0;
    let loseRefreshResponse = false;
    let active = false;
    let identityChecks = 0;
    let cryptoState = {
      crypto_state_version: 1, epoch: "7e39942f-9532-4592-a1b9-d03cf202b7dc", revision: "0",
      mode: "legacy", active_key_id: null, incompatible_sessions: 0, migration_required: false, keys: [],
    };
    let activations = 0;
    const accountData = {
      account_version: 1,
      identity: { issuer: "urn:midori:sync:local", subject: "fixture-native", kind: "development" },
      user: { id: "1", name: "Usuario ñ", email: "fixture@example.invalid" },
      device: { id: "107cf1f2-bfdc-4cde-a416-a8ec8576a36b", name: "Desktop ñ", type: "desktop" },
      expires_at: new Date(clock + 3600000).toISOString(),
    };
    server.registerPathHandler("/api/v1/capabilities", (request, response) => {
      Assert.ok(!request.hasHeader("Authorization"));
      respondJSON(response, {
        protocol: "MSP", native_ready: false, account_version: 1, changes_version: 1, operations_version: 1,
        authentication: { pairing: true, development: true, issuer: "urn:midori:sync:local",
          refresh: { version: 1, request_bytes: 4096, lifetime_seconds: 2592000, receipts_per_session: 1024, sessions_per_account: 32 } },
        features: ["opaque_cursors", "snapshot_fence", "tombstones", "device_acknowledgements", "conditional_operations", "idempotent_operations"],
        limits: { change_page_records: 100, change_page_payload_bytes: 4194304, record_payload_bytes: 262144, operation_batch_records: 100, operation_batch_bytes: 4194304 },
      });
    });
    server.registerPathHandler("/api/v1/pair/redeem", (request, response) => {
      Assert.equal(request.method, "POST");
      Assert.ok(!request.hasHeader("Authorization"));
      Assert.ok(!request.hasHeader("Cookie"));
      const stream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
      stream.setInputStream(request.bodyInputStream);
      const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(stream.readByteArray(stream.available()))));
      Assert.deepEqual(data, { pairing_token: "0123456789ABCDEF", device_name: "Desktop ñ", device_type: "desktop", native_refresh: true });
      active = true;
      respondJSON(response, { ...accountData, user: { ...accountData.user, id: 1 }, token,
        refresh_version: 1, refresh_token: refreshProof, refresh_expires_at: refreshExpiry }, 201);
    });
    server.registerPathHandler("/api/v1/account", (request, response) => {
      Assert.ok(active);
      Assert.equal(request.getHeader("Authorization"), `Bearer ${token}`);
      ++identityChecks;
      respondJSON(response, accountData);
    });
    server.registerPathHandler("/api/v1/crypto/state", (request, response) => {
      Assert.equal(request.getHeader("Authorization"), `Bearer ${token}`);
      respondJSON(response, cryptoState);
    });
    server.registerPathHandler("/api/v1/crypto/activate", (request, response) => {
      Assert.equal(request.getHeader("Authorization"), `Bearer ${token}`);
      Assert.equal(request.method, "POST");
      const stream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
      stream.setInputStream(request.bodyInputStream);
      const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(stream.readByteArray(stream.available()))));
      Assert.deepEqual(data.crypto, { epoch: cryptoState.epoch, revision: "0" });
      ++activations;
      cryptoState = { ...cryptoState, revision: "1", mode: "native", active_key_id: data.key_id,
        keys: [{ key_id: data.key_id, encrypted_bundle: data.encrypted_bundle }] };
      respondJSON(response, { error: "simulated failure after commit" }, 500);
    });
    server.registerPathHandler("/api/v1/auth/refresh", (request, response) => {
      Assert.ok(!request.hasHeader("Authorization"), "Renewal uses a separate proof");
      Assert.ok(!request.hasHeader("Cookie"), "Renewal is independent of web cookies");
      const stream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
      stream.setInputStream(request.bodyInputStream);
      const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(stream.readByteArray(stream.available()))));
      if (request.method === "DELETE") {
        Assert.equal(data.refresh_token, refreshProof);
        active = false;
        response.setStatusLine("1.1", 204, "No Content");
        return;
      }
      Assert.equal(request.method, "POST");
      ++refreshRequests;
      if (data.refresh_token === receiptProof) {
        Assert.equal(data.operation_id, receipt.operation_id, "Restart reuses the persisted operation");
      } else {
        Assert.equal(data.refresh_token, refreshProof);
        receiptProof = refreshProof;
        token = String(++rotations).padStart(64, "b");
        refreshProof = `mrf_${token}`;
        accountData.expires_at = new Date(clock + 3600000).toISOString();
        receipt = { ...accountData, refresh_version: 1, operation_id: data.operation_id, token,
          refresh_token: refreshProof, refresh_expires_at: refreshExpiry, expires_in: 3600 };
      }
      if (loseRefreshResponse) {
        loseRefreshResponse = false;
        respondJSON(response, { error: "synthetic failure after commit" }, 500);
      } else {
        respondJSON(response, receipt);
      }
    });
    let account;
    let vault;
    let keys;
    const connection = new MidoriSyncConnection({
      baseURL, allowLocalHTTP: true, saveServer: () => {},
      transportFactory: (url, options) => new MidoriSyncTransport(url, options),
      prepareServerChange: serverConfig => account.prepareServerChange(serverConfig),
    });
    const createAccount = () => new MidoriSyncAccount({
      connection,
      now: () => clock,
      vaultFactory: async () => { vault = await createProfileSyncVault(); return vault; },
      transportFactory: (url, options) => new MidoriSyncTransport(url, options),
    });
    account = createAccount();
    try {
      await account.initialize();
      Assert.equal(account.snapshot.status, "signed-out");
      await account.pair("0123-4567-89ab-cdef", "Desktop ñ");
      Assert.equal(account.snapshot.status, "connected");
      Assert.equal(account.snapshot.user.name, "Usuario ñ");
      keys = createNativeSyncKeys(account);
      await keys.refresh();
      Assert.equal(keys.snapshot.status, "empty");
      const recoveryCode = await keys.prepareCreation();
      Assert.ok(/^MS2-(?:[0-9A-F]{8}-){7}[0-9A-F]{8}$/.test(recoveryCode));
      Assert.equal(activations, 0, "Creation waits for backup confirmation");
      await keys.confirmCreation();
      Assert.equal(activations, 1, "A failed HTTP response after commit does not duplicate activation");
      await keys.refresh();
      Assert.equal(keys.snapshot.status, "ready");
      const cipherText = await IOUtils.readUTF8(PathUtils.join(PathUtils.profileDir, "midori-sync", "account.json"));
      Assert.ok(!cipherText.includes(token));
      Assert.ok(!cipherText.includes(recoveryCode));
      Assert.ok(!JSON.stringify(keys.snapshot).includes(recoveryCode));
      Assert.ok(!JSON.stringify(account.snapshot).includes(token));
      await Assert.rejects(connection.checkAndUseServer("https://unused.example.invalid/"), /account_connected/);
      Assert.equal(connection.snapshot.server.baseURL, baseURL);
      const savedKeys = (await vault.load()).data.crypto;
      const generation = account.snapshot.generation;
      clock = Date.parse(accountData.expires_at) + 1;
      loseRefreshResponse = true;
      await Assert.rejects(account.renew(), /server_error/);
      Assert.equal(account.snapshot.status, "renewal-required");
      Assert.equal(account.snapshot.generation, generation, "A pending renewal keeps the same custody owner");
      Assert.equal(keys.snapshot.status, "ready", "A recoverable network failure retains unlocked Rust keys");
      const pending = await vault.load();
      Assert.equal(pending.data.renewal.pending, receipt.operation_id, "The real protected vault retains the renewal intention");
      Assert.deepEqual(pending.data.crypto, savedKeys, "Renewal preserves the exact Sync key custody");
      account.close();
      Assert.equal(keys.snapshot.status, "locked", "Account shutdown forgets Rust handles");
      keys.close();
      account = createAccount();
      await account.initialize();
      Assert.equal(account.snapshot.status, "locked");
      await account.unlock({ interactive: false });
      Assert.equal(account.snapshot.status, "connected");
      Assert.equal(identityChecks, 2);
      Assert.equal(rotations, 1, "A lost response is recovered without another rotation");
      Assert.equal(refreshRequests, 2);
      Assert.equal((await vault.load()).data.renewal.pending, null);
      keys = createNativeSyncKeys(account);
      await keys.refresh();
      Assert.equal(keys.snapshot.status, "ready", "OS-protected local keys survive account restart");
      const restoredGeneration = account.snapshot.generation;
      const keyContext = keys.writeContext;
      clock = Date.parse(accountData.expires_at) + 1;
      await account.renew();
      Assert.equal(account.snapshot.generation, restoredGeneration, "Successful rotation preserves the account generation");
      Assert.equal(keys.snapshot.status, "ready");
      Assert.deepEqual(keys.writeContext, keyContext, "The current native key remains usable after rotation");
      const renewedDisk = await IOUtils.readUTF8(PathUtils.join(PathUtils.profileDir, "midori-sync", "account.json"));
      Assert.ok(!renewedDisk.includes(token) && !renewedDisk.includes(refreshProof), "Both replacement credentials stay encrypted on disk");
      if (primaryToken) {
        await primaryToken.logout();
        await Assert.rejects(account.withSecrets(() => Assert.ok(false, "A locked lease never runs")), /vault_locked/);
        Assert.equal(account.snapshot.status, "locked");
        Assert.equal(keys.snapshot.status, "locked", "Blocking native custody also invalidates Rust handles");
        Assert.equal(await IOUtils.readUTF8(PathUtils.join(PathUtils.profileDir, "midori-sync", "account.json")), renewedDisk);
        await primaryToken.changePassword("synthetic primary password", "synthetic primary password");
        await account.unlock();
        await keys.refresh();
        Assert.equal(keys.snapshot.status, "ready", "Explicit authentication restores the same key custody");
      }
      await account.disconnect();
      Assert.equal(keys.snapshot.status, "locked");
      await account.pair("0123456789ABCDEF", "Desktop ñ");
      await keys.refresh();
      Assert.equal(keys.snapshot.status, "recovery-required", "A fresh local account has no cloud recovery secret");
      await Assert.rejects(keys.recover("f".repeat(64)), /recovery_failed/);
      await keys.recover(recoveryCode);
      Assert.equal(keys.snapshot.status, "ready", "The backup recovers the actual Rust key");
      await account.disconnect();
      Assert.equal(account.snapshot.status, "signed-out");
      Assert.ok(!active);
      Assert.equal(account.snapshot.revocationPending, false);
      Assert.deepEqual(await vault.inspect(), { present: false });
    } finally {
      keys?.close();
      await vault?.clear();
      account.close();
      connection.close();
    }
  });
  if (primaryToken) {
    await primaryToken.changePassword("synthetic primary password", "");
  }
});
