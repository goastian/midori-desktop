// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

const { XPCOMUtils } = ChromeUtils.importESModule(
  'resource://gre/modules/XPCOMUtils.sys.mjs'
)

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: 'resource://gre/modules/AddonManager.sys.mjs',
  MigrationUtils: 'resource:///modules/MigrationUtils.sys.mjs',
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
    this.initSpecificEngine(visibleEngines)
  }

  getEngine() {
    return this._engines
  }

  initSpecificEngine(engines) {
    for (const engine of engines) {
      this._engines.push(this._cloneEngine(engine))
    }
  }

  getEngineByName(name) {
    return this._engines.find((engine) => engine.name == name)
  }

  _cloneEngine(aEngine) {
    var clonedObj = {
      iconURL: aEngine.getIconURL(),
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
    this.element.style.display = 'none'
  }

  show() {
    this.element.style.display = ''
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

class Apps extends Page {
  constructor(id) {
    super(id)

    /** @type {HTMLDivElement} */
    this.appsList = document.getElementById('appsList')

    /** @type {{ id: string; l10nId: string; l10nDescId: string; url: string; pref: string; required: boolean; }[]} */
    this.apps = [
      {
        id: 'midorivpn@astian.org',
        l10nId: 'welcome-dialog-app-vpn',
        l10nDescId: 'welcome-dialog-app-vpn-description',
        url: 'https://addons.mozilla.org/firefox/downloads/file/4522426/latest.xpi',
        pref: 'midori.install.vpn',
        required: true
      },
      {
        id: 'midori-privacy@astian.org',
        l10nId: 'welcome-dialog-app-privacy',
        l10nDescId: 'welcome-dialog-app-privacy-description',
        url: 'https://github.com/goastian/astian-privacy-protect/releases/download/v2.0.5/astian-firefox-2.0.5.xpi',
        pref: 'midori.install.privacy',
        required: false
      },
      {
        id: 'midoriwallet@astian.org',
        l10nId: 'welcome-dialog-app-wallet',
        l10nDescId: 'welcome-dialog-app-wallet-description',
        url: 'https://github.com/midoriwallet/midoriwallet/releases/download/v1.0.2/midori-wallet-firefox.xpi',
        pref: 'midori.install.wallet',
        required: false
      },
    ]

    for (const app of this.apps) {
      const container = document.createElement('div')
      container.classList.add('card')
      // Por defecto todas las aplicaciones están seleccionadas
      const isSelected = Services.prefs.getBoolPref(app.pref, true)
      if (isSelected) {
        container.classList.add('selected')
      }
      Services.prefs.setBoolPref(app.pref, isSelected)

      container.addEventListener('click', () => {
        const newValue = !Services.prefs.getBoolPref(app.pref, false)
        Services.prefs.setBoolPref(app.pref, newValue)

        if (newValue) container.classList.add('selected')
        else container.classList.remove('selected')
      })

      const name = document.createElement('h3')
      name.setAttribute('data-l10n-id', app.l10nId)

      const description = document.createElement('p')
      description.setAttribute('data-l10n-id', app.l10nDescId)
      description.style.fontSize = '0.9em'
      description.style.color = 'var(--text-color-deemphasized)'

      container.appendChild(name)
      container.appendChild(description)

      this.appsList.appendChild(container)
    }
  }
}

class Features extends Page {
  constructor(id) {
    super(id)

    /** @type {HTMLDivElement} */
    this.enableFeatures = document.getElementById('enableFeatures')

    /** @type {{ l10nId: string; image: string; pref: string; }[]} */
    this.features = [
      {
        l10nId: 'welcome-dialog-feature-vertical-tabs',
        image: 'vertical.vis.svg',
        pref: 'midori.tabs.vertical',
      },
      {
        l10nId: 'welcome-dialog-feature-sidebar-tabs',
        image: 'sidebar.vis.svg',
        pref: 'midori.msidebar.enabled',
      },
    ]

    for (const feature of this.features) {
      const container = document.createElement('div')
      container.classList.add('card')
      if (Services.prefs.getBoolPref(feature.pref, false))
        container.classList.add('selected')

      container.addEventListener('click', async () => {
        const newValue = !Services.prefs.getBoolPref(feature.pref, false)
        Services.prefs.setBoolPref(feature.pref, newValue)

        if (newValue) container.classList.add('selected')
        else container.classList.remove('selected')

        // Si es la preferencia de msidebar, aplicar cambios en las ventanas del navegador
        if (feature.pref === 'midori.msidebar.enabled') {
          try {
            // Obtener todas las ventanas del navegador
            const windowMediator = Services.wm
            const browserWindows = windowMediator.getEnumerator('navigator:browser')
            
            while (browserWindows.hasMoreElements()) {
              const win = browserWindows.getNext()
              
              // Verificar que sea una ventana válida del navegador
              if (win && win.location && win.location.href === 'chrome://browser/content/browser.xhtml') {
                try {
                  if (newValue) {
                    // Habilitar sidebar - inyectar si no existe
                    const sidebarExists = win.document.getElementById('sb2-wrapper')
                    
                    if (!sidebarExists) {
                      console.log('[Welcome] Injecting sidebar in window')
                      
                      // Cargar e inicializar el módulo globals
                      const globalsModule = ChromeUtils.importESModule(
                        'resource://browser-content/modules/msidebar/globals.mjs'
                      )
                      globalsModule.initGlobals(win)
                      
                      // Cargar e inyectar el sidebar
                      const { SidebarInjector } = ChromeUtils.importESModule(
                        'resource://browser-content/modules/msidebar/sidebar_injector.mjs'
                      )
                      
                      const injected = SidebarInjector.inject()
                      if (injected) {
                        console.log('[Welcome] Sidebar successfully injected')
                      } else {
                        console.warn('[Welcome] Failed to inject sidebar')
                      }
                    }
                  } else {
                    // Deshabilitar sidebar - remover si existe
                    const sidebarExists = win.document.getElementById('sb2-wrapper')
                    
                    if (sidebarExists) {
                      console.log('[Welcome] Removing sidebar from window')
                      
                      const { SidebarInjector } = ChromeUtils.importESModule(
                        'resource://browser-content/modules/msidebar/sidebar_injector.mjs'
                      )
                      
                      const removed = SidebarInjector.remove()
                      if (removed) {
                        console.log('[Welcome] Sidebar successfully removed')
                      } else {
                        console.warn('[Welcome] Failed to remove sidebar')
                      }
                    }
                  }
                } catch (error) {
                  console.error('[Welcome] Error handling sidebar in window:', error)
                }
              }
            }
          } catch (error) {
            console.error('[Welcome] Error enumerating browser windows:', error)
          }
        }
      })

      const img = document.createElement('img')
      img.src = feature.image

      const name = document.createElement('h3')
      name.setAttribute('data-l10n-id', feature.l10nId)

      container.appendChild(img)
      container.appendChild(name)

      this.enableFeatures.appendChild(container)
    }
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

    // Filtrar solo los motores de búsqueda deseados: AstianGO, Qwant y DuckDuckGo
    // El orden de prioridad es: AstianGO, Qwant, DuckDuckGo
    const allowedEngines = ['AstianGO', 'Qwant', 'DuckDuckGo']
    const allEngines = this.store.getEngine()
    
    // Filtrar y ordenar según la prioridad definida
    const filteredEngines = []
    for (const engineName of allowedEngines) {
      const engine = allEngines.find((e) => e.name === engineName)
      if (engine) {
        filteredEngines.push(engine)
      }
    }

    filteredEngines.forEach((search) => {
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

    // Add "Recommended" badge for AstianGO
    if (search.name === 'AstianGO' || search.id === 'astiango') {
      const badge = document.createElement('p')
      badge.setAttribute('data-l10n-id', 'welcome-dialog-search-recommended')
      badge.style.fontSize = '0.85em'
      badge.style.color = 'var(--button-primary-bgcolor, #115ec7)'
      badge.style.fontWeight = '600'
      badge.style.marginTop = '4px'
      container.appendChild(badge)
    }

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

    this.pages.forEach((page) => page.setPages(this))

    this._displayCurrentPage()
  }

  next() {
    this.currentPage++

    if (this.currentPage >= this.pages.length) {
      // We can use internal js apis to close the window. We also want to set
      // the settings api for welcome seen to false to stop it showing again

      Services.prefs.setBoolPref(welcomeSeenPref, true)

      // Notify observers that welcome is completed
      // This allows BrowserGlue to install selected extensions
      Services.obs.notifyObservers(null, "welcome-completed", null)

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
  }
}

const pages = new Pages([
  new Page('welcome'),
  new Import('import'),
  new Themes('theme'),
  new Search('search'),
  new Apps('apps'),
  new Features('features'),
])

// Try to maximize the dialog window on load
try {
  // Wait a bit for the dialog to be fully rendered
  setTimeout(() => {
    // Method 1: Resize through frameElement (SubDialog)
    if (window.frameElement) {
      const frame = window.frameElement
      frame.style.width = '80vw'
      frame.style.height = '80vh'
      frame.style.maxWidth = '80vw'
      frame.style.maxHeight = '80vh'
      
      // Also try to resize the parent dialog
      const parentDialog = frame.closest('dialog')
      if (parentDialog) {
        parentDialog.style.width = '80vw'
        parentDialog.style.height = '80vh'
        parentDialog.style.maxWidth = 'none'
        parentDialog.style.maxHeight = 'none'
      }
    }
    
    // Method 2: Try through parent window
    if (window.parent && window.parent !== window) {
      try {
        const parentDialog = window.parent.document.querySelector('#window-modal-dialog')
        if (parentDialog) {
          parentDialog.style.width = '80vw'
          parentDialog.style.height = '80vh'
          parentDialog.style.maxWidth = 'none'
          parentDialog.style.maxHeight = 'none'
        }
        
        // Also try the subdialog frame
        const subdialogFrame = window.parent.document.querySelector('#window-modal-dialog-subdialog browser')
        if (subdialogFrame) {
          subdialogFrame.style.width = '80vw'
          subdialogFrame.style.height = '80vh'
        }
      } catch (e) {
        console.log('Could not access parent window:', e)
      }
    }
  }, 100)
} catch (e) {
  console.log('Could not maximize welcome dialog:', e)
}
