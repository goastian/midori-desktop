/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { LIST_DESCRIPTOR_ORIGIN_CUSTOM, ListCatalog } =
  ChromeUtils.importESModule(
    "resource:///modules/internal/ListCatalog.sys.mjs"
  );
const { ListStore } = ChromeUtils.importESModule(
  "resource:///modules/internal/ListStore.sys.mjs"
);
const { ListUpdatesState } = ChromeUtils.importESModule(
  "resource:///modules/internal/ListUpdates.sys.mjs"
);
const { MidoriBlockerService } = ChromeUtils.importESModule(
  "resource:///modules/MidoriBlockerService.sys.mjs"
);
const { MidoriSyncPreferences } = ChromeUtils.importESModule(
  "resource:///modules/MidoriSyncPreferences.sys.mjs"
);

do_get_profile();

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function textResponse(text, etag) {
  return {
    body: null,
    headers: {
      get(name) {
        if (name.toLowerCase() === "etag") {
          return etag;
        }
        return null;
      },
    },
    ok: true,
    status: 200,
    text: async () => text,
    type: "basic",
  };
}

async function withMockedFetch(fetchImpl, task) {
  await task(fetchImpl);
}

async function withListPaths(name, task) {
  const listsDir = PathUtils.join(PathUtils.profileDir, name);
  const metaPath = PathUtils.join(listsDir, "metadata.json");
  const listPath = filename => PathUtils.join(listsDir, filename);

  await IOUtils.remove(listsDir, { ignoreAbsent: true, recursive: true });
  await IOUtils.makeDirectory(listsDir, {
    createAncestors: true,
    ignoreExisting: true,
  });

  const originalListPath = ListStore.listPath;
  const originalListsDirPath = ListStore.listsDirPath;
  const originalListsMetadataPath = ListStore.listsMetadataPath;

  ListStore.listPath = listPath;
  ListStore.listsDirPath = () => listsDir;
  ListStore.listsMetadataPath = () => metaPath;

  try {
    await task({ listPath, metaPath });
  } finally {
    ListStore.listPath = originalListPath;
    ListStore.listsDirPath = originalListsDirPath;
    ListStore.listsMetadataPath = originalListsMetadataPath;
    await IOUtils.remove(listsDir, { ignoreAbsent: true, recursive: true });
  }
}

add_task(async function test_list_updates_are_serialized() {
  await withListPaths(
    "serialized-list-write-test",
    async ({ listPath, metaPath }) => {
      const descriptor = {
        filename: "shared.txt",
        listOrigin: LIST_DESCRIPTOR_ORIGIN_CUSTOM,
        url: "https://example.com/shared.txt",
      };
      const initBody = "||init.example^\n";
      const updateBody = "||update.example^\n";
      let fetchCount = 0;

      const originalGetListDescriptors = ListCatalog.getListDescriptors;
      const originalWriteText = ListStore.writeText;
      const firstListWritten = deferred();
      const resumeFirstUpdate = deferred();
      let didPauseFirstWrite = false;
      let didReleaseFirstWrite = false;
      let firstUpdatePromise = null;
      let secondUpdatePromise = null;

      function releaseFirstWrite() {
        if (!didReleaseFirstWrite) {
          didReleaseFirstWrite = true;
          resumeFirstUpdate.resolve();
        }
      }

      await withMockedFetch(
        async () => {
          fetchCount++;
          if (fetchCount === 1) {
            return textResponse(initBody, '"init"');
          }
          return textResponse(updateBody, '"update"');
        },
        async mockFetch => {
          try {
            ListCatalog.getListDescriptors = async () => [descriptor];
            ListStore.writeText = async function pausedWriteText(path, text) {
              await originalWriteText.call(this, path, text);

              if (!didPauseFirstWrite) {
                didPauseFirstWrite = true;
                firstListWritten.resolve();
                await resumeFirstUpdate.promise;
              }
            };

            const firstUpdateState = new ListUpdatesState({
              fetchImpl: mockFetch,
            });
            const secondUpdateState = new ListUpdatesState({
              fetchImpl: mockFetch,
            });
            firstUpdatePromise = firstUpdateState.updateIfNeeded();

            await Promise.race([
              firstListWritten.promise,
              firstUpdatePromise.then(
                () =>
                  Promise.reject(
                    new Error("First update finished before its write paused")
                  ),
                error => Promise.reject(error)
              ),
            ]);

            secondUpdatePromise = secondUpdateState.updateIfNeeded({
              force: true,
            });
            await Promise.resolve();
            Assert.equal(
              fetchCount,
              1,
              "The second update should wait for the first write lock"
            );
            releaseFirstWrite();

            const [firstUpdateResult, secondUpdateResult] = await Promise.all([
              firstUpdatePromise,
              secondUpdatePromise,
            ]);

            Assert.equal(
              firstUpdateResult?.anyUpdated,
              true,
              "The first update should report a written list"
            );
            Assert.equal(
              secondUpdateResult?.anyUpdated,
              true,
              "The second update should report a written list"
            );
            Assert.equal(
              await IOUtils.readUTF8(listPath(descriptor.filename)),
              updateBody,
              "The list file should contain the second update body"
            );

            const metadata = JSON.parse(await IOUtils.readUTF8(metaPath));
            Assert.equal(
              metadata.lists.length,
              1,
              "Metadata should have one entry"
            );
            Assert.equal(
              metadata.lists[0].etag,
              '"update"',
              "Metadata should describe the second update"
            );
            Assert.equal(
              metadata.lists[0].filename,
              descriptor.filename,
              "Metadata should keep the descriptor filename"
            );
          } finally {
            releaseFirstWrite();
            try {
              await Promise.allSettled(
                [firstUpdatePromise, secondUpdatePromise].filter(Boolean)
              );
            } finally {
              ListCatalog.getListDescriptors = originalGetListDescriptors;
              ListStore.writeText = originalWriteText;
            }
          }
        }
      );
    }
  );
});

add_task(async function failed_custom_filter_edit_cannot_undo_a_later_edit() {
  const path = ListStore.customFiltersPath();
  const pref = "midori.blocker.customFiltersEnabled";
  const previousPref = Services.prefs.prefHasUserValue(pref)
    ? Services.prefs.getBoolPref(pref) : null;
  const originalEnabled = MidoriBlockerService.isEnabled;
  const originalPath = MidoriBlockerService._customFiltersPath;
  const originalRebuild = MidoriBlockerService._rebuildEngineFromCurrentSources;
  const rebuilding = deferred();
  const resume = deferred();
  let rebuilds = 0;
  let pathReads = 0;
  let first;
  let second;
  try {
    Assert.ok(!(await IOUtils.exists(path)), "The fixture owns a fresh custom-filter file");
    await ListStore.setCustomFiltersText("||initial.example^\n");
    Services.prefs.setBoolPref(pref, false);
    MidoriBlockerService.isEnabled = () => true;
    MidoriBlockerService._customFiltersPath = () => {
      pathReads++;
      return path;
    };
    MidoriBlockerService._rebuildEngineFromCurrentSources = async () => {
      if (++rebuilds === 1) {
        rebuilding.resolve();
        await resume.promise;
        throw new Error("synthetic first rebuild failure");
      }
    };
    first = MidoriBlockerService.setCustomFiltersText("||first.example^\n", { enabled: true });
    const rejected = Assert.rejects(first, /synthetic first rebuild failure/);
    await Promise.race([
      rebuilding.promise,
      first.then(() => { throw new Error("The first rebuild was not reached"); }),
    ]);
    second = MidoriBlockerService.setCustomFiltersText("||second.example^\n", { enabled: true });
    if (pathReads > 1) {
      await second;
    }
    resume.resolve();
    await rejected;
    await second;
    Assert.equal(await ListStore.getCustomFiltersText(), "||second.example^\n",
      "Rolling back an earlier failure cannot erase a later successful edit");
    Assert.ok(MidoriBlockerService.areCustomFiltersEnabled(),
      "The successful edit retains its enabled state");
  } finally {
    resume.resolve();
    await Promise.allSettled([first, second].filter(Boolean));
    MidoriBlockerService.isEnabled = originalEnabled;
    MidoriBlockerService._customFiltersPath = originalPath;
    MidoriBlockerService._rebuildEngineFromCurrentSources = originalRebuild;
    if (previousPref === null) {
      Services.prefs.clearUserPref(pref);
    } else {
      Services.prefs.setBoolPref(pref, previousPref);
    }
    await IOUtils.remove(path, { ignoreAbsent: true });
  }
});

add_task(async function unreadable_custom_filters_are_preserved() {
  if (Services.appinfo.OS === "WINNT") {
    return;
  }
  const path = ListStore.customFiltersPath();
  const pref = "midori.blocker.customFiltersEnabled";
  const previousPref = Services.prefs.prefHasUserValue(pref)
    ? Services.prefs.getBoolPref(pref) : null;
  const originalEnabled = MidoriBlockerService.isEnabled;
  const originalRebuild = MidoriBlockerService._rebuildEngineFromCurrentSources;
  try {
    await ListStore.setCustomFiltersText("||keep.example^\n");
    Services.prefs.setBoolPref(pref, false);
    MidoriBlockerService.isEnabled = () => true;
    MidoriBlockerService._rebuildEngineFromCurrentSources = async () => {
      throw new Error("synthetic rebuild failure");
    };
    await IOUtils.setPermissions(path, 0);
    let unreadable = false;
    try {
      await IOUtils.readUTF8(path);
    } catch {
      unreadable = true;
    }
    if (!unreadable) {
      info("The process can bypass file permissions; this fault cannot be injected here");
      return;
    }
    await Assert.rejects(MidoriBlockerService.setCustomFiltersText("||replace.example^\n", { enabled: true }),
      error => error.name !== "Error", "The original read error is propagated before modifying filters");
    await IOUtils.setPermissions(path, 0o600);
    Assert.equal(await ListStore.getCustomFiltersText(), "||keep.example^\n");
    Assert.ok(!MidoriBlockerService.areCustomFiltersEnabled());
  } finally {
    await IOUtils.setPermissions(path, 0o600);
    await IOUtils.remove(path, { ignoreAbsent: true });
    MidoriBlockerService.isEnabled = originalEnabled;
    MidoriBlockerService._rebuildEngineFromCurrentSources = originalRebuild;
    if (previousPref === null) {
      Services.prefs.clearUserPref(pref);
    } else {
      Services.prefs.setBoolPref(pref, previousPref);
    }
  }
});

add_task(async function stable_snapshots_wait_for_rollback_and_conditional_edits_preserve_newer_text() {
  const path = ListStore.customFiltersPath();
  const originalEnabled = MidoriBlockerService.isEnabled;
  const originalRebuild = MidoriBlockerService._rebuildEngineFromCurrentSources;
  const rebuilding = deferred();
  const resume = deferred();
  let rebuilds = 0;
  let first;
  let reading;
  let notifications = 0;
  const stop = MidoriBlockerService.observeCustomFilters(() => ++notifications);
  try {
    await ListStore.setCustomFiltersText("||initial.example^\n");
    MidoriBlockerService.isEnabled = () => true;
    MidoriBlockerService._rebuildEngineFromCurrentSources = async () => {
      if (++rebuilds === 1) {
        rebuilding.resolve();
        await resume.promise;
        throw new Error("synthetic snapshot rebuild failure");
      }
    };
    first = MidoriBlockerService.setCustomFiltersText("||temporary.example^\n");
    const rejected = Assert.rejects(first, /synthetic snapshot rebuild failure/);
    await Promise.race([rebuilding.promise, first]);
    reading = MidoriBlockerService.readCustomFiltersSnapshot();
    resume.resolve();
    await rejected;
    Assert.equal(notifications, 0, "A rolled-back edit never wakes Sync or an open editor");
    const snapshot = await reading;
    Assert.deepEqual(snapshot, { present: true, text: "||initial.example^\n" },
      "A snapshot cannot expose an edit that later rolls back");
    await MidoriBlockerService.setCustomFiltersText("||newer.example^\n");
    Assert.equal(notifications, 1);
    const changed = await MidoriBlockerService.updateCustomFiltersText(current =>
      current.present === snapshot.present && current.text === snapshot.text ? "||remote.example^\n" : null
    );
    Assert.ok(!changed, "A conditional remote edit respects a newer local value");
    Assert.equal((await MidoriBlockerService.readCustomFiltersSnapshot()).text, "||newer.example^\n");
    await Assert.rejects(MidoriBlockerService.updateCustomFiltersText(() => {
      throw new Error("synthetic update failure");
    }), /synthetic update failure/);
    Assert.ok(await MidoriBlockerService.updateCustomFiltersText(() => "||final.example^\n"),
      "A failed callback does not poison the write queue");
    Assert.equal((await MidoriBlockerService.readCustomFiltersSnapshot()).text, "||final.example^\n");
    Assert.equal(notifications, 2, "Only successful native changes notify observers");
  } finally {
    stop();
    resume.resolve();
    await Promise.allSettled([first, reading].filter(Boolean));
    MidoriBlockerService.isEnabled = originalEnabled;
    MidoriBlockerService._rebuildEngineFromCurrentSources = originalRebuild;
    await IOUtils.remove(path, { ignoreAbsent: true });
  }
});

add_task(async function empty_filters_are_explicit_without_creating_an_enabled_override() {
  const path = ListStore.customFiltersPath();
  const pref = "midori.blocker.customFiltersEnabled";
  const previousPref = Services.prefs.prefHasUserValue(pref)
    ? Services.prefs.getBoolPref(pref) : null;
  const originalEnabled = MidoriBlockerService.isEnabled;
  try {
    Services.prefs.clearUserPref(pref);
    MidoriBlockerService.isEnabled = () => false;
    Assert.deepEqual(await MidoriBlockerService.readCustomFiltersSnapshot(), { present: false, text: "" });
    Assert.ok(await MidoriBlockerService.updateCustomFiltersText(() => ""));
    Assert.deepEqual(await MidoriBlockerService.readCustomFiltersSnapshot(), { present: true, text: "" },
      "An explicit clear is distinct from an untouched profile");
    Assert.ok(!Services.prefs.prefHasUserValue(pref), "Text synchronization does not invent an activation preference");
    Assert.ok(!await MidoriBlockerService.updateCustomFiltersText(() => ""), "Replaying the same value is harmless");
    await MidoriBlockerService.setCustomFiltersText("||example.invalid^\n");
    Assert.ok(!Services.prefs.prefHasUserValue(pref), "Ordinary text edits preserve an implicit activation default");
  } finally {
    MidoriBlockerService.isEnabled = originalEnabled;
    if (previousPref === null) {
      Services.prefs.clearUserPref(pref);
    } else {
      Services.prefs.setBoolPref(pref, previousPref);
    }
    await IOUtils.remove(path, { ignoreAbsent: true });
  }
});

add_task(async function a_failed_filter_edit_cannot_undo_an_incoming_activation_preference() {
  const path = ListStore.customFiltersPath();
  const pref = "midori.blocker.customFiltersEnabled";
  const previousPref = Services.prefs.prefHasUserValue(pref)
    ? Services.prefs.getBoolPref(pref) : null;
  const originalEnabled = MidoriBlockerService.isEnabled;
  const originalRebuild = MidoriBlockerService._rebuildEngineFromCurrentSources;
  const rebuilding = deferred();
  const resume = deferred();
  const preferences = new MidoriSyncPreferences();
  let rebuilds = 0;
  let first;
  let reading;
  let incoming;
  try {
    await ListStore.setCustomFiltersText("||initial.example^\n");
    Services.prefs.setBoolPref(pref, false);
    MidoriBlockerService.isEnabled = () => true;
    MidoriBlockerService._rebuildEngineFromCurrentSources = async () => {
      if (++rebuilds === 1) {
        rebuilding.resolve();
        await resume.promise;
        throw new Error("synthetic activation rebuild failure");
      }
    };
    first = MidoriBlockerService.setCustomFiltersText("||temporary.example^\n", { enabled: true });
    const rejected = Assert.rejects(first, /synthetic activation rebuild failure/);
    await Promise.race([rebuilding.promise, first]);
    const remote = Services.prefs.prefHasUserValue(pref)
      ? { version: 1, name: pref, value: true } : null;
    reading = preferences.read(pref);
    incoming = preferences.apply({ id: pref, deleted: remote === null, value: remote },
    { id: pref, deleted: false, value: { version: 1, name: pref, value: false } });
    if (!incoming || typeof incoming.then !== "function") {
      Assert.deepEqual(incoming, { status: "applied" });
    }
    resume.resolve();
    await rejected;
    Assert.deepEqual(await reading, { version: 1, name: pref, value: false },
      "Capture waits for the local edit to settle rather than publishing its temporary value");
    Assert.deepEqual(await incoming, { status: "applied" });
    Assert.ok(Services.prefs.getBoolPref(pref), "The acknowledged remote preference survives the earlier local rollback");
  } finally {
    resume.resolve();
    await Promise.allSettled([first, reading, incoming].filter(Boolean));
    preferences.close();
    MidoriBlockerService.isEnabled = originalEnabled;
    MidoriBlockerService._rebuildEngineFromCurrentSources = originalRebuild;
    if (previousPref === null) {
      Services.prefs.clearUserPref(pref);
    } else {
      Services.prefs.setBoolPref(pref, previousPref);
    }
    await IOUtils.remove(path, { ignoreAbsent: true });
  }
});
