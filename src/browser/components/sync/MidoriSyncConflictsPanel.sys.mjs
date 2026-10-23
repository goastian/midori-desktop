/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setL10n } from "./MidoriSyncUi.sys.mjs";

export function createSyncConflictsPanel(doc, service) {
  const element = (tag, id, args) => {
    const node = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
    if (id) { setL10n(doc.l10n, node, id, args); }
    return node;
  };
  const section = element("details");
  section.id = "midori-sync-conflicts";
  section.className = "advanced";
  const heading = element("summary", "midori-sync-conflicts-heading", { count: 0 });
  const help = element("p", "midori-sync-conflicts-help");
  const selectorLabel = element("label", "midori-sync-conflicts-collection");
  const selector = element("select");
  selector.id = "midori-sync-conflicts-collection";
  selectorLabel.htmlFor = selector.id;
  const message = element("p");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  const list = element("ul");
  list.id = "midori-sync-conflict-list";
  const detail = element("div");
  detail.id = "midori-sync-conflict-detail";
  const confirmation = element("div");
  const warning = element("p");
  const button = (id, action) => {
    const node = element("button", id);
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  };
  let active = false;
  let busy = false;
  let version = 0;
  let generation = null;
  let signature = null;
  let nextAfter = null;
  let chosen = null;
  let preview = null;
  let choice = null;
  const actions = element("div");
  actions.className = "midori-sync-actions";
  const controls = [];
  const clearDetail = () => {
    chosen = preview = choice = null;
    detail.replaceChildren();
  };
  const reset = () => {
    ++version;
    busy = false;
    nextAfter = null;
    list.replaceChildren();
    clearDetail();
    message.replaceChildren();
    message.removeAttribute("data-l10n-id");
  };
  const act = async task => {
    if (busy || section.hidden) { return; }
    const current = ++version;
    busy = true;
    setL10n(doc.l10n, message, "midori-sync-conflicts-working");
    refresh();
    try {
      await task(() => active && current === version && generation === service.account.snapshot.generation);
    } catch (error) {
      if (active && current === version) {
        const state = error.code === "conflict_changed" ? "changed" : error.code === "conflict_merge_unavailable" ? "merge-unavailable" :
          error.code === "conflict_resolution_unavailable" ? "choice-unavailable" :
          error.code === "conflict_resolution_pending" ? "pending" : "retry";
        setL10n(doc.l10n, message, `midori-sync-conflicts-${state}`);
        if (state === "changed") { clearDetail(); }
      }
    } finally {
      if (active && current === version) { busy = false; refresh(); }
    }
  };
  const showSummary = (id, summary) => {
    const box = element("section");
    box.append(element("h3", id));
    if (summary.deleted) {
      box.append(element("p", "midori-sync-conflicts-deleted"));
    } else if (!summary.fields.length) {
      box.append(element("p", "midori-sync-conflicts-hidden"));
    } else {
      const fields = element("dl");
      for (const field of summary.fields) {
        const value = element("dd");
        if (field.l10nId) {
          setL10n(doc.l10n, value, field.l10nId);
        } else {
          value.textContent = field.value;
        }
        fields.append(element("dt", `midori-sync-conflict-field-${field.name}`), value);
      }
      box.append(fields);
    }
    if (["sensitive-grant", "policy", "session", "excluded", "expired"].includes(summary.localReason)) {
      box.append(element("p", `midori-sync-permission-local-${summary.localReason}`));
    }
    return box;
  };
  const inspect = entry => act(async current => {
    const result = await service.conflictPreview(selector.value, entry);
    if (!current()) { return; }
    chosen = entry;
    preview = result;
    choice = null;
    detail.replaceChildren(showSummary("midori-sync-conflicts-local", result.local),
      showSummary("midori-sync-conflicts-remote", result.remote), actions);
    if (selector.value === "workspaces" && result.remote.deleted) {
      detail.append(element("p", "midori-sync-conflicts-workspace-delete"));
    }
    if (entry.reason === "workspace_capacity") {
      detail.append(element("p", "midori-sync-conflicts-workspace-capacity"));
    }
    setL10n(doc.l10n, message, "midori-sync-conflicts-review");
  });
  const loadPage = after => act(async current => {
    const result = await service.conflictPage(selector.value, { after, limit: 25, summaries: true });
    if (!current()) { return; }
    clearDetail();
    list.replaceChildren();
    nextAfter = result.entries.length ? result.nextAfter : null;
    for (const [index, entry] of result.entries.entries()) {
      const row = element("li");
      const control = button("midori-sync-conflicts-entry", () => inspect(entry));
      setL10n(doc.l10n, control, "midori-sync-conflicts-entry", { number: index + 1 });
      control.disabled = !entry.canKeepLocal;
      control.dataset.unavailable = String(!entry.canKeepLocal);
      const label = element("span");
      for (const [fieldIndex, field] of (entry.summary?.fields ?? []).entries()) {
        if (fieldIndex) { label.append(" · "); }
        const value = element("span", field.l10nId);
        if (!field.l10nId) { value.textContent = field.value; }
        label.append(value);
      }
      row.append(control, label);
      if (!entry.canKeepLocal) { row.append(element("p", "midori-sync-conflicts-unavailable")); }
      list.append(row);
    }
    setL10n(doc.l10n, message, result.entries.length ? "midori-sync-conflicts-select" : "midori-sync-conflicts-empty");
  });
  const load = button("midori-sync-conflicts-load", () => loadPage(null));
  const next = button("midori-sync-conflicts-next", () => loadPage(nextAfter));
  controls.push(load, next);
  for (const value of ["local", "remote", "merge"]) {
    const control = button(`midori-sync-conflicts-use-${value}`, () => {
      if (!chosen || busy) { return; }
      choice = value;
      setL10n(doc.l10n, warning, `midori-sync-conflicts-confirm-${choice}`);
      detail.append(confirmation);
      refresh();
      confirm.focus();
    });
    control.dataset.choice = value;
    actions.append(control);
    controls.push(control);
  }
  const cancel = button("midori-sync-conflicts-cancel", () => { choice = null; refresh(); });
  const confirm = button("midori-sync-conflicts-confirm", () => {
    if (!chosen || !preview || !choice || busy) { return; }
    const request = { id: chosen.id, revision: chosen.revision, remoteRevision: chosen.remoteRevision,
      localRevision: preview.localRevision, choice };
    act(async current => {
      await service.resolveConflict(selector.value, request);
      if (!current()) { return; }
      list.replaceChildren();
      nextAfter = null;
      clearDetail();
      setL10n(doc.l10n, message, "midori-sync-conflicts-queued");
    });
  });
  controls.push(cancel, confirm);
  confirmation.append(warning, cancel, confirm);
  const refresh = () => {
    const account = service.account.snapshot;
    const ready = ["connected", "renewal-required"].includes(account.status) && service.keys.snapshot.status === "ready";
    if (generation !== account.generation || !ready && (chosen || list.childElementCount || busy)) {
      generation = account.generation;
      reset();
    }
    const collections = (service.syncCollectionsSnapshot ?? []).filter(item => item.conflicts > 0);
    const total = collections.reduce((count, item) => count + item.conflicts, 0);
    section.hidden = !active || !ready || !total;
    setL10n(doc.l10n, heading, "midori-sync-conflicts-heading", { count: total });
    const currentSignature = collections.map(item => item.name).join(",");
    if (signature !== currentSignature) {
      signature = currentSignature;
      const selected = selector.value;
      selector.replaceChildren(...collections.map(item => {
        const option = element("option", `midori-sync-collection-${item.name}`);
        option.value = item.name;
        return option;
      }));
      if (collections.some(item => item.name === selected)) { selector.value = selected; }
      else { reset(); }
    }
    selector.disabled = busy;
    for (const control of controls) { control.disabled = busy; }
    next.disabled ||= !nextAfter;
    for (const control of actions.children) {
      control.disabled ||= !chosen || control.dataset.choice === "remote" && !chosen.canAcceptRemote ||
        control.dataset.choice === "merge" && !chosen.canMerge;
    }
    for (const control of list.querySelectorAll("button")) {
      control.disabled = busy || control.dataset.unavailable === "true";
    }
    confirmation.hidden = !choice;
  };
  selector.addEventListener("change", () => { reset(); refresh(); });
  section.append(heading, help, selectorLabel, selector, load, message, list, next, detail);
  return { section, refresh,
    open() { active = true; reset(); refresh(); },
    close() { active = false; reset(); section.hidden = true; },
  };
}
