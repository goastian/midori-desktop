/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * AutoHideToolbar — Hides the toolbar on scroll to maximize content area.
 *
 * When the user scrolls down on a page, the navigator-toolbox slides up
 * out of view. Moving the mouse to the top of the window or scrolling
 * back up reveals it again. Controlled by pref `midori.autohide.toolbar`.
 *
 * Uses the wheel event on the browser chrome (which bubbles from content
 * in non-Fission mode and is synthesized in Fission mode) combined with
 * mouse-near-top detection to provide a smooth experience.
 *
 * @patch Midori Browser
 */

const PREF_AUTOHIDE = 'midori.autohide.toolbar';
const TOOLBOX_HIDDEN_ATTR = 'midori-autohide-hidden';
const MOUSE_REVEAL_ZONE_PX = 10;
const WHEEL_HIDE_THRESHOLD = 40;
const WHEEL_SHOW_THRESHOLD = -30;
const IDLE_RESET_MS = 300;

export const AutoHideToolbar = {
  _initialized: false,
  _enabled: false,
  _windowListeners: new WeakMap(),

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    this._enabled = Services.prefs.getBoolPref(PREF_AUTOHIDE, true);
    Services.prefs.addObserver(PREF_AUTOHIDE, this);

    Services.obs.addObserver(this, 'browser-delayed-startup-finished');
    Services.obs.addObserver(this, 'domwindowclosed');

    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      if (win.document.readyState === 'complete') {
        this._attachToWindow(win);
      }
    }

    console.log(`AutoHideToolbar: Initialized (enabled=${this._enabled})`);
  },

  observe(subject, topic, data) {
    switch (topic) {
      case 'nsPref:changed':
        if (data === PREF_AUTOHIDE) {
          this._enabled = Services.prefs.getBoolPref(PREF_AUTOHIDE, true);
          for (const win of Services.wm.getEnumerator('navigator:browser')) {
            if (this._enabled) {
              this._attachToWindow(win);
            } else {
              this._detachFromWindow(win);
            }
          }
        }
        break;

      case 'browser-delayed-startup-finished':
        if (this._enabled) {
          this._attachToWindow(subject);
        }
        break;

      case 'domwindowclosed':
        this._detachFromWindow(subject);
        break;
    }
  },

  _attachToWindow(win) {
    if (!win?.document || this._windowListeners.has(win)) {
      return;
    }

    const doc = win.document;
    const toolbox = doc.getElementById('navigator-toolbox');
    if (!toolbox) {
      return;
    }

    // Mark as auto-hide enabled (CSS uses this for transitions)
    toolbox.setAttribute('midori-autohide', 'true');

    // Measure and set the toolbox height as a CSS variable
    const updateToolboxHeight = () => {
      const height = toolbox.getBoundingClientRect().height;
      if (height > 0) {
        doc.documentElement.style.setProperty('--midori-toolbox-height', height + 'px');
      }
    };
    // Initial measurement (defer to let layout settle)
    win.setTimeout(updateToolboxHeight, 100);

    const state = {
      isHidden: false,
      mouseNearTop: false,
      urlbarFocused: false,
      popupOpen: false,
      accumulatedDelta: 0,
      resetTimer: null,
      rafPending: false,
    };

    const show = () => {
      if (!state.isHidden) return;
      state.isHidden = false;
      state.accumulatedDelta = 0;
      toolbox.removeAttribute(TOOLBOX_HIDDEN_ATTR);
    };

    const hide = () => {
      if (state.isHidden) return;
      if (state.mouseNearTop || state.urlbarFocused || state.popupOpen) return;
      if (win.fullScreen) return;
      const urlbar = doc.getElementById('urlbar');
      if (urlbar?.hasAttribute('focused')) return;
      // Re-measure height before hiding (may have changed)
      updateToolboxHeight();
      state.isHidden = true;
      toolbox.setAttribute(TOOLBOX_HIDDEN_ATTR, 'true');
    };

    // --- Wheel event on the browser panel detects scroll direction ---
    const onWheel = (e) => {
      if (!this._enabled || win.fullScreen) return;

      state.accumulatedDelta += e.deltaY;

      // Reset accumulated delta after user stops scrolling
      if (state.resetTimer) {
        win.clearTimeout(state.resetTimer);
      }
      state.resetTimer = win.setTimeout(() => {
        state.accumulatedDelta = 0;
      }, IDLE_RESET_MS);

      // Use rAF to batch visual updates for smoothness
      if (!state.rafPending) {
        state.rafPending = true;
        win.requestAnimationFrame(() => {
          state.rafPending = false;
          if (state.accumulatedDelta > WHEEL_HIDE_THRESHOLD) {
            hide();
          } else if (state.accumulatedDelta < WHEEL_SHOW_THRESHOLD) {
            show();
          }
        });
      }
    };

    const browserPanel = doc.getElementById('browser') || doc.getElementById('appcontent');
    if (browserPanel) {
      browserPanel.addEventListener('wheel', onWheel, { passive: true, capture: true });
    }

    // --- Mouse near top edge reveals toolbar ---
    const onMouseMove = (e) => {
      if (!this._enabled) return;
      const nearTop = e.screenY - win.screenY <= MOUSE_REVEAL_ZONE_PX;
      if (nearTop && !state.mouseNearTop) {
        state.mouseNearTop = true;
        show();
      } else if (!nearTop) {
        state.mouseNearTop = false;
      }
    };
    doc.addEventListener('mousemove', onMouseMove, { passive: true });

    // --- Urlbar focus prevents hiding ---
    const onUrlbarFocus = () => {
      state.urlbarFocused = true;
      show();
    };
    const onUrlbarBlur = () => {
      state.urlbarFocused = false;
    };
    const urlbar = doc.getElementById('urlbar');
    if (urlbar) {
      urlbar.addEventListener('focus', onUrlbarFocus, true);
      urlbar.addEventListener('blur', onUrlbarBlur, true);
    }

    // --- Popup open prevents hiding ---
    const onPopupShown = () => {
      state.popupOpen = true;
      show();
    };
    const onPopupHidden = () => {
      state.popupOpen = false;
    };
    doc.addEventListener('popupshown', onPopupShown, true);
    doc.addEventListener('popuphidden', onPopupHidden, true);

    // --- Tab switch: always show toolbar ---
    const onTabSelect = () => {
      show();
      updateToolboxHeight();
    };
    win.gBrowser?.tabContainer?.addEventListener('TabSelect', onTabSelect);

    // --- Window resize: re-measure height ---
    const onResize = () => {
      updateToolboxHeight();
    };
    win.addEventListener('resize', onResize, { passive: true });

    // --- Keyboard shortcut: Shift+F11 toggles ---
    const onKeyDown = (e) => {
      if (!this._enabled) return;
      if (e.shiftKey && e.key === 'F11') {
        e.preventDefault();
        if (state.isHidden) {
          show();
        } else {
          hide();
        }
      }
    };
    doc.addEventListener('keydown', onKeyDown, true);

    this._windowListeners.set(win, {
      onWheel,
      onMouseMove,
      onUrlbarFocus,
      onUrlbarBlur,
      onPopupShown,
      onPopupHidden,
      onTabSelect,
      onKeyDown,
      onResize,
      show,
      browserPanel,
    });
  },

  _detachFromWindow(win) {
    const listeners = this._windowListeners.get(win);
    if (!listeners) return;

    const doc = win.document;
    const toolbox = doc?.getElementById('navigator-toolbox');
    if (toolbox) {
      toolbox.removeAttribute(TOOLBOX_HIDDEN_ATTR);
      toolbox.removeAttribute('midori-autohide');
    }
    doc?.documentElement?.style?.removeProperty('--midori-toolbox-height');

    if (listeners.browserPanel) {
      listeners.browserPanel.removeEventListener('wheel', listeners.onWheel, {
        passive: true,
        capture: true,
      });
    }

    if (doc) {
      doc.removeEventListener('mousemove', listeners.onMouseMove, { passive: true });
      doc.removeEventListener('popupshown', listeners.onPopupShown, true);
      doc.removeEventListener('popuphidden', listeners.onPopupHidden, true);
      doc.removeEventListener('keydown', listeners.onKeyDown, true);
    }

    win?.removeEventListener('resize', listeners.onResize, { passive: true });

    const urlbar = doc?.getElementById('urlbar');
    if (urlbar) {
      urlbar.removeEventListener('focus', listeners.onUrlbarFocus, true);
      urlbar.removeEventListener('blur', listeners.onUrlbarBlur, true);
    }

    win.gBrowser?.tabContainer?.removeEventListener('TabSelect', listeners.onTabSelect);
    this._windowListeners.delete(win);
  },

  uninit() {
    Services.prefs.removeObserver(PREF_AUTOHIDE, this);
    try {
      Services.obs.removeObserver(this, 'browser-delayed-startup-finished');
      Services.obs.removeObserver(this, 'domwindowclosed');
    } catch (e) {}

    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      this._detachFromWindow(win);
    }
    this._initialized = false;
  },
};
