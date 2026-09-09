/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const {
  LIST_DESCRIPTOR_ORIGIN_CATALOG,
  ListCatalog,
} = ChromeUtils.importESModule(
  "resource:///modules/internal/ListCatalog.sys.mjs"
);
const { ListStore } = ChromeUtils.importESModule(
  "resource:///modules/internal/ListStore.sys.mjs"
);
const {
  LIST_REFRESH_INTERVAL_MS,
  LIST_RETRY_INITIAL_MS,
  ListUpdatesState,
} = ChromeUtils.importESModule(
  "resource:///modules/internal/ListUpdates.sys.mjs"
);

do_get_profile();

const DESCRIPTOR = {
  bundledUrl: "resource://midori/blocker/assets/filters/test.txt",
  filename: "test.txt",
  listOrigin: LIST_DESCRIPTOR_ORIGIN_CATALOG,
  url: "https://example.com/test.txt",
};

function textResponse(text, etag = '"new"') {
  return {
    body: null,
    headers: {
      get(name) {
        return name.toLowerCase() === "etag" ? etag : null;
      },
    },
    ok: true,
    status: 200,
    text: async () => text,
    url: DESCRIPTOR.url,
  };
}

async function withListEnvironment(name, task) {
  const root = PathUtils.join(PathUtils.profileDir, name);
  const metadataPath = PathUtils.join(root, "metadata.json");
  const listPath = filename => PathUtils.join(root, filename);
  const originals = {
    ensureListsDir: ListStore.ensureListsDir,
    getListDescriptors: ListCatalog.getListDescriptors,
    listPath: ListStore.listPath,
    listsMetadataPath: ListStore.listsMetadataPath,
  };

  await IOUtils.remove(root, { ignoreAbsent: true, recursive: true });
  await IOUtils.makeDirectory(root, {
    createAncestors: true,
    ignoreExisting: true,
  });
  ListCatalog.getListDescriptors = async () => [DESCRIPTOR];
  ListStore.ensureListsDir = async () => {};
  ListStore.listPath = listPath;
  ListStore.listsMetadataPath = () => metadataPath;

  try {
    await task({ listPath, metadataPath });
  } finally {
    ListCatalog.getListDescriptors = originals.getListDescriptors;
    ListStore.ensureListsDir = originals.ensureListsDir;
    ListStore.listPath = originals.listPath;
    ListStore.listsMetadataPath = originals.listsMetadataPath;
    await IOUtils.remove(root, { ignoreAbsent: true, recursive: true });
  }
}

add_task(async function test_fresh_list_is_not_downloaded() {
  const now = 1_000_000_000;
  await withListEnvironment("blocker-list-fresh", async paths => {
    await IOUtils.writeUTF8(paths.listPath(DESCRIPTOR.filename), "||old.test^\n");
    await IOUtils.writeUTF8(
      paths.metadataPath,
      JSON.stringify({
        lists: [
          {
            etag: '"old"',
            failureCount: 0,
            filename: DESCRIPTOR.filename,
            lastAttempt: now,
            lastError: "",
            lastFetched: now,
            lastModified: "",
            nextAttempt: now + LIST_REFRESH_INTERVAL_MS,
            url: DESCRIPTOR.url,
          },
        ],
      })
    );
    let fetchCount = 0;
    const state = new ListUpdatesState({
      fetchImpl: async () => {
        fetchCount++;
        return textResponse("||new.test^\n");
      },
      now: () => now,
    });

    const result = await state.updateIfNeeded();
    Assert.equal(fetchCount, 0, "A fresh list should not use the network");
    Assert.equal(result.attemptedCount, 0, "No download should be attempted");
    Assert.equal(result.skippedCount, 1, "The fresh list should be skipped");
  });
});

add_task(async function test_manual_refresh_overrides_schedule() {
  const now = 2_000_000_000;
  await withListEnvironment("blocker-list-force", async paths => {
    await IOUtils.writeUTF8(paths.listPath(DESCRIPTOR.filename), "||old.test^\n");
    await IOUtils.writeUTF8(
      paths.metadataPath,
      JSON.stringify({
        lists: [
          {
            filename: DESCRIPTOR.filename,
            lastFetched: now,
            nextAttempt: now + LIST_REFRESH_INTERVAL_MS,
            url: DESCRIPTOR.url,
          },
        ],
      })
    );
    let fetchCount = 0;
    const state = new ListUpdatesState({
      fetchImpl: async () => {
        fetchCount++;
        return textResponse("||new.test^\n");
      },
      now: () => now,
    });

    const result = await state.updateIfNeeded({ force: true });
    Assert.equal(fetchCount, 1, "A manual refresh should use the network");
    Assert.equal(result.anyUpdated, true, "The new list should be installed");
    Assert.equal(
      await IOUtils.readUTF8(paths.listPath(DESCRIPTOR.filename)),
      "||new.test^\n",
      "The forced response should replace the stored list"
    );
  });
});

add_task(async function test_failed_list_uses_backoff() {
  const now = 3_000_000_000;
  await withListEnvironment("blocker-list-backoff", async paths => {
    const state = new ListUpdatesState({
      fetchImpl: async () => {
        throw new Error("offline");
      },
      now: () => now,
      random: () => 0.5,
    });

    const result = await state.updateIfNeeded();
    const metadata = JSON.parse(await IOUtils.readUTF8(paths.metadataPath));
    Assert.equal(result.failedCount, 1, "The failed request should be counted");
    Assert.equal(
      metadata.lists[0].failureCount,
      1,
      "The failure count should be persisted"
    );
    Assert.equal(
      metadata.lists[0].nextAttempt,
      now + LIST_RETRY_INITIAL_MS,
      "The first retry should be delayed"
    );

    let earlyRetryCount = 0;
    const earlyRetry = new ListUpdatesState({
      fetchImpl: async () => {
        earlyRetryCount++;
        throw new Error("still offline");
      },
      now: () => now + LIST_RETRY_INITIAL_MS - 1,
      random: () => 0.5,
    });
    const retryResult = await earlyRetry.updateIfNeeded();
    Assert.equal(
      earlyRetryCount,
      0,
      "A missing remote list should still honor its retry backoff"
    );
    Assert.equal(retryResult.skippedCount, 1, "The early retry should be skipped");
  });
});
