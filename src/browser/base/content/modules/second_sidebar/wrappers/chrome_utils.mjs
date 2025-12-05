/**
 * @typedef {Object} QueryInterface
 */

export class ChromeUtilsWrapper {
  /**
   *
   * @param {Array<string>} interfaces
   * @returns {QueryInterface}
   */
  static generateQI(interfaces) {
    return window.ChromeUtils.generateQI(interfaces);
  }
}
