import { WindowWrapper } from "./window.mjs";

export class WindowManagerWrapper {
  /**
   *
   * @returns {WindowWrapper}
   */
  static getMostRecentBrowserWindow() {
    return new WindowWrapper(window.Services.wm.getMostRecentBrowserWindow());
  }
}
