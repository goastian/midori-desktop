/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function data_control_requires_unlocked_keys() {
  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
  const { createSyncDataPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncDataPanel.sys.mjs");
  const account = { snapshot: { status: "connected", busy: false } };
  const keys = { snapshot: { status: "ready" } };
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
    view.open();
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
    collectionSnapshots = collectionSnapshots.map(snapshot => snapshot.name === "tabs" ?
      { ...snapshot, status: "ready" } : snapshot.name === "bookmarks" ?
        { ...snapshot, status: "error" } : snapshot);
    collectionSnapshots = collectionSnapshots.map(snapshot => snapshot.name === "bookmarks" ?
      { ...snapshot, error: "server_error" } : snapshot);
    view.refresh();
    await document.l10n.translateFragment(view.section);
    is(bookmarkRow.children[1].textContent, "Server error", "The affected row identifies a server failure");
    is(view.section.querySelector("#midori-sync-data [role=status]").textContent,
      "The Sync server could not process browser data. Try again; if this continues, check the server logs.",
      "A background server failure explains the attention state");
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
    view.section.querySelector("#midori-sync-remote-tabs button").click();
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
    control.click();
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
    control.click();
    is(calls, 2, "Another bounded pass is explicit");
    view.close();
    is(body.style.height, "", "Closing the popup releases its fixed height");
    finish({ more: false, errors: {} });
    await new Promise(resolve => window.setTimeout(resolve, 0));
    ok(view.section.hidden, "Closing the popup prevents a late pass from reopening its controls");
    view.open();
    is(calls, 2, "Reopening reports local state without contacting the server");
    control.click();
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
