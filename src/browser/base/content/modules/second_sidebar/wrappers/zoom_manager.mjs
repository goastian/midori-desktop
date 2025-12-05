import { Browser } from "../xul/base/browser.mjs"; // eslint-disable-line no-unused-vars

export class ZoomManagerWrapper {
  /**@type {number} */
  static get MIN() {
    return window.ZoomManager.MIN;
  }
  
  /**@type {number} */
  static get MAX() {
    return window.ZoomManager.MAX;
  }

  /**
   *
   * @param {Browser} browser
   * @returns {number}
   */
  static getZoomForBrowser(browser) {
    return window.ZoomManager.getZoomForBrowser(browser.getXUL());
  }

  /**
   *
   * @param {Browser} browser
   * @param {number} value
   */
  static setZoomForBrowser(browser, value) {
    return window.ZoomManager.setZoomForBrowser(browser.getXUL(), value);
  }

  /**
   * @returns {Array<number>}
   */
  static get zoomValues() {
    return window.ZoomManager.zoomValues;
  }

  /**
   *
   * @param {number} value
   * @returns {number}
   */
  static snap(value) {
    return window.ZoomManager.snap(value);
  }
}
