/* eslint-disable no-undef */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from extensionControlled.js */
/* import-globals-from preferences.js */

const { BrowserManagerSidebar } = ChromeUtils.importESModule(
  "chrome://floorp/content/modules/bms/BrowserManagerSidebar.mjs"
);
ChromeUtils.defineLazyGetter(this, "L10n", () => {
  return new Localization(["branding/brand.ftl", "browser/floorp"]);
});

Preferences.addAll([
  { id: "floorp.browser.sidebar.right", type: "bool" },
  { id: "floorp.browser.sidebar.enable", type: "bool" },
  { id: "floorp.browser.sidebar2.mode", type: "int" },
  { id: "floorp.browser.restore.sidebar.panel", type: "bool" },
  { id: "floorp.browser.sidebar.useIconProvider", type: "string" },
  { id: "floorp.browser.sidebar2.hide.to.unload.panel.enabled", type: "bool" },
]);

var gBSBPane = {
  _pane: null,
  obsPanel(data_) {
    const data = data_.wrappedJSObject;
    switch (data.eventType) {
      case "mouseOver":
        document.getElementById(
          data.id.replace("select-", "BSB-")
        ).style.border = "1px solid blue";
        break;
      case "mouseOut":
        document.getElementById(
          data.id.replace("select-", "BSB-")
        ).style.border = "";
        break;
    }
  },
  mouseOver(id) {
    Services.obs.notifyObservers(
      { eventType: "mouseOver", id },
      "obs-panel-re"
    );
  },
  mouseOut(id) {
    Services.obs.notifyObservers({ eventType: "mouseOut", id }, "obs-panel-re");
  },

  deleteWebpanel(id) {
    this.BSBs.index = this.BSBs.index.filter(n => n != id);
    delete this.BSBs.data[id];
    Services.prefs.setStringPref(
      `floorp.browser.sidebar2.data`,
      JSON.stringify(this.BSBs)
    );
  },

  upWebpanel(id) {
    const index = this.BSBs.index.indexOf(id);
    if (index >= 1) {
      const tempValue = this.BSBs.index[index];
      this.BSBs.index[index] = this.BSBs.index[index - 1];
      this.BSBs.index[index - 1] = tempValue;
      Services.prefs.setStringPref(
        `floorp.browser.sidebar2.data`,
        JSON.stringify(this.BSBs)
      );
      Services.obs.notifyObservers(
        { eventType: "mouseOut", id: `BSB-${id}` },
        "obs-panel-re"
      );
    }
  },

  downWebpanel(id) {
    const index = this.BSBs.index.indexOf(id);
    if (index != this.BSBs.index.length - 1 && index != -1) {
      const tempValue = this.BSBs.index[index];
      this.BSBs.index[index] = this.BSBs.index[index + 1];
      this.BSBs.index[index + 1] = tempValue;
      Services.prefs.setStringPref(
        `floorp.browser.sidebar2.data`,
        JSON.stringify(this.BSBs)
      );
      Services.obs.notifyObservers(
        { eventType: "mouseOut", id: `BSB-${id}` },
        "obs-panel-re"
      );
    }
  },

  // called when the document is first parsed
  init() {
    Services.obs.addObserver(this.obsPanel, "obs-panel");
    Services.prefs.addObserver(
      `floorp.browser.sidebar2.data`,
      function () {
        this.BSBs = JSON.parse(
          Services.prefs.getStringPref(
            `floorp.browser.sidebar2.data`,
            undefined
          )
        );
        this.panelSet();
      }.bind(this)
    );
    this._list = document.getElementById("BSBView");
    this._pane = document.getElementById("paneBSB");

    const needreboot = document.getElementsByClassName("needreboot");
    for (let i = 0; i < needreboot.length; i++) {
      if (needreboot[i].getAttribute("rebootELIsSet") == "true") {
        continue;
      }
      needreboot[i].setAttribute("rebootELIsSet", "true");
      needreboot[i].addEventListener("click", () => {
        if (!Services.prefs.getBoolPref("floorp.enable.auto.restart", false)) {
          (async () => {
            const userConfirm = await confirmRestartPrompt(null);
            if (userConfirm == CONFIRM_RESTART_PROMPT_RESTART_NOW) {
              Services.startup.quit(
                Ci.nsIAppStartup.eAttemptQuit | Ci.nsIAppStartup.eRestart
              );
            }
          })();
        } else {
          window.setTimeout(() => {
            Services.startup.quit(
              Services.startup.eAttemptQuit | Services.startup.eRestart
            );
          }, 500);
        }
      });
    }

    {
      const prefName = "floorp.browser.sidebar2.global.webpanel.width";
      const elem = document.getElementById("GlobalWidth");
      elem.value = Services.prefs.getIntPref(prefName, undefined);
      elem.addEventListener("change", () => {
        Services.prefs.setIntPref(prefName, Number(elem.value));
      });
      Services.prefs.addObserver(prefName, () => {
        elem.value = Services.prefs.getIntPref(prefName, undefined);
      });
    }

    this.panelSet();
    document.getElementById("BSBAdd").addEventListener("command", () => {
      const updateNumberDate = new Date();
      const updateNumber = `w${updateNumberDate.getFullYear()}${updateNumberDate.getMonth()}${updateNumberDate.getDate()}${updateNumberDate.getHours()}${updateNumberDate.getMinutes()}${updateNumberDate.getSeconds()}`;
      gSubDialog.open(
        "chrome://floorp/content/preferences/dialogs/customURLs.xhtml",
        undefined,
        { id: updateNumber, new: true }
      );
    });
    document.getElementById("BSBDefault").addEventListener("command", () => {
      Services.prefs.clearUserPref(`floorp.browser.sidebar2.data`);
    });
  },

  setURL(elemUrl, elem) {
    if (elemUrl.startsWith("floorp//")) {
      elem.setAttribute(
        "data-l10n-id",
        "sidebar2-" + BrowserManagerSidebar.STATIC_SIDEBAR_DATA[elemUrl].l10n
      );
    } else if (elemUrl.startsWith("extension")) {
      elem.removeAttribute("data-l10n-id");
      elem.textContent = elemUrl.split(",")[1];
    } else {
      elem.removeAttribute("data-l10n-id");
      elem.textContent = elemUrl;
    }
  },

  panelSet() {
    this.BSBs = JSON.parse(
      Services.prefs.getStringPref(`floorp.browser.sidebar2.data`, undefined)
    );
    let isFirst = true;
    let lastElem = null;
    for (const container of this.BSBs.index) {
      let listItem = null;
      if (document.getElementById(`BSB-${container}`) == null) {
        listItem = window.MozXULElement.parseXULToFragment(
          `
        <richlistitem id="BSB-${container}" class="BSB-list">
          <hbox flex="1" align="center">
            <hbox class="userContext-icon userContext-icon-inprefs" width="24" height="24"></hbox>
            <label flex="1" class="bsb_label"></label>
          </hbox>
          <hbox class="container-buttons">
            <button class="BMS-Up">
              <hbox class="box-inherit button-box" align="center" pack="center" flex="1" anonid="button-box">
                <image class="button-icon"/>
                <label class="button-text" value="↑"/>
              </hbox>
            </button>
            <button class="BMS-Down">
              <hbox class="box-inherit button-box" align="center" pack="center" flex="1" anonid="button-box">
                <image class="button-icon"/>
                <label class="button-text" value="↓"/>
              </hbox>
            </button>
            <button class="BMS-Edit"></button>
            <button class="BMS-Remove"></button>
          </hbox>
        </richlistitem>
        `
        ).querySelector("*");

        listItem.onmouseover = function () {
          this.mouseOver(`BSB-${container}`);
        }.bind(this);
        listItem.onmouseout = function () {
          this.mouseOut(`BSB-${container}`);
        }.bind(this);

        {
          const elem = listItem.querySelector(".bsb_label");
          this.setURL(this.BSBs.data[container].url, elem);
        }
        {
          const elem = listItem.querySelector(".BMS-Edit");
          elem.addEventListener("command", event => {
            gSubDialog.open(
              "chrome://floorp/content/preferences/dialogs/customURLs.xhtml",
              undefined,
              {
                id: event.target.getAttribute("value"),
                new: false,
                userContext:
                  this.BSBs.data[event.target.getAttribute("value")]
                    .usercontext,
              }
            );
          });
          elem.setAttribute("value", container);
          document.l10n.setAttributes(elem, "sidebar2-pref-setting");
        }
        {
          const elem = listItem.querySelector(".BMS-Remove");
          elem.addEventListener(
            "command",
            function (event) {
              this.deleteWebpanel(event.target.getAttribute("value"));
            }.bind(this)
          );
          elem.setAttribute("value", container);
          document.l10n.setAttributes(elem, "sidebar2-pref-delete");
        }
        {
          const elem = listItem.querySelector(".BMS-Up");
          elem.addEventListener(
            "command",
            function (event) {
              this.upWebpanel(event.target.getAttribute("value"));
            }.bind(this)
          );
          elem.setAttribute("value", container);
        }
        {
          const elem = listItem.querySelector(".BMS-Down");
          elem.addEventListener(
            "command",
            function (event) {
              this.downWebpanel(event.target.getAttribute("value"));
            }.bind(this)
          );
          elem.setAttribute("value", container);
        }
        this._list.insertBefore(listItem, document.getElementById("BSBSpace"));
      } else {
        listItem = document.getElementById(`BSB-${container}`);
        this._list.insertBefore(listItem, document.getElementById("BSBSpace"));
        this.setURL(
          this.BSBs.data[container].url,
          listItem.querySelector(".bsb_label")
        );
      }
      listItem
        ?.querySelector(".BMS-Up")
        ?.setAttribute?.("disabled", isFirst ? "true" : "false");
      listItem?.querySelector(".BMS-Down")?.setAttribute?.("disabled", "false");
      isFirst = false;
      lastElem = listItem;
    }
    lastElem?.querySelector(".BMS-Down")?.setAttribute?.("disabled", "true");
    const BSBAll = document.querySelectorAll(".BSB-list");
    const sicon = BSBAll.length;
    const side = this.BSBs.index.length;
    if (sicon > side) {
      for (let i = 0; i < sicon - side; i++) {
        BSBAll[i].remove();
      }
    }
  },
};
