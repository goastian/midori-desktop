/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setL10n } from "./MidoriSyncUi.sys.mjs";
import { SYNC_DESKTOP_COLLECTIONS } from "./MidoriSyncProtocol.sys.mjs";
import { createSyncExtensionsPanel } from "./MidoriSyncExtensionsPanel.sys.mjs";

export function createSyncDataPanel(doc, service, openTab = () => {}) {
  const element = (tag, id) => {
    const node = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
    if (id) {
      setL10n(doc.l10n, node, id);
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
  for (const name of SYNC_DESKTOP_COLLECTIONS) {
    const row = element("li");
    row.dataset.collection = name;
    const label = element("span", `midori-sync-collection-${name}`);
    const selection = element("input");
    selection.type = "checkbox";
    selection.className = "midori-sync-switch";
    selection.dataset.collectionSelection = name;
    const container = element("label");
    container.append(label, selection);
    row.append(container);
    selection.addEventListener("change", () => {
      try {
        service.setCollectionEnabled(name, selection.checked);
      } catch {}
      refresh();
    });
    const state = element("span");
    const last = element("small");
    row.append(state, last);
    if (["site-permissions", "extensions", "extension-settings"].includes(name)) {
      const helpId = name === "site-permissions" ? "midori-sync-permissions-help" : `midori-sync-${name}-help`;
      const help = element("small", helpId);
      help.id = helpId;
      help.className = "midori-sync-collection-help";
      selection.setAttribute("aria-describedby", help.id);
      row.append(help);
    }
    collectionList.append(row);
    collectionRows.set(name, { state, last, selection });
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
  const advanced = element("details");
  advanced.className = "midori-sync-advanced";
  const advancedTitle = element("summary", "midori-sync-advanced-summary");
  advanced.append(advancedTitle, clear, warning, actions, clearStatus);
  const extensions = SYNC_DESKTOP_COLLECTIONS.includes("extensions") ? createSyncExtensionsPanel(doc, service) : null;
  section.append(heading, status, collectionList, element("p", "midori-sync-selection-help"), sync, ...(extensions ? [extensions.section] : []), advanced,
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
  let keysRefreshGeneration = null;
  let remoteSignature = null;
  const loadRemote = async () => {
    if (!visible || typeof service.remoteTabs !== "function") {
      return;
    }
    const currentVersion = version;
    const currentRequest = ++remoteRequest;
    try {
      const snapshots = await service.remoteTabs();
      if (!visible || version !== currentVersion || remoteRequest !== currentRequest ||
          !["connected", "renewal-required", "local"].includes(service.account.snapshot.status) ||
          service.keys.snapshot.status !== "ready") {
        return;
      }
      const signature = JSON.stringify(snapshots);
      if (signature === remoteSignature) {
        return;
      }
      remoteSignature = signature;
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
          setL10n(doc.l10n, more, "midori-sync-tabs-show-more", { count: snapshot.tabs.length - 10 });
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
          setL10n(doc.l10n, omitted, "midori-sync-tabs-omitted", { count: snapshot.omitted });
          device.append(omitted);
        }
        remoteList.append(device);
      }
      setL10n(doc.l10n, remoteStatus, snapshots.length ? "midori-sync-tabs-available" : "midori-sync-tabs-empty");
    } catch (failure) {
      if (visible && version === currentVersion && remoteRequest === currentRequest) {
        if (["busy", "cancelled"].includes(failure.code)) {
          remoteLoaded = false;
        } else {
          setL10n(doc.l10n, remoteStatus, "midori-sync-tabs-unavailable");
        }
      }
    }
  };
  const refreshCollectionRows = (collectionSnapshots, accountBusy) => {
    collectionList.hidden = !collectionSnapshots;
    if (collectionSnapshots) {
      for (const snapshot of collectionSnapshots) {
        const row = collectionRows.get(snapshot.name);
        if (!row) {
          continue;
        }
        if (row.selection) {
          row.selection.checked = snapshot.enabled !== false;
          row.selection.disabled = accountBusy ||
            typeof service.setCollectionEnabled !== "function";
        }
        const waitingStatus = { "site-permissions": "permissions-waiting", extensions: "extensions-waiting", "extension-settings": "extension-settings-waiting" };
        const waiting = Object.hasOwn(waitingStatus, snapshot.name) && snapshot.status === "more" && snapshot.deferred > 0;
        const count = waiting ? snapshot.deferred : snapshot.status === "conflict" ? snapshot.conflicts : snapshot.pending;
        const stateId = waiting ? waitingStatus[snapshot.name] : snapshot.status === "error" && ["server_error", "network_error", "timeout", "rate_limited", "form_history_disabled", "native_write_failed"].includes(snapshot.error) ?
          snapshot.error.replaceAll("_", "-") : snapshot.status;
        const stateKey = `${stateId}:${count}`;
        if (row.state.dataset.key !== stateKey) {
          row.state.dataset.key = stateKey;
          setL10n(doc.l10n, row.state, `midori-sync-collection-status-${stateId}`, { count });
        }
        row.last.hidden = !snapshot.lastSuccessAt;
        if (snapshot.lastSuccessAt && row.last.dataset.timestamp !== String(snapshot.lastSuccessAt)) {
          row.last.dataset.timestamp = String(snapshot.lastSuccessAt);
          const time = timeFormatter.format(new Date(snapshot.lastSuccessAt));
          setL10n(doc.l10n, row.last, "midori-sync-collection-last-pass", { time });
        }
      }
    }
  };
  const summaryStatus = ({ account, ready, paused, keysNeedAction, collectionSnapshots }) => {
    if (paused) {
      return "user-paused";
    }
    if (working) {
      return "working";
    }
    if (collectionSnapshots?.some(snapshot => snapshot.name === "passwords" && snapshot.status === "locked")) {
      return "passwords-locked";
    }
    if (collectionSnapshots?.some(snapshot => snapshot.name === "credit-cards" && snapshot.status === "locked")) {
      return "cards-locked";
    }
    if (collectionSnapshots?.some(snapshot => snapshot.status === "error" && snapshot.error === "native_write_failed")) {
      return "device-storage";
    }
    if (collectionSnapshots?.some(snapshot => snapshot.status === "error" && snapshot.error === "server_error")) {
      return "server-error";
    }
    if (collectionSnapshots?.some(snapshot => snapshot.status === "error" && snapshot.error === "form_history_disabled")) {
      return "form-history-disabled";
    }
    if (collectionSnapshots?.some(snapshot => snapshot.enabled !== false && snapshot.status === "unsupported")) {
      return "server-update-required";
    }
    const selected = collectionSnapshots?.some(snapshot => snapshot.enabled !== false && snapshot.status !== "disabled");
    if (ready && collectionSnapshots?.length && !selected) {
      return "no-selection";
    }
    if (error || collectionSnapshots?.some(snapshot => snapshot.status === "error")) {
      return "partial";
    }
    if (collectionSnapshots?.some(snapshot => snapshot.status === "syncing")) {
      return "working";
    }
    if (ready && (account.status === "local" || service.backgroundSnapshot?.offline)) {
      return "offline";
    }
    if (collectionSnapshots?.some(snapshot => ["pending", "more"].includes(snapshot.status))) {
      return "more";
    }
    if (ready && selected && collectionSnapshots.every(snapshot => ["completed", "disabled"].includes(snapshot.status))) {
      return "up-to-date";
    }
    if (ready) {
      return "ready";
    }
    return keysNeedAction ? "keys-required" : "paused";
  };
  const refresh = () => {
    const account = service.account.snapshot;
    const accountBusy = account.interactionBusy ?? account.busy;
    const keysSnapshot = service.keys.snapshot;
    const connected = ["connected", "renewal-required"].includes(account.status);
    const ready = (connected || account.status === "local") && keysSnapshot.status === "ready";
    const paused = service.backgroundSnapshot?.globalEnabled === false;
    if (connected && keysSnapshot.status === "locked" && !keysSnapshot.busy && !keysSnapshot.error &&
        keysRefreshGeneration !== account.generation) {
      keysRefreshGeneration = account.generation;
      service.keys.refresh().catch(() => {});
    }
    const keysNeedAction = connected && !ready && !keysSnapshot.busy && (keysSnapshot.error ||
      ["empty", "recovery-required", "migration-required", "backup-required", "pending",
        "rotation-pending", "rotation-backup-required"].includes(keysSnapshot.status));
    const collectionSnapshots = service.syncCollectionsSnapshot;
    const historySelected = collectionSnapshots?.find(snapshot => snapshot.name === "history")?.enabled !== false;
    const currentState = JSON.stringify(collectionSnapshots?.map(snapshot =>
      [snapshot.name, snapshot.status, snapshot.error, snapshot.pending, snapshot.lastSuccessAt]));
    if (error && errorState !== currentState) {
      error = false;
      errorState = null;
    }
    const tabsPass = collectionSnapshots?.find(snapshot => snapshot.name === "tabs")?.lastSuccessAt ?? null;
    section.hidden = !visible || !["connected", "renewal-required", "local"].includes(account.status);
    extensions?.refresh(visible && !section.hidden);
    remoteHeading.hidden = remoteStatus.hidden = remoteList.hidden = !ready;
    if (!ready) {
      remoteList.replaceChildren();
      remoteSignature = null;
      remoteLoaded = false;
      remotePass = null;
      ++remoteRequest;
    } else if (visible && (!remoteLoaded || remotePass !== tabsPass)) {
      remoteLoaded = true;
      remotePass = tabsPass;
      Promise.resolve().then(loadRemote);
    }
    sync.disabled = paused || !ready || accountBusy || working;
    clear.disabled = paused || !historySelected || !ready || account.status === "local" || service.backgroundSnapshot?.offline || accountBusy || working;
    clear.hidden = confirmingClear;
    warning.hidden = actions.hidden = !confirmingClear;
    cancelClear.disabled = working;
    confirmClear.disabled = paused || !historySelected || !ready || accountBusy || working;
    clearStatus.hidden = !clearResult;
    if (clearResult) {
      setL10n(doc.l10n, clearStatus, `midori-sync-history-clear-${clearResult}`);
    }
    refreshCollectionRows(collectionSnapshots, accountBusy);
    const id = summaryStatus({ account, ready, paused, keysNeedAction, collectionSnapshots });
    const nextStatusId = id === "ready" && !account.creditCardsSupported &&
      !service.connection.snapshot.capabilities?.creditCards ?
      "midori-sync-data-ready-legacy" : `midori-sync-data-${id}`;
    if (statusId !== nextStatusId) {
      statusId = nextStatusId;
      setL10n(doc.l10n, status, statusId);
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
        error = Boolean(Object.keys(outcome.errors).length);
        errorState = error ? JSON.stringify(service.syncCollectionsSnapshot?.map(snapshot =>
          [snapshot.name, snapshot.status, snapshot.error, snapshot.pending, snapshot.lastSuccessAt])) : null;
        await loadRemote();
      }
    } catch (failure) {
      if (visible && version === currentVersion) {
        error = !["cancelled", "sync_paused", "collection_disabled"].includes(failure.code);
        errorState = error ? JSON.stringify(service.syncCollectionsSnapshot?.map(snapshot =>
          [snapshot.name, snapshot.status, snapshot.error, snapshot.pending, snapshot.lastSuccessAt])) : null;
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
      remoteList.replaceChildren(); extensions?.close(); section.hidden = true;
      if (fixedBody) {
        fixedBody.style.removeProperty("height");
        fixedBody = null;
      }
    },
  };
}
