/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { EngineCache } = ChromeUtils.importESModule(
  "resource:///modules/internal/EngineCache.sys.mjs"
);
const {
  LIST_DESCRIPTOR_ORIGIN_CATALOG,
  LIST_DESCRIPTOR_ORIGIN_CUSTOM,
  ListCatalog,
  MAX_CUSTOM_FILTER_LISTS,
} = ChromeUtils.importESModule(
  "resource:///modules/internal/ListCatalog.sys.mjs"
);
const { ListStore } = ChromeUtils.importESModule(
  "resource:///modules/internal/ListStore.sys.mjs"
);
const { ListUpdatesState } = ChromeUtils.importESModule(
  "resource:///modules/internal/ListUpdates.sys.mjs"
);
const { RemoteResources } = ChromeUtils.importESModule(
  "resource:///modules/internal/RemoteResources.sys.mjs"
);
const { MidoriBlockerService } = ChromeUtils.importESModule(
  "resource:///modules/MidoriBlockerService.sys.mjs"
);

do_get_profile();

const STORED_DESCRIPTOR = {
  bundledUrl: "resource://midori/blocker/assets/filters/stored.txt",
  filename: "stored.txt",
  listOrigin: LIST_DESCRIPTOR_ORIGIN_CATALOG,
  url: "https://example.com/stored.txt",
};
const FALLBACK_DESCRIPTOR = {
  bundledUrl: "resource://midori/blocker/assets/filters/fallback.txt",
  filename: "fallback.txt",
  listOrigin: LIST_DESCRIPTOR_ORIGIN_CATALOG,
  url: "https://example.com/fallback.txt",
};
const REMOTE_DESCRIPTOR = {
  bundledUrl: null,
  filename: "remote.txt",
  listOrigin: LIST_DESCRIPTOR_ORIGIN_CUSTOM,
  url: "https://example.com/remote.txt",
};
const DESCRIPTORS = [STORED_DESCRIPTOR, FALLBACK_DESCRIPTOR, REMOTE_DESCRIPTOR];

function record(descriptor, text) {
  return {
    filename: descriptor.filename,
    text,
    url: descriptor.url,
  };
}

function engineWithBytes(bytes) {
  return {
    serialize() {
      return new Uint8Array(bytes);
    },
  };
}

function deferred() {
  let resolve;
  const promise = new Promise(promiseResolve => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function withMockedFetch(fetchImpl, task) {
  await task(fetchImpl);
}

async function withListPaths(name, task) {
  const listsDir = PathUtils.join(PathUtils.profileDir, name);
  const metadataPath = PathUtils.join(listsDir, "metadata.json");
  const listPath = filename => PathUtils.join(listsDir, filename);
  const originalListPath = ListStore.listPath;
  const originalListsMetadataPath = ListStore.listsMetadataPath;
  const originalEnsureListsDir = ListStore.ensureListsDir;

  await IOUtils.remove(listsDir, { ignoreAbsent: true, recursive: true });
  await IOUtils.makeDirectory(listsDir, {
    createAncestors: true,
    ignoreExisting: true,
  });
  ListStore.listPath = listPath;
  ListStore.listsMetadataPath = () => metadataPath;
  ListStore.ensureListsDir = async () => {};

  try {
    await task({ listPath, metadataPath });
  } finally {
    ListStore.listPath = originalListPath;
    ListStore.listsMetadataPath = originalListsMetadataPath;
    ListStore.ensureListsDir = originalEnsureListsDir;
    await IOUtils.remove(listsDir, { ignoreAbsent: true, recursive: true });
  }
}

add_task(
  function test_merge_list_records_fills_bundled_descriptors_by_identity() {
    const storedRecord = record(STORED_DESCRIPTOR, "||stored.example^\n");
    const customRecord = record(REMOTE_DESCRIPTOR, "||custom.example^\n");
    const fallbackStoredRecord = record(
      STORED_DESCRIPTOR,
      "||outdated.example^\n"
    );
    const fallbackRecord = record(FALLBACK_DESCRIPTOR, "||fallback.example^\n");

    Assert.deepEqual(
      ListCatalog.getMissingBundledListDescriptors(DESCRIPTORS, [
        storedRecord,
        customRecord,
      ]),
      [FALLBACK_DESCRIPTOR],
      "Only the missing bundled descriptor should need fallback data"
    );

    const merged = ListCatalog.mergeListRecords(
      DESCRIPTORS,
      [storedRecord, customRecord],
      [fallbackStoredRecord, fallbackRecord]
    );
    Assert.deepEqual(
      merged,
      [storedRecord, fallbackRecord, customRecord],
      "Stored records should win while missing records use bundled fallback"
    );
    Assert.ok(
      ListCatalog.hasAllBundledListRecords(DESCRIPTORS, merged),
      "Remote-only descriptors should not make the bundled baseline incomplete"
    );

    const wrongUrlRecord = {
      ...fallbackRecord,
      url: "https://example.com/wrong-fallback.txt",
    };
    Assert.deepEqual(
      ListCatalog.getMissingBundledListDescriptors(DESCRIPTORS, [
        storedRecord,
        wrongUrlRecord,
      ]),
      [FALLBACK_DESCRIPTOR],
      "Filename matches must not hide a URL identity mismatch"
    );
    Assert.deepEqual(
      ListCatalog.getMissingBundledListDescriptors(DESCRIPTORS, [
        storedRecord,
        record(FALLBACK_DESCRIPTOR, "   \n"),
      ]),
      [FALLBACK_DESCRIPTOR],
      "Whitespace-only list records should be treated as missing"
    );
  }
);

add_task(function test_custom_list_filenames_are_stable_by_url() {
  const firstUrl = "https://example.com/custom-a.txt";
  const secondUrl = "https://example.com/custom-b.txt";
  Assert.equal(
    ListCatalog.customListFilename(firstUrl),
    ListCatalog.customListFilename(firstUrl),
    "The same custom URL should always receive the same filename"
  );
  Assert.notEqual(
    ListCatalog.customListFilename(firstUrl),
    ListCatalog.customListFilename(secondUrl),
    "Different custom URLs should not share a cache filename"
  );
  Assert.ok(
    ListCatalog.isLegacyCustomListFilename("custom-2.txt"),
    "Positional custom-list filenames should be recognized for migration"
  );
  Assert.ok(
    !ListCatalog.isLegacyCustomListFilename("stored.txt"),
    "Catalog filenames should never be treated as legacy custom-list files"
  );
  Assert.ok(
    !ListCatalog.isLegacyCustomListFilename(
      ListCatalog.customListFilename(firstUrl)
    ),
    "Stable custom-list filenames should not be treated as positional files"
  );
});

add_task(function test_custom_list_count_is_bounded() {
  const pref = "midori.blocker.filterListUrls";
  const hadUserValue = Services.prefs.prefHasUserValue(pref);
  const previousValue = Services.prefs.getStringPref(pref, "");
  const urls = Array.from(
    { length: MAX_CUSTOM_FILTER_LISTS + 10 },
    (_, index) => `https://example.com/list-${index}.txt`
  );

  try {
    Services.prefs.setStringPref(pref, JSON.stringify(urls));
    const actual = ListCatalog.getCustomFilterListUrls();
    Assert.equal(
      actual.length,
      MAX_CUSTOM_FILTER_LISTS,
      "Only the bounded number of custom lists should enter the engine"
    );
    Assert.deepEqual(
      actual,
      urls.slice(0, MAX_CUSTOM_FILTER_LISTS),
      "The oldest configured custom lists should be retained"
    );
  } finally {
    if (hadUserValue) {
      Services.prefs.setStringPref(pref, previousValue);
    } else {
      Services.prefs.clearUserPref(pref);
    }
  }
});

add_task(function test_engine_receives_whole_filter_lists() {
  const originalCreateEngine = MidoriBlockerService._createEngine;
  let receivedLists = null;
  MidoriBlockerService._createEngine = () => ({
    initFromLists(lists) {
      receivedLists = lists;
    },
  });

  try {
    const first = "! first\n||ads.example^\nexample.com##.ad\n";
    const second = "! second\n||tracker.example^\n";
    const engine = MidoriBlockerService._createEngineFromListRecords([
      { text: first },
      { text: "  " },
      { text: second },
    ]);
    Assert.ok(engine, "A non-empty list set should create an engine");
    Assert.deepEqual(
      receivedLists,
      [first, second],
      "The JS boundary should pass complete lists without expanding every rule"
    );
  } finally {
    MidoriBlockerService._createEngine = originalCreateEngine;
  }
});

add_task(
  async function test_legacy_custom_list_is_quarantined_by_url_metadata() {
    await withListPaths(
      "custom-list-filename-migration",
      async ({ listPath, metadataPath }) => {
        const url = "https://example.com/custom-b.txt";
        const descriptor = {
          bundledUrl: null,
          filename: ListCatalog.customListFilename(url),
          listOrigin: LIST_DESCRIPTOR_ORIGIN_CUSTOM,
          url,
        };
        const previousFilename = "custom-2.txt";
        const text = "||custom-b.example^\n";
        const metadata = {
          lists: [
            {
              etag: '"custom-b"',
              filename: previousFilename,
              lastAttempt: 1,
              lastError: "",
              lastFetched: 1,
              lastModified: "",
              url,
            },
          ],
        };
        await IOUtils.writeUTF8(listPath(previousFilename), text);
        await IOUtils.writeUTF8(metadataPath, JSON.stringify(metadata));

        const result = await ListStore.resolveLocalListRecords([descriptor]);
        Assert.deepEqual(
          result,
          {
            complete: true,
            listRecords: [],
          },
          "Unverified positional bytes should not enter the local engine"
        );
        Assert.ok(
          !(await IOUtils.exists(listPath(descriptor.filename))),
          "Local resolution should not publish bytes under the stable filename"
        );
        Assert.equal(
          await IOUtils.readUTF8(listPath(previousFilename)),
          text,
          "The positional file should remain available for a full refresh"
        );
        Assert.deepEqual(
          JSON.parse(await IOUtils.readUTF8(metadataPath)),
          metadata,
          "Metadata should keep the positional identity until refresh succeeds"
        );
      }
    );
  }
);

add_task(async function test_custom_list_migration_forces_full_fetch() {
  await withListPaths(
    "custom-list-304-migration",
    async ({ listPath, metadataPath }) => {
      const url = "https://example.com/custom-b.txt";
      const descriptor = {
        bundledUrl: null,
        filename: ListCatalog.customListFilename(url),
        listOrigin: LIST_DESCRIPTOR_ORIGIN_CUSTOM,
        url,
      };
      const previousFilename = "custom-2.txt";
      const oldText = "||wrong-custom-a.example^\n";
      const remoteText = "||custom-b.example^\n";
      await IOUtils.writeUTF8(listPath(previousFilename), oldText);
      await IOUtils.writeUTF8(
        metadataPath,
        JSON.stringify({
          lists: [
            {
              etag: '"custom-b"',
              filename: previousFilename,
              lastAttempt: 1,
              lastError: "",
              lastFetched: 1,
              lastModified: "",
              url,
            },
          ],
        })
      );

      const originalGetListDescriptors = ListCatalog.getListDescriptors;
      let fetchOptions = null;
      ListCatalog.getListDescriptors = async () => [descriptor];
      try {
        await withMockedFetch(
          async (_url, options) => {
            fetchOptions = options;
            return {
              body: null,
              headers: {
                get(name) {
                  return name.toLowerCase() === "etag"
                    ? '"custom-b-new"'
                    : null;
                },
              },
              ok: true,
              status: 200,
              text: async () => remoteText,
            };
          },
          async mockFetch => {
            const result = await new ListUpdatesState({
              fetchImpl: mockFetch,
            }).updateIfNeeded();
            Assert.equal(
              result?.anyUpdated,
              true,
              "Legacy custom-list bytes should be replaced by a full response"
            );
          }
        );
      } finally {
        ListCatalog.getListDescriptors = originalGetListDescriptors;
      }

      Assert.equal(
        fetchOptions?.headers.get("If-None-Match"),
        null,
        "Unverified migrated bytes should force an unconditional request"
      );
      Assert.equal(
        await IOUtils.readUTF8(listPath(descriptor.filename)),
        remoteText,
        "The full response should replace potentially misbound custom bytes"
      );
      Assert.ok(
        !(await IOUtils.exists(listPath(previousFilename))),
        "The old positional file should remain removed"
      );
      const metadata = JSON.parse(await IOUtils.readUTF8(metadataPath));
      Assert.equal(
        metadata.lists[0].filename,
        descriptor.filename,
        "Metadata should adopt the stable custom-list filename"
      );
      Assert.equal(
        metadata.lists[0].etag,
        '"custom-b-new"',
        "The full response should install its new validator"
      );
    }
  );
});

add_task(async function test_custom_list_migration_rejects_unconditional_304() {
  await withListPaths(
    "custom-list-unconditional-304",
    async ({ listPath, metadataPath }) => {
      const url = "https://example.com/custom-b.txt";
      const descriptor = {
        bundledUrl: null,
        filename: ListCatalog.customListFilename(url),
        listOrigin: LIST_DESCRIPTOR_ORIGIN_CUSTOM,
        url,
      };
      const previousFilename = "custom-2.txt";
      const oldText = "||wrong-custom-a.example^\n";
      await IOUtils.writeUTF8(listPath(previousFilename), oldText);
      await IOUtils.writeUTF8(
        metadataPath,
        JSON.stringify({
          lists: [
            {
              etag: '"custom-b"',
              filename: previousFilename,
              lastAttempt: 1,
              lastError: "",
              lastFetched: 1,
              lastModified: "yesterday",
              url,
            },
          ],
        })
      );

      const originalGetListDescriptors = ListCatalog.getListDescriptors;
      let fetchOptions = null;
      ListCatalog.getListDescriptors = async () => [descriptor];
      try {
        await withMockedFetch(
          async (_url, options) => {
            fetchOptions = options;
            return {
              body: null,
              headers: { get: () => null },
              ok: false,
              status: 304,
            };
          },
          async mockFetch => {
            const result = await new ListUpdatesState({
              fetchImpl: mockFetch,
            }).updateIfNeeded();
            Assert.equal(
              result?.anyUpdated,
              false,
              "An unconditional 304 should not update migrated bytes"
            );
          }
        );
      } finally {
        ListCatalog.getListDescriptors = originalGetListDescriptors;
      }

      Assert.equal(
        fetchOptions?.headers.get("If-None-Match"),
        null,
        "Legacy migration should not send the stale validator"
      );
      Assert.ok(
        !(await IOUtils.exists(listPath(descriptor.filename))),
        "A 304 should not publish potentially misbound bytes"
      );
      Assert.equal(
        await IOUtils.readUTF8(listPath(previousFilename)),
        oldText,
        "The legacy file should remain recoverable after a failed refresh"
      );
      const metadata = JSON.parse(await IOUtils.readUTF8(metadataPath));
      Assert.equal(
        metadata.lists[0].filename,
        previousFilename,
        "Failed migration should retain the legacy filename marker"
      );
      Assert.equal(
        metadata.lists[0].etag,
        "",
        "Failed migration should clear the stale ETag"
      );
      Assert.equal(
        metadata.lists[0].lastModified,
        "",
        "Failed migration should clear the stale modification time"
      );
      Assert.ok(
        metadata.lists[0].lastError.includes("Unexpected 304"),
        "Migration metadata should explain why the response was rejected"
      );
    }
  );
});

add_task(
  async function test_resolve_local_lists_backfills_only_missing_records() {
    const storedRecord = record(STORED_DESCRIPTOR, "||stored.example^\n");
    const customRecord = record(REMOTE_DESCRIPTOR, "||custom.example^\n");
    const fallbackRecord = record(FALLBACK_DESCRIPTOR, "||fallback.example^\n");
    const originalReadStoredLists = ListStore.readStoredLists;
    const originalReadBundledLists = ListStore.readBundledLists;
    const originalEnsureListsDir = ListStore.ensureListsDir;
    const originalListPath = ListStore.listPath;
    const originalWriteText = ListStore.writeText;
    let requestedBundledDescriptors = null;
    const writes = [];

    ListStore.readStoredLists = async () => [storedRecord, customRecord];
    ListStore.readBundledLists = async descriptors => {
      requestedBundledDescriptors = descriptors;
      return [fallbackRecord];
    };
    ListStore.ensureListsDir = async () => {};
    ListStore.listPath = filename => filename;
    ListStore.writeText = async (path, text) => {
      writes.push({ path, text });
    };

    try {
      const result =
        await MidoriBlockerService._resolveLocalListRecords(DESCRIPTORS);
      Assert.deepEqual(
        requestedBundledDescriptors,
        [FALLBACK_DESCRIPTOR],
        "Only missing bundled descriptors should be read"
      );
      Assert.deepEqual(
        result,
        {
          complete: true,
          listRecords: [storedRecord, fallbackRecord, customRecord],
        },
        "Local resolution should merge stored, bundled, and optional records"
      );
      Assert.deepEqual(
        writes,
        [{ path: FALLBACK_DESCRIPTOR.filename, text: fallbackRecord.text }],
        "Only the newly resolved fallback should be persisted"
      );
    } finally {
      ListStore.readStoredLists = originalReadStoredLists;
      ListStore.readBundledLists = originalReadBundledLists;
      ListStore.ensureListsDir = originalEnsureListsDir;
      ListStore.listPath = originalListPath;
      ListStore.writeText = originalWriteText;
    }
  }
);

add_task(async function test_bundled_fallback_clears_stale_validator() {
  await withListPaths(
    "bundled-fallback-validator",
    async ({ listPath, metadataPath }) => {
      const fallbackRecord = record(
        FALLBACK_DESCRIPTOR,
        "||fallback.example^\n"
      );
      const unrelatedEntry = {
        etag: '"stored"',
        filename: STORED_DESCRIPTOR.filename,
        lastAttempt: 1,
        lastError: "",
        lastFetched: 1,
        lastModified: "yesterday",
        url: STORED_DESCRIPTOR.url,
      };
      await IOUtils.writeUTF8(
        metadataPath,
        JSON.stringify({
          lists: [
            unrelatedEntry,
            {
              etag: '"missing-remote"',
              filename: FALLBACK_DESCRIPTOR.filename,
              lastAttempt: 2,
              lastError: "",
              lastFetched: 2,
              lastModified: "today",
              url: FALLBACK_DESCRIPTOR.url,
            },
          ],
        })
      );

      const originalReadBundledLists = ListStore.readBundledLists;
      ListStore.readBundledLists = async () => [fallbackRecord];
      try {
        await ListStore.resolveLocalListRecords([FALLBACK_DESCRIPTOR]);
      } finally {
        ListStore.readBundledLists = originalReadBundledLists;
      }

      Assert.equal(
        await IOUtils.readUTF8(listPath(FALLBACK_DESCRIPTOR.filename)),
        fallbackRecord.text,
        "The bundled fallback should be persisted"
      );
      const metadata = JSON.parse(await IOUtils.readUTF8(metadataPath));
      Assert.deepEqual(
        metadata.lists[0],
        unrelatedEntry,
        "Fallback persistence should preserve unrelated metadata"
      );
      Assert.deepEqual(
        metadata.lists[1],
        {
          etag: "",
          filename: FALLBACK_DESCRIPTOR.filename,
          lastAttempt: 2,
          lastError: "",
          lastFetched: 2,
          lastModified: "",
          url: FALLBACK_DESCRIPTOR.url,
        },
        "Fallback bytes should invalidate only their remote validators"
      );
    }
  );
});

add_task(
  async function test_local_fallback_and_remote_update_share_write_lock() {
    await withListPaths(
      "local-fallback-update-serialization",
      async ({ listPath }) => {
        const fallbackRecord = record(
          FALLBACK_DESCRIPTOR,
          "||fallback.example^\n"
        );
        const remoteText = "||remote.example^\n";
        const originalReadStoredLists = ListStore.readStoredLists;
        const originalReadBundledLists = ListStore.readBundledLists;
        const originalGetListDescriptors = ListCatalog.getListDescriptors;
        const bundledReadStarted = deferred();
        const resumeBundledRead = deferred();
        let fetchCount = 0;

        ListStore.readStoredLists = async () => [];
        ListStore.readBundledLists = async () => {
          bundledReadStarted.resolve();
          await resumeBundledRead.promise;
          return [fallbackRecord];
        };
        ListCatalog.getListDescriptors = async () => [FALLBACK_DESCRIPTOR];

        try {
          await withMockedFetch(
            async () => {
              fetchCount++;
              return {
                body: null,
                headers: { get: () => null },
                ok: true,
                status: 200,
                text: async () => remoteText,
              };
            },
            async mockFetch => {
              const resolvePromise = ListStore.resolveLocalListRecords([
                FALLBACK_DESCRIPTOR,
              ]);
              await bundledReadStarted.promise;
              const updatePromise = new ListUpdatesState({
                fetchImpl: mockFetch,
              }).updateIfNeeded();
              await Promise.resolve();
              Assert.equal(
                fetchCount,
                0,
                "Remote updates should wait for local fallback persistence"
              );
              resumeBundledRead.resolve();
              await Promise.all([resolvePromise, updatePromise]);
            }
          );

          Assert.equal(
            await IOUtils.readUTF8(listPath(FALLBACK_DESCRIPTOR.filename)),
            remoteText,
            "The newer remote update should win after serialized fallback writes"
          );
        } finally {
          resumeBundledRead.resolve();
          ListStore.readStoredLists = originalReadStoredLists;
          ListStore.readBundledLists = originalReadBundledLists;
          ListCatalog.getListDescriptors = originalGetListDescriptors;
        }
      }
    );
  }
);

add_task(
  async function test_refresh_builds_local_engine_before_remote_update() {
    const originalRebuildEngineFromCurrentSources =
      MidoriBlockerService._rebuildEngineFromCurrentSources;
    const originalUpdateListsIfNeeded =
      MidoriBlockerService._updateListsIfNeeded;
    const calls = [];

    MidoriBlockerService._rebuildEngineFromCurrentSources = async options => {
      calls.push({ options, step: "local" });
    };
    MidoriBlockerService._updateListsIfNeeded = async () => {
      calls.push({ step: "remote" });
    };

    try {
      await MidoriBlockerService.refreshListsAndEngine();
      Assert.deepEqual(
        calls,
        [
          {
            options: { preservePreviousEngine: true },
            step: "local",
          },
          { step: "remote" },
        ],
        "List refreshes should install the local engine before network updates"
      );
    } finally {
      MidoriBlockerService._rebuildEngineFromCurrentSources =
        originalRebuildEngineFromCurrentSources;
      MidoriBlockerService._updateListsIfNeeded = originalUpdateListsIfNeeded;
    }
  }
);

add_task(async function test_list_update_requests_queue_one_latest_rerun() {
  const originalRunListUpdatePass = MidoriBlockerService._runListUpdatePass;
  const originalInitialized = MidoriBlockerService._initialized;
  const originalIsEnabled = MidoriBlockerService.isEnabled;
  const originalUpdatePromise = MidoriBlockerService._listUpdatePromise;
  const originalRerunRequested =
    MidoriBlockerService._listUpdateRerunRequested;
  const originalForceRequested =
    MidoriBlockerService._listUpdateForceRequested;
  const firstPassStarted = deferred();
  const resumeFirstPass = deferred();
  let passCount = 0;

  MidoriBlockerService._initialized = true;
  MidoriBlockerService.isEnabled = () => true;
  MidoriBlockerService._listUpdatePromise = null;
  MidoriBlockerService._listUpdateRerunRequested = false;
  MidoriBlockerService._listUpdateForceRequested = false;
  const passForces = [];
  MidoriBlockerService._runListUpdatePass = async ({ force = false } = {}) => {
    passCount++;
    passForces.push(force);
    if (passCount === 1) {
      firstPassStarted.resolve();
      await resumeFirstPass.promise;
    }
  };

  try {
    const firstUpdate = MidoriBlockerService._updateListsIfNeeded();
    await firstPassStarted.promise;
    const secondUpdate = MidoriBlockerService._updateListsIfNeeded({
      force: true,
    });
    resumeFirstPass.resolve();
    await Promise.all([firstUpdate, secondUpdate]);
    Assert.equal(
      passCount,
      2,
      "An update request arriving in flight should queue exactly one rerun"
    );
    Assert.deepEqual(
      passForces,
      [false, true],
      "A forced in-flight request should force the queued rerun"
    );
  } finally {
    resumeFirstPass.resolve();
    MidoriBlockerService._runListUpdatePass = originalRunListUpdatePass;
    MidoriBlockerService._initialized = originalInitialized;
    MidoriBlockerService.isEnabled = originalIsEnabled;
    MidoriBlockerService._listUpdatePromise = originalUpdatePromise;
    MidoriBlockerService._listUpdateRerunRequested = originalRerunRequested;
    MidoriBlockerService._listUpdateForceRequested = originalForceRequested;
  }
});

add_task(async function test_local_rebuild_waiter_suppresses_update_rerun() {
  const originalInitialized = MidoriBlockerService._initialized;
  const originalGeneration = MidoriBlockerService._initGeneration;
  const originalIsEnabled = MidoriBlockerService.isEnabled;
  const originalEngineInitPromise = MidoriBlockerService._engineInitPromise;
  const originalListUpdates = MidoriBlockerService._listUpdates;
  const originalRefreshEngineAfterListUpdate =
    MidoriBlockerService._refreshEngineAfterListUpdate;
  const originalRemoteRefresh = RemoteResources.refresh;
  const originalLocalRebuildWaiters =
    MidoriBlockerService._localRebuildWaiters;
  const originalRerunRequested =
    MidoriBlockerService._listUpdateRerunRequested;
  const originalForceRequested =
    MidoriBlockerService._listUpdateForceRequested;

  MidoriBlockerService._initialized = true;
  MidoriBlockerService._initGeneration = 1;
  MidoriBlockerService.isEnabled = () => true;
  MidoriBlockerService._engineInitPromise = null;
  MidoriBlockerService._localRebuildWaiters = 1;
  MidoriBlockerService._listUpdateRerunRequested = false;
  MidoriBlockerService._listUpdateForceRequested = false;
  MidoriBlockerService._listUpdates = () => ({
    async updateIfNeeded() {
      return { anyUpdated: true, descriptors: [] };
    },
  });
  MidoriBlockerService._refreshEngineAfterListUpdate = async () => false;
  RemoteResources.refresh = async () => {};

  try {
    await MidoriBlockerService._runListUpdatePass();
    Assert.equal(
      MidoriBlockerService._listUpdateRerunRequested,
      false,
      "A waiting local rebuild should run before another network update"
    );
  } finally {
    MidoriBlockerService._initialized = originalInitialized;
    MidoriBlockerService._initGeneration = originalGeneration;
    MidoriBlockerService.isEnabled = originalIsEnabled;
    MidoriBlockerService._engineInitPromise = originalEngineInitPromise;
    MidoriBlockerService._listUpdates = originalListUpdates;
    MidoriBlockerService._refreshEngineAfterListUpdate =
      originalRefreshEngineAfterListUpdate;
    RemoteResources.refresh = originalRemoteRefresh;
    MidoriBlockerService._localRebuildWaiters = originalLocalRebuildWaiters;
    MidoriBlockerService._listUpdateRerunRequested = originalRerunRequested;
    MidoriBlockerService._listUpdateForceRequested = originalForceRequested;
  }
});

add_task(async function test_stale_cache_candidate_is_not_published() {
  const originalGeneration = MidoriBlockerService._initGeneration;
  const originalEngine = MidoriBlockerService._engine;
  const originalReadStoredLists = MidoriBlockerService._readStoredLists;
  const originalPreprocessListRecords =
    MidoriBlockerService._preprocessListRecords;
  const originalCreateEngine = MidoriBlockerService._createEngine;
  const originalMatchesCurrentLists = EngineCache.matchesCurrentLists;
  const originalCacheRead = EngineCache.read;
  const cacheReadStarted = deferred();
  const resumeCacheRead = deferred();
  const newerEngine = { name: "newer" };
  const candidate = {
    initFromCache() {},
  };

  MidoriBlockerService._initGeneration = 1;
  MidoriBlockerService._engine = null;
  MidoriBlockerService._readStoredLists = async () => [
    record(STORED_DESCRIPTOR, "||stored.example^\n"),
  ];
  MidoriBlockerService._preprocessListRecords = async records => records;
  MidoriBlockerService._createEngine = () => candidate;
  EngineCache.matchesCurrentLists = async () => true;
  EngineCache.read = async () => {
    cacheReadStarted.resolve();
    return resumeCacheRead.promise;
  };

  try {
    const cacheInit = MidoriBlockerService._tryInitFromCache(
      [STORED_DESCRIPTOR],
      1
    );
    await cacheReadStarted.promise;
    MidoriBlockerService._initGeneration = 2;
    MidoriBlockerService._engine = newerEngine;
    resumeCacheRead.resolve(new Uint8Array([1, 2, 3]));
    Assert.equal(
      await cacheInit,
      false,
      "A cache read from a stale generation should be discarded"
    );
    Assert.equal(
      MidoriBlockerService._engine,
      newerEngine,
      "A stale cache candidate should not replace the newer engine"
    );
  } finally {
    resumeCacheRead.resolve(new Uint8Array());
    MidoriBlockerService._initGeneration = originalGeneration;
    MidoriBlockerService._engine = originalEngine;
    MidoriBlockerService._readStoredLists = originalReadStoredLists;
    MidoriBlockerService._preprocessListRecords =
      originalPreprocessListRecords;
    MidoriBlockerService._createEngine = originalCreateEngine;
    EngineCache.matchesCurrentLists = originalMatchesCurrentLists;
    EngineCache.read = originalCacheRead;
  }
});

add_task(async function test_stale_list_update_cannot_replace_current_engine() {
  const originalGeneration = MidoriBlockerService._initGeneration;
  const originalIsEnabled = MidoriBlockerService.isEnabled;
  const originalResolveLocalListRecords =
    MidoriBlockerService._resolveLocalListRecords;
  let resolvedLists = false;

  MidoriBlockerService._initGeneration = 2;
  MidoriBlockerService.isEnabled = () => true;
  MidoriBlockerService._resolveLocalListRecords = async () => {
    resolvedLists = true;
    return { complete: true, listRecords: [] };
  };

  try {
    Assert.equal(
      await MidoriBlockerService._refreshEngineAfterListUpdate(true, [], 1),
      false,
      "A stale update generation should not apply"
    );
    Assert.equal(
      resolvedLists,
      false,
      "Stale updates should be rejected before reading or replacing lists"
    );
  } finally {
    MidoriBlockerService._initGeneration = originalGeneration;
    MidoriBlockerService.isEnabled = originalIsEnabled;
    MidoriBlockerService._resolveLocalListRecords =
      originalResolveLocalListRecords;
  }
});

add_task(async function test_incomplete_local_baseline_is_not_published() {
  const originalGeneration = MidoriBlockerService._initGeneration;
  const originalEngine = MidoriBlockerService._engine;
  const originalResolveLocalListRecords =
    MidoriBlockerService._resolveLocalListRecords;
  const originalPreprocessListRecords =
    MidoriBlockerService._preprocessListRecords;
  const originalCacheClear = EngineCache.clear;
  const originalCacheWrite = EngineCache.write;
  const previousEngine = { name: "previous" };
  let cacheCleared = false;
  let cacheWritten = false;
  let preprocessed = false;

  MidoriBlockerService._initGeneration = 1;
  MidoriBlockerService._engine = previousEngine;
  MidoriBlockerService._resolveLocalListRecords = async () => ({
    complete: false,
    listRecords: [record(STORED_DESCRIPTOR, "||stored.example^\n")],
  });
  MidoriBlockerService._preprocessListRecords = async records => {
    preprocessed = true;
    return records;
  };
  EngineCache.clear = async () => {
    cacheCleared = true;
  };
  EngineCache.write = async () => {
    cacheWritten = true;
    return true;
  };

  try {
    await Assert.rejects(
      MidoriBlockerService._initFromLocalSourcesAndCache(
        [STORED_DESCRIPTOR, FALLBACK_DESCRIPTOR],
        1
      ),
      /bundled filter list.*unavailable/,
      "An incomplete bundled baseline should fail local initialization"
    );
    Assert.equal(
      MidoriBlockerService._engine,
      previousEngine,
      "An incomplete local candidate should not replace the active engine"
    );
    Assert.equal(
      preprocessed,
      false,
      "Incomplete records should be rejected before engine preprocessing"
    );
    Assert.equal(
      cacheCleared,
      false,
      "A recoverable complete cache should remain available"
    );
    Assert.equal(
      cacheWritten,
      false,
      "Incomplete records should not be written to the engine cache"
    );
  } finally {
    MidoriBlockerService._initGeneration = originalGeneration;
    MidoriBlockerService._engine = originalEngine;
    MidoriBlockerService._resolveLocalListRecords =
      originalResolveLocalListRecords;
    MidoriBlockerService._preprocessListRecords =
      originalPreprocessListRecords;
    EngineCache.clear = originalCacheClear;
    EngineCache.write = originalCacheWrite;
  }
});

add_task(async function test_incomplete_update_keeps_current_engine() {
  const originalGeneration = MidoriBlockerService._initGeneration;
  const originalEngine = MidoriBlockerService._engine;
  const originalIsEnabled = MidoriBlockerService.isEnabled;
  const originalResolveLocalListRecords =
    MidoriBlockerService._resolveLocalListRecords;
  const originalPreprocessListRecords =
    MidoriBlockerService._preprocessListRecords;
  const originalScheduleInitRetry = MidoriBlockerService._scheduleInitRetry;
  const previousEngine = { name: "previous" };
  let preprocessed = false;
  let retryCount = 0;

  MidoriBlockerService._initGeneration = 1;
  MidoriBlockerService._engine = previousEngine;
  MidoriBlockerService.isEnabled = () => true;
  MidoriBlockerService._resolveLocalListRecords = async () => ({
    complete: false,
    listRecords: [record(STORED_DESCRIPTOR, "||stored.example^\n")],
  });
  MidoriBlockerService._preprocessListRecords = async records => {
    preprocessed = true;
    return records;
  };
  MidoriBlockerService._scheduleInitRetry = () => {
    retryCount++;
  };

  try {
    Assert.equal(
      await MidoriBlockerService._refreshEngineAfterListUpdate(
        true,
        [STORED_DESCRIPTOR, FALLBACK_DESCRIPTOR],
        1
      ),
      true,
      "An incomplete update should be handled without a network rerun loop"
    );
    Assert.equal(
      MidoriBlockerService._engine,
      previousEngine,
      "An incomplete update should preserve the active engine"
    );
    Assert.equal(
      preprocessed,
      false,
      "An incomplete update should not construct a degraded candidate"
    );
    Assert.equal(
      retryCount,
      1,
      "An incomplete update should schedule a local rebuild retry"
    );
  } finally {
    MidoriBlockerService._initGeneration = originalGeneration;
    MidoriBlockerService._engine = originalEngine;
    MidoriBlockerService.isEnabled = originalIsEnabled;
    MidoriBlockerService._resolveLocalListRecords =
      originalResolveLocalListRecords;
    MidoriBlockerService._preprocessListRecords =
      originalPreprocessListRecords;
    MidoriBlockerService._scheduleInitRetry = originalScheduleInitRetry;
  }
});

add_task(async function test_stale_local_candidate_is_not_published() {
  const originalGeneration = MidoriBlockerService._initGeneration;
  const originalEngine = MidoriBlockerService._engine;
  const originalResolveLocalListRecords =
    MidoriBlockerService._resolveLocalListRecords;
  const originalPreprocessListRecords =
    MidoriBlockerService._preprocessListRecords;
  const originalCreateEngineFromListRecords =
    MidoriBlockerService._createEngineFromListRecords;
  const originalCacheWrite = EngineCache.write;
  const previousEngine = { name: "previous" };
  const candidateEngine = { name: "candidate" };
  let cacheWritten = false;

  MidoriBlockerService._initGeneration = 1;
  MidoriBlockerService._engine = previousEngine;
  MidoriBlockerService._resolveLocalListRecords = async () => ({
    complete: true,
    listRecords: [record(STORED_DESCRIPTOR, "||stored.example^\n")],
  });
  MidoriBlockerService._preprocessListRecords = async records => records;
  MidoriBlockerService._createEngineFromListRecords = () => {
    MidoriBlockerService._initGeneration = 2;
    return candidateEngine;
  };
  EngineCache.write = async () => {
    cacheWritten = true;
    return true;
  };

  try {
    await MidoriBlockerService._initFromLocalSourcesAndCache(
      [STORED_DESCRIPTOR],
      1
    );
    Assert.equal(
      MidoriBlockerService._engine,
      previousEngine,
      "A candidate from a stale generation should not replace the engine"
    );
    Assert.equal(
      cacheWritten,
      false,
      "A candidate from a stale generation should not update the cache"
    );
  } finally {
    MidoriBlockerService._initGeneration = originalGeneration;
    MidoriBlockerService._engine = originalEngine;
    MidoriBlockerService._resolveLocalListRecords =
      originalResolveLocalListRecords;
    MidoriBlockerService._preprocessListRecords =
      originalPreprocessListRecords;
    MidoriBlockerService._createEngineFromListRecords =
      originalCreateEngineFromListRecords;
    EngineCache.write = originalCacheWrite;
  }
});

add_task(
  async function test_engine_cache_rejects_incomplete_bundled_baseline() {
    const storedRecord = record(STORED_DESCRIPTOR, "||stored.example^\n");
    const fallbackRecord = record(FALLBACK_DESCRIPTOR, "||fallback.example^\n");

    await EngineCache.clear();
    try {
      Assert.equal(
        await EngineCache.write(engineWithBytes([1, 2, 3]), DESCRIPTORS, [
          storedRecord,
        ]),
        false,
        "An incomplete bundled baseline should not be cached"
      );
      Assert.equal(
        await EngineCache.matchesCurrentLists(DESCRIPTORS, [storedRecord]),
        false,
        "An incomplete list set should never match a cache"
      );

      const completeRecords = [storedRecord, fallbackRecord];
      Assert.equal(
        await EngineCache.write(
          engineWithBytes([4, 5, 6]),
          DESCRIPTORS,
          completeRecords
        ),
        true,
        "A complete bundled baseline should be cached"
      );
      Assert.equal(
        await EngineCache.matchesCurrentLists(DESCRIPTORS, completeRecords),
        true,
        "The complete list set should match its cache metadata"
      );
      Assert.equal(
        await EngineCache.write(engineWithBytes([7, 8, 9]), DESCRIPTORS, [
          storedRecord,
        ]),
        false,
        "An incomplete rewrite should be rejected"
      );
      Assert.equal(
        await EngineCache.matchesCurrentLists(DESCRIPTORS, completeRecords),
        false,
        "Rejecting an incomplete rewrite should clear the stale complete cache"
      );
    } finally {
      await EngineCache.clear();
    }
  }
);
