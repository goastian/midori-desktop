/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { normalizeSyncServer } from "./MidoriSyncServerConfig.sys.mjs";
import { negotiateSyncCollections } from "./MidoriSyncProtocol.sys.mjs";

export class SyncConnectionError extends Error {
  constructor(code) {
    super(code);
    this.name = "SyncConnectionError";
    this.code = code;
  }
}

export function validateSyncCapabilities(value) {
  if (value?.protocol !== "MSP" || value.changes_version !== 1 ||
      value.operations_version !== 1 || typeof value.native_ready !== "boolean" ||
      !Array.isArray(value.features) ||
      !["opaque_cursors", "snapshot_fence", "tombstones", "device_acknowledgements",
        "conditional_operations", "idempotent_operations"].every(feature => value.features.includes(feature))) {
    throw new SyncConnectionError("incompatible_server");
  }
  const limits = value.limits;
  for (const name of ["change_page_records", "change_page_payload_bytes", "record_payload_bytes",
    "operation_batch_records", "operation_batch_bytes"]) {
    if (!Number.isSafeInteger(limits?.[name]) || limits[name] < 1) {
      throw new SyncConnectionError("incompatible_server");
    }
  }
  let authentication = null;
  if (value.account_version !== undefined) {
    const auth = value.authentication;
    if (value.account_version !== 1 || typeof auth?.pairing !== "boolean" ||
        typeof auth.development !== "boolean" ||
        (auth.issuer !== null && (typeof auth.issuer !== "string" || !auth.issuer ||
          new TextEncoder().encode(auth.issuer).length > 2048 || /[\p{Cc}\s\\]/u.test(auth.issuer))) ||
        (auth.pairing && auth.issuer === null)) {
      throw new SyncConnectionError("incompatible_server");
    }
    authentication = { pairing: auth.pairing, development: auth.development, issuer: auth.issuer };
    if (Object.hasOwn(auth, "browser_login")) {
      if (auth.browser_login === null) {
        authentication.browserLogin = null;
      } else if (auth.development || auth.browser_login?.version !== 1 || !auth.issuer) {
        throw new SyncConnectionError("incompatible_server");
      } else {
        authentication.browserLogin = Object.freeze({ version: 1 });
      }
    }
    if (Object.hasOwn(auth, "oidc")) {
      const oidc = auth.oidc;
      if (oidc === null) {
        authentication.oidc = null;
      } else {
        let issuer, discovery;
        try {
          issuer = new URL(oidc?.issuer);
          discovery = new URL(oidc?.discovery_url);
        } catch {}
        if (auth.development || oidc?.version !== 1 || oidc.issuer !== auth.issuer ||
            typeof oidc.client_id !== "string" || !oidc.client_id ||
            new TextEncoder().encode(oidc.client_id).length > 255 || /[\p{Cc}\s]/u.test(oidc.client_id) ||
            typeof oidc.discovery_url !== "string" || oidc.discovery_url.length > 2048 ||
            !issuer || !discovery || issuer.protocol !== "https:" || discovery.origin !== issuer.origin ||
            issuer.username || issuer.password || issuer.search || issuer.hash ||
            discovery.username || discovery.password || discovery.search || discovery.hash ||
            !discovery.pathname.endsWith("/.well-known/openid-configuration")) {
          throw new SyncConnectionError("incompatible_server");
        }
        authentication.oidc = Object.freeze({ version: 1, issuer: oidc.issuer,
          clientId: oidc.client_id, discoveryURL: oidc.discovery_url });
      }
    }
    if (auth.refresh?.version === 1) {
      const refresh = auth.refresh;
      for (const name of ["request_bytes", "lifetime_seconds", "receipts_per_session", "sessions_per_account"]) {
        if (!Number.isSafeInteger(refresh[name]) || refresh[name] < 1) {
          throw new SyncConnectionError("incompatible_server");
        }
      }
      if (refresh.request_bytes < 256 || refresh.lifetime_seconds > 31 * 86400) {
        throw new SyncConnectionError("incompatible_server");
      }
      authentication.refresh = Object.freeze({ version: 1, lifetimeSeconds: refresh.lifetime_seconds });
    }
    authentication = Object.freeze(authentication);
  }
  const collectionSupport = negotiateSyncCollections(value);
  return Object.freeze({
    nativeReady: value.native_ready,
    collectionSupport,
    creditCards: collectionSupport["credit-cards"],
    formHistory: collectionSupport["form-history"],
    addresses: collectionSupport.addresses,
    workspaces: collectionSupport.workspaces,
    deviceEnrollment: value.crypto?.enrollment === true,
    keyReset: value.crypto?.reset === true,
    pageByteBudget: value.features.includes("change_page_byte_budget"),
    registryAuthVersion: value.client_recovery?.registry_auth_version === 2 ? 2 : 0,
    authentication,
    pageRecords: Math.min(limits.change_page_records, 100),
    pageBytes: Math.min(limits.change_page_payload_bytes, 4 * 1024 * 1024),
    recordBytes: Math.min(limits.record_payload_bytes, 262144),
    batchRecords: Math.min(limits.operation_batch_records, 100),
    batchBytes: Math.min(limits.operation_batch_bytes, 4 * 1024 * 1024),
  });
}

export class MidoriSyncConnection {
  #transportFactory;
  #saveServer;
  #prepareServerChange;
  #server;
  #capabilities = null;
  #capabilitiesCheckedAt = null;
  #now;
  #listeners = new Set();
  #probe = null;
  #probeInteractive = false;
  #refresh = null;
  #transport = null;
  #closed = false;
  #error = null;

  constructor({ baseURL, allowLocalHTTP = false, transportFactory, saveServer, prepareServerChange = () => () => {}, now = Date.now }) {
    this.#server = normalizeSyncServer(baseURL, { allowLocalHTTP });
    this.#transportFactory = transportFactory;
    this.#saveServer = saveServer;
    this.#prepareServerChange = prepareServerChange;
    this.#now = now;
  }

  get snapshot() {
    return Object.freeze({
      server: this.#server,
      capabilities: this.#capabilities,
      registryAuthVersion: this.#capabilities?.registryAuthVersion ?? 0,
      checking: this.#probeInteractive,
      error: this.#error,
    });
  }

  subscribe(listener) {
    if (this.#closed) {
      throw new SyncConnectionError("cancelled");
    }
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async getCapabilities(server) {
    this.#ensureServer(server);
    const state = await this.refreshCapabilities({ background: true });
    this.#ensureServer(server);
    if (!state.capabilities) {
      throw new SyncConnectionError(state.error ?? "incompatible_server");
    }
    return state.capabilities;
  }

  refreshCapabilities({ maxAge = 0, background = false } = {}) {
    if (this.#closed) {
      return Promise.reject(new SyncConnectionError("cancelled"));
    }
    if (!Number.isInteger(maxAge) || maxAge < 0 || maxAge > 300000) {
      return Promise.reject(new SyncConnectionError("invalid_capability_query"));
    }
    if (this.#refresh) {
      return this.#refresh;
    }
    if (this.#probe) {
      return Promise.reject(new SyncConnectionError("busy"));
    }
    const age = this.#now() - this.#capabilitiesCheckedAt;
    if (this.#capabilitiesCheckedAt !== null && age >= 0 && age < maxAge) {
      return Promise.resolve(this.snapshot);
    }
    const server = this.#server;
    const transport = this.#transportFactory(server.baseURL, { allowLocalHTTP: server.requiresLoopbackTransport });
    let resolve, reject;
    const pending = new Promise((res, rej) => { resolve = res; reject = rej; });
    this.#refresh = pending;
    this.#probe = transport;
    this.#probeInteractive = !background;
    this.#error = null;
    this.#notify();
    const work = (async () => {
      try {
        const { data } = await transport.request("api/v1/capabilities", { maxBytes: 32768, timeout: 10000 });
        if (this.#closed || this.#probe !== transport || this.#server !== server) {
          throw new SyncConnectionError("cancelled");
        }
        this.#capabilities = validateSyncCapabilities(data);
        this.#capabilitiesCheckedAt = this.#now();
        this.#error = null;
      } catch (error) {
        if (this.#probe === transport) {
          if (error.code === "incompatible_server") {
            this.#invalidateCapabilities();
          }
          this.#error = ["incompatible_server", "timeout", "network_error", "redirect_rejected",
            "invalid_response", "response_too_large", "rate_limited", "server_error", "cancelled"].includes(error.code)
            ? error.code : "connection_failed";
        }
        throw error;
      } finally {
        transport.close();
        if (this.#probe === transport) {
          this.#probe = null;
          this.#probeInteractive = false;
          this.#notify();
        }
      }
    })();
    const finish = () => {
      if (this.#refresh === pending) {
        this.#refresh = null;
      }
    };
    pending.then(finish, finish);
    work.then(() => resolve(this.snapshot), reject);
    return pending;
  }

  async checkAndUseServer(baseURL, { allowLocalHTTP = false } = {}) {
    if (this.#closed) {
      throw new SyncConnectionError("cancelled");
    }
    const server = normalizeSyncServer(baseURL, { allowLocalHTTP });
    this.cancelCheck();
    const transport = this.#transportFactory(server.baseURL, { allowLocalHTTP });
    this.#probe = transport;
    this.#probeInteractive = true;
    this.#error = null;
    this.#notify();
    let release;
    try {
      const prepared = this.#prepareServerChange(server);
      release = typeof prepared === "function" ? prepared : await prepared;
      if (this.#probe !== transport || this.#closed) {
        throw new SyncConnectionError("cancelled");
      }
      const { data } = await transport.request("api/v1/capabilities", { maxBytes: 32768, timeout: 10000 });
      if (this.#probe !== transport || this.#closed) {
        throw new SyncConnectionError("cancelled");
      }
      const capabilities = validateSyncCapabilities(data);
      this.#saveServer({ baseURL: server.baseURL, allowLocalHTTP: server.requiresLoopbackTransport });
      this.#transport?.close();
      this.#transport = null;
      this.#server = server;
      this.#capabilities = capabilities;
      this.#capabilitiesCheckedAt = this.#now();
    } catch (error) {
      if (this.#probe === transport) {
        if (error.code === "incompatible_server" && server.baseURL === this.#server.baseURL) {
          this.#invalidateCapabilities();
        } else {
          this.#error = ["incompatible_server", "timeout", "network_error", "redirect_rejected",
            "invalid_response", "response_too_large", "rate_limited", "server_error", "cancelled",
            "account_connected", "busy"].includes(error.code)
            ? error.code : "connection_failed";
        }
      }
      throw error;
    } finally {
      transport.close();
      if (this.#probe === transport) {
        this.#probe = null;
        this.#probeInteractive = false;
        this.#notify();
      }
      release?.();
    }
    return this.snapshot;
  }

  cancelCheck() {
    const probe = this.#probe;
    this.#probe = null;
    this.#probeInteractive = false;
    this.#refresh = null;
    probe?.close();
    if (probe) {
      this.#notify();
    }
  }

  request(path, options) {
    if (this.#closed) {
      return Promise.reject(new SyncConnectionError("cancelled"));
    }
    this.#transport ??= this.#transportFactory(this.#server.baseURL, {
      allowLocalHTTP: this.#server.requiresLoopbackTransport,
    });
    return this.#transport.request(path, options);
  }

  close() {
    this.#closed = true;
    this.cancelCheck();
    this.#transport?.close();
    this.#transport = null;
    this.#listeners.clear();
  }

  #ensureServer(server) {
    if (this.#closed || server?.baseURL !== this.#server.baseURL ||
        server?.requiresLoopbackTransport !== this.#server.requiresLoopbackTransport) {
      throw new SyncConnectionError("cancelled");
    }
  }

  #invalidateCapabilities() {
    this.#capabilities = null;
    this.#capabilitiesCheckedAt = this.#now();
    this.#error = "incompatible_server";
  }

  #notify() {
    const state = this.snapshot;
    for (const listener of this.#listeners) {
      try {
        listener(state);
      } catch {}
    }
  }
}
