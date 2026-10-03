/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { authorizeOidc, receiveOidcCallback } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncOidc.sys.mjs");

function jsonResponse(data) {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let read = false;
  return { ok: true, headers: { get: () => "application/json" }, body: { getReader: () => ({
    async read() {
      if (read) {
        return { done: true };
      }
      read = true;
      return { done: false, value: bytes };
    },
    releaseLock() {},
  }) } };
}

add_task(async function oidc_authorization_exchanges_the_loopback_code_with_pkce() {
  const issuer = "https://accounts.example.invalid/";
  const oidc = { issuer, clientId: "midori-desktop-public",
    discoveryURL: `${issuer}.well-known/openid-configuration` };
  let authorization;
  let browserResponse;
  const requester = async (url, options) => {
    if (url === oidc.discoveryURL) {
      return jsonResponse({ issuer, authorization_endpoint: `${issuer}authorize`,
        token_endpoint: `${issuer}token`, code_challenge_methods_supported: ["S256"] });
    }
    Assert.equal(url, `${issuer}token`);
    Assert.equal(options.method, "POST");
    const body = options.body;
    Assert.equal(body.get("grant_type"), "authorization_code");
    Assert.equal(body.get("code"), "one-time-code");
    Assert.equal(body.get("client_id"), oidc.clientId);
    Assert.equal(body.get("redirect_uri"), authorization.searchParams.get("redirect_uri"));
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256",
      new TextEncoder().encode(body.get("code_verifier"))));
    const challenge = btoa(String.fromCharCode(...digest)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
    Assert.equal(challenge, authorization.searchParams.get("code_challenge"));
    return jsonResponse({ token_type: "Bearer", id_token: "test-id-token",
      access_token: "test-access-token" });
  };
  const credentials = await authorizeOidc(oidc, url => {
    authorization = new URL(url);
    Assert.equal(authorization.origin, new URL(issuer).origin);
    Assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
    Assert.equal(authorization.searchParams.get("client_id"), oidc.clientId);
    browserResponse = fetch(`${authorization.searchParams.get("redirect_uri")}?state=${
      authorization.searchParams.get("state")}&code=one-time-code`);
  }, null, requester);
  Assert.equal((await browserResponse).status, 200);
  Assert.deepEqual(credentials, { idToken: "test-id-token", accessToken: "test-access-token",
    nonce: authorization.searchParams.get("nonce") });
});

add_task(async function oidc_discovery_stops_when_the_account_connection_is_cancelled() {
  const controller = new AbortController();
  let opened = false;
  await Assert.rejects(authorizeOidc({ discoveryURL: "https://accounts.example.invalid/.well-known/openid-configuration" },
    () => { opened = true; }, controller.signal, async (_url, { signal }) => {
      controller.abort();
      Assert.ok(signal.aborted);
      throw new Error("request aborted");
    }), /cancelled/);
  Assert.ok(!opened, "Cancelling discovery never opens the provider login");
});

add_task(async function loopback_callback_requires_state_and_accepts_one_code() {
  const callback = receiveOidcCallback("expected-state");
  try {
    const wrong = await fetch(`${callback.redirectURI}?state=wrong&code=stolen`);
    Assert.equal(wrong.status, 400);
    const valid = await fetch(`${callback.redirectURI}?state=expected-state&code=authorization-code`);
    Assert.equal(valid.status, 200);
    Assert.equal(await callback.promise, "authorization-code");
  } finally {
    callback.cancel();
  }
});

add_task(async function loopback_callback_reports_authorization_denial() {
  const callback = receiveOidcCallback("expected-state");
  try {
    const denied = Assert.rejects(callback.promise, /oidc_authorization_cancelled/);
    const response = await fetch(`${callback.redirectURI}?state=expected-state&error=access_denied`);
    Assert.equal(response.status, 200);
    await denied;
  } finally {
    callback.cancel();
  }
});
