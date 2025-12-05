/**
 * @typedef {Object} PublicIdentity
 * @property {number} userContextId
 * @property {string} name
 * @property {boolean} public
 * @property {string} color
 * @property {string} icon
 */

export class ContextualIdentityServiceWrapper {
  static ensureDataReady() {
    window.ContextualIdentityService.ensureDataReady();
  }

  /**
   *
   * @returns {Array<number>}
   */
  static getPublicUserContextIds() {
    return window.ContextualIdentityService.getPublicUserContextIds();
  }

  /**
   *
   * @param {number} userContextId
   * @returns {PublicIdentity?}
   */
  static getPublicIdentityFromId(userContextId) {
    return window.ContextualIdentityService.getPublicIdentityFromId(userContextId);
  }

  /**
   *
   * @param {number} userContextId
   * @returns {string?}
   */
  static getUserContextLabel(userContextId) {
    return window.ContextualIdentityService.getUserContextLabel(userContextId);
  }
}
