import { PreferencesWrapper } from "../wrappers/preferences.mjs";

export class Settings {
  /**
   *
   * @param {string} pref
   * @returns {Object | Array<Object> | null}
   */
  static load(pref) {
    try {
      // Get the preference value, falling back to default if not set
      const prefValue = PreferencesWrapper.getStringPref(pref);
      
      // If empty string, it means no value is set, return null to use defaults
      if (!prefValue || prefValue.trim() === "") {
        console.log(`Pref "${pref}" is empty, using defaults`);
        return null;
      }
      
      const value = JSON.parse(prefValue);
      console.log(`Loaded pref "${pref}":`, value);
      return value;
    } catch (error) {
      console.warn(`Failed to load pref "${pref}":`, error);
      return null;
    }
  }

  /**
   *
   * @param {string} pref
   * @param {Object | Array<Object>} value
   */
  static save(pref, value) {
    console.log(`Saving pref "${pref}":`, value);
    PreferencesWrapper.setStringPref(pref, JSON.stringify(value));
  }
}
