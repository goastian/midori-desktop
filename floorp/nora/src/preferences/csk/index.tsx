/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import type {} from "solid-styled-jsx";
import { CustomShortcutKeyPage } from "./page";

import { showCSK } from "../hashchange";
import { initSetKey } from "./setkey";
import { Show } from "solid-js";

export function csk() {
  initSetKey();
  return (
    <section id="nora-csk-entry">
      <Show when={showCSK()}>
        <CustomShortcutKeyPage />
      </Show>
    </section>
  );
}
