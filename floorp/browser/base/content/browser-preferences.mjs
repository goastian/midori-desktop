/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let { userJsList } = ChromeUtils.importESModule(
  "resource://floorp/UserjsUtils.sys.mjs"
);

// I glared at the source code for about 3 hours, but for some reason I decided to use the server because it would be unclear because of the Floorp interface settings. God forgive me

export const gFloorpPreferences = {
  initialized: false,

  get BROWSER_CHROME_SYSTEM_COLOR() {
    return Services.prefs.getIntPref("floorp.chrome.theme.mode");
  },

  get FLOORP_NOTES_LATEST_BACKUP_TIME_PREF() {
    return "floorp.browser.note.backup.latest.time";
  },

  get FLOORP_NOTES_PREF() {
    return "floorp.browser.note.memos";
  },

  get BROWSER_SETED_USERAGENT() {
    return Services.prefs.getIntPref(this.BROWSER_SETED_USERAGENT_PREF);
  },

  get BROWSER_SETED_USERAGENT_PREF() {
    return "floorp.browser.UserAgent";
  },

  get GENERAL_USERAGENT_OVERRIDE_PREF() {
    return "general.useragent.override";
  },

  init() {
    if (this.initialized) {
      return;
    }

    // Theme
    switch (this.BROWSER_CHROME_SYSTEM_COLOR) {
      case 1:
        Services.prefs.setIntPref("ui.systemUsesDarkTheme", 1);
        break;
      case 0:
        Services.prefs.setIntPref("ui.systemUsesDarkTheme", 0);
        break;
      case -1:
        Services.prefs.clearUserPref("ui.systemUsesDarkTheme");
        break;
    }

    Services.prefs.addObserver("floorp.chrome.theme.mode", () => {
      switch (this.BROWSER_CHROME_SYSTEM_COLOR) {
        case 1:
          Services.prefs.setIntPref("ui.systemUsesDarkTheme", 1);
          break;
        case 0:
          Services.prefs.setIntPref("ui.systemUsesDarkTheme", 0);
          break;
        case -1:
          Services.prefs.clearUserPref("ui.systemUsesDarkTheme");
          break;
      }
    });

    /*------------------------------------- User Agent -------------------------------------*/
    {
      let setUserAgent = function (BROWSER_SETED_USERAGENT) {
        switch (BROWSER_SETED_USERAGENT) {
          default:
            Services.prefs.clearUserPref(
              gFloorpPreferences.GENERAL_USERAGENT_OVERRIDE_PREF
            );
            break;
          case 1:
            Services.prefs.setStringPref(
              gFloorpPreferences.GENERAL_USERAGENT_OVERRIDE_PREF,
              window.CHROME_STABLE_UA.win
            );
            break;
          case 2:
            Services.prefs.setStringPref(
              gFloorpPreferences.GENERAL_USERAGENT_OVERRIDE_PREF,
              window.CHROME_STABLE_UA.mac
            );
            break;
          case 3:
            Services.prefs.setStringPref(
              gFloorpPreferences.GENERAL_USERAGENT_OVERRIDE_PREF,
              window.CHROME_STABLE_UA.linux
            );
            break;
          case 4:
            Services.prefs.setStringPref(
              gFloorpPreferences.GENERAL_USERAGENT_OVERRIDE_PREF,
              "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/110.0.5481.83 Mobile/15E148 Safari/604.1"
            );
            break;
          case 5:
            Services.prefs.setStringPref(
              gFloorpPreferences.GENERAL_USERAGENT_OVERRIDE_PREF,
              Services.prefs.getCharPref("floorp.general.useragent.override")
            );
        }
      };

      Services.prefs.addObserver(
        gFloorpPreferences.BROWSER_SETED_USERAGENT_PREF,
        function () {
          setUserAgent(gFloorpPreferences.BROWSER_SETED_USERAGENT);
        }
      );

      setUserAgent(gFloorpPreferences.BROWSER_SETED_USERAGENT);
    }

    if (!Services.prefs.prefHasUserValue(this.FLOORP_NOTES_PREF)) {
      this.backupFloorpNotes();
    }

    //Backup Limit is 10.
    this.getAllBackupedNotes().then(content => {
      const backupLimit = 10;
      const dataKeys = Object.keys(content.data);

      if (dataKeys.length > backupLimit) {
        const sortedKeys = dataKeys.sort((a, b) => b - a);
        const deleteKeys = sortedKeys.slice(backupLimit);

        deleteKeys.forEach(key => {
          delete content.data[key];
        });

        let jsonToStr = JSON.stringify(content).slice(0, -2) + ",";
        const filePath = PathUtils.join(
          Services.dirsvc.get("ProfD", Ci.nsIFile).path,
          "floorp_notes_backup.json"
        );
        IOUtils.writeUTF8(filePath, jsonToStr);
      }
    });

    /*------------------------------------- user.js -------------------------------------*/
    this.applyUserJSCustomize();
    this.initialized = true;
  },

  async backupFloorpNotes() {
    const memos = Services.prefs
      .getCharPref(this.FLOORP_NOTES_PREF)
      .slice(1, -1);
    const time = new Date().getTime();
    const backup = { [time]: memos };
    const jsonToStr = JSON.stringify(backup).slice(1, -1);
    Services.prefs.setCharPref(this.FLOORP_NOTES_LATEST_BACKUP_TIME_PREF, time);

    try {
      IOUtils.exists(
        PathUtils.join(
          Services.dirsvc.get("ProfD", Ci.nsIFile).path,
          "floorp_notes_backup.json"
        )
      ).then(data => {
        if (!data) {
          let backupFilePath = PathUtils.join(
            Services.dirsvc.get("ProfD", Ci.nsIFile).path,
            "floorp_notes_backup.json"
          );
          IOUtils.writeUTF8(backupFilePath, `{"data":{${jsonToStr},`);
        } else {
          let backupFilePath = PathUtils.join(
            Services.dirsvc.get("ProfD", Ci.nsIFile).path,
            "floorp_notes_backup.json"
          );
          IOUtils.readUTF8(backupFilePath).then(content => {
            let appText = `${content}${jsonToStr},`;
            IOUtils.writeUTF8(backupFilePath, appText);
          });
        }
      });
    } catch (e) {}
  },

  getAllBackupedNotes() {
    const filePath = PathUtils.join(
      Services.dirsvc.get("ProfD", Ci.nsIFile).path,
      "floorp_notes_backup.json"
    );
    const content = IOUtils.readUTF8(filePath).then(fileContent => {
      const result = fileContent.slice(0, -1) + "}}";
      return JSON.parse(result);
    });
    return content;
  },

  async applyUserJSCustomize() {
    const pref = Services.prefs.getStringPref("floorp.user.js.customize", "");

    if (pref != "") {
      let url = userJsList[pref][0];
      const PROFILE_DIR = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
      const userjs = PathUtils.join(PROFILE_DIR, "user.js");

      try {
        userjs.remove(false);
      } catch (e) {}

      fetch(url)
        .then(response => response.text())
        .then(async data => {
          const encoder = new TextEncoder("UTF-8");
          const writeData = encoder.encode(data);

          await IOUtils.write(userjs, writeData);
        });
    }
  },
};

gFloorpPreferences.init();
