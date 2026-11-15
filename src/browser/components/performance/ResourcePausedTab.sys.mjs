/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PAUSED_URI = 'about:performance-paused';
const paused = new WeakMap();
const pending = new WeakSet();
const watchedWindows = new WeakSet();
let observing = false;
const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ResourceTabCoordinator: 'resource:///modules/ResourceTabCoordinator.sys.mjs',
  SessionStore: 'moz-src:///browser/components/sessionstore/SessionStore.sys.mjs',
  TabState: 'moz-src:///browser/components/sessionstore/TabState.sys.mjs',
  clearTimeout: 'resource://gre/modules/Timer.sys.mjs',
  setTimeout: 'resource://gre/modules/Timer.sys.mjs',
});

function canPause(tab) {
  const browser = tab?.linkedBrowser;
  const global = browser?.browsingContext?.currentWindowGlobal;
  return !!(tab?.isConnected && browser?.isConnected && browser.isRemoteBrowser &&
    ['http', 'https'].includes(browser.currentURI?.scheme) && !tab.closing &&
    !tab.pinned && !tab.multiselected && !tab.splitview && !tab.undiscardable &&
    tab.autoDiscardable !== false && !tab.soundPlaying && !tab.pictureinpicture &&
    !tab.attention && !tab.hasAttribute('pending') && !tab.hasAttribute('busy') &&
    !tab.hasAttribute('sharing') && !browser.hasBeforeUnload && global &&
    !global.hasActivePeerConnections());
}

function finish(state, result) {
  if (!state?.resolve) return;
  lazy.clearTimeout(state.timer);
  state.resolve(result);
  state.resolve = null;
}

function release(key) {
  finish(paused.get(key), false);
  paused.delete(key);
  lazy.TabState.releaseResourcePause(key);
}

const progressListener = {
  onLocationChange(browser, progress, _request, uri) {
    if (!progress.isTopLevel) return;
    const key = browser.permanentKey;
    const state = paused.get(key);
    if (!state) return;
    if (uri.spec.split('#')[0] === PAUSED_URI) state.phase = 'paused';
    else if (state.phase !== 'resuming') release(key);
  },
  onStateChange(browser, progress, _request, flags) {
    if (!progress.isTopLevel || !(flags & Ci.nsIWebProgressListener.STATE_STOP) ||
        !(flags & Ci.nsIWebProgressListener.STATE_IS_WINDOW) ||
        !paused.has(browser.permanentKey) || browser.currentURI.spec !== PAUSED_URI) return;
    browser.browsingContext?.sessionHistory?.evictAllDocumentViewers();
    finish(paused.get(browser.permanentKey), true);
  },
};

function watchWindow(win) {
  if (!win.gBrowser || watchedWindows.has(win)) return;
  watchedWindows.add(win);
  win.gBrowser.addTabsProgressListener(progressListener);
}

function watchWindows() {
  for (const win of Services.wm.getEnumerator('navigator:browser')) watchWindow(win);
  if (observing) return;
  observing = true;
  Services.obs.addObserver(watchWindow, 'browser-delayed-startup-finished');
}

function tabForContext(context) {
  if (context !== context.top) return null;
  const browser = context.embedderElement;
  return context.topChromeWindow?.gBrowser?.getTabForBrowser(browser) || null;
}

export const ResourcePausedTab = {
  isEligible(tab) {
    return canPause(tab);
  },

  isPaused(tab) {
    return !!tab?.linkedBrowser && paused.has(tab.linkedBrowser.permanentKey);
  },

  getState(context) {
    const tab = tabForContext(context);
    const state = tab && paused.get(tab.linkedBrowser.permanentKey);
    return state ? { title: state.title, url: state.url } : null;
  },

  async pause(tab, canContinue = () => true) {
    if (!canContinue() || !canPause(tab)) return false;
    const browser = tab.linkedBrowser;
    const key = browser.permanentKey;
    if (pending.has(key) || paused.has(key)) return false;
    pending.add(key);
    try {
      const innerWindowId = browser.browsingContext.currentWindowGlobal.innerWindowId;
      if ((await lazy.ResourceTabCoordinator.inspectForPause(tab)).protected) return false;
      if (!await lazy.ResourceTabCoordinator.persistForPause(tab, canContinue)) return false;
      await tab.ownerDocument.defaultView.gBrowser.prepareDiscardBrowser(tab);
      const state = await lazy.ResourceTabCoordinator.inspectForPause(tab);
      if (state.protected || !canContinue() || !canPause(tab) || browser !== tab.linkedBrowser ||
          innerWindowId !== browser.browsingContext.currentWindowGlobal.innerWindowId) return false;
      const data = lazy.TabState.clone(tab);
      if (state.forms.some(({ id, value }) => !Object.hasOwn(data.formdata?.id || {}, id) ||
          JSON.stringify(data.formdata.id[id]) !== JSON.stringify(value))) return false;
      if (!lazy.TabState.retainForResourcePause(key)) return false;
      let resolve;
      const ready = new Promise(done => { resolve = done; });
      const retained = { title: tab.getAttribute('label'), url: browser.currentURI.spec,
        phase: 'navigating', resolve, timer: null };
      retained.timer = lazy.setTimeout(() => finish(retained, false), 10000);
      paused.set(key, retained);
      watchWindows();
      try {
        browser.loadURI(Services.io.newURI(PAUSED_URI), {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
          loadFlags: Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_HISTORY,
        });
      } catch (error) {
        release(key);
        throw error;
      }
      return await ready;
    } finally {
      pending.delete(key);
    }
  },

  resume(tab) {
    const browser = tab?.linkedBrowser;
    const key = browser?.permanentKey;
    const state = key && paused.get(key);
    if (!state || tab.closing || !tab.isConnected) return false;
    const { extData } = JSON.parse(lazy.SessionStore.getTabState(tab));
    const saved = lazy.TabState.clone(tab, extData);
    state.phase = 'resuming';
    try {
      lazy.SessionStore.setTabState(tab, saved);
    } catch (error) {
      state.phase = 'paused';
      throw error;
    }
    release(key);
    return true;
  },

  resumeContext(context) {
    return this.resume(tabForContext(context));
  },
};
