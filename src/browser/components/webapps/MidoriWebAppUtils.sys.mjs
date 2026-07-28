/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function isWebAppWindow(win) {
  return !!win?.document?.documentElement?.hasAttribute("taskbartab");
}

export function isRegularBrowserWindow(win) {
  return (
    !!win?.gBrowser &&
    !!win.toolbar?.visible &&
    win.location?.href === "chrome://browser/content/browser.xhtml" &&
    !isWebAppWindow(win)
  );
}
