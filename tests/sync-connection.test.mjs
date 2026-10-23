/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import test from "node:test";
import { MidoriSyncConnection, validateSyncCapabilities } from "../src/browser/components/sync/MidoriSyncConnection.sys.mjs";

const capabilities = {
  protocol: "MSP", changes_version: 1, operations_version: 1, native_ready: false,
  features: ["opaque_cursors", "snapshot_fence", "tombstones", "device_acknowledgements", "conditional_operations", "idempotent_operations"],
  collections: ["bookmarks", "history", "passwords", "credit-cards", "form-history", "addresses", "workspaces", "midori-privacy", "site-permissions", "extensions", "extension-settings", "tabs", "browser-settings"],
  data_schemas: { bookmarks: 2, history: 2, passwords: 1, "credit-cards": 1, "form-history": 1,
    addresses: 1, workspaces: 1, "midori-privacy": 1, "site-permissions": 1, extensions: 1, "extension-settings": 1, tabs: 2, "browser-settings": 1 },
  limits: { change_page_records: 100, change_page_payload_bytes: 4194304, record_payload_bytes: 262144, operation_batch_records: 100, operation_batch_bytes: 4194304 },
};

test("workspace support requires the feature, collection and exact capability generation", () => {
  const value = { ...capabilities, features: [...capabilities.features, "workspace_metadata"],
    collections: ["workspaces"], data_schemas: { workspaces: 1 } };
  assert.equal(validateSyncCapabilities(value).workspaces, true);
  for (const change of [{ features: capabilities.features }, { collections: [] }, { collections: {} }, { collections: null },
    { data_schemas: {} }, { data_schemas: { workspaces: 2 } }]) {
    assert.equal(validateSyncCapabilities({ ...value, ...change }).workspaces, false);
  }
});

test("connection capabilities expose the negotiated matrix for every data family", () => {
  const result = validateSyncCapabilities({ ...capabilities, features: [...capabilities.features,
    "bookmark_labels", "history_parts", "history_visit_removals", "tab_fragments",
    "credit_cards", "form_history", "addresses", "workspace_metadata", "custom_filters", "site_permissions", "extension_catalog", "extension_settings"] });
  assert.equal(Object.keys(result.collectionSupport).length, capabilities.collections.length);
  assert.ok(Object.values(result.collectionSupport).every(Boolean));
  assert.equal(Object.isFrozen(result.collectionSupport), true);
  for (const name of capabilities.collections) {
    const changed = validateSyncCapabilities({ ...capabilities, features: [...capabilities.features,
      "bookmark_labels", "history_parts", "history_visit_removals", "tab_fragments",
      "credit_cards", "form_history", "addresses", "workspace_metadata", "custom_filters", "site_permissions", "extension_catalog", "extension_settings"],
    data_schemas: { ...capabilities.data_schemas, [name]: 99 } });
    assert.equal(changed.collectionSupport[name], false);
    assert.equal(Object.values(changed.collectionSupport).filter(Boolean).length, capabilities.collections.length - 1);
  }
});

function setup(prepareServerChange, now = Date.now) {
  const transports = [];
  const saved = [];
  const connection = new MidoriSyncConnection({
    baseURL: "https://sync.astian.org/",
    prepareServerChange,
    now,
    saveServer: value => saved.push(value),
    transportFactory: (baseURL, options) => {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      const transport = {
        baseURL, options, requests: [], closed: false, resolve, reject,
        request(...args) { this.requests.push(args); return promise; },
        close() { this.closed = true; },
      };
      transports.push(transport);
      return transport;
    },
  });
  return { connection, transports, saved };
}

const allCapabilities = { ...capabilities, features: [...capabilities.features,
  "bookmark_labels", "history_parts", "history_visit_removals", "tab_fragments",
  "credit_cards", "form_history", "addresses", "workspace_metadata", "custom_filters", "site_permissions", "extension_catalog", "extension_settings"] };

test("account discovery is scoped and shares the in-flight public request", async () => {
  const { connection, transports } = setup();
  const server = connection.snapshot.server;
  await assert.rejects(connection.getCapabilities({ ...server, baseURL: "https://other.example/" }), /cancelled/);
  await assert.rejects(connection.getCapabilities({ ...server, requiresLoopbackTransport: true }), /cancelled/);
  const discovery = connection.refreshCapabilities({ background: true });
  const account = connection.getCapabilities(server);
  assert.equal(transports.length, 1);
  assert.equal(connection.snapshot.checking, false, "Automatic metadata checks keep forms available");
  transports[0].resolve({ data: allCapabilities });
  assert.equal(await account, (await discovery).capabilities);
  assert.ok(Object.values(connection.snapshot.capabilities.collectionSupport).every(Boolean));
  connection.close();
  await assert.rejects(connection.getCapabilities(server), /cancelled/);
});

test("an incompatible current server withdraws cached support for every consumer", async () => {
  const { connection, transports } = setup();
  let pending = connection.refreshCapabilities();
  transports[0].resolve({ data: allCapabilities });
  await pending;
  pending = connection.refreshCapabilities({ background: true });
  const account = connection.getCapabilities(connection.snapshot.server);
  transports[1].resolve({ data: { ...allCapabilities, operations_version: 99 } });
  await Promise.all([assert.rejects(pending, /incompatible_server/), assert.rejects(account, /incompatible_server/)]);
  assert.equal(connection.snapshot.capabilities, null);
  assert.equal(connection.snapshot.error, "incompatible_server");
  pending = connection.getCapabilities(connection.snapshot.server);
  transports[2].resolve({ data: allCapabilities });
  assert.equal((await pending).collectionSupport.bookmarks, true);
  assert.equal(connection.snapshot.error, null);
});

test("manual rechecking of the current server withdraws incompatible cached support", async () => {
  const { connection, transports, saved } = setup();
  const first = connection.refreshCapabilities();
  transports[0].resolve({ data: allCapabilities });
  await first;
  const pending = connection.checkAndUseServer(connection.snapshot.server.baseURL);
  await assert.rejects(connection.getCapabilities(connection.snapshot.server), /busy/);
  transports[1].resolve({ data: { ...allCapabilities, changes_version: 99 } });
  await assert.rejects(pending, /incompatible_server/);
  assert.equal(connection.snapshot.capabilities, null);
  assert.equal(connection.snapshot.error, "incompatible_server");
  assert.deepEqual(saved, []);
});

test("a cancelled discovery cannot block or overwrite a newer discovery", async () => {
  const { connection, transports } = setup();
  const first = connection.getCapabilities(connection.snapshot.server);
  connection.cancelCheck();
  const second = connection.getCapabilities(connection.snapshot.server);
  transports[1].resolve({ data: { ...allCapabilities,
    data_schemas: { ...capabilities.data_schemas, history: 99 } } });
  assert.equal((await second).collectionSupport.history, false);
  transports[0].resolve({ data: allCapabilities });
  await assert.rejects(first, /cancelled/);
  assert.equal(connection.snapshot.capabilities.collectionSupport.history, false);
});

test("reentrant discovery observers join the already reserved request", async () => {
  const { connection, transports } = setup();
  let nested;
  const unsubscribe = connection.subscribe(() => {
    nested ??= connection.getCapabilities(connection.snapshot.server);
  });
  const first = connection.refreshCapabilities({ background: true });
  assert.equal(transports.length, 1);
  transports[0].resolve({ data: allCapabilities });
  await first;
  assert.equal(await nested, connection.snapshot.capabilities);
  unsubscribe();
  connection.close();
});

test("bounded capability caching expires and survives a clock rollback", async () => {
  let now = 1000;
  const { connection, transports } = setup(undefined, () => now);
  const initial = connection.refreshCapabilities();
  transports[0].resolve({ data: allCapabilities });
  await initial;
  await connection.refreshCapabilities({ maxAge: 300000 });
  assert.equal(transports.length, 1);
  now += 300000;
  let pending = connection.refreshCapabilities({ maxAge: 300000 });
  transports[1].resolve({ data: allCapabilities });
  await pending;
  now -= 600000;
  pending = connection.refreshCapabilities({ maxAge: 300000 });
  transports[2].resolve({ data: allCapabilities });
  await pending;
  assert.equal(transports.length, 3);
  for (const maxAge of [-1, 300001, Infinity, 1.5, "300000"]) {
    await assert.rejects(connection.refreshCapabilities({ maxAge }), /invalid_capability_query/);
  }
});

test("a cached incompatibility is rechecked after its age limit or an explicit retry", async () => {
  let now = 1000;
  const { connection, transports } = setup(undefined, () => now);
  let pending = connection.refreshCapabilities();
  transports[0].resolve({ data: { ...allCapabilities, changes_version: 99 } });
  await assert.rejects(pending, /incompatible_server/);
  assert.equal((await connection.refreshCapabilities({ maxAge: 300000 })).error, "incompatible_server");
  assert.equal(transports.length, 1);
  now += 300000;
  pending = connection.refreshCapabilities({ maxAge: 300000 });
  transports[1].resolve({ data: allCapabilities });
  await pending;
  assert.equal(connection.snapshot.error, null);
  pending = connection.refreshCapabilities();
  transports[2].resolve({ data: allCapabilities });
  await pending;
  assert.equal(transports.length, 3);
});

test("startup discovers capabilities without changing servers or unlocking a connected account", async () => {
  const { connection, transports, saved } = setup(() => { throw new Error("Account guard must not run for discovery"); });
  const pending = connection.refreshCapabilities();
  assert.equal(connection.refreshCapabilities(), pending);
  assert.equal(connection.snapshot.checking, true);
  assert.equal(transports.length, 1);
  assert.deepEqual(transports[0].requests, [["api/v1/capabilities", { maxBytes: 32768, timeout: 10000 }]]);
  transports[0].resolve({ data: capabilities });
  const snapshot = await pending;
  assert.equal(snapshot.checking, false);
  assert.equal(snapshot.capabilities.nativeReady, false);
  assert.equal(snapshot.server.baseURL, "https://sync.astian.org/");
  assert.deepEqual(saved, []);
  assert.equal(transports[0].closed, true);
});

test("failed discovery can retry and cannot overwrite a newer server choice", async () => {
  const { connection, transports } = setup();
  let pending = connection.refreshCapabilities();
  transports[0].reject(Object.assign(new Error("Offline"), { code: "network_error" }));
  await assert.rejects(pending, /Offline/);
  assert.equal(connection.snapshot.error, "network_error");
  pending = connection.refreshCapabilities();
  const selected = connection.checkAndUseServer("https://chosen.example/");
  transports[2].resolve({ data: capabilities });
  await selected;
  transports[1].resolve({ data: capabilities });
  await assert.rejects(pending, /cancelled/);
  assert.equal(connection.snapshot.server.baseURL, "https://chosen.example/");
  assert.equal(connection.snapshot.error, null);
  connection.close();
  await assert.rejects(connection.refreshCapabilities(), /cancelled/);
});

test("server selection probes without authentication and commits only after validation", async () => {
  const { connection, transports, saved } = setup();
  const changes = [];
  const unsubscribe = connection.subscribe(state => changes.push(state));
  const pending = connection.checkAndUseServer("http://localhost:8000", { allowLocalHTTP: true });
  assert.equal(connection.snapshot.server.baseURL, "https://sync.astian.org/");
  assert.equal(connection.snapshot.checking, true);
  assert.equal(saved.length, 0);
  assert.deepEqual(transports[0].requests, [["api/v1/capabilities", { maxBytes: 32768, timeout: 10000 }]]);
  transports[0].resolve({ data: capabilities });
  await pending;
  assert.deepEqual(saved, [{ baseURL: "http://localhost:8000/", allowLocalHTTP: true }]);
  assert.equal(connection.snapshot.capabilities.nativeReady, false);
  assert.equal(connection.snapshot.checking, false);
  assert.equal(transports[0].closed, true);
  assert.equal(changes.length, 2);
  unsubscribe();
  connection.close();
  assert.equal(changes.length, 2);
});

test("a failed probe preserves the existing server and records no credentials", async () => {
  const { connection, transports, saved } = setup();
  const pending = connection.checkAndUseServer("https://custom.example/prefix/");
  transports[0].reject(Object.assign(new Error("untrusted server details"), { code: "network_error" }));
  await assert.rejects(pending);
  assert.equal(connection.snapshot.server.baseURL, "https://sync.astian.org/");
  assert.equal(connection.snapshot.error, "network_error");
  assert.equal(saved.length, 0);
});

test("a late result cannot replace a newer choice", async () => {
  const { connection, transports, saved } = setup();
  const first = connection.checkAndUseServer("https://first.example");
  const second = connection.checkAndUseServer("https://second.example");
  assert.equal(transports[0].closed, true);
  transports[1].resolve({ data: capabilities });
  await second;
  transports[0].resolve({ data: capabilities });
  await assert.rejects(first, /cancelled/);
  assert.equal(connection.snapshot.server.baseURL, "https://second.example/");
  assert.equal(saved.length, 1);
});

test("cancel and shutdown cannot apply an outstanding choice", async () => {
  for (const action of ["cancelCheck", "close"]) {
    const { connection, transports, saved } = setup();
    const pending = connection.checkAndUseServer("https://custom.example");
    connection[action]();
    transports[0].resolve({ data: capabilities });
    await assert.rejects(pending, /cancelled/);
    assert.equal(saved.length, 0);
    assert.equal(connection.snapshot.checking, false);
    assert.equal(transports[0].closed, true);
  }
});

test("switching servers cancels the previous transport", async () => {
  const { connection, transports } = setup();
  const oldRequest = connection.request("api/v1/sync/info", { token: "old-token" });
  const selection = connection.checkAndUseServer("https://custom.example");
  assert.equal(transports[0].closed, false, "The active instance is retained during a probe");
  transports[1].resolve({ data: capabilities });
  await selection;
  assert.equal(transports[0].closed, true);
  transports[0].resolve({ data: {} });
  await oldRequest;
  const newRequest = connection.request("api/v1/sync/info");
  assert.equal(transports[2].baseURL, "https://custom.example/");
  assert.deepEqual(transports[2].requests, [["api/v1/sync/info", undefined]]);
  transports[2].resolve({ data: {} });
  await newRequest;
});

test("capabilities reject incomplete protocols and cap advertised limits", () => {
  for (const value of [null, {}, { ...capabilities, native_ready: undefined },
    { ...capabilities, features: [] }, { ...capabilities, changes_version: 2 },
    { ...capabilities, limits: { ...capabilities.limits, record_payload_bytes: "262144" } }]) {
    assert.throws(() => validateSyncCapabilities(value), /incompatible_server/);
  }
  const limits = Object.fromEntries(Object.keys(capabilities.limits).map(key => [key, 100000000]));
  assert.equal(validateSyncCapabilities({ ...capabilities, limits }).recordBytes, 262144);
  assert.equal(validateSyncCapabilities(capabilities).creditCards, false);
  assert.equal(validateSyncCapabilities(capabilities).formHistory, false);
  assert.equal(validateSyncCapabilities(capabilities).addresses, false);
  assert.equal(validateSyncCapabilities({ ...capabilities,
    features: [...capabilities.features, "credit_cards"] }).creditCards, true);
  const modern = validateSyncCapabilities({ ...capabilities,
    features: [...capabilities.features, "form_history", "addresses"] });
  assert.equal(modern.formHistory, true);
  assert.equal(modern.addresses, true);
});

test("account reservations prevent a cancelled asynchronous change from committing", async () => {
  let reserve;
  let released = 0;
  const { connection, transports, saved } = setup(() => new Promise(resolve => { reserve = resolve; }));
  const pending = connection.checkAndUseServer("https://other.example");
  connection.cancelCheck();
  reserve(() => ++released);
  await assert.rejects(pending, /cancelled/);
  assert.equal(released, 1);
  assert.equal(saved.length, 0);
  assert.equal(transports[0].requests.length, 0);
});

test("revision-bound registry writes require an explicit supported capability", async () => {
  for (const client_recovery of [undefined, null, {}, { registry_auth_version: 1 },
    { registry_auth_version: 3 }, { registry_auth_version: "2" }]) {
    assert.equal(validateSyncCapabilities({ ...capabilities, client_recovery }).registryAuthVersion, 0);
  }
  const modern = { ...capabilities, client_recovery: { registry_auth_version: 2 } };
  assert.equal(validateSyncCapabilities(modern).registryAuthVersion, 2);
  const { connection, transports } = setup();
  try {
    assert.equal(connection.snapshot.registryAuthVersion, 0);
    const probe = connection.checkAndUseServer("https://custom.example/");
    transports[0].resolve({ data: modern });
    await probe;
    assert.equal(connection.snapshot.registryAuthVersion, 2);
    const previous = connection.checkAndUseServer("https://previous.example/");
    transports[1].resolve({ data: capabilities });
    await previous;
    assert.equal(connection.snapshot.registryAuthVersion, 0, "Another server cannot inherit the capability");
  } finally { connection.close(); }
});

test("a saved account blocks a different server before any network request", async () => {
  const { connection, transports, saved } = setup(async () => { throw { code: "account_connected" }; });
  await assert.rejects(connection.checkAndUseServer("https://other.example"));
  assert.equal(connection.snapshot.error, "account_connected");
  assert.equal(transports[0].requests.length, 0);
  assert.equal(transports[0].closed, true);
  assert.equal(saved.length, 0);
});

test("native authentication metadata is preserved and malformed contracts are rejected", () => {
  const auth = { pairing: true, development: true, issuer: "urn:midori:sync:local" };
  const value = { ...capabilities, account_version: 1, authentication: auth };
  assert.deepEqual(validateSyncCapabilities(value).authentication, auth);
  for (const malformed of [{}, { ...auth, issuer: null }, { ...auth, development: "yes" }, { ...auth, issuer: " https://id.example/" }]) {
    assert.throws(() => validateSyncCapabilities({ ...value, authentication: malformed }), /incompatible_server/);
  }
  assert.equal(validateSyncCapabilities(capabilities).authentication, null);
});

test("public OIDC metadata is bound to the advertised issuer and HTTPS discovery", () => {
  const issuer = "https://accounts.astian.org/application/o/midori-desktop/";
  const oidc = { version: 1, issuer, client_id: "midori-desktop-public",
    discovery_url: `${issuer}.well-known/openid-configuration` };
  const auth = { pairing: true, development: false, issuer, oidc };
  const value = { ...capabilities, account_version: 1, authentication: auth };
  assert.deepEqual(validateSyncCapabilities(value).authentication.oidc, {
    version: 1, issuer, clientId: oidc.client_id, discoveryURL: oidc.discovery_url,
  });
  for (const malformed of [
    { ...oidc, issuer: "https://other.example/" },
    { ...oidc, client_id: "bad client" },
    { ...oidc, discovery_url: "http://accounts.astian.org/.well-known/openid-configuration" },
    { ...oidc, discovery_url: "https://other.example/.well-known/openid-configuration" },
    { ...oidc, discovery_url: `${issuer}.well-known/openid-configuration?next=evil` },
  ]) {
    assert.throws(() => validateSyncCapabilities({ ...value, authentication: { ...auth, oidc: malformed } }),
      /incompatible_server/);
  }
  assert.throws(() => validateSyncCapabilities({ ...value, authentication: { ...auth, development: true } }),
    /incompatible_server/);
});

test("existing web login is advertised without a public OIDC client", () => {
  const auth = { pairing: true, development: false,
    issuer: "https://accounts.example.invalid/application/o/midori-sync/",
    browser_login: { version: 1 }, oidc: null };
  const value = { ...capabilities, account_version: 1, authentication: auth };
  assert.deepEqual(validateSyncCapabilities(value).authentication.browserLogin, { version: 1 });
  for (const malformed of [{ ...auth, browser_login: { version: 2 } },
    { ...auth, development: true }, { ...auth, issuer: null }]) {
    assert.throws(() => validateSyncCapabilities({ ...value, authentication: malformed }),
      /incompatible_server/);
  }
});
