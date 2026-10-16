/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_setup(async function close_startup_tabs() {
  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

add_task(async function recovery_setup_requires_saved_code_and_clears_it_after_confirmation() {
  const { createSyncKeysPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncKeysPanel.sys.mjs");
  const code = "MS2-01020304-05060708-090A0B0C-0D0E0F10-11121314-15161718-191A1B1C-1D1E1F20";
  let owner;
  let confirmations = 0;
  let rotations = 0;
  let migrations = 0;
  let preflights = 0;
  let recovery;
  let view;
  const service = {
    account: { snapshot: { status: "connected", busy: false } },
    keys: {
      snapshot: { status: "empty", busy: false, incompatibleSessions: 0, canRotate: false, rotation: null },
      async prepareCreation(currentOwner) {
        owner = currentOwner;
        this.snapshot.status = "backup-required";
        return code;
      },
      async prepareRotation(currentOwner) {
        is(currentOwner, owner, "Rotation retains the popup owner");
        is(preflights, 1, "The journal is checked before preparing a new key");
        this.snapshot.status = "rotation-backup-required";
        return code;
      },
      async confirmCreation(options) {
        is(options.owner, owner, "Confirmation belongs to the same popup");
        ok(options.recoveryCodeSaved, "The user confirmed the recovery backup");
        ++confirmations;
        this.snapshot.status = "locked";
      },
      async confirmRotation(options) {
        is(options.owner, owner, "Rotation confirmation belongs to the same popup");
        ok(options.recoveryCodeSaved, "The new recovery backup is confirmed");
        ++rotations;
        this.snapshot.status = "locked";
        this.snapshot.rotation = { phase: "rewriting", live_records: 125 };
      },
      async refresh() {
        this.snapshot.status = "ready";
        this.snapshot.canRotate = !this.snapshot.rotation;
        view.refresh();
      },
      async recover(value) {
        recovery = value;
      },
      cancelDraft() {},
    },
    async prepareEncryptionRotation() {
      ++preflights;
    },
    async confirmEncryptionRotation(options) {
      return this.keys.confirmRotation(options);
    },
    async migrateEncryption(options) {
      Assert.deepEqual(options, { limit: 100 });
      ++migrations;
      this.keys.snapshot.rotation.live_records = 25;
      return { done: false, processed: 100, remaining: 25 };
    },
  };
  view = createSyncKeysPanel(document, service);
  document.documentElement.append(view.section);
  const get = id => view.section.querySelector(`#${id}`);
  const confirmSaved = () => {
    get("midori-sync-code-saved").checked = true;
    get("midori-sync-code-saved").dispatchEvent(new Event("change"));
    get("midori-sync-code-confirmation").value = code.slice(-8);
    get("midori-sync-code-confirmation").dispatchEvent(new Event("input"));
  };
  try {
    view.open();
    get("midori-sync-keys-create").click();
    await TestUtils.waitForCondition(() => get("midori-sync-generated-code").value === code);
    is(confirmations, 0, "Creating a recovery code does not activate encryption");
    ok(get("midori-sync-keys-confirm").disabled, "The recovery backup must be confirmed");
    get("midori-sync-code-saved").checked = true;
    get("midori-sync-code-saved").dispatchEvent(new Event("change"));
    ok(get("midori-sync-keys-confirm").disabled, "Checking the box alone does not confirm the saved code");
    get("midori-sync-code-confirmation").value = "FFFFFFFF";
    get("midori-sync-code-confirmation").dispatchEvent(new Event("input"));
    get("midori-sync-backup-form").dispatchEvent(new Event("submit", { cancelable: true }));
    is(confirmations, 0, "A wrong recovery fragment cannot activate encryption");
    confirmSaved();
    ok(!get("midori-sync-keys-confirm").disabled, "The saved recovery fragment permits confirmation");
    get("midori-sync-keys-confirm").click();
    await TestUtils.waitForCondition(() => confirmations === 1 && service.keys.snapshot.status === "ready");
    is(get("midori-sync-generated-code").value, "", "The generated recovery code is cleared after activation");
    is(get("midori-sync-code-confirmation").value, "", "The confirmation fragment is cleared too");
    get("midori-sync-keys-rotate").click();
    await TestUtils.waitForCondition(() => service.keys.snapshot.status === "rotation-backup-required" &&
      get("midori-sync-generated-code").value === code);
    confirmSaved();
    get("midori-sync-keys-confirm").click();
    await TestUtils.waitForCondition(() => rotations === 1 && migrations === 1);
    ok(!get("midori-sync-keys-migrate").hidden, "A bounded rotation can be continued explicitly");
    get("midori-sync-keys-migrate").click();
    await TestUtils.waitForCondition(() => migrations === 2);
    service.keys.snapshot = { status: "migration-required", canRotate: false, busy: false, incompatibleSessions: 0 };
    view.refresh();
    ok(!get("midori-sync-recovery-form").hidden, "A legacy account can supply its own recovery code");
    get("midori-sync-recovery-code").value = code;
    get("midori-sync-recovery-form").dispatchEvent(new Event("submit", { cancelable: true }));
    await TestUtils.waitForCondition(() => recovery === code);
    is(get("midori-sync-recovery-code").value, "", "Submitted recovery material is removed from the form");
    get("midori-sync-recovery-code").value = code;
    view.close();
    is(get("midori-sync-recovery-code").value, "", "Closing clears unsubmitted recovery material");
  } finally {
    view.close();
    view.section.remove();
  }
});

add_task(async function closing_recovery_setup_discards_a_late_generated_code() {
  const { createSyncKeysPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncKeysPanel.sys.mjs");
  let finish;
  let cancelled = 0;
  const service = {
    account: { snapshot: { status: "connected", busy: false } },
    keys: {
      snapshot: { status: "empty", busy: false, incompatibleSessions: 0 },
      prepareCreation() { return new Promise(resolve => { finish = resolve; }); },
      cancelDraft() { ++cancelled; },
    },
  };
  const view = createSyncKeysPanel(document, service);
  document.documentElement.append(view.section);
  try {
    view.open();
    view.section.querySelector("#midori-sync-keys-create").click();
    view.close();
    finish("late recovery code");
    await new Promise(resolve => window.setTimeout(resolve, 0));
    is(view.section.querySelector("#midori-sync-generated-code").value, "", "A closed popup never receives a late recovery code");
    is(cancelled, 1, "Closing cancels the popup's encryption draft");
  } finally {
    view.close();
    view.section.remove();
  }
});

add_task(async function checking_completed_encryption_retries_local_completion_cleanup() {
  const { createSyncKeysPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncKeysPanel.sys.mjs");
  let migrations = 0;
  let checks = 0;
  let view;
  const service = {
    account: { snapshot: { status: "connected", busy: false } },
    keys: {
      snapshot: { status: "ready", busy: false, incompatibleSessions: 0, canRotate: true,
        rotation: { phase: "complete", live_records: 0 } },
      async refresh() { ++checks; view.refresh(); },
      cancelDraft() {},
    },
    async migrateEncryption(options) {
      Assert.deepEqual(options, { limit: 100 });
      ++migrations;
      if (migrations === 1) {
        throw Object.assign(new Error("disk_full"), { code: "disk_full" });
      }
      return { done: true, processed: 0, remaining: 0 };
    },
  };
  view = createSyncKeysPanel(document, service);
  document.documentElement.append(view.section);
  const get = id => view.section.querySelector(`#${id}`);
  try {
    view.open();
    ok(get("midori-sync-keys-migrate").hidden, "Completed encryption does not display an unfinished remote rotation");
    ok(!get("midori-sync-keys-check").hidden, "The encryption check remains available after completion");
    get("midori-sync-keys-check").click();
    await TestUtils.waitForCondition(() => get("midori-sync-keys-status").getAttribute("data-l10n-id") ===
      "midori-sync-keys-rotation-finish-required");
    is(migrations, 1, "Checking completed encryption retries durable local cleanup");
    get("midori-sync-keys-check").click();
    await TestUtils.waitForCondition(() => migrations === 2 && !get("midori-sync-keys-check").disabled);
    is(checks, 2, "Each retry first verifies the current encryption state");
    is(get("midori-sync-keys-status").getAttribute("data-l10n-id"), "midori-sync-keys-ready",
      "A successful retry clears the unfinished-update message");
  } finally {
    view.close();
    view.section.remove();
  }
});

add_task(async function rotation_confirmation_blocks_sync_until_its_final_journal_check_finishes() {
  await SpecialPowers.pushPrefEnv({ set: [["midori.sync.background.enabled", false]] });
  const { MidoriSyncService } = ChromeUtils.importESModule("resource:///modules/MidoriSyncService.sys.mjs");
  let release;
  let confirmations = 0;
  const options = { recoveryCodeSaved: true, owner: {} };
  const service = {
    prepareEncryptionRotation(received) {
      Assert.deepEqual(received, { allowPendingRotation: true }, "A confirmation can inspect its durable rotation intent");
      return new Promise(resolve => { release = resolve; });
    },
    keys: {
      async confirmRotation(received) {
        is(received, options, "The verified recovery confirmation reaches the key operation");
        ++confirmations;
      },
    },
  };
  const pending = MidoriSyncService.confirmEncryptionRotation.call(service, options);
  try {
    await Assert.rejects(MidoriSyncService.syncNow(), /encryption_rotation_required/,
      "A manual sync cannot write between the final journal check and key publication");
    await Assert.rejects(MidoriSyncService.collection("history"), /encryption_rotation_required/,
      "A newly opened collection cannot capture operations while rotation is being confirmed");
    await Assert.rejects(MidoriSyncService.confirmEncryptionRotation.call(service, options), /busy/,
      "Another popup cannot start a concurrent confirmation");
    is(confirmations, 0, "Key publication waits for the final journal check");
    release();
    await pending;
    is(confirmations, 1, "Exactly one rotation is confirmed after the journal is settled");
  } finally {
    release();
    await pending.catch(() => {});
  }
});

add_task(async function a_failed_journal_close_releases_the_rotation_guard() {
  await SpecialPowers.pushPrefEnv({ set: [["midori.sync.background.enabled", false]] });
  const { MidoriSyncService } = ChromeUtils.importESModule("resource:///modules/MidoriSyncService.sys.mjs");
  const account = MidoriSyncService.account;
  await account.initialize();
  let closed = 0;
  let confirmed = 0;
  const service = {
    account,
    keys: {},
    journal: Promise.resolve({
      async close() {
        ++closed;
        throw new Error("synthetic journal close failure");
      },
    }),
  };
  await Assert.rejects(MidoriSyncService.runEncryptionMigration.call(service, { limit: 0 }), /synthetic journal close failure/,
    "A journal close failure reaches the caller");
  is(closed, 1, "The failed migration closes its journal once");
  service.prepareEncryptionRotation = async options => {
    Assert.deepEqual(options, { allowPendingRotation: true });
  };
  service.keys.confirmRotation = async () => { ++confirmed; };
  await MidoriSyncService.confirmEncryptionRotation.call(service, { recoveryCodeSaved: true });
  is(confirmed, 1, "A failed close does not leave subsequent rotations permanently busy");
});
