/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createSignal } from "solid-js";

export const [showCSK, setShowCSK] = createSignal(false);

const onHashChange = (ev: Event | null) => {
  switch (location.hash) {
    case "#csk": {
      setShowCSK(true);
      break;
    }
    default: {
      setShowCSK(false);
    }
  }
};

export function initHashChange() {
  window.addEventListener("hashchange", onHashChange);
  onHashChange(null);
}
