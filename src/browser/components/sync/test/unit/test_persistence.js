/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { JSONFile } = ChromeUtils.importESModule("resource://gre/modules/JSONFile.sys.mjs");

add_task(async function json_barrier_serializes_inflight_writes_without_closing_the_store() {
  const path = PathUtils.join(PathUtils.profileDir, "sync-json-barrier.json");
  let release;
  let started;
  const entered = new Promise(resolve => { started = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  let writes = 0;
  const file = new JSONFile({ path, saveDelayMs: 600000, beforeSave() {
    if (++writes === 1) {
      started();
      return blocked;
    }
    return undefined;
  } });
  file.data = { revision: 1 };
  try {
    const first = file._save();
    await entered;
    file.data = { revision: 2 };
    const barrier = file.saveNow();
    Assert.equal(writes, 1, "The barrier queues behind an active deferred write");
    release();
    await Promise.all([first, barrier]);
    Assert.equal(writes, 2);
    Assert.deepEqual(await IOUtils.readJSON(path), { revision: 2 });
    file.data = { revision: 3 };
    file.saveSoon();
    await file.saveNow();
    Assert.deepEqual(await IOUtils.readJSON(path), { revision: 3 }, "The store remains writable after a barrier");
  } finally {
    release();
    await file.finalize();
  }
});

add_task(async function json_barrier_propagates_real_write_errors_and_allows_retry() {
  const parent = PathUtils.join(PathUtils.profileDir, "sync-json-blocked-parent");
  await IOUtils.writeUTF8(parent, "This is a file, so the child cannot be written");
  const path = PathUtils.join(parent, "data.json");
  let failures = 0;
  const file = new JSONFile({ path, saveFailureHandler() { ++failures; } });
  file.data = { revision: 1 };
  try {
    await Assert.rejects(file.saveNow(), /./, "A native storage error cannot acknowledge persistence");
    Assert.equal(failures, 1, "The producer's existing failure handler still runs");
    Assert.equal(await IOUtils.readUTF8(parent), "This is a file, so the child cannot be written");
    await IOUtils.remove(parent);
    await IOUtils.makeDirectory(parent);
    await file.saveNow();
    Assert.deepEqual(await IOUtils.readJSON(path), { revision: 1 }, "The same live store retries successfully");
  } finally {
    await file.finalize();
  }
});

add_task(async function shutdown_waits_for_an_active_barrier_before_clearing_the_data() {
  const path = PathUtils.join(PathUtils.profileDir, "sync-json-shutdown-barrier.json");
  let release;
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  const file = new JSONFile({ path, beforeSave() { entered(); return blocked; } });
  file.data = { revision: 4 };
  const saving = file.saveNow();
  await started;
  let finalized = false;
  const closing = file.finalize().then(() => { finalized = true; });
  try {
    await Promise.resolve();
    Assert.equal(finalized, false);
    Assert.equal(file.dataReady, true, "Shutdown cannot clear the data beneath the active writer");
    release();
    await Promise.all([saving, closing]);
    Assert.deepEqual(await IOUtils.readJSON(path), { revision: 4 });
    Assert.equal(file.dataReady, false);
    await Assert.rejects(file.saveNow(), /already been finalized/);
  } finally {
    release();
    await closing;
  }
});
