/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const BOOTSTRAP_TIMEOUT_DEFAULT_MS = 120000;
const BOOTSTRAP_TIMEOUT_MIN_MS = 15000;
const BOOTSTRAP_TIMEOUT_MAX_MS = 300000;

const STOP_AFTER_LAST_WINDOW_DEFAULT_MS = 30000;
const STOP_AFTER_LAST_WINDOW_MIN_MS = 5000;
const STOP_AFTER_LAST_WINDOW_MAX_MS = 120000;

const PREWARM_IDLE_TIMEOUT_DEFAULT_MS = 10000;
const PREWARM_IDLE_TIMEOUT_MIN_MS = 1000;
const PREWARM_IDLE_TIMEOUT_MAX_MS = 120000;

const SHUTDOWN_TIMEOUT_DEFAULT_MS = 5000;
const SHUTDOWN_TIMEOUT_MIN_MS = 1000;
const SHUTDOWN_TIMEOUT_MAX_MS = 15000;

function clampNumber(value, fallback, min, max) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, min), max);
}

export const MidoriTorLifecycle = {
  getBootstrapTimeoutMs(configured) {
    return clampNumber(
      configured,
      BOOTSTRAP_TIMEOUT_DEFAULT_MS,
      BOOTSTRAP_TIMEOUT_MIN_MS,
      BOOTSTRAP_TIMEOUT_MAX_MS
    );
  },

  getStopAfterLastWindowMs(configured) {
    return clampNumber(
      configured,
      STOP_AFTER_LAST_WINDOW_DEFAULT_MS,
      STOP_AFTER_LAST_WINDOW_MIN_MS,
      STOP_AFTER_LAST_WINDOW_MAX_MS
    );
  },

  getPrewarmIdleTimeoutMs(configured) {
    return clampNumber(
      configured,
      PREWARM_IDLE_TIMEOUT_DEFAULT_MS,
      PREWARM_IDLE_TIMEOUT_MIN_MS,
      PREWARM_IDLE_TIMEOUT_MAX_MS
    );
  },

  getShutdownTimeoutMs(configured) {
    return clampNumber(
      configured,
      SHUTDOWN_TIMEOUT_DEFAULT_MS,
      SHUTDOWN_TIMEOUT_MIN_MS,
      SHUTDOWN_TIMEOUT_MAX_MS
    );
  },

  buildLaunchEnvironment({ platform, torDir, environment = {} }) {
    const getEnvironmentKey = name =>
      Object.keys(environment).find(key => key.toUpperCase() === name) || name;
    const prepend = (key, separator) => {
      const current = environment[key];
      return current ? `${torDir}${separator}${current}` : torDir;
    };

    if (platform === 'WINNT') {
      const pathKey = getEnvironmentKey('PATH');
      return { [pathKey]: prepend(pathKey, ';') };
    }

    const ldLibraryPathKey = getEnvironmentKey('LD_LIBRARY_PATH');
    const dyldLibraryPathKey = getEnvironmentKey('DYLD_LIBRARY_PATH');
    return {
      [ldLibraryPathKey]: prepend(ldLibraryPathKey, ':'),
      [dyldLibraryPathKey]: prepend(dyldLibraryPathKey, ':'),
    };
  },

  canStartProcess({ shutdownStarted, stopRequested, stopPending, hasProcess }) {
    return !shutdownStarted && !stopRequested && !stopPending && !hasProcess;
  },

  shouldAttemptOnDemandStart({ torEnabled, torBinaryAvailable, isConnected }) {
    return torEnabled && torBinaryAvailable && !isConnected;
  },

  shouldAttemptPrewarm({
    prewarmEnabled,
    torEnabled,
    torBinaryAvailable,
    isConnected,
    state,
    hasStartPromise,
  }) {
    if (!prewarmEnabled || !torEnabled || !torBinaryAvailable || isConnected || hasStartPromise) {
      return false;
    }

    return state !== 'starting' && state !== 'bootstrapping';
  },

  shouldCleanupAfterWindowClose(remainingWindows) {
    return remainingWindows === 0;
  },

  shouldScheduleStopAfterLastWindow({ remainingWindows, hasProcess }) {
    return hasProcess && remainingWindows === 0;
  },
};
