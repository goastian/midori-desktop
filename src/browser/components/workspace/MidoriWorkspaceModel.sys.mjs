/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const MAX_WORKSPACES = 25;
export const MAX_NAME_LENGTH = 32;

export const WORKSPACE_ICONS = [
  { id: 'default', emoji: '🏠', label: 'Home' },
  { id: 'work', emoji: '💼', label: 'Work' },
  { id: 'personal', emoji: '👤', label: 'Personal' },
  { id: 'shopping', emoji: '🛒', label: 'Shopping' },
  { id: 'social', emoji: '💬', label: 'Social' },
  { id: 'dev', emoji: '💻', label: 'Development' },
  { id: 'research', emoji: '🔬', label: 'Research' },
  { id: 'music', emoji: '🎵', label: 'Music' },
  { id: 'gaming', emoji: '🎮', label: 'Gaming' },
  { id: 'finance', emoji: '💰', label: 'Finance' },
  { id: 'travel', emoji: '✈️', label: 'Travel' },
  { id: 'education', emoji: '📚', label: 'Education' },
  { id: 'health', emoji: '❤️', label: 'Health' },
  { id: 'news', emoji: '📰', label: 'News' },
  { id: 'creative', emoji: '🎨', label: 'Creative' },
  { id: 'star', emoji: '⭐', label: 'Favorite' },
  { id: 'focus', emoji: '🎯', label: 'Focus' },
  { id: 'mail', emoji: '✉️', label: 'Mail' },
  { id: 'video', emoji: '🎬', label: 'Video' },
  { id: 'calendar', emoji: '📅', label: 'Calendar' },
  { id: 'idea', emoji: '💡', label: 'Ideas' },
  { id: 'secure', emoji: '🔒', label: 'Secure' },
  { id: 'automation', emoji: '⚙️', label: 'Automation' },
  { id: 'archive', emoji: '🗃️', label: 'Archive' },
];

export const WORKSPACE_ACCENTS = {
  default: '#5f88ff',
  work: '#3b82f6',
  personal: '#14b8a6',
  shopping: '#f59e0b',
  social: '#06b6d4',
  dev: '#6366f1',
  research: '#0ea5a4',
  music: '#a855f7',
  gaming: '#ec4899',
  finance: '#10b981',
  travel: '#f97316',
  education: '#0ea5e9',
  health: '#ef4444',
  news: '#64748b',
  creative: '#d946ef',
  star: '#eab308',
  focus: '#f43f5e',
  mail: '#0f766e',
  video: '#7c3aed',
  calendar: '#2563eb',
  idea: '#ca8a04',
  secure: '#475569',
  automation: '#0891b2',
  archive: '#78716c',
};

const VALID_ICON_IDS = new Set(WORKSPACE_ICONS.map((icon) => icon.id));

export function sanitizeWorkspaceName(name) {
  if (typeof name !== 'string') {
    return 'Workspace';
  }
  const sanitized = name.slice(0, MAX_NAME_LENGTH).replace(/[<>"'&]/g, '').trim();
  return sanitized || 'Workspace';
}

export function validateIconId(iconId) {
  return VALID_ICON_IDS.has(iconId) ? iconId : 'default';
}

export function getEmojiForIcon(iconId) {
  const icon = WORKSPACE_ICONS.find((item) => item.id === iconId);
  return icon ? icon.emoji : '🏠';
}

export function getLabelForIcon(iconId) {
  const icon = WORKSPACE_ICONS.find((item) => item.id === iconId);
  return icon ? icon.label : 'Home';
}

export function getWorkspaceAccent(iconId) {
  return WORKSPACE_ACCENTS[iconId] || WORKSPACE_ACCENTS.default;
}

export function normalizeTabMembership(rawTabs, validWorkspaceIds) {
  if (!rawTabs || typeof rawTabs !== 'object') {
    return {};
  }

  const tabs = {};
  for (const [tabKey, workspaceId] of Object.entries(rawTabs)) {
    if (
      typeof tabKey === 'string' &&
      tabKey &&
      typeof workspaceId === 'string' &&
      validWorkspaceIds.has(workspaceId)
    ) {
      tabs[tabKey] = workspaceId;
    }
  }
  return tabs;
}

export function validateWorkspaceWindowData(winData) {
  if (!winData || typeof winData !== 'object' || !Array.isArray(winData.workspaces)) {
    return null;
  }

  const seenIds = new Set();
  const workspaces = [];
  for (const ws of winData.workspaces) {
    if (!ws || typeof ws !== 'object' || typeof ws.id !== 'string' || !ws.id) {
      continue;
    }
    if (seenIds.has(ws.id)) {
      continue;
    }

    seenIds.add(ws.id);
    workspaces.push({
      id: ws.id,
      name: sanitizeWorkspaceName(ws.name),
      icon: validateIconId(ws.icon),
      isDefault: !!ws.isDefault,
    });
  }

  if (!workspaces.length) {
    return null;
  }

  if (!workspaces.some((ws) => ws.isDefault)) {
    workspaces[0].isDefault = true;
  } else {
    let foundDefault = false;
    for (const ws of workspaces) {
      if (ws.isDefault && !foundDefault) {
        foundDefault = true;
      } else {
        ws.isDefault = false;
      }
    }
  }

  const ids = new Set(workspaces.map((ws) => ws.id));
  const selectedId = ids.has(winData.selectedId)
    ? winData.selectedId
    : workspaces.find((ws) => ws.isDefault)?.id || workspaces[0].id;

  return {
    workspaces,
    selectedId,
    tabs: normalizeTabMembership(winData.tabs, ids),
  };
}

export function validateWorkspaceStore(data) {
  const store = { windows: {} };
  if (!data || typeof data !== 'object' || !data.windows || typeof data.windows !== 'object') {
    return store;
  }

  for (const [windowId, winData] of Object.entries(data.windows)) {
    const validWindowData = validateWorkspaceWindowData(winData);
    if (validWindowData) {
      store.windows[windowId] = validWindowData;
    }
  }
  return store;
}

export function getWorkspaceCopyName(workspaces, sourceName) {
  const base = sanitizeWorkspaceName(sourceName || 'Workspace');
  const names = new Set(workspaces.map((ws) => ws.name));
  if (!names.has(`${base} Copy`)) {
    return sanitizeWorkspaceName(`${base} Copy`);
  }

  let index = 2;
  let candidate = sanitizeWorkspaceName(`${base} Copy ${index}`);
  while (names.has(candidate)) {
    index++;
    candidate = sanitizeWorkspaceName(`${base} Copy ${index}`);
  }
  return candidate;
}
