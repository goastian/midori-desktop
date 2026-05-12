function createXul(doc, tag) {
  if (doc.createXULElement) return doc.createXULElement(tag);
  return doc.createElement(tag);
}

export const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

function setDeviceSizeIsPageSize(browser, enabled) {
  const next = !!enabled;
  try {
    if (browser?.browsingContext?.currentWindowGlobal?.documentShell) {
      browser.browsingContext.currentWindowGlobal.documentShell.deviceSizeIsPageSize = next;
      return;
    }
  } catch {}
  try {
    if (browser?.docShell) {
      browser.docShell.deviceSizeIsPageSize = next;
      return;
    }
  } catch {}
  try {
    if (browser?.remoteType && browser.browsingContext && typeof browser.browsingContext.setDefaultLoadFlags === 'function') {
      // Best effort for RemoteAgent-driven browsers when direct docShell is not reachable.
      browser.browsingContext.deviceSizeIsPageSize = next;
    }
  } catch {}
}

export function applyBrowserMobileView(browser, mobileEnabled) {
  if (!browser) return;
  const enabled = !!mobileEnabled;
  try {
    browser.customUserAgent = enabled ? MOBILE_USER_AGENT : '';
  } catch {}
  setDeviceSizeIsPageSize(browser, enabled);
}

export function createPanelBrowser(win, panel) {
  const doc = win.document;
  const browser = createXul(doc, 'browser');
  browser.setAttribute('type', 'content');
  browser.setAttribute('remote', 'true');
  browser.setAttribute('flex', '1');
  browser.setAttribute('maychangeremoteness', 'true');
  browser.setAttribute('messagemanagergroup', 'midori-msidebar');
  if (panel?.userContextId) {
    browser.setAttribute('usercontextid', String(panel.userContextId));
  }
  if (panel?.url) {
    browser.setAttribute('src', panel.url);
  }
  applyBrowserMobileView(browser, !!panel?.mobile);
  return browser;
}

export function setBrowserUrl(browser, url) {
  if (!browser || !url) return;
  browser.setAttribute('src', url);
}

export function destroyBrowser(browser) {
  try {
    browser.remove();
  } catch {}
}
