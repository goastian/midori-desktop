/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const WIDGET_ID = "midori-protection_astian_org-browser-action";

add_task(async function test_toolbar_button_opens_native_panel() {
  const { MidoriBlockerPanel } = ChromeUtils.importESModule(
    "resource:///modules/MidoriBlockerPanel.sys.mjs"
  );
  const { PanelMultiView } = ChromeUtils.importESModule(
    "moz-src:///browser/components/customizableui/PanelMultiView.sys.mjs"
  );

  MidoriBlockerPanel.init();

  await TestUtils.waitForCondition(
    () => document.getElementById(WIDGET_ID),
    "Wait for the native blocker toolbar button"
  );
  const button = document.getElementById(WIDGET_ID);
  const panel = document.getElementById("midori-blocker-panel");

  ok(panel, "The native blocker panel is attached to the browser window");
  is(
    button.getAttribute("widget-type"),
    "button",
    "The blocker uses the native button event path"
  );
  is(
    button.nextElementSibling?.id,
    "urlbar-container",
    "The blocker retains its historical position before the URL bar"
  );

  let commandSeen = false;
  let openHandlerSeen = false;
  let openHandlerWindow = null;
  const originalOpenToolbarPanel = MidoriBlockerPanel._openToolbarPanel;
  MidoriBlockerPanel._openToolbarPanel = function (...args) {
    openHandlerSeen = true;
    openHandlerWindow = args[0];
    return originalOpenToolbarPanel.apply(this, args);
  };
  registerCleanupFunction(() => {
    MidoriBlockerPanel._openToolbarPanel = originalOpenToolbarPanel;
  });
  button.addEventListener(
    "command",
    () => {
      commandSeen = true;
    },
    { once: true }
  );

  const shown = BrowserTestUtils.waitForEvent(panel, "popupshown");
  EventUtils.synthesizeMouseAtCenter(button, {}, window);
  await TestUtils.waitForCondition(
    () => commandSeen,
    "The toolbar button receives a command event"
  );
  await TestUtils.waitForCondition(
    () => openHandlerSeen,
    "CustomizableUI invokes the blocker panel handler"
  );
  is(
    openHandlerWindow,
    window,
    "CustomizableUI passes the browser window to the panel handler"
  );
  await TestUtils.waitForCondition(
    () => panel.state !== "closed",
    `The panel starts opening; current state is ${panel.state}`
  );
  await shown;

  is(panel.state, "open", "Clicking the blocker button opens its panel");
  const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
  PanelMultiView.hidePopup(panel);
  await hidden;

  while (gBrowser.tabs.length > 1) {
    await BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});
