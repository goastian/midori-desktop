/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SYNC_STORE_UUID } from "./MidoriSyncLocalCodec.sys.mjs";
import { SyncProtocolError } from "./MidoriSyncProtocol.sys.mjs";

const encoder = new TextEncoder();
const MAX_FRAGMENT_TABS = 200;
const MAX_FRAGMENT_BYTES = 160000;
const MAX_FRAGMENTS = 50;
const MAX_WINDOWS = 64;
const MAX_TABS = MAX_FRAGMENT_TABS * MAX_FRAGMENTS;
const MAX_SNAPSHOT_BYTES = 160000;
const LIFETIME_MS = 7 * 86400000;
const REFRESH_MS = 86400000;
const FRAGMENT_ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(0|[1-9][0-9]?)$/;

export function tabsFragmentId(deviceId, index) {
  return `${deviceId}:${index}`;
}

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

function cleanLabel(value, limit = 64) {
  const label = cleanTitle(value, limit).trim();
  return label || null;
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

function validLabel(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 64 && !/[\p{Cc}\p{Cs}]/u.test(value);
}

function validTimes(value) {
  const updated = Date.parse(value?.updated_at);
  const expires = Date.parse(value?.expires_at);
  return Number.isSafeInteger(updated) && Number.isSafeInteger(expires) && expires - updated === LIFETIME_MS &&
    new Date(updated).toISOString() === value.updated_at && new Date(expires).toISOString() === value.expires_at;
}

function validDeviceName(value) {
  return typeof value === "string" && value.length <= 80 && !/[\p{Cc}\p{Cs}]/u.test(value);
}

export function validateTabsSnapshot(id, value) {
  if (!SYNC_STORE_UUID.test(id) || value?.version !== 1 || value.device_id !== id ||
      !validDeviceName(value.device_name) || !validTimes(value) ||
      !Array.isArray(value.tabs) || value.tabs.length > MAX_FRAGMENT_TABS ||
      !Number.isSafeInteger(value.omitted) || value.omitted < 0 || value.omitted > 100000 ||
      value.tabs.some(tab => !validURL(tab?.url) || typeof tab.title !== "string" || tab.title.length > 256 ||
        /[\p{Cc}\p{Cs}]/u.test(tab.title)) ||
      encoder.encode(JSON.stringify(value)).length > MAX_SNAPSHOT_BYTES + 4096) {
    throw new SyncProtocolError("invalid_record");
  }
  return value;
}

function validTab(tab) {
  return validURL(tab?.url) && typeof tab.title === "string" && tab.title.length <= 256 &&
    !/[\p{Cc}\p{Cs}]/u.test(tab.title) &&
    Number.isInteger(tab.window) && tab.window >= 0 && tab.window < MAX_WINDOWS &&
    Number.isInteger(tab.index) && tab.index >= 0 && tab.index <= 100000 &&
    typeof tab.pinned === "boolean" &&
    (tab.group === null || (validLabel(tab.group?.id) && (tab.group.label === null || validLabel(tab.group.label)))) &&
    (tab.workspace === null || validLabel(tab.workspace));
}

function validateManifest(id, value) {
  if (!SYNC_STORE_UUID.test(id) || value?.version !== 2 || value.device_id !== id ||
      !validDeviceName(value.device_name) || !validTimes(value) ||
      !Number.isSafeInteger(value.tab_count) || value.tab_count < 0 || value.tab_count > MAX_TABS ||
      !Number.isSafeInteger(value.omitted) || value.omitted < 0 || value.omitted > 1000000 ||
      !Array.isArray(value.fragments) || value.fragments.length > MAX_FRAGMENTS ||
      value.fragments.some(fragment => !/^[0-9a-f]{64}$/.test(fragment?.digest) ||
        !Number.isSafeInteger(fragment.count) || fragment.count < 1 || fragment.count > MAX_FRAGMENT_TABS) ||
      value.fragments.reduce((sum, fragment) => sum + fragment.count, 0) !== value.tab_count ||
      !Array.isArray(value.windows) || value.windows.length > MAX_WINDOWS ||
      value.windows.some((window, index) => window?.id !== index || !Number.isSafeInteger(window.tabs) || window.tabs < 1 ||
        window.tabs > MAX_TABS) ||
      value.windows.reduce((sum, window) => sum + window.tabs, 0) !== value.tab_count) {
    throw new SyncProtocolError("invalid_record");
  }
  return value;
}

function validateFragment(id, value) {
  const match = FRAGMENT_ID.exec(id);
  if (!match || !SYNC_STORE_UUID.test(match[1]) || value?.version !== 2 || value.device_id !== match[1] ||
      value.index !== Number(match[2]) || value.index >= MAX_FRAGMENTS || !validTimes(value) ||
      !Array.isArray(value.tabs) || !value.tabs.length || value.tabs.length > MAX_FRAGMENT_TABS ||
      !value.tabs.every(validTab) || encoder.encode(JSON.stringify(value)).length > MAX_FRAGMENT_BYTES + 8192) {
    throw new SyncProtocolError("invalid_record");
  }
  return value;
}

export function validateTabsRecord(id, value) {
  if (FRAGMENT_ID.test(id)) {
    return validateFragment(id, value);
  }
  return value?.version === 1 ? validateTabsSnapshot(id, value) : validateManifest(id, value);
}

/**
 * Reassembles a remote device from its manifest and fragments. Returns null when any fragment is
 * missing, stale or fails its digest, so a half-uploaded snapshot is never presented as complete.
 */
export async function assembleTabsSnapshot(manifest, fragmentAt, digest, now = Date.now()) {
  if (manifest.version === 1) {
    return { ...manifest, windows: [{ id: 0, tabs: manifest.tabs.length }], tabs: manifest.tabs.map((tab, index) => ({
      ...tab, window: 0, index, pinned: false, group: null, workspace: null })) };
  }
  const tabs = [];
  for (let index = 0; index < manifest.fragments.length; index++) {
    const fragment = fragmentAt(index);
    if (!fragment || Date.parse(fragment.expires_at) <= now ||
        await digest(fragment.tabs) !== manifest.fragments[index].digest) {
      return null;
    }
    tabs.push(...fragment.tabs);
  }
  tabs.sort((left, right) => left.window - right.window || left.index - right.index);
  return { ...manifest, tabs };
}

export async function defaultTabsDigest(tabs) {
  const bytes = encoder.encode(JSON.stringify(tabs));
  const hash = Cc["@mozilla.org/security/hash;1"].createInstance(Ci.nsICryptoHash);
  hash.init(Ci.nsICryptoHash.SHA256);
  hash.update(bytes, bytes.length);
  return Array.from(hash.finish(false), byte => byte.charCodeAt(0).toString(16).padStart(2, "0")).join("");
}

export class MidoriSyncTabs {
  #deviceId;
  #deviceName;
  #windows;
  #isPrivate;
  #now;
  #digest;
  #workspaceId;
  #capture = null;
  #closed = false;

  constructor({ deviceId, deviceName, windows = () => Services.wm.getEnumerator("navigator:browser"),
    isPrivate = win => ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs")
      .PrivateBrowsingUtils.isWindowPrivate(win), now = Date.now, digest = defaultTabsDigest,
    workspaceId = (win, id) => id ? ChromeUtils.importESModule(new URL("./MidoriWorkspaces.sys.mjs", import.meta.url).href)
      .MidoriWorkspaces.workspaceSyncId(win, id) : null }) {
    if (!SYNC_STORE_UUID.test(deviceId)) {
      throw new SyncProtocolError("invalid_record");
    }
    this.#deviceId = deviceId;
    this.#deviceName = cleanTitle(deviceName, 80);
    this.#windows = windows;
    this.#isPrivate = isPrivate;
    this.#now = now;
    this.#digest = digest;
    this.#workspaceId = workspaceId;
  }

  get manifestId() {
    return this.#deviceId;
  }

  snapshot() {
    this.#ensureOpen();
    const tabs = [];
    const windows = [];
    let omitted = 0;
    for (const win of this.#windows()) {
      if (!win.gBrowser || this.#isPrivate(win)) {
        continue;
      }
      let index = 0;
      const entries = [];
      for (const tab of win.gBrowser.tabs) {
        if (tab.closing) {
          continue;
        }
        const url = tab.linkedBrowser?.currentURI?.spec;
        if (!validURL(url)) {
          continue;
        }
        if (tabs.length + entries.length >= MAX_TABS || windows.length >= MAX_WINDOWS) {
          omitted = Math.min(omitted + 1, 1000000);
          continue;
        }
        entries.push({ url, title: cleanTitle(tab.label), window: windows.length, index: index++,
          pinned: tab.pinned === true,
          group: tab.group?.id ? { id: cleanLabel(String(tab.group.id)) ?? "group", label: cleanLabel(tab.group.label) } : null,
          workspace: cleanLabel(this.#workspaceId(win, tab.getAttribute?.("midori-workspace-id"))) });
      }
      if (entries.length) {
        windows.push({ id: windows.length, tabs: entries.length });
        tabs.push(...entries);
      }
    }
    return { tabs, windows, omitted };
  }

  /**
   * Computes one consistent snapshot and returns every record id to capture: stale fragments first
   * (so they are deleted), then the current fragments, and the manifest last.
   */
  async beginCapture({ previous = null } = {}) {
    this.#ensureOpen();
    const { tabs, windows, omitted } = this.snapshot();
    const now = Math.floor(this.#now() / 1000) * 1000;
    const times = { updated_at: new Date(now).toISOString(), expires_at: new Date(now + LIFETIME_MS).toISOString() };
    const chunks = [];
    let current = [];
    let bytes = 0;
    for (const tab of tabs) {
      const size = encoder.encode(JSON.stringify(tab)).length;
      if (current.length && (current.length >= MAX_FRAGMENT_TABS || bytes + size > MAX_FRAGMENT_BYTES)) {
        chunks.push(current);
        current = [];
        bytes = 0;
      }
      current.push(tab);
      bytes += size;
    }
    if (current.length) {
      chunks.push(current);
    }
    const fragments = new Map();
    const digests = [];
    for (let index = 0; index < chunks.length; index++) {
      digests.push({ digest: await this.#digest(chunks[index]), count: chunks[index].length });
      fragments.set(tabsFragmentId(this.#deviceId, index), { version: 2, device_id: this.#deviceId, index, ...times,
        tabs: chunks[index] });
    }
    const manifest = { version: 2, device_id: this.#deviceId, device_name: this.#deviceName, ...times,
      tab_count: tabs.length, omitted, windows, fragments: digests };
    this.#capture = { manifest, fragments };
    const previousCount = previous?.version === 2 ? previous.fragments.length : 0;
    const ids = [];
    for (let index = 0; index < Math.max(chunks.length, previousCount); index++) {
      ids.push(tabsFragmentId(this.#deviceId, index));
    }
    ids.push(this.#deviceId);
    return ids;
  }

  async read(id, base = null) {
    this.#ensureOpen();
    const fragment = FRAGMENT_ID.exec(id);
    if (id !== this.#deviceId && !(fragment && fragment[1] === this.#deviceId)) {
      throw new SyncProtocolError("invalid_record");
    }
    if (!this.#capture) {
      await this.beginCapture({ previous: id === this.#deviceId ? base : null });
    }
    const { manifest, fragments } = this.#capture;
    const now = Math.floor(this.#now() / 1000) * 1000;
    const fresh = base && now - Date.parse(base.updated_at) < REFRESH_MS;
    if (id === this.#deviceId) {
      if (fresh && base.version === 2 && JSON.stringify({ ...base, updated_at: 0, expires_at: 0 }) ===
          JSON.stringify({ ...manifest, updated_at: 0, expires_at: 0 })) {
        return base;
      }
      return this.validate(id, manifest);
    }
    const current = fragments.get(id) ?? null;
    if (current === null) {
      return null;
    }
    if (fresh && base.version === 2 && JSON.stringify(base.tabs) === JSON.stringify(current.tabs)) {
      return base;
    }
    return this.validate(id, current);
  }

  endCapture() {
    this.#capture = null;
  }

  validate(id, value) {
    this.#ensureOpen();
    return validateTabsRecord(id, value);
  }

  matchesLocal(_id, current, base) {
    return JSON.stringify(current) === JSON.stringify(base);
  }

  conflictValue(value) {
    return value === null ? null : { ...value, updated_at: 0, expires_at: 0 };
  }

  canResolveConflict(choice, id) {
    return choice === "local" && (id === this.#deviceId || FRAGMENT_ID.exec(id)?.[1] === this.#deviceId);
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
    this.#capture = null;
  }

  #ensureOpen() {
    if (this.#closed) {
      throw new SyncProtocolError("cancelled");
    }
  }
}
