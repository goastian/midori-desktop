/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task, add_setup, registerCleanupFunction */

const { MidoriSyncService } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncService.sys.mjs");
const { SYNC_DESKTOP_COLLECTIONS } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncProtocol.sys.mjs");
const coreCollectionSupport = Object.freeze({ tabs: true, bookmarks: true, history: true, passwords: true, "browser-settings": true });
const supportedConnection = { snapshot: { capabilities: { collectionSupport: coreCollectionSupport } } };

add_setup(function use_a_settled_key_registry() {
  const original = Object.getOwnPropertyDescriptor(MidoriSyncService, "keys");
  Object.defineProperty(MidoriSyncService, "keys", {
    configurable: true, value: { snapshot: { rotation: null } },
  });
  registerCleanupFunction(() => Object.defineProperty(MidoriSyncService, "keys", original));
});

add_task(async function an_active_rotation_blocks_manual_and_background_sync() {
  MidoriSyncService.keys.snapshot.rotation = { phase: "rewriting" };
  try {
    await Assert.rejects(MidoriSyncService.syncNow(), /encryption_rotation_required/);
    await Assert.rejects(MidoriSyncService.syncNow({ background: true }), /encryption_rotation_required/);
  } finally {
    MidoriSyncService.keys.snapshot.rotation = null;
  }
});

add_task(async function conflict_decisions_exclude_background_views_and_cancel_on_account_change() {
  const account = { snapshot: { generation: 1, collectionSupport: coreCollectionSupport } };
  let enter;
  let release;
  const entered = new Promise(resolve => { enter = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const view = { account, async collection() {
    return {
      async resolveConflict() { enter(); await held; return { pending: true }; },
      async conflictPage() { return { entries: [] }; },
    };
  } };
  const deciding = MidoriSyncService.resolveConflict.call(view, "bookmarks", {});
  await entered;
  await Assert.rejects(MidoriSyncService.conflictPage.call(view, "bookmarks"), /busy/);
  await Assert.rejects(MidoriSyncService.conflictPreview.call(view, "bookmarks"), /busy/);
  await Assert.rejects(MidoriSyncService.resolveConflict.call(view, "bookmarks", {}), /busy/);
  account.snapshot.generation = 2;
  release();
  await Assert.rejects(deciding, /cancelled/);
  Assert.deepEqual(await MidoriSyncService.conflictPage.call(view, "bookmarks"), { entries: [] },
    "The exclusion guard is released after a cancelled decision");
});

add_task(async function a_remote_tabs_view_cannot_reopen_the_journal_during_manual_work() {
  const account = { snapshot: { generation: 1, device: { id: "107cf1f2-bfdc-4cde-a416-a8ec8576a36b" } } };
  let journalReads = 0;
  const view = { account, get journal() { ++journalReads; throw new Error("journal_probe"); } };
  const replacements = {
    account, connection: { snapshot: { capabilities: { collectionSupport: { tabs: true, bookmarks: true, history: true, passwords: true, "browser-settings": true } } } },
    async syncTabs() {
      await Assert.rejects(MidoriSyncService.remoteTabs.call(view), /busy/,
        "Read-only UI cannot reopen a journal while its owner is doing exclusive work");
      Assert.equal(journalReads, 0);
      throw Object.assign(new Error("fixture_failure"), { code: "fixture_failure" });
    },
    async syncBookmarks() { return { more: false }; },
    async syncHistory() { return { more: false }; },
    async syncPasswords() { return { more: false }; },
    async syncPreferences() { return { more: false }; },
  };
  const originals = new Map();
  for (const [name, value] of Object.entries(replacements)) {
    originals.set(name, Object.getOwnPropertyDescriptor(MidoriSyncService, name));
    Object.defineProperty(MidoriSyncService, name, { configurable: true, value });
  }
  try {
    const result = await MidoriSyncService.syncNow();
    Assert.equal(result.errors.tabs, "fixture_failure");
    await Assert.rejects(MidoriSyncService.remoteTabs.call(view), /journal_probe/,
      "The exclusive view guard is released even after the operation fails");
    Assert.equal(journalReads, 1);
  } finally {
    for (const [name, descriptor] of originals) {
      Object.defineProperty(MidoriSyncService, name, descriptor);
    }
  }
});

add_task(async function pending_acknowledgements_resume_before_disabled_form_capture() {
  const { syncJournalEntryId } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncIndex.sys.mjs");
  const collection = "form-history";
  const id = syncJournalEntryId(collection, "metadata", "collection-state-v1");
  const generation = "107cf1f2-bfdc-4cde-a416-a8ec8576a36b";
  const cursor = JSON.stringify({ sequence: 0, fence: null });
  const rows = new Map([[id, { id, collection, kind: "metadata", revision: 1, value: {
    version: 3, generation, cursor, sequence: "0", fence: null, inbox: null, index: 0,
    ack: cursor, initialized: true, pending: 0, conflicts: 0, deferred: 0,
    activeApplication: null, applicationAfter: null,
  } }]]);
  const requests = [];
  const journal = {
    async read(key) { return structuredClone(rows.get(key) ?? null); },
    async list(name, kind) { return structuredClone([...rows.values()].filter(row => row.collection === name && row.kind === kind)); },
    async commit(changes) {
      for (const change of changes) {
        Assert.equal(rows.get(change.id)?.revision ?? 0, change.expectedRevision);
        if (change.deleted) {
          rows.delete(change.id);
        } else {
          rows.set(change.id, structuredClone({ ...change, revision: change.expectedRevision + 1 }));
        }
      }
    },
  };
  const replacements = {
    journal,
    keys: { snapshot: { status: "ready", rotation: null, custody: "server" } },
    connection: { snapshot: { capabilities: { collectionSupport: { "form-history": true } } } },
    account: {
      snapshot: { status: "connected", generation: 1, busy: false, formHistorySupported: true },
      async withSecrets(work) {
        return work({ generation: 1, async request(path) {
          const action = path.split("/").at(-1);
          requests.push(action);
          return { data: action === "ack" ? { generation, acknowledged_sequence: "0" } :
            { generation, changes: [], has_more: false, snapshot_sequence: "0", next_cursor: cursor } };
        } });
      },
    },
  };
  const originals = new Map();
  const preferences = new Map(["browser.formfill.enable", "midori.sync.collection.form-history.enabled"].map(name =>
    [name, { present: Services.prefs.prefHasUserValue(name), value: Services.prefs.getBoolPref(name, true) }]));
  Services.prefs.setBoolPref("browser.formfill.enable", false);
  Services.prefs.setBoolPref("midori.sync.collection.form-history.enabled", true);
  for (const [name, value] of Object.entries(replacements)) {
    originals.set(name, Object.getOwnPropertyDescriptor(MidoriSyncService, name));
    Object.defineProperty(MidoriSyncService, name, { configurable: true, value });
  }
  try {
    await Assert.rejects(MidoriSyncService.syncFormHistory(), /form_history_disabled/,
      "Disabled autocomplete still prevents local form capture");
    Assert.equal(requests[0], "ack", "The durable acknowledgement is resumed before capture is attempted");
    Assert.equal(rows.get(id).value.ack, null, "A disabled local feature leaves no empty-feed acknowledgement blocking recovery");
    Assert.equal(Services.prefs.getBoolPref("browser.formfill.enable"), false);
  } finally {
    (await MidoriSyncService.collection(collection)).close();
    MidoriSyncService.setCollectionEnabled(collection, false);
    for (const [name, descriptor] of originals) {
      Object.defineProperty(MidoriSyncService, name, descriptor);
    }
    for (const [name, previous] of preferences) {
      if (previous.present) {
        Services.prefs.setBoolPref(name, previous.value);
      } else {
        Services.prefs.clearUserPref(name);
      }
    }
  }
});

add_task(async function one_explicit_action_runs_all_collections_without_losing_partial_results() {
  const order = [];
  const fake = {
    account: { snapshot: { generation: 1, collectionSupport: coreCollectionSupport } },
    async unlockPasswords() { order.push("unlock"); throw Object.assign(new Error("locked"), { code: "passwords_locked" }); },
    async syncBookmarks(options) {
      order.push("bookmarks");
      Assert.deepEqual(options, { limit: 25, inventory: true });
      return { more: true };
    },
    async syncHistory(options) {
      order.push("history");
      Assert.deepEqual(options, { limit: 25, inventory: true });
      return { more: false };
    },
    async syncPasswords() { order.push("passwords"); },
    async syncTabs(options) {
      order.push("tabs");
      Assert.deepEqual(options, { limit: 25, inventory: true });
      return { more: false };
    },
    async syncPreferences(options) {
      order.push("preferences");
      Assert.deepEqual(options, { limit: 25, inventory: true });
      return { more: false };
    },
  };
  const result = await MidoriSyncService.syncNow.call(fake, { limit: 25, inventory: true, promptPasswords: true });
  Assert.deepEqual(order, ["unlock", "tabs", "bookmarks", "history", "preferences"]);
  Assert.deepEqual(result.errors, { passwords: "passwords_locked" });
  Assert.equal(result.more, true);
  Assert.deepEqual(Object.keys(result.collections), ["tabs", "bookmarks", "history", "browser-settings"]);
});

add_task(async function collection_failures_do_not_prevent_other_collections() {
  const order = [];
  const fake = {
    account: { snapshot: { generation: 1, collectionSupport: coreCollectionSupport } },
    async syncBookmarks() { order.push("bookmarks"); throw Object.assign(new Error("conflict"), { code: "bookmark_conflict", retryAfter: 60 }); },
    async syncHistory() { order.push("history"); return { more: false }; },
    async syncPasswords() { order.push("passwords"); return { more: false }; },
    async syncTabs() { order.push("tabs"); return { more: false }; },
    async syncPreferences() { order.push("preferences"); return { more: false }; },
  };
  const result = await MidoriSyncService.syncNow.call(fake);
  Assert.deepEqual(order, ["tabs", "bookmarks", "history", "passwords", "preferences"]);
  Assert.deepEqual(result.errors, { bookmarks: "bookmark_conflict" });
  Assert.equal(result.retryAfter, 60);
  Assert.equal(result.more, false);
  Assert.deepEqual(Object.keys(result.collections), ["tabs", "history", "passwords", "browser-settings"]);
});



add_task(async function account_generation_change_stops_the_remaining_collections() {
  const order = [];
  const account = { snapshot: { generation: 1, collectionSupport: coreCollectionSupport } };
  const fake = {
    account,
    async syncBookmarks() { order.push("bookmarks"); account.snapshot.generation = 2; return { more: false }; },
    async syncHistory() { order.push("history"); return { more: false }; },
  };
  await Assert.rejects(MidoriSyncService.syncNow.call(fake, { background: true }), /cancelled/);
  Assert.deepEqual(order, ["bookmarks"]);
  await Assert.rejects(MidoriSyncService.syncNow.call(fake,
    { background: true, promptPasswords: true }), /invalid_capture_query/);
});

add_task(async function a_late_collection_result_cannot_publish_status_for_a_new_account() {
  const service = MidoriSyncService;
  const originalAccount = Object.getOwnPropertyDescriptor(service, "account");
  const originalBookmarks = Object.getOwnPropertyDescriptor(service, "syncBookmarks");
  const originalConnection = Object.getOwnPropertyDescriptor(service, "connection");
  const owner = { snapshot: { generation: 1, collectionSupport: coreCollectionSupport } };
  try {
    Object.defineProperty(service, "account", { configurable: true, value: owner });
    Object.defineProperty(service, "connection", { configurable: true, value: supportedConnection });
    service.syncBookmarks = async () => {
      owner.snapshot.generation = 2;
      return { collection: { initialized: true }, more: false };
    };
    await Assert.rejects(service.syncNow({ background: true }), /cancelled/);
    Assert.equal(service.syncCollectionsSnapshot.find(item => item.name === "bookmarks").lastSuccessAt, null);
  } finally {
    Object.defineProperty(service, "account", originalAccount);
    Object.defineProperty(service, "connection", originalConnection);
    Object.defineProperty(service, "syncBookmarks", originalBookmarks);
  }
});

add_task(async function pending_inventory_does_not_complete_a_collection_pass() {
  const service = MidoriSyncService;
  const names = ["account", "connection", "syncBookmarks", "syncHistory", "syncPasswords", "syncTabs", "syncPreferences"];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(service, name)]));
  try {
    Object.defineProperty(service, "connection", { configurable: true, value: supportedConnection });
    Object.defineProperty(service, "account", { configurable: true,
      value: { snapshot: { generation: 1, collectionSupport: coreCollectionSupport } } });
    service.syncBookmarks = async () => ({ collection: { initialized: true }, more: true });
    for (const name of names.slice(3)) {
      service[name] = async () => ({ more: false });
    }
    const result = await service.syncNow({ background: true });
    Assert.equal(result.more, true);
    Assert.equal(result.errors.bookmarks, undefined);
  } finally {
    for (const [name, descriptor] of originals) {
      Object.defineProperty(service, name, descriptor);
    }
  }
});

add_task(async function manual_run_takes_over_after_the_current_background_collection() {
  const service = MidoriSyncService;
  const names = ["account", "connection", "syncBookmarks", "syncHistory", "syncPasswords", "syncTabs", "syncPreferences"];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(service, name)]));
  const order = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    Object.defineProperty(service, "connection", { configurable: true, value: supportedConnection });
    Object.defineProperty(service, "account", { configurable: true, value: { snapshot: { generation: 1, collectionSupport: coreCollectionSupport } } });
    service.syncTabs = async ({ limit }) => {
      order.push(`tabs-${limit}`);
      if (limit === 50) {
        await gate;
      }
      return { more: false };
    };
    for (const name of ["syncBookmarks", "syncHistory", "syncPasswords", "syncPreferences"]) {
      service[name] = async ({ limit }) => { order.push(`${name}-${limit}`); return { more: false }; };
    }
    const background = service.runBackgroundSync();
    const manual = service.syncNow({ limit: 100 });
    release();
    const backgroundResult = await background;
    const manualResult = await manual;
    Assert.equal(backgroundResult.more, true);
    Assert.deepEqual(Object.keys(backgroundResult.collections), ["tabs"]);
    Assert.deepEqual(Object.keys(manualResult.collections),
      ["tabs", "bookmarks", "history", "passwords", "browser-settings"]);
    Assert.deepEqual(order, ["tabs-50", "tabs-100", "syncBookmarks-100", "syncHistory-100", "syncPasswords-100",
      "syncPreferences-100"]);
  } finally {
    release();
    for (const [name, descriptor] of originals) {
      Object.defineProperty(service, name, descriptor);
    }
  }
});

if (SYNC_DESKTOP_COLLECTIONS.includes("workspaces")) {
add_task(async function new_collections_require_negotiated_support_and_respect_local_selection() {
  const names = ["form-history", "addresses", "workspaces", "midori-privacy"];
  const prefs = names.map(name => `midori.sync.collection.${name}.enabled`);
  const original = prefs.map(pref => Services.prefs.prefHasUserValue(pref) ? Services.prefs.getBoolPref(pref) : null);
  const calls = [];
  const fake = {
    account: { snapshot: { generation: 1, collectionSupport: coreCollectionSupport } },
    connection: { snapshot: { capabilities: {} } },
    async syncBookmarks() { return { more: false }; },
    async syncHistory() { return { more: false }; },
    async syncPasswords() { return { more: false }; },
    async syncTabs() { return { more: false }; },
    async syncPreferences() { return { more: false }; },
    async syncFormHistory(options) { calls.push(["form-history", options]); return { more: false }; },
    async syncAddresses(options) { calls.push(["addresses", options]); return { more: false }; },
    async syncWorkspaces(options) { calls.push(["workspaces", options]); return { more: false }; },
    async syncPrivacyFilters(options) { calls.push(["midori-privacy", options]); return { more: false }; },
    get journal() { throw new Error("An unsupported or disabled collection must not open its journal"); },
  };
  try {
    for (const pref of prefs) {
      Services.prefs.setBoolPref(pref, true);
    }
    await MidoriSyncService.syncNow.call(fake);
    Assert.deepEqual(calls, [], "Older servers are not sent unrecognized collection requests");
    await Assert.rejects(MidoriSyncService.collection.call(fake, "addresses"), /collection_unsupported/);
    await Assert.rejects(MidoriSyncService.collection.call(fake, "workspaces"), /collection_unsupported/);
    await Assert.rejects(MidoriSyncService.collection.call(fake, "midori-privacy"), /collection_unsupported/);
    fake.connection.snapshot.capabilities = { collectionSupport: { "form-history": true, addresses: true, workspaces: true, "midori-privacy": true } };
    let result = await MidoriSyncService.syncNow.call(fake, { limit: 7, inventory: true });
    Assert.deepEqual(calls, [
      ["form-history", { limit: 7, inventory: true }],
      ["addresses", { limit: 7, inventory: true }],
      ["workspaces", { limit: 7, inventory: true }],
      ["midori-privacy", { limit: 7, inventory: true }],
    ]);
    Assert.deepEqual(result.errors, {});
    calls.length = 0;
    MidoriSyncService.setCollectionEnabled("addresses", false);
    Assert.equal(MidoriSyncService.syncCollectionsSnapshot.find(row => row.name === "addresses").status, "disabled");
    await Assert.rejects(MidoriSyncService.collection.call(fake, "addresses"), /collection_disabled/);
    result = await MidoriSyncService.syncNow.call(fake);
    Assert.deepEqual(calls.map(([name]) => name), ["form-history", "workspaces", "midori-privacy"]);
    Assert.equal(Object.hasOwn(result.collections, "addresses"), false);
    calls.length = 0;
    MidoriSyncService.setCollectionEnabled("workspaces", false);
    await Assert.rejects(MidoriSyncService.collection.call(fake, "workspaces"), /collection_disabled/);
    result = await MidoriSyncService.syncNow.call(fake);
    Assert.deepEqual(calls.map(([name]) => name), ["form-history", "midori-privacy"]);
    Assert.equal(Object.hasOwn(result.collections, "workspaces"), false);
    calls.length = 0;
    MidoriSyncService.setCollectionEnabled("midori-privacy", false);
    await Assert.rejects(MidoriSyncService.collection.call(fake, "midori-privacy"), /collection_disabled/);
    result = await MidoriSyncService.syncNow.call(fake);
    Assert.deepEqual(calls.map(([name]) => name), ["form-history"]);
    Assert.throws(() => MidoriSyncService.setCollectionEnabled("unknown", true), /invalid_collection_selection/);
    Assert.throws(() => MidoriSyncService.setCollectionEnabled("addresses", "true"), /invalid_collection_selection/);
  } finally {
    for (let index = 0; index < prefs.length; index++) {
      if (original[index] === null) {
        Services.prefs.clearUserPref(prefs[index]);
      } else {
        Services.prefs.setBoolPref(prefs[index], original[index]);
      }
    }
  }
});

add_task(async function deferred_site_permissions_and_extension_settings_keep_independent_selection() {
  const names = ["midori-privacy", "site-permissions", "extension-settings", "extensions", "browser-settings"];
  const prefs = names.map(name => `midori.sync.collection.${name}.enabled`);
  const previous = prefs.map(name => Services.prefs.prefHasUserValue(name) ? Services.prefs.getBoolPref(name) : null);
  const calls = [];
  const fake = {
    account: { snapshot: { status: "connected", generation: 1 } },
    connection: { snapshot: { capabilities: { collectionSupport: Object.fromEntries(names.map(name => [name, true])) } } },
    async syncPrivacyFilters() { calls.push("midori-privacy"); return { more: false }; },
    async syncPermissions() { calls.push("site-permissions"); return { more: true, collection: { deferred: 1 } }; },
    async syncExtensionSettings() { calls.push("extension-settings"); return { more: true, collection: { deferred: 1 } }; },
    async syncExtensions() { calls.push("extensions"); return { more: true, collection: { deferred: 1 } }; },
    async syncPreferences() { calls.push("browser-settings"); return { more: false }; },
  };
  try {
    for (const name of names) { MidoriSyncService.setCollectionEnabled(name, true); }
    const result = await MidoriSyncService.syncNow.call(fake, { background: true });
    Assert.deepEqual(calls, names, "A waiting permission does not prevent the other selected families from running");
    Assert.deepEqual(result.errors, {});
    Assert.ok(result.more, "A pass with unapplied site permissions cannot claim completion");
    Assert.equal(result.collections["site-permissions"].collection.deferred, 1);
    calls.length = 0;
    MidoriSyncService.setCollectionEnabled("site-permissions", false);
    await Assert.rejects(MidoriSyncService.collection.call(fake, "site-permissions"), /collection_disabled/);
    const selected = await MidoriSyncService.syncNow.call(fake, { background: true });
    Assert.deepEqual(calls, ["midori-privacy", "extension-settings", "extensions", "browser-settings"],
      "Configuration is processed before the installation list");
    Assert.ok(selected.more, "Extension confirmation keeps its independent pending state");
    calls.length = 0;
    MidoriSyncService.setCollectionEnabled("extensions", false);
    await Assert.rejects(MidoriSyncService.collection.call(fake, "extensions"), /collection_disabled/);
    const remaining = await MidoriSyncService.syncNow.call(fake, { background: true });
    Assert.deepEqual(calls, ["midori-privacy", "extension-settings", "browser-settings"]);
    Assert.ok(remaining.more, "Settings keep their own pending transaction when installation sync is off");
    calls.length = 0;
    MidoriSyncService.setCollectionEnabled("extension-settings", false);
    await Assert.rejects(MidoriSyncService.collection.call(fake, "extension-settings"), /collection_disabled/);
    const finished = await MidoriSyncService.syncNow.call(fake, { background: true });
    Assert.deepEqual(calls, ["midori-privacy", "browser-settings"]);
    Assert.ok(!finished.more);
  } finally {
    for (const [index, name] of prefs.entries()) {
      if (previous[index] === null) { Services.prefs.clearUserPref(name); }
      else { Services.prefs.setBoolPref(name, previous[index]); }
    }
  }
});

}

add_task(async function primary_sync_excludes_deferred_families_even_with_old_preferences_and_server_support() {
  const deferred = ["workspaces", "extensions", "extension-settings", "midori-tab", "midori-privacy", "site-permissions"];
  const names = [...SYNC_DESKTOP_COLLECTIONS, ...deferred];
  const prefs = names.map(name => `midori.sync.collection.${name}.enabled`);
  const previous = prefs.map(name => Services.prefs.prefHasUserValue(name) ? Services.prefs.getBoolPref(name) : null);
  const calls = [];
  const fake = {
    account: { snapshot: { status: "connected", generation: 1 } },
    connection: { snapshot: { capabilities: { collectionSupport: Object.fromEntries(names.map(name => [name, true])) } } },
    get journal() { throw new Error("Deferred collections must not open a journal"); },
  };
  for (const [name, method] of [["tabs", "syncTabs"], ["bookmarks", "syncBookmarks"], ["history", "syncHistory"],
    ["passwords", "syncPasswords"], ["credit-cards", "syncCreditCards"], ["form-history", "syncFormHistory"],
    ["addresses", "syncAddresses"], ["browser-settings", "syncPreferences"], ["workspaces", "syncWorkspaces"],
    ["extensions", "syncExtensions"], ["extension-settings", "syncExtensionSettings"],
    ["midori-privacy", "syncPrivacyFilters"], ["site-permissions", "syncPermissions"]]) {
    fake[method] = async () => { calls.push(name); return { more: false }; };
  }
  try {
    for (const pref of prefs) { Services.prefs.setBoolPref(pref, true); }
    Assert.deepEqual(MidoriSyncService.syncCollectionsSnapshot.map(row => row.name), SYNC_DESKTOP_COLLECTIONS);
    for (const background of [false, true]) {
      calls.length = 0;
      const result = await MidoriSyncService.syncNow.call(fake, { background });
      Assert.deepEqual([...calls].sort(), [...SYNC_DESKTOP_COLLECTIONS].sort());
      Assert.deepEqual(result.errors, {});
      Assert.equal(result.more, false);
      for (const name of deferred) { Assert.equal(Object.hasOwn(result.collections, name), false); }
    }
    for (const name of deferred) {
      Assert.throws(() => MidoriSyncService.setCollectionEnabled(name, true), /invalid_collection_selection/);
      await Assert.rejects(MidoriSyncService.collection.call(fake, name), /collection_disabled/);
      Assert.equal(Services.prefs.getBoolPref(`midori.sync.collection.${name}.enabled`), true,
        "Deferring a collection preserves its existing preference and data");
    }
    MidoriSyncService.setCollectionEnabled("addresses", false);
    calls.length = 0;
    await MidoriSyncService.syncNow.call(fake);
    Assert.equal(calls.includes("addresses"), false);
    await Assert.rejects(MidoriSyncService.collection.call(fake, "addresses"), /collection_disabled/);
  } finally {
    for (const [index, pref] of prefs.entries()) {
      if (previous[index] === null) { Services.prefs.clearUserPref(pref); }
      else { Services.prefs.setBoolPref(pref, previous[index]); }
    }
  }
});
