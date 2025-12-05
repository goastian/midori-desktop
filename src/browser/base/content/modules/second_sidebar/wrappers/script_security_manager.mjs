export class ScriptSecurityManagerWrapper {
  /**@type {number} */
  static get DEFAULT_USER_CONTEXT_ID() {
    return window.Services.scriptSecurityManager.DEFAULT_USER_CONTEXT_ID;
  }

  /**
   *
   * @returns {number}
   */
  static getSystemPrincipal() {
    return window.Services.scriptSecurityManager.getSystemPrincipal();
  }
}
