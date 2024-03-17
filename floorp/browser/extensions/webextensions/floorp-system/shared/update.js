/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(async () => {
  const API_END_POINT = "https://update.astian.org/browser/latest.json";
  const l10nData = await browser.browserL10n.getFloorpL10nValues({
    file: ["browser/floorp.ftl", "branding/brand.ftl"],
    text: [
      "floorp-notificationTitle-latest",
      "floorp-notificationContent-latest",
      "floorp-notificationTitle",
      "floorp-notificationContent",
    ],
  });

  const Notify = async (url, now, latest) => {
    const msg = browser.i18n;
    let created_notificationId = await browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/link-48.png"),
      title: l10nData[2],
      message: l10nData[3] + "\n" + now + " -> " + latest,
    });

    let handle_onClicked = (notificationId) => {
      if (created_notificationId === notificationId) {
        browser.tabs.create({ url: url });
      }
    };
    browser.notifications.onClicked.addListener(handle_onClicked);

    let handle_onClosed = (notificationId) => {
      if (created_notificationId === notificationId) {
        browser.notifications.onClicked.removeListener(handle_onClicked);
        browser.notifications.onClosed.removeListener(handle_onClosed);
      }
    };
    browser.notifications.onClosed.addListener(handle_onClosed);
  };

  const NotifyNew = (now, latest) => {
    browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/link-48-last.png"),
      title: l10nData[0],
      message: l10nData[1],
    });
  };

  const CheckUpdate = async (options) => {
    let updaterEnabled = await browser.aboutConfigPrefs.getPref(
      "enable.floorp.update",
    );
    if (!updaterEnabled) return; //updater is disabled

    let latestNotifyEnabledPref = await browser.aboutConfigPrefs.getPref(
      "enable.floorp.updater.latest",
    );
    let latestNotifyEnabled =
      (options && options.isBrowserActionClicked) || latestNotifyEnabledPref;

    let displayVersion = await browser.BrowserInfo.getDisplayVersion();

    let platformInfo = await browser.runtime.getPlatformInfo();

    fetch(API_END_POINT)
      .then((res) => {
        if (!res.ok) throw `${res.status} ${res.statusText}`;
        return res.json();
      })
      .then((datas) => {
        let platformKeyName =
          platformInfo["os"] === "mac"
            ? "mac"
            : `${platformInfo["os"]}-${platformInfo["arch"]}`;
        let data = datas[platformKeyName];
        if (!data["notify"]) return;
        if (data["version"] !== displayVersion) {
          Notify(data["url"], displayVersion, data["version"]);
        } else if (latestNotifyEnabled) {
          NotifyNew();
        }
      })
      .catch((e) => {
        console.error(e);
      });
  };

  let isPortable = false;
  try {
    isPortable =
      await browser.aboutConfigPrefs.getBoolPref("floorp.isPortable");
  } catch (e) {}
  if (isPortable) return;

  CheckUpdate();

  if (browser.browserAction) {
    browser.browserAction.onClicked.addListener(function () {
      CheckUpdate({ isBrowserActionClicked: true });
    });
  }
})();
