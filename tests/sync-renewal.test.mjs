/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { MidoriSyncAccount } from "../src/browser/components/sync/MidoriSyncAccount.sys.mjs";
import { normalizeSyncServer } from "../src/browser/components/sync/MidoriSyncServerConfig.sys.mjs";
import { validateSyncCapabilities } from "../src/browser/components/sync/MidoriSyncConnection.sys.mjs";

const server = normalizeSyncServer("http://localhost:8000", { allowLocalHTTP: true });
const code = "ABCD0123456789EF";
const capabilities = {
  protocol: "MSP", native_ready: false, account_version: 1, changes_version: 1, operations_version: 1,
  authentication: { pairing: true, development: true, issuer: "urn:midori:sync:local",
    refresh: { version: 1, request_bytes: 4096, lifetime_seconds: 2592000, receipts_per_session: 1024, sessions_per_account: 32 } },
  features: ["opaque_cursors", "snapshot_fence", "tombstones", "device_acknowledgements", "conditional_operations", "idempotent_operations"],
  limits: { change_page_records: 100, change_page_payload_bytes: 4194304, record_payload_bytes: 262144, operation_batch_records: 100, operation_batch_bytes: 4194304 },
};

function fixture() {
  const state = {
    clock: Date.parse("2026-09-30T12:00:00Z"), stored: null, requests: [], issued: null, rotations: 0,
    receipts: new Map(), beforeSave: null, afterSave: null, beforeLoad: null, beforeRequest: null, afterResponse: null,
    caps: structuredClone(capabilities), revoked: false,
  };
  const initial = {
    account_version: 1,
    identity: { issuer: "urn:midori:sync:local", subject: "renewal-fixture", kind: "development" },
    user: { id: "1", name: "Fixture", email: "fixture@local.invalid" },
    device: { id: "12345678-1234-4123-8123-123456789abc", name: "Desktop", type: "desktop" },
    expires_at: new Date(state.clock + 3600000).toISOString(), token: "a".repeat(64),
    refresh_version: 1, refresh_token: `mrf_${"a".repeat(64)}`,
    refresh_expires_at: new Date(state.clock + 2592000000).toISOString(),
  };
  state.issued = structuredClone(initial);
  const create = () => new MidoriSyncAccount({
    connection: { snapshot: { server, checking: false } }, now: () => state.clock, createId: randomUUID,
    prepareDisconnect: () => {},
    vaultFactory: () => ({
      async inspect() { return { present: state.stored !== null }; },
      async unlock() {},
      async load() { await state.beforeLoad?.(); return structuredClone(state.stored); },
      async save(scope, data, options) {
        await state.beforeSave?.(data, options);
        state.stored = structuredClone({ scope, data });
        await state.afterSave?.(data);
      },
      async clear() { state.stored = null; },
      close() {},
    }),
    transportFactory: () => ({
      async request(path, options = {}) {
        state.requests.push({ path, options: structuredClone(options) });
        await state.beforeRequest?.(path, options);
        let response;
        if (path === "api/v1/capabilities") {
          response = { status: 200, data: structuredClone(state.caps) };
        } else if (path === "api/v1/pair/redeem") {
          assert.equal(options.body.native_refresh, true);
          response = { status: 201, data: structuredClone(initial) };
        } else if (path === "api/v1/auth/refresh") {
          assert.equal(options.token, undefined, "Renewal proof never becomes a bearer header");
          if (options.method === "DELETE") {
            state.revoked = true;
            response = { status: 204, data: null };
          } else {
            const { refresh_token: proof, operation_id: id } = options.body;
            assert.equal(state.stored.data.renewal.pending, id, "The operation is durable before HTTP");
            assert.equal(state.stored.data.renewal.token, proof);
            const receipt = state.receipts.get(proof);
            if (receipt) {
              assert.equal(receipt.operation_id, id, "A consumed proof must keep its operation ID");
              response = { status: 200, data: structuredClone(receipt) };
            } else {
              assert.equal(proof, state.issued.refresh_token);
              const next = String(++state.rotations).padStart(64, "b");
              state.issued = { ...initial, token: next, refresh_token: `mrf_${next}`, operation_id: id,
                expires_in: 3600, expires_at: new Date(state.clock + 3600000).toISOString() };
              state.receipts.set(proof, structuredClone(state.issued));
              response = { status: 200, data: structuredClone(state.issued) };
            }
          }
        } else {
          if (state.revoked || options.token !== state.issued.token) {
            throw { code: "auth_required", status: 401 };
          }
          response = { status: 200, data: path === "api/v1/account" ? structuredClone(state.issued) : { accepted: true } };
        }
        return await state.afterResponse?.(path, options, response) ?? response;
      },
      close() {},
    }),
  });
  const pair = async () => { const account = create(); await account.pair(code, "Desktop"); return account; };
  const advance = (milliseconds = 3600000) => { state.clock += milliseconds; };
  const posts = () => state.requests.filter(({ path, options }) => path === "api/v1/auth/refresh" && options.method === "POST");
  return { state, create, pair, advance, posts };
}

test("capabilities negotiate renewal without treating unknown versions as version one", () => {
  assert.deepEqual(validateSyncCapabilities(capabilities).authentication.refresh, { version: 1, lifetimeSeconds: 2592000 });
  for (const patch of [{ request_bytes: 100 }, { lifetime_seconds: -1 }, { sessions_per_account: 0 }, { receipts_per_session: 1.5 }]) {
    const value = structuredClone(capabilities);
    Object.assign(value.authentication.refresh, patch);
    assert.throws(() => validateSyncCapabilities(value), /incompatible_server/);
  }
  const future = structuredClone(capabilities);
  future.authentication.refresh.version = 2;
  assert.equal(validateSyncCapabilities(future).authentication.refresh, undefined);
});

test("expired access renews in the same generation and preserves all protected custody", async () => {
  const { pair, state, advance, posts } = fixture();
  const account = await pair();
  const snapshots = [];
  account.subscribe(snapshot => snapshots.push(snapshot));
  state.stored.data.crypto = { fixture: "Sync key custody" };
  state.stored.data.journal = { fixture: "Sync journal identity" };
  const before = structuredClone(state.stored.data);
  const generation = account.snapshot.generation;
  advance();
  assert.equal(account.snapshot.status, "renewal-required");
  const response = await account.withSecrets(lease => lease.request("api/v1/fixture"));
  assert.equal(response.data.accepted, true);
  assert.equal(account.snapshot.status, "connected");
  assert.equal(account.snapshot.generation, generation);
  assert.equal(posts().length, 1);
  for (const field of ["crypto", "journal"]) {
    assert.deepEqual(state.stored.data[field], before[field]);
  }
  assert.equal(state.stored.data.renewal.pending, null);
  assert.equal(state.stored.data.renewal.expires_at, before.renewal.expires_at);
  assert.ok(!JSON.stringify(snapshots).includes(before.renewal.token));
  assert.ok(!JSON.stringify(snapshots).includes(state.issued.token));
});

test("renewal accepts the same absolute expiration in another ISO offset", async () => {
  const { pair, state, advance } = fixture();
  const account = await pair();
  const expiry = state.stored.data.renewal.expires_at;
  advance();
  state.afterResponse = (path, options, response) => {
    if (path === "api/v1/auth/refresh" && options.method === "POST") {
      response.data.refresh_expires_at = expiry.replace("Z", "+00:00");
    }
    if (path === "api/v1/account") {
      response.data.expires_at = response.data.expires_at.replace("Z", "+00:00");
    }
    return response;
  };
  await account.renew();
  assert.equal(account.snapshot.status, "connected");
  assert.equal(Date.parse(state.stored.data.renewal.expires_at), Date.parse(expiry));
  await account.withSecrets(lease => lease.request("api/v1/fixture"));
});

test("locking after remote rotation keeps the durable intent for recovery after explicit unlock", async () => {
  const { pair, state, advance, posts } = fixture();
  const account = await pair();
  const originalProof = state.stored.data.renewal.token;
  advance();
  state.beforeSave = (data, options) => {
    assert.equal(options.interactive, false, "Every background checkpoint forbids prompts");
    if (data.renewal.pending === null) { throw { code: "vault_locked" }; }
  };
  await assert.rejects(account.withSecrets(lease => lease.request("api/v1/fixture")), /vault_locked/);
  assert.equal(account.snapshot.status, "locked");
  assert.equal(state.rotations, 1);
  assert.equal(state.stored.data.renewal.token, originalProof);
  assert(state.stored.data.renewal.pending);
  const id = state.stored.data.renewal.pending;
  state.beforeSave = null;
  await account.unlock();
  assert.equal(account.snapshot.status, "connected");
  assert.equal(state.stored.data.renewal.pending, null);
  assert.equal(state.stored.data.renewal.token, state.issued.refresh_token);
  assert.equal(state.rotations, 1, "Unlock recovers the receipt rather than rotating a second time");
  assert.deepEqual(posts().map(row => row.options.body.operation_id), [id, id]);
});

test("a lost response survives restart and an expired replay is saved before another rotation", async () => {
  const { pair, state, advance, posts, create } = fixture();
  const account = await pair();
  advance();
  state.afterResponse = (path, options) => {
    if (path === "api/v1/auth/refresh" && options.method === "POST") {
      state.afterResponse = null;
      throw { code: "network_error" };
    }
  };
  await assert.rejects(account.renew(), /network_error/);
  const pending = state.stored.data.renewal.pending;
  const recoveredProof = state.issued.refresh_token;
  account.close();
  advance(7200000);
  const reopened = create();
  await reopened.unlock();
  assert.equal(reopened.snapshot.status, "connected");
  assert.equal(state.rotations, 2);
  assert.equal(posts().length, 3);
  assert.equal(posts()[1].options.body.operation_id, pending);
  assert.equal(posts()[2].options.body.refresh_token, recoveredProof);
  assert.notEqual(posts()[2].options.body.operation_id, pending);
  assert.equal(state.stored.data.renewal.pending, null);
});

for (const stage of ["intent-before", "intent-after", "response-before", "response-after"]) {
  test(`uncertain ${stage} persistence recovers without losing custody or reusing a consumed proof`, async () => {
    const { pair, state, advance, posts } = fixture();
    const account = await pair();
    state.stored.data.link = { fixture: "protected Link custody" };
    const generation = account.snapshot.generation;
    advance();
    const hook = stage.endsWith("before") ? "beforeSave" : "afterSave";
    state[hook] = data => {
      if ((data.renewal.pending !== null) === stage.startsWith("intent")) {
        state[hook] = null;
        throw { code: "vault_unavailable" };
      }
    };
    await assert.rejects(account.renew(), /vault_unavailable/);
    assert.equal(posts().length, stage.startsWith("intent") ? 0 : 1);
    const firstOperation = posts()[0]?.options.body.operation_id;
    await account.renew();
    assert.equal(state.rotations, 1);
    assert.equal(state.stored.data.renewal.pending, null);
    assert.equal(account.snapshot.status, "connected");
    assert.equal(account.snapshot.generation, generation);
    assert.deepEqual(state.stored.data.link, { fixture: "protected Link custody" });
    if (stage === "response-before") {
      assert.equal(posts()[1].options.body.operation_id, firstOperation);
    }
    if (stage === "response-after") {
      assert.equal(posts().length, 1, "A committed credential replacement needs verification, not another rotation");
    }
  });
}

test("concurrent 401 responses share one renewal and retry each original request only once", async () => {
  const { pair, state, posts } = fixture();
  const account = await pair();
  const expired = state.issued.token;
  state.beforeRequest = (path, options) => {
    if (path.startsWith("api/v1/fixture") && options.token === expired) {
      throw { code: "auth_required", status: 401 };
    }
  };
  const responses = await account.withSecrets(lease => Promise.all([
    lease.request("api/v1/fixture-a", { method: "POST", body: { id: "a" } }),
    lease.request("api/v1/fixture-b", { method: "POST", body: { id: "b" } }),
  ]));
  assert.equal(responses.length, 2);
  assert.equal(posts().length, 1);
  assert.equal(state.requests.filter(({ path }) => path.startsWith("api/v1/fixture")).length, 4);
});

test("cancellation before or during vault access cannot begin automatic renewal", async () => {
  for (const duringLoad of [false, true]) {
    const { pair, state, advance, posts } = fixture();
    const account = await pair();
    advance();
    const before = structuredClone(state.stored);
    const calls = state.requests.length;
    const controller = new AbortController();
    if (duringLoad) {
      state.beforeLoad = () => controller.abort();
    } else {
      controller.abort();
    }
    await assert.rejects(account.withSecrets(() => assert.fail("Cancelled work must not run"), { signal: controller.signal }), /cancelled/);
    assert.equal(posts().length, 0);
    assert.equal(state.requests.length, calls);
    assert.deepEqual(state.stored, before);
    assert.equal(account.snapshot.status, "renewal-required");
  }
});

test("cancelling a denied request cannot trigger a renewal or expire the account", async () => {
  const { pair, state, posts } = fixture();
  const account = await pair();
  const controller = new AbortController();
  state.beforeRequest = path => {
    if (path === "api/v1/fixture") {
      controller.abort();
      throw { code: "auth_required", status: 401 };
    }
  };
  await assert.rejects(account.withSecrets(lease => lease.request("api/v1/fixture", { signal: controller.signal })), /cancelled/);
  assert.equal(posts().length, 0);
  assert.equal(account.snapshot.status, "connected");
});

test("a renewal already dispatched completes protected custody before cancelling its data lease", async () => {
  const { pair, state, advance, posts } = fixture();
  const account = await pair();
  advance();
  const controller = new AbortController();
  state.afterResponse = path => {
    if (path === "api/v1/auth/refresh") {
      controller.abort();
    }
  };
  await assert.rejects(account.withSecrets(() => assert.fail("Cancelled data request must not run"), { signal: controller.signal }), /cancelled/);
  assert.equal(posts().length, 1);
  assert.equal(state.rotations, 1);
  assert.equal(state.stored.data.token, state.issued.token);
  assert.equal(state.stored.data.renewal.pending, null);
  assert.equal(account.snapshot.status, "connected");
  state.afterResponse = null;
  await account.withSecrets(lease => lease.request("api/v1/fixture"));
  assert.equal(posts().length, 1, "The committed replacement credentials are reused after resuming");
});

test("a second 401 ends online access without deleting any saved keys", async () => {
  const { pair, state, posts } = fixture();
  const account = await pair();
  state.stored.data.crypto = { fixture: "protected key" };
  state.beforeRequest = path => { if (path === "api/v1/fixture") { throw { code: "auth_required", status: 401 }; } };
  await assert.rejects(account.withSecrets(lease => lease.request("api/v1/fixture")), /auth_required/);
  assert.equal(posts().length, 1);
  assert.equal(account.snapshot.status, "expired");
  assert.deepEqual(state.stored.data.crypto, { fixture: "protected key" });
});

test("renewal callers share the same in-flight operation", async () => {
  const { pair, advance, posts } = fixture();
  const account = await pair();
  advance();
  const first = account.renew();
  const second = account.renew();
  assert.equal(first, second);
  await Promise.all([first, second]);
  assert.equal(posts().length, 1);
});

test("rate limits retain the operation and its bounded retry delay", async () => {
  const { pair, state, advance, posts } = fixture();
  const account = await pair();
  advance();
  state.beforeRequest = path => { if (path === "api/v1/auth/refresh") { throw { code: "rate_limited", status: 429, retryAfter: 45 }; } };
  await assert.rejects(account.renew(), error => error.code === "rate_limited" && error.retryAfter === 45);
  const pending = state.stored.data.renewal.pending;
  state.beforeRequest = null;
  await account.renew();
  assert.equal(posts()[1].options.body.operation_id, pending);
});

test("a changed issuer or unsupported capability cannot receive the saved renewal proof", async () => {
  for (const changedIssuer of [true, false]) {
    const { pair, state, advance, posts } = fixture();
    const account = await pair();
    advance();
    if (changedIssuer) {
      Object.assign(state.caps.authentication, { issuer: "https://another.example/", development: false });
    } else {
      delete state.caps.authentication.refresh;
    }
    await assert.rejects(account.renew(), /account_scope_mismatch|refresh_unavailable/);
    assert.equal(posts().length, 0);
    assert.equal(state.stored.data.renewal.pending, null);
  }
});

test("changed identity, operation, device or absolute expiry cannot replace stored credentials", async () => {
  for (const field of ["identity", "operation_id", "device", "refresh_expires_at"]) {
    const { pair, state, advance } = fixture();
    const account = await pair();
    const token = state.stored.data.token;
    advance();
    state.afterResponse = (path, options, response) => {
      if (path === "api/v1/auth/refresh" && options.method === "POST") {
        response.data[field] = field === "identity" ? { ...response.data.identity, subject: "foreign" } :
          field === "device" ? { ...response.data.device, id: randomUUID() } :
          field === "operation_id" ? randomUUID() : new Date(state.clock + 2600000000).toISOString();
      }
    };
    await assert.rejects(account.renew(), /invalid_renewal/);
    assert.equal(state.stored.data.token, token);
    assert.ok(state.stored.data.renewal.pending);
    assert.equal(account.snapshot.status, "renewal-required");
  }
});

test("profile closure after the server rotates leaves only the durable recoverable intent", async () => {
  const { pair, state, advance, posts, create } = fixture();
  const account = await pair();
  advance();
  state.afterResponse = path => {
    if (path === "api/v1/auth/refresh") { state.afterResponse = null; account.close(); }
  };
  await assert.rejects(account.renew(), /cancelled/);
  assert.ok(state.stored.data.renewal.pending);
  assert.equal(account.snapshot.status, "closed");
  const next = create();
  await next.unlock();
  assert.equal(posts().length, 2);
  assert.equal(state.rotations, 1);
  assert.equal(next.snapshot.status, "connected");
});

test("replacement verification failure keeps new credentials recoverable without authorizing a callback", async () => {
  const { pair, state, advance, posts } = fixture();
  const account = await pair();
  advance();
  state.beforeRequest = path => { if (path === "api/v1/account") { throw { code: "network_error" }; } };
  await assert.rejects(account.withSecrets(() => assert.fail("Verification must finish first")), /network_error/);
  assert.equal(account.snapshot.status, "renewal-required");
  assert.equal(state.stored.data.token, state.issued.token);
  state.beforeRequest = null;
  await account.withSecrets(lease => lease.request("api/v1/fixture"));
  assert.equal(posts().length, 1);
  assert.equal(account.snapshot.status, "connected");
});
