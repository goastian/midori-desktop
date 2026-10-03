/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const MIDORI_SYNC_OFFICIAL_SERVER = "https://sync.astian.org/";
export const MIDORI_SYNC_LOCAL_SERVER = "http://localhost:8000/";

export class SyncServerConfigurationError extends Error {
  constructor(code) {
    super(code);
    this.name = "SyncServerConfigurationError";
    this.code = code;
  }
}

export function normalizeSyncServer(input, { allowLocalHTTP = false } = {}) {
  if (typeof input !== "string" || input.length > 2048) {
    throw new SyncServerConfigurationError("invalid_server_url");
  }
  const value = input.trim();
  if (!value || /[\p{Cc}\s\\?#]/u.test(value)) {
    throw new SyncServerConfigurationError("invalid_server_url");
  }
  let url;
  try {
    url = new URL(value.includes("://") ? value : `https://${value}`);
  } catch {
    throw new SyncServerConfigurationError("invalid_server_url");
  }
  const authority = value.split("://").at(-1).split("/")[0];
  if (authority.includes("@") || url.port === "0" ||
      url.username || url.password || !["http:", "https:"].includes(url.protocol)) {
    throw new SyncServerConfigurationError("invalid_server_url");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol === "http:" && (!loopback || allowLocalHTTP !== true)) {
    throw new SyncServerConfigurationError("https_required");
  }
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  const transport = new URL(url.href);
  if (url.protocol === "http:" && url.hostname === "localhost") {
    transport.hostname = "127.0.0.1";
  }

  return Object.freeze({
    baseURL: url.href,
    origin: url.origin,
    apiURL: new URL("api/v1/", url).href,
    capabilitiesURL: new URL("api/v1/capabilities", url).href,
    official: url.href === MIDORI_SYNC_OFFICIAL_SERVER,
    loopback,
    requiresLoopbackTransport: url.protocol === "http:",
    transportBaseURL: transport.href,
  });
}

export function syncAccountScope(server, issuer, subject) {
  if (!issuer || !subject || typeof issuer !== "string" || typeof subject !== "string") {
    throw new SyncServerConfigurationError("invalid_account_scope");
  }
  return JSON.stringify([server.baseURL, issuer, subject]);
}
