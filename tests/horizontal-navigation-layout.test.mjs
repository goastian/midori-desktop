import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stylesheet = readFileSync(
  new URL(
    '../src/browser/themes/custom/shared/shared.inc.css',
    import.meta.url
  ),
  'utf8'
);

test('the horizontal application menu stays at the trailing edge', () => {
  const navigationRules = stylesheet.slice(
    stylesheet.indexOf(':root[midori-horizontal-tabs] #nav-bar-customization-target'),
    stylesheet.indexOf('@media (max-width: 768px)')
  );
  const panelRule = stylesheet.slice(
    stylesheet.indexOf(':root[midori-horizontal-tabs] #PanelUI-button'),
    stylesheet.indexOf('@media (max-width: 768px)')
  );

  assert.match(navigationRules, /#nav-bar-customization-target\s*\{[^}]*flex:\s*1 1 auto\s*!important/s);
  assert.match(navigationRules, /#urlbar-container\s*\{[^}]*max-width:\s*none\s*!important/s);
  assert.match(panelRule, /margin-inline-start:\s*var\(--pf-separation\)\s*!important/);
  assert.match(panelRule, /margin-inline-end:\s*0\s*!important/);
  assert.doesNotMatch(panelRule, /100vw|pf-urlbar-width-max/);
});

test('horizontal toolbar order follows the selected setup layout', () => {
  const navigationRules = stylesheet.slice(
    stylesheet.indexOf('/* ------------------------------------------------------------------\n   Horizontal navigation'),
    stylesheet.indexOf('/* ------------------------------------------------------------------\n   Vertical navigation')
  );

  assert.match(navigationRules, /#nav-bar\s*\{[^}]*order:\s*1\s*!important/s);
  assert.match(navigationRules, /#TabsToolbar\s*\{[^}]*order:\s*2\s*!important/s);
  assert.match(
    navigationRules,
    /\[midori-tabs-layout="tabs-top"\][^{]*#TabsToolbar\s*\{[^}]*order:\s*1\s*!important/s
  );
  assert.match(
    navigationRules,
    /\[midori-tabs-layout="tabs-top"\][^{]*#nav-bar\s*\{[^}]*order:\s*2\s*!important/s
  );
});
