// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  MigrationUtils: 'resource:///modules/MigrationUtils.sys.mjs',
  MidoriVerticalTabs: 'resource:///modules/MidoriVerticalTabs.sys.mjs',
});

const welcomeSeenPref = 'midori.welcome.seen';

class Page {
  /**
   * A basic controller for individual pages
   * @param {string} id The id of the element that represents this page.
   */
  constructor(id) {
    this.element = document.getElementById(id);
    this.nextEl = document.getElementById(`${id}Next`);
    this.backEl = document.getElementById(`${id}Back`);

    this.nextEl.addEventListener('click', () => {
      this.pages.next();
    });

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

class ColorTheme extends Page {
  constructor(id) {
    super(id);

    this._cards = Array.from(document.querySelectorAll('.colorway-card'));
    this._cards.forEach((card) => {
      card.addEventListener('click', () => this._select(card.dataset.colorway));
    });

    this._select(Services.prefs.getCharPref('midori.colorway', 'jade'));
  }

  _select(colorway) {
    const value = this._cards.some((card) => card.dataset.colorway === colorway) ? colorway : 'jade';
    this._cards.forEach((card) => {
      card.classList.toggle('selected', card.dataset.colorway === value);
    });
    Services.prefs.setCharPref('midori.colorway', value);
    Services.prefs.setBoolPref('midori.gradient.enabled', false);
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
      // Mark setup as completed so it won't show again
      Services.prefs.setBoolPref(welcomeSeenPref, true);

      // Navigate this tab to the homepage instead of closing
      window.location.href = 'about:newtab';
      return;
    }

    this._displayCurrentPage();
  }

  back() {
    if (this.currentPage <= 0) return;
    this.currentPage--;
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
  new ColorTheme('color'),
  new TabLayout('tablayout'),
  new MSidebar('msidebar'),
  new Page('warmwelcome'),
]);
