/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { LoginHelper } from "resource://gre/modules/LoginHelper.sys.mjs";
import { SyncProtocolError, validSyncPasswordId, validSyncRecordId } from "./MidoriSyncProtocol.sys.mjs";
import {
  isSyncPasswordIdentityAlias, syncPasswordValueDigest, validSyncPasswordReplacement,
  validateSyncPasswordIdentityAlias, validateSyncPasswordRetirementSnapshot,
} from "./MidoriSyncPasswordIdentity.sys.mjs";

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

/** Synchronizes saved credentials through the native Login Manager. */
export class MidoriSyncPasswords {
  #logins;
  #model;
  #subscriptions = new Set();
  #closed = false;
  #identityAliases;

  constructor({ logins = Services.logins,
    model = Cc["@astian.org/midori-sync-crypto;1"].createInstance(Ci.nsIMidoriSyncCrypto), identityAliases = false } = {}) {
    this.#logins = logins;
    this.#model = model;
    this.#identityAliases = identityAliases === true;
  }

  async flush() {
    this.#ensureOpen();
    const { flushLoginManagerData } = ChromeUtils.importESModule("resource://gre/modules/LoginManager.sys.mjs");
    await flushLoginManagerData(this.#logins);
    this.#ensureOpen();
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
        if (before.guid !== after.guid && validSyncPasswordId(before.guid) && supportedLogin(before)) {
          listener({ id: before.guid });
        }
        login = after;
      } else if (["addLogin", "removeLogin"].includes(type)) {
        login = subject;
      } else {
        return;
      }
      if (validSyncPasswordId(login?.guid) && supportedLogin(login)) {
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
    if (this.#identityAliases && isSyncPasswordIdentityAlias(base)) {
      return current === null;
    }
    return same(current, base);
  }

  validReplacement(id, targetId) {
    return this.#identityAliases ? validSyncPasswordReplacement(id, targetId) :
      validSyncPasswordId(id) && validSyncPasswordId(targetId) && targetId < id;
  }

  isRetired(record) {
    return this.#identityAliases && !record.deleted && isSyncPasswordIdentityAlias(record.value);
  }

  async validate(id, value) {
    this.#ensureOpen();
    if (this.#identityAliases && isSyncPasswordIdentityAlias(value)) {
      return validateSyncPasswordIdentityAlias(id, value);
    }
    if (!validSyncPasswordId(id)) {
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

  async read(id, base = null) {
    this.#ensureOpen();
    if (!validSyncRecordId(id)) {
      throw new SyncProtocolError("invalid_record");
    }
    if (!validSyncPasswordId(id)) {
      return base;
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
      return base;
    }
    return this.validate(id, this.#describe(matches[0]));
  }

  async canDelete(id, base, { record }) {
    await this.validate(id, base);
    let mirror = await record(id);
    if (this.#identityAliases && mirror?.replacementId) {
      const target = await this.#aliasTarget({ targetId: mirror.replacementId, targetRevision: "1" }, record);
      return target.status === "ready" && same(await this.read(target.id), target.remote.deleted ? null : target.remote.value);
    }
    let previousId = id;
    while (mirror?.replacementId) {
      const candidateId = mirror.replacementId;
      if (!this.validReplacement(previousId, candidateId)) {
        throw new SyncProtocolError("password_identity_conflict");
      }
      const current = await this.read(candidateId);
      mirror = await record(candidateId);
      this.#ensureOpen();
      if (current) {
        return Boolean(mirror?.remote && !mirror.remote.deleted && !mirror.pending && !mirror.applying &&
          !mirror.blocked && same(current, mirror.remote.value));
      }
      previousId = candidateId;
    }
    return true;
  }

  async retirementValue(id, base, { record, source = null, pending = false }) {
    if (!this.#identityAliases) {
      return undefined;
    }
    if (pending) {
      return null;
    }
    const mirror = await record(id);
    const original = source ?? mirror?.remote;
    if (!original || original.deleted || isSyncPasswordIdentityAlias(original.value) || !mirror?.replacementId) {
      return null;
    }
    const target = await this.#aliasTarget({ targetId: mirror.replacementId, targetRevision: "1" }, record);
    this.#ensureOpen();
    if (target.status !== "ready" || !same(await this.read(target.id), target.remote.deleted ? null : target.remote.value)) {
      return null;
    }
    const sourceValue = await this.validate(id, original.value ?? base);
    return validateSyncPasswordIdentityAlias(id, {
      version: 2, kind: "identity-alias", targetId: target.id, sourceRevision: original.revision,
      targetRevision: target.remote.revision, sourceDigest: await syncPasswordValueDigest(sourceValue),
      targetDeleted: target.remote.deleted, targetDigest: target.remote.deleted ? null : await syncPasswordValueDigest(target.remote.value),
    });
  }

  async retirementSnapshot(id, value, mirror) {
    if (!this.#identityAliases || !isSyncPasswordIdentityAlias(value)) {
      return undefined;
    }
    const alias = validateSyncPasswordIdentityAlias(id, value);
    if (mirror?.retirementSnapshot) {
      const saved = validateSyncPasswordRetirementSnapshot(id, mirror.retirementSnapshot);
      return { ...saved, targetId: alias.targetId,
        remote: saved.remote ?? (mirror.remote && !mirror.remote.deleted ? mirror.remote : null) };
    }
    return validateSyncPasswordRetirementSnapshot(id, { version: 1, sourceId: id, targetId: alias.targetId,
      remote: mirror?.remote ?? null, native: null });
  }

  async backupReplacement(id, targetId, mirror, incoming, plan) {
    if (!this.#identityAliases) {
      return undefined;
    }
    if (mirror?.retirementSnapshot) {
      return validateSyncPasswordRetirementSnapshot(id, mirror.retirementSnapshot);
    }
    const candidate = id === incoming.id ? incoming : mirror?.remote;
    const remote = candidate && !candidate.deleted && !isSyncPasswordIdentityAlias(candidate.value) ? candidate : null;
    const native = plan.duplicate?.id === id ? plan.duplicate :
      id === plan.id && plan.current ? { id, value: plan.current } : null;
    if (remote === null && native === null) {
      return undefined;
    }
    return validateSyncPasswordRetirementSnapshot(id, { version: 1, sourceId: id, targetId, remote, native });
  }

  async #aliasTarget(alias, record) {
    if (typeof record !== "function") {
      return { status: "waiting" };
    }
    let previous = null;
    let expected = alias;
    for (let depth = 0; depth < 100; ++depth) {
      const id = expected.targetId;
      if (previous !== null && !validSyncPasswordReplacement(previous, id)) {
        throw new SyncProtocolError("invalid_record");
      }
      const mirror = await record(id);
      this.#ensureOpen();
      if (!mirror?.remote || mirror.pending || mirror.blocked || mirror.applying ||
          BigInt(mirror.remote.revision) < BigInt(expected.targetRevision)) {
        return { status: "waiting" };
      }
      const remote = mirror.remote;
      let protectedRecord = remote.authenticatedSchema === 2;
      if (!protectedRecord && typeof remote.payload === "string") {
        try { protectedRecord = JSON.parse(remote.payload).context?.schema_version === 2; } catch {}
      }
      if (!protectedRecord) {
        return { status: "waiting" };
      }
      if (isSyncPasswordIdentityAlias(remote.value)) {
        expected = validateSyncPasswordIdentityAlias(id, remote.value, remote.revision);
        previous = id;
        continue;
      }
      if (!remote.deleted) {
        await this.validate(id, remote.value);
      }
      if (remote.revision === expected.targetRevision && Object.hasOwn(expected, "targetDeleted") &&
          (remote.deleted !== expected.targetDeleted || (!remote.deleted &&
            await syncPasswordValueDigest(remote.value) !== expected.targetDigest))) {
        return { status: "conflict" };
      }
      return { status: "ready", id, remote };
    }
    throw new SyncProtocolError("invalid_record");
  }

  async #prepareAlias(incoming, previous, record) {
    if (incoming.authenticatedSchema !== 2 || incoming.deleted) {
      throw new SyncProtocolError("record_version_unsupported");
    }
    const alias = validateSyncPasswordIdentityAlias(incoming.id, incoming.value, incoming.revision);
    this.#requireUnlocked();
    const matches = await this.#logins.searchLoginsAsync({ guid: incoming.id });
    this.#ensureOpen();
    const source = matches.length === 1 ? this.#describe(matches[0]) : null;
    const target = await this.#aliasTarget(alias, record);
    const decision = matches.length > 1 || (source && (!supportedLogin(matches[0]) ||
      await syncPasswordValueDigest(source) !== alias.sourceDigest)) || target.status === "conflict" ?
      { status: "conflict", reason: "password_identity_conflict" } : target.status !== "ready" ||
        !same(await this.read(target.id), target.remote.deleted ? null : target.remote.value) ?
        { status: "deferred", reason: "password_identity_target_pending" } : { status: "apply" };
    return { version: 2, kind: "identity-alias", id: incoming.id, alias, source, target, decision,
      snapshot: { version: 1, sourceId: incoming.id, targetId: alias.targetId,
        remote: previous && !previous.deleted && !isSyncPasswordIdentityAlias(previous.value) ? previous : null,
        native: source ? { id: incoming.id, value: source } : null } };
  }

  async #applyAlias(plan) {
    const alias = validateSyncPasswordIdentityAlias(plan.id, plan.alias);
    if (!plan.decision || !["apply", "conflict", "deferred"].includes(plan.decision.status)) {
      throw new SyncProtocolError("invalid_record");
    }
    if (plan.decision.status !== "apply") {
      return plan.decision;
    }
    const snapshot = plan.snapshot?.remote !== null || plan.snapshot?.native !== null ?
      validateSyncPasswordRetirementSnapshot(plan.id, plan.snapshot) : undefined;
    if (plan.source && (!snapshot?.native || !same(snapshot.native.value, plan.source))) {
      throw new SyncProtocolError("invalid_record");
    }
    if (!validSyncPasswordId(plan.target?.id) || !plan.target.remote ||
        !same(await this.read(plan.target.id), plan.target.remote.deleted ? null : plan.target.remote.value)) {
      return { status: "deferred", reason: "password_identity_target_pending" };
    }
    this.#requireUnlocked();
    const matches = await this.#logins.searchLoginsAsync({ guid: plan.id });
    this.#ensureOpen();
    if (matches.length > 1 || (matches.length && (!same(this.#describe(matches[0]), plan.source) ||
        await syncPasswordValueDigest(this.#describe(matches[0])) !== alias.sourceDigest))) {
      return { status: "conflict", reason: "password_identity_conflict" };
    }
    if (matches.length) {
      const { removeLoginForSync } = ChromeUtils.importESModule("resource://gre/modules/LoginManager.sys.mjs");
      try {
        await removeLoginForSync(this.#logins, matches[0]);
      } catch (error) {
        this.#ensureOpen();
        if (error.code === "login_identity_changed") {
          this.#requireUnlocked();
          const remaining = await this.#logins.searchLoginsAsync({ guid: plan.id });
          this.#ensureOpen();
          if (remaining.length) {
            return { status: "conflict", reason: "password_identity_conflict" };
          }
        } else {
          throw error;
        }
      }
    }
    this.#ensureOpen();
    return { status: "applied", replacement: { id: plan.id, replacementId: alias.targetId },
      ...(snapshot ? { retirementSnapshot: snapshot } : {}) };
  }

  /**
   * Counts device-bound origins and identities unsupported by native login storage.
   */
  async countUnsupported() {
    this.#ensureOpen();
    this.#requireUnlocked();
    const logins = await this.#logins.getAllLogins();
    this.#ensureOpen();
    return logins.filter(login => !validSyncPasswordId(login.guid) || !supportedLogin(login)).length;
  }

  async listIds() {
    this.#ensureOpen();
    this.#requireUnlocked();
    const logins = await this.#logins.getAllLogins();
    this.#ensureOpen();
    return logins.filter(login => validSyncPasswordId(login.guid) && supportedLogin(login)).map(login => login.guid).sort();
  }

  async plan(incoming, previous = null) {
    this.#ensureOpen();
    incoming = structuredClone(incoming);
    previous = structuredClone(previous);
    if (!validSyncPasswordId(incoming?.id) || typeof incoming.deleted !== "boolean" ||
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

  async prepare(incoming, previous = null, { record, resolution = null } = {}) {
    this.#ensureOpen();
    if (this.#identityAliases && isSyncPasswordIdentityAlias(incoming.value)) {
      return this.#prepareAlias(incoming, previous, record);
    }
    const { current, decision: merged } = await this.plan(incoming, previous);
    if (resolution !== null && !["remote", "merge"].includes(resolution.choice)) {
      throw new SyncProtocolError("invalid_password_decision");
    }
    const decision = resolution === null ? merged : { status: "apply",
      value: incoming.deleted ? null : await this.validate(incoming.id, incoming.value) };
    let duplicate = null;
    let published = false;
    let canonicalId = incoming.id;
    if (current === null && decision.status === "apply" && decision.value) {
      const value = decision.value;
      const logins = await this.#logins.searchLoginsAsync({ origin: value.origin });
      this.#ensureOpen();
      const login = logins.find(candidate => candidate.guid !== incoming.id &&
        candidate.formActionOrigin === value.formActionOrigin && candidate.httpRealm === value.httpRealm &&
        candidate.username === value.username);
      if (login) {
        if (!validSyncRecordId(login.guid)) {
          return { version: 1, id: incoming.id, current, decision: { status: "conflict", reason: "password_identity_conflict" } };
        }
        if (login.password !== value.password) {
          return { version: 1, id: incoming.id, current, decision: { status: "conflict", reason: "password_duplicate_credential" } };
        }
        duplicate = { id: login.guid, value: this.#describe(login) };
        const mirror = validSyncPasswordId(login.guid) ? await record?.(login.guid) : null;
        this.#ensureOpen();
        published = Boolean(mirror?.pending || mirror?.localChange || (mirror?.remote && !mirror.remote.deleted));
        if (published && login.guid < incoming.id) {
          canonicalId = login.guid;
        }
      }
    }
    return { version: 1, id: incoming.id, current, decision, duplicate, canonicalId, published };
  }

  async apply(incoming, previous = null) {
    return this.applyPrepared(await this.prepare(incoming, previous));
  }

  async applyPrepared(plan) {
    this.#ensureOpen();
    plan = structuredClone(plan);
    if (this.#identityAliases && plan?.version === 2 && plan.kind === "identity-alias") {
      return this.#applyAlias(plan);
    }
    if (plan?.version !== 1 || !validSyncPasswordId(plan.id) || !plan.decision ||
        !["apply", "keep_local", "conflict"].includes(plan.decision.status)) {
      throw new SyncProtocolError("invalid_record");
    }
    const { current, decision, duplicate } = plan;
    if (decision.status === "conflict") {
      return decision;
    }
    if (decision.status === "keep_local") {
      return { status: "applied" };
    }
    if (decision.status !== "apply") {
      throw new SyncProtocolError("invalid_password_decision");
    }
    if (current !== null) {
      await this.validate(plan.id, current);
    }
    if (decision.value !== null) {
      decision.value = await this.validate(plan.id, decision.value);
    }
    if (duplicate !== null) {
      return this.#applyDuplicate(plan);
    }
    return this.#write(plan.id, current, decision.value);
  }

  async #applyDuplicate({ id, current, decision, duplicate, canonicalId, published }) {
    if (current !== null || !decision.value || !validSyncRecordId(duplicate?.id) || duplicate.id === id ||
        typeof published !== "boolean" || ![id, duplicate.id].includes(canonicalId) ||
        (!published && canonicalId !== id) || (published && canonicalId !== (id < duplicate.id ? id : duplicate.id))) {
      throw new SyncProtocolError("invalid_record");
    }
    duplicate.value = await this.validate(id, duplicate.value);
    const value = decision.value;
    if (!["origin", "formActionOrigin", "httpRealm", "username", "password"].every(field => duplicate.value[field] === value[field])) {
      throw new SyncProtocolError("invalid_record");
    }
    const incoming = await this.#logins.searchLoginsAsync({ guid: id });
    const existing = await this.#logins.searchLoginsAsync({ guid: duplicate.id });
    this.#ensureOpen();
    if (incoming.length > 1 || existing.length > 1 || (incoming.length && existing.length)) {
      return { status: "conflict", reason: "password_identity_conflict" };
    }
    if (incoming.length) {
      if (canonicalId !== id || !same(this.#describe(incoming[0]), value)) {
        return { status: "conflict", reason: "password_identity_conflict" };
      }
    } else {
      const login = existing[0];
      if (!login || (!same(this.#describe(login), duplicate.value) &&
          !(canonicalId === duplicate.id && same(this.#describe(login), value)))) {
        return { status: "conflict", reason: "password_changed" };
      }
      if (canonicalId !== duplicate.id || !same(this.#describe(login), value)) {
        const result = await this.#modifyLogin(login, canonicalId, value);
        if (result.status !== "applied") {
          return result;
        }
      }
    }
    const otherId = canonicalId === id ? duplicate.id : id;
    if (!same(await this.read(canonicalId), value) || (await this.#logins.searchLoginsAsync({ guid: otherId })).length) {
      return { status: "deferred", reason: "password_changed" };
    }
    return published ? { status: "applied", replacement: { id: otherId, replacementId: canonicalId } } : { status: "applied" };
  }

  async applyConflict(incoming, previous) {
    if (!validSyncPasswordId(incoming?.id)) {
      throw new SyncProtocolError("invalid_record");
    }
    const desired = incoming.deleted ? null : await this.validate(incoming.id, incoming.value);
    const base = previous.deleted ? null : await this.validate(incoming.id, previous.value);
    const current = await this.read(incoming.id);
    if (!same(current, base) && !same(current, desired)) {
      return { status: "conflict", reason: "password_changed" };
    }
    return this.applyPrepared(await this.prepare(incoming, previous, { resolution: { choice: "remote" } }));
  }

  async #write(id, current, value) {
    const matches = await this.#logins.searchLoginsAsync({ guid: id });
    this.#ensureOpen();
    const observed = matches.length === 1 ? this.#describe(matches[0]) : null;
    if (matches.length <= 1 && same(observed, value)) {
      return { status: "applied" };
    }
    if (matches.length > 1 || !same(observed, current)) {
      return { status: "deferred", reason: "password_changed" };
    }
    if (value === null) {
      if (matches.length) {
        const { removeLoginForSync } = ChromeUtils.importESModule("resource://gre/modules/LoginManager.sys.mjs");
        try {
          await removeLoginForSync(this.#logins, matches[0]);
        } catch (error) {
          this.#ensureOpen();
          if (error.code === "login_identity_changed") {
            this.#requireUnlocked();
            const remaining = await this.#logins.searchLoginsAsync({ guid: id });
            this.#ensureOpen();
            return remaining.length ? { status: "conflict", reason: "password_identity_conflict" } : { status: "applied" };
          }
          throw error;
        }
      }
    } else if (matches.length) {
      return this.#modifyLogin(matches[0], id, value);
    } else {
      const duplicates = await this.#logins.searchLoginsAsync({ origin: value.origin });
      this.#ensureOpen();
      const duplicate = duplicates.find(login => login.guid !== id && login.formActionOrigin === value.formActionOrigin &&
        login.httpRealm === value.httpRealm && login.username === value.username);
      if (duplicate) {
        return { status: "conflict", reason: "password_identity_conflict" };
      }
      const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
      login.init(value.origin, value.formActionOrigin, value.httpRealm, value.username, value.password,
        value.usernameField, value.passwordField);
      login.QueryInterface(Ci.nsILoginMetaInfo);
      login.guid = id;
      login.timeCreated = value.timeCreated;
      login.timePasswordChanged = value.timePasswordChanged;
      await this.#logins.addLoginAsync(login);
    }
    this.#ensureOpen();
    return { status: "applied" };
  }

  async #modifyLogin(login, id, value) {
    const bag = Cc["@mozilla.org/hash-property-bag;1"].createInstance(Ci.nsIWritablePropertyBag);
    bag.setProperty("guid", id);
    for (const field of FIELDS) {
      if (field !== "version") {
        bag.setProperty(field, value[field]);
      }
    }
    const { modifyLoginForSync } = ChromeUtils.importESModule("resource://gre/modules/LoginManager.sys.mjs");
    try {
      await modifyLoginForSync(this.#logins, login, bag);
    } catch (error) {
      this.#ensureOpen();
      if (error.code === "login_identity_changed") {
        return { status: "conflict", reason: "password_identity_conflict" };
      }
      throw error;
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
