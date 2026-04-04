/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * MidoriTor — Embedded Tor proxy integration for private browsing.
 *
 * Manages a bundled Tor process that provides SOCKS5 proxy connectivity.
 * When a user opens a "Tor Window" (private + Tor proxy), this module:
 *   1. Starts the embedded tor binary (if not already running)
 *   2. Waits for bootstrap completion (circuit establishment)
 *   3. Configures the Tor window's proxy settings via SOCKS5
 *   4. Applies network hardening (disable WebRTC, geolocation, etc.)
 *   5. Provides status updates and "New Identity" (new circuit) support
 *
 * The tor binary is expected at:
 *   - Linux:   <app>/tor/tor
 *   - macOS:   <app>/tor/tor
 *   - Windows: <app>/tor/tor.exe
 *
 * Preferences:
 *   - midori.tor.enabled          (bool)   — master switch
 *   - midori.tor.socks_port       (int)    — SOCKS5 port (default 9150)
 *   - midori.tor.bridges.enabled  (bool)   — use Tor bridges
 *   - midori.tor.bridges.list     (string) — bridge lines, newline-separated
 *
 * @patch Midori Browser
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: 'resource:///modules/BrowserWindowTracker.sys.mjs',
  MidoriTorLifecycle: 'resource:///modules/MidoriTorLifecycle.sys.mjs',
  PrivateBrowsingUtils: 'resource://gre/modules/PrivateBrowsingUtils.sys.mjs',
});

const PREF_ENABLED = 'midori.tor.enabled';
const PREF_SOCKS_PORT = 'midori.tor.socks_port';
const PREF_BRIDGES_ENABLED = 'midori.tor.bridges.enabled';
const PREF_BRIDGES_LIST = 'midori.tor.bridges.list';
const PREF_PREWARM_ENABLED = 'midori.tor.prewarm.enabled';
const PREF_PREWARM_IDLE_TIMEOUT_MS = 'midori.tor.prewarm.idle_timeout_ms';
const PREF_BOOTSTRAP_TIMEOUT_MS = 'midori.tor.bootstrap_timeout_ms';
const PREF_STOP_AFTER_LAST_WINDOW_MS = 'midori.tor.stop_after_last_window_ms';

const TOR_SOCKS_HOST = '127.0.0.1';
const TOR_DEFAULT_PORT = 9150;
const TOR_CONTROL_PORT = 9151;
const BOOTSTRAP_TIMEOUT_MS = 120000; // 2 minutes max bootstrap time
const BOOTSTRAP_POLL_MS = 500;

// Tor process states
const STATE_DISCONNECTED = 'disconnected';
const STATE_STARTING = 'starting';
const STATE_BOOTSTRAPPING = 'bootstrapping';
const STATE_CONNECTED = 'connected';
const STATE_ERROR = 'error';
const STATE_STOPPING = 'stopping';

const STYLE_SHEET_ID = 'midori-tor-indicator-style';
const LOG_PREFIX = 'MidoriTor';

function log(...args) {
  console.log(`[${LOG_PREFIX}]`, ...args);
}
function warn(...args) {
  console.warn(`[${LOG_PREFIX}]`, ...args);
}
function error(...args) {
  console.error(`[${LOG_PREFIX}]`, ...args);
}

export const MidoriTor = {
  _state: STATE_DISCONNECTED,
  _process: null,
  _bootstrapProgress: 0,
  _torWindows: new Set(),
  _controlPassword: null,
  _observers: [],
  _initialized: false,
  _torBinaryAvailable: false,
  _startPromise: null,
  _stopAfterLastWindowTimer: null,
  _prewarmIdleScheduled: false,

  // Circuit info (Fase 7 — UI status panel)
  _exitNodeIP: null,
  _exitNodeCountry: null,
  _circuitPath: [],       // Array of relay fingerprints/names
  _circuitInfoTimer: null, // Periodic refresh timer
  _processFailed: false,  // Set true when tor process exits unexpectedly
  _bootstrapSummary: '',
  _bootstrapTag: '',
  _lastControlError: '',
  _lastControlResponseAt: 0,
  _lastNewIdentityAt: 0,
  _lastNewIdentityExit: '',

  /**
   * Initialize the Tor module. Lazy-called when Tor entry points are used.
   */
  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    log('Initializing MidoriTor module...');

    // Generate a random control password for this session
    this._controlPassword = this._generatePassword(32);

    // Check if Tor binary exists
    const torBin = this._getTorBinaryPath();
    this._torBinaryAvailable = !!(torBin && torBin.exists());
    if (this._torBinaryAvailable) {
      log('Tor binary found at:', torBin.path);
    } else {
      warn(
        'Tor binary NOT found. Tor windows will open as private windows without proxy.',
        'Expected at:',
        torBin ? torBin.path : '(unknown)'
      );
    }

    // Watch for window open/close to inject Tor indicator CSS
    Services.obs.addObserver(this, 'browser-delayed-startup-finished');
    Services.obs.addObserver(this, 'domwindowclosed');
      // Kill Tor process when the browser exits so ports don't stay occupied
      Services.obs.addObserver(this, 'quit-application');
      Services.obs.addObserver(this, 'quit-application-granted');
      this._schedulePrewarmOnIdle();
      log('MidoriTor initialized successfully. Tor binary available:', this._torBinaryAvailable);
  },

  /**
   * Get current Tor state.
   * @returns {string} One of: disconnected, starting, bootstrapping, connected, error, stopping
   */
  get state() {
    return this._state;
  },

  /**
   * Get bootstrap progress percentage.
   * @returns {number} 0–100
   */
  get bootstrapProgress() {
    return this._bootstrapProgress;
  },

  /**
   * Check if Tor is ready for connections.
   * @returns {boolean}
   */
  get isConnected() {
    return this._state === STATE_CONNECTED;
  },

  /**
   * Number of active Tor windows.
   * @returns {number}
   */
  get activeWindowCount() {
    return this._torWindows.size;
  },

  // ===========================================================================
  // Process Management
  // ===========================================================================

  /**
   * Start the Tor process if not already running.
   * @returns {Promise<boolean>} true if Tor started/is running successfully
   */
  async start() {
    if (!this._initialized) {
      this.init();
    }

    if (!Services.prefs.getBoolPref(PREF_ENABLED, true)) {
      log('Tor is disabled by preference, skipping start()');
      return false;
    }

    log('start() called, current state:', this._state);

    if (this._state === STATE_CONNECTED) {
      return true;
    }

    if (this._startPromise) {
      log('Tor startup already in progress, reusing in-flight promise');
      return this._startPromise;
    }

    this._startPromise = this._startInternal();
    try {
      return await this._startPromise;
    } finally {
      this._startPromise = null;
    }
  },

  /**
   * Internal Tor startup path. Use start() to get concurrency guard semantics.
   * @returns {Promise<boolean>}
   */
  async _startInternal() {
    if (this._state === STATE_BOOTSTRAPPING || this._state === STATE_STARTING) {
      return false;
    }

    this._setState(STATE_STARTING);
    this._bootstrapProgress = 0;
    this._bootstrapSummary = '';
    this._bootstrapTag = '';
    this._lastControlError = '';
    this._trace('start-begin', { state: this._state });

    try {
      const torBinary = this._getTorBinaryPath();
      if (!torBinary || !torBinary.exists()) {
        error('Tor binary not found at:', torBinary ? torBinary.path : '(null)');
        this._setState(STATE_ERROR);
        return false;
      }
      log('Starting Tor binary:', torBinary.path);

      const torDir = torBinary.parent.path;

      // Write torrc configuration
      const torrcFile = this._writeTorrc();

        // Evict any stale Tor process that may be holding our ports from a
        // previous browser session that didn't shut down cleanly.
        this._trace('evict-begin', { controlPort: TOR_CONTROL_PORT });
        await this._evictTorOnPorts();
        this._trace('evict-end', { controlPort: TOR_CONTROL_PORT });

      // Build platform launcher details that isolate library lookup for Tor.
      const launchInfo = this._buildTorLaunchInfo({
        torBinaryPath: torBinary.path,
        torDir,
        torrcPath: torrcFile.path,
      });
      log('Tor launch prepared', {
        os: Services.appinfo.OS,
        program: launchInfo.programFile.path,
        args: launchInfo.args,
        torrc: torrcFile.path,
      });

      const process = Cc['@mozilla.org/process/util;1'].createInstance(Ci.nsIProcess);
      process.init(launchInfo.programFile);

      const args = launchInfo.args;
      this._processFailed = false;
      process.runAsync(args, args.length, {
        observe: (_subject, topic) => {
          if (topic === 'process-finished' || topic === 'process-failed') {
            // Signal _waitForBootstrap to abort immediately
            this._processFailed = true;
            this._trace('process-exit', {
              topic,
              state: this._state,
            });
            if (this._state !== STATE_STOPPING) {
              console.warn('MidoriTor: Tor process exited unexpectedly, topic:', topic);
              this._setState(STATE_DISCONNECTED);
              this._process = null;
            }
          }
        },
      });

      this._process = process;
      const bootstrapTimeoutMs = this._getBootstrapTimeoutMs();
      this._setState(STATE_BOOTSTRAPPING);
      this._trace('bootstrap-enter', { timeoutMs: bootstrapTimeoutMs, pollMs: BOOTSTRAP_POLL_MS });

      // Give Tor time to create control_auth_cookie before attempting connection.
      // Tor needs to initialize its data directory, create the cookie, and start the control port.
      // This initial grace period prevents early connection attempts from failing.
      this._trace('bootstrap-grace-begin', { waitMs: 400 });
      await this._sleep(400);
      this._trace('bootstrap-grace-end', { waitMs: 400 });

      // Quick probe to validate control port before regular bootstrap polling.
      await this._probeControlPort();

      // Wait for bootstrap to complete
      const bootstrapped = await this._waitForBootstrap(bootstrapTimeoutMs);
      if (bootstrapped) {
        this._setState(STATE_CONNECTED);
        this._trace('bootstrap-complete', {
          progress: this._bootstrapProgress,
          summary: this._bootstrapSummary,
          tag: this._bootstrapTag,
        });
        this._reconcileWindowsAfterConnect();
        this._notifyWindows();
        // Start circuit info polling (Fase 7)
        this._startCircuitInfoPolling();
        return true;
      }

      console.error('MidoriTor: Bootstrap timed out');
      this._trace('bootstrap-timeout', {
        timeoutMs: bootstrapTimeoutMs,
        lastProgress: this._bootstrapProgress,
        lastSummary: this._bootstrapSummary,
        lastControlError: this._lastControlError,
      });
      this.stop();
      this._setState(STATE_ERROR);
      return false;
    } catch (e) {
      console.error('MidoriTor: Failed to start Tor process', e);
      this._trace('start-failed', { message: String(e) });
      this._setState(STATE_ERROR);
      return false;
    }
  },

  /**
   * Stop the Tor process.
   */
  stop() {
    this._cancelStopAfterLastWindowTimer();

    // Stop circuit info polling
    this._stopCircuitInfoPolling();
    this._exitNodeIP = null;
    this._exitNodeCountry = null;
    this._circuitPath = [];

    if (!this._process) {
      this._setState(STATE_DISCONNECTED);
      return;
    }

    this._setState(STATE_STOPPING);
    try {
      this._process.kill();
    } catch (e) {
      // Process may already be dead
    }
    this._process = null;
    this._bootstrapProgress = 0;
    this._setState(STATE_DISCONNECTED);
  },

  /**
   * Request a new Tor circuit (New Identity).
   *
   * Performs a full identity reset:
   *   1. Sends SIGNAL NEWNYM to Tor (new circuit)
   *   2. Clears all cookies
   *   3. Clears HTTP cache (disk + memory)
   *   4. Clears localStorage/sessionStorage on every Tor tab
   *   5. Reloads all tabs in Tor windows
   *   6. Fetches updated circuit info (exit node country)
   *   7. Shows a transient notification to the user
   *
   * @returns {Promise<boolean>} true if NEWNYM succeeded
   */
  async newCircuit() {
    if (this._state !== STATE_CONNECTED) {
      return false;
    }

    try {
      // 1. Request new circuit from Tor
      const result = await this._sendControlCommand('SIGNAL NEWNYM');
      if (!result) {
        return false;
      }
      log('SIGNAL NEWNYM sent successfully');

      // 2. Clear all cookies
      try {
        Services.cookies.removeAll();
        log('All cookies cleared');
      } catch (e) {
        warn('Failed to clear cookies:', e);
      }

      // 3. Clear HTTP cache (disk + memory)
      try {
        Services.cache2.clear();
        log('HTTP cache cleared');
      } catch (e) {
        warn('Failed to clear cache:', e);
      }

      // 4. Clear storage + reload tabs in Tor windows
      for (const win of this._torWindows) {
        if (win.closed) {
          continue;
        }
        this._clearWindowStorageAndReload(win);
      }

      // 5. Refresh circuit info for updated exit node
      await this._fetchCircuitInfo();

      this._lastNewIdentityAt = Date.now();
      this._lastNewIdentityExit = this._exitNodeCountry
        ? `${this._getCountryName(this._exitNodeCountry)}${this._exitNodeIP ? ` (${this._exitNodeIP})` : ''}`
        : 'Exit node pending';
      this._trace('new-identity', {
        at: this._lastNewIdentityAt,
        exit: this._lastNewIdentityExit,
      });

      // 6. Show transient notification in all Tor windows
      this._showNewIdentityNotification();

      return true;
    } catch (e) {
      error('Failed to request new circuit:', e);
      return false;
    }
  },

  /**
   * Clear sessionStorage/localStorage for every tab in a Tor window
   * and reload all tabs.
   * @param {Window} win
   */
  _clearWindowStorageAndReload(win) {
    const gBrowser = win.gBrowser;
    if (!gBrowser) {
      return;
    }

    for (const tab of gBrowser.tabs) {
      const browser = gBrowser.getBrowserForTab(tab);
      if (!browser) {
        continue;
      }

      // Clear storage via content actor message
      try {
        browser.browsingContext?.currentWindowGlobal
          ?.domProcess?.getActor?.('MidoriTor');
      } catch (_) {
        // Actor not available, use direct approach
      }

      // Clear storage using the browsingContext
      try {
        const uri = browser.currentURI;
        if (uri && (uri.scheme === 'http' || uri.scheme === 'https')) {
          // Clear site data for this origin
          const principal = browser.contentPrincipal;
          if (principal && !principal.isNullPrincipal) {
            try {
              Services.clearData.deleteDataFromPrincipal(
                principal,
                false, // not only private browsing
                Ci.nsIClearDataService.CLEAR_DOM_STORAGES |
                Ci.nsIClearDataService.CLEAR_AUTH_TOKENS |
                Ci.nsIClearDataService.CLEAR_AUTH_CACHE,
                () => {}
              );
            } catch (e) {
              // Some principals may not support this
            }
          }
        }
      } catch (e) {
        warn('Failed to clear storage for tab:', e);
      }

      // Reload the tab
      try {
        browser.reload();
      } catch (e) {
        warn('Failed to reload tab:', e);
      }
    }
    log('Storage cleared and tabs reloaded in Tor window');
  },

  /**
   * Show a transient "New Identity" notification in all Tor windows.
   * The notification auto-dismisses after 4 seconds.
   */
  _showNewIdentityNotification() {
    const exitCountry = this._exitNodeCountry || '??';
    const exitIP = this._exitNodeIP || '';
    const countryLabel = exitIP
      ? `${this._getCountryName(exitCountry)} (${exitIP})`
      : this._getCountryName(exitCountry);

    for (const win of this._torWindows) {
      if (win.closed) {
        continue;
      }

      try {
        const doc = win.document;

        // Remove any existing notification
        const existing = doc.getElementById('midori-tor-newid-notification');
        if (existing) {
          existing.remove();
        }

        // Create toast notification
        const toast = doc.createElement('div');
        toast.id = 'midori-tor-newid-notification';
        toast.innerHTML = `
          <div class="midori-tor-toast-icon">🧅</div>
          <div class="midori-tor-toast-body">
            <div class="midori-tor-toast-title">New Identity Active</div>
            <div class="midori-tor-toast-detail">
              Circuit renewed · Exit: ${countryLabel}
            </div>
          </div>
        `;

        // Append toast to #browser content area where position:fixed works
        const browserArea = doc.getElementById('browser') || doc.documentElement;
        browserArea.appendChild(toast);

        // Animate in
        win.requestAnimationFrame(() => {
          toast.classList.add('midori-tor-toast-show');
        });

        // Auto-dismiss after 4 seconds
        const timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        timer.initWithCallback(
          () => {
            toast.classList.remove('midori-tor-toast-show');
            toast.classList.add('midori-tor-toast-hide');
            const removeTimer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
            removeTimer.initWithCallback(
              () => { try { toast.remove(); } catch (_) {} },
              400,
              Ci.nsITimer.TYPE_ONE_SHOT
            );
          },
          4000,
          Ci.nsITimer.TYPE_ONE_SHOT
        );
      } catch (e) {
        warn('Failed to show New Identity notification:', e);
      }
    }
  },

  // ===========================================================================
  // Tor Window Management
  // ===========================================================================

  /**
   * Open a new Tor window (private window + Tor proxy).
   * This is the main entry point called from the menu/shortcut.
   * If the Tor binary is not available, opens a private window with
   * visual indicators but without the Tor proxy.
   * @param {Window} openerWindow - The window that triggered the action
   * @returns {Promise<Window>}
   */
  async openTorWindow(openerWindow) {
    if (!this._initialized) {
      this.init();
    }

    log('openTorWindow called');

    // Open a private window using promiseOpenWindow which waits for
    // browser-delayed-startup-finished — guarantees nav-bar, mainPopupSet
    // and all chrome UI are fully ready before we configure
    log('Opening new private window...');
    let win;
    try {
      win = await lazy.BrowserWindowTracker.promiseOpenWindow({
        private: true,
        openerWindow,
      });
    } catch (e) {
      error('Failed to open private window:', e);
      return null;
    }

    if (!win) {
      error('promiseOpenWindow returned null');
      return null;
    }

    // Mark this window as a Tor window
    this._torWindows.add(win);
    this._cancelStopAfterLastWindowTimer();
    log('Tor window opened and ready, total Tor windows:', this._torWindows.size);

    try {
      this._configureTorWindow(win);
    } catch (e) {
      error('Failed to configure Tor window:', e);
    }

    const torEnabled = Services.prefs.getBoolPref(PREF_ENABLED, true);

    // Start Tor in the background after the window is open.
    if (!torEnabled) {
      log('Tor is disabled by preference, opened private window fallback');
      this._showTorError(win);
    } else if (
      lazy.MidoriTorLifecycle.shouldAttemptOnDemandStart({
        torEnabled,
        torBinaryAvailable: this._torBinaryAvailable,
        isConnected: this.isConnected,
      })
    ) {
      log('Tor binary available, starting in background...');
      this.start().then((started) => {
        if (!started) {
          warn('Tor failed to start, Tor window remains in non-anonymous fallback mode');
          this._showTorError(win);
        }
      }).catch((e) => {
        error('Background Tor startup failed:', e);
        this._showTorError(win);
      });
    } else if (!this._torBinaryAvailable) {
      log('Tor binary not available, opened private window with Tor indicators only');
      this._showTorError(win);
    } else if (!this._circuitInfoTimer && this.isConnected) {
      // Resume periodic circuit refresh when a Tor window is opened again.
      this._startCircuitInfoPolling();
    }

    return win;
  },

  /**
   * When Tor connects after fallback windows already opened, apply proxy
   * settings so those windows become fully Tor-routed without reopening.
   */
  _reconcileWindowsAfterConnect() {
    if (!this.isConnected || this._torWindows.size === 0) {
      return;
    }

    const port = Services.prefs.getIntPref(PREF_SOCKS_PORT, TOR_DEFAULT_PORT);
    this._setWindowProxyPrefs(null, port);
    log('Reconciled existing Tor windows with active proxy settings');
  },

  /**
   * Configure a window for Tor browsing.
   * Sets proxy prefs and applies hardening.
   * @param {Window} win
   */
  _configureTorWindow(win) {
    log('Configuring Tor window...');

    // Mark the window as a Tor window via attribute
    win.document.documentElement.setAttribute('midori-tor-window', 'true');

    // Only apply proxy settings if Tor is actually connected
    if (this.isConnected) {
      const port = Services.prefs.getIntPref(PREF_SOCKS_PORT, TOR_DEFAULT_PORT);
      this._setWindowProxyPrefs(win, port);
      log('Proxy settings applied (SOCKS5 port:', port, ')');
    } else {
      log('Tor not connected — skipping proxy configuration');
    }

    // Always apply network hardening for Tor windows
    this._applyTorHardening();

    // Inject Tor indicator CSS
    this._injectTorIndicator(win);
    log('Tor indicator injected');

    // Handle window close. Keep this idempotent because domwindowclosed
    // observer may also run for the same window.
    win.addEventListener('unload', () => this._handleTorWindowClosed(win, 'unload'));
  },

  /**
   * Cancel pending delayed stop timer.
   */
  _cancelStopAfterLastWindowTimer() {
    if (this._stopAfterLastWindowTimer) {
      try {
        this._stopAfterLastWindowTimer.cancel();
      } catch (e) {
        // timer already canceled
      }
      this._stopAfterLastWindowTimer = null;
    }
  },

  /**
   * Schedule a delayed stop when no Tor windows remain.
   */
  _scheduleStopAfterLastWindow() {
    this._cancelStopAfterLastWindowTimer();
    if (
      !lazy.MidoriTorLifecycle.shouldScheduleStopAfterLastWindow({
        remainingWindows: this._torWindows.size,
        hasProcess: !!this._process,
      })
    ) {
      return;
    }

    const stopDelayMs = this._getStopAfterLastWindowMs();

    this._stopAfterLastWindowTimer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
    this._stopAfterLastWindowTimer.initWithCallback(
      () => {
        this._stopAfterLastWindowTimer = null;
        if (this._torWindows.size === 0) {
          log('No Tor windows after grace period, stopping Tor');
          this.stop();
        }
      },
      stopDelayMs,
      Ci.nsITimer.TYPE_ONE_SHOT
    );
  },

  /**
   * Handle Tor window close exactly once.
   * @param {Window} win
   * @param {string} source
   */
  _handleTorWindowClosed(win, source = 'unknown') {
    if (!win || !this._torWindows.has(win)) {
      return;
    }

    this._torWindows.delete(win);
    log('Tor window closing via', source, 'remaining:', this._torWindows.size);

    if (lazy.MidoriTorLifecycle.shouldCleanupAfterWindowClose(this._torWindows.size)) {
      log('Last Tor window closed, scheduling cleanup...');
      this._stopCircuitInfoPolling();
      this._restoreProxyPrefs();
      this._scheduleStopAfterLastWindow();
    }
  },

  /**
   * Set proxy preferences for Tor browsing.
   * Since Firefox doesn't support per-window proxy easily, we use a
   * global proxy approach when Tor windows are active. The proxy is
   * configured via the standard network.proxy.* prefs.
   *
   * @param {Window} win
   * @param {number} port
   */
  _setWindowProxyPrefs(win, port) {
    // Store original proxy settings to restore later
    if (!this._originalProxyPrefs) {
      this._originalProxyPrefs = {
        type: Services.prefs.getIntPref('network.proxy.type', 0),
        socks: Services.prefs.getCharPref('network.proxy.socks', ''),
        socks_port: Services.prefs.getIntPref('network.proxy.socks_port', 0),
        socks_remote_dns: Services.prefs.getBoolPref('network.proxy.socks_remote_dns', false),
        socks_version: Services.prefs.getIntPref('network.proxy.socks_version', 5),
      };
    }

    // Configure SOCKS5 proxy pointing to our Tor instance
    Services.prefs.setIntPref('network.proxy.type', 1); // Manual proxy
    Services.prefs.setCharPref('network.proxy.socks', TOR_SOCKS_HOST);
    Services.prefs.setIntPref('network.proxy.socks_port', port);
    Services.prefs.setBoolPref('network.proxy.socks_remote_dns', true);
    Services.prefs.setIntPref('network.proxy.socks_version', 5);
    // Don't use proxy for localhost
    Services.prefs.setCharPref('network.proxy.no_proxies_on', 'localhost, 127.0.0.1');
  },

  /**
   * Restore original proxy settings when no Tor windows remain.
   */
  _restoreProxyPrefs() {
    if (!this._originalProxyPrefs) {
      return;
    }

    Services.prefs.setIntPref('network.proxy.type', this._originalProxyPrefs.type);
    Services.prefs.setCharPref('network.proxy.socks', this._originalProxyPrefs.socks);
    Services.prefs.setIntPref('network.proxy.socks_port', this._originalProxyPrefs.socks_port);
    Services.prefs.setBoolPref(
      'network.proxy.socks_remote_dns',
      this._originalProxyPrefs.socks_remote_dns
    );
    Services.prefs.setIntPref(
      'network.proxy.socks_version',
      this._originalProxyPrefs.socks_version
    );

    // Restore hardened prefs
    this._removeTorHardening();

    this._originalProxyPrefs = null;
  },

  /**
   * Apply Tor Browser-level anti-fingerprinting and network hardening.
   *
   * This enables privacy.resistFingerprinting (RFP) and a comprehensive set
   * of prefs that reduce the digital fingerprint surface to match Tor Browser's
   * protection level. All original values are stored for restoration when the
   * last Tor window is closed.
   *
   * Categories covered:
   *   - Resist Fingerprinting (RFP) + letterboxing
   *   - Canvas / WebGL protection
   *   - Font enumeration protection
   *   - Timezone / Locale spoofing
   *   - Performance timing APIs
   *   - Dangerous device APIs (battery, gamepad, sensors, VR)
   *   - Cache / Storage isolation
   *   - Network hardening (referer, WebSocket, Alt-Svc, IPv6)
   *   - Prefetch / Speculative connections
   */
  _applyTorHardening() {
    if (this._originalHardeningPrefs) {
      // Already applied — avoid overwriting stored originals
      return;
    }

    // ── Store original values for every pref we modify ──
    // Helper: safely read a pref with fallback
    const gBool = (k, d) => { try { return Services.prefs.getBoolPref(k, d); } catch { return d; } };
    const gInt  = (k, d) => { try { return Services.prefs.getIntPref(k, d);  } catch { return d; } };
    const gStr  = (k, d) => { try { return Services.prefs.getCharPref(k, d); } catch { return d; } };

    this._originalHardeningPrefs = {
      // RFP
      rfp:                    gBool('privacy.resistFingerprinting', false),
      rfp_letterboxing:       gBool('privacy.resistFingerprinting.letterboxing', false),
      rfp_block_addon_mgr:    gBool('privacy.resistFingerprinting.block_mozAddonManager', false),
      // Canvas / WebGL
      webgl_disabled:         gBool('webgl.disabled', false),
      rfp_canvas_prompt:      gBool('privacy.resistFingerprinting.autoDeclineNoUserInputCanvasPrompts', false),
      // Font enumeration
      use_doc_fonts:          gInt('browser.display.use_document_fonts', 1),
      // Timezone / Locale
      use_us_english:         gBool('javascript.use_us_english_locale', false),
      accept_languages:       gStr('intl.accept_languages', ''),
      spoof_english:          gInt('privacy.spoof_english', 0),
      // Performance timing
      enable_performance:     gBool('dom.enable_performance', true),
      enable_resource_timing: gBool('dom.enable_resource_timing', true),
      // Dangerous device APIs
      battery:                gBool('dom.battery.enabled', true),
      gamepad:                gBool('dom.gamepad.enabled', true),
      vr:                     gBool('dom.vr.enabled', true),
      sensors:                gBool('device.sensors.enabled', true),
      netinfo:                gBool('dom.netinfo.enabled', false),
      webaudio:               gBool('dom.webaudio.enabled', true),
      // Original hardening (network basics)
      webrtc:                 gBool('media.peerconnection.enabled', true),
      geolocation:            gBool('geo.enabled', true),
      prefetch:               gBool('network.prefetch-next', true),
      speculative:            gInt('network.http.speculative-parallel-limit', 6),
      predictor:              gBool('network.predictor.enabled', true),
      dns_prefetch:           gBool('network.dns.disablePrefetch', false),
      // Cache / Storage isolation
      partition_storage:      gBool('privacy.partition.always_partition_third_party_non_cookie_storage', true),
      partition_ss_exempt:    gBool('privacy.partition.always_partition_third_party_non_cookie_storage.exempt_sessionstorage', true),
      memory_cache:           gBool('browser.cache.memory.enable', true),
      // Network hardening
      referer_xorigin:        gInt('network.http.referer.XOrigin', 0),
      referer_trimming:       gInt('network.http.referer.trimmingPolicy', 0),
      referer_send:           gInt('network.http.sendRefererHeader', 2),
      websocket:              gBool('network.websocket.enabled', true),
      altsvc:                 gBool('network.http.altsvc.enabled', true),
      altsvc_oe:              gBool('network.http.altsvc.oe', true),
      ssl_session_ids:        gBool('security.ssl.disable_session_identifiers', false),
      cookie_behavior:        gInt('network.cookie.cookieBehavior', 0),
      dns_ipv6:               gBool('network.dns.disableIPv6', false),
      proxy_failover:         gBool('network.proxy.failover_direct', true),
    };

    log('Applying Tor Browser-level anti-fingerprinting hardening...');

    // ── RFP (Resist Fingerprinting) ──
    Services.prefs.setBoolPref('privacy.resistFingerprinting', true);
    Services.prefs.setBoolPref('privacy.resistFingerprinting.letterboxing', true);
    Services.prefs.setBoolPref('privacy.resistFingerprinting.block_mozAddonManager', true);

    // ── Canvas / WebGL ──
    Services.prefs.setBoolPref('webgl.disabled', true);
    Services.prefs.setBoolPref('privacy.resistFingerprinting.autoDeclineNoUserInputCanvasPrompts', true);

    // ── Font enumeration ──
    Services.prefs.setIntPref('browser.display.use_document_fonts', 0);

    // ── Timezone / Locale spoofing (RFP covers most, but reinforce) ──
    Services.prefs.setBoolPref('javascript.use_us_english_locale', true);
    Services.prefs.setCharPref('intl.accept_languages', 'en-US, en');
    Services.prefs.setIntPref('privacy.spoof_english', 2);

    // ── Performance timing ──
    Services.prefs.setBoolPref('dom.enable_performance', false);
    Services.prefs.setBoolPref('dom.enable_resource_timing', false);

    // ── Dangerous device APIs ──
    Services.prefs.setBoolPref('dom.battery.enabled', false);
    Services.prefs.setBoolPref('dom.gamepad.enabled', false);
    Services.prefs.setBoolPref('dom.vr.enabled', false);
    Services.prefs.setBoolPref('device.sensors.enabled', false);
    Services.prefs.setBoolPref('dom.netinfo.enabled', false);
    Services.prefs.setBoolPref('dom.webaudio.enabled', false);

    // ── Network basics (original hardening, now with correct types) ──
    Services.prefs.setBoolPref('media.peerconnection.enabled', false);
    Services.prefs.setBoolPref('geo.enabled', false);
    Services.prefs.setBoolPref('network.prefetch-next', false);
    Services.prefs.setIntPref('network.http.speculative-parallel-limit', 0);
    Services.prefs.setBoolPref('network.predictor.enabled', false);
    Services.prefs.setBoolPref('network.dns.disablePrefetch', true);

    // ── Cache / Storage isolation ──
    Services.prefs.setBoolPref('privacy.partition.always_partition_third_party_non_cookie_storage', true);
    Services.prefs.setBoolPref('privacy.partition.always_partition_third_party_non_cookie_storage.exempt_sessionstorage', false);
    Services.prefs.setBoolPref('browser.cache.memory.enable', false);

    // ── Network hardening ──
    Services.prefs.setIntPref('network.http.referer.XOrigin', 2);
    Services.prefs.setIntPref('network.http.referer.trimmingPolicy', 2);
    Services.prefs.setIntPref('network.http.sendRefererHeader', 0);
    Services.prefs.setBoolPref('network.websocket.enabled', false);
    Services.prefs.setBoolPref('network.http.altsvc.enabled', false);
    Services.prefs.setBoolPref('network.http.altsvc.oe', false);
    Services.prefs.setBoolPref('security.ssl.disable_session_identifiers', true);
    Services.prefs.setIntPref('network.cookie.cookieBehavior', 2);
    Services.prefs.setBoolPref('network.dns.disableIPv6', true);
    Services.prefs.setBoolPref('network.proxy.failover_direct', false);

    log('Tor hardening applied: RFP + letterboxing + WebGL off + font protection + locale spoofing + device API off + network isolation');
  },

  /**
   * Remove Tor hardening, restoring all prefs to their original values.
   */
  _removeTorHardening() {
    if (!this._originalHardeningPrefs) {
      return;
    }
    const o = this._originalHardeningPrefs;

    log('Removing Tor hardening, restoring original prefs...');

    // RFP
    Services.prefs.setBoolPref('privacy.resistFingerprinting', o.rfp);
    Services.prefs.setBoolPref('privacy.resistFingerprinting.letterboxing', o.rfp_letterboxing);
    Services.prefs.setBoolPref('privacy.resistFingerprinting.block_mozAddonManager', o.rfp_block_addon_mgr);
    // Canvas / WebGL
    Services.prefs.setBoolPref('webgl.disabled', o.webgl_disabled);
    Services.prefs.setBoolPref('privacy.resistFingerprinting.autoDeclineNoUserInputCanvasPrompts', o.rfp_canvas_prompt);
    // Font enumeration
    Services.prefs.setIntPref('browser.display.use_document_fonts', o.use_doc_fonts);
    // Timezone / Locale
    Services.prefs.setBoolPref('javascript.use_us_english_locale', o.use_us_english);
    Services.prefs.setCharPref('intl.accept_languages', o.accept_languages);
    Services.prefs.setIntPref('privacy.spoof_english', o.spoof_english);
    // Performance timing
    Services.prefs.setBoolPref('dom.enable_performance', o.enable_performance);
    Services.prefs.setBoolPref('dom.enable_resource_timing', o.enable_resource_timing);
    // Dangerous device APIs
    Services.prefs.setBoolPref('dom.battery.enabled', o.battery);
    Services.prefs.setBoolPref('dom.gamepad.enabled', o.gamepad);
    Services.prefs.setBoolPref('dom.vr.enabled', o.vr);
    Services.prefs.setBoolPref('device.sensors.enabled', o.sensors);
    Services.prefs.setBoolPref('dom.netinfo.enabled', o.netinfo);
    Services.prefs.setBoolPref('dom.webaudio.enabled', o.webaudio);
    // Network basics
    Services.prefs.setBoolPref('media.peerconnection.enabled', o.webrtc);
    Services.prefs.setBoolPref('geo.enabled', o.geolocation);
    Services.prefs.setBoolPref('network.prefetch-next', o.prefetch);
    Services.prefs.setIntPref('network.http.speculative-parallel-limit', o.speculative);
    Services.prefs.setBoolPref('network.predictor.enabled', o.predictor);
    Services.prefs.setBoolPref('network.dns.disablePrefetch', o.dns_prefetch);
    // Cache / Storage isolation
    Services.prefs.setBoolPref('privacy.partition.always_partition_third_party_non_cookie_storage', o.partition_storage);
    Services.prefs.setBoolPref('privacy.partition.always_partition_third_party_non_cookie_storage.exempt_sessionstorage', o.partition_ss_exempt);
    Services.prefs.setBoolPref('browser.cache.memory.enable', o.memory_cache);
    // Network hardening
    Services.prefs.setIntPref('network.http.referer.XOrigin', o.referer_xorigin);
    Services.prefs.setIntPref('network.http.referer.trimmingPolicy', o.referer_trimming);
    Services.prefs.setIntPref('network.http.sendRefererHeader', o.referer_send);
    Services.prefs.setBoolPref('network.websocket.enabled', o.websocket);
    Services.prefs.setBoolPref('network.http.altsvc.enabled', o.altsvc);
    Services.prefs.setBoolPref('network.http.altsvc.oe', o.altsvc_oe);
    Services.prefs.setBoolPref('security.ssl.disable_session_identifiers', o.ssl_session_ids);
    Services.prefs.setIntPref('network.cookie.cookieBehavior', o.cookie_behavior);
    Services.prefs.setBoolPref('network.dns.disableIPv6', o.dns_ipv6);
    Services.prefs.setBoolPref('network.proxy.failover_direct', o.proxy_failover);

    this._originalHardeningPrefs = null;
    log('Tor hardening removed, original prefs restored');
  },

  // ===========================================================================
  // Tor UI Indicator
  // ===========================================================================

  /**
   * Inject Tor indicator CSS, badge, and status panel into a Tor window.
   *
   * The badge shows the Tor connection state and exit node country flag.
   * Clicking the badge toggles a status panel with:
   *   - Connection state indicator
   *   - Exit node country + IP
   *   - Circuit path (Guard → Middle → Exit)
   *   - Bootstrap progress bar (during connection)
   *   - "New Identity" button
   *
   * @param {Window} win
   */
  _injectTorIndicator(win) {
    const doc = win.document;
    if (doc.getElementById(STYLE_SHEET_ID)) {
      return;
    }

    const style = doc.createElement('style');
    style.id = STYLE_SHEET_ID;
    style.textContent = this._buildIndicatorCSS();
    // XUL documents don't have doc.head — append to documentElement like other Midori modules
    doc.documentElement.appendChild(style);

    // Add Tor badge to the navbar
    const navbar = doc.getElementById('nav-bar');
    if (!navbar) {
      return;
    }

    const badge = doc.createXULElement('toolbarbutton');
    badge.id = 'midori-tor-badge';
    badge.setAttribute('label', 'Tor');
    badge.setAttribute('tooltiptext', 'Tor Network — Click to view status');
    badge.classList.add('toolbarbutton-1', 'chromeclass-toolbar-additional');

    // Create a native XUL <panel> — this is how Firefox renders all popups
    // correctly above the URL bar and all other chrome UI
    const panel = doc.createXULElement('panel');
    panel.id = 'midori-tor-status-panel';
    panel.setAttribute('type', 'arrow');
    panel.setAttribute('role', 'group');
    panel.setAttribute('noautofocus', 'true');

    // HTML content inside the XUL panel via an HTML container
    const container = doc.createElement('div');
    container.id = 'midori-tor-panel-content';
    container.innerHTML = `
      <div class="midori-tor-panel-header">
        <span class="midori-tor-panel-title">Tor Network</span>
      </div>
      <div class="midori-tor-panel-state"></div>
      <div class="midori-tor-panel-bootstrap-detail" style="display:none"></div>
      <div class="midori-tor-panel-progress" style="display:none">
        <div class="midori-tor-panel-progress-track">
          <div class="midori-tor-panel-progress-bar"></div>
        </div>
      </div>
      <div class="midori-tor-panel-section">
        <div class="midori-tor-panel-label">Exit Node</div>
        <div class="midori-tor-panel-exit">\u2014</div>
      </div>
      <div class="midori-tor-panel-section">
        <div class="midori-tor-panel-label">Circuit</div>
        <div class="midori-tor-panel-path" style="display:none"></div>
      </div>
      <div class="midori-tor-panel-section">
        <div class="midori-tor-panel-label">Diagnostics</div>
        <div class="midori-tor-panel-debug"></div>
      </div>
      <div class="midori-tor-panel-section">
        <div class="midori-tor-panel-label">New Identity</div>
        <div class="midori-tor-panel-newid-info">Never requested</div>
      </div>
      <button class="midori-tor-panel-newid-btn">New Identity</button>
    `;
    panel.appendChild(container);

    // Badge click opens/closes the native XUL panel
    badge.addEventListener('click', () => {
      if (panel.state === 'open') {
        panel.hidePopup();
      } else {
        this._updateStatusPanel(win);
        panel.openPopup(badge, 'after_end', 0, 0, false, false);
      }
    });

    // New Identity button
    const newIdBtn = container.querySelector('.midori-tor-panel-newid-btn');
    if (newIdBtn) {
      newIdBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        newIdBtn.disabled = true;
        newIdBtn.textContent = 'Requesting...';
        this.newCircuit().then((success) => {
          if (success) {
            newIdBtn.textContent = 'Identity Renewed';
            const timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
            timer.initWithCallback(
              () => {
                panel.hidePopup();
                newIdBtn.textContent = 'New Identity';
                newIdBtn.disabled = false;
              },
              2000,
              Ci.nsITimer.TYPE_ONE_SHOT
            );
          } else {
            newIdBtn.textContent = 'Failed — Retry';
            newIdBtn.disabled = false;
          }
        });
      });
    }

    // Insert badge at start of nav-bar-customization-target
    const firstItem = navbar.querySelector('#nav-bar-customization-target');
    if (firstItem) {
      firstItem.prepend(badge);
    } else {
      navbar.appendChild(badge);
    }

    // XUL panels MUST be children of mainPopupSet to render correctly
    const popupSet = doc.getElementById('mainPopupSet');
    if (popupSet) {
      popupSet.appendChild(panel);
    } else {
      doc.documentElement.appendChild(panel);
    }

    // Initial status update
    this._updateStatusPanel(win);
  },

  /**
   * Build CSS for the Tor window indicator, status panel, and toast notification.
   * @returns {string}
   */
  _buildIndicatorCSS() {
    return `
      /* ── Tor Window Visual Indicator ── */
      :root[midori-tor-window="true"] #navigator-toolbox {
        border-top: 3px solid #7D4698 !important;
      }
      :root[midori-tor-window="true"] #nav-bar {
        background-color: color-mix(in srgb, var(--toolbar-bgcolor) 92%, #7D4698) !important;
      }
      :root[midori-tor-window="true"] .private-browsing-indicator {
        color: #7D4698 !important;
      }

      /* ── Tor Badge Button ── */
      #midori-tor-badge {
        appearance: none !important;
        background: #7D4698 !important;
        color: #FFFFFF !important;
        border-radius: 12px !important;
        padding: 2px 10px !important;
        margin: 4px 6px !important;
        font-size: 11px !important;
        font-weight: 700 !important;
        letter-spacing: 0.5px !important;
        text-transform: uppercase !important;
        min-height: 22px !important;
        cursor: pointer !important;
        border: none !important;
      }
      #midori-tor-badge:hover {
        background: #6A3B82 !important;
      }
      #midori-tor-badge:active {
        background: #573069 !important;
      }
      #midori-tor-badge .toolbarbutton-text {
        display: inline !important;
        color: #FFFFFF !important;
      }
      #midori-tor-badge .toolbarbutton-icon {
        display: none !important;
      }

      /* ── Tor Status Panel (native XUL panel) ── */
      #midori-tor-status-panel {
        --panel-width: 280px;
      }
      #midori-tor-panel-content {
        width: 280px;
        padding: 12px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 13px;
      }
      .midori-tor-panel-header {
        margin-bottom: 10px;
        padding-bottom: 8px;
        border-bottom: 1px solid rgba(128,128,128,0.2);
      }
      .midori-tor-panel-title {
        font-size: 15px;
        font-weight: 700;
        color: #7D4698;
      }
      .midori-tor-panel-state {
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 10px;
      }
      .midori-tor-panel-bootstrap-detail {
        font-size: 12px;
        opacity: 0.8;
        margin-top: -4px;
        margin-bottom: 8px;
      }
      .midori-tor-panel-progress {
        margin-bottom: 10px;
      }
      .midori-tor-panel-progress-track {
        height: 6px;
        background: rgba(128,128,128,0.2);
        border-radius: 3px;
        overflow: hidden;
      }
      .midori-tor-panel-progress-bar {
        height: 100%;
        background: linear-gradient(90deg, #7D4698, #C792EA);
        border-radius: 3px;
        transition: width 0.3s ease;
        width: 0%;
      }
      .midori-tor-panel-section {
        margin-bottom: 8px;
      }
      .midori-tor-panel-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.8px;
        opacity: 0.5;
        margin-bottom: 2px;
      }
      .midori-tor-panel-exit {
        font-size: 13px;
        font-weight: 500;
      }
      .midori-tor-panel-path {
        font-size: 11px;
        font-family: monospace;
        opacity: 0.7;
        word-break: break-all;
        line-height: 1.5;
      }
      .midori-tor-panel-debug {
        font-size: 11px;
        line-height: 1.45;
        opacity: 0.85;
      }
      .midori-tor-panel-newid-info {
        font-size: 12px;
        opacity: 0.9;
      }
      .midori-tor-panel-newid-btn {
        display: block;
        width: 100%;
        margin-top: 10px;
        padding: 8px 0;
        background: #7D4698;
        color: #FFFFFF;
        border: none;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
      }
      .midori-tor-panel-newid-btn:hover:not(:disabled) {
        background: #6A3B82;
      }
      .midori-tor-panel-newid-btn:disabled {
        opacity: 0.6;
        cursor: wait;
      }

      /* ── Toast Notification (New Identity) ── */
      #midori-tor-newid-notification {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 10001;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 14px 20px;
        background: var(--arrowpanel-background, #2B2A33);
        color: var(--arrowpanel-color, #FBFBFE);
        border: 1px solid rgba(125, 70, 152, 0.4);
        border-radius: 12px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.35);
        font-family: system-ui, -apple-system, sans-serif;
        opacity: 0;
        transform: translateY(16px);
        transition: opacity 0.3s ease, transform 0.3s ease;
        pointer-events: none;
      }
      #midori-tor-newid-notification.midori-tor-toast-show {
        opacity: 1;
        transform: translateY(0);
      }
      .midori-tor-toast-icon {
        font-size: 24px;
        flex-shrink: 0;
      }
      .midori-tor-toast-body {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .midori-tor-toast-title {
        font-size: 14px;
        font-weight: 700;
        color: #C792EA;
      }
      .midori-tor-toast-detail {
        font-size: 12px;
        opacity: 0.65;
      }
    `;
  },

  // ===========================================================================
  // Tor Binary & Configuration
  // ===========================================================================

  /**
   * Get the path to the bundled tor binary.
   * @returns {nsIFile|null}
   */
  _getTorBinaryPath() {
    try {
      // Get the application directory
      const appDir = Services.dirsvc.get('GreBinD', Ci.nsIFile);
      const torDir = appDir.clone();
      torDir.append('tor');

      const torBin = torDir.clone();
      if (Services.appinfo.OS === 'WINNT') {
        torBin.append('tor.exe');
      } else {
        torBin.append('tor');
      }
      return torBin;
    } catch (e) {
      console.error('MidoriTor: Failed to resolve tor binary path', e);
      return null;
    }
  },

  /**
   * Build launch program + args for Tor across platforms.
   * Linux/macOS run a generated shell launcher.
   * Windows runs a generated batch launcher via cmd.exe.
   * @param {{torBinaryPath: string, torDir: string, torrcPath: string}} options
   * @returns {{programFile: nsIFile, args: string[]}}
   */
  _buildTorLaunchInfo({ torBinaryPath, torDir, torrcPath }) {
    if (Services.appinfo.OS === 'WINNT') {
      const wrapperFile = this._createTorWrapperWindows(torBinaryPath, torDir);
      const cmdFile = this._getWindowsCmdFile();
      const command = `call "${wrapperFile.path}" -f "${torrcPath}"`;
      return {
        programFile: cmdFile,
        args: ['/d', '/c', command],
      };
    }

    const wrapperFile = this._createTorWrapperUnix(torBinaryPath, torDir);
    return {
      programFile: wrapperFile,
      args: ['-f', torrcPath],
    };
  },

  /**
   * Create a shell launcher that constrains library lookup to the bundled
   * tor/ directory for the Tor subprocess.
   * @param {string} torBinaryPath
   * @param {string} torDir
   * @returns {nsIFile}
   */
  _createTorWrapperUnix(torBinaryPath, torDir) {
    const profileDir = Services.dirsvc.get('ProfD', Ci.nsIFile);
    const wrapperFile = profileDir.clone();
    wrapperFile.append('midori-tor-wrapper-unix.sh');

    const script = [
      '#!/bin/sh',
      'set -e',
      '# Midori Tor wrapper: isolate Tor dependencies from system libraries',
      `export LD_LIBRARY_PATH="${torDir}${'$'}{LD_LIBRARY_PATH:+:${'$'}LD_LIBRARY_PATH}"`,
      `export DYLD_LIBRARY_PATH="${torDir}${'$'}{DYLD_LIBRARY_PATH:+:${'$'}DYLD_LIBRARY_PATH}"`,
      `exec "${torBinaryPath}" "$@" 2>&1`,
      '',
    ].join('\n');

    this._writeTextFile(wrapperFile, script, 0o755);
    log('Created Unix Tor launcher at:', wrapperFile.path);
    return wrapperFile;
  },

  /**
   * Create a Windows batch launcher that prepends bundled tor/ to PATH only
   * for the Tor subprocess.
   * @param {string} torBinaryPath
   * @param {string} torDir
   * @returns {nsIFile}
   */
  _createTorWrapperWindows(torBinaryPath, torDir) {
    const profileDir = Services.dirsvc.get('ProfD', Ci.nsIFile);
    const wrapperFile = profileDir.clone();
    wrapperFile.append('midori-tor-wrapper-win.bat');

    const script = [
      '@echo off',
      'setlocal',
      `set "TOR_DIR=${torDir}"`,
      'set "PATH=%TOR_DIR%;%PATH%"',
      `"${torBinaryPath}" %*`,
      '',
    ].join('\r\n');

    this._writeTextFile(wrapperFile, script, 0o600);
    log('Created Windows Tor launcher at:', wrapperFile.path);
    return wrapperFile;
  },

  /**
   * Resolve cmd.exe for Windows launcher execution.
   * @returns {nsIFile}
   */
  _getWindowsCmdFile() {
    const env = Cc['@mozilla.org/process/environment;1'].getService(Ci.nsIEnvironment);
    const cmdPath = env.get('ComSpec') || 'C:\\Windows\\System32\\cmd.exe';
    const cmdFile = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
    cmdFile.initWithPath(cmdPath);
    if (!cmdFile.exists()) {
      throw new Error(`cmd.exe not found at ${cmdPath}`);
    }
    return cmdFile;
  },

  /**
   * Write plain text to a file with the given unix mode.
   * @param {nsIFile} file
   * @param {string} content
   * @param {number} mode
   */
  _writeTextFile(file, content, mode) {
    const outputStream = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(
      Ci.nsIFileOutputStream
    );
    outputStream.init(file, 0x02 | 0x08 | 0x20, mode, 0);
    outputStream.write(content, content.length);
    outputStream.close();
  },

  /**
   * Write a torrc configuration file to the profile directory.
   * @returns {nsIFile}
   */
  _writeTorrc() {
    const profileDir = Services.dirsvc.get('ProfD', Ci.nsIFile);
    const torDataDir = profileDir.clone();
    torDataDir.append('tor-data');
    if (!torDataDir.exists()) {
      try {
        torDataDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o700);
        log('Created tor-data directory at:', torDataDir.path);
      } catch (e) {
        error('Failed to create tor-data directory:', e, 'path:', torDataDir.path);
        // Continue anyway, Tor might be able to create it
      }
    }

    // Cookie auth file for control port
    const cookieAuthFile = torDataDir.clone();
    cookieAuthFile.append('control_auth_cookie');

    const port = Services.prefs.getIntPref(PREF_SOCKS_PORT, TOR_DEFAULT_PORT);

    let torrcContent = [
      // SocksPort with isolation flags (IsolateDestAddr/IsolateDestPort are SocksPort flags)
      `SocksPort ${port} IsolateDestAddr IsolateDestPort`,
      `ControlPort ${TOR_CONTROL_PORT}`,
      // Use CookieAuthentication instead of HashedControlPassword
      `CookieAuthentication 1`,
      `CookieAuthFile ${cookieAuthFile.path}`,
      `DataDirectory ${torDataDir.path}`,
        // Logging — single stderr directive (nsIProcess runs without a tty)
        `Log notice stderr`,
    ];

      // Only include GeoIP directives when the files are actually present.
      // An empty or missing path causes Tor to exit immediately with a fatal error.
      const geoip  = this._getGeoIPPath('geoip');
      const geoip6 = this._getGeoIPPath('geoip6');
      if (geoip)  { torrcContent.push(`GeoIPFile ${geoip}`); }
      if (geoip6) { torrcContent.push(`GeoIPv6File ${geoip6}`); }

    log('Generated torrc with SocksPort', port, 'ControlPort', TOR_CONTROL_PORT);

    // Add bridges if enabled
    const bridgesEnabled = Services.prefs.getBoolPref(PREF_BRIDGES_ENABLED, false);
    if (bridgesEnabled) {
      const bridges = Services.prefs.getCharPref(PREF_BRIDGES_LIST, '');
      if (bridges.trim()) {
        torrcContent.push('UseBridges 1');
        torrcContent.push('ClientTransportPlugin obfs4 exec ' + this._getObfs4ProxyPath());
        for (const bridge of bridges.split('\n')) {
          const line = bridge.trim();
          if (line) {
            torrcContent.push(`Bridge ${line}`);
          }
        }
      }
    }

    const torrcFile = profileDir.clone();
    torrcFile.append('midori-torrc');

    const outputStream = Cc['@mozilla.org/network/file-output-stream;1'].createInstance(
      Ci.nsIFileOutputStream
    );
    outputStream.init(torrcFile, 0x02 | 0x08 | 0x20, 0o600, 0);

    const content = torrcContent.join('\n') + '\n';
    outputStream.write(content, content.length);
    outputStream.close();

    return torrcFile;
  },

  /**
   * Get the path to GeoIP data files bundled with Tor.
   * @param {string} filename - "geoip" or "geoip6"
   * @returns {string}
   */
  _getGeoIPPath(filename) {
    try {
      const appDir = Services.dirsvc.get('GreBinD', Ci.nsIFile);
      const geoipFile = appDir.clone();
      geoipFile.append('tor');
      geoipFile.append(filename);
      if (geoipFile.exists()) {
        return geoipFile.path;
      }
    } catch (e) {
      // fallback
    }
    return '';
  },

  /**
   * Get path to the obfs4proxy binary for bridges.
   * @returns {string}
   */
  _getObfs4ProxyPath() {
    try {
      const appDir = Services.dirsvc.get('GreBinD', Ci.nsIFile);
      const bin = appDir.clone();
      bin.append('tor');
      if (Services.appinfo.OS === 'WINNT') {
        bin.append('obfs4proxy.exe');
      } else {
        bin.append('obfs4proxy');
      }
      return bin.path;
    } catch (e) {
      return 'obfs4proxy';
    }
  },

  // ===========================================================================
  // Bootstrap & Control
  // ===========================================================================

  /**
   * Read bootstrap timeout from prefs with sane bounds.
   * @returns {number}
   */
  _getBootstrapTimeoutMs() {
    const configured = Services.prefs.getIntPref(PREF_BOOTSTRAP_TIMEOUT_MS, BOOTSTRAP_TIMEOUT_MS);
    return lazy.MidoriTorLifecycle.getBootstrapTimeoutMs(configured);
  },

  /**
   * Read delayed-stop timeout from prefs with sane bounds.
   * @returns {number}
   */
  _getStopAfterLastWindowMs() {
    const configured = Services.prefs.getIntPref(PREF_STOP_AFTER_LAST_WINDOW_MS, 30000);
    return lazy.MidoriTorLifecycle.getStopAfterLastWindowMs(configured);
  },

  /**
   * Read idle timeout used to trigger optional Tor prewarm.
   * @returns {number}
   */
  _getPrewarmIdleTimeoutMs() {
    const configured = Services.prefs.getIntPref(PREF_PREWARM_IDLE_TIMEOUT_MS, 10000);
    return lazy.MidoriTorLifecycle.getPrewarmIdleTimeoutMs(configured);
  },

  /**
   * Schedule optional Tor prewarm using browser idle dispatch.
   */
  _schedulePrewarmOnIdle() {
    if (this._prewarmIdleScheduled) {
      return;
    }
    if (!Services.prefs.getBoolPref(PREF_PREWARM_ENABLED, false)) {
      return;
    }

    this._prewarmIdleScheduled = true;
    const idleTimeoutMs = this._getPrewarmIdleTimeoutMs();
    this._trace('prewarm-scheduled', { idleTimeoutMs });

    ChromeUtils.idleDispatch(async () => {
      this._prewarmIdleScheduled = false;
      if (Services.startup.shuttingDown) {
        return;
      }
      try {
        await this.prewarmIfEnabled();
      } catch (e) {
        this._trace('prewarm-failed', { message: String(e) });
      }
    }, { timeout: idleTimeoutMs });
  },

  /**
   * Wait for Tor to finish bootstrapping by polling the control port.
   * @returns {Promise<boolean>}
   */
  async _waitForBootstrap(timeoutMs = BOOTSTRAP_TIMEOUT_MS) {
    const startTime = Date.now();
    let pollAttempt = 0;

    // Give tor a moment to start the control port, but check process health first
    for (let i = 0; i < 4; i++) {
      if (this._processFailed || !this._process) {
        warn('Bootstrap aborted: Tor process failed before control port was ready');
        this._trace('bootstrap-abort-early', { reason: 'process-failed-before-control-port' });
        return false;
      }
        await this._sleep(500);
    }

    while (Date.now() - startTime < timeoutMs) {
      pollAttempt++;
      // Abort immediately if the process died
      if (this._processFailed || !this._process) {
        warn('Bootstrap aborted: Tor process is no longer running');
        this._trace('bootstrap-abort', {
          reason: 'process-not-running',
          attempt: pollAttempt,
          elapsedMs: Date.now() - startTime,
        });
        return false;
      }

      try {
        const status = await this._getBootstrapStatus();
        if (status !== null) {
          this._bootstrapProgress = status.progress;
          this._bootstrapSummary = status.summary;
          this._bootstrapTag = status.tag;
          this._trace('bootstrap-poll', {
            attempt: pollAttempt,
            elapsedMs: Date.now() - startTime,
            progress: status.progress,
            tag: status.tag,
            summary: status.summary,
          });
          this._notifyWindows();
          if (status.progress >= 100) {
            return true;
          }
        } else {
          this._trace('bootstrap-poll-empty', {
            attempt: pollAttempt,
            elapsedMs: Date.now() - startTime,
          });
        }
      } catch (e) {
        this._lastControlError = String(e);
        this._trace('bootstrap-poll-error', {
          attempt: pollAttempt,
          elapsedMs: Date.now() - startTime,
          message: String(e),
        });
      }

      await this._sleep(BOOTSTRAP_POLL_MS);
    }

    return false;
  },

  /**
   * Query bootstrap status via the Tor control port.
   * @returns {Promise<{progress:number,summary:string,tag:string}|null>}
   */
  async _getBootstrapStatus() {
    try {
      const response = await this._sendControlCommand('GETINFO status/bootstrap-phase');
      if (response) {
        return this._parseBootstrapStatus(response);
      }
    } catch (e) {
      this._lastControlError = String(e);
    }
    return null;
  },

  /**
   * Parse Tor bootstrap phase response into structured status.
   * @param {string} response
   * @returns {{progress:number,summary:string,tag:string}|null}
   */
  _parseBootstrapStatus(response) {
    const progressMatch = response.match(/PROGRESS=(\d+)/);
    if (!progressMatch) {
      return null;
    }
    const summaryMatch = response.match(/SUMMARY="([^"]*)"/);
    const tagMatch = response.match(/TAG=([A-Za-z_]+)/);
    return {
      progress: parseInt(progressMatch[1], 10),
      summary: summaryMatch ? summaryMatch[1] : '',
      tag: tagMatch ? tagMatch[1] : '',
    };
  },

  /**
   * Lightweight control-port connectivity probe for diagnostics.
   * Ensures cookie auth is available before attempting regular bootstrap polling.
   */
  async _probeControlPort() {
    try {
      // First, ensure we have a valid cookie before probing
      log('Probing control port, reading auth cookie...');
      const cookie = await this._readCookieAuth();
      if (!cookie) {
        log('No cookie available after retries, probe will fail');
      }
      
      const probe = await this._sendControlCommand('GETINFO version');
      const ok = !!(probe && probe.includes('250-version='));
      this._trace('control-probe', {
        ok,
        hasCookie: !!cookie,
        responsePreview: probe ? probe.slice(0, 120) : null,
      });
    } catch (e) {
      this._lastControlError = String(e);
      this._trace('control-probe-failed', { message: String(e) });
    }
  },

  /**
   * Send a command to the Tor control port.
   * Uses simple TCP socket communication.
   * @param {string} command
   * @returns {Promise<string>}
   */
  _sendControlCommand(command) {
    return new Promise((resolve, reject) => {
      const closeStreams = (inStream, outStream, transport) => {
        try {
          inStream.close();
        } catch {}
        try {
          outStream.close();
        } catch {}
        try {
          transport.close(Cr.NS_OK);
        } catch {}
      };

      const fail = (err, inStream, outStream, transport, traceEvent = 'control-command-read-error') => {
        this._lastControlError = String(err);
        this._trace(traceEvent, {
          command,
          message: String(err),
        });
        closeStreams(inStream, outStream, transport);
        reject(err);
      };

      try {
        this._trace('control-command-send', { command });
        const sts = Cc['@mozilla.org/network/socket-transport-service;1'].getService(
          Ci.nsISocketTransportService
        );

        const transport = sts.createTransport([], TOR_SOCKS_HOST, TOR_CONTROL_PORT, null, null);
        transport.setTimeout(Ci.nsISocketTransport.TIMEOUT_READ_WRITE, 10);

        const outStream = transport.openOutputStream(0, 0, 0);
        const inStream = transport.openInputStream(0, 0, 0);

        const scriptableIn = Cc['@mozilla.org/scriptableinputstream;1'].createInstance(
          Ci.nsIScriptableInputStream
        );
        scriptableIn.init(inStream);

        // Authenticate first, then send the actual command. Reading both replies
        // separately avoids returning only the AUTHENTICATE 250 OK line.
        const cookie = this._readCookieAuthSync();
        const authCmd = cookie ? `AUTHENTICATE ${cookie}\r\n` : 'AUTHENTICATE\r\n';
        outStream.write(authCmd, authCmd.length);

        this._readControlReply(scriptableIn, 2000)
          .then((authResponse) => {
            this._trace('control-auth-recv', {
              command,
              responsePreview: authResponse ? authResponse.slice(0, 200) : null,
            });

            if (!authResponse || !/(?:^|\r\n)250 OK(?:\r\n|$)/.test(authResponse)) {
              throw new Error(`Tor control auth failed: ${authResponse || 'empty response'}`);
            }

            const fullCmd = `${command}\r\n`;
            outStream.write(fullCmd, fullCmd.length);
            return this._readControlReply(scriptableIn, 2500);
          })
          .then((data) => {
            if (data) {
              this._lastControlResponseAt = Date.now();
              this._lastControlError = '';
              this._trace('control-command-recv', {
                command,
                bytes: data.length,
                responsePreview: data.slice(0, 200),
              });
              closeStreams(inStream, outStream, transport);
              resolve(data);
              return;
            }

            this._trace('control-command-empty', { command });
            closeStreams(inStream, outStream, transport);
            resolve(null);
          })
          .catch((err) => fail(err, inStream, outStream, transport));
      } catch (e) {
        this._lastControlError = String(e);
        this._trace('control-command-open-error', {
          command,
          message: String(e),
        });
        reject(e);
      }
    });
  },

  /**
   * Read a full Tor control-port reply, including multiline replies that end
   * with a final `250 OK` line.
   * @param {nsIScriptableInputStream} scriptableIn
   * @param {number} timeoutMs
   * @returns {Promise<string|null>}
   */
  _readControlReply(scriptableIn, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
      let response = '';
      const startedAt = Date.now();

      const isComplete = (data) => {
        if (!data) {
          return false;
        }
        if (/(?:^|\r\n)5\d\d[ -].*(?:\r\n|$)/.test(data)) {
          return true;
        }
        if (/(?:^|\r\n)250 OK(?:\r\n|$)/.test(data)) {
          return true;
        }
        return false;
      };

      const poll = () => {
        try {
          const available = scriptableIn.available();
          if (available > 0) {
            response += scriptableIn.read(available);
            if (isComplete(response)) {
              resolve(response);
              return;
            }
          }

          if (Date.now() - startedAt >= timeoutMs) {
            resolve(response || null);
            return;
          }

          const timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
          timer.initWithCallback(poll, 50, Ci.nsITimer.TYPE_ONE_SHOT);
        } catch (e) {
          reject(e);
        }
      };

      poll();
    });
  },

  // ===========================================================================
  // Circuit Info & Exit Node (Fase 7)
  // ===========================================================================

  /**
   * Fetch current circuit information from the Tor control port.
   * Parses GETINFO circuit-status to find the active exit node,
   * then resolves its country via GETINFO ip-to-country.
   */
  async _fetchCircuitInfo() {
    if (this._state !== STATE_CONNECTED || this._torWindows.size === 0) {
      return;
    }

    try {
      const response = await this._sendControlCommand('GETINFO circuit-status');
      if (!response) {
        return;
      }

      // Parse circuit-status response
      // Format: <id> BUILT $fingerprint~name,$fingerprint~name,...  PURPOSE=GENERAL
      const lines = response.split('\n');
      let bestCircuit = null;

      for (const line of lines) {
        if (line.includes(' BUILT ') && line.includes('PURPOSE=GENERAL')) {
          const match = line.match(/BUILT\s+([\S]+)/);
          if (match) {
            bestCircuit = match[1];
            break;
          }
        }
      }

      if (bestCircuit) {
        // Parse relay hops: $FINGERPRINT~Name,$FINGERPRINT~Name,...
        const hops = bestCircuit.split(',');
        this._circuitPath = hops.map((hop) => {
          const nameMatch = hop.match(/~(\S+)/);
          return nameMatch ? nameMatch[1] : hop.replace(/^\$/, '').substring(0, 8);
        });

        // Get exit node fingerprint for country lookup
        const lastHop = hops[hops.length - 1];
        const fpMatch = lastHop.match(/\$([A-F0-9]+)/i);

        if (fpMatch) {
          // Ask Tor for the exit node's IP address
          const exitFP = fpMatch[1];
          const nsResponse = await this._sendControlCommand(`GETINFO ns/id/${exitFP}`);

          if (nsResponse) {
            // Parse the router status entry for the IP
            const addrMatch = nsResponse.match(/^s .+\n.*?\n.*?(\d+\.\d+\.\d+\.\d+)/m)
              || nsResponse.match(/(\d+\.\d+\.\d+\.\d+)/);
            if (addrMatch) {
              this._exitNodeIP = addrMatch[1];

              // Resolve country from IP
              const countryResp = await this._sendControlCommand(
                `GETINFO ip-to-country/${this._exitNodeIP}`
              );
              if (countryResp) {
                const countryMatch = countryResp.match(/ip-to-country\/[\d.]+=([\w]{2})/i);
                if (countryMatch) {
                  this._exitNodeCountry = countryMatch[1].toUpperCase();
                }
              }
            }
          }
        }
      }

      log('Circuit info updated — Exit:', this._exitNodeCountry, this._exitNodeIP,
        'Path:', this._circuitPath.join(' → '));

      // Update UI in all Tor windows
      this._updateStatusPanelAll();
    } catch (e) {
      warn('Failed to fetch circuit info:', e);
    }
  },

  /**
   * Start periodic circuit info polling (every 30s).
   */
  _startCircuitInfoPolling() {
    this._stopCircuitInfoPolling();
    // Fetch immediately
    this._fetchCircuitInfo();
    // Then every 30 seconds
    this._circuitInfoTimer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
    this._circuitInfoTimer.initWithCallback(
      () => this._fetchCircuitInfo(),
      30000,
      Ci.nsITimer.TYPE_REPEATING_SLACK
    );
    log('Circuit info polling started (30s interval)');
  },

  /**
   * Stop periodic circuit info polling.
   */
  _stopCircuitInfoPolling() {
    if (this._circuitInfoTimer) {
      this._circuitInfoTimer.cancel();
      this._circuitInfoTimer = null;
    }
  },

  /**
   * Update the Tor status panel in all Tor windows.
   */
  _updateStatusPanelAll() {
    for (const win of this._torWindows) {
      if (!win.closed) {
        this._updateStatusPanel(win);
      }
    }
  },

  /**
   * Update the status panel UI for a single window.
   * @param {Window} win
   */
  _updateStatusPanel(win) {
    const doc = win.document;

    // Update badge label with country flag (emoji in label since ::before is unreliable in XUL)
    const badge = doc.getElementById('midori-tor-badge');
    if (badge) {
      const flag = this._getCountryFlag(this._exitNodeCountry);
      if (this._state === STATE_CONNECTED && this._exitNodeCountry) {
        badge.setAttribute('label', `🧅 Tor · ${flag}`);
      } else if (this._state === STATE_BOOTSTRAPPING) {
        badge.setAttribute('label', `🧅 Tor ${this._bootstrapProgress}%`);
      } else {
        badge.setAttribute('label', '🧅 Tor');
      }
    }

    // Update panel content if panel exists
    const panel = doc.getElementById('midori-tor-status-panel');
    if (!panel) {
      return;
    }

    const stateEl = panel.querySelector('.midori-tor-panel-state');
    const bootstrapDetailEl = panel.querySelector('.midori-tor-panel-bootstrap-detail');
    const exitEl = panel.querySelector('.midori-tor-panel-exit');
    const pathEl = panel.querySelector('.midori-tor-panel-path');
    const debugEl = panel.querySelector('.midori-tor-panel-debug');
    const newIdInfoEl = panel.querySelector('.midori-tor-panel-newid-info');
    const progressEl = panel.querySelector('.midori-tor-panel-progress');
    const progressBar = panel.querySelector('.midori-tor-panel-progress-bar');

    if (stateEl) {
      const stateMap = {
        [STATE_DISCONNECTED]: '⚫ Disconnected',
        [STATE_STARTING]: '🟡 Starting...',
        [STATE_BOOTSTRAPPING]: `🟡 Bootstrapping ${this._bootstrapProgress}%`,
        [STATE_CONNECTED]: '🟢 Connected',
        [STATE_ERROR]: '🔴 Error',
        [STATE_STOPPING]: '🟠 Stopping...',
      };
      stateEl.textContent = stateMap[this._state] || this._state;
    }

    if (bootstrapDetailEl) {
      if (this._state === STATE_BOOTSTRAPPING) {
        const detail = this._bootstrapSummary || this._bootstrapTag || 'Waiting for control port...';
        bootstrapDetailEl.textContent = detail;
        bootstrapDetailEl.style.display = '';
      } else {
        bootstrapDetailEl.style.display = 'none';
      }
    }

    if (exitEl) {
      if (this._exitNodeCountry) {
        const flag = this._getCountryFlag(this._exitNodeCountry);
        const name = this._getCountryName(this._exitNodeCountry);
        exitEl.textContent = `${flag} ${name}${this._exitNodeIP ? ` (${this._exitNodeIP})` : ''}`;
        exitEl.style.display = '';
      } else {
        exitEl.textContent = 'Exit: —';
        exitEl.style.display = this._state === STATE_CONNECTED ? '' : 'none';
      }
    }

    if (pathEl) {
      if (this._circuitPath.length > 0) {
        pathEl.textContent = this._circuitPath.join(' → ');
        pathEl.style.display = '';
      } else {
        pathEl.style.display = 'none';
      }
    }

    if (progressEl && progressBar) {
      if (this._state === STATE_BOOTSTRAPPING) {
        progressEl.style.display = '';
        progressBar.style.width = `${this._bootstrapProgress}%`;
      } else {
        progressEl.style.display = 'none';
      }
    }

    if (debugEl) {
      const missing = [];
      if (!this._torBinaryAvailable) {
        missing.push('Tor binary unavailable');
      }
      if (this._state === STATE_CONNECTED && !this._exitNodeCountry) {
        missing.push('Country not resolved yet');
      }
      if (this._state === STATE_BOOTSTRAPPING && !this._bootstrapSummary) {
        missing.push('Bootstrap phase details pending');
      }
      if (this._lastControlError) {
        missing.push(`Control port: ${this._lastControlError}`);
      }
      debugEl.textContent = missing.length ? missing.join(' | ') : 'All required data available.';
    }

    if (newIdInfoEl) {
      if (this._lastNewIdentityAt > 0) {
        const when = this._formatSince(this._lastNewIdentityAt);
        const exitInfo = this._lastNewIdentityExit || 'Exit node pending';
        newIdInfoEl.textContent = `Last request: ${when} | ${exitInfo}`;
      } else {
        newIdInfoEl.textContent = 'Never requested';
      }
    }
  },

  /**
   * Convert a 2-letter country code to an emoji flag.
   * @param {string} code - ISO 3166-1 alpha-2 (e.g. "US", "DE")
   * @returns {string} flag emoji or empty string
   */
  _getCountryFlag(code) {
    if (!code || code.length !== 2) {
      return '🌐';
    }
    const upper = code.toUpperCase();
    return String.fromCodePoint(
      0x1F1E6 + upper.charCodeAt(0) - 65,
      0x1F1E6 + upper.charCodeAt(1) - 65
    );
  },

  /**
   * Convert a 2-letter country code to a human-readable name.
   * Common Tor exit node countries included.
   * @param {string} code
   * @returns {string}
   */
  _getCountryName(code) {
    const names = {
      US: 'United States', DE: 'Germany', FR: 'France', NL: 'Netherlands',
      GB: 'United Kingdom', CA: 'Canada', SE: 'Sweden', CH: 'Switzerland',
      AT: 'Austria', FI: 'Finland', NO: 'Norway', DK: 'Denmark',
      IS: 'Iceland', RO: 'Romania', LU: 'Luxembourg', CZ: 'Czech Republic',
      PL: 'Poland', ES: 'Spain', IT: 'Italy', PT: 'Portugal',
      BE: 'Belgium', IE: 'Ireland', JP: 'Japan', SG: 'Singapore',
      AU: 'Australia', BR: 'Brazil', IN: 'India', RU: 'Russia',
      UA: 'Ukraine', HK: 'Hong Kong', TW: 'Taiwan', KR: 'South Korea',
      BG: 'Bulgaria', HU: 'Hungary', SK: 'Slovakia', LT: 'Lithuania',
      LV: 'Latvia', EE: 'Estonia', HR: 'Croatia', SI: 'Slovenia',
      MD: 'Moldova', RS: 'Serbia', MX: 'Mexico', CL: 'Chile',
      AR: 'Argentina', CO: 'Colombia', ZA: 'South Africa', NZ: 'New Zealand',
    };
    if (!code) {
      return 'Unknown';
    }
    return names[code.toUpperCase()] || code.toUpperCase();
  },

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Generate a random alphanumeric password.
   * @param {number} length
   * @returns {string}
   */
  /**
   * Check if something is already listening on our Tor ports, and if so
   * kill the stale process so we can start fresh. This handles browsers
   * that exited without cleanly stopping Tor.
   */
  async _evictTorOnPorts() {
    const occupied = await this._withTimeout(this._isPortOccupied(TOR_CONTROL_PORT), 1500, false);
    if (!occupied) {
      return; // Ports are free, nothing to do
    }

    const socksPort = Services.prefs.getIntPref(PREF_SOCKS_PORT, TOR_DEFAULT_PORT);
    log('Ports', socksPort, '/', TOR_CONTROL_PORT, 'occupied — evicting stale Tor...');

    // Kill any process whose command-line contains our torrc filename.
    // MidoriTor always launches tor with "-f .../midori-torrc" so this is safe.
    try {
      if (Services.appinfo.OS !== 'WINNT') {
        const sh = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
        sh.initWithPath('/bin/sh');
        if (sh.exists()) {
          const killer = Cc['@mozilla.org/process/util;1'].createInstance(Ci.nsIProcess);
          killer.init(sh);
          killer.run(true, ['-c', 'pkill -f "midori-torrc" 2>/dev/null; true'], 3);
          log('Sent SIGTERM to stale Tor process via pkill');
        }
      }
    } catch (e) {
      warn('Could not run eviction command:', e);
    }

    // Wait up to 3 seconds for the port to free
    for (let i = 0; i < 10; i++) {
      await this._sleep(300);
      const stillOccupied = await this._withTimeout(this._isPortOccupied(TOR_CONTROL_PORT), 800, false);
      if (!stillOccupied) {
        log('Port', TOR_CONTROL_PORT, 'is now free after eviction');
        return;
      }
    }
    warn('Port', TOR_CONTROL_PORT, 'still occupied after eviction attempt — Tor start may fail');
  },

  /**
   * Resolve a promise with a fallback if it does not settle in time.
   * @template T
   * @param {Promise<T>} promise
   * @param {number} timeoutMs
   * @param {T} fallback
   * @returns {Promise<T>}
   */
  async _withTimeout(promise, timeoutMs, fallback) {
    const timeoutPromise = this._sleep(timeoutMs).then(() => fallback);
    try {
      return await Promise.race([promise, timeoutPromise]);
    } catch {
      return fallback;
    }
  },

  /**
   * Test whether something is already listening on a given localhost TCP port.
   * Sends an empty line and waits up to 600 ms for any response.
   * @param {number} port
   * @returns {Promise<boolean>}
   */
  _isPortOccupied(port) {
    return new Promise((resolve) => {
      try {
        const sts = Cc['@mozilla.org/network/socket-transport-service;1'].getService(
          Ci.nsISocketTransportService
        );
        const transport = sts.createTransport([], '127.0.0.1', port, null, null);
        transport.setTimeout(Ci.nsISocketTransport.TIMEOUT_READ_WRITE, 1);

        const outStream = transport.openOutputStream(0, 0, 0);
        const inStream  = transport.openInputStream(0, 0, 0);
        const sIn = Cc['@mozilla.org/scriptableinputstream;1'].createInstance(
          Ci.nsIScriptableInputStream
        );
        sIn.init(inStream);

        // Tor sends a banner immediately on connect even before we write anything.
        // Wait 600 ms; if we received anything, the port is occupied.
        const timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        timer.initWithCallback(() => {
          try {
            const available = sIn.available();
            resolve(available > 0);
          } catch {
            resolve(false);
          } finally {
            try { inStream.close(); outStream.close(); transport.close(Cr.NS_OK); } catch {}
          }
        }, 600, Ci.nsITimer.TYPE_ONE_SHOT);
      } catch {
        // Connection refused — port is free
        resolve(false);
      }
    });
  },

  /**
   * Promise-based delay.
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise((resolve) => {
      const timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
      timer.initWithCallback(
        () => {
          try {
            timer.cancel();
          } catch {
            // already fired/canceled
          }
          resolve();
        },
        ms,
        Ci.nsITimer.TYPE_ONE_SHOT
      );
    });
  },

  _generatePassword(length) {
     const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
     const array = new Uint8Array(length);
     crypto.getRandomValues(array);
     return Array.from(array, (b) => chars[b % chars.length]).join('');
  },

  /**
   * Format elapsed time from a timestamp to a compact human-readable string.
   * @param {number} ts
   * @returns {string}
   */
  _formatSince(ts) {
    const deltaSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (deltaSec < 60) {
      return `${deltaSec}s ago`;
    }
    const min = Math.floor(deltaSec / 60);
    if (min < 60) {
      return `${min}m ago`;
    }
    const h = Math.floor(min / 60);
    return `${h}h ago`;
  },

  /**
   * Read the cookie auth file generated by Tor.
   * Retries multiple times with delays since Tor may need time to create the file.
   * @returns {Promise<string|null>} hex-encoded cookie or null
   */
  async _readCookieAuth() {
    const profileDir = Services.dirsvc.get('ProfD', Ci.nsIFile);
    const cookieFile = profileDir.clone();
    cookieFile.append('tor-data');
    cookieFile.append('control_auth_cookie');

    // Retry reading the cookie with exponential backoff
    // Tor needs time to create the data directory and cookie file
    for (let attempt = 0; attempt < 8; attempt++) {
      if (cookieFile.exists()) {
        try {
          // Read binary cookie file
          const stream = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(
            Ci.nsIFileInputStream
          );
          stream.init(cookieFile, 0x01, 0, 0);
          const binaryStream = Cc['@mozilla.org/binaryinputstream;1'].createInstance(
            Ci.nsIBinaryInputStream
          );
          binaryStream.setInputStream(stream);
          const bytes = binaryStream.readBytes(binaryStream.available());
          binaryStream.close();
          stream.close();
          
          // Cookie must be exactly 32 bytes
          if (bytes.length !== 32) {
            log('Cookie file exists but has wrong length:', bytes.length, '(expected 32)');
            await this._sleep(250 * (attempt + 1));
            continue;
          }
          
          // Convert to hex
          const hexCookie = Array.from(bytes, (c) => ('0' + c.charCodeAt(0).toString(16)).slice(-2)).join('');
          log('Cookie auth loaded successfully, attempt:', attempt + 1);
          return hexCookie;
        } catch (e) {
          error('Failed to read cookie auth file:', e);
          await this._sleep(250 * (attempt + 1));
          continue;
        }
      }
      
      // Cookie file doesn't exist yet, wait and retry
      log('Cookie file not found yet (attempt', attempt + 1, 'of 8), waiting...');
      await this._sleep(250 * (attempt + 1));
    }
    
    warn('Cookie auth file not found after retries:', cookieFile.path);
    return null;
  },

  /**
   * Synchronous version of _readCookieAuth for use in _sendControlCommand.
   * This is a fallback when async retries weren't possible.
   * @returns {string|null} hex-encoded cookie or null
   */
  _readCookieAuthSync() {
    try {
      const profileDir = Services.dirsvc.get('ProfD', Ci.nsIFile);
      const cookieFile = profileDir.clone();
      cookieFile.append('tor-data');
      cookieFile.append('control_auth_cookie');
      if (!cookieFile.exists()) {
        return null;
      }
      // Read binary cookie file
      const stream = Cc['@mozilla.org/network/file-input-stream;1'].createInstance(
        Ci.nsIFileInputStream
      );
      stream.init(cookieFile, 0x01, 0, 0);
      const binaryStream = Cc['@mozilla.org/binaryinputstream;1'].createInstance(
        Ci.nsIBinaryInputStream
      );
      binaryStream.setInputStream(stream);
      const bytes = binaryStream.readBytes(binaryStream.available());
      binaryStream.close();
      stream.close();
      
      // Cookie must be exactly 32 bytes
      if (bytes.length !== 32) {
        log('Sync cookie read: wrong length', bytes.length);
        return null;
      }
      
      // Convert to hex
      return Array.from(bytes, (c) => ('0' + c.charCodeAt(0).toString(16)).slice(-2)).join('');
    } catch (e) {
      error('Failed to read cookie auth (sync):', e);
      return null;
    }
  },

  /**
   * Set internal state and notify observers.
   * @param {string} newState
   */
  _setState(newState) {
    const oldState = this._state;
    this._state = newState;
    if (oldState !== newState) {
      this._trace('state-change', {
        from: oldState,
        to: newState,
        progress: this._bootstrapProgress,
      });
    }
    if (oldState !== newState) {
      Services.obs.notifyObservers(
        null,
        'midori-tor-state-change',
        JSON.stringify({
          state: newState,
          progress: this._bootstrapProgress,
        })
      );
      this._notifyWindows();
    }
  },

  /**
   * Structured trace log to ease Tor startup debugging.
   * @param {string} event
   * @param {object} details
   */
  _trace(event, details = {}) {
    log(`[trace:${event}]`, details);
  },

  /**
   * Optional hook for future idle prewarm; disabled by default.
   * Does nothing unless explicitly enabled by pref.
   */
  async prewarmIfEnabled() {
    if (!this._initialized) {
      this.init();
    }
    const shouldPrewarm = lazy.MidoriTorLifecycle.shouldAttemptPrewarm({
      prewarmEnabled: Services.prefs.getBoolPref(PREF_PREWARM_ENABLED, false),
      torEnabled: Services.prefs.getBoolPref(PREF_ENABLED, true),
      torBinaryAvailable: this._torBinaryAvailable,
      isConnected: this.isConnected,
      state: this._state,
      hasStartPromise: !!this._startPromise,
    });
    if (!shouldPrewarm) {
      return this.isConnected;
    }

    this._trace('prewarm-start', { state: this._state });
    return this.start();
  },

  /**
   * Notify all Tor windows about state changes.
   * Updates both the badge label and the status panel.
   */
  _notifyWindows() {
    for (const win of this._torWindows) {
      if (!win.closed) {
        this._updateStatusPanel(win);
      }
    }
  },

  /**
   * Show error notification when Tor fails to start.
   * @param {Window} win
   */
  _showTorError(win) {
    try {
      const notificationBox = win.gBrowser?.getNotificationBox() || win.gNotificationBox;
      if (notificationBox) {
        notificationBox.appendNotification(
          'midori-tor-error',
          {
            label:
              'Tor could not connect. Please check that the Tor binary is installed correctly.',
            priority: notificationBox.PRIORITY_CRITICAL_HIGH,
          },
          []
        );
      }
    } catch (e) {
      console.error('MidoriTor: Failed to show error notification', e);
    }
  },

  // ===========================================================================
  // nsIObserver
  // ===========================================================================

  observe(subject, topic) {
    switch (topic) {
      case 'browser-delayed-startup-finished':
        // Nothing to inject unless it's a Tor window
        break;
      case 'domwindowclosed':
        this._handleTorWindowClosed(subject, 'observer');
        break;
        case 'quit-application':
        case 'quit-application-granted':
          // Browser is closing — kill Tor process immediately so ports are freed
          log('Browser exiting — stopping Tor process...');
          this.stop();
          break;
    }
  },
};
