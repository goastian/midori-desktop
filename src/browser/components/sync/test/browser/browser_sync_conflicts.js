/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

function clickTestSyncConflictControl(control) {
  const bounds = control.getBoundingClientRect();
  ok(bounds.width > 0 && bounds.height > 0, "The Sync control is rendered before activation");
  control.click();
}

add_task(async function conflict_review_requires_confirmation_and_rejects_stale_versions() {
  const { createSyncConflictsPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncConflictsPanel.sys.mjs");
  const entry = { id: "06cd7f6f-c7dc-43d2-ad13-f112533591ea", revision: 1, remoteRevision: "2",
    canKeepLocal: true, canAcceptRemote: true, canMerge: true,
    summary: { deleted: false, fields: [{ name: "title", value: "<img src=fixture>" }] } };
  const account = { snapshot: { status: "connected", generation: 1, busy: false } };
  const requests = [];
  let stale = true;
  let unsupported = false;
  let finishPreview = null;
  const preview = { local: { deleted: false, fields: [{ name: "title", value: "Local title" }] },
    remote: entry.summary, localRevision: "a2bdc2b9-6f3f-45da-948b-416126359950" };
  const service = { account, keys: { snapshot: { status: "ready" } },
    syncCollectionsSnapshot: [{ name: "bookmarks", conflicts: 2 }],
    async conflictPage(name, options) {
      is(name, "bookmarks");
      is(options.limit, 25, "Conflict pages are bounded");
      ok(options.summaries, "Only the explicit review requests redacted summaries");
      return { entries: [entry, { ...entry, id: "1ae07d70-e530-4381-ae37-6312eb21e144", canKeepLocal: false }], nextAfter: entry.id };
    },
    async conflictPreview() {
      return finishPreview ? new Promise(resolve => { finishPreview = resolve; }) : preview;
    },
    async resolveConflict(name, options) {
      requests.push({ name, options });
      if (stale) { throw Object.assign(new Error("conflict_changed"), { code: "conflict_changed" }); }
      if (unsupported) { throw Object.assign(new Error("conflict_resolution_unavailable"), { code: "conflict_resolution_unavailable" }); }
      return { resolving: false, pending: true };
    },
  };
  const view = createSyncConflictsPanel(document, service);
  document.documentElement.append(view.section);
  const get = id => view.section.querySelector(`[data-l10n-id="${id}"]`);
  const settled = () => TestUtils.waitForCondition(() => !get("midori-sync-conflicts-load").disabled);
  const inspect = async () => {
    clickTestSyncConflictControl(view.section.querySelector("#midori-sync-conflict-list button"));
    await settled();
  };
  try {
    view.open();
    view.section.open = true;
    ok(!view.section.hidden);
    is(view.section.querySelectorAll("#midori-sync-conflict-list li").length, 0, "Opening settings does not automatically review personal data");
    clickTestSyncConflictControl(get("midori-sync-conflicts-load"));
    await settled();
    is(view.section.querySelectorAll("#midori-sync-conflict-list li").length, 2);
    ok(view.section.querySelectorAll("#midori-sync-conflict-list button")[1].disabled,
      "Background refresh cannot enable an unverified conflict");
    is(view.section.querySelectorAll("img").length, 0, "User titles render as text");
    await inspect();
    clickTestSyncConflictControl(get("midori-sync-conflicts-use-remote"));
    is(requests.length, 0, "Choosing a version requires an explicit second confirmation");
    ok(!get("midori-sync-conflicts-confirm").parentElement.hidden);
    clickTestSyncConflictControl(get("midori-sync-conflicts-cancel"));
    is(requests.length, 0);
    ok(get("midori-sync-conflicts-confirm").parentElement.hidden);
    clickTestSyncConflictControl(get("midori-sync-conflicts-use-remote"));
    clickTestSyncConflictControl(get("midori-sync-conflicts-confirm"));
    await settled();
    ok(get("midori-sync-conflicts-changed"), "A concurrent edit requires a fresh review");
    is(view.section.querySelector("#midori-sync-conflict-detail").childElementCount, 0);
    Assert.deepEqual(requests[0], { name: "bookmarks", options: {
      id: entry.id, revision: 1, remoteRevision: "2", localRevision: preview.localRevision, choice: "remote",
    } });
    stale = false;
    unsupported = true;
    await inspect();
    clickTestSyncConflictControl(get("midori-sync-conflicts-use-remote"));
    clickTestSyncConflictControl(get("midori-sync-conflicts-confirm"));
    await settled();
    ok(get("midori-sync-conflicts-choice-unavailable"), "An unsupported native choice explains how to continue");
    ok(view.section.querySelector("#midori-sync-conflict-detail").childElementCount > 0,
      "An unavailable choice keeps the reviewed versions visible");
    unsupported = false;
    await inspect();
    clickTestSyncConflictControl(get("midori-sync-conflicts-use-local"));
    clickTestSyncConflictControl(get("midori-sync-conflicts-confirm"));
    await settled();
    is(requests.length, 3);
    ok(get("midori-sync-conflicts-queued"), "Saving a decision reports queued work instead of claiming remote completion");
    clickTestSyncConflictControl(get("midori-sync-conflicts-load"));
    await settled();
    entry.canAcceptRemote = entry.canMerge = false;
    await inspect();
    view.refresh();
    ok(get("midori-sync-conflicts-use-remote").disabled);
    ok(get("midori-sync-conflicts-use-merge").disabled);
    ok(!get("midori-sync-conflicts-use-local").disabled,
      "Per-device snapshots offer only an operation that their native adapter supports");
    finishPreview = true;
    clickTestSyncConflictControl(view.section.querySelector("#midori-sync-conflict-list button"));
    await TestUtils.waitForCondition(() => typeof finishPreview === "function");
    account.snapshot.generation = 2;
    view.refresh();
    finishPreview(preview);
    await new Promise(resolve => executeSoon(resolve));
    is(view.section.querySelector("#midori-sync-conflict-detail").childElementCount, 0,
      "An old account's preview cannot populate the current settings");
    is(view.section.querySelector("#midori-sync-conflict-list").childElementCount, 0);
    service.keys.snapshot.status = "locked";
    view.refresh();
    ok(view.section.hidden, "Locking keys hides conflict details");
  } finally {
    view.close();
    view.section.remove();
  }
});
