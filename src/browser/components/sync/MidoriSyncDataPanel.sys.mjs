/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function createSyncDataPanel(doc, service, openTab = () => {}) {
  const element = (tag, id) => {
    const node = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
    if (id) {
      doc.l10n.setAttributes(node, id);
    }
    return node;
  };
  const section = element("section");
  section.className = "midori-sync-account";
  section.id = "midori-sync-data";
  const heading = element("h2", "midori-sync-data-heading");
  heading.id = "midori-sync-data-heading";
  section.setAttribute("aria-labelledby", heading.id);
  const status = element("p");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const collectionList = element("ul");
  collectionList.className = "midori-sync-collection-list";
  const collectionRows = new Map();
  const timeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  for (const name of ["bookmarks", "history", "passwords", "credit-cards", "tabs", "browser-settings"]) {
    const row = element("li");
    row.dataset.collection = name;
    const label = element("span", `midori-sync-collection-${name}`);
    const state = element("span");
    const last = element("small");
    row.append(label, state, last);
    collectionList.append(row);
    collectionRows.set(name, { state, last });
  }
  const sync = element("button", "midori-sync-data-now");
  sync.type = "button";
  const clear = element("button", "midori-sync-history-clear");
  clear.type = "button";
  clear.id = "midori-sync-history-clear";
  const warning = element("p", "midori-sync-history-clear-warning");
  warning.id = "midori-sync-history-clear-warning";
  const actions = element("div");
  actions.className = "midori-sync-actions";
  const cancelClear = element("button", "midori-sync-history-clear-cancel");
  cancelClear.type = "button";
  const confirmClear = element("button", "midori-sync-history-clear-confirm");
  confirmClear.type = "button";
  actions.append(cancelClear, confirmClear);
  const clearStatus = element("p");
  clearStatus.setAttribute("role", "status");
  clearStatus.setAttribute("aria-live", "polite");
  const remoteHeading = element("h2", "midori-sync-tabs-heading");
  const remoteStatus = element("p");
  remoteStatus.setAttribute("role", "status");
  const remoteList = element("div");
  remoteList.id = "midori-sync-remote-tabs";
  section.append(heading, status, collectionList, sync, clear, warning, actions, clearStatus,
    remoteHeading, remoteStatus, remoteList);
  let visible = false;
  let working = false;
  let version = 0;
  let error = false;
  let errorState = null;
  let confirmingClear = false;
  let clearResult = null;
  let remoteLoaded = false;
  let remotePass = null;
  let remoteRequest = 0;
  let fixedBody = null;
  let statusId = null;
  const loadRemote = async () => {
    if (!visible || typeof service.remoteTabs !== "function") {
      return;
    }
    const currentVersion = version;
    const currentRequest = ++remoteRequest;
    try {
      const snapshots = await service.remoteTabs();
      if (!visible || version !== currentVersion || remoteRequest !== currentRequest ||
          !["connected", "renewal-required"].includes(service.account.snapshot.status) ||
          service.keys.snapshot.status !== "ready") {
        return;
      }
      remoteList.replaceChildren();
      for (const snapshot of snapshots) {
        const device = element("section");
        const name = element("h3");
        name.textContent = snapshot.device_name;
        const list = element("ul");
        const addTab = tab => {
          const item = element("li");
          const button = element("button");
          button.type = "button";
          button.textContent = tab.title || tab.url;
          button.title = tab.url;
          button.addEventListener("click", () => openTab(tab.url));
          item.append(button);
          list.append(item);
        };
        for (const tab of snapshot.tabs.slice(0, 10)) {
          addTab(tab);
        }
        device.append(name, list);
        if (snapshot.tabs.length > 10) {
          const more = element("button");
          more.type = "button";
          doc.l10n.setAttributes(more, "midori-sync-tabs-show-more", { count: snapshot.tabs.length - 10 });
          more.addEventListener("click", () => {
            for (const tab of snapshot.tabs.slice(10)) {
              addTab(tab);
            }
            more.remove();
          }, { once: true });
          device.append(more);
        }
        if (snapshot.omitted) {
          const omitted = element("p");
          doc.l10n.setAttributes(omitted, "midori-sync-tabs-omitted", { count: snapshot.omitted });
          device.append(omitted);
        }
        remoteList.append(device);
      }
      doc.l10n.setAttributes(remoteStatus, snapshots.length ? "midori-sync-tabs-available" : "midori-sync-tabs-empty");
    } catch {
      if (visible && version === currentVersion && remoteRequest === currentRequest) {
        doc.l10n.setAttributes(remoteStatus, "midori-sync-tabs-unavailable");
      }
    }
  };
  const refresh = () => {
    const account = service.account.snapshot;
    const ready = ["connected", "renewal-required"].includes(account.status) &&
      service.keys.snapshot.status === "ready";
    const collectionSnapshots = service.syncCollectionsSnapshot;
    const currentState = JSON.stringify(collectionSnapshots?.map(snapshot =>
      [snapshot.name, snapshot.status, snapshot.error, snapshot.pending, snapshot.lastSuccessAt]));
    if (error && errorState !== currentState) {
      error = false;
      errorState = null;
    }
    const tabsPass = collectionSnapshots?.find(snapshot => snapshot.name === "tabs")?.lastSuccessAt ?? null;
    section.hidden = !visible || !["connected", "renewal-required", "local"].includes(account.status);
    remoteHeading.hidden = remoteStatus.hidden = remoteList.hidden = !ready;
    if (!ready) {
      remoteList.replaceChildren();
      remoteLoaded = false;
      remotePass = null;
      ++remoteRequest;
    } else if (visible && (!remoteLoaded || remotePass !== tabsPass)) {
      remoteLoaded = true;
      remotePass = tabsPass;
      Promise.resolve().then(loadRemote);
    }
    sync.disabled = !ready || account.busy || working;
    clear.disabled = !ready || account.busy || working;
    clear.hidden = confirmingClear;
    warning.hidden = actions.hidden = !confirmingClear;
    cancelClear.disabled = confirmClear.disabled = !ready || account.busy || working;
    clearStatus.hidden = !clearResult;
    if (clearResult) {
      doc.l10n.setAttributes(clearStatus, `midori-sync-history-clear-${clearResult}`);
    }
    collectionList.hidden = !collectionSnapshots;
    if (collectionSnapshots) {
      for (const snapshot of collectionSnapshots) {
        const row = collectionRows.get(snapshot.name);
        if (!row) {
          continue;
        }
        const count = snapshot.status === "conflict" ? snapshot.conflicts : snapshot.pending;
        const stateId = snapshot.status === "error" && ["server_error", "network_error", "timeout", "rate_limited"].includes(snapshot.error) ?
          snapshot.error.replaceAll("_", "-") : snapshot.status;
        const stateKey = `${stateId}:${count}`;
        if (row.state.dataset.key !== stateKey) {
          row.state.dataset.key = stateKey;
          doc.l10n.setAttributes(row.state, `midori-sync-collection-status-${stateId}`, { count });
        }
        row.last.hidden = !snapshot.lastSuccessAt;
        if (snapshot.lastSuccessAt && row.last.dataset.timestamp !== String(snapshot.lastSuccessAt)) {
          row.last.dataset.timestamp = String(snapshot.lastSuccessAt);
          const time = timeFormatter.format(new Date(snapshot.lastSuccessAt));
          doc.l10n.setAttributes(row.last, "midori-sync-collection-last-pass", { time });
        }
      }
    }
    const serverError = collectionSnapshots?.some(snapshot => snapshot.status === "error" && snapshot.error === "server_error");
    const collectionError = collectionSnapshots?.some(snapshot => snapshot.status === "error");
    const passwordNeedsUnlock = collectionSnapshots?.some(snapshot =>
      snapshot.name === "passwords" && snapshot.status === "locked");
    const cardNeedsUnlock = collectionSnapshots?.some(snapshot =>
      snapshot.name === "credit-cards" && snapshot.status === "locked");
    const automaticallyCurrent = ready && collectionSnapshots?.length &&
      collectionSnapshots.every(snapshot => ["completed", "unsupported"].includes(snapshot.status));
    const backgroundWorking = collectionSnapshots?.some(snapshot => snapshot.status === "syncing");
    const more = collectionSnapshots?.some(snapshot => ["pending", "more"].includes(snapshot.status));
    const id = working ? "working" : passwordNeedsUnlock ? "passwords-locked" : cardNeedsUnlock ? "cards-locked" : serverError ? "server-error" :
      error || collectionError ? "partial" :
      backgroundWorking ? "working" : more ? "more" : automaticallyCurrent ? "up-to-date" : ready ? "ready" : "paused";
    const nextStatusId = id === "ready" && !account.creditCardsSupported &&
      !service.connection.snapshot.capabilities?.creditCards ?
      "midori-sync-data-ready-legacy" : `midori-sync-data-${id}`;
    if (statusId !== nextStatusId) {
      statusId = nextStatusId;
      doc.l10n.setAttributes(status, statusId);
    }
  };
  clear.addEventListener("click", () => {
    confirmingClear = true;
    clearResult = null;
    refresh();
    confirmClear.focus();
  });
  cancelClear.addEventListener("click", () => {
    confirmingClear = false;
    refresh();
    clear.focus();
  });
  confirmClear.addEventListener("click", async () => {
    if (confirmClear.disabled) {
      return;
    }
    const currentVersion = version;
    working = true;
    refresh();
    try {
      await service.clearHistory();
      if (visible && version === currentVersion) {
        clearResult = "done";
        confirmingClear = false;
      }
    } catch {
      if (visible && version === currentVersion) {
        clearResult = "failed";
      }
    } finally {
      if (visible && version === currentVersion) {
        working = false;
        refresh();
      }
    }
  });
  sync.addEventListener("click", async () => {
    if (sync.disabled) {
      return;
    }
    if (!fixedBody) {
      const body = section.closest(".midori-sync-body");
      if (body) {
        body.style.height = `${body.getBoundingClientRect().height}px`;
        fixedBody = body;
      }
    }
    const currentVersion = version;
    working = true;
    error = false;
    refresh();
    try {
      const outcome = await service.syncNow({ limit: 100, inventory: true, promptPasswords: true });
      if (visible && version === currentVersion) {
        error = Object.keys(outcome.errors).length > 0;
        errorState = error ? JSON.stringify(service.syncCollectionsSnapshot?.map(snapshot =>
          [snapshot.name, snapshot.status, snapshot.error, snapshot.pending, snapshot.lastSuccessAt])) : null;
        await loadRemote();
      }
    } catch {
      if (visible && version === currentVersion) {
        error = true;
        errorState = JSON.stringify(service.syncCollectionsSnapshot?.map(snapshot =>
          [snapshot.name, snapshot.status, snapshot.error, snapshot.pending, snapshot.lastSuccessAt]));
      }
    } finally {
      if (visible && version === currentVersion) {
        working = false;
        refresh();
      }
    }
  });
  return {
    section, refresh,
    open() { visible = true; ++version; working = false; error = false; errorState = null;
      confirmingClear = false; clearResult = null; remoteLoaded = false; remotePass = null; refresh(); },
    close() { visible = false; ++version; working = false; error = false; errorState = null;
      confirmingClear = false; clearResult = null; remoteLoaded = false; remotePass = null; ++remoteRequest;
      remoteList.replaceChildren(); section.hidden = true;
      if (fixedBody) {
        fixedBody.style.removeProperty("height");
        fixedBody = null;
      }
    },
  };
}
