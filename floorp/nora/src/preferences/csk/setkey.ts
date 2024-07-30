/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createEffect, createSignal } from "solid-js";
import {
  type CSKCommands,
  type CSKData,
  zCSKData,
} from "../../components/custom-shortcut-key/defines";
import type { commands } from "../../components/custom-shortcut-key/commands";
import { checkIsSystemShortcut } from "../../components/custom-shortcut-key/utils";
import { create } from "sortablejs";

export const [editingStatus, setEditingStatus] = createSignal<string | null>(
  null,
);
export const [currentFocus, setCurrentFocus] = createSignal<
  keyof typeof commands | null
>(null);

createEffect(() => {
  //console.log(currentFocus() !== null);
  Services.obs.notifyObservers(
    {},
    "nora-csk",
    JSON.stringify({
      type: "disable-csk",
      data: currentFocus() !== null,
    } as CSKCommands),
  );
});

export const [cskData, setCSKData] = createSignal(
  //TODO: safely catch
  zCSKData.parse(
    JSON.parse(
      Services.prefs.getStringPref("floorp.browser.nora.csk.data", "{}"),
    ),
  ),
);

export function cskDatumToString(data: CSKData, key: keyof CSKData) {
  //TODO: Meta key
  if (key in data) {
    const datum = data[key];
    return `${datum?.modifiers.ctrl ? "Ctrl + " : ""}${
      datum?.modifiers.alt ? "Alt + " : ""
    }${datum?.modifiers.shift ? "Shift + " : ""}${datum?.key}`;
  }
  return "";
}

createEffect(() => {
  Services.prefs.setStringPref(
    "floorp.browser.nora.csk.data",
    JSON.stringify(cskData()),
  );
  Services.obs.notifyObservers(
    {},
    "nora-csk",
    JSON.stringify({
      type: "update-pref",
    } as CSKCommands),
  );
});

export function initSetKey() {
  document.addEventListener("keydown", (ev) => {
    const key = ev.key;
    const alt = ev.altKey;
    const ctrl = ev.ctrlKey;
    const shift = ev.shiftKey;
    const meta = ev.metaKey;

    // If shift is pressed without any other modifier, it's a system shortcut
    if (shift && !alt && !ctrl && !meta) {
      return;
    }

    if (key === "Escape" || key === "Tab") {
      return;
    }

    const focus = currentFocus();

    if (!(alt || ctrl || shift || meta)) {
      if (key === "Delete" || key === "Backspace") {
        if (focus) {
          ev.preventDefault();
          const temp = cskData();
          for (const key of Object.keys(temp)) {
            if (key === focus) {
              delete temp[key];
              setCSKData(zCSKData.parse(temp));
              setEditingStatus(cskDatumToString(cskData(), focus));
              break;
            }
          }
          //console.log(cskData());
        }
        return;
      }
    }

    // on register

    if (focus) {
      ev.preventDefault();
      if (
        ["Control", "Alt", "Meta", "Shift"].filter((k) => key.includes(k))
          .length === 0
      ) {
        if (checkIsSystemShortcut(ev)) {
          console.warn(`This Event is registered in System: ${ev}`);
          return;
        }
        if (shift&&!(alt||ctrl||meta)&&key){console.warn("Shift + [key] is not permitted");return;}
        setCSKData({
          ...cskData(),
          [focus]: {
            key: key,
            modifiers: {
              alt,
              ctrl,
              meta,
              shift,
            },
          },
        });
        setEditingStatus(cskDatumToString(cskData(), focus));
      }
    }
  });
}
