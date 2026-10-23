/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task, registerCleanupFunction */

const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
const { XPIExports } = ChromeUtils.importESModule("resource://gre/modules/addons/XPIExports.sys.mjs");
const addonId = "amosigned-xpi@tests.mozilla.org";
const { ExtensionStorage } = ChromeUtils.importESModule("resource://gre/modules/ExtensionStorage.sys.mjs");
const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");

add_task(async function native_extension_state_and_removal_causes_survive_sigkill() {
  const stage = Services.env.get("MIDORI_SYNC_DURABILITY_STAGE");
  const change = Services.env.get("MIDORI_SYNC_DURABILITY_CHANGE");
  const root = Services.env.get("MIDORI_SYNC_TEST_KEYRING_ROOT");
  const backend = Services.env.get("MIDORI_SYNC_DURABILITY_BACKEND");
  Assert.ok(root.startsWith("/tmp/midori-sync-native-"));
  Assert.equal(backend, "native");
  Assert.equal(PathUtils.profileDir, PathUtils.join(root, `durability-${backend}-profile`));
  const permissionBackend = ExtensionPermissions._getStore().constructor.name;
  Assert.ok(["LegacyPermissionStore", "PermissionStore"].includes(permissionBackend));
  Assert.ok(["apply", "verify"].includes(stage));
  Assert.ok(["create", "disable", "uninstall-user", "reinstall", "undo", "uninstall-policy", "uninstall-sync"].includes(change));
  const present = !change.startsWith("uninstall-");
  const enabled = change !== "disable";
  const source = present ? null : change.slice("uninstall-".length);
  const proofPath = PathUtils.join(root, `extension-local-data-proof-${backend}.json`);
  await AddonManager.getAddonByID(addonId);
  const verify = async () => {
    const addon = await AddonManager.getAddonByID(addonId);
    Assert.equal(!!addon, present, "Native state is checked before any Sync replay");
    if (addon) {
      Assert.equal(addon.signedState, AddonManager.SIGNEDSTATE_SIGNED);
      Assert.equal(addon.userDisabled, !enabled);
      Assert.ok(!(addon.pendingOperations & AddonManager.PENDING_UNINSTALL));
    }
    const state = XPIExports.XPIDatabase.getSyncAddonState(addonId);
    Assert.ok(state?.tracked);
    Assert.equal(state.removal?.source ?? null, source);
    const database = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, "extensions.json"));
    const saved = database.addons.find(item => item.id === addonId);
    Assert.equal(!!saved, present);
    if (saved) { Assert.equal(saved.userDisabled, !enabled); }
    Assert.deepEqual(database.midoriSync.removals.find(item => item.addonId === addonId) ?? null, state.removal);
    const startup = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, "addonStartup.json.lz4"), { decompress: true });
    const entry = Object.values(startup).map(location => location.addons?.[addonId]).find(Boolean);
    Assert.equal(!!entry, present);
    if (entry) { Assert.equal(entry.enabled, enabled); }
    const proof = await IOUtils.readJSON(proofPath);
    Assert.equal(permissionBackend, proof.permissionBackend, "The compiled backend is unchanged across the cold restart");
    const retained = present || source === "sync";
    Assert.equal(JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids", "{}"))[addonId], retained ? proof.uuid : undefined);
    Assert.deepEqual(await ExtensionStorage.get(addonId, null), retained ? proof.data : {},
      "Device-local extension data is checked before any adapter or Sync replay");
    Assert.equal((await ExtensionPermissions._get(addonId)).permissions.includes("clipboardWrite"), present,
      "The native permission database agrees before any replay");
    Assert.equal((await ExtensionPermissions.get(addonId)).permissions.includes("clipboardWrite"), present,
      "The startup cache cannot revive an optional grant after uninstall");
  };
  if (stage === "verify") {
    await verify();
    return;
  }
  const install = async () => {
    const { AddonTestUtils } = ChromeUtils.importESModule("resource://testing-common/AddonTestUtils.sys.mjs");
    AddonTestUtils.initMochitest({ registerCleanupFunction, info() {}, Assert });
    const xpi = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    xpi.initWithPath(Services.env.get("MIDORI_SYNC_SIGNED_EXTENSION_FIXTURE"));
    await AddonTestUtils.promiseInstallFile(xpi);
    await XPIExports.XPIDatabase.trackSyncAddon(addonId);
    const data = { retained: `Synthetic local settings for ${change}` };
    await ExtensionStorage.set(addonId, data);
    await (await ExtensionStorage.getFile(addonId)).saveNow();
    await ExtensionPermissions.add(addonId, { permissions: ["clipboardWrite"], origins: [] });
    await IOUtils.writeJSON(proofPath, { data, permissionBackend,
      uuid: JSON.parse(Services.prefs.getStringPref("extensions.webextensions.uuids"))[addonId],
    }, { flush: true, permissions: 0o600 });
  };
  if (["create", "reinstall", "uninstall-sync"].includes(change)) { await install(); }
  const addon = await AddonManager.getAddonByID(addonId);
  Assert.ok(addon);
  if (change === "disable") {
    await addon.disable();
  } else if (source) {
    await addon.uninstall(false, { syncSource: source });
  } else if (change === "undo") {
    await addon.uninstall(true);
    Assert.ok(addon.pendingOperations & AddonManager.PENDING_UNINSTALL);
    addon.cancelUninstall();
  }
  const { createSyncExtensionStore } = ChromeUtils.importESModule("resource:///modules/MidoriSyncExtensionStore.sys.mjs");
  const store = createSyncExtensionStore();
  Assert.ok(await store.persist("amo", addonId, await store.read("amo", addonId)),
    "The production extension barrier completes before the abrupt-stop checkpoint");
  await verify();
  await IOUtils.writeJSON(Services.env.get("MIDORI_SYNC_DURABILITY_CHECKPOINT"), {
    pid: Services.appinfo.processID, profile: PathUtils.profileDir,
    acknowledged: ["native-extensions"], change, backend,
  }, { flush: true, permissions: 0o600 });
  await new Promise(() => {});
});
