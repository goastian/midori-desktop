/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function received_filters_block_requests_and_an_explicit_empty_value_restores_them() {
  requestLongerTimeout(3);
  while (gBrowser.tabs.length > 1) { await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1)); }
  const { MidoriBlockerService, normalizeCustomFiltersText } = ChromeUtils.importESModule("resource:///modules/MidoriBlockerService.sys.mjs");
  const { ListStore } = ChromeUtils.importESModule("resource:///modules/internal/ListStore.sys.mjs");
  const { ListCatalog } = ChromeUtils.importESModule("resource:///modules/internal/ListCatalog.sys.mjs");
  const { MidoriSyncPrivacyFilters, SYNC_FILTERS_ID } = ChromeUtils.importESModule("resource:///modules/MidoriSyncPrivacyFilters.sys.mjs");
  const { createSyncTextBundle } = ChromeUtils.importESModule("resource:///modules/MidoriSyncTextBundle.sys.mjs");
  const previous = await MidoriBlockerService.readCustomFiltersSnapshot();
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const handle = await crypto.generateNativeKey(JSON.stringify(["http://localhost:9/", "urn:midori:sync:local", "public-browser-privacy"]));
  const deriveRecordId = (collection, bytes) => crypto.deriveNativeRecordId(handle, collection, bytes);
  const records = new Map();
  const adapter = new MidoriSyncPrivacyFilters({ producer: MidoriBlockerService, deriveRecordId,
    record: id => records.get(id) ?? null, normalize: normalizeCustomFiltersText });
  const bundle = text => createSyncTextBundle("custom-filters", text, {
    entryId: async (type, digest) => `t1:${await deriveRecordId("midori-privacy",
      new TextEncoder().encode(JSON.stringify([1, "text-part", type, digest])))}`,
  });
  let base = previous.present ? { id: SYNC_FILTERS_ID, deleted: false, value: (await bundle(previous.text)).manifest } : null;
  const receive = async text => {
    const data = await bundle(text);
    for (const part of data.parts) {
      records.set(part.id, { remote: { deleted: false, value: part.value } });
    }
    const incoming = { id: SYNC_FILTERS_ID, deleted: false, value: data.manifest, authenticatedSchema: 2 };
    Assert.deepEqual(await adapter.apply(incoming, base), { status: "applied" });
    base = incoming;
  };
  let tab;
  try {
    const overrides = Object.fromEntries((await ListCatalog.loadCatalog()).map(entry => [entry.id, false]));
    await SpecialPowers.pushPrefEnv({ set: [["midori.blocker.enabledLists", JSON.stringify(overrides)],
      ["midori.blocker.filterListUrls", "[]"], ["midori.blocker.remoteResourcesEnabled", false],
      ["midori.blocker.customFiltersEnabled", true], ["midori.blocker.enabled", true]] });
    await MidoriBlockerService.init();
    const page = "https://example.com/browser/browser/components/sync/test/browser/file_sync_autofill.html";
    tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, page);
    const probe = () => SpecialPowers.spawn(tab.linkedBrowser, [], async () => {
      try {
        return (await content.fetch(`${content.location.pathname}?midori-sync-filter-probe=${Math.random()}`, { cache: "no-store" })).ok;
      } catch {
        return false;
      }
    });
    ok(await probe(), "The real page can fetch its test resource before receiving a filter");
    await receive("*midori-sync-filter-probe*$xmlhttprequest\n");
    ok(MidoriBlockerService.checkRequest(`${page}?midori-sync-filter-probe=1`, "example.com", "example.com", "xmlhttprequest", "GET", false).matched,
      "The received text is compiled by the native blocker engine");
    ok(!(await probe()), "The received filter blocks a real page request");
    await receive("");
    ok(await probe(), "Receiving an explicit empty value removes the blocking rule");
    Assert.deepEqual(await MidoriBlockerService.readCustomFiltersSnapshot(), { present: true, text: "" });
  } finally {
    adapter.close();
    crypto.close();
    await MidoriBlockerService.setCustomFiltersText(previous.text);
    if (!previous.present) { await IOUtils.remove(ListStore.customFiltersPath(), { ignoreAbsent: true }); }
    if (tab) { await BrowserTestUtils.removeTab(tab); }
    while (gBrowser.tabs.length > 1) { await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1)); }
  }
});

add_task(async function an_open_filter_editor_refreshes_received_text_and_preserves_unsaved_edits() {
  const { MidoriBlockerService } = ChromeUtils.importESModule("resource:///modules/MidoriBlockerService.sys.mjs");
  const { ListStore } = ChromeUtils.importESModule("resource:///modules/internal/ListStore.sys.mjs");
  const { PromptTestUtils } = ChromeUtils.importESModule("resource://testing-common/PromptTestUtils.sys.mjs");
  const previous = await MidoriBlockerService.readCustomFiltersSnapshot();
  let win;
  try {
    await SpecialPowers.pushPrefEnv({ set: [["midori.blocker.enabled", false]] });
    await MidoriBlockerService.setCustomFiltersText("||initial.example.invalid^\n");
    const url = "chrome://browser/content/preferences/dialogs/midoriBlockerCustomFilters.xhtml";
    const opened = BrowserTestUtils.domWindowOpenedAndLoaded(null, dialog => dialog.document.documentURI === url);
    window.openDialog(url, "_blank", "chrome,dialog=no,resizable,centerscreen");
    win = await opened;
    await TestUtils.waitForCondition(() => win.gMidoriBlockerCustomFilters?._textarea && !win.gMidoriBlockerCustomFilters._saving);
    const editor = win.gMidoriBlockerCustomFilters;
    is(editor._textarea.value, "||initial.example.invalid^\n");
    await MidoriBlockerService.setCustomFiltersText("||received.example.invalid^\n");
    await TestUtils.waitForCondition(() => editor._textarea.value === "||received.example.invalid^\n");
    is(editor._initialText, editor._textarea.value, "A pristine editor adopts the received version");
    editor._textarea.value = "||unsaved.example.invalid^\n";
    editor._textarea.dispatchEvent(new win.Event("input", { bubbles: true }));
    await MidoriBlockerService.setCustomFiltersText("||newer-received.example.invalid^\n");
    await TestUtils.waitForCondition(() => editor._changedElsewhere);
    is(editor._textarea.value, "||unsaved.example.invalid^\n", "A native update cannot erase an unsaved draft");
    is((await MidoriBlockerService.readCustomFiltersSnapshot()).text, "||newer-received.example.invalid^\n");
    const save = editor._dialog.getButton("accept");
    ok(save.getBoundingClientRect().width > 0 && !save.disabled, "The save control is rendered and available");
    const cancelled = PromptTestUtils.handleNextPrompt(win,
      { modalType: Services.prompt.MODAL_TYPE_WINDOW, promptType: "confirm" }, { buttonNumClick: 1 });
    save.click();
    await cancelled;
    await TestUtils.waitForCondition(() => !editor._saving);
    ok(!win.closed, "Cancelling replacement keeps the editor and draft open");
    is((await MidoriBlockerService.readCustomFiltersSnapshot()).text, "||newer-received.example.invalid^\n");
    const accepted = PromptTestUtils.handleNextPrompt(win,
      { modalType: Services.prompt.MODAL_TYPE_WINDOW, promptType: "confirm" }, { buttonNumClick: 0 });
    const closed = BrowserTestUtils.windowClosed(win);
    save.click();
    await Promise.all([accepted, closed]);
    is((await MidoriBlockerService.readCustomFiltersSnapshot()).text, "||unsaved.example.invalid^\n",
      "Only an explicit replacement publishes the draft over a newer received value");
  } finally {
    if (win && !win.closed) {
      const closed = BrowserTestUtils.windowClosed(win);
      win.close();
      await closed;
    }
    await MidoriBlockerService.setCustomFiltersText(previous.text);
    if (!previous.present) { await IOUtils.remove(ListStore.customFiltersPath(), { ignoreAbsent: true }); }
    while (gBrowser.tabs.length > 1) { await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1)); }
  }
});
