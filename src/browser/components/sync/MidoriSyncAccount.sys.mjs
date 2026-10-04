/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { validateSyncCapabilities } from "./MidoriSyncConnection.sys.mjs";
import { authorizeBrowserLogin, authorizeOidc } from "./MidoriSyncOidc.sys.mjs";
import { syncAccountScope } from "./MidoriSyncServerConfig.sys.mjs";

const LOCAL_ISSUER = "urn:midori:sync:local";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN = /^[a-z0-9._~-]{1,4096}$/i;
const REFRESH_TOKEN = /^mrf_[0-9a-f]{64}$/;
const OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RENEWAL_WINDOW_MS = 30000;
const encoder = new TextEncoder();

export class SyncAccountError extends Error {
  constructor(code, { status = 0, retryAfter = 0 } = {}) {
    super(code);
    this.name = "SyncAccountError";
    this.code = code;
    this.status = Number.isInteger(status) && status >= 0 && status <= 599 ? status : 0;
    this.retryAfter = Number.isInteger(retryAfter) && retryAfter >= 0 && retryAfter <= 86400 ? retryAfter : 0;
  }
}

function text(value, max, allowEmpty = false) {
  return typeof value === "string" && (allowEmpty || value.length > 0) &&
    encoder.encode(value).length <= max && !/[\p{Cc}\p{Cs}]/u.test(value);
}

function timestamp(value) {
  return typeof value === "string" && value.length <= 40 &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function validateRenewal(value, account) {
  if (value === undefined) {
    return null;
  }
  if (!value || value.version !== 1 || typeof value.token !== "string" || !REFRESH_TOKEN.test(value.token) ||
      !timestamp(value.expires_at) || Date.parse(value.expires_at) < Date.parse(account.expires_at) ||
      (value.pending !== null && (typeof value.pending !== "string" || !OPERATION_ID.test(value.pending))) ||
      Object.keys(value).sort().join(",") !== "expires_at,pending,token,version") {
    throw new SyncAccountError("invalid_renewal");
  }
  return { version: 1, token: value.token, expires_at: value.expires_at, pending: value.pending };
}

function validateIdentity(identity, server, authentication = null) {
  if (!text(identity?.issuer, 2048) || !text(identity.subject, 255)) {
    throw new SyncAccountError("invalid_account");
  }
  if (identity.kind === "development") {
    if (!server.loopback || identity.issuer !== LOCAL_ISSUER) {
      throw new SyncAccountError("invalid_account");
    }
  } else {
    let issuer;
    try {
      issuer = new URL(identity.issuer);
    } catch {}
    if (identity.kind !== "oidc" || !issuer || issuer.protocol !== "https:" ||
        issuer.username || issuer.password || issuer.port === "0" ||
        /[\s\\?#@]/u.test(identity.issuer)) {
      throw new SyncAccountError("invalid_account");
    }
  }
  if (authentication && (identity.issuer !== authentication.issuer ||
      (identity.kind === "development") !== authentication.development)) {
    throw new SyncAccountError("account_scope_mismatch");
  }
  return { issuer: identity.issuer, subject: identity.subject, kind: identity.kind };
}

function validateAccount(value, server, authentication) {
  const identity = validateIdentity(value?.identity, server, authentication);
  const id = typeof value.user?.id === "number" && Number.isSafeInteger(value.user.id)
    ? String(value.user.id) : value.user?.id;
  if (!text(id, 32) || !/^[1-9][0-9]*$/.test(id) ||
      !text(value.user?.name, 1024, true) || !text(value.user?.email, 1024, true) ||
      !UUID.test(value.device?.id) || !text(value.device?.name, 1024) || value.device?.type !== "desktop" ||
      !timestamp(value.expires_at)) {
    throw new SyncAccountError("invalid_account");
  }
  return {
    identity, user: { id, name: value.user.name, email: value.user.email },
    device: { id: value.device.id, name: value.device.name, type: "desktop" },
    expires_at: value.expires_at,
  };
}

function sameAccount(left, right) {
  return left.identity.issuer === right.identity.issuer && left.identity.subject === right.identity.subject &&
    left.identity.kind === right.identity.kind && left.user.id === right.user.id && left.device.id === right.device.id;
}

export class MidoriSyncAccount {
  #connection;
  #vaultFactory;
  #transportFactory;
  #oidcAuthorization;
  #browserAuthorization;
  #prepareDisconnect;
  #now;
  #createId;
  #renewing = null;
  #recoveryCandidate = null;
  #vaultPromise = null;
  #initializing = null;
  #session = null;
  #transport = null;
  #status = "unknown";
  #error = null;
  #busy = false;
  #closed = false;
  #listeners = new Set();
  #revocationPending = false;
  #authorization = null;
  #generation = 0;
  #creditCardsSupported = false;

  constructor({ connection, vaultFactory, transportFactory, prepareDisconnect, oidcAuthorization = authorizeOidc,
    browserAuthorization = authorizeBrowserLogin, now = Date.now,
    createId = () => Services.uuid.generateUUID().toString().slice(1, -1) }) {
    this.#connection = connection;
    this.#vaultFactory = vaultFactory;
    this.#transportFactory = transportFactory;
    this.#oidcAuthorization = oidcAuthorization;
    this.#browserAuthorization = browserAuthorization;
    this.#prepareDisconnect = prepareDisconnect;
    this.#now = now;
    this.#createId = createId;
  }

  get snapshot() {
    const account = this.#session?.account;
    const renewal = this.#session?.renewal;
    let status = this.#status;
    if (status === "connected" && (renewal?.pending || this.#recoveryCandidate || Date.parse(account.expires_at) <= this.#now())) {
      status = renewal && Date.parse(renewal.expires_at) > this.#now() ? "renewal-required" : "expired";
    }
    return Object.freeze({
      status,
      busy: this.#busy, error: this.#error, revocationPending: this.#revocationPending,
      generation: this.#generation,
      creditCardsSupported: this.#creditCardsSupported,
      user: account ? Object.freeze({ name: account.user.name, email: account.user.email }) : null,
      device: account ? Object.freeze({ id: account.device.id, name: account.device.name }) : null,
    });
  }

  subscribe(listener) {
    this.#ensureOpen();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  initialize() {
    this.#ensureOpen();
    this.#initializing ??= (async () => {
      try {
        const vault = await this.#vault();
        const { present } = await vault.inspect();
        this.#ensureOpen();
        this.#status = present ? "locked" : "signed-out";
      } catch (error) {
        if (!this.#closed) {
          this.#status = "error";
          this.#error = error.code ?? "vault_unavailable";
        }
      }
      this.#notify();
    })();
    return this.#initializing;
  }

  async prepareServerChange(server) {
    await this.initialize();
    this.#begin(true);
    try {
      if (server.baseURL !== this.#connection.snapshot.server.baseURL) {
        if (this.#session) {
          throw new SyncAccountError("account_connected");
        }
        const vault = await this.#vault();
        if ((await vault.inspect()).present) {
          throw new SyncAccountError("account_connected");
        }
      }
      this.#ensureOpen();
      return () => this.#finish();
    } catch (error) {
      this.#finish();
      throw error;
    }
  }

  async pair(code, deviceName) {
    const pairingToken = typeof code === "string" ? code.trim().replaceAll("-", "").toUpperCase() : "";
    if (!/^[A-F0-9]{16}$/.test(pairingToken) || !text(deviceName, 255)) {
      throw new SyncAccountError("invalid_pairing_input");
    }
    return this.#connect(async (transport, authentication) => {
      if (!authentication.pairing) {
        throw new SyncAccountError("pairing_unavailable");
      }
      try {
        const { data } = await transport.request("api/v1/pair/redeem", {
          method: "POST", maxBytes: 16384, timeout: 10000,
          body: { pairing_token: pairingToken, device_name: deviceName, device_type: "desktop",
            ...(authentication.refresh ? { native_refresh: true } : {}) },
        });
        return data;
      } catch (error) {
        if (error.status === 404 || error.status === 409) {
          throw new SyncAccountError(error.status === 404 ? "invalid_pairing_code" : "pairing_unavailable");
        }
        throw error;
      }
    });
  }

  async connectOidc(openURL, deviceName = "Midori Desktop") {
    if (typeof openURL !== "function" || !text(deviceName, 255)) {
      throw new SyncAccountError("invalid_oidc_request");
    }
    return this.#connect(async (transport, authentication) => {
      if ((!authentication.browserLogin && !authentication.oidc) || !authentication.refresh) {
        throw new SyncAccountError("oidc_unavailable");
      }
      const controller = new AbortController();
      this.#authorization = controller;
      let result;
      try {
        result = authentication.browserLogin ?
          await this.#browserAuthorization(this.#connection.snapshot.server.baseURL, openURL, controller.signal) :
          await this.#oidcAuthorization(authentication.oidc, openURL, controller.signal);
      } finally {
        if (this.#authorization === controller) {
          this.#authorization = null;
        }
      }
      const { data } = await transport.request(authentication.browserLogin ?
        "api/v1/auth/browser-token" : "api/v1/auth/native-token", {
        method: "POST", maxBytes: 16384, timeout: 10000,
        body: authentication.browserLogin ? { code: result.code, code_verifier: result.verifier,
          device_name: deviceName } : { id_token: result.idToken, access_token: result.accessToken,
          nonce: result.nonce, device_name: deviceName },
      });
      return data;
    });
  }

  cancelAuthorization() {
    this.#authorization?.abort();
  }

  async #connect(issue) {
    return this.#run(async () => {
      const vault = await this.#vault();
      if ((await vault.inspect()).present) {
        throw new SyncAccountError("account_connected");
      }
      await vault.unlock();
      this.#ensureOpen();
      const server = this.#connection.snapshot.server;
      const transport = this.#openTransport(server);
      let token = null;
      let refreshProof = null;
      try {
        const authentication = await this.#authentication(transport, server);
        this.#ensureOpen();
        const data = await issue(transport, authentication);
        refreshProof = typeof data?.refresh_token === "string" && REFRESH_TOKEN.test(data.refresh_token) ? data.refresh_token : null;
        if (typeof data?.token !== "string" || !TOKEN.test(data.token)) {
          throw new SyncAccountError("invalid_account");
        }
        token = data.token;
        this.#ensureOpen();
        const paired = validateAccount(data, server, authentication);
        let renewal = null;
        if (authentication.refresh) {
          renewal = validateRenewal({ version: data.refresh_version, token: data.refresh_token,
            expires_at: data.refresh_expires_at, pending: null }, paired);
          if (Date.parse(renewal.expires_at) > this.#now() + authentication.refresh.lifetimeSeconds * 1000 + 60000) {
            throw new SyncAccountError("invalid_renewal");
          }
        } else if (data.refresh_token !== undefined || data.refresh_version !== undefined || data.refresh_expires_at !== undefined) {
          throw new SyncAccountError("invalid_renewal");
        }
        const account = await this.#verify(transport, token, server, authentication, paired);
        const scope = syncAccountScope(server, account.identity.issuer, account.identity.subject);
        await vault.save(scope, {
          version: 1, server: server.baseURL, allowLocalHTTP: server.requiresLoopbackTransport, token, account,
          ...(renewal ? { renewal } : {}),
        });
        this.#ensureOpen();
        this.#session = { token, account, server, renewal };
        this.#recoveryCandidate = null;
        ++this.#generation;
        this.#status = "connected";
        this.#revocationPending = false;
      } catch (error) {
        if (token || refreshProof) {
          this.#revocationPending = !(await this.#revoke(transport, token, refreshProof));
          try {
            if (!refreshProof || !this.#revocationPending) {
              await vault.clear();
            } else if ((await vault.inspect()).present) {
              this.#status = "locked";
            }
          } catch {
            if (!this.#closed) {
              this.#status = "error";
            }
          }
        }
        throw error;
      } finally {
        this.#closeTransport(transport);
      }
    });
  }

  async unlock({ interactive = true } = {}) {
    return this.#run(async () => {
      this.#session = null;
      this.#recoveryCandidate = null;
      ++this.#generation;
      this.#status = "locked";
      this.#notify();
      const custody = await this.#vault();
      const vault = interactive ? custody : {
        load: scope => custody.load(scope, { interactive: false }),
        save: (scope, data) => custody.save(scope, data, { interactive: false }),
      };
      const stored = await vault.load();
      this.#ensureOpen();
      if (!stored) {
        this.#status = "signed-out";
        return;
      }
      const server = this.#connection.snapshot.server;
      const session = this.#validateStored(stored, server);
      const transport = this.#openTransport(server);
      try {
        const authentication = await this.#authentication(transport, server);
        const renewed = await this.#renewStored(vault, stored, session, transport, authentication);
        const account = renewed ? session.account : await this.#verify(transport, session.token, server, authentication, session.account);
        this.#ensureOpen();
        this.#session = { ...session, account };
        ++this.#generation;
        this.#status = "connected";
      } finally {
        this.#closeTransport(transport);
      }
    });
  }

  async disconnect() {
    return this.#run(async () => {
      const vault = await this.#vault();
      let session = this.#session;
      let needsRevocation = (await vault.inspect()).present;
      if (needsRevocation) {
        const stored = await vault.load();
        const saved = session ? this.#restoreSession(stored, session) :
          this.#validateStored(stored, this.#connection.snapshot.server);
        session = saved;
        const knownFields = new Set(["version", "server", "allowLocalHTTP", "token", "account", "renewal", "crypto", "journal"]);
        if (Object.keys(stored.data).some(field => !knownFields.has(field))) {
          throw new SyncAccountError("sync_disconnect_unavailable");
        }
        const journal = structuredClone(stored.data.journal ?? null);
        if (this.#prepareDisconnect) {
          await this.#prepareDisconnect({ journal, localKeys: structuredClone(stored.data.crypto ?? null),
            scope: stored.scope, deviceId: saved.account.device.id });
        } else if (journal !== null) {
          throw new SyncAccountError("sync_disconnect_unavailable");
        }
      }
      this.#ensureOpen();
      if (session) {
        const transport = this.#openTransport(session.server);
        try {
          needsRevocation = !(await this.#revoke(transport, session.token, session.renewal?.token));
          if (needsRevocation && session.renewal) {
            throw new SyncAccountError("revocation_unconfirmed");
          }
        } finally {
          this.#closeTransport(transport);
        }
      }
      this.#ensureOpen();
      this.#session = null;
      this.#recoveryCandidate = null;
      ++this.#generation;
      this.#status = "locked";
      await vault.clear();
      this.#status = "signed-out";
      this.#revocationPending = needsRevocation;
    });
  }


  withSecrets(work, { signal } = {}) {
    return this.#secrets(work, false, signal);
  }

  withLocalSecrets(work) {
    return this.#secrets(work, true);
  }

  renew() {
    if (this.#renewing) {
      return this.#renewing;
    }
    this.#renewing = this.#run(async () => {
      const session = this.#session;
      if (!session || this.#status !== "connected") {
        throw new SyncAccountError("remote_access_unavailable");
      }
      const vault = await this.#vault();
      const stored = await vault.load();
      Object.assign(session, this.#restoreSession(stored, session));
      const transport = this.#openTransport(session.server);
      try {
        await this.#renewStored(vault, stored, session, transport);
        if (Date.parse(session.account.expires_at) <= this.#now()) {
          throw new SyncAccountError("auth_required");
        }
      } finally {
        this.#closeTransport(transport);
      }
    }).finally(() => { this.#renewing = null; });
    return this.#renewing;
  }

  async #secrets(work, localOnly, signal) {
    const ensureNotCancelled = () => {
      if (signal?.aborted) {
        throw new SyncAccountError("cancelled");
      }
    };
    ensureNotCancelled();
    if (this.#renewing) {
      await this.#renewing;
    }
    ensureNotCancelled();
    let result;
    await this.#run(async () => {
      ensureNotCancelled();
      const session = this.#session;
      if (!session || !(localOnly ? ["connected", "renewal-required", "local"] : ["connected", "renewal-required"]).includes(this.snapshot.status)) {
        throw new SyncAccountError(session && this.#status === "local" ? "remote_access_unavailable" : "auth_required");
      }
      const scope = syncAccountScope(session.server, session.account.identity.issuer, session.account.identity.subject);
      const custody = await this.#vault();
      const vault = {
        load: expected => custody.load(expected, { interactive: false }),
        save: (expected, data) => custody.save(expected, data, { interactive: false }),
      };
      const stored = await vault.load(scope);
      ensureNotCancelled();
      Object.assign(session, this.#restoreSession(stored, session));
      const transport = localOnly ? null : this.#openTransport(session.server);
      let active = true;
      const ensureActive = () => {
        this.#ensureOpen();
        ensureNotCancelled();
        if (!active || this.#session !== session) {
          throw new SyncAccountError("cancelled");
        }
      };
      try {
        let writing = false;
        let refreshing = null;
        const ensureFresh = (force = false) => {
          ensureActive();
          if (refreshing) {
            return refreshing;
          }
          if (!force && !this.#needsRenewal(session) && !this.#recoveryCandidate) {
            return Promise.resolve();
          }
          if (writing) {
            throw new SyncAccountError("busy");
          }
          writing = true;
          refreshing = this.#renewStored(vault, stored, session, transport, null, force)
            .finally(() => { writing = false; refreshing = null; });
          return refreshing;
        };
        if (!localOnly) {
          await ensureFresh();
        }
        ensureActive();
        const writeProtected = async (name, value) => {
          ensureActive();
          if (writing) {
            throw new SyncAccountError("busy");
          }
          writing = true;
          try {
            const data = { ...stored.data, [name]: structuredClone(value) };
            await vault.save(scope, data);
            ensureActive();
            stored.data = data;
          } finally {
            writing = false;
          }
        };
        result = await work(Object.freeze({
          scope, generation: this.#generation, deviceId: session.account.device.id,
          readLocalKeys() {
            ensureActive();
            return structuredClone(stored.data.crypto ?? null);
          },
          async writeLocalKeys(value) {
            await writeProtected("crypto", value);
          },
          readJournalIdentity() {
            ensureActive();
            return structuredClone(stored.data.journal ?? null);
          },
          async writeJournalIdentity(value) {
            if (value?.version !== 1 || !UUID.test(value.store_id) || value.device_id !== session.account.device.id || typeof value.initialized !== "boolean") {
              throw new SyncAccountError("invalid_store_identity");
            }
            await writeProtected("journal", { version: 1, store_id: value.store_id, device_id: value.device_id, initialized: value.initialized });
          },
          request: async (path, options = {}) => {
            const ensureRequestActive = () => {
              ensureActive();
              if (options.signal?.aborted) {
                throw new SyncAccountError("cancelled");
              }
            };
            ensureRequestActive();
            if (localOnly) {
              throw new SyncAccountError("remote_access_unavailable");
            }
            await ensureFresh();
            ensureRequestActive();
            if (Date.parse(session.account.expires_at) <= this.#now()) {
              throw new SyncAccountError("auth_required");
            }
            const attemptedToken = session.token;
            let response;
            try {
              response = await transport.request(path, { ...options, token: attemptedToken });
            } catch (error) {
              ensureRequestActive();
              if (error.code !== "auth_required" || !session.renewal) {
                throw error;
              }
              if (session.token === attemptedToken) {
                await ensureFresh(true);
              } else if (refreshing || this.#recoveryCandidate) {
                await ensureFresh();
              }
              ensureRequestActive();
              response = await transport.request(path, { ...options, token: session.token });
            }
            ensureRequestActive();
            return response;
          },
        }));
        ensureActive();
      } finally {
        active = false;
        if (transport) {
          this.#closeTransport(transport);
        }
      }
    }, false);
    return result;
  }

  close() {
    this.#closed = true;
    this.#authorization?.abort();
    this.#authorization = null;
    this.#session = null;
    this.#recoveryCandidate = null;
    ++this.#generation;
    this.#status = "closed";
    this.#transport?.close();
    this.#transport = null;
    this.#vaultPromise?.then(vault => vault.close(), () => {});
    this.#notify(true);
    this.#listeners.clear();
  }

  async #vault() {
    this.#vaultPromise ??= Promise.resolve().then(() => this.#vaultFactory()).catch(error => {
      this.#vaultPromise = null;
      throw error;
    });
    const vault = await this.#vaultPromise;
    this.#ensureOpen();
    return vault;
  }

  #validateStored(stored, server) {
    const data = stored?.data;
    if (data?.version !== 1 || data.server !== server.baseURL ||
        data.allowLocalHTTP !== server.requiresLoopbackTransport || typeof data.token !== "string" || !TOKEN.test(data.token)) {
      throw new SyncAccountError("account_scope_mismatch");
    }
    const account = validateAccount(data.account, server, null);
    if (stored.scope !== syncAccountScope(server, account.identity.issuer, account.identity.subject)) {
      throw new SyncAccountError("account_scope_mismatch");
    }
    return { token: data.token, account, server, renewal: validateRenewal(data.renewal, account) };
  }

  #restoreSession(stored, session) {
    const saved = this.#validateStored(stored, session.server);
    const matches = expected => expected && saved.token === expected.token &&
      saved.renewal?.token === expected.renewal?.token &&
      (!saved.renewal || Date.parse(saved.renewal.expires_at) === Date.parse(expected.renewal.expires_at)) &&
      Date.parse(saved.account.expires_at) === Date.parse(expected.account.expires_at);
    if (!sameAccount(saved.account, session.account) || (!matches(session) && !matches(this.#recoveryCandidate))) {
      throw new SyncAccountError("account_scope_mismatch");
    }
    return saved;
  }

  #needsRenewal(session) {
    const expires = Date.parse(session.account.expires_at);
    return !!session.renewal && (session.renewal.pending !== null || expires <= this.#now() ||
      (expires < Date.parse(session.renewal.expires_at) && expires - this.#now() <= RENEWAL_WINDOW_MS));
  }

  async #renewStored(vault, stored, session, transport, authentication = null, force = false) {
    if (!session.renewal) {
      if (force) {
        throw new SyncAccountError("auth_required");
      }
      return;
    }
    if (!force && !this.#needsRenewal(session) && !this.#recoveryCandidate) {
      return;
    }
    authentication ??= await this.#authentication(transport, session.server);
    this.#ensureOpen();
    validateIdentity(session.account.identity, session.server, authentication);
    if (!authentication.refresh) {
      throw new SyncAccountError("refresh_unavailable");
    }
    for (let attempt = 0; attempt < 2; ++attempt) {
      if (Date.parse(session.renewal.expires_at) <= this.#now()) {
        throw new SyncAccountError("auth_required");
      }
      if (force || this.#needsRenewal(session)) {
        if (session.renewal.pending === null) {
          const operationId = this.#createId();
          if (typeof operationId !== "string" || !OPERATION_ID.test(operationId)) {
            throw new SyncAccountError("renewal_unavailable");
          }
          const renewal = { ...session.renewal, pending: operationId };
          const data = { ...stored.data, renewal };
          await vault.save(stored.scope, data);
          this.#ensureOpen();
          stored.data = data;
          session.renewal = renewal;
        }
        const { data } = await transport.request("api/v1/auth/refresh", {
          method: "POST", maxBytes: 32768, timeout: 10000,
          body: { refresh_token: session.renewal.token, operation_id: session.renewal.pending },
        });
        this.#ensureOpen();
        const account = validateAccount(data, session.server, authentication);
        const renewal = validateRenewal({ version: data.refresh_version, token: data.refresh_token,
          expires_at: data.refresh_expires_at, pending: null }, account);
        if (data.account_version !== 1 || data.operation_id !== session.renewal.pending ||
            !sameAccount(account, session.account) || Date.parse(renewal.expires_at) !== Date.parse(session.renewal.expires_at) ||
            typeof data.token !== "string" || !/^[a-z0-9]{64}$/i.test(data.token) ||
            data.token === session.token || renewal.token === session.renewal.token ||
            !Number.isInteger(data.expires_in) || data.expires_in < 0 || data.expires_in > 3600) {
          throw new SyncAccountError("invalid_renewal");
        }
        const updated = { ...stored.data, token: data.token, account, renewal };
        this.#recoveryCandidate = { token: data.token, account, renewal };
        await vault.save(stored.scope, updated);
        this.#ensureOpen();
        stored.data = updated;
        Object.assign(session, this.#validateStored(stored, session.server));
      }
      force = false;
      if (Date.parse(session.account.expires_at) > this.#now()) {
        session.account = await this.#verify(transport, session.token, session.server, authentication, session.account);
        this.#ensureOpen();
        this.#recoveryCandidate = null;
        return true;
      }
    }
    throw new SyncAccountError("renewal_pending");
  }

  async #authentication(transport, server) {
    const { data } = await transport.request("api/v1/capabilities", { maxBytes: 32768, timeout: 10000 });
    this.#ensureOpen();
    const { authentication, creditCards } = validateSyncCapabilities(data);
    this.#creditCardsSupported = creditCards;
    if (!authentication?.issuer) {
      throw new SyncAccountError("pairing_unavailable");
    }
    validateIdentity({ issuer: authentication.issuer, subject: "probe", kind: authentication.development ? "development" : "oidc" }, server);
    return authentication;
  }

  async #verify(transport, token, server, authentication, expected) {
    validateIdentity(expected.identity, server, authentication);
    if (Date.parse(expected.expires_at) <= this.#now()) {
      throw new SyncAccountError("auth_required");
    }
    const { data } = await transport.request("api/v1/account", { token, maxBytes: 16384, timeout: 10000 });
    this.#ensureOpen();
    if (data?.account_version !== 1) {
      throw new SyncAccountError("invalid_account");
    }
    const account = validateAccount(data, server, authentication);
    if (!sameAccount(expected, account) || Date.parse(expected.expires_at) !== Date.parse(account.expires_at)) {
      throw new SyncAccountError("account_scope_mismatch");
    }
    if (Date.parse(account.expires_at) <= this.#now()) {
      throw new SyncAccountError("auth_required");
    }
    return account;
  }

  async #revoke(transport, token, refreshProof = null) {
    try {
      const result = await transport.request(refreshProof ? "api/v1/auth/refresh" : "api/v1/auth/token", {
        method: "DELETE", maxBytes: 4096, timeout: 10000,
        ...(refreshProof ? { body: { refresh_token: refreshProof } } : { token }),
      });
      return result.status === 204;
    } catch (error) {
      return !refreshProof && error.code === "auth_required";
    }
  }

  #openTransport(server) {
    this.#ensureOpen();
    this.#transport = this.#transportFactory(server.baseURL, { allowLocalHTTP: server.requiresLoopbackTransport });
    return this.#transport;
  }

  #closeTransport(transport) {
    transport.close();
    if (this.#transport === transport) {
      this.#transport = null;
    }
  }

  async #run(work, reportError = true) {
    await this.initialize();
    this.#begin();
    this.#error = null;
    try {
      await work();
      this.#ensureOpen();
    } catch (error) {
      if (!this.#closed) {
        if (reportError || ["auth_required", "vault_locked", "primary_password_required"].includes(error.code)) {
          this.#error = error.code ?? "account_failed";
        }
        if (error.code === "auth_required") {
          this.#session = null;
          this.#recoveryCandidate = null;
          ++this.#generation;
          this.#status = "expired";
        } else if (!reportError && this.#session && ["vault_locked", "primary_password_required"].includes(error.code)) {
          this.#session = null;
          this.#recoveryCandidate = null;
          ++this.#generation;
          this.#status = "locked";
        }
      }
      throw new SyncAccountError(error.code ?? "account_failed", error);
    } finally {
      this.#finish();
    }
    return this.snapshot;
  }

  #begin(changingServer = false) {
    this.#ensureOpen();
    if (this.#busy || (!changingServer && this.#connection.snapshot.checking)) {
      throw new SyncAccountError("busy");
    }
    this.#busy = true;
    this.#notify();
  }

  #finish() {
    this.#busy = false;
    this.#notify();
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncAccountError("cancelled");
    }
  }

  #notify(force = false) {
    if (this.#closed && !force) {
      return;
    }
    for (const listener of this.#listeners) {
      try {
        listener(this.snapshot);
      } catch {}
    }
  }
}
