/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Parent-side JSWindowActor for Chrome Web Store installs.
 * Receives requests from MidoriCWSChild and delegates to MidoriCWSInstaller.
 */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  MidoriCWSConstants:
    "resource:///modules/MidoriCWSConstants.sys.mjs",
  MidoriCWSInstaller:
    "resource:///modules/MidoriCWSInstaller.sys.mjs",
});

export class MidoriCWSParent extends JSWindowActorParent {
  async receiveMessage(message) {
    if (
      !Services.prefs.getBoolPref(
        lazy.MidoriCWSConstants.PREF_ENABLED,
        true
      )
    ) {
      return { success: false, error: "CWS support disabled" };
    }

    switch (message.name) {
      case "MidoriCWS:Install":
        return this._handleInstall(message.data);
      case "MidoriCWS:IsInstalled":
        return this._handleIsInstalled(message.data);
      default:
        return null;
    }
  }

  async _handleInstall(data) {
    const { extensionId, metadata } = data || {};
    const installingWindow =
      this.browsingContext?.topChromeWindow ||
      this.browsingContext?.topFrameElement?.ownerGlobal ||
      null;
    return lazy.MidoriCWSInstaller.install({
      extensionId,
      metadata,
      installingWindow,
    });
  }

  async _handleIsInstalled(data) {
    const { extensionId } = data || {};
    if (!extensionId) {
      return { installed: false };
    }
    const id = `${extensionId}${lazy.MidoriCWSConstants.GECKO_ID_SUFFIX}`;
    try {
      const addon = await lazy.AddonManager.getAddonByID(id);
      return {
        installed: !!addon,
        enabled: addon ? !addon.userDisabled : false,
      };
    } catch (_) {
      return { installed: false };
    }
  }
}
