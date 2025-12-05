export class gNavToolboxWrapper {
  /**
   *
   * @param {string} type
   * @param {function(Event):void} listener
   */
  static addEventListener(type, listener) {
    window.gNavToolbox.addEventListener(type, listener);
  }
}
