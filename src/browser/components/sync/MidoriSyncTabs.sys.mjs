/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SYNC_STORE_UUID } from "./MidoriSyncLocalCodec.sys.mjs";
import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";

const encoder = new TextEncoder();
const MAX_TABS = 200;
const MAX_SNAPSHOT_BYTES = 160000;
const LIFETIME_MS = 7 * 86400000;
const REFRESH_MS = 86400000;

function cleanTitle(value, limit = 256) {
  const parts = [];
  let length = 0;
  for (const character of typeof value === "string" ? value.slice(0, 512) : "") {
    if (length + character.length > limit) {
      break;
    }
    parts.push(/[\p{Cc}\p{Cs}]/u.test(character) ? " " : character);
    length += character.length;
  }
  return parts.join("");
}

function validURL(value) {
  if (typeof value !== "string" || encoder.encode(value).length > 2048) {
    return false;
  }
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.href === value && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateTabsSnapshot(id, value) {
  const updated = Date.parse(value?.updated_at);
  const expires = Date.parse(value?.expires_at);
  if (!SYNC_STORE_UUID.test(id) || value?.version !== 1 || value.device_id !== id ||
      typeof value.device_name !== "string" || value.device_name.length > 80 ||
      /[\p{Cc}\p{Cs}]/u.test(value.device_name) ||
      !Number.isSafeInteger(updated) || !Number.isSafeInteger(expires) || expires - updated !== LIFETIME_MS ||
      new Date(updated).toISOString() !== value.updated_at || new Date(expires).toISOString() !== value.expires_at ||
      !Array.isArray(value.tabs) || value.tabs.length > MAX_TABS ||
      !Number.isSafeInteger(value.omitted) || value.omitted < 0 || value.omitted > 100000 ||
      value.tabs.some(tab => !validURL(tab?.url) || typeof tab.title !== "string" || tab.title.length > 256 ||
        /[\p{Cc}\p{Cs}]/u.test(tab.title)) ||
      encoder.encode(JSON.stringify(value)).length > MAX_SNAPSHOT_BYTES + 4096) {
    throw new SyncProtocolError("invalid_record");
  }
  return value;
}

export class MidoriSyncTabs {
  #deviceId;
  #deviceName;
  #windows;
  #isPrivate;
  #now;
  #closed = false;

  constructor({ deviceId, deviceName, windows = () => Services.wm.getEnumerator("navigator:browser"),
    isPrivate = win => ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs")
      .PrivateBrowsingUtils.isWindowPrivate(win), now = Date.now }) {
    if (!SYNC_STORE_UUID.test(deviceId)) {
      throw new SyncProtocolError("invalid_record");
    }
    this.#deviceId = deviceId;
    this.#deviceName = cleanTitle(deviceName, 80);
    this.#windows = windows;
    this.#isPrivate = isPrivate;
    this.#now = now;
  }

  snapshot() {
    this.#ensureOpen();
    const tabs = [];
    let omitted = 0;
    let bytes = 0;
    for (const win of this.#windows()) {
      if (!win.gBrowser || this.#isPrivate(win)) {
        continue;
      }
      for (const tab of win.gBrowser.tabs) {
        if (tab.closing) {
          continue;
        }
        const url = tab.linkedBrowser?.currentURI?.spec;
        if (!validURL(url)) {
          continue;
        }
        const entry = { url, title: cleanTitle(tab.label) };
        const size = encoder.encode(JSON.stringify(entry)).length;
        if (tabs.length >= MAX_TABS || bytes + size > MAX_SNAPSHOT_BYTES) {
          omitted = Math.min(omitted + 1, 100000);
        } else {
          tabs.push(entry);
          bytes += size;
        }
      }
    }
    return { tabs, omitted };
  }

  async read(id, base = null) {
    this.#ensureOpen();
    if (id !== this.#deviceId) {
      throw new SyncProtocolError("invalid_record");
    }
    const current = this.snapshot();
    const now = Math.floor(this.#now() / 1000) * 1000;
    if (base && JSON.stringify({ tabs: base.tabs, omitted: base.omitted }) === JSON.stringify(current) &&
        now - Date.parse(base.updated_at) < REFRESH_MS) {
      return base;
    }
    return this.validate(id, { version: 1, device_id: id, device_name: this.#deviceName,
      updated_at: new Date(now).toISOString(), expires_at: new Date(now + LIFETIME_MS).toISOString(), ...current });
  }

  validate(id, value) {
    this.#ensureOpen();
    return validateTabsSnapshot(id, value);
  }

  matchesLocal(_id, current, base) {
    return JSON.stringify(current) === JSON.stringify(base);
  }

  ttlOf(value) {
    return value.expires_at;
  }

  async apply() {
    this.#ensureOpen();
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
