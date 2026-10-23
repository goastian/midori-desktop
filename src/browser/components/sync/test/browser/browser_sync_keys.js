/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_setup(async function close_startup_tabs() {
  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

function openTestSyncKeysPanel(view) {
  view.open();
  view.section.querySelector("details").open = true;
}

function clickTestSyncKeyControl(control) {
  const bounds = control.getBoundingClientRect();
  ok(bounds.width > 0 && bounds.height > 0, "The Sync control is rendered before activation");
  control.click();
}

add_task(async function account_password_setup_unlock_and_close_clear_the_inputs() {
  const { createSyncKeysPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncKeysPanel.sys.mjs");
  let saved = 0;
  let unlocked = 0;
  const service = {
    account: { snapshot: { status: "connected", busy: false, generation: 1 } },
    keys: {
      snapshot: { status: "ready", busy: false, passwordUnlockSupported: true, passwordUnlockAvailable: false },
      async setAccountPassword(value) { is(value, "synthetic Astian password"); ++saved; this.snapshot.passwordUnlockAvailable = true; },
      async unlockWithAccountPassword(value) { is(value, "synthetic Astian password"); ++unlocked; this.snapshot.status = "ready"; },
      cancelDraft() {},
    },
  };
  const view = createSyncKeysPanel(document, service);
  document.documentElement.append(view.section);
  const get = id => view.section.querySelector(`#${id}`);
  const input = get("midori-sync-account-password");
  const confirmation = get("midori-sync-account-password-confirmation");
  const form = get("midori-sync-account-password-form");
  try {
    openTestSyncKeysPanel(view);
    ok(!form.hidden, "An unlocked profile can protect existing keys with its account password");
    input.value = "synthetic Astian password";
    input.dispatchEvent(new Event("input"));
    ok(get("midori-sync-keys-password-save").disabled, "The setup requires matching confirmation");
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    is(saved, 0);
    confirmation.value = input.value;
    confirmation.dispatchEvent(new Event("input"));
    clickTestSyncKeyControl(get("midori-sync-keys-password-save"));
    await TestUtils.waitForCondition(() => saved === 1);
    is(input.value, "", "Submission clears the password immediately");
    is(confirmation.value, "", "Submission clears its confirmation");
    ok(!input.matches(":user-invalid"), "Successful submission resets the required-field error state");
    ok(!confirmation.matches(":user-invalid"), "The cleared confirmation does not look like a failed save");
    service.keys.snapshot.status = "recovery-required";
    view.refresh();
    ok(!form.hidden && confirmation.hidden, "A new profile requests one password to unlock");
    is(get("midori-sync-keys-status").getAttribute("data-l10n-id"), "midori-sync-keys-password-required");
    input.value = "synthetic Astian password";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    await TestUtils.waitForCondition(() => unlocked === 1);
    is(input.value, "");
    input.value = confirmation.value = "must be cleared";
    service.account.snapshot.generation = 2;
    view.refresh();
    is(input.value, "", "Changing account generation clears unsubmitted credentials");
    is(confirmation.value, "");
    input.value = confirmation.value = "must be cleared on close";
    view.close();
    is(input.value, "", "Closing clears an unsubmitted password");
    is(confirmation.value, "");
    service.keys.snapshot.passwordUnlockSupported = false;
    openTestSyncKeysPanel(view);
    ok(form.hidden, "Older servers do not offer unsupported password unlocking");
  } finally {
    view.close();
    view.section.remove();
  }
});

add_task(async function recovery_download_requires_a_saved_file_and_keeps_private_permissions() {
  const { createSyncKeysPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncKeysPanel.sys.mjs");
  const { MockFilePicker } = SpecialPowers;
  const code = `MS2-${Array(8).fill("01234567").join("-")}`;
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(PathUtils.join(PathUtils.tempDir, `sync-recovery-${Services.uuid.generateUUID()}.txt`));
  const service = {
    account: { snapshot: { status: "connected", busy: false } },
    keys: {
      snapshot: { status: "ready", busy: false, backupPending: true, recoveryCodeAvailable: true },
      async revealRecoveryCode() { return code; }, cancelDraft() {},
    },
  };
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:sync");
  const doc = tab.linkedBrowser.contentDocument;
  await TestUtils.waitForCondition(() => doc.getElementById("sync-card")?.children.length);
  const view = createSyncKeysPanel(doc, service);
  doc.getElementById("sync-card").replaceChildren(view.section);
  const get = id => view.section.querySelector(`#${id}`);
  MockFilePicker.init();
  MockFilePicker.setFiles([file]);
  try {
    openTestSyncKeysPanel(view);
    clickTestSyncKeyControl(get("midori-sync-keys-reveal"));
    await TestUtils.waitForCondition(() => get("midori-sync-stored-recovery-code").value === code);
    MockFilePicker.returnValue = MockFilePicker.returnCancel;
    const cancelled = new Promise(resolve => { MockFilePicker.showCallback = () => { resolve(); }; });
    clickTestSyncKeyControl(get("midori-sync-stored-download"));
    await cancelled;
    await TestUtils.waitForCondition(() => get("midori-sync-download-status").getAttribute("data-l10n-id") === "midori-sync-keys-download-cancelled");
    ok(!file.exists(), "Cancelling the about:sync file picker creates no file");
    ok(!get("midori-sync-stored-code-saved").checked, "Cancellation does not acknowledge the backup");
    MockFilePicker.returnValue = MockFilePicker.returnOK;
    clickTestSyncKeyControl(get("midori-sync-stored-download"));
    await TestUtils.waitForCondition(() => get("midori-sync-stored-code-saved").checked);
    is(get("midori-sync-download-status").getAttribute("data-l10n-id"), "midori-sync-keys-download-saved");
    service.account.snapshot.busy = true;
    service.account.snapshot.interactionBusy = false;
    const height = view.section.getBoundingClientRect().height;
    view.refresh();
    ok(!get("midori-sync-stored-download").disabled, "Background requests do not flash the download control disabled");
    is(view.section.getBoundingClientRect().height, height, "Background account access keeps the form layout stable");
    is(await IOUtils.readUTF8(file.path), `${code}\n`, "The downloaded file contains the actual code");
    if (AppConstants.platform !== "win") {
      is(file.permissions & 0o777, 0o600, "Only the owner can read or write the recovery file");
    }
    view.close();
    is(get("midori-sync-stored-recovery-code").value, "", "Closing removes the displayed code");
  } finally {
    MockFilePicker.cleanup();
    view.close();
    view.section.remove();
    await IOUtils.remove(file.path, { ignoreAbsent: true });
    await BrowserTestUtils.removeTab(tab);
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
    openTestSyncKeysPanel(view);
    clickTestSyncKeyControl(get("midori-sync-keys-create"));
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
    clickTestSyncKeyControl(get("midori-sync-keys-confirm"));
    await TestUtils.waitForCondition(() => confirmations === 1 && service.keys.snapshot.status === "ready");
    is(get("midori-sync-generated-code").value, "", "The generated recovery code is cleared after activation");
    is(get("midori-sync-code-confirmation").value, "", "The confirmation fragment is cleared too");
    clickTestSyncKeyControl(get("midori-sync-keys-rotate"));
    await TestUtils.waitForCondition(() => service.keys.snapshot.status === "rotation-backup-required" &&
      get("midori-sync-generated-code").value === code);
    confirmSaved();
    clickTestSyncKeyControl(get("midori-sync-keys-confirm"));
    await TestUtils.waitForCondition(() => rotations === 1 && migrations === 1);
    ok(!get("midori-sync-keys-migrate").hidden, "A bounded rotation can be continued explicitly");
    clickTestSyncKeyControl(get("midori-sync-keys-migrate"));
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
    openTestSyncKeysPanel(view);
    clickTestSyncKeyControl(view.section.querySelector("#midori-sync-keys-create"));
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

add_task(async function a_preflight_error_stays_visible_and_a_retry_prepares_a_replacement() {
  const { createSyncKeysPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncKeysPanel.sys.mjs");
  const code = `MS2-${Array(8).fill("01234567").join("-")}`;
  let blocked = "sync_pending_operations";
  let preparations = 0;
  const service = {
    account: { snapshot: { status: "connected", busy: false, interactionBusy: false } },
    keys: {
      snapshot: { status: "ready", busy: false, canRotate: true, recoveryCodeAvailable: false },
      async prepareRotation() { this.snapshot.status = "rotation-backup-required"; return code; },
      cancelDraft() {},
    },
    async prepareEncryptionRotation() {
      ++preparations;
      if (blocked) {
        throw Object.assign(new Error(blocked), { code: blocked });
      }
    },
  };
  const view = createSyncKeysPanel(document, service);
  document.documentElement.append(view.section);
  const get = id => view.section.querySelector(`#${id}`);
  try {
    openTestSyncKeysPanel(view);
    const button = get("midori-sync-keys-replace-code");
    ok(!button.hidden, "A retained profile without its previous code can prepare a replacement");
    clickTestSyncKeyControl(button);
    clickTestSyncKeyControl(button);
    is(preparations, 1, "A preparation in progress prevents a duplicate request");
    await TestUtils.waitForCondition(() => get("midori-sync-keys-status").getAttribute("data-l10n-id") === "midori-sync-keys-rotation-blocked");
    for (let index = 0; index < 4; ++index) {
      service.account.snapshot.busy = !service.account.snapshot.busy;
      view.refresh();
      is(get("midori-sync-keys-status").getAttribute("data-l10n-id"), "midori-sync-keys-rotation-blocked",
        "Background status updates preserve the reason the explicit action failed");
    }
    is(get("midori-sync-generated-code").value, "", "An unsuccessful preflight invents no recovery code");
    blocked = "saved_journals_require_review";
    clickTestSyncKeyControl(button);
    await TestUtils.waitForCondition(() => get("midori-sync-keys-status").getAttribute("data-l10n-id") === "midori-sync-keys-saved-copies");
    view.refresh();
    is(get("midori-sync-keys-status").getAttribute("data-l10n-id"), "midori-sync-keys-saved-copies",
      "The encryption panel directs the user to saved copies while preserving the keys");
    blocked = "sync_paused";
    clickTestSyncKeyControl(button);
    await TestUtils.waitForCondition(() => get("midori-sync-keys-status").getAttribute("data-l10n-id") === "midori-sync-keys-paused");
    is(get("midori-sync-generated-code").value, "", "A paused preflight preserves progress without inventing another key");
    blocked = false;
    clickTestSyncKeyControl(button);
    await TestUtils.waitForCondition(() => get("midori-sync-generated-code").value === code);
    is(preparations, 4);
    is(get("midori-sync-keys-status").getAttribute("data-l10n-id"), "midori-sync-keys-rotation-backup-required",
      "Retrying successfully replaces the error with the real draft status");
  } finally {
    view.close();
    view.section.remove();
  }
});

add_task(async function an_older_registry_requests_an_explicit_encryption_update() {
  const { createSyncKeysPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncKeysPanel.sys.mjs");
  const service = {
    account: { snapshot: { status: "connected", busy: false } },
    keys: {
      snapshot: { status: "ready", busy: false, canRotate: true, registryUpgradeRequired: true },
      cancelDraft() {},
    },
  };
  const view = createSyncKeysPanel(document, service);
  document.documentElement.append(view.section);
  try {
    openTestSyncKeysPanel(view);
    const status = view.section.querySelector("#midori-sync-keys-status");
    is(status.getAttribute("data-l10n-id"), "midori-sync-keys-registry-upgrade-required",
      "An older registry does not claim the protection of an authenticated revision");
    ok(!view.section.querySelector("#midori-sync-keys-rotate").hidden,
      "The account can explicitly start the encryption update");
    ok(view.section.querySelector("#midori-sync-recovery-form").hidden,
      "A readable older account does not ask for its recovery code again");
    service.keys.snapshot.registryUpgradeRequired = false;
    view.refresh();
    is(status.getAttribute("data-l10n-id"), "midori-sync-keys-ready",
      "The upgrade notice clears after the authenticated registry is installed");
    service.keys.snapshot.error = "registry_auth_unsupported";
    view.refresh();
    is(status.getAttribute("data-l10n-id"), "midori-sync-keys-registry-server-required",
      "An unsupported server explains why encryption keys cannot be changed");
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
    openTestSyncKeysPanel(view);
    ok(get("midori-sync-keys-migrate").hidden, "Completed encryption does not display an unfinished remote rotation");
    ok(!get("midori-sync-keys-check").hidden, "The encryption check remains available after completion");
    clickTestSyncKeyControl(get("midori-sync-keys-check"));
    await TestUtils.waitForCondition(() => get("midori-sync-keys-status").getAttribute("data-l10n-id") ===
      "midori-sync-keys-rotation-finish-required");
    is(migrations, 1, "Checking completed encryption retries durable local cleanup");
    clickTestSyncKeyControl(get("midori-sync-keys-check"));
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

add_task(async function legacy_deletions_require_explicit_review_of_the_exact_saved_record() {
  const { createSyncKeysPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncKeysPanel.sys.mjs");
  const rotationId = "ce2e7ce1-97c6-4a16-b1d8-716ce972ab15";
  const review = { rotation_id: rotationId, collection: "bookmarks",
    generation: "b027d720-0a71-42b3-b07d-e6ca0a0ce2ce", id: "legacyGuid01", revision: "3", ttl: null, decision: null };
  let calls = 0;
  let approvals = 0;
  const service = {
    account: { snapshot: { status: "connected", busy: false } },
    keys: {
      snapshot: { status: "ready", busy: false, incompatibleSessions: 0, canRotate: false,
        rotation: { operation_id: rotationId, phase: "rewriting", live_records: 1 } },
      cancelDraft() {},
    },
    async migrateEncryption(options) {
      ++calls;
      if (!options.legacyDeletionDecisions) {
        throw Object.assign(new Error("legacy_tombstone_review_required"), {
          code: "legacy_tombstone_review_required", review: [structuredClone(review)],
        });
      }
      Assert.deepEqual(options, { limit: 100, legacyDeletionDecisions: [{ ...review, decision: "delete" }] },
        "Approval is bound to the exact persisted rotation, generation, ID and revision");
      ++approvals;
      this.keys.snapshot.rotation.phase = "complete";
      return { done: true, processed: 1, remaining: 0 };
    },
  };
  const view = createSyncKeysPanel(document, service);
  document.documentElement.append(view.section);
  const get = id => view.section.querySelector(`#${id}`);
  try {
    openTestSyncKeysPanel(view);
    clickTestSyncKeyControl(get("midori-sync-keys-migrate"));
    await TestUtils.waitForCondition(() => !get("midori-sync-legacy-review").hidden);
    is(calls, 1);
    is(approvals, 0, "Loading an old deletion never approves it");
    const item = get("midori-sync-legacy-review-items").firstElementChild;
    Assert.deepEqual(JSON.parse(item.getAttribute("data-l10n-args")), {
      collection: "bookmarks", id: "legacyGuid01", revision: "3",
    }, "The review lists stored metadata instead of inventing deleted contents");
    ok(get("midori-sync-keys-review-approve").disabled, "Approval requires the user's explicit checkbox");
    get("midori-sync-legacy-review").dispatchEvent(new Event("submit", { cancelable: true }));
    is(calls, 1, "Submitting without consent cannot resume a deletion");
    get("midori-sync-legacy-review-confirm").checked = true;
    get("midori-sync-legacy-review-confirm").dispatchEvent(new Event("change"));
    view.close();
    ok(get("midori-sync-legacy-review").hidden, "Closing clears the visible review");
    ok(!get("midori-sync-legacy-review-confirm").checked, "Unsubmitted consent is cleared on close");
    openTestSyncKeysPanel(view);
    clickTestSyncKeyControl(get("midori-sync-keys-migrate"));
    await TestUtils.waitForCondition(() => calls === 2 && !get("midori-sync-legacy-review").hidden);
    is(approvals, 0);
    get("midori-sync-legacy-review-confirm").checked = true;
    get("midori-sync-legacy-review-confirm").dispatchEvent(new Event("change"));
    ok(!get("midori-sync-keys-review-approve").disabled);
    clickTestSyncKeyControl(get("midori-sync-keys-review-approve"));
    await TestUtils.waitForCondition(() => approvals === 1 && get("midori-sync-legacy-review").hidden);
    is(calls, 3);
  } finally {
    view.close();
    view.section.remove();
  }
});

add_task(async function an_old_deletion_review_is_cleared_when_the_rotation_changes() {
  const { createSyncKeysPanel } = ChromeUtils.importESModule("resource:///modules/MidoriSyncKeysPanel.sys.mjs");
  const rotationId = "c95c2444-ed09-44e0-ad9c-d71dcbcc2861";
  const service = {
    account: { snapshot: { status: "connected", busy: false } },
    keys: {
      snapshot: { status: "ready", busy: false, incompatibleSessions: 0, canRotate: false,
        rotation: { operation_id: rotationId, phase: "rewriting", live_records: 1 } },
      cancelDraft() {},
    },
    async migrateEncryption() {
      throw Object.assign(new Error("legacy_tombstone_review_required"), {
        code: "legacy_tombstone_review_required", review: [{ rotation_id: rotationId, collection: "history",
          generation: "16465ce4-71f9-4ffa-8455-d230c8e3bec2", id: "h1:" + "a".repeat(64),
          revision: "1", ttl: null, decision: null }],
      });
    },
  };
  const view = createSyncKeysPanel(document, service);
  document.documentElement.append(view.section);
  const get = id => view.section.querySelector(`#${id}`);
  try {
    openTestSyncKeysPanel(view);
    clickTestSyncKeyControl(get("midori-sync-keys-migrate"));
    await TestUtils.waitForCondition(() => !get("midori-sync-legacy-review").hidden);
    get("midori-sync-legacy-review-confirm").checked = true;
    service.keys.snapshot.rotation.operation_id = "f34141c4-c377-4a7d-b791-c55fe696c232";
    view.refresh();
    ok(get("midori-sync-legacy-review").hidden, "A review cannot carry into another rotation or account");
    ok(!get("midori-sync-legacy-review-confirm").checked);
    is(get("midori-sync-legacy-review-items").children.length, 0);
  } finally {
    view.close();
    view.section.remove();
  }
});
