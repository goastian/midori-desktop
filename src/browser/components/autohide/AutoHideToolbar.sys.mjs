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
const PREF_FLASH_ON_NAV = 'midori.autohide.flashOnLocationChange';
const PREF_FLASH_DURATION = 'midori.autohide.flashDurationMs';
const TOOLBOX_HIDDEN_ATTR = 'midori-autohide-hidden';
const ROOT_HIDDEN_ATTR = 'midori-toolbar-autohide-hidden';
const MOUSE_REVEAL_ZONE_PX = 10;
const WHEEL_HIDE_THRESHOLD = 40;
const WHEEL_SHOW_THRESHOLD = -30;
const IDLE_RESET_MS = 300;
// Bounds for the location-change flash reveal duration.
const FLASH_DURATION_DEFAULT_MS = 1200;
const FLASH_DURATION_MIN_MS = 300;
const FLASH_DURATION_MAX_MS = 5000;
// Delay before re-measuring toolbox height to avoid getBoundingClientRect()
// while a CSS transition is still running (avoids compositor sync stall).
const HEIGHT_REMEASURE_DELAY_MS = 250;

export const AutoHideToolbar = {
  _initialized: false,
  _enabled: false,
  _windowListeners: new WeakMap(),

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    this._enabled = Services.prefs.getBoolPref(PREF_AUTOHIDE, false);
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
          this._enabled = Services.prefs.getBoolPref(PREF_AUTOHIDE, false);
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
      const rect = toolbox.getBoundingClientRect();
      const style = win.getComputedStyle(toolbox);
      const marginBlock =
        (Number.parseFloat(style.marginBlockStart) || 0) +
        (Number.parseFloat(style.marginBlockEnd) || 0);
      const height = rect.height + marginBlock;
      if (height > 0) {
        doc.documentElement.style.setProperty('--midori-toolbox-height', height + 'px');
      }
    };

    // Track async handles so we can cancel them when the window is detached
    let rafId = null;
    let initialMeasureTimer = null;
    let heightRemeasureTimer = null;
    let flashTimer = null;
    let toolboxResizeObserver = null;
    // Thin fixed strip at the top edge that reveals the toolbar on hover.
    // Replaces a global `mousemove` listener (which fired on every pointer
    // move across the whole window) with a single edge-triggered element.
    let edgeSensor = null;

    // Debounced height update — fires only after transitions have settled
    const scheduleHeightUpdate = () => {
      if (heightRemeasureTimer !== null) {
        win.clearTimeout(heightRemeasureTimer);
      }
      heightRemeasureTimer = win.setTimeout(() => {
        heightRemeasureTimer = null;
        updateToolboxHeight();
      }, HEIGHT_REMEASURE_DELAY_MS);
    };

    // Initial measurement: defer to let layout settle
    initialMeasureTimer = win.setTimeout(() => {
      initialMeasureTimer = null;
      updateToolboxHeight();
    }, 150);

    const state = {
      isHidden: false,
      mouseNearTop: false,
      urlbarFocused: false,
      popupOpen: false,
      accumulatedDelta: 0,
      resetTimer: null,
      rafPending: false,
    };

    // Layout changes such as switching tab position, density, bookmarks, or
    // colorway can change the toolbox after the initial measurement. Keep the
    // cached translation distance current so no partial toolbar is left over
    // the themed window surface while autohide is active.
    if (typeof win.ResizeObserver === 'function') {
      toolboxResizeObserver = new win.ResizeObserver(() => {
        if (!state.isHidden) {
          scheduleHeightUpdate();
        }
      });
      toolboxResizeObserver.observe(toolbox);
    }

    const show = () => {
      if (!state.isHidden) return;
      state.isHidden = false;
      state.accumulatedDelta = 0;
      toolbox.removeAttribute(TOOLBOX_HIDDEN_ATTR);
      doc.documentElement.removeAttribute(ROOT_HIDDEN_ATTR);
      syncEdgeSensor();
    };

    const hide = () => {
      if (state.isHidden) return;
      if (state.mouseNearTop || state.urlbarFocused || state.popupOpen) return;
      if (win.fullScreen) return;
      const urlbar = doc.getElementById('urlbar');
      if (urlbar?.hasAttribute('focused')) return;
      // NOTE: Do NOT call updateToolboxHeight() here — getBoundingClientRect()
      // inside a rAF callback during an active CSS transition causes a
      // compositor sync deadlock in newer Firefox. Height is cached at
      // attach-time and refreshed via scheduleHeightUpdate() after transitions.
      state.isHidden = true;
      toolbox.setAttribute(TOOLBOX_HIDDEN_ATTR, 'true');
      doc.documentElement.setAttribute(ROOT_HIDDEN_ATTR, 'true');
      syncEdgeSensor();
    };

    // The edge sensor only needs to intercept the pointer while the toolbar
    // is hidden; otherwise it stays click-through so it never blocks chrome.
    const syncEdgeSensor = () => {
      if (edgeSensor) {
        edgeSensor.style.pointerEvents = state.isHidden ? 'auto' : 'none';
      }
    };

    // --- Wheel event on the browser panel detects scroll direction ---
    const onWheel = (e) => {
      if (!this._enabled || win.fullScreen) return;

      state.accumulatedDelta += e.deltaY;

      // Reset accumulated delta after user stops scrolling
      if (state.resetTimer !== null) {
        win.clearTimeout(state.resetTimer);
      }
      state.resetTimer = win.setTimeout(() => {
        state.resetTimer = null;
        state.accumulatedDelta = 0;
      }, IDLE_RESET_MS);

      // Use rAF to batch visual updates for smoothness
      if (!state.rafPending) {
        state.rafPending = true;
        rafId = win.requestAnimationFrame(() => {
          rafId = null;
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

    // --- Mouse near top edge reveals toolbar (edge-sensor element) ---
    // Instead of a global `mousemove` listener that processes every pointer
    // move, a thin fixed strip at the very top of the window fires a single
    // `mouseenter` when the pointer crosses into the reveal zone. It is
    // click-through (pointer-events:none) whenever the toolbar is visible.
    const XHTML_NS = 'http://www.w3.org/1999/xhtml';
    edgeSensor = doc.createElementNS(XHTML_NS, 'div');
    edgeSensor.id = 'midori-autohide-edge-sensor';
    edgeSensor.style.cssText =
      'position:fixed;top:0;left:0;right:0;' +
      `height:${MOUSE_REVEAL_ZONE_PX}px;` +
      'z-index:2147483647;pointer-events:none;margin:0;padding:0;' +
      'background:transparent;';
    doc.documentElement.appendChild(edgeSensor);
    syncEdgeSensor();

    const onSensorEnter = () => {
      if (!this._enabled) return;
      state.mouseNearTop = true;
      show();
    };
    edgeSensor.addEventListener('mouseenter', onSensorEnter, { passive: true });

    // Once the pointer leaves the revealed toolbar, clear the near-top guard
    // so a subsequent wheel-scroll or flash-timeout can hide it again.
    const onToolboxLeave = () => {
      state.mouseNearTop = false;
    };
    toolbox.addEventListener('mouseleave', onToolboxLeave, { passive: true });

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
      scheduleHeightUpdate();
    };
    win.gBrowser?.tabContainer?.addEventListener('TabSelect', onTabSelect);

    // --- Location change: briefly flash the toolbar so the user can read the
    // new address before it hides again (Zen-style compact reveal). ---
    const flash = () => {
      if (!this._enabled || win.fullScreen) return;
      if (!Services.prefs.getBoolPref(PREF_FLASH_ON_NAV, true)) return;
      if (!state.isHidden) return;

      const duration = Math.min(
        Math.max(
          Services.prefs.getIntPref(PREF_FLASH_DURATION, FLASH_DURATION_DEFAULT_MS),
          FLASH_DURATION_MIN_MS
        ),
        FLASH_DURATION_MAX_MS
      );

      show();
      if (flashTimer !== null) {
        win.clearTimeout(flashTimer);
      }
      flashTimer = win.setTimeout(() => {
        flashTimer = null;
        // hide() already guards mouse-near-top / focus / popup / fullscreen,
        // so a user interacting with the revealed toolbar keeps it visible.
        hide();
      }, duration);
    };

    const progressListener = {
      onLocationChange(browser, webProgress, _request, _location, flags) {
        if (!webProgress?.isTopLevel) return;
        // Ignore same-document navigations (anchor jumps, history.pushState).
        const SAME_DOC = Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT;
        if (flags & SAME_DOC) return;
        flash();
      },
    };
    win.gBrowser?.addTabsProgressListener(progressListener);

    // --- Window resize: re-measure height ---
    const onResize = () => {
      scheduleHeightUpdate();
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
      onSensorEnter,
      onToolboxLeave,
      edgeSensor,
      onUrlbarFocus,
      onUrlbarBlur,
      onPopupShown,
      onPopupHidden,
      onTabSelect,
      onKeyDown,
      onResize,
      show,
      browserPanel,
      progressListener,
      toolboxResizeObserver,
      // Cancels all pending async work — called by _detachFromWindow
      cancelPending: () => {
        if (rafId !== null) {
          win.cancelAnimationFrame(rafId);
          rafId = null;
          state.rafPending = false;
        }
        if (initialMeasureTimer !== null) {
          win.clearTimeout(initialMeasureTimer);
          initialMeasureTimer = null;
        }
        if (state.resetTimer !== null) {
          win.clearTimeout(state.resetTimer);
          state.resetTimer = null;
        }
        if (heightRemeasureTimer !== null) {
          win.clearTimeout(heightRemeasureTimer);
          heightRemeasureTimer = null;
        }
        if (flashTimer !== null) {
          win.clearTimeout(flashTimer);
          flashTimer = null;
        }
        toolboxResizeObserver?.disconnect();
        toolboxResizeObserver = null;
      },
    });
  },

  _detachFromWindow(win) {
    const listeners = this._windowListeners.get(win);
    if (!listeners) return;

    // Cancel any in-flight rAF / timers before tearing down listeners
    listeners.cancelPending?.();

    const doc = win.document;
    const toolbox = doc?.getElementById('navigator-toolbox');
    if (toolbox) {
      toolbox.removeAttribute(TOOLBOX_HIDDEN_ATTR);
      toolbox.removeAttribute('midori-autohide');
    }
    doc?.documentElement?.removeAttribute(ROOT_HIDDEN_ATTR);
    doc?.documentElement?.style?.removeProperty('--midori-toolbox-height');

    if (listeners.browserPanel) {
      listeners.browserPanel.removeEventListener('wheel', listeners.onWheel, {
        passive: true,
        capture: true,
      });
    }

    if (doc) {
      doc.removeEventListener('popupshown', listeners.onPopupShown, true);
      doc.removeEventListener('popuphidden', listeners.onPopupHidden, true);
      doc.removeEventListener('keydown', listeners.onKeyDown, true);
    }

    if (toolbox && listeners.onToolboxLeave) {
      toolbox.removeEventListener('mouseleave', listeners.onToolboxLeave, { passive: true });
    }

    if (listeners.edgeSensor) {
      try {
        listeners.edgeSensor.removeEventListener('mouseenter', listeners.onSensorEnter, {
          passive: true,
        });
        listeners.edgeSensor.remove();
      } catch {}
    }

    win?.removeEventListener('resize', listeners.onResize, { passive: true });

    const urlbar = doc?.getElementById('urlbar');
    if (urlbar) {
      urlbar.removeEventListener('focus', listeners.onUrlbarFocus, true);
      urlbar.removeEventListener('blur', listeners.onUrlbarBlur, true);
    }

    win.gBrowser?.tabContainer?.removeEventListener('TabSelect', listeners.onTabSelect);
    if (listeners.progressListener) {
      try {
        win.gBrowser?.removeTabsProgressListener(listeners.progressListener);
      } catch {}
    }
    this._windowListeners.delete(win);
  },

  uninit() {
    if (!this._initialized) {
      return;
    }

    this._initialized = false;
    this._enabled = false;
    try {
      Services.prefs.removeObserver(PREF_AUTOHIDE, this);
    } catch {}
    try {
      Services.obs.removeObserver(this, 'browser-delayed-startup-finished');
      Services.obs.removeObserver(this, 'domwindowclosed');
    } catch {}

    for (const win of Services.wm.getEnumerator('navigator:browser')) {
      this._detachFromWindow(win);
    }
  },
};
