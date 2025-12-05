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
    
    // Fallback to empty array if null
    pref = pref ?? [];
    
    console.log(`WebPanelsSettings.load: Loading ${pref.length} web panels`);

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
    const data = this.#webPanels.map((webPanel) => webPanel.toObject());
    console.log(`WebPanelsSettings.save: Saving ${data.length} web panels:`, data);
    Settings.save(PREF, data);
  }
}
