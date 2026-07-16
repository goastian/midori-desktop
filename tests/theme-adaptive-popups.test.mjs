import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const readSource = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const source = readSource('../src/browser/themes/custom/shared/modblur.inc.css');
const adaptivePanelsStart = source.indexOf(
  '@media -moz-pref("midori.modblur.blur.extra") or -moz-pref("midori.modblur.blur.panels")',
);
const adaptivePanelsEnd = source.indexOf(
  '@media -moz-pref("midori.modblur.blur.extra") or -moz-pref("midori.modblur.blur.verticalExpand")',
  adaptivePanelsStart,
);
const adaptivePanels = source.slice(adaptivePanelsStart, adaptivePanelsEnd);

test('blurred panels inherit the selected Midori theme instead of forcing dark mode', () => {
  assert.ok(adaptivePanelsStart >= 0, 'the blurred-panel rules should exist');
  assert.ok(adaptivePanelsEnd > adaptivePanelsStart, 'the blurred-panel rules should have a stable boundary');

  assert.doesNotMatch(adaptivePanels, /color-scheme:\s*dark/);
  assert.doesNotMatch(adaptivePanels, /rgba\(29,\s*29,\s*32/);
  assert.doesNotMatch(adaptivePanels, /rgba\(255,\s*255,\s*255/);
  assert.match(adaptivePanels, /--panel-background:\s*color-mix\([^;]*var\(--pf-panel-bgcolor\)/);
  assert.match(adaptivePanels, /--panel-color:\s*var\(--pf-text-color\)/);
  assert.match(adaptivePanels, /--menuitem-hover-background-color:\s*var\(--pf-toolbar-bgcolor-hover\)/);
});

test('context menus avoid native system-theme painting and keep navigation icons legible', () => {
  assert.match(adaptivePanels, /menupopup:not\(#ContentSelectDropdownPopup\)\s*\{[\s\S]*?appearance:\s*none/);
  assert.match(adaptivePanels, /#context-navigation:not\(\[hidden\]\)[\s\S]*?fill:\s*var\(--pf-icon-color\)/);
  assert.match(
    adaptivePanels,
    /#context-navigation:not\(\[hidden\]\)[\s\S]*?background-color:\s*var\(--pf-toolbar-bgcolor-inactive\)/,
  );
});
