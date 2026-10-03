/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function saved_firefox_account_is_preserved_while_disabled() {
  Services.prefs.setBoolPref("identity.fxaccounts.enabled", false);
  const path = PathUtils.join(PathUtils.profileDir, "signedInUser.json");
  Assert.ok(!await IOUtils.exists(path));
  const saved = { version: 1, accountData: {
    uid: "synthetic-fxa-uid", email: "existing@example.invalid",
    sessionToken: "synthetic-fxa-session", verified: true,
  } };
  await IOUtils.writeJSON(path, saved);
  try {
    const { getFxAccountsSingleton } = ChromeUtils.importESModule("resource://gre/modules/FxAccounts.sys.mjs");
    Assert.equal(await getFxAccountsSingleton().getSignedInUser(), null,
      "The saved account does not activate Firefox Accounts");
    Assert.deepEqual(await IOUtils.readJSON(path), saved,
      "Disabling Firefox Accounts preserves its existing profile data");
  } finally {
    await IOUtils.remove(path);
    Services.prefs.clearUserPref("identity.fxaccounts.enabled");
  }
});

add_task(async function firefox_sync_never_initializes_or_transfers() {
  const { Service } = ChromeUtils.importESModule("resource://services-sync/service.sys.mjs");
  const { SyncEngine } = ChromeUtils.importESModule("resource://services-sync/engines.sys.mjs");
  const { STATUS_DISABLED, kSyncWeaveDisabled } = ChromeUtils.importESModule("resource://services-sync/constants.sys.mjs");
  await Service.promiseInitialized;
  Assert.equal(Service.enabled, false);
  Assert.equal(Service.status.service, STATUS_DISABLED);
  Assert.equal(Service.engineManager, undefined, "Firefox engines are not registered at startup");
  Assert.equal(Service.scheduler, undefined, "Firefox scheduler is not started");
  Assert.equal(Service._checkSync(), kSyncWeaveDisabled);
  Assert.equal(await Service.configure(), false);
  Assert.equal(await Service.updateLocalEnginesState(), false);
  Assert.equal(await Service.login(), false);
  Assert.equal(await Service.sync({ why: "test" }), undefined);
  Assert.equal(await Service._lockedSync(null, "test"), undefined);
  Assert.equal(Service.queueSync("test"), undefined);
  Assert.equal(await Service.startOver(), false, "Disabling Firefox Sync leaves remote data untouched");
  let transferred = false;
  Assert.equal(await SyncEngine.prototype.sync.call({ enabled: true, _sync() { transferred = true; } }), false);
  Assert.equal(transferred, false, "A direct Firefox engine call cannot transfer data");
});
