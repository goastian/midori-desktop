function createXul(doc, tag) {
  if (doc.createXULElement) return doc.createXULElement(tag);
  return doc.createElement(tag);
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
