/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setL10n } from "./MidoriSyncUi.sys.mjs";

export function createSyncJournalPanel(doc, service) {
  const el = (tag, id, args) => {
    const node = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
    if (id) { setL10n(doc.l10n, node, id, args); }
    return node;
  };
  const section = el("details");
  section.id = "midori-sync-saved-journals";
  section.className = "advanced";
  const message = el("p");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  const list = el("ul");
  const detail = el("div");
  detail.id = "midori-sync-saved-journal-detail";
  const confirmation = el("div");
  const warning = el("p");
  const controls = [];
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
  const size = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
  let active = false;
  let busy = false;
  let version = 0;
  let generation = null;
  let nextAfter = null;
  let selected = null;
  let choice = null;
  const button = (id, action) => {
    const node = el("button", id);
    node.type = "button";
    node.addEventListener("click", action);
    controls.push(node);
    return node;
  };
  const clearDetail = () => {
    selected = choice = null;
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
  const act = async work => {
    if (!active || busy) { return; }
    const current = ++version;
    busy = true;
    setL10n(doc.l10n, message, "midori-sync-saved-working");
    refresh();
    try {
      await work(() => active && current === version && generation === service.account.snapshot.generation);
    } catch (error) {
      if (active && current === version) {
        const state = error.code === "store_changed" ? "changed" :
          error.code === "sync_pending_operations" ? "active-pending" :
          ["keys_locked", "auth_required", "local_state_unavailable"].includes(error.code) ? "unlock" :
          error.code === "sync_disconnect_unavailable" ? "active-unverified" :
          ["busy", "store_busy"].includes(error.code) ? "busy" : "failed";
        setL10n(doc.l10n, message, `midori-sync-saved-${state}`);
        if (state === "changed") { clearDetail(); }
      }
    } finally {
      if (active && current === version) { busy = false; refresh(); }
    }
  };
  const choose = value => {
    if (!selected || busy) { return; }
    choice = value;
    setL10n(doc.l10n, warning, `midori-sync-saved-confirm-${value}`);
    detail.append(confirmation);
    refresh();
    confirm.focus();
  };
  const restore = button("midori-sync-saved-restore", () => choose("restore"));
  const protect = button("midori-sync-saved-protect", () => choose("protect"));
  const remove = button("midori-sync-saved-delete", () => choose("delete"));
  const review = entry => act(async current => {
    const result = await service.reviewSavedJournal(entry.id);
    if (!current()) { return; }
    selected = result;
    choice = null;
    const counts = result.collections.reduce((sum, item) => ({ pending: sum.pending + item.pending,
      conflicts: sum.conflicts + item.conflicts, unfinished: sum.unfinished + item.unfinished }),
    { pending: 0, conflicts: 0, unfinished: 0 });
    detail.replaceChildren(el("p", `midori-sync-saved-state-${result.status}`));
    if (["recoverable", "other-device", "archived"].includes(result.status)) {
      detail.append(el("p", "midori-sync-saved-counts", { pending: counts.pending, conflicts: counts.conflicts }));
      if (counts.unfinished) { detail.append(el("p", "midori-sync-saved-unfinished")); }
      const families = el("ul");
      for (const item of result.collections) {
        const row = el("li");
        row.append(el("span", `midori-sync-collection-${item.name}`), doc.createTextNode(" · "),
          el("span", "midori-sync-saved-counts", { pending: item.pending, conflicts: item.conflicts }));
        families.append(row);
      }
      detail.append(families);
    }
    const actions = el("div");
    actions.className = "midori-sync-actions";
    actions.append(restore, protect, remove);
    detail.append(actions);
    setL10n(doc.l10n, message, "midori-sync-saved-reviewed");
  });
  const loadPage = after => act(async current => {
    const result = await service.savedJournalPage({ after, limit: 25 });
    if (!current()) { return; }
    list.replaceChildren();
    clearDetail();
    nextAfter = result.nextAfter;
    for (const [index, entry] of result.entries.entries()) {
      const row = el("li");
      const inspect = el("button", "midori-sync-saved-entry", { number: index + 1 });
      inspect.type = "button";
      inspect.addEventListener("click", () => review(entry));
      row.append(inspect, doc.createTextNode(" "), el("span", "midori-sync-saved-file", {
        date: date.format(new Date(entry.modified)), size: size.format(entry.bytes / 1024),
      }));
      if (entry.incomplete) { row.append(el("p", "midori-sync-saved-incomplete")); }
      list.append(row);
    }
    setL10n(doc.l10n, message, result.entries.length ? "midori-sync-saved-select" : "midori-sync-saved-empty");
  });
  const load = button("midori-sync-saved-load", () => loadPage(null));
  const next = button("midori-sync-saved-next", () => loadPage(nextAfter));
  const cancel = button("midori-sync-saved-cancel", () => { choice = null; refresh(); });
  const confirm = button("midori-sync-saved-confirm", () => {
    if (!selected || !choice || busy) { return; }
    const request = { id: selected.id, token: selected.token, choice };
    act(async current => {
      if (request.choice === "restore") { await service.restoreSavedJournal(request.id, request.token); }
      else if (request.choice === "protect") { await service.protectSavedJournal(request.id, request.token); }
      else { await service.deleteSavedJournal(request.id, request.token); }
      if (!current()) { return; }
      clearDetail();
      list.replaceChildren();
      nextAfter = null;
      const completed = { restore: "restored", protect: "protected", delete: "deleted" }[request.choice];
      setL10n(doc.l10n, message, `midori-sync-saved-${completed}`);
    });
  });
  confirmation.append(warning, cancel, confirm);
  const refresh = () => {
    const account = service.account.snapshot;
    if (generation !== account.generation) {
      generation = account.generation;
      reset();
    }
    section.hidden = !active;
    for (const control of controls) { control.disabled = busy || account.interactionBusy === true; }
    for (const control of list.querySelectorAll("button")) { control.disabled = busy || account.interactionBusy === true; }
    restore.disabled ||= !selected?.canRestore;
    protect.disabled ||= !selected?.canProtect;
    remove.disabled ||= !selected;
    next.disabled ||= !nextAfter;
    confirmation.hidden = !choice;
  };
  section.append(el("summary", "midori-sync-saved-heading"), el("p", "midori-sync-saved-help"),
    load, message, list, next, detail);
  return { section, refresh,
    open() { active = true; reset(); refresh(); },
    close() { active = false; reset(); section.hidden = true; },
  };
}
