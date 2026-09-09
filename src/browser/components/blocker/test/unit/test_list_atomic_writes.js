/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { CACHE_ROOT_DIR_NAME } = ChromeUtils.importESModule(
  "resource:///modules/MidoriBlockerUtils.sys.mjs"
);
const {
  EngineCache,
  cacheMetaFileName,
  engineCacheFileName,
  engineConfigurationHash,
} = ChromeUtils.importESModule(
  "resource:///modules/internal/EngineCache.sys.mjs"
);
const { ListStore } = ChromeUtils.importESModule(
  "resource:///modules/internal/ListStore.sys.mjs"
);

do_get_profile();

const DESCRIPTORS = [
  {
    filename: "atomic.txt",
    url: "https://example.com/atomic.txt",
  },
];
const LIST_RECORDS = [
  {
    filename: "atomic.txt",
    text: "||example.com^\n",
    url: "https://example.com/atomic.txt",
  },
];

function engineWithBytes(bytes) {
  return {
    serialize() {
      return new Uint8Array(bytes);
    },
  };
}

function engineCachePaths() {
  const root = PathUtils.join(PathUtils.profileDir, CACHE_ROOT_DIR_NAME);
  const dataPath = PathUtils.join(root, engineCacheFileName());
  const metadataPath = PathUtils.join(root, cacheMetaFileName());
  return {
    dataPath,
    dataTmpPath: `${dataPath}.tmp`,
    metadataPath,
    metadataTmpPath: `${metadataPath}.tmp`,
  };
}

add_task(function test_engine_cache_configuration_hash_tracks_list_prefs() {
  const pref = "midori.blocker.enabledLists";
  const original = Services.prefs.prefHasUserValue(pref)
    ? Services.prefs.getStringPref(pref)
    : null;

  try {
    Services.prefs.setStringPref(pref, '{"easylist":true}');
    const firstHash = engineConfigurationHash();
    const firstName = engineCacheFileName();
    Services.prefs.setStringPref(pref, '{"easylist":false}');

    Assert.notEqual(
      engineConfigurationHash(),
      firstHash,
      "The cache fingerprint should change with list selection"
    );
    Assert.notEqual(
      engineCacheFileName(),
      firstName,
      "The synchronous cache path should change with list selection"
    );
  } finally {
    if (original === null) {
      Services.prefs.clearUserPref(pref);
    } else {
      Services.prefs.setStringPref(pref, original);
    }
  }
});

async function removePath(path) {
  await IOUtils.remove(path, { ignoreAbsent: true, recursive: true });
}

add_task(
  async function test_list_store_write_text_preserves_destination_on_failure() {
    const path = PathUtils.join(PathUtils.profileDir, "list-store-atomic.txt");
    const tmpPath = `${path}.tmp`;

    await removePath(path);
    await removePath(tmpPath);
    await IOUtils.writeUTF8(path, "old contents");
    await IOUtils.makeDirectory(tmpPath);

    let rejected = false;
    try {
      await ListStore.writeText(path, "new contents");
    } catch (_) {
      rejected = true;
    }

    Assert.ok(rejected, "The temp-path collision should reject the write");
    Assert.equal(
      await IOUtils.readUTF8(path),
      "old contents",
      "A failed temp-file write should leave the destination untouched"
    );

    await removePath(path);
    await removePath(tmpPath);
  }
);

add_task(async function test_list_store_write_json_cleans_up_tmp_path() {
  const path = PathUtils.join(PathUtils.profileDir, "list-store-atomic.json");
  const tmpPath = `${path}.tmp`;

  await removePath(path);
  await removePath(tmpPath);
  await ListStore.writeJSON(path, { ok: true });

  Assert.deepEqual(
    JSON.parse(await IOUtils.readUTF8(path)),
    { ok: true },
    "ListStore.writeJSON should write valid JSON"
  );
  Assert.ok(
    !(await IOUtils.exists(tmpPath)),
    "A successful atomic JSON write should not leave its temp path behind"
  );

  await removePath(path);
});

add_task(async function test_engine_cache_writes_clean_up_tmp_paths() {
  const paths = engineCachePaths();
  await EngineCache.clear();

  try {
    await EngineCache.write(
      engineWithBytes([1, 2, 3]),
      DESCRIPTORS,
      LIST_RECORDS
    );

    Assert.ok(
      await IOUtils.exists(paths.dataPath),
      "Engine cache data should be written"
    );
    Assert.ok(
      await IOUtils.exists(paths.metadataPath),
      "Engine cache metadata should be written"
    );
    Assert.ok(
      !(await IOUtils.exists(paths.dataTmpPath)),
      "Engine cache data should not leave its temp path behind"
    );
    Assert.ok(
      !(await IOUtils.exists(paths.metadataTmpPath)),
      "Engine cache metadata should not leave its temp path behind"
    );
  } finally {
    await EngineCache.clear();
  }
});

add_task(
  async function test_engine_cache_preserves_existing_cache_on_failure() {
    const paths = engineCachePaths();
    await EngineCache.clear();
    await EngineCache.write(
      engineWithBytes([1, 2, 3]),
      DESCRIPTORS,
      LIST_RECORDS
    );

    const originalBytes = Array.from(await EngineCache.read());
    await removePath(paths.dataTmpPath);
    await IOUtils.makeDirectory(paths.dataTmpPath);

    let rejected = false;
    try {
      await EngineCache.write(
        engineWithBytes([4, 5, 6]),
        DESCRIPTORS,
        LIST_RECORDS
      );
    } catch (_) {
      rejected = true;
    }

    Assert.ok(
      rejected,
      "The temp-path collision should reject the cache write"
    );
    Assert.deepEqual(
      Array.from(await EngineCache.read()),
      originalBytes,
      "A failed temp-file cache write should leave the prior cache intact"
    );

    await removePath(paths.dataTmpPath);
    await EngineCache.clear();
  }
);
