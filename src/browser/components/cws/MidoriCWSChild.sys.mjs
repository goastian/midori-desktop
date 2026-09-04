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
 * Implemented as an event-driven MutationObserver — Google's Web Store is a
 * SPA that re-renders entire panels on navigation.
 */

const BTN_ID = "midori-cws-install-btn";
const STATUS_ATTR = "data-midori-cws-status";

const EXT_ID_RE = /\/detail\/[^/]+\/([a-p]{32})/;
const EXTENSION_ID_RE = /^[a-p]{32}$/;

const INSTALL_TEXT = "Add to Midori";
const INSTALLED_TEXT = "Added to Midori";
const INSTALLING_TEXT = "Installing...";

export class MidoriCWSChild extends JSWindowActorChild {
  /** @type {MutationObserver|null} */
  #observer = null;
  /** @type {Document|null} */
  #document = null;
  /** @type {Window|null} */
  #window = null;
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
    const doc = this.#document;
    if (event.type === "visibilitychange") {
      if (doc?.hidden) {
        this.#observer?.disconnect();
        if (this.#refreshTimer) {
          this.#window?.clearTimeout(this.#refreshTimer);
          this.#refreshTimer = 0;
        }
        return;
      }
      this.#observeDocument();
    }
    if (
      event.type === "pageshow" ||
      event.type === "popstate" ||
      event.type === "hashchange" ||
      event.type === "visibilitychange"
    ) {
      this.#scheduleRefresh(0);
    }
  }

  // ----------------------------------------------------------------------

  #start() {
    const doc = this.document;
    const win = doc?.defaultView;
    if (!doc || !win) return;
    this.#document = doc;
    this.#window = win;
    doc.addEventListener("pageshow", this, true);
    doc.addEventListener("visibilitychange", this, true);
    win.addEventListener("popstate", this, true);
    win.addEventListener("hashchange", this, true);

    this.#observer = new win.MutationObserver(() => {
      if (!doc.hidden) {
        this.#scheduleRefresh(150);
      }
    });
    this.#observeDocument();

    this.#scheduleRefresh(0);
  }

  #stop() {
    const doc = this.#document;
    const win = this.#window;
    try {
      this.#observer?.disconnect();
    } catch {}
    this.#observer = null;
    doc?.removeEventListener("pageshow", this, true);
    doc?.removeEventListener("visibilitychange", this, true);
    win?.removeEventListener("popstate", this, true);
    win?.removeEventListener("hashchange", this, true);
    if (this.#refreshTimer) {
      try {
        win?.clearTimeout(this.#refreshTimer);
      } catch {}
      this.#refreshTimer = 0;
    }
    this.#refreshing = false;
    this.#refreshQueued = false;
    this.#document = null;
    this.#window = null;
  }

  // ----------------------------------------------------------------------

  #observeDocument() {
    const root = this.#document?.documentElement;
    if (!root || this.#document?.hidden) {
      return;
    }
    this.#observer?.observe(root, {
      childList: true,
      subtree: true,
    });
  }

  #scheduleRefresh(delayMs = 80) {
    const win = this.#window;
    if (!win || this.#document?.hidden) {
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
    const url = this.#document?.location?.href || "";
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
    const doc = this.#document;
    if (!doc) return [];

    const root = doc;
    const out = [];
    const seen = new Set();
    const selector = "button";

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

      const hasInstallVerb =
        label.includes("add") ||
        label.includes("install") ||
        label.includes("instal") ||
        label.includes("agregar") ||
        label.includes("añadir");
      const isBrowserPromo =
        label.includes("switch to chrome") || label.trim() === "install chrome";
      const looksLikeInstall =
        label.includes("chrome") && hasInstallVerb && !isBrowserPromo;

      if (!looksLikeInstall) {
        continue;
      }

      const rect = btn.getBoundingClientRect();
      const inTopArea = rect.top >= 0 && rect.top < 420;
      const hasSize = rect.width >= 90 && rect.height >= 28;
      if (!inTopArea || !hasSize) {
        continue;
      }

      seen.add(key);
      out.push(btn);
    }

    return out;
  }

  #prepareNativeButton(btn, extensionId) {
    // Force-enable CWS CTA in non-Chrome browsers and rewire click to Midori.
    btn.dataset.midoriCwsExtensionId = extensionId;
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
          const currentExtensionId = btn.dataset.midoriCwsExtensionId;
          if (EXTENSION_ID_RE.test(currentExtensionId || "")) {
            void this.#onClick(btn, currentExtensionId);
          }
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
    const existing = this.#document?.getElementById(BTN_ID);
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
      this.#window?.setTimeout(() => {
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
    } catch {
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
    const doc = this.#document;
    if (!doc) return { name: "", icon: "" };
    const name = doc.querySelector("h1")?.textContent?.trim() || "";
    const icon =
      doc.querySelector('img[src*="googleusercontent.com"]')?.src || "";
    return { name, icon };
  }
}
