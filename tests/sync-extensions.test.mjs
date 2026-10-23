import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { MidoriSyncExtensions } from "../src/browser/components/sync/MidoriSyncExtensions.sys.mjs";
import { deriveSyncExtensionId } from "../src/browser/components/sync/MidoriSyncExtensionModel.sys.mjs";
import { extensionStoreFixture, addonId, value, gate, turn } from "./sync-extension-fixtures.mjs";

async function fixture(options = {}) {
  const f = extensionStoreFixture();
  const deriveRecordId = async (collection, bytes) => createHmac("sha256", "adapter fixture").update(collection).update(bytes).digest("hex");
  const id = await deriveSyncExtensionId("amo", addonId, deriveRecordId);
  const records = new Map();
  const create = () => new MidoriSyncExtensions({ store: f.store, deriveRecordId, record: async id => records.get(id) ?? null, ...options });
  const context = { progress: null, signal: new AbortController().signal, async checkpoint(progress) { context.progress = structuredClone(progress); } };
  return Object.assign(f, { id, records, create, context, adapter: create(), incoming: (data = value(), revision = "1") => ({
    id, revision, deleted: false, authenticatedSchema: 2, value: data }),
  });
}

const start = async f => f.adapter.applyPreparedWithCheckpoint(await f.adapter.prepare(f.incoming()), f.context);

function retryClock() {
  let now = 1700000000000;
  let nextId = 0;
  const pending = new Map();
  return {
    now: () => now,
    timers: { setTimeout(callback, delay) { const id = ++nextId; pending.set(id, { at: now + delay, callback }); return id; },
      clearTimeout(id) { pending.delete(id); } },
    advance(delay) {
      now += delay;
      for (const [id, task] of pending) {
        if (task.at <= now) { pending.delete(id); task.callback(); }
      }
    },
    get pending() { return pending.size; },
  };
}

test("transient catalog failures retry with durable backoff without repeated polls or permission prompts", async () => {
  const clock = retryClock();
  const f = await fixture(clock);
  f.catalogGate = Promise.reject(new Error("synthetic offline catalog"));
  await start(f); await turn();
  assert.equal(f.context.progress.phase, "waiting");
  assert.equal(f.context.progress.reason, "extension_download_failed");
  assert.equal(f.context.progress.attempt, 1);
  assert.equal(f.context.progress.retryAt, clock.now() + 30000);
  const summary = await f.adapter.applicationSummary({ incoming: f.incoming(), progress: f.context.progress });
  assert.equal(summary.reason, "extension_retry_scheduled");
  f.catalogGate = null;
  for (let poll = 0; poll < 3; ++poll) {
    assert.deepEqual(await start(f), { status: "deferred", reason: "extension_retry_scheduled" });
  }
  assert.equal(clock.pending, 1);
  assert.ok(!f.calls.includes("native-installer"));
  clock.advance(30000);
  await start(f); await turn();
  assert.equal(f.context.progress.phase, "installed");
  assert.equal(f.context.progress.attempt, 2);
  assert.equal(f.calls.filter(call => call === "native-prompt").length, 1);
  assert.equal(clock.pending, 0);
  f.adapter.close();
});

test("automatic catalog retries are bounded and explicit review starts a fresh attempt budget", async () => {
  const clock = retryClock();
  const f = await fixture(clock);
  for (let attempt = 1; attempt <= 5; ++attempt) {
    f.catalogGate = Promise.reject(new Error("synthetic persistent offline catalog"));
    await start(f); await turn();
    assert.equal(f.context.progress.attempt, attempt);
    if (attempt < 5) {
      assert.equal(f.context.progress.retryAt - clock.now(), 30000 * 2 ** (attempt - 1));
      await start(f);
      clock.advance(f.context.progress.retryAt - clock.now());
    }
  }
  assert.equal(f.context.progress.phase, "failed");
  assert.equal(f.context.progress.retryAt, undefined);
  assert.deepEqual(await start(f), { status: "deferred", reason: "extension_download_failed" });
  assert.equal(clock.pending, 0);
  f.catalogGate = null;
  f.adapter.reviewInstall(f.id);
  await start(f); await turn();
  assert.equal(f.context.progress.phase, "installed");
  assert.equal(f.context.progress.attempt, 1);
  f.adapter.close();
});

test("reopening preserves retry delay and pausing clears its wakeup without reviving a job", async () => {
  const clock = retryClock();
  const f = await fixture(clock);
  f.catalogGate = Promise.reject(new Error("synthetic offline catalog"));
  await start(f); await turn();
  await start(f);
  assert.equal(clock.pending, 1);
  f.adapter.close();
  assert.equal(clock.pending, 0);
  f.adapter = f.create();
  const controller = new AbortController();
  f.context.signal = controller.signal;
  assert.deepEqual(await start(f), { status: "deferred", reason: "extension_retry_scheduled" });
  assert.equal(clock.pending, 1);
  controller.abort();
  assert.equal(clock.pending, 0);
  clock.advance(30000);
  assert.ok(!f.calls.includes("native-installer"));
  f.adapter.close();
});

test("a backward wall clock after reopening cannot defer a retry indefinitely", async () => {
  const clock = retryClock();
  const f = await fixture(clock);
  f.catalogGate = Promise.reject(new Error("synthetic offline catalog"));
  await start(f); await turn();
  const deadline = f.context.progress.retryAt;
  f.adapter.close();
  clock.advance(-86400000);
  f.adapter = f.create();
  assert.deepEqual(await start(f), { status: "deferred", reason: "extension_retry_scheduled" });
  f.catalogGate = null;
  clock.advance(10 * 60000);
  assert.ok(clock.now() < deadline);
  await start(f); await turn();
  assert.equal(f.context.progress.phase, "installed");
  assert.equal(f.context.progress.attempt, 2);
  f.adapter.close();
});

test("a stalled download consumes the retry budget while a permission timeout continues to require review", async () => {
  const clock = retryClock();
  const f = await fixture(clock);
  f.catalogGate = gate().promise;
  await start(f); await turn();
  clock.advance(10 * 60000);
  await turn();
  assert.equal(f.context.progress.reason, "extension_download_failed");
  assert.equal(f.context.progress.attempt, 1);
  assert.equal(f.context.progress.retryAt, clock.now() + 30000);
  f.catalogGate = null;
  const permission = gate();
  f.beforePrompt = () => permission.promise;
  clock.advance(30000);
  await start(f); await turn();
  assert.equal(f.context.progress.phase, "awaiting-user");
  clock.advance(10 * 60000);
  await turn();
  assert.equal(f.context.progress.phase, "awaiting-user");
  assert.equal(f.context.progress.attempt, 2);
  assert.deepEqual(await start(f), { status: "deferred", reason: "extension_permission_required" });
  permission.resolve();
  f.adapter.close();
});

test("capture publishes signed user intent, persists it and excludes unsigned or managed values", async () => {
  const f = await fixture(); f.installed.set(addonId, f.makeAddon());
  assert.deepEqual(await f.adapter.listIds(), [f.id]);
  assert.deepEqual(await f.adapter.read(f.id), value());
  assert.equal(f.tracked.size, 0);
  await f.adapter.flush();
  assert.ok(f.tracked.has(addonId));
  f.managed = true;
  assert.deepEqual(await f.adapter.listIds(), []);
  assert.equal(await f.adapter.read(f.id), null);
  assert.equal(f.adapter.matchesLocal(f.id, null, value()), true);
  assert.equal(await f.adapter.canDelete(f.id, value()), false);
  assert.equal(await f.adapter.countUnsupported(), 1);
});

test("only an explicit durable user removal permits outgoing deletion", async () => {
  const f = await fixture();
  assert.equal(await f.adapter.canDelete(f.id, value()), false);
  for (const source of ["policy", "sync", "unknown", "user"]) {
    f.tracked.set(addonId, { source, token: `receipt:${source}` });
    assert.equal(await f.adapter.canDelete(f.id, value()), source === "user");
  }
  assert.equal(await f.adapter.read(f.id), null);
  await f.adapter.flush();
  assert.deepEqual(f.calls.slice(-3), ["database", "startup", "preferences"]);
});

test("matching adoption requires both native barriers and cannot absorb an unsigned replacement", async () => {
  const f = await fixture(); f.installed.set(addonId, f.makeAddon());
  f.failStartup = true;
  await assert.rejects(f.adapter.canAdoptRecord(f.incoming()), { code: "native_write_failed" });
  f.failStartup = false;
  assert.equal(await f.adapter.canAdoptRecord(f.incoming()), true);
  f.installed.get(addonId).signedState = 1;
  assert.equal(await f.adapter.canAdoptRecord(f.incoming()), false);
});

test("download and native permission confirmation run in the background with durable progress first", async () => {
  const f = await fixture(); const permission = gate(); f.beforePrompt = () => permission.promise;
  let notifications = 0; const stop = f.adapter.observe(() => { notifications++; });
  assert.deepEqual(await start(f), { status: "deferred", reason: "extension_downloading" });
  await turn();
  assert.equal(f.context.progress.phase, "awaiting-user");
  assert.ok(f.calls.includes("native-prompt"));
  assert.equal(f.installed.size, 0);
  assert.deepEqual(await start(f), { status: "deferred", reason: "extension_permission_required" });
  assert.equal(f.calls.filter(call => call === "native-installer").length, 1);
  permission.resolve(); await turn();
  assert.equal(f.context.progress.phase, "installed");
  assert.ok(notifications > 0);
  assert.deepEqual(await start(f), { status: "applied" });
  assert.equal((await f.adapter.read(f.id)).enabled, true);
  stop(); f.adapter.close();
});

test("permission rejection survives an adapter restart and requires explicit local review", async () => {
  const f = await fixture(); f.approve = false;
  await start(f); await turn();
  assert.equal(f.context.progress.phase, "declined");
  assert.equal(f.context.progress.reason, "extension_permission_declined");
  f.adapter.close(); f.adapter = f.create();
  for (let attempt = 0; attempt < 3; ++attempt) {
    assert.deepEqual(await start(f), { status: "deferred", reason: "extension_permission_declined" });
  }
  assert.equal(f.calls.filter(call => call === "native-installer").length, 1);
  f.approve = true; f.adapter.reviewInstall(f.id);
  await start(f); await turn();
  assert.equal(f.context.progress.phase, "installed");
  assert.equal(f.calls.filter(call => call === "native-installer").length, 2);
});

test("an interrupted permission request waits for review after reopening", async () => {
  const f = await fixture(); const permission = gate(); f.beforePrompt = () => permission.promise;
  await start(f); await turn();
  assert.equal(f.context.progress.phase, "awaiting-user");
  f.adapter.close(); await turn(); f.adapter = f.create();
  assert.deepEqual(await start(f), { status: "deferred", reason: "extension_permission_required" });
  assert.equal(f.calls.filter(call => call === "native-installer").length, 1);
  assert.equal(f.installed.size, 0);
  permission.resolve();
});

test("pausing the engine cancels its background installer and cannot write later progress", async () => {
  const f = await fixture(); const permission = gate(); f.beforePrompt = () => permission.promise;
  const controller = new AbortController(); f.context.signal = controller.signal;
  await start(f); await turn();
  const previous = structuredClone(f.context.progress);
  controller.abort(); await turn(); permission.resolve(); await turn();
  assert.deepEqual(f.context.progress, previous);
  assert.equal(f.installed.size, 0);
  assert.ok(f.calls.includes("cancel"));
});

test("a failed durable prompt checkpoint prevents the native permission request", async () => {
  const f = await fixture(); const checkpoint = f.context.checkpoint;
  f.context.checkpoint = async progress => {
    if (progress.phase === "awaiting-user") { throw new Error("synthetic journal failure"); }
    return checkpoint(progress);
  };
  await start(f); await turn();
  assert.ok(!f.calls.includes("native-prompt"));
  assert.equal(f.installed.size, 0);
  assert.ok(["waiting", "failed"].includes(f.context.progress.phase));
});

test("a superseded job does not wait for a checkpoint while holding the engine", { timeout: 2000 }, async () => {
  const f = await fixture(); const checkpoint = gate();
  f.context.checkpoint = async progress => { await checkpoint.promise; f.context.progress = progress; };
  await start(f);
  const newer = await f.adapter.prepare(f.incoming(value(false), "2"));
  assert.deepEqual(await f.adapter.applyPreparedWithCheckpoint(newer, f.context), { status: "deferred", reason: "extension_local_changed" });
  checkpoint.resolve(); await turn();
  assert.ok(!f.calls.includes("native-installer"));
});

test("an installer in progress cannot publish an intermediate enablement value or infer a deletion", async () => {
  const f = await fixture(); const catalog = gate(); f.catalogGate = catalog.promise;
  await start(f); await turn();
  f.installed.set(addonId, f.makeAddon());
  assert.deepEqual(await f.adapter.listIds(), []);
  assert.equal(await f.adapter.read(f.id), null);
  assert.equal(f.adapter.matchesLocal(f.id, null, value()), true);
  assert.equal(await f.adapter.canDelete(f.id, value()), false);
  catalog.resolve(); await turn();
  assert.ok(!f.calls.includes("native-installer"));
});

test("a conflicting local change still needs review and a policy cannot be bypassed", async () => {
  const f = await fixture(); f.installed.set(addonId, f.makeAddon(addonId, { userDisabled: true }));
  const deleted = { id: f.id, deleted: true, authenticatedSchema: 2 };
  assert.deepEqual(await f.adapter.apply(deleted, f.incoming()), { status: "conflict", reason: "extension_changed" });
  f.managed = true;
  const reviewed = await f.adapter.prepare(deleted, f.incoming(), { resolution: { choice: "remote" } });
  assert.deepEqual(await f.adapter.applyPrepared(reviewed), { status: "deferred", reason: "extension_policy" });
  assert.ok(f.installed.has(addonId));
});
