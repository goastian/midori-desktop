/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { FormHistory } = ChromeUtils.importESModule("resource://gre/modules/FormHistory.sys.mjs");
const { TestUtils } = ChromeUtils.importESModule("resource://testing-common/TestUtils.sys.mjs");
const { MidoriSyncFormHistory } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncFormHistory.sys.mjs");
const { MidoriSyncFormHistoryTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncFormHistoryTracker.sys.mjs");

async function formAdapter() {
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const scope = JSON.stringify(["https://sync.example.invalid/", "https://accounts.example.invalid/", "forms-fixture"]);
  const handle = await crypto.generateNativeKey(scope);
  const deriveRecordId = (collection, bytes) => crypto.deriveNativeRecordId(handle, collection, bytes);
  const adapter = new MidoriSyncFormHistory({ deriveRecordId });
  return { adapter, crypto, async id(value) {
    const bytes = new TextEncoder().encode(JSON.stringify([value.fieldname, value.value]));
    try {
      return `f1:${await deriveRecordId("form-history", bytes)}`;
    } finally {
      bytes.fill(0);
    }
  } };
}

function formValue(fieldname, text = "Bogotá 日本語") {
  const now = Date.now() * 1000;
  return { version: 1, fieldname, value: text, firstUsed: now - 2000000, lastUsed: now - 1000000, timesUsed: 3 };
}

add_setup(async function enable_form_history() {
  Services.prefs.setBoolPref("browser.formfill.enable", true);
  registerCleanupFunction(() => Services.prefs.clearUserPref("browser.formfill.enable"));
});

add_task(async function native_form_history_round_trip_is_idempotent_and_appears_in_autocomplete() {
  const fixture = await formAdapter();
  const { adapter } = fixture;
  const value = formValue("midori-h2-city");
  const id = await fixture.id(value);
  try {
    Assert.deepEqual(await adapter.validate(id, value), value);
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value }), { status: "applied" });
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value }), { status: "applied" });
    Assert.deepEqual(await adapter.read(id), value);
    Assert.equal(await FormHistory.count({ fieldname: value.fieldname, value: value.value }), 1);
    Assert.ok((await adapter.listIds()).includes(id));
    const suggestions = await FormHistory.getAutoCompleteResults("Bog", { fieldname: value.fieldname });
    Assert.equal(suggestions.length, 1, "A synchronized value is available to the native autocomplete API");
    Assert.equal(suggestions[0].text, value.value);
    Assert.deepEqual(await adapter.apply({ id, deleted: true }, { id, deleted: false, value }), { status: "applied" });
    Assert.equal(await adapter.read(id), null);
    Assert.equal((await FormHistory.getAutoCompleteResults("Bog", { fieldname: value.fieldname })).length, 0);
  } finally {
    adapter.close();
    fixture.crypto.close();
    await FormHistory.update({ op: "remove", fieldname: value.fieldname });
  }
});

add_task(async function native_form_history_usage_and_deletion_wake_capture_without_duplicate_counts() {
  const fixture = await formAdapter();
  const { adapter } = fixture;
  const value = formValue("midori-h2-use");
  const id = await fixture.id(value);
  const captured = [];
  const tracker = new MidoriSyncFormHistoryTracker({ adapter,
    engine: {
      async capture(candidate) { captured.push(candidate); return { status: "unchanged" }; },
      async capturePage() { return { results: [], nextAfter: null }; },
    },
  });
  try {
    await adapter.apply({ id, deleted: false, value });
    await TestUtils.waitForCondition(() => tracker.snapshot.dirty > 0, "The native add notification reaches capture");
    await tracker.run();
    await FormHistory.update({ op: "bump", fieldname: value.fieldname, value: value.value });
    await TestUtils.waitForCondition(() => tracker.snapshot.dirty > 0, "Usage wakes capture");
    await tracker.run();
    const used = await adapter.read(id);
    Assert.equal(used.timesUsed, 4);
    Assert.equal(used.firstUsed, value.firstUsed);
    Assert.greater(used.lastUsed, value.lastUsed);
    const remote = { ...value, timesUsed: 6, lastUsed: used.lastUsed + 1000 };
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value: remote }, { id, deleted: false, value }),
      { status: "applied" });
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value: remote }, { id, deleted: false, value }),
      { status: "applied" });
    Assert.equal((await adapter.read(id)).timesUsed, 6);
    await tracker.run();
    await FormHistory.update({ op: "remove", fieldname: value.fieldname, value: value.value });
    await TestUtils.waitForCondition(() => tracker.snapshot.dirty > 0, "Deletion wakes capture");
    await tracker.run();
    Assert.ok(captured.filter(candidate => candidate === id).length >= 3);
    Assert.equal(await adapter.read(id, value), null);
  } finally {
    tracker.close();
    adapter.close();
    fixture.crypto.close();
    await FormHistory.update({ op: "remove", fieldname: value.fieldname });
  }
});

add_task(async function native_form_history_reconciles_existing_pairs_and_preserves_delete_edit_conflicts() {
  const fixture = await formAdapter();
  const { adapter } = fixture;
  const value = formValue("midori-h2-existing");
  const id = await fixture.id(value);
  const { version, ...entry } = value;
  try {
    await FormHistory.update({ op: "add", ...entry });
    const [{ guid }] = await FormHistory.search(["guid"], { fieldname: value.fieldname, value: value.value });
    const remote = { ...value, timesUsed: 7, firstUsed: value.firstUsed - 1000 };
    await adapter.apply({ id, deleted: false, value: remote });
    const matching = await FormHistory.search(["guid"], { fieldname: value.fieldname, value: value.value });
    Assert.deepEqual(matching, [{ guid }], "An existing local suggestion retains its native GUID");
    Assert.deepEqual(await adapter.read(id), remote);
    await FormHistory.update({ op: "bump", guid });
    Assert.deepEqual(await adapter.apply({ id, deleted: true }, { id, deleted: false, value: remote }),
      { status: "conflict", reason: "deletion_edit" });
    Assert.equal((await adapter.read(id)).timesUsed, 8);
    await Assert.rejects(adapter.validate(id, { ...value, fieldname: "password" }), /invalid_record/);
    await Assert.rejects(adapter.validate(id, { ...value, value: "4111111111111111" }), /invalid_record/);
  } finally {
    adapter.close();
    fixture.crypto.close();
    await FormHistory.update({ op: "remove", fieldname: value.fieldname });
  }
});

add_task(async function native_form_history_ids_survive_reopening_and_are_collection_separated() {
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const scope = JSON.stringify(["https://sync.example.invalid/", "https://accounts.example.invalid/", "forms-identity"]);
  const handle = await crypto.generateNativeKey(scope);
  const deriveRecordId = (collection, bytes) => crypto.deriveNativeRecordId(handle, collection, bytes);
  const value = formValue("midori-h2-reopen");
  const bytes = new TextEncoder().encode(JSON.stringify([value.fieldname, value.value]));
  const id = `f1:${await deriveRecordId("form-history", bytes)}`;
  const first = new MidoriSyncFormHistory({ deriveRecordId });
  let second;
  try {
    await first.apply({ id, deleted: false, value });
    first.close();
    second = new MidoriSyncFormHistory({ deriveRecordId });
    Assert.deepEqual(await second.read(id, value), value);
    Assert.notEqual(await deriveRecordId("form-history", bytes), await deriveRecordId("addresses", bytes),
      "The two new collections use different native identity domains");
    Assert.deepEqual(await second.apply({ id, deleted: true }, { id, deleted: false, value }), { status: "applied" });
  } finally {
    bytes.fill(0);
    first.close();
    second?.close();
    crypto.close();
    await FormHistory.update({ op: "remove", fieldname: value.fieldname });
  }
});
