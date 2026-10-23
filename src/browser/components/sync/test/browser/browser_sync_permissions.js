/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, BrowserTestUtils, SpecialPowers, TestUtils, add_task, content, gBrowser, is, ok, requestLongerTimeout */

add_task(async function pending_site_permissions_have_independent_controls_and_do_not_claim_completion() {
  const { createSyncDataPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncDataPanel.sys.mjs");
  const rows = [
    { name: "site-permissions", enabled: true, status: "more", pending: 0, conflicts: 0, deferred: 2 },
    { name: "midori-privacy", enabled: true, status: "completed", pending: 0, conflicts: 0, deferred: 0 },
  ];
  const changes = [];
  const service = {
    account: { snapshot: { status: "connected", busy: false } }, keys: { snapshot: { status: "ready" } },
    syncCollectionsSnapshot: rows,
    setCollectionEnabled(name, enabled) {
      changes.push([name, enabled]);
      const row = rows.find(item => item.name === name);
      row.enabled = enabled;
      row.status = enabled ? "more" : "disabled";
    },
  };
  const view = createSyncDataPanel(document, service);
  document.documentElement.append(view.section);
  try {
    view.open();
    view.section.querySelector("details").open = true;
    const row = view.section.querySelector('[data-collection="site-permissions"]');
    const selection = row.querySelector("input");
    ok(selection.checked && !selection.disabled);
    is(selection.getAttribute("aria-describedby"), "midori-sync-permissions-help");
    ok(row.querySelector('[data-l10n-id="midori-sync-permissions-help"]'));
    const waiting = row.querySelector('[data-l10n-id="midori-sync-collection-status-permissions-waiting"]');
    Assert.deepEqual(JSON.parse(waiting.getAttribute("data-l10n-args")), { count: 2 });
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-more"]'));
    ok(view.section.querySelector('[data-collection="midori-privacy"] [data-l10n-id="midori-sync-collection-status-completed"]'));
    ok(selection.getBoundingClientRect().width > 0);
    selection.click();
    Assert.deepEqual(changes, [["site-permissions", false]]);
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-up-to-date"]'));
    is(rows[1].enabled, true, "Custom filters keep their independent selection");
    selection.click();
    rows[0].status = "completed";
    rows[0].deferred = 0;
    view.refresh();
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-up-to-date"]'));
    ok(!row.querySelector('[data-l10n-id="midori-sync-collection-status-permissions-waiting"]'));
  } finally {
    view.close();
    view.section.remove();
  }
});

add_task(async function local_sensitive_grants_are_translated_and_reviewed_as_grants() {
  const { createSyncConflictsPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncConflictsPanel.sys.mjs");
  const { syncConflictSummary } = ChromeUtils.importESModule("resource:///modules/MidoriSyncConflictSummary.sys.mjs");
  const value = { origin: "https://permission-review.example.invalid", permission: "camera", action: "deny" };
  const entry = { id: "06cd7f6f-c7dc-43d2-ad13-f112533591ea", revision: 1, remoteRevision: "2",
    canKeepLocal: true, canAcceptRemote: true, canMerge: false,
    summary: syncConflictSummary("site-permissions", "opaque", value) };
  const preview = {
    local: { ...syncConflictSummary("site-permissions", "opaque", { ...value, action: "allow" }), localReason: "sensitive-grant" },
    remote: entry.summary, localRevision: "a2bdc2b9-6f3f-45da-948b-416126359950",
  };
  const service = {
    account: { snapshot: { status: "connected", generation: 1, busy: false } }, keys: { snapshot: { status: "ready" } },
    syncCollectionsSnapshot: [{ name: "site-permissions", conflicts: 1 }],
    async conflictPage() { return { entries: [entry], nextAfter: null }; },
    async conflictPreview() { return preview; },
  };
  const view = createSyncConflictsPanel(document, service);
  document.documentElement.append(view.section);
  const get = id => view.section.querySelector(`[data-l10n-id="${id}"]`);
  const click = control => {
    const bounds = control.getBoundingClientRect();
    ok(bounds.width > 0 && bounds.height > 0, "The reviewed control is rendered before activation");
    control.click();
  };
  try {
    view.open();
    view.section.open = true;
    click(get("midori-sync-conflicts-load"));
    await TestUtils.waitForCondition(() => !get("midori-sync-conflicts-load").disabled);
    ok(view.section.querySelector('#midori-sync-conflict-list [data-l10n-id="midori-sync-permission-type-camera"]'));
    click(view.section.querySelector("#midori-sync-conflict-list button"));
    await TestUtils.waitForCondition(() => !!get("midori-sync-permission-local-sensitive-grant"));
    ok(get("midori-sync-permission-action-allow"), "The local grant is shown explicitly instead of as a deletion");
    ok(get("midori-sync-permission-action-deny"));
    ok(!get("midori-sync-conflicts-deleted"));
    ok(get("midori-sync-conflicts-use-merge").disabled);
    service.keys.snapshot.status = "locked";
    view.refresh();
    is(view.section.querySelector("#midori-sync-conflict-detail").childElementCount, 0);
  } finally {
    view.close();
    view.section.remove();
  }
});

add_task(async function session_and_managed_permissions_update_an_already_open_content_process() {
  const origin = "https://example.org";
  const principal = Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin);
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser,
    `${origin}/browser/browser/components/sync/test/browser/file_sync_autofill.html`);
  const status = () => SpecialPowers.spawn(tab.linkedBrowser, [], async () =>
    (await content.navigator.permissions.query({ name: "geolocation" })).state);
  const wait = async expected => {
    await TestUtils.waitForCondition(async () => (await status()) === expected, `Content sees ${expected}`);
    is(await status(), expected);
  };
  try {
    Services.perms.addFromPrincipal(principal, "geo", Services.perms.DENY_ACTION);
    await Services.perms.persistPermissionFromPrincipal(principal, "geo");
    await wait("denied");
    Services.perms.addFromPrincipal(principal, "geo", Services.perms.ALLOW_ACTION, Services.perms.EXPIRE_SESSION);
    await wait("granted");
    Services.perms.addFromPrincipal(principal, "geo", Services.perms.DENY_ACTION, Services.perms.EXPIRE_POLICY);
    await wait("denied");
    Services.perms.addFromPrincipal(principal, "geo", Services.perms.UNKNOWN_ACTION, Services.perms.EXPIRE_POLICY);
    await wait("prompt");
    is(Services.perms.getPermissionSourceFromPrincipal(principal, "geo"), "omitted");
    Services.perms.addFromPrincipal(principal, "geo", Services.perms.ALLOW_ACTION);
    await Services.perms.persistPermissionFromPrincipal(principal, "geo");
    await wait("granted");
  } finally {
    Services.perms.addFromPrincipal(principal, "geo", Services.perms.UNKNOWN_ACTION, Services.perms.EXPIRE_POLICY);
    Services.perms.removeFromPrincipal(principal, "geo");
    await Services.perms.persistPermissionFromPrincipal(principal, "geo");
    await BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function a_received_blocker_exception_changes_a_real_page_request() {
  requestLongerTimeout(3);
  while (gBrowser.tabs.length > 1) { await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1)); }
  const { MidoriBlockerService } = ChromeUtils.importESModule("resource:///modules/MidoriBlockerService.sys.mjs");
  const { ListStore } = ChromeUtils.importESModule("resource:///modules/internal/ListStore.sys.mjs");
  const { ListCatalog } = ChromeUtils.importESModule("resource:///modules/internal/ListCatalog.sys.mjs");
  const { MidoriSyncPermissions } = ChromeUtils.importESModule("resource:///modules/MidoriSyncPermissions.sys.mjs");
  const { deriveSyncPermissionId } = ChromeUtils.importESModule("resource:///modules/MidoriSyncPermissionModel.sys.mjs");
  const previous = await MidoriBlockerService.readCustomFiltersSnapshot();
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const handle = await crypto.generateNativeKey(JSON.stringify(["http://localhost:9/", "urn:midori:sync:local", "public-browser-permissions"]));
  const deriveRecordId = (collection, bytes) => crypto.deriveNativeRecordId(handle, collection, bytes);
  const adapter = new MidoriSyncPermissions({ deriveRecordId, record: async () => null });
  const host = "example.com";
  const value = { version: 1, type: "site-permission", origin: `https://${host}`, permission: "midori-blocker", action: "allow", expiresAt: null };
  const allowed = { id: await deriveSyncPermissionId(value.origin, value.permission, deriveRecordId), deleted: false, authenticatedSchema: 2, value };
  let tab;
  try {
    const overrides = Object.fromEntries((await ListCatalog.loadCatalog()).map(entry => [entry.id, false]));
    await SpecialPowers.pushPrefEnv({ set: [["midori.blocker.enabledLists", JSON.stringify(overrides)],
      ["midori.blocker.filterListUrls", "[]"], ["midori.blocker.remoteResourcesEnabled", false],
      ["midori.blocker.customFiltersEnabled", true], ["midori.blocker.enabled", true]] });
    await MidoriBlockerService.init();
    await MidoriBlockerService.setCustomFiltersText("*midori-permission-probe*$xmlhttprequest\n");
    tab = await BrowserTestUtils.openNewForegroundTab(gBrowser,
      "https://example.com/browser/browser/components/sync/test/browser/file_sync_autofill.html");
    const probe = () => SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
      try {
        return (await content.fetch(`${content.location.pathname}?midori-permission-probe=${Math.random()}`, { cache: "no-store" })).ok;
      } catch { return false; }
    });
    ok(!(await probe()), "The custom rule initially blocks the request");
    Assert.deepEqual(await adapter.apply(allowed), { status: "applied" });
    ok(await probe(), "A received site exception allows the real request without rebuilding filters");
    Assert.deepEqual(await adapter.apply({ id: allowed.id, deleted: true, authenticatedSchema: 2 }, allowed), { status: "applied" });
    ok(!(await probe()), "Removing the received exception restores the local blocking rule");
  } finally {
    adapter.close();
    crypto.close();
    MidoriBlockerService.removeSiteException(host);
    await MidoriBlockerService.setCustomFiltersText(previous.text);
    if (!previous.present) { await IOUtils.remove(ListStore.customFiltersPath(), { ignoreAbsent: true }); }
    if (tab) { await BrowserTestUtils.removeTab(tab); }
    while (gBrowser.tabs.length > 1) { await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1)); }
  }
});
