import test from 'node:test';
import assert from 'node:assert/strict';

import { validateStore } from '../src/browser/components/msidebar/SidebarModel.mjs';
import { isReservedBrowserShortcut } from '../src/browser/components/shortcuts/ShortcutPolicy.sys.mjs';
import {
  applyBrowserMobileView,
  createPanelNotificationBridge,
  createPanelPromptAdapter,
  MOBILE_USER_AGENT,
} from '../src/browser/components/msidebar/SidebarPanelHost.mjs';

if (!globalThis.ChromeUtils) {
  globalThis.ChromeUtils = {
    defineESModuleGetters() {},
  };
}

const {
  buildPanelOptionsFromContext,
  buildPanelSelectorScript,
  computeFloatingPlacement,
  computeFloatingZIndex,
  computePanelButtonDecorations,
  extractPanelDropPayload,
  panelDisplayTitle,
  panelLastUrl,
  panelPeriodicReloadDelayMs,
  panelShortcutEntries,
  panelShortcutToXul,
  reorderPanelsById,
  shouldPersistFavicon,
  startupPanelIdForStore,
  validatePanelEditInput,
} = await import('../src/browser/components/msidebar/SidebarUI.mjs');

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, cb) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(cb);
    },
    removeEventListener(type, cb) {
      listeners.get(type)?.delete(cb);
    },
    dispatchEvent(event) {
      const set = listeners.get(event?.type);
      if (!set) return;
      for (const cb of set) cb(event);
    },
  };
}

test('mobile view: applies iPhone UA and deviceSizeIsPageSize toggle', () => {
  const browser = {
    customUserAgent: '',
    docShell: { deviceSizeIsPageSize: false },
  };

  applyBrowserMobileView(browser, true);
  assert.equal(browser.customUserAgent, MOBILE_USER_AGENT);
  assert.equal(browser.docShell.deviceSizeIsPageSize, true);

  applyBrowserMobileView(browser, false);
  assert.equal(browser.customUserAgent, '');
  assert.equal(browser.docShell.deviceSizeIsPageSize, false);
});

test('temporary panels are excluded from persisted store by default', () => {
  const store = {
    version: 2,
    settings: {},
    last: { selectedPanelId: 'temp' },
    panels: [
      {
        id: 'temp',
        url: 'https://example.com/temp',
        title: { mode: 'dynamic', value: '' },
        favicon: { mode: 'dynamic', value: '' },
        floating: { enabled: false, anchor: 'center', alwaysOnTop: false, x: 0, y: 0, w: 480, h: 640 },
        pinned: false,
        dockWidth: null,
        zoom: 1,
        mobile: false,
        temporary: true,
        unloadOnClose: false,
        periodicReload: { enabled: false, seconds: 300 },
        shortcut: '',
        cssSelector: { enabled: false, value: '' },
        hide: { toolbar: false, soundIcon: false, notificationBadge: false },
        userContextId: 0,
        muted: false,
        loadOnStartup: false,
        restoreLastUrl: true,
        geometry: { width: 480, height: 640, offsetX: 12, offsetY: 12 },
      },
      {
        id: 'stable',
        url: 'https://example.com/stable',
        title: { mode: 'dynamic', value: '' },
        favicon: { mode: 'dynamic', value: '' },
        floating: { enabled: false, anchor: 'center', alwaysOnTop: false, x: 0, y: 0, w: 480, h: 640 },
        pinned: true,
        dockWidth: null,
        zoom: 1,
        mobile: false,
        temporary: false,
        unloadOnClose: false,
        periodicReload: { enabled: false, seconds: 300 },
        shortcut: '',
        cssSelector: { enabled: false, value: '' },
        hide: { toolbar: false, soundIcon: false, notificationBadge: false },
        userContextId: 0,
        muted: false,
        loadOnStartup: false,
        restoreLastUrl: true,
        geometry: { width: 480, height: 640, offsetX: 12, offsetY: 12 },
      },
    ],
  };

  const persisted = validateStore(store);
  assert.equal(persisted.panels.length, 1);
  assert.equal(persisted.panels[0].id, 'stable');
  assert.equal(persisted.last.selectedPanelId, null);

  const runtime = validateStore(store, { includeTemporary: true });
  assert.equal(runtime.panels.length, 2);
  assert.equal(runtime.last.selectedPanelId, 'temp');
});

test('floating placement honors anchor and alwaysOnTop uses high z-index', () => {
  const placement = computeFloatingPlacement({
    anchor: 'br',
    x: 16,
    y: 24,
    w: 600,
    h: 700,
    position: 'left',
  });

  assert.equal(placement.bottom, '24px');
  assert.equal(placement.top, 'unset');
  assert.equal(placement.right, 'calc(var(--midori-msidebar-main-width) + 16px)');
  assert.equal(placement.left, 'unset');
  assert.equal(placement.width, '600px');
  assert.equal(placement.height, '700px');

  assert.equal(computeFloatingZIndex(false), 45);
  assert.ok(computeFloatingZIndex(true) > 30);
});

test('media prompt adapter forwards to PopupNotifications', () => {
  const browser = createEventTarget();
  browser.currentURI = { spec: 'https://example.com' };

  const calls = [];
  const popupNotifications = {
    show(target, id, message, anchorID) {
      calls.push({ target, id, message, anchorID });
    },
  };

  const win = {
    top: {
      PopupNotifications: popupNotifications,
      gBrowser: { selectedBrowser: {} },
    },
  };

  const adapter = createPanelPromptAdapter(win, browser);
  browser.dispatchEvent({ type: 'midori-msidebar-media-prompt', detail: {} });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].target, browser);
  assert.equal(calls[0].id, 'midori-msidebar-media-prompt');
  assert.equal(calls[0].anchorID, 'webRTC-shareDevices-notification-icon');
  assert.match(calls[0].message, /camera|microphone/i);

  adapter.destroy();
});

test('notification badge bridge increments with synthetic event', () => {
  const browser = createEventTarget();
  let badgeCount = 0;

  const bridge = createPanelNotificationBridge(browser, {
    onIncrement(amount) {
      badgeCount += amount;
    },
  });

  browser.dispatchEvent({ type: 'midori-msidebar-notification', detail: { count: 2 } });
  browser.dispatchEvent({ type: 'DOMWebNotificationShown' });

  assert.equal(badgeCount, 3);

  bridge.destroy();
});

test('panel decorations honor hide toggles for sound and badge', () => {
  const panel = {
    hide: {
      soundIcon: true,
      notificationBadge: false,
    },
  };

  const out = computePanelButtonDecorations(panel, {
    audioPlaying: true,
    notificationCount: 120,
  });

  assert.equal(out.showSoundIcon, false);
  assert.equal(out.badgeText, '99+');
});

test('panel metadata helpers drive dynamic title selector and periodic reload integration', () => {
  const panel = {
    id: 'panel',
    url: 'https://example.com/app',
    title: { mode: 'dynamic', value: 'Fallback title' },
    periodicReload: { enabled: true, seconds: 45 },
    cssSelector: { enabled: true, value: '#inbox [data-label="Today"]' },
  };

  assert.equal(panelDisplayTitle(panel, 'Runtime title'), 'Runtime title');
  assert.equal(panelDisplayTitle(panel, ''), 'Fallback title');
  assert.equal(panelPeriodicReloadDelayMs(panel), 45_000);

  const clampedPanel = {
    periodicReload: { enabled: true, seconds: 1 },
  };
  assert.equal(panelPeriodicReloadDelayMs(clampedPanel), 30_000);
  assert.equal(panelPeriodicReloadDelayMs({ periodicReload: { enabled: false, seconds: 60 } }), 0);

  const script = buildPanelSelectorScript(panel.cssSelector.value);
  assert.match(script, /document\.querySelector/);
  assert.match(script, /scrollIntoView/);
  assert.ok(script.includes(JSON.stringify(panel.cssSelector.value)));
  assert.equal(buildPanelSelectorScript(''), '');
});

test('panel shortcuts normalize dedupe and expose XUL key metadata', () => {
  const parsed = panelShortcutToXul('control + shift + e');
  assert.deepEqual(parsed, {
    key: 'e',
    keycode: '',
    modifiers: 'control,shift',
  });

  const entries = panelShortcutEntries([
    { id: 'mail', shortcut: 'Ctrl+Shift+E' },
    { id: 'duplicate', shortcut: 'control+shift+e' },
    { id: 'calendar', shortcut: 'Alt+F8' },
    { id: 'empty', shortcut: '' },
  ]);

  assert.deepEqual(
    entries.map((entry) => [entry.panelId, entry.shortcut, entry.parsed.key || entry.parsed.keycode]),
    [
      ['mail', 'Ctrl+Shift+E', 'e'],
      ['calendar', 'Alt+F8', 'VK_F8'],
    ]
  );
});

test('bookmark shortcut remains reserved for the browser', () => {
  assert.equal(isReservedBrowserShortcut('Ctrl+D'), true);
  assert.equal(isReservedBrowserShortcut('control + d'), true);
  assert.equal(isReservedBrowserShortcut('Meta+D'), true);
  assert.equal(isReservedBrowserShortcut('Ctrl+Shift+D'), false);

  const entries = panelShortcutEntries([
    { id: 'bookmark-conflict', shortcut: 'Ctrl+D' },
    { id: 'mail', shortcut: 'Ctrl+Shift+E' },
  ]);
  assert.deepEqual(entries.map((entry) => entry.panelId), ['mail']);
  assert.equal(validatePanelEditInput({ shortcut: 'Ctrl+D' }).shortcut, false);
});

test('restoreLastUrl and loadOnStartup use validated persisted panel state', () => {
  const store = validateStore(
    {
      version: 2,
      settings: {},
      last: {
        selectedPanelId: 'calendar',
        panelUrls: {
          mail: 'https://mail.example.com/inbox',
          calendar: 'https://calendar.example.com/week',
          broken: 'javascript:alert(1)',
        },
        favicons: {
          mail: 'https://mail.example.com/favicon.ico',
          calendar: 'data:image/svg+xml,broken',
        },
      },
      panels: [
        {
          id: 'mail',
          url: 'https://mail.example.com/',
          title: { mode: 'dynamic', value: 'Mail' },
          favicon: { mode: 'dynamic', value: '' },
          floating: { enabled: false, anchor: 'center', alwaysOnTop: false, x: 0, y: 0, w: 480, h: 640 },
          pinned: true,
          dockWidth: null,
          zoom: 1,
          mobile: false,
          temporary: false,
          unloadOnClose: false,
          periodicReload: { enabled: false, seconds: 300 },
          shortcut: '',
          cssSelector: { enabled: false, value: '' },
          hide: { toolbar: false, soundIcon: false, notificationBadge: false },
          userContextId: 0,
          muted: false,
          loadOnStartup: true,
          restoreLastUrl: true,
          geometry: { width: 480, height: 640, offsetX: 12, offsetY: 12 },
        },
        {
          id: 'calendar',
          url: 'https://calendar.example.com/',
          title: { mode: 'dynamic', value: 'Calendar' },
          favicon: { mode: 'dynamic', value: '' },
          floating: { enabled: false, anchor: 'center', alwaysOnTop: false, x: 0, y: 0, w: 480, h: 640 },
          pinned: true,
          dockWidth: null,
          zoom: 1,
          mobile: false,
          temporary: false,
          unloadOnClose: false,
          periodicReload: { enabled: false, seconds: 300 },
          shortcut: '',
          cssSelector: { enabled: false, value: '' },
          hide: { toolbar: false, soundIcon: false, notificationBadge: false },
          userContextId: 0,
          muted: false,
          loadOnStartup: false,
          restoreLastUrl: true,
          geometry: { width: 480, height: 640, offsetX: 12, offsetY: 12 },
        },
      ],
    },
    { includeTemporary: true }
  );

  assert.equal(store.last.panelUrls.mail, 'https://mail.example.com/inbox');
  assert.equal(store.last.panelUrls.broken, undefined);
  assert.equal(store.last.favicons.mail, 'https://mail.example.com/favicon.ico');
  assert.equal(store.last.favicons.calendar, undefined);
  assert.equal(panelLastUrl(store, store.panels[0]), 'https://mail.example.com/inbox');
  assert.equal(panelLastUrl(store, { ...store.panels[0], restoreLastUrl: false }), 'https://mail.example.com/');
  assert.equal(startupPanelIdForStore(store), 'mail');

  const selectedStartupStore = {
    ...store,
    last: { ...store.last, selectedPanelId: 'calendar' },
    panels: store.panels.map((panel) => ({ ...panel, loadOnStartup: panel.id === 'calendar' })),
  };
  assert.equal(startupPanelIdForStore(selectedStartupStore), 'calendar');
});

test('context menu payload resolves sidebar_action panels and editor validation rejects risky input', () => {
  const sidebarActionPanel = buildPanelOptionsFromContext(
    {
      url: 'moz-extension://fixture/background.html',
      title: 'Extension internals',
      temporary: true,
      userContextId: 4,
    },
    () => ({
      url: 'moz-extension://fixture/sidebar.html',
      title: 'Fixture Sidebar',
      extensionId: 'fixture@example',
      iconUrl: 'moz-extension://fixture/icons/sidebar.svg',
    })
  );

  assert.deepEqual(sidebarActionPanel, {
    url: 'moz-extension://fixture/sidebar.html',
    title: 'Fixture Sidebar',
    temporary: true,
    userContextId: 4,
    webExtensionId: 'fixture@example',
    faviconUrl: 'moz-extension://fixture/icons/sidebar.svg',
  });

  const normalPanel = buildPanelOptionsFromContext(
    {
      url: 'https://example.com/current?x=1',
      title: 'Current page',
      userContextId: 2,
    },
    () => null
  );

  assert.equal(normalPanel.url, 'https://example.com/current?x=1');
  assert.equal(normalPanel.title, 'Current page');
  assert.equal(normalPanel.temporary, false);
  assert.equal(normalPanel.userContextId, 2);
  assert.equal(buildPanelOptionsFromContext({ url: 'javascript:alert(1)' }), null);

  assert.deepEqual(validatePanelEditInput({ url: 'https://example.com', shortcut: 'Ctrl+Shift+E', cssSelector: '#app' }), {
    url: true,
    shortcut: true,
    cssSelector: true,
  });
  assert.equal(validatePanelEditInput({ url: 'javascript:alert(1)' }).url, false);
  assert.equal(validatePanelEditInput({ shortcut: 'Ctrl+' }).shortcut, false);
  assert.equal(validatePanelEditInput({ cssSelector: 'x'.repeat(501) }).cssSelector, false);

  assert.equal(shouldPersistFavicon({ favicon: { mode: 'dynamic' } }, 'https://example.com/favicon.ico'), true);
  assert.equal(shouldPersistFavicon({ favicon: { mode: 'dynamic' } }, 'moz-extension://fixture/icon.svg'), true);
  assert.equal(shouldPersistFavicon({ favicon: { mode: 'static' } }, 'https://example.com/favicon.ico'), false);
  assert.equal(shouldPersistFavicon({ favicon: { mode: 'dynamic' } }, 'chrome://mozapps/skin/places/defaultFavicon.svg'), false);
});

test('reorderPanelsById moves source panel before target', () => {
  const panels = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const reordered = reorderPanelsById(panels, 'c', 'a');

  assert.deepEqual(
    reordered.map((panel) => panel.id),
    ['c', 'a', 'b']
  );
  assert.deepEqual(
    panels.map((panel) => panel.id),
    ['a', 'b', 'c']
  );
});

test('extractPanelDropPayload supports bookmarks tabs and plain url drops', () => {
  const bookmarkPayload = extractPanelDropPayload({
    getData(type) {
      if (type === 'text/x-moz-url') {
        return 'https://example.com/bookmark\nExample Bookmark';
      }
      return '';
    },
  });
  assert.equal(bookmarkPayload.url, 'https://example.com/bookmark');
  assert.equal(bookmarkPayload.title, 'Example Bookmark');

  const tabPayload = extractPanelDropPayload({
    getData() {
      return '';
    },
    mozGetDataAt(type) {
      if (type !== 'application/x-moz-tabbrowser-tab') return null;
      return {
        label: 'Tab title',
        linkedBrowser: {
          currentURI: {
            spec: 'https://example.com/tab',
          },
        },
      };
    },
  });
  assert.equal(tabPayload.url, 'https://example.com/tab');
  assert.equal(tabPayload.title, 'Tab title');

  const plainPayload = extractPanelDropPayload({
    getData(type) {
      if (type === 'text/plain') return 'https://example.com/plain';
      return '';
    },
  });
  assert.equal(plainPayload.url, 'https://example.com/plain');
  assert.equal(plainPayload.title, '');
});
