/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MIDORI_SYNC_SETTINGS_URL, setL10n, syncAccountErrorId, syncDisplayName, syncSummary } from "./MidoriSyncUi.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI: "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
  PanelMultiView: "moz-src:///browser/components/customizableui/PanelMultiView.sys.mjs",
  MidoriSyncService: "resource:///modules/MidoriSyncService.sys.mjs",
  createSyncEnrollmentPanel: "resource:///modules/MidoriSyncEnrollmentPanel.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

const WIDGET_ID = "midori-sync-button";
const PANEL_ID = "midori-sync-panel";
const STYLE_ID = "midori-sync-style";
const HTML_NS = "http://www.w3.org/1999/xhtml";

function html(doc, tag, id) {
  const node = doc.createElementNS(HTML_NS, tag);
  if (id) {
    doc.l10n.setAttributes(node, id);
  }
  return node;
}

function button(doc, id, action) {
  const node = html(doc, "button", id);
  node.type = "button";
  node.addEventListener("click", action);
  return node;
}

function prepareDocument(doc) {
  doc.l10n.addResourceIds(["browser/midori/sync.ftl"]);
  if (!doc.getElementById(STYLE_ID)) {
    const style = html(doc, "link");
    style.id = STYLE_ID;
    style.rel = "stylesheet";
    style.href = "chrome://browser/content/sync/midoriSyncPanel.css";
    doc.documentElement.appendChild(style);
  }
}

export const MidoriSyncPanel = {
  _registered: false,
  _windows: new Map(),

  init() {
    if (this._registered) {
      return;
    }
    lazy.CustomizableUI.createWidget({
      id: WIDGET_ID,
      type: "button",
      defaultArea: lazy.CustomizableUI.AREA_NAVBAR,
      l10nId: "midori-sync-toolbar-button",
      onBeforeCreated: doc => prepareDocument(doc),
      onCommand: event => {
        const win = event.currentTarget?.ownerDocument?.defaultView ?? event.target?.ownerDocument?.defaultView;
        this.open(win, event).catch(error => console.error("Midori Sync popup could not open", error.name, error.result));
      },
    });
    this._registered = true;
  },

  uninit() {
    for (const [win, state] of this._windows) {
      state.unsubscribe?.();
      state.clearSecrets();
      state.panel.remove();
      win.removeEventListener("unload", state.onUnload);
      win.document.getElementById(STYLE_ID)?.remove();
    }
    this._windows.clear();
    if (this._registered) {
      lazy.CustomizableUI.destroyWidget(WIDGET_ID);
      this._registered = false;
    }
  },

  async open(win, event) {
    if (!win?.gBrowser) {
      return;
    }
    const state = this._windows.get(win) ?? this._createPanel(win);
    state.refresh();
    const anchor = lazy.CustomizableUI.getWidget(WIDGET_ID).forWindow(win).anchor;
    await lazy.PanelMultiView.openPopup(state.panel, anchor, {
      position: "bottomcenter topright",
      triggerEvent: event,
    });
  },

  openSettings(win) {
    win.gBrowser.selectedTab = win.gBrowser.addTrustedTab(MIDORI_SYNC_SETTINGS_URL);
  },

  _createPanel(win) {
    const doc = win.document;
    const privateWindow = lazy.PrivateBrowsingUtils.isWindowPrivate(win);
    prepareDocument(doc);
    const panel = doc.createXULElement("panel");
    panel.id = PANEL_ID;
    panel.setAttribute("type", "arrow");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", "midori-sync-heading");
    const multiview = doc.createXULElement("panelmultiview");
    multiview.setAttribute("mainViewId", "midori-sync-main-view");
    const view = doc.createXULElement("panelview");
    view.id = "midori-sync-main-view";
    view.classList.add("PanelUI-subView");
    const body = html(doc, "section");
    body.className = "midori-sync-body";

    const header = html(doc, "header");
    header.className = "midori-sync-header";
    const avatar = html(doc, "div");
    avatar.className = "midori-sync-avatar";
    avatar.setAttribute("aria-hidden", "true");
    const title = html(doc, "h2", "midori-sync-title");
    title.id = "midori-sync-heading";
    const identity = html(doc, "p");
    identity.id = "midori-sync-account-identity";
    identity.className = "midori-sync-identity";
    const disconnect = button(doc, "midori-sync-sign-out", () => accountAction(account => account.disconnect()));
    disconnect.id = "midori-sync-sign-out";
    disconnect.className = "midori-sync-disconnect";
    header.append(avatar, title, identity, disconnect);

    const status = html(doc, "p");
    status.className = "midori-sync-message";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");

    const list = html(doc, "ul");
    list.className = "midori-sync-rows";
    const syncRow = html(doc, "li");
    const syncButton = button(doc, null, () => {
      this.openSettings(win);
      panel.hidePopup();
    });
    syncButton.id = "midori-sync-open-settings";
    syncButton.className = "midori-sync-row";
    const syncIcon = html(doc, "span");
    syncIcon.className = "midori-sync-row-icon";
    const syncText = html(doc, "span");
    syncText.className = "midori-sync-row-text";
    const syncName = html(doc, "strong", "midori-sync-row-title");
    const syncState = html(doc, "span");
    syncState.id = "midori-sync-row-state";
    syncText.append(syncName, syncState);
    syncButton.append(syncIcon, syncText);
    syncRow.append(syncButton);
    list.append(syncRow);

    const actions = html(doc, "div");
    actions.className = "midori-sync-actions";
    const connectOidc = button(doc, "midori-sync-connect-oidc", () => {
      let authorizationTab;
      let connected = false;
      accountAction(async account => {
        try {
          await account.connectOidc(authURL => {
            authorizationTab = win.gBrowser.addTab(authURL, {
              triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}), inBackground: false,
            });
            authorizationTab.addEventListener("TabClose", () => {
              if (!connected) {
                account.cancelAuthorization();
              }
            }, { once: true });
          });
          connected = true;
        } finally {
          if (!win.closed) {
            if (connected && win.gBrowser.tabs.includes(authorizationTab)) {
              win.gBrowser.removeTab(authorizationTab);
            }
            if (panel.state === "open") {
              state.refresh();
            } else {
              this.open(win).catch(error => console.error("Midori Sync popup could not reopen", error.name, error.result));
            }
          }
        }
      });
    });
    connectOidc.id = "midori-sync-connect-oidc";
    const unlock = button(doc, "midori-sync-account-unlock", () => accountAction(account =>
      account.snapshot.status === "renewal-required" ? account.renew() : account.unlock()));
    const settings = button(doc, "midori-sync-open-settings-link", () => {
      this.openSettings(win);
      panel.hidePopup();
    });
    settings.id = "midori-sync-open-settings-link";
    settings.className = "midori-sync-link";
    actions.append(connectOidc, unlock, settings);

    let actionError = null;
    let accountActionVersion = 0;
    const accountAction = async action => {
      const owner = lazy.MidoriSyncService.account;
      const generation = owner.snapshot.generation;
      const server = lazy.MidoriSyncService.connection.snapshot.server;
      const current = ++accountActionVersion;
      actionError = null;
      try {
        await action(owner);
      } catch (error) {
        if (!win.closed && current === accountActionVersion && lazy.MidoriSyncService.account === owner &&
            owner.snapshot.generation === generation && lazy.MidoriSyncService.connection.snapshot.server === server) {
          actionError = { owner, generation, server, code: error.code ?? "account_failed" };
        }
      } finally {
        if (!win.closed) { state.refresh(); }
      }
    };
    const enrollment = privateWindow ? null : lazy.createSyncEnrollmentPanel(doc, lazy.MidoriSyncService);
    body.append(header, status, ...(enrollment ? [enrollment.section] : []), list, actions);
    view.appendChild(body);
    multiview.appendChild(view);
    panel.appendChild(multiview);
    doc.getElementById("mainPopupSet").appendChild(panel);

    const state = {
      panel,
      unsubscribe: null,
      clearSecrets() { actionError = null; },
      refresh() {
        enrollment?.refresh();
        if (privateWindow) {
          header.hidden = list.hidden = actions.hidden = true;
          setL10n(doc.l10n, status, "midori-sync-private-window");
          return;
        }
        const connection = lazy.MidoriSyncService.connection.snapshot;
        const owner = lazy.MidoriSyncService.account;
        const account = owner.snapshot;
        if (actionError && (actionError.owner !== owner || actionError.generation !== account.generation || actionError.server !== connection.server)) {
          actionError = null;
        }
        const accountError = actionError?.code ?? account.error;
        const summary = syncSummary(lazy.MidoriSyncService);
        const signedOut = account.status === "signed-out";
        const accountBusy = account.interactionBusy ?? account.busy;
        const disabled = accountBusy || connection.checking || account.status === "unknown";
        const authentication = connection.capabilities?.authentication;
        const oidcAvailable = Boolean(authentication?.browserLogin || authentication?.oidc);
        const name = syncDisplayName(account);
        avatar.textContent = (name || "M").slice(0, 1).toUpperCase();
        setL10n(doc.l10n, title, name ? "midori-sync-greeting" : "midori-sync-title", name ? { name } : undefined);
        identity.hidden = !account.user;
        if (account.user) {
          setL10n(doc.l10n, identity, "midori-sync-account-signed-in-as", { account: account.user.email || name });
        } else {
          identity.removeAttribute("data-l10n-id");
          identity.removeAttribute("data-l10n-args");
          identity.textContent = "";
        }
        header.classList.toggle("signed-out", signedOut);
        disconnect.hidden = signedOut || account.status === "unknown";
        disconnect.disabled = disabled;
        list.hidden = signedOut || account.status === "unknown";
        syncState.dataset.summary = summary;
        setL10n(doc.l10n, syncName, "midori-sync-row-title");
        setL10n(doc.l10n, syncState, `midori-sync-summary-${summary}`);
        syncButton.disabled = account.status === "unknown";
        const developmentPairing = authentication?.development === true && authentication.pairing === true;
        connectOidc.hidden = !signedOut || developmentPairing;
        connectOidc.disabled = disabled || !oidcAvailable;
        unlock.hidden = !["locked", "reconnect"].includes(summary);
        unlock.disabled = disabled;
        settings.hidden = !signedOut && accountError !== "saved_journals_require_review";
        if (account.status === "unknown") {
          setL10n(doc.l10n, status, "midori-sync-account-unknown");
          status.hidden = false;
        } else if (connection.checking) {
          setL10n(doc.l10n, status, "midori-sync-connection-checking");
          status.hidden = false;
        } else if (accountBusy) {
          setL10n(doc.l10n, status, "midori-sync-account-working");
          status.hidden = false;
        } else if (accountError) {
          setL10n(doc.l10n, status, `midori-sync-account-${syncAccountErrorId(accountError)}`);
          status.hidden = false;
        } else if (signedOut) {
          setL10n(doc.l10n, status, oidcAvailable ? "midori-sync-account-connect-ready" :
            connection.capabilities ? "midori-sync-account-connect-unavailable" : "midori-sync-account-server-unavailable");
          status.hidden = false;
        } else {
          status.hidden = !["locked", "reconnect"].includes(summary);
          if (!status.hidden) {
            setL10n(doc.l10n, status, `midori-sync-account-${account.status}`);
          }
        }
      },
      onUnload: () => {
        state.unsubscribe?.();
        this._windows.delete(win);
      },
    };
    panel.addEventListener("popupshown", () => {
      if (!privateWindow && !state.unsubscribe) {
        const unsubscribers = [
          lazy.MidoriSyncService.connection.subscribe(() => state.refresh()),
          lazy.MidoriSyncService.account.subscribe(() => state.refresh()),
          lazy.MidoriSyncService.keys.subscribe(() => state.refresh()),
          lazy.MidoriSyncService.subscribeSyncStatus(() => state.refresh()),
        ];
        state.unsubscribe = () => unsubscribers.forEach(unsubscribe => unsubscribe());
        state.refresh();
        enrollment?.open();
      }
    });
    panel.addEventListener("popuphidden", () => {
      state.clearSecrets();
      enrollment?.close();
      state.unsubscribe?.();
      state.unsubscribe = null;
    });
    win.addEventListener("unload", state.onUnload, { once: true });
    this._windows.set(win, state);
    return state;
  },
};
