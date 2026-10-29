/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const MIDORI_SYNC_SETTINGS_URL = "about:sync";

/**
 * Sets a Fluent id only when it differs from the current one, so repeated
 * refreshes do not retranslate the node and make it flicker.
 */
export function setL10n(l10n, node, id, args) {
  const serialized = args === undefined ? null : JSON.stringify(args);
  if (node.getAttribute("data-l10n-id") === id && (node.getAttribute("data-l10n-args") ?? null) === serialized) {
    return;
  }
  l10n.setAttributes(node, id, args);
}

export function syncAccountErrorId(error) {
  return error === "busy" ? "busy" :
    error === "primary_password_required" ? "primary-password" :
    ["vault_locked", "vault_unavailable"].includes(error) ? "vault-locked" :
    error === "invalid_pairing_input" ? "invalid-code" :
    error === "invalid_pairing_code" ? "expired-code" :
    error === "sync_pending_operations" ? "sync-pending" :
    error === "saved_journals_require_review" ? "saved-copies" :
    error === "sync_disconnect_unavailable" ? "sync-unverified" :
    error === "revocation_unconfirmed" ? "revocation-unconfirmed" :
    ["renewal_pending", "refresh_unavailable", "renewal_unavailable"].includes(error) ? "renewal-required" :
    ["invalid_renewal", "refresh_superseded", "refresh_operation_conflict", "refresh_capacity"].includes(error) ? "renewal-failed" :
    ["vault_corrupt", "vault_unreadable", "local_secret_missing"].includes(error) ? "saved-unreadable" :
    error === "pairing_unavailable" ? "unavailable" :
    ["oidc_unavailable", "oidc_provider_unavailable", "oidc_invalid_response", "oidc_timeout"].includes(error) ? "authorization-failed" :
    ["oidc_authorization_cancelled", "cancelled"].includes(error) ? "authorization-cancelled" :
    error === "auth_required" ? "expired" :
    ["account_scope_mismatch", "refresh_identity_changed", "native_identity_required", "identity_issuer_mismatch", "invalid_account_identity"].includes(error) ? "identity-changed" : "failed";
}

export function syncDisplayName(account) {
  const user = account.user;
  const name = (user?.name || user?.email || "").trim();
  return name.split("@")[0] || name;
}

/**
 * Summarizes the account, keys and collections into one state for the popup.
 */
export function syncSummary(service) {
  const account = service.account.snapshot;
  if (account.status === "unknown") {
    return "checking";
  }
  if (account.status === "signed-out") {
    return "signed-out";
  }
  if (["expired", "renewal-required"].includes(account.status)) {
    return "reconnect";
  }
  if (["locked", "error"].includes(account.status)) {
    return "locked";
  }
  const keys = service.keys.snapshot;
  if (keys.accountRecoverySupported && !keys.error && keys.status !== "ready") {
    return "syncing";
  }
  if (keys.status === "recovery-required") {
    return keys.passwordUnlockAvailable ? "password" : "recovery";
  }
  if (["backup-required", "rotation-backup-required"].includes(keys.status)) {
    return "backup";
  }
  if (keys.status === "ready" && keys.backupPending && !keys.accountRecoverySupported) {
    return "backup-pending";
  }
  if (keys.status === "migration-required") {
    return "migration";
  }
  if (keys.error || ["pending", "rotation-pending"].includes(keys.status) ||
      (keys.status === "ready" && service.enrollmentRequests?.length)) {
    return "attention";
  }
  const background = service.backgroundSnapshot;
  if (background?.globalEnabled === false || background?.enabled === false) {
    return "paused";
  }
  if (background?.offline || account.status === "local" && keys.status === "ready") {
    if (service.syncCollectionsSnapshot?.some(collection => collection.status === "error" &&
        !["network_error", "timeout", "server_error", "rate_limited", "form_history_disabled"].includes(collection.error))) {
      return "attention";
    }
    return "offline";
  }
  if (background?.suspended) {
    return "paused";
  }
  if (keys.status !== "ready") {
    return keys.busy ? "syncing" : "attention";
  }
  const collections = service.syncCollectionsSnapshot ?? [];
  if (collections.some(c => c.status === "unsupported")) {
    return "attention";
  }
  const active = collections.filter(c => !["disabled", "unsupported"].includes(c.status));
  if (!active.length) {
    return "paused";
  }
  if (active.some(c => ["locked", "conflict", "error"].includes(c.status))) {
    return "attention";
  }
  if (active.some(c => c.status === "offline")) {
    return "offline";
  }
  if (active.some(c => ["syncing", "pending", "more", "ready", "paused"].includes(c.status))) {
    return "syncing";
  }
  return active.every(c => c.status === "completed") ? "synced" : "attention";
}
