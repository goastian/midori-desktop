/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

//import utils
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const observePreference = function (prefName, callback) {
  let prefValue = Services.prefs.getBoolPref(prefName, false);

  const notifyCallback = (reason) => {
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

// prefs
observePreference("floorp.material.effect.enable", function (event) {
  if (event.prefValue) {
    let Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://browser/skin/options/micaforeveryone.css)`;
    Tag.setAttribute("id", "floorp-micaforeveryone");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-micaforeveryone")?.remove();
  }
});

observePreference(
  "floorp.Tree-type.verticaltab.optimization",
  function (event) {
    if (event.prefValue) {
      let Tag = document.createElement("style");
      Tag.innerText = `@import url(chrome://browser/skin/options/treestyletab.css)`;
      Tag.setAttribute("id", "floorp-optimizefortreestyletab");
      document.head.appendChild(Tag);
    } else {
      document.getElementById("floorp-optimizefortreestyletab")?.remove();
    }
  }
);

observePreference("floorp.optimized.msbutton.ope", function (event) {
  if (event.prefValue) {
    let Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://browser/skin/options/msbutton.css)`;
    Tag.setAttribute("id", "floorp-optimizedmsbuttonope");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-optimizedmsbuttonope")?.remove();
  }
});

observePreference("floorp.bookmarks.bar.focus.mode", function (event) {
  if (event.prefValue) {
    let Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://browser/skin/options/bookmarkbar_autohide.css)`;
    Tag.setAttribute("id", "floorp-bookmarkbarfocus");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-bookmarkbarfocus")?.remove();
  }
});

observePreference("floorp.bookmarks.fakestatus.mode", function (event) {
  if (event.prefValue) {
    setTimeout(
      function () {
        document
          .getElementById("fullscreen-and-pointerlock-wrapper")
          .after(document.getElementById("PersonalToolbar"));
      },
      event.reason === "init" ? 250 : 1
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
  }
});

observePreference("floorp.search.top.mode", function (event) {
  if (event.prefValue) {
    let Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://browser/skin/options/move_page_inside_searchbar.css)`;
    Tag.setAttribute("id", "floorp-searchbartop");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-searchbartop")?.remove();
  }
});

observePreference("floorp.legacy.dlui.enable", function (event) {
  if (event.prefValue) {
    let Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://browser/skin/options/browser-custum-dlmgr.css)`;
    Tag.setAttribute("id", "floorp-dlmgrcss");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-dlmgrcss")?.remove();
  }
});

observePreference("floorp.downloading.red.color", function (event) {
  if (event.prefValue) {
    let Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://browser/skin/options/downloading-redcolor.css`;
    Tag.setAttribute("id", "floorp-dlredcolor");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-dlredcolor")?.remove();
  }
});

observePreference("floorp.navbar.bottom", function (event) {
  if (event.prefValue) {
    var Tag = document.createElement("style");
    Tag.setAttribute("id", "floorp-navvarcss");
    Tag.innerText = `@import url(chrome://browser/skin/options/navbar-botttom.css)`;
    document.head.appendChild(Tag);
    document
      .getElementById("fullscreen-and-pointerlock-wrapper")
      .after(document.getElementById("nav-bar"));
      // eslint-disable-next-line no-undef
    SessionStore.promiseInitialized.then(() => {
      document
      .querySelector(".urlbarView")
      .after(document.getElementById("urlbar-input-container"));
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
        .before(document.getElementById("urlbar-input-container"));

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

observePreference("floorp.disable.fullscreen.notification", function (event) {
  if (event.prefValue) {
    var Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://browser/skin/options/disableFullScreenNotification.css)`;
    Tag.setAttribute("id", "floorp-DFSN");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-DFSN")?.remove();
  }
});

observePreference("floorp.delete.browser.border", function (event) {
  if (event.prefValue) {
    var Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://browser/skin/options/delete-border.css)`;
    Tag.setAttribute("id", "floorp-DB");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-DB")?.remove();
  }
});

observePreference("floorp.hide.unifiedExtensionsButtton", function (event) {
  if (event.prefValue) {
    let Tag = document.createElement("style");
    Tag.innerText = `#unified-extensions-button {display: none !important;}`;
    Tag.id = "floorp-hide-unified-extensions-button";
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-hide-unified-extensions-button")?.remove();
  }
 });

/*------------------------------------------- sidebar -------------------------------------------*/

if (!Services.prefs.getBoolPref("floorp.browser.sidebar.enable", false)) {
  var Tag = document.createElement("style");
  Tag.textContent = `
  #sidebar-button2,
  #wrapper-sidebar-button2,
  .browser-sidebar2,
  #sidebar-select-box {
    display: none !important;
  }`;
  document.head.appendChild(Tag);
}

/*------------------------------------------- verticaltab -------------------------------------------*/

observePreference("floorp.verticaltab.hover.enabled", function (event) {
  if (Services.prefs.getIntPref("floorp.tabbar.style", false) != 2) {
    return;
  }
  if (event.prefValue) {
    var Tag = document.createElement("style");
    Tag.innerText = `@import url(chrome://browser/skin/options/native-verticaltab-hover.css)`;
    Tag.setAttribute("id", "floorp-vthover");
    document.head.appendChild(Tag);
  } else {
    document.getElementById("floorp-vthover")?.remove();
  }
});
