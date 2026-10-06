export const DEFAULT_THEME_ID = 'default-theme@mozilla.org';
export const COLORWAY_PREF = 'midori.colorway';
export const ACTIVE_THEME_PREF = 'extensions.activeThemeID';
export const APPEARANCE_PREF = 'ui.systemUsesDarkTheme';
export const COLORWAYS = ['system', 'jade', 'ocean', 'sunrise', 'forest', 'midnight', 'ember'];

export class SetupThemeSelection {
  constructor({ prefs, addonManager, themes }) {
    this.prefs = prefs;
    this.addonManager = addonManager;
    this.themes = themes;
  }

  get selection() {
    const themeId = this.prefs.getStringPref(ACTIVE_THEME_PREF, DEFAULT_THEME_ID);
    if (themeId !== DEFAULT_THEME_ID) {
      return { themeId };
    }
    const colorway = this.prefs.getStringPref(COLORWAY_PREF, 'system');
    return { colorway: COLORWAYS.includes(colorway) ? colorway : 'system' };
  }

  selectAppearance(appearance) {
    if (appearance === 'system') {
      this.prefs.clearUserPref(APPEARANCE_PREF);
    } else if (appearance === 'light' || appearance === 'dark') {
      this.prefs.setIntPref(APPEARANCE_PREF, appearance === 'dark' ? 1 : 0);
    }
  }

  async select({ colorway, themeId }) {
    if (colorway) {
      if (!COLORWAYS.includes(colorway)) {
        throw new Error('Unknown Midori color');
      }
      const theme = await this.addonManager.getAddonByID(DEFAULT_THEME_ID);
      if (!theme) {
        throw new Error('Default theme is unavailable');
      }
      await theme.enable();
      this.prefs.setStringPref(COLORWAY_PREF, colorway);
    } else if (
      !this.themes?.hasThemeId(themeId) ||
      !(await this.themes.updateThemeState(themeId, true, { layout: 'full' }))
    ) {
      throw new Error('Unable to activate the browser theme');
    }
    this.prefs.setBoolPref('midori.gradient.enabled', false);
  }
}
