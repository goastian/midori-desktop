import { window } from "../globals.mjs";

import { WindowWrapper } from "./window.mjs";

export class WindowManagerWrapper {
  /**
   *
   * @returns {WindowWrapper}
   */
  static getMostRecentBrowserWindow() {
    return new WindowWrapper(Services.wm.getMostRecentBrowserWindow());
  }
}
