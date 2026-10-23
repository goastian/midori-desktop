import { createSyncExtensionStore } from "../src/browser/components/sync/MidoriSyncExtensionStore.sys.mjs";

export const addonId = "@portable-extension";
export const value = (enabled = true) => ({ version: 1, type: "extension", catalog: "amo", addonId, enabled });
export const turn = () => new Promise(resolve => setImmediate(resolve));
export const gate = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

export function extensionStoreFixture() {
  const f = { installed: new Map(), tracked: new Map(), calls: [], listeners: new Set(), managed: false, browser: {},
    failStartup: false, approve: true, beforePrompt: async () => {}, downloadedSignedState: 2, localData: new Map(), grants: new Map() };
  f.makeAddon = (id = addonId, properties = {}) => {
    const addon = { id, type: "extension", signedState: 2, isSyncable: true, isCompatible: true, permissions: 7,
      userDisabled: false, appDisabled: false, version: "1", syncGUID: `instance:${id}`, ...properties,
      async enable() { f.calls.push("enable"); addon.userDisabled = false; },
      async disable() { f.calls.push("disable"); addon.userDisabled = true; },
      async uninstall(_undo, { syncSource = "user" } = {}) {
        f.calls.push(`uninstall:${syncSource}`);
        if (f.tracked.has(id)) { f.tracked.set(id, { source: syncSource, token: "removal-token" }); }
        f.installed.delete(id);
      },
    };
    return addon;
  };
  const database = { async asyncLoadDB() {},
    getSyncAddonState: id => f.tracked.has(id) ? { tracked: true, removal: f.tracked.get(id) } : null,
    getSyncAddonByID: id => f.installed.get(id) ?? null,
    getSyncAddonStates: () => [...f.tracked].map(([addonId, removal]) => ({ addonId, removal })),
    async trackSyncAddon(id) { f.calls.push("track"); if (!f.tracked.has(id)) { f.tracked.set(id, null); } },
    async saveSyncChanges() { f.calls.push("database"); },
  };
  f.database = database;
  f.addons = {
    SIGNEDSTATE_SIGNED: 2, SIGNEDSTATE_PRIVILEGED: 3, SIGNEDSTATE_NOT_REQUIRED: 1,
    PERM_CAN_UNINSTALL: 1, PERM_CAN_ENABLE: 2, PERM_CAN_DISABLE: 4,
    getAddonByID: async id => f.installed.get(id) ?? null,
    getAddonsByTypes: async () => [...f.installed.values()],
    addAddonListener: listener => f.listeners.add(listener), removeAddonListener: listener => f.listeners.delete(listener),
    async getInstallForURL(url, options) {
      f.calls.push("prepare");
      f.installURL = url; f.installOptions = options;
      const listeners = new Set();
      const install = { addon: f.makeAddon(addonId, { signedState: f.downloadedSignedState, ...f.downloadedProperties }),
        addListener: listener => listeners.add(listener), removeListener: listener => listeners.delete(listener),
        cancel() { f.calls.push("cancel"); install.cancelled = true; install.emit("onInstallCancelled"); },
        emit(name, ...args) { return [...listeners].map(listener => listener[name]?.(install, ...args)); },
      };
      f.install = install;
      return install;
    },
    installAddonFromAOMWithOptions(browser, uri, install, options) {
      f.calls.push("native-installer"); f.promptOptions = options; f.promptBrowser = browser; f.promptURI = uri;
      f.flow = (async () => {
        if (install.emit("onDownloadEnded").includes(false) || install.cancelled) { return; }
        await options.beforePermissionPrompt();
        f.calls.push("native-prompt");
        await f.beforePrompt();
        if (!f.approve || install.cancelled) { install.cancel(); return; }
        if (install.emit("onInstallStarted").includes(false)) { return; }
        f.installed.set(addonId, install.addon);
        install.emit("onInstallEnded", install.addon);
      })().catch(() => install.cancel());
    },
  };
  f.results = [{ id: addonId, type: "extension", name: "Portable extension", sourceURI: {
    spec: "https://addons.mozilla.org/firefox/downloads/file/1/fixture.xpi" } }];
  f.repository = { async getAddonsByIDs(ids) { f.calls.push("catalog"); f.catalogIDs = ids; if (f.catalogGate) { await f.catalogGate; } return f.results; } };
  f.store = createSyncExtensionStore({ addons: f.addons, repository: f.repository,
    native: { XPIDatabase: database, XPIInternal: { XPIStates: { async saveSyncChanges() {
      f.calls.push("startup"); if (f.failStartup) { throw new Error("synthetic startup write failure"); }
    } } } }, getBrowser: () => f.browser, isManaged: () => f.managed,
    extensionStorage: { async persistSyncRemoval(id, isCurrent) {
      f.calls.push("storage-removal");
      await f.beforeRemovalPersist?.();
      if (!isCurrent()) { return false; }
      if (f.failRemoval) { throw new Error("synthetic storage removal failure"); }
      f.localData.delete(id);
      return isCurrent();
    } },
    extensionPermissions: {
      async persistSyncRemoval(id, isCurrent) {
        f.calls.push("permission-removal");
        await f.beforePermissionPersist?.();
        if (!isCurrent()) { return false; }
        if (f.failPermissionWrite) { throw new Error("synthetic permission write failure"); }
        f.grants.delete(id);
        return isCurrent();
      },
      async persistSyncChanges(_id, isCurrent) {
        f.calls.push("permissions");
        await f.beforePermissionPersist?.();
        if (f.failPermissionWrite) { throw new Error("synthetic permission write failure"); }
        return isCurrent();
      },
    },
    persistPreferences: async () => { f.calls.push("preferences"); if (f.failPreferences) { throw new Error("synthetic preferences write failure"); } } });
  return f;
}
