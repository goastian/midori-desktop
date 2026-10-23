/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MIDORI_SYNC_OFFICIAL_SERVER,
  normalizeSyncServer,
  syncAccountScope,
} from "../src/browser/components/sync/MidoriSyncServerConfig.sys.mjs";

test("official URL normalization and proxy path preserve API authority", () => {
  const official = normalizeSyncServer("SYNC.ASTIAN.ORG:443");
  assert.equal(official.baseURL, MIDORI_SYNC_OFFICIAL_SERVER);
  assert.equal(official.official, true);
  const custom = normalizeSyncServer("https://example.com:8443/midori");
  assert.equal(custom.apiURL, "https://example.com:8443/midori/api/v1/");
  assert.equal(custom.capabilitiesURL, "https://example.com:8443/midori/api/v1/capabilities");
  assert.equal(custom.official, false);
  assert(Object.isFrozen(custom));
});

test("HTTP loopback requires explicit per-profile authorization", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.throws(() => normalizeSyncServer(`http://${host}:8000`), { code: "https_required" });
    const local = normalizeSyncServer(`http://${host}:8000`, { allowLocalHTTP: true });
    assert.equal(local.loopback, true);
    assert.equal(local.requiresLoopbackTransport, true);
    assert.equal(new URL(local.apiURL).host, `${host}:8000`);
  }
  const local = normalizeSyncServer("http://localhost:8000", { allowLocalHTTP: true });
  assert.equal(local.transportBaseURL, "http://127.0.0.1:8000/");
  assert.throws(() => normalizeSyncServer("http://localhost:8000", { allowLocalHTTP: "true" }), { code: "https_required" });
});

test("local exception never authorizes LAN hosts or localhost lookalikes", () => {
  for (const host of ["localhost.example.org", "example-localhost.org", "192.168.1.2", "10.0.0.1", "[::ffff:127.0.0.1]", "localhost."]) {
    assert.throws(() => normalizeSyncServer(`http://${host}`, { allowLocalHTTP: true }), { code: "https_required" });
  }
});

test("credentials, queries, fragments and unexpected schemes are rejected", () => {
  for (const value of [
    "https://user:secret@example.com", "https://user@example.com", "file:///tmp/sync",
    "https://@example.com", "https://example.com:0",
    "javascript:alert(1)", "https://example.com?token=secret", "https://example.com#fragment",
    "https://example.com?", "https://example.com#", "https://example.com\\evil", "https://example.com/ a",
    "https://exam\nple.com", "", " ", null, {}, "x".repeat(2049),
  ]) {
    assert.throws(() => normalizeSyncServer(value), { code: "invalid_server_url" });
  }
});

test("account and pending work scopes change with instance, issuer or subject", () => {
  const one = normalizeSyncServer("https://example.com/a");
  const two = normalizeSyncServer("https://example.com/b");
  const scopes = [
    syncAccountScope(one, "https://accounts.astian.org", "subject-a"),
    syncAccountScope(two, "https://accounts.astian.org", "subject-a"),
    syncAccountScope(one, "https://accounts.example.com", "subject-a"),
    syncAccountScope(one, "https://accounts.astian.org", "subject-b"),
  ];
  assert.equal(new Set(scopes).size, 4);
  assert.equal(scopes[0], syncAccountScope(normalizeSyncServer("https://example.com:443/a/"), "https://accounts.astian.org", "subject-a"));
});
