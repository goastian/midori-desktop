/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const CALLBACK_PATH = "/midori-sync/callback";
const MAX_PROVIDER_RESPONSE = 32768;

export class SyncOidcError extends Error {
  constructor(code) {
    super(code);
    this.name = "SyncOidcError";
    this.code = code;
  }
}

function sameOriginEndpoint(value, issuer) {
  if (typeof value !== "string" || value.length > 2048 || /[\p{Cc}\s\\]/u.test(value)) {
    return false;
  }
  try {
    const url = new URL(value);
    const origin = new URL(issuer);
    return url.protocol === "https:" && url.origin === origin.origin &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function validateOidcMetadata(value, oidc) {
  if (!value || value.issuer !== oidc.issuer ||
      !sameOriginEndpoint(value.authorization_endpoint, oidc.issuer) ||
      !sameOriginEndpoint(value.token_endpoint, oidc.issuer) ||
      (value.code_challenge_methods_supported !== undefined &&
        (!Array.isArray(value.code_challenge_methods_supported) ||
          !value.code_challenge_methods_supported.includes("S256")))) {
    throw new SyncOidcError("oidc_provider_unavailable");
  }
  return Object.freeze({ authorizationURL: value.authorization_endpoint, tokenURL: value.token_endpoint });
}

export function buildOidcAuthorizationURL(endpoint, clientId, redirectURI, state, nonce, challenge) {
  const url = new URL(endpoint);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectURI,
    response_type: "code",
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.href;
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function providerJson(url, options = {}, requester = fetch, signal = null) {
  const { setTimeout, clearTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) {
    onAbort();
  }
  const timeout = setTimeout(onAbort, 10000);
  let response;
  try {
    response = await requester(url, {
      credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer",
      ...options, signal: controller.signal,
    });
  } catch {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
    throw new SyncOidcError(signal?.aborted ? "cancelled" : "oidc_provider_unavailable");
  }
  try {
    if (!response.ok || !/^application\/(?:json|[a-z0-9.+-]+\+json)/iu.test(response.headers.get("Content-Type") ?? "")) {
      throw new SyncOidcError("oidc_provider_unavailable");
    }
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        length += value.byteLength;
        if (length > MAX_PROVIDER_RESPONSE) {
          throw new SyncOidcError("oidc_provider_unavailable");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new SyncOidcError(signal?.aborted ? "cancelled" : "oidc_provider_unavailable");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function receiveOidcCallback(state) {
  const server = Cc["@mozilla.org/network/server-socket;1"].createInstance(Ci.nsIServerSocket);
  server.init(-1, true, -1);
  const redirectURI = `http://127.0.0.1:${server.port}${CALLBACK_PATH}`;
  const active = new Set();
  const closing = new Set();
  let settled = false;
  let resolveCallback, rejectCallback;
  const promise = new Promise((resolve, reject) => {
    resolveCallback = resolve;
    rejectCallback = reject;
  });
  const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
  const settle = (code, error = null) => {
    if (settled) {
      return;
    }
    settled = true;
    timer.cancel();
    server.close();
    for (const transport of active) {
      transport.close(Cr.NS_OK);
    }
    active.clear();
    if (error) {
      rejectCallback(new SyncOidcError(error));
    } else {
      resolveCallback(code);
    }
  };
  server.asyncListen({
    onSocketAccepted(_socket, transport) {
      active.add(transport);
      const input = transport.openInputStream(0, 0, 0);
      const pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(Ci.nsIInputStreamPump);
      pump.init(input, 0, 0, false);
      let request = "";
      let handled = false;
      const respond = (status, body) => {
        if (handled) {
          return;
        }
        handled = true;
        const output = transport.openOutputStream(0, 0, 0);
        const data = `HTTP/1.1 ${status}\r\nContent-Type: text/plain; charset=utf-8\r\n` +
          `Cache-Control: no-store\r\nContent-Security-Policy: default-src 'none'\r\n` +
          `Connection: close\r\nContent-Length: ${body.length}\r\n\r\n${body}`;
        output.write(data, data.length);
        output.flush();
        output.close();
        active.delete(transport);
        const closeTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
        closing.add(closeTimer);
        closeTimer.initWithCallback(() => {
          closing.delete(closeTimer);
          transport.close(Cr.NS_OK);
        }, 5000, Ci.nsITimer.TYPE_ONE_SHOT);
      };
      pump.asyncRead({
        onStartRequest() {},
        onDataAvailable(_request, stream, _offset, count) {
          if (handled) {
            return;
          }
          if (request.length + count > 8192) {
            respond("413 Payload Too Large", "Request too large.");
            return;
          }
          const binary = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
          binary.setInputStream(stream);
          request += String.fromCharCode(...binary.readByteArray(count));
          if (!request.includes("\r\n\r\n")) {
            return;
          }
          const [line, ...headers] = request.split("\r\n");
          const match = /^GET (\/midori-sync\/callback\?[^ ]{1,4096}) HTTP\/1\.[01]$/u.exec(line);
          const host = headers.find(header => /^Host:/iu.test(header))?.slice(5).trim();
          if (!match || host !== `127.0.0.1:${server.port}`) {
            respond("400 Bad Request", "Invalid authorization response.");
            return;
          }
          const query = new URL(match[1], redirectURI).searchParams;
          if (query.getAll("state").length !== 1 || query.get("state") !== state ||
              query.getAll("code").length > 1 || query.getAll("error").length > 1) {
            respond("400 Bad Request", "Invalid authorization response.");
            return;
          }
          const code = query.get("code");
          const error = query.get("error");
          if (error) {
            respond("200 OK", "Authorization was cancelled. Return to Midori.");
            settle(null, "oidc_authorization_cancelled");
          } else if (code && code.length <= 2048) {
            respond("200 OK", "Authorization received. Return to Midori.");
            settle(code);
          } else {
            respond("400 Bad Request", "Invalid authorization response.");
          }
        },
        onStopRequest() {
          active.delete(transport);
          transport.close(Cr.NS_OK);
        },
      });
    },
    onStopListening() {},
  });
  timer.initWithCallback(() => settle(null, "oidc_timeout"), 180000, Ci.nsITimer.TYPE_ONE_SHOT);
  return { redirectURI, promise, cancel: () => settle(null, "cancelled") };
}

export async function authorizeOidc(oidc, openURL, signal = null, requester = fetch) {
  const metadata = validateOidcMetadata(await providerJson(oidc.discoveryURL, {}, requester, signal), oidc);
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const callback = receiveOidcCallback(state);
  const onAbort = () => callback.cancel();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    if (signal?.aborted) {
      throw new SyncOidcError("cancelled");
    }
    openURL(buildOidcAuthorizationURL(metadata.authorizationURL, oidc.clientId,
      callback.redirectURI, state, nonce, challenge));
    const code = await callback.promise;
    const data = await providerJson(metadata.tokenURL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code,
        redirect_uri: callback.redirectURI, client_id: oidc.clientId, code_verifier: verifier }),
    }, requester, signal);
    if (data?.token_type?.toLowerCase() !== "bearer" || typeof data.id_token !== "string" ||
        typeof data.access_token !== "string" || data.id_token.length > 16384 ||
        data.access_token.length > 8192) {
      throw new SyncOidcError("oidc_invalid_response");
    }
    return { idToken: data.id_token, accessToken: data.access_token, nonce };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    callback.promise.catch(() => {});
    callback.cancel();
  }
}
