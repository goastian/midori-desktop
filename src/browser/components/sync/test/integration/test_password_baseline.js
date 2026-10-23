/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task, do_get_file, registerCleanupFunction */

const { MidoriSyncCollection } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncCollection.sys.mjs");
const { MidoriSyncPasswords } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswords.sys.mjs");
const { Sqlite } = ChromeUtils.importESModule("resource://gre/modules/Sqlite.sys.mjs");
const { MidoriSyncRecordTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswordTracker.sys.mjs");
const { openSyncStore } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncStore.sys.mjs");
const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
const uuid = () => Services.uuid.generateUUID().toString().slice(1, -1);
const encoder = new TextEncoder();

function readProcessFile(path) {
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  const input = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(Ci.nsIFileInputStream);
  input.init(file, 0x01, 0, 0);
  const converter = Cc["@mozilla.org/intl/converter-input-stream;1"].createInstance(Ci.nsIConverterInputStream);
  try {
    converter.init(input, "UTF-8", 8192, 0);
    let text = "";
    const chunk = {};
    while (converter.readString(8192, chunk)) {
      text += chunk.value;
    }
    return text;
  } finally {
    converter.close();
    input.close();
  }
}

async function processSample() {
  const pid = Services.appinfo.processID;
  const stat = readProcessFile(`/proc/${pid}/stat`);
  const status = readProcessFile(`/proc/${pid}/status`);
  const io = readProcessFile(`/proc/${pid}/io`);
  const fields = stat.slice(stat.lastIndexOf(")") + 2).split(/\s+/);
  const ticks = Number(Services.env.get("MIDORI_SYNC_BASELINE_CLK_TCK"));
  Assert.ok(Number.isInteger(ticks) && ticks > 0);
  const number = (text, name) => {
    const match = text.match(new RegExp(`^${name}:\\s+(\\d+)`, "m"));
    Assert.ok(match, `The process exposes ${name}`);
    return Number(match[1]);
  };
  Assert.ok(Number.isFinite(Number(fields[11])) && Number.isFinite(Number(fields[12])), "CPU counters are available");
  return { at: ChromeUtils.now(), cpuMs: (Number(fields[11]) + Number(fields[12])) * 1000 / ticks,
    rssBytes: number(status, "VmRSS") * 1024, peakRssBytes: number(status, "VmHWM") * 1024,
    readBytes: number(io, "read_bytes"), writeBytes: number(io, "write_bytes") };
}

function delta(before, after) {
  return { elapsedMs: after.at - before.at, cpuMs: after.cpuMs - before.cpuMs,
    rssBeforeBytes: before.rssBytes, rssAfterBytes: after.rssBytes, peakRssBytes: after.peakRssBytes,
    physicalReadBytes: after.readBytes - before.readBytes, physicalWriteBytes: after.writeBytes - before.writeBytes };
}

async function fileSizes(directory) {
  const files = {};
  for (const path of await IOUtils.getChildren(directory)) {
    const stat = await IOUtils.stat(path);
    if (stat.type === "regular") {
      files[PathUtils.filename(path)] = stat.size;
    }
  }
  return files;
}

add_task(async function native_password_capture_and_bootstrap_baseline() {
  const side = Services.env.get("MIDORI_SYNC_BASELINE_SIDE");
  const count = Number(Services.env.get("MIDORI_SYNC_BASELINE_COUNT"));
  const backend = Services.env.get("MIDORI_SYNC_BASELINE_BACKEND");
  const statePath = Services.env.get("MIDORI_SYNC_BASELINE_STATE");
  Assert.ok(["A", "B"].includes(side) && ["json", "rust"].includes(backend));
  Assert.ok(Number.isInteger(count) && count >= 1 && count <= 1000);
  const profileRoot = Services.env.get("MIDORI_SYNC_BASELINE_PROFILE_ROOT");
  Assert.ok(profileRoot && PathUtils.profileDir.startsWith(`${profileRoot}/`), "Profiles use the designated benchmark filesystem");
  await Services.logins.initializationPromise;
  Assert.equal(Services.logins.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIVariant)._storage.backendName, backend);
  Assert.equal((await Services.logins.getAllLogins()).length, 0, "A fresh isolated native store is required");
  const resources = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
  resources.setSubstitution("midori-sync-identity-test", Services.io.newFileURI(do_get_file(".")));
  registerCleanupFunction(() => resources.setSubstitution("midori-sync-identity-test", null));
  const { openLiveIdentitySession } = ChromeUtils.importESModule("resource://midori-sync-identity-test/identity_live_session.sys.mjs");
  const state = side === "A" ? { stores: { A: uuid(), B: uuid() }, devices: {}, records: {},
    ids: Array.from({ length: count }, uuid), reports: [] } : await IOUtils.readJSON(statePath);
  Assert.equal(state.ids.length, count);
  let sample = await processSample();
  const session = await openLiveIdentitySession({ side, stage: "seed", family: "passwords", state,
    fixturePath: Services.env.get("MIDORI_SYNC_BASELINE_FIXTURE"), createId: uuid });
  const report = { side, backend, count, runtime: "xpcshell",
    profiled: Services.env.get("MIDORI_SYNC_BASELINE_PROFILER") === "1",
    traced: Services.env.get("MIDORI_SYNC_BASELINE_TRACE") === "1", session: delta(sample, await processSample()),
    calls: [], logicalRequestJsonBytes: 0, logicalResponseJsonBytes: 0 };
  const directory = PathUtils.join(PathUtils.profileDir, "baseline-journal");
  const pageSize = Number(Services.env.get("MIDORI_SYNC_BASELINE_PAGE_SIZE") || 4096);
  Assert.ok([4096, 32768].includes(pageSize), "Only the new and legacy journal page sizes are compared");
  const storeOptions = { keys: session.keys, storeId: state.stores[side],
    deviceId: state.devices[side], directory, create: true };
  let journal = await openSyncStore(storeOptions);
  if (pageSize === 32768) {
    await journal.close();
    const database = await Sqlite.openConnection({ path: PathUtils.join(directory, `${state.stores[side]}.sqlite`) });
    try {
      await database.execute("PRAGMA page_size = 32768");
      await database.execute("VACUUM");
    } finally {
      await database.close();
    }
    journal = await openSyncStore({ ...storeOptions, create: false });
  }
  const adapter = new MidoriSyncPasswords();
  const engine = new MidoriSyncCollection({ collection: "passwords", adapter, journal, keys: session.keys,
    entryId: syncJournalEntryId, createId: uuid, request: async (path, options) => {
      const started = ChromeUtils.now();
      if (options.body) {
        const body = JSON.stringify(options.body);
        Assert.ok(!body.includes("public baseline secret"), "No plaintext fixture password is transmitted");
        report.logicalRequestJsonBytes += encoder.encode(body).length;
      }
      const response = await session.request(path, options);
      report.calls.push({ route: path.split("/").at(-1), elapsedMs: ChromeUtils.now() - started });
      report.logicalResponseJsonBytes += encoder.encode(JSON.stringify(response.data)).length;
      return response;
    } });
  const tracker = new MidoriSyncRecordTracker({ engine, adapter });
  const value = index => ({ version: 1, origin: `https://baseline-${index}.example.invalid`,
    formActionOrigin: `https://baseline-${index}.example.invalid`, httpRealm: null, username: `fixture-${index}`,
    password: `public baseline secret ${index}`, usernameField: "user", passwordField: "password",
    timeCreated: 1700000000000, timePasswordChanged: 1700000000000 });
  try {
    if (side === "A") {
      await engine.run();
      sample = await processSample();
      for (let index = 0; index < count; ++index) {
        const incoming = value(index);
        const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
        login.init(incoming.origin, incoming.formActionOrigin, null, incoming.username, incoming.password,
          incoming.usernameField, incoming.passwordField);
        login.QueryInterface(Ci.nsILoginMetaInfo);
        login.guid = state.ids[index];
        login.timeCreated = incoming.timeCreated;
        login.timePasswordChanged = incoming.timePasswordChanged;
        await Services.logins.addLoginAsync(login);
      }
      await adapter.flush();
      report.seed = delta(sample, await processSample());
    }
    report.calls = [];
    report.logicalRequestJsonBytes = 0;
    report.logicalResponseJsonBytes = 0;
    sample = await processSample();
    let passes = 0;
    for (; passes < count + 100; ++passes) {
      if (side === "A") {
        await tracker.run({ limit: 50 });
      }
      await engine.run();
      if (engine.snapshot.initialized && !engine.snapshot.more && (side === "B" || !tracker.snapshot.more)) {
        break;
      }
    }
    Assert.ok(passes < count + 100, "The measured work reaches quiescence");
    report.transfer = delta(sample, await processSample());
    report.passes = passes + 1;
    Assert.equal(engine.snapshot.pending, 0);
    Assert.equal(engine.snapshot.conflicts, 0);
    Assert.equal(engine.snapshot.localChanges, 0);
    Assert.equal(engine.snapshot.deferred, 0);
    report.nativeRecords = (await Services.logins.getAllLogins()).length;
    Assert.equal(report.nativeRecords, count);
    for (let index = 0; index < count; ++index) {
      Assert.deepEqual(await adapter.read(state.ids[index]), value(index), "Native values survive the complete transfer");
    }
    Assert.equal(Object.values(state.records).filter(record => !record.deleted).length, count);
    report.journalFilesBeforeClose = await fileSizes(directory);
    tracker.close();
    engine.close();
    await journal.close();
    report.journalFilesAfterClose = await fileSizes(directory);
    Assert.ok(!Services.prefs.getBoolPref("security.storage.encryption.sqlite.enabled", false),
      "The page-size comparison uses row-encrypted journals without whole-file SQLite encryption");
    const header = await IOUtils.read(PathUtils.join(directory, `${state.stores[side]}.sqlite`), { offset: 16, maxBytes: 2 });
    report.journalPageSize = header[0] * 256 + header[1];
    Assert.equal(report.journalPageSize, pageSize, "The measured journal uses the selected page size");
    state.reports.push(report);
    await IOUtils.writeJSON(statePath, state, { flush: true, permissions: 0o600 });
    await IOUtils.writeJSON(Services.env.get("MIDORI_SYNC_BASELINE_REPORT"), state.reports,
      { flush: true, permissions: 0o600 });
  } finally {
    tracker.close();
    engine.close();
    adapter.close();
    await journal.close();
    session.close();
  }
});
