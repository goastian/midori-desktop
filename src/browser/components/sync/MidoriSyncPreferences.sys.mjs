/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";

export const SYNC_PREFERENCE_SPECS = Object.freeze({
  "midori.tabs.show.close": { type: "bool" },
  "midori.tabs.show.new": { type: "bool" },
  "midori.workspaces.enabled": { type: "bool" },
  "midori.workspaces.show-button": { type: "bool" },
  "midori.workspaces.show-name": { type: "bool" },
  "midori.workspaces.unloadInactive": { type: "bool" },
  "midori.workspaces.unloadDelayMs": { type: "int", min: 5000, max: 1800000 },
  "midori.workspaces.chromeTint": { type: "bool" },
  "midori.verticaltabs.enabled": { type: "bool" },
  "midori.verticaltabs.position": { type: "string", values: ["left", "right"] },
  "midori.verticaltabs.width": { type: "int", min: 120, max: 600 },
  "midori.verticaltabs.density": { type: "string", values: ["compact", "normal", "comfortable"] },
});

export function validateSyncPreference(id, value) {
  if (!Object.hasOwn(SYNC_PREFERENCE_SPECS, id) || value?.version !== 1 || value.name !== id ||
      Object.keys(value).length !== 3 || !["version", "name", "value"].every(key => Object.hasOwn(value, key))) {
    throw new SyncProtocolError("invalid_record");
  }
  const spec = SYNC_PREFERENCE_SPECS[id];
  const actual = value.value;
  if (spec.type === "bool" ? typeof actual !== "boolean" :
      spec.type === "int" ? !Number.isSafeInteger(actual) || actual < spec.min || actual > spec.max :
        typeof actual !== "string" || !spec.values.includes(actual)) {
    throw new SyncProtocolError("invalid_record");
  }
  return value;
}

export class MidoriSyncPreferences {
  #prefs;
  #closed = false;

  constructor({ prefs = Services.prefs } = {}) {
    this.#prefs = prefs;
  }

  read(id, base = null) {
    this.#ensureOpen();
    if (!Object.hasOwn(SYNC_PREFERENCE_SPECS, id)) {
      throw new SyncProtocolError("invalid_record");
    }
    const spec = SYNC_PREFERENCE_SPECS[id];
    if (this.#prefs.prefIsLocked(id)) {
      return base;
    }
    if (!this.#prefs.prefHasUserValue(id)) {
      return null;
    }
    try {
      const value = spec.type === "bool" ? this.#prefs.getBoolPref(id) :
        spec.type === "int" ? this.#prefs.getIntPref(id) : this.#prefs.getStringPref(id);
      return validateSyncPreference(id, { version: 1, name: id, value });
    } catch {
      throw new SyncProtocolError("invalid_local_preference");
    }
  }

  validate(id, value) {
    this.#ensureOpen();
    return validateSyncPreference(id, value);
  }

  matchesLocal(_id, current, base) {
    return JSON.stringify(current) === JSON.stringify(base);
  }

  apply(incoming, previous = null) {
    this.#ensureOpen();
    const id = incoming.id;
    if (!Object.hasOwn(SYNC_PREFERENCE_SPECS, id)) {
      throw new SyncProtocolError("invalid_record");
    }
    if (this.#prefs.prefIsLocked(id)) {
      return { status: "conflict", reason: "preference_locked" };
    }
    const remote = incoming.deleted ? null : this.validate(id, incoming.value);
    const base = previous === null || previous.deleted ? null : this.validate(id, previous.value);
    const current = this.read(id);
    if (this.matchesLocal(id, current, remote)) {
      return { status: "applied" };
    }
    if (!this.matchesLocal(id, current, base)) {
      return { status: "conflict", reason: "local_preference_changed" };
    }
    if (remote === null) {
      this.#prefs.clearUserPref(id);
    } else {
      const spec = SYNC_PREFERENCE_SPECS[id];
      if (spec.type === "bool") {
        this.#prefs.setBoolPref(id, remote.value);
      } else if (spec.type === "int") {
        this.#prefs.setIntPref(id, remote.value);
      } else {
        this.#prefs.setStringPref(id, remote.value);
      }
    }
    return { status: "applied" };
  }

  close() {
    this.#closed = true;
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncProtocolError("cancelled");
    }
  }
}
