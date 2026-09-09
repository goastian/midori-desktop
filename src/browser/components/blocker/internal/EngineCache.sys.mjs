/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  CACHE_ROOT_DIR_NAME,
  CUSTOM_FILTERS_FILE_NAME,
} from "resource:///modules/MidoriBlockerUtils.sys.mjs";
import { ListCatalog } from "resource:///modules/internal/ListCatalog.sys.mjs";

const ENGINE_CACHE_NAME_RE = /^adblock-engine\..+\.cache$/;
const CACHE_META_NAME_RE = /^cache-meta\..+\.json$/;
const PREF_FILTER_LIST_URLS = "midori.blocker.filterListUrls";
const PREF_ENABLED_LISTS = "midori.blocker.enabledLists";
const PREF_CUSTOM_FILTERS_ENABLED = "midori.blocker.customFiltersEnabled";
export const CACHE_FORMAT_VERSION = 3;
export const ENGINE_IMPLEMENTATION_VERSION = "adblock-rs-0.13.2-midori-1";

export function engineCacheFileName(
  configurationHash = engineConfigurationHash()
) {
  return `adblock-engine.v${CACHE_FORMAT_VERSION}.${ENGINE_IMPLEMENTATION_VERSION}.${configurationHash}.${Services.appinfo.appBuildID}.cache`;
}

export function cacheMetaFileName(
  configurationHash = engineConfigurationHash()
) {
  return `cache-meta.v${CACHE_FORMAT_VERSION}.${ENGINE_IMPLEMENTATION_VERSION}.${configurationHash}.${Services.appinfo.appBuildID}.json`;
}

function bytesToHex(binaryString) {
  let out = "";
  for (let i = 0; i < binaryString.length; i++) {
    out += `0${binaryString.charCodeAt(i).toString(16)}`.slice(-2);
  }
  return out;
}

function customFiltersFileState() {
  try {
    const file = Services.dirsvc.get("ProfD", Ci.nsIFile);
    file.append(CACHE_ROOT_DIR_NAME);
    file.append(CUSTOM_FILTERS_FILE_NAME);
    return file.exists() ? `${file.fileSize}:${file.lastModifiedTime}` : "";
  } catch (_) {
    return "";
  }
}

export function engineConfigurationHash() {
  const configuration = JSON.stringify([
    Services.locale.appLocaleAsBCP47 || "",
    Services.prefs.getStringPref(PREF_FILTER_LIST_URLS, ""),
    Services.prefs.getStringPref(PREF_ENABLED_LISTS, "{}"),
    Services.prefs.getBoolPref(PREF_CUSTOM_FILTERS_ENABLED, true),
    customFiltersFileState(),
  ]);
  const hasher = Cc["@mozilla.org/security/hash;1"].createInstance(
    Ci.nsICryptoHash
  );
  hasher.init(hasher.SHA256);
  const bytes = new TextEncoder().encode(configuration);
  hasher.update(bytes, bytes.length);
  return bytesToHex(hasher.finish(false));
}

function nowISO() {
  return new Date().toISOString();
}

function cacheRootPath() {
  const f = Services.dirsvc.get("ProfD", Ci.nsIFile);
  f.append(CACHE_ROOT_DIR_NAME);
  return f.path;
}

function engineCachePath(configurationHash = engineConfigurationHash()) {
  const f = Services.dirsvc.get("ProfD", Ci.nsIFile);
  f.append(CACHE_ROOT_DIR_NAME);
  f.append(engineCacheFileName(configurationHash));
  return f.path;
}

function cacheMetaPath(configurationHash = engineConfigurationHash()) {
  const f = Services.dirsvc.get("ProfD", Ci.nsIFile);
  f.append(CACHE_ROOT_DIR_NAME);
  f.append(cacheMetaFileName(configurationHash));
  return f.path;
}

function atomicWriteOptions(path) {
  return { tmpPath: `${path}.tmp` };
}

let gCacheWriteChain = Promise.resolve();

function withCacheWriteLock(task) {
  const run = gCacheWriteChain.catch(() => {}).then(task);
  gCacheWriteChain = run.catch(() => {});
  return run;
}

async function clearCacheFiles(configurationHash = engineConfigurationHash()) {
  try {
    await IOUtils.remove(engineCachePath(configurationHash), {
      ignoreAbsent: true,
    });
  } catch (err) {
    console.warn("[MidoriBlocker] Failed removing engine cache file:", err);
  }

  try {
    await IOUtils.remove(cacheMetaPath(configurationHash), {
      ignoreAbsent: true,
    });
  } catch (err) {
    console.warn("[MidoriBlocker] Failed removing cache metadata file:", err);
  }
}

function computeListsHash(descriptors, listRecords) {
  const makeRecordKey = (url, filename) => JSON.stringify([url, filename]);
  const byKey = new Map(
    listRecords.map(record => [
      makeRecordKey(record.url, record.filename),
      record,
    ])
  );
  const descriptorKeys = new Set();

  const hasher = Cc["@mozilla.org/security/hash;1"].createInstance(
    Ci.nsICryptoHash
  );
  hasher.init(hasher.SHA256);

  const encoder = new TextEncoder();
  const separatorBytes = encoder.encode("\n---\n");
  const updateHash = (url, filename, content) => {
    const descriptorBytes = encoder.encode(`${url}\n${filename}\n`);
    hasher.update(descriptorBytes, descriptorBytes.length);

    const contentBytes = encoder.encode(content);
    hasher.update(contentBytes, contentBytes.length);
    hasher.update(separatorBytes, separatorBytes.length);
  };

  for (const descriptor of descriptors) {
    const key = makeRecordKey(descriptor.url, descriptor.filename);
    descriptorKeys.add(key);
    updateHash(descriptor.url, descriptor.filename, byKey.get(key)?.text ?? "");
  }

  const extraRecordKeys = Array.from(byKey.keys())
    .filter(key => !descriptorKeys.has(key))
    .sort();
  for (const key of extraRecordKeys) {
    const record = byKey.get(key);
    updateHash(record.url, record.filename, record.text ?? "");
  }

  return bytesToHex(hasher.finish(false));
}

async function readJSON(path, fallbackValue) {
  try {
    const bytes = await IOUtils.read(path);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    if (err?.result !== Cr.NS_ERROR_FILE_NOT_FOUND) {
      console.warn(`[MidoriBlocker] Failed reading JSON ${path}:`, err);
    }
    return fallbackValue;
  }
}

async function writeJSON(path, value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  await IOUtils.write(path, bytes, atomicWriteOptions(path));
}

export const EngineCache = {
  async clear() {
    return withCacheWriteLock(clearCacheFiles);
  },

  async cleanupStale() {
    await gCacheWriteChain.catch(() => {});
    const root = cacheRootPath();
    if (!(await IOUtils.exists(root))) {
      return;
    }

    const keep = new Set([engineCacheFileName(), cacheMetaFileName()]);
    for (const path of await IOUtils.getChildren(root)) {
      const name = path.split(/[\\/]/).pop();
      if (keep.has(name)) {
        continue;
      }

      if (ENGINE_CACHE_NAME_RE.test(name) || CACHE_META_NAME_RE.test(name)) {
        await IOUtils.remove(path, { ignoreAbsent: true });
      }
    }
  },

  async ensureRootDir() {
    await IOUtils.makeDirectory(cacheRootPath(), {
      createAncestors: true,
      ignoreExisting: true,
    });
  },

  async matchesCurrentLists(descriptors, listRecords) {
    await gCacheWriteChain.catch(() => {});
    if (
      !listRecords.length ||
      !ListCatalog.hasAllBundledListRecords(descriptors, listRecords)
    ) {
      return false;
    }

    const configurationHash = engineConfigurationHash();
    const dataPath = engineCachePath(configurationHash);
    const metadataPath = cacheMetaPath(configurationHash);
    if (
      !(await IOUtils.exists(dataPath)) ||
      !(await IOUtils.exists(metadataPath))
    ) {
      return false;
    }

    const cacheMeta = await readJSON(metadataPath, null);
    if (
      cacheMeta?.formatVersion !== CACHE_FORMAT_VERSION ||
      cacheMeta?.engineVersion !== ENGINE_IMPLEMENTATION_VERSION ||
      cacheMeta?.configurationHash !== configurationHash ||
      configurationHash !== engineConfigurationHash() ||
      !cacheMeta?.listsHash
    ) {
      return false;
    }

    return computeListsHash(descriptors, listRecords) === cacheMeta.listsHash;
  },

  async read() {
    await gCacheWriteChain.catch(() => {});
    const configurationHash = engineConfigurationHash();
    return IOUtils.read(engineCachePath(configurationHash));
  },

  readSync() {
    const configurationHash = engineConfigurationHash();
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(engineCachePath(configurationHash));
    if (!file.exists() || file.fileSize === 0) {
      return null;
    }

    const stream = Cc[
      "@mozilla.org/network/file-input-stream;1"
    ].createInstance(Ci.nsIFileInputStream);
    stream.init(file, 0x01 /* PR_RDONLY */, 0, 0);
    try {
      const binaryStream = Cc[
        "@mozilla.org/binaryinputstream;1"
      ].createInstance(Ci.nsIBinaryInputStream);
      binaryStream.setInputStream(stream);
      return binaryStream.readByteArray(file.fileSize);
    } finally {
      stream.close();
    }
  },

  async write(engine, descriptors, listRecords) {
    return withCacheWriteLock(async () => {
      const configurationHash = engineConfigurationHash();
      if (!engine) {
        return false;
      }

      if (!ListCatalog.hasAllBundledListRecords(descriptors, listRecords)) {
        await clearCacheFiles(configurationHash);
        return false;
      }

      await this.ensureRootDir();

      const serialized = engine.serialize();
      const bytes =
        serialized instanceof Uint8Array
          ? serialized
          : new Uint8Array(serialized);
      const path = engineCachePath(configurationHash);
      await IOUtils.write(path, bytes, atomicWriteOptions(path));

      const listsHash = computeListsHash(descriptors, listRecords);
      await writeJSON(cacheMetaPath(configurationHash), {
        configurationHash,
        createdAt: nowISO(),
        engineVersion: ENGINE_IMPLEMENTATION_VERSION,
        formatVersion: CACHE_FORMAT_VERSION,
        listsHash,
      });
      return true;
    });
  },
};
