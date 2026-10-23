import assert from "node:assert/strict";
import test from "node:test";
import { SYNC_PREFERENCE_SPECS } from "../src/browser/components/sync/MidoriSyncPreferences.sys.mjs";
import { MidoriSyncHints } from "../src/browser/components/sync/MidoriSyncHints.sys.mjs";

function emitter() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    dispatch(name, detail = null) {
      for (const listener of listeners.get(name) ?? []) listener.handleEvent({ type: name, detail });
    },
  };
}

function fixture() {
  const normal = { gBrowser: { tabContainer: emitter() }, private: false };
  const privateWin = { gBrowser: { tabContainer: emitter() }, private: true };
  const topicListeners = new Map();
  const prefListeners = new Map();
  let changes = 0;
  const hints = new MidoriSyncHints({
    onChange: () => { ++changes; },
    windowMediator: { getEnumerator: () => [normal, privateWin] },
    isPrivate: win => win.private,
    observers: {
      addObserver(listener, topic) { topicListeners.set(topic, listener); },
      removeObserver(listener, topic) { if (topicListeners.get(topic) === listener) topicListeners.delete(topic); },
    },
    prefs: {
      addObserver(name, listener) { prefListeners.set(name, listener); },
      removeObserver(name, listener) { if (prefListeners.get(name) === listener) prefListeners.delete(name); },
    },
  });
  return { hints, normal, privateWin, topicListeners, prefListeners,
    changes: () => changes,
    topic(topic, win) { topicListeners.get(topic)?.observe(win, topic); },
    pref(name) { prefListeners.get(name)?.observe(null, "nsPref:changed", name); },
  };
}

test("only normal windows and allowlisted preferences produce hints", () => {
  const state = fixture();
  state.hints.start();
  state.hints.start();
  assert.deepEqual(state.hints.snapshot, { active: true, watchedWindows: 1 });
  assert.equal(state.prefListeners.size, Object.keys(SYNC_PREFERENCE_SPECS).length);
  state.normal.gBrowser.tabContainer.dispatch("TabOpen");
  state.normal.gBrowser.tabContainer.dispatch("TabAttrModified", { changed: ["soundplaying"] });
  state.normal.gBrowser.tabContainer.dispatch("TabAttrModified", { changed: ["label"] });
  state.privateWin.gBrowser.tabContainer.dispatch("TabOpen");
  state.pref("midori.verticaltabs.width");
  state.pref("midori.sync.serverConfig");
  assert.equal(state.changes(), 3);
  state.hints.close();
  assert.equal(state.prefListeners.size, 0);
  assert.equal(state.topicListeners.size, 0);
  assert.deepEqual(state.hints.snapshot, { active: false, watchedWindows: 0 });
  state.normal.gBrowser.tabContainer.dispatch("TabOpen");
  assert.equal(state.changes(), 3);
});

test("new windows are watched once and detached when closed", () => {
  const state = fixture();
  const later = { gBrowser: { tabContainer: emitter() }, private: false };
  state.hints.start();
  state.topic("browser-delayed-startup-finished", later);
  state.topic("browser-delayed-startup-finished", later);
  assert.equal(state.hints.snapshot.watchedWindows, 2);
  later.gBrowser.tabContainer.dispatch("TabClose");
  assert.equal(state.changes(), 1);
  state.topic("domwindowclosed", later);
  assert.equal(state.hints.snapshot.watchedWindows, 1);
  later.gBrowser.tabContainer.dispatch("TabOpen");
  assert.equal(state.changes(), 1);
  state.hints.close();
});
