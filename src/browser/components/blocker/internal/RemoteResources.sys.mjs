/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  ListStore: "resource:///modules/internal/ListStore.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const PREF_REMOTE_RESOURCES_ENABLED = "midori.blocker.remoteResourcesEnabled";

// 4 MB ceiling per bundle. The worker outputs are well under 1 MB today; this
// guards against a runaway response masquerading as a valid payload.
export const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;
export const MAX_BUNDLE_ENTRIES = 2048;
const MAX_RESOURCE_ALIASES = 64;
const MAX_RESOURCE_NAME_LENGTH = 256;
export const REMOTE_RESOURCE_FETCH_TIMEOUT_MS = 30 * 1000;
export const REMOTE_RESOURCE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const REMOTE_RESOURCE_RETRY_INITIAL_MS = 15 * 60 * 1000;
export const REMOTE_RESOURCE_RETRY_MAX_MS = 24 * 60 * 60 * 1000;
const REDIRECT_RESOURCE_MIME_TYPES = new Set([
  "application/javascript",
  "application/json",
  "audio/mp3",
  "image/gif",
  "image/png",
  "text/css",
  "text/html",
  "text/javascript",
  "text/plain",
  "text/xml",
  "video/mp4",
]);

const REMOTE_BUNDLES = Object.freeze([
  Object.freeze({
    name: "ubo-scriptlets",
    url: "https://update.astian.org/v2/blocker/ubo-scriptlets.json",
    bundledUrl:
      "resource://midori/blocker/assets/resources/ubo-scriptlets.json",
  }),
  Object.freeze({
    name: "resources",
    url: "https://update.astian.org/v2/blocker/resources.json",
    bundledUrl: "resource://midori/blocker/assets/resources/resources.json",
  }),
]);

function isRemoteEnabled() {
  return Services.prefs.getBoolPref(PREF_REMOTE_RESOURCES_ENABLED, false);
}

export function computeRemoteResourceRetryDelay(
  failureCount,
  random = Math.random
) {
  const exponent = Math.max(0, Math.min(16, Number(failureCount) - 1));
  const baseDelay = Math.min(
    REMOTE_RESOURCE_RETRY_MAX_MS,
    REMOTE_RESOURCE_RETRY_INITIAL_MS * 2 ** exponent
  );
  const jitter = 0.8 + Math.max(0, Math.min(1, Number(random()))) * 0.4;
  return Math.round(baseDelay * jitter);
}

export function shouldRefreshRemoteResource(meta, now, force = false) {
  if (force || !meta) {
    return true;
  }

  const nextAttempt = Number(meta.nextAttempt || 0);
  if (nextAttempt > 0) {
    return now >= nextAttempt;
  }

  const lastFetched = Number(meta.lastFetched || 0);
  return (
    !lastFetched || now - lastFetched >= REMOTE_RESOURCE_REFRESH_INTERVAL_MS
  );
}

export function validateBundleText(text) {
  if (new TextEncoder().encode(text).length > MAX_BUNDLE_BYTES) {
    throw new Error(`bundle exceeds ${MAX_BUNDLE_BYTES} bytes`);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`JSON parse failed: ${err?.message || err}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error("bundle is not an array");
  }
  if (parsed.length > MAX_BUNDLE_ENTRIES) {
    throw new Error(`bundle exceeds ${MAX_BUNDLE_ENTRIES} entries`);
  }

  const identifiers = new Set();
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") {
      throw new Error("bundle entry is not an object");
    }
    if (
      typeof entry.name !== "string" ||
      !entry.name ||
      entry.name.length > MAX_RESOURCE_NAME_LENGTH
    ) {
      throw new Error("bundle entry missing string `name`");
    }
    if (typeof entry.content !== "string") {
      throw new Error(`entry "${entry.name}" missing string \`content\``);
    }
    const mime = entry.kind?.mime;
    if (!REDIRECT_RESOURCE_MIME_TYPES.has(mime)) {
      throw new Error(
        `entry "${entry.name}" has unsupported kind.mime: ${mime}`
      );
    }

    const aliases = entry.aliases ?? [];
    if (!Array.isArray(aliases) || aliases.length > MAX_RESOURCE_ALIASES) {
      throw new Error(`entry "${entry.name}" has invalid aliases`);
    }
    for (const identifier of [entry.name, ...aliases]) {
      if (
        typeof identifier !== "string" ||
        !identifier ||
        identifier.length > MAX_RESOURCE_NAME_LENGTH
      ) {
        throw new Error(`entry "${entry.name}" has an invalid identifier`);
      }
      if (identifiers.has(identifier)) {
        throw new Error(`duplicate resource identifier: ${identifier}`);
      }
      identifiers.add(identifier);
    }
  }

  return parsed;
}

function assertBundleContentLength(response) {
  const rawLength = response.headers.get("Content-Length");
  if (rawLength === null) {
    return;
  }

  const normalizedLength = rawLength.trim();
  if (
    /^\d+$/.test(normalizedLength) &&
    Number(normalizedLength) > MAX_BUNDLE_BYTES
  ) {
    throw new Error(`bundle exceeds ${MAX_BUNDLE_BYTES} bytes`);
  }
}

export async function readBundleResponseText(response) {
  assertBundleContentLength(response);

  if (!response.body?.getReader) {
    const text = await response.text();
    if (new TextEncoder().encode(text).length > MAX_BUNDLE_BYTES) {
      throw new Error(`bundle exceeds ${MAX_BUNDLE_BYTES} bytes`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      byteLength += value?.byteLength || 0;
      if (byteLength > MAX_BUNDLE_BYTES) {
        throw new Error(`bundle exceeds ${MAX_BUNDLE_BYTES} bytes`);
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } catch (err) {
    try {
      await reader.cancel(err);
    } catch (_) {}
    throw err;
  }

  return chunks.join("");
}

async function readMetaSafely(metaPath) {
  return lazy.ListStore.readJSON(metaPath, null);
}

async function writeMeta(metaPath, meta) {
  try {
    await lazy.ListStore.writeJSON(metaPath, meta);
  } catch (err) {
    console.warn(
      `[MidoriBlocker] Failed writing remote-resource meta ${metaPath}:`,
      err
    );
  }
}

async function hasUsableRemoteBundle(filePath) {
  if (!(await IOUtils.exists(filePath))) {
    return false;
  }

  try {
    const text = await lazy.ListStore.readText(filePath);
    validateBundleText(text);
    return true;
  } catch (_) {
    return false;
  }
}

export async function fetchBundle(
  bundle,
  previousEtag,
  fetchImpl = fetch,
  timeoutMs = REMOTE_RESOURCE_FETCH_TIMEOUT_MS
) {
  const headers = new Headers();
  if (previousEtag) {
    headers.set("If-None-Match", previousEtag);
  }

  const controller = new AbortController();
  const timeoutId = lazy.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(bundle.url, {
      cache: "no-store",
      credentials: "omit",
      headers,
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });

    if (response.status === 304) {
      if (!previousEtag) {
        throw new Error("HTTP 304 received without a cache validator");
      }
      return { notModified: true };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      etag: response.headers.get("ETag") || "",
      notModified: false,
      text: await readBundleResponseText(response),
    };
  } finally {
    lazy.clearTimeout(timeoutId);
  }
}

async function refreshOneBundle(
  bundle,
  { force = false, now = Date.now(), random = Math.random } = {}
) {
  const filePath = lazy.ListStore.remoteResourceFilePath(bundle.name);
  const metaPath = lazy.ListStore.remoteResourceMetaPath(bundle.name);
  const previous = (await readMetaSafely(metaPath)) || {
    etag: "",
    lastError: "",
    lastFetched: 0,
  };

  if (!shouldRefreshRemoteResource(previous, now, force)) {
    return { attempted: false, failed: false };
  }

  const nextMeta = {
    etag: previous.etag || "",
    failureCount: 0,
    lastAttempt: now,
    lastError: "",
    lastFetched: previous.lastFetched || 0,
    nextAttempt: now + REMOTE_RESOURCE_REFRESH_INTERVAL_MS,
  };

  try {
    const canUseConditional = await hasUsableRemoteBundle(filePath);
    if (!canUseConditional) {
      nextMeta.etag = "";
    }
    const result = await fetchBundle(
      bundle,
      canUseConditional ? previous.etag : ""
    );

    if (result.notModified) {
      nextMeta.lastFetched = now;
      await writeMeta(metaPath, nextMeta);
      return { attempted: true, failed: false };
    }

    validateBundleText(result.text);

    await lazy.ListStore.ensureRootDir();
    await lazy.ListStore.writeText(filePath, result.text);

    nextMeta.etag = result.etag || "";
    nextMeta.lastFetched = now;
    await writeMeta(metaPath, nextMeta);
    return { attempted: true, failed: false };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err || "unknown error");
    nextMeta.lastError = message.slice(0, 500);
    nextMeta.failureCount = Number(previous.failureCount || 0) + 1;
    nextMeta.nextAttempt =
      now + computeRemoteResourceRetryDelay(nextMeta.failureCount, random);
    console.warn(
      `[MidoriBlocker] Failed to refresh remote bundle "${bundle.name}":`,
      err
    );
    await writeMeta(metaPath, nextMeta);
    return { attempted: true, failed: true };
  }
}

async function readBundledArray(bundledUrl) {
  try {
    const response = await fetch(bundledUrl, { cache: "no-store" });
    if (!response.ok) {
      return [];
    }
    const parsed = JSON.parse(await response.text());
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(
      `[MidoriBlocker] Failed reading bundled resource ${bundledUrl}:`,
      err
    );
    return [];
  }
}

async function readRemoteArray(bundle) {
  const filePath = lazy.ListStore.remoteResourceFilePath(bundle.name);
  if (!(await IOUtils.exists(filePath))) {
    return null;
  }

  try {
    const text = await lazy.ListStore.readText(filePath);
    if (!text) {
      return null;
    }
    return validateBundleText(text);
  } catch (err) {
    console.warn(
      `[MidoriBlocker] Stored remote bundle "${bundle.name}" is invalid, falling back to bundled copy:`,
      err
    );
    return null;
  }
}

export const RemoteResources = {
  REMOTE_BUNDLES,

  async refresh({ force = false, now = Date.now, random = Math.random } = {}) {
    if (!isRemoteEnabled()) {
      return { attemptedCount: 0, failedCount: 0 };
    }

    const timestamp = now();
    let attemptedCount = 0;
    let failedCount = 0;
    for (const bundle of REMOTE_BUNDLES) {
      try {
        const result = await refreshOneBundle(bundle, {
          force,
          now: timestamp,
          random,
        });
        attemptedCount += result.attempted ? 1 : 0;
        failedCount += result.failed ? 1 : 0;
      } catch (err) {
        // refreshOneBundle handles its own errors. This is a safety net so
        // one bad bundle never aborts the rest.
        console.warn(
          `[MidoriBlocker] Unexpected error refreshing "${bundle.name}":`,
          err
        );
        attemptedCount++;
        failedCount++;
      }
    }
    return { attemptedCount, failedCount };
  },

  async readMergedResources() {
    const remoteEnabled = isRemoteEnabled();
    const merged = [];

    for (const bundle of REMOTE_BUNDLES) {
      let entries = null;
      if (remoteEnabled) {
        entries = await readRemoteArray(bundle);
      }
      if (!entries) {
        entries = await readBundledArray(bundle.bundledUrl);
      }
      if (entries.length) {
        merged.push(...entries);
      }
    }

    return merged;
  },
};
