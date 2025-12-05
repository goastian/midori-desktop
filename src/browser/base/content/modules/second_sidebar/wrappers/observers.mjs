export class ObserversWrapper {
  /**
   * @typedef {Object} Observer
   * @property {function(object, string):void} observe
   */

  /**
   *
   * @param {Observer} observer
   * @param {string} topic
   */
  static addObserver(observer, topic) {
    window.Services.obs.addObserver(observer, topic);
  }

  /**
   *
   * @param {Observer} observer
   * @param {string} topic
   */
  static removeObserver(observer, topic) {
    window.Services.obs.removeObserver(observer, topic);
  }

  /**
   *
   * @param {Observer} subject
   * @param {string} topic
   */
  static notifyObservers(subject, topic) {
    window.Services.obs.notifyObservers(subject, topic);
  }
}
