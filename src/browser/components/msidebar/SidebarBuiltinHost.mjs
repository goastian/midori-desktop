/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const PERFORMANCE_PANEL_ID = '@midori-performance';

export function createPerformanceBrowser(win, boxArea) {
  const browser = win.document.createElementNS('http://www.w3.org/1999/xhtml', 'iframe');
  browser.setAttribute('data-midori-builtin', 'performance');
  browser.style.cssText = 'width:100%;height:100%;border:0;flex:1;';
  browser.setAttribute('src', 'chrome://browser/content/performance/performance.html?sidebar');
  const update = () => {
    const document = browser.contentDocument;
    if (!document?.defaultView) return;
    document.dispatchEvent(new document.defaultView.CustomEvent('MidoriPerformanceVisibility', {
      detail: boxArea.getAttribute('collapsed') !== 'true',
    }));
  };
  const observer = new win.MutationObserver(update);
  observer.observe(boxArea, { attributes: true, attributeFilter: ['collapsed'] });
  browser.addEventListener('load', update, { once: true });
  return { browser, destroy: () => observer.disconnect() };
}
