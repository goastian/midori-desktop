import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  getEffectivePosition,
  getPosition,
  isPositionForcedByVerticalTabs,
} from '../src/browser/components/msidebar/SidebarPrefs.mjs';

function withPrefs(values, run) {
  const previous = globalThis.Services;
  globalThis.Services = {
    prefs: {
      getBoolPref: (name, fallback) => (name in values ? values[name] : fallback),
      getStringPref: (name, fallback) => (name in values ? values[name] : fallback),
    },
  };
  try {
    run();
  } finally {
    globalThis.Services = previous;
  }
}

test('without vertical tabs the stored sidebar position applies', () => {
  for (const stored of ['left', 'right']) {
    withPrefs({ 'midori.msidebar.position': stored }, () => {
      assert.equal(isPositionForcedByVerticalTabs(), false);
      assert.equal(getEffectivePosition(), stored);
    });
  }
});

test('with vertical tabs the sidebar moves to the opposite edge', () => {
  const cases = [
    ['left', 'right'],
    ['right', 'left'],
  ];
  for (const [tabsSide, expected] of cases) {
    for (const stored of ['left', 'right']) {
      withPrefs(
        {
          'midori.verticaltabs.enabled': true,
          'midori.verticaltabs.position': tabsSide,
          'midori.msidebar.position': stored,
        },
        () => {
          assert.equal(isPositionForcedByVerticalTabs(), true);
          assert.equal(getEffectivePosition(), expected);
          assert.equal(getPosition(), stored);
        }
      );
    }
  }
});

test('the legacy Arc mode preference also forces the opposite edge', () => {
  withPrefs({ 'midori.arcmode.enabled': true, 'midori.verticaltabs.position': 'left' }, () => {
    assert.equal(getEffectivePosition(), 'right');
  });
});

test('an invalid tabs side falls back to the default left side', () => {
  withPrefs({ 'midori.verticaltabs.enabled': true, 'midori.verticaltabs.position': 'top' }, () => {
    assert.equal(getEffectivePosition(), 'right');
  });
});

test('the settings position selector is locked while the position is forced', () => {
  const ui = readFileSync(
    new URL('../src/browser/components/msidebar/SidebarUI.mjs', import.meta.url),
    'utf8'
  );
  assert.match(ui, /positionSetting\.disabled = Prefs\.isPositionForcedByVerticalTabs\(\)/);
  assert.match(ui, /positionSetting\.value = Prefs\.getEffectivePosition\(\)/);
});
