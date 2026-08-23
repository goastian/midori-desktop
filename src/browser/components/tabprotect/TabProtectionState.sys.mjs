/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const TAB_PROTECTION_MODES = Object.freeze({
  GLOBAL: "global",
  INDIVIDUAL: "individual",
});

export function normalizeTabProtectionMode(mode) {
  return mode === TAB_PROTECTION_MODES.INDIVIDUAL
    ? TAB_PROTECTION_MODES.INDIVIDUAL
    : TAB_PROTECTION_MODES.GLOBAL;
}

export function isTabProtectionRecordValid(record) {
  return !!record?.protected && typeof record.passwordHash === "string" && !!record.passwordHash.length;
}

export function shouldRequireTabPassword({ protectedTab, unlocked }) {
  return !!protectedTab && !unlocked;
}
