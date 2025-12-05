import { NetUtilWrapper } from "./net_utils.mjs";

export class ChromeRegistry {
  static get #raw() {
    return window.Cc["@mozilla.org/chrome/chrome-registry;1"].getService(
      window.Ci.nsIChromeRegistry,
    );
  }

  /**
   *
   * @param {string} url
   * @returns {any}
   */
  static convertChromeURL(url) {
    if (!url || url === "null") {
      console.warn("ChromeRegistry: Attempted to convert null or invalid URL");
      return null;
    }
    try {
      const uri = NetUtilWrapper.newURI(url);
      return this.#raw.convertChromeURL(uri);
    } catch (error) {
      console.error("ChromeRegistry: Failed to convert URL:", url, error);
      return null;
    }
  }
}
