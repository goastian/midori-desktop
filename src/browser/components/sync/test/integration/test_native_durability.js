/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global add_task, Assert, registerCleanupFunction */

const rust = Services.env.get("MIDORI_SYNC_DURABILITY_BACKEND") === "rust";
Services.prefs.setBoolPref("signon.storage.rust.enabled", rust);
Services.prefs.setBoolPref("signon.storage.rust.active", rust);
Services.prefs.setBoolPref("extensions.formautofill.addresses.storage.rust.enabled", rust);
Services.prefs.setBoolPref("extensions.formautofill.creditCards.storage.rust.enabled", rust);
Services.prefs.setBoolPref("extensions.formautofill.addresses.storage.rust.active", rust);
Services.prefs.setBoolPref("extensions.formautofill.creditCards.storage.rust.active", rust);

const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
const { MidoriSyncPasswords } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswords.sys.mjs");
const { MidoriSyncAddresses } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncAddresses.sys.mjs");
const { MidoriSyncCreditCards } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCreditCards.sys.mjs");
const { MidoriSyncPreferences } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPreferences.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const { sealSyncRecord } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncRecord.sys.mjs");
const { JSONFile } = ChromeUtils.importESModule("resource://gre/modules/JSONFile.sys.mjs");
const { formAutofillStorage } = ChromeUtils.importESModule("resource://autofill/FormAutofillStorage.sys.mjs");
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
const scope = JSON.stringify(["http://localhost:9/", "urn:midori:sync:local", "synthetic-durability-fixture"]);
const publicPassphrase = new TextEncoder().encode("public synthetic durability fixture");

add_task(async function acknowledged_native_data_survives_process_termination() {
  const stage = Services.env.get("MIDORI_SYNC_DURABILITY_STAGE");
  const change = Services.env.get("MIDORI_SYNC_DURABILITY_CHANGE");
  Assert.ok(["apply", "verify"].includes(stage));
  Assert.ok(["create", "update", "adopt", "delete"].includes(change));
  const fresh = stage === "apply" && change === "create";
  const path = PathUtils.join(PathUtils.profileDir, "durability-state.json");
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const state = fresh ? { storeId: uuid(), deviceId: uuid(), epoch: uuid(), generation: uuid() } :
    await IOUtils.readJSON(path);
  const handle = fresh ? await crypto.generateNativeKey(scope) :
    await crypto.recoverNativeKey(scope, publicPassphrase, state.bundle);
  const context = { epoch: state.epoch, revision: "1" };
  const keys = { snapshot: { status: "ready", custody: "client", activeKeyId: await crypto.nativeKeyId(handle) }, writeContext: context,
    sealRecord: async (expected, bytes) => ({ crypto: context, payload: await crypto.sealNative(handle, 0, JSON.stringify(expected), bytes) }),
    openRecord: (expected, payload) => crypto.openNative(handle, 0, JSON.stringify(expected), payload),
    sealLocal: (expected, bytes) => crypto.sealNative(handle, 1, JSON.stringify(expected), bytes),
    openLocal: (expected, payload) => crypto.openNative(handle, 1, JSON.stringify(expected), payload) };
  const oldPasswordId = "{22222222-2222-4222-8222-222222222222}";
  const adoptedPasswordId = "{11111111-1111-4111-8111-111111111111}";
  const fixtures = {
    passwords: { id: oldPasswordId, value: { version: 1,
      origin: "https://durability.example.invalid", formActionOrigin: "https://durability.example.invalid", httpRealm: null,
      username: "Durable fixture", password: "public synthetic password", usernameField: "username", passwordField: "password",
      timeCreated: 1700000000000, timePasswordChanged: 1700000000010 }, adapter: () => new MidoriSyncPasswords() },
    addresses: { id: "durableaddr1", value: { version: 1, nativeVersion: 1,
      fields: { name: "Durable fixture", "street-address": "123 Example Street", "address-level2": "Example City",
        "address-level1": "CA", "postal-code": "94043", country: "US", email: "durable@example.invalid" },
      timeCreated: 1700000000000, timeLastModified: 1700000000010, timeLastUsed: 0, timesUsed: 0 },
      adapter: () => new MidoriSyncAddresses() },
    "credit-cards": { id: "durablecard1", value: { version: 1, name: "Durable fixture", number: "4111111111111111", month: 12, year: 2032 },
      adapter: () => new MidoriSyncCreditCards() },
    "browser-settings": { id: "midori.verticaltabs.width", value: { version: 1, name: "midori.verticaltabs.width", value: 280 },
      adapter: () => new MidoriSyncPreferences() },
  };
  if (["adopt", "delete"].includes(change)) {
    fixtures.passwords.id = adoptedPasswordId;
  }
  for (const [collection, fixture] of Object.entries(fixtures)) {
    if (["update", "adopt"].includes(change)) {
      if (collection === "passwords") {
        fixture.value.password = "public updated synthetic password";
        fixture.value.timePasswordChanged += 1000;
      } else if (collection === "addresses") {
        fixture.value.fields.name = "Updated durable fixture";
        fixture.value.timeLastModified += 1000;
      } else if (collection === "credit-cards") {
        fixture.value.name = "Updated durable fixture";
        fixture.value.month = 11;
      } else {
        fixture.value.value = 320;
      }
    } else if (change === "delete") {
      fixture.value = null;
    }
  }
  if (change === "adopt") {
    fixtures.passwords.value.timeCreated -= 1000;
    fixtures.passwords.value.timePasswordChanged += 1000;
    fixtures.passwords.value.usernameField = "received-identity-user";
  }
  const originalSaveSoon = JSONFile.prototype.saveSoon;
  JSONFile.prototype.saveSoon = function() {};
  registerCleanupFunction(() => { JSONFile.prototype.saveSoon = originalSaveSoon; });
  await formAutofillStorage.initialize();
  await Services.logins.initializationPromise;
  const nativeLogins = Services.logins.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIVariant)._storage;
  Assert.equal(nativeLogins.backendName, rust ? "rust" : "json", "The requested login backend is active");
  Assert.equal(Services.prefs.getBoolPref("extensions.formautofill.addresses.storage.rust.active", false), rust,
    "The requested address backend is active");
  Assert.equal(Services.prefs.getBoolPref("extensions.formautofill.creditCards.storage.rust.active", false), rust,
    "The requested card backend is active");
  const journal = await openSyncStore({ keys, storeId: state.storeId, deviceId: state.deviceId,
    create: fresh, directory: PathUtils.join(PathUtils.profileDir, "durability-journal") });
  registerCleanupFunction(() => journal.close());
  if (stage === "apply") {
    state.bundle ??= await crypto.wrapNativeKey(handle, publicPassphrase);
    state.records ??= {};
    state.sequences ??= {};
    for (const [collection, { id, value }] of Object.entries(fixtures)) {
      const previous = state.records[collection];
      const base = previous?.id === id ? previous.revision : "0";
      const sealed = await sealSyncRecord(keys, { collection, id, generation: state.generation, base_revision: base }, { deleted: value === null, value });
      state.records[collection] = { id, revision: String(Number(base) + 1), deleted: value === null, payload: sealed.payload, ttl: null };
      state.sequences[collection] = String(Number(state.sequences[collection] ?? 0) + 1);
    }
    await IOUtils.writeJSON(path, state, { flush: true, permissions: 0o600 });
  }
  for (const [collection, fixture] of Object.entries(fixtures)) {
    const adapter = fixture.adapter();
    if (Services.env.get("MIDORI_SYNC_DURABILITY_NEGATIVE_CONTROL") === "1") {
      adapter.flush = undefined;
    }
    let acknowledged = false;
    const request = async (route, { body, query }) => {
      if (route.endsWith("/ack")) {
        acknowledged = true;
        return { data: { generation: state.generation, acknowledged_sequence: body.cursor } };
      }
      Assert.ok(route.endsWith("/changes"), "This receiver does not publish replacement data");
      const sequence = state.sequences[collection];
      return { data: { generation: state.generation, changes: Number(query?.cursor ?? 0) >= Number(sequence) ? [] :
        [{ sequence, record: state.records[collection] }], has_more: false, snapshot_sequence: sequence,
        next_cursor: sequence, control_revision: "0", control: null } };
    };
    const engine = new MidoriSyncCollection({ collection, adapter, keys, journal, request, entryId: syncJournalEntryId, createId: uuid });
    if (stage === "verify") {
      Assert.deepEqual(await adapter.read(fixture.id), fixture.value,
        `${collection}: acknowledged native data survives SIGKILL before any replay`);
      if (collection === "passwords" && ["adopt", "delete"].includes(change)) {
        Assert.equal(await adapter.read(oldPasswordId), null,
          "Identity adoption survives SIGKILL without retaining a duplicate");
      }
    }
    await engine.run();
    const record = await engine.record(fixture.id);
    Assert.deepEqual(record.remote.value, fixture.value);
    Assert.equal(engine.snapshot.deferred, 0, "Completed native writes leave no application intention");
    Assert.equal(engine.snapshot.conflicts, 0);
    Assert.equal((await journal.list(collection, "application")).length, 0);
    Assert.deepEqual(await adapter.read(fixture.id), fixture.value);
    if (stage === "apply") {
      Assert.ok(acknowledged, `${collection}: the receiver acknowledged its complete page`);
    }
    engine.close();
    adapter.close();
  }
  if (stage === "apply") {
    await IOUtils.writeJSON(Services.env.get("MIDORI_SYNC_DURABILITY_CHECKPOINT"),
      { pid: Services.appinfo.processID, acknowledged: Object.keys(fixtures), profile: PathUtils.profileDir, change, backend: rust ? "rust" : "json" },
      { flush: true, permissions: 0o600 });
    await new Promise(() => {});
  }
  await journal.close();
  crypto.close();
});
