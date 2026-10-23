/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function test_native_popup_server_configuration() {
  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
  const { MidoriSyncPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncPanel.sys.mjs");
  const { PanelMultiView } = ChromeUtils.importESModule("moz-src:///browser/components/customizableui/PanelMultiView.sys.mjs");
  const { CustomizableUI } = ChromeUtils.importESModule("moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs");
  const { MidoriSyncService } = ChromeUtils.importESModule("resource:///modules/MidoriSyncService.sys.mjs");
  const { MidoriBrowserServices } = ChromeUtils.importESModule("resource:///modules/MidoriBrowserServices.sys.mjs");
  ok(MidoriBrowserServices.getServiceSnapshot().some(service => service.name === "MidoriSyncService" && service.started),
    "Native Sync starts with the browser before the popup opens");
  MidoriSyncPanel.init();
  registerCleanupFunction(() => MidoriSyncPanel.uninit());
  await TestUtils.waitForCondition(() => document.getElementById("midori-sync-button"));
  const widget = document.getElementById("midori-sync-button");
  const tabCount = gBrowser.tabs.length;
  const originalURL = MidoriSyncService.connection.snapshot.server.baseURL;
  const open = MidoriSyncPanel.open;
  let openError = null;
  let commandSeen = false;
  MidoriSyncPanel.open = async function (...args) {
    commandSeen = true;
    try {
      return await open.apply(this, args);
    } catch (error) {
      openError = error;
      throw error;
    }
  };
  registerCleanupFunction(() => { MidoriSyncPanel.open = open; });
  ok(!document.getElementById("midori-sync-panel"), "The popup is constructed on demand");
  await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
  EventUtils.synthesizeMouseAtCenter(widget, {}, window);
  await TestUtils.waitForCondition(() => commandSeen, "The native toolbar command reaches Sync");
  await TestUtils.waitForCondition(() => openError || document.getElementById("midori-sync-panel")?.state === "open");
  if (openError) {
    throw openError;
  }
  const panel = document.getElementById("midori-sync-panel");
  ok(!Services.prefs.getBoolPref("identity.fxaccounts.enabled"), "Firefox Accounts are disabled in Midori");
  ok(Services.prefs.prefIsLocked("identity.fxaccounts.enabled"), "A profile cannot re-enable Firefox Sync");
  is(Services.prefs.getStringPref("services.sync.username"), "existing@example.invalid", "The profile has legacy Firefox Sync state");
  const weave = Cc["@mozilla.org/weave/service;1"].getService(Ci.nsISupports).wrappedJSObject;
  ok(!weave.enabled, "An existing Firefox Sync account cannot start its scheduler");
  is(gBrowser.tabs.length, tabCount, "Opening Sync keeps the current page");
  await TestUtils.waitForCondition(() => !MidoriSyncService.account.snapshot.busy &&
    MidoriSyncService.account.snapshot.status !== "unknown", "Local account inspection finishes without unlocking the keyring");
  const status = panel.querySelector(".midori-sync-message");
  ok(!document.getElementById("midori-sync-pair-form"), "The popup never shows a pairing code form");
  is(status.getAttribute("data-l10n-id"),
    MidoriSyncService.connection.snapshot.capabilities ?
      "midori-sync-account-connect-unavailable" : "midori-sync-account-server-unavailable",
    "The popup distinguishes missing OIDC configuration from a disconnected server");
  ok(!document.getElementById("midori-sync-history-clear"), "The popup has no history actions");
  ok(!document.getElementById("midori-sync-server-mode"), "The popup has no server settings");
  ok(!document.getElementById("midori-sync-provider"), "No Firefox Sync provider choice is exposed");
  const settingsLink = document.getElementById("midori-sync-open-settings-link");
  ok(BrowserTestUtils.isVisible(settingsLink), "A signed-out popup links to the Sync settings");
  const settingsTab = BrowserTestUtils.waitForNewTab(gBrowser, "about:sync", true);
  EventUtils.synthesizeMouseAtCenter(settingsLink, {}, window);
  const tab = await settingsTab;
  try {
    await SpecialPowers.spawn(tab.linkedBrowser, [], async () => {});
  } catch {}
  const page = tab.linkedBrowser.contentDocument;
  await TestUtils.waitForCondition(() => page.getElementById("midori-sync-server-mode"), "The settings page renders");
  const mode = page.getElementById("midori-sync-server-mode");
  const url = page.getElementById("midori-sync-server-url");
  page.getElementById("midori-sync-server-box").open = true;
  mode.value = "local";
  mode.dispatchEvent(new Event("change", { bubbles: true }));
  is(url.value, "http://localhost:8000/", "Local testing offers a ready address");
  ok(!url.disabled, "The local port can be changed");
  is(MidoriSyncService.connection.snapshot.server.baseURL, originalURL, "Editing does not change the server");
  BrowserTestUtils.removeTab(tab);
  if (panel.state !== "closed") {
    const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
    PanelMultiView.hidePopup(panel);
    await hidden;
  }
  is(MidoriSyncPanel._windows.get(window).unsubscribe, null, "Closing releases the state subscription");
  CustomizableUI.removeWidgetFromArea("midori-sync-button");
  MidoriSyncPanel.uninit();
  MidoriSyncPanel.init();
  is(CustomizableUI.getPlacementOfWidget("midori-sync-button"), null, "A user's removal of the toolbar button is respected");
  CustomizableUI.addWidgetToArea("midori-sync-button", CustomizableUI.AREA_NAVBAR);
});

add_task(async function signed_in_popup_distinguishes_account_from_sync_progress() {
  const { MidoriSyncPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncPanel.sys.mjs");
  const { MidoriSyncService: service } = ChromeUtils.importESModule("resource:///modules/MidoriSyncService.sys.mjs");
  const names = ["account", "keys", "backgroundSnapshot", "syncCollectionsSnapshot"];
  const descriptors = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(service, name)]));
  const account = { snapshot: { status: "connected", generation: 1, busy: false, interactionBusy: false,
    user: { name: "Synthetic account", email: "sync@example.invalid" } }, subscribe: () => () => {},
  async disconnect() { throw Object.assign(new Error("saved_journals_require_review"), { code: "saved_journals_require_review" }); } };
  const keys = { snapshot: { status: "ready" }, subscribe: () => () => {} };
  const background = { globalEnabled: true, enabled: true, offline: false };
  try {
    for (const [name, value] of [["account", account], ["keys", keys], ["backgroundSnapshot", background],
      ["syncCollectionsSnapshot", [{ name: "bookmarks", status: "completed" }]]]) {
      Object.defineProperty(service, name, { configurable: true, value });
    }
    await MidoriSyncPanel.open(window);
    const state = MidoriSyncPanel._windows.get(window);
    await TestUtils.waitForCondition(() => state.panel.state === "open", "The signed-in popup finishes opening");
    const identity = document.getElementById("midori-sync-account-identity");
    const summary = document.getElementById("midori-sync-row-state");
    await document.l10n.translateFragment(state.panel);
    ok(BrowserTestUtils.isVisible(identity), "The popup identifies the signed-in account");
    is(identity.textContent, "Signed in as sync@example.invalid", "The account address is visible");
    ok(BrowserTestUtils.isHidden(document.getElementById("midori-sync-connect-oidc")), "Sign in is hidden for a connected account");
    is(summary.dataset.summary, "synced", "A completed pass is reported accurately");
    const message = state.panel.querySelector(".midori-sync-message");
    document.getElementById("midori-sync-sign-out").click();
    await TestUtils.waitForCondition(() => message.getAttribute("data-l10n-id") === "midori-sync-account-saved-copies");
    for (let index = 0; index < 4; ++index) {
      account.snapshot.busy = !account.snapshot.busy;
      account.snapshot.error = null;
      state.refresh();
      is(message.getAttribute("data-l10n-id"), "midori-sync-account-saved-copies",
        "Background leases cannot erase the reason an explicit disconnect was rejected");
      ok(!message.hidden);
    }
    ok(BrowserTestUtils.isVisible(document.getElementById("midori-sync-open-settings-link")),
      "A blocked disconnect links directly to settings while the account stays signed in");
    background.offline = true;
    state.refresh();
    is(summary.dataset.summary, "offline", "Losing connectivity never reports synchronized");
    ok(BrowserTestUtils.isVisible(identity), "Offline mode keeps the account visible");
    keys.snapshot.status = "recovery-required";
    state.refresh();
    is(summary.dataset.summary, "recovery", "Missing keys requires an explicit recovery action");
    ok(BrowserTestUtils.isVisible(identity), "Missing encryption keys does not sign the account out");
    account.snapshot = { status: "signed-out", generation: 2, busy: false, user: null };
    state.refresh();
    isnot(message.getAttribute("data-l10n-id"), "midori-sync-account-saved-copies",
      "A failed action from the old account cannot populate a new account state");
    ok(BrowserTestUtils.isHidden(identity), "Signing out hides the identity");
    is(identity.textContent, "", "Signing out clears the displayed address");
    ok(!identity.hasAttribute("data-l10n-args"), "The address is removed from translation arguments");
  } finally {
    MidoriSyncPanel._windows.get(window)?.panel.hidePopup();
    for (const [name, descriptor] of descriptors) {
      Object.defineProperty(service, name, descriptor);
    }
  }
});

add_task(async function private_windows_do_not_expose_account_controls() {
  const { MidoriSyncPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncPanel.sys.mjs");
  const privateWindow = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  try {
    await MidoriSyncPanel.open(privateWindow);
    const panel = privateWindow.document.getElementById("midori-sync-panel");
    ok(BrowserTestUtils.isHidden(panel.querySelector(".midori-sync-rows")), "Account controls are hidden in private windows");
    ok(!privateWindow.document.getElementById("midori-sync-keys"), "Private windows never construct recovery controls");
    ok(BrowserTestUtils.isHidden(panel.querySelector(".midori-sync-actions")), "Private windows do not configure the profile account");
    ok(panel.querySelector('[data-l10n-id="midori-sync-private-window"]'), "The popup explains how to manage the account");
  } finally {
    await BrowserTestUtils.closeWindow(privateWindow);
  }
});
