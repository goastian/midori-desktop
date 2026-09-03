import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MidoriSmoothScrollController,
  migrateLegacySmoothfoxPreferences,
  selectSmoothScrollProfile,
} from '../src/browser/components/lifecycle/MidoriSmoothScroll.sys.mjs';

const BASE_PREFERENCES = {
  'general.smoothScroll.currentVelocityWeighting': '0.25',
  'general.smoothScroll.msdPhysics.continuousMotionMaxDeltaMS': 120,
  'general.smoothScroll.msdPhysics.enabled': false,
  'general.smoothScroll.msdPhysics.motionBeginSpringConstant': 1250,
  'general.smoothScroll.msdPhysics.regularSpringConstant': 1000,
  'general.smoothScroll.msdPhysics.slowdownMinDeltaMS': 12,
  'general.smoothScroll.msdPhysics.slowdownMinDeltaRatio': '1.3',
  'general.smoothScroll.msdPhysics.slowdownSpringConstant': 2000,
  'general.smoothScroll.stopDecelerationWeighting': '0.4',
  'mousewheel.default.delta_multiplier_y': 275,
};

function createPreferenceBranch(initialValues) {
  const values = new Map(Object.entries(initialValues));
  return {
    values,
    getBoolPref: name => values.get(name),
    getIntPref: name => values.get(name),
    getStringPref: name => values.get(name),
    setBoolPref: (name, value) => values.set(name, value),
    setIntPref: (name, value) => values.set(name, value),
    setStringPref: (name, value) => values.set(name, value),
  };
}

function createWindow(refreshRate) {
  const listeners = new Map();
  const windowRoot = {
    addEventListener(type, listener) {
      listeners.set(`root:${type}`, listener);
    },
    removeEventListener(type) {
      listeners.delete(`root:${type}`);
    },
  };
  return {
    refreshRate,
    listeners,
    windowRoot,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
  };
}

test('refresh rates select exactly one matching scroll profile', () => {
  assert.equal(selectSmoothScrollProfile(0), '60hz');
  assert.equal(selectSmoothScrollProfile(60), '60hz');
  assert.equal(selectSmoothScrollProfile(90), '90hz');
  assert.equal(selectSmoothScrollProfile(119), '90hz');
  assert.equal(selectSmoothScrollProfile(120), '120hz');
  assert.equal(selectSmoothScrollProfile(144), '120hz');
});

test('the 120 Hz recipe is applied only while the active display supports it', () => {
  const branch = createPreferenceBranch(BASE_PREFERENCES);
  const win = createWindow(60);
  const observers = new Map();
  const controller = new MidoriSmoothScrollController({
    defaultBranch: branch,
    observerService: {
      addObserver(observer, topic) {
        observers.set(topic, observer);
      },
      removeObserver(_observer, topic) {
        observers.delete(topic);
      },
    },
    windowMediator: {
      getEnumerator: () => [win],
      getMostRecentWindow: () => win,
    },
    focusManager: { activeWindow: win },
    isWindowSupported: () => true,
    readRefreshRate: currentWindow => currentWindow.refreshRate,
  });

  controller.init();
  assert.deepEqual(controller.getState(), {
    profile: '60hz',
    refreshRate: 60,
  });
  assert.equal(
    branch.values.get('general.smoothScroll.msdPhysics.enabled'),
    false
  );

  win.refreshRate = 120;
  win.listeners.get('root:MozUpdateWindowPos').handleEvent();
  assert.deepEqual(controller.getState(), {
    profile: '120hz',
    refreshRate: 120,
  });
  assert.equal(
    branch.values.get(
      'general.smoothScroll.msdPhysics.motionBeginSpringConstant'
    ),
    600
  );

  win.refreshRate = 60;
  observers.get('screen-information-changed').observe(
    null,
    'screen-information-changed'
  );
  assert.deepEqual(controller.getState(), {
    profile: '60hz',
    refreshRate: 60,
  });
  assert.deepEqual(Object.fromEntries(branch.values), BASE_PREFERENCES);

  controller.uninit();
  assert.equal(observers.size, 0);
  assert.equal(win.listeners.size, 0);
});

test('migration removes legacy forced values without replacing custom values', () => {
  const userValues = new Map([
    ['general.smoothScroll.msdPhysics.enabled', true],
    ['mousewheel.default.delta_multiplier_y', 175],
  ]);
  const preferences = {
    getIntPref(name, fallback) {
      return userValues.get(name) ?? fallback;
    },
    getBoolPref: name => userValues.get(name),
    getStringPref: name => userValues.get(name),
    prefHasUserValue: name => userValues.has(name),
    clearUserPref: name => userValues.delete(name),
    setIntPref: (name, value) => userValues.set(name, value),
  };

  assert.equal(migrateLegacySmoothfoxPreferences(preferences), true);
  assert.equal(
    userValues.has('general.smoothScroll.msdPhysics.enabled'),
    false
  );
  assert.equal(userValues.get('mousewheel.default.delta_multiplier_y'), 175);
  assert.equal(userValues.get('midori.smoothScroll.migrationVersion'), 1);
  assert.equal(migrateLegacySmoothfoxPreferences(preferences), false);
});
