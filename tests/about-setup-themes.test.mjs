import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACTIVE_THEME_PREF,
  APPEARANCE_PREF,
  COLORWAY_PREF,
  DEFAULT_THEME_ID,
  SetupThemeSelection,
} from '../src/browser/components/setup/SetupThemeSelection.sys.mjs';

function fixture({ activeTheme = 'nova-tide@mozilla.org', fail = false } = {}) {
  const values = new Map([
    [ACTIVE_THEME_PREF, activeTheme],
    [COLORWAY_PREF, 'sunrise'],
    ['midori.gradient.enabled', true],
  ]);
  const calls = [];
  const prefs = {
    getStringPref: (key, fallback) => values.get(key) ?? fallback,
    setStringPref: (key, value) => values.set(key, value),
    setBoolPref: (key, value) => values.set(key, value),
    setIntPref: (key, value) => values.set(key, value),
    clearUserPref: key => values.delete(key),
  };
  const selection = new SetupThemeSelection({
    prefs,
    addonManager: {
      async getAddonByID(id) {
        assert.equal(id, DEFAULT_THEME_ID);
        return {
          async enable() {
            calls.push('enable-default');
            assert.equal(values.get(COLORWAY_PREF), 'sunrise');
            if (fail) throw new Error('Unavailable');
            values.set(ACTIVE_THEME_PREF, id);
          },
        };
      },
    },
    themes: {
      hasThemeId: id => id === 'nova-pine@mozilla.org',
      async updateThemeState(id, enabled) {
        calls.push(id);
        assert.equal(enabled, true);
        if (fail) return false;
        values.set(ACTIVE_THEME_PREF, id);
        return true;
      },
    },
  });
  return { selection, values, calls };
}

test('opening setup preserves an installed theme and every preference', () => {
  const { selection, values, calls } = fixture();
  const before = [...values];
  assert.deepEqual(selection.selection, { themeId: 'nova-tide@mozilla.org' });
  assert.deepEqual([...values], before);
  assert.deepEqual(calls, []);
});

test('choosing a Midori color activates the base theme before changing its palette', async () => {
  const { selection, values, calls } = fixture();
  await selection.select({ colorway: 'midnight' });
  assert.deepEqual(calls, ['enable-default']);
  assert.equal(values.get(ACTIVE_THEME_PREF), DEFAULT_THEME_ID);
  assert.equal(values.get(COLORWAY_PREF), 'midnight');
  assert.equal(values.get('midori.gradient.enabled'), false);
  assert.deepEqual(selection.selection, { colorway: 'midnight' });
});

test('Nova selection follows the addon manager and does not overwrite the stored Midori color', async () => {
  const { selection, values } = fixture({ activeTheme: DEFAULT_THEME_ID });
  await selection.select({ themeId: 'nova-pine@mozilla.org' });
  assert.equal(values.get(COLORWAY_PREF), 'sunrise');
  assert.deepEqual(selection.selection, { themeId: 'nova-pine@mozilla.org' });
  values.set(ACTIVE_THEME_PREF, 'another-theme@example.org');
  assert.deepEqual(selection.selection, { themeId: 'another-theme@example.org' });
});

test('failed activation or download preserves the previous selection', async () => {
  for (const target of [{ colorway: 'ocean' }, { themeId: 'nova-pine@mozilla.org' }]) {
    const { selection, values } = fixture({ fail: true });
    const before = [...values];
    await assert.rejects(selection.select(target));
    assert.deepEqual([...values], before);
  }
});

test('unknown colors and themes cannot alter browser preferences', async () => {
  const { selection, values, calls } = fixture();
  const before = [...values];
  await assert.rejects(selection.select({ colorway: 'invalid' }));
  await assert.rejects(selection.select({ themeId: 'untrusted@example.org' }));
  assert.deepEqual([...values], before);
  assert.deepEqual(calls, []);
});

test('appearance uses the Firefox preference and restores device-following mode', () => {
  const { selection, values } = fixture();
  selection.selectAppearance('dark');
  assert.equal(values.get(APPEARANCE_PREF), 1);
  selection.selectAppearance('light');
  assert.equal(values.get(APPEARANCE_PREF), 0);
  selection.selectAppearance('system');
  assert.equal(values.has(APPEARANCE_PREF), false);
});
