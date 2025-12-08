import { BrowserCommands } from "../globals.mjs";

export class BrowserCommandsWrapper {
  /**
   *
   * @param {Event} event
   */
  static tryToCloseWindow(event) {
    if (BrowserCommands && typeof BrowserCommands.tryToCloseWindow === 'function') {
      BrowserCommands.tryToCloseWindow(event);
    } else {
      console.warn('[BrowserCommandsWrapper] BrowserCommands.tryToCloseWindow not available');
    }
  }
}
