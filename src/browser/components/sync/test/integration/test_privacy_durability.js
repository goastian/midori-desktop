/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
const { MidoriSyncPrivacyFilters, SYNC_FILTERS_ID } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPrivacyFilters.sys.mjs");
const { createSyncTextBundle } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncTextBundle.sys.mjs");
const { MidoriBlockerService, normalizeCustomFiltersText } = ChromeUtils.importESModule("resource:///modules/MidoriBlockerService.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const { sealSyncRecord } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncRecord.sys.mjs");
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
const scope = JSON.stringify(["http://localhost:9/", "urn:midori:sync:local", "public-filter-durability"]);
const passphrase = new TextEncoder().encode("public synthetic filter durability passphrase");

add_task(async function acknowledged_custom_filters_survive_sigkill_before_replay() {
  const stage = Services.env.get("MIDORI_SYNC_DURABILITY_STAGE");
  const change = Services.env.get("MIDORI_SYNC_DURABILITY_CHANGE");
  Assert.ok(["apply", "verify"].includes(stage));
  Assert.ok(["create", "update", "delete"].includes(change));
  const fresh = stage === "apply" && change === "create";
  const statePath = PathUtils.join(PathUtils.profileDir, "privacy-durability-state.json");
  const state = fresh ? { storeId: uuid(), deviceId: uuid(), epoch: uuid(), generation: uuid(), changes: [] } : await IOUtils.readJSON(statePath);
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  let journal;
  let engine;
  try {
    const handle = fresh ? await crypto.generateNativeKey(scope) : await crypto.recoverNativeKey(scope, passphrase, state.bundle);
    const writeContext = { epoch: state.epoch, revision: "1" };
    const keys = { snapshot: { status: "ready", custody: "client", activeKeyId: await crypto.nativeKeyId(handle) }, writeContext,
      sealRecord: async (context, bytes) => ({ crypto: writeContext, payload: await crypto.sealNative(handle, 0, JSON.stringify(context), bytes) }),
      openRecord: (context, payload) => crypto.openNative(handle, 0, JSON.stringify(context), payload),
      sealLocal: (context, bytes) => crypto.sealNative(handle, 1, JSON.stringify(context), bytes),
      openLocal: (context, payload) => crypto.openNative(handle, 1, JSON.stringify(context), payload) };
    const deriveRecordId = (collection, bytes) => crypto.deriveNativeRecordId(handle, collection, bytes);
    const line = `||${change === "create" ? "created" : "updated"}-durability.example.invalid^\n`;
    const size = 2 * 1024 * 1024;
    const repeated = line.repeat(Math.floor((size - 2) / line.length));
    const text = change === "delete" ? "" : `${repeated}!${"x".repeat(size - repeated.length - 2)}\n`;
    if (stage === "apply") {
      state.bundle ??= await crypto.wrapNativeKey(handle, passphrase);
      const bundle = change === "delete" ? null : await createSyncTextBundle("custom-filters", text, {
        entryId: async (type, digest) => `t1:${await deriveRecordId("midori-privacy",
          new TextEncoder().encode(JSON.stringify([1, "text-part", type, digest])))}`,
      });
      const records = [{ id: SYNC_FILTERS_ID, value: bundle?.manifest ?? null }, ...(bundle?.parts ?? [])];
      for (const { id, value } of records) {
        const previous = state.changes.findLast(item => item.record.id === id)?.record;
        const base_revision = previous?.revision ?? "0";
        const sealed = await sealSyncRecord(keys, { collection: "midori-privacy", id, generation: state.generation, base_revision },
          { deleted: value === null, value });
        state.changes.push({ sequence: String(state.changes.length + 1), record: { id,
          revision: String(Number(base_revision) + 1), deleted: value === null, payload: sealed.payload, ttl: null } });
      }
      await IOUtils.writeJSON(statePath, state, { flush: true, permissions: 0o600 });
    } else {
      const native = await MidoriBlockerService.readCustomFiltersSnapshot();
      Assert.ok(native.present);
      Assert.ok(native.text === text, "The complete acknowledged native file survives SIGKILL before opening or replaying the journal");
    }
    journal = await openSyncStore({ keys, storeId: state.storeId, deviceId: state.deviceId, create: fresh,
      directory: PathUtils.join(PathUtils.profileDir, "privacy-durability-journal") });
    const adapter = new MidoriSyncPrivacyFilters({ producer: MidoriBlockerService, deriveRecordId,
      record: id => engine.record(id), normalize: normalizeCustomFiltersText });
    let acknowledged = false;
    engine = new MidoriSyncCollection({ collection: "midori-privacy", adapter, keys, journal, entryId: syncJournalEntryId, createId: uuid,
      request: async (route, { body, query }) => {
        if (route.endsWith("/ack")) {
          acknowledged = true;
          Assert.ok((await MidoriBlockerService.readCustomFiltersSnapshot()).text === text,
            "Acknowledgement follows the complete native write");
          return { data: { generation: state.generation, acknowledged_sequence: body.cursor } };
        }
        Assert.ok(route.endsWith("/changes"));
        const offset = Number(query?.cursor ?? 0);
        const changes = state.changes.slice(offset, offset + 1);
        return { data: { generation: state.generation, changes, has_more: offset + changes.length < state.changes.length,
          snapshot_sequence: String(state.changes.length), next_cursor: String(offset + changes.length), control_revision: "0", control: null } };
      } });
    await engine.run({ maxPages: 100, maxApplications: 1000 });
    Assert.ok((await MidoriBlockerService.readCustomFiltersSnapshot()).text === text);
    Assert.equal(engine.snapshot.pending, 0);
    Assert.equal(engine.snapshot.conflicts, 0);
    Assert.equal(engine.snapshot.deferred, 0);
    Assert.ok(engine.snapshot.initialized);
    Assert.equal((await engine.record(SYNC_FILTERS_ID)).remote.deleted, change === "delete");
    if (stage === "apply") {
      Assert.ok(acknowledged);
      await IOUtils.writeJSON(Services.env.get("MIDORI_SYNC_DURABILITY_CHECKPOINT"), {
        pid: Services.appinfo.processID, profile: PathUtils.profileDir, acknowledged: ["midori-privacy"], change, backend: "native",
      }, { flush: true, permissions: 0o600 });
      await new Promise(() => {});
    }
  } finally {
    engine?.close();
    await journal?.close();
    crypto.close();
    passphrase.fill(0);
  }
});
