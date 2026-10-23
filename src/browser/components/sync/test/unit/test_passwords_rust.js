/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_setup(async function rust_login_backend_is_active() {
  await Services.logins.initializationPromise;
  const manager = Services.logins.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIVariant);
  Assert.equal(manager._storage.backendName, "rust", "The complete password suite uses Rust storage");
});

load(do_get_file("test_passwords.js").path);

add_task(async function identity_adoption_keeps_a_native_edit_after_the_preview() {
  const { MidoriSyncPasswords: RustPasswords } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswords.sys.mjs");
  const { modifyLoginForSync } = ChromeUtils.importESModule("resource://gre/modules/LoginManager.sys.mjs");
  const adapter = new RustPasswords();
  const local = "{c81793e2-8894-4e5f-bbdc-e7b249036c11}";
  const remote = "{c81793e2-8894-4e5f-bbdc-e7b249036c12}";
  const value = { version: 1, origin: "https://identity-race.invalid", formActionOrigin: "https://identity-race.invalid",
    httpRealm: null, username: "fixture", password: "public synthetic identity password", usernameField: "user",
    passwordField: "pass", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  try {
    await adapter.apply({ id: local, deleted: false, value });
    const [preview] = await Services.logins.searchLoginsAsync({ guid: local });
    const edit = Cc["@mozilla.org/hash-property-bag;1"].createInstance(Ci.nsIWritablePropertyBag);
    edit.setProperty("usernameField", "locally-edited-field");
    await Services.logins.modifyLoginAsync(preview, edit);
    const adoption = Cc["@mozilla.org/hash-property-bag;1"].createInstance(Ci.nsIWritablePropertyBag);
    adoption.setProperty("guid", remote);
    await Assert.rejects(modifyLoginForSync(Services.logins, preview, adoption),
      error => error.code === "login_identity_changed", "The native transaction rejects a stale preview");
    Assert.equal((await adapter.read(local)).usernameField, "locally-edited-field");
    Assert.equal(await adapter.read(remote), null, "The stale request creates no second credential");
  } finally {
    for (const login of await Services.logins.searchLoginsAsync({ origin: value.origin })) {
      await Services.logins.removeLoginAsync(login);
    }
    adapter.close();
  }
});
