/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { setL10n } from "./MidoriSyncUi.sys.mjs";

const reasons = Object.freeze({
  extension_downloading: "downloading", extension_install_queued: "queued",
  extension_permission_required: "permission", extension_permission_declined: "declined",
  extension_window_required: "window", extension_policy: "policy", extension_incompatible: "incompatible",
  extension_blocked: "blocked", extension_unavailable: "unavailable", extension_cancelled: "cancelled",
  extension_download_failed: "failed", extension_install_failed: "failed", extension_local_changed: "changed",
  extension_retry_scheduled: "retrying",
});

export function createSyncExtensionsPanel(doc, service) {
  const element = (tag, id) => {
    const node = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
    if (id) { setL10n(doc.l10n, node, id); }
    return node;
  };
  const section = element("section");
  section.id = "midori-sync-extensions-pending";
  const heading = element("h3", "midori-sync-extensions-heading");
  heading.id = "midori-sync-extensions-heading";
  section.setAttribute("aria-labelledby", heading.id);
  const load = element("button", "midori-sync-extensions-load");
  load.id = "midori-sync-extensions-load";
  load.type = "button";
  const message = element("p");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  const list = element("ul");
  list.id = "midori-sync-extension-list";
  const more = element("button", "midori-sync-extensions-more");
  more.type = "button";
  more.hidden = true;
  section.append(heading, element("p", "midori-sync-extensions-pending-help"), load, message, list, more);
  let active = false;
  let busy = false;
  let version = 0;
  let identity = null;
  let next = null;
  const reset = () => {
    ++version; busy = false; next = null;
    list.replaceChildren(); message.replaceChildren();
    message.removeAttribute("data-l10n-id");
    more.hidden = true;
  };
  const identityNow = () => JSON.stringify([service.account.snapshot.generation, service.account.snapshot.status,
    service.keys.snapshot.status, service.syncCollectionsSnapshot?.find(item => item.name === "extensions")?.enabled]);
  const refresh = (visible = active) => {
    active = visible;
    const account = service.account.snapshot;
    const keys = service.keys.snapshot;
    const snapshot = service.syncCollectionsSnapshot?.find(item => item.name === "extensions");
    const current = identityNow();
    const ready = active && ["connected", "renewal-required", "local"].includes(account.status) && keys.status === "ready" &&
      snapshot?.enabled !== false && snapshot?.deferred > 0 && typeof service.extensionInstallPage === "function";
    if (current !== identity || !ready) { reset(); identity = current; }
    section.hidden = !ready;
    load.disabled = more.disabled = busy || (account.interactionBusy ?? account.busy) || service.backgroundSnapshot?.globalEnabled === false;
    for (const button of list.querySelectorAll("button")) {
      button.disabled = load.disabled || button.dataset.available !== "true";
    }
  };
  const act = async task => {
    if (!active || section.hidden || busy || load.disabled) { return; }
    const current = ++version;
    const accountIdentity = identity;
    busy = true; refresh();
    const valid = () => active && current === version && identity === accountIdentity && identityNow() === accountIdentity && !section.hidden;
    try { await task(valid); }
    catch (error) {
      if (valid()) {
        const state = ["application_state_changed", "application_review_unavailable"].includes(error.code) ? "changed" : "retry";
        setL10n(doc.l10n, message, `midori-sync-extensions-${state}`);
        if (state === "changed") { list.replaceChildren(); next = null; more.hidden = true; }
      }
    } finally { if (valid()) { busy = false; refresh(); } }
  };
  const loadPage = after => act(async valid => {
    const page = await service.extensionInstallPage({ after, limit: 20 });
    if (!valid()) { return; }
    if (after === null) { list.replaceChildren(); }
    for (const entry of page.entries) {
      const row = element("li");
      const label = element("p");
      label.textContent = entry.summary.addonId;
      const reason = Object.hasOwn(reasons, entry.summary.reason) ? reasons[entry.summary.reason] : "unavailable";
      const explanation = element("p", `midori-sync-extension-status-${reason}`);
      const review = element("button", "midori-sync-extension-review");
      review.type = "button";
      review.dataset.available = entry.summary.canReview === true && typeof service.reviewExtensionInstall === "function" ? "true" : "false";
      review.addEventListener("click", () => {
        if (review.disabled) { return; }
        act(async current => {
          await service.reviewExtensionInstall({ id: entry.id, revision: entry.revision });
          if (!current()) { return; }
          review.dataset.available = "false";
          setL10n(doc.l10n, message, "midori-sync-extensions-requested");
        });
      });
      row.append(label, explanation, review);
      list.append(row);
    }
    next = page.next;
    more.hidden = next === null;
    setL10n(doc.l10n, message, page.entries.length || after !== null ? "midori-sync-extensions-loaded" : "midori-sync-extensions-empty");
  });
  load.addEventListener("click", () => loadPage(null));
  more.addEventListener("click", () => { if (next !== null) { loadPage(next); } });
  refresh(false);
  return { section, refresh, close() { active = false; reset(); section.hidden = true; } };
}
