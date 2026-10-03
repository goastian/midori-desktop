/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function public_oidc_server_offers_one_click_account_connection() {
  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
  const pref = "midori.sync.serverConfig";
  const hadPref = Services.prefs.prefHasUserValue(pref);
  const originalPref = Services.prefs.getStringPref(pref, "");
  const restorePref = () => hadPref ? Services.prefs.setStringPref(pref, originalPref) : Services.prefs.clearUserPref(pref);
  registerCleanupFunction(restorePref);
  const { HttpServer } = ChromeUtils.importESModule("resource://testing-common/httpd.sys.mjs");
  const { MidoriSyncPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncPanel.sys.mjs");
  const { MidoriSyncService } = ChromeUtils.importESModule("resource:///modules/MidoriSyncService.sys.mjs");
  const { PanelMultiView } = ChromeUtils.importESModule("moz-src:///browser/components/customizableui/PanelMultiView.sys.mjs");
  const server = new HttpServer();
  server.start(-1);
  MidoriSyncPanel.init();
  registerCleanupFunction(() => MidoriSyncPanel.uninit());
  registerCleanupFunction(() => new Promise(resolve => server.stop(resolve)));
  const issuer = "https://accounts.astian.org/";
  let advertiseOidc = true;
  server.registerPathHandler("/api/v1/capabilities", (_request, response) => {
    response.setStatusLine("1.1", 200, "OK");
    response.setHeader("Content-Type", "application/json", false);
    response.write(JSON.stringify({
      protocol: "MSP", native_ready: false, account_version: 1, changes_version: 1, operations_version: 1,
      authentication: { pairing: true, development: false, issuer,
        ...(advertiseOidc ? { oidc: { version: 1, issuer, client_id: "midori-desktop-public",
          discovery_url: "https://accounts.astian.org/application/o/midori-desktop/.well-known/openid-configuration" } } : {}),
        refresh: { version: 1, request_bytes: 4096, lifetime_seconds: 2592000,
          receipts_per_session: 1024, sessions_per_account: 32 } },
      features: ["opaque_cursors", "snapshot_fence", "tombstones", "device_acknowledgements",
        "conditional_operations", "idempotent_operations"],
      limits: { change_page_records: 100, change_page_payload_bytes: 4194304, record_payload_bytes: 262144,
        operation_batch_records: 100, operation_batch_bytes: 4194304 },
    }));
  });
  await MidoriSyncService.connection.checkAndUseServer(`http://localhost:${server.identity.primaryPort}/`, {
    allowLocalHTTP: true,
  });
  let panel;
  try {
    await MidoriSyncPanel.open(window);
    panel = document.getElementById("midori-sync-panel");
    await TestUtils.waitForCondition(() => panel.state === "open", "The Sync popup finishes opening");
    const connect = document.getElementById("midori-sync-connect-oidc");
    ok(BrowserTestUtils.isVisible(connect), "The popup offers account authorization without a code");
    ok(!connect.disabled, "A verified OIDC server enables account connection");
    ok(BrowserTestUtils.isHidden(document.getElementById("midori-sync-pair-form")),
      "The pairing form is hidden when direct sign-in is configured");
    is(document.getElementById("midori-sync-account-status").getAttribute("data-l10n-id"),
      "midori-sync-account-connect-ready", "The popup explains direct account connection");
    const account = MidoriSyncService.account;
    const originalConnectOidc = account.connectOidc;
    const originalCancelAuthorization = account.cancelAuthorization;
    let finishAuthorization;
    try {
      account.connectOidc = openURL => new Promise(resolve => {
        openURL("about:blank#midori-sync-authorization");
        finishAuthorization = resolve;
      });
      const opened = BrowserTestUtils.waitForEvent(gBrowser.tabContainer, "TabOpen");
      connect.click();
      const tab = (await opened).target;
      is(gBrowser.selectedTab, tab, "Connect account opens authorization in the foreground");
      const closed = BrowserTestUtils.waitForEvent(tab, "TabClose");
      finishAuthorization();
      await closed;
      await TestUtils.waitForCondition(() => panel.state === "open", "The Sync popup is visible after authorization");
      ok(!gBrowser.tabs.includes(tab), "The authorization tab closes after a successful connection");
      is(panel.state, "open", "The Sync popup is visible when authorization finishes");
      let rejectAuthorization;
      let cancellations = 0;
      account.connectOidc = openURL => new Promise((resolve, reject) => {
        openURL("about:blank#midori-sync-cancel-authorization");
        rejectAuthorization = reject;
      });
      account.cancelAuthorization = () => {
        ++cancellations;
        rejectAuthorization({ code: "cancelled" });
      };
      const openedAgain = BrowserTestUtils.waitForEvent(gBrowser.tabContainer, "TabOpen");
      connect.click();
      const cancelledTab = (await openedAgain).target;
      await BrowserTestUtils.removeTab(cancelledTab);
      await TestUtils.waitForCondition(() => cancellations === 1, "Closing login cancels authorization");
      is(document.getElementById("midori-sync-account-status").getAttribute("data-l10n-id"),
        "midori-sync-account-authorization-cancelled", "The popup reports that authorization was cancelled");
    } finally {
      account.connectOidc = originalConnectOidc;
      account.cancelAuthorization = originalCancelAuthorization;
    }
  } finally {
    if (panel && panel.state !== "closed") {
      const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
      PanelMultiView.hidePopup(panel);
      await hidden;
    }
    try {
      advertiseOidc = false;
      await MidoriSyncService.connection.checkAndUseServer(`http://localhost:${server.identity.primaryPort}/`, {
        allowLocalHTTP: true,
      });
    } finally {
      restorePref();
    }
  }
});
