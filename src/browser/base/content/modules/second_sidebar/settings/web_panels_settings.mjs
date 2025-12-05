import { Settings } from "./settings.mjs";
import { WebPanelSettings } from "./web_panel_settings.mjs";
import { PreferencesWrapper } from "../wrappers/preferences.mjs";

const PREF = "midori.second-sidebar.web-panels";

export class WebPanelsSettings {
  /**@type {Array<WebPanelSettings} */
  #webPanels = [];

  /**
   *
   * @param {Array<WebPanelSettings>} webPanels
   */
  constructor(webPanels) {
    this.#webPanels = webPanels;
  }

  get webPanels() {
    return this.#webPanels;
  }

  /**
   *
   * @param {string} sidebarPosition
   * @param {string} defaultFloatingOffset
   * @returns {WebPanelsSettings}
   */
  static load(sidebarPosition, defaultFloatingOffset) {
    let pref = Settings.load(PREF);
    
    // If we got an empty array but there's a user value set,
    // it means the user explicitly saved an empty array.
    // Clear it to load from default preferences instead.
    if (Array.isArray(pref) && pref.length === 0 && 
        PreferencesWrapper.prefHasUserValue(PREF)) {
      console.log("Clearing empty web panels user preference to load defaults");
      // Clear the user preference by setting empty string
      try {
        window.Services.prefs.clearUserPref(PREF);
        // Reload from defaults
        pref = Settings.load(PREF);
      } catch (error) {
        console.warn("Failed to clear user pref:", error);
      }
    }
    
    // Fallback to empty array if still null
    pref = pref ?? [];

    return new WebPanelsSettings(
      pref.map((webPanelPref) =>
        WebPanelSettings.fromObject(
          sidebarPosition,
          `var(--space-${defaultFloatingOffset})`,
          webPanelPref,
        ),
      ),
    );
  }

  save() {
    Settings.save(
      PREF,
      this.#webPanels.map((webPanel) => webPanel.toObject()),
    );
  }
}
