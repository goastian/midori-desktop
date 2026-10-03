/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { createProfileSyncVault, createSyncVaultFileStore, authorizeSyncSecretStore } =
  ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncSecretStore.sys.mjs");
const { MAX_VAULT_FILE_BYTES } =
  ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncVault.sys.mjs");
const vaultScope = JSON.stringify(["http://localhost:8000/", "urn:midori:sync:local", "public-fixture"]);

async function boundedVaultRequest(work) {
  const { setTimeout: startTimer, clearTimeout: stopTimer } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
  let timer;
  try {
    return await Promise.race([work, new Promise((_, reject) => {
      timer = startTimer(() => reject(new Error("Noninteractive access did not finish")), 5000);
    })]);
  } finally {
    stopTimer(timer);
  }
}

add_task(async function native_storage_has_an_explicit_backend_and_rejects_unprotected_nss() {
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  Assert.equal(typeof keyStore.isOSBacked, "boolean");
  Assert.equal(keyStore.supportsNonInteractiveAccess, true);
  if (Services.env.get("MIDORI_SYNC_TEST_EXPECT_NSS") === "1") {
    Assert.equal(keyStore.isOSBacked, false, "This run exercises the real NSS fallback");
  }
  info(`Native OS-backed keystore: ${keyStore.isOSBacked}`);
  const token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
  Assert.equal(token.hasPassword, false, "The isolated test profile has no primary password");
  await Assert.rejects(authorizeSyncSecretStore({ isOSBacked: false }, () => token), /primary_password_required/);
});

add_task(async function locked_private_keyring_never_prompts_or_replaces_custody() {
  const root = Services.env.get("MIDORI_SYNC_TEST_KEYRING_ROOT");
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  if (!root || !keyStore.isOSBacked || Services.appinfo.OS !== "Linux") {
    info("The locked OS keyring test requires the isolated Linux launcher");
    return;
  }
  Assert.ok(/^\/tmp\/midori-sync-native-[A-Za-z0-9]+$/.test(root));
  const { Subprocess } = ChromeUtils.importESModule("resource://gre/modules/Subprocess.sys.mjs");
  const run = async (command, args, input = "") => {
    const process = await Subprocess.call({ command: await Subprocess.pathSearch(command), arguments: args, stderr: "stdout" });
    const output = process.stdout.readString();
    if (input) { await process.stdin.write(input); }
    await process.stdin.close();
    const [{ exitCode }, text] = await Promise.all([process.wait(), output]);
    if (exitCode) { info(text); }
    Assert.equal(exitCode, 0, `${command} completed for the isolated keyring`);
    return text;
  };
  const call = (path, method, ...args) => run("gdbus", ["call", "--session", "--dest", "org.freedesktop.secrets", "--object-path", path, "--method", method, ...args]);
  const gioPython = Services.env.get("MIDORI_SYNC_TEST_GIO_PYTHON");
  Assert.ok(gioPython.startsWith("/"), "The launcher provides its checked Python GIO interpreter");
  const unlock = path => run(gioPython, [do_get_file("unlock_test_keyring.py").path, path], "public synthetic keyring test password\n");
  const vault = await createProfileSyncVault();
  const store = createSyncVaultFileStore(PathUtils.join(PathUtils.profileDir, "midori-sync"));
  const data = { token: "public isolated locked-keyring fixture" };
  let collection;
  try {
    await vault.save(vaultScope, data);
    Assert.deepEqual(await vault.load(vaultScope, { interactive: false }), { scope: vaultScope, data });
    const record = await store.read();
    const alias = await call("/org/freedesktop/secrets", "org.freedesktop.Secret.Service.ReadAlias", "default");
    collection = alias.match(/'(\/org\/freedesktop\/secrets\/collection\/[A-Za-z0-9_/]+)'/)?.[1];
    Assert.ok(collection, "The collection belongs to the private test service");
    await call("/org/freedesktop/secrets", "org.freedesktop.Secret.Service.Lock", JSON.stringify([collection]));
    const locked = await call(collection, "org.freedesktop.DBus.Properties.Get", "org.freedesktop.Secret.Collection", "Locked");
    Assert.ok(locked.includes("true"));
    for (const request of [
      () => keyStore.asyncSecretAvailable(record.label, true),
      () => keyStore.asyncEncryptBytes(record.label, new Uint8Array([1]), true),
      () => keyStore.asyncDecryptBytes(record.label, record.ciphertext, true),
    ]) {
      await Assert.rejects(boundedVaultRequest(request()), error => error.result === Cr.NS_ERROR_ABORT);
    }
    await Assert.rejects(boundedVaultRequest(vault.load(vaultScope, { interactive: false })), /vault_locked/);
    await Assert.rejects(boundedVaultRequest(vault.save(vaultScope, { token: "must not be stored" }, { interactive: false })), /vault_locked/);
    Assert.deepEqual(await store.read(), record, "Blocked access leaves the ciphertext and key label intact");
    Assert.ok((await call(collection, "org.freedesktop.DBus.Properties.Get", "org.freedesktop.Secret.Collection", "Locked")).includes("true"));
    await unlock(collection);
    Assert.ok((await call(collection, "org.freedesktop.DBus.Properties.Get", "org.freedesktop.Secret.Collection", "Locked")).includes("false"), "The fixture explicitly unlocked its private collection");
    collection = null;
    Assert.deepEqual(await vault.load(vaultScope, { interactive: false }), { scope: vaultScope, data });
    await vault.save(vaultScope, { token: "updated without prompting" }, { interactive: false });
    Assert.equal((await store.read()).label, record.label);
    Assert.equal((await vault.load(vaultScope, { interactive: false })).data.token, "updated without prompting");
  } finally {
    if (collection) {
      await unlock(collection);
    }
    await vault.clear();
    vault.close();
  }
});

add_task(async function locked_nss_requires_explicit_authentication_and_preserves_custody() {
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  if (keyStore.isOSBacked) {
    info("The locked NSS test requires the isolated fallback backend");
    return;
  }
  const token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
  const password = "public locked primary password fixture";
  await token.changePassword("", password);
  await token.changePassword(password, password);
  const vault = await createProfileSyncVault();
  const store = createSyncVaultFileStore(PathUtils.join(PathUtils.profileDir, "midori-sync"));
  const data = { token: "public isolated NSS fixture" };
  try {
    await vault.save(vaultScope, data);
    const record = await store.read();
    Assert.deepEqual(await vault.load(vaultScope, { interactive: false }), { scope: vaultScope, data });
    await token.logout();
    Assert.equal(token.isLoggedIn, false);
    for (const request of [
      () => keyStore.asyncSecretAvailable(record.label, true),
      () => keyStore.asyncEncryptBytes(record.label, new Uint8Array([1]), true),
      () => keyStore.asyncDecryptBytes(record.label, record.ciphertext, true),
    ]) {
      await Assert.rejects(boundedVaultRequest(request()), error => error.result === Cr.NS_ERROR_ABORT);
    }
    await Assert.rejects(boundedVaultRequest(vault.load(vaultScope, { interactive: false })), /vault_locked/);
    await Assert.rejects(boundedVaultRequest(vault.save(vaultScope, { token: "must not be stored" }, { interactive: false })), /vault_locked/);
    Assert.equal(token.isLoggedIn, false, "Background access never authenticates the token");
    Assert.deepEqual(await store.read(), record);
    await token.changePassword(password, password);
    Assert.equal(token.isLoggedIn, true);
    Assert.deepEqual(await vault.load(vaultScope, { interactive: false }), { scope: vaultScope, data });
    await vault.save(vaultScope, { token: "updated without prompting" }, { interactive: false });
    Assert.equal((await store.read()).label, record.label);
    Assert.equal((await vault.load(vaultScope, { interactive: false })).data.token, "updated without prompting");
  } finally {
    await token.changePassword(password, password);
    await vault.clear();
    vault.close();
    await token.changePassword(password, "");
  }
});

add_task(async function real_native_store_protects_and_restores_a_profile_vault() {
  const vault = await createProfileSyncVault();
  const directory = PathUtils.join(PathUtils.profileDir, "midori-sync");
  const store = createSyncVaultFileStore(directory);
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  let token;
  if (!keyStore.isOSBacked) {
    token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
    await token.changePassword("", "public primary password fixture");
    await token.changePassword("public primary password fixture", "public primary password fixture");
  }
  let reopened;
  try {
    Assert.deepEqual(await vault.inspect(), { present: false });
    const data = { token: "fictional-native-session-token", name: "Usuario ñ", wrappedKey: "fixture-only" };
    await vault.save(vaultScope, data);
    const record = await store.read();
    Assert.ok(await keyStore.asyncSecretAvailable(record.label));
    const storedText = await IOUtils.readUTF8(PathUtils.join(directory, "account.json"));
    Assert.ok(!storedText.includes(data.token));
    Assert.ok(!storedText.includes(data.name));
    Assert.ok(!storedText.includes(vaultScope));
    vault.close();
    reopened = await createProfileSyncVault();
    Assert.deepEqual(await reopened.load(vaultScope), { scope: vaultScope, data });
    await reopened.save(vaultScope, { ...data, token: "updated-native-session-token" });
    Assert.equal((await store.read()).label, record.label);
    Assert.equal((await reopened.load(vaultScope)).data.token, "updated-native-session-token");

    const identityPath = PathUtils.join(directory, "profile-id");
    const identity = await IOUtils.read(identityPath);
    await IOUtils.remove(identityPath);
    await Assert.rejects(createProfileSyncVault(), /vault_corrupt/);
    await IOUtils.write(identityPath, identity, { flush: true });

    await keyStore.asyncDeleteSecret(record.label);
    await Assert.rejects(reopened.load(vaultScope), /local_secret_missing/);
    await Assert.rejects(reopened.save(vaultScope, data), /local_secret_missing/);
    await Assert.rejects(reopened.load(vaultScope, { interactive: false }), /local_secret_missing/);
    await Assert.rejects(reopened.save(vaultScope, data, { interactive: false }), /local_secret_missing/);
    Assert.equal((await store.read()).label, record.label);
    Assert.equal(await keyStore.asyncSecretAvailable(record.label), false);
    Assert.equal(await keyStore.asyncSecretAvailable(record.label, true), false);
    Assert.deepEqual(await reopened.clear(), { keyDeleted: true });
    Assert.equal(await store.read(), null);
  } finally {
    if (reopened) {
      await reopened.clear();
      reopened.close();
    }
    vault.close();
    if (token) {
      await token.changePassword("public primary password fixture", "");
    }
  }
});

add_task(async function profile_file_reads_are_bounded_and_corruption_is_not_replaced() {
  const directory = PathUtils.join(PathUtils.profileDir, "vault-corruption-test");
  await IOUtils.makeDirectory(directory);
  const path = PathUtils.join(directory, "account.json");
  const store = createSyncVaultFileStore(directory);
  await IOUtils.write(path, new Uint8Array(MAX_VAULT_FILE_BYTES + 1).fill(65));
  await Assert.rejects(store.read(), /vault_corrupt/);
  await IOUtils.write(path, new Uint8Array([255]));
  await Assert.rejects(store.read(), /vault_corrupt/);
  Assert.equal((await IOUtils.stat(path)).size, 1);
  await store.remove();
  Assert.equal(await store.read(), null);
});
