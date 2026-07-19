import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const securefox = readSource('../src/browser/app/profile/Securefox.js');
const chrome = readSource('../src/browser/themes/custom/shared/shared.inc.css');
const permissionAnchorsStart = chrome.indexOf(
  '#identity-box[pageproxystate="invalid"]:has(> #notification-popup-box:not([hidden]))'
);
const permissionAnchorsEnd = chrome.indexOf(
  '#urlbar:not([open]) #identity-box[pageproxystate="invalid"]',
  permissionAnchorsStart
);
const permissionAnchors = chrome.slice(permissionAnchorsStart, permissionAnchorsEnd);

test('location keeps the per-site ask default', () => {
  assert.match(securefox, /user_pref\("permissions\.default\.geo", 0\);/);
  assert.doesNotMatch(securefox, /user_pref\("permissions\.default\.geo", 2\);/);
});

test('permission anchors remain interactive while the urlbar proxy is invalid', () => {
  assert.ok(permissionAnchorsStart >= 0);
  assert.ok(permissionAnchorsEnd > permissionAnchorsStart);
  assert.match(
    permissionAnchors,
    /#identity-box\[pageproxystate="invalid"\]:has\(> #notification-popup-box:not\(\[hidden\]\)\)/,
  );
  assert.match(
    permissionAnchors,
    /#identity-box\[pageproxystate="invalid"\] > #notification-popup-box:not\(\[hidden\]\)/,
  );
  assert.match(
    permissionAnchors,
    /#identity-box\[pageproxystate="invalid"\]:has\(> #identity-permission-box:is\(\[open="true"\], \[hasPermissions\], \[hasSharingIcon\]\)\)/,
  );
  assert.match(permissionAnchors, /pointer-events:\s*auto\s*!important/);
  assert.match(permissionAnchors, /-moz-user-focus:\s*normal\s*!important/);
});

test('blocked permission indicators remain under Firefox visibility control', () => {
  assert.doesNotMatch(
    chrome,
    /#identity-permission-box\s*>\s*#blocked-permissions-container\s*,/,
  );
  assert.doesNotMatch(
    chrome,
    /#identity-permission-box\s*>\s*#blocked-permissions-container\s*\{[^}]*display:\s*none\s*!important/s,
  );
});
