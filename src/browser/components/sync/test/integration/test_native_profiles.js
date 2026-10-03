/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncAccount } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncAccount.sys.mjs");
const { MidoriSyncConnection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncConnection.sys.mjs");
const { MidoriSyncVault } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncVault.sys.mjs");
const { createSyncVaultFileStore, authorizeSyncSecretStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncSecretStore.sys.mjs");
const { createNativeSyncKeys } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncNativeKeys.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const { MidoriSyncHistory, historyRecordId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncHistory.sys.mjs");
const { MidoriSyncHistoryTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncHistoryTracker.sys.mjs");
const { MidoriSyncBookmarks } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncBookmarks.sys.mjs");
const { MidoriSyncTabs } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncTabs.sys.mjs");
const { MidoriSyncService } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncService.sys.mjs");
const { MidoriSyncPasswords } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswords.sys.mjs");
const { MidoriSyncCreditCards } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCreditCards.sys.mjs");
const { formAutofillStorage } = ChromeUtils.importESModule("resource://autofill/FormAutofillStorage.sys.mjs");
const { MidoriSyncPreferences } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPreferences.sys.mjs");
const { MidoriSyncPasswordTracker, MidoriSyncRecordTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswordTracker.sys.mjs");
const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

async function setHistoryTitle(url, title) {
  const model = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  let listener;
  let timer;
  const changed = new Promise((resolve, reject) => {
    listener = events => {
      if (events.some(event => event.url === url && event.title === title)) {
        resolve();
      }
    };
    PlacesUtils.observers.addListener(["page-title-changed"], listener);
    timer = setTimeout(() => reject(new Error("history_title_update_timed_out")), 5000);
  });
  try {
    model.setHistoryTitle(url, title);
    await changed;
  } finally {
    clearTimeout(timer);
    PlacesUtils.observers.removeListener(["page-title-changed"], listener);
    model.close();
  }
}

add_task(async function native_history_and_passwords_cross_two_profiles() {
  const stage = Services.env.get("MIDORI_SYNC_PROFILE_STAGE");
  const fixturePath = Services.env.get("MIDORI_SYNC_TEST_FIXTURE");
  if (!fixturePath || !["A", "B", "C", "D", "E", "F", "G", "H"].includes(stage)) {
    info("Use npm run test:sync -- --native to run the isolated profile stages.");
    return;
  }
  const fixture = await IOUtils.readJSON(fixturePath);
  const updatedTitle = "Title updated in profile B";
  Assert.ok(/^http:\/\/localhost:[0-9]+\/$/.test(fixture.baseURL));
  const statePath = Services.env.get("MIDORI_SYNC_PROFILE_STATE_FILE");
  const statusPath = Services.env.get("MIDORI_SYNC_PROFILE_STATUS_FILE");
  Assert.ok(statePath && statusPath);
  const state = stage === "A" ? null : await IOUtils.readJSON(statePath);
  const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
  const statusCollections = ["bookmarks", "history", "passwords", "credit-cards"];
  if (stage === "G") {
    Services.prefs.setStringPref("midori.sync.serverConfig",
      JSON.stringify({ baseURL: fixture.baseURL, allowLocalHTTP: true }));
    Services.prefs.setBoolPref("midori.sync.enabled", true);
    Services.prefs.setBoolPref("midori.sync.background.enabled", true);
    MidoriSyncService.init();
    try {
      await MidoriSyncService.account.pair(fixture.profiles.G.pairing_token, "Fresh restored profile");
      for (let attempt = 0; attempt < 20 && MidoriSyncService.keys.snapshot.status !== "ready"; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      Assert.equal(MidoriSyncService.keys.snapshot.status, "ready", "Login restores keys without a code");
      const history = new MidoriSyncHistory();
      const passwords = new MidoriSyncPasswords();
      const cards = new MidoriSyncCreditCards();
      try {
        let restored = false;
        for (let attempt = 0; attempt < 75; attempt++) {
          const bookmark = await PlacesUtils.bookmarks.fetch(state.backgroundBookmarkId);
          const visit = await history.readDay(state.url, state.dayStartUsec);
          const password = await passwords.read(state.passwordId);
          const card = await cards.read(state.cardId);
          const historyCompleted = MidoriSyncService.syncCollectionsSnapshot.some(snapshot =>
            snapshot.name === "history" && snapshot.status === "completed");
          const paginatedHistory = historyCompleted &&
            (await history.readDay(state.paginatedHistoryURLs.at(-1), state.dayStartUsec))?.visits.length === 1;
          restored = bookmark?.title === "Background bookmark" && visit?.visits.length >= 1 &&
            password?.password === "synthetic updated password" && card?.name === "Edited in profile B" &&
            Services.prefs.getIntPref("midori.verticaltabs.width", 0) === 400 && paginatedHistory;
          if (restored) {
            break;
          }
          if (attempt % 5 === 4) {
            info(`Fresh profile restore attempt ${attempt + 1}: ${JSON.stringify({
              background: MidoriSyncService.backgroundSnapshot,
              collections: MidoriSyncService.syncCollectionsSnapshot,
            })}`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        Assert.ok(restored, "A freshly paired account restores paginated history and other browser data in the background");
        let restoredHistoryPages = 0;
        for (const url of state.paginatedHistoryURLs) {
          if ((await history.readDay(url, state.dayStartUsec))?.visits.length === 1) {
            ++restoredHistoryPages;
          }
        }
        Assert.equal(restoredHistoryPages, state.paginatedHistoryURLs.length,
          "Every server history page reached the new profile");
      } finally {
        history.close();
        passwords.close();
        cards.close();
      }
    } finally {
      MidoriSyncService.uninit();
      Services.prefs.clearUserPref("midori.sync.serverConfig");
      Services.prefs.clearUserPref("midori.sync.enabled");
      Services.prefs.clearUserPref("midori.sync.background.enabled");
    }
    return;
  }
  if (stage === "H") {
    const localBookmark = await PlacesUtils.bookmarks.insert({
      parentGuid: PlacesUtils.bookmarks.unfiledGuid,
      url: "https://example.invalid/preexisting-bookmark",
      title: "Preexisting bookmark",
    });
    const localURL = "https://example.invalid/preexisting-history";
    const localVisit = new Date();
    await PlacesUtils.history.insert({ url: localURL, title: "Preexisting visit",
      visits: [{ date: localVisit, transition: 1 }] });
    const localDay = Math.floor(localVisit.getTime() * 1000 / 86400000000) * 86400000000;
    const localHistoryId = historyRecordId(localURL, localDay);
    const localPasswordId = `{${uuid()}}`;
    const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
    login.init("https://preexisting.example.invalid", "https://preexisting.example.invalid", null,
      "preexisting-user", "synthetic preexisting password", "username", "password");
    login.QueryInterface(Ci.nsILoginMetaInfo);
    login.guid = localPasswordId;
    await Services.logins.addLoginAsync(login);
    await formAutofillStorage.initialize();
    const localCardId = await formAutofillStorage.creditCards.add({
      "cc-name": "Preexisting card", "cc-number": "5555555555554444",
      "cc-exp-month": 12, "cc-exp-year": 2032,
    });
    Services.prefs.setStringPref("midori.sync.serverConfig",
      JSON.stringify({ baseURL: fixture.baseURL, allowLocalHTTP: true }));
    Services.prefs.setBoolPref("midori.sync.enabled", true);
    Services.prefs.setBoolPref("midori.sync.background.enabled", true);
    MidoriSyncService.init();
    try {
      await MidoriSyncService.account.pair(fixture.profiles.H.pairing_token, "Populated restored profile");
      for (let attempt = 0; attempt < 20 && MidoriSyncService.keys.snapshot.status !== "ready"; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      Assert.equal(MidoriSyncService.keys.snapshot.status, "ready", "Login restores keys into a populated profile");
      const history = new MidoriSyncHistory();
      const passwords = new MidoriSyncPasswords();
      const cards = new MidoriSyncCreditCards();
      try {
        let merged = false;
        for (let attempt = 0; attempt < 60; attempt++) {
          const bookmarks = await MidoriSyncService.collection("bookmarks");
          const historyEngine = await MidoriSyncService.collection("history");
          const passwordEngine = await MidoriSyncService.collection("passwords");
          const cardEngine = await MidoriSyncService.collection("credit-cards");
          const remoteBookmark = await PlacesUtils.bookmarks.fetch(state.backgroundBookmarkId);
          const remoteVisit = await history.readDay(state.url, state.dayStartUsec);
          const remotePassword = await passwords.read(state.passwordId);
          const remoteCard = await cards.read(state.cardId);
          merged = remoteBookmark?.title === "Background bookmark" && remoteVisit?.visits.length >= 1 &&
            remotePassword?.password === "synthetic updated password" && remoteCard?.name === "Edited in profile B" &&
            (await bookmarks.record(localBookmark.guid))?.remote?.revision &&
            (await historyEngine.record(localHistoryId))?.remote?.revision &&
            (await passwordEngine.record(localPasswordId))?.remote?.revision &&
            (await cardEngine.record(localCardId))?.remote?.revision;
          if (merged) {
            break;
          }
          if (attempt % 5 === 4) {
            info(`Populated profile restore attempt ${attempt + 1}: ${JSON.stringify({
              background: MidoriSyncService.backgroundSnapshot,
              collections: MidoriSyncService.syncCollectionsSnapshot,
            })}`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        Assert.ok(merged, "A populated profile receives remote browser data and uploads its existing local data automatically");
        Assert.equal((await PlacesUtils.bookmarks.fetch(localBookmark.guid)).title, "Preexisting bookmark");
        Assert.equal((await history.readDay(localURL, localDay)).visits.length, 1);
        Assert.equal((await passwords.read(localPasswordId)).password, "synthetic preexisting password");
        Assert.equal((await cards.read(localCardId)).name, "Preexisting card");
      } finally {
        history.close();
        passwords.close();
        cards.close();
      }
    } finally {
      MidoriSyncService.uninit();
      Services.prefs.clearUserPref("midori.sync.serverConfig");
      Services.prefs.clearUserPref("midori.sync.enabled");
      Services.prefs.clearUserPref("midori.sync.background.enabled");
    }
    return;
  }
  if (stage === "F") {
    Services.prefs.setBoolPref("identity.fxaccounts.enabled", false);
    Services.prefs.setBoolPref("midori.sync.enabled", true);
    Services.prefs.setBoolPref("midori.sync.background.enabled", true);
    MidoriSyncService.init();
    Services.prefs.setBoolPref("midori.sync.background.enabled", false);
    try {
      let ready = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        const snapshot = MidoriSyncService.backgroundSnapshot;
        ready = snapshot.account === "connected" && snapshot.keys === "ready";
        if (ready) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      Assert.ok(ready, "The second restored process resumes its account and keys");
      Assert.ok(!MidoriSyncService.backgroundSnapshot.scheduler?.available,
        "No background collection pass runs before reading persisted status");
      await Promise.all(statusCollections.map(name => MidoriSyncService.collection(name)));
      const restored = Object.fromEntries(MidoriSyncService.syncCollectionsSnapshot
        .filter(item => statusCollections.includes(item.name)).map(item => [item.name, item.lastSuccessAt]));
      Assert.deepEqual(restored, await IOUtils.readJSON(statusPath),
        "The completed pass times survive a new Gecko process without another Sync cycle");
    } finally {
      MidoriSyncService.uninit();
      Services.prefs.clearUserPref("identity.fxaccounts.enabled");
      Services.prefs.clearUserPref("midori.sync.enabled");
      Services.prefs.clearUserPref("midori.sync.background.enabled");
    }
    return;
  }
  if (stage === "E") {
    Services.prefs.setBoolPref("identity.fxaccounts.enabled", false);
    Services.prefs.setBoolPref("midori.sync.enabled", true);
    Services.prefs.setBoolPref("midori.sync.background.enabled", true);
    const legacyAccountPath = PathUtils.join(PathUtils.profileDir, "signedInUser.json");
    const legacyAccount = await IOUtils.readJSON(legacyAccountPath);
    Assert.equal(legacyAccount.accountData.email, "legacy@example.invalid");
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
      const { getFxAccountsSingleton } = ChromeUtils.importESModule("resource://gre/modules/FxAccounts.sys.mjs");
      Assert.equal(await getFxAccountsSingleton().getSignedInUser(), null,
        "A saved Firefox account stays inactive when Midori Sync starts");
      const weave = Cc["@mozilla.org/weave/service;1"].getService(Ci.nsISupports).wrappedJSObject;
      Assert.ok(!weave.ready && !weave.timer, "Firefox Sync does not initialize from the saved account");
      MidoriSyncService.init();
      let ready = false;
      for (let attempt = 0; attempt < 20; attempt++) {
        const snapshot = MidoriSyncService.backgroundSnapshot;
        ready = snapshot.account === "connected" && snapshot.keys === "ready" && snapshot.scheduler?.available;
        if (ready) {
          break;
        }
        if (attempt % 5 === 4) {
          info(`Restored startup attempt ${attempt + 1}: ${JSON.stringify({
            background: snapshot, account: MidoriSyncService.account.snapshot,
          })}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      Assert.ok(ready, "A restored profile resumes native Sync");
      Assert.ok(MidoriSyncService.backgroundSnapshot.notifications,
        "The core Sync notification channel remains active");
      const bookmark = await PlacesUtils.bookmarks.insert({
        parentGuid: PlacesUtils.bookmarks.unfiledGuid,
        url: "https://example.invalid/restored-background-bookmark",
        title: "Restored background bookmark",
      });
      const visitURL = "https://example.invalid/restored-background-history";
      const visitDate = new Date();
      await PlacesUtils.history.insert({ url: visitURL, title: "Restored background visit",
        visits: [{ date: visitDate, transition: 1 }] });
      const dayStartUsec = Math.floor(visitDate.getTime() * 1000 / 86400000000) * 86400000000;
      const passwordId = `{${uuid()}}`;
      const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
      login.init("https://restored.example.invalid", "https://restored.example.invalid", null,
        "restored-background", "synthetic restored password", "username", "password");
      login.QueryInterface(Ci.nsILoginMetaInfo);
      login.guid = passwordId;
      await Services.logins.addLoginAsync(login);
      await formAutofillStorage.initialize();
      const cardId = await formAutofillStorage.creditCards.add({
        "cc-name": "Restored background card", "cc-number": "5555555555554444",
        "cc-exp-month": 12, "cc-exp-year": 2032,
      });
      const collections = await Promise.all(["bookmarks", "history", "passwords", "credit-cards"].map(name =>
        MidoriSyncService.collection(name)));
      const ids = [bookmark.guid, historyRecordId(visitURL, dayStartUsec), passwordId, cardId];
      let uploaded = false;
      for (let attempt = 0; attempt < 35; attempt++) {
        const records = [];
        for (let index = 0; index < collections.length; index++) {
          records.push(await collections[index].record(ids[index]));
        }
        uploaded = records.every(record => Boolean(record?.remote?.revision));
        if (uploaded) {
          break;
        }
        if (attempt % 5 === 4) {
          info(`Restored background attempt ${attempt + 1}: ${JSON.stringify({
            background: MidoriSyncService.backgroundSnapshot,
            collections: collections.map((engine, index) => ({
              name: ["bookmarks", "history", "passwords", "credit-cards"][index],
              snapshot: engine.snapshot, uploaded: Boolean(records[index]?.remote?.revision),
            })),
          })}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      Assert.ok(uploaded, "The restored profile uploads a bookmark, visit, password and card without a popup or manual Sync");
      let completed = false;
      for (let attempt = 0; attempt < 150; attempt++) {
        const overview = MidoriSyncService.syncCollectionsSnapshot;
        completed = ["bookmarks", "history", "passwords", "credit-cards"].every(name =>
          overview.find(item => item.name === name)?.lastSuccessAt);
        if (completed) {
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      Assert.ok(completed, "The native popup status records a successful automatic pass for all four collections");
      await IOUtils.writeJSON(statusPath, Object.fromEntries(MidoriSyncService.syncCollectionsSnapshot
        .filter(item => statusCollections.includes(item.name)).map(item => [item.name, item.lastSuccessAt])));
      Assert.deepEqual(await IOUtils.readJSON(legacyAccountPath), legacyAccount,
        "Native Sync preserves the saved Firefox account without using it");
      Assert.deepEqual(legacyRequests, [], "Native background Sync makes no Firefox account or Sync requests");
    } finally {
      Services.obs.removeObserver(watchLegacyRequests, "http-on-modify-request");
      MidoriSyncService.uninit();
      Services.prefs.clearUserPref("identity.fxaccounts.enabled");
      Services.prefs.clearUserPref("midori.sync.enabled");
      Services.prefs.clearUserPref("midori.sync.background.enabled");
    }
    return;
  }
  const profileId = stage === "C" ? state.profileId : stage === "D" ? state.profileBId : uuid();
  const journalStoreId = stage === "C" ? state.journalStoreId : stage === "D" ? state.journalStoreBId : uuid();
  const keyStore = Cc["@mozilla.org/security/oskeystore;1"].getService(Ci.nsIOSKeyStore);
  const tokenFactory = () => Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(Ci.nsIPKCS11Token);
  const connection = new MidoriSyncConnection({
    baseURL: fixture.baseURL, allowLocalHTTP: true, saveServer: () => {},
    transportFactory: (url, options) => new MidoriSyncTransport(url, options),
  });
  const store = createSyncVaultFileStore(PathUtils.join(PathUtils.profileDir, "native-profile-vault"));
  const vault = new MidoriSyncVault({
    store, keyStore, profileId, createId: uuid,
    authorize: () => authorizeSyncSecretStore(keyStore, tokenFactory),
  });
  const account = new MidoriSyncAccount({
    connection, vaultFactory: () => vault,
    transportFactory: (url, options) => new MidoriSyncTransport(url, options),
  });
  const keys = createNativeSyncKeys(account);
  const engines = [];
  const trackers = [];
  let journal;
  let primaryToken;
  let backgroundRecordIds;
  try {
    if (!keyStore.isOSBacked) {
      primaryToken = tokenFactory();
      await primaryToken.changePassword("", "public profile test password");
    }
    if (["C", "D"].includes(stage)) {
      await account.unlock();
    } else {
      await account.pair(fixture.profiles[stage].pairing_token, `Native profile ${stage}`);
    }
    await keys.refresh();
    if (stage === "A") {
      Assert.equal(keys.snapshot.status, "empty");
      Assert.ok(await keys.bootstrap(), "A new profile activates E2EE without a popup step");
      Assert.ok(!keys.snapshot.backupPending, "Server recovery requires no backup step");
      const vaultText = await IOUtils.readUTF8(PathUtils.join(PathUtils.profileDir, "native-profile-vault", "account.json"));
      Assert.ok(!vaultText.includes('"recovery_secret"'), "The vault envelope stays encrypted");
    } else if (stage === "B") {
      Assert.equal(keys.snapshot.status, "ready", "Another profile restores keys after account connection");
    }
    Assert.equal(keys.snapshot.status, "ready");
    journal = await openSyncStore({
      directory: PathUtils.join(PathUtils.profileDir, "native-profile-journal"),
      storeId: journalStoreId, deviceId: account.snapshot.device.id, keys, create: !["C", "D"].includes(stage),
    });
    const createEngine = (collection, adapter) => {
      const engine = new MidoriSyncCollection({
        collection, adapter, journal, keys, createId: uuid, entryId: syncJournalEntryId,
        request: (path, options) => account.withSecrets(lease => lease.request(path, options), { signal: options.signal }),
      });
      engines.push(engine);
      return engine;
    };
    const historyAdapter = new MidoriSyncHistory();
    const passwordAdapter = new MidoriSyncPasswords();
    const cardAdapter = new MidoriSyncCreditCards();
    const tabAdapter = new MidoriSyncTabs({ deviceId: account.snapshot.device.id, deviceName: `Native profile ${stage}`,
      windows: () => [{ private: false, gBrowser: { tabs: [{ label: "Open web page",
        linkedBrowser: { currentURI: { spec: "https://example.invalid/native-open-tab" } } }] } },
      { private: true, gBrowser: { tabs: [{ label: "Private web page",
        linkedBrowser: { currentURI: { spec: "https://private.example.invalid/" } } }] } }],
      isPrivate: win => win.private });
    const history = createEngine("history", historyAdapter);
    const passwords = createEngine("passwords", passwordAdapter);
    const cards = createEngine("credit-cards", cardAdapter);
    const tabs = createEngine("tabs", tabAdapter);
    const preferences = createEngine("browser-settings", new MidoriSyncPreferences());
    const bookmarks = stage === "B" ? createEngine("bookmarks", new MidoriSyncBookmarks()) : null;
    if (stage === "C") {
      Assert.equal(account.snapshot.device.id, state.deviceId, "The restored profile retains its device identity");
      Assert.equal((await historyAdapter.readDay(state.url, state.dayStartUsec)).visits.length, 1,
        "The restored Places database still has its original visit");
      Assert.ok((await passwordAdapter.read(state.passwordId)).password === "synthetic test password",
        "The restored Login Manager still has its original credential");
      const localUsec = state.visitTimeUsec + 2000 < state.dayStartUsec + 86400000000 ?
        state.visitTimeUsec + 2000 : state.visitTimeUsec - 2000;
      await PlacesUtils.history.insert({ url: state.url, title: state.title,
        visits: [{ date: new Date(localUsec / 1000), transition: 3 }] });
      const original = (await Services.logins.searchLoginsAsync({ guid: state.conflictPasswordId }))[0];
      const changed = original.clone();
      changed.password = "synthetic local divergent password";
      await Services.logins.modifyLoginAsync(original, changed);
    }
    await history.run();
    await passwords.run();
    await cards.run();
    await tabs.run();
    await preferences.run();
    await bookmarks?.run();
    Assert.ok(history.snapshot.initialized && passwords.snapshot.initialized && cards.snapshot.initialized && tabs.snapshot.initialized &&
      preferences.snapshot.initialized);
    if (stage === "A") {
      const url = "https://example.invalid/native-two-profile-history";
      const title = "Visit from separate profile A";
      const date = new Date();
      await PlacesUtils.history.insert({ url, title, visits: [{ date, transition: 1 }] });
      const visitTimeUsec = date.getTime() * 1000;
      const dayStartUsec = Math.floor(date.getTime() * 1000 / 86400000000) * 86400000000;
      const historyId = historyRecordId(url, dayStartUsec);
      const paginatedHistoryURLs = Array.from({ length: 110 }, (_, index) =>
        `https://example.invalid/native-history-page-${index}`);
      for (const pageURL of paginatedHistoryURLs) {
        await PlacesUtils.history.insert({ url: pageURL, title: "Paginated history visit",
          visits: [{ date, transition: 1 }] });
      }
      const passwordId = `{${uuid()}}`;
      const conflictPasswordId = `{${uuid()}}`;
      const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
      login.init("https://example.invalid", "https://example.invalid", null,
        "native-two-profile", "synthetic test password", "username", "password");
      login.QueryInterface(Ci.nsILoginMetaInfo);
      login.guid = passwordId;
      await Services.logins.addLoginAsync(login);
      const conflictLogin = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
      conflictLogin.init("https://conflict.example.invalid", "https://conflict.example.invalid", null,
        "native-conflict", "synthetic base password", "username", "password");
      conflictLogin.QueryInterface(Ci.nsILoginMetaInfo);
      conflictLogin.guid = conflictPasswordId;
      await Services.logins.addLoginAsync(conflictLogin);
      await formAutofillStorage.initialize();
      const cardId = await formAutofillStorage.creditCards.add({
        "cc-name": "Native profile A", "cc-number": "4111111111111111",
        "cc-exp-month": 12, "cc-exp-year": 2032,
      });
      const historyTracker = new MidoriSyncHistoryTracker({ engine: history, adapter: historyAdapter });
      const passwordTracker = new MidoriSyncPasswordTracker({ engine: passwords, adapter: passwordAdapter });
      const cardTracker = new MidoriSyncRecordTracker({ engine: cards, adapter: cardAdapter });
      trackers.push(historyTracker, passwordTracker, cardTracker);
      let historyCapture;
      for (let attempt = 0; attempt < 10; attempt++) {
        historyCapture = await historyTracker.run({ limit: 100 });
        await history.run();
        if (!historyCapture.more) {
          break;
        }
      }
      Assert.ok(!historyCapture.more, "The initial history inventory uploads more than one page");
      await passwordTracker.run({ limit: 100 });
      await cardTracker.run({ limit: 100 });
      await passwords.run();
      await cards.run();
      await tabs.capture(account.snapshot.device.id);
      await tabs.run();
      Services.prefs.setIntPref("midori.verticaltabs.width", 320);
      Services.prefs.setBoolPref("midori.workspaces.enabled", false);
      Assert.equal((await preferences.capture("midori.verticaltabs.width")).status, "queued");
      Assert.equal((await preferences.capture("midori.workspaces.enabled")).status, "queued");
      await preferences.run();
      Assert.equal((await preferences.record("midori.verticaltabs.width")).remote.value.value, 320);
      Assert.ok((await tabs.record(account.snapshot.device.id)).remote.ttl,
        "The device snapshot has a server expiry");
      Assert.notEqual((await history.record(historyId)).remote.revision, "0");
      Assert.notEqual((await passwords.record(passwordId)).remote.revision, "0");
      Assert.notEqual((await passwords.record(conflictPasswordId)).remote.revision, "0");
      Assert.equal((await cards.record(cardId)).remote.value.number, "4111111111111111");
      try {
        Services.prefs.setStringPref("midori.sync.serverConfig",
          JSON.stringify({ baseURL: fixture.baseURL, allowLocalHTTP: true }));
        MidoriSyncService.init();
        await MidoriSyncService.account.pair(fixture.profiles.BG.pairing_token, "Background profile A");
        const backgroundDeviceId = MidoriSyncService.account.snapshot.device.id;
        const backgroundKeys = MidoriSyncService.keys;
        await backgroundKeys.refresh();
        Assert.equal(backgroundKeys.snapshot.status, "ready");
        await MidoriSyncService.collection("tabs", new MidoriSyncTabs({
          deviceId: backgroundDeviceId, deviceName: "Background profile A",
          windows: () => [{ private: false, gBrowser: { tabs: [{ label: "Automatic background tab",
            linkedBrowser: { currentURI: { spec: "https://example.invalid/native-background-tab" } } }] } },
          { private: true, gBrowser: { tabs: [{ label: "Private background tab",
            linkedBrowser: { currentURI: { spec: "https://private.example.invalid/background" } } }] } }],
          isPrivate: win => win.private,
        }));
        Services.prefs.setBoolPref("midori.sync.enabled", true);
        Services.prefs.setBoolPref("midori.sync.background.enabled", true);
        const backgroundBookmark = await PlacesUtils.bookmarks.insert({
          parentGuid: PlacesUtils.bookmarks.unfiledGuid,
          url: "https://example.invalid/native-background-bookmark",
          title: "Background bookmark",
        });
        const backgroundHistoryURL = "https://example.invalid/native-background-history";
        const backgroundVisit = new Date();
        await PlacesUtils.history.insert({ url: backgroundHistoryURL, title: "Background visit",
          visits: [{ date: backgroundVisit, transition: 1 }] });
        const backgroundHistoryDay = Math.floor(backgroundVisit.getTime() * 1000 / 86400000000) * 86400000000;
        const backgroundHistoryId = historyRecordId(backgroundHistoryURL, backgroundHistoryDay);
        const backgroundPasswordId = `{${uuid()}}`;
        const backgroundLogin = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
        backgroundLogin.init("https://background.example.invalid", "https://background.example.invalid", null,
          "native-background", "synthetic background password", "username", "password");
        backgroundLogin.QueryInterface(Ci.nsILoginMetaInfo);
        backgroundLogin.guid = backgroundPasswordId;
        await Services.logins.addLoginAsync(backgroundLogin);
        backgroundRecordIds = {
          backgroundBookmarkId: backgroundBookmark.guid,
          backgroundHistoryId,
          backgroundHistoryURL,
          backgroundHistoryDay,
          backgroundPasswordId,
          backgroundDeviceId,
        };
        Services.prefs.setStringPref("midori.verticaltabs.position", "right");
        info(`Background start: ${JSON.stringify(MidoriSyncService.backgroundSnapshot)}`);
        let remotePosition = null;
        let uploaded = false;
        let uploadedTabs = false;
        for (let attempt = 0; attempt < 35; attempt++) {
          await preferences.run();
          remotePosition = (await preferences.record("midori.verticaltabs.position"))?.remote?.value?.value;
          const backgroundBookmarks = await MidoriSyncService.collection("bookmarks");
          const backgroundHistory = await MidoriSyncService.collection("history");
          const backgroundPasswords = await MidoriSyncService.collection("passwords");
          const backgroundCards = await MidoriSyncService.collection("credit-cards");
          uploaded = [
            await backgroundBookmarks.record(backgroundBookmark.guid),
            await backgroundHistory.record(backgroundHistoryId),
            await backgroundPasswords.record(backgroundPasswordId),
            await backgroundCards.record(cardId),
          ].every(record => record?.remote?.revision && record.remote.revision !== "0");
          const backgroundTabs = await MidoriSyncService.collection("tabs");
          uploadedTabs = (await backgroundTabs.record(backgroundDeviceId))?.remote?.value?.tabs?.some(tab =>
            tab.url === "https://example.invalid/native-background-tab") ?? false;
          if (remotePosition === "right" && uploaded && uploadedTabs) {
            break;
          }
          if (attempt % 5 === 4) {
            info(`Background attempt ${attempt + 1}: ${JSON.stringify(MidoriSyncService.backgroundSnapshot)}`);
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        Assert.equal(remotePosition, "right", "The background timer uploaded a preference without a manual Sync action");
        Assert.ok(uploaded, "The background timer uploaded a bookmark, visit, password and card without a manual Sync action");
        Assert.ok(uploadedTabs, "The background timer uploaded the regular tab without a manual Sync action");
        const nextBackgroundVisit = backgroundVisit.getTime() + 1000 < (backgroundHistoryDay + 86400000000) / 1000 ?
          backgroundVisit.getTime() + 1000 : backgroundVisit.getTime() - 1000;
        await PlacesUtils.history.insert({ url: backgroundHistoryURL, title: "Background visit",
          visits: [{ date: new Date(nextBackgroundVisit), transition: 2 }] });
        const originalBackgroundLogin = (await Services.logins.searchLoginsAsync({ guid: backgroundPasswordId }))[0];
        const updatedBackgroundLogin = originalBackgroundLogin.clone();
        updatedBackgroundLogin.password = "synthetic updated background password";
        await Services.logins.modifyLoginAsync(originalBackgroundLogin, updatedBackgroundLogin);
        const liveHistory = await MidoriSyncService.collection("history");
        const livePasswords = await MidoriSyncService.collection("passwords");
        let updatedInBackground = false;
        for (let attempt = 0; attempt < 25; attempt++) {
          const historyValue = (await liveHistory.record(backgroundHistoryId))?.remote?.value;
          const passwordValue = (await livePasswords.record(backgroundPasswordId))?.remote?.value;
          updatedInBackground = historyValue?.visits?.length === 2 &&
            passwordValue?.password === "synthetic updated background password";
          if (updatedInBackground) {
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        Assert.ok(updatedInBackground,
          "Later Places and Login Manager changes upload without waiting for the periodic poll");
      } finally {
        MidoriSyncService.uninit();
        Services.prefs.clearUserPref("midori.sync.background.enabled");
        Services.prefs.clearUserPref("midori.sync.enabled");
      }
      await IOUtils.writeJSON(statePath, { profilePath: PathUtils.profileDir, profileId, journalStoreId,
        deviceId: account.snapshot.device.id, url, title, dayStartUsec, visitTimeUsec, paginatedHistoryURLs,
        historyId, passwordId, conflictPasswordId, cardId,
        ...backgroundRecordIds });
    } else if (stage === "B") {
      Assert.notEqual(PathUtils.profileDir, state.profilePath, "The target has a distinct Gecko profile");
      Assert.equal(state.historyId, historyRecordId(state.url, state.dayStartUsec));
      const page = await historyAdapter.readDay(state.url, state.dayStartUsec);
      Assert.equal(page.url, state.url);
      Assert.equal(page.title, state.title);
      Assert.equal(page.visits.length, 1, "A visit from profile A reached profile B's Places database");
      const login = await passwordAdapter.read(state.passwordId);
      Assert.equal(login.username, "native-two-profile");
      Assert.ok(login.password === "synthetic test password", "The native Login Manager received the encrypted credential");
      Assert.equal((await cardAdapter.read(state.cardId)).name, "Native profile A",
        "The payment card reached Form Autofill in the second profile");
      Assert.equal(history.snapshot.pending, 0);
      Assert.equal(passwords.snapshot.pending, 0);
      Assert.equal((await PlacesUtils.bookmarks.fetch(state.backgroundBookmarkId)).title, "Background bookmark",
        "The automatically uploaded bookmark reached a second Gecko profile");
      Assert.equal((await historyAdapter.readDay(state.backgroundHistoryURL, state.backgroundHistoryDay)).visits.length, 2,
        "Both automatically uploaded visits reached a second Gecko profile");
      Assert.equal((await passwordAdapter.read(state.backgroundPasswordId)).password, "synthetic updated background password",
        "The later password edit reached the native Login Manager in a second profile");
      const remoteTabs = (await tabs.record(state.deviceId)).remote;
      Assert.deepEqual(remoteTabs.value.tabs,
        [{ url: "https://example.invalid/native-open-tab", title: "Open web page" }],
        "Only the regular browser tab reached the second device");
      Assert.ok(remoteTabs.ttl, "The encrypted tab snapshot expires on the server");
      const backgroundTabs = (await tabs.record(state.backgroundDeviceId)).remote;
      Assert.deepEqual(backgroundTabs.value.tabs,
        [{ url: "https://example.invalid/native-background-tab", title: "Automatic background tab" }],
        "The automatically uploaded tab reached the second profile without the private tab");
      Assert.equal(Services.prefs.getIntPref("midori.verticaltabs.width"), 320,
        "A portable browser setting reached the second profile");
      Assert.equal(Services.prefs.getBoolPref("midori.workspaces.enabled"), false);
      Assert.equal(Services.prefs.getStringPref("midori.verticaltabs.position"), "right",
        "The background-uploaded preference reached a second Gecko profile");
      Assert.equal((await preferences.record("midori.verticaltabs.width")).remote.value.value, 320);
      Services.prefs.setIntPref("midori.verticaltabs.width", 400);
      Assert.equal((await preferences.capture("midori.verticaltabs.width")).status, "queued");
      await preferences.run();
      const listedTabs = await MidoriSyncService.remoteTabs.call({ account, journal: Promise.resolve(journal) });
      Assert.equal(listedTabs.length, 2, "The background Sync device publishes its tab snapshot");
      Assert.deepEqual(listedTabs.find(snapshot => snapshot.device_id === state.deviceId)?.tabs, remoteTabs.value.tabs,
        "The popup reads the authenticated remote snapshot from the local encrypted journal");
      Assert.deepEqual(listedTabs.find(snapshot => snapshot.device_id === state.backgroundDeviceId)?.tabs,
        backgroundTabs.value.tabs, "The popup reads the automatically uploaded tabs from the journal");
      const historyTracker = new MidoriSyncHistoryTracker({ engine: history, adapter: historyAdapter });
      const passwordTracker = new MidoriSyncPasswordTracker({ engine: passwords, adapter: passwordAdapter });
      const cardTracker = new MidoriSyncRecordTracker({ engine: cards, adapter: cardAdapter });
      trackers.push(historyTracker, passwordTracker, cardTracker);
      await setHistoryTitle(state.url, updatedTitle);
      await historyTracker.run({ limit: 100 });
      await history.run();
      Assert.equal((await history.record(state.historyId)).remote.revision, "2",
        "A title-only change reaches the server without adding a visit");
      Assert.equal((await historyAdapter.readDay(state.url, state.dayStartUsec)).visits.length, 1);
      const nextUsec = state.visitTimeUsec + 1000 < state.dayStartUsec + 86400000000 ?
        state.visitTimeUsec + 1000 : state.visitTimeUsec - 1000;
      await PlacesUtils.history.insert({ url: state.url, title: updatedTitle,
        visits: [{ date: new Date(nextUsec / 1000), transition: 2 }] });
      const original = (await Services.logins.searchLoginsAsync({ guid: state.passwordId }))[0];
      const changed = original.clone();
      changed.password = "synthetic updated password";
      await Services.logins.modifyLoginAsync(original, changed);
      const conflictOriginal = (await Services.logins.searchLoginsAsync({ guid: state.conflictPasswordId }))[0];
      const conflictChanged = conflictOriginal.clone();
      conflictChanged.password = "synthetic remote divergent password";
      await Services.logins.modifyLoginAsync(conflictOriginal, conflictChanged);
      await formAutofillStorage.initialize();
      await formAutofillStorage.creditCards.update(state.cardId, {
        "cc-name": "Edited in profile B", "cc-number": "4111111111111111",
        "cc-exp-month": 12, "cc-exp-year": 2032,
      });
      await historyTracker.run({ limit: 100 });
      await passwordTracker.run({ limit: 100 });
      await cardTracker.run({ limit: 100 });
      await history.run();
      await passwords.run();
      await cards.run();
      Assert.equal((await history.record(state.historyId)).remote.revision, "3");
      Assert.equal((await passwords.record(state.passwordId)).remote.revision, "2");
      Assert.equal((await passwords.record(state.conflictPasswordId)).remote.revision, "2");
      Assert.equal((await cards.record(state.cardId)).remote.revision, "2");
      await IOUtils.writeJSON(statePath, { ...state, profileBId: profileId, journalStoreBId: journalStoreId,
        deviceBId: account.snapshot.device.id });
    } else if (stage === "C") {
      Assert.equal(Services.prefs.getIntPref("midori.verticaltabs.width"), 400,
        "The restored first profile receives the second profile's setting edit");
      Assert.equal(Services.prefs.getBoolPref("midori.workspaces.enabled"), false);
      Assert.equal(Services.prefs.getStringPref("midori.verticaltabs.position"), "right");
      Assert.equal(preferences.snapshot.conflicts, 0);
      Assert.notEqual(PathUtils.profileDir, state.profilePath);
      const merged = await historyAdapter.readDay(state.url, state.dayStartUsec);
      Assert.equal(merged.visits.length, 3,
        "Concurrent visits from A and B merge without losing the original visit");
      Assert.equal(merged.title, updatedTitle, "A receives B's title-only change without an extra visit");
      Assert.equal(history.snapshot.conflicts, 0, "The title-only revision and visit merge do not conflict");
      Assert.ok((await passwordAdapter.read(state.passwordId)).password === "synthetic updated password",
        "The original profile receives B's password edit");
      Assert.equal((await cardAdapter.read(state.cardId)).name, "Edited in profile B",
        "The original profile receives the edited payment card");
      Assert.ok((await passwordAdapter.read(state.conflictPasswordId)).password === "synthetic local divergent password",
        "A divergent local password is never overwritten");
      const passwordConflicts = await journal.list("passwords", "conflict");
      Assert.ok(passwords.snapshot.conflicts >= 1, "The concurrent password edit remains a visible conflict");
      Assert.ok(passwordConflicts.some(({ value }) => value.change?.record?.id === state.conflictPasswordId),
        "The divergent password remains in the encrypted local journal");
      const disk = new TextDecoder().decode(await IOUtils.read(PathUtils.join(PathUtils.profileDir,
        "native-profile-journal", `${journalStoreId}.sqlite`)));
      Assert.ok(!disk.includes("synthetic local divergent password") &&
        !disk.includes("synthetic remote divergent password") &&
        !disk.includes("4111111111111111"), "Passwords and card numbers stay out of the plaintext journal");
      Assert.equal(history.snapshot.pending, 0);
      Assert.equal(passwords.snapshot.pending, 0);
      const cleared = await history.clearHistory();
      Assert.ok(cleared.clearBeforeMs >= state.visitTimeUsec / 1000,
        "The server returned a cutoff after the synchronized visits");
      Assert.equal(await historyAdapter.readDay(state.url, state.dayStartUsec), null);
      const remaining = await PlacesUtils.withConnectionWrapper("Midori history clear integration", db => db.executeCached(
        `SELECT COUNT(*) AS count FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id
         WHERE p.url = :url`, { url: state.url }));
      Assert.equal(remaining[0].getResultByName("count"), 0,
        "The confirmed clear physically removes the old visits from Places");
      Assert.ok((await passwordAdapter.read(state.passwordId)).password === "synthetic updated password",
        "Clearing history leaves synchronized passwords intact");
      await formAutofillStorage.initialize();
      await formAutofillStorage.creditCards.remove(state.cardId);
      const cardTracker = new MidoriSyncRecordTracker({ engine: cards, adapter: cardAdapter });
      trackers.push(cardTracker);
      await cardTracker.run({ limit: 100 });
      await cards.run();
      Assert.ok((await cards.record(state.cardId)).remote.deleted,
        "Deleting a card creates a synchronized tombstone");
      await history.run();
      Assert.equal(history.snapshot.pending, 0, "The cleared history is not re-uploaded");
    } else {
      Assert.equal(Services.prefs.getIntPref("midori.verticaltabs.width"), 400,
        "The restored second profile keeps its setting after reconnecting");
      Assert.equal(Services.prefs.getStringPref("midori.verticaltabs.position"), "right");
      Assert.equal(account.snapshot.device.id, state.deviceBId, "The disconnected profile retains its device identity");
      Assert.equal(await historyAdapter.readDay(state.url, state.dayStartUsec), null,
        "The returning profile removes visits before the server cutoff");
      const remaining = await PlacesUtils.withConnectionWrapper("Midori history returning profile", db => db.executeCached(
        `SELECT COUNT(*) AS count FROM moz_historyvisits v JOIN moz_places p ON p.id = v.place_id
         WHERE p.url = :url`, { url: state.url }));
      Assert.equal(remaining[0].getResultByName("count"), 0,
        "The disconnected profile physically removes the deleted visits");
      Assert.equal((await journal.list("history", "record")).length, 0,
        "The old generation cannot requeue the removed history");
      Assert.ok((await passwordAdapter.read(state.passwordId)).password === "synthetic updated password",
        "Recovering the history generation preserves Login Manager");
      Assert.ok((await cards.record(state.cardId))?.remote?.deleted,
        "The returning profile downloaded the card tombstone");
      Assert.equal(cards.snapshot.conflicts, 0, "The remote card deletion has no unresolved conflict");
      Assert.equal(await cardAdapter.read(state.cardId), null,
        "The returning profile applies the payment card tombstone");
      await history.run();
      Assert.equal(history.snapshot.pending, 0);
    }
  } finally {
    if (["A", "B"].includes(stage)) {
      const prefsFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
      prefsFile.append("prefs.js");
      Services.prefs.savePrefFile(prefsFile);
    }
    for (const tracker of trackers) {
      tracker.close();
    }
    for (const engine of engines) {
      engine.close();
    }
    await journal?.close();
    keys.close();
    if (!["A", "B"].includes(stage)) {
      try {
        await account.disconnect();
      } finally {
        await vault.clear();
      }
    }
    account.close();
    connection.close();
    if (primaryToken) {
      await primaryToken.changePassword("public profile test password", "");
    }
  }
});
