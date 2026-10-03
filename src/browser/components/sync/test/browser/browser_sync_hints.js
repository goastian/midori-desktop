/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function native_sync_hints_observe_normal_windows_only() {
  const { MidoriSyncHints } = ChromeUtils.importESModule("resource:///modules/MidoriSyncHints.sys.mjs");
  const pref = "midori.workspaces.show-button";
  const hadUserValue = Services.prefs.prefHasUserValue(pref);
  const original = Services.prefs.getBoolPref(pref, false);
  let changes = 0;
  const hints = new MidoriSyncHints({ onChange: () => changes++ });
  hints.start();
  let tab;
  try {
    ok(hints.snapshot.watchedWindows >= 1, "The normal browser window is observed");
    tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank");
    ok(changes > 0, "Opening a normal tab produces a hint");

    const beforePref = changes;
    Services.prefs.setBoolPref(pref, !original);
    is(changes, beforePref + 1, "An allowlisted preference produces one hint");

    const watched = hints.snapshot.watchedWindows;
    const privateWindow = await BrowserTestUtils.openNewBrowserWindow({ private: true });
    try {
      is(hints.snapshot.watchedWindows, watched, "A private window is excluded");
      const beforePrivateTab = changes;
      const privateTab = await BrowserTestUtils.openNewForegroundTab(privateWindow.gBrowser, "about:blank");
      await BrowserTestUtils.removeTab(privateTab);
      is(changes, beforePrivateTab, "Private tab events do not produce hints");
    } finally {
      await BrowserTestUtils.closeWindow(privateWindow);
    }
  } finally {
    hints.close();
    const afterClose = changes;
    const detachedTab = await BrowserTestUtils.openNewForegroundTab(gBrowser, "about:blank");
    await BrowserTestUtils.removeTab(detachedTab);
    if (tab) {
      await BrowserTestUtils.removeTab(tab);
    }
    while (gBrowser.tabs.length > 1) {
      await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
    }
    if (hadUserValue) {
      Services.prefs.setBoolPref(pref, original);
    } else {
      Services.prefs.clearUserPref(pref);
    }
    is(changes, afterClose, "Closing the observer detaches tab and preference listeners");
    is(hints.snapshot.watchedWindows, 0, "Closing releases watched windows");
  }
});
