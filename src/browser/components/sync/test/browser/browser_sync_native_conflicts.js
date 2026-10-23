/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task, add_setup, requestLongerTimeout, BrowserTestUtils, gBrowser, SpecialPowers */

const { MidoriSyncCollection } = ChromeUtils.importESModule("resource:///modules/MidoriSyncCollection.sys.mjs");
const { MidoriSyncBookmarks } = ChromeUtils.importESModule("resource:///modules/MidoriSyncBookmarks.sys.mjs");
const { MidoriSyncHistory } = ChromeUtils.importESModule("resource:///modules/MidoriSyncHistory.sys.mjs");
const { MidoriSyncPasswords } = ChromeUtils.importESModule("resource:///modules/MidoriSyncPasswords.sys.mjs");
const { MidoriSyncCreditCards } = ChromeUtils.importESModule("resource:///modules/MidoriSyncCreditCards.sys.mjs");
const { MidoriSyncFormHistory } = ChromeUtils.importESModule("resource:///modules/MidoriSyncFormHistory.sys.mjs");
const { MidoriSyncAddresses } = ChromeUtils.importESModule("resource:///modules/MidoriSyncAddresses.sys.mjs");
const { MidoriSyncPreferences } = ChromeUtils.importESModule("resource:///modules/MidoriSyncPreferences.sys.mjs");
const { MidoriSyncTabs } = ChromeUtils.importESModule("resource:///modules/MidoriSyncTabs.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource:///modules/MidoriSyncStore.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource:///modules/MidoriSyncIndex.sys.mjs");
const { sealSyncRecord, openSyncRecord } = ChromeUtils.importESModule("resource:///modules/MidoriSyncRecord.sys.mjs");
const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
const { FormHistory } = ChromeUtils.importESModule("resource://gre/modules/FormHistory.sys.mjs");
const { FormAutofillStorage } = ChromeUtils.importESModule("resource://autofill/FormAutofillStorage.sys.mjs");

add_setup(async function prepare_native_conflict_profile() {
  requestLongerTimeout(4);
  await SpecialPowers.pushPrefEnv({ set: [["browser.formfill.enable", true]] });
  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
const encoder = new TextEncoder();
const clone = value => structuredClone(value);
const nativeRecord = (id, value) => ({ id, deleted: value === null, value, authenticatedSchema: 2 });

add_task(async function unsupported_password_identities_are_retained_as_conflicts_before_native_writes() {
  const keys = await conflictKeys();
  const adapter = new MidoriSyncPasswords();
  const server = conflictServer("passwords", keys);
  const journal = await openSyncStore({ keys, storeId: uuid(), deviceId: uuid(), create: true,
    directory: PathUtils.join(PathUtils.profileDir, `identity-conflicts-${uuid()}`) });
  const engine = new MidoriSyncCollection({ collection: "passwords", adapter, keys, journal,
    request: server.request, entryId: syncJournalEntryId, createId: uuid });
  const origin = `https://identity-conflicts-${uuid()}.example.invalid`;
  const id = `{${uuid()}}`;
  const value = { version: 1, origin, formActionOrigin: origin, httpRealm: null,
    username: "fixture", password: "public synthetic identity conflict", usernameField: "user",
    passwordField: "password", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  try {
    for (const invalid of ["x".repeat(65), "unicode-é", "guid,with,comma"]) {
      await server.put(invalid, value);
    }
    await server.put(id, value);
    await engine.run();
    Assert.equal(engine.snapshot.conflicts, 3, "Unsupported native identities remain reviewable without blocking the valid credential");
    Assert.equal(engine.snapshot.deferred, 0);
    Assert.deepEqual((await Services.logins.searchLoginsAsync({ origin })).map(login => login.guid), [id],
      "No invalid identity creates a credential with a replacement GUID");
    const conflicts = (await engine.conflictPage()).entries;
    Assert.equal(conflicts.length, 3);
    Assert.ok(conflicts.every(entry => entry.reason === "invalid_record" && !entry.canAcceptRemote));
    await engine.capturePage();
    Assert.equal(engine.snapshot.pending, 0, "Excluded identities never generate deletion operations");
  } finally {
    engine.close();
    adapter.close();
    await journal.close();
    for (const login of await Services.logins.searchLoginsAsync({ origin })) {
      await Services.logins.removeLoginAsync(login);
    }
    keys.close();
  }
});

async function conflictKeys() {
  const crypto = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto);
  const scope = JSON.stringify(["http://localhost:8000/", "urn:midori:sync:local", "native-conflict-fixture"]);
  const handle = await crypto.generateNativeKey(scope);
  const identity = await crypto.generateNativeKey(scope);
  const writeContext = { epoch: uuid(), revision: "1" };
  return { snapshot: { status: "ready", custody: "client", activeKeyId: await crypto.nativeKeyId(handle) }, writeContext,
    async deriveRecordId(collection, input) {
      const bytes = ArrayBuffer.isView(input) ? new Uint8Array(input) : encoder.encode(JSON.stringify(input));
      try { return await crypto.deriveNativeRecordId(identity, collection, bytes); }
      finally { bytes.fill(0); }
    },
    async sealRecord(context, bytes) {
      return { crypto: writeContext, payload: await crypto.sealNative(handle, 0, JSON.stringify(context), bytes) };
    },
    openRecord: (context, payload) => crypto.openNative(handle, 0, JSON.stringify(context), payload),
    sealLocal: (context, bytes) => crypto.sealNative(handle, 1, JSON.stringify(context), bytes),
    openLocal: (context, payload) => crypto.openNative(handle, 1, JSON.stringify(context), payload),
    close: () => crypto.close() };
}

function conflictServer(collection, keys) {
  const generation = uuid();
  const records = new Map();
  const changes = [];
  const receipts = new Map();
  let loseResponse = false;
  let requests = 0;
  const append = incoming => {
    records.set(incoming.id, incoming);
    changes.push({ sequence: String(changes.length + 1), record: incoming });
  };
  return { records, receipts,
    get requests() { return requests; },
    loseNextResponse() { loseResponse = true; },
    async put(id, value) {
      const previous = records.get(id)?.revision ?? "0";
      const sealed = await sealSyncRecord(keys, { collection, id, generation, base_revision: previous },
        { deleted: value === null, value });
      append({ id, revision: String(Number(previous) + 1), deleted: value === null, payload: sealed.payload, ttl: null });
    },
    async request(path, { body, query }) {
      ++requests;
      if (path.endsWith("/operations")) {
        const results = [];
        for (const [index, operation] of body.operations.entries()) {
          let receipt = receipts.get(operation.operation_id);
          if (receipt) {
            Assert.ok(JSON.stringify(receipt.operation) === JSON.stringify(operation), "A lost receipt replays the exact encrypted operation");
          } else {
            const revision = records.get(operation.id)?.revision ?? "0";
            const applied = operation.base_revision === revision;
            receipt = { operation: clone(operation), status: applied ? "applied" : "conflict",
              revision: applied ? String(Number(revision) + 1) : revision };
            receipts.set(operation.operation_id, receipt);
            if (applied) {
              append({ id: operation.id, revision: receipt.revision, deleted: operation.deleted,
                payload: operation.payload, ttl: operation.ttl ?? null });
            }
          }
          results.push({ index, operation_id: operation.operation_id, id: operation.id,
            status: receipt.status, revision: receipt.revision });
        }
        if (loseResponse) {
          loseResponse = false;
          throw Object.assign(new Error("network_error"), { code: "network_error" });
        }
        return { data: { generation, results } };
      }
      if (path.endsWith("/ack")) { return { data: { generation, acknowledged_sequence: body.cursor } }; }
      return { data: { generation, changes: clone(changes.slice(Number(query?.cursor ?? 0))), has_more: false,
        snapshot_sequence: String(changes.length), next_cursor: String(changes.length), control_revision: "0", control: null } };
    },
  };
}

async function nativeFamily(collection, keys, choice) {
  const tag = uuid();
  let id = tag.replaceAll("-", "").slice(0, 12);
  let factory;
  let initial;
  let edit;
  let remote;
  let expectedMerge;
  let project = value => value;
  let cleanup = async () => {};
  let captureHint = value => value;
  let advance = () => {};
  if (collection === "bookmarks") {
    const folder = await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.unfiledGuid,
      type: PlacesUtils.bookmarks.TYPE_FOLDER, title: "Conflict fixture" });
    const item = await PlacesUtils.bookmarks.insert({ parentGuid: folder.guid, title: "Base", url: "https://base.example.invalid/" });
    id = item.guid;
    factory = () => new MidoriSyncBookmarks();
    const temporary = factory();
    initial = await temporary.read(id);
    temporary.close();
    edit = () => PlacesUtils.bookmarks.update({ guid: id, title: "Local" });
    remote = base => ({ ...base, ...(choice === "merge" ? { url: "https://remote.example.invalid/" } : { title: "Remote" }) });
    expectedMerge = (base, local, other) => ({ ...local, url: other.url });
    project = value => value && ({ title: value.title, url: value.url, parentGuid: value.parentGuid, index: value.index });
    cleanup = () => PlacesUtils.bookmarks.remove(folder.guid);
  } else if (collection === "history") {
    factory = () => new MidoriSyncHistory({ deriveRecordId: keys.deriveRecordId });
    const day = Math.floor(Date.now() / 86400000) * 86400000000;
    const url = `https://history-${tag}.example.invalid/`;
    initial = { version: 1, url, title: "Base", dayStartUsec: day,
      visits: [{ atUsec: day + 1000000, transition: 1, count: 1 }] };
    id = `h2:${await keys.deriveRecordId("history", [url, day])}`;
    edit = () => PlacesUtils.history.insert({ url, title: "Local",
      visits: [{ date: new Date((day + 1000000) / 1000), transition: 1 },
        { date: new Date((day + 2000000) / 1000), transition: 1 }] });
    remote = base => ({ ...base, title: choice === "merge" ? "Base" : "Remote",
      visits: [{ ...base.visits[0], count: 2 }, { atUsec: day + 3000000, transition: 1, count: 1 }] });
    expectedMerge = (base, local, other) => ({ ...local, visits: [
      { ...local.visits[0], count: local.visits[0].count + other.visits[0].count - base.visits[0].count },
      ...local.visits.slice(1), other.visits.at(-1)] });
    project = value => value && ({ title: value.title, visits: value.visits });
    cleanup = () => PlacesUtils.history.remove(url);
  } else if (collection === "passwords") {
    id = `{${tag}}`;
    factory = () => new MidoriSyncPasswords();
    initial = { version: 1, origin: `https://password-${tag}.example.invalid`, formActionOrigin: "https://login.example.invalid",
      httpRealm: null, username: "Base", password: "public base fixture", usernameField: "user", passwordField: "pass",
      timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
    edit = async () => {
      const original = (await Services.logins.searchLoginsAsync({ guid: id }))[0];
      const changed = original.clone();
      if (choice === "merge") { changed.username = "Local"; } else { changed.password = "public local fixture"; }
      await Services.logins.modifyLoginAsync(original, changed);
    };
    remote = base => ({ ...base, password: "public remote fixture", timePasswordChanged: base.timePasswordChanged + 1000 });
    expectedMerge = (base, local, other) => ({ ...local, password: other.password,
      timeCreated: Math.min(local.timeCreated, other.timeCreated),
      timePasswordChanged: Math.max(local.timePasswordChanged, other.timePasswordChanged) });
    project = value => value && ({ username: value.username,
      password: value.password === "public remote fixture" ? "remote" : value.password === "public local fixture" ? "local" : "base",
      timeCreated: value.timeCreated, timePasswordChanged: value.timePasswordChanged });
    cleanup = async () => {
      for (const login of await Services.logins.searchLoginsAsync({ guid: id })) { await Services.logins.removeLoginAsync(login); }
    };
  } else if (["credit-cards", "addresses"].includes(collection)) {
    const storage = new FormAutofillStorage(PathUtils.join(PathUtils.profileDir, `conflict-autofill-${tag}.json`));
    await storage.initialize();
    if (collection === "credit-cards") {
      factory = () => new MidoriSyncCreditCards({ storage });
      initial = { version: 1, name: "Base", number: "4111111111111111", month: 12, year: 2032 };
      edit = () => storage.creditCards.update(id, { "cc-name": "Local", "cc-number": initial.number,
        "cc-exp-month": 12, "cc-exp-year": 2032 });
      remote = base => ({ ...base, ...(choice === "merge" ? { month: 11 } : { name: "Remote" }) });
      expectedMerge = (base, local, other) => ({ ...local, month: other.month });
      project = value => value && ({ name: value.name, ending: value.number.slice(-4), month: value.month, year: value.year });
    } else {
      factory = () => new MidoriSyncAddresses({ storage });
      initial = { version: 1, nativeVersion: 1, fields: { name: "Base", "street-address": "123 Example Street",
        "address-level2": "Example City", "address-level1": "CA", "postal-code": "94043", country: "US", email: "base@example.invalid" },
      timeCreated: 1700000000000, timeLastModified: 1700000000010, timeLastUsed: 1700000000020, timesUsed: 1 };
      edit = () => storage.addresses.update(id, { ...initial.fields, name: "Local" });
      remote = base => ({ ...base, fields: { ...base.fields,
        ...(choice === "merge" ? { email: "remote@example.invalid" } : { name: "Remote" }) } });
      expectedMerge = (base, local, other) => ({ ...local, fields: { ...local.fields, email: other.fields.email } });
      project = value => value && ({ fields: value.fields, timeCreated: value.timeCreated,
        timeLastModified: value.timeLastModified, timeLastUsed: value.timeLastUsed, timesUsed: value.timesUsed });
    }
    cleanup = async () => {
      Services.obs.removeObserver(storage.addresses, "formautofill-storage-changed");
      await storage._finalize();
    };
  } else if (collection === "form-history") {
    factory = () => new MidoriSyncFormHistory({ deriveRecordId: keys.deriveRecordId });
    initial = { version: 1, fieldname: `h4-${tag}`, value: "Example City", firstUsed: Date.now() * 1000 - 2000000,
      lastUsed: Date.now() * 1000 - 1000000, timesUsed: 1 };
    id = `f1:${await keys.deriveRecordId("form-history", [initial.fieldname, initial.value])}`;
    edit = () => FormHistory.update({ op: "bump", fieldname: initial.fieldname, value: initial.value });
    remote = base => ({ ...base, firstUsed: base.firstUsed - 1000, lastUsed: base.lastUsed + 1000, timesUsed: 3 });
    expectedMerge = (base, local, other) => ({ ...local, firstUsed: Math.min(local.firstUsed, other.firstUsed),
      lastUsed: Math.max(local.lastUsed, other.lastUsed), timesUsed: Math.max(local.timesUsed, other.timesUsed) });
    cleanup = () => FormHistory.update({ op: "remove", fieldname: initial.fieldname });
  } else if (collection === "browser-settings") {
    id = "midori.verticaltabs.width";
    factory = () => new MidoriSyncPreferences();
    initial = { version: 1, name: id, value: 320 };
    edit = () => Services.prefs.setIntPref(id, 400);
    remote = base => ({ ...base, value: 500 });
    cleanup = async () => Services.prefs.clearUserPref(id);
  } else {
    id = tag;
    let count = 1;
    let now = Date.now();
    advance = () => { now += 5000; };
    factory = () => new MidoriSyncTabs({ deviceId: id, deviceName: "Fixture",
      now: () => now,
      windows: () => [{ gBrowser: { tabs: Array.from({ length: count }, (_, index) => ({ label: `Tab ${index}`,
        linkedBrowser: { currentURI: { spec: `https://tab-${index}.example.invalid/` } } })) } }], isPrivate: () => false });
    const temporary = factory();
    initial = await temporary.read(id);
    temporary.close();
    edit = async () => { count = 2; };
    remote = base => ({ ...base, tab_count: 3, windows: [{ id: 0, tabs: 3 }],
      fragments: [{ count: 3, digest: "a".repeat(64) }] });
    project = value => value && ({ count: value.tab_count, windows: value.windows });
    captureHint = () => null;
  }
  return { id, factory, initial, edit, remote, expectedMerge, project, cleanup, captureHint, advance };
}

async function checkNativeConflict(collection, choice, kind = "edit") {
  info(`Native conflict: ${collection}, ${choice}, ${kind}`);
  const keys = await conflictKeys();
  const family = await nativeFamily(collection, keys, choice);
  const server = conflictServer(collection, keys);
  const options = { keys, storeId: uuid(), deviceId: uuid(), create: true,
    directory: PathUtils.join(PathUtils.profileDir, `conflict-journal-${uuid()}`) };
  let journal = await openSyncStore(options);
  options.create = false;
  let adapter = family.factory();
  let engine;
  const create = () => new MidoriSyncCollection({ collection, adapter, keys, journal, request: server.request,
    entryId: syncJournalEntryId, createId: uuid });
  const read = hint => adapter.read(family.id, family.captureHint(hint));
  try {
    if (collection !== "bookmarks" && collection !== "tabs") {
      Assert.equal((await adapter.apply(nativeRecord(family.id, family.initial))).status, "applied");
    }
    const base = await read(family.initial);
    await server.put(family.id, base);
    engine = create();
    await engine.run();
    if (kind === "local-delete") {
      Assert.equal((await adapter.apply(nativeRecord(family.id, null), nativeRecord(family.id, base))).status, "applied");
      if (collection === "history") {
        adapter.beginUserDeletion([base.url], [family.id]);
      }
    } else {
      await family.edit();
    }
    adapter.endCapture?.();
    const local = await read(base);
    Assert.equal((await engine.capture(family.id)).status, "queued");
    const other = kind === "remote-delete" ? null : await adapter.validate(family.id,
      kind === "empty-remote" ? { ...base, visits: [],
        removed: base.visits.map(({ atUsec, transition }) => ({ atUsec, transition })) } : family.remote(base));
    await server.put(family.id, other);
    await engine.run();
    Assert.ok(engine.snapshot.conflicts > 0, "CAS preserves the concurrent versions as conflicts");
    const entry = (await engine.conflictPage()).entries.find(value => value.canKeepLocal);
    Assert.ok(entry, "The authenticated conflict can be reviewed");
    const preview = await engine.conflictPreview(entry);
    family.advance();
    const decision = { ...entry, choice, localRevision: preview.localRevision };
    const unsupported = collection === "tabs" && choice !== "local" ||
      choice === "merge" && (collection === "browser-settings" || kind !== "edit");
    if (unsupported) {
      await Assert.rejects(engine.resolveConflict(decision), /conflict_(resolution|merge)_unavailable/,
        "A per-device snapshot or scalar setting cannot promise an unsupported native operation");
      Assert.ok(engine.snapshot.conflicts > 0);
      Assert.deepEqual(family.project(await read(local)), family.project(local));
      return;
    }
    const expected = kind === "empty-remote" ? null : choice === "local" ? local :
      choice === "remote" ? other : family.expectedMerge(base, local, other);
    if (choice === "local") {
      await engine.resolveConflict(decision);
    } else {
      const commit = journal.commit.bind(journal);
      journal.commit = async changes => {
        if (changes.some(change => change.kind === "outbox")) {
          throw Object.assign(new Error("disk_full"), { code: "disk_full" });
        }
        return commit(changes);
      };
      await Assert.rejects(engine.resolveConflict(decision), /disk_full/,
        "The native decision survives failure before its publication is committed");
      Assert.deepEqual(family.project(await read(expected)), family.project(expected));
      engine.close();
      await journal.close();
      journal = await openSyncStore(options);
      adapter = family.factory();
      engine = create();
      const requests = server.requests;
      await engine.recoverLocal();
      Assert.equal(server.requests, requests, "Reopening the native decision needs no HTTP");
    }
    const current = await read(expected);
    Assert.deepEqual(family.project(current), family.project(expected), "The confirmed choice reaches the native store");
    const [queued] = await journal.list(collection, "outbox");
    Assert.ok(queued && queued.value.operation.base_revision === "2", "The decision uses the latest remote CAS revision");
    if (collection === "history" && choice === "remote" && kind === "edit") {
      Assert.deepEqual(queued.value.value.removed, [{ atUsec: local.visits.at(-1).atUsec, transition: 1 }],
        "Discarding a local-only visit records its deliberate deletion for other clients");
    }
    const originalOperation = clone(queued.value.operation);
    server.loseNextResponse();
    await Assert.rejects(engine.run(), /network_error/);
    engine.close();
    await journal.close();
    journal = await openSyncStore(options);
    adapter = family.factory();
    engine = create();
    await engine.run();
    Assert.equal(engine.snapshot.conflicts, 0);
    Assert.equal(engine.snapshot.pending, 0);
    Assert.equal(engine.snapshot.deferred, 0);
    Assert.ok(JSON.stringify(server.receipts.get(queued.id).operation) === JSON.stringify(originalOperation));
    const uploaded = await openSyncRecord(keys, { collection, id: family.id,
      generation: queued.value.generation }, server.records.get(family.id));
    Assert.deepEqual(family.project(uploaded), family.project(expected), "The native choice is published once after reopening");
    Assert.deepEqual(family.project(await read(expected)), family.project(expected), "Reopening does not duplicate or revert native data");
  } finally {
    engine?.close();
    adapter.close();
    await journal.close();
    await family.cleanup();
    keys.close();
  }
}

for (const collection of ["bookmarks", "history", "passwords", "credit-cards", "form-history", "addresses", "browser-settings", "tabs"]) {
  if (Services.env.get("MIDORI_SYNC_CONFLICT_FAMILY") && Services.env.get("MIDORI_SYNC_CONFLICT_FAMILY") !== collection) { continue; }
  for (const kind of collection === "tabs" ? ["edit"] : ["edit", "local-delete", "remote-delete"]) {
    for (const choice of ["local", "remote", "merge"]) {
      const task = () => checkNativeConflict(collection, choice, kind);
      Object.defineProperty(task, "name", { value: `conflict_${collection.replaceAll("-", "_")}_${choice}_${kind.replaceAll("-", "_")}` });
      add_task(task);
    }
  }
}

add_task(function accepting_an_empty_history_version_finishes_as_an_authenticated_tombstone() {
  return checkNativeConflict("history", "remote", "empty-remote");
});

add_task(async function history_resolution_preserves_retention_and_rejects_ambiguous_count_reduction() {
  const keys = await conflictKeys();
  const adapter = new MidoriSyncHistory({ deriveRecordId: keys.deriveRecordId });
  try {
    const day = Math.floor(Date.now() / 86400000) * 86400000000;
    const value = { version: 1, url: "https://history-limit.example.invalid/", title: "Example", dayStartUsec: day,
      visits: [{ atUsec: day + 1000000, transition: 1, count: 1 }] };
    const id = `h2:${await keys.deriveRecordId("history", [value.url, day])}`;
    const local = { ...value, visits: [{ ...value.visits[0], count: 2 }] };
    await Assert.rejects(adapter.resolveValue(id, local, value, "remote"), /conflict_resolution_unavailable/,
      "An ambiguous reduction of repeated visits cannot silently reappear through max-count merging");
    Assert.ok(!adapter.matchesResolution(id, value, local), "A subset of visits does not prove the decision was applied");
    const past = { ...value, dayStartUsec: day - 3651 * 86400000000,
      visits: [{ ...value.visits[0], atUsec: day - 3651 * 86400000000 + 1000000 }] };
    const pastId = `h2:${await keys.deriveRecordId("history", [past.url, past.dayStartUsec])}`;
    for (const choice of ["remote", "merge"]) {
      await Assert.rejects(adapter.resolveValue(pastId, null, past, choice), /conflict_resolution_unavailable/,
        "Retention cannot turn accepting a remote record into a new tombstone");
    }
  } finally {
    adapter.close();
    keys.close();
  }
});
