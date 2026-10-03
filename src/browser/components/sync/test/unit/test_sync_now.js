/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriSyncService } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncService.sys.mjs");

add_task(async function one_explicit_action_runs_all_collections_without_losing_partial_results() {
  const order = [];
  const fake = {
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
  Assert.deepEqual(order, ["unlock", "bookmarks", "history", "tabs", "preferences"]);
  Assert.deepEqual(result.errors, { passwords: "passwords_locked" });
  Assert.equal(result.more, true);
  Assert.deepEqual(Object.keys(result.collections), ["bookmarks", "history", "tabs", "browser-settings"]);
});

add_task(async function collection_failures_do_not_prevent_other_collections() {
  const order = [];
  const fake = {
    async syncBookmarks() { order.push("bookmarks"); throw Object.assign(new Error("conflict"), { code: "bookmark_conflict", retryAfter: 60 }); },
    async syncHistory() { order.push("history"); return { more: false }; },
    async syncPasswords() { order.push("passwords"); return { more: false }; },
    async syncTabs() { order.push("tabs"); return { more: false }; },
    async syncPreferences() { order.push("preferences"); return { more: false }; },
  };
  const result = await MidoriSyncService.syncNow.call(fake);
  Assert.deepEqual(order, ["bookmarks", "history", "passwords", "tabs", "preferences"]);
  Assert.deepEqual(result.errors, { bookmarks: "bookmark_conflict" });
  Assert.equal(result.retryAfter, 60);
  Assert.equal(result.more, false);
  Assert.deepEqual(Object.keys(result.collections), ["history", "passwords", "tabs", "browser-settings"]);
});



add_task(async function account_generation_change_stops_the_remaining_collections() {
  const order = [];
  const account = { snapshot: { generation: 1 } };
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
  const owner = { snapshot: { generation: 1 } };
  try {
    Object.defineProperty(service, "account", { configurable: true, value: owner });
    service.syncBookmarks = async () => {
      owner.snapshot.generation = 2;
      return { collection: { initialized: true }, more: false };
    };
    await Assert.rejects(service.syncNow({ background: true }), /cancelled/);
    Assert.equal(service.syncCollectionsSnapshot.find(item => item.name === "bookmarks").lastSuccessAt, null);
  } finally {
    Object.defineProperty(service, "account", originalAccount);
    Object.defineProperty(service, "syncBookmarks", originalBookmarks);
  }
});

add_task(async function pending_inventory_does_not_complete_a_collection_pass() {
  const service = MidoriSyncService;
  const names = ["account", "syncBookmarks", "syncHistory", "syncPasswords", "syncTabs", "syncPreferences"];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(service, name)]));
  try {
    Object.defineProperty(service, "account", { configurable: true,
      value: { snapshot: { generation: 1 } } });
    service.syncBookmarks = async () => ({ collection: { initialized: true }, more: true });
    for (const name of names.slice(2)) {
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
  const names = ["account", "syncBookmarks", "syncHistory", "syncPasswords", "syncTabs", "syncPreferences"];
  const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(service, name)]));
  const order = [];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  try {
    Object.defineProperty(service, "account", { configurable: true, value: { snapshot: { generation: 1 } } });
    service.syncBookmarks = async ({ limit }) => {
      order.push(`bookmarks-${limit}`);
      if (limit === 50) {
        await gate;
      }
      return { more: false };
    };
    for (const name of names.slice(2)) {
      service[name] = async ({ limit }) => { order.push(`${name}-${limit}`); return { more: false }; };
    }
    const background = service.runBackgroundSync();
    const manual = service.syncNow({ limit: 100 });
    release();
    const backgroundResult = await background;
    const manualResult = await manual;
    Assert.equal(backgroundResult.more, true);
    Assert.deepEqual(Object.keys(backgroundResult.collections), ["bookmarks"]);
    Assert.deepEqual(Object.keys(manualResult.collections),
      ["bookmarks", "history", "passwords", "tabs", "browser-settings"]);
    Assert.deepEqual(order, ["bookmarks-50", "bookmarks-100", "syncHistory-100", "syncPasswords-100",
      "syncTabs-100", "syncPreferences-100"]);
  } finally {
    release();
    for (const [name, descriptor] of originals) {
      Object.defineProperty(service, name, descriptor);
    }
  }
});



