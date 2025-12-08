import { document, window } from "../globals.mjs";

export class UrlbarInputPatcher {
  /**
   * Patch the urlbar input in a web panel window
   * @param {Window} webPanelWindow - The web panel window to patch
   */
  static patch(webPanelWindow) {
    console.log("Patching #urlbar-input...");
    
    if (!webPanelWindow || !webPanelWindow.document) {
      console.warn("#urlbar-input patch skipped - no valid window");
      return;
    }
    
    this.#defineLazyGetter(webPanelWindow);
    console.log("#urlbar-input was patched");
  }

  static #defineLazyGetter(webPanelWindow) {
    const urlbarInput = webPanelWindow.document.querySelector("#urlbar-input");
    
    if (!urlbarInput) {
      console.warn("#urlbar-input element not found, skipping lazy getter definition");
      return;
    }
    
    try {
      ChromeUtils.defineLazyGetter(urlbarInput, "editor", () => null);
    } catch (error) {
      console.error("Error defining lazy getter on #urlbar-input:", error);
    }
  }
}
