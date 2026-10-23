/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import test from "node:test";
import { syncSummary } from "../src/browser/components/sync/MidoriSyncUi.sys.mjs";
import { syncConflictSummary } from "../src/browser/components/sync/MidoriSyncConflictSummary.sys.mjs";

test("conflict summaries redact credentials, card numbers, form values and URL credentials or queries", () => {
  const secret = "must never reach the summary";
  const cases = [
    ["passwords", { origin: "https://user:secret@example.invalid/path?token=secret", username: "alice", password: secret }],
    ["credit-cards", { number: "4111111111111234", name: secret }],
    ["form-history", { fieldname: "city", value: secret }],
    ["bookmarks", { title: "Bookmark", url: "https://user:secret@example.invalid/path?token=secret" }],
    ["addresses", { fields: { "given-name": "Alice", country: "CO", "street-address": secret, email: secret } }],
  ];
  for (const [collection, value] of cases) {
    const serialized = JSON.stringify(syncConflictSummary(collection, "opaque-id", value));
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes("4111111111111234"), false);
    assert.equal(serialized.includes("user:secret"), false);
    assert.equal(serialized.includes("token=secret"), false);
  }
  assert.deepEqual(syncConflictSummary("credit-cards", "id", cases[1][1]).fields,
    [{ name: "card-ending", value: "1234" }]);
  assert.deepEqual(syncConflictSummary("history", "id", null), { deleted: true, fields: [] });
  const summary = syncConflictSummary("bookmarks", "id", { title: `Title\n${"a".repeat(500)}` });
  assert.equal(summary.fields[0].value.length, 300);
  assert.equal(summary.fields[0].value.includes("\n"), false);
});

test("permission summaries use translated actions and never derive translation IDs from unknown values", () => {
  const summary = syncConflictSummary("site-permissions", "opaque", {
    origin: "https://example.invalid", permission: "camera", action: "deny",
  });
  assert.deepEqual(summary.fields, [
    { name: "website", value: "https://example.invalid" },
    { name: "permission", l10nId: "midori-sync-permission-type-camera" },
    { name: "permission-action", l10nId: "midori-sync-permission-action-deny" },
  ]);
  assert.deepEqual(syncConflictSummary("site-permissions", "opaque", {
    origin: "https://example.invalid", permission: "__proto__", action: "untrusted-action",
  }).fields, [{ name: "website", value: "https://example.invalid" }]);
});


function service() {
  return {
    account: { snapshot: { status: "connected" } },
    keys: { snapshot: { status: "ready" } },
    backgroundSnapshot: { globalEnabled: true, enabled: true, offline: false, suspended: false },
    syncCollectionsSnapshot: [{ name: "bookmarks", status: "completed" }],
  };
}

test("only completed selected collections report synchronized", () => {
  const current = service();
  assert.equal(syncSummary(current), "synced");
  for (const status of ["pending", "more", "ready", "syncing", "paused"]) {
    current.syncCollectionsSnapshot[0].status = status;
    assert.equal(syncSummary(current), "syncing");
  }
  for (const status of ["conflict", "error", "locked", "unknown", "unsupported"]) {
    current.syncCollectionsSnapshot[0].status = status;
    assert.equal(syncSummary(current), "attention");
  }
  current.syncCollectionsSnapshot[0].status = "disabled";
  assert.equal(syncSummary(current), "paused");
});

test("a signed-in profile with a password capsule asks to unlock Sync", () => {
  const current = service();
  current.keys.snapshot = { status: "recovery-required", passwordUnlockAvailable: true };
  assert.equal(syncSummary(current), "password");
  current.keys.snapshot.passwordUnlockAvailable = false;
  assert.equal(syncSummary(current), "recovery");
});

test("offline and paused accounts never report synchronized", () => {
  const current = service();
  current.backgroundSnapshot.offline = true;
  assert.equal(syncSummary(current), "offline");
  current.backgroundSnapshot.offline = false;
  current.syncCollectionsSnapshot[0].status = "offline";
  assert.equal(syncSummary(current), "offline");
  for (const option of ["globalEnabled", "enabled"]) {
    const paused = service();
    paused.backgroundSnapshot[option] = false;
    assert.equal(syncSummary(paused), "paused");
  }
  current.backgroundSnapshot.suspended = true;
  assert.equal(syncSummary(current), "paused");
});

test("locally unlocked custody shows offline while remote account verification is pending", () => {
  const current = service();
  current.account.snapshot.status = "local";
  current.keys.snapshot.localOnly = true;
  assert.equal(syncSummary(current), "offline");
  current.syncCollectionsSnapshot = [{ name: "bookmarks", status: "error", error: "store_corrupt" }];
  assert.equal(syncSummary(current), "attention", "An offline capture failure is not presented as safely saved");
  current.syncCollectionsSnapshot[0].error = "rate_limited";
  assert.equal(syncSummary(current), "offline");
  current.keys.snapshot = { status: "locked", error: "offline_keys_unavailable" };
  assert.equal(syncSummary(current), "attention");
});

test("account inspection, renewal and encryption actions have distinct states", () => {
  const current = service();
  for (const [status, expected] of [["unknown", "checking"], ["signed-out", "signed-out"],
    ["locked", "locked"], ["expired", "reconnect"], ["renewal-required", "reconnect"]]) {
    current.account.snapshot.status = status;
    assert.equal(syncSummary(current), expected);
  }
  current.account.snapshot.status = "connected";
  for (const [status, expected] of [["recovery-required", "recovery"], ["migration-required", "migration"],
    ["backup-required", "backup"], ["rotation-backup-required", "backup"],
    ["pending", "attention"], ["rotation-pending", "attention"], ["empty", "attention"]]) {
    current.keys.snapshot.status = status;
    assert.equal(syncSummary(current), expected);
  }
  current.keys.snapshot = { status: "locked", busy: true };
  assert.equal(syncSummary(current), "syncing");
  current.keys.snapshot = { status: "ready", error: "registry_authentication_failed" };
  assert.equal(syncSummary(current), "attention");
  current.keys.snapshot = { status: "ready", backupPending: true };
  assert.equal(syncSummary(current), "backup-pending");
});
