/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, BrowserTestUtils, PopupNotifications, TestUtils, add_setup, add_task, gBrowser, getTestFilePath, info, is, ok, registerCleanupFunction */

const { AddonTestUtils } = ChromeUtils.importESModule("resource://testing-common/AddonTestUtils.sys.mjs");
const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
const { XPIExports } = ChromeUtils.importESModule("resource://gre/modules/addons/XPIExports.sys.mjs");
const { AppMenuNotifications } = ChromeUtils.importESModule("resource://gre/modules/AppMenuNotifications.sys.mjs");
const { createSyncExtensionStore } = ChromeUtils.importESModule("resource:///modules/MidoriSyncExtensionStore.sys.mjs");

add_setup(async function prepare_native_permission_fixtures() {
  while (gBrowser.tabs.length > 1) { await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1)); }
  AddonTestUtils.initMochitest({ registerCleanupFunction, info, Assert });
  const originalTabs = new Set(gBrowser.tabs);
  registerCleanupFunction(async () => {
    for (const tab of [...gBrowser.tabs]) {
      if (!originalTabs.has(tab)) { await BrowserTestUtils.removeTab(tab); }
    }
  });
});

add_task(async function extension_settings_have_independent_selection_and_complete_application_status() {
  const { createSyncDataPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncDataPanel.sys.mjs");
  const { syncConflictSummary } = ChromeUtils.importESModule("resource:///modules/MidoriSyncConflictSummary.sys.mjs");
  const rows = [
    { name: "extensions", enabled: true, status: "completed", pending: 0, conflicts: 0, deferred: 0 },
    { name: "extension-settings", enabled: true, status: "more", pending: 0, conflicts: 0, deferred: 1 },
  ];
  const changes = [];
  const service = {
    account: { snapshot: { status: "connected", busy: false } }, keys: { snapshot: { status: "ready" } },
    syncCollectionsSnapshot: rows,
    setCollectionEnabled(name, enabled) {
      changes.push([name, enabled]);
      const row = rows.find(value => value.name === name);
      row.enabled = enabled; row.status = enabled ? "more" : "disabled";
    },
  };
  const view = createSyncDataPanel(document, service);
  document.documentElement.append(view.section);
  try {
    view.open(); view.section.querySelector("details").open = true;
    const row = view.section.querySelector('[data-collection="extension-settings"]');
    const selection = row.querySelector("input");
    is(selection.getAttribute("aria-describedby"), "midori-sync-extension-settings-help");
    ok(selection.checked && !selection.disabled);
    await document.l10n.translateFragment(view.section);
    ok(row.textContent.includes("Extension settings"));
    const waiting = row.querySelector('[data-l10n-id="midori-sync-collection-status-extension-settings-waiting"]');
    ok(waiting && waiting.textContent.includes("waiting"));
    Assert.deepEqual(JSON.parse(waiting.getAttribute("data-l10n-args")), { count: 1 });
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-more"]'));
    ok(selection.getBoundingClientRect().width > 0);
    selection.click();
    Assert.deepEqual(changes, [["extension-settings", false]]);
    ok(rows[0].enabled, "The extension list keeps its independent selection");
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-up-to-date"]'));
    selection.click();
    rows[1].status = "completed"; rows[1].deferred = 0; view.refresh();
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-up-to-date"]'));
    const summary = syncConflictSummary("extension-settings", "opaque", { addonId: "@configuration-fixture",
      secret: "must-never-appear", bundle: { kind: "text-manifest", byte_count: 40, digest: "a".repeat(64) } });
    Assert.deepEqual(summary.fields.map(field => field.name), ["extension", "settings-bytes", "settings-digest"]);
    ok(!JSON.stringify(summary).includes("must-never-appear"), "The review summary contains metadata rather than settings values");
  } finally { view.close(); view.section.remove(); }
});

add_task(async function cached_settings_use_the_normal_browser_metadata_barrier_without_installing_or_revoking() {
  const { createSyncExtensionSettingsStore } = ChromeUtils.importESModule("resource:///modules/MidoriSyncExtensionSettingsStore.sys.mjs");
  const { storageSyncService } = ChromeUtils.importESModule("resource://gre/modules/ExtensionStorageComponents.sys.mjs");
  const { ExtensionStorage } = ChromeUtils.importESModule("resource://gre/modules/ExtensionStorage.sys.mjs");
  const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
  const { Sqlite } = ChromeUtils.importESModule("resource://gre/modules/Sqlite.sys.mjs");
  const addonId = "@browser-sync-settings-cache";
  const native = await storageSyncService.getStorageAreaInstance();
  const store = createSyncExtensionSettingsStore();
  const desired = { theme: "green", nullable: null };
  let db;
  try {
    is(await AddonManager.getAddonByID(addonId), null);
    await ExtensionStorage.set(addonId, { device: "local only" });
    await (await ExtensionStorage.getFile(addonId)).saveNow();
    await ExtensionPermissions.add(addonId, { permissions: ["clipboardRead"], origins: [] });
    const before = await store.read("amo", addonId);
    is(before.status, "cached");
    Assert.deepEqual(await store.write({ catalog: "amo", addonId, desired, expected: before }), { status: "applied" });
    is(await AddonManager.getAddonByID(addonId), null, "Receiving settings does not install an extension");
    const uuids = JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids", "{}"));
    ok(!Object.hasOwn(uuids, addonId), "The metadata barrier does not create an extension runtime UUID");
    db = await Sqlite.openConnection({ path: PathUtils.join(PathUtils.profileDir, "storage-sync-v2.sqlite"), readOnly: true });
    const rows = await db.execute("SELECT data FROM storage_sync_data WHERE ext_id = :id", { id: addonId });
    is(rows.length, 1);
    Assert.deepEqual(JSON.parse(rows[0].getResultByName("data")), desired, "Another native connection sees the committed namespace");
    const current = await store.read("amo", addonId);
    ok(await store.persist("amo", addonId, current), "An unchanged value passes the default native metadata barrier");
    Assert.deepEqual(await store.write({ catalog: "amo", addonId, desired: null, expected: current }), { status: "applied" });
    Assert.deepEqual(JSON.parse(await native.getSyncSnapshot(addonId)), {});
    Assert.deepEqual(await ExtensionStorage.get(addonId, null), { device: "local only" });
    ok((await ExtensionPermissions.get(addonId)).permissions.includes("clipboardRead"), "Settings changes keep existing optional grants");
    await Services.prefs.flushPrefFile();
  } finally {
    await db?.close();
    await native.clear(addonId);
    await ExtensionPermissions.persistSyncRemoval(addonId, () => true);
    await ExtensionStorage.persistSyncRemoval(addonId, () => true);
  }
});

add_task(async function automatic_extension_installs_keep_the_real_permission_prompt() {
  for (const decision of ["accept", "decline", "accept-disabled", "local-change", "pause"]) {
    const addonId = "amosigned-xpi@tests.mozilla.org";
    const xpi = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    xpi.initWithPath(getTestFilePath("../../../../../toolkit/mozapps/extensions/test/xpinstall/amosigned.xpi"));
    const uri = Services.io.newURI("https://addons.mozilla.org/firefox/downloads/file/1/synthetic-fixture.xpi");
    const browser = gBrowser.selectedBrowser;
    const desired = { version: 1, type: "extension", catalog: "amo", addonId, enabled: decision !== "accept-disabled" };
    const controller = new AbortController();
    let checkpointed = false;
    const store = createSyncExtensionStore({
      addons: { ...AddonManager, async getInstallForURL(url, options) {
        is(url, uri.spec);
        is(options.id, addonId);
        is(options.type, "extension");
        const install = await AddonManager.getInstallForFile(xpi);
        Assert.equal(install.addon?.id, addonId);
        Assert.equal(install.addon?.type, "extension");
        Assert.equal(install.addon?.signedState, AddonManager.SIGNEDSTATE_SIGNED);
        return install;
      } },
      repository: { async getAddonsByIDs(ids) {
        Assert.deepEqual(ids, [addonId]);
        return [{ id: addonId, type: "extension", name: "Sync permission fixture", sourceURI: uri }];
      } },
      getBrowser: () => browser,
    });
    let result;
    try {
      const expected = await store.read("amo", addonId);
      const shown = BrowserTestUtils.waitForEvent(PopupNotifications.panel, "popupshown");
      result = store.install({ desired, expected, signal: controller.signal,
        beforePermissionPrompt: async () => { checkpointed = true; } });
      const settled = result.then(value => ({ value }), error => ({ error }));
      await Promise.race([shown, settled.then(outcome => {
        throw new Error(`Native install finished before permission confirmation: ${JSON.stringify(outcome.value ?? { error: outcome.error?.message })}`);
      })]);
      await TestUtils.waitForCondition(() => !!PopupNotifications.getNotification("addon-webext-permissions", browser));
      const panel = document.getElementById("addon-webext-permissions-notification");
      ok(panel?.getBoundingClientRect().width > 0, "The native permissions request is visible");
      ok(checkpointed, "The application was checkpointed before the native permissions request");
      is(await AddonManager.getAddonByID(addonId), null, "No extension is installed before local confirmation");
      if (decision === "local-change") {
        const replacement = AddonTestUtils.createTempWebExtensionFile({ manifest: {
          manifest_version: 2, name: "Local replacement", version: "9.9",
          browser_specific_settings: { gecko: { id: addonId } },
        } });
        await AddonTestUtils.promiseInstallFile(replacement);
      }
      if (decision === "pause") {
        controller.abort();
        PopupNotifications.getNotification("addon-webext-permissions", browser)?.remove();
      } else {
        const hidden = BrowserTestUtils.waitForEvent(PopupNotifications.panel, "popuphidden");
        (decision === "decline" ? panel.secondaryButton : panel.button).click();
        await hidden;
      }
      const outcome = await settled;
      if (decision === "pause") {
        is(outcome.error?.code, "cancelled");
        is(await AddonManager.getAddonByID(addonId), null);
      } else if (decision === "decline") {
        Assert.deepEqual(outcome.value, { status: "deferred", reason: "extension_permission_declined" });
        is(await AddonManager.getAddonByID(addonId), null);
      } else if (decision === "local-change") {
        Assert.deepEqual(outcome.value, { status: "deferred", reason: "extension_local_changed" });
        is((await AddonManager.getAddonByID(addonId)).version, "9.9", "The native installer preserves the concurrent local installation");
      } else {
        Assert.deepEqual(outcome.value, { status: "applied" });
        const addon = await AddonManager.getAddonByID(addonId);
        is(addon.userDisabled, !desired.enabled);
        Assert.deepEqual(XPIExports.XPIDatabase.getSyncAddonState(addonId), { tracked: true, removal: null });
        const persisted = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, "extensions.json"));
        is(persisted.addons.find(item => item.id === addonId).userDisabled, !desired.enabled);
        const startup = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, "addonStartup.json.lz4"), { decompress: true });
        const entry = Object.values(startup).map(location => location.addons?.[addonId]).find(Boolean);
        ok(entry);
        is(entry.enabled, desired.enabled);
      }
    } finally {
      controller.abort();
      await result?.catch(() => {});
      for (const notification of ["addon-webext-permissions", "addon-installed", "addon-install-failed"]) {
        PopupNotifications.getNotification(notification, browser)?.remove();
      }
      AppMenuNotifications.removeNotification("addon-installed");
      const postInstallPanel = document.getElementById("appMenu-notification-popup");
      if (postInstallPanel.state !== "closed") {
        const hidden = BrowserTestUtils.waitForEvent(postInstallPanel, "popuphidden");
        postInstallPanel.hidePopup();
        await hidden;
      }
      if (PopupNotifications.panel.state !== "closed") {
        const hidden = BrowserTestUtils.waitForEvent(PopupNotifications.panel, "popuphidden");
        PopupNotifications.panel.hidePopup();
        await hidden;
      }
      const addon = await AddonManager.getAddonByID(addonId);
      if (addon) { await addon.uninstall(); }
    }
  }
});

add_task(async function pending_extension_review_explains_rejection_and_clears_on_account_or_key_changes() {
  const { createSyncExtensionsPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncExtensionsPanel.sys.mjs");
  const row = { name: "extensions", enabled: true, status: "more", deferred: 2 };
  const calls = [];
  const page = { entries: [
    { id: "665d9034-58c3-44f2-bc2e-581810d6f34e", revision: 4,
      summary: { addonId: "rejected@fixture", reason: "extension_permission_declined", canReview: true } },
    { id: "5ec6b7ed-8dc1-489a-906a-ef0cfc9c18c9", revision: 2,
      summary: { addonId: "downloading@fixture", reason: "extension_downloading", canReview: false } },
  ], next: null };
  const service = {
    account: { snapshot: { generation: 1, status: "connected", busy: false } },
    keys: { snapshot: { status: "ready" } }, backgroundSnapshot: { globalEnabled: true },
    syncCollectionsSnapshot: [row],
    async extensionInstallPage(options) { calls.push(options); return page; },
    async reviewExtensionInstall(options) { calls.push(options); },
  };
  const view = createSyncExtensionsPanel(document, service);
  Object.assign(view.section.style, { position: "fixed", top: "120px", left: "30px", width: "500px", maxHeight: "500px", overflow: "auto", zIndex: "2147483647" });
  document.documentElement.append(view.section);
  const load = view.section.querySelector("#midori-sync-extensions-load");
  const list = view.section.querySelector("#midori-sync-extension-list");
  try {
    view.refresh(true);
    ok(!view.section.hidden);
    await document.l10n.translateFragment(view.section);
    await TestUtils.waitForTick();
    ok(load.getBoundingClientRect().width > 0);
    load.click();
    await TestUtils.waitForCondition(() => list.children.length === 2);
    Assert.deepEqual(calls[0], { after: null, limit: 20 });
    ok(list.querySelector('[data-l10n-id="midori-sync-extension-status-declined"]'));
    const buttons = list.querySelectorAll("button");
    ok(!buttons[0].disabled);
    ok(buttons[1].disabled, "A download or live permission request cannot be started twice");
    await document.l10n.translateFragment(list);
    await TestUtils.waitForTick();
    ok(buttons[0].getBoundingClientRect().width > 0);
    buttons[0].click();
    await TestUtils.waitForCondition(() => calls.length === 2);
    Assert.deepEqual(calls[1], { id: page.entries[0].id, revision: 4 });
    await TestUtils.waitForCondition(() => !!view.section.querySelector('[data-l10n-id="midori-sync-extensions-requested"]'));
    ok(buttons[0].disabled);
    service.backgroundSnapshot.globalEnabled = false; view.refresh();
    ok(load.disabled);
    ok([...buttons].every(button => button.disabled));
    service.backgroundSnapshot.globalEnabled = true;
    service.account.snapshot.generation = 2; view.refresh();
    is(list.childElementCount, 0, "Changing accounts removes decrypted extension identifiers");
    load.click(); await TestUtils.waitForCondition(() => list.childElementCount === 2);
    service.keys.snapshot.status = "locked"; view.refresh();
    ok(view.section.hidden);
    is(list.childElementCount, 0);
  } finally { view.close(); view.section.remove(); }
});

add_task(async function an_extension_list_requested_for_an_earlier_account_cannot_render_after_a_reply() {
  const { createSyncExtensionsPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncExtensionsPanel.sys.mjs");
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const service = {
    account: { snapshot: { generation: 1, status: "connected", busy: false } }, keys: { snapshot: { status: "ready" } },
    syncCollectionsSnapshot: [{ name: "extensions", enabled: true, status: "more", deferred: 1 }],
    extensionInstallPage: () => held,
  };
  const view = createSyncExtensionsPanel(document, service);
  Object.assign(view.section.style, { position: "fixed", top: "120px", left: "30px", width: "500px", maxHeight: "500px", overflow: "auto", zIndex: "2147483647" });
  document.documentElement.append(view.section);
  try {
    view.refresh(true);
    await document.l10n.translateFragment(view.section);
    await TestUtils.waitForTick();
    const load = view.section.querySelector("#midori-sync-extensions-load");
    ok(load.getBoundingClientRect().width > 0);
    load.click();
    service.account.snapshot.generation = 2;
    release({ entries: [{ id: "665d9034-58c3-44f2-bc2e-581810d6f34e", revision: 1,
      summary: { addonId: "previous-account@fixture", reason: "extension_permission_declined", canReview: true } }], next: null });
    await TestUtils.waitForTick();
    is(view.section.querySelector("#midori-sync-extension-list").childElementCount, 0);
  } finally { view.close(); view.section.remove(); }
});
