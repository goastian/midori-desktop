export class PreferencesWrapper {
  /**
   *
   * @param {string} pref
   * @returns {boolean}
   */
  static prefHasUserValue(pref) {
    return window.Services.prefs.prefHasUserValue(pref);
  }

  /**
   *
   * @param {string} pref
   * @param {string} defaultValue
   * @returns {string}
   */
  static getStringPref(pref, defaultValue = "") {
    try {
      return window.Services.prefs.getStringPref(pref, defaultValue);
    } catch (error) {
      return defaultValue;
    }
  }

  /**
   *
   * @param {string} pref
   * @param {string} value
   */
  static setStringPref(pref, value) {
    return window.Services.prefs.setStringPref(pref, value);
  }

  /**
   *
   * @param {string} pref
   * @returns {boolean}
   */
  static getBoolPref(pref) {
    return window.Services.prefs.getBoolPref(pref);
  }

  /**
   *
   * @param {string} pref
   * @param {boolean} value
   */
  static setBoolPref(pref, value) {
    return window.Services.prefs.setBoolPref(pref, value);
  }
}
