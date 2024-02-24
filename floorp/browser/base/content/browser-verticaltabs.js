/* eslint-disable no-undef */
/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

function setWorkspaceLabel() {
  const workspaceButton = document.getElementById("workspace-button");
  const customizeTarget = document.getElementById(
    "nav-bar-customization-target"
  );

  if (!workspaceButton) {
    console.info("Workspace button not found");
    return;
  }

  customizeTarget.before(workspaceButton);
}

function checkBrowserIsStartup() {
  const browserWindows = Services.wm.getEnumerator("navigator:browser");

  while (browserWindows.hasMoreElements()) {
    if (browserWindows.getNext() !== window) {
      return;
    }
  }

  SessionStore.promiseInitialized.then(() => {
    window.setTimeout(setWorkspaceLabel, 1500);
    window.setTimeout(setWorkspaceLabel, 3000);
  });
}

function setVerticalTabs() {
  if (Services.prefs.getIntPref("floorp.tabbar.style") == 2) {
    Services.prefs.setBoolPref("floorp.browser.tabs.verticaltab", true);

      // Re-implement the vertical tab bar v2. This is a temporary solution cannot close tab correctly.
      // Vertical tab bar has to position at the  first of child the "browser" elem.
      document.getElementById("browser").prepend(document.getElementById("TabsToolbar"));

      document.getElementById('tabbrowser-arrowscrollbox').setAttribute('orient', 'vertical')
      document.getElementById('tabbrowser-tabs').setAttribute('orient', 'vertical')
      document.getElementById('TabsToolbar').setAttribute('multibar', 'true')

      document
        .getElementsByClassName('toolbar-items')[0]
        .setAttribute('align', 'start')

      document.getElementById("TabsToolbar").removeAttribute('flex')
      document.getElementById("TabsToolbar").removeAttribute('hidden')
      document.getElementById("TabsToolbar").style.width = "350px"

    checkBrowserIsStartup();

    //toolbar modification
    let Tag = document.createElement("style");
    Tag.id = "verticalTabsStyle";
    Tag.textContent = `@import url("chrome://browser/content/browser-verticaltabs.css");`;
    document.head.appendChild(Tag);

    Services.prefs.setIntPref("floorp.browser.tabbar.settings", 2);

    if (
      document.getElementById("floorp-vthover") == null &&
      Services.prefs.getBoolPref("floorp.verticaltab.hover.enabled")
    ) {
      Tag = document.createElement("style");
      Tag.innerText = `@import url(chrome://browser/skin/options/native-verticaltab-hover.css)`;
      Tag.setAttribute("id", "floorp-vthover");
      document.head.appendChild(Tag);
    }
    //add context menu
    let target = document.getElementById("TabsToolbar-customization-target");
    target.setAttribute("context", "toolbar-context-menu");

    //splitter
    document.getElementById("verticaltab-splitter").removeAttribute("hidden");

  } else {

    // TODO: Re-implement the vertical tab bar. This code is not working.
    /*
    document.getElementById("titlebar").prepend(document.getElementById("TabsToolbar"));
    document.getElementById('tabbrowser-arrowscrollbox').setAttribute('orient', 'horizontal')
    document.getElementById('tabbrowser-tabs').setAttribute('orient', 'horizontal')
    document
      .querySelector('#TabsToolbar .toolbar-items')
      ?.setAttribute('align', 'end')
    changeXULElementTagName('TabsToolbar', "toolbar")
    document.getElementById("TabsToolbar").setAttribute('flex', '1')
    // Reset the resize value, or else the tabs will end up squished
    document.getElementById("TabsToolbar").style.width = ''
    */

    Services.prefs.setBoolPref("floorp.browser.tabs.verticaltab", false);
  }
}

setVerticalTabs();

Services.prefs.addObserver("floorp.tabbar.style", function () {
  if (Services.prefs.getIntPref("floorp.tabbar.style") == 2) {
    Services.prefs.setIntPref(tabbarContents.tabbarDisplayStylePref, 2);
  } else {
    Services.prefs.setIntPref(tabbarContents.tabbarDisplayStylePref, 0);
  }
  setVerticalTabs();
});
