/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { commands } from "./commands";
import { CSKData } from "./defines";

export function getFluentLocalization(actionName: keyof CSKData) {
  if (!commands[actionName]) {
    console.error(`actionName(${actionName}) do not exists.`);
    return null;
  }
  //TODO:
  //return `floorp-custom-actions-${commands[actionName][1]}`;
}
