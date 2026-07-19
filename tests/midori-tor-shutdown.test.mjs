import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as waitForImmediate } from 'node:timers/promises';

import { MidoriTorLifecycle } from '../src/browser/components/tor/MidoriTorLifecycle.sys.mjs';

const moduleStubs = {
  AsyncShutdown: {
    appShutdownConfirmed: {
      isClosed: false,
      addBlocker() {},
    },
  },
  BrowserWindowTracker: {},
  MidoriTorLifecycle,
  PrivateBrowsingUtils: {},
  Subprocess: {},
};

globalThis.ChromeUtils = {
  defineESModuleGetters(target, modules) {
    for (const name of Object.keys(modules)) {
      Object.defineProperty(target, name, {
        configurable: true,
        get: () => moduleStubs[name],
      });
    }
  },
};

const { MidoriTor } = await import('../src/browser/components/tor/MidoriTor.sys.mjs');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createHarness(process = null) {
  const tor = Object.create(MidoriTor);
  Object.assign(tor, {
    _state: 'connected',
    _process: process,
    _processExitPromise: null,
    _launchPromise: null,
    _startPromise: null,
    _stopPromise: null,
    _stopRequested: false,
    _shutdownStarted: false,
    _shutdownPromise: null,
    _bootstrapProgress: 100,
    _processFailed: false,
    _exitNodeIP: null,
    _exitNodeCountry: null,
    _circuitPath: [],
    _cancelStopAfterLastWindowTimer() {},
    _removeTorHardening() {},
    _stopCircuitInfoPolling() {},
    _getShutdownTimeoutMs: () => 5000,
    _withTimeout: promise => promise,
    _trace() {},
    _setState(state) {
      this._state = state;
    },
  });
  return tor;
}

function createProcess(exit) {
  let killCount = 0;
  return {
    pid: 42,
    wait: () => exit.promise,
    kill() {
      killCount++;
      return exit.promise;
    },
    get killCount() {
      return killCount;
    },
  };
}

test('stop shares one operation and resolves only after the tracked process exits', async () => {
  const exit = deferred();
  const process = createProcess(exit);
  const tor = createHarness(process);
  tor._watchProcessExit(process);

  const first = tor.stop({ reason: 'test' });
  const second = tor.stop({ reason: 'test-again' });
  assert.strictEqual(first, second);
  await Promise.resolve();
  assert.equal(process.killCount, 1);

  let settled = false;
  first.then(() => {
    settled = true;
  });
  await Promise.resolve();
  assert.equal(settled, false);

  exit.resolve({ exitCode: -9 });
  assert.equal(await first, true);
  assert.equal(tor._process, null);
  assert.equal(tor._state, 'disconnected');
});

test('a late callback from an old process cannot clear the current process', () => {
  const oldProcess = { pid: 1 };
  const currentProcess = { pid: 2 };
  const tor = createHarness(currentProcess);

  tor._handleProcessExit(oldProcess, { exitCode: 0 });

  assert.strictEqual(tor._process, currentProcess);
  assert.equal(tor._state, 'connected');
});

test('process exit keeps the start guard active until the shared stop operation finishes', () => {
  const process = { pid: 3 };
  const tor = createHarness(process);
  tor._state = 'stopping';
  tor._stopRequested = true;
  tor._stopPromise = new Promise(() => {});

  tor._handleProcessExit(process, { exitCode: -9 });

  assert.equal(tor._stopRequested, true);
  assert.equal(
    MidoriTorLifecycle.canStartProcess({
      shutdownStarted: tor._shutdownStarted,
      stopRequested: tor._stopRequested,
      stopPending: !!tor._stopPromise,
      hasProcess: !!tor._process,
    }),
    false
  );
});

test('shutdown waits for a launch already in flight and kills the process that appears', async () => {
  const launch = deferred();
  const exit = deferred();
  const process = createProcess(exit);
  const tor = createHarness();
  tor._state = 'starting';
  tor._launchPromise = launch.promise;

  const startContinuation = launch.promise.then(launchedProcess => {
    tor._launchPromise = null;
    tor._process = launchedProcess;
    tor._watchProcessExit(launchedProcess);
  });
  tor._startPromise = startContinuation;

  const first = tor.shutdown();
  const second = tor.shutdown();
  assert.strictEqual(first, second);

  launch.resolve(process);
  await startContinuation;
  await waitForImmediate();
  assert.equal(process.killCount, 1);
  exit.resolve({ exitCode: -9 });

  await first;
  assert.equal(tor._process, null);
  assert.equal(tor._shutdownStarted, true);
});

test('a stop timeout preserves the process reference and blocks a duplicate launch', async () => {
  const exit = deferred();
  const process = createProcess(exit);
  const tor = createHarness(process);
  tor._withTimeout = async (_promise, _timeoutMs, fallback) => fallback;

  assert.equal(await tor.stop({ reason: 'timeout-test' }), false);
  assert.strictEqual(tor._process, process);
  assert.equal(tor._state, 'error');
  assert.equal(
    MidoriTorLifecycle.canStartProcess({
      shutdownStarted: tor._shutdownStarted,
      stopRequested: tor._stopRequested,
      stopPending: !!tor._stopPromise,
      hasProcess: !!tor._process,
    }),
    false
  );

  tor._handleProcessExit(process, { exitCode: -9 });
  assert.equal(tor._stopRequested, false);
  assert.equal(
    MidoriTorLifecycle.canStartProcess({
      shutdownStarted: tor._shutdownStarted,
      stopRequested: tor._stopRequested,
      stopPending: !!tor._stopPromise,
      hasProcess: !!tor._process,
    }),
    true
  );
});

test('shutdown retries a timed-out stop and sends a final force-kill', async () => {
  const exit = deferred();
  const process = createProcess(exit);
  const tor = createHarness(process);
  let timeoutCount = 0;
  tor._withTimeout = async (promise, _timeoutMs, fallback) => {
    timeoutCount++;
    return timeoutCount <= 2 ? fallback : promise;
  };

  let settled = false;
  const shutdown = tor.shutdown().then(() => {
    settled = true;
  });
  await waitForImmediate();

  assert.equal(process.killCount, 3);
  assert.equal(settled, false);

  exit.resolve({ exitCode: -9 });
  await shutdown;
  assert.equal(settled, true);
  assert.equal(tor._process, null);
});

test('a rejected kill is reported as a failure instead of a timeout', async () => {
  const exit = deferred();
  const process = {
    pid: 77,
    wait: () => exit.promise,
    kill: () => Promise.reject(new Error('kill failed')),
  };
  const tor = createHarness(process);
  const events = [];
  tor._trace = event => events.push(event);

  assert.equal(await tor.stop({ reason: 'kill-failure-test' }), false);
  assert.equal(events.includes('stop-failed'), true);
  assert.equal(events.includes('stop-timeout'), false);
  assert.strictEqual(tor._process, process);
});
