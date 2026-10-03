/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SYNC_PREFERENCE_SPECS } from "./MidoriSyncPreferences.sys.mjs";

const TAB_EVENTS = ["TabAttrModified", "TabClose", "TabMove", "TabOpen", "TabPinned", "TabUnpinned"];
const TITLE_ATTRIBUTES = ["label", "titlechanged"];

export class MidoriSyncHints {
  #onChange;
  #prefs;
  #windowMediator;
  #observers;
  #isPrivate;
  #watched = new Map();
  #topics = new Set();
  #prefNames = new Set();
  #active = false;

  constructor({ onChange, prefs = Services.prefs, windowMediator = Services.wm,
    observers = Services.obs,
    isPrivate = win => ChromeUtils.importESModule("resource://gre/modules/PrivateBrowsingUtils.sys.mjs")
      .PrivateBrowsingUtils.isWindowPrivate(win) }) {
    this.#onChange = onChange;
    this.#prefs = prefs;
    this.#windowMediator = windowMediator;
    this.#observers = observers;
    this.#isPrivate = isPrivate;
  }

  get snapshot() {
    return Object.freeze({ active: this.#active, watchedWindows: this.#watched.size });
  }

  start() {
    if (this.#active) {
      return;
    }
    this.#active = true;
    try {
      for (const win of this.#windowMediator.getEnumerator("navigator:browser")) {
        this.#watch(win);
      }
      for (const topic of ["browser-delayed-startup-finished", "domwindowclosed"]) {
        this.#observers.addObserver(this, topic);
        this.#topics.add(topic);
      }
      for (const name of Object.keys(SYNC_PREFERENCE_SPECS)) {
        this.#prefs.addObserver(name, this);
        this.#prefNames.add(name);
      }
    } catch (error) {
      this.close();
      throw error;
    }
  }

  observe(subject, topic, data) {
    if (!this.#active) {
      return;
    }
    if (topic === "browser-delayed-startup-finished") {
      this.#watch(subject);
    } else if (topic === "domwindowclosed") {
      this.#unwatch(subject);
    } else if (topic === "nsPref:changed" && Object.hasOwn(SYNC_PREFERENCE_SPECS, data)) {
      this.#onChange();
    }
  }

  handleEvent(event) {
    if (!this.#active || (event.type === "TabAttrModified" &&
        !event.detail?.changed?.some(name => TITLE_ATTRIBUTES.includes(name)))) {
      return;
    }
    this.#onChange();
  }

  close() {
    if (!this.#active) {
      return;
    }
    this.#active = false;
    for (const topic of this.#topics) {
      this.#observers.removeObserver(this, topic);
    }
    this.#topics.clear();
    for (const win of this.#watched.keys()) {
      this.#unwatch(win);
    }
    for (const name of this.#prefNames) {
      this.#prefs.removeObserver(name, this);
    }
    this.#prefNames.clear();
  }

  #watch(win) {
    if (!win?.gBrowser?.tabContainer || this.#watched.has(win) || win.closed || this.#isPrivate(win)) {
      return;
    }
    const container = win.gBrowser.tabContainer;
    for (const name of TAB_EVENTS) {
      container.addEventListener(name, this);
    }
    this.#watched.set(win, container);
  }

  #unwatch(win) {
    const container = this.#watched.get(win);
    if (!container) {
      return;
    }
    this.#watched.delete(win);
    for (const name of TAB_EVENTS) {
      container.removeEventListener(name, this);
    }
  }
}
