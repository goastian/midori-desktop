/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";

const FIELDS = ["name", "icon"];
const TOPIC = "midori-workspace-catalog-changed";
const equal = (left, right) => left === null || right === null ? left === right :
  FIELDS.every(field => left[field] === right[field]);

/** Synchronizes portable metadata through the native workspace catalog. */
export class MidoriSyncWorkspaces {
  #workspaces;
  #schema;
  #observers;
  #subscriptions = new Set();
  #closed = false;

  constructor({ workspaces = null, schema = null, observers = null } = {}) {
    this.#workspaces = workspaces ?? ChromeUtils.importESModule(new URL("./MidoriWorkspaces.sys.mjs", import.meta.url).href).MidoriWorkspaces;
    this.#schema = schema ?? ChromeUtils.importESModule(new URL("./MidoriWorkspaceCatalog.sys.mjs", import.meta.url).href);
    this.#observers = observers ?? Services.obs;
  }

  validate(id, value) {
    this.#ensureOpen();
    try {
      return this.#schema.validateWorkspaceSyncValue(id, value);
    } catch {
      throw new SyncProtocolError("invalid_record");
    }
  }

  matchesLocal(_id, current, base) {
    return equal(current, base);
  }

  async read(id) {
    this.#requireId(id);
    const catalog = await this.#workspaces.readSyncCatalog();
    this.#ensureOpen();
    return catalog.records[id] ? this.validate(id, catalog.records[id]) : null;
  }

  async listIds() {
    this.#ensureOpen();
    const catalog = await this.#workspaces.readSyncCatalog();
    this.#ensureOpen();
    for (const [id, value] of Object.entries(catalog.records)) {
      this.validate(id, value);
    }
    return Object.keys(catalog.records).sort();
  }

  async canDelete(id) {
    this.#requireId(id);
    const catalog = await this.#workspaces.readSyncCatalog();
    this.#ensureOpen();
    return catalog.deleted.includes(id);
  }

  observe(listener) {
    this.#ensureOpen();
    const observer = (_subject, _topic, action) => {
      if (!this.#closed && ["publish", "delete"].includes(action)) {
        listener({ rescan: true });
      }
    };
    this.#observers.addObserver(observer, TOPIC);
    const unsubscribe = () => {
      if (this.#subscriptions.delete(unsubscribe)) {
        this.#observers.removeObserver(observer, TOPIC);
      }
    };
    this.#subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  async plan(incoming, previous = null) {
    this.#requireId(incoming?.id);
    if (typeof incoming.deleted !== "boolean" || (previous !== null &&
        (typeof previous.deleted !== "boolean" || (previous.id !== undefined && previous.id !== incoming.id)))) {
      throw new SyncProtocolError("invalid_record");
    }
    const remote = incoming.deleted ? null : this.validate(incoming.id, incoming.value);
    const base = previous === null || previous.deleted ? null : this.validate(incoming.id, previous.value);
    const current = await this.read(incoming.id);
    if (previous === null && current === null && remote !== null && await this.canDelete(incoming.id)) {
      return { current, decision: { status: "conflict", reason: "deletion_edit" } };
    }
    if (equal(current, remote) || (previous !== null && equal(remote, base))) {
      return { current, decision: { status: "keep_local" } };
    }
    if (equal(current, base)) {
      return { current, decision: { status: "apply", value: remote } };
    }
    if (!current || !remote || !base) {
      return { current, decision: { status: "conflict", reason: !base ? "workspace_identity_conflict" : "deletion_edit" } };
    }
    const merged = { version: 1 };
    for (const field of FIELDS) {
      if (current[field] === remote[field] || remote[field] === base[field]) {
        merged[field] = current[field];
      } else if (current[field] === base[field]) {
        merged[field] = remote[field];
      } else {
        return { current, decision: { status: "conflict", reason: "workspace_field_conflict" } };
      }
    }
    return { current, decision: equal(current, merged) ? { status: "keep_local" } : { status: "apply", value: merged } };
  }

  async prepare(incoming, previous = null, { resolution = null } = {}) {
    const { current, decision } = await this.plan(incoming, previous);
    const force = resolution?.choice === "remote";
    const desired = decision.status === "apply" ? decision.value : current;
    const usage = await this.#workspaces.syncWorkspaceUsage(incoming.id);
    if (decision.status !== "conflict") {
      const reason = await this.#workspaces.checkSyncWorkspace(incoming.id, desired, force);
      if (reason) {
        return { version: 1, id: incoming.id, current, usage, force, decision: { status: "conflict", reason } };
      }
    }
    this.#ensureOpen();
    return { version: 1, id: incoming.id, current, usage, force, decision };
  }

  async apply(incoming, previous = null) {
    return this.applyPrepared(await this.prepare(incoming, previous));
  }

  async applyPrepared(plan) {
    this.#requireId(plan?.id);
    if (plan.version !== 1 || typeof plan.force !== "boolean" || !Array.isArray(plan.usage) ||
        !["apply", "keep_local", "conflict"].includes(plan.decision?.status)) {
      throw new SyncProtocolError("invalid_workspace_plan");
    }
    if (plan.decision.status === "conflict") {
      return plan.decision;
    }
    const current = plan.current === null ? null : this.validate(plan.id, plan.current);
    let desired = current;
    if (plan.decision.status === "apply") {
      desired = plan.decision.value === null ? null : this.validate(plan.id, plan.decision.value);
    }
    const outcome = await this.#workspaces.applySyncWorkspace(plan.id, desired,
      { current, usage: plan.usage, force: plan.force });
    this.#ensureOpen();
    return outcome;
  }

  close() {
    this.#closed = true;
    for (const unsubscribe of [...this.#subscriptions]) {
      unsubscribe();
    }
  }

  #requireId(id) {
    this.#ensureOpen();
    if (!this.#schema.validWorkspaceSyncId(id)) {
      throw new SyncProtocolError("invalid_record");
    }
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncProtocolError("cancelled");
    }
  }
}
