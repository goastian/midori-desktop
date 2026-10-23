/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MAX_WORKSPACES, sanitizeWorkspaceName, validateIconId } from './MidoriWorkspaceModel.sys.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function validWorkspaceSyncId(id) {
  return typeof id === 'string' && id.startsWith('w1:') && UUID.test(id.slice(3));
}

export function validateWorkspaceSyncValue(id, value) {
  if (!validWorkspaceSyncId(id) || !value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== 3 || value.version !== 1 ||
      typeof value.name !== 'string' || sanitizeWorkspaceName(value.name) !== value.name ||
      typeof value.icon !== 'string' || validateIconId(value.icon) !== value.icon) {
    throw new Error('invalid_workspace_record');
  }
  return { version: 1, name: value.name, icon: value.icon };
}

/** Maintains portable identities independently of native window and tab IDs. */
export class WorkspaceCatalog {
  constructor(store, createId) {
    this.store = store;
    this.createId = createId;
    if (Object.hasOwn(store, 'sync')) {
      const sync = store.sync;
      if (!sync || sync.version !== 1 || Object.keys(sync).length !== 3 ||
          !sync.records || typeof sync.records !== 'object' || Array.isArray(sync.records) ||
          !Array.isArray(sync.deleted) || new Set(sync.deleted).size !== sync.deleted.length ||
          sync.deleted.some(id => !validWorkspaceSyncId(id) || Object.hasOwn(sync.records, id))) {
        throw new Error('invalid_workspace_catalog');
      }
      for (const [id, value] of Object.entries(sync.records)) {
        validateWorkspaceSyncValue(id, value);
      }
    } else {
      store.sync = { version: 1, records: {}, deleted: [] };
    }
    for (const data of Object.values(store.windows)) {
      const seen = new Set();
      for (const workspace of data.workspaces) {
        if (Object.hasOwn(workspace, 'syncId')) {
          if (workspace.syncId !== null && (!validWorkspaceSyncId(workspace.syncId) ||
              !Object.hasOwn(store.sync.records, workspace.syncId) || seen.has(workspace.syncId))) {
            throw new Error('invalid_workspace_catalog');
          }
          if (workspace.syncId) {
            seen.add(workspace.syncId);
          }
          continue;
        }
        if (workspace.isDefault && workspace.name === 'Default' && workspace.icon === 'default') {
          workspace.syncId = null;
          continue;
        }
        const candidate = `w1:${workspace.id}`;
        const value = { version: 1, name: workspace.name, icon: workspace.icon };
        workspace.syncId = validWorkspaceSyncId(candidate) && !seen.has(candidate) &&
          !store.sync.deleted.includes(candidate) && (!store.sync.records[candidate] ||
            JSON.stringify(store.sync.records[candidate]) === JSON.stringify(value)) ? candidate : this.newId();
        seen.add(workspace.syncId);
        store.sync.records[workspace.syncId] = value;
      }
    }
  }

  newId() {
    const id = `w1:${this.createId()}`;
    if (!validWorkspaceSyncId(id) || Object.hasOwn(this.store.sync.records, id) ||
        this.store.sync.deleted.includes(id)) {
      throw new Error('invalid_workspace_identity');
    }
    return id;
  }

  read(id) {
    return structuredClone(this.store.sync.records[id] ?? null);
  }

  listIds() {
    return Object.keys(this.store.sync.records).sort();
  }

  canDelete(id) {
    return this.store.sync.deleted.includes(id);
  }

  publish(workspace) {
    workspace.syncId ??= this.newId();
    const value = validateWorkspaceSyncValue(workspace.syncId,
      { version: 1, name: workspace.name, icon: workspace.icon });
    this.store.sync.records[workspace.syncId] = value;
    this.store.sync.deleted = this.store.sync.deleted.filter(id => id !== workspace.syncId);
    for (const data of Object.values(this.store.windows)) {
      for (const item of data.workspaces) {
        if (item.syncId === workspace.syncId) {
          Object.assign(item, { name: value.name, icon: value.icon });
        }
      }
    }
    return workspace.syncId;
  }

  materialize(data, preferred = null) {
    const ids = new Set(data.workspaces.map(workspace => workspace.syncId));
    const candidates = this.listIds();
    if (preferred && Object.hasOwn(this.store.sync.records, preferred)) {
      candidates.splice(candidates.indexOf(preferred), 1);
      candidates.unshift(preferred);
    }
    for (const id of candidates) {
      if (!ids.has(id) && data.workspaces.length < MAX_WORKSPACES) {
        const value = this.store.sync.records[id];
        data.workspaces.push({ id: this.createId(), syncId: id, name: value.name,
          icon: value.icon, isDefault: false });
      }
    }
  }

  missing(data) {
    const present = new Set(data.workspaces.map(workspace => workspace.syncId));
    return this.listIds().filter(id => !present.has(id)).length;
  }

  usage(id) {
    return Object.entries(this.store.windows).flatMap(([windowId, data]) =>
      data.workspaces.filter(workspace => workspace.syncId === id).map(workspace => ({
        windowId, id: workspace.id, selected: data.selectedId === workspace.id,
        isDefault: workspace.isDefault,
        tabs: Object.entries(data.tabs).filter(([, owner]) => owner === workspace.id).map(([tab]) => tab).sort(),
      }))).sort((left, right) => left.windowId.localeCompare(right.windowId) || left.id.localeCompare(right.id));
  }

  check(id, value, force = false) {
    if (value === null) {
      return !force && this.usage(id).some(use => use.selected || use.isDefault || use.tabs.length) ?
        'workspace_in_use' : null;
    }
    validateWorkspaceSyncValue(id, value);
    return Object.values(this.store.windows).some(data =>
      !data.workspaces.some(workspace => workspace.syncId === id) && data.workspaces.length >= MAX_WORKSPACES) ?
      'workspace_capacity' : null;
  }

  apply(id, value, { force = false } = {}) {
    const reason = this.check(id, value, force);
    if (reason) {
      return { status: 'conflict', reason };
    }
    if (value !== null) {
      this.store.sync.records[id] = validateWorkspaceSyncValue(id, value);
      this.store.sync.deleted = this.store.sync.deleted.filter(deleted => deleted !== id);
      for (const data of Object.values(this.store.windows)) {
        this.materialize(data, id);
        for (const workspace of data.workspaces) {
          if (workspace.syncId === id) {
            Object.assign(workspace, { name: value.name, icon: value.icon });
          }
        }
      }
    } else {
      if (!validWorkspaceSyncId(id)) {
        throw new Error('invalid_workspace_record');
      }
      delete this.store.sync.records[id];
      if (!this.store.sync.deleted.includes(id)) {
        this.store.sync.deleted.push(id);
      }
      for (const data of Object.values(this.store.windows)) {
        const removed = new Set(data.workspaces.filter(workspace => workspace.syncId === id).map(workspace => workspace.id));
        if (!removed.size) {
          continue;
        }
        data.workspaces = data.workspaces.filter(workspace => !removed.has(workspace.id));
        let fallback = data.workspaces.find(workspace => workspace.isDefault);
        if (!fallback) {
          fallback = { id: this.createId(), syncId: null, name: 'Default', icon: 'default', isDefault: true };
          data.workspaces.unshift(fallback);
        }
        for (const [tab, owner] of Object.entries(data.tabs)) {
          if (removed.has(owner)) {
            data.tabs[tab] = fallback.id;
          }
        }
        if (removed.has(data.selectedId)) {
          data.selectedId = fallback.id;
        }
      }
    }
    return { status: 'applied' };
  }
}
