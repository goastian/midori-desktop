/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { commands } from "./commands";
import { zCSKCommands, zCSKData, type CSKData } from "./defines";
import { checkIsSystemShortcut } from "./utils";

export class CustomShortcutKey {
  private static instance: CustomShortcutKey;
  private static windows: Window[] = [];

  //this boolean disable shortcut of csk
  //useful for registering
  disable_csk = false;
  static getInstance() {
    if (!CustomShortcutKey.instance) {
      CustomShortcutKey.instance = new CustomShortcutKey();
    }
    if (!CustomShortcutKey.windows.includes(window)) {
      CustomShortcutKey.instance.startHandleShortcut(window);
      CustomShortcutKey.windows.push(window);
      //console.log("add window");
    }
    //@ts-ignore
    Services.obs.addObserver(CustomShortcutKey.instance, "nora-csk");
    return CustomShortcutKey.instance;
  }

  //@ts-ignore
  observe(_subj, _topic, data: string) {
    const d = zCSKCommands.safeParse(JSON.parse(data));
    if (d.success) {
      switch (d.data.type) {
        case "disable-csk": {
          this.disable_csk = d.data.data;
          break;
        }
        case "update-pref": {
          this.initCSKData();
          //console.log(this.cskData);
          break;
        }
      }
    }
  }

  cskData: CSKData = {};
  private constructor() {
    this.initCSKData();

    console.warn("CSK Init Completed");
  }

  private initCSKData() {
    //TODO: safely catch
    this.cskData = zCSKData.parse(
      JSON.parse(
        Services.prefs.getStringPref("floorp.browser.nora.csk.data", "{}"),
      ),
    );
  }
  private startHandleShortcut(_window: Window) {
    _window.addEventListener("keydown", (ev) => {
      if (this.disable_csk) {
        //console.log("disable-csk");
        return;
      }
      if (
        ["Control", "Alt", "Meta", "Shift"].filter((k) => ev.key.includes(k))
          .length === 0
      ) {
        if (checkIsSystemShortcut(ev)) {
          console.warn(`This Event is registered in System: ${ev}`);
          return;
        }

        for (const [_key, shortcutDatum] of Object.entries(this.cskData)) {
          const key = _key as keyof CSKData;
          const { alt, ctrl, meta, shift } = shortcutDatum!.modifiers;
          if (
            ev.altKey === alt &&
            ev.ctrlKey === ctrl &&
            ev.metaKey === meta &&
            ev.shiftKey === shift &&
            ev.key === shortcutDatum!.key
          ) {
            commands[key].command(ev);
          }
        }
      }
    });
  }
}
