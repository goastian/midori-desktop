function createXul(doc, tag) {
  if (doc.createXULElement) return doc.createXULElement(tag);
  return doc.createElement(tag);
}

function bestEffortHostFromBrowser(browser) {
  try {
    const spec = browser?.currentURI?.spec;
    if (spec) return new URL(spec).hostname || '';
  } catch {}
  try {
    const bcSpec = browser?.browsingContext?.currentURI?.spec;
    if (bcSpec) return new URL(bcSpec).hostname || '';
  } catch {}
  return '';
}

function promptMessageForKind(kind, host) {
  const site = host || 'this site';
  switch (kind) {
    case 'media':
      return `${site} wants to use your camera or microphone.`;
    case 'geolocation':
      return `${site} wants to know your location.`;
    default:
      return `${site} requests additional permissions.`;
  }
}

function promptAnchorForKind(kind) {
  switch (kind) {
    case 'media':
      return 'webRTC-shareDevices-notification-icon';
    case 'geolocation':
      return 'geo-notification-icon';
    default:
      return 'default-notification-icon';
  }
}

function subjectMatchesBrowser(subject, browser) {
  let browserTopId = null;
  try {
    browserTopId = browser?.browsingContext?.top?.id || browser?.browsingContext?.id || null;
  } catch {}
  if (!browserTopId) return false;

  let subjectTopId = null;
  try {
    subjectTopId = subject?.topBrowsingContextId || subject?.browsingContext?.top?.id || subject?.browsingContext?.id || null;
  } catch {}
  if (!subjectTopId) return false;

  return subjectTopId === browserTopId;
}

export function createPanelPromptAdapter(win, browser, options = {}) {
  const rootWin = win?.top || win;
  const popupNotifications = options.popupNotifications || rootWin?.PopupNotifications || null;
  const rootBrowser = rootWin?.gBrowser?.selectedBrowser || null;

  const notifyPrompt = (kind, detail = {}) => {
    const host = detail.host || bestEffortHostFromBrowser(browser);
    const message = detail.message || promptMessageForKind(kind, host);
    const id = `midori-msidebar-${kind}-prompt`;
    const anchorID = detail.anchorID || promptAnchorForKind(kind);

    if (!popupNotifications || typeof popupNotifications.show !== 'function') {
      return false;
    }

    let allowLabel = 'Allow';
    if (kind === 'media') allowLabel = 'Allow camera/mic';
    if (kind === 'geolocation') allowLabel = 'Allow location';

    const mainAction = {
      label: allowLabel,
      accessKey: 'A',
      callback() {
        options.onDecision?.(kind, true, detail);
      },
    };

    const secondaryActions = [
      {
        label: 'Block',
        accessKey: 'B',
        callback() {
          options.onDecision?.(kind, false, detail);
        },
      },
    ];

    try {
      popupNotifications.show(browser, id, message, anchorID, mainAction, secondaryActions, {
        persistent: true,
        hideClose: false,
      });
      options.onPromptShown?.(kind, detail);
      return true;
    } catch {
      return false;
    }
  };

  // Compatibility surface for sidebar panel <browser> elements.
  const compat = {
    get webNavigation() {
      return browser?.webNavigation || rootBrowser?.webNavigation || null;
    },
    requestPermission(kind, detail = {}) {
      return notifyPrompt(kind, detail);
    },
    requestGeolocation(detail = {}) {
      return notifyPrompt('geolocation', detail);
    },
    requestMedia(detail = {}) {
      return notifyPrompt('media', detail);
    },
  };

  try {
    browser.midoriBrowserDOMWindow = compat;
  } catch {}

  const onPermissionPrompt = (event) => {
    notifyPrompt('permission', event?.detail || {});
  };
  const onGeoPrompt = (event) => {
    notifyPrompt('geolocation', event?.detail || {});
  };
  const onMediaPrompt = (event) => {
    notifyPrompt('media', event?.detail || {});
  };

  try {
    browser.addEventListener('midori-msidebar-permission-prompt', onPermissionPrompt, true);
    browser.addEventListener('midori-msidebar-geolocation-prompt', onGeoPrompt, true);
    browser.addEventListener('midori-msidebar-media-prompt', onMediaPrompt, true);
  } catch {}

  const observerTopics = [
    ['getUserMedia:request', 'media'],
    ['geolocation-device-events', 'geolocation'],
    ['permissions-prompt', 'permission'],
  ];
  const obsHandlers = [];

  for (const [topic, kind] of observerTopics) {
    const handler = {
      observe(subject) {
        if (!subjectMatchesBrowser(subject, browser)) return;
        notifyPrompt(kind, {});
      },
    };
    try {
      Services?.obs?.addObserver(handler, topic);
      obsHandlers.push({ topic, handler });
    } catch {}
  }

  return {
    compat,
    requestPermission(kind, detail = {}) {
      return notifyPrompt(kind, detail);
    },
    destroy() {
      try {
        browser.removeEventListener('midori-msidebar-permission-prompt', onPermissionPrompt, true);
      } catch {}
      try {
        browser.removeEventListener('midori-msidebar-geolocation-prompt', onGeoPrompt, true);
      } catch {}
      try {
        browser.removeEventListener('midori-msidebar-media-prompt', onMediaPrompt, true);
      } catch {}
      for (const item of obsHandlers) {
        try {
          Services?.obs?.removeObserver(item.handler, item.topic);
        } catch {}
      }
      try {
        if (browser.midoriBrowserDOMWindow === compat) {
          delete browser.midoriBrowserDOMWindow;
        }
      } catch {}
    },
  };
}

export function createPanelNotificationBridge(browser, { onIncrement } = {}) {
  const emitIncrement = (amount = 1) => {
    const next = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 1;
    if (!next) return;
    onIncrement?.(next);
  };

  const onSynthetic = (event) => {
    const next = event?.detail?.count;
    emitIncrement(typeof next === 'number' ? next : 1);
  };

  const onDomNotification = () => {
    emitIncrement(1);
  };

  try {
    browser.addEventListener('midori-msidebar-notification', onSynthetic, true);
    browser.addEventListener('DOMWebNotificationShown', onDomNotification, true);
  } catch {}

  return {
    increment(amount = 1) {
      emitIncrement(amount);
    },
    destroy() {
      try {
        browser.removeEventListener('midori-msidebar-notification', onSynthetic, true);
      } catch {}
      try {
        browser.removeEventListener('DOMWebNotificationShown', onDomNotification, true);
      } catch {}
    },
  };
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

export function destroyBrowser(browser) {
  try {
    browser.remove();
  } catch {}
}
