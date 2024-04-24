/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const DOWNLOAD_NOTIFICATION_PREF = "floorp.download.notification";

browser.downloads.onCreated.addListener(async (file) => {
  let getL10nData = await browser.browserL10n.getFloorpL10nValues({
    file: ["browser/floorp.ftl"],
    text: ["floorp-started-download"],
  });
  let localizedList = [];
  for (let key in getL10nData) {
    localizedList.push(getL10nData[key]);
  }

  let pref = String(
    await browser.aboutConfigPrefs.getPref(DOWNLOAD_NOTIFICATION_PREF),
  );
  if (pref === "1" || pref === "3") {
    browser.notifications.create({
      type: "basic",
      iconUrl: "chrome://branding/content/about-logo.png",
      title: localizedList[0],
      message: file.filename,
    });
  }
});

browser.downloads.onChanged.addListener(async (file) => {
  let getL10nData = await browser.browserL10n.getFloorpL10nValues({
    file: ["browser/floorp.ftl"],
    text: ["floorp-finished-download"],
  });
  let localizedList = [];
  for (let key in getL10nData) {
    localizedList.push(getL10nData[key]);
  }

  let pref = String(
    await browser.aboutConfigPrefs.getPref(DOWNLOAD_NOTIFICATION_PREF),
  );

  if (!file.state) {
    return;
  }

  if (file.state.current == "complete" && (pref === "2" || pref === "3")) {
    let download = await browser.downloads.search({ id: file.id });
    browser.notifications.create({
      type: "basic",
      iconUrl: "chrome://branding/content/about-logo.png",
      title: localizedList[0],
      message: download[0].filename,
    });
  }
});
