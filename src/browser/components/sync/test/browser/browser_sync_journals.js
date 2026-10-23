/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

function clickTestSyncJournalControl(control) {
  const bounds = control.getBoundingClientRect();
  ok(bounds.width > 0 && bounds.height > 0, "The Sync control is rendered before activation");
  control.click();
}

add_task(async function saved_copies_require_review_confirmation_and_preserve_account_boundaries() {
  const { createSyncJournalPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncJournalPanel.sys.mjs");
  const id = "07801c3e-90d8-4206-b432-da7b469a53ca";
  const token = "c11b3732-b392-4e93-9022-6ff572904411";
  const account = { snapshot: { status: "connected", generation: 1 } };
  const calls = [];
  let activePending = true;
  let changed = true;
  let otherDevice = false;
  let finishReview = null;
  const result = () => ({ id, token, status: otherDevice ? "other-device" : "recoverable", canRestore: !otherDevice, canProtect: true,
    collections: [{ name: "bookmarks", pending: 2, conflicts: 1, unfinished: 1 }] });
  const service = { account,
    async savedJournalPage(options) {
      calls.push("list");
      is(options.limit, 25);
      return { entries: [{ id, modified: 1700000000000, bytes: 8192, incomplete: false }], nextAfter: id };
    },
    async reviewSavedJournal(value) {
      is(value, id);
      calls.push("review");
      return finishReview ? new Promise(resolve => { finishReview = resolve; }) : result();
    },
    async restoreSavedJournal(value, preview) {
      Assert.deepEqual([value, preview], [id, token]);
      calls.push("restore");
      if (activePending) { throw Object.assign(new Error("sync_pending_operations"), { code: "sync_pending_operations" }); }
    },
    async deleteSavedJournal(value, preview) {
      Assert.deepEqual([value, preview], [id, token]);
      calls.push("delete");
      if (changed) { throw Object.assign(new Error("store_changed"), { code: "store_changed" }); }
    },
    async protectSavedJournal(value, preview) {
      Assert.deepEqual([value, preview], [id, token]);
      calls.push("protect");
    },
  };
  const view = createSyncJournalPanel(document, service);
  document.documentElement.append(view.section);
  const get = id => view.section.querySelector(`[data-l10n-id="${id}"]`);
  const settled = () => TestUtils.waitForCondition(() => !get("midori-sync-saved-load").disabled);
  const load = async () => { clickTestSyncJournalControl(get("midori-sync-saved-load")); await settled(); };
  const review = async () => { clickTestSyncJournalControl(get("midori-sync-saved-entry")); await settled(); };
  const choose = async choice => {
    clickTestSyncJournalControl(get(`midori-sync-saved-${choice}`));
    clickTestSyncJournalControl(get("midori-sync-saved-confirm"));
    await settled();
  };
  try {
    view.open();
    view.section.open = true;
    is(calls.length, 0, "Opening settings does not enumerate or decrypt saved copies");
    await load();
    await review();
    ok(get("midori-sync-saved-counts"));
    ok(get("midori-sync-saved-unfinished"));
    ok(!get("midori-sync-saved-restore").disabled);
    clickTestSyncJournalControl(get("midori-sync-saved-delete"));
    ok(!get("midori-sync-saved-confirm").parentElement.hidden);
    ok(get("midori-sync-saved-confirm-delete"), "Deletion explicitly mentions loss of unsent changes");
    clickTestSyncJournalControl(get("midori-sync-saved-cancel"));
    ok(!calls.includes("delete"));
    await choose("restore");
    ok(get("midori-sync-saved-active-pending"), "An unfinished current copy cannot be replaced");
    ok(get("midori-sync-saved-state-recoverable"), "Both reviewed versions remain available after rejection");
    activePending = false;
    await choose("restore");
    ok(get("midori-sync-saved-restored"));
    is(view.section.querySelector("#midori-sync-saved-journal-detail").childElementCount, 0);
    await load();
    otherDevice = true;
    await review();
    view.refresh();
    ok(get("midori-sync-saved-restore").disabled, "Another device's journal cannot be resumed directly");
    ok(get("midori-sync-saved-state-other-device"));
    clickTestSyncJournalControl(get("midori-sync-saved-protect"));
    ok(get("midori-sync-saved-confirm-protect"));
    clickTestSyncJournalControl(get("midori-sync-saved-cancel"));
    ok(!calls.includes("protect"));
    await choose("protect");
    ok(get("midori-sync-saved-protected"));
    await load();
    await review();
    await choose("delete");
    ok(get("midori-sync-saved-changed"));
    is(view.section.querySelector("#midori-sync-saved-journal-detail").childElementCount, 0,
      "Changed encrypted files require a fresh review before deletion");
    await review();
    changed = false;
    await choose("delete");
    ok(get("midori-sync-saved-deleted"));
    await load();
    finishReview = true;
    clickTestSyncJournalControl(get("midori-sync-saved-entry"));
    await TestUtils.waitForCondition(() => typeof finishReview === "function");
    account.snapshot.generation = 2;
    view.refresh();
    finishReview(result());
    await new Promise(resolve => executeSoon(resolve));
    is(view.section.querySelector("#midori-sync-saved-journal-detail").childElementCount, 0,
      "A late result from another account cannot expose saved-copy state");
  } finally {
    view.close();
    view.section.remove();
  }
});
