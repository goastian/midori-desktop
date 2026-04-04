import test from 'node:test';
import assert from 'node:assert/strict';

import { MidoriTorLifecycle } from '../src/browser/components/tor/MidoriTorLifecycle.sys.mjs';

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
