/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function old_firefox_sync_settings_are_unavailable() {
  ok(Services.prefs.prefHasUserValue("services.sync.username"), "The profile has a saved Firefox Sync account");
  ok(Services.prefs.prefIsLocked("identity.fxaccounts.enabled"), "Firefox Accounts remains locked off");
  ok(!Services.prefs.getBoolPref("identity.fxaccounts.enabled"));
  const legacyRequests = [];
  const watchLegacyRequests = subject => {
    const host = subject.QueryInterface(Ci.nsIHttpChannel).URI.host.toLowerCase();
    if (host === "accounts.firefox.com" || host.endsWith(".accounts.firefox.com") ||
        host === "services.mozilla.com" || host.endsWith(".services.mozilla.com")) {
      legacyRequests.push(host);
    }
  };
  Services.obs.addObserver(watchLegacyRequests, "http-on-modify-request");
  try {
    const weave = Cc["@mozilla.org/weave/service;1"].getService(Ci.nsISupports).wrappedJSObject;
    ok(!weave.ready, "Firefox Sync was not initialized by a saved account during startup");
    ok(!weave.timer, "Firefox Sync did not schedule its startup timer");
    weave.init();
    ok(!weave.timer, "A direct initialization cannot schedule the Firefox Sync timer");
    ok(!weave.ready, "A direct initialization cannot start Firefox Sync");
    const service = weave.Weave.Service;
    await service.promiseInitialized;
    ok(!service.enabled, "A direct service import keeps Firefox Sync disabled");
    ok(!service.scheduler, "A direct service import does not register a Firefox Sync scheduler");
    ok(!service.engineManager, "A direct service import does not register Firefox Sync engines");
    await service.sync({ why: "midori-disabled-test" });
    service.queueSync("midori-disabled-test");
    ok(!service.scheduler, "Direct sync calls do not start a scheduler");
    const { FxAccounts } = ChromeUtils.importESModule("resource://gre/modules/FxAccounts.sys.mjs");
    let reads = 0;
    let signOuts = 0;
    const existingAccount = {
      _withCurrentAccountState: async callback => {
        ++reads;
        return callback({ getUserAccountData: async () => ({ email: "existing@example.invalid" }) });
      },
      signOut: async () => { ++signOuts; },
    };
    is(await FxAccounts.prototype.getSignedInUser.call(existingAccount), null,
      "A disabled Firefox account is unavailable to the browser");
    is(reads, 0, "The old Firefox account is not read");
    is(signOuts, 0, "The old Firefox account is not signed out or erased");
    await new Promise(resolve => setTimeout(resolve, 10000));
    is(legacyRequests.length, 0, "A saved Firefox account starts no legacy account or Sync requests");
  } finally {
    Services.obs.removeObserver(watchLegacyRequests, "http-on-modify-request");
  }
  for (const redesign of [false, true]) {
    await SpecialPowers.pushPrefEnv({ set: [["browser.settings-redesign.enabled", redesign]] });
    const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:preferences#sync");
    try {
      const doc = tab.linkedBrowser.contentDocument;
      await TestUtils.waitForCondition(() => doc.getElementById("category-sync")?.hidden &&
        doc.location.hash !== "#sync", "Firefox Sync settings redirect to an available page");
      is(doc.location.hash, redesign ? "#home" : "#general");
      ok(doc.getElementById("category-sync").hidden, "Firefox Sync navigation remains hidden");
    } finally {
      await BrowserTestUtils.removeTab(tab);
      while (gBrowser.tabs.length > 1) {
        await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
      }
      await SpecialPowers.popPrefEnv();
    }
  }
});
