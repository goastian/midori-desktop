/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task, add_setup, BrowserTestUtils, gBrowser */

const { MidoriSyncPreferences: PersistentPreferences } = ChromeUtils.importESModule("resource:///modules/MidoriSyncPreferences.sys.mjs");
const preferenceName = "midori.verticaltabs.width";

function preferenceFile() {
  const path = Services.dirsvc.get("PrefF", Ci.nsIFile).path;
  Assert.equal(PathUtils.parent(path), PathUtils.profileDir, "Only the isolated profile is modified");
  return path;
}

add_setup(async function close_startup_tabs() {
  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

add_task(async function preference_barriers_preserve_queued_changes_and_deletions() {
  const adapter = new PersistentPreferences();
  const record = value => ({ id: preferenceName, deleted: false,
    value: { version: 1, name: preferenceName, value } });
  try {
    adapter.apply(record(300));
    const first = adapter.flush();
    adapter.apply(record(320), record(300));
    const second = adapter.flush();
    await Promise.all([first, second]);
    Assert.ok((await IOUtils.readUTF8(preferenceFile())).includes(`user_pref("${preferenceName}", 320);`),
      "The last queued preference is saved when both barriers complete");
    adapter.apply({ id: preferenceName, deleted: true }, record(320));
    await adapter.flush();
    Assert.ok(!(await IOUtils.readUTF8(preferenceFile())).includes(`user_pref("${preferenceName}",`),
      "The deletion is saved before acknowledging it");
  } finally {
    Services.prefs.clearUserPref(preferenceName);
    await adapter.flush();
    adapter.close();
  }
});

add_task(async function preference_barriers_reject_coalesced_io_failures_and_retry() {
  const adapter = new PersistentPreferences();
  const path = preferenceFile();
  const backup = `${path}.synthetic-persistence-backup`;
  await adapter.flush();
  await IOUtils.move(path, backup);
  await IOUtils.makeDirectory(path);
  try {
    Services.prefs.setIntPref(preferenceName, 340);
    const first = adapter.flush();
    Services.prefs.setIntPref(preferenceName, 350);
    const second = adapter.flush();
    const results = await Promise.allSettled([first, second]);
    Assert.ok(results.every(result => result.status === "rejected"),
      "Every barrier reports the failed native write, including coalesced requests");
  } finally {
    await IOUtils.remove(path, { recursive: true });
    await IOUtils.move(backup, path, { noOverwrite: false });
    Services.prefs.setIntPref(preferenceName, 360);
    await adapter.flush();
    Assert.ok((await IOUtils.readUTF8(path)).includes(`user_pref("${preferenceName}", 360);`),
      "The same service recovers after the write target becomes available");
    Services.prefs.clearUserPref(preferenceName);
    await adapter.flush();
    adapter.close();
  }
});
