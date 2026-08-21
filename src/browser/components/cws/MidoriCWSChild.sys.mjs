/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Content-side JSWindowActor that runs on chromewebstore.google.com.
 *
 *   • Detects extension-detail pages from the URL.
 *   • Hides the native "Add to Chrome" button.
 *   • Injects a Midori-branded install button.
 *   • Sends MidoriCWS:Install to the parent when clicked.
 *
 * Implemented as a plain MutationObserver + lightweight polling — Google's
 * Web Store is a SPA that re-renders entire panels on navigation.
 */

const BTN_ID = "midori-cws-install-btn";
const STATUS_ATTR = "data-midori-cws-status";

const EXT_ID_RE = /\/detail\/[^/]+\/([a-p]{32})/;

const INSTALL_TEXT = "Add to Midori";
const INSTALLED_TEXT = "Added to Midori";
const INSTALLING_TEXT = "Installing...";

export class MidoriCWSChild extends JSWindowActorChild {
  /** @type {MutationObserver|null} */
  #observer = null;
  /** @type {number} */
  #pollTimer = 0;
  /** @type {number} */
  #refreshTimer = 0;
  /** @type {boolean} */
  #refreshing = false;
  /** @type {boolean} */
  #refreshQueued = false;
  /** @type {string|null} */
  #currentExtensionId = null;

  actorCreated() {
    this.#start();
  }

  didDestroy() {
    this.#stop();
  }

  handleEvent(event) {
    if (event.type === "pageshow" || event.type === "popstate") {
      this.#scheduleRefresh(0);
    }
  }

  // ----------------------------------------------------------------------

  #start() {
    const doc = this.document;
    if (!doc) return;
    doc.addEventListener("pageshow", this, true);
    doc.defaultView?.addEventListener("popstate", this, true);

    this.#observer = new doc.defaultView.MutationObserver(() => {
      this.#scheduleRefresh(120);
    });
    this.#observer.observe(doc.documentElement, {
      childList: true,
      subtree: true,
    });

    // Slow safety-net poll for the cases where mutations don't fire
    // (e.g. shadow-root replacements).
    const win = doc.defaultView;
    const tick = () => {
      this.#scheduleRefresh(0);
      this.#pollTimer = win.setTimeout(tick, 750);
    };
    this.#pollTimer = win.setTimeout(tick, 200);
    this.#scheduleRefresh(0);
  }

  #stop() {
    try {
      this.#observer?.disconnect();
    } catch (_) {}
    this.#observer = null;
    if (this.#pollTimer) {
      try {
        this.document?.defaultView?.clearTimeout(this.#pollTimer);
      } catch (_) {}
      this.#pollTimer = 0;
    }
    if (this.#refreshTimer) {
      try {
        this.document?.defaultView?.clearTimeout(this.#refreshTimer);
      } catch (_) {}
      this.#refreshTimer = 0;
    }
    this.#refreshing = false;
    this.#refreshQueued = false;
  }

  // ----------------------------------------------------------------------

  #scheduleRefresh(delayMs = 80) {
    const win = this.document?.defaultView;
    if (!win) {
      return;
    }
    if (this.#refreshTimer) {
      return;
    }
    this.#refreshTimer = win.setTimeout(() => {
      this.#refreshTimer = 0;
      this.#runRefresh();
    }, delayMs);
  }

  #runRefresh() {
    if (this.#refreshing) {
      this.#refreshQueued = true;
      return;
    }

    this.#refreshing = true;
    try {
      this.#refresh();
    } finally {
      this.#refreshing = false;
      if (this.#refreshQueued) {
        this.#refreshQueued = false;
        this.#scheduleRefresh(0);
      }
    }
  }

  #refresh() {
    const url = this.document?.location?.href || "";
    const match = url.match(EXT_ID_RE);
    if (!match) {
      this.#removeButton();
      this.#currentExtensionId = null;
      return;
    }
    const extId = match[1];
    if (extId !== this.#currentExtensionId) {
      this.#currentExtensionId = extId;
      this.#removeButton();
    }

    const nativeButtons = this.#findNativeButtons();
    this.#removeButton();
    if (!nativeButtons.length) {
      return;
    }
    for (const btn of nativeButtons) {
      this.#prepareNativeButton(btn, extId);
    }
  }

  #findNativeButtons() {
    const doc = this.document;
    if (!doc) return [];

    const root = doc;
    const out = [];
    const seen = new Set();
    const selector =
      'button[jsaction*="install" i], ' +
      'button[aria-label*="hrome" i], ' +
      'button[aria-label*="agregar" i], ' +
      'button[aria-label*="añadir" i], ' +
      'button[aria-label*="instal" i], ' +
      'button[disabled], ' +
      'button[aria-disabled="true"]';

    for (const btn of root.querySelectorAll(selector)) {
      if (!(btn instanceof doc.defaultView.HTMLButtonElement)) {
        continue;
      }
      if (btn.id === BTN_ID) {
        continue;
      }

      const key = btn;
      if (seen.has(key)) {
        continue;
      }

      const label = `${btn.getAttribute("aria-label") || ""} ${
        btn.textContent || ""
      } ${btn.getAttribute("jsaction") || ""}`.toLowerCase();

      const looksLikeInstall =
        label.includes("chrome") ||
        label.includes("webstore") ||
        label.includes("install") ||
        label.includes("instal") ||
        label.includes("add") ||
        label.includes("agregar") ||
        label.includes("añadir");

      if (!looksLikeInstall) {
        continue;
      }

      const rect = btn.getBoundingClientRect();
      const inTopArea = rect.top >= 0 && rect.top < 420;
      const hasSize = rect.width >= 90 && rect.height >= 28;
      if (!inTopArea || !hasSize) {
        continue;
      }

      // Prefer right-side main CTA over small utility buttons.
      const likelyPrimaryCta = rect.width >= 130;
      if (!likelyPrimaryCta) {
        continue;
      }

      seen.add(key);
      out.push(btn);
    }

    return out;
  }

  #prepareNativeButton(btn, extensionId) {
    // Force-enable CWS CTA in non-Chrome browsers and rewire click to Midori.
    btn.removeAttribute("disabled");
    btn.setAttribute("aria-disabled", "false");
    if (btn.style.pointerEvents !== "auto") {
      btn.style.pointerEvents = "auto";
    }
    if (btn.style.opacity !== "1") {
      btn.style.opacity = "1";
    }
    if (btn.style.filter !== "none") {
      btn.style.filter = "none";
    }

    const status = btn.getAttribute(STATUS_ATTR);
    if (status !== "busy" && status !== "success") {
      if (btn.textContent !== INSTALL_TEXT) {
        btn.textContent = INSTALL_TEXT;
      }
      if (btn.dataset.midoriCwsSkinned !== "1") {
        btn.style.background = "#1a73e8";
        btn.style.color = "#fff";
        btn.style.borderColor = "#1a73e8";
        btn.dataset.midoriCwsSkinned = "1";
      }
    }

    if (!btn.dataset.midoriCwsBound) {
      btn.dataset.midoriCwsBound = "1";
      btn.addEventListener(
        "click",
        event => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          void this.#onClick(btn, extensionId);
        },
        true
      );
    }

    if (btn.dataset.midoriCwsCheckedFor !== extensionId) {
      btn.dataset.midoriCwsCheckedFor = extensionId;
      void this.#syncInstalledState(btn, extensionId);
    }
  }

  #removeButton() {
    const existing = this.document?.getElementById(BTN_ID);
    if (existing) existing.remove();
  }

  async #onClick(btn, extensionId) {
    if (btn.getAttribute(STATUS_ATTR) === "busy") return;
    btn.setAttribute(STATUS_ATTR, "busy");
    btn.disabled = true;
    btn.textContent = INSTALLING_TEXT;

    let result;
    try {
      const metadata = this.#extractMetadata();
      result = await this.sendQuery("MidoriCWS:Install", {
        extensionId,
        metadata,
      });
    } catch (e) {
      result = { success: false, error: e?.message || String(e) };
    }

    if (result?.success) {
      btn.setAttribute(STATUS_ATTR, "success");
      btn.textContent = INSTALLED_TEXT;
      btn.style.background = "#188038";
    } else {
      btn.setAttribute(STATUS_ATTR, "error");
      btn.textContent = `Failed: ${result?.error || "unknown"}`;
      btn.style.background = "#c5221f";
      // Re-enable after a few seconds so the user can retry.
      this.contentWindow?.setTimeout(() => {
        btn.disabled = false;
        btn.setAttribute(STATUS_ATTR, "idle");
        btn.textContent = INSTALL_TEXT;
        btn.style.background = "#1a73e8";
      }, 4000);
    }
  }

  async #syncInstalledState(btn, extensionId) {
    let status = null;
    try {
      status = await this.sendQuery("MidoriCWS:IsInstalled", {
        extensionId,
      });
    } catch (_) {
      return;
    }

    if (!status?.installed) {
      if (btn.getAttribute(STATUS_ATTR) !== "busy") {
        btn.disabled = false;
        btn.setAttribute("aria-disabled", "false");
        btn.setAttribute(STATUS_ATTR, "idle");
        btn.textContent = INSTALL_TEXT;
      }
      return;
    }

    btn.disabled = true;
    btn.setAttribute("aria-disabled", "true");
    btn.setAttribute(STATUS_ATTR, "success");
    btn.textContent = INSTALLED_TEXT;
    btn.style.background = "#188038";
    btn.style.color = "#fff";
    btn.style.borderColor = "#188038";
  }

  #extractMetadata() {
    const doc = this.document;
    const name = doc.querySelector("h1")?.textContent?.trim() || "";
    const icon =
      doc.querySelector('img[src*="googleusercontent.com"]')?.src || "";
    return { name, icon };
  }
}
