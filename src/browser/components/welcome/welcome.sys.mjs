// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: 'resource://gre/modules/AddonManager.sys.mjs',
  MigrationUtils: 'resource:///modules/MigrationUtils.sys.mjs',
  ExtensionSettingsStore: 'resource://gre/modules/ExtensionSettingsStore.sys.mjs',
  MidoriGradient: 'resource:///modules/MidoriGradient.sys.mjs',
  MidoriVerticalTabs: 'resource:///modules/MidoriVerticalTabs.sys.mjs',
});

const welcomeSeenPref = 'midori.welcome.seen';

// =============================================================================
// Util stuff copied from browser/components/preferences/search.js

class EngineStore {
  constructor() {
    this._engines = [];
  }

  async init() {
    const visibleEngines = await Services.search.getVisibleEngines();
    await this.initSpecificEngine(visibleEngines);
  }

  getEngine() {
    return this._engines;
  }

  async initSpecificEngine(engines) {
    for (const engine of engines) {
      this._engines.push(await this._cloneEngine(engine));
    }
  }

  getEngineByName(name) {
    return this._engines.find((engine) => engine.name == name);
  }

  async _cloneEngine(aEngine) {
    var clonedObj = {
      iconURL: await aEngine.getIconURL(),
    };
    for (let i of ['id', 'name', 'alias', 'hidden']) {
      clonedObj[i] = aEngine[i];
    }

    clonedObj.originalEngine = aEngine;

    return clonedObj;
  }

  async getDefaultEngine() {
    let engineName = await Services.search.getDefault();
    return this.getEngineByName(engineName._name);
  }

  async setDefaultEngine(engine) {
    await Services.search.setDefault(engine.originalEngine, Ci.nsISearchService.CHANGE_REASON_USER);
  }
}

// =============================================================================

const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration));

class Page {
  /**
   * A basic controller for individual pages
   * @param {string} id The id of the element that represents this page.
   */
  constructor(id) {
    this.element = document.getElementById(id);
    this.nextEl = document.getElementById(`${id}Next`);

    this.nextEl.addEventListener('click', () => {
      this.pages.next();
    });
  }

  /**
   *
   * @param {Pages} pages The pages wrapper
   */
  setPages(pages) {
    this.pages = pages;
  }

  hide() {
    this.element.classList.remove('visible');
  }

  show() {
    this.element.classList.add('visible');
  }
}

class Themes extends Page {
  constructor(id) {
    super(id);

    this.loadThemes();
  }

  async loadThemes() {
    await sleep(1000);

    const themes = (await lazy.AddonManager.getAddonsByTypes(['theme']))
      .filter((theme) => theme.id.includes('midori-theme-'))
      .sort((a, b) => {
        const order = [
          'midori-theme-jade-mist', // Midori Breeze (light, primary)
          'midori-theme-forest-void', // Midnight Sage (dark, primary)
          'midori-theme-sky-crystal', // Slate Tide (light)
          'midori-theme-deep-ocean', // Onyx & Jade (dark)
          'midori-theme-citrus-dawn', // Sand & Sage (light)
          'midori-theme-volcanic-sunset', // Ink & Mint (light, high contrast)
        ];
        const aIdx = order.findIndex((id) => a.id.includes(id));
        const bIdx = order.findIndex((id) => b.id.includes(id));
        return aIdx - bIdx;
      });

    const themeList = document.getElementById('themeList');

    const themeElements = [];

    themes.forEach((theme) => {
      const container = document.createElement('div');
      container.classList.add('card');

      if (theme.isActive) {
        container.classList.add('selected');
      }

      container.addEventListener('click', () => {
        themeElements.forEach((el) => el.classList.remove('selected'));
        container.classList.add('selected');
        theme.enable();
      });

      const img = document.createElement('img');
      img.src =
        theme.icons?.['32'] ||
        theme.iconURL ||
        'chrome://mozapps/skin/extensions/extensionGeneric.svg';

      const name = document.createElement('h3');
      name.textContent = theme.name;

      container.appendChild(img);
      container.appendChild(name);

      themeList.appendChild(container);
      themeElements.push(container);
    });
  }
}

class Search extends Page {
  constructor(id) {
    super(id);

    this.store = new EngineStore();
    this.searchList = [];

    this.loadSearch();
  }

  async loadSearch() {
    await sleep(1100);
    await this.store.init();

    const defaultEngine = await Services.search.getDefault();

    const searchElements = document.getElementById('searchList');

    const allowedEngines = ['AstianGO', 'Wikipedia (en)', 'Qwant'];

    const engines = this.store
      .getEngine()
      .filter((engine) =>
        allowedEngines.some((name) => engine.name.startsWith(name.split(' ')[0]))
      );

    engines.sort((a, b) => {
      const aIdx = allowedEngines.findIndex((name) => a.name.startsWith(name.split(' ')[0]));
      const bIdx = allowedEngines.findIndex((name) => b.name.startsWith(name.split(' ')[0]));
      return aIdx - bIdx;
    });

    engines.forEach((search) => {
      const container = this.loadSpecificSearch(search, defaultEngine);

      searchElements.appendChild(container);
      this.searchList.push(container);
    });
  }

  /**
   * @returns {HTMLDivElement}
   */
  loadSpecificSearch(search, defaultSearch) {
    const container = document.createElement('div');
    container.classList.add('card');

    if (search.name == defaultSearch._name) {
      container.classList.add('selected');
    }

    container.addEventListener('click', () => {
      this.searchList.forEach((el) => el.classList.remove('selected'));
      container.classList.add('selected');
      this.store.setDefaultEngine(search);
    });

    const img = document.createElement('img');
    img.src = search.iconURL;

    const name = document.createElement('h3');
    name.textContent = search.name;

    container.appendChild(img);
    container.appendChild(name);

    return container;
  }
}

class Import extends Page {
  constructor(id) {
    super(id);

    const importButton = document.getElementById('importBrowser');
    importButton.addEventListener('click', () => {
      lazy.MigrationUtils.showMigrationWizard(window, [
        lazy.MigrationUtils.MIGRATION_ENTRYPOINT_NEWTAB,
        null,
      ]);
      this.nextEl.click();
    });
  }
}

class Gradient extends Page {
  constructor(id) {
    super(id);

    // The "skip" button also advances
    const skipBtn = document.getElementById('gradientSkip');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        // Disable gradient if user skips
        lazy.MidoriGradient.setConfig({ enabled: false });
        this.pages.next();
      });
    }

    this._selectedPresetIdx = -1; // -1 = no gradient
    this._customStops = [
      { color: '#2d8659', position: 0 },
      { color: '#1a5c3a', position: 100 },
    ];
    this._customType = 'linear';
    this._customAngle = 135;
    this._customTexture = 'none';

    this._buildPresets();
    this._setupCustomEditor();
  }

  _buildPresets() {
    const container = document.getElementById('gradientPresets');
    if (!container) return;

    const presets = lazy.MidoriGradient.presets;
    this._presetCards = [];

    // "No gradient" card
    const noCard = document.createElement('div');
    noCard.classList.add('gradient-preset-card', 'no-gradient', 'selected');
    const noLabel = document.createElement('span');
    noLabel.classList.add('gradient-preset-name');
    noLabel.textContent = 'None';
    noCard.appendChild(noLabel);
    noCard.addEventListener('click', () => this._selectPreset(-1, noCard));
    container.appendChild(noCard);
    this._presetCards.push(noCard);

    // Preset cards
    presets.forEach((preset, idx) => {
      const card = document.createElement('div');
      card.classList.add('gradient-preset-card');

      // Build the gradient CSS for the preview
      const gradCSS = lazy.MidoriGradient.buildGradientCSS({
        type: preset.type,
        angle: preset.angle,
        stops: preset.stops,
      });
      card.style.background = gradCSS;

      const label = document.createElement('span');
      label.classList.add('gradient-preset-name');
      label.textContent = preset.name;
      card.appendChild(label);

      card.addEventListener('click', () => this._selectPreset(idx, card));
      container.appendChild(card);
      this._presetCards.push(card);
    });
  }

  _selectPreset(idx, cardEl) {
    this._selectedPresetIdx = idx;
    this._presetCards.forEach((c) => c.classList.remove('selected'));
    cardEl.classList.add('selected');

    if (idx === -1) {
      // Disable gradient
      lazy.MidoriGradient.setConfig({ enabled: false });
      this._updatePreview(null);
    } else {
      // Apply preset
      lazy.MidoriGradient.applyPreset(idx);
      const preset = lazy.MidoriGradient.presets[idx];
      // Sync custom editor with preset values
      this._customType = preset.type;
      this._customAngle = preset.angle;
      this._customStops = [...preset.stops];
      this._customTexture = preset.texture;
      this._syncEditorUI();
      this._updatePreview(preset);
    }
  }

  _setupCustomEditor() {
    const typeSelect = document.getElementById('gradientType');
    const angleSlider = document.getElementById('gradientAngle');
    const angleValue = document.getElementById('angleValue');
    const textureSelect = document.getElementById('gradientTexture');
    const addBtn = document.getElementById('addColorStop');

    if (typeSelect) {
      typeSelect.addEventListener('change', () => {
        this._customType = typeSelect.value;
        this._applyCustom();
      });
    }

    if (angleSlider) {
      angleSlider.addEventListener('input', () => {
        this._customAngle = parseInt(angleSlider.value);
        if (angleValue) angleValue.textContent = `${this._customAngle}\u00B0`;
        this._applyCustom();
      });
    }

    if (textureSelect) {
      textureSelect.addEventListener('change', () => {
        this._customTexture = textureSelect.value;
        this._applyCustom();
      });
    }

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        if (this._customStops.length >= 6) return;
        // Add a new stop with a random-ish color at midpoint
        const lastPos = this._customStops[this._customStops.length - 1]?.position || 100;
        const newPos = Math.min(lastPos, 100);
        const colors = ['#4caf50', '#2196f3', '#ff9800', '#9c27b0', '#e91e63', '#00bcd4'];
        const color = colors[this._customStops.length % colors.length];
        this._customStops.push({ color, position: newPos });
        // Redistribute positions evenly
        this._redistributeStops();
        this._renderColorStops();
        this._applyCustom();
      });
    }

    this._renderColorStops();
  }

  _redistributeStops() {
    const count = this._customStops.length;
    this._customStops.forEach((stop, i) => {
      stop.position = Math.round((i / (count - 1)) * 100);
    });
  }

  _renderColorStops() {
    const container = document.getElementById('colorStops');
    if (!container) return;
    container.innerHTML = '';

    this._customStops.forEach((stop, idx) => {
      const el = document.createElement('div');
      el.classList.add('color-stop');

      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      colorInput.value = stop.color;
      colorInput.addEventListener('input', () => {
        this._customStops[idx].color = colorInput.value;
        this._applyCustom();
      });

      el.appendChild(colorInput);

      // Remove button (only if > 2 stops)
      if (this._customStops.length > 2) {
        const removeBtn = document.createElement('button');
        removeBtn.classList.add('remove-stop');
        removeBtn.textContent = '\u00D7';
        removeBtn.addEventListener('click', () => {
          this._customStops.splice(idx, 1);
          this._redistributeStops();
          this._renderColorStops();
          this._applyCustom();
        });
        el.appendChild(removeBtn);
      }

      container.appendChild(el);
    });
  }

  _syncEditorUI() {
    const typeSelect = document.getElementById('gradientType');
    const angleSlider = document.getElementById('gradientAngle');
    const angleValue = document.getElementById('angleValue');
    const textureSelect = document.getElementById('gradientTexture');

    if (typeSelect) typeSelect.value = this._customType;
    if (angleSlider) angleSlider.value = this._customAngle;
    if (angleValue) angleValue.textContent = `${this._customAngle}\u00B0`;
    if (textureSelect) textureSelect.value = this._customTexture;

    this._renderColorStops();
  }

  _applyCustom() {
    // Deselect preset cards, mark as "custom"
    this._presetCards.forEach((c) => c.classList.remove('selected'));
    this._selectedPresetIdx = -2; // custom

    const config = {
      enabled: true,
      type: this._customType,
      angle: this._customAngle,
      stops: this._customStops,
      texture: this._customTexture,
    };
    lazy.MidoriGradient.setConfig(config);
    this._updatePreview(config);
  }

  _updatePreview(config) {
    const preview = document.getElementById('gradientPreview');
    if (!preview) return;

    if (!config) {
      preview.style.background = 'var(--in-content-box-background, #f0f0f0)';
      return;
    }

    const gradCSS = lazy.MidoriGradient.buildGradientCSS(config);
    if (gradCSS) {
      preview.style.background = gradCSS;
    }
  }
}

class TabLayout extends Page {
  constructor(id) {
    super(id);
    this._horizontalTopCard = document.getElementById('tablayoutHorizontal');
    this._horizontalBottomCard = document.getElementById('tablayoutHorizontalBottom');
    this._verticalLeftCard = document.getElementById('tablayoutVertical');
    this._verticalRightCard = document.getElementById('tablayoutVerticalRight');

    this._horizontalTopCard.addEventListener('click', () => this._select('horizontal-top'));
    this._horizontalBottomCard.addEventListener('click', () => this._select('horizontal-bottom'));
    this._verticalLeftCard.addEventListener('click', () => this._select('vertical-left'));
    this._verticalRightCard.addEventListener('click', () => this._select('vertical-right'));
  }

  _select(mode) {
    const vertical = mode === 'vertical-left' || mode === 'vertical-right';
    this._horizontalTopCard.classList.toggle('selected', mode === 'horizontal-top');
    this._horizontalBottomCard.classList.toggle('selected', mode === 'horizontal-bottom');
    this._verticalLeftCard.classList.toggle('selected', mode === 'vertical-left');
    this._verticalRightCard.classList.toggle('selected', mode === 'vertical-right');

    lazy.MidoriVerticalTabs.setEnabled(vertical);

    if (vertical) {
      Services.prefs.setCharPref('midori.verticaltabs.position', mode === 'vertical-right' ? 'right' : 'left');
    } else {
      Services.prefs.setCharPref(
        'midori.horizontaltabs.position',
        mode === 'horizontal-bottom' ? 'bottom' : 'top'
      );
    }
  }
}

class MSidebar extends Page {
  constructor(id) {
    super(id);
    this._enableCard = document.getElementById('msidebarEnable');
    this._disableCard = document.getElementById('msidebarDisable');

    this._enableCard.addEventListener('click', () => this._select(true));
    this._disableCard.addEventListener('click', () => this._select(false));

    const enabled = Services.prefs.getBoolPref('midori.msidebar.enabled', false);
    this._select(enabled);
  }

  _select(enabled) {
    this._enableCard.classList.toggle('selected', !!enabled);
    this._disableCard.classList.toggle('selected', !enabled);
    Services.prefs.setBoolPref('midori.msidebar.enabled', !!enabled);
  }
}

class Pages {
  /**
   * A wrapper around all pages
   * @param {Page[]} pages The pages
   */
  constructor(pages) {
    this.pages = pages;
    this.currentPage = 0;
    this.stepDots = document.querySelectorAll('.step-dot');

    this.pages.forEach((page) => page.setPages(this));

    this._displayCurrentPage();
  }

  next() {
    this.currentPage++;

    if (this.currentPage >= this.pages.length) {
      // We can use internal js apis to close the window. We also want to set
      // the settings api for welcome seen to false to stop it showing again

      Services.prefs.setBoolPref(welcomeSeenPref, true);

      close();
      return;
    }

    this._displayCurrentPage();
  }

  _displayCurrentPage() {
    for (const page of this.pages) {
      page.hide();
    }

    this.pages[this.currentPage].show();

    this.stepDots.forEach((dot, i) => {
      dot.classList.remove('active', 'done');
      if (i < this.currentPage) {
        dot.classList.add('done');
      } else if (i === this.currentPage) {
        dot.classList.add('active');
      }
    });
  }
}

const pages = new Pages([
  new Page('welcome'),
  new Import('import'),
  new Themes('theme'),
  new Gradient('gradient'),
  new TabLayout('tablayout'),
  new MSidebar('msidebar'),
  new Search('search'),
]);
