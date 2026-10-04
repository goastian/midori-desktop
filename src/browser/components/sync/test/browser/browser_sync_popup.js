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
  const change = panel.querySelector('[data-l10n-id="midori-sync-server-change"]');
  await TestUtils.waitForCondition(() => !change.disabled, "Local account inspection finishes without unlocking the keyring");
  ok(BrowserTestUtils.isHidden(document.getElementById("midori-sync-pair-form")),
    "Production sign-in does not show a pairing code when OIDC is unavailable");
  is(document.getElementById("midori-sync-account-status").getAttribute("data-l10n-id"),
    MidoriSyncService.connection.snapshot.capabilities ?
      "midori-sync-account-connect-unavailable" : "midori-sync-account-server-unavailable",
    "The popup distinguishes missing OIDC configuration from a disconnected server");
  const clearHistory = document.getElementById("midori-sync-history-clear");
  ok(clearHistory, "The native popup contains the history clear action");
  ok(clearHistory.disabled, "History cannot be cleared before connecting and unlocking Sync");
  ok(!document.getElementById("midori-sync-provider"), "No Firefox Sync provider choice is exposed");
  EventUtils.synthesizeMouseAtCenter(change, {}, window);
  const form = panel.querySelector("form");
  const mode = document.getElementById("midori-sync-server-mode");
  const url = document.getElementById("midori-sync-server-url");
  ok(BrowserTestUtils.isVisible(form), "Settings are inside the native popup");
  mode.value = "local";
  mode.dispatchEvent(new Event("change", { bubbles: true }));
  is(url.value, "http://localhost:8000/", "Local testing offers a ready address");
  ok(!url.disabled, "The local port can be changed");
  EventUtils.synthesizeMouseAtCenter(panel.querySelector('[data-l10n-id="midori-sync-cancel"]'), {}, window);
  ok(BrowserTestUtils.isHidden(form), "Cancelling returns to the main view");
  is(MidoriSyncService.connection.snapshot.server.baseURL, originalURL, "Editing and cancelling do not change the server");
  const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  PanelMultiView.hidePopup(panel);
  await hidden;
  is(MidoriSyncPanel._windows.get(window).unsubscribe, null, "Closing releases the state subscription");
  CustomizableUI.removeWidgetFromArea("midori-sync-button");
  MidoriSyncPanel.uninit();
  MidoriSyncPanel.init();
  is(CustomizableUI.getPlacementOfWidget("midori-sync-button"), null, "A user's removal of the toolbar button is respected");
  CustomizableUI.addWidgetToArea("midori-sync-button", CustomizableUI.AREA_NAVBAR);
});

add_task(async function private_windows_do_not_expose_account_controls() {
  const { MidoriSyncPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncPanel.sys.mjs");
  const privateWindow = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  try {
    await MidoriSyncPanel.open(privateWindow);
    const panel = privateWindow.document.getElementById("midori-sync-panel");
    ok(BrowserTestUtils.isHidden(panel.querySelector(".midori-sync-account")), "Account data and pairing controls are hidden in private windows");
    ok(!privateWindow.document.getElementById("midori-sync-keys"), "Private windows never construct recovery controls");
    ok(BrowserTestUtils.isHidden(panel.querySelector('[data-l10n-id="midori-sync-server-change"]')), "Private windows do not configure the profile account");
    ok(panel.querySelector('[data-l10n-id="midori-sync-private-window"]'), "The popup explains how to manage the account");
  } finally {
    await BrowserTestUtils.closeWindow(privateWindow);
  }
});
