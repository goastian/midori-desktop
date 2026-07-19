import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { MidoriTorLifecycle } from '../src/browser/components/tor/MidoriTorLifecycle.sys.mjs';

const torSource = await readFile(
  new URL('../src/browser/components/tor/MidoriTor.sys.mjs', import.meta.url),
  'utf8'
);

test('on-demand flow: starts only when Tor is enabled, binary exists and not connected', () => {
  assert.equal(
    MidoriTorLifecycle.shouldAttemptOnDemandStart({
      torEnabled: true,
      torBinaryAvailable: true,
      isConnected: false,
    }),
    true
  );

  assert.equal(
    MidoriTorLifecycle.shouldAttemptOnDemandStart({
      torEnabled: true,
      torBinaryAvailable: true,
      isConnected: true,
    }),
    false
  );

  assert.equal(
    MidoriTorLifecycle.shouldAttemptOnDemandStart({
      torEnabled: false,
      torBinaryAvailable: true,
      isConnected: false,
    }),
    false
  );
});

test('prewarm flow: idle prewarm is skipped when prewarm pref is disabled', () => {
  assert.equal(
    MidoriTorLifecycle.shouldAttemptPrewarm({
      prewarmEnabled: false,
      torEnabled: true,
      torBinaryAvailable: true,
      isConnected: false,
      state: 'disconnected',
      hasStartPromise: false,
    }),
    false
  );

  assert.equal(
    MidoriTorLifecycle.shouldAttemptPrewarm({
      prewarmEnabled: true,
      torEnabled: true,
      torBinaryAvailable: true,
      isConnected: false,
      state: 'disconnected',
      hasStartPromise: false,
    }),
    true
  );
});

test('configurable timeout: bootstrap and stop-after-last-window values are clamped', () => {
  assert.equal(MidoriTorLifecycle.getBootstrapTimeoutMs(200000), 200000);
  assert.equal(MidoriTorLifecycle.getBootstrapTimeoutMs(1000), 15000);
  assert.equal(MidoriTorLifecycle.getBootstrapTimeoutMs(999999), 300000);

  assert.equal(MidoriTorLifecycle.getStopAfterLastWindowMs(15000), 15000);
  assert.equal(MidoriTorLifecycle.getStopAfterLastWindowMs(1000), 5000);
  assert.equal(MidoriTorLifecycle.getStopAfterLastWindowMs(999999), 120000);

  assert.equal(MidoriTorLifecycle.getPrewarmIdleTimeoutMs(12000), 12000);
  assert.equal(MidoriTorLifecycle.getPrewarmIdleTimeoutMs(100), 1000);
  assert.equal(MidoriTorLifecycle.getPrewarmIdleTimeoutMs(999999), 120000);

  assert.equal(MidoriTorLifecycle.getShutdownTimeoutMs(4000), 4000);
  assert.equal(MidoriTorLifecycle.getShutdownTimeoutMs(100), 1000);
  assert.equal(MidoriTorLifecycle.getShutdownTimeoutMs(999999), 15000);
});

test('process launch: bundled libraries are resolved without a shell wrapper', () => {
  assert.deepEqual(
    MidoriTorLifecycle.buildLaunchEnvironment({
      platform: 'WINNT',
      torDir: 'C:\\Midori\\Tor',
      environment: { Path: 'C:\\Windows\\System32' },
    }),
    { Path: 'C:\\Midori\\Tor;C:\\Windows\\System32' }
  );

  assert.deepEqual(
    MidoriTorLifecycle.buildLaunchEnvironment({
      platform: 'Linux',
      torDir: '/opt/midori/tor',
      environment: {
        LD_LIBRARY_PATH: '/usr/local/lib',
        DYLD_LIBRARY_PATH: '',
      },
    }),
    {
      LD_LIBRARY_PATH: '/opt/midori/tor:/usr/local/lib',
      DYLD_LIBRARY_PATH: '/opt/midori/tor',
    }
  );
});

test('shutdown: Tor is a formal blocker and the tracked process owns the Windows job', () => {
  assert.match(torSource, /AsyncShutdown\.appShutdownConfirmed\.addBlocker/);
  assert.match(torSource, /Subprocess\.call\(/);
  assert.match(torSource, /await this\.stop\(\{ reason: 'shutdown' \}\)/);
  assert.doesNotMatch(torSource, /midori-tor-wrapper-win\.bat/);
  assert.doesNotMatch(torSource, /addObserver\(this, 'quit-application(?:-granted)?'\)/);
});

test('start guard: shutdown, a pending stop or a tracked process prevents another Tor launch', () => {
  assert.equal(
    MidoriTorLifecycle.canStartProcess({
      shutdownStarted: false,
      stopRequested: false,
      stopPending: false,
      hasProcess: false,
    }),
    true
  );
  assert.equal(
    MidoriTorLifecycle.canStartProcess({
      shutdownStarted: true,
      stopRequested: false,
      stopPending: false,
      hasProcess: false,
    }),
    false
  );
  assert.equal(
    MidoriTorLifecycle.canStartProcess({
      shutdownStarted: false,
      stopRequested: true,
      stopPending: false,
      hasProcess: false,
    }),
    false
  );
  assert.equal(
    MidoriTorLifecycle.canStartProcess({
      shutdownStarted: false,
      stopRequested: false,
      stopPending: false,
      hasProcess: true,
    }),
    false
  );
  assert.equal(
    MidoriTorLifecycle.canStartProcess({
      shutdownStarted: false,
      stopRequested: false,
      stopPending: true,
      hasProcess: false,
    }),
    false
  );
});

test('cleanup: cleanup/stop is triggered only after closing the last Tor window', () => {
  assert.equal(MidoriTorLifecycle.shouldCleanupAfterWindowClose(2), false);
  assert.equal(MidoriTorLifecycle.shouldCleanupAfterWindowClose(1), false);
  assert.equal(MidoriTorLifecycle.shouldCleanupAfterWindowClose(0), true);

  assert.equal(
    MidoriTorLifecycle.shouldScheduleStopAfterLastWindow({
      remainingWindows: 0,
      hasProcess: true,
    }),
    true
  );
  assert.equal(
    MidoriTorLifecycle.shouldScheduleStopAfterLastWindow({
      remainingWindows: 1,
      hasProcess: true,
    }),
    false
  );
});
