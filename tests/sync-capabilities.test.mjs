/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import test from "node:test";
import { negotiateSyncCollections, syncCollectionSupported } from "../src/browser/components/sync/MidoriSyncProtocol.sys.mjs";

const capabilities = {
  collections: ["bookmarks", "history", "passwords", "credit-cards", "form-history", "addresses", "workspaces", "midori-privacy", "site-permissions", "extensions", "extension-settings", "tabs", "browser-settings"],
  data_schemas: { bookmarks: 2, history: 2, passwords: 1, "credit-cards": 1, "form-history": 1,
    addresses: 1, workspaces: 1, "midori-privacy": 1, "site-permissions": 1, extensions: 1, "extension-settings": 1, tabs: 2, "browser-settings": 1 },
  features: ["bookmark_labels", "history_parts", "history_visit_removals", "credit_cards", "form_history", "addresses", "workspace_metadata", "custom_filters", "site_permissions", "extension_catalog", "extension_settings", "tab_fragments"],
};

test("all current families negotiate independently of native_ready and plaintext versions", () => {
  const expected = Object.fromEntries(capabilities.collections.map(name => [name, true]));
  assert.deepEqual(negotiateSyncCollections({ ...capabilities, native_ready: false }), expected);
  assert.deepEqual(negotiateSyncCollections({ ...capabilities, native_ready: true }), expected);
  for (const name of ["bookmarks", "history", "tabs"]) {
    const result = negotiateSyncCollections({ ...capabilities, data_schemas: { ...capabilities.data_schemas, [name]: 1 } });
    assert.equal(result[name], false, "Plaintext version 1 does not replace capability generation 2");
    assert.equal(result.passwords, true, "An incompatible family leaves the other families available");
  }
});

test("missing or malformed collection and schema inventories grant no support", () => {
  for (const value of [null, {}, { ...capabilities, collections: null }, { ...capabilities, collections: {} },
    { ...capabilities, collections: "bookmarks" }, { ...capabilities, data_schemas: undefined },
    { ...capabilities, data_schemas: null }, { ...capabilities, data_schemas: [] }]) {
    assert.ok(Object.values(negotiateSyncCollections(value)).every(supported => supported === false));
  }
});

test("each family requires its own declared collection and exact numeric generation", () => {
  for (const name of capabilities.collections) {
    const missing = negotiateSyncCollections({ ...capabilities, collections: capabilities.collections.filter(item => item !== name) });
    assert.equal(missing[name], false);
    assert.equal(Object.values(missing).filter(Boolean).length, capabilities.collections.length - 1);
    for (const generation of [undefined, null, true, "1", "2", -1, 0, 3, 1.5, NaN, Infinity]) {
      const result = negotiateSyncCollections({ ...capabilities, data_schemas: { ...capabilities.data_schemas, [name]: generation } });
      assert.equal(result[name], false, `${name} rejects an unsupported generation`);
      assert.equal(Object.values(result).filter(Boolean).length, capabilities.collections.length - 1);
    }
  }
});

test("required semantic features cannot be inferred from a matching generation", () => {
  const requirements = { bookmark_labels: "bookmarks", history_parts: "history", history_visit_removals: "history",
    credit_cards: "credit-cards", form_history: "form-history", addresses: "addresses", workspace_metadata: "workspaces",
    custom_filters: "midori-privacy", site_permissions: "site-permissions", extension_catalog: "extensions", extension_settings: "extension-settings", tab_fragments: "tabs" };
  for (const [feature, name] of Object.entries(requirements)) {
    const result = negotiateSyncCollections({ ...capabilities, features: capabilities.features.filter(item => item !== feature) });
    assert.equal(result[name], false);
    assert.equal(Object.values(result).filter(Boolean).length, capabilities.collections.length - 1);
  }
  for (const features of [null, {}, "bookmark_labels"]) {
    const result = negotiateSyncCollections({ ...capabilities, features });
    assert.deepEqual(Object.keys(result).filter(name => result[name]), ["passwords", "browser-settings"]);
  }
});

test("unknown declarations and inherited schemas cannot grant family support", () => {
  const extended = negotiateSyncCollections({ ...capabilities, collections: [...capabilities.collections, "future-family"],
    data_schemas: { ...capabilities.data_schemas, "future-family": 1 }, features: [...capabilities.features, "future-feature"] });
  assert.equal(Object.hasOwn(extended, "future-family"), false);
  assert.deepEqual(extended, negotiateSyncCollections(capabilities));
  const inherited = negotiateSyncCollections({ ...capabilities, data_schemas: Object.create(capabilities.data_schemas) });
  assert.ok(Object.values(inherited).every(supported => supported === false));
});

test("negotiated support is immutable and detached from the received document", () => {
  const source = structuredClone(capabilities);
  const result = negotiateSyncCollections(source);
  source.collections.length = 0;
  source.features.length = 0;
  source.data_schemas.bookmarks = 3;
  assert.ok(Object.values(result).every(supported => supported === true));
  assert.throws(() => { result.bookmarks = false; }, TypeError);
});

test("an older account grant cannot override the current connection matrix", () => {
  const account = { status: "connected", collectionSupport: negotiateSyncCollections(capabilities) };
  const connection = { capabilities: { collectionSupport: negotiateSyncCollections({ ...capabilities,
    data_schemas: { ...capabilities.data_schemas, history: 99 } }) } };
  assert.equal(syncCollectionSupported("history", account, connection), false);
  assert.equal(syncCollectionSupported("passwords", account, connection), true);
  connection.error = "incompatible_server";
  assert.equal(syncCollectionSupported("passwords", account, connection), false);
  assert.equal(syncCollectionSupported("passwords", account, { error: "incompatible_server" }), false);
  assert.equal(syncCollectionSupported("passwords", account, { capabilities: null, error: "account_connected" }), false,
    "A later UI error cannot reinstate withdrawn metadata");
});

test("support needs negotiated metadata while local capture remains available", () => {
  assert.equal(syncCollectionSupported("bookmarks", { status: "connected", creditCardsSupported: true }, {}), false);
  assert.equal(syncCollectionSupported("bookmarks", { status: "connected", collectionSupport: { bookmarks: true } }, {}), false);
  assert.equal(syncCollectionSupported("bookmarks", { status: "connected", collectionSupport: { bookmarks: true } }), true);
  assert.equal(syncCollectionSupported("bookmarks", { status: "connected", collectionSupport: Object.create({ bookmarks: true }) }), false);
  assert.equal(syncCollectionSupported("bookmarks", { status: "local" }, { error: "incompatible_server" }), true);
});
