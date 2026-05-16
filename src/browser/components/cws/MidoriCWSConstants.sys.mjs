/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Midori Chrome Web Store integration — shared constants.
 */

export const MidoriCWSConstants = Object.freeze({
  // Host names where the install button is injected.
  HOST_NEW: "chromewebstore.google.com",
  HOST_LEGACY: "chrome.google.com",

  // URL template for downloading CRX packages. Google's official endpoint.
  CRX_DOWNLOAD_URL:
    "https://clients2.google.com/service/update2/crx" +
    "?response=redirect&prodversion=130.0.0.0&acceptformat=crx2,crx3" +
    "&x=id%3D{id}%26installsource%3Dondemand%26uc",

  // User-Agent used for the CRX request — must look like Chrome or the
  // server will respond with HTTP 204.
  USER_AGENT:
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/130.0.0.0 Safari/537.36",

  // Suffix for the generated Firefox add-on ID. We use a Midori-specific
  // namespace so installs do not collide with Floorp's CWS converter, which
  // uses "@mozilla.org".
  GECKO_ID_SUFFIX: "@cws.midori.astian.org",

  // Minimum Firefox/Gecko version we set in browser_specific_settings.
  STRICT_MIN_VERSION: "115.0",

  // Pref master switch — when false, the actors no-op.
  PREF_ENABLED: "extensions.midori.cws.enabled",

  // When true, abort installation on hard compatibility blockers.
  // Default behavior is permissive (warn and continue) to maximize install
  // success from CWS.
  PREF_STRICT_COMPAT: "extensions.midori.cws.strict_compatibility",

  // Maximum install timeout (ms).
  INSTALL_TIMEOUT_MS: 180_000,

  // Maximum CRX size we will download (150 MiB). Above that we reject.
  MAX_CRX_SIZE: 150 * 1024 * 1024,

  // Chrome-only permissions that must be stripped from the converted
  // manifest, otherwise Firefox refuses to load the add-on.
  UNSUPPORTED_PERMISSIONS: new Set([
    "tabCapture",
    "desktopCapture",
    "signedInDevices",
    "wallpaper",
    "fontSettings",
    "processes",
    "gcm",
    "sidePanel",
    "printing",
    "printerProvider",
    "fileSystemProvider",
    "serial",
    "hid",
    "usb",
    "platformKeys",
    "enterprise.deviceAttributes",
    "enterprise.hardwarePlatform",
    "enterprise.networkingAttributes",
    "enterprise.platformKeys",
    "system.cpu",
    "system.memory",
    "system.storage",
    "system.display",
    "tts",
    "ttsEngine",
    "vpnProvider",
    "documentScan",
    "loginState",
    "certificateProvider",
    "pageCapture",
    "readingList",
  ]),

  // Permissions that usually represent core features with no practical
  // Firefox equivalent. If requested, we hard-block installation instead of
  // shipping a likely-broken extension.
  HARD_BLOCKED_PERMISSIONS: new Set([
    "desktopCapture",
    "tabCapture",
    "serial",
    "hid",
    "usb",
    "fileSystemProvider",
    "gcm",
    "platformKeys",
    "certificateProvider",
    "vpnProvider",
    "enterprise.deviceAttributes",
    "enterprise.hardwarePlatform",
    "enterprise.networkingAttributes",
    "enterprise.platformKeys",
  ]),

  // Manifest top-level keys that are strong compatibility red flags for
  // CWS-to-Firefox conversion.
  HARD_BLOCKED_MANIFEST_KEYS: [
    "file_browser_handlers",
    "bluetooth",
    "bluetoothLowEnergy",
  ],

  // Manifest top-level fields that have no Firefox equivalent and should be
  // discarded rather than translated.
  REMOVED_MANIFEST_FIELDS: [
    "update_url",
    "key",
    "differential_fingerprint",
    "minimum_chrome_version",
    "oauth2",
    "automation",
    "platforms",
  ],
});
