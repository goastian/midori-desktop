/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const encoder = new TextEncoder();
const dayStartUsec = 86400000000 * 20000;
const { TestUtils } = ChromeUtils.importESModule("resource://testing-common/TestUtils.sys.mjs");
const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
const { MidoriSyncHistory, historyRecordId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncHistory.sys.mjs");
const { MidoriSyncHistoryTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncHistoryTracker.sys.mjs");

async function createHistoryIdentity() {
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  registerCleanupFunction(() => crypto.close());
  const scope = JSON.stringify(["https://sync.example.invalid/", "https://accounts.example.invalid/", "history-fixture"]);
  const handle = await crypto.generateNativeKey(scope);
  return { crypto, handle, scope, deriveRecordId: (collection, bytes) =>
    crypto.deriveNativeRecordId(handle, collection, bytes) };
}

async function createHistory() {
  const identity = await createHistoryIdentity();
  return new MidoriSyncHistory({ deriveRecordId: identity.deriveRecordId });
}

function page(visits = [{ atUsec: dayStartUsec + 101, transition: 1, count: 1 }]) {
  return { version: 1, url: "https://example.invalid/page", title: "Page", dayStartUsec, visits };
}

async function process(model, request) {
  const bytes = encoder.encode(JSON.stringify(request));
  try {
    return JSON.parse(await model.processHistory(bytes));
  } finally {
    bytes.fill(0);
  }
}

add_task(async function native_history_model_validates_and_merges_visits() {
  const model = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  try {
    const base = page();
    const local = page([...base.visits, { atUsec: dayStartUsec + 102, transition: 2, count: 1 }]);
    const remote = page([...base.visits, { atUsec: dayStartUsec + 103, transition: 9, count: 1 }]);
    Assert.deepEqual(await process(model, { action: "validate", value: base }), base);
    const decision = await process(model, { action: "merge", base, local, remote });
    Assert.equal(decision.status, "apply");
    Assert.deepEqual(decision.value.visits, [...local.visits, remote.visits[1]]);
    Assert.equal((await process(model, { action: "merge", base, local: decision.value, remote })).status,
      "keep_local", "Replaying a merged remote record is idempotent");
    Assert.deepEqual(await process(model, { action: "merge", base, local, remote: null }),
      { status: "conflict", reason: "deletion_edit" });
    await Assert.rejects(process(model, { action: "validate", value: page([
      { atUsec: dayStartUsec + 101, transition: 4, count: 1 },
    ]) }), error => error.result === Cr.NS_ERROR_INVALID_ARG);
    Assert.throws(() => model.setHistoryTitle("about:config", "No"),
      error => error.result === Cr.NS_ERROR_INVALID_ARG);
    Assert.throws(() => model.setHistoryTitle("https://user:secret@example.invalid/", "No"),
      error => error.result === Cr.NS_ERROR_INVALID_ARG);
  } finally {
    model.close();
  }
});

add_task(async function places_preserves_history_visit_microseconds() {
  const uri = Services.io.newURI("https://example.invalid/midori-sync-history-precision");
  const asyncHistory = Cc["@mozilla.org/browser/history;1"].getService(Ci.mozIAsyncHistory);
  const atUsec = dayStartUsec + 1234567;
  try {
    const result = await new Promise(resolve => asyncHistory.updatePlaces({
      uri, title: "Precise visit", visits: [{ visitDate: atUsec, transitionType: 1 }],
    }, {
      handleError(code) { resolve({ error: code }); },
      handleResult() {},
      handleCompletion(count) { resolve({ count }); },
    }));
    Assert.deepEqual(result, { count: 1 });
    const query = PlacesUtils.history.getNewQuery();
    query.uri = uri;
    query.beginTime = dayStartUsec;
    query.endTime = dayStartUsec + 86400000000 - 1;
    const options = PlacesUtils.history.getNewQueryOptions();
    options.resultType = options.RESULTS_AS_VISIT;
    options.sortingMode = options.SORT_BY_DATE_ASCENDING;
    const rows = PlacesUtils.history.executeQuery(query, options).root;
    rows.containerOpen = true;
    try {
      Assert.equal(rows.childCount, 1);
      Assert.equal(rows.getChild(0).time, atUsec);
      Assert.equal(rows.getChild(0).visitType, 1);
    } finally {
      rows.containerOpen = false;
    }
  } finally {
    await PlacesUtils.history.remove(uri);
  }
});

add_task(async function native_history_adapter_adds_visits_without_replaying_them() {
  const adapter = await createHistory();
  const url = "https://example.invalid/midori-sync-history-adapter";
  const day = Math.floor(Date.now() * 1000 / 86400000000) * 86400000000;
  const id = await adapter.rememberLocal(url, day);
  const value = { version: 1, url, title: "Synchronized page", dayStartUsec: day,
    visits: [{ atUsec: day + 1234567, transition: 1, count: 1 },
      { atUsec: day + 1234568, transition: 2, count: 1 }] };
  const uri = Services.io.newURI(url);
  try {
    Assert.deepEqual(await adapter.validate(id, value), value);
    await Assert.rejects(adapter.validate("wrong-id", value), /invalid_record/);
    Assert.equal(await adapter.read(id), null);
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value }), { status: "applied" });
    Assert.deepEqual(await adapter.read(id), value);
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value }), { status: "applied" });
    Assert.deepEqual(await adapter.read(id), value, "The second application does not duplicate visits");
    Assert.deepEqual(await adapter.apply({ id, deleted: true }, { deleted: false, value }),
      { status: "conflict", reason: "history_deletion_scope_required" }, "An unauthenticated deletion never removes visits");
    Assert.deepEqual(await adapter.read(id), value);
    const retiredId = historyRecordId(url, day);
    Assert.deepEqual(await adapter.apply({ id: retiredId, deleted: true }),
      { status: "conflict", reason: "history_deletion_scope_required" });
    Assert.deepEqual(await adapter.apply({ id: retiredId, deleted: true, authenticatedSchema: 2 }),
      { status: "applied" }, "An authenticated migration retires the public locator");
    Assert.deepEqual(await adapter.read(id), value, "Retiring a legacy locator preserves every native visit");
    Assert.deepEqual(await adapter.apply({ id, deleted: true, authenticatedSchema: 2 }),
      { status: "applied" }, "An authenticated deletion of an unknown record has nothing to remove");
    Assert.deepEqual(await adapter.read(id), value);
    const local = await adapter.read(id);
    await adapter.apply({ id, deleted: false, value: { ...local, visits: [...local.visits,
      { atUsec: day + 1234569, transition: 1, count: 1 }] } }, { deleted: false, value });
    Assert.deepEqual(await adapter.apply({ id, deleted: true, authenticatedSchema: 2 }, { deleted: false, value }),
      { status: "conflict", reason: "deletion_edit" }, "A visit added after the base survives a remote deletion");
    Assert.equal((await adapter.read(id)).visits.length, 3);
    await adapter.apply({ id, deleted: false, value: { ...local, visits: local.visits.slice(0, 2),
      removed: [{ atUsec: day + 1234569, transition: 1 }] } }, null);
    Assert.equal((await adapter.read(id)).visits.length, 2, "A visit tombstone removes exactly that visit");
    Assert.deepEqual(await adapter.apply({ id, deleted: true, authenticatedSchema: 2 }, { deleted: false, value }),
      { status: "applied" });
    Assert.equal(await adapter.read(id), null, "An authenticated deletion over an unchanged record removes its visits");
  } finally {
    adapter.close();
    await PlacesUtils.history.remove(uri);
  }
});

add_task(async function native_history_adapter_updates_title_without_adding_visits() {
  const adapter = await createHistory();
  const url = "https://example.invalid/midori-sync-history-title";
  const day = Math.floor(Date.now() * 1000 / 86400000000) * 86400000000;
  const id = await adapter.rememberLocal(url, day);
  const original = { version: 1, url, title: "Original", dayStartUsec: day,
    visits: [{ atUsec: day + 3456789, transition: 1, count: 1 }] };
  const updated = { ...original, title: "Updated" };
  const uri = Services.io.newURI(url);
  const signals = [];
  const unsubscribe = adapter.observe(event => signals.push(event));
  try {
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value: original }), { status: "applied" });
    signals.length = 0;
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value: updated },
      { id, deleted: false, value: original }), { status: "applied" });
    Assert.deepEqual(await adapter.read(id), updated, "A title change preserves the original visit");
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value: updated },
      { id, deleted: false, value: original }), { status: "applied" });
    Assert.deepEqual(await adapter.read(id), updated, "Replaying a title change remains idempotent");
    Assert.ok(signals.some(event => event.id === id), "A known title change targets its record");
  } finally {
    unsubscribe();
    adapter.close();
    await PlacesUtils.history.remove(uri);
  }
});

add_task(async function history_clear_keeps_only_visits_after_the_server_cutoff() {
  const adapter = await createHistory();
  const url = "https://example.invalid/midori-sync-history-cutoff";
  const uri = Services.io.newURI(url);
  const day = Math.floor((Date.now() - 86400000) * 1000 / 86400000000) * 86400000000;
  const cutoffMs = day / 1000 + 3600000;
  const older = cutoffMs - 1000;
  const newer = cutoffMs + 1000;
  const id = await adapter.rememberLocal(url, day);
  try {
    await PlacesUtils.history.insert({ url, title: "Mixed visits", visits: [
      { date: new Date(older), transition: 1 }, { date: new Date(newer), transition: 1 },
    ] });
    await adapter.clearBefore(cutoffMs);
    const value = await adapter.readDay(url, day);
    Assert.equal(value.visits.length, 1);
    Assert.equal(value.visits[0].atUsec, newer * 1000);
    const rows = await PlacesUtils.withConnectionWrapper("Midori history reset test", db => db.executeCached(
      `SELECT v.visit_date AS atUsec FROM moz_historyvisits v
       JOIN moz_places p ON p.id = v.place_id WHERE p.url = :url`, { url }
    ));
    Assert.deepEqual(rows.map(row => row.getResultByName("atUsec")), [newer * 1000],
      "The pre-clear visit is removed from Places, not merely filtered from Sync");
    await Assert.rejects(adapter.validate(id, { ...value,
      visits: [{ atUsec: older * 1000, transition: 1, count: 1 }] }), /invalid_record/);
  } finally {
    adapter.close();
    await PlacesUtils.history.remove(uri);
  }
});

add_task(async function history_tracker_discards_stale_hints_after_a_clear() {
  let notify;
  let scannedFrom = 0;
  const captured = [];
  const adapter = {
    clearBeforeUsec: 0,
    observe(listener) { notify = listener; return () => {}; },
  };
  const tracker = new MidoriSyncHistoryTracker({ adapter, engine: {
    async capture(id) { captured.push(id); return { status: "unchanged" }; },
    async capturePage() { return { results: [], nextAfter: null }; },
  }, withConnection: (_name, action) => action({
    async executeCached(_query, args) { scannedFrom = args.window; return []; },
  }) });
  try {
    notify({ id: "old-history-record" });
    adapter.clearBeforeUsec = Date.now() * 1000;
    await tracker.run();
    Assert.deepEqual(captured, [], "A queued hint from the old generation is discarded");
    Assert.ok(scannedFrom > adapter.clearBeforeUsec, "The new inventory starts after the cutoff");
  } finally {
    tracker.close();
  }
});

add_task(async function history_tracker_inventories_real_places_visits() {
  const adapter = await createHistory();
  const url = "https://example.invalid/midori-sync-history-inventory";
  const uri = Services.io.newURI(url);
  const date = new Date(Date.now() - 60000);
  const day = Math.floor(date.getTime() * 1000 / 86400000000) * 86400000000;
  const captured = [];
  await PlacesUtils.history.insert({ url, title: "Inventory", visits: [{ date, transition: 1 }] });
  const tracker = new MidoriSyncHistoryTracker({ adapter, engine: {
    async capture(id) {
      captured.push({ id, value: await adapter.read(id) });
      return { status: "unchanged" };
    },
    async capturePage() { return { results: [], nextAfter: null }; },
  } });
  try {
    await tracker.run({ limit: 100 });
    const id = await adapter.rememberLocal(url, day);
    Assert.ok(captured.some(entry => entry.id === id &&
      entry.value.url === url && entry.value.visits.length === 1));
  } finally {
    tracker.close();
    adapter.close();
    await PlacesUtils.history.remove(uri);
  }
});

add_task(async function history_changes_wake_background_sync() {
  const adapter = await createHistory();
  const url = "https://example.invalid/midori-sync-history-hint";
  const uri = Services.io.newURI(url);
  let wake;
  const changed = new Promise(resolve => { wake = resolve; });
  let hints = 0;
  const tracker = new MidoriSyncHistoryTracker({ adapter, engine: {}, onChange: () => {
    hints++;
    wake();
  } });
  try {
    await PlacesUtils.history.insert({ url, title: "Hinted visit",
      visits: [{ date: new Date(), transition: 1 }] });
    await changed;
    Assert.ok(hints > 0, "A Places visit wakes background Sync");
    Assert.ok(tracker.snapshot.more, "The visit remains queued for capture");
  } finally {
    tracker.close();
    await PlacesUtils.history.remove(uri);
  }
});

add_task(async function history_identity_is_private_stable_and_legacy_requires_an_explicit_reader() {
  const identity = await createHistoryIdentity();
  const adapter = new MidoriSyncHistory({ deriveRecordId: identity.deriveRecordId });
  const reader = new MidoriSyncHistory({ allowLegacy: true, deriveRecordId: identity.deriveRecordId });
  const unrelated = await createHistory();
  const noIdentity = new MidoriSyncHistory();
  const restoredCrypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const value = page();
  let restored;
  try {
    const id = await adapter.rememberLocal(value.url, value.dayStartUsec);
    const legacy = historyRecordId(value.url, value.dayStartUsec);
    Assert.ok(/^h2:[0-9a-f]{64}$/.test(id));
    Assert.notEqual(id.slice(3), legacy.slice(3));
    Assert.equal(await adapter.rememberLocal(value.url, value.dayStartUsec), id);
    Assert.equal(await reader.migrationId(value), id);
    Assert.deepEqual(await adapter.validate(id, value), value);
    await Assert.rejects(adapter.validate(legacy, value), /invalid_record/);
    await Assert.rejects(adapter.read(legacy, value), /invalid_record/);
    Assert.deepEqual(await reader.validate(legacy, value), value);
    Assert.notEqual(await unrelated.rememberLocal(value.url, value.dayStartUsec), id);
    await Assert.rejects(unrelated.validate(id, value), /invalid_record/);
    await Assert.rejects(noIdentity.rememberLocal(value.url, value.dayStartUsec), /history_identity_unavailable/);
    const passphrase = encoder.encode("public fixture identity recovery");
    try {
      const bundle = await identity.crypto.wrapNativeKey(identity.handle, passphrase);
      const handle = await restoredCrypto.recoverNativeKey(identity.scope, passphrase, bundle);
      restored = new MidoriSyncHistory({ deriveRecordId: (collection, bytes) =>
        restoredCrypto.deriveNativeRecordId(handle, collection, bytes) });
    } finally {
      passphrase.fill(0);
    }
    adapter.close();
    identity.crypto.close();
    Assert.equal(await restored.rememberLocal(value.url, value.dayStartUsec), id);
    Assert.deepEqual(await restored.validate(id, value), value);
  } finally {
    for (const owner of [adapter, reader, unrelated, noIdentity, restored]) {
      owner?.close();
    }
    restoredCrypto.close();
  }
});

add_task(async function history_identity_inputs_are_cleared_and_late_results_are_cancelled() {
  let finish;
  let started;
  let input;
  const pending = new Promise(resolve => { finish = resolve; });
  const ready = new Promise(resolve => { started = resolve; });
  const adapter = new MidoriSyncHistory({ deriveRecordId(collection, bytes) {
    Assert.equal(collection, "history");
    input = bytes;
    Assert.equal(new TextDecoder().decode(input), JSON.stringify([page().url, dayStartUsec]));
    started();
    return pending;
  } });
  const result = adapter.rememberLocal(page().url, dayStartUsec);
  await ready;
  adapter.close();
  finish("a".repeat(64));
  await Assert.rejects(result, /cancelled/);
  Assert.ok(input.every(byte => byte === 0));
});

add_task(async function history_observer_recovers_derivation_failure_and_ignores_unsubscribed_results() {
  let callback;
  let finish;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const signals = [];
  const adapter = new MidoriSyncHistory({
    observers: {
      addListener(_types, listener) { callback = listener; },
      removeListener() { callback = null; },
    },
    deriveRecordId() {
      started();
      return new Promise(resolve => { finish = resolve; });
    },
  });
  try {
    const unsubscribe = adapter.observe(signal => signals.push(signal));
    callback([{ type: "page-visited", url: page().url, visitTime: dayStartUsec + 101, transitionType: 1 }]);
    await ready;
    unsubscribe();
    finish("a".repeat(64));
    await new Promise(resolve => executeSoon(resolve));
    Assert.deepEqual(signals, []);
  } finally {
    adapter.close();
  }
  let notifyFailure;
  const failed = new Promise(resolve => { notifyFailure = resolve; });
  const failing = new MidoriSyncHistory({
    observers: {
      addListener(_types, listener) { callback = listener; },
      removeListener() { callback = null; },
    },
    deriveRecordId() { throw new Error("identity unavailable"); },
  });
  try {
    failing.observe(notifyFailure);
    callback([{ type: "page-visited", url: page().url, visitTime: dayStartUsec + 101, transitionType: 1 }]);
    Assert.deepEqual(await failed, { rescan: true });
  } finally {
    failing.close();
  }
});

add_task(async function a_day_beyond_one_record_is_partitioned_without_losing_visits() {
  const adapter = await createHistory();
  const url = "https://example.invalid/midori-sync-history-partition";
  const day = (Math.floor(Date.now() * 1000 / 86400000000) - 1) * 86400000000;
  const total = 2100;
  const visits = Array.from({ length: total }, (_, index) => ({
    date: new Date((day + 1000000 + index * 5000000) / 1000), transition: PlacesUtils.history.TRANSITION_LINK }));
  try {
    await PlacesUtils.history.insertMany([{ url, title: "Busy page", visits }]);
    await Assert.rejects(adapter.readDay(url, day), /history_record_too_large/);
    const ids = await adapter.localIds(url, day);
    Assert.greater(ids.length, 1, "An oversized day is split into several records");
    let seen = 0;
    const keys = new Set();
    for (const id of ids) {
      const value = await adapter.read(id);
      Assert.ok(value.part, "Every piece declares its window");
      Assert.lessOrEqual(value.visits.length, 2048);
      Assert.deepEqual(await adapter.validate(id, value), value);
      for (const visit of value.visits) {
        keys.add(`${visit.atUsec}:${visit.transition}`);
        seen += visit.count;
      }
    }
    Assert.equal(seen, total, "No visit is lost or duplicated across the pieces");
    Assert.equal(keys.size, total);
    Assert.equal(new Set(ids).size, ids.length);
    const dayId = await adapter.rememberLocal(url, day);
    Assert.ok(!ids.includes(dayId), "A piece never reuses the identity of the whole day");
    const base = await adapter.read(ids[0]);
    Assert.deepEqual(await adapter.read(dayId, { version: 1, url, title: "Busy page", dayStartUsec: day,
      visits: base.visits.slice(0, 3) }), { version: 1, url, title: "Busy page", dayStartUsec: day,
      visits: base.visits.slice(0, 3) }, "The whole-day record reads only the visits it already carries");
    await Assert.rejects(adapter.validate(ids[0], { ...base, part: { ...base.part, startUsec: base.part.startUsec + 1 } }),
      /invalid_record/);
  } finally {
    adapter.close();
    await PlacesUtils.history.remove(url);
  }
});

add_task(async function only_deliberate_removals_are_reported_and_expiry_is_ignored() {
  const adapter = await createHistory();
  const url = "https://example.invalid/midori-sync-history-removals";
  const guid = "AAAAAAAAAAAA";
  const events = [];
  const unsubscribe = adapter.observe(event => events.push(event));
  try {
    PlacesObservers.notifyListeners([new PlacesVisitRemoved({ url, pageGuid: guid, reason: PlacesVisitRemoved.REASON_EXPIRED,
      isRemovedFromStore: true, isPartialVisistsRemoval: false })]);
    await new Promise(resolve => ChromeUtils.idleDispatch(resolve));
    Assert.equal(events.filter(event => event.removedUrl).length, 0, "Expiration never produces a deletion hint");
    PlacesObservers.notifyListeners([new PlacesVisitRemoved({ url, pageGuid: guid, reason: PlacesVisitRemoved.REASON_DELETED,
      isRemovedFromStore: true, isPartialVisistsRemoval: false })]);
    await TestUtils.waitForCondition(() => events.some(event => event.removedUrl === url),
      "A user deletion is reported for its URL");
  } finally {
    unsubscribe();
    adapter.close();
  }
});

add_task(async function user_deletions_become_tombstones_without_touching_unmarked_records() {
  const adapter = await createHistory();
  const url = "https://example.invalid/midori-sync-history-tombstones";
  const day = Math.floor(Date.now() * 1000 / 86400000000) * 86400000000;
  const at = [day + 2000000, day + 3000000, day + 4000000];
  try {
    await PlacesUtils.history.insertMany([{ url, title: "Tombstones", visits: at.map(usec => ({
      date: new Date(usec / 1000), transition: PlacesUtils.history.TRANSITION_LINK })) }]);
    const id = await adapter.rememberLocal(url, day);
    const base = await adapter.read(id);
    Assert.equal(base.visits.length, 3);
    await PlacesUtils.withConnectionWrapper("test: remove one visit", db => db.executeCached(
      `DELETE FROM moz_historyvisits WHERE place_id = (SELECT id FROM moz_places WHERE url = :url) AND visit_date = :at`,
      { url, at: at[1] }));
    Assert.ok(adapter.matchesLocal(id, await adapter.read(id, base), base),
      "Fewer visits with no deliberate removal are not published");
    adapter.beginUserDeletion([url], [id]);
    const marked = await adapter.read(id, base);
    Assert.deepEqual(marked.removed, [{ atUsec: at[1], transition: 1 }], "The missing visit becomes a tombstone");
    Assert.deepEqual(marked.visits.map(visit => visit.atUsec), [at[0], at[2]]);
    Assert.ok(!adapter.matchesLocal(id, marked, base), "The tombstone is a change to publish");
    await PlacesUtils.history.remove(url);
    Assert.equal(await adapter.read(id, base), null);
    Assert.ok(!adapter.matchesLocal(id, null, base), "A marked removal of every visit publishes a deletion");
    adapter.endUserDeletion([url], [id]);
    Assert.ok(adapter.matchesLocal(id, null, base), "Unmarked absence never publishes a deletion");
  } finally {
    adapter.close();
    await PlacesUtils.history.remove(url);
  }
});

add_task(async function pending_history_intentions_survive_encrypted_journal_and_adapter_reopen() {
  const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
  const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
  const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
  const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
  const identity = await createHistoryIdentity();
  const context = { epoch: uuid(), revision: "1" };
  const keys = {
    snapshot: { status: "ready", custody: "client", activeKeyId: await identity.crypto.nativeKeyId(identity.handle) },
    writeContext: context,
    async sealRecord(value, bytes) {
      return { crypto: context, payload: await identity.crypto.sealNative(identity.handle, 0, JSON.stringify(value), bytes) };
    },
    openRecord: (value, envelope) => identity.crypto.openNative(identity.handle, 0, JSON.stringify(value), envelope),
    sealLocal: (value, bytes) => identity.crypto.sealNative(identity.handle, 1, JSON.stringify(value), bytes),
    openLocal: (value, envelope) => identity.crypto.openNative(identity.handle, 1, JSON.stringify(value), envelope),
  };
  const day = Math.floor(Date.now() * 1000 / 86400000000) * 86400000000;
  for (const scenario of ["expiry", "delete", "partial-and-visit", "delete-and-visit"]) {
    const url = `https://example.invalid/durable-history-${scenario}`;
    const options = { keys, storeId: uuid(), deviceId: uuid(), create: true,
      directory: PathUtils.join(PathUtils.profileDir, `history-intent-${uuid()}`) };
    let store = await openSyncStore(options);
    options.create = false;
    let adapter = new MidoriSyncHistory({ deriveRecordId: identity.deriveRecordId });
    let engine;
    const generation = uuid();
    const records = new Map();
    const receipts = new Map();
    const changes = [];
    let loseResponse = false;
    const create = () => new MidoriSyncCollection({ collection: "history", journal: store, keys, adapter,
      entryId: syncJournalEntryId, createId: uuid,
      async request(path, { body, query }) {
        if (path.endsWith("/operations")) {
          const results = [];
          for (const [index, operation] of body.operations.entries()) {
            let receipt = receipts.get(operation.operation_id);
            if (receipt) {
              Assert.ok(JSON.stringify(receipt.operation) === JSON.stringify(operation), "Retry preserves the encrypted operation exactly");
            } else {
              const revision = records.get(operation.id)?.revision ?? "0";
              Assert.equal(operation.base_revision, revision, "The follow-up uses the previous receipt as its CAS base");
              const record = { id: operation.id, revision: String(Number(revision) + 1), deleted: operation.deleted,
                payload: operation.payload, ttl: null };
              records.set(operation.id, record);
              changes.push({ sequence: String(changes.length + 1), record });
              receipt = { operation: structuredClone(operation), revision: record.revision };
              receipts.set(operation.operation_id, receipt);
            }
            results.push({ index, id: operation.id, operation_id: operation.operation_id, status: "applied", revision: receipt.revision });
          }
          if (loseResponse) {
            loseResponse = false;
            throw Object.assign(new Error("network_error"), { code: "network_error" });
          }
          return { data: { generation, results } };
        }
        if (path.endsWith("/ack")) {
          return { data: { generation, acknowledged_sequence: body.cursor } };
        }
        return { data: { generation, changes: changes.slice(Number(query?.cursor ?? 0)), has_more: false,
          snapshot_sequence: String(changes.length), next_cursor: String(changes.length), control_revision: "0", control: null } };
      },
    });
    try {
      await PlacesUtils.history.insertMany([{ url, title: "Durable history", visits: [2000000, 3000000].map(offset => ({
        date: new Date((day + offset) / 1000), transition: PlacesUtils.history.TRANSITION_LINK })) }]);
      const id = await adapter.rememberLocal(url, day);
      engine = create();
      await engine.run();
      const first = await engine.capture(id);
      const immutable = (await store.read(first.operationId)).value.operation;
      if (scenario === "partial-and-visit") {
        await PlacesUtils.withConnectionWrapper("test: deliberate partial removal", db => db.executeCached(
          `DELETE FROM moz_historyvisits WHERE place_id = (SELECT id FROM moz_places WHERE url = :url) AND visit_date = :at`,
          { url, at: day + 2000000 }));
      } else {
        await PlacesUtils.history.remove(url);
      }
      if (scenario !== "expiry") { adapter.beginUserDeletion([url], [id]); }
      await engine.capture(id);
      adapter.endUserDeletion([url], [id]);
      Assert.equal(engine.snapshot.localChanges, scenario === "expiry" ? 0 : 1);
      Assert.ok(JSON.stringify((await store.read(first.operationId)).value.operation) === JSON.stringify(immutable));
      engine.close();
      await store.close();
      store = await openSyncStore(options);
      adapter = new MidoriSyncHistory({ deriveRecordId: identity.deriveRecordId });
      engine = create();
      if (scenario.endsWith("and-visit")) {
        await PlacesUtils.history.insert({ url, title: "Durable history", visits: [{ date: new Date((day + 4000000) / 1000),
          transition: PlacesUtils.history.TRANSITION_LINK }] });
        await engine.capture(id);
        const captured = (await engine.record(id)).localChange.value;
        Assert.ok(captured.visits.some(visit => visit.atUsec === day + 4000000), "A new visit survives the stored deletion");
        Assert.equal(captured.removed.length, scenario === "partial-and-visit" ? 1 : 2);
      }
      loseResponse = true;
      await Assert.rejects(engine.run(), /network_error/);
      engine.close();
      await store.close();
      store = await openSyncStore(options);
      adapter = new MidoriSyncHistory({ deriveRecordId: identity.deriveRecordId });
      engine = create();
      await engine.run();
      Assert.equal(records.get(id).deleted, scenario === "delete");
      Assert.equal(receipts.size, scenario === "expiry" ? 1 : 2, "Restart publishes the stored intention without another deletion hint");
      Assert.equal(engine.snapshot.localChanges, 0);
      const remote = (await engine.record(id)).remote;
      if (scenario.endsWith("and-visit")) {
        Assert.ok(remote.value.visits.some(visit => visit.atUsec === day + 4000000));
        Assert.equal(remote.value.removed.length, scenario === "partial-and-visit" ? 1 : 2);
        Assert.equal((await engine.capture(id)).status, "unchanged", "Inventory retains the published removal scope");
      }
      const disk = new TextDecoder().decode(await IOUtils.read(PathUtils.join(options.directory, `${options.storeId}.sqlite`)));
      Assert.ok(!disk.includes(url) && !disk.includes("Durable history"), "History and follow-up intentions stay encrypted on disk");
    } finally {
      engine?.close();
      adapter.close();
      await store.close();
      await PlacesUtils.history.remove(url);
    }
  }
});

add_task(async function retention_widening_reapplies_skipped_records_and_oversize_never_stalls_the_tracker() {
  const adapter = await createHistory();
  const url = "https://example.invalid/midori-sync-history-retention";
  const day = Math.floor((Date.now() - 400 * 86400000) * 1000 / 86400000000) * 86400000000;
  const value = { version: 1, url, title: "Old page", dayStartUsec: day,
    visits: [{ atUsec: day + 3000001, transition: 1, count: 1 }] };
  const id = await adapter.rememberLocal(url, day);
  Services.prefs.setIntPref("midori.sync.history.retentionDays", 90);
  Services.prefs.setIntPref("midori.sync.history.backfilledDays", 90);
  const applied = [];
  const engine = {
    async capture() {
      return { status: "unchanged" };
    },
    async capturePage() { return { results: [], nextAfter: null }; },
    async recordPage() { return { entries: [{ id, deleted: false, value }], nextAfter: null }; },
  };
  const tracker = new MidoriSyncHistoryTracker({ engine, adapter, withConnection: async () => [] });
  const realApply = adapter.apply.bind(adapter);
  adapter.apply = async incoming => { applied.push(incoming.id); return realApply(incoming, null); };
  try {
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value }), { status: "applied", skipped: "retention" });
    Assert.equal(await adapter.read(id), null, "A record outside the retention window is acknowledged but not inserted");
    applied.length = 0;
    await tracker.run({ limit: 100 });
    Assert.deepEqual(applied, [], "An unchanged retention window recovers nothing");
    Services.prefs.setIntPref("midori.sync.history.retentionDays", 800);
    await tracker.run({ limit: 100 });
    Assert.deepEqual(applied, [id], "Widening the retention window reapplies the skipped record");
    Assert.equal(Services.prefs.getIntPref("midori.sync.history.backfilledDays"), 800);
    Assert.equal((await adapter.read(id)).visits.length, 1, "The old visit is now present locally");
  } finally {
    Services.prefs.clearUserPref("midori.sync.history.retentionDays");
    Services.prefs.clearUserPref("midori.sync.history.backfilledDays");
    tracker.close();
    adapter.close();
    await PlacesUtils.history.remove(url);
  }
});

add_task(async function an_oversized_record_is_skipped_without_blocking_the_rest() {
  let emit;
  const captured = [];
  const adapter = { clearBeforeUsec: 0, observe(listener) { emit = listener; return () => {}; },
    async localIds() { return []; }, outsideRetention() { return false; }, beginUserDeletion() {}, endUserDeletion() {} };
  const engine = {
    async capture(id) {
      if (id === "big") {
        throw Object.assign(new Error("too large"), { code: "history_record_too_large" });
      }
      captured.push(id);
      return { status: "queued" };
    },
    async capturePage() { return { results: [], nextAfter: null }; },
    async recordPage() { return { entries: [], nextAfter: null }; },
  };
  Services.prefs.setIntPref("midori.sync.history.backfilledDays", 90);
  const tracker = new MidoriSyncHistoryTracker({ engine, adapter, withConnection: async () => [] });
  try {
    emit({ id: "big" });
    emit({ id: "after" });
    const result = await tracker.run({ limit: 100 });
    Assert.deepEqual(captured, ["after"], "The record after the oversized one is still captured");
    Assert.equal(result.queued, 1);
    Assert.equal(tracker.snapshot.skipped, 1, "The oversized record is counted instead of failing the run");
    Assert.equal(tracker.snapshot.error, null);
    Assert.equal(tracker.snapshot.dirty, 0, "An oversized record is not retried forever");
  } finally {
    Services.prefs.clearUserPref("midori.sync.history.backfilledDays");
    tracker.close();
  }
});
