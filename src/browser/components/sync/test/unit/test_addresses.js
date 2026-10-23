/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncAddresses } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncAddresses.sys.mjs");
const { FormAutofillStorage } = ChromeUtils.importESModule("resource://autofill/FormAutofillStorage.sys.mjs");

async function finalizeAddressStorage(storage) {
  Services.obs.removeObserver(storage.addresses, "formautofill-storage-changed");
  await storage._finalize();
}

function addressValue(fields = {}) {
  return { version: 1, nativeVersion: 1, fields: {
    name: "María José 李", organization: "Ejemplo", "street-address": "Calle 1 Nº 2\nPiso 3",
    "address-level3": "Chapinero", "address-level2": "Bogotá", "address-level1": "DC",
    "postal-code": "110111", country: "CO", tel: "+57123456789", email: "maria@example.invalid", ...fields,
  }, timeCreated: 1700000000000, timeLastModified: 1700000000010, timeLastUsed: 1700000000020, timesUsed: 3 };
}

add_task(async function remote_deletion_uses_midori_reconciliation_for_locally_created_or_edited_addresses() {
  const storage = new FormAutofillStorage(PathUtils.join(PathUtils.profileDir, "midori-sync-local-delete-test.json"));
  await storage.initialize();
  const adapter = new MidoriSyncAddresses({ storage });
  const observed = [];
  adapter.observe(event => observed.push(event));
  try {
    for (const edited of [false, true]) {
      const id = await storage.addresses.add(addressValue().fields);
      if (edited) {
        await storage.addresses.update(id, { ...addressValue().fields, email: "edited@example.invalid" });
      }
      const base = { id, deleted: false, value: await adapter.read(id) };
      observed.length = 0;
      Assert.deepEqual(await adapter.apply({ id, deleted: true }, base), { status: "applied" });
      Assert.equal(await adapter.read(id), null, "Firefox Sync metadata cannot prevent an authenticated Midori deletion");
      Assert.deepEqual(observed, [], "Remote deletion does not echo into Midori capture");
    }
  } finally {
    adapter.close();
    await finalizeAddressStorage(storage);
  }
});

add_task(async function addresses_use_native_storage_and_preserve_optional_fields_and_dates() {
  const path = PathUtils.join(PathUtils.profileDir, "midori-sync-addresses-test.json");
  const storage = new FormAutofillStorage(path);
  await storage.initialize();
  const adapter = new MidoriSyncAddresses({ storage });
  const id = "abc123def456";
  const observed = [];
  adapter.observe(event => observed.push(event));
  try {
    const base = { id, deleted: false, value: addressValue() };
    Assert.deepEqual(await adapter.apply(base), { status: "applied" });
    Assert.deepEqual(await adapter.read(id), base.value, "Native canonical fields and metadata survive insertion");
    Assert.deepEqual(observed, [], "Remote writes refresh Autofill without entering the capture queue");
    const native = await storage.addresses.get(id);
    Assert.equal(native.guid, id);
    Assert.equal(native["given-name"], "María", "Autofill computes name components from synchronized data");
    Assert.equal(native["address-line1"], "Calle 1 Nº 2");
    Assert.equal(native["address-line2"], "Piso 3");
    await storage.addresses.update(id, { ...base.value.fields, name: "Nombre local" });
    Assert.ok(observed.some(event => event.id === id), "Native edits are observed");
    const edited = await adapter.read(id);
    const remote = { id, deleted: false, value: addressValue({ email: "remote@example.invalid" }) };
    Assert.deepEqual(await adapter.apply(remote, base), { status: "applied" });
    const merged = await adapter.read(id);
    Assert.equal(merged.fields.name, "Nombre local");
    Assert.equal(merged.fields.email, "remote@example.invalid");
    Assert.equal(merged.timeLastModified, edited.timeLastModified, "Remote application keeps native edit time");
    const optional = structuredClone(merged);
    delete optional.fields.organization;
    delete optional.fields.email;
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value: optional },
      { id, deleted: false, value: merged }), { status: "applied" });
    Assert.deepEqual(await adapter.read(id), optional, "Removed optional values remain absent");
    const usedBefore = optional.timesUsed;
    await storage.addresses.notifyUsed(id);
    const used = await adapter.read(id);
    Assert.equal(used.timesUsed, usedBefore + 1);
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value: used },
      { id, deleted: false, value: optional }), { status: "applied" });
    Assert.equal((await adapter.read(id)).timesUsed, usedBefore + 1, "A retry does not add another use");
    Assert.deepEqual(await adapter.apply({ id, deleted: true }, { id, deleted: false, value: used }),
      { status: "applied" });
    Assert.equal(await adapter.read(id), null);
    Assert.deepEqual(await adapter.apply(base, { id, deleted: true }), { status: "applied" });
    Assert.deepEqual(await adapter.read(id), base.value, "A legitimate restore replaces the native tombstone");
  } finally {
    adapter.close();
    await finalizeAddressStorage(storage);
  }
  const reopened = new FormAutofillStorage(path);
  await reopened.initialize();
  const afterRestart = new MidoriSyncAddresses({ storage: reopened });
  try {
    Assert.deepEqual(await afterRestart.read(id), addressValue(), "Synchronized metadata survives reopening the profile store");
  } finally {
    afterRestart.close();
    await finalizeAddressStorage(reopened);
  }
});

add_task(async function countries_and_unicode_are_transferred_without_changing_native_content() {
  const storage = new FormAutofillStorage(PathUtils.join(PathUtils.profileDir, "midori-sync-address-countries.json"));
  await storage.initialize();
  const adapter = new MidoriSyncAddresses({ storage });
  try {
    for (const [country, name, street, city, postal] of [
      ["DE", "Jörg Müller", "Straße 12\nWohnung 4", "München", "80331"],
      ["JP", "山田 太郎", "丸の内１丁目", "千代田区", "100-0005"],
      ["CO", "María Gómez", "Carrera 7 Nº 12", "Bogotá", "110111"],
      ["AQ", "Research Station", "Station 1", "Antarctica", ""],
    ]) {
      const id = `country${country}123`;
      const value = addressValue({ country, name, "street-address": street, "address-level2": city,
        "postal-code": postal });
      if (!postal) {
        delete value.fields["postal-code"];
      }
      Assert.deepEqual(await adapter.apply({ id, deleted: false, value }), { status: "applied" });
      Assert.deepEqual(await adapter.read(id), value, `Canonical ${country} content remains complete`);
    }
  } finally {
    adapter.close();
    await finalizeAddressStorage(storage);
  }
});

add_task(async function exact_duplicates_reconcile_in_native_storage_without_erasing_new_edits() {
  const storage = new FormAutofillStorage(PathUtils.join(PathUtils.profileDir, "midori-sync-address-duplicates.json"));
  await storage.initialize();
  const adapter = new MidoriSyncAddresses({ storage });
  try {
    const base = { id: "zzz123def456", deleted: false, value: addressValue() };
    await adapter.apply(base);
    const incoming = { id: "abc123def456", deleted: false, value: addressValue() };
    const plan = await adapter.prepare(incoming);
    Assert.equal(plan.duplicate.id, base.id);
    const applied = { status: "applied", replacement: { id: base.id, replacementId: incoming.id } };
    Assert.deepEqual(await adapter.applyPrepared(plan), applied);
    Assert.deepEqual(await adapter.applyPrepared(plan), applied);
    Assert.deepEqual(await adapter.listIds(), [incoming.id]);
    Assert.deepEqual(await adapter.apply({ id: base.id, deleted: true }, base), { status: "applied" });
    Assert.deepEqual(await adapter.read(incoming.id), incoming.value, "The redundant tombstone preserves the canonical address");
    const conflict = await adapter.apply({ ...incoming, value: addressValue({ name: "Concurrent remote" }) });
    Assert.deepEqual(conflict, { status: "conflict", reason: "address_fields_diverged" });
  } finally {
    adapter.close();
    await finalizeAddressStorage(storage);
  }
});

add_task(async function addresses_preserve_identity_and_metadata_in_the_rust_store() {
  const { RustAutofillAddressesAdapter } = ChromeUtils.importESModule("resource://autofill/RustAutofillAddressStorage.sys.mjs");
  const addresses = RustAutofillAddressesAdapter.getInstance();
  const storage = { addresses, async initialize() { await addresses.initialize(); } };
  const adapter = new MidoriSyncAddresses({ storage });
  const id = "rust123def45";
  try {
    const base = { id, deleted: false, value: addressValue() };
    Assert.deepEqual(await adapter.apply(base), { status: "applied" });
    Assert.deepEqual(await adapter.read(id), base.value);
    Assert.ok(!addresses.isEmpty(), "A synchronized address refreshes the native suggestion count");
    const updated = { id, deleted: false, value: { ...addressValue({ email: "rust@example.invalid" }), timesUsed: 9 } };
    Assert.deepEqual(await adapter.apply(updated, base), { status: "applied" });
    Assert.deepEqual(await adapter.read(id), updated.value);
    Assert.deepEqual(await adapter.apply(updated, base), { status: "applied" });
    Assert.equal((await adapter.read(id)).timesUsed, 9);
    Assert.deepEqual(await adapter.apply({ id, deleted: true }, updated), { status: "applied" });
    Assert.equal(await adapter.read(id), null);
    Assert.deepEqual(await adapter.apply(base, { id, deleted: true }), { status: "applied" });
    Assert.deepEqual(await adapter.read(id), base.value, "A legitimate restore keeps its GUID in the Rust store");
  } finally {
    adapter.close();
  }
});
