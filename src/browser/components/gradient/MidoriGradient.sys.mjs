/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * MidoriGradient — Custom gradient system for the browser chrome.
 *
 * Allows users to define custom gradients (linear, radial, conic) with
 * multiple color stops, texture overlays, and angle control. The gradient
 * is applied to #navigator-toolbox and related chrome elements via CSS
 * custom properties injected into each browser window.
 *
 * Persists configuration via preferences:
 *   - midori.gradient.enabled  (bool)
 *   - midori.gradient.type     (string: "linear" | "radial" | "conic")
 *   - midori.gradient.angle    (int: 0–360)
 *   - midori.gradient.stops    (string: JSON array of {color, position})
 *   - midori.gradient.texture  (string: "none" | "noise" | "dots" | "grid")
 *   - midori.gradient.opacity  (int: 0–100, texture overlay opacity)
 *
 * @patch Midori Browser
 */

const PREF_ENABLED = "midori.gradient.enabled";
const PREF_TYPE = "midori.gradient.type";
const PREF_ANGLE = "midori.gradient.angle";
const PREF_STOPS = "midori.gradient.stops";
const PREF_TEXTURE = "midori.gradient.texture";
const PREF_TEXTURE_OPACITY = "midori.gradient.texture.opacity";

const STYLE_SHEET_ID = "midori-gradient-style";

const DEFAULT_STOPS = [
  { color: "#2d8659", position: 0 },
  { color: "#1a5c3a", position: 100 },
];

const TEXTURE_PATTERNS = {
  none: "",
  noise: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E")`,
  dots: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Ccircle cx='2' cy='2' r='1' fill='white' opacity='0.15'/%3E%3C/svg%3E")`,
  grid: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20'%3E%3Cpath d='M 20 0 L 0 0 0 20' fill='none' stroke='white' stroke-width='0.5' opacity='0.1'/%3E%3C/svg%3E")`,
};

const PRESET_GRADIENTS = [
  {
    name: "Jade Forest",
    type: "linear",
    angle: 135,
    stops: [
      { color: "#2d8659", position: 0 },
      { color: "#1a5c3a", position: 100 },
    ],
    texture: "none",
  },
  {
    name: "Ocean Depths",
    type: "linear",
    angle: 180,
    stops: [
      { color: "#0a2540", position: 0 },
      { color: "#1565c0", position: 50 },
      { color: "#0d47a1", position: 100 },
    ],
    texture: "none",
  },
  {
    name: "Sunset Blaze",
    type: "linear",
    angle: 135,
    stops: [
      { color: "#ff6f00", position: 0 },
      { color: "#e65100", position: 50 },
      { color: "#bf360c", position: 100 },
    ],
    texture: "none",
  },
  {
    name: "Aurora",
    type: "linear",
    angle: 120,
    stops: [
      { color: "#1b5e20", position: 0 },
      { color: "#00897b", position: 40 },
      { color: "#0277bd", position: 70 },
      { color: "#4a148c", position: 100 },
    ],
    texture: "noise",
  },
  {
    name: "Midnight",
    type: "linear",
    angle: 180,
    stops: [
      { color: "#0d0d0d", position: 0 },
      { color: "#1a1a2e", position: 50 },
      { color: "#16213e", position: 100 },
    ],
    texture: "none",
  },
  {
    name: "Cherry Blossom",
    type: "linear",
    angle: 135,
    stops: [
      { color: "#880e4f", position: 0 },
      { color: "#c2185b", position: 50 },
      { color: "#e91e63", position: 100 },
    ],
    texture: "dots",
  },
  {
    name: "Nebula",
    type: "radial",
    angle: 0,
    stops: [
      { color: "#4a148c", position: 0 },
      { color: "#1a237e", position: 40 },
      { color: "#0d0d0d", position: 100 },
    ],
    texture: "noise",
  },
  {
    name: "Copper",
    type: "linear",
    angle: 135,
    stops: [
      { color: "#4e342e", position: 0 },
      { color: "#795548", position: 50 },
      { color: "#a1887f", position: 100 },
    ],
    texture: "grid",
  },
];

export const MidoriGradient = {
  _initialized: false,
  _windowListeners: new WeakMap(),

  get presets() {
    return PRESET_GRADIENTS;
  },

  get texturePatterns() {
    return TEXTURE_PATTERNS;
  },

  init() {
    if (this._initialized) return;
    this._initialized = true;

    Services.prefs.addObserver(PREF_ENABLED, this);
    Services.prefs.addObserver(PREF_TYPE, this);
    Services.prefs.addObserver(PREF_ANGLE, this);
    Services.prefs.addObserver(PREF_STOPS, this);
    Services.prefs.addObserver(PREF_TEXTURE, this);
    Services.prefs.addObserver(PREF_TEXTURE_OPACITY, this);

    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.obs.addObserver(this, "domwindowclosed");

    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (win.document.readyState === "complete") {
        this._applyToWindow(win);
      }
    }

    console.log(
      `MidoriGradient: Initialized (enabled=${this.isEnabled()})`
    );
  },

  isEnabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, false);
  },

  getConfig() {
    let stops;
    try {
      stops = JSON.parse(
        Services.prefs.getStringPref(PREF_STOPS, JSON.stringify(DEFAULT_STOPS))
      );
    } catch (e) {
      stops = DEFAULT_STOPS;
    }

    return {
      enabled: this.isEnabled(),
      type: Services.prefs.getStringPref(PREF_TYPE, "linear"),
      angle: Services.prefs.getIntPref(PREF_ANGLE, 135),
      stops,
      texture: Services.prefs.getStringPref(PREF_TEXTURE, "none"),
      textureOpacity: Services.prefs.getIntPref(PREF_TEXTURE_OPACITY, 50),
    };
  },

  setConfig(config) {
    if (config.enabled !== undefined) {
      Services.prefs.setBoolPref(PREF_ENABLED, config.enabled);
    }
    if (config.type !== undefined) {
      Services.prefs.setStringPref(PREF_TYPE, config.type);
    }
    if (config.angle !== undefined) {
      Services.prefs.setIntPref(PREF_ANGLE, config.angle);
    }
    if (config.stops !== undefined) {
      Services.prefs.setStringPref(PREF_STOPS, JSON.stringify(config.stops));
    }
    if (config.texture !== undefined) {
      Services.prefs.setStringPref(PREF_TEXTURE, config.texture);
    }
    if (config.textureOpacity !== undefined) {
      Services.prefs.setIntPref(PREF_TEXTURE_OPACITY, config.textureOpacity);
    }
  },

  applyPreset(index) {
    const preset = PRESET_GRADIENTS[index];
    if (!preset) return;

    this.setConfig({
      enabled: true,
      type: preset.type,
      angle: preset.angle,
      stops: preset.stops,
      texture: preset.texture,
    });
  },

  buildGradientCSS(config) {
    if (!config || !config.stops || config.stops.length < 2) {
      return "";
    }

    const stopsStr = config.stops
      .map((s) => `${s.color} ${s.position}%`)
      .join(", ");

    let gradient;
    switch (config.type) {
      case "radial":
        gradient = `radial-gradient(ellipse at center, ${stopsStr})`;
        break;
      case "conic":
        gradient = `conic-gradient(from ${config.angle}deg, ${stopsStr})`;
        break;
      case "linear":
      default:
        gradient = `linear-gradient(${config.angle}deg, ${stopsStr})`;
        break;
    }

    return gradient;
  },

  _buildStyleSheet(config) {
    if (!config.enabled) {
      return "";
    }

    const gradient = this.buildGradientCSS(config);
    if (!gradient) return "";

    const texturePattern = TEXTURE_PATTERNS[config.texture] || "";
    const textureOpacity = (config.textureOpacity || 50) / 100;

    let textureLayer = "";
    if (texturePattern && config.texture !== "none") {
      textureLayer = `
/* Texture overlay */
#navigator-toolbox::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: ${texturePattern};
  background-repeat: repeat;
  opacity: ${textureOpacity};
  pointer-events: none;
  z-index: 1;
}

#navigator-toolbox {
  position: relative;
}
`;
    }

    return `
/* MidoriGradient — Dynamic gradient applied to browser chrome */
:root {
  --midori-gradient: ${gradient};
  --midori-gradient-enabled: 1;
}

#navigator-toolbox {
  background-image: var(--midori-gradient) !important;
  background-color: transparent !important;
}

#navigator-toolbox #nav-bar {
  background-color: transparent !important;
  background-image: none !important;
}

#navigator-toolbox #PersonalToolbar {
  background-color: transparent !important;
  background-image: none !important;
}

#navigator-toolbox #titlebar {
  background-color: transparent !important;
  background-image: none !important;
}

/* Tab bar over gradient */
#TabsToolbar, #tabbrowser-tabs {
  background-color: transparent !important;
  background-image: none !important;
}

/* Ensure text is readable over gradient */
#navigator-toolbox,
#navigator-toolbox *:not(img):not(image):not(.urlbar-icon):not(toolbarbutton) {
  --toolbar-color: #ffffff !important;
}

#navigator-toolbox .toolbarbutton-icon,
#navigator-toolbox .urlbar-icon {
  fill: #ffffff !important;
  -moz-context-properties: fill, fill-opacity !important;
}

/* Selected tab contrast */
.tabbrowser-tab .tab-background[selected="true"] {
  background-color: rgba(255, 255, 255, 0.20) !important;
}

.tabbrowser-tab:hover:not([selected]) .tab-background {
  background-color: rgba(255, 255, 255, 0.08) !important;
}

/* URL bar over gradient */
#urlbar:not([focused]) .urlbar-background {
  background-color: rgba(255, 255, 255, 0.18) !important;
}

#urlbar[focused] .urlbar-background {
  background-color: rgba(255, 255, 255, 0.95) !important;
  color: #1a1a1a !important;
}

#urlbar[focused] .urlbar-input {
  color: #1a1a1a !important;
}

${textureLayer}
`;
  },

  _applyToWindow(win) {
    if (!win?.document) return;

    const doc = win.document;
    const config = this.getConfig();

    // Remove old style
    const existing = doc.getElementById(STYLE_SHEET_ID);
    if (existing) {
      existing.remove();
    }

    if (!config.enabled) {
      return;
    }

    const css = this._buildStyleSheet(config);
    if (!css) return;

    const style = doc.createElement("style");
    style.id = STYLE_SHEET_ID;
    style.setAttribute("type", "text/css");
    style.textContent = css;
    doc.documentElement.appendChild(style);
  },

  _refreshAllWindows() {
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      this._applyToWindow(win);
    }
  },

  observe(subject, topic, data) {
    switch (topic) {
      case "nsPref:changed":
        if (data?.startsWith("midori.gradient.")) {
          this._refreshAllWindows();
        }
        break;

      case "browser-delayed-startup-finished":
        this._applyToWindow(subject);
        break;

      case "domwindowclosed":
        // Cleanup not strictly needed since the window goes away
        break;
    }
  },

  uninit() {
    Services.prefs.removeObserver(PREF_ENABLED, this);
    Services.prefs.removeObserver(PREF_TYPE, this);
    Services.prefs.removeObserver(PREF_ANGLE, this);
    Services.prefs.removeObserver(PREF_STOPS, this);
    Services.prefs.removeObserver(PREF_TEXTURE, this);
    Services.prefs.removeObserver(PREF_TEXTURE_OPACITY, this);

    try {
      Services.obs.removeObserver(this, "browser-delayed-startup-finished");
      Services.obs.removeObserver(this, "domwindowclosed");
    } catch (e) {}

    // Remove injected style sheets
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      const existing = win.document?.getElementById(STYLE_SHEET_ID);
      if (existing) existing.remove();
    }

    this._initialized = false;
  },
};
