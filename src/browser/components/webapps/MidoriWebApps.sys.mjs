/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { isRegularBrowserWindow } from "resource:///modules/MidoriWebAppUtils.sys.mjs";

const PREF_ENABLED = "browser.taskbarTabs.enabled";
export const MIDORI_WEBAPPS_CHANGED_TOPIC = "midori-webapps-changed";
const MAX_ICON_CACHE_ENTRIES = 64;
const MAX_CONCURRENT_ICON_LOADS = 4;
const iconCache = new Map();
const iconLoadQueue = [];
let activeIconLoads = 0;
let legacySsbMigrationPromise = null;

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ContextualIdentityService:
    "resource://gre/modules/ContextualIdentityService.sys.mjs",
  migrateLegacySsbApps:
    "resource:///modules/MidoriWebAppMigration.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  ShellService: "moz-src:///browser/components/shell/ShellService.sys.mjs",
  TaskbarTabs: "resource:///modules/taskbartabs/TaskbarTabs.sys.mjs",
  TaskbarTabsUtils: "resource:///modules/taskbartabs/TaskbarTabsUtils.sys.mjs",
});

function isSupportedPlatform() {
  return AppConstants.platform === "win" || AppConstants.platform === "linux";
}

function serializeTaskbarTab(taskbarTab) {
  const containerName = taskbarTab.userContextId
    ? lazy.ContextualIdentityService.getPublicIdentityFromId(
        taskbarTab.userContextId
      )?.name ?? null
    : null;

  let supported = false;
  try {
    supported =
      Number.isInteger(taskbarTab.userContextId) &&
      taskbarTab.userContextId >= 0 &&
      isInstallableWebAppURI(Services.io.newURI(taskbarTab.startUrl));
  } catch {}

  return {
    id: taskbarTab.id,
    name: taskbarTab.name,
    startUrl: taskbarTab.startUrl,
    userContextId: taskbarTab.userContextId,
    containerName,
    scopes: taskbarTab.scopes.map(scope => ({ ...scope })),
    shortcutInstalled: !!taskbarTab.shortcutRelativePath,
    supported,
  };
}

function pumpIconLoads() {
  while (
    activeIconLoads < MAX_CONCURRENT_ICON_LOADS &&
    iconLoadQueue.length
  ) {
    const { load, resolve } = iconLoadQueue.shift();
    activeIconLoads++;
    Promise.resolve()
      .then(load)
      .then(resolve, () => resolve(null))
      .finally(() => {
        activeIconLoads--;
        pumpIconLoads();
      });
  }
}

function scheduleIconLoad(load) {
  return new Promise(resolve => {
    iconLoadQueue.push({ load, resolve });
    pumpIconLoads();
  });
}

function getCachedIcon(id, startUrl) {
  const cached = iconCache.get(id);
  if (cached?.startUrl === startUrl) {
    iconCache.delete(id);
    iconCache.set(id, cached);
    return cached.promise;
  }

  const promise = scheduleIconLoad(async () => {
    try {
      const iconFile = lazy.TaskbarTabsUtils.getTaskbarTabsFolder();
      iconFile.append("icons");
      iconFile.append(`${id}.${lazy.ShellService.shortcutIconType.extension}`);
      if (await IOUtils.exists(iconFile.path)) {
        return Services.io.newFileURI(iconFile).spec;
      }

      const startUri = Services.io.newURI(startUrl);
      return (await lazy.TaskbarTabsUtils.getFaviconUri(startUri))?.spec ?? null;
    } catch {
      return null;
    }
  });
  iconCache.set(id, { startUrl, promise });
  while (iconCache.size > MAX_ICON_CACHE_ENTRIES) {
    iconCache.delete(iconCache.keys().next().value);
  }
  return promise;
}

function requireSupportedPlatform() {
  if (!isSupportedPlatform()) {
    throw new Error("Web app integration is not available on this platform.");
  }
}

function requireEnabled() {
  requireSupportedPlatform();
  if (!Services.prefs.getBoolPref(PREF_ENABLED, false)) {
    throw new Error("Web app integration is disabled.");
  }
}

function ensureLegacySsbMigration() {
  legacySsbMigrationPromise ??= Promise.resolve()
    .then(() =>
      lazy.migrateLegacySsbApps(lazy.TaskbarTabs)
    )
    .catch(error => {
      console.error("MidoriWebApps: Legacy SSB migration failed.", error);
      return null;
    });
  return legacySsbMigrationPromise;
}

export function isInstallableWebAppURI(uri) {
  if (!(uri instanceof Ci.nsIURL) || uri.userPass) {
    return false;
  }
  if (uri.scheme === "https") {
    return true;
  }
  return (
    uri.scheme === "http" &&
    ["localhost", "127.0.0.1", "::1"].includes(uri.host)
  );
}

export const MidoriWebApps = {
  get supported() {
    return isSupportedPlatform();
  },

  get enabled() {
    return this.supported && Services.prefs.getBoolPref(PREF_ENABLED, false);
  },

  setEnabled(enabled) {
    requireSupportedPlatform();
    Services.prefs.setBoolPref(PREF_ENABLED, !!enabled);
    Services.obs.notifyObservers(
      null,
      MIDORI_WEBAPPS_CHANGED_TOPIC,
      JSON.stringify({ version: 1, type: "enabled", id: null })
    );
  },

  async list() {
    if (!this.supported) {
      return [];
    }
    await ensureLegacySsbMigration();
    const apps = await lazy.TaskbarTabs.listTaskbarTabs();
    const appIds = new Set(apps.map(app => app.id));
    for (const id of iconCache.keys()) {
      if (!appIds.has(id)) {
        iconCache.delete(id);
      }
    }
    return apps.map(serializeTaskbarTab);
  },

  async getIcon(id, startUrl) {
    requireSupportedPlatform();
    const app = await lazy.TaskbarTabs.getTaskbarTab(id);
    if (app.startUrl !== startUrl) {
      throw new Error("The web app URL no longer matches the registry.");
    }
    return getCachedIcon(id, startUrl);
  },

  async installSelectedTab(win) {
    requireEnabled();
    if (!this.enabled || !isRegularBrowserWindow(win)) {
      throw new Error("A regular browser window is required to install a web app.");
    }
    if (lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
      throw new Error("Web apps cannot be installed from private windows.");
    }

    const tab = win.gBrowser.selectedTab;
    if (!isInstallableWebAppURI(tab?.linkedBrowser?.currentURI)) {
      throw new Error("Only secure websites can be installed as web apps.");
    }

    const result = await lazy.TaskbarTabs.moveTabIntoTaskbarTab(tab);
    return serializeTaskbarTab(result.taskbarTab);
  },

  async open(id) {
    requireEnabled();
    const app = await lazy.TaskbarTabs.getTaskbarTab(id);
    await lazy.TaskbarTabs.openWindow(app);
    return serializeTaskbarTab(app);
  },

  async uninstall(id) {
    requireSupportedPlatform();
    const removed = await lazy.TaskbarTabs.removeTaskbarTab(id);
    iconCache.delete(id);
    return removed ? serializeTaskbarTab(removed) : null;
  },

  async rename(id, name, win = null) {
    requireEnabled();
    const app = await lazy.TaskbarTabs.renameTaskbarTab(id, name, {
      window: win,
    });
    return serializeTaskbarTab(app);
  },

  async repairShortcut(id, win = null) {
    requireEnabled();
    const app = await lazy.TaskbarTabs.repairTaskbarTab(id, { window: win });
    iconCache.delete(id);
    return serializeTaskbarTab(app);
  },
};
