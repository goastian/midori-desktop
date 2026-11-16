/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { authorizeBrowserLogin, browserConsentCode, buildOidcAuthorizationURL, validateOidcMetadata } from
  "../src/browser/components/sync/MidoriSyncOidc.sys.mjs";

const oidc = { issuer: "https://accounts.astian.org/application/o/midori-desktop/",
  clientId: "midori-desktop-public" };
const metadata = { issuer: oidc.issuer,
  authorization_endpoint: `${oidc.issuer}authorize/`,
  token_endpoint: `${oidc.issuer}token/`,
  code_challenge_methods_supported: ["S256"],
};

test("browser consent codes agree across clients and bind every request field", async () => {
  const vectors = JSON.parse(readFileSync(new URL("./fixtures/browser-consent-v2.json", import.meta.url)));
  for (const value of vectors.browser) {
    const fields = [value.state, value.challenge, value.redirect_uri, value.device_type];
    assert.equal(await browserConsentCode(...fields), value.code);
    for (let i = 0; i < fields.length; i++) {
      const changed = [...fields];
      changed[i] += "changed";
      assert.notEqual(await browserConsentCode(...changed), value.code);
    }
  }
});

test("browser authorization cannot open without a native code display", async () => {
  let opened = false;
  await assert.rejects(authorizeBrowserLogin("https://sync.example.invalid/", () => { opened = true; }),
    /invalid_oidc_request/);
  assert.equal(opened, false);
});

test("provider endpoints stay on the advertised issuer origin and support S256", () => {
  assert.deepEqual(validateOidcMetadata(metadata, oidc), {
    authorizationURL: metadata.authorization_endpoint, tokenURL: metadata.token_endpoint,
  });
  for (const bad of [
    { ...metadata, issuer: "https://other.example/" },
    { ...metadata, token_endpoint: "http://accounts.astian.org/token/" },
    { ...metadata, authorization_endpoint: "https://other.example/authorize/" },
    { ...metadata, token_endpoint: `${oidc.issuer}token/?redirect=evil` },
    { ...metadata, code_challenge_methods_supported: ["plain"] },
  ]) {
    assert.throws(() => validateOidcMetadata(bad, oidc), /oidc_provider_unavailable/);
  }
});

test("authorization URL requests a code with PKCE, state and nonce", () => {
  const url = new URL(buildOidcAuthorizationURL(metadata.authorization_endpoint, oidc.clientId,
    "http://127.0.0.1:45678/midori-sync/callback", "state-value", "nonce-value", "challenge-value"));
  assert.equal(url.origin, "https://accounts.astian.org");
  assert.equal(url.searchParams.get("client_id"), oidc.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:45678/midori-sync/callback");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "openid profile email");
  assert.equal(url.searchParams.get("state"), "state-value");
  assert.equal(url.searchParams.get("nonce"), "nonce-value");
  assert.equal(url.searchParams.get("code_challenge"), "challenge-value");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});
