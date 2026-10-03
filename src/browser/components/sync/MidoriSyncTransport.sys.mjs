/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NetUtil } from "resource://gre/modules/NetUtil.sys.mjs";
import { normalizeSyncServer } from "./MidoriSyncServerConfig.sys.mjs";

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30000;
const PROTOCOL_ERRORS = new Set([
  "client_upgrade_required", "crypto_state_conflict", "device_required", "incompatible_devices",
  "legacy_migration_required", "legacy_migration_frozen", "native_keys_already_active", "native_keys_required",
  "key_id_exists", "key_capacity_reached", "key_version_exhausted",
  "reset_required", "invalid_cursor",
  "idempotency_conflict", "operation_capacity", "invalid_url", "revision_conflict",
  "refresh_superseded", "refresh_operation_conflict", "refresh_capacity", "refresh_session_capacity",
  "refresh_identity_changed", "native_identity_required", "identity_issuer_mismatch", "invalid_account_identity",
]);

export class SyncRequestError extends Error {
  constructor(code, { status = 0, retryAfter = 0 } = {}) {
    super(code);
    this.name = "SyncRequestError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export class MidoriSyncTransport {
  #pending = new Set();
  #server;
  #closed = false;

  constructor(baseURL, { allowLocalHTTP = false } = {}) {
    this.#server = normalizeSyncServer(baseURL, { allowLocalHTTP });
  }

  close() {
    this.#closed = true;
    for (const cancel of this.#pending) {
      cancel("cancelled");
    }
  }

  async request(path, {
    method = "GET", token = null, body, query, signal,
    maxBytes = MAX_RESPONSE_BYTES, timeout = REQUEST_TIMEOUT_MS,
  } = {}) {
    if (this.#closed || signal?.aborted) {
      throw new SyncRequestError("cancelled");
    }
    if (this.#pending.size >= 4) {
      throw new SyncRequestError("busy");
    }
    if (typeof path !== "string" || !/^[a-z0-9][a-z0-9/_-]*$/i.test(path) ||
        !["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method) ||
        !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_RESPONSE_BYTES ||
        !Number.isInteger(timeout) || timeout < 1 || timeout > REQUEST_TIMEOUT_MS ||
        (token !== null && (typeof token !== "string" || !/^[a-z0-9._~-]{1,4096}$/i.test(token)))) {
      throw new SyncRequestError("invalid_request");
    }
    const url = new URL(path, this.#server.transportBaseURL);
    if (query) {
      url.search = new URLSearchParams(query).toString();
    }
    let payload;
    if (body !== undefined) {
      if (method === "GET") {
        throw new SyncRequestError("invalid_request");
      }
      payload = JSON.stringify(body);
      if (typeof payload !== "string" || new TextEncoder().encode(payload).length > MAX_REQUEST_BYTES) {
        throw new SyncRequestError("request_too_large");
      }
    }
    const channel = this.#createChannel(url);
    channel.requestMethod = method;
    channel.setRequestHeader("Accept", "application/json", false);
    if (token !== null) {
      channel.setRequestHeader("Authorization", `Bearer ${token}`, false);
    }
    if (payload !== undefined) {
      const input = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(Ci.nsIStringInputStream);
      input.setUTF8Data(payload);
      channel.QueryInterface(Ci.nsIUploadChannel2)
        .explicitSetUploadStream(input, "application/json", -1, method);
    }
    return new Promise((resolve, reject) => {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const chunks = [];
      let size = 0;
      let failure = null;
      let settled = false;
      const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      const finish = (error, result) => {
        if (settled) {
          return;
        }
        settled = true;
        timer.cancel();
        signal?.removeEventListener("abort", onAbort);
        this.#pending.delete(cancel);
        chunks.length = 0;
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      };
      const cancel = code => {
        failure ??= new SyncRequestError(code);
        channel.cancel(Cr.NS_BINDING_ABORTED);
        finish(failure);
      };
      const onAbort = () => cancel("cancelled");
      channel.notificationCallbacks = {
        QueryInterface: ChromeUtils.generateQI(["nsIInterfaceRequestor", "nsIChannelEventSink"]),
        getInterface(iid) {
          return this.QueryInterface(iid);
        },
        asyncOnChannelRedirect(_old, _new, _flags, callback) {
          failure = new SyncRequestError("redirect_rejected");
          callback.onRedirectVerifyCallback(Cr.NS_BINDING_ABORTED);
        },
      };
      const listener = {
        QueryInterface: ChromeUtils.generateQI(["nsIStreamListener", "nsIRequestObserver"]),
        onStartRequest() {
          if (settled) {
            return;
          }
          try {
            if (channel.responseStatus >= 300 && channel.responseStatus < 400) {
              cancel("redirect_rejected");
            } else if (channel.contentLength > maxBytes) {
              cancel("response_too_large");
            }
          } catch {
            cancel("network_error");
          }
        },
        onDataAvailable(_request, stream, _offset, count) {
          if (settled) {
            return;
          }
          size += count;
          if (size > maxBytes) {
            cancel("response_too_large");
            return;
          }
          try {
            const input = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
            input.setInputStream(stream);
            chunks.push(decoder.decode(new Uint8Array(input.readByteArray(count)), { stream: true }));
          } catch {
            cancel("invalid_response");
          }
        },
        onStopRequest(_request, status) {
          if (settled) {
            return;
          }
          if (failure || !Components.isSuccessCode(status)) {
            finish(failure ?? new SyncRequestError("network_error"));
            return;
          }
          const httpStatus = channel.responseStatus;
          if (httpStatus < 200 || httpStatus >= 300) {
            let retryAfter = 0;
            try {
              const value = channel.getResponseHeader("Retry-After");
              retryAfter = /^\d+$/.test(value) ? Math.min(Number(value), 86400) : 0;
            } catch {}
            let code = httpStatus === 401 ? "auth_required" :
              httpStatus === 429 ? "rate_limited" :
              httpStatus >= 500 ? "server_error" : "http_error";
            if ([400, 409, 422, 426].includes(httpStatus) && channel.contentType === "application/json") {
              try {
                chunks.push(decoder.decode());
                const protocolError = JSON.parse(chunks.join("")).error;
                if (PROTOCOL_ERRORS.has(protocolError)) {
                  code = protocolError;
                }
              } catch {}
            }
            finish(new SyncRequestError(code, { status: httpStatus, retryAfter }));
            return;
          }
          try {
            chunks.push(decoder.decode());
            if (httpStatus === 204) {
              finish(null, { status: httpStatus, data: null });
              return;
            }
            if (!/^application\/(?:json|[a-z0-9.+-]+\+json)$/i.test(channel.contentType)) {
              throw new Error();
            }
            const data = JSON.parse(chunks.join(""));
            finish(null, { status: httpStatus, data });
          } catch {
            finish(new SyncRequestError("invalid_response"));
          }
        },
      };
      this.#pending.add(cancel);
      signal?.addEventListener("abort", onAbort, { once: true });
      timer.initWithCallback(() => cancel("timeout"), timeout, Ci.nsITimer.TYPE_ONE_SHOT);
      try {
        channel.asyncOpen(listener);
      } catch {
        finish(new SyncRequestError("network_error"));
      }
    });
  }



  watchNotifications(ticket, { onChange, onConnected, signal } = {}) {
    if (this.#closed || signal?.aborted) {
      throw new SyncRequestError("cancelled");
    }
    if (!/^[0-9a-f]{64}$/.test(ticket) || typeof onChange !== "function" ||
        (onConnected !== undefined && typeof onConnected !== "function") || this.#pending.size >= 4) {
      throw new SyncRequestError("invalid_request");
    }
    const url = new URL("api/v1/sync/notifications/stream", this.#server.transportBaseURL);
    const channel = this.#createChannel(url);
    channel.requestMethod = "GET";
    channel.setRequestHeader("Accept", "text/event-stream", false);
    channel.setRequestHeader("Authorization", `MidoriNotification ${ticket}`, false);

    return new Promise((resolve, reject) => {
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      let buffer = "";
      let connected = false;
      let failure = null;
      let settled = false;
      const finish = error => {
        if (settled) {
          return;
        }
        settled = true;
        timer.cancel();
        signal?.removeEventListener("abort", onAbort);
        this.#pending.delete(cancel);
        error ? reject(error) : resolve();
      };
      const cancel = (code, status = 0) => {
        failure ??= new SyncRequestError(code, { status });
        channel.cancel(Cr.NS_BINDING_ABORTED);
        finish(failure);
      };
      const onAbort = () => cancel("cancelled");
      const resetTimer = () => timer.initWithCallback(() => cancel("timeout"), 45000, Ci.nsITimer.TYPE_ONE_SHOT);
      channel.notificationCallbacks = {
        QueryInterface: ChromeUtils.generateQI(["nsIInterfaceRequestor", "nsIChannelEventSink"]),
        getInterface(iid) {
          return this.QueryInterface(iid);
        },
        asyncOnChannelRedirect(_old, _new, _flags, callback) {
          failure = new SyncRequestError("redirect_rejected");
          callback.onRedirectVerifyCallback(Cr.NS_BINDING_ABORTED);
        },
      };
      const listener = {
        QueryInterface: ChromeUtils.generateQI(["nsIStreamListener", "nsIRequestObserver"]),
        onStartRequest() {
          if (settled) {
            return;
          }
          try {
            if (channel.responseStatus !== 200) {
              cancel(channel.responseStatus === 401 ? "auth_required" : "network_error", channel.responseStatus);
            } else if (channel.contentType !== "text/event-stream") {
              cancel("invalid_response");
            }
          } catch {
            cancel("network_error");
          }
        },
        onDataAvailable(_request, stream, _offset, count) {
          if (settled) {
            return;
          }
          try {
            const input = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
            input.setInputStream(stream);
            buffer += decoder.decode(new Uint8Array(input.readByteArray(count)), { stream: true });
            buffer = buffer.replaceAll("\r\n", "\n");
            if (buffer.length > 4096) {
              cancel("response_too_large");
              return;
            }
            let end;
            while ((end = buffer.indexOf("\n\n")) !== -1) {
              const event = buffer.slice(0, end);
              buffer = buffer.slice(end + 2);
              if (!connected && event === ": connected") {
                connected = true;
                onConnected?.();
              }
              if (event.split("\n").includes("event: changed") && event.split("\n").includes("data: {}")) {
                onChange();
              }
            }
            resetTimer();
          } catch {
            cancel("invalid_response");
          }
        },
        onStopRequest(_request, status) {
          if (settled) {
            return;
          }
          finish(failure ?? (Components.isSuccessCode(status) ? null : new SyncRequestError("network_error")));
        },
      };
      this.#pending.add(cancel);
      signal?.addEventListener("abort", onAbort, { once: true });
      resetTimer();
      try {
        channel.asyncOpen(listener);
      } catch {
        finish(new SyncRequestError("network_error"));
      }
    });
  }

  #createChannel(url) {
    let channel = NetUtil.newChannel({
      uri: Services.io.newURI(url.href),
      loadUsingSystemPrincipal: true,
      securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL |
        Ci.nsILoadInfo.SEC_COOKIES_OMIT,
      contentPolicyType: Ci.nsIContentPolicy.TYPE_OTHER,
    });
    if (this.#server.requiresLoopbackTransport) {
      const proxyService = Cc["@mozilla.org/network/protocol-proxy-service;1"]
        .getService(Ci.nsIProtocolProxyService);
      const direct = proxyService.newProxyInfo("direct", "", -1, "", "midori-sync-local", 0, 0, null);
      channel = Services.io.getProtocolHandler("http")
        .QueryInterface(Ci.nsIProxiedProtocolHandler)
        .newProxiedChannel(channel.URI, direct, 0, null, channel.loadInfo);
    }
    channel.loadFlags |= Ci.nsIRequest.LOAD_ANONYMOUS |
      Ci.nsIRequest.LOAD_BYPASS_CACHE | Ci.nsIRequest.INHIBIT_CACHING;
    const internal = channel.QueryInterface(Ci.nsIHttpChannelInternal);
    internal.allowAltSvc = false;
    return channel.QueryInterface(Ci.nsIHttpChannel);
  }
}
