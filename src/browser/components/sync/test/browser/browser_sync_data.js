/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, BrowserTestUtils, TestUtils, add_task, executeSoon, gBrowser, is, ok */

function openTestSyncDataPanel(view) {
  view.open();
  view.section.querySelector("details").open = true;
}

function clickTestSyncDataControl(control) {
  const bounds = control.getBoundingClientRect();
  ok(bounds.width > 0 && bounds.height > 0, "The Sync control is rendered before activation");
  control.click();
}

add_task(async function offline_custody_reports_saved_work_without_querying_keys_or_hiding_storage_failures() {
  const { createSyncDataPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncDataPanel.sys.mjs");
  let refreshes = 0;
  const rows = [{ name: "bookmarks", status: "offline", pending: 2, conflicts: 0, lastSuccessAt: null }];
  const service = { account: { snapshot: { status: "local", busy: false, generation: 1 } },
    keys: { snapshot: { status: "ready", localOnly: true }, async refresh() { ++refreshes; } },
    connection: { snapshot: { capabilities: null } }, backgroundSnapshot: { offline: true },
    get syncCollectionsSnapshot() { return rows; }, async remoteTabs() { return []; } };
  const view = createSyncDataPanel(document, service, () => {});
  document.documentElement.append(view.section);
  try {
    openTestSyncDataPanel(view);
    await document.l10n.translateFragment(view.section);
    ok(!view.section.hidden, "The locally unlocked account keeps its data panel visible");
    is(refreshes, 0, "Offline custody does not trigger a remote key refresh from the view");
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-offline"]'), "Offline capture has its own status");
    is(view.section.querySelector('[data-collection="bookmarks"]').children[1].textContent, "Offline");
    rows[0] = { ...rows[0], status: "error", error: "store_corrupt" };
    view.refresh();
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-partial"]'),
      "A local storage failure cannot claim that the offline changes are saved");
  } finally {
    view.close();
    view.section.remove();
  }
});

add_task(async function data_control_requires_unlocked_keys() {
  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
  const { createSyncDataPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncDataPanel.sys.mjs");
  const account = { snapshot: { status: "connected", busy: false } };
  const keys = { snapshot: { status: "ready" }, async refresh() {} };
  let finish;
  let calls = 0;
  const opened = [];
  let remoteTitle = "<b>Remote</b>";
  let remoteCalls = 0;
  let collectionSnapshots = [
    { name: "bookmarks", status: "pending", pending: 2, conflicts: 0, lastSuccessAt: null },
    { name: "history", status: "completed", pending: 0, conflicts: 0, lastSuccessAt: Date.now() },
    ...["passwords", "credit-cards", "tabs", "browser-settings"].map(name =>
      ({ name, status: "ready", pending: 0, conflicts: 0, lastSuccessAt: null })),
  ];
  const service = { account, keys, connection: { snapshot: { capabilities: { creditCards: true } } },
    get syncCollectionsSnapshot() { return collectionSnapshots; },
    async remoteTabs() {
      remoteCalls++;
      return [{ device_name: "Second device", tabs: [
        { url: "https://remote.example.invalid/", title: remoteTitle }], omitted: 0 }];
    },
    syncNow(options) {
      calls++;
      Assert.deepEqual(options, { limit: 100, inventory: true, promptPasswords: true });
      return new Promise(resolve => { finish = resolve; });
    },
  };
  const view = createSyncDataPanel(document, service, url => opened.push(url));
  const host = document.createXULElement("panel");
  const body = document.createElementNS("http://www.w3.org/1999/xhtml", "section");
  body.className = "midori-sync-body";
  body.style.overflowY = "auto";
  body.append(view.section);
  host.append(body);
  document.getElementById("mainPopupSet").append(host);
  const shown = BrowserTestUtils.waitForEvent(host, "popupshown");
  host.openPopup(gBrowser.selectedBrowser, "overlap", 0, 0, false, false);
  try {
    await shown;
    openTestSyncDataPanel(view);
    await document.l10n.translateFragment(view.section);
    const bookmarkRow = view.section.querySelector('[data-collection="bookmarks"]');
    is(bookmarkRow.children[1].textContent, "2 pending", "The popup shows each collection's pending work");
    const historyRow = view.section.querySelector('[data-collection="history"]');
    ok(!historyRow.children[2].hidden, "The last completed pass is visible for the collection");
    ok(historyRow.children[2].textContent.includes("Last completed:"),
      "The completed time is labelled without limiting it to the current session");
    collectionSnapshots = collectionSnapshots.map(snapshot => snapshot.name === "bookmarks" ?
      { ...snapshot, status: "error", pending: 2 } : snapshot);
    view.refresh();
    await document.l10n.translateFragment(view.section);
    is(bookmarkRow.children[1].textContent, "Needs attention", "Background state changes update the collection row");
    is(view.section.querySelector("#midori-sync-data [role=status]").textContent,
      "Some data could not finish. Your saved changes remain available to retry.",
      "A background collection failure changes the summary");
    collectionSnapshots = collectionSnapshots.map(snapshot => snapshot.name === "tabs" ?
      { ...snapshot, status: "syncing" } : snapshot);
    view.refresh();
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-partial"]'),
      "A collection failure stays visible while another collection is syncing");
    collectionSnapshots = collectionSnapshots.map(snapshot => snapshot.name === "bookmarks" ?
      { ...snapshot, status: "pending" } : snapshot);
    view.refresh();
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-working"]'),
      "The summary reports automatic work while a collection is syncing");
    collectionSnapshots = collectionSnapshots.map(snapshot => {
      if (snapshot.name === "tabs") {
        return { ...snapshot, status: "ready" };
      }
      return snapshot.name === "bookmarks" ? { ...snapshot, status: "error" } : snapshot;
    });
    collectionSnapshots = collectionSnapshots.map(snapshot => snapshot.name === "bookmarks" ?
      { ...snapshot, error: "server_error" } : snapshot);
    view.refresh();
    await document.l10n.translateFragment(view.section);
    is(bookmarkRow.children[1].textContent, "Server error", "The affected row identifies a server failure");
    is(view.section.querySelector("#midori-sync-data [role=status]").textContent,
      "The Sync server could not process browser data. Try again; if this continues, check the server logs.",
      "A background server failure explains the attention state");
    collectionSnapshots = collectionSnapshots.map(snapshot => snapshot.name === "bookmarks" ?
      { ...snapshot, error: "native_write_failed" } : snapshot);
    view.refresh();
    await document.l10n.translateFragment(view.section);
    is(bookmarkRow.children[1].textContent, "Save failed", "The affected row identifies a native write failure");
    is(view.section.querySelector("#midori-sync-data [role=status]").textContent,
      "This device could not save some browser data. Saved Sync work is kept. Check the device's storage and try again.",
      "The popup explains a device storage failure separately from the service");
    ok(!view.section.querySelector('[data-l10n-id="midori-sync-data-up-to-date"]'),
      "A failed native write cannot report a completed pass");
    collectionSnapshots = collectionSnapshots.map(snapshot => snapshot.name === "bookmarks" ?
      { ...snapshot, error: "network_error" } : snapshot);
    view.refresh();
    await document.l10n.translateFragment(view.section);
    is(bookmarkRow.children[1].textContent, "Connection issue", "The affected row identifies a network failure");
    collectionSnapshots = collectionSnapshots.map(snapshot => snapshot.name === "bookmarks" ?
      { ...snapshot, status: "pending", error: null } : snapshot);
    view.refresh();
    await TestUtils.waitForCondition(() => view.section.querySelector("#midori-sync-remote-tabs button"));
    const remote = view.section.querySelector("#midori-sync-remote-tabs button");
    is(remote.textContent, "<b>Remote</b>", "Remote titles render as text");
    remoteTitle = "Updated remote tab";
    collectionSnapshots = collectionSnapshots.map(snapshot => snapshot.name === "tabs" ?
      { ...snapshot, status: "completed", lastSuccessAt: Date.now() } : snapshot);
    view.refresh();
    await TestUtils.waitForCondition(() =>
      view.section.querySelector("#midori-sync-remote-tabs button")?.textContent === remoteTitle);
    is(remoteCalls, 2, "A completed background tabs pass refreshes the open popup");
    is(opened.length, 0, "Receiving tabs never opens them automatically");
    clickTestSyncDataControl(view.section.querySelector("#midori-sync-remote-tabs button"));
    Assert.deepEqual(opened, ["https://remote.example.invalid/"]);
    const control = view.section.querySelector('[data-l10n-id="midori-sync-data-now"]');
    ok(!control.disabled, "Unlocked browser data can synchronize");
    for (const status of ["locked", "recovery-required"]) {
      keys.snapshot.status = status;
      view.refresh();
      ok(control.disabled, "Locked keys prevent transfer");
      is(view.section.querySelector("#midori-sync-remote-tabs").childElementCount, 0,
        "Locking keys removes remote titles from the popup");
    }
    keys.snapshot.status = "ready";
    collectionSnapshots = collectionSnapshots.map(snapshot =>
      ({ ...snapshot, status: "completed", pending: 0, lastSuccessAt: Date.now() }));
    view.refresh();
    await document.l10n.translateFragment(view.section);
    is(view.section.querySelector("#midori-sync-data [role=status]").textContent,
      "This pass finished. Another device may have new changes later.",
      "A completed automatic pass updates the popup without a button click");
    clickTestSyncDataControl(control);
    ok(control.disabled, "One active pass disables a duplicate click");
    is(calls, 1, "Only the explicit click starts a transfer");
    const height = body.getBoundingClientRect().height;
    collectionSnapshots = collectionSnapshots.map(snapshot =>
      ({ ...snapshot, status: "completed", pending: 0, lastSuccessAt: Date.now() }));
    view.refresh();
    await document.l10n.translateFragment(view.section);
    is(body.getBoundingClientRect().height, height, "Progress updates do not resize the popup body");
    is(host.state, "open", "Progress updates keep the popup open");
    collectionSnapshots = collectionSnapshots.map(snapshot => snapshot.name === "bookmarks" ?
      { ...snapshot, status: "more" } : snapshot);
    finish({ more: true, errors: {} });
    await TestUtils.waitForCondition(() => !control.disabled &&
      view.section.querySelector('[data-l10n-id="midori-sync-data-more"]'));
    collectionSnapshots = collectionSnapshots.map(snapshot =>
      ({ ...snapshot, status: "completed", pending: 0, lastSuccessAt: Date.now() }));
    view.refresh();
    is(view.section.querySelector('[data-l10n-id="midori-sync-data-up-to-date"]')?.hidden, false,
      "A background pass replaces an earlier manual more status while the popup stays open");
    clickTestSyncDataControl(control);
    is(calls, 2, "Another bounded pass is explicit");
    view.close();
    is(body.style.height, "", "Closing the popup releases its fixed height");
    finish({ more: false, errors: {} });
    await new Promise(resolve => window.setTimeout(resolve, 0));
    ok(view.section.hidden, "Closing the popup prevents a late pass from reopening its controls");
    openTestSyncDataPanel(view);
    is(calls, 2, "Reopening reports local state without contacting the server");
    clickTestSyncDataControl(control);
    is(calls, 3, "A new explicit pass may prompt for the primary password");
    collectionSnapshots = collectionSnapshots.map(snapshot => snapshot.name === "passwords" ?
      { ...snapshot, status: "locked", error: "passwords_locked" } : snapshot);
    finish({ more: false, errors: { passwords: "passwords_locked" } });
    await TestUtils.waitForCondition(() => !control.disabled &&
      view.section.querySelector('[data-l10n-id="midori-sync-data-passwords-locked"]'));
    collectionSnapshots = collectionSnapshots.map(snapshot => snapshot.name === "passwords" ?
      { ...snapshot, status: "completed", error: null, lastSuccessAt: Date.now() + 1 } : snapshot);
    view.refresh();
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-up-to-date"]'),
      "A completed background pass clears the previous manual lock message");
  } finally {
    view.close();
    if (host.state !== "closed") {
      const hidden = BrowserTestUtils.waitForEvent(host, "popuphidden");
      host.hidePopup();
      await hidden;
    }
    host.remove();
  }
});

add_task(async function form_and_address_selection_updates_without_erasing_saved_data() {
  const { createSyncDataPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncDataPanel.sys.mjs");
  const snapshots = ["form-history", "addresses"].map(name => ({
    name, status: "completed", enabled: true, pending: 0, conflicts: 0, lastSuccessAt: Date.now(),
  }));
  const changes = [];
  const service = {
    account: { snapshot: { status: "connected", busy: false, creditCardsSupported: true } },
    keys: { snapshot: { status: "ready" } },
    connection: { snapshot: { capabilities: { addresses: true, formHistory: true, workspaces: true } } },
    get syncCollectionsSnapshot() { return snapshots; },
    setCollectionEnabled(name, enabled) {
      changes.push([name, enabled]);
      const row = snapshots.find(item => item.name === name);
      row.enabled = enabled;
      row.status = enabled ? "completed" : "disabled";
    },
  };
  const view = createSyncDataPanel(document, service);
  document.documentElement.append(view.section);
  try {
    openTestSyncDataPanel(view);
    for (const name of ["workspaces", "extensions", "extension-settings", "midori-tab", "midori-privacy", "site-permissions"]) {
      ok(!view.section.querySelector(`[data-collection-selection="${name}"]`), `${name} is outside this delivery`);
    }
    is(view.section.querySelectorAll("[data-collection-selection]").length, 8, "Only the eight primary families are selectable");
    const selection = view.section.querySelector('[data-collection-selection="addresses"]');
    ok(selection.checked, "Address synchronization starts selected");
    clickTestSyncDataControl(selection);
    Assert.deepEqual(changes, [["addresses", false]], "The checkbox changes only its collection selection");
    ok(!selection.checked, "Disabled selection survives refresh");
    is(snapshots[0].enabled, true, "Form history remains selected independently");
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-up-to-date"]'),
      "Disabled collections do not falsely report an unfinished pass");
    clickTestSyncDataControl(selection);
    Assert.deepEqual(changes.at(-1), ["addresses", true]);
    snapshots[1].status = "syncing";
    view.refresh();
    ok(!selection.disabled, "An active collection can be disabled without waiting for its network request");
    snapshots[1].status = "completed";
    snapshots[0].status = "unsupported";
    view.refresh();
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-server-update-required"]'),
      "An unsupported selected collection cannot claim a completed pass");
    snapshots[0].status = "error";
    snapshots[0].error = "form_history_disabled";
    view.refresh();
    ok(view.section.querySelector('[data-l10n-id="midori-sync-collection-status-form-history-disabled"]'),
      "Disabled form autocomplete has a precise explanation");
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-form-history-disabled"]'));
    snapshots.forEach(snapshot => { snapshot.enabled = false; snapshot.status = "disabled"; snapshot.error = null; });
    view.refresh();
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-no-selection"]'),
      "Selecting no collections does not report an up-to-date pass");
  } finally {
    view.close();
    view.section.remove();
  }
});

add_task(async function a_requested_pause_does_not_become_a_sync_failure_after_resume() {
  const { createSyncDataPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncDataPanel.sys.mjs");
  let rejectRun;
  const state = { globalEnabled: true };
  const service = {
    account: { snapshot: { status: "connected", busy: false, interactionBusy: false, creditCardsSupported: true } },
    keys: { snapshot: { status: "ready" } }, connection: { snapshot: { capabilities: { creditCards: true } } },
    backgroundSnapshot: state,
    syncCollectionsSnapshot: [{ name: "bookmarks", status: "pending", enabled: true, pending: 1, conflicts: 0 }],
    setCollectionEnabled() {},
    syncNow() { return new Promise((_resolve, reject) => { rejectRun = reject; }); },
    async remoteTabs() { return []; },
  };
  const view = createSyncDataPanel(document, service);
  document.documentElement.append(view.section);
  try {
    openTestSyncDataPanel(view);
    const sync = view.section.querySelector('[data-l10n-id="midori-sync-data-now"]');
    clickTestSyncDataControl(view.section.querySelector('[data-l10n-id="midori-sync-history-clear"]'));
    clickTestSyncDataControl(sync);
    await TestUtils.waitForCondition(() => typeof rejectRun === "function");
    state.globalEnabled = false;
    view.refresh();
    ok(sync.disabled);
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-user-paused"]'));
    rejectRun(Object.assign(new Error("sync_paused"), { code: "sync_paused" }));
    await new Promise(resolve => executeSoon(resolve));
    const cancel = view.section.querySelector('[data-l10n-id="midori-sync-history-clear-cancel"]');
    ok(!cancel.disabled, "A local confirmation can still be dismissed while transfers are paused");
    clickTestSyncDataControl(cancel);
    ok(view.section.querySelector('[data-l10n-id="midori-sync-history-clear-warning"]').hidden);
    state.globalEnabled = true;
    view.refresh();
    ok(!sync.disabled);
    ok(view.section.querySelector('[data-l10n-id="midori-sync-data-more"]'));
    ok(!view.section.querySelector('[data-l10n-id="midori-sync-data-partial"]'), "Requested cancellation does not leave a stale failure");
    is(service.syncCollectionsSnapshot[0].pending, 1);
  } finally {
    view.close();
    view.section.remove();
  }
});
