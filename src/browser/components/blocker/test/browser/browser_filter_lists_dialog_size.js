/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const DIALOG_URL =
  "chrome://browser/content/preferences/dialogs/midoriBlockerFilterLists.xhtml";
const WINDOW_ID = "MidoriBlockerFilterListsWindow";

add_task(async function test_filter_lists_dialog_enforces_usable_width() {
  Services.xulStore.setValue(DIALOG_URL, WINDOW_ID, "width", "260");
  registerCleanupFunction(() => {
    Services.xulStore.removeValue(DIALOG_URL, WINDOW_ID, "width");
  });

  const opened = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    win => win.document.documentURI === DIALOG_URL
  );
  window.openDialog(
    DIALOG_URL,
    "_blank",
    "chrome,dialog=no,resizable,centerscreen"
  );
  const dialogWindow = await opened;
  registerCleanupFunction(() => {
    if (!dialogWindow.closed) {
      dialogWindow.close();
    }
  });

  await TestUtils.waitForCondition(
    () =>
      dialogWindow.document.querySelector(
        ".midori-blocker-list-row checkbox"
      ),
    "Wait for the filter list controls"
  );

  const { document: dialogDocument } = dialogWindow;
  const acceptButton = dialogDocument
    .getElementById("midoriBlockerFilterListsDialog")
    .getButton("accept");
  const firstToggle = dialogDocument.querySelector(
    ".midori-blocker-list-row checkbox"
  );

  ok(dialogWindow.outerWidth > 600, "A persisted narrow width is constrained");
  for (const control of [acceptButton, firstToggle]) {
    const rect = control.getBoundingClientRect();
    ok(rect.width > 0, `${control.localName} is rendered`);
    ok(
      rect.left >= 0 && rect.right <= dialogWindow.innerWidth,
      `${control.localName} remains inside the visible dialog`
    );
  }

  const closed = BrowserTestUtils.windowClosed(dialogWindow);
  dialogWindow.close();
  await closed;

  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});
