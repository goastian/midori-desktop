// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
import {
  getAutohideAvailability,
  getSidebarArrangement,
  getSidebarSideForLayout,
  getTabLayoutFromPrefs,
  isVerticalTabLayout,
  normalizeSide,
  normalizeTabLayout,
} from './SetupCustomizationPolicy.sys.mjs';

const { document, window } = globalThis;
const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AboutNewTab: 'resource:///modules/AboutNewTab.sys.mjs',
  ExtensionParent: 'resource://gre/modules/ExtensionParent.sys.mjs',
  MigrationUtils: 'resource:///modules/MigrationUtils.sys.mjs',
  MidoriVerticalTabs: 'resource:///modules/MidoriVerticalTabs.sys.mjs',
});

const welcomeSeenPref = 'midori.welcome.seen';
const urlbarLayoutPref = 'midori.modblur.tabs.layout';
const PREF_ARC_MODE = 'midori.arcmode.enabled';
const PREF_VERTICAL_TABS = 'midori.verticaltabs.enabled';
const PREF_VERTICAL_POSITION = 'midori.verticaltabs.position';
const PREF_VERTICAL_COLLAPSE = 'midori.verticaltabs.collapse';
const PREF_HORIZONTAL_POSITION = 'midori.horizontaltabs.position';
const PREF_MSIDEBAR_ENABLED = 'midori.msidebar.enabled';
const PREF_MSIDEBAR_POSITION = 'midori.msidebar.position';
const PREF_MSIDEBAR_AUTOHIDE = 'midori.msidebar.autohide.enabled';
const PREF_MSIDEBAR_AUTOHIDE_MODE = 'midori.msidebar.autohide.mode';
const PREF_HORIZONTAL_AUTOHIDE = 'midori.modblur.tabs.autohide';
const PREF_SHOW_INACTIVE_TABS = 'midori.modblur.tabs.showWhileInactive';
const MIDORI_NEWTAB_EXTENSION_ID = 'midoritabs@astian.org';
const MSIDEBAR_SETUP_PREFS = [
  PREF_ARC_MODE,
  PREF_VERTICAL_TABS,
  PREF_VERTICAL_POSITION,
  PREF_VERTICAL_COLLAPSE,
  PREF_HORIZONTAL_POSITION,
  PREF_MSIDEBAR_ENABLED,
  PREF_MSIDEBAR_POSITION,
  PREF_MSIDEBAR_AUTOHIDE,
  PREF_MSIDEBAR_AUTOHIDE_MODE,
  PREF_HORIZONTAL_AUTOHIDE,
  PREF_SHOW_INACTIVE_TABS,
];

/** Controls a single page in the setup flow. */
class Page {
  /**
   * A basic controller for individual pages
   *
   * @param {string} id The id of the element that represents this page.
   * @param {object} options Page behavior options.
   * @param {boolean} [options.autoNext=true] Advance on the primary action.
   */
  constructor(id, { autoNext = true } = {}) {
    this.element = document.getElementById(id);
    this.nextEl = document.getElementById(`${id}Next`);
    this.backEl = document.getElementById(`${id}Back`);

    if (autoNext) {
      this.nextEl.addEventListener('click', () => {
        this.pages.next();
      });
    }

    if (this.backEl) {
      this.backEl.addEventListener('click', () => {
        this.pages.back();
      });
    }
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

/** Controls browser data import. */
class Import extends Page {
  constructor(id) {
    super(id);

    const importButton = document.getElementById('importBrowser');
    importButton.addEventListener('click', () => {
      try {
        // Use the current MigrationUtils API and avoid passing a content
        // window as opener, which can fail in nsIWindowWatcher.openWindow.
        lazy.MigrationUtils.showMigrationWizard(null, {
          entrypoint: lazy.MigrationUtils.MIGRATION_ENTRYPOINTS.NEWTAB,
        });
      } catch (error) {
        console.error('Failed to open migration wizard from setup:', error);
      }
      this.nextEl.click();
    });
  }
}

/** Controls color theme selection. */
class ColorTheme extends Page {
  constructor(id) {
    super(id);

    this._cards = Array.from(document.querySelectorAll('.colorway-card'));
    this._cards.forEach((card) => {
      card.addEventListener('click', () => this._select(card.dataset.colorway));
    });

    this._select(Services.prefs.getCharPref('midori.colorway', 'system'));
  }

  _select(colorway) {
    const value = this._cards.some((card) => card.dataset.colorway === colorway) ? colorway : 'system';
    this._cards.forEach((card) => {
      card.classList.toggle('selected', card.dataset.colorway === value);
    });
    Services.prefs.setCharPref('midori.colorway', value);
    Services.prefs.setBoolPref('midori.gradient.enabled', false);
  }
}

/** Controls tab layout selection. */
class TabLayout extends Page {
  constructor(id) {
    super(id);
    this._horizontalTopCard = document.getElementById('tablayoutHorizontal');
    this._horizontalBottomCard = document.getElementById('tablayoutHorizontalBottom');
    this._verticalLeftCard = document.getElementById('tablayoutVertical');
    this._verticalRightCard = document.getElementById('tablayoutVerticalRight');
    this._urlbarOrderSection = document.getElementById('urlbarOrderSection');
    this._addressTopCard = document.getElementById('urlbarOrderAddressTop');
    this._tabsTopCard = document.getElementById('urlbarOrderTabsTop');

    this._horizontalTopCard.addEventListener('click', () => this._select('horizontal-top'));
    this._horizontalBottomCard.addEventListener('click', () => this._select('horizontal-bottom'));
    this._verticalLeftCard.addEventListener('click', () => this._select('vertical-left'));
    this._verticalRightCard.addEventListener('click', () => this._select('vertical-right'));
    this._addressTopCard.addEventListener('click', () => this._selectUrlbarOrder('urlbar-top'));
    this._tabsTopCard.addEventListener('click', () => this._selectUrlbarOrder('tabs-top'));
    this._addressTopCard.addEventListener('keydown', (event) => this._handleUrlbarOrderKeydown(event));
    this._tabsTopCard.addEventListener('keydown', (event) => this._handleUrlbarOrderKeydown(event));

    this._syncFromPrefs();
  }

  _select(mode) {
    const layout = normalizeTabLayout(mode);
    const vertical = isVerticalTabLayout(layout);

    Services.prefs.setBoolPref(PREF_ARC_MODE, false);
    lazy.MidoriVerticalTabs.setEnabled(vertical);

    if (vertical) {
      Services.prefs.setCharPref(
        PREF_VERTICAL_POSITION,
        layout === 'vertical-right' ? 'right' : 'left'
      );
    } else {
      Services.prefs.setCharPref(
        PREF_HORIZONTAL_POSITION,
        layout === 'horizontal-bottom' ? 'bottom' : 'top'
      );
    }

    this._render(layout);
  }

  _render(mode) {
    const layout = normalizeTabLayout(mode);
    this._mode = layout;
    this._horizontalTopCard.classList.toggle('selected', layout === 'horizontal-top');
    this._horizontalBottomCard.classList.toggle('selected', layout === 'horizontal-bottom');
    this._verticalLeftCard.classList.toggle('selected', layout === 'vertical-left');
    this._verticalRightCard.classList.toggle('selected', layout === 'vertical-right');
    this._urlbarOrderSection.hidden = layout !== 'horizontal-top';
  }

  _syncFromPrefs() {
    this._render(
      getTabLayoutFromPrefs({
        verticalTabsEnabled: Services.prefs.getBoolPref(
          PREF_VERTICAL_TABS,
          false
        ),
        arcModeEnabled: Services.prefs.getBoolPref(PREF_ARC_MODE, false),
        verticalTabsSide: Services.prefs.getCharPref(
          PREF_VERTICAL_POSITION,
          'left'
        ),
        horizontalTabsPosition: Services.prefs.getCharPref(
          PREF_HORIZONTAL_POSITION,
          'top'
        ),
      })
    );
    this._selectUrlbarOrder(
      Services.prefs.getCharPref(urlbarLayoutPref, 'urlbar-top'),
      { persist: false }
    );
  }

  show() {
    this._syncFromPrefs();
    super.show();
  }

  _selectUrlbarOrder(layout, { persist = true } = {}) {
    const value = layout === 'tabs-top' ? 'tabs-top' : 'urlbar-top';
    const addressTop = value === 'urlbar-top';

    this._addressTopCard.classList.toggle('selected', addressTop);
    this._tabsTopCard.classList.toggle('selected', !addressTop);
    this._addressTopCard.setAttribute('aria-checked', String(addressTop));
    this._tabsTopCard.setAttribute('aria-checked', String(!addressTop));
    this._addressTopCard.tabIndex = addressTop ? 0 : -1;
    this._tabsTopCard.tabIndex = addressTop ? -1 : 0;

    if (persist) {
      Services.prefs.setCharPref(urlbarLayoutPref, value);
    }
  }

  _handleUrlbarOrderKeydown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      return;
    }

    event.preventDefault();
    const value = event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'Home'
      ? 'urlbar-top'
      : 'tabs-top';
    this._selectUrlbarOrder(value);
    (value === 'urlbar-top' ? this._addressTopCard : this._tabsTopCard).focus();
  }
}

/** Controls sidebar selection. */
class MSidebar extends Page {
  constructor(id) {
    super(id);
    this._enableCard = document.getElementById('msidebarEnable');
    this._disableCard = document.getElementById('msidebarDisable');
    this._positionHorizontalHint = document.getElementById(
      'msidebarPositionHorizontalHint'
    );
    this._positionVerticalHint = document.getElementById(
      'msidebarPositionVerticalHint'
    );
    this._positionInputs = Array.from(
      document.querySelectorAll('input[name="msidebarPosition"]')
    );
    this._sidebarAutohide = document.getElementById('msidebarAutohide');
    this._sidebarAutohideMode = document.getElementById(
      'msidebarAutohideMode'
    );
    this._horizontalTabsAutohide = document.getElementById(
      'horizontalTabsAutohide'
    );
    this._showInactiveWindowTabs = document.getElementById(
      'showInactiveWindowTabs'
    );
    this._verticalTabsAutohide = document.getElementById(
      'verticalTabsAutohide'
    );
    this._horizontalTabsAutohideRow = document.getElementById(
      'horizontalTabsAutohideRow'
    );
    this._inactiveWindowTabsRow = document.getElementById(
      'inactiveWindowTabsRow'
    );
    this._verticalTabsAutohideRow = document.getElementById(
      'verticalTabsAutohideRow'
    );
    this._bottomTabsAutohideNotice = document.getElementById(
      'bottomTabsAutohideNotice'
    );

    this._enableCard.addEventListener('click', () => this._selectEnabled(true));
    this._disableCard.addEventListener('click', () => this._selectEnabled(false));
    this._enableCard.addEventListener('keydown', event =>
      this._handleEnabledKeydown(event)
    );
    this._disableCard.addEventListener('keydown', event =>
      this._handleEnabledKeydown(event)
    );
    for (const input of this._positionInputs) {
      input.addEventListener('change', () => {
        if (input.checked) {
          this._selectPosition(input.value);
        }
      });
    }
    this._sidebarAutohide.addEventListener('change', () => {
      Services.prefs.setBoolPref(
        PREF_MSIDEBAR_AUTOHIDE,
        this._sidebarAutohide.checked
      );
      this._updateAvailability();
    });
    this._sidebarAutohideMode.addEventListener('change', () => {
      Services.prefs.setCharPref(
        PREF_MSIDEBAR_AUTOHIDE_MODE,
        this._sidebarAutohideMode.value === 'inline' ? 'inline' : 'overlay'
      );
    });
    this._horizontalTabsAutohide.addEventListener('change', () => {
      Services.prefs.setBoolPref(
        PREF_HORIZONTAL_AUTOHIDE,
        this._horizontalTabsAutohide.checked
      );
      this._updateAvailability();
    });
    this._showInactiveWindowTabs.addEventListener('change', () => {
      Services.prefs.setBoolPref(
        PREF_SHOW_INACTIVE_TABS,
        this._showInactiveWindowTabs.checked
      );
    });
    this._verticalTabsAutohide.addEventListener('change', () => {
      Services.prefs.setBoolPref(
        PREF_VERTICAL_COLLAPSE,
        this._verticalTabsAutohide.checked
      );
    });

    this._prefObserver = {
      observe: () => this._syncFromPrefs(),
    };
    for (const pref of MSIDEBAR_SETUP_PREFS) {
      Services.prefs.addObserver(pref, this._prefObserver);
    }
    window.addEventListener('pagehide', () => {
      for (const pref of MSIDEBAR_SETUP_PREFS) {
        try {
          Services.prefs.removeObserver(pref, this._prefObserver);
        } catch {}
      }
    }, { once: true });

    this._syncFromPrefs();
  }

  _selectEnabled(enabled) {
    Services.prefs.setBoolPref(PREF_MSIDEBAR_ENABLED, !!enabled);
    this._renderEnabled(enabled);
    if (enabled) {
      const selectedSide = this._positionInputs.find(input => input.checked)?.value;
      this._selectPosition(selectedSide);
    }
    this._updateAvailability();
  }

  _renderEnabled(enabled) {
    this._enableCard.classList.toggle('selected', !!enabled);
    this._disableCard.classList.toggle('selected', !enabled);
    this._enableCard.setAttribute('aria-checked', String(!!enabled));
    this._disableCard.setAttribute('aria-checked', String(!enabled));
    this._enableCard.tabIndex = enabled ? 0 : -1;
    this._disableCard.tabIndex = enabled ? -1 : 0;
  }

  _handleEnabledKeydown(event) {
    if (![' ', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    let enabled = event.currentTarget === this._enableCard;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      enabled = true;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      enabled = false;
    }
    this._selectEnabled(enabled);
    (enabled ? this._enableCard : this._disableCard).focus();
  }

  _getTabLayout() {
    return getTabLayoutFromPrefs({
      verticalTabsEnabled: Services.prefs.getBoolPref(
        PREF_VERTICAL_TABS,
        false
      ),
      arcModeEnabled: Services.prefs.getBoolPref(PREF_ARC_MODE, false),
      verticalTabsSide: Services.prefs.getCharPref(
        PREF_VERTICAL_POSITION,
        'left'
      ),
      horizontalTabsPosition: Services.prefs.getCharPref(
        PREF_HORIZONTAL_POSITION,
        'top'
      ),
    });
  }

  _selectPosition(side) {
    const arrangement = getSidebarArrangement({
      sidebarSide: normalizeSide(side),
    });
    Services.prefs.setCharPref(
      PREF_MSIDEBAR_POSITION,
      arrangement.sidebarSide
    );
    for (const input of this._positionInputs) {
      input.checked = input.value === arrangement.sidebarSide;
    }
    this._updateLayoutUI();
  }

  _updateLayoutUI() {
    const layout = this._getTabLayout();
    const vertical = isVerticalTabLayout(layout);
    this._positionHorizontalHint.hidden = vertical;
    this._positionVerticalHint.hidden = !vertical;
  }

  _updateAvailability() {
    const sidebarEnabled = Services.prefs.getBoolPref(
      PREF_MSIDEBAR_ENABLED,
      false
    );
    const layout = this._getTabLayout();
    const availability = getAutohideAvailability({
      tabLayout: layout,
      sidebarEnabled,
      sidebarAutohideEnabled: this._sidebarAutohide.checked,
      horizontalTabsAutohideEnabled: this._horizontalTabsAutohide.checked,
    });

    for (const input of this._positionInputs) {
      input.disabled = !sidebarEnabled;
    }
    this._sidebarAutohide.disabled = !availability.sidebar;
    this._sidebarAutohideMode.disabled = !availability.sidebarMode;
    this._horizontalTabsAutohideRow.hidden = !availability.horizontalTabs;
    this._horizontalTabsAutohide.disabled = !availability.horizontalTabs;
    this._inactiveWindowTabsRow.hidden = !availability.horizontalTabs;
    this._showInactiveWindowTabs.disabled = !availability.inactiveWindowTabs;
    this._verticalTabsAutohideRow.hidden = !availability.verticalTabs;
    this._verticalTabsAutohide.disabled = !availability.verticalTabs;
    this._bottomTabsAutohideNotice.hidden = layout !== 'horizontal-bottom';
  }

  _syncFromPrefs() {
    const enabled = Services.prefs.getBoolPref(PREF_MSIDEBAR_ENABLED, false);
    const sidebarSide = getSidebarSideForLayout({
      storedSidebarSide: Services.prefs.getCharPref(
        PREF_MSIDEBAR_POSITION,
        'left'
      ),
    });

    this._renderEnabled(enabled);
    for (const input of this._positionInputs) {
      input.checked = input.value === sidebarSide;
    }
    this._sidebarAutohide.checked = Services.prefs.getBoolPref(
      PREF_MSIDEBAR_AUTOHIDE,
      false
    );
    this._sidebarAutohideMode.value =
      Services.prefs.getCharPref(PREF_MSIDEBAR_AUTOHIDE_MODE, 'overlay') ===
      'inline'
        ? 'inline'
        : 'overlay';
    this._horizontalTabsAutohide.checked = Services.prefs.getBoolPref(
      PREF_HORIZONTAL_AUTOHIDE,
      false
    );
    this._showInactiveWindowTabs.checked = Services.prefs.getBoolPref(
      PREF_SHOW_INACTIVE_TABS,
      false
    );
    this._verticalTabsAutohide.checked = Services.prefs.getBoolPref(
      PREF_VERTICAL_COLLAPSE,
      false
    );
    this._updateLayoutUI();
    this._updateAvailability();
  }

  show() {
    this._syncFromPrefs();
    super.show();
  }
}

/** Coordinates setup flow navigation. */
class Pages {
  /**
   * A wrapper around all pages
   *
   * @param {Page[]} pages The pages
   */
  constructor(pages) {
    this.pages = pages;
    this.currentPage = 0;
    const indicator = document.querySelector('.step-indicator');
    indicator.replaceChildren(
      ...pages.map(() => {
        const dot = document.createElement('div');
        dot.className = 'step-dot';
        return dot;
      })
    );
    this.stepDots = indicator.querySelectorAll('.step-dot');

    this.pages.forEach((page) => page.setPages(this));

    this._displayCurrentPage();
  }

  next() {
    this.currentPage++;

    if (this.currentPage >= this.pages.length) {
      Services.prefs.setBoolPref(welcomeSeenPref, true);
      this.cancel();
      return;
    }

    this._displayCurrentPage();
  }

  back() {
    if (this.currentPage <= 0) {
      return;
    }
    this.currentPage--;
    this._displayCurrentPage();
  }

  cancel() {
    let newTabURL = lazy.AboutNewTab.newTabURL;
    if (newTabURL === 'about:newtab') {
      const policy = lazy.ExtensionParent.WebExtensionPolicy.getByID(
        MIDORI_NEWTAB_EXTENSION_ID
      );
      newTabURL = policy?.getURL('index.html') ?? newTabURL;
    }
    window.location.replace(newTabURL);
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

void (async () => {
  new Pages([
    new Page('welcome'),
    new Import('import'),
    new ColorTheme('color'),
    new TabLayout('tablayout'),
    new MSidebar('msidebar'),
    new Page('warmwelcome'),
  ]);
})();
