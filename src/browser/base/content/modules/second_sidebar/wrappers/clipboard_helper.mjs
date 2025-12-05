export class ClipboardHelperWrapper {
  static get clipboardHelper() {
    return window.Cc[
      "@mozilla.org/widget/clipboardhelper;1"
    ].getService(window.Ci.nsIClipboardHelper);
  }

  /**
   *
   * @param {string} value
   */
  static copyString(value) {
    this.clipboardHelper.copyString(value);
  }
}
