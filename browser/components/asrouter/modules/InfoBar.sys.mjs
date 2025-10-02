/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint-disable no-use-before-define */
const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  RemoteL10n: "resource:///modules/asrouter/RemoteL10n.sys.mjs",
  SpecialMessageActions:
    "resource://messaging-system/lib/SpecialMessageActions.sys.mjs",
});

const TYPES = {
  UNIVERSAL: "universal",
  GLOBAL: "global",
};

const FTL_FILES = [
  "browser/newtab/asrouter.ftl",
  "browser/defaultBrowserNotification.ftl",
  "preview/termsOfUse.ftl",
];

class InfoBarNotification {
  constructor(message, dispatch) {
    this._dispatch = dispatch;
    this.dispatchUserAction = this.dispatchUserAction.bind(this);
    this.buttonCallback = this.buttonCallback.bind(this);
    this.infobarCallback = this.infobarCallback.bind(this);
    this.message = message;
    this.notification = null;
  }

  /**
   * Ensure a hidden container of <a data-l10n-name> templates exists, and
   * inject the request links using hrefs from message.content.linkUrls.
   */
  _ensureLinkTemplatesFor(doc, names) {
    let container = doc.getElementById("infobar-link-templates");
    // We inject a hidden <div> of <a data-l10n-name> templates into the
    // document because Fluent’s DOM-overlay scans the page for those
    // placeholders.
    if (!container) {
      container = doc.createElement("div");
      container.id = "infobar-link-templates";
      container.hidden = true;
      doc.body.appendChild(container);
    }

    const linkUrls = this.message.content.linkUrls || {};
    for (let name of names) {
      if (!container.querySelector(`a[data-l10n-name="${name}"]`)) {
        const a = doc.createElement("a");
        a.dataset.l10nName = name;
        a.href = linkUrls[name];
        container.appendChild(a);
      }
    }
  }

  /**
   * Async helper to render a Fluent string. If the translation contains `<a
   * data-l10n-name>`, it will parse and inject the associated link contained
   * in the message.
   */
  async _buildMessageFragment(doc, browser, stringId, args) {
    // Get the raw HTML translation
    const html = await lazy.RemoteL10n.formatLocalizableText({
      string_id: stringId,
      ...(args && { args }),
    });

    // If no inline anchors, just return a span
    if (!html.includes('data-l10n-name="')) {
      return lazy.RemoteL10n.createElement(doc, "span", {
        content: { string_id: stringId, ...(args && { args }) },
      });
    }

    // Otherwise parse it and set up a fragment
    const temp = new DOMParser().parseFromString(html, "text/html").body;
    const frag = doc.createDocumentFragment();

    // Prepare <a data-l10n-name> templates
    const names = [...temp.querySelectorAll("a[data-l10n-name]")].map(
      a => a.dataset.l10nName
    );
    this._ensureLinkTemplatesFor(doc, names);

    // Import each node and wire up any anchors it contains
    for (const node of temp.childNodes) {
      // Nodes from DOMParser belong to a different document, so importNode()
      // clones them into our target doc
      const importedNode = doc.importNode(node, true);

      if (importedNode.nodeType === Node.ELEMENT_NODE) {
        // collect this node if it's an anchor, and all child anchors
        const anchors = [];
        if (importedNode.matches("a[data-l10n-name]")) {
          anchors.push(importedNode);
        }
        anchors.push(...importedNode.querySelectorAll("a[data-l10n-name]"));

        for (const a of anchors) {
          const name = a.dataset.l10nName;
          const template = doc
            .getElementById("infobar-link-templates")
            .querySelector(`a[data-l10n-name="${name}"]`);
          if (!template) {
            continue;
          }
          a.href = template.href;
          a.addEventListener("click", e => {
            e.preventDefault();
            lazy.SpecialMessageActions.handleAction(
              { type: "OPEN_URL", data: { args: a.href, where: "tab" } },
              browser
            );
          });
        }
      }

      frag.appendChild(importedNode);
    }

    return frag;
  }

  /**
   * Displays the infobar notification in the specified browser and sends an impression ping.
   * Formats the message and buttons, and appends the notification.
   * For universal infobars, only records an impression for the first instance.
   *
   * @param {object} browser - The browser reference for the currently selected tab.
   */
  async showNotification(browser) {
    let { content } = this.message;
    let { gBrowser } = browser.ownerGlobal;
    let doc = gBrowser.ownerDocument;
    let notificationContainer;
    if ([TYPES.GLOBAL, TYPES.UNIVERSAL].includes(content.type)) {
      notificationContainer = browser.ownerGlobal.gNotificationBox;
    } else {
      notificationContainer = gBrowser.getNotificationBox(browser);
    }

    let priority = content.priority || notificationContainer.PRIORITY_SYSTEM;

    let labelNode = await this.formatMessageConfig(doc, browser, content.text);

    this.notification = await notificationContainer.appendNotification(
      this.message.id,
      {
        label: labelNode,
        image: content.icon || "chrome://branding/content/icon64.png",
        priority,
        eventCallback: this.infobarCallback,
        style: content.style || {},
      },
      content.buttons.map(b => this.formatButtonConfig(b)),
      true, // Disables clickjacking protections
      content.dismissable
    );
    // If the infobar is universal, only record an impression for the first
    // instance.
    if (
      content.type !== TYPES.UNIVERSAL ||
      !InfoBar._universalInfobars.length
    ) {
      this.addImpression();
    }

    // Only add if the universal infobar is still active. Prevents race condition
    // where a notification could add itself after removeUniversalInfobars().
    if (content.type === TYPES.UNIVERSAL) {
      InfoBar._universalInfobars.push({
        box: notificationContainer,
        notification: this.notification,
      });
    }
  }

  _createLinkNode(doc, browser, { href, where = "tab", string_id, args, raw }) {
    const a = doc.createElement("a");
    a.href = href;
    a.addEventListener("click", e => {
      e.preventDefault();
      lazy.SpecialMessageActions.handleAction(
        { type: "OPEN_URL", data: { args: a.href, where } },
        browser
      );
    });

    if (string_id) {
      // wrap a localized span inside
      const span = lazy.RemoteL10n.createElement(doc, "span", {
        content: { string_id, ...(args && { args }) },
      });
      a.appendChild(span);
    } else {
      a.textContent = raw || "";
    }

    return a;
  }

  async formatMessageConfig(doc, browser, content) {
    const frag = doc.createDocumentFragment();
    const parts = Array.isArray(content) ? content : [content];

    for (const part of parts) {
      if (!part) {
        continue;
      }
      if (part.href) {
        frag.appendChild(this._createLinkNode(doc, browser, part));
        continue;
      }

      if (part.string_id) {
        const subFrag = await this._buildMessageFragment(
          doc,
          browser,
          part.string_id,
          part.args
        );
        frag.appendChild(subFrag);
        continue;
      }

      if (typeof part === "string") {
        frag.appendChild(doc.createTextNode(part));
        continue;
      }

      if (part.raw && typeof part.raw === "string") {
        frag.appendChild(doc.createTextNode(part.raw));
      }
    }

    return frag;
  }

  formatButtonConfig(button) {
    let btnConfig = { callback: this.buttonCallback, ...button };
    // notificationbox will set correct data-l10n-id attributes if passed in
    // using the l10n-id key. Otherwise the `button.label` text is used.
    if (button.label.string_id) {
      btnConfig["l10n-id"] = button.label.string_id;
    }

    return btnConfig;
  }

  addImpression() {
    // Record an impression in ASRouter for frequency capping
    this._dispatch({ type: "IMPRESSION", data: this.message });
    // Send a user impression telemetry ping
    this.sendUserEventTelemetry("IMPRESSION");
  }

  /**
   * Callback fired when a button in the infobar is clicked.
   *
   * @param {Element} notificationBox - The `<notification-message>` element representing the infobar.
   * @param {Object} btnDescription - An object describing the button, includes the label, the action with an optional dismiss property, and primary button styling.
   * @param {Element} target - The <button> DOM element that was clicked.
   * @returns {boolean} `true` to keep the infobar open, `false` to dismiss it.
   */
  buttonCallback(notificationBox, btnDescription, target) {
    this.dispatchUserAction(
      btnDescription.action,
      target.ownerGlobal.gBrowser.selectedBrowser
    );
    let isPrimary = target.classList.contains("primary");
    let eventName = isPrimary
      ? "CLICK_PRIMARY_BUTTON"
      : "CLICK_SECONDARY_BUTTON";
    this.sendUserEventTelemetry(eventName);

    // Prevents infobar dismissal when dismiss is explicitly set to `false`
    return btnDescription.action?.dismiss === false;
  }

  dispatchUserAction(action, selectedBrowser) {
    this._dispatch({ type: "USER_ACTION", data: action }, selectedBrowser);
  }

  /**
   * Handles infobar events triggered by the notification interactions (excluding button clicks).
   * Cleans up the notification and active infobar state when the infobar is removed or dismissed.
   * If the removed infobar is universal, ensures all universal infobars and related observers are also removed.
   *
   * @param {string} eventType - The type of event (e.g., "removed").
   */
  infobarCallback(eventType) {
    const wasUniversal =
      InfoBar._activeInfobar?.message.content.type === TYPES.UNIVERSAL;
    if (eventType === "removed") {
      this.notification = null;
      InfoBar._activeInfobar = null;
    } else if (this.notification) {
      this.sendUserEventTelemetry("DISMISSED");
      this.notification = null;
      InfoBar._activeInfobar = null;
    }
    // If one instance of universal infobar is removed, remove all instances and
    // the new window observer
    if (wasUniversal) {
      this.removeUniversalInfobars();
    }
  }

  /**
   * Removes all active universal infobars from each window.
   * Unregisters the observer for new windows, clears the tracking array, and resets the
   * active infobar state.
   */
  removeUniversalInfobars() {
    // Remove the new window observer
    try {
      Services.obs.removeObserver(InfoBar, "domwindowopened");
    } catch (error) {
      console.error(
        "Error removing domwindowopened observer on InfoBar: ",
        error
      );
    }
    // Remove the universal infobar
    InfoBar._universalInfobars.forEach(({ box, notification }) => {
      try {
        if (box && notification) {
          box.removeNotification(notification);
        }
      } catch (error) {
        console.error("Failed to remove notification: ", error);
      }
    });
    InfoBar._universalInfobars = [];

    if (InfoBar._activeInfobar?.message.content.type === TYPES.UNIVERSAL) {
      InfoBar._activeInfobar = null;
    }
  }

  sendUserEventTelemetry(event) {
    const ping = {
      message_id: this.message.id,
      event,
    };
    this._dispatch({
      type: "INFOBAR_TELEMETRY",
      data: { action: "infobar_user_event", ...ping },
    });
  }
}

export const InfoBar = {
  _activeInfobar: null,
  _universalInfobars: [],

  maybeLoadCustomElement(win) {
    if (!win.customElements.get("remote-text")) {
      Services.scriptloader.loadSubScript(
        "chrome://browser/content/asrouter/components/remote-text.js",
        win
      );
    }
  },

  maybeInsertFTL(win) {
    FTL_FILES.forEach(path => win.MozXULElement.insertFTLIfNeeded(path));
  },

  /**
   * Helper to check the window's state and whether it's a
   * private browsing window, a popup or a taskbar tab.
   *
   * @returns {boolean} `true` if the window is valid for showing an infobar.
   */
  isValidInfobarWindow(win) {
    if (!win || win.closed) {
      return false;
    }
    if (lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
      return false;
    }
    if (!win.toolbar?.visible) {
      // Popups don't have a visible toolbar
      return false;
    }
    if (win.document.documentElement.hasAttribute("taskbartab")) {
      return false;
    }
    return true;
  },

  /**
   * Displays the universal infobar in all open, fully loaded browser windows.
   *
   * @param {InfoBarNotification} notification - The notification instance to display.
   */
  async showNotificationAllWindows(notification) {
    for (let win of Services.wm.getEnumerator(null)) {
      if (
        !win.gBrowser ||
        win.document?.readyState !== "complete" ||
        !this.isValidInfobarWindow(win)
      ) {
        continue;
      }
      this.maybeLoadCustomElement(win);
      this.maybeInsertFTL(win);
      const browser = win.gBrowser.selectedBrowser;
      await notification.showNotification(browser);
    }
  },

  /**
   * Displays an infobar notification in the specified browser window.
   * For the first universal infobar, shows the notification in all open browser windows
   * and sets up an observer to handle new windows.
   * For non-universal, displays the notification only in the given window.
   *
   * @param {object} browser - The browser reference for the currently selected tab.
   * @param {object} message - The message object describing the infobar content.
   * @param {function} dispatch - The dispatch function for actions.
   * @param {boolean} universalInNewWin - `True` if this is a universal infobar for a new window.
   * @returns {Promise<InfoBarNotification|null>} The notification instance, or null if not shown.
   */
  async showInfoBarMessage(browser, message, dispatch, universalInNewWin) {
    const win = browser?.ownerGlobal;
    if (!this.isValidInfobarWindow(win)) {
      return null;
    }
    const isUniversal = message.content.type === TYPES.UNIVERSAL;
    // Check if this is the first instance of a universal infobar
    const isFirstUniversal = !universalInNewWin && isUniversal;
    // Prevent stacking multiple infobars
    if (this._activeInfobar && !universalInNewWin) {
      return null;
    }

    if (!win || lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
      return null;
    }

    this.maybeLoadCustomElement(win);
    this.maybeInsertFTL(win);

    let notification = new InfoBarNotification(message, dispatch);
    if (isFirstUniversal) {
      await this.showNotificationAllWindows(notification);
      Services.obs.addObserver(this, "domwindowopened");
    } else {
      await notification.showNotification(browser);
    }

    if (!universalInNewWin) {
      this._activeInfobar = { message, dispatch };
      // If the window closes before the user interacts with the active infobar,
      // clear it
      win.addEventListener(
        "unload",
        () => {
          // Remove this window’s stale entry
          InfoBar._universalInfobars = InfoBar._universalInfobars.filter(
            ({ box }) => box.ownerGlobal !== win
          );

          if (isUniversal) {
            // If there’s still at least one live universal infobar,
            // make it the active infobar; otherwise clear the active infobar
            const nextEntry = InfoBar._universalInfobars.find(
              ({ box }) => !box.ownerGlobal?.closed
            );
            InfoBar._activeInfobar = nextEntry ? { message, dispatch } : null;
          } else {
            // Non-universal always clears on unload
            InfoBar._activeInfobar = null;
          }
        },
        { once: true }
      );
    }

    return notification;
  },

  /**
   * Observer callback fired when a new window is opened.
   * If the topic is "domwindowopened" and the window is a valid target,
   * the universal infobar will be shown in the new window once loaded.
   *
   * @param {Window} aSubject - The newly opened window.
   * @param {string} aTopic - The topic of the observer notification.
   */
  observe(aSubject, aTopic) {
    if (aTopic !== "domwindowopened") {
      return;
    }
    const win = aSubject;

    if (!this.isValidInfobarWindow(win)) {
      return;
    }

    const { message, dispatch } = this._activeInfobar || {};
    if (!message || message.content.type !== TYPES.UNIVERSAL) {
      return;
    }

    const onWindowReady = () => {
      if (!win.gBrowser || win.closed) {
        return;
      }
      this.showInfoBarMessage(
        win.gBrowser.selectedBrowser,
        message,
        dispatch,
        true
      );
    };

    if (win.document?.readyState === "complete") {
      onWindowReady();
    } else {
      win.addEventListener("load", onWindowReady, { once: true });
    }
  },
};
