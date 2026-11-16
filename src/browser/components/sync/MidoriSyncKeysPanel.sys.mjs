/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setL10n } from "./MidoriSyncUi.sys.mjs";

async function saveSyncRecoveryCode(doc, value, isCurrent) {
  const picker = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
  picker.init(doc.defaultView.browsingContext.topChromeWindow.browsingContext,
    await doc.l10n.formatValue("midori-sync-keys-download-title"), Ci.nsIFilePicker.modeSave);
  picker.defaultString = "midori-sync-recovery-code.txt";
  picker.defaultExtension = "txt";
  picker.appendFilters(Ci.nsIFilePicker.filterText);
  const result = await new Promise(resolve => picker.open(resolve));
  if (![Ci.nsIFilePicker.returnOK, Ci.nsIFilePicker.returnReplace].includes(result) || !isCurrent()) {
    return false;
  }
  const file = picker.file;
  if (!file.exists()) {
    file.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
  } else {
    await IOUtils.setPermissions(file.path, 0o600);
  }
  await IOUtils.writeUTF8(file.path, `${value}\n`, { flush: true });
  return true;
}

export function createSyncKeysPanel(doc, service, { saveRecoveryCode = saveSyncRecoveryCode } = {}) {
  const owner = {};
  const element = (tag, id) => {
    const node = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
    if (id) {
      node.id = id;
      setL10n(doc.l10n, node, id);
    }
    return node;
  };
  const button = (id, action) => {
    const node = element("button", id);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  };
  const section = element("section");
  section.className = "midori-sync-account";
  section.id = "midori-sync-keys";
  section.hidden = true;
  const status = element("p", "midori-sync-keys-locked");
  status.id = "midori-sync-keys-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const backup = element("form");
  backup.id = "midori-sync-backup-form";
  backup.hidden = true;
  const description = element("p", "midori-sync-keys-backup-help");
  const generatedLabel = element("label", "midori-sync-keys-generated-label");
  generatedLabel.htmlFor = "midori-sync-generated-code";
  const generated = element("textarea");
  generated.id = generatedLabel.htmlFor;
  generated.readOnly = true;
  generated.rows = 3;
  generated.autocomplete = "off";
  generated.spellcheck = false;
  const generatedDownload = button("midori-sync-keys-download", () => download(generated, saved));
  generatedDownload.id = "midori-sync-generated-download";
  const saved = element("input");
  saved.id = "midori-sync-code-saved";
  saved.type = "checkbox";
  const savedLabel = element("label", "midori-sync-keys-saved-label");
  savedLabel.htmlFor = saved.id;
  const confirmationLabel = element("label", "midori-sync-keys-confirmation-label");
  const confirmation = element("input");
  confirmation.id = "midori-sync-code-confirmation";
  confirmationLabel.htmlFor = confirmation.id;
  confirmation.maxLength = 8;
  confirmation.autocomplete = "off";
  confirmation.spellcheck = false;
  const revoke = element("input");
  revoke.id = "midori-sync-revoke-incompatible";
  revoke.type = "checkbox";
  const revokeLabel = element("label", "midori-sync-keys-revoke-label");
  revokeLabel.htmlFor = revoke.id;
  const confirm = element("button", "midori-sync-keys-confirm");
  confirm.type = "submit";
  const cancel = button("midori-sync-keys-cancel", () => {
    service.keys.cancelDraft(owner);
    clearSecrets();
    refresh();
  });
  backup.append(description, generatedLabel, generated, generatedDownload, saved, savedLabel, confirmationLabel, confirmation,
    revoke, revokeLabel, confirm, cancel);
  const storedBackup = element("form");
  storedBackup.id = "midori-sync-stored-backup-form";
  storedBackup.hidden = true;
  const storedDescription = element("p", "midori-sync-keys-stored-backup-help");
  const reveal = button("midori-sync-keys-reveal", () => act(async () => {
    const version = viewVersion;
    const value = await service.keys.revealRecoveryCode();
    if (visible && viewVersion === version) {
      storedCode.value = value;
      refresh();
      storedCode.focus();
    }
  }));
  const storedCode = element("textarea");
  storedCode.id = "midori-sync-stored-recovery-code";
  storedCode.readOnly = true;
  storedCode.rows = 3;
  storedCode.autocomplete = "off";
  storedCode.spellcheck = false;
  const storedDownload = button("midori-sync-keys-download", () => download(storedCode, storedSaved));
  storedDownload.id = "midori-sync-stored-download";
  const storedSaved = element("input");
  storedSaved.id = "midori-sync-stored-code-saved";
  storedSaved.type = "checkbox";
  const storedSavedLabel = element("label", "midori-sync-keys-saved-label");
  storedSavedLabel.htmlFor = storedSaved.id;
  const acknowledge = element("button", "midori-sync-keys-backup-done");
  acknowledge.type = "submit";
  storedBackup.append(storedDescription, reveal, storedCode, storedDownload, storedSaved, storedSavedLabel, acknowledge);
  const recovery = element("form");
  recovery.id = "midori-sync-recovery-form";
  recovery.hidden = true;
  const recoveryLabel = element("label", "midori-sync-keys-recovery-label");
  recoveryLabel.htmlFor = "midori-sync-recovery-code";
  const code = element("input");
  code.id = recoveryLabel.htmlFor;
  code.type = "password";
  code.maxLength = 256;
  code.required = true;
  code.autocomplete = "off";
  code.spellcheck = false;
  const recover = element("button", "midori-sync-keys-recover");
  recover.type = "submit";
  recovery.append(recoveryLabel, code, recover);
  const passwordForm = element("form");
  passwordForm.id = "midori-sync-account-password-form";
  const passwordHelp = element("p", "midori-sync-keys-password-help");
  const passwordLabel = element("label", "midori-sync-keys-password-label");
  const password = element("input");
  password.id = "midori-sync-account-password";
  passwordLabel.htmlFor = password.id;
  password.type = "password";
  password.maxLength = 4096;
  password.required = true;
  const passwordConfirmationLabel = element("label", "midori-sync-keys-password-confirmation-label");
  const passwordConfirmation = element("input");
  passwordConfirmation.id = "midori-sync-account-password-confirmation";
  passwordConfirmationLabel.htmlFor = passwordConfirmation.id;
  passwordConfirmation.type = "password";
  passwordConfirmation.maxLength = 4096;
  passwordConfirmation.autocomplete = "new-password";
  const passwordSubmit = element("button", "midori-sync-keys-password-save");
  passwordSubmit.type = "submit";
  const passwordResult = element("p");
  passwordResult.id = "midori-sync-password-result";
  passwordResult.setAttribute("role", "status");
  passwordForm.append(passwordHelp, passwordLabel, password, passwordConfirmationLabel, passwordConfirmation, passwordSubmit, passwordResult);
  const downloadStatus = element("p");
  downloadStatus.id = "midori-sync-download-status";
  downloadStatus.setAttribute("role", "status");
  downloadStatus.hidden = true;
  let visible = false;
  let exporting = false;
  let acting = false;
  let actionError = null;
  let previousKeysStatus = null;
  let viewVersion = 0;
  let visibilityVersion = 0;
  let accountGeneration = service.account.snapshot.generation;
  let migrationWorking = false;
  let deletionReview = [];
  const review = element("form");
  review.id = "midori-sync-legacy-review";
  review.hidden = true;
  const reviewTitle = element("h3", "midori-sync-keys-review-title");
  const reviewHelp = element("p", "midori-sync-keys-review-help");
  const reviewItems = element("ul");
  reviewItems.id = "midori-sync-legacy-review-items";
  const reviewConfirmed = element("input");
  reviewConfirmed.id = "midori-sync-legacy-review-confirm";
  reviewConfirmed.type = "checkbox";
  const reviewLabel = element("label", "midori-sync-keys-review-confirm");
  reviewLabel.htmlFor = reviewConfirmed.id;
  const reviewApprove = element("button", "midori-sync-keys-review-approve");
  reviewApprove.type = "submit";
  review.append(reviewTitle, reviewHelp, reviewItems, reviewConfirmed, reviewLabel, reviewApprove);
  const clearReview = () => {
    deletionReview = [];
    reviewItems.replaceChildren();
    reviewConfirmed.checked = false;
    review.hidden = true;
  };
  const clearSecrets = () => {
    ++viewVersion;
    generated.value = code.value = confirmation.value = "";
    saved.checked = revoke.checked = false;
    storedCode.value = "";
    storedSaved.checked = false;
    passwordForm.reset();
    actionError = null;
    passwordResult.textContent = "";
    passwordResult.removeAttribute("data-l10n-id");
    downloadStatus.hidden = true;
    downloadStatus.textContent = "";
    downloadStatus.removeAttribute("data-l10n-id");
    clearReview();
  };
  const download = (source, savedControl) => act(async () => {
    const version = viewVersion;
    const value = source.value;
    if (!value || exporting) {
      return;
    }
    const isCurrent = () => visible && viewVersion === version;
    exporting = true;
    downloadStatus.hidden = true;
    refresh();
    try {
      const saved = await saveRecoveryCode(doc, value, isCurrent);
      if (isCurrent()) {
        if (saved) {
          savedControl.checked = true;
        }
        setL10n(doc.l10n, downloadStatus, saved ? "midori-sync-keys-download-saved" : "midori-sync-keys-download-cancelled");
        downloadStatus.hidden = false;
      }
    } catch {
      if (isCurrent()) {
        setL10n(doc.l10n, downloadStatus, "midori-sync-keys-download-failed");
        downloadStatus.hidden = false;
      }
    } finally {
      exporting = false;
      if (isCurrent()) {
        refresh();
      }
    }
  });
  const act = async action => {
    if (acting) {
      return;
    }
    const version = visibilityVersion;
    actionError = null;
    acting = true;
    refresh();
    try {
      await action();
    } catch (error) {
      if (visible && version === visibilityVersion) {
        actionError = error.code ?? "keys_failed";
        showError(error.code);
      }
    } finally {
      acting = false;
      if (visible) {
        refresh();
      }
    }
  };
  const check = button("midori-sync-keys-check", () => act(async () => {
    await service.keys.refresh(owner);
    if (service.keys.snapshot.status === "ready" && service.keys.snapshot.rotation?.phase === "complete") {
      await runMigration();
    }
  }));
  const prepare = rotating => act(async () => {
    const version = viewVersion;
    if (rotating && typeof service.prepareEncryptionRotation === "function") {
      await service.prepareEncryptionRotation();
      if (!visible || viewVersion !== version) {
        return;
      }
    }
    const value = await service.keys[rotating ? "prepareRotation" : "prepareCreation"](owner);
    if (visible && viewVersion === version) {
      generated.value = value;
      refresh();
      generated.focus();
    }
  });
  const create = button("midori-sync-keys-create", () => prepare(false));
  const rotate = button("midori-sync-keys-rotate", () => prepare(true));
  const missingBackup = element("p", "midori-sync-keys-backup-missing");
  const replaceBackup = button("midori-sync-keys-replace-code", () => prepare(true));
  const runMigration = async ({ legacyDeletionDecisions } = {}) => {
    if (migrationWorking || typeof service.migrateEncryption !== "function") {
      return;
    }
    migrationWorking = true;
    const version = visibilityVersion;
    refresh();
    try {
      await service.migrateEncryption({ limit: 100, ...(legacyDeletionDecisions ? { legacyDeletionDecisions } : {}) });
      if (visible && version === visibilityVersion) {
        clearReview();
      }
    } catch (error) {
      if (error.code === "legacy_tombstone_review_required" && Array.isArray(error.review) && error.review.length === 1 &&
          visible && version === visibilityVersion) {
        deletionReview = structuredClone(error.review);
        reviewConfirmed.checked = false;
        reviewItems.replaceChildren(...deletionReview.map(item => {
          const node = element("li");
          setL10n(doc.l10n, node, "midori-sync-keys-review-item", {
            collection: item.collection, id: item.id, revision: item.revision,
          });
          return node;
        }));
      }
      if (error.code !== "journal_compaction_unsupported" &&
          service.keys.snapshot.status === "ready" && service.keys.snapshot.rotation?.phase === "complete") {
        throw Object.assign(new Error("rotation_finish_required", { cause: error }), { code: "rotation_finish_required" });
      }
      throw error;
    } finally {
      migrationWorking = false;
      if (visible) {
        refresh();
      }
    }
  };
  const migrate = button("midori-sync-keys-migrate", () => act(runMigration));
  reviewConfirmed.addEventListener("change", () => refresh());
  review.addEventListener("submit", event => {
    event.preventDefault();
    if (!reviewConfirmed.checked || migrationWorking || !deletionReview.length) {
      return;
    }
    const legacyDeletionDecisions = deletionReview.map(item => ({ ...item, decision: "delete" }));
    reviewConfirmed.checked = false;
    act(() => runMigration({ legacyDeletionDecisions }));
  });
  const remaining = element("p", "midori-sync-keys-rotation-remaining");
  setL10n(doc.l10n, remaining, "midori-sync-keys-rotation-remaining", { count: 0 });
  remaining.setAttribute("role", "status");
  remaining.setAttribute("aria-live", "polite");
  backup.addEventListener("submit", event => {
    event.preventDefault();
    const status = service.keys.snapshot.status;
    const pending = ["pending", "rotation-pending"].includes(status);
    if (!pending && (!saved.checked || !generated.value || confirmation.value.toUpperCase() !== generated.value.slice(-8))) {
      return;
    }
    act(async () => {
      if (status.startsWith("rotation-")) {
        await service.confirmEncryptionRotation({ recoveryCodeSaved: true, owner });
      } else {
        await service.keys.confirmCreation({ revokeIncompatible: revoke.checked, recoveryCodeSaved: true, owner });
      }
      clearSecrets();
      await service.keys.refresh(owner);
      if (status.startsWith("rotation-")) {
        await runMigration();
      }
    });
  });
  saved.addEventListener("change", () => refresh());
  confirmation.addEventListener("input", () => refresh());
  revoke.addEventListener("change", () => refresh());
  storedSaved.addEventListener("change", () => refresh());
  storedBackup.addEventListener("submit", event => {
    event.preventDefault();
    if (!storedCode.value || !storedSaved.checked) {
      return;
    }
    act(async () => {
      await service.keys.acknowledgeRecoveryBackup();
      clearSecrets();
      refresh();
    });
  });
  recovery.addEventListener("submit", event => {
    event.preventDefault();
    const value = code.value;
    code.value = "";
    act(() => service.keys.recover(value));
  });
  password.addEventListener("input", () => refresh());
  passwordConfirmation.addEventListener("input", () => refresh());
  passwordForm.addEventListener("submit", event => {
    event.preventDefault();
    const unlocking = service.keys.snapshot.status === "recovery-required";
    if (!password.value || (!unlocking && password.value !== passwordConfirmation.value)) {
      return;
    }
    const value = password.value;
    passwordForm.reset();
    passwordResult.textContent = "";
    passwordResult.removeAttribute("data-l10n-id");
    const version = viewVersion;
    act(async () => {
      await service.keys[unlocking ? "unlockWithAccountPassword" : "setAccountPassword"](value);
      if (visible && viewVersion === version) {
        refresh();
        setL10n(doc.l10n, passwordResult, unlocking ? "midori-sync-keys-password-unlocked" : "midori-sync-keys-password-saved");
      }
    });
  });
  const showError = error => {
    const id = ["recovery_failed", "invalid_recovery_code"].includes(error) ? "recovery-failed" :
      error === "busy" ? "busy" :
      error === "password_unlock_failed" ? "password-failed" :
      ["password_backup_unavailable", "password_unlock_unsupported"].includes(error) ? "password-unavailable" :
      error === "invalid_account_password" ? "password-invalid" :
      ["crypto_state_conflict", "local_keys_invalid", "registry_authentication_failed"].includes(error) ? "conflict" :
      error === "incompatible_devices" ? "incompatible" :
      error === "draft_in_another_window" ? "another-window" :
      error === "recovery_backup_required" ? "backup-required" :
      error === "rotation_unconfirmed" ? "rotation-pending" :
      error === "rotation_in_progress" ? "rotation-running" :
      ["rotation_finish_required", "rotation_cleanup_required", "local_key_capacity"].includes(error) ? "rotation-finish-required" :
      error === "journal_compaction_unsupported" ? "compaction-required" :
      error === "registry_auth_unsupported" ? "registry-server-required" :
      error === "rotation_conflict_retry" ? "rotation-retry" :
      error === "legacy_tombstone_review_required" ? "legacy-deletions" :
      error === "history_target_exists" ? "history-conflict" :
      error === "key_capacity" ? "key-capacity" :
      error === "sync_pending_operations" ? "rotation-blocked" :
      (error === "sync_paused" || error === "cancelled" && service.backgroundSnapshot?.globalEnabled === false) ? "paused" :
      error === "saved_journals_require_review" ? "saved-copies" :
      error === "legacy_migration_required" ? "migration-required" :
      ["enrollment_failed", "invalid_enrollment"].includes(error) ? "enrollment-failed" :
      error === "enrollment_unavailable" ? "enrollment-unavailable" :
      error === "enrollment_denied" ? "enrollment-denied" :
      error === "enrollment_expired" ? "enrollment-expired" :
      error === "activation_unconfirmed" ? "pending" : "failed";
    setL10n(doc.l10n, status, `midori-sync-keys-${id}`);
  };
  const refresh = () => {
    const account = service.account.snapshot;
    if (accountGeneration !== account.generation) {
      accountGeneration = account.generation;
      clearSecrets();
    }
    section.hidden = account.status !== "connected";
    if (section.hidden) {
      clearSecrets();
      return;
    }
    const keys = service.keys.snapshot;
    if (previousKeysStatus !== keys.status) {
      previousKeysStatus = keys.status;
      actionError = null;
    }
    if (deletionReview.some(item => item.rotation_id !== keys.rotation?.operation_id)) {
      clearReview();
    }
    const disabled = (account.interactionBusy ?? account.busy) || keys.busy || migrationWorking || acting;
    const passwordUnlocking = keys.status === "recovery-required";
    passwordForm.hidden = !keys.passwordUnlockSupported ||
      !(keys.status === "ready" && keys.rotation?.phase !== "rewriting" || passwordUnlocking && keys.passwordUnlockAvailable);
    password.disabled = passwordConfirmation.disabled = disabled;
    password.autocomplete = passwordUnlocking ? "current-password" : "new-password";
    passwordConfirmation.hidden = passwordConfirmationLabel.hidden = passwordUnlocking;
    passwordConfirmation.required = !passwordUnlocking;
    passwordSubmit.disabled = disabled || !password.value || (!passwordUnlocking && password.value !== passwordConfirmation.value);
    setL10n(doc.l10n, passwordSubmit, passwordUnlocking ? "midori-sync-keys-password-unlock" : "midori-sync-keys-password-save");
    setL10n(doc.l10n, passwordHelp, passwordUnlocking ? "midori-sync-keys-password-unlock-help" : "midori-sync-keys-password-help");
    if (passwordForm.hidden) {
      passwordForm.reset();
    }
    check.disabled = create.disabled = rotate.disabled = migrate.disabled = code.disabled = recover.disabled = cancel.disabled = saved.disabled =
      confirmation.disabled = revoke.disabled =
      reveal.disabled = storedSaved.disabled = disabled;
    replaceBackup.disabled = disabled;
    generatedDownload.disabled = storedDownload.disabled = disabled || exporting;
    review.hidden = !deletionReview.length || keys.status !== "ready" || keys.rotation?.phase !== "rewriting";
    reviewConfirmed.disabled = disabled;
    reviewApprove.disabled = disabled || !reviewConfirmed.checked || review.hidden;
    const drafting = ["backup-required", "rotation-backup-required"].includes(keys.status) && !!generated.value;
    if (!["backup-required", "rotation-backup-required"].includes(keys.status)) {
      generated.value = "";
      saved.checked = false;
      confirmation.value = "";
    }
    const pending = ["pending", "rotation-pending"].includes(keys.status);
    const rotating = keys.status.startsWith("rotation-");
    confirm.disabled = disabled || (!pending && (!saved.checked || !generated.value ||
      confirmation.value.toUpperCase() !== generated.value.slice(-8))) || (!rotating && keys.incompatibleSessions > 0 && !revoke.checked);
    check.hidden = drafting || ["pending", "rotation-pending", "empty", "recovery-required"].includes(keys.status);
    create.hidden = keys.status !== "empty";
    rotate.hidden = !keys.canRotate || drafting || pending;
    missingBackup.hidden = keys.status !== "ready" || keys.recoveryCodeAvailable !== false || keys.rotation?.phase === "rewriting";
    replaceBackup.hidden = missingBackup.hidden || !keys.canRotate;
    migrate.hidden = keys.status !== "ready" || keys.rotation?.phase !== "rewriting" || typeof service.migrateEncryption !== "function";
    remaining.hidden = keys.rotation?.phase !== "rewriting" || !Number.isSafeInteger(keys.rotation.live_records);
    if (!remaining.hidden) {
      setL10n(doc.l10n, remaining, "midori-sync-keys-rotation-remaining", { count: keys.rotation.live_records });
    }
    recovery.hidden = keys.status !== "recovery-required" && !(keys.status === "migration-required" && !keys.canRotate);
    backup.hidden = !drafting && !pending;
    storedBackup.hidden = keys.status !== "ready" || keys.rotation?.phase === "rewriting" || !keys.recoveryCodeAvailable;
    setL10n(doc.l10n, storedDescription, keys.backupPending ? "midori-sync-keys-stored-backup-help" : "midori-sync-keys-backup-available");
    advanced.hidden = check.hidden && rotate.hidden && migrate.hidden;
    storedCode.hidden = storedDownload.hidden = !storedCode.value;
    storedSaved.hidden = storedSavedLabel.hidden = acknowledge.hidden = !storedCode.value || !keys.backupPending;
    generatedDownload.hidden = !drafting;
    acknowledge.disabled = disabled || !storedCode.value || !storedSaved.checked;
    if (storedBackup.hidden) {
      storedCode.value = "";
      storedSaved.checked = false;
    }
    description.hidden = generatedLabel.hidden = generated.hidden = saved.hidden = savedLabel.hidden =
      confirmationLabel.hidden = confirmation.hidden = !drafting;
    cancel.hidden = pending;
    revoke.hidden = revokeLabel.hidden = rotating || keys.incompatibleSessions === 0;
    setL10n(doc.l10n, confirm, rotating ? "midori-sync-keys-confirm-rotation" : "midori-sync-keys-confirm");
    if (keys.busy || migrationWorking || acting) {
      setL10n(doc.l10n, status, "midori-sync-keys-working");
    } else if (keys.error) {
      showError(keys.error);
    } else if (actionError) {
      showError(actionError);
    } else {
      setL10n(doc.l10n, status, keys.status === "ready" && keys.rotation?.phase === "rewriting" ?
        keys.serverRecovery ? "midori-sync-keys-migration-running" : "midori-sync-keys-rotation-running" : keys.status === "ready" && keys.registryUpgradeRequired ?
          "midori-sync-keys-registry-upgrade-required" : keys.status === "ready" && keys.backupPending ?
          "midori-sync-keys-ready-backup" : keys.status === "recovery-required" && keys.passwordUnlockAvailable ?
            "midori-sync-keys-password-required" : `midori-sync-keys-${keys.status}`);
    }
  };
  const advanced = element("details");
  advanced.className = "midori-sync-advanced";
  advanced.append(element("summary", "midori-sync-keys-advanced-summary"), check, rotate, migrate);
  section.append(status, passwordForm, create, advanced, remaining, review, backup, storedBackup,
    missingBackup, replaceBackup, recovery, downloadStatus);
  return {
    section, refresh,
    open() { visible = true; ++visibilityVersion; refresh(); },
    close() { visible = false; ++visibilityVersion; clearSecrets(); service.keys.cancelDraft(owner); },
  };
}
