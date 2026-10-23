/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function sync_settings_page_renders() {
  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:sync");
  try {
    const doc = tab.linkedBrowser.contentDocument;
    await TestUtils.waitForCondition(() => doc.getElementById("sync-card")?.children.length,
      "The Sync settings page renders its card");
    ok(doc.getElementById("midori-sync-server-mode"), "The signed-out page exposes the server settings");
    ok(doc.getElementById("midori-sync-connect-oidc"), "The signed-out page offers account sign-in");
  } finally {
    await BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function background_account_requests_do_not_flash_or_shift_the_settings_page() {
  const { MidoriSyncService: service } = ChromeUtils.importESModule("resource:///modules/MidoriSyncService.sys.mjs");
  const listeners = new Set();
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const account = { snapshot: { status: "connected", generation: 77, busy: false, interactionBusy: false,
    user: { name: "Sync fixture", email: "sync-ui@example.invalid" }, creditCardsSupported: true }, subscribe,
  async disconnect() { throw Object.assign(new Error("saved_journals_require_review"), { code: "saved_journals_require_review" }); } };
  const replacements = {
    account,
    keys: { snapshot: { status: "ready", busy: false, canRotate: false }, subscribe, cancelDraft() {} },
    connection: { snapshot: { checking: false, capabilities: { creditCards: true },
      server: { baseURL: "https://sync.astian.org/", official: true } }, subscribe },
    syncCollectionsSnapshot: ["bookmarks", "history", "passwords", "credit-cards", "form-history", "addresses", "tabs", "browser-settings"]
      .map(name => ({ name, enabled: true, status: "completed", pending: 0, conflicts: 0, lastSuccessAt: 12345 })),
    enrollmentRequests: [],
    subscribeSyncStatus: subscribe,
    async refreshEnrollmentRequests() {},
    async remoteTabs() { return []; },
  };
  const originals = new Map();
  for (const [name, value] of Object.entries(replacements)) {
    originals.set(name, Object.getOwnPropertyDescriptor(service, name));
    Object.defineProperty(service, name, { configurable: true, value });
  }
  let tab;
  const enabled = Services.prefs.prefHasUserValue("midori.sync.enabled") ? Services.prefs.getBoolPref("midori.sync.enabled") : null;
  try {
    tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:sync");
    const doc = tab.linkedBrowser.contentDocument;
    await TestUtils.waitForCondition(() => doc.querySelector(".identity")?.textContent === account.snapshot.user.email);
    await doc.l10n.translateFragment(doc.getElementById("sync-card"));
    const frame = () => new Promise(resolve => doc.defaultView.requestAnimationFrame(() => doc.defaultView.requestAnimationFrame(resolve)));
    await frame();
    const message = doc.querySelector("#sync-card > .message");
    const data = doc.getElementById("midori-sync-data");
    const sync = doc.querySelector('[data-l10n-id="midori-sync-data-now"]');
    const identityNode = doc.querySelector(".identity").firstChild;
    const top = data.getBoundingClientRect().top;
    for (let index = 0; index < 6; ++index) {
      account.snapshot.busy = !account.snapshot.busy;
      for (const listener of listeners) {
        listener(account.snapshot);
      }
      await frame();
      ok(message.hidden, "Background requests do not show the foreground Working message");
      is(data.getBoundingClientRect().top, top, "Background requests do not move the page content");
      ok(!sync.disabled, "Background requests do not flash controls disabled");
      is(doc.querySelector(".identity").firstChild, identityNode, "Unchanged identity text keeps its DOM node");
    }
    doc.querySelector('[data-l10n-id="midori-sync-account-disconnect"]').click();
    await TestUtils.waitForCondition(() => message.getAttribute("data-l10n-id") === "midori-sync-account-saved-copies");
    for (let index = 0; index < 4; ++index) {
      account.snapshot.busy = !account.snapshot.busy;
      account.snapshot.error = null;
      for (const listener of listeners) { listener(account.snapshot); }
      await frame();
      is(message.getAttribute("data-l10n-id"), "midori-sync-account-saved-copies");
      ok(!message.hidden, "The rejected disconnect remains understandable after background requests");
    }
    account.snapshot.generation = 78;
    for (const listener of listeners) { listener(account.snapshot); }
    await frame();
    ok(message.hidden, "Account changes retire the old action error");
    doc.querySelector('input[name="sync-mode"][value="none"]').click();
    await frame();
    ok(doc.querySelector('[data-l10n-id="midori-sync-data-user-paused"]'), "The page explains the user's pause separately from a locked account");
    ok(sync.disabled, "Synchronize now respects a global pause");
    is(account.snapshot.status, "connected");
    is(doc.querySelector(".identity").textContent, account.snapshot.user.email, "Pausing keeps the connected identity");
    ok(doc.querySelector('[data-l10n-id="midori-sync-mode-help"]'));
    doc.querySelector('input[name="sync-mode"][value="everything"]').click();
    await frame();
    ok(!sync.disabled);
    ok(!doc.querySelector('[data-l10n-id="midori-sync-data-user-paused"]'));
  } finally {
    if (tab) {
      await BrowserTestUtils.removeTab(tab);
    }
    for (const [name, descriptor] of originals) {
      Object.defineProperty(service, name, descriptor);
    }
    if (enabled === null) { Services.prefs.clearUserPref("midori.sync.enabled"); }
    else { service.setSyncEnabled(enabled); }
  }
});
