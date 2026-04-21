// Midori Tab — Background Service Worker
// Replaces the original Omni background.js with a differential cache approach.
// No jQuery, no global resets on every tab event.

'use strict';

function callChrome(method, ...args) {
  return new Promise((resolve, reject) => {
    try {
      const callback = (result) => {
        const lastError = chrome.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(result);
      };

      const maybePromise = method(...args, callback);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolve, reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function safeCallChrome(method, ...args) {
  return callChrome(method, ...args).catch(() => undefined);
}

// ─── Differential Tabs Cache ───────────────────────────────────────────────
const tabsCache = new Map(); // tabId → normalised tab object
let tabsCacheReady = false;
const TABS_CACHE_MAX = 500;

function normaliseTab(tab) {
  return {
    id: tab.id,
    index: tab.index,
    windowId: tab.windowId,
    title: tab.title || '',
    url: tab.url || '',
    favIconUrl: tab.favIconUrl || '',
    mutedInfo: tab.mutedInfo || { muted: false },
    pinned: !!tab.pinned,
    type: 'tab',
    action: 'switch-tab',
    desc: 'Open tab',
    emoji: false,
    keycheck: false,
  };
}

async function ensureTabsCache() {
  if (tabsCacheReady) return;
  const tabs = await callChrome(chrome.tabs.query.bind(chrome.tabs), {});
  for (const tab of tabs || []) {
    tabsCache.set(tab.id, normaliseTab(tab));
  }
  tabsCacheReady = true;
}

chrome.tabs.onCreated.addListener((tab) => {
  tabsCache.set(tab.id, normaliseTab(tab));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabsCache.delete(tabId);
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  tabsCache.delete(removedTabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabsCache.has(tabId)) {
    const existing = tabsCache.get(tabId);
    tabsCache.set(tabId, {
      ...existing,
      title: tab.title ?? existing.title,
      url: tab.url ?? existing.url,
      favIconUrl: tab.favIconUrl ?? existing.favIconUrl,
      mutedInfo: tab.mutedInfo ?? existing.mutedInfo,
      pinned: tab.pinned !== undefined ? tab.pinned : existing.pinned,
    });
  } else {
    // Tab appeared without onCreated (e.g. restored session)
    tabsCache.set(tabId, normaliseTab(tab));
  }
});

// ─── Bookmarks Cache ────────────────────────────────────────────────────────
let bookmarksCache = null;
let bookmarksInvalidateTimer = null;

function invalidateBookmarks() {
  clearTimeout(bookmarksInvalidateTimer);
  bookmarksInvalidateTimer = setTimeout(() => {
    bookmarksCache = null;
  }, 1000);
}

chrome.bookmarks.onCreated.addListener(invalidateBookmarks);
chrome.bookmarks.onRemoved.addListener(invalidateBookmarks);
chrome.bookmarks.onChanged.addListener(invalidateBookmarks);
chrome.bookmarks.onMoved.addListener(invalidateBookmarks);

async function getBookmarks() {
  if (bookmarksCache) return bookmarksCache;
  const recent = await callChrome(chrome.bookmarks.getRecent.bind(chrome.bookmarks), 100);
  bookmarksCache = (recent || [])
    .filter((b) => Boolean(b.url))
    .map((b) => ({
      id: b.id,
      title: b.title || b.url,
      desc: 'Bookmark',
      url: b.url,
      type: 'bookmark',
      action: 'bookmark',
      emoji: true,
      emojiChar: '⭐️',
      keycheck: false,
    }));
  return bookmarksCache;
}

// ─── Static Actions ─────────────────────────────────────────────────────────
let staticActions = null;
let platformOs = null;

async function getPlatformOs() {
  if (!platformOs) {
    const info = await callChrome(chrome.runtime.getPlatformInfo.bind(chrome.runtime));
    platformOs = info?.os || 'linux';
  }
  return platformOs;
}

function buildStaticActions(isMac) {
  const mod = isMac ? '⌘' : 'Ctrl';
  const alt = isMac ? '⌥' : 'Alt';
  const shift = '⇧';

  return [
    { title: 'New tab', desc: 'Open a new tab', type: 'action', action: 'new-tab', emoji: true, emojiChar: '✨', keycheck: true, keys: [mod, 'T'] },
    { title: 'Bookmark page', desc: 'Bookmark the current page', type: 'action', action: 'create-bookmark', emoji: true, emojiChar: '📕', keycheck: true, keys: [mod, 'D'] },
    { title: 'Fullscreen', desc: 'Toggle fullscreen', type: 'action', action: 'fullscreen', emoji: true, emojiChar: '🖥', keycheck: true, keys: isMac ? [mod, 'Ctrl', 'F'] : ['F11'] },
    { title: 'Reload', desc: 'Reload the page', type: 'action', action: 'reload', emoji: true, emojiChar: '♻️', keycheck: true, keys: isMac ? [mod, shift, 'R'] : ['F5'] },
    { title: 'Compose email', desc: 'Compose a new email', type: 'action', action: 'email', emoji: true, emojiChar: '✉️', keycheck: true, keys: [alt, shift, 'C'] },
    { title: 'Print page', desc: 'Print the current page', type: 'action', action: 'print', emoji: true, emojiChar: '🖨️', keycheck: true, keys: [mod, 'P'] },
    { title: 'Scroll to top', desc: 'Scroll to the top of the page', type: 'action', action: 'scroll-top', emoji: true, emojiChar: '👆', keycheck: true, keys: isMac ? [mod, '↑'] : ['Home'] },
    { title: 'Scroll to bottom', desc: 'Scroll to the bottom of the page', type: 'action', action: 'scroll-bottom', emoji: true, emojiChar: '👇', keycheck: true, keys: isMac ? [mod, '↓'] : ['End'] },
    { title: 'Go back', desc: 'Go back in history', type: 'action', action: 'go-back', emoji: true, emojiChar: '👈', keycheck: true, keys: isMac ? [mod, '←'] : ['Alt', '←'] },
    { title: 'Go forward', desc: 'Go forward in history', type: 'action', action: 'go-forward', emoji: true, emojiChar: '👉', keycheck: true, keys: isMac ? [mod, '→'] : ['Alt', '→'] },
    { title: 'Duplicate tab', desc: 'Duplicate the current tab', type: 'action', action: 'duplicate-tab', emoji: true, emojiChar: '📋', keycheck: true, keys: [alt, shift, 'D'] },
    { title: 'Close tab', desc: 'Close the current tab', type: 'action', action: 'close-tab', emoji: true, emojiChar: '🗑', keycheck: true, keys: [mod, 'W'] },
    { title: 'Close window', desc: 'Close the current window', type: 'action', action: 'close-window', emoji: true, emojiChar: '💥', keycheck: true, keys: [mod, shift, 'W'] },
    { title: 'Incognito mode', desc: 'Open an incognito window', type: 'action', action: 'incognito', emoji: true, emojiChar: '🕵️', keycheck: true, keys: [mod, shift, 'N'] },
    { title: 'Browsing history', desc: 'Open browsing history', type: 'action', action: 'history', emoji: true, emojiChar: '🗂', keycheck: true, keys: isMac ? [mod, 'Y'] : ['Ctrl', 'H'] },
    { title: 'Downloads', desc: 'Browse your downloads', type: 'action', action: 'downloads', emoji: true, emojiChar: '📦', keycheck: true, keys: isMac ? [mod, shift, 'J'] : ['Ctrl', 'J'] },
    { title: 'Extensions', desc: 'Manage extensions', type: 'action', action: 'extensions', emoji: true, emojiChar: '🧩', keycheck: false },
    { title: 'Settings', desc: 'Open browser settings', type: 'action', action: 'settings', emoji: true, emojiChar: '⚙️', keycheck: false },
    { title: 'Manage browsing data', desc: 'Clear browsing data', type: 'action', action: 'manage-data', emoji: true, emojiChar: '🔬', keycheck: false },
    { title: 'Clear all browsing data', desc: 'Remove all browsing data', type: 'action', action: 'remove-all', emoji: true, emojiChar: '🧹', keycheck: false },
    { title: 'Clear history', desc: 'Clear browsing history', type: 'action', action: 'remove-history', emoji: true, emojiChar: '🗂', keycheck: false },
    { title: 'Clear cookies', desc: 'Clear all cookies', type: 'action', action: 'remove-cookies', emoji: true, emojiChar: '🍪', keycheck: false },
    { title: 'Clear cache', desc: 'Clear the browser cache', type: 'action', action: 'remove-cache', emoji: true, emojiChar: '🗄', keycheck: false },
    { title: 'Clear local storage', desc: 'Clear local storage', type: 'action', action: 'remove-local-storage', emoji: true, emojiChar: '📦', keycheck: false },
    { title: 'Clear passwords', desc: 'Clear saved passwords', type: 'action', action: 'remove-passwords', emoji: true, emojiChar: '🔑', keycheck: false },
    // — Quick-create URLs
    { title: 'New Notion page', desc: 'Create a new Notion page', type: 'action', action: 'url', url: 'https://notion.new', emoji: true, emojiChar: '📓', keycheck: false },
    { title: 'New Google Doc', desc: 'Create a new Google Doc', type: 'action', action: 'url', url: 'https://docs.new', emoji: true, emojiChar: '📄', keycheck: false },
    { title: 'New Google Sheet', desc: 'Create a new spreadsheet', type: 'action', action: 'url', url: 'https://sheets.new', emoji: true, emojiChar: '📊', keycheck: false },
    { title: 'New Google Slides', desc: 'Create a new presentation', type: 'action', action: 'url', url: 'https://slides.new', emoji: true, emojiChar: '📑', keycheck: false },
    { title: 'New GitHub repo', desc: 'Create a new GitHub repository', type: 'action', action: 'url', url: 'https://github.new', emoji: true, emojiChar: '🐙', keycheck: false },
    { title: 'New GitHub gist', desc: 'Create a new Gist', type: 'action', action: 'url', url: 'https://gist.new', emoji: true, emojiChar: '📝', keycheck: false },
    { title: 'New CodePen pen', desc: 'Create a new CodePen pen', type: 'action', action: 'url', url: 'https://pen.new', emoji: true, emojiChar: '🖊', keycheck: false },
    { title: 'New Figma file', desc: 'Create a new Figma file', type: 'action', action: 'url', url: 'https://figma.new', emoji: true, emojiChar: '🎨', keycheck: false },
    { title: 'New Linear issue', desc: 'Create a new Linear issue', type: 'action', action: 'url', url: 'https://linear.new', emoji: true, emojiChar: '🔷', keycheck: false },
    { title: 'New Google Meet', desc: 'Start a Google Meet meeting', type: 'action', action: 'url', url: 'https://meet.new', emoji: true, emojiChar: '📹', keycheck: false },
    { title: 'New Google Calendar event', desc: 'Add a Google Calendar event', type: 'action', action: 'url', url: 'https://cal.new', emoji: true, emojiChar: '📅', keycheck: false },
    { title: 'New note (Google Keep)', desc: 'Add a note to Google Keep', type: 'action', action: 'url', url: 'https://note.new', emoji: true, emojiChar: '🗒', keycheck: false },
    { title: 'Convert to PDF', desc: 'Convert a file to PDF', type: 'action', action: 'url', url: 'https://pdf.new', emoji: true, emojiChar: '📄', keycheck: false },
  ];
}

async function ensureStaticActions() {
  if (staticActions) return;
  const os = await getPlatformOs();
  staticActions = buildStaticActions(os === 'mac');
}

// ─── Dynamic actions based on current tab ──────────────────────────────────
async function getDynamicActions() {
  const tabs = await callChrome(chrome.tabs.query.bind(chrome.tabs), { active: true, currentWindow: true });
  const [tab] = tabs || [];
  if (!tab) return [];
  const isMac = (await getPlatformOs()) === 'mac';
  const alt = isMac ? '⌥' : 'Alt';

  const muteAction = tab.mutedInfo?.muted
    ? { title: 'Unmute tab', desc: 'Unmute the current tab', type: 'action', action: 'unmute', emoji: true, emojiChar: '🔈', keycheck: true, keys: [alt, '⇧', 'M'] }
    : { title: 'Mute tab', desc: 'Mute the current tab', type: 'action', action: 'mute', emoji: true, emojiChar: '🔇', keycheck: true, keys: [alt, '⇧', 'M'] };

  const pinAction = tab.pinned
    ? { title: 'Unpin tab', desc: 'Unpin the current tab', type: 'action', action: 'unpin', emoji: true, emojiChar: '📌', keycheck: true, keys: [alt, '⇧', 'P'] }
    : { title: 'Pin tab', desc: 'Pin the current tab', type: 'action', action: 'pin', emoji: true, emojiChar: '📌', keycheck: true, keys: [alt, '⇧', 'P'] };

  return [muteAction, pinAction];
}

// ─── Action Handlers ────────────────────────────────────────────────────────
async function getCurrentTab() {
  const tabs = await callChrome(chrome.tabs.query.bind(chrome.tabs), { active: true, currentWindow: true });
  const [tab] = tabs || [];
  return tab;
}

async function switchTab(tab) {
  await safeCallChrome(chrome.tabs.highlight.bind(chrome.tabs), { tabs: tab.index, windowId: tab.windowId });
  await safeCallChrome(chrome.windows.update.bind(chrome.windows), tab.windowId, { focused: true });
}

async function executeAction(message) {
  switch (message.request) {
    case 'switch-tab':
      await switchTab(message.tab);
      break;
    case 'go-back': {
      const t = await getCurrentTab();
      chrome.tabs.goBack(t.id);
      break;
    }
    case 'go-forward': {
      const t = await getCurrentTab();
      chrome.tabs.goForward(t.id);
      break;
    }
    case 'duplicate-tab': {
      const t = await getCurrentTab();
      chrome.tabs.duplicate(t.id);
      break;
    }
    case 'create-bookmark': {
      const t = await getCurrentTab();
      chrome.bookmarks.create({ title: t.title, url: t.url });
      break;
    }
    case 'mute': {
      const t = await getCurrentTab();
      chrome.tabs.update(t.id, { muted: true });
      break;
    }
    case 'unmute': {
      const t = await getCurrentTab();
      chrome.tabs.update(t.id, { muted: false });
      break;
    }
    case 'reload':
      chrome.tabs.reload();
      break;
    case 'pin': {
      const t = await getCurrentTab();
      chrome.tabs.update(t.id, { pinned: true });
      break;
    }
    case 'unpin': {
      const t = await getCurrentTab();
      chrome.tabs.update(t.id, { pinned: false });
      break;
    }
    case 'new-tab':
      chrome.tabs.create({});
      break;
    case 'incognito':
      chrome.windows.create({ incognito: true });
      break;
    case 'close-tab': {
      const t = await getCurrentTab();
      chrome.tabs.remove(t.id);
      break;
    }
    case 'close-window': {
      const t = await getCurrentTab();
      chrome.windows.remove(t.windowId);
      break;
    }
    case 'remove': {
      if (message.type === 'bookmark') {
        chrome.bookmarks.remove(message.action.id);
        invalidateBookmarks();
      } else if (message.type === 'tab') {
        chrome.tabs.remove(message.action.id);
      }
      break;
    }
    case 'remove-all':
      chrome.browsingData.remove(
        { since: new Date().getTime() },
        { appcache: true, cache: true, cacheStorage: true, cookies: true, downloads: true, fileSystems: true, formData: true, history: true, indexedDB: true, localStorage: true, passwords: true, serviceWorkers: true, webSQL: true }
      );
      break;
    case 'remove-history':
      chrome.browsingData.removeHistory({ since: 0 });
      break;
    case 'remove-cookies':
      chrome.browsingData.removeCookies({ since: 0 });
      break;
    case 'remove-cache':
      chrome.browsingData.removeCache({ since: 0 });
      break;
    case 'remove-local-storage':
      chrome.browsingData.removeLocalStorage({ since: 0 });
      break;
    case 'remove-passwords':
      chrome.browsingData.removePasswords({ since: 0 });
      break;
    case 'history':
    case 'downloads':
    case 'extensions':
    case 'settings':
      chrome.tabs.create({ url: `chrome://${message.request}/` });
      break;
    case 'manage-data':
      chrome.tabs.create({ url: 'chrome://settings/clearBrowserData' });
      break;
    case 'search':
      if (message.query) {
        chrome.search.query({ text: message.query });
      }
      break;
  }
}

// ─── Message Handler ─────────────────────────────────────────────────────────
async function handleMessage(message) {
  await ensureStaticActions();
  await ensureTabsCache();

  switch (message.request) {
    case 'get-data': {
      const [bookmarks, dynamicActions] = await Promise.all([
        getBookmarks(),
        getDynamicActions(),
      ]);
      const tabs = Array.from(tabsCache.values());
      const actions = [...dynamicActions, ...staticActions];
      return { tabs, bookmarks, actions };
    }

    case 'search-history': {
      const results = await callChrome(chrome.history.search.bind(chrome.history), {
        text: message.query ?? '',
        maxResults: 50,
        startTime: 0,
      });
      return {
        history: (results || []).map((h) => ({
          id: h.id,
          title: h.title || h.url,
          desc: h.url,
          url: h.url,
          type: 'history',
          action: 'history',
          emoji: true,
          emojiChar: '🏛',
          keycheck: false,
        })),
      };
    }

    case 'search-bookmarks': {
      const results = await callChrome(chrome.bookmarks.search.bind(chrome.bookmarks), { query: message.query });
      return {
        bookmarks: (results || [])
          .filter((b) => Boolean(b.url))
          .map((b) => ({
            id: b.id,
            title: b.title || b.url,
            desc: b.url,
            url: b.url,
            type: 'bookmark',
            action: 'bookmark',
            emoji: true,
            emojiChar: '⭐️',
            keycheck: false,
          })),
      };
    }

    case 'switch-tab':
    case 'go-back':
    case 'go-forward':
    case 'duplicate-tab':
    case 'create-bookmark':
    case 'mute':
    case 'unmute':
    case 'reload':
    case 'pin':
    case 'unpin':
    case 'new-tab':
    case 'incognito':
    case 'close-tab':
    case 'close-window':
    case 'remove':
    case 'remove-all':
    case 'remove-history':
    case 'remove-cookies':
    case 'remove-cache':
    case 'remove-local-storage':
    case 'remove-passwords':
    case 'history':
    case 'downloads':
    case 'extensions':
    case 'settings':
    case 'manage-data':
    case 'search':
      await executeAction(message);
      return { ok: true };

    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse(result ?? {}))
    .catch((err) => {
      console.error('[Midori Omni background] Error handling message:', message.request, err);
      sendResponse({ error: String(err) });
    });
  return true; // keep port open for async response
});

// ─── Keyboard shortcut & toolbar click ──────────────────────────────────────
function openOmniInTab(tab) {
  if (!tab) return;
  const url = tab.url || '';
  // Can't send to privileged system pages
  if (url.startsWith('chrome://') || url.startsWith('about:') || url.startsWith('chrome-extension://')) {
    // Fallback: open a new tab (the new tab IS the omni launcher)
    chrome.tabs.create({});
    return;
  }

  try {
    const maybePromise = chrome.tabs.sendMessage(tab.id, { request: 'open-omni' });
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch(() => {
        // Content script not ready (e.g. file:// or pdf) — open new tab
        chrome.tabs.create({});
      });
    }
  } catch (_) {
    chrome.tabs.create({});
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-omni') {
    const tab = await getCurrentTab();
    openOmniInTab(tab);
  }
});

const toolbarActionApi = chrome.action || chrome.browserAction;

if (toolbarActionApi?.onClicked) {
  toolbarActionApi.onClicked.addListener((tab) => {
    openOmniInTab(tab);
  });
}

// ─── Install: inject content script into existing tabs ──────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    const manifest = chrome.runtime.getManifest();
    const contentScriptEntry = manifest.content_scripts?.[0];
    if (!contentScriptEntry) return;

    const windows = await callChrome(chrome.windows.getAll.bind(chrome.windows), { populate: true });
    for (const win of (windows || [])) {
      for (const tab of (win.tabs || [])) {
        const url = tab.url || '';
        if (
          url.startsWith('chrome://') ||
          url.startsWith('chrome-extension://') ||
          url.startsWith('about:') ||
          url.includes('chrome.google.com')
        ) continue;

        // Use scripting API (MV3)
        if (chrome.scripting) {
          try {
            for (const file of (contentScriptEntry.js || [])) {
              await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [file] });
            }
            if (contentScriptEntry.css?.length) {
              await chrome.scripting.insertCSS({
                target: { tabId: tab.id },
                files: contentScriptEntry.css,
              });
            }
          } catch (_) { /* tab may have been closed */ }
        }
      }
    }
  }
});

// Eager initialise caches on service worker start
ensureTabsCache().catch(console.error);
ensureStaticActions().catch(console.error);
