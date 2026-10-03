/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncPreferences } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPreferences.sys.mjs");

add_task(function native_preferences_apply_and_clear_through_gecko() {
  const adapter = new MidoriSyncPreferences();
  const names = ["midori.workspaces.enabled", "midori.workspaces.unloadDelayMs",
    "midori.verticaltabs.position"];
  const values = [false, 120000, "right"];
  const records = names.map((name, index) => ({ version: 1, name, value: values[index] }));
  try {
    for (let index = 0; index < names.length; index++) {
      const name = names[index];
      const record = records[index];
      Assert.equal(adapter.read(name), null);
      Assert.deepEqual(adapter.apply({ id: name, deleted: false, value: record }), { status: "applied" });
      Assert.deepEqual(adapter.read(name), record);
      Assert.deepEqual(adapter.apply({ id: name, deleted: false, value: record }), { status: "applied" });
      Assert.deepEqual(adapter.apply({ id: name, deleted: true }, { deleted: false, value: record }),
        { status: "applied" });
      Assert.equal(Services.prefs.prefHasUserValue(name), false);
    }
  } finally {
    for (const name of names) {
      Services.prefs.clearUserPref(name);
    }
    adapter.close();
  }
});

add_task(function native_preferences_preserve_local_conflicts() {
  const adapter = new MidoriSyncPreferences();
  const name = "midori.verticaltabs.width";
  const previous = { version: 1, name, value: 300 };
  const incoming = { version: 1, name, value: 400 };
  try {
    Services.prefs.setIntPref(name, 350);
    Assert.deepEqual(adapter.apply({ id: name, deleted: false, value: incoming },
      { deleted: false, value: previous }), { status: "conflict", reason: "local_preference_changed" });
    Assert.equal(Services.prefs.getIntPref(name), 350);
    Assert.throws(() => adapter.validate("midori.sync.serverConfig",
      { version: 1, name: "midori.sync.serverConfig", value: "https://example.invalid" }), /invalid_record/);
  } finally {
    Services.prefs.clearUserPref(name);
    adapter.close();
  }
});
