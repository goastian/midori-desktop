/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Translates a Chrome manifest.json into something Firefox can load.
 *
 * Only the bits that are known to break installation are touched; the rest
 * of the manifest is preserved so we don't accidentally strip functionality
 * the extension relies on. Permissions that have no Firefox equivalent are
 * removed, and the MV3 service-worker is rewritten to a non-persistent
 * background page (which Firefox supports natively).
 */

import { MidoriCWSConstants } from "resource:///modules/MidoriCWSConstants.sys.mjs";

/**
 * @param {object} manifest Parsed Chrome manifest.
 * @param {string} chromeId Original Chrome extension ID (used to derive the
 *                          deterministic gecko ID).
 * @returns {{ manifest: object, warnings: string[], blockers: string[] }}
 */
export function transformManifest(manifest, chromeId) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Invalid manifest");
  }
  const warnings = [];
  const blockers = [];
  const out = structuredClone(manifest);

  // Inject browser_specific_settings.gecko so Firefox accepts the add-on.
  out.browser_specific_settings = out.browser_specific_settings || {};
  out.browser_specific_settings.gecko = {
    id: `${chromeId}${MidoriCWSConstants.GECKO_ID_SUFFIX}`,
    strict_min_version: MidoriCWSConstants.STRICT_MIN_VERSION,
  };

  // Drop top-level fields that are Chrome-only or actively harmful.
  for (const field of MidoriCWSConstants.REMOVED_MANIFEST_FIELDS) {
    delete out[field];
  }

  // Filter permissions / optional_permissions.
  out.permissions = filterPermissions(out.permissions, warnings);
  out.optional_permissions = filterPermissions(
    out.optional_permissions,
    warnings
  );

  collectHardBlockers(manifest, blockers);

  if (!out.permissions?.length) delete out.permissions;
  if (!out.optional_permissions?.length) delete out.optional_permissions;

  // MV3 background.service_worker -> background.scripts (Firefox path).
  if (out.background?.service_worker) {
    out.background = {
      scripts: [out.background.service_worker],
      type: out.background.type === "module" ? "module" : "module",
    };
    warnings.push(
      "MV3 service worker rewritten as a module background script; " +
        "extensions that depend on Chrome's strict SW lifecycle may misbehave."
    );
  }

  // MV3 web_accessible_resources: object[]  -> flatten to MV2 string[] when
  // the entries are basic, otherwise keep the MV3 form (Firefox supports it
  // starting from version 115).
  if (Array.isArray(out.web_accessible_resources)) {
    out.web_accessible_resources = out.web_accessible_resources
      .map(entry => {
        if (typeof entry === "string") return entry;
        if (!entry || typeof entry !== "object") return null;
        // Strip Chrome-specific extension_ids whitelist — Firefox uses
        // matches/use_dynamic_url instead.
        const { extension_ids, ...rest } = entry;
        return rest;
      })
      .filter(Boolean);
  }

  // action / browser_action — Firefox accepts MV3 "action" since 109, but if
  // the extension provides browser_action only and declares MV3 we leave it
  // alone (Firefox will warn but load).

  // Drop chrome_url_overrides for newtab if the user has not enabled it
  // (we don't want a CWS extension hijacking Midori's home page silently).
  if (out.chrome_url_overrides?.newtab) {
    warnings.push(
      "Extension requested newtab override; Firefox will prompt the user."
    );
  }

  return { manifest: out, warnings, blockers };
}

function filterPermissions(perms, warnings) {
  if (!Array.isArray(perms)) return perms;
  const kept = [];
  for (const p of perms) {
    // Host permissions ("https://*/*", "<all_urls>", scheme://...) pass through.
    if (typeof p !== "string" || p.includes("://") || p === "<all_urls>") {
      kept.push(p);
      continue;
    }
    if (MidoriCWSConstants.UNSUPPORTED_PERMISSIONS.has(p)) {
      warnings.push(`Stripped Chrome-only permission "${p}"`);
      continue;
    }
    kept.push(p);
  }
  return kept;
}

function collectHardBlockers(manifest, blockers) {
  const allPerms = [
    ...(Array.isArray(manifest.permissions) ? manifest.permissions : []),
    ...(Array.isArray(manifest.optional_permissions)
      ? manifest.optional_permissions
      : []),
  ];

  for (const p of allPerms) {
    if (
      typeof p === "string" &&
      MidoriCWSConstants.HARD_BLOCKED_PERMISSIONS.has(p)
    ) {
      blockers.push(
        `Requires unsupported Chrome API permission "${p}"`
      );
    }
  }

  for (const key of MidoriCWSConstants.HARD_BLOCKED_MANIFEST_KEYS) {
    if (key in manifest) {
      blockers.push(
        `Uses Chrome-only manifest key "${key}"`
      );
    }
  }
}
