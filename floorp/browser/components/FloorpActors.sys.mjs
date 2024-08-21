/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const EXPORTED_SYMBOLS = [];

import { ActorManagerParent } from "resource://gre/modules/ActorManagerParent.sys.mjs";

export let JSWINDOWACTORS = {
  SiteSpecificBrowser: {
    parent: {
      esModuleURI: "resource://floorp/ssb/SiteSpecificBrowserParent.sys.mjs",
    },
    child: {
      esModuleURI: "resource://floorp/ssb/SiteSpecificBrowserChild.sys.mjs",
    },

    allFrames: true,
  },
};

ActorManagerParent.addJSWindowActors(JSWINDOWACTORS);
