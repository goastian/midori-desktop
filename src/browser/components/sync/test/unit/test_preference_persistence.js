/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global Assert, add_task */

const { MidoriSyncPreferences } = ChromeUtils.importESModule("resource://midori-sync-test/MidoriSyncPreferences.sys.mjs");

add_task(async function uninitialized_profile_cannot_claim_preference_persistence() {
  const adapter = new MidoriSyncPreferences();
  try {
    await Assert.rejects(adapter.flush(), error => error.result === Cr.NS_ERROR_NOT_INITIALIZED,
      "A missing native preference file cannot be acknowledged as durable");
  } finally {
    adapter.close();
  }
});
