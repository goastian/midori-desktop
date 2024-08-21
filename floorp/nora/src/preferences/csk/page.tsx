/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { For } from "solid-js";
import {
  cskData,
  cskDatumToString,
  currentFocus,
  editingStatus,
  setCurrentFocus,
  setEditingStatus,
} from "./setkey";
import {
  commands,
  csk_category,
} from "../../components/custom-shortcut-key/commands";

export const CustomShortcutKeyPage = () => {
  return (
    <>
      <div>
        <h1 data-l10n-id="floorp-CSK-title" />
        <xul:description
          class="indent tip-caption"
          data-l10n-id="floorp-CSK-description"
        />
        <xul:checkbox data-l10n-id="disable-fx-actions" />
      </div>
      <For each={csk_category}>
        {(category) => (
          <xul:vbox class="csks-content-box">
            <h2
              data-l10n-id={"floorp-custom-actions-" + category}
              class="csks-box-title"
            >
              {category}
            </h2>
            <For each={Object.entries(commands)}>
              {([key, value]) =>
                value.type === category ? (
                  <div class="csks-box-item" style={{ display: "flex" }}>
                    <label
                      style={{ "flex-grow": "1" }}
                      data-l10n-id={
                        "floorp-custom-actions-" +
                        key.replace("floorp-", "").replace("gecko-", "")
                      }
                    >
                      {key}
                    </label>
                    <input
                      value={
                        currentFocus() === key && editingStatus() !== null
                          ? editingStatus()!
                          : cskDatumToString(cskData(), key)
                      }
                      onFocus={(ev) => {
                        setCurrentFocus(key);
                      }}
                      onBlur={(ev) => {
                        setEditingStatus(null);
                        if (currentFocus() === key) {
                          setCurrentFocus(null);
                        }
                      }}
                      readonly={true}
                      placeholder="Type a shortcut"
                      style={{
                        "border-radius": "4px",
                        color: "inherit",
                        padding: "6px 10px",
                        "background-color": "transparent !important",
                        border:
                          "1px solid var(--input-border-color) !important",
                        transition: "all .2s ease-in-out !important",
                      }}
                    />
                  </div>
                ) : undefined
              }
            </For>
          </xul:vbox>
        )}
      </For>
    </>
  );
};
