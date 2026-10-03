/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncPasswords } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswords.sys.mjs");
const { MidoriSyncPasswordTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswordTracker.sys.mjs");

add_task(async function native_passwords_round_trip_through_login_manager() {
  const adapter = new MidoriSyncPasswords();
  const id = "{2048d315-eae9-4412-820b-6b6b25204453}";
  const base = { version: 1, origin: "https://example.invalid", formActionOrigin: "https://example.invalid",
    httpRealm: null, username: "someone", password: "initial secret", usernameField: "email",
    passwordField: "password", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  try {
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value: base }), { status: "applied" });
    Assert.deepEqual(await adapter.read(id), base);
    Assert.ok((await adapter.listIds()).includes(id));
    const changed = { ...base, password: "updated secret", timePasswordChanged: base.timePasswordChanged + 1000 };
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value: changed }, { deleted: false, value: base }),
      { status: "applied" });
    Assert.deepEqual(await adapter.read(id), changed);
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value: changed }, { deleted: false, value: base }),
      { status: "applied" }, "Replaying an applied revision leaves Login Manager unchanged");
    Assert.deepEqual(await adapter.apply({ id, deleted: true }, { deleted: false, value: changed }),
      { status: "applied" });
    Assert.equal(await adapter.read(id), null);
    await Assert.rejects(adapter.validate(id, { ...base, origin: "chrome://FirefoxAccounts" }), /invalid_record/);
  } finally {
    const [leftover] = await Services.logins.searchLoginsAsync({ guid: id });
    if (leftover) {
      await Services.logins.removeLoginAsync(leftover);
    }
    adapter.close();
  }
});

add_task(async function divergent_password_edits_are_preserved_as_conflicts() {
  const adapter = new MidoriSyncPasswords();
  const id = "{0f493a4d-ad6f-43e6-8e19-12d91ec51211}";
  const base = { version: 1, origin: "https://other.invalid", formActionOrigin: "https://other.invalid",
    httpRealm: null, username: "someone", password: "base secret", usernameField: "",
    passwordField: "", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  try {
    await adapter.apply({ id, deleted: false, value: base });
    const original = (await Services.logins.searchLoginsAsync({ guid: id }))[0];
    const local = original.clone();
    local.password = "local secret";
    await Services.logins.modifyLoginAsync(original, local);
    const remote = { ...base, password: "remote secret", timePasswordChanged: base.timePasswordChanged + 1000 };
    Assert.deepEqual(await adapter.apply({ id, deleted: false, value: remote }, { deleted: false, value: base }),
      { status: "conflict", reason: "password_diverged" });
    Assert.equal((await adapter.read(id)).password, "local secret");
  } finally {
    const [leftover] = await Services.logins.searchLoginsAsync({ guid: id });
    if (leftover) {
      await Services.logins.removeLoginAsync(leftover);
    }
    adapter.close();
  }
});

add_task(async function password_changes_wake_background_sync() {
  const adapter = new MidoriSyncPasswords();
  const id = "{5295597e-44a3-4d9b-a2b6-c625b0587c16}";
  let wake;
  const changed = new Promise(resolve => { wake = resolve; });
  let hints = 0;
  const tracker = new MidoriSyncPasswordTracker({ adapter, engine: {}, onChange: () => {
    hints++;
    wake();
  } });
  const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  login.init("https://hint.example.invalid", "https://hint.example.invalid", null,
    "hinted-user", "synthetic hint password", "username", "password");
  login.QueryInterface(Ci.nsILoginMetaInfo);
  login.guid = id;
  try {
    await Services.logins.addLoginAsync(login);
    await changed;
    Assert.ok(hints > 0, "A Login Manager change wakes background Sync");
    Assert.ok(tracker.snapshot.more, "The password remains queued for capture");
  } finally {
    tracker.close();
    const [leftover] = await Services.logins.searchLoginsAsync({ guid: id });
    if (leftover) {
      await Services.logins.removeLoginAsync(leftover);
    }
    adapter.close();
  }
});
