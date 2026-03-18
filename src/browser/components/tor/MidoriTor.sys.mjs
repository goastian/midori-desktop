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
  PrivateBrowsingUtils: 'resource://gre/modules/PrivateBrowsingUtils.sys.mjs',
});

const PREF_ENABLED = 'midori.tor.enabled';
const PREF_SOCKS_PORT = 'midori.tor.socks_port';
const PREF_BRIDGES_ENABLED = 'midori.tor.bridges.enabled';
const PREF_BRIDGES_LIST = 'midori.tor.bridges.list';

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

  /**
   * Initialize the Tor module. Called once from BrowserGlue.
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
    log('start() called, current state:', this._state);

    if (
      this._state === STATE_CONNECTED ||
      this._state === STATE_BOOTSTRAPPING ||
      this._state === STATE_STARTING
    ) {
      log('Tor already in state:', this._state);
      return this._state === STATE_CONNECTED;
    }

    this._setState(STATE_STARTING);
    this._bootstrapProgress = 0;

    try {
      const torBinary = this._getTorBinaryPath();
      if (!torBinary || !torBinary.exists()) {
        error('Tor binary not found at:', torBinary ? torBinary.path : '(null)');
        this._setState(STATE_ERROR);
        return false;
      }
      log('Starting Tor binary:', torBinary.path);

      // Set LD_LIBRARY_PATH so Tor finds its bundled shared libraries
      // (libssl, libcrypto, libevent) instead of system or Firefox ones
      const torDir = torBinary.parent.path;
      const env = Cc['@mozilla.org/process/environment;1'].getService(Ci.nsIEnvironment);
      const origLdPath = env.get('LD_LIBRARY_PATH') || '';
      const newLdPath = origLdPath ? `${torDir}:${origLdPath}` : torDir;
      env.set('LD_LIBRARY_PATH', newLdPath);
      log('Set LD_LIBRARY_PATH to:', newLdPath);

      // Write torrc configuration
      const torrcFile = this._writeTorrc();

      // Launch tor process
      const process = Cc['@mozilla.org/process/util;1'].createInstance(Ci.nsIProcess);
      process.init(torBinary);

      const args = ['-f', torrcFile.path];
      process.runAsync(args, args.length, {
        observe: (_subject, topic) => {
          if (topic === 'process-finished' || topic === 'process-failed') {
            if (this._state !== STATE_STOPPING) {
              console.warn('MidoriTor: Tor process exited unexpectedly, topic:', topic);
              this._setState(STATE_DISCONNECTED);
              this._process = null;
            }
          }
        },
      });

      this._process = process;
      this._setState(STATE_BOOTSTRAPPING);

      // Wait for bootstrap to complete
      const bootstrapped = await this._waitForBootstrap();
      if (bootstrapped) {
        this._setState(STATE_CONNECTED);
        this._notifyWindows();
        return true;
      }

      console.error('MidoriTor: Bootstrap timed out');
      this.stop();
      this._setState(STATE_ERROR);
      return false;
    } catch (e) {
      console.error('MidoriTor: Failed to start Tor process', e);
      this._setState(STATE_ERROR);
      return false;
    }
  },

  /**
   * Stop the Tor process.
   */
  stop() {
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
   * Request a new Tor circuit (new identity).
   * Sends SIGNAL NEWNYM via the Tor control port.
   * @returns {Promise<boolean>}
   */
  async newCircuit() {
    if (this._state !== STATE_CONNECTED) {
      return false;
    }

    try {
      return await this._sendControlCommand('SIGNAL NEWNYM');
    } catch (e) {
      console.error('MidoriTor: Failed to request new circuit', e);
      return false;
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
    log('openTorWindow called');

    // Try to start Tor if binary is available
    if (this._torBinaryAvailable && !this.isConnected) {
      log('Tor binary available, attempting to start...');
      const started = await this.start();
      if (!started) {
        warn('Tor failed to start, opening window without proxy');
      }
    } else if (!this._torBinaryAvailable) {
      log('Tor binary not available, opening private window with Tor indicators only');
    }

    // Open a private window using BrowserWindowTracker
    log('Opening new private window...');
    let win;
    try {
      win = lazy.BrowserWindowTracker.openWindow({
        private: true,
        openerWindow,
      });
    } catch (e) {
      error('Failed to open private window:', e);
      return null;
    }

    if (!win) {
      error('BrowserWindowTracker.openWindow returned null');
      return null;
    }

    // Mark this window as a Tor window
    this._torWindows.add(win);
    log('Tor window opened, total Tor windows:', this._torWindows.size);

    // Wait for window to be ready, then configure it
    await new Promise((resolve) => {
      win.addEventListener(
        'DOMContentLoaded',
        () => {
          log('Tor window DOMContentLoaded, configuring...');
          this._configureTorWindow(win);
          resolve();
        },
        { once: true }
      );
    });

    return win;
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

    // Handle window close to cleanup
    win.addEventListener('unload', () => {
      log('Tor window closing, remaining:', this._torWindows.size - 1);
      this._torWindows.delete(win);
      // If no more Tor windows, optionally stop Tor
      if (this._torWindows.size === 0) {
        log('Last Tor window closed, scheduling cleanup in 30s...');
        this._restoreProxyPrefs();
        // Keep Tor running for a bit in case user opens another window
        if (this._process) {
          const timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
          timer.initWithCallback(
            () => {
              if (this._torWindows.size === 0) {
                log('No Tor windows after grace period, stopping Tor');
                this.stop();
              }
            },
            30000, // 30 seconds grace period
            Ci.nsITimer.TYPE_ONE_SHOT
          );
        }
      }
    });
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

    // Apply network hardening for Tor windows
    this._applyTorHardening();
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
   * Apply network hardening prefs for Tor privacy.
   */
  _applyTorHardening() {
    // Store originals for restoration
    if (!this._originalHardeningPrefs) {
      this._originalHardeningPrefs = {
        webrtc: Services.prefs.getBoolPref('media.peerconnection.enabled', true),
        geolocation: Services.prefs.getBoolPref('geo.enabled', true),
        prefetch: Services.prefs.getBoolPref('network.prefetch-next', true),
        speculative: Services.prefs.getBoolPref('network.http.speculative-parallel-limit', true),
        predictor: Services.prefs.getBoolPref('network.predictor.enabled', true),
        dns_prefetch: Services.prefs.getBoolPref('network.dns.disablePrefetch', false),
      };
    }

    // Disable WebRTC (IP leak vector)
    Services.prefs.setBoolPref('media.peerconnection.enabled', false);
    // Disable geolocation
    Services.prefs.setBoolPref('geo.enabled', false);
    // Disable DNS/link prefetch (info leak)
    Services.prefs.setBoolPref('network.prefetch-next', false);
    Services.prefs.setIntPref('network.http.speculative-parallel-limit', 0);
    Services.prefs.setBoolPref('network.predictor.enabled', false);
    Services.prefs.setBoolPref('network.dns.disablePrefetch', true);
  },

  /**
   * Remove Tor hardening, restoring original values.
   */
  _removeTorHardening() {
    if (!this._originalHardeningPrefs) {
      return;
    }
    Services.prefs.setBoolPref('media.peerconnection.enabled', this._originalHardeningPrefs.webrtc);
    Services.prefs.setBoolPref('geo.enabled', this._originalHardeningPrefs.geolocation);
    Services.prefs.setBoolPref('network.prefetch-next', this._originalHardeningPrefs.prefetch);
    Services.prefs.setBoolPref('network.predictor.enabled', this._originalHardeningPrefs.predictor);
    Services.prefs.setBoolPref(
      'network.dns.disablePrefetch',
      this._originalHardeningPrefs.dns_prefetch
    );
    this._originalHardeningPrefs = null;
  },

  // ===========================================================================
  // Tor UI Indicator
  // ===========================================================================

  /**
   * Inject Tor indicator CSS + badge into a Tor window.
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
    doc.head.appendChild(style);

    // Add Tor badge to the navbar
    const navbar = doc.getElementById('nav-bar');
    if (navbar) {
      const badge = doc.createXULElement('toolbarbutton');
      badge.id = 'midori-tor-badge';
      badge.setAttribute('label', 'Tor');
      badge.setAttribute('tooltiptext', 'Connected via Tor network — Click for new identity');
      badge.classList.add('toolbarbutton-1', 'chromeclass-toolbar-additional');
      badge.addEventListener('click', () => {
        this.newCircuit().then((success) => {
          if (success) {
            badge.setAttribute('tooltiptext', 'New Tor circuit requested');
            const timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
            timer.initWithCallback(
              () => {
                badge.setAttribute(
                  'tooltiptext',
                  'Connected via Tor network — Click for new identity'
                );
              },
              3000,
              Ci.nsITimer.TYPE_ONE_SHOT
            );
          }
        });
      });

      // Insert before the first flexible space or at the start
      const firstItem = navbar.querySelector('#nav-bar-customization-target');
      if (firstItem) {
        firstItem.prepend(badge);
      } else {
        navbar.appendChild(badge);
      }
    }
  },

  /**
   * Build CSS for the Tor window indicator.
   * @returns {string}
   */
  _buildIndicatorCSS() {
    return `
      /* Tor Window Visual Indicator */
      :root[midori-tor-window="true"] #navigator-toolbox {
        border-top: 3px solid #7D4698 !important;
      }

      :root[midori-tor-window="true"] #nav-bar {
        background-color: color-mix(in srgb, var(--toolbar-bgcolor) 92%, #7D4698) !important;
      }

      /* Tor badge button */
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
        transition: background 0.15s ease, transform 0.1s ease !important;
      }

      #midori-tor-badge:hover {
        background: #6A3B82 !important;
        transform: scale(1.05) !important;
      }

      #midori-tor-badge:active {
        background: #573069 !important;
        transform: scale(0.97) !important;
      }

      #midori-tor-badge::before {
        content: "🧅" !important;
        margin-inline-end: 4px !important;
        font-size: 13px !important;
      }

      /* Subtle purple tint on the private browsing indicator */
      :root[midori-tor-window="true"] .private-browsing-indicator {
        color: #7D4698 !important;
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
   * Write a torrc configuration file to the profile directory.
   * @returns {nsIFile}
   */
  _writeTorrc() {
    const profileDir = Services.dirsvc.get('ProfD', Ci.nsIFile);
    const torDataDir = profileDir.clone();
    torDataDir.append('tor-data');
    if (!torDataDir.exists()) {
      torDataDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o700);
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
      `GeoIPFile ${this._getGeoIPPath('geoip')}`,
      `GeoIPv6File ${this._getGeoIPPath('geoip6')}`,
      // Logging
      `Log notice stderr`,
    ];
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
   * Wait for Tor to finish bootstrapping by polling the control port.
   * @returns {Promise<boolean>}
   */
  async _waitForBootstrap() {
    const startTime = Date.now();

    // Give tor a moment to start the control port
    await new Promise((r) =>
      Cc['@mozilla.org/timer;1']
        .createInstance(Ci.nsITimer)
        .initWithCallback(r, 2000, Ci.nsITimer.TYPE_ONE_SHOT)
    );

    while (Date.now() - startTime < BOOTSTRAP_TIMEOUT_MS) {
      try {
        const status = await this._getBootstrapStatus();
        if (status !== null) {
          this._bootstrapProgress = status;
          this._notifyWindows();
          if (status >= 100) {
            return true;
          }
        }
      } catch (e) {
        // Control port might not be ready yet
      }

      await new Promise((r) =>
        Cc['@mozilla.org/timer;1']
          .createInstance(Ci.nsITimer)
          .initWithCallback(r, BOOTSTRAP_POLL_MS, Ci.nsITimer.TYPE_ONE_SHOT)
      );
    }

    return false;
  },

  /**
   * Query bootstrap status via the Tor control port.
   * @returns {Promise<number|null>} progress percentage or null
   */
  async _getBootstrapStatus() {
    try {
      const response = await this._sendControlCommand('GETINFO status/bootstrap-phase');
      if (response) {
        const match = response.match(/PROGRESS=(\d+)/);
        if (match) {
          return parseInt(match[1], 10);
        }
      }
    } catch (e) {
      // Not ready yet
    }
    return null;
  },

  /**
   * Send a command to the Tor control port.
   * Uses simple TCP socket communication.
   * @param {string} command
   * @returns {Promise<string>}
   */
  _sendControlCommand(command) {
    return new Promise((resolve, reject) => {
      try {
        const sts = Cc['@mozilla.org/network/socket-transport-service;1'].getService(
          Ci.nsISocketTransportService
        );

        const transport = sts.createTransport([], TOR_SOCKS_HOST, TOR_CONTROL_PORT, null, null);
        transport.setTimeout(Ci.nsISocketTransport.TIMEOUT_READ_WRITE, 5);

        const outStream = transport.openOutputStream(0, 0, 0);
        const inStream = transport.openInputStream(0, 0, 0);

        const scriptableIn = Cc['@mozilla.org/scriptableinputstream;1'].createInstance(
          Ci.nsIScriptableInputStream
        );
        scriptableIn.init(inStream);

        // Authenticate using cookie auth
        const cookie = this._readCookieAuth();
        const authCmd = cookie ? `AUTHENTICATE ${cookie}\r\n` : `AUTHENTICATE\r\n`;
        const fullCmd = authCmd + command + '\r\n';
        outStream.write(fullCmd, fullCmd.length);

        // Read response after a brief delay
        const timer = Cc['@mozilla.org/timer;1'].createInstance(Ci.nsITimer);
        timer.initWithCallback(
          () => {
            try {
              const available = scriptableIn.available();
              if (available > 0) {
                const data = scriptableIn.read(available);
                resolve(data);
              } else {
                resolve(null);
              }
            } catch (e) {
              reject(e);
            } finally {
              try {
                inStream.close();
                outStream.close();
                transport.close(Cr.NS_OK);
              } catch (e) {
                // already closed
              }
            }
          },
          500,
          Ci.nsITimer.TYPE_ONE_SHOT
        );
      } catch (e) {
        reject(e);
      }
    });
  },

  // ===========================================================================
  // Utilities
  // ===========================================================================

  /**
   * Generate a random alphanumeric password.
   * @param {number} length
   * @returns {string}
   */
  _generatePassword(length) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, (b) => chars[b % chars.length]).join('');
  },

  /**
   * Read the cookie auth file generated by Tor.
   * @returns {string|null} hex-encoded cookie or null
   */
  _readCookieAuth() {
    try {
      const profileDir = Services.dirsvc.get('ProfD', Ci.nsIFile);
      const cookieFile = profileDir.clone();
      cookieFile.append('tor-data');
      cookieFile.append('control_auth_cookie');
      if (!cookieFile.exists()) {
        warn('Cookie auth file not found:', cookieFile.path);
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
      // Convert to hex
      return Array.from(bytes, (c) => ('0' + c.charCodeAt(0).toString(16)).slice(-2)).join('');
    } catch (e) {
      error('Failed to read cookie auth:', e);
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
      Services.obs.notifyObservers(
        null,
        'midori-tor-state-change',
        JSON.stringify({
          state: newState,
          progress: this._bootstrapProgress,
        })
      );
    }
  },

  /**
   * Notify all Tor windows about state changes.
   */
  _notifyWindows() {
    for (const win of this._torWindows) {
      if (!win.closed) {
        const badge = win.document.getElementById('midori-tor-badge');
        if (badge) {
          if (this._state === STATE_BOOTSTRAPPING) {
            badge.setAttribute('label', `Tor ${this._bootstrapProgress}%`);
          } else if (this._state === STATE_CONNECTED) {
            badge.setAttribute('label', 'Tor');
          }
        }
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
        if (subject && this._torWindows.has(subject)) {
          this._torWindows.delete(subject);
          if (this._torWindows.size === 0) {
            this._restoreProxyPrefs();
          }
        }
        break;
    }
  },
};
