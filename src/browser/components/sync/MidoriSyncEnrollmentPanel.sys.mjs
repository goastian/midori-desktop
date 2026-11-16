/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const REQUEST_POLL_MS = 5000;

import { setL10n } from "./MidoriSyncUi.sys.mjs";

export function createSyncEnrollmentPanel(doc, service) {
  const setTimer = (callback, delay) => doc.defaultView.setTimeout(callback, delay);
  const clearTimer = id => doc.defaultView.clearTimeout(id);
  const element = (tag, id, className) => {
    const node = doc.createElementNS("http://www.w3.org/1999/xhtml", tag);
    if (id) {
      setL10n(doc.l10n, node, id);
    }
    if (className) {
      node.className = className;
    }
    return node;
  };
  const section = element("section", null, "midori-sync-enrollment");
  section.hidden = true;
  const waiting = element("div");
  const waitingText = element("p");
  waitingText.setAttribute("role", "status");
  waitingText.setAttribute("aria-live", "polite");
  const waitingCode = element("p", null, "midori-sync-enrollment-code");
  waitingCode.setAttribute("dir", "ltr");
  const request = element("button", "midori-sync-enrollment-request");
  request.type = "button";
  const reset = element("button", "midori-sync-enrollment-reset");
  reset.type = "button";
  const resetWarning = element("p", "midori-sync-enrollment-reset-warning");
  resetWarning.hidden = true;
  const resetConfirm = element("button", "midori-sync-enrollment-reset-confirm");
  resetConfirm.type = "button";
  resetConfirm.hidden = true;
  waiting.append(waitingText, waitingCode, request, reset, resetWarning, resetConfirm);
  const requests = element("div");
  const errorText = element("p", null, "message");
  errorText.hidden = true;
  section.append(waiting, requests, errorText);

  let visible = false;
  let timer = null;
  let busyId = null;
  let confirmingReset = false;

  const showError = code => {
    errorText.hidden = !code;
    if (code) {
      setL10n(doc.l10n, errorText, code === "enrollment_changed" ? "midori-sync-enrollment-changed" :
        "midori-sync-enrollment-failed");
    }
  };
  const run = async (id, action) => {
    busyId = id;
    showError(null);
    refresh();
    try {
      await action();
    } catch (error) {
      showError(error.code ?? "failed");
    } finally {
      busyId = null;
      refresh();
    }
  };
  request.addEventListener("click", () => run("request", () => service.startEnrollment()));
  reset.addEventListener("click", () => {
    confirmingReset = true;
    refresh();
  });
  resetConfirm.addEventListener("click", () => {
    confirmingReset = false;
    run("reset", () => service.resetEncryption());
  });

  function refresh() {
    const account = service.account.snapshot;
    const keys = service.keys.snapshot;
    const connected = account.status === "connected";
    const supported = service.connection.snapshot.capabilities?.deviceEnrollment === true;
    const needsKeys = connected && keys.status === "recovery-required" && supported;
    const pending = connected && keys.status === "ready" ? service.enrollmentRequests : [];
    section.hidden = !visible || (!needsKeys && !pending.length);
    waiting.hidden = !needsKeys;
    if (needsKeys) {
      const enrolling = !!keys.enrollment;
      const result = ["enrollment_denied", "enrollment_expired"].includes(keys.error) ? keys.error.slice("enrollment_".length) : "idle";
      setL10n(doc.l10n, waitingText, `midori-sync-enrollment-${enrolling ? "waiting" : result}`);
      waitingCode.hidden = !enrolling;
      waitingCode.textContent = keys.enrollment?.code ?? "";
      request.hidden = enrolling;
      request.disabled = busyId !== null || keys.busy;
      const canReset = service.connection.snapshot.capabilities?.keyReset === true;
      reset.hidden = !canReset || confirmingReset;
      reset.disabled = request.disabled;
      resetWarning.hidden = resetConfirm.hidden = !canReset || !confirmingReset;
      resetConfirm.disabled = request.disabled;
    } else {
      confirmingReset = false;
    }
    requests.replaceChildren(...pending.map(item => {
      const row = element("div", null, "midori-sync-enrollment-row");
      const text = element("p");
      setL10n(doc.l10n, text, "midori-sync-enrollment-prompt", { device: item.deviceName || "?" });
      const code = element("p", null, "midori-sync-enrollment-code");
      code.setAttribute("dir", "ltr");
      code.textContent = item.code;
      const approve = element("button", "midori-sync-enrollment-approve");
      approve.type = "button";
      approve.disabled = busyId !== null;
      approve.addEventListener("click", () => run(item.id, async () => {
        await service.approveEnrollment(item.id, item.code);
      }));
      const deny = element("button", "midori-sync-enrollment-deny");
      deny.type = "button";
      deny.disabled = busyId !== null;
      deny.addEventListener("click", () => run(item.id, () => service.denyEnrollment(item.id)));
      row.append(text, code, approve, deny);
      return row;
    }));
  }

  const poll = () => {
    timer = null;
    if (!visible) {
      return;
    }
    service.refreshEnrollmentRequests().catch(() => {}).finally(() => {
      if (visible && timer === null) {
        timer = setTimer(poll, REQUEST_POLL_MS);
      }
    });
  };

  return {
    section, refresh,
    open() {
      visible = true;
      refresh();
      poll();
    },
    close() {
      visible = false;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      refresh();
    },
  };
}
