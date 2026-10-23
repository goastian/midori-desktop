/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import test from "node:test";
import { MidoriSyncAccount } from "../src/browser/components/sync/MidoriSyncAccount.sys.mjs";
import { normalizeSyncServer, syncAccountScope } from "../src/browser/components/sync/MidoriSyncServerConfig.sys.mjs";

const server = normalizeSyncServer("http://localhost:8000", { allowLocalHTTP: true });
const now = Date.parse("2026-09-29T12:00:00Z");
const token = "fictional-session-token";
const code = "ABCD0123456789EF";
const accountData = {
  account_version: 1,
  identity: { issuer: "urn:midori:sync:local", subject: "user-a", kind: "development" },
  user: { id: "1", name: "Prueba ñ", email: "fixture@example.invalid" },
  device: { id: "321c5a85-2184-42fd-a087-725327681ebd", name: "Midori Desktop", type: "desktop" },
  expires_at: "2026-09-29T13:00:00+00:00",
};
const capabilities = {
  protocol: "MSP", native_ready: false, account_version: 1, changes_version: 1, operations_version: 1,
  authentication: { pairing: true, development: true, issuer: "urn:midori:sync:local" },
  features: ["opaque_cursors", "snapshot_fence", "tombstones", "device_acknowledgements", "conditional_operations", "idempotent_operations", "credit_cards"],
  collections: ["bookmarks", "history", "passwords", "credit-cards", "form-history", "addresses", "workspaces", "tabs", "browser-settings"],
  data_schemas: { bookmarks: 2, history: 2, passwords: 1, "credit-cards": 1, "form-history": 1,
    addresses: 1, workspaces: 1, tabs: 2, "browser-settings": 1 },
  limits: { change_page_records: 100, change_page_payload_bytes: 4194304, record_payload_bytes: 262144, operation_batch_records: 100, operation_batch_bytes: 4194304 },
};

function setup({ stored = null, request, unlock, save, clear, prepareDisconnect, oidcAuthorization, browserAuthorization } = {}) {
  const state = { stored, requests: [], opened: [], closed: [], time: now, unlocked: 0, vaultClosed: false };
  const vault = {
    async inspect() { return { present: state.stored !== null }; },
    async unlock() { ++state.unlocked; await unlock?.(); },
    async load() { await this.unlock(); return structuredClone(state.stored); },
    async save(scope, data) {
      state.stored = structuredClone({ scope, data });
      await save?.();
    },
    async clear() { await clear?.(); state.stored = null; return { keyDeleted: true }; },
    close() { state.vaultClosed = true; },
  };
  const connection = { snapshot: { server, checking: false } };
  const options = {
    connection, vaultFactory: () => vault, now: () => state.time, prepareDisconnect,
    oidcAuthorization, browserAuthorization,
    transportFactory(baseURL, config) {
      state.opened.push({ baseURL, config });
      return {
        async request(path, options) {
          state.requests.push({ baseURL, path, options });
          const override = await request?.(path, options, state);
          if (override !== undefined) {
            return override;
          }
          if (path === "api/v1/capabilities") {
            return { data: structuredClone(capabilities) };
          }
          if (path === "api/v1/pair/redeem") {
            return { data: { ...structuredClone(accountData), token, user: { ...accountData.user, id: 1 } } };
          }
          if (path === "api/v1/account") {
            assert.equal(options.token, token);
            return { data: structuredClone(accountData) };
          }
          assert.equal(path, "api/v1/auth/token");
          assert.equal(options.method, "DELETE");
          assert.equal(options.token, token);
          return { status: 204, data: null };
        },
        close() { state.closed.push(baseURL); },
      };
    },
  };
  return { state, vault, connection, create: () => new MidoriSyncAccount(options), account: new MidoriSyncAccount(options) };
}

test("signed-out local maintenance excludes sign-in and server changes without opening HTTP or custody", async () => {
  const { account, state } = setup();
  let enter;
  let release;
  const entered = new Promise(resolve => { enter = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  const maintenance = account.withSignedOutState(async () => { enter(); await held; return "local result"; });
  await entered;
  assert.equal(account.snapshot.busy, true);
  assert.equal(account.snapshot.interactionBusy, false);
  await assert.rejects(account.pair(code, "Midori Desktop"), /busy/);
  await assert.rejects(account.prepareServerChange(server), /busy/);
  await assert.rejects(account.withSignedOutState(() => {}), /busy/);
  release();
  assert.equal(await maintenance, "local result");
  assert.equal(account.snapshot.status, "signed-out");
  assert.equal(account.snapshot.busy, false);
  assert.equal(state.requests.length, 0);
  assert.equal(state.unlocked, 0);
  assert.equal(state.stored, null);
  await account.pair(code, "Midori Desktop");
  await assert.rejects(account.withSignedOutState(() => { throw new Error("Must keep the active account protected"); }),
    /local_state_unavailable/);
  assert.equal(account.snapshot.status, "connected");
  account.close();
});

test("pairing verifies identity before saving and exposes no credentials to subscribers", async () => {
  const { account, state } = setup();
  const snapshots = [];
  account.subscribe(value => snapshots.push(value));
  await account.pair("abcd-0123-4567-89ef", "Midori Desktop");
  assert.equal(account.snapshot.status, "connected");
  assert.equal(account.snapshot.creditCardsSupported, true);
  assert.equal(account.snapshot.collectionSupport["credit-cards"], true);
  assert.equal(account.snapshot.collectionSupport.workspaces, false);
  assert.equal(Object.isFrozen(account.snapshot.collectionSupport), true);
  assert.equal(account.snapshot.user.name, "Prueba ñ");
  assert.equal(state.unlocked, 1);
  assert.deepEqual(state.requests.map(value => value.path), ["api/v1/capabilities", "api/v1/pair/redeem", "api/v1/account"]);
  assert.equal(state.requests[0].options.token, undefined);
  assert.equal(state.requests[1].options.token, undefined);
  assert.equal(state.requests[1].options.body.device_type, "desktop");
  assert.equal(state.requests[1].options.body.pairing_token, code);
  assert.equal(state.stored.scope, syncAccountScope(server, accountData.identity.issuer, "user-a"));
  assert.equal(state.stored.data.token, token);
  assert.ok(!JSON.stringify(snapshots).includes(token));
  assert.ok(!JSON.stringify(snapshots).includes("user-a"));
  assert.equal(state.closed.length, 1);
});

test("local-only reopening can use protected custody after expiration without authorizing HTTP", async () => {
  const f = setup();
  await f.account.pair(code, "Desktop");
  f.state.stored.data.crypto = { fixture: "encrypted keys" };
  f.state.stored.data.journal = { version: 1, store_id: "0d0d0c9c-6a3d-4eba-8959-6586a6247605",
    device_id: accountData.device.id, initialized: false };
  const saved = structuredClone(f.state.stored);
  f.account.close();
  const account = f.create();
  f.state.time += 86400000;
  const requests = f.state.requests.length;
  const opened = f.state.opened.length;
  await account.unlock({ interactive: false, localOnly: true });
  assert.equal(account.snapshot.status, "local");
  assert.equal(account.snapshot.user.email, accountData.user.email);
  assert.equal(f.state.requests.length, requests);
  assert.equal(f.state.opened.length, opened);
  await account.withLocalSecrets(async lease => {
    assert.deepEqual(lease.readLocalKeys(), saved.data.crypto);
    assert.deepEqual(lease.readJournalIdentity(), saved.data.journal);
    await assert.rejects(lease.request("api/v1/records"), /remote_access_unavailable/);
    await lease.writeJournalIdentity({ ...saved.data.journal, initialized: true });
  });
  await assert.rejects(account.withSecrets(lease => lease.request("api/v1/records")), /remote_access_unavailable/);
  assert.equal(f.state.requests.length, requests);
  assert.equal(f.state.opened.length, opened);
  assert.equal(account.snapshot.status, "local");
  assert.equal(f.state.stored.data.token, saved.data.token);
  assert.equal(f.state.stored.data.journal.initialized, true);
  account.close();
});

test("local-only reopening still enforces vault scope and an empty vault stays signed out", async () => {
  const missing = setup();
  await missing.account.unlock({ interactive: false, localOnly: true });
  assert.equal(missing.account.snapshot.status, "signed-out");
  assert.equal(missing.state.opened.length, 0);
  const original = setup();
  await original.account.pair(code, "Desktop");
  const stored = structuredClone(original.state.stored);
  stored.scope = "different-account";
  const mismatched = setup({ stored });
  await assert.rejects(mismatched.account.unlock({ localOnly: true }), /account_scope_mismatch/);
  assert.equal(mismatched.state.opened.length, 0);
  assert.equal(mismatched.account.snapshot.user, null);
  await assert.rejects(mismatched.account.unlock({ localOnly: "true" }), /invalid_account_options/);
});

test("public OIDC authorization issues and verifies a renewable native session", async () => {
  const issuer = "https://accounts.astian.org/";
  const oidc = { version: 1, issuer, client_id: "midori-desktop-public",
    discovery_url: "https://accounts.astian.org/application/o/midori-desktop/.well-known/openid-configuration" };
  const identity = { issuer, subject: "astian-user", kind: "oidc" };
  const renewable = { ...accountData, identity, token, refresh_version: 1,
    refresh_token: `mrf_${"a".repeat(64)}`, refresh_expires_at: "2026-10-29T12:00:00+00:00" };
  let opened = false;
  const { account, state } = setup({
    oidcAuthorization: async (metadata, openURL, signal) => {
      assert.equal(metadata.clientId, oidc.client_id);
      assert.equal(signal.aborted, false);
      openURL("https://accounts.astian.org/application/o/midori-desktop/authorize/");
      return { idToken: "signed-id-token", accessToken: "oauth-access-token", nonce: "random-nonce" };
    },
    request(path, options) {
      if (path === "api/v1/capabilities") {
        return { data: { ...capabilities, authentication: { pairing: true, development: false, issuer, oidc,
          refresh: { version: 1, request_bytes: 4096, lifetime_seconds: 2592000,
            receipts_per_session: 1024, sessions_per_account: 32 } } } };
      }
      if (path === "api/v1/auth/native-token") {
        assert.equal(options.method, "POST");
        assert.deepEqual(options.body, { id_token: "signed-id-token", access_token: "oauth-access-token",
          nonce: "random-nonce", device_name: "Midori Desktop" });
        return { data: renewable };
      }
      if (path === "api/v1/account") {
        assert.equal(options.token, token);
        return { data: renewable };
      }
      return undefined;
    },
  });
  await account.connectOidc(() => { opened = true; });
  assert.equal(opened, true);
  assert.equal(account.snapshot.status, "connected");
  assert.equal(state.stored.data.renewal.token, renewable.refresh_token);
  assert.equal(state.stored.data.account.identity.subject, "astian-user");
  assert.deepEqual(state.requests.map(value => value.path),
    ["api/v1/capabilities", "api/v1/auth/native-token", "api/v1/account"]);
});

test("the account reports registry version two only when the current server explicitly supports it", async () => {
  let supportsV2 = true;
  const { account, state } = setup({ request(path) {
    if (path === "api/v1/capabilities") {
      return { data: { ...capabilities, ...(supportsV2 ? { client_recovery: { registry_auth_version: 2 } } : {}) } };
    }
    return undefined;
  } });
  try {
    assert.equal(account.snapshot.registryAuthVersion, 0);
    await account.pair(code, "Midori Desktop");
    assert.equal(account.snapshot.registryAuthVersion, 2);
    const saved = structuredClone(state.stored);
    supportsV2 = false;
    await account.unlock({ interactive: false });
    assert.equal(account.snapshot.registryAuthVersion, 0);
    assert.equal(account.snapshot.status, "connected", "Existing account access remains available on older servers");
    assert.deepEqual(state.stored, saved, "Capability negotiation does not rewrite account keys or credentials");
  } finally { account.close(); }
});

test("existing web login authorizes a native session without a public OIDC client", async () => {
  const issuer = "https://accounts.example.invalid/application/o/midori-sync/";
  const renewable = { ...accountData,
    identity: { issuer, subject: "astian-user", kind: "oidc" }, token,
    refresh_version: 1, refresh_token: `mrf_${"a".repeat(64)}`,
    refresh_expires_at: "2026-10-29T12:00:00+00:00" };
  let openedURL;
  const { account, state } = setup({
    browserAuthorization: async (serverURL, openURL, signal) => {
      assert.equal(serverURL, server.baseURL);
      assert.equal(signal.aborted, false);
      openURL(`${serverURL}auth/desktop`);
      return { code: "a".repeat(64), verifier: "b".repeat(43) };
    },
    request(path, options) {
      if (path === "api/v1/capabilities") {
        return { data: { ...capabilities, authentication: { pairing: true, development: false,
          issuer, browser_login: { version: 1 }, oidc: null,
          refresh: { version: 1, request_bytes: 4096, lifetime_seconds: 2592000,
            receipts_per_session: 1024, sessions_per_account: 32 } } } };
      }
      if (path === "api/v1/auth/browser-token") {
        assert.deepEqual(options.body, { code: "a".repeat(64), code_verifier: "b".repeat(43),
          device_name: "Midori Desktop" });
        return { data: renewable };
      }
      if (path === "api/v1/account") {
        return { data: renewable };
      }
      return undefined;
    },
  });
  await account.connectOidc(url => { openedURL = url; });
  assert.equal(openedURL, `${server.baseURL}auth/desktop`);
  assert.equal(account.snapshot.status, "connected");
  assert.deepEqual(state.requests.map(value => value.path),
    ["api/v1/capabilities", "api/v1/auth/browser-token", "api/v1/account"]);
});

test("closing authorization cancels the login without saving an account", async () => {
  const issuer = "https://accounts.astian.org/";
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const { account, state } = setup({
    oidcAuthorization: async (_metadata, openURL, signal) => {
      openURL("https://accounts.astian.org/authorize");
      started();
      await new Promise((_, reject) => signal.addEventListener("abort", () => reject({ code: "cancelled" }), { once: true }));
    },
    request(path) {
      if (path === "api/v1/capabilities") {
        return { data: { ...capabilities, authentication: { pairing: true, development: false, issuer,
          oidc: { version: 1, issuer, client_id: "midori-desktop-public",
            discovery_url: `${issuer}.well-known/openid-configuration` },
          refresh: { version: 1, request_bytes: 4096, lifetime_seconds: 2592000,
            receipts_per_session: 1024, sessions_per_account: 32 } } } };
      }
      return undefined;
    },
  });
  const pending = account.connectOidc(() => {});
  await ready;
  account.cancelAuthorization();
  await assert.rejects(pending, /cancelled/);
  assert.equal(account.snapshot.status, "signed-out");
  assert.equal(state.stored, null);
  assert.deepEqual(state.requests.map(value => value.path), ["api/v1/capabilities"]);
});

test("a lost browser-token response leaves no local session and permits a fresh, cancellable authorization", async () => {
  const issuer = "https://accounts.example.invalid/application/o/midori-sync/";
  const renewable = { ...accountData, identity: { issuer, subject: "astian-user", kind: "oidc" }, token,
    refresh_version: 1, refresh_token: `mrf_${"b".repeat(64)}`,
    refresh_expires_at: "2026-10-29T12:00:00+00:00" };
  const authorizations = [];
  const issued = new Set();
  const snapshots = [];
  let waiting;
  const ready = new Promise(resolve => { waiting = resolve; });
  const { account, create, state } = setup({
    browserAuthorization: async (_serverURL, openURL, signal) => {
      const sequence = authorizations.length + 1;
      const authorization = { code: String(sequence).repeat(64), verifier: String(sequence).repeat(43) };
      authorizations.push(authorization);
      openURL(`${server.baseURL}auth/desktop`);
      if (sequence === 2) {
        waiting();
        await new Promise((_, reject) => signal.addEventListener("abort", () => reject({ code: "cancelled" }), { once: true }));
      }
      return authorization;
    },
    request(path, options) {
      if (path === "api/v1/capabilities") {
        return { data: { ...capabilities, authentication: { pairing: true, development: false,
          issuer, browser_login: { version: 1 }, oidc: null,
          refresh: { version: 1, request_bytes: 4096, lifetime_seconds: 2592000,
            receipts_per_session: 1024, sessions_per_account: 32 } } } };
      }
      if (path === "api/v1/auth/browser-token") {
        assert.equal(issued.has(options.body.code), false, "A consumed browser code is never retried");
        assert.equal(options.body.code_verifier, authorizations.at(-1).verifier);
        issued.add(options.body.code);
        if (issued.size === 1) {
          throw { code: "network_error" };
        }
        return { data: renewable };
      }
      if (path === "api/v1/account") {
        return { data: renewable };
      }
      return undefined;
    },
  });
  account.subscribe(snapshot => snapshots.push(snapshot));
  await assert.rejects(account.connectOidc(() => {}), /network_error/);
  assert.equal(account.snapshot.status, "signed-out");
  assert.equal(account.snapshot.busy, false);
  assert.equal(account.snapshot.user, null);
  assert.equal(state.stored, null, "A lost response persists neither account credentials nor local encryption keys");
  assert.equal(state.closed.length, 1);
  await assert.rejects(account.withLocalSecrets(() => assert.fail("No secret lease may be issued")), /auth_required/);
  account.close();
  const restarted = create();
  restarted.subscribe(snapshot => snapshots.push(snapshot));
  try {
    await restarted.initialize();
    assert.equal(restarted.snapshot.status, "signed-out", "Restart does not recover a partially persisted session");
    const cancelled = restarted.connectOidc(() => {});
    await ready;
    restarted.cancelAuthorization();
    await assert.rejects(cancelled, /cancelled/);
    assert.equal(state.stored, null);
    assert.equal(restarted.snapshot.status, "signed-out");
    assert.equal(issued.size, 1, "Cancelling the new authorization does not exchange another code");
    await restarted.connectOidc(() => {});
    assert.equal(restarted.snapshot.status, "connected");
    assert.equal(state.stored.data.token, token);
    assert.equal(state.stored.data.renewal.token, renewable.refresh_token);
    assert.equal(state.stored.data.crypto, undefined);
    assert.equal(state.stored.data.journal, undefined);
    assert.equal(authorizations.length, 3);
    assert.deepEqual([...issued], [authorizations[0].code, authorizations[2].code]);
    const published = JSON.stringify(snapshots);
    for (const secret of [token, renewable.refresh_token, ...authorizations.flatMap(value => [value.code, value.verifier])]) {
      assert.equal(published.includes(secret), false, "Public account snapshots contain no authorization secret");
    }
  } finally { restarted.close(); }
});

test("cancelling browser login during unlock, capabilities, exchange, verification or save stops connection", async () => {
  for (const phase of ["unlock", "capabilities", "exchange", "verification", "save"]) {
    const issuer = "https://accounts.example.invalid/application/o/midori-sync/";
    const renewable = { ...accountData, identity: { issuer, subject: "astian-user", kind: "oidc" }, token,
      refresh_version: 1, refresh_token: `mrf_${"c".repeat(64)}`,
      refresh_expires_at: "2026-10-29T12:00:00+00:00" };
    let reached;
    let release;
    let revoked = false;
    let opened = false;
    const ready = new Promise(resolve => { reached = resolve; });
    const pause = async () => { reached(); await new Promise(resolve => { release = resolve; }); };
    const { account, state } = setup({
      browserAuthorization: async (_serverURL, openURL) => {
        opened = true;
        openURL(`${server.baseURL}auth/desktop`);
        return { code: "a".repeat(64), verifier: "b".repeat(43) };
      },
      unlock: async () => { if (phase === "unlock") { await pause(); } },
      save: async () => { if (phase === "save") { await pause(); } },
      async request(path, options) {
        if (path === "api/v1/capabilities") {
          if (phase === "capabilities") { await pause(); }
          return { data: { ...capabilities, authentication: { pairing: true, development: false,
            issuer, browser_login: { version: 1 }, oidc: null,
            refresh: { version: 1, request_bytes: 4096, lifetime_seconds: 2592000,
              receipts_per_session: 1024, sessions_per_account: 32 } } } };
        }
        if (path === "api/v1/auth/browser-token") {
          if (phase === "exchange") { await pause(); }
          return { data: renewable };
        }
        if (path === "api/v1/account") {
          if (phase === "verification") { await pause(); }
          return { data: renewable };
        }
        if (path === "api/v1/auth/refresh") {
          assert.equal(options.method, "DELETE");
          assert.equal(options.body.refresh_token, renewable.refresh_token);
          revoked = true;
          return { status: 204, data: null };
        }
        return undefined;
      },
    });
    try {
      const pending = account.connectOidc(() => {});
      await ready;
      if (phase === "capabilities") {
        await assert.rejects(account.connectOidc(() => assert.fail("A concurrent login never opens")), /busy/);
      }
      account.cancelAuthorization();
      release();
      await assert.rejects(pending, /cancelled/, phase);
      const issued = !["unlock", "capabilities"].includes(phase);
      assert.equal(opened, issued, "Cancelling negotiation cannot open a login tab afterward");
      assert.equal(revoked, issued, "Known session credentials are revoked after cancellation");
      assert.equal(state.requests.filter(request => request.path === "api/v1/auth/browser-token").length, Number(issued));
      assert.equal(state.stored, null);
      assert.equal(account.snapshot.status, "signed-out");
      assert.equal(account.snapshot.user, null);
      assert.equal(account.snapshot.generation, 0);
    } finally { account.close(); }
  }
});

test("opening a saved account does not unlock; explicit unlock checks the saved identity", async () => {
  const { account, create, state } = setup();
  await account.pair(code, "Midori Desktop");
  account.close();
  const reopened = create();
  await reopened.initialize();
  assert.equal(reopened.snapshot.status, "locked");
  assert.equal(state.unlocked, 1);
  state.requests.length = 0;
  await reopened.unlock();
  assert.equal(reopened.snapshot.status, "connected");
  assert.deepEqual(state.requests.map(value => value.path), ["api/v1/capabilities", "api/v1/account"]);
  state.time += 3600000;
  assert.equal(reopened.snapshot.status, "expired");
});

test("background startup resumes a saved account without interactive vault access", async () => {
  const { account, create, vault, state } = setup();
  await account.pair(code, "Midori Desktop");
  account.close();
  const reopened = create();
  await reopened.initialize();
  const load = vault.load;
  vault.load = async (scope, options) => {
    assert.deepEqual(options, { interactive: false });
    return load.call(vault, scope);
  };
  state.requests.length = 0;
  await reopened.unlock({ interactive: false });
  assert.equal(reopened.snapshot.status, "connected");
  assert.deepEqual(state.requests.map(value => value.path), ["api/v1/capabilities", "api/v1/account"]);
});

test("a locked background lease retains custody, stops the owner and requires explicit unlock", async () => {
  const { account, state, vault } = setup();
  await account.pair(code, "Desktop");
  const generation = account.snapshot.generation;
  const stored = structuredClone(state.stored);
  const load = vault.load;
  let accessed = false;
  vault.load = async (_scope, options) => {
    assert.equal(options.interactive, false);
    throw { code: "vault_locked" };
  };
  state.requests.length = 0;
  await assert.rejects(account.withSecrets(() => { accessed = true; }), /vault_locked/);
  assert.equal(accessed, false);
  assert.equal(account.snapshot.status, "locked");
  assert.equal(account.snapshot.error, "vault_locked");
  assert(account.snapshot.generation > generation);
  assert.deepEqual(state.stored, stored);
  assert.deepEqual(state.requests, []);
  vault.load = load;
  await account.unlock();
  assert.equal(account.snapshot.status, "connected");
  const save = vault.save;
  vault.save = async (scope, data, options) => { assert.equal(options.interactive, false); return save(scope, data); };
});

test("local protection is checked before consuming a code", async () => {
  const { account, state } = setup({ unlock() { throw { code: "primary_password_required" }; } });
  await assert.rejects(account.pair(code, "Midori Desktop"), /primary_password_required/);
  assert.equal(state.requests.length, 0);
  assert.equal(state.stored, null);
  assert.equal(account.snapshot.status, "signed-out");
});

test("an identity change during pairing revokes the issued session without saving", async () => {
  const { account, state } = setup({ request(path) {
    if (path === "api/v1/account") {
      return { data: { ...accountData, identity: { ...accountData.identity, subject: "another-user" } } };
    }
  } });
  await assert.rejects(account.pair(code, "Midori Desktop"), /account_scope_mismatch/);
  assert.equal(state.stored, null);
  assert.equal(state.requests.at(-1).path, "api/v1/auth/token");
  assert.equal(account.snapshot.revocationPending, false);
});

test("uncertain persistence is cleared and the newly issued session is revoked", async () => {
  const { account, state } = setup({ save() { throw { code: "vault_unavailable" }; } });
  await assert.rejects(account.pair(code, "Midori Desktop"), /vault_unavailable/);
  assert.equal(state.stored, null);
  assert.equal(state.requests.at(-1).path, "api/v1/auth/token");
  assert.equal(account.snapshot.status, "signed-out");
});

test("saved credentials never reach a different server or changed issuer", async () => {
  for (const change of ["server", "issuer", "subject", "expired"]) {
    const { account, state, create, connection } = setup({ request(path) {
      if (change === "issuer" && path === "api/v1/capabilities" && state.stored) {
        return { data: { ...capabilities, authentication: { pairing: true, development: false, issuer: "https://identity.example/" } } };
      }
    } });
    await account.pair(code, "Midori Desktop");
    const reopened = create();
    state.requests.length = 0;
    if (change === "server") {
      connection.snapshot.server = normalizeSyncServer("https://different.example/");
    } else if (change === "subject") {
      state.stored.data.account.identity.subject = "changed";
    } else if (change === "expired") {
      state.time += 3600000;
    }
    await assert.rejects(reopened.unlock(), /account_scope_mismatch|auth_required/);
    assert.ok(state.requests.every(value => !value.options.token));
  }
});

test("development identities cannot be used on a remote server", async () => {
  const { account, state, connection } = setup();
  connection.snapshot.server = normalizeSyncServer("https://remote.example/");
  await assert.rejects(account.pair(code, "Midori Desktop"), /invalid_account/);
  assert.equal(state.requests.length, 1);
  assert.equal(state.stored, null);
});

test("server changes require removing a saved account and hold an exclusive reservation", async () => {
  const { account, state } = setup();
  const other = normalizeSyncServer("https://other.example/");
  const release = await account.prepareServerChange(other);
  await assert.rejects(account.pair(code, "Midori Desktop"), /busy/);
  release();
  await account.pair(code, "Midori Desktop");
  await assert.rejects(account.prepareServerChange(other), /account_connected/);
  assert.equal(account.snapshot.busy, false);
  await account.disconnect();
  assert.equal(state.stored, null);
  assert.equal(account.snapshot.status, "signed-out");
  (await account.prepareServerChange(other))();
});

test("offline disconnect removes local credentials and reports unconfirmed revocation", async () => {
  const { account, state } = setup({ request(path) {
    if (path === "api/v1/auth/token") {
      throw { code: "network_error" };
    }
  } });
  await account.pair(code, "Midori Desktop");
  await account.disconnect();
  assert.equal(state.stored, null);
  assert.equal(account.snapshot.status, "signed-out");
  assert.equal(account.snapshot.user, null);
  assert.equal(account.snapshot.revocationPending, true);
});

test("unknown protected profile fields prevent deleting an existing vault", async () => {
  const { account, state } = setup();
  await account.pair(code, "Midori Desktop");
  state.stored.data.retired = { encrypted: "opaque" };
  const stored = structuredClone(state.stored);
  await assert.rejects(account.disconnect(), /sync_disconnect_unavailable/);
  assert.deepEqual(state.stored, stored);
  assert.equal(account.snapshot.status, "connected");
});

test("disconnect holds exclusive account access and preserves custody until the local check succeeds", async () => {
  let pending = true;
  let checks = 0;
  const { account, state } = setup({ prepareDisconnect: async context => {
    ++checks;
    assert.equal(account.snapshot.interactionBusy, true);
    assert.deepEqual(Object.keys(context).sort(), ["deviceId", "journal", "localKeys", "scope"]);
    assert.equal(context.scope, state.stored.scope);
    assert.equal(context.deviceId, accountData.device.id);
    assert.deepEqual(context.journal, state.stored.data.journal);
    context.journal.store_id = "modified copy";
    await assert.rejects(account.withSecrets(() => {}), /busy/);
    await assert.rejects(account.disconnect(), /busy/);
    if (pending) { throw { code: "sync_pending_operations" }; }
  } });
  await account.pair(code, "Midori Desktop");
  state.stored.data.journal = { store_id: "fictional custody" };
  const stored = structuredClone(state.stored);
  const generation = account.snapshot.generation;
  state.requests.length = 0;
  await assert.rejects(account.disconnect(), /sync_pending_operations/);
  assert.deepEqual(state.stored, stored);
  assert.equal(account.snapshot.generation, generation);
  assert.equal(account.snapshot.status, "connected");
  assert.equal(state.requests.length, 0);
  pending = false;
  await account.disconnect();
  assert.equal(checks, 2);
  assert.equal(state.requests.length, 1);
  assert.equal(state.requests[0].path, "api/v1/auth/token");
  assert.equal(state.stored, null);
});

test("unreadable or replaced saved accounts cannot bypass the custody check", async () => {
  const { account, state, vault } = setup();
  await account.pair(code, "Midori Desktop");
  state.stored.data.journal = { store_id: "fictional custody" };
  state.requests.length = 0;
  const load = vault.load;
  vault.load = () => { throw { code: "vault_locked" }; };
  await assert.rejects(account.disconnect(), /vault_locked/);
  assert(state.stored);
  vault.load = load;
  state.stored.data.token = "replacement-token";
  await assert.rejects(account.disconnect(), /account_scope_mismatch/);
  assert(state.stored);
  assert.equal(state.requests.length, 0);
  assert.equal(account.snapshot.status, "connected");
});

test("profile closure during the disconnect check cannot revoke or delete the saved account", async () => {
  let entered;
  let release;
  const ready = new Promise(resolve => { entered = resolve; });
  const { account, state } = setup({ prepareDisconnect: async () => {
    entered();
    await new Promise(resolve => { release = resolve; });
  } });
  await account.pair(code, "Midori Desktop");
  const saved = structuredClone(state.stored);
  state.requests.length = 0;
  const operation = account.disconnect();
  await ready;
  account.close();
  release();
  await assert.rejects(operation, /cancelled/);
  assert.deepEqual(state.stored, saved);
  assert.equal(state.requests.length, 0);
  assert.equal(account.snapshot.status, "closed");
});

test("a failed local removal keeps the account protected from server changes", async () => {
  const { account, state } = setup({ clear() { throw { code: "vault_unavailable" }; } });
  await account.pair(code, "Midori Desktop");
  await assert.rejects(account.disconnect(), /vault_unavailable/);
  assert.ok(state.stored);
  await assert.rejects(account.prepareServerChange(normalizeSyncServer("https://other.example")), /account_connected/);
});

test("closing during verification cannot persist or publish an authenticated session", async () => {
  let complete;
  let started;
  const ready = new Promise(resolve => { started = resolve; });
  const { account, state } = setup({ request(path) {
    if (path === "api/v1/account") {
      started();
      return new Promise(resolve => { complete = () => resolve({ data: accountData }); });
    }
  } });
  const pending = account.pair(code, "Midori Desktop");
  await ready;
  account.close();
  complete();
  await assert.rejects(pending, /cancelled/);
  assert.equal(state.stored, null);
  assert.equal(account.snapshot.status, "closed");
  assert.equal(account.snapshot.user, null);
  assert.equal(state.vaultClosed, true);
});

test("invalid input cannot consume codes or create a profile vault", async () => {
  const { account, state } = setup();
  for (const [value, name] of [["123", "Desktop"], [code, ""], [code, "name\nsecret"]]) {
    await assert.rejects(account.pair(value, name), /invalid_pairing_input/);
  }
  assert.equal(state.requests.length, 0);
  assert.equal(state.unlocked, 0);
  assert.equal(account.snapshot.status, "unknown");
});

test("removing the encrypted file cannot move a live token to another server", async () => {
  const { account, state, connection } = setup();
  await account.pair(code, "Midori Desktop");
  state.stored = null;
  const other = normalizeSyncServer("https://other.example/");
  await assert.rejects(account.prepareServerChange(other), /account_connected/);
  connection.snapshot.server = other;
  await account.disconnect();
  assert.equal(state.requests.at(-1).baseURL, server.baseURL);
  assert.equal(account.snapshot.status, "signed-out");
  assert.equal(account.snapshot.user, null);
});

test("unlocking a removed account clears its in-memory identity", async () => {
  const { account, state } = setup();
  await account.pair(code, "Midori Desktop");
  state.stored = null;
  await account.unlock();
  assert.equal(account.snapshot.status, "signed-out");
  assert.equal(account.snapshot.user, null);
});

test("an expired pairing code returns a useful error without storing or revoking credentials", async () => {
  const { account, state } = setup({ request(path) {
    if (path === "api/v1/pair/redeem") {
      throw { code: "http_error", status: 404 };
    }
  } });
  await assert.rejects(account.pair(code, "Midori Desktop"), /invalid_pairing_code/);
  assert.equal(state.requests.length, 2);
  assert.equal(state.stored, null);
  assert.equal(account.snapshot.status, "signed-out");
});

test("a transient vault initialization error can be retried without restarting", async () => {
  let attempts = 0;
  const account = new MidoriSyncAccount({
    connection: { snapshot: { server, checking: false } },
    vaultFactory() {
      if (++attempts === 1) {
        throw { code: "vault_unavailable" };
      }
      return { async load() { return null; } };
    },
  });
  await account.initialize();
  assert.equal(account.snapshot.status, "error");
  await account.unlock();
  assert.equal(attempts, 2);
  assert.equal(account.snapshot.status, "signed-out");
});

test("secret leases pin authentication, merge protected keys and expire after the callback", async () => {
  const { account, state, connection } = setup({ request(path, options) {
    if (path === "api/v1/crypto/state") {
      assert.equal(options.token, token);
      return { data: { test: true } };
    }
  } });
  await account.pair(code, "Midori Desktop");
  let captured;
  const result = await account.withSecrets(async lease => {
    assert.equal(account.snapshot.busy, true);
    assert.equal(account.snapshot.interactionBusy, false);
    captured = lease;
    assert.equal(lease.token, undefined);
    assert.equal(lease.readLocalKeys(), null);
    await assert.rejects(account.disconnect(), /busy/);
    await assert.rejects(account.prepareServerChange(connection.snapshot.server), /busy/);
    await lease.writeLocalKeys({ protected: "fictional wrapped key" });
    assert.equal(lease.readJournalIdentity(), null);
    await lease.writeJournalIdentity({ version: 1, store_id: "107cf1f2-bfdc-4cde-a416-a8ec8576a36b", device_id: lease.deviceId, initialized: true });
    assert.equal(lease.readJournalIdentity().device_id, account.snapshot.device.id);
    await assert.rejects(lease.writeJournalIdentity({ version: 1, store_id: "107cf1f2-bfdc-4cde-a416-a8ec8576a36b", device_id: "another-device" }), /invalid_store_identity/);
    const copy = lease.readLocalKeys();
    copy.protected = "changed";
    assert.equal(lease.readLocalKeys().protected, "fictional wrapped key");
    return lease.request("api/v1/crypto/state", { token: "untrusted override" });
  });
  assert.equal(result.data.test, true);
  assert.equal(state.stored.data.token, token);
  assert.equal(state.stored.data.account.user.id, "1");
  assert.equal(state.stored.data.crypto.protected, "fictional wrapped key");
  assert.equal(state.stored.data.journal.device_id, account.snapshot.device.id);
  assert.throws(() => captured.readLocalKeys(), /cancelled/);
  await assert.rejects(captured.writeLocalKeys({}), /cancelled/);
  assert.throws(() => captured.readJournalIdentity(), /cancelled/);
  await assert.rejects(captured.request("api/v1/crypto/state"), /cancelled/);
  assert.equal(account.snapshot.busy, false);
  assert.equal(account.snapshot.interactionBusy, false);
});

test("secret leases reject a replaced vault and preserve account status on crypto failures", async () => {
  const { account, state } = setup();
  await account.pair(code, "Midori Desktop");
  await assert.rejects(account.withSecrets(() => { throw { code: "recovery_failed" }; }), /recovery_failed/);
  assert.equal(account.snapshot.status, "connected");
  assert.equal(account.snapshot.error, null);
  state.stored.data.token = "replaced-session";
  let entered = false;
  await assert.rejects(account.withSecrets(() => { entered = true; }), /account_scope_mismatch/);
  assert.equal(entered, false);
});







test("secret request errors preserve bounded status and retry delays", async () => {
  const { account } = setup({ request(path) {
    if (path.endsWith("/changes")) { throw { code: "rate_limited", status: 429, retryAfter: 35 }; }
  } });
  await account.pair(code, "Midori Desktop");
  await assert.rejects(account.withSecrets(lease => lease.request("api/v1/sync/collections/bookmarks/changes")), error =>
    error.code === "rate_limited" && error.status === 429 && error.retryAfter === 35);
  assert.equal(account.snapshot.status, "connected");
});

test("account shutdown invalidates leases and notifies key owners", async () => {
  const { account } = setup();
  const snapshots = [];
  account.subscribe(value => snapshots.push(value));
  await account.pair(code, "Midori Desktop");
  const generation = account.snapshot.generation;
  await assert.rejects(account.withSecrets(async lease => {
    account.close();
    await lease.writeLocalKeys({});
  }), /cancelled/);
  assert.equal(snapshots.at(-1).status, "closed");
  assert.ok(snapshots.at(-1).generation > generation);
});

test("saved Sync journals require an explicit custody check after expiry and restart", async () => {
  const { account, state, create } = setup();
  await account.pair(code, "Midori Desktop");
  state.stored.data.journal = { version: 1, store_id: "e5b2c8c8-dcc8-4985-9e2c-f750135c4884", device_id: accountData.device.id, initialized: true };
  state.stored.data.crypto = { fixture: "protected keys" };
  const stored = structuredClone(state.stored);
  state.requests.length = 0;
  state.time += 7200000;
  await assert.rejects(account.disconnect(), /sync_disconnect_unavailable/);
  account.close();
  const reopened = create();
  await assert.rejects(reopened.disconnect(), /sync_disconnect_unavailable/);
  assert.deepEqual(state.stored, stored);
  assert.equal(state.requests.length, 0);
});

test("the disconnect check receives copies of Sync custody and cannot replace protected data", async () => {
  const { account, state } = setup({ prepareDisconnect: async context => {
    assert.deepEqual(context.journal, state.stored.data.journal);
    assert.deepEqual(context.localKeys, state.stored.data.crypto);
    context.journal.store_id = "changed";
    context.localKeys.fixture = "changed";
    throw { code: "sync_pending_operations" };
  } });
  await account.pair(code, "Midori Desktop");
  state.stored.data.journal = { fixture: "journal" };
  state.stored.data.crypto = { fixture: "keys" };
  const saved = structuredClone(state.stored);
  state.requests.length = 0;
  await assert.rejects(account.disconnect(), /sync_pending_operations/);
  assert.deepEqual(state.stored, saved);
  assert.equal(state.requests.length, 0);
});
