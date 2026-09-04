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

test('the horizontal new-tab button is centered in its periphery container', () => {
  const alignmentRule = stylesheet.slice(
    stylesheet.indexOf(':root:not([midori-vertical-tabs])'),
    stylesheet.indexOf('#fxa-avatar-label')
  );

  assert.match(alignmentRule, /#tabbrowser-arrowscrollbox-periphery/);
  assert.match(alignmentRule, /align-items:\s*center\s*!important/);
  assert.doesNotMatch(alignmentRule, /translateY\(1px\)/);
});
