/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*---------------------------------------------------------------- Context Menu ----------------------------------------------------------------*/

export const gFloorpContextMenu = {
  initialized: false,

  get toolbarContextMenuBeforeElement() {
    return document.getElementById("window-modal-dialog");
  },

  init() {
    window.SessionStore.promiseInitialized.then(() => {
      const contentAreaContextMenu = document.getElementById(
        "contentAreaContextMenu"
      );

      contentAreaContextMenu.addEventListener("popupshowing", function (event) {
        let menuSeparators = document.querySelectorAll(
          "#contentAreaContextMenu > menuseparator"
        );

        let screenShot = document.getElementById("context-take-screenshot");
        if (!screenShot.hidden) {
          screenShot.nextSibling.hidden = false;
        }

        if (!document.getElementById("context-take-screenshot").hidden) {
          document.getElementById("context-sep-pdfjs-selectall").hidden = false;
        }

        window.setTimeout(() => {
          for (let i = 0; i < menuSeparators.length; i++) {
            if (
              menuSeparators[i].nextSibling.hidden &&
              menuSeparators[i].previousSibling.hidden &&
              menuSeparators[i].id != "context-sep-navigation" &&
              menuSeparators[i].id != "context-sep-pdfjs-selectall"
            ) {
              menuSeparators[i].hidden = true;
            }
          }
        }, 0);
      });
    });
  },

  addContextBox(id, l10n, insert, runFunction, checkID, checkedFunction) {
    const contextMenu = document.createXULElement("menuitem");
    contextMenu.setAttribute("data-l10n-id", l10n);
    contextMenu.id = id;
    contextMenu.setAttribute("oncommand", runFunction);

    const contentAreaContextMenu = document.getElementById(
      "contentAreaContextMenu"
    );
    contentAreaContextMenu.insertBefore(
      contextMenu,
      document.getElementById(insert)
    );

    contextMenuObserver.observe(document.getElementById(checkID), {
      attributes: true,
    });
    checkItems.push(checkedFunction);

    this.contextMenuObserverFunc();
  },

  contextMenuObserverFunc() {
    for (const elem of checkItems) {
      elem();
    }
  },

  addToolbarContentMenuPopupSet(xulElementStr) {
    const parsedXULElement =
      window.MozXULElement.parseXULToFragment(xulElementStr);
    this.toolbarContextMenuBeforeElement.before(parsedXULElement);
  },
};

let checkItems = [];
const contextMenuObserver = new MutationObserver(
  gFloorpContextMenu.contextMenuObserverFunc
);

gFloorpContextMenu.init();
