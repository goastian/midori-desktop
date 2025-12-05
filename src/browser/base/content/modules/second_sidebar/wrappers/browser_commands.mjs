export class BrowserCommandsWrapper {
  /**
   *
   * @param {Event} event
   */
  static tryToCloseWindow(event) {
    if (typeof window.BrowserCommands !== 'undefined') {
      window.BrowserCommands.tryToCloseWindow(event);
    } else {
      console.warn("BrowserCommands is not available");
    }
  }
}
