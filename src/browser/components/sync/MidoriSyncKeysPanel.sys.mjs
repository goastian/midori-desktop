/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function createSyncKeysPanel(doc, service) {
  const owner = {};
  const element = (tag, id) => {
    const node = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
    if (id) {
      node.id = id;
      doc.l10n.setAttributes(node, id);
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
  const saved = element("input");
  saved.id = "midori-sync-code-saved";
  saved.type = "checkbox";
  const savedLabel = element("label", "midori-sync-keys-saved-label");
  savedLabel.htmlFor = saved.id;
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
  backup.append(description, generatedLabel, generated, saved, savedLabel, revoke, revokeLabel, confirm, cancel);
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
  const storedSaved = element("input");
  storedSaved.id = "midori-sync-stored-code-saved";
  storedSaved.type = "checkbox";
  const storedSavedLabel = element("label", "midori-sync-keys-saved-label");
  storedSavedLabel.htmlFor = storedSaved.id;
  const acknowledge = element("button", "midori-sync-keys-backup-done");
  acknowledge.type = "submit";
  storedBackup.append(storedDescription, reveal, storedCode, storedSaved, storedSavedLabel, acknowledge);
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
  let visible = false;
  let viewVersion = 0;
  const clearSecrets = () => {
    ++viewVersion;
    generated.value = code.value = "";
    saved.checked = revoke.checked = false;
    storedCode.value = "";
    storedSaved.checked = false;
  };
  const act = async action => {
    try {
      await action();
    } catch (error) {
      if (visible) {
        showError(error.code);
      }
    }
  };
  const check = button("midori-sync-keys-check", () => act(() => service.keys.refresh(owner)));
  const create = button("midori-sync-keys-create", () => act(async () => {
    if (service.keys.snapshot.incompatibleSessions === 0) {
      await service.keys.bootstrap();
      refresh();
      return;
    }
    const version = viewVersion;
    const value = await service.keys.prepareCreation(owner);
    if (visible && viewVersion === version) {
      generated.value = value;
      refresh();
      generated.focus();
    }
  }));
  backup.addEventListener("submit", event => {
    event.preventDefault();
    const pending = service.keys.snapshot.status === "pending";
    if (!pending && (!saved.checked || !generated.value)) {
      return;
    }
    act(async () => {
      await service.keys.confirmCreation({ revokeIncompatible: revoke.checked, owner });
      clearSecrets();
      await service.keys.refresh(owner);
    });
  });
  saved.addEventListener("change", () => refresh());
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
  const showError = error => {
    const id = ["recovery_failed", "invalid_recovery_code"].includes(error) ? "recovery-failed" :
      ["crypto_state_conflict", "local_keys_invalid"].includes(error) ? "conflict" :
      error === "incompatible_devices" ? "incompatible" :
      error === "draft_in_another_window" ? "another-window" :
      error === "activation_unconfirmed" ? "pending" : "failed";
    doc.l10n.setAttributes(status, `midori-sync-keys-${id}`);
  };
  const refresh = () => {
    const account = service.account.snapshot;
    section.hidden = account.status !== "connected";
    if (section.hidden) {
      clearSecrets();
      return;
    }
    const keys = service.keys.snapshot;
    const disabled = account.busy || keys.busy;
    check.disabled = create.disabled = code.disabled = recover.disabled = cancel.disabled = saved.disabled = revoke.disabled =
      reveal.disabled = storedSaved.disabled = disabled;
    const drafting = keys.status === "backup-required" && !!generated.value;
    if (keys.status !== "backup-required") {
      generated.value = "";
      saved.checked = false;
    }
    const pending = keys.status === "pending";
    confirm.disabled = disabled || (!pending && !saved.checked) || (keys.incompatibleSessions > 0 && !revoke.checked);
    check.hidden = drafting || ["pending", "empty", "recovery-required"].includes(keys.status);
    create.hidden = keys.status !== "empty";
    recovery.hidden = keys.status !== "recovery-required";
    backup.hidden = !drafting && !pending;
    storedBackup.hidden = keys.status !== "ready" || !keys.backupPending;
    storedCode.hidden = storedSaved.hidden = storedSavedLabel.hidden = !storedCode.value;
    acknowledge.disabled = disabled || !storedCode.value || !storedSaved.checked;
    if (storedBackup.hidden) {
      storedCode.value = "";
      storedSaved.checked = false;
    }
    description.hidden = generatedLabel.hidden = generated.hidden = saved.hidden = savedLabel.hidden = !drafting;
    cancel.hidden = pending;
    revoke.hidden = revokeLabel.hidden = keys.incompatibleSessions === 0;
    if (keys.busy) {
      doc.l10n.setAttributes(status, "midori-sync-keys-working");
    } else if (keys.error) {
      showError(keys.error);
    } else {
      doc.l10n.setAttributes(status, keys.status === "ready" && keys.backupPending ?
        "midori-sync-keys-ready-backup" : `midori-sync-keys-${keys.status}`);
    }
  };
  section.append(status, check, create, backup, storedBackup, recovery);
  return {
    section, refresh,
    open() { visible = true; refresh(); },
    close() { visible = false; clearSecrets(); service.keys.cancelDraft(owner); },
  };
}
