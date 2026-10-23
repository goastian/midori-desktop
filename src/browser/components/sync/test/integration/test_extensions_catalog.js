/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task */

const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
const { createSyncExtensionStore } = ChromeUtils.importESModule("resource:///modules/MidoriSyncExtensionStore.sys.mjs");
const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");

add_task(async function the_production_store_installs_a_real_official_catalog_reference() {
  const root = Services.env.get("MIDORI_SYNC_TEST_KEYRING_ROOT");
  Assert.ok(root.startsWith("/tmp/midori-sync-native-"));
  Assert.equal(PathUtils.profileDir, PathUtils.join(root, "extensions-live-A"));
  Services.prefs.clearUserPref("extensions.getAddons.get.url");
  Assert.ok(Services.prefs.getStringPref("extensions.getAddons.get.url").startsWith("https://services.addons.mozilla.org/"),
    "Restore the shipped catalog after Marionette's dummy test endpoint");
  const addonId = "uBlock0@raymondhill.net";
  Assert.equal(await AddonManager.getAddonByID(addonId), null);
  const window = Services.wm.getMostRecentWindow("navigator:browser");
  const browser = window.gBrowser.selectedBrowser;
  let prompts = 0;
  let checkpointed = false;
  const approve = () => {
    if (!window.PopupNotifications.getNotification("addon-webext-permissions", browser)) { return; }
    Assert.ok(checkpointed, "The production callback precedes the real native permission request");
    ++prompts;
    window.document.getElementById("addon-webext-permissions-notification").button.click();
  };
  window.PopupNotifications.panel.addEventListener("popupshown", approve);
  const store = createSyncExtensionStore();
  try {
    const result = await store.install({
      desired: { version: 1, type: "extension", catalog: "amo", addonId, enabled: false },
      expected: await store.read("amo", addonId), signal: new AbortController().signal,
      beforePermissionPrompt: async () => { checkpointed = true; },
    });
    Assert.deepEqual(result, { status: "applied" });
    Assert.equal(prompts, 1);
    const addon = await AddonManager.getAddonByID(addonId);
    Assert.ok([AddonManager.SIGNEDSTATE_SIGNED, AddonManager.SIGNEDSTATE_PRIVILEGED].includes(addon.signedState));
    Assert.equal(addon.isCompatible, true);
    Assert.equal(addon.userDisabled, true);
    Assert.equal(addon.isActive, false, "The real catalog fixture remains disabled in its private test profile");
    Assert.equal((await store.read("amo", addonId)).scope, "user");
    Assert.deepEqual((await ExtensionPermissions.get(addonId)).permissions, []);
    await IOUtils.writeJSON(PathUtils.join(root, "extensions-catalog-proof.json"), {
      addonId, version: addon.version, signedState: addon.signedState,
      compatible: addon.isCompatible, userDisabled: addon.userDisabled, prompts,
      catalogOverride: false, certificateOverride: false,
    }, { permissions: 0o600, flush: true });
    await addon.uninstall();
    Assert.ok(await store.persist("amo", addonId, await store.read("amo", addonId)));
    Assert.equal(await AddonManager.getAddonByID(addonId), null);
  } finally {
    window.PopupNotifications.panel.removeEventListener("popupshown", approve);
  }
});
