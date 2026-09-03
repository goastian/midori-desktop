/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export class WorkspaceTabIndex {
  constructor(workspaceIds = []) {
    this.setWorkspaceIds(workspaceIds);
  }

  setWorkspaceIds(workspaceIds) {
    this.workspaceIds = new Set(workspaceIds);
    this.tabWorkspaceIds ||= new WeakMap();
    this.tabCounts ||= new Map();
    this.lastShownTabs ||= new Map();

    for (const workspaceId of this.workspaceIds) {
      if (!this.tabCounts.has(workspaceId)) {
        this.tabCounts.set(workspaceId, 0);
      }
    }
    for (const workspaceId of this.tabCounts.keys()) {
      if (!this.workspaceIds.has(workspaceId)) {
        this.tabCounts.delete(workspaceId);
        this.lastShownTabs.delete(workspaceId);
      }
    }
  }

  reset(workspaceIds) {
    this.workspaceIds = new Set(workspaceIds);
    this.tabWorkspaceIds = new WeakMap();
    this.tabCounts = new Map(
      Array.from(this.workspaceIds, workspaceId => [workspaceId, 0])
    );
    this.lastShownTabs = new Map();
  }

  get(tab) {
    const workspaceId = this.tabWorkspaceIds.get(tab);
    return this.workspaceIds.has(workspaceId) ? workspaceId : null;
  }

  assign(tab, workspaceId) {
    if (!tab || !this.workspaceIds.has(workspaceId)) {
      return false;
    }

    const previousWorkspaceId = this.get(tab);
    if (previousWorkspaceId === workspaceId) {
      return false;
    }

    if (previousWorkspaceId) {
      this.tabCounts.set(
        previousWorkspaceId,
        Math.max(0, this.count(previousWorkspaceId) - 1)
      );
      if (this.lastShownTabs.get(previousWorkspaceId) === tab) {
        this.lastShownTabs.delete(previousWorkspaceId);
      }
    }
    this.tabWorkspaceIds.set(tab, workspaceId);
    this.tabCounts.set(workspaceId, this.count(workspaceId) + 1);
    return true;
  }

  forget(tab) {
    const workspaceId = this.get(tab);
    if (!workspaceId) {
      return false;
    }

    this.tabWorkspaceIds.delete(tab);
    this.tabCounts.set(workspaceId, Math.max(0, this.count(workspaceId) - 1));
    if (this.lastShownTabs.get(workspaceId) === tab) {
      this.lastShownTabs.delete(workspaceId);
    }
    return true;
  }

  count(workspaceId) {
    return this.tabCounts.get(workspaceId) || 0;
  }

  setLastShown(workspaceId, tab) {
    if (!tab || !this.workspaceIds.has(workspaceId)) {
      return null;
    }
    const previousTab = this.lastShownTabs.get(workspaceId) || null;
    this.lastShownTabs.set(workspaceId, tab);
    return previousTab;
  }

  getLastShown(workspaceId) {
    return this.lastShownTabs.get(workspaceId) || null;
  }
}
