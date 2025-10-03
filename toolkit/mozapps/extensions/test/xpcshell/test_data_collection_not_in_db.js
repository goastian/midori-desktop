/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

// We don't have an easy way to serve update manifests from a secure URL.
Services.prefs.setBoolPref(PREF_EM_CHECK_UPDATE_SECURITY, false);
Services.prefs.setBoolPref(PREF_DATA_COLLECTION_PERMISSIONS_ENABLED, true);

const server = AddonTestUtils.createHttpServer();

add_setup(async () => {
  ExtensionTestUtils.mockAppInfo();
});

async function deleteDataCollectionFromDB(addonId) {
  await promiseShutdownManager();

  info(`Modifying ${gExtensionsJSON.path} to drop data_collection`);
  let json = await IOUtils.readJSON(gExtensionsJSON.path);
  let addonDbItem = json.addons.find(a => a.id === addonId);

  function simulateAddonDbItemWithoutDataCollection(propName) {
    ok(
      Array.isArray(addonDbItem[propName].data_collection),
      `Sanity check: ${propName}.data_collection is an Array`
    );
    delete addonDbItem[propName].data_collection;
  }
  // Drop the "data_collection" field from every object describing permissions.
  simulateAddonDbItemWithoutDataCollection("userPermissions");
  simulateAddonDbItemWithoutDataCollection("optionalPermissions");
  simulateAddonDbItemWithoutDataCollection("requestedPermissions");

  // Now write the modifications.
  await IOUtils.writeJSON(gExtensionsJSON.path, json);

  await promiseStartupManager();
}

function prepareToServeUpdate(extensionData) {
  const id = extensionData.manifest.browser_specific_settings.gecko.id;

  const xpi = AddonTestUtils.createTempWebExtensionFile(extensionData);

  const serverHost = `http://localhost:${server.identity.primaryPort}`;
  const updatesPath = "/updates.json";
  const xpiFilename = "/update.xpi";
  server.registerFile(xpiFilename, xpi);
  AddonTestUtils.registerJSON(server, updatesPath, {
    addons: {
      [id]: {
        updates: [
          {
            version: extensionData.manifest.version,
            update_link: `${serverHost}${xpiFilename}`,
          },
        ],
      },
    },
  });
  Services.prefs.setStringPref(
    "extensions.update.background.url",
    `${serverHost}${updatesPath}`
  );
}

// Regression test for https://bugzilla.mozilla.org/show_bug.cgi?id=1984724
add_task(async function test_db_without_data_collection_background_update() {
  const ID = "@addon-without-data_collection-in-extensions.json";

  await promiseStartupManager();

  info("Preparing extensions.json without data_collection");
  {
    let startedPromise = promiseWebExtensionStartup(ID);
    await promiseInstallWebExtension({
      manifest: {
        version: "1.0",
        browser_specific_settings: { gecko: { id: ID } },
      },
    });
    await startedPromise;
    await deleteDataCollectionFromDB(ID);

    let addon = await AddonManager.getAddonByID(ID);
    Assert.deepEqual(
      addon.userPermissions,
      { permissions: [], origins: [] },
      ".userPermissions is read from extensions.json (without data_collection)"
    );
  }

  // Setup and sanity check completed - we have simulated the scenario relevant
  // to bug 1984724 (user starts Firefox with extensions.json from old profile,
  // without a forced extensions.json rebuild for other reasons).

  info("Preparing update to version with data_collection_permissions");
  prepareToServeUpdate({
    manifest: {
      version: "2.0",
      browser_specific_settings: {
        gecko: {
          id: ID,
          data_collection_permissions: { required: ["none"] },
        },
      },
    },
  });

  function promptObserver() {
    // We should not be getting the prompt because the update does not specify
    // required data_collection_permissions values.
    Assert.ok(false, "Unexpected webextension-update-permission-prompt");
  }
  Services.obs.addObserver(
    promptObserver,
    "webextension-update-permission-prompt"
  );

  let restartAfterUpdatePromise = promiseWebExtensionStartup(ID);
  await AddonManagerPrivate.backgroundUpdateCheck();
  info("Update check done. Waiting for extension to update and restart");
  await restartAfterUpdatePromise;

  // Getting here without error is the regression test for bug 1984724.
  // Prior to the fix, we'd get errors as seen at:
  // - https://bugzilla.mozilla.org/show_bug.cgi?id=1984724#c22
  // - https://bugzilla.mozilla.org/show_bug.cgi?id=1984724#c23

  let addon = await AddonManager.getAddonByID(ID);
  equal(addon.version, "2.0", "Add-on was updated");
  Assert.deepEqual(
    addon.userPermissions,
    { permissions: [], origins: [], data_collection: ["none"] },
    ".userPermissions now contains the updated data_collection"
  );
  Services.obs.removeObserver(
    promptObserver,
    "webextension-update-permission-prompt"
  );

  await addon.uninstall();
  await promiseShutdownManager();
});
