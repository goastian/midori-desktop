/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const DEFAULT_MEMORY_PROFILE = 0;
export const LEGACY_AUTOMATIC_PROFILE = 2;
export const MEMORY_PROFILE_SCHEMA_VERSION = 1;

const VALID_MEMORY_PROFILES = new Set([0, 1, 2, 3]);

export function normalizeMemoryProfile(profile) {
  return VALID_MEMORY_PROFILES.has(profile)
    ? profile
    : DEFAULT_MEMORY_PROFILE;
}

/**
 * Midori 11.7-11.9 persisted profile 2 as a user preference on every startup,
 * even when the user never selected it. Migrate that indistinguishable legacy
 * value once so existing installations receive the new Firefox-compatible
 * default. A user can select Low Memory again after this schema is recorded.
 */
export function getMemoryProfileMigration({
  configuredProfile,
  hasUserValue,
  schemaVersion,
}) {
  const profile = normalizeMemoryProfile(configuredProfile);
  const needsSchemaUpgrade = schemaVersion < MEMORY_PROFILE_SCHEMA_VERSION;
  const clearUserProfile =
    needsSchemaUpgrade &&
    hasUserValue &&
    profile === LEGACY_AUTOMATIC_PROFILE;

  return {
    profile: clearUserProfile ? DEFAULT_MEMORY_PROFILE : profile,
    clearUserProfile,
    needsSchemaUpgrade,
  };
}

export const MemoryProfilePolicy = Object.freeze({
  DEFAULT_MEMORY_PROFILE,
  MEMORY_PROFILE_SCHEMA_VERSION,
  getMemoryProfileMigration,
  normalizeMemoryProfile,
});
