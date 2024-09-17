/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { gFloorpOnLocationChange } from "./browser-onlocation-change.mjs";
import { gFloorpTabBarStyle } from "./browser-tabbar.mjs";

try {
  var { gBmsWindow } = await import(
    "chrome://floorp/content/browser-bms-window.mjs"
  );
} catch (e) {}

export const gFloorpObservePreference = (prefName, callback) => {
  if (gBmsWindow?.isBmsWindow) {
    return;
  }

  let prefValue = Services.prefs.getBoolPref(prefName, false);
  const notifyCallback = reason => {
    try {
      callback({
        pref: prefName,
        prefValue,
        reason,
      });
    } catch (e) {
      console.error(e);
    }
  };

  notifyCallback("init");

  Services.prefs.addObserver(prefName, () => {
    prefValue = Services.prefs.getBoolPref(prefName, false);
    notifyCallback("changed");
  });
};

gFloorpObservePreference(
  "floorp.Tree-type.verticaltab.optimization",
  function (event) {
    if (event.prefValue) {
      let Tag = document.createElement("style");
      Tag.innerText = `@import url(chrome://floorp/skin/designs/options/treestyletab.css)`;
      Tag.setAttribute("id", "floorp-optimizefortreestyletab");
      document.head.appendChild(Tag);
    } else {
      document.getElementById("floorp-optimizefortreestyletab")?.remove();
    }
  }
);

gFloorpObservePreference("floorp.optimized.msbutton.ope", function (event) {
  if (event.prefValue) {
    let Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://floorp/skin/designs/options/msbutton.css)`;
    Tag.setAttribute("id", "floorp-optimizedmsbuttonope");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-optimizedmsbuttonope")?.remove();
  }
});

gFloorpObservePreference("floorp.bookmarks.bar.focus.mode", function (event) {
  if (event.prefValue) {
    let Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://floorp/skin/designs/options/bookmarkbar_autohide.css)`;
    Tag.setAttribute("id", "floorp-bookmarkbarfocus");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-bookmarkbarfocus")?.remove();
  }
  window.setTimeout(() => {
    let bmBarHeight = `-${
      document.getElementById("PersonalToolbar").clientHeight
    }px`;
    document.documentElement.style.setProperty(
      "--bookmark-bar-height",
      bmBarHeight
    );
  }, 1000);
});

gFloorpObservePreference("floorp.bookmarks.fakestatus.mode", function (event) {
  let eventListener = null;

  if (event.prefValue) {
    document
      .getElementById("fullscreen-and-pointerlock-wrapper")
      .after(document.getElementById("PersonalToolbar"));
    eventListener = document.addEventListener(
      "floorpOnLocationChangeEvent",
      function () {
        let currentUrl = gFloorpOnLocationChange.locationURI.spec;
        let pref = Services.prefs.getStringPref(
          "browser.toolbars.bookmarks.visibility",
          "always"
        );
        if (
          ((currentUrl == "about:newtab" || currentUrl == "about:home") &&
            pref == "newtab") ||
          pref == "always"
        ) {
          document
            .getElementById("PersonalToolbar")
            .setAttribute("collapsed", "false");
        } else {
          document
            .getElementById("PersonalToolbar")
            .setAttribute("collapsed", "true");
        }
      }
    );
  } else if (event.reason === "changed") {
    //Fix for the bug that bookmarksbar is on the navigation toolbar when the pref is cahaned to false
    if (!Services.prefs.getBoolPref("floorp.navbar.bottom", false)) {
      document
        .getElementById("navigator-toolbox")
        .appendChild(document.getElementById("nav-bar"));
    }
    document
      .getElementById("navigator-toolbox")
      .appendChild(document.getElementById("PersonalToolbar"));

    // remove event listener
    document.removeEventListener("floorpOnLocationChangeEvent", eventListener);
  }
});

gFloorpObservePreference("floorp.search.top.mode", function (event) {
  if (event.prefValue) {
    let Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://floorp/skin/designs/options/move_page_inside_searchbar.css)`;
    Tag.setAttribute("id", "floorp-searchbartop");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-searchbartop")?.remove();
  }
});

gFloorpObservePreference("floorp.legacy.dlui.enable", function (event) {
  if (event.prefValue) {
    let Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://floorp/skin/designs/options/browser-custom-dlmgr.css)`;
    Tag.setAttribute("id", "floorp-dlmgrcss");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-dlmgrcss")?.remove();
  }
});

gFloorpObservePreference("floorp.downloading.red.color", function (event) {
  if (event.prefValue) {
    let Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://floorp/skin/designs/options/downloading-redcolor.css`;
    Tag.setAttribute("id", "floorp-dlredcolor");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-dlredcolor")?.remove();
  }
});

gFloorpObservePreference("floorp.navbar.bottom", function (event) {
  if (event.prefValue) {
    var Tag = document.createElement("style");
    Tag.setAttribute("id", "floorp-navvarcss");
    Tag.innerText = `@import url(chrome://floorp/skin/designs/options/navbar-botttom.css)`;
    document.head.appendChild(Tag);
    document
      .getElementById("fullscreen-and-pointerlock-wrapper")
      .after(document.getElementById("nav-bar"));
    // eslint-disable-next-line no-undef
    SessionStore.promiseInitialized.then(() => {
      document
        .querySelector(".urlbarView")
        .after(document.querySelector(".urlbar-input-container"));
    });
  } else {
    document.getElementById("floorp-navvarcss")?.remove();
    if (event.reason === "changed") {
      //Fix for the bug that bookmarksbar is on the navigation toolbar when the pref is cahaned to false
      document
        .getElementById("navigator-toolbox")
        .appendChild(document.getElementById("nav-bar"));
      document
        .querySelector(".urlbarView")
        .before(document.querySelector(".urlbar-input-container"));
      if (
        !Services.prefs.getBoolPref("floorp.bookmarks.fakestatus.mode", false)
      ) {
        document
          .getElementById("navigator-toolbox")
          .appendChild(document.getElementById("PersonalToolbar"));
      }
    }
  }
});

gFloorpObservePreference(
  "floorp.disable.fullscreen.notification",
  function (event) {
    if (event.prefValue) {
      var Tag = document.createElement("style");
      Tag.innerText = `@import url(chrome://floorp/skin/designs/options/disableFullScreenNotification.css)`;
      Tag.setAttribute("id", "floorp-DFSN");
      document.head.appendChild(Tag);
    } else {
      document.getElementById("floorp-DFSN")?.remove();
    }
  }
);

gFloorpObservePreference("floorp.delete.browser.border", function (event) {
  if (event.prefValue) {
    var Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://floorp/skin/designs/options/delete-border.css)`;
    Tag.setAttribute("id", "floorp-DB");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-DB")?.remove();
  }
});

gFloorpObservePreference(
  "floorp.hide.unifiedExtensionsButtton",
  function (event) {
    if (event.prefValue) {
      let Tag = document.createElement("style");
      Tag.innerText = `#unified-extensions-button {display: none !important;}`;
      Tag.id = "floorp-hide-unified-extensions-button";
      document.head.appendChild(Tag);
    } else {
      document
        .getElementById("floorp-hide-unified-extensions-button")
        ?.remove();
    }
  }
);

gFloorpObservePreference(
  "floorp.extensions.STG.like.floorp.workspaces.enabled",
  function (event) {
    if (event.prefValue) {
      let Tag = document.createElement("style");
      Tag.innerText = `@import url(chrome://floorp/skin/designs/options/STG-like-floorp-workspaces.css)`;
      Tag.id = "floorp-STG-like-floorp-workspaces";
      document.head.appendChild(Tag);
    } else {
      document.getElementById("floorp-STG-like-floorp-workspaces")?.remove();
    }
  }
);

/*------------------------------------------- multirowtab -------------------------------------------*/

gFloorpObservePreference(
  "floorp.browser.tabbar.multirow.newtab-inside.enabled",
  function (event) {
    if (Services.prefs.getIntPref("floorp.tabbar.style", false) != 1) {
      return;
    }
    if (event.prefValue) {
      document
        .getElementById("floorp-newtabbuttonatendofmultirowtabbar")
        ?.remove();
      const Tag = document.createElement("style");
      Tag.innerText = `@import url(chrome://floorp/skin/designs/options/multirowtab-show-newtab-button-in-tabbar.css)`;
      Tag.setAttribute("id", "floorp-newtabbuttoninmultirowtabbbar");
      document.head.appendChild(Tag);
    } else {
      document.getElementById("floorp-newtabbuttoninmultirowtabbbar")?.remove();
      const Tag = document.createElement("style");
      Tag.innerText = `@import url(chrome://floorp/skin/designs/options/multirowtab-show-newtab-button-at-end.css)`;
      Tag.setAttribute("id", "floorp-newtabbuttonatendofmultirowtabbar");
      document.head.appendChild(Tag);
    }
  }
);

/*------------------------------------------- verticaltab -------------------------------------------*/

gFloorpObservePreference(
  "floorp.verticaltab.show.newtab.button",
  function (event) {
    if (Services.prefs.getIntPref("floorp.tabbar.style", false) != 2) {
      return;
    }
    if (event.prefValue) {
      var Tag = document.createElement("style");
      Tag.innerText = `@import url(chrome://floorp/skin/designs/options/verticaltab-show-newtab-button-in-tabbar.css)`;
      Tag.setAttribute("id", "floorp-newtabbuttonintabbar");
      document.head.appendChild(Tag);
    } else {
      document.getElementById("floorp-newtabbuttonintabbar")?.remove();
    }
  }
);

/*------------------------------------------- tab min height -------------------------------------------*/

gFloorpObservePreference("floorp.browser.tabs.tabMinHeight", function () {
  document.getElementById("floorp-tabminheight")?.remove();
  let Tag = document.createElement("style");
  Tag.innerText = `
      .tabbrowser-tab {
        --tab-min-height: ${Services.prefs.getIntPref(
          "floorp.browser.tabs.tabMinHeight",
          30
        )}px !important;
      }
    `;
  Tag.setAttribute("id", "floorp-tabminheight");
  document.head.appendChild(Tag);
  gFloorpTabBarStyle.setMultirowTabMaxHeight();
});
