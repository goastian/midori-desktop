/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { ResourcePausedTab } = ChromeUtils.importESModule('resource:///modules/ResourcePausedTab.sys.mjs');
const state = ResourcePausedTab.getState(window.browsingContext);
const resume = document.getElementById('resume');
document.getElementById('paused-page').textContent = state?.title || '';
resume.disabled = !state;
resume.addEventListener('click', () => {
  resume.disabled = true;
  try {
    if (!ResourcePausedTab.resumeContext(window.browsingContext)) throw new Error('pause-unavailable');
  } catch {
    document.l10n.setAttributes(document.getElementById('pause-status'), 'midori-performance-paused-error');
    resume.disabled = false;
  }
});
document.getElementById('settings').addEventListener('click', () => {
  const win = window.browsingContext.topChromeWindow;
  win.gBrowser.selectedTab = win.gBrowser.addTrustedTab('about:center#performance');
});
