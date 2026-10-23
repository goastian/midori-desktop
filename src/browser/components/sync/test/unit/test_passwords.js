/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task */

const { MidoriSyncPasswords } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswords.sys.mjs");
const { MidoriSyncPasswordTracker } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPasswordTracker.sys.mjs");

add_task(async function prepared_password_writes_resume_and_respect_explicit_conflict_choices() {
  const adapter = new MidoriSyncPasswords();
  const id = "{40111111-1111-4111-8111-111111111111}";
  const base = { version: 1, origin: "https://prepared-replay.example.invalid",
    formActionOrigin: "https://prepared-replay.example.invalid", httpRealm: null,
    username: "fixture", password: "public synthetic initial password", usernameField: "user",
    passwordField: "password", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  try {
    let previous = null;
    for (const value of [base, { ...base, password: "public synthetic changed password",
      timePasswordChanged: base.timePasswordChanged + 2000 }, null]) {
      const incoming = { id, deleted: value === null, value };
      const plan = await adapter.prepare(incoming, previous);
      Assert.deepEqual(await adapter.applyPrepared(plan), { status: "applied" });
      Assert.deepEqual(await adapter.applyPrepared(plan), { status: "applied" },
        "An already applied create, update or deletion can finish its durable intent");
      Assert.deepEqual(await adapter.read(id), value);
      previous = incoming;
    }
    await adapter.apply({ id, deleted: false, value: base });
    const local = { ...base, password: "public synthetic local password", timePasswordChanged: base.timePasswordChanged + 5000 };
    await adapter.apply({ id, deleted: false, value: local }, { id, deleted: false, value: base });
    const remote = { ...base, password: "public synthetic remote password", timePasswordChanged: base.timePasswordChanged + 1000 };
    const plan = await adapter.prepare({ id, deleted: false, value: remote }, { id, deleted: false, value: local },
      { resolution: { choice: "remote" } });
    Assert.deepEqual(await adapter.applyPrepared(plan), { status: "applied" });
    Assert.deepEqual(await adapter.read(id), remote, "An explicit remote choice preserves its exact dates");
    const obsolete = await adapter.prepare({ id, deleted: true }, { id, deleted: false, value: remote });
    await adapter.apply({ id, deleted: false, value: local }, { id, deleted: false, value: remote });
    Assert.equal((await adapter.applyPrepared(obsolete)).status, "deferred",
      "A genuine edit after preparation still prevents the deletion");
    Assert.deepEqual(await adapter.read(id), local);
  } finally {
    for (const login of await Services.logins.searchLoginsAsync({ origin: base.origin })) {
      await Services.logins.removeLoginAsync(login);
    }
    adapter.close();
  }
});

add_task(async function published_duplicate_identities_converge_and_wait_for_the_canonical_record() {
  const adapter = new MidoriSyncPasswords();
  try {
    for (const retainLocal of [false, true]) {
      const suffix = retainLocal ? "002" : "001";
      const low = `{30111111-1111-4111-8111-111111111${suffix}}`;
      const high = `{30222222-2222-4222-8222-222222222${suffix}}`;
      const local = retainLocal ? low : high;
      const incoming = retainLocal ? high : low;
      const origin = `https://canonical-${suffix}.example.invalid`;
      const value = { version: 1, origin, formActionOrigin: origin, httpRealm: null,
        username: "fixture", password: "public synthetic canonical password", usernameField: "user",
        passwordField: "password", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
      const received = { ...value, usernameField: "received-user", timeCreated: value.timeCreated - 1000 };
      await adapter.apply({ id: local, deleted: false, value });
      const plan = await adapter.prepare({ id: incoming, deleted: false, value: received }, null,
        { record: async id => id === local ? { pending: null, remote: { id, deleted: false, value } } : null });
      const result = { status: "applied", replacement: { id: high, replacementId: low } };
      Assert.deepEqual(await adapter.applyPrepared(plan), result);
      Assert.deepEqual(await adapter.applyPrepared(plan), result, "Replaying a stored identity plan is idempotent");
      Assert.deepEqual(await adapter.read(low), received);
      Assert.equal(await adapter.read(high), null);
      let canonical = null;
      const context = { record: async id => id === high ? { replacementId: low } : canonical };
      Assert.equal(await adapter.canDelete(high, value, context), false,
        "The old record remains until the canonical native value has a remote copy");
      canonical = { remote: { id: low, deleted: false, value: received }, pending: null, applying: null, blocked: false };
      Assert.equal(await adapter.canDelete(high, value, context), true);
      canonical.pending = "b68d2d84-2139-4af2-8263-6d2cf0acfc56";
      Assert.equal(await adapter.canDelete(high, value, context), false, "A pending canonical write cannot retire the old identity");
      canonical.pending = null;
      canonical.blocked = true;
      Assert.equal(await adapter.canDelete(high, value, context), false, "A conflict cannot authorize retiring the old identity");
      for (const login of await Services.logins.searchLoginsAsync({ origin })) {
        await Services.logins.removeLoginAsync(login);
      }
    }
  } finally {
    for (const suffix of ["001", "002"]) {
      for (const login of await Services.logins.searchLoginsAsync({ origin: `https://canonical-${suffix}.example.invalid` })) {
        await Services.logins.removeLoginAsync(login);
      }
    }
    adapter.close();
  }
});

add_task(async function unsupported_identities_never_create_or_rename_native_credentials() {
  const adapter = new MidoriSyncPasswords();
  const id = "{3f732ead-c4f8-4af7-b7ad-25ba5bc348f6}";
  const value = { version: 1, origin: "https://identity-boundaries.example.invalid",
    formActionOrigin: "https://identity-boundaries.example.invalid", httpRealm: null,
    username: "fixture", password: "public synthetic boundary password", usernameField: "user",
    passwordField: "password", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  try {
    await adapter.apply({ id, deleted: false, value });
    for (const invalid of ["x".repeat(65), "unicode-é", "guid,with,comma", "trailing-newline\n"]) {
      await Assert.rejects(adapter.apply({ id: invalid, deleted: false, value }), /invalid_record/);
      await Assert.rejects(adapter.apply({ id: invalid, deleted: true }), /invalid_record/);
      Assert.deepEqual(await adapter.read(id), value, "Rejected adoption preserves the original native credential");
      if (!invalid.includes("\n")) {
        Assert.deepEqual(await adapter.read(invalid, value), value, "Unsupported mirror IDs cannot imply a local deletion");
      }
    }
    Assert.deepEqual((await Services.logins.searchLoginsAsync({ origin: value.origin })).map(login => login.guid), [id]);
    for (const supported of ["x".repeat(64), "guid with space"]) {
      await adapter.apply({ id: supported, deleted: false, value });
      Assert.deepEqual(await adapter.read(supported), value, "Every supported ID survives native adoption exactly");
    }
  } finally {
    for (const login of await Services.logins.searchLoginsAsync({ origin: value.origin })) {
      await Services.logins.removeLoginAsync(login);
    }
    adapter.close();
  }
});

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
    Assert.greater(hints, 0, "A Login Manager change wakes background Sync");
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

add_task(async function an_identical_credential_adopts_the_remote_identity_instead_of_duplicating() {
  const adapter = new MidoriSyncPasswords();
  const local = "{6a1d7d28-b9a3-4b43-9d1b-3a3dc6d1c001}";
  const remote = "{6a1d7d28-b9a3-4b43-9d1b-3a3dc6d1c002}";
  const different = "{6a1d7d28-b9a3-4b43-9d1b-3a3dc6d1c003}";
  const value = { version: 1, origin: "https://dedupe.invalid", formActionOrigin: "https://dedupe.invalid",
    httpRealm: null, username: "same user", password: "same secret", usernameField: "user",
    passwordField: "pass", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  const received = { ...value, usernameField: "received-user", passwordField: "received-password",
    timeCreated: value.timeCreated - 1000, timePasswordChanged: value.timePasswordChanged + 1000 };
  try {
    await adapter.apply({ id: local, deleted: false, value });
    Assert.deepEqual(await adapter.apply({ id: remote, deleted: false, value: received }), { status: "applied" },
      "The same credential from another device is not stored twice");
    const logins = await Services.logins.searchLoginsAsync({ origin: value.origin });
    Assert.equal(logins.length, 1, "Only one login remains");
    Assert.equal(logins[0].guid, remote, "The local login adopts the remote GUID");
    Assert.deepEqual(await adapter.read(remote), received, "Adoption preserves received fields and timestamps");
    Assert.equal(await adapter.read(local), null);

    const conflicting = { ...value, password: "other secret" };
    Assert.deepEqual(await adapter.apply({ id: different, deleted: false, value: conflicting }),
      { status: "conflict", reason: "password_duplicate_credential" }, "A different password is never overwritten");
    Assert.equal((await adapter.read(remote)).password, "same secret");
    Assert.equal(await adapter.read(different), null);
  } finally {
    for (const login of await Services.logins.searchLoginsAsync({ origin: value.origin })) {
      await Services.logins.removeLoginAsync(login);
    }
    adapter.close();
  }
});

add_task(async function received_passwords_are_ordinary_native_logins_and_device_bound_origins_stay_local() {
  const adapter = new MidoriSyncPasswords();
  const id = "{6a1d7d28-b9a3-4b43-9d1b-3a3dc6d1c004}";
  const value = { version: 1, origin: "https://native.invalid", formActionOrigin: "https://native.invalid",
    httpRealm: null, username: "native user", password: "native secret", usernameField: "u",
    passwordField: "p", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  const proxy = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  proxy.init("moz-proxy://proxy.invalid:8080", null, "Proxy realm", "proxy user", "proxy secret", "", "");
  try {
    await adapter.apply({ id, deleted: false, value });
    const found = await Services.logins.searchLoginsAsync({ origin: value.origin, formActionOrigin: value.formActionOrigin });
    Assert.equal(found.length, 1, "The login is visible to autofill and the password manager");
    Assert.equal(found[0].password, "native secret");
    const edit = found[0].clone();
    edit.password = "edited natively";
    await Services.logins.modifyLoginAsync(found[0], edit);
    Assert.equal((await adapter.read(id)).password, "edited natively", "Editing from the native UI is reflected in the adapter");
    await Services.logins.addLoginAsync(proxy);
    Assert.ok(!(await adapter.listIds()).includes(proxy.guid), "A proxy credential is not synchronized");
    Assert.equal(await adapter.countUnsupported(), 1, "Device-bound credentials are counted, not silently dropped");
    const [current] = await Services.logins.searchLoginsAsync({ guid: id });
    await Services.logins.removeLoginAsync(current);
    Assert.equal(await adapter.read(id), null, "Deleting from the native UI removes it");
  } finally {
    for (const login of await Services.logins.getAllLogins()) {
      await Services.logins.removeLoginAsync(login);
    }
    adapter.close();
  }
});

add_task(async function identity_adoption_keeps_a_native_edit_between_lookup_and_write() {
  const adapter = new MidoriSyncPasswords();
  const manager = Services.logins.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIVariant);
  const storage = await manager._getStorage();
  const original = storage.modifyLoginAsync;
  const local = "{cd111111-1111-4111-8111-111111111111}";
  const remote = "{cd222222-2222-4222-8222-222222222222}";
  const value = { version: 1, origin: "https://identity-write-guard.example.invalid",
    formActionOrigin: "https://identity-write-guard.example.invalid", httpRealm: null,
    username: "fixture", password: "public synthetic race password", usernameField: "original-field",
    passwordField: "password", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  try {
    for (const [field, updated] of [["timeCreated", value.timeCreated + 5000], ["usernameField", "newer-local-field"]]) {
      await adapter.apply({ id: local, deleted: false, value });
      const plan = await adapter.prepare({ id: remote, deleted: false, value });
      let injected = false;
      storage.modifyLoginAsync = async function(before, changes, fromSync) {
        if (fromSync && !injected) {
          injected = true;
          const edit = Cc["@mozilla.org/hash-property-bag;1"].createInstance(Ci.nsIWritablePropertyBag);
          edit.setProperty(field, updated);
          await original.call(this, before, edit, field === "timeCreated");
          const [edited] = await Services.logins.searchLoginsAsync({ guid: local });
          Assert.equal(edited[field], updated, "The injected native edit is stored before applying the stale plan");
        }
        return original.call(this, before, changes, fromSync);
      };
      const result = await adapter.applyPrepared(plan);
      Assert.ok(injected, "The native edit occurs after adapter lookup and before the storage mutation");
      Assert.equal(result.status, "conflict", `A stale identity change cannot overwrite ${field}`);
      Assert.equal((await adapter.read(local))[field], updated);
      Assert.equal(await adapter.read(remote), null, "The stale plan creates no new native identity");
      storage.modifyLoginAsync = original;
      for (const login of await Services.logins.searchLoginsAsync({ origin: value.origin })) {
        await Services.logins.removeLoginAsync(login);
      }
    }
  } finally {
    storage.modifyLoginAsync = original;
    for (const login of await Services.logins.searchLoginsAsync({ origin: value.origin })) {
      await Services.logins.removeLoginAsync(login);
    }
    adapter.close();
  }
});

add_task(async function json_password_writes_recheck_after_async_lookup_and_keep_current_usage() {
  const manager = Services.logins.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIVariant);
  const storage = await manager._getStorage();
  if (storage.backendName !== "json") {
    return;
  }
  const adapter = new MidoriSyncPasswords();
  const originalSearch = storage.searchLoginsAsync;
  const originalModify = storage.modifyLoginAsync;
  const id = "{ce111111-1111-4111-8111-111111111111}";
  const base = { version: 1, origin: "https://json-write-await.example.invalid",
    formActionOrigin: "https://json-write-await.example.invalid", httpRealm: null,
    username: "fixture", password: "public synthetic async password", usernameField: "user",
    passwordField: "password", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  try {
    for (const field of ["timeCreated", "usage"]) {
      await adapter.apply({ id, deleted: false, value: base });
      const incoming = { ...base, username: "received" };
      const plan = await adapter.prepare({ id, deleted: false, value: incoming }, { id, deleted: false, value: base });
      let injected = false;
      let expectedUsage;
      storage.searchLoginsAsync = async function(query) {
        if (query.origin === base.origin && !injected) {
          injected = true;
          const [before] = await originalSearch.call(this, { guid: id });
          const edit = Cc["@mozilla.org/hash-property-bag;1"].createInstance(Ci.nsIWritablePropertyBag);
          if (field === "timeCreated") {
            edit.setProperty(field, base.timeCreated + 5000);
          } else {
            expectedUsage = { timesUsed: before.timesUsed + 3, timeLastUsed: before.timeLastUsed + 1000 };
            for (const [name, value] of Object.entries(expectedUsage)) {
              edit.setProperty(name, value);
            }
          }
          await originalModify.call(this, before, edit, false);
        }
        return originalSearch.call(this, query);
      };
      const result = await adapter.applyPrepared(plan);
      Assert.ok(injected, "The native change occurs during the asynchronous duplicate lookup");
      storage.searchLoginsAsync = originalSearch;
      const current = await adapter.read(id);
      if (field === "timeCreated") {
        Assert.equal(result.status, "conflict");
        Assert.equal(current.timeCreated, base.timeCreated + 5000, "The recheck preserves the new native date");
        Assert.equal(current.username, base.username, "A stale update cannot replace the native credential");
      } else {
        Assert.equal(result.status, "applied", "A use is not a conflicting edit");
        Assert.equal(current.username, incoming.username);
        const [login] = await Services.logins.searchLoginsAsync({ guid: id });
        Assert.equal(login.timesUsed, expectedUsage.timesUsed, "A Sync write preserves the latest usage count");
        Assert.equal(login.timeLastUsed, expectedUsage.timeLastUsed, "A Sync write preserves the latest usage time");
      }
      for (const login of await Services.logins.searchLoginsAsync({ origin: base.origin })) {
        await Services.logins.removeLoginAsync(login);
      }
    }
  } finally {
    storage.searchLoginsAsync = originalSearch;
    for (const login of await Services.logins.searchLoginsAsync({ origin: base.origin })) {
      await Services.logins.removeLoginAsync(login);
    }
    adapter.close();
  }
});

add_task(async function identity_adoption_preserves_a_target_created_after_the_adapter_lookup() {
  const adapter = new MidoriSyncPasswords();
  const manager = Services.logins.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIVariant);
  const storage = await manager._getStorage();
  const original = storage.modifyLoginAsync;
  const local = "{cf111111-1111-4111-8111-111111111111}";
  const remote = "{cf222222-2222-4222-8222-222222222222}";
  const value = { version: 1, origin: "https://identity-target-guard.example.invalid",
    formActionOrigin: "https://identity-target-guard.example.invalid", httpRealm: null,
    username: "fixture", password: "public synthetic source password", usernameField: "user",
    passwordField: "password", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  const otherOrigin = "https://identity-target-other.example.invalid";
  let occupied;
  try {
    await adapter.apply({ id: local, deleted: false, value });
    const plan = await adapter.prepare({ id: remote, deleted: false, value });
    storage.modifyLoginAsync = async function(before, changes, fromSync) {
      if (fromSync && !occupied) {
        const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
        login.init(otherOrigin, otherOrigin, null, "other", "public synthetic target password", "user", "password");
        login.QueryInterface(Ci.nsILoginMetaInfo).guid = remote;
        await Services.logins.addLoginAsync(login);
        occupied = await adapter.read(remote);
        Assert.equal(occupied.origin, otherOrigin, "The target is occupied before the stale identity request");
      }
      return original.call(this, before, changes, fromSync);
    };
    const result = await adapter.applyPrepared(plan);
    Assert.equal(result.status, "conflict");
    Assert.deepEqual(await adapter.read(local), value, "An occupied target preserves the source credential");
    Assert.deepEqual(await adapter.read(remote), occupied, "An occupied target preserves its unrelated credential");
  } finally {
    storage.modifyLoginAsync = original;
    for (const origin of [value.origin, otherOrigin]) {
      for (const login of await Services.logins.searchLoginsAsync({ origin })) {
        await Services.logins.removeLoginAsync(login);
      }
    }
    adapter.close();
  }
});

add_task(async function password_updates_keep_a_native_edit_between_lookup_and_write() {
  const adapter = new MidoriSyncPasswords();
  const manager = Services.logins.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIVariant);
  const storage = await manager._getStorage();
  const original = storage.modifyLoginAsync;
  const id = "{d0111111-1111-4111-8111-111111111111}";
  const base = { version: 1, origin: "https://password-update-guard.example.invalid",
    formActionOrigin: "https://password-update-guard.example.invalid", httpRealm: null,
    username: "fixture", password: "public synthetic initial password", usernameField: "original-field",
    passwordField: "password", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  const remote = { ...base, password: "public synthetic received password", timePasswordChanged: base.timePasswordChanged + 1000 };
  try {
    for (const [field, updated] of [["timeCreated", base.timeCreated + 5000],
      ["timePasswordChanged", base.timePasswordChanged + 5000],
      ["usernameField", "newer-local-field"], ["password", "public newer local password"], ["deleted", true]]) {
      await adapter.apply({ id, deleted: false, value: base });
      const plan = await adapter.prepare({ id, deleted: false, value: remote }, { id, deleted: false, value: base });
      let injected = false;
      storage.modifyLoginAsync = async function(before, changes, fromSync) {
        if (fromSync && !injected) {
          injected = true;
          if (field === "deleted") {
            await Services.logins.removeLoginAsync(before);
            Assert.equal(await adapter.read(id), null, "The native deletion precedes the Sync update");
          } else {
            const edit = Cc["@mozilla.org/hash-property-bag;1"].createInstance(Ci.nsIWritablePropertyBag);
            edit.setProperty(field, updated);
            await original.call(this, before, edit, ["timeCreated", "timePasswordChanged"].includes(field));
            const [edited] = await Services.logins.searchLoginsAsync({ guid: id });
            Assert.equal(edited[field], updated, "The concurrent native change is stored before the Sync update");
          }
        }
        return original.call(this, before, changes, fromSync);
      };
      const result = await adapter.applyPrepared(plan);
      Assert.ok(injected);
      Assert.equal(result.status, "conflict", `A stale update cannot overwrite ${field}`);
      if (field === "deleted") {
        Assert.equal(await adapter.read(id), null, "A stale update cannot restore a deleted credential");
      } else {
        Assert.equal((await adapter.read(id))[field], updated);
        Assert.equal((await adapter.read(id)).password, field === "password" ? updated : base.password,
          "A rejected update preserves the native password");
      }
      storage.modifyLoginAsync = original;
      for (const login of await Services.logins.searchLoginsAsync({ origin: base.origin })) {
        await Services.logins.removeLoginAsync(login);
      }
    }
  } finally {
    storage.modifyLoginAsync = original;
    for (const login of await Services.logins.searchLoginsAsync({ origin: base.origin })) {
      await Services.logins.removeLoginAsync(login);
    }
    adapter.close();
  }
});

add_task(async function password_updates_preserve_uses_after_the_adapter_lookup() {
  const adapter = new MidoriSyncPasswords();
  const manager = Services.logins.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIVariant);
  const storage = await manager._getStorage();
  const original = storage.modifyLoginAsync;
  const id = "{d0222222-2222-4222-8222-222222222222}";
  const base = { version: 1, origin: "https://password-update-usage.example.invalid",
    formActionOrigin: "https://password-update-usage.example.invalid", httpRealm: null,
    username: "fixture", password: "public synthetic initial password", usernameField: "user",
    passwordField: "password", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  let used;
  try {
    await adapter.apply({ id, deleted: false, value: base });
    const incoming = { ...base, password: "public synthetic received password", timePasswordChanged: base.timePasswordChanged + 1000 };
    const plan = await adapter.prepare({ id, deleted: false, value: incoming }, { id, deleted: false, value: base });
    storage.modifyLoginAsync = async function(before, changes, fromSync) {
      if (fromSync && !used) {
        for (let i = 0; i < 3; i++) {
          const [current] = await Services.logins.searchLoginsAsync({ guid: id });
          const use = Cc["@mozilla.org/hash-property-bag;1"].createInstance(Ci.nsIWritablePropertyBag);
          use.setProperty("timesUsedIncrement", 1);
          use.setProperty("timeLastUsed", Date.now());
          await original.call(this, current, use, false);
        }
        [used] = await Services.logins.searchLoginsAsync({ guid: id });
        Assert.equal(used.timesUsed, before.timesUsed + 3);
      }
      return original.call(this, before, changes, fromSync);
    };
    const result = await adapter.applyPrepared(plan);
    Assert.ok(used, "Native usage occurs after the adapter lookup");
    Assert.equal(result.status, "applied", "A new use is compatible with a received edit");
    Assert.deepEqual(await adapter.read(id), incoming);
    const [current] = await Services.logins.searchLoginsAsync({ guid: id });
    Assert.equal(current.timesUsed, used.timesUsed);
    Assert.equal(current.timeLastUsed, used.timeLastUsed);
  } finally {
    storage.modifyLoginAsync = original;
    for (const login of await Services.logins.searchLoginsAsync({ origin: base.origin })) {
      await Services.logins.removeLoginAsync(login);
    }
    adapter.close();
  }
});

add_task(async function password_deletions_keep_a_native_edit_between_lookup_and_remove() {
  const adapter = new MidoriSyncPasswords();
  const manager = Services.logins.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIVariant);
  const storage = await manager._getStorage();
  const originalRemove = storage.removeLoginAsync;
  const originalModify = storage.modifyLoginAsync;
  const base = { version: 1, origin: "https://password-delete-guard.example.invalid",
    formActionOrigin: "https://password-delete-guard.example.invalid", httpRealm: null,
    username: "fixture", password: "public synthetic retained password", usernameField: "user",
    passwordField: "password", timeCreated: 1700000000000, timePasswordChanged: 1700000000000 };
  const cases = [["timeCreated", base.timeCreated + 5000], ["timePasswordChanged", base.timePasswordChanged + 5000],
    ["usernameField", "retained-local-field"], ["password", "public synthetic newer password"],
    ["usage", null], ["removed", null]];
  try {
    for (const [index, [field, updated]] of cases.entries()) {
      const id = `{d03${index}3333-3333-4333-8333-333333333333}`;
      await adapter.apply({ id, deleted: false, value: base });
      const plan = await adapter.prepare({ id, deleted: true, value: null }, { id, deleted: false, value: base });
      let injected = false;
      let retained;
      storage.removeLoginAsync = async function(before, fromSync) {
        if (!injected && before.guid === id) {
          injected = true;
          Assert.ok(fromSync, "Only the Sync path requests the conditional deletion");
          if (field === "removed") {
            await originalRemove.call(this, before, false);
            Assert.equal(await adapter.read(id), null, "The native deletion precedes the retry");
          } else {
            const edit = Cc["@mozilla.org/hash-property-bag;1"].createInstance(Ci.nsIWritablePropertyBag);
            if (field === "usage") {
              edit.setProperty("timesUsedIncrement", 1);
            } else {
              edit.setProperty(field, updated);
            }
            await originalModify.call(this, before, edit, ["timeCreated", "timePasswordChanged"].includes(field));
            if (field === "usage") {
              const [used] = await Services.logins.searchLoginsAsync({ guid: id });
              Assert.equal(used.timesUsed, before.timesUsed + 1, "The new use precedes the deletion");
            } else {
              retained = await adapter.read(id);
              Assert.equal(retained[field], updated, "The edit is stored before the old deletion request");
            }
          }
        }
        return originalRemove.call(this, before, fromSync);
      };
      const result = await adapter.applyPrepared(plan);
      Assert.ok(injected);
      if (["usage", "removed"].includes(field)) {
        Assert.equal(result.status, "applied", "A use or an already completed deletion is compatible");
        Assert.equal(await adapter.read(id), null);
      } else {
        Assert.equal(result.status, "conflict", `A stale deletion cannot remove the change to ${field}`);
        Assert.deepEqual(await adapter.read(id), retained, "The rejected deletion preserves the complete newer credential");
      }
      storage.removeLoginAsync = originalRemove;
      for (const login of await Services.logins.searchLoginsAsync({ origin: base.origin })) {
        await Services.logins.removeLoginAsync(login);
      }
    }
  } finally {
    storage.removeLoginAsync = originalRemove;
    for (const login of await Services.logins.searchLoginsAsync({ origin: base.origin })) {
      await Services.logins.removeLoginAsync(login);
    }
    adapter.close();
  }
});
