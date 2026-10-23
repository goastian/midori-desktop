/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { TestUtils } = ChromeUtils.importESModule("resource://testing-common/TestUtils.sys.mjs");
const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
const { MidoriSyncBookmarks } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncBookmarks.sys.mjs");

function remoteBookmark(id, value) {
  return { id, deleted: value === null, ...(value === null ? {} : { value }) };
}

async function withNativeWriteInterleaving(name, interleave, task) {
  const original = PlacesUtils.withConnectionWrapper;
  let intercepted = false;
  PlacesUtils.withConnectionWrapper = async function(connectionName, callback) {
    if (connectionName === name && !intercepted) {
      intercepted = true;
      await interleave();
    }
    return original.call(this, connectionName, callback);
  };
  try {
    await task();
    Assert.ok(intercepted, "The competing write ran after the native operation read its input");
  } finally {
    PlacesUtils.withConnectionWrapper = original;
  }
}

add_task(async function native_bookmark_inventory_keeps_guids_tree_order_and_duplicate_urls() {
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const folder = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "Fixture ñ" });
  try {
    const first = await bookmarks.insert({ parentGuid: folder.guid, title: "Primero", url: "https://example.invalid/shared" });
    const separator = await bookmarks.insert({ parentGuid: folder.guid, type: bookmarks.TYPE_SEPARATOR });
    const second = await bookmarks.insert({ parentGuid: folder.guid, title: "Segundo", url: first.url });
    const nested = await bookmarks.insert({ parentGuid: folder.guid, type: bookmarks.TYPE_FOLDER, title: "Subcarpeta" });
    const duplicate = await bookmarks.insert({ parentGuid: nested.guid, title: "Otra ubicación", url: first.url });
    const page = await adapter.readPage(folder.guid, { limit: 2 });
    Assert.deepEqual(page.entries.map(entry => entry.id), [first.guid, separator.guid]);
    Assert.equal(page.nextIndex, 2);
    Assert.equal(page.entries[0].value.parentGuid, folder.guid);
    Assert.equal(page.entries[1].value.kind, "separator");
    Assert.equal(page.entries[1].value.url, null);
    const rest = await adapter.readPage(folder.guid, { index: page.nextIndex, limit: 3 });
    Assert.deepEqual(rest.entries.map(entry => entry.id), [second.guid, nested.guid]);
    Assert.equal(rest.nextIndex, null);
    Assert.equal(rest.entries[1].value.kind, "folder");
    const elsewhere = await adapter.read(duplicate.guid);
    Assert.equal(elsewhere.url, page.entries[0].value.url, "Equal URLs remain distinct GUID records in different folders");
    Assert.equal(elsewhere.parentGuid, nested.guid);
    Assert.equal((await adapter.read(folder.guid)).title, "Fixture ñ");
    Assert.equal(await adapter.read("missing_____"), null);
  } finally {
    adapter.close();
    await bookmarks.remove(folder.guid);
  }
});

add_task(async function plans_native_edits_in_rust_without_overwriting_places() {
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const item = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, title: "Base ñ", url: "https://example.invalid/base" });
  try {
    const base = await adapter.read(item.guid);
    await bookmarks.update({ guid: item.guid, title: "Local" });
    const remote = { ...base, url: "https://example.invalid/remote" };
    const plan = await adapter.plan({ id: item.guid, deleted: false, value: remote }, { deleted: false, value: base });
    Assert.equal(plan.decision.status, "apply");
    Assert.equal(plan.decision.value.title, "Local");
    Assert.equal(plan.decision.value.url, remote.url);
    Assert.equal((await bookmarks.fetch(item.guid)).url.href, base.url, "Planning does not overwrite Places");
    const conflict = await adapter.plan({ id: item.guid, deleted: false, value: { ...remote, title: "Remote" } }, { deleted: false, value: base });
    Assert.equal(conflict.decision.status, "conflict");
    Assert.deepEqual(conflict.decision.fields, ["title"]);
    const deletion = await adapter.plan({ id: item.guid, deleted: true }, { deleted: false, value: base });
    Assert.equal(deletion.decision.reason, "deletion_edit");
    Assert.equal((await bookmarks.fetch(item.guid)).title, "Local");
  } finally {
    adapter.close();
    await bookmarks.remove(item.guid);
  }
});

add_task(async function native_roots_schema_limits_and_closed_adapters_are_rejected() {
  const adapter = new MidoriSyncBookmarks();
  const value = { version: 1, kind: "bookmark", parentGuid: "toolbar_____", index: 0,
    title: "Fixture", url: "https://example.invalid/", dateAdded: 1000 };
  try {
    await Assert.rejects(adapter.read("toolbar_____"), /invalid_record/);
    await Assert.rejects(adapter.readPage("tags________"), /bookmark_outside_roots/);
    await Assert.rejects(adapter.readPage("toolbar_____", { limit: 101 }), /invalid_bookmark_query/);
    await Assert.rejects(adapter.validate("bookmark____", { ...value, index: 1.5 }), /invalid_record/);
    await Assert.rejects(adapter.validate("bookmark____", { ...value, url: "https://[broken/" }), /invalid_record/);
    await Assert.rejects(adapter.validate("bookmark____", { ...value, unexpected: true }), /invalid_record/);
    await Assert.rejects(adapter.validate("bookmark____", { ...value, title: String.fromCodePoint(0x10400).repeat(2049) }), /invalid_record/);
    const pending = adapter.validate("bookmark____", value);
    adapter.close();
    await Assert.rejects(pending, error => error.result === Cr.NS_ERROR_ABORT || error.code === "cancelled");
    await Assert.rejects(adapter.read("bookmark____"), /cancelled/);
  } finally {
    adapter.close();
  }
});

add_task(async function applies_tree_creations_moves_merges_and_replays_through_places() {
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const root = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "Apply fixture" });
  const folderId = "syncfolder__";
  const firstId = "syncfirst___";
  const secondId = "syncsecond__";
  const separatorId = "syncsep_____";
  const folder = { version: 1, kind: "folder", parentGuid: root.guid, index: 0,
    title: "Carpeta ñ", url: null, dateAdded: 1000 };
  const first = { ...folder, kind: "bookmark", parentGuid: folderId,
    title: "Primero", url: "https://example.invalid/shared" };
  try {
    Assert.equal((await adapter.apply(remoteBookmark(firstId, first))).status, "deferred", "A child waits for its parent");
    Assert.equal((await adapter.apply(remoteBookmark(folderId, folder))).status, "applied");
    Assert.equal((await adapter.apply(remoteBookmark(firstId, first))).status, "applied");
    Assert.equal((await adapter.apply(remoteBookmark(firstId, first))).status, "applied", "A replay keeps the existing GUID");
    const second = { ...first, index: 2, title: "Segundo" };
    Assert.deepEqual(await adapter.apply(remoteBookmark(secondId, second)), { status: "deferred", reason: "bookmark_position_pending" });
    const separator = { ...folder, kind: "separator", parentGuid: folderId, index: 1, title: "" };
    Assert.equal((await adapter.apply(remoteBookmark(separatorId, separator))).status, "applied");
    Assert.equal((await adapter.apply(remoteBookmark(secondId, second))).status, "applied");
    Assert.deepEqual((await adapter.readPage(folderId)).entries.map(entry => entry.id), [firstId, separatorId, secondId]);
    const moved = { ...second, index: 0 };
    Assert.equal((await adapter.apply(remoteBookmark(secondId, moved), remoteBookmark(secondId, second))).status, "applied");
    Assert.deepEqual((await adapter.readPage(folderId)).entries.map(entry => entry.id), [secondId, firstId, separatorId]);
    const base = await adapter.read(firstId);
    await bookmarks.update({ guid: firstId, title: "Edición local" });
    const remote = { ...base, url: "https://example.invalid/remote" };
    Assert.equal((await adapter.apply(remoteBookmark(firstId, remote), remoteBookmark(firstId, base))).status, "applied");
    const result = await adapter.read(firstId);
    Assert.equal(result.title, "Edición local");
    Assert.equal(result.url, remote.url);
    const elsewhere = { ...result, parentGuid: root.guid, index: 1 };
    Assert.equal((await adapter.apply(remoteBookmark(firstId, elsewhere), remoteBookmark(firstId, result))).status, "applied");
    Assert.equal((await adapter.read(firstId)).parentGuid, root.guid);
    Assert.equal((await adapter.readPage(folderId)).entries.length, 2);
  } finally {
    adapter.close();
    await bookmarks.remove(root.guid);
  }
});

add_task(async function remote_deletion_preserves_edits_and_nonempty_folders() {
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const root = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "Deletion fixture" });
  try {
    const child = await bookmarks.insert({ parentGuid: root.guid, url: "https://example.invalid/child", title: "Base" });
    const base = await adapter.read(child.guid);
    await bookmarks.update({ guid: child.guid, title: "Local" });
    Assert.equal((await adapter.apply(remoteBookmark(child.guid, null), remoteBookmark(child.guid, base))).reason, "deletion_edit");
    const folderBase = await adapter.read(root.guid);
    Assert.deepEqual(await adapter.apply(remoteBookmark(root.guid, null), remoteBookmark(root.guid, folderBase)),
      { status: "deferred", reason: "bookmark_folder_not_empty" });
    Assert.equal((await bookmarks.fetch(child.guid)).title, "Local", "A remote folder deletion never recursively erases local children");
    const childBase = await adapter.read(child.guid);
    Assert.equal((await adapter.apply(remoteBookmark(child.guid, null), remoteBookmark(child.guid, childBase))).status, "applied");
    Assert.equal((await adapter.apply(remoteBookmark(child.guid, null), remoteBookmark(child.guid, childBase))).status, "applied");
    Assert.equal((await adapter.apply(remoteBookmark(root.guid, null), remoteBookmark(root.guid, folderBase))).status, "applied");
    Assert.equal(await bookmarks.fetch(root.guid), null);
  } finally {
    adapter.close();
    if (await bookmarks.fetch(root.guid)) {
      await bookmarks.remove(root.guid);
    }
  }
});

add_task(async function conditional_writes_detect_changes_after_native_reads() {
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const root = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "Race fixture" });
  try {
    const item = await bookmarks.insert({ parentGuid: root.guid, title: "Base", url: "https://example.invalid/base" });
    const base = await adapter.read(item.guid);
    await withNativeWriteInterleaving("Bookmarks.sys.mjs: update",
      () => bookmarks.update({ guid: item.guid, title: "Concurrent edit" }),
      () => Assert.rejects(adapter.apply(remoteBookmark(item.guid, { ...base, url: "https://example.invalid/remote" }), remoteBookmark(item.guid, base)), /bookmark_changed/));
    Assert.equal((await bookmarks.fetch(item.guid)).title, "Concurrent edit");
    Assert.equal((await bookmarks.fetch(item.guid)).url.href, base.url);

    const current = await adapter.read(item.guid);
    await withNativeWriteInterleaving("Bookmarks.sys.mjs: removeBookmarks",
      () => bookmarks.update({ guid: item.guid, title: "Concurrent deletion edit" }),
      () => Assert.rejects(adapter.apply(remoteBookmark(item.guid, null), remoteBookmark(item.guid, current)), /bookmark_changed/));
    Assert.equal((await bookmarks.fetch(item.guid)).title, "Concurrent deletion edit");

    const nextId = "syncrace____";
    const next = { ...base, index: 1, title: "Remote insertion" };
    await withNativeWriteInterleaving("Bookmarks.sys.mjs: insertBookmark",
      () => bookmarks.insert({ parentGuid: root.guid, title: "Concurrent sibling", url: "https://example.invalid/sibling" }),
      () => Assert.rejects(adapter.apply(remoteBookmark(nextId, next)), /bookmark_position_changed/));
    Assert.equal(await bookmarks.fetch(nextId), null);
    Assert.equal((await adapter.readPage(root.guid)).entries.length, 2);
  } finally {
    adapter.close();
    await bookmarks.remove(root.guid);
  }
});

add_task(async function conditional_folder_deletion_rechecks_children_and_close_cancels_writes() {
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const root = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "Cancellation fixture" });
  try {
    const base = await adapter.read(root.guid);
    await withNativeWriteInterleaving("Bookmarks.sys.mjs: removeBookmarks",
      () => bookmarks.insert({ parentGuid: root.guid, title: "Concurrent child", url: "https://example.invalid/child" }),
      () => adapter.apply(remoteBookmark(root.guid, null), remoteBookmark(root.guid, base)).then(
        outcome => Assert.deepEqual(outcome, { status: "deferred", reason: "bookmark_folder_not_empty" }),
        error => Assert.equal(error.code, "bookmark_changed", "A changed parent timestamp also rejects the stale deletion")
      ));
    Assert.deepEqual(await adapter.apply(remoteBookmark(root.guid, null), remoteBookmark(root.guid, base)),
      { status: "deferred", reason: "bookmark_folder_not_empty" });
    Assert.equal((await adapter.readPage(root.guid)).entries.length, 1);
    const next = { ...base, kind: "bookmark", parentGuid: root.guid, index: 1, url: "https://example.invalid/cancelled" };
    await withNativeWriteInterleaving("Bookmarks.sys.mjs: insertBookmark", () => adapter.close(),
      () => Assert.rejects(adapter.apply(remoteBookmark("synccancel__", next)), /cancelled/));
    Assert.equal(await bookmarks.fetch("synccancel__"), null);
  } finally {
    adapter.close();
    await bookmarks.remove(root.guid);
  }
});

add_task(async function closing_after_sql_mutation_rolls_back_the_transaction() {
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const item = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, title: "Before rollback", url: "https://example.invalid/rollback" });
  const original = PlacesUtils.withConnectionWrapper;
  let mutated = false;
  try {
    const base = await adapter.read(item.guid);
    PlacesUtils.withConnectionWrapper = function(name, callback) {
      return original.call(this, name, db => callback(name === "Bookmarks.sys.mjs: update" ? new Proxy({}, {
        get(_target, property) {
          if (property === "executeCached") {
            return async function(sql, ...args) {
              const result = await db.executeCached(sql, ...args);
              if (/^\s*UPDATE moz_bookmarks\b/.test(sql)) {
                mutated = true;
                adapter.close();
              }
              return result;
            };
          }
          const value = Reflect.get(db, property, db);
          return typeof value === "function" ? value.bind(db) : value;
        },
      }) : db));
    };
    await Assert.rejects(adapter.apply(remoteBookmark(item.guid, { ...base, title: "Must roll back" }), remoteBookmark(item.guid, base)), /cancelled/);
    Assert.ok(mutated, "The SQL write completed before cancellation");
    const stored = await bookmarks.fetch(item.guid);
    Assert.equal(stored.title, base.title, "The real Places transaction rolled back the SQL update");
    Assert.equal(stored.lastModified.getTime(), item.lastModified.getTime());
  } finally {
    PlacesUtils.withConnectionWrapper = original;
    adapter.close();
    await bookmarks.remove(item.guid);
  }
});

add_task(async function native_adapter_requires_conditional_api_and_rejects_descendant_moves() {
  const unavailable = new MidoriSyncBookmarks({ bookmarks: {} });
  try {
    await Assert.rejects(unavailable.apply(remoteBookmark("missing_____", null)), /bookmarks_api_unavailable/);
  } finally {
    unavailable.close();
  }
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const root = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "Cycle fixture" });
  try {
    const child = await bookmarks.insert({ parentGuid: root.guid, type: bookmarks.TYPE_FOLDER, title: "Child" });
    const base = await adapter.read(root.guid);
    Assert.deepEqual(await adapter.apply(remoteBookmark(root.guid, { ...base, parentGuid: child.guid, index: 0 }), remoteBookmark(root.guid, base)),
      { status: "conflict", reason: "bookmark_outside_roots" });
    Assert.equal((await bookmarks.fetch(root.guid)).parentGuid, bookmarks.unfiledGuid);
    Assert.equal((await bookmarks.fetch(child.guid)).parentGuid, root.guid);
  } finally {
    adapter.close();
    await bookmarks.remove(root.guid);
  }
});

add_task(async function urls_use_places_normalization_for_replay_and_deletion() {
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const root = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "URL fixture" });
  const id = "syncurl_____";
  const value = { version: 1, kind: "bookmark", parentGuid: root.guid, index: 0,
    title: "Normalized URL", url: "https://EXAMPLE.invalid:443", dateAdded: 1000 };
  try {
    Assert.equal((await adapter.apply(remoteBookmark(id, value))).status, "applied");
    Assert.equal((await adapter.read(id)).url, "https://example.invalid/");
    Assert.equal((await adapter.apply(remoteBookmark(id, value))).status, "applied");
    Assert.equal((await adapter.readPage(root.guid)).entries.length, 1);
    await Assert.rejects(adapter.plan(remoteBookmark(id, null), { id, deleted: false }), /invalid_record/);
    Assert.equal((await adapter.apply(remoteBookmark(id, null), remoteBookmark(id, value))).status, "applied");
    Assert.equal(await bookmarks.fetch(id), null);
  } finally {
    adapter.close();
    await bookmarks.remove(root.guid);
  }
});

add_task(async function prepared_deletions_project_sibling_positions_without_changing_remote_records() {
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const root = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "Position fixture" });
  try {
    const first = await bookmarks.insert({ parentGuid: root.guid, title: "First", url: "https://example.invalid/first" });
    const separator = await bookmarks.insert({ parentGuid: root.guid, type: bookmarks.TYPE_SEPARATOR });
    const last = await bookmarks.insert({ parentGuid: root.guid, title: "Last", url: "https://example.invalid/last" });
    const firstBase = await adapter.read(first.guid);
    const separatorBase = await adapter.read(separator.guid);
    const lastBase = await adapter.read(last.guid);
    const plan = await adapter.prepare(remoteBookmark(first.guid, null), remoteBookmark(first.guid, firstBase));
    Assert.equal(plan.decision.status, "apply");
    Assert.deepEqual(plan.effects, { from: { parentGuid: root.guid, index: 0 }, to: null });
    Assert.ok(await bookmarks.fetch(first.guid), "Preparing an intent leaves Places unchanged");
    const outcome = await adapter.applyPrepared(plan);
    Assert.equal(outcome.status, "applied");
    Assert.deepEqual(await adapter.applyPrepared(plan), outcome, "A replay returns the original position effects");
    const positions = await adapter.project(first.guid, outcome.effects, [
      { id: separator.guid, position: adapter.positionOf(separator.guid, separatorBase) },
      { id: last.guid, position: adapter.positionOf(last.guid, lastBase) },
    ]);
    Assert.deepEqual(positions.map(item => item.position.index), [0, 1]);
    Assert.equal(separatorBase.index, 1, "Projection preserves the remote record used as the merge base");
    const deletion = await adapter.prepare(remoteBookmark(separator.guid, null), remoteBookmark(separator.guid, separatorBase),
      { position: positions[0].position });
    Assert.equal(deletion.decision.status, "apply", "A mechanical shift is not a local edit");
    Assert.equal((await adapter.applyPrepared(deletion)).status, "applied");
    Assert.deepEqual((await adapter.readPage(root.guid)).entries.map(entry => entry.id), [last.guid]);
    Assert.equal((await adapter.read(last.guid)).index, 0);
  } finally {
    adapter.close();
    await bookmarks.remove(root.guid);
  }
});

add_task(async function prepared_deletions_preserve_user_moves_after_a_projected_shift() {
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const root = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "User move fixture" });
  try {
    const first = await bookmarks.insert({ parentGuid: root.guid, title: "First", url: "https://example.invalid/first" });
    const separator = await bookmarks.insert({ parentGuid: root.guid, type: bookmarks.TYPE_SEPARATOR });
    const last = await bookmarks.insert({ parentGuid: root.guid, title: "Last", url: "https://example.invalid/last" });
    const firstBase = await adapter.read(first.guid);
    const separatorBase = await adapter.read(separator.guid);
    const deletion = await adapter.prepare(remoteBookmark(first.guid, null), remoteBookmark(first.guid, firstBase));
    await adapter.applyPrepared(deletion);
    const [projected] = await adapter.project(first.guid, deletion.effects,
      [{ id: separator.guid, position: adapter.positionOf(separator.guid, separatorBase) }]);
    await bookmarks.update({ guid: separator.guid, index: 1 });
    const plan = await adapter.prepare(remoteBookmark(separator.guid, null), remoteBookmark(separator.guid, separatorBase),
      { position: projected.position });
    Assert.equal(plan.decision.reason, "deletion_edit", "Moving back to the old remote index is still a user edit");
    Assert.equal(plan.effects, null);
    Assert.equal((await adapter.applyPrepared(plan)).status, "conflict");
    Assert.deepEqual((await adapter.readPage(root.guid)).entries.map(entry => entry.id), [last.guid, separator.guid]);
  } finally {
    adapter.close();
    await bookmarks.remove(root.guid);
  }
});

add_task(async function prepared_writes_replay_once_and_reject_intervening_edits() {
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const root = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "Prepared replay fixture" });
  try {
    const sibling = await bookmarks.insert({ parentGuid: root.guid, title: "Sibling", url: "https://example.invalid/sibling" });
    const id = "syncprepare_";
    const value = { version: 1, kind: "bookmark", parentGuid: root.guid, index: 0,
      title: "Prepared", url: "https://example.invalid/prepared", dateAdded: 1000 };
    const plan = await adapter.prepare(remoteBookmark(id, value));
    const outcome = await adapter.applyPrepared(plan);
    Assert.equal(outcome.status, "applied");
    Assert.deepEqual(outcome.effects, { from: null, to: { parentGuid: root.guid, index: 0 } });
    Assert.deepEqual(await adapter.applyPrepared(plan), outcome);
    Assert.deepEqual((await adapter.readPage(root.guid)).entries.map(entry => entry.id), [id, sibling.guid]);
    await bookmarks.update({ guid: id, title: "Edited after application" });
    Assert.deepEqual(await adapter.applyPrepared(plan), { status: "conflict", reason: "application_state_changed" });
    Assert.equal((await bookmarks.fetch(id)).title, "Edited after application");

    const base = await adapter.read(id);
    const update = await adapter.prepare(remoteBookmark(id, { ...base, url: "https://example.invalid/updated" }), remoteBookmark(id, base));
    await withNativeWriteInterleaving("Bookmarks.sys.mjs: update",
      () => bookmarks.update({ guid: id, title: "Edited during application" }),
      () => adapter.applyPrepared(update).then(result => Assert.deepEqual(result, { status: "deferred", reason: "bookmark_changed" })));
    Assert.equal((await bookmarks.fetch(id)).title, "Edited during application");
    Assert.equal((await bookmarks.fetch(id)).url.href, base.url);
    await Assert.rejects(adapter.project(id, { from: null, to: null }, []), /invalid_record/);
    await Assert.rejects(adapter.prepare(remoteBookmark(id, null), remoteBookmark(id, base),
      { position: { parentGuid: bookmarks.toolbarGuid, index: 0 } }), /invalid_record/);
  } finally {
    adapter.close();
    await bookmarks.remove(root.guid);
  }
});

add_task(async function an_explicit_remote_conflict_resumes_native_order_projection_before_publication() {
  const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
  const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
  const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
  const bookmarks = PlacesUtils.bookmarks;
  const folder = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "Resolution fixture" });
  let adapter = new MidoriSyncBookmarks();
  let engine;
  try {
    const first = await bookmarks.insert({ parentGuid: folder.guid, title: "Local title", url: "https://resolution.invalid/first" });
    const second = await bookmarks.insert({ parentGuid: folder.guid, title: "Second", url: "https://resolution.invalid/second" });
    const original = await adapter.read(first.guid);
    const sibling = await adapter.read(second.guid);
    const generation = uuid();
    const crypto = { epoch: uuid(), revision: "1" };
    const remote = { id: first.guid, revision: "2", deleted: false, payload: "synthetic authenticated fixture", ttl: null,
      value: { ...original, title: "Remote title", index: 1 } };
    const conflictId = uuid();
    const rows = new Map();
    const add = (kind, id, value) => rows.set(id, { id, collection: "bookmarks", kind, revision: 1, value });
    add("metadata", syncJournalEntryId("bookmarks", "metadata", "collection-state-v1"), {
      version: 3, generation, cursor: "fixture-cursor", sequence: "2", fence: null, inbox: null, index: 0, ack: null,
      initialized: true, pending: 0, conflicts: 1, deferred: 0, activeApplication: null, applicationAfter: null,
    });
    for (const record of [remote, { ...remote, id: second.guid, revision: "1", value: sibling }]) {
      add("record", syncJournalEntryId("bookmarks", "record", record.id), {
        version: 1, id: record.id, remote: record, pending: null, blocked: record.id === first.guid, applying: null,
      });
    }
    add("conflict", conflictId, { version: 1, source: "download", change: { sequence: "2", record: remote },
      base: { ...remote, revision: "1", value: original }, outcome: { status: "conflict", reason: "bookmark_fields_diverged" } });
    let failPublication = true;
    const journal = {
      async read(id) { return structuredClone(rows.get(id) ?? null); },
      async list(collection, kind, { after = null, limit = 100 } = {}) {
        return structuredClone([...rows.values()].filter(row => row.collection === collection && row.kind === kind && (!after || row.id > after))
          .sort((left, right) => left.id.localeCompare(right.id)).slice(0, limit));
      },
      async commit(changes) {
        if (failPublication && changes.some(change => change.kind === "outbox")) {
          throw Object.assign(new Error("disk_full"), { code: "disk_full" });
        }
        for (const change of changes) { Assert.equal(rows.get(change.id)?.revision ?? 0, change.expectedRevision); }
        for (const change of changes) {
          if (change.deleted) { rows.delete(change.id); }
          else { rows.set(change.id, structuredClone({ ...change, revision: change.expectedRevision + 1 })); }
        }
      },
    };
    let uploads = 0;
    let requests = 0;
    const create = () => new MidoriSyncCollection({ collection: "bookmarks", journal, adapter,
      keys: { snapshot: { status: "ready", custody: "server" }, writeContext: crypto,
        async sealRecord() { return { crypto, payload: "synthetic encrypted operation" }; } },
      entryId: syncJournalEntryId, createId: uuid,
      async request(path, { body }) {
        ++requests;
        if (path.endsWith("/operations")) {
          ++uploads;
          return { data: { generation, results: body.operations.map((operation, index) => ({ index, id: operation.id,
            operation_id: operation.operation_id, status: "applied", revision: "3" })) } };
        }
        if (path.endsWith("/ack")) { return { data: { generation, acknowledged_sequence: "2" } }; }
        return { data: { generation, changes: [], has_more: false, snapshot_sequence: "2", next_cursor: "fixture-cursor" } };
      },
    });
    engine = create();
    const [conflict] = (await engine.conflictPage()).entries;
    await Assert.rejects(engine.resolveConflict({ ...conflict, choice: "remote" }), /disk_full/);
    Assert.equal((await bookmarks.fetch(first.guid)).title, "Remote title");
    Assert.equal((await bookmarks.fetch(first.guid)).index, 1);
    Assert.equal((await bookmarks.fetch(second.guid)).index, 0);
    Assert.ok(rows.has(conflictId), "The conflict stays durable until a new operation is saved");
    Assert.equal(uploads, 0);
    engine.close();
    adapter = new MidoriSyncBookmarks();
    engine = create();
    failPublication = false;
    Assert.deepEqual(await engine.recoverLocal(), { captureReady: true, more: false });
    Assert.equal(requests, 0, "Native application and position recovery use no HTTP while offline");
    await engine.run();
    Assert.equal(uploads, 1);
    Assert.equal(engine.snapshot.conflicts, 0);
    Assert.equal(engine.snapshot.deferred, 0);
    Assert.equal((await bookmarks.fetch(second.guid)).index, 0, "Reopening cannot shift the sibling twice");
    const mirror = await engine.record(second.guid);
    Assert.equal(mirror.remote.value.index, 1, "The authenticated server snapshot is preserved");
    Assert.equal(mirror.position.index, 0, "The native shift has a durable local projection");
  } finally {
    engine?.close();
    adapter.close();
    await bookmarks.remove(folder.guid);
  }
});

add_task(async function capture_inventory_and_notifications_follow_real_places_changes() {
  const { MidoriSyncBookmarkTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncBookmarkTracker.sys.mjs");
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const root = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "Capture fixture" });
  const mirror = new Map();
  const captured = [];
  const events = [];
  let hints = 0;
  const unsubscribe = adapter.observe(event => events.push(event));
  const engine = {
    async capture(id) {
      const value = await adapter.read(id);
      if (adapter.matchesLocal(id, value, mirror.get(id) ?? null, null)) {
        return { status: "unchanged" };
      }
      mirror.set(id, value);
      captured.push({ id, value });
      return { status: "queued", operationId: Services.uuid.generateUUID().toString().slice(1, -1) };
    },
    async capturePage({ after, limit }) {
      const ids = [...mirror.keys()].sort().filter(id => after === null || id > after).slice(0, limit);
      const results = [];
      for (const id of ids) {
        results.push({ id, ...await this.capture(id) });
      }
      return { results, nextAfter: ids.length === limit ? ids.at(-1) : null };
    },
  };
  const create = () => new MidoriSyncBookmarkTracker({ engine, adapter, roots: [root.guid],
    onChange: () => { ++hints; } });
  const drain = async tracker => {
    for (let run = 0; run < 100; ++run) {
      const result = await tracker.run({ limit: 2 });
      Assert.ok(result.checked <= 2, "Each capture slice respects its work budget");
      if (!tracker.snapshot.more) {
        return;
      }
    }
    Assert.ok(false, "The finite inventory should finish");
  };
  let tracker;
  try {
    const folder = await bookmarks.insert({ parentGuid: root.guid, type: bookmarks.TYPE_FOLDER, title: "Folder" });
    const first = await bookmarks.insert({ parentGuid: folder.guid, title: "First", url: "https://example.invalid/shared" });
    const second = await bookmarks.insert({ parentGuid: folder.guid, title: "Second", url: first.url });
    tracker = create();
    await drain(tracker);
    Assert.equal(mirror.get(first.guid).url, mirror.get(second.guid).url);
    Assert.notEqual(first.guid, second.guid, "The inventory preserves duplicate URLs as separate records");
    const initialCount = captured.length;
    tracker.requestInventory();
    await drain(tracker);
    Assert.equal(captured.length, initialCount, "An unchanged real inventory creates no new operations");
    await bookmarks.update({ guid: first.guid, title: "Local edit", parentGuid: root.guid, index: 0 });
    Assert.ok(tracker.snapshot.dirty > 0, "Places delivered the edit to the active tracker");
    Assert.ok(hints > 0, "A Places change wakes the background collection scheduler");
    await drain(tracker);
    Assert.equal(mirror.get(first.guid).title, "Local edit");
    Assert.equal(mirror.get(first.guid).parentGuid, root.guid);
    Assert.equal(mirror.get(second.guid).index, 0, "The old parent's sibling shift is captured");
    Assert.ok(events.some(event => event.id === first.guid && event.parents.includes(folder.guid) && event.parents.includes(root.guid)), "A move reports both affected parents");
    tracker.close();
    await bookmarks.remove(second.guid);
    const missed = await bookmarks.insert({ parentGuid: folder.guid, title: "While closed", url: "https://example.invalid/missed" });
    tracker = create();
    await drain(tracker);
    Assert.equal(mirror.get(second.guid), null, "A new inventory discovers a deletion missed by the listener");
    Assert.equal(mirror.get(missed.guid).title, "While closed");
    tracker.close();
    unsubscribe();
    const delivered = events.length;
    await bookmarks.update({ guid: missed.guid, title: "After close" });
    Assert.equal(events.length, delivered, "Unsubscribing releases the Places observer");
    Assert.equal(tracker.snapshot.dirty, 0);
  } finally {
    tracker?.close();
    unsubscribe();
    adapter.close();
    await bookmarks.remove(root.guid);
  }
});

add_task(async function tags_and_keywords_travel_with_the_bookmark_and_merge_as_sets() {
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const root = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "Label fixture" });
  const id = "synclabeled_";
  const url = "https://example.invalid/labels";
  const seen = [];
  const unsubscribe = adapter.observe(event => seen.push(event.id));
  const value = { version: 1, kind: "bookmark", parentGuid: root.guid, index: 0, title: "Labelled", url, dateAdded: 1000,
    tags: ["alpha", "zeta"], keyword: "golabel" };
  try {
    Assert.equal((await adapter.apply(remoteBookmark(id, value))).status, "applied");
    const created = await adapter.read(id);
    Assert.deepEqual(created.tags, ["alpha", "zeta"], "Tags are created in Places with the bookmark");
    Assert.equal(created.keyword, "golabel");
    Assert.deepEqual(PlacesUtils.tagging.getTagsForURI(Services.io.newURI(url)).sort(), ["alpha", "zeta"]);
    Assert.equal((await PlacesUtils.keywords.fetch("golabel")).url.href, url);
    Assert.equal((await adapter.apply(remoteBookmark(id, value), remoteBookmark(id, value))).status, "applied",
      "A replay changes nothing");

    PlacesUtils.tagging.tagURI(Services.io.newURI(url), ["local"]);
    const remote = { ...created, tags: ["alpha", "beta"] };
    Assert.equal((await adapter.apply(remoteBookmark(id, remote), remoteBookmark(id, created))).status, "applied");
    Assert.deepEqual((await adapter.read(id)).tags, ["alpha", "beta", "local"],
      "A remote addition and removal merge with a concurrent local tag");

    const renamed = { ...(await adapter.read(id)), keyword: "newlabel" };
    Assert.equal((await adapter.apply(remoteBookmark(id, renamed), remoteBookmark(id, created))).status, "applied");
    Assert.equal((await adapter.read(id)).keyword, "newlabel");
    Assert.equal(await PlacesUtils.keywords.fetch("golabel"), null, "The replaced keyword is released");

    await TestUtils.waitForCondition(() => seen.includes(id), "A tag change is reported for its bookmark");
    const count = seen.length;
    PlacesUtils.tagging.untagURI(Services.io.newURI(url), ["beta"]);
    await TestUtils.waitForCondition(() => seen.length > count, "Removing a tag is also captured");

    const folderValue = { version: 1, kind: "folder", parentGuid: root.guid, index: 1, title: "Folder", url: null,
      dateAdded: 1000, tags: ["nope"] };
    await Assert.rejects(adapter.validate("syncfolder2_", folderValue), /invalid_record/, "Only bookmarks carry labels");
    await Assert.rejects(adapter.validate(id, { ...value, tags: ["b", "a"] }), /invalid_record/, "Tags are canonical");
  } finally {
    unsubscribe();
    adapter.close();
    PlacesUtils.tagging.untagURI(Services.io.newURI(url), null);
    await bookmarks.remove(root.guid);
  }
});

add_task(async function a_stuck_parent_or_position_is_repaired_deterministically() {
  const bookmarks = PlacesUtils.bookmarks;
  const adapter = new MidoriSyncBookmarks();
  const root = await bookmarks.insert({ parentGuid: bookmarks.unfiledGuid, type: bookmarks.TYPE_FOLDER, title: "Repair fixture" });
  const value = { version: 1, kind: "bookmark", parentGuid: "missing_____", index: 5, title: "Orphan",
    url: "https://example.invalid/orphan", dateAdded: 1000 };
  try {
    const repaired = await adapter.repair(value, "bookmark_parent_missing", "syncorphan__");
    Assert.equal(repaired.parentGuid, bookmarks.unfiledGuid, "An orphan goes to the unfiled bookmarks");
    Assert.equal(repaired.title, "Orphan");
    Assert.equal((await adapter.apply(remoteBookmark("syncorphan__", repaired))).status, "applied");
    Assert.equal((await adapter.read("syncorphan__")).parentGuid, bookmarks.unfiledGuid);
    const crowded = { ...value, parentGuid: root.guid, index: 9 };
    const clamped = await adapter.repair(crowded, "bookmark_position_pending", "syncclamped_");
    Assert.equal(clamped.index, 0, "A position past the siblings is clamped to the end");
    Assert.equal(await adapter.repair(value, "bookmark_changed", "syncorphan__"), null, "Other reasons are never repaired");
    await bookmarks.remove("syncorphan__");
  } finally {
    adapter.close();
    await bookmarks.remove(root.guid);
  }
});
