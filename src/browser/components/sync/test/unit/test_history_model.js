/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const encoder = new TextEncoder();
const dayStartUsec = 86400000000 * 20000;
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
      { status: "conflict", reason: "history_deletion_scope_required" });
    Assert.deepEqual(await adapter.read(id), value);
    const retiredId = historyRecordId(url, day);
    Assert.deepEqual(await adapter.apply({ id: retiredId, deleted: true }),
      { status: "conflict", reason: "history_deletion_scope_required" });
    Assert.deepEqual(await adapter.apply({ id: retiredId, deleted: true, authenticatedSchema: 2 }),
      { status: "applied" }, "An authenticated migration retires the public locator");
    Assert.deepEqual(await adapter.read(id), value, "Retiring a legacy locator preserves every native visit");
    Assert.deepEqual(await adapter.apply({ id, deleted: true, authenticatedSchema: 2 }),
      { status: "conflict", reason: "history_deletion_scope_required" });
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
