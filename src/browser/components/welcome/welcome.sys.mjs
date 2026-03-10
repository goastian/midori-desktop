// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
const lazy = {}

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: 'resource://gre/modules/AddonManager.sys.mjs',
  MigrationUtils: 'resource:///modules/MigrationUtils.sys.mjs',
  ExtensionSettingsStore: 'resource://gre/modules/ExtensionSettingsStore.sys.mjs',
})

const welcomeSeenPref = 'midori.welcome.seen'

// =============================================================================
// Util stuff copied from browser/components/preferences/search.js

class EngineStore {
  constructor() {
    this._engines = []
  }

  async init() {
    const visibleEngines = await Services.search.getVisibleEngines()
    await this.initSpecificEngine(visibleEngines)
  }

  getEngine() {
    return this._engines
  }

  async initSpecificEngine(engines) {
    for (const engine of engines) {
      this._engines.push(await this._cloneEngine(engine))
    }
  }

  getEngineByName(name) {
    return this._engines.find((engine) => engine.name == name)
  }

  async _cloneEngine(aEngine) {
    var clonedObj = {
      iconURL: await aEngine.getIconURL(),
    };
    for (let i of ["id", "name", "alias", "hidden"]) {
      clonedObj[i] = aEngine[i]
    }

    clonedObj.originalEngine = aEngine

    return clonedObj
  }

  async getDefaultEngine() {
    let engineName = await Services.search.getDefault()
    return this.getEngineByName(engineName._name)
  }

  async setDefaultEngine(engine) {
    await Services.search.setDefault(
      engine.originalEngine,
      Ci.nsISearchService.CHANGE_REASON_USER
    )
  }
}

// =============================================================================

const sleep = (duration) =>
  new Promise((resolve) => setTimeout(resolve, duration))

class Page {
  /**
   * A basic controller for individual pages
   * @param {string} id The id of the element that represents this page.
   */
  constructor(id) {
    this.element = document.getElementById(id)
    this.nextEl = document.getElementById(`${id}Next`)

    this.nextEl.addEventListener('click', () => {
      this.pages.next()
    })
  }

  /**
   *
   * @param {Pages} pages The pages wrapper
   */
  setPages(pages) {
    this.pages = pages
  }

  hide() {
    this.element.classList.remove('visible')
  }

  show() {
    this.element.classList.add('visible')
  }
}

class Themes extends Page {
  constructor(id) {
    super(id)

    this.loadThemes()
  }

  async loadThemes() {
    await sleep(1000)

    const themes = (await lazy.AddonManager.getAddonsByTypes(['theme']))
    .filter(theme => !theme.id.includes('colorway') && !theme.id.includes('default-theme'))
    .sort((a, b) => {
        const aHasJadua = a.id.includes('midori');
        const bHasJadua = b.id.includes('midori');

        if (aHasJadua && !bHasJadua) {
            return -1; // a comes before b
        } else if (!aHasJadua && bHasJadua) {
            return 1; // b comes before a
        } else {
            return 0; // maintain the original order
        }
    })
	
    const themeList = document.getElementById('themeList')

    const themeElements = []

    themes.forEach((theme) => {
      const container = document.createElement('div')
      container.classList.add('card')

      if (theme.isActive) {
        container.classList.add('selected')
      }

      container.addEventListener('click', () => {
        themeElements.forEach((el) => el.classList.remove('selected'))
        container.classList.add('selected')
        theme.enable()
      })

      const img = document.createElement('img')
      img.src = theme.icons['32']

      const name = document.createElement('h3')
      name.textContent = theme.name

      container.appendChild(img)
      container.appendChild(name)

      themeList.appendChild(container)
      themeElements.push(container)
    })
  }
}

class Search extends Page {
  constructor(id) {
    super(id)

    this.store = new EngineStore()
    this.searchList = []

    this.loadSearch()
  }

  async loadSearch() {
    await sleep(1100)
    await this.store.init()

    const defaultEngine = await Services.search.getDefault()

    const searchElements = document.getElementById('searchList')

    const allowedEngines = ['AstianGO', 'Wikipedia (en)', 'Qwant']

    const engines = this.store.getEngine().filter((engine) =>
      allowedEngines.some((name) => engine.name.startsWith(name.split(' ')[0]))
    )

    engines.sort((a, b) => {
      const aIdx = allowedEngines.findIndex((name) => a.name.startsWith(name.split(' ')[0]))
      const bIdx = allowedEngines.findIndex((name) => b.name.startsWith(name.split(' ')[0]))
      return aIdx - bIdx
    })

    engines.forEach((search) => {
      const container = this.loadSpecificSearch(search, defaultEngine)

      searchElements.appendChild(container)
      this.searchList.push(container)
    })
  }

  /**
   * @returns {HTMLDivElement}
   */
  loadSpecificSearch(search, defaultSearch) {
    const container = document.createElement('div')
    container.classList.add('card')

    if (search.name == defaultSearch._name) {
      container.classList.add('selected')
    }

    container.addEventListener('click', () => {
      this.searchList.forEach((el) => el.classList.remove('selected'))
      container.classList.add('selected')
      this.store.setDefaultEngine(search)
    })

    const img = document.createElement('img')
    img.src = search.iconURL

    const name = document.createElement('h3')
    name.textContent = search.name

    container.appendChild(img)
    container.appendChild(name)

    return container
  }
}

class Import extends Page {
  constructor(id) {
    super(id)

    const importButton = document.getElementById('importBrowser')
    importButton.addEventListener('click', () => {
      lazy.MigrationUtils.showMigrationWizard(window, [
        lazy.MigrationUtils.MIGRATION_ENTRYPOINT_NEWTAB,
        null,
      ])
      this.nextEl.click()
    })
  }
}

class Pages {
  /**
   * A wrapper around all pages
   * @param {Page[]} pages The pages
   */
  constructor(pages) {
    this.pages = pages
    this.currentPage = 0
    this.stepDots = document.querySelectorAll('.step-dot')

    this.pages.forEach((page) => page.setPages(this))

    this._displayCurrentPage()
  }

  next() {
    this.currentPage++

    if (this.currentPage >= this.pages.length) {
      // We can use internal js apis to close the window. We also want to set
      // the settings api for welcome seen to false to stop it showing again

      Services.prefs.setBoolPref(welcomeSeenPref, true)

      close()
      return
    }

    this._displayCurrentPage()
  }

  _displayCurrentPage() {
    for (const page of this.pages) {
      page.hide()
    }

    this.pages[this.currentPage].show()

    this.stepDots.forEach((dot, i) => {
      dot.classList.remove('active', 'done')
      if (i < this.currentPage) {
        dot.classList.add('done')
      } else if (i === this.currentPage) {
        dot.classList.add('active')
      }
    })
  }
}

const pages = new Pages([
  new Page('welcome'),
  new Import('import'),
  new Themes('theme'),
  new Search('search'),
])
