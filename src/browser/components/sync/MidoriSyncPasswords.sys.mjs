/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { LoginHelper } from "resource://gre/modules/LoginHelper.sys.mjs";
import { SyncProtocolError, validSyncRecordId } from "./MidoriSyncProtocol.sys.mjs";

const encoder = new TextEncoder();
const FIELDS = ["version", "origin", "formActionOrigin", "httpRealm", "username", "password",
  "usernameField", "passwordField", "timeCreated", "timePasswordChanged"];
const TOPIC = "passwordmgr-storage-changed";

function allowedOrigin(value) {
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol) && parsed.origin === value &&
      !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function supportedLogin(login) {
  return allowedOrigin(login.origin) &&
    ((login.formActionOrigin !== null && login.httpRealm === null &&
      (login.formActionOrigin === "" || allowedOrigin(login.formActionOrigin))) ||
      (login.formActionOrigin === null && login.httpRealm !== null));
}

function same(left, right) {
  return left === null || right === null ? left === right : FIELDS.every(field => left[field] === right[field]);
}

export class MidoriSyncPasswords {
  #logins;
  #model;
  #subscriptions = new Set();
  #closed = false;

  constructor({ logins = Services.logins,
    model = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto) } = {}) {
    this.#logins = logins;
    this.#model = model;
  }

  observe(listener) {
    this.#ensureOpen();
    const callback = (subject, _topic, type) => {
      if (this.#closed) {
        return;
      }
      if (["importLogins", "removeAllLogins"].includes(type)) {
        listener({ rescan: true });
        return;
      }
      let login;
      if (type === "modifyLogin") {
        const changes = subject.QueryInterface(Ci.nsIArrayExtensions);
        const before = changes.GetElementAt(0);
        const after = changes.GetElementAt(1);
        if (before.guid === after.guid && same(this.#describe(before), this.#describe(after))) {
          return;
        }
        if (before.guid !== after.guid && validSyncRecordId(before.guid) && supportedLogin(before)) {
          listener({ id: before.guid });
        }
        login = after;
      } else if (["addLogin", "removeLogin"].includes(type)) {
        login = subject;
      } else {
        return;
      }
      if (validSyncRecordId(login?.guid) && supportedLogin(login)) {
        listener({ id: login.guid });
      }
    };
    Services.obs.addObserver(callback, TOPIC);
    const unsubscribe = () => {
      if (this.#subscriptions.delete(unsubscribe)) {
        Services.obs.removeObserver(callback, TOPIC);
      }
    };
    this.#subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  matchesLocal(_id, current, base) {
    return same(current, base);
  }

  async validate(id, value) {
    this.#ensureOpen();
    if (!validSyncRecordId(id)) {
      throw new SyncProtocolError("invalid_record");
    }
    const canonical = await this.#process({ action: "validate", value });
    if (!allowedOrigin(canonical.origin) ||
        (canonical.formActionOrigin !== null && canonical.formActionOrigin !== "" &&
          !allowedOrigin(canonical.formActionOrigin))) {
      throw new SyncProtocolError("invalid_record");
    }
    return canonical;
  }

  async read(id) {
    this.#ensureOpen();
    if (!validSyncRecordId(id)) {
      throw new SyncProtocolError("invalid_record");
    }
    this.#requireUnlocked();
    const matches = await this.#logins.searchLoginsAsync({ guid: id });
    this.#ensureOpen();
    if (!matches.length) {
      return null;
    }
    if (matches.length !== 1) {
      throw new SyncProtocolError("password_identity_conflict");
    }
    if (!supportedLogin(matches[0])) {
      return null;
    }
    return this.validate(id, this.#describe(matches[0]));
  }

  async listIds() {
    this.#ensureOpen();
    this.#requireUnlocked();
    const logins = await this.#logins.getAllLogins();
    this.#ensureOpen();
    return logins.filter(login => validSyncRecordId(login.guid) && supportedLogin(login)).map(login => login.guid).sort();
  }

  async plan(incoming, previous = null) {
    this.#ensureOpen();
    incoming = structuredClone(incoming);
    previous = structuredClone(previous);
    if (typeof incoming?.id !== "string" || typeof incoming.deleted !== "boolean" ||
        (previous !== null && (typeof previous.deleted !== "boolean" ||
          (previous.id !== undefined && previous.id !== incoming.id)))) {
      throw new SyncProtocolError("invalid_record");
    }
    const remote = incoming.deleted ? null : await this.validate(incoming.id, incoming.value);
    const base = previous === null || previous.deleted ? null : await this.validate(incoming.id, previous.value);
    const current = await this.read(incoming.id);
    const decision = await this.#process({ action: "merge", base, local: current, remote });
    return { current, decision };
  }

  async apply(incoming, previous = null) {
    this.#ensureOpen();
    const { current, decision } = await this.plan(incoming, previous);
    if (decision.status === "conflict") {
      return decision;
    }
    if (decision.status === "keep_local") {
      return { status: "applied" };
    }
    if (decision.status !== "apply") {
      throw new SyncProtocolError("invalid_password_decision");
    }
    const matches = await this.#logins.searchLoginsAsync({ guid: incoming.id });
    this.#ensureOpen();
    if (matches.length > 1 || !same(matches.length ? this.#describe(matches[0]) : null, current)) {
      return { status: "deferred", reason: "password_changed" };
    }
    if (decision.value === null) {
      if (matches.length) {
        await this.#logins.removeLoginAsync(matches[0]);
      }
    } else if (matches.length) {
      const bag = Cc["@mozilla.org/hash-property-bag;1"].createInstance(Ci.nsIWritablePropertyBag);
      for (const field of FIELDS) {
        if (field !== "version") {
          bag.setProperty(field, decision.value[field]);
        }
      }
      await this.#logins.modifyLoginAsync(matches[0], bag);
    } else {
      const value = decision.value;
      const duplicates = await this.#logins.searchLoginsAsync({ origin: value.origin });
      this.#ensureOpen();
      if (duplicates.some(login => login.guid !== incoming.id && login.formActionOrigin === value.formActionOrigin &&
          login.httpRealm === value.httpRealm && login.username === value.username)) {
        return { status: "conflict", reason: "password_duplicate_credential" };
      }
      const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
      login.init(value.origin, value.formActionOrigin, value.httpRealm, value.username, value.password,
        value.usernameField, value.passwordField);
      login.QueryInterface(Ci.nsILoginMetaInfo);
      login.guid = incoming.id;
      login.timeCreated = value.timeCreated;
      login.timePasswordChanged = value.timePasswordChanged;
      await this.#logins.addLoginAsync(login);
    }
    this.#ensureOpen();
    return { status: "applied" };
  }

  #describe(login) {
    return { version: 1, origin: login.origin, formActionOrigin: login.formActionOrigin,
      httpRealm: login.httpRealm, username: login.username, password: login.password,
      usernameField: login.usernameField, passwordField: login.passwordField,
      timeCreated: login.timeCreated, timePasswordChanged: login.timePasswordChanged };
  }

  #requireUnlocked() {
    if (LoginHelper.isPrimaryPasswordSet() && !this.#logins.isLoggedIn) {
      throw new SyncProtocolError("passwords_locked");
    }
  }

  async #process(request) {
    this.#ensureOpen();
    const bytes = encoder.encode(JSON.stringify(request));
    try {
      if (bytes.length > 786432) {
        throw new SyncProtocolError("record_too_large");
      }
      const response = await this.#model.processPassword(bytes);
      this.#ensureOpen();
      return JSON.parse(response);
    } catch (error) {
      if (error.result === Cr.NS_ERROR_INVALID_ARG) {
        throw new SyncProtocolError("invalid_record");
      }
      throw error;
    } finally {
      bytes.fill(0);
    }
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncProtocolError("cancelled");
    }
  }

  close() {
    this.#closed = true;
    for (const unsubscribe of this.#subscriptions) {
      unsubscribe();
    }
    this.#model.close();
  }
}
