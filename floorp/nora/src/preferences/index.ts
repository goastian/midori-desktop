/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { insert, render } from "../solid-xul/solid-xul";
import { csk } from "./csk";
import { category } from "./csk/category";
import { initHashChange } from "./hashchange";

export default function initScripts() {
  const init = () => {
    insert(
      document.querySelector("#categories"),
      category(),
      document.getElementById("category-Downloads"),
    );
    render(csk, document.querySelector(".pane-container"));
    initHashChange();
    switch (location.hash) {
      case "#csk": {
        document.getElementById("category-csk")?.click();
        break;
      }
    }
  };

  if (document.readyState !== "loading") {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
}

initScripts();
