import test from 'node:test';
import assert from 'node:assert/strict';

import { TabSleepLifecycle } from '../src/browser/components/tabsleep/TabSleepLifecycle.sys.mjs';

test('timeout configuration: defaults and bounds are enforced', () => {
  assert.equal(TabSleepLifecycle.getTimeoutMinutes(undefined), 10);
  assert.equal(TabSleepLifecycle.getTimeoutMinutes(0), 1);
  assert.equal(TabSleepLifecycle.getTimeoutMinutes(10), 10);
  assert.equal(TabSleepLifecycle.getTimeoutMinutes(5000), 1440);
  assert.equal(TabSleepLifecycle.getTimeoutMs(10), 600000);
});

test('host normalization: trims and lowercases host exclusions', () => {
  assert.deepEqual(TabSleepLifecycle.normalizeHosts(' Example.com, foo.bar ,, BAZ.test '), [
    'example.com',
    'foo.bar',
    'baz.test',
  ]);
  assert.equal(TabSleepLifecycle.isHostExcluded('Example.com', ['example.com']), true);
  assert.equal(TabSleepLifecycle.isUriExcluded('about:preferences'), true);
  assert.equal(TabSleepLifecycle.isUriExcluded('https://astian.org'), false);
});

test('discard decision: due inactive tabs are discarded, guarded tabs are skipped', () => {
  const now = 1_000_000;
  const baseState = {
    now,
    timeoutMs: 600000,
    lastActivityAt: 1000,
    lastAccessedAt: 1000,
    selected: false,
    multiselected: false,
    pinned: false,
    closing: false,
    discarded: false,
    busy: false,
    soundPlaying: false,
    attention: false,
    hasLinkedPanel: true,
    autoDiscardable: true,
    uriSpec: 'https://astian.org/docs',
    host: 'astian.org',
    excludedHosts: [],
  };

  assert.equal(TabSleepLifecycle.shouldDiscardTab(baseState), true);
  assert.equal(
    TabSleepLifecycle.shouldDiscardTab({
      ...baseState,
      selected: true,
    }),
    false
  );
  assert.equal(
    TabSleepLifecycle.shouldDiscardTab({
      ...baseState,
      soundPlaying: true,
    }),
    false
  );
  assert.equal(
    TabSleepLifecycle.shouldDiscardTab({
      ...baseState,
      uriSpec: 'about:newtab',
    }),
    false
  );
  assert.equal(
    TabSleepLifecycle.shouldDiscardTab({
      ...baseState,
      host: 'astian.org',
      excludedHosts: ['astian.org'],
    }),
    false
  );
});

test('scheduler delay: next evaluation is bounded and follows earliest deadline', () => {
  assert.equal(
    TabSleepLifecycle.getNextEvaluationDelayMs({
      now: 1000,
      timeoutMs: 600000,
      candidates: [
        { lastActivityAt: 1000, lastAccessedAt: 1000 },
        { lastActivityAt: 5000, lastAccessedAt: 5000 },
      ],
    }),
    30000
  );

  assert.equal(
    TabSleepLifecycle.getNextEvaluationDelayMs({
      now: 610000,
      timeoutMs: 600000,
      candidates: [{ lastActivityAt: 1000, lastAccessedAt: 1000 }],
    }),
    1000
  );
});