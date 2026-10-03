/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncCreditCards } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCreditCards.sys.mjs");

function card(number = "4111111111111111", name = "Example") {
  return { version: 1, name, number, month: 12, year: 2032 };
}

function fakeStorage() {
  const entries = new Map();
  const notify = (guid, action) => Services.obs.notifyObservers({
    wrappedJSObject: { guid, collectionName: "creditCards" },
  }, "formautofill-storage-changed", action);
  return {
    entries,
    async initialize() {},
    creditCards: {
      async get(guid) { return entries.has(guid) ? structuredClone(entries.get(guid)) : null; },
      async getAll() { return [...entries].map(([guid]) => ({ guid })); },
      async findDuplicateGUID(entry) {
        Assert.ok(entry.guid && Object.hasOwn(entry, "version"), "Duplicate checks receive a complete store identity");
        return [...entries].find(([, value]) => value["cc-number"] === entry["cc-number"])?.[0] ?? null;
      },
      async add(entry) {
        entries.set(entry.guid, structuredClone(entry));
        notify(entry.guid, "add");
        return entry.guid;
      },
      async update(guid, entry) {
        entries.set(guid, { ...entries.get(guid), ...structuredClone(entry) });
        notify(guid, "update");
      },
      remove(guid) {
        entries.delete(guid);
        notify(guid, "remove");
      },
    },
  };
}

add_task(async function cards_reject_unexpected_secrets_and_masked_numbers() {
  const adapter = new MidoriSyncCreditCards({ storage: fakeStorage() });
  try {
    await Assert.rejects(adapter.validate("cardGuid1234", { ...card(), "cc-csc": "123" }), /invalid_record/);
    await Assert.rejects(adapter.validate("cardGuid1234", { ...card(), number: "************1111" }), /invalid_record/);
    await Assert.rejects(adapter.validate("cardGuid1234", { ...card(), month: 13 }), /invalid_record/);
    Assert.deepEqual(await adapter.validate("cardGuid1234", card()), card());
  } finally {
    adapter.close();
  }
});

add_task(async function cards_apply_without_loop_and_preserve_conflicts() {
  const storage = fakeStorage();
  const adapter = new MidoriSyncCreditCards({ storage });
  const observed = [];
  const unsubscribe = adapter.observe(event => observed.push(event));
  try {
    Assert.deepEqual(await adapter.apply({ id: "cardGuid1234", deleted: false, value: card() }), { status: "applied" });
    Assert.deepEqual(await adapter.read("cardGuid1234"), card());
    Assert.deepEqual(observed, [], "Remote writes do not enter the local capture queue");
    storage.entries.get("cardGuid1234")["cc-name"] = "Local name";
    Services.obs.notifyObservers({ wrappedJSObject: { guid: "cardGuid1234", collectionName: "creditCards" } },
      "formautofill-storage-changed", "update");
    Assert.deepEqual(observed, [{ id: "cardGuid1234" }], "A local edit is captured");
    const merged = await adapter.apply({ id: "cardGuid1234", deleted: false,
      value: { ...card(), month: 11 } }, { id: "cardGuid1234", deleted: false, value: card() });
    Assert.deepEqual(merged, { status: "applied" });
    Assert.deepEqual(await adapter.read("cardGuid1234"), { ...card(), name: "Local name", month: 11 });
    storage.entries.get("cardGuid1234")["cc-number"] = "4000000000000002";
    const conflict = await adapter.apply({ id: "cardGuid1234", deleted: false,
      value: card("5555555555554444") }, { id: "cardGuid1234", deleted: false, value: card() });
    Assert.deepEqual(conflict, { status: "conflict", reason: "card_number_diverged" });
    Assert.equal(storage.entries.get("cardGuid1234")["cc-number"], "4000000000000002",
      "A conflicting remote number never overwrites the local card");
    const deleted = await adapter.apply({ id: "cardGuid1234", deleted: true }, { id: "cardGuid1234", deleted: false, value: card() });
    Assert.deepEqual(deleted, { status: "conflict", reason: "deletion_edit" });
    Assert.deepEqual(await adapter.listIds(), ["cardGuid1234"]);
  } finally {
    unsubscribe();
    adapter.close();
  }
});

add_task(async function cards_use_the_profile_autofill_store() {
  const { FormAutofillStorage } = ChromeUtils.importESModule("resource://autofill/FormAutofillStorage.sys.mjs");
  const storage = new FormAutofillStorage(PathUtils.join(PathUtils.profileDir, "midori-sync-card-test.json"));
  await storage.initialize();
  const adapter = new MidoriSyncCreditCards({ storage });
  try {
    const guid = await storage.creditCards.add({
      "cc-name": "Local card", "cc-number": "4111111111111111", "cc-exp-month": 12, "cc-exp-year": 2032,
    });
    Assert.deepEqual(await adapter.read(guid), card("4111111111111111", "Local card"));
    Assert.notEqual((await storage.creditCards.get(guid))["cc-number"], "4111111111111111",
      "The profile store keeps the card number masked");
    Assert.deepEqual(await adapter.apply({ id: "abc123def456", deleted: false,
      value: card("5555555555554444", "Remote card") }), { status: "applied" });
    Assert.deepEqual(await adapter.read("abc123def456"), card("5555555555554444", "Remote card"));
    await storage.creditCards.update("abc123def456", {
      "cc-name": "Edited locally", "cc-number": "5555555555554444",
      "cc-exp-month": 12, "cc-exp-year": 2032,
    });
    Assert.deepEqual(await adapter.apply({ id: "abc123def456", deleted: true },
      { id: "abc123def456", deleted: false, value: card("5555555555554444", "Edited locally") }),
    { status: "applied" });
    Assert.equal(await adapter.read("abc123def456"), null,
      "A remote tombstone removes a card after its local edit was uploaded");
    Assert.deepEqual(await adapter.apply({ id: "abc123def456", deleted: false,
      value: card("4000000000000002", "Restored card") }, { id: "abc123def456", deleted: true }),
    { status: "applied" });
    Assert.deepEqual(await adapter.read("abc123def456"), card("4000000000000002", "Restored card"),
      "The profile store replaces an old tombstone when the server restores the card");
  } finally {
    adapter.close();
  }
});

add_task(async function cards_do_not_acknowledge_an_ignored_deletion() {
  const storage = fakeStorage();
  const adapter = new MidoriSyncCreditCards({ storage });
  try {
    Assert.deepEqual(await adapter.apply({ id: "abc123def456", deleted: false, value: card() }),
      { status: "applied" });
    storage.creditCards.remove = () => {};
    Assert.deepEqual(await adapter.apply({ id: "abc123def456", deleted: true },
      { id: "abc123def456", deleted: false, value: card() }),
    { status: "deferred", reason: "card_changed" });
    Assert.deepEqual(await adapter.read("abc123def456"), card(),
      "An ignored storage deletion remains eligible for a later retry");
  } finally {
    adapter.close();
  }
});

add_task(async function cards_keep_guid_in_the_rust_autofill_adapter() {
  const storage = fakeStorage();
  delete storage.creditCards.findDuplicateGUID;
  storage.creditCards.get = async guid => storage.entries.has(guid) ? {
    ...storage.entries.get(guid), "cc-number": "************1111", "cc-number-encrypted": "test ciphertext",
  } : null;
  storage.creditCards._recordForMigrationExport = async record => ({
    ...record, "cc-number": storage.entries.get(record.guid)["cc-number"],
  });
  storage.creditCards.add = async () => { throw new Error("Generated GUIDs cannot apply a remote card"); };
  storage.creditCards.addManyWithMeta = async records => {
    for (const record of records) {
      storage.entries.set(record.guid, structuredClone(record));
    }
    return records.map(record => ({ guid: record.guid }));
  };
  let notifications = 0;
  storage.creditCards.notifySyncApplied = async () => {
    ++notifications;
    Services.obs.notifyObservers({
      wrappedJSObject: { guid: null, collectionName: "creditCards", sourceSync: true },
    }, "formautofill-storage-changed", "update");
  };
  const adapter = new MidoriSyncCreditCards({ storage });
  const observed = [];
  const unsubscribe = adapter.observe(event => observed.push(event));
  try {
    Assert.deepEqual(await adapter.apply({ id: "abc123def456", deleted: false, value: card() }),
      { status: "applied" });
    Assert.equal(notifications, 1, "The Rust store refreshes Autofill suggestions after a remote insert");
    Assert.deepEqual(observed, [], "The store's Sync notification does not enqueue a second upload");
    Assert.deepEqual(await adapter.read("abc123def456"), card());
    Assert.deepEqual(await adapter.apply({ id: "abc123def456", deleted: true },
      { id: "abc123def456", deleted: false, value: card() }), { status: "applied" });
    Assert.deepEqual(await adapter.listIds(), []);
  } finally {
    unsubscribe();
    adapter.close();
  }
});
