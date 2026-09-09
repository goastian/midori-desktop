/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  ListCatalog: "resource:///modules/internal/ListCatalog.sys.mjs",
  ListStore: "resource:///modules/internal/ListStore.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

// easylist.txt is about 2.2 MiB today; 8 MiB leaves room for list growth.
export const MAX_LIST_BYTES = 8 * 1024 * 1024;
export const MAX_LIST_LINE_LENGTH = 64 * 1024;
export const LIST_FETCH_TIMEOUT_MS = 30 * 1000;
export const LIST_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const LIST_RETRY_INITIAL_MS = 15 * 60 * 1000;
export const LIST_RETRY_MAX_MS = 24 * 60 * 60 * 1000;

export function computeListRetryDelay(failureCount, random = Math.random) {
  const exponent = Math.max(0, Math.min(16, Number(failureCount) - 1));
  const baseDelay = Math.min(
    LIST_RETRY_MAX_MS,
    LIST_RETRY_INITIAL_MS * 2 ** exponent
  );
  const jitter = 0.8 + Math.max(0, Math.min(1, Number(random()))) * 0.4;
  return Math.round(baseDelay * jitter);
}

export function shouldFetchList(metadataEntry, now, force = false) {
  if (force || !metadataEntry) {
    return true;
  }

  const nextAttempt = Number(metadataEntry.nextAttempt || 0);
  if (nextAttempt > 0) {
    return now >= nextAttempt;
  }

  const lastFetched = Number(metadataEntry.lastFetched || 0);
  return !lastFetched || now - lastFetched >= LIST_REFRESH_INTERVAL_MS;
}

function assertListTextLength(text) {
  if (new TextEncoder().encode(text).length > MAX_LIST_BYTES) {
    throw new Error(`Fetched list exceeds ${MAX_LIST_BYTES} bytes`);
  }
}

function assertListContentLength(response) {
  const rawLength = response.headers.get("Content-Length");
  if (rawLength === null) {
    return;
  }

  const normalizedLength = rawLength.trim();
  if (!/^\d+$/.test(normalizedLength)) {
    return;
  }

  const length = Number(normalizedLength);
  if (length > MAX_LIST_BYTES) {
    throw new Error(`Fetched list exceeds ${MAX_LIST_BYTES} bytes`);
  }
}

export function validateFetchedList(response, text) {
  const contentType = String(response.headers.get("Content-Type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType === "text/html" || contentType === "application/xhtml+xml") {
    throw new Error(`Unexpected filter list content type: ${contentType}`);
  }

  if (text.includes("\0")) {
    throw new Error("Fetched list contains null bytes");
  }

  const prefix = text.trimStart().slice(0, 256).toLowerCase();
  if (prefix.startsWith("<!doctype html") || prefix.startsWith("<html")) {
    throw new Error("Fetched list contains an HTML document");
  }

  let hasRule = false;
  let lineStart = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i !== text.length && text.charCodeAt(i) !== 0x0a) {
      continue;
    }

    const lineLength = i - lineStart;
    if (lineLength > MAX_LIST_LINE_LENGTH) {
      throw new Error(
        `Fetched list line exceeds ${MAX_LIST_LINE_LENGTH} characters`
      );
    }
    if (!hasRule) {
      const line = text.slice(lineStart, i).trim();
      hasRule = !!line && !line.startsWith("!") && !line.startsWith("[");
    }
    lineStart = i + 1;
  }

  if (!hasRule) {
    throw new Error("Fetched list contained no filter rules");
  }
}

export function getListFetchRedirectMode(descriptor) {
  if (lazy.ListCatalog.isCatalogListDescriptor(descriptor)) {
    return "follow";
  }
  return "manual";
}

export function assertListFetchResponseOk(response, descriptor, redirectMode) {
  if (response.ok) {
    return;
  }

  if (
    redirectMode === "manual" &&
    (response.type === "opaqueredirect" || response.status === 0)
  ) {
    const message = lazy.ListCatalog.isCustomListUrlDescriptor(descriptor)
      ? "custom list URL redirected; redirects are not followed"
      : "list URL redirected; redirects are not followed";
    throw new Error(message);
  }

  throw new Error(`HTTP ${response.status}`);
}

function assertSecureFinalUrl(response) {
  if (!response.url) {
    return;
  }

  let url;
  try {
    url = new URL(response.url);
  } catch (_) {
    throw new Error("list response URL was invalid");
  }

  if (url.protocol !== "https:") {
    throw new Error("list response redirected outside HTTPS");
  }
}

export async function readListResponseText(response) {
  assertListContentLength(response);

  if (!response.body?.getReader) {
    const text = await response.text();
    assertListTextLength(text);
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
      if (byteLength > MAX_LIST_BYTES) {
        throw new Error(`Fetched list exceeds ${MAX_LIST_BYTES} bytes`);
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

async function hasUsableStoredListFile(filename) {
  const path = lazy.ListStore.listPath(filename);
  if (!(await IOUtils.exists(path))) {
    return false;
  }

  try {
    return !!(await lazy.ListStore.readText(path)).trim();
  } catch (_) {
    return false;
  }
}

export async function fetchList(
  descriptor,
  metadataEntry,
  conditional,
  redirectMode = "manual",
  fetchImpl = fetch,
  timeoutMs = LIST_FETCH_TIMEOUT_MS
) {
  const headers = new Headers();
  let sentValidator = false;

  if (conditional && metadataEntry?.etag) {
    headers.set("If-None-Match", metadataEntry.etag);
    sentValidator = true;
  }
  if (conditional && metadataEntry?.lastModified) {
    headers.set("If-Modified-Since", metadataEntry.lastModified);
    sentValidator = true;
  }

  const controller = new AbortController();
  const timeoutId = lazy.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(descriptor.url, {
      cache: "no-store",
      credentials: "omit",
      headers,
      redirect: redirectMode,
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    assertSecureFinalUrl(response);

    if (response.status === 304) {
      if (!sentValidator) {
        throw new Error(
          "Unexpected 304 response to unconditional list request"
        );
      }
      return { notModified: true };
    }

    assertListFetchResponseOk(response, descriptor, redirectMode);

    const text = await readListResponseText(response);
    if (!text || !text.trim()) {
      throw new Error("Fetched list was empty");
    }
    validateFetchedList(response, text);

    return {
      etag: response.headers.get("ETag") || "",
      lastModified: response.headers.get("Last-Modified") || "",
      notModified: false,
      text,
    };
  } finally {
    lazy.clearTimeout(timeoutId);
  }
}

/**
 * Tracks list refresh runs so only one update pass is in flight at a time.
 */
export class ListUpdatesState {
  constructor({ fetchImpl = fetch, now = Date.now, random = Math.random } = {}) {
    this._fetchImpl = fetchImpl;
    this._now = now;
    this._random = random;
    this._updateInProgress = false;
  }

  async updateIfNeeded({ force = false } = {}) {
    if (this._updateInProgress) {
      return null;
    }

    this._updateInProgress = true;
    try {
      return await lazy.ListStore.withListWriteLock(async () => {
        const descriptors = await lazy.ListCatalog.getListDescriptors();
        const metadataPath = lazy.ListStore.listsMetadataPath();

        await lazy.ListStore.ensureListsDir();

        const meta = await lazy.ListStore.readJSON(metadataPath, { lists: [] });
        const oldByUrl = new Map(
          (meta?.lists || []).map(entry => [String(entry.url), entry])
        );

        const now = this._now();
        let metadataChanged = false;
        let anyUpdated = false;
        let attemptedCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        const nextEntries = [];

        for (const descriptor of descriptors) {
          if (lazy.ListCatalog.isCustomFiltersDescriptor(descriptor)) {
            continue;
          }

          const oldEntry = oldByUrl.get(descriptor.url) || null;
          const listPath = lazy.ListStore.listPath(descriptor.filename);

          const nextEntry = oldEntry
            ? {
                ...oldEntry,
                filename: descriptor.filename,
                lastAttempt: now,
                lastError: "",
                url: descriptor.url,
              }
            : {
                etag: "",
                filename: descriptor.filename,
                lastAttempt: now,
                lastError: "",
                lastFetched: 0,
                lastModified: "",
                url: descriptor.url,
              };
          const isCustomList =
            lazy.ListCatalog.isCustomListUrlDescriptor(descriptor);
          const previousFilename = isCustomList
            ? String(oldEntry?.filename || "")
            : descriptor.filename;
          const hasLegacyCustomFilename =
            isCustomList &&
            previousFilename !== descriptor.filename &&
            lazy.ListCatalog.isLegacyCustomListFilename(previousFilename);

          const hasStoredFile = await hasUsableStoredListFile(
            descriptor.filename
          );
          if (
            !hasLegacyCustomFilename &&
            (hasStoredFile || oldEntry?.lastError) &&
            !shouldFetchList(oldEntry, now, force)
          ) {
            skippedCount++;
            nextEntries.push({
              ...oldEntry,
              filename: descriptor.filename,
              url: descriptor.url,
            });
            continue;
          }

          attemptedCount++;
          metadataChanged = true;

          try {
            const canUseConditional =
              !hasLegacyCustomFilename && hasStoredFile;
            if (!canUseConditional) {
              nextEntry.etag = "";
              nextEntry.lastModified = "";
            }
            const result = await fetchList(
              descriptor,
              oldEntry,
              canUseConditional,
              getListFetchRedirectMode(descriptor),
              this._fetchImpl
            );

            if (result.notModified) {
              nextEntry.lastFetched = now;
            } else if (result.text) {
              await lazy.ListStore.writeText(listPath, result.text);
              nextEntry.lastFetched = now;
              nextEntry.etag = result.etag || "";
              nextEntry.lastModified = result.lastModified || "";
              anyUpdated = true;

              if (hasLegacyCustomFilename) {
                try {
                  await IOUtils.remove(
                    lazy.ListStore.listPath(previousFilename),
                    { ignoreAbsent: true }
                  );
                } catch (err) {
                  console.warn(
                    `[MidoriBlocker] Failed removing legacy list ${previousFilename}:`,
                    err
                  );
                }
              }
            }
            nextEntry.failureCount = 0;
            nextEntry.nextAttempt = now + LIST_REFRESH_INTERVAL_MS;
          } catch (err) {
            failedCount++;
            if (hasLegacyCustomFilename) {
              nextEntry.etag = "";
              nextEntry.filename = previousFilename;
              nextEntry.lastModified = "";
            }
            const message =
              err instanceof Error
                ? err.message
                : String(err || "unknown error");
            nextEntry.lastError = message.slice(0, 500);
            nextEntry.failureCount = Number(oldEntry?.failureCount || 0) + 1;
            nextEntry.nextAttempt =
              now +
              computeListRetryDelay(nextEntry.failureCount, this._random);
            console.warn(
              `[MidoriBlocker] Failed to update list: ${descriptor.url}`,
              err
            );
          }

          // Keep failure metadata even when the list has not been fetched yet,
          // and keep the file when this fetch failed.
          if ((await IOUtils.exists(listPath)) || nextEntry.lastError) {
            nextEntries.push(nextEntry);
          }
        }

        if (
          !metadataChanged &&
          JSON.stringify(meta?.lists || []) !== JSON.stringify(nextEntries)
        ) {
          metadataChanged = true;
        }

        if (metadataChanged) {
          await lazy.ListStore.writeJSON(metadataPath, {
            lists: nextEntries,
          });
        }

        return {
          anyUpdated,
          attemptedCount,
          descriptors,
          failedCount,
          skippedCount,
        };
      });
    } finally {
      this._updateInProgress = false;
    }
  }
}
