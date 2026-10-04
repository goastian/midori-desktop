/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MIDORI_SYNC_LOCAL_SERVER, MIDORI_SYNC_OFFICIAL_SERVER } from "./MidoriSyncServerConfig.sys.mjs";
import { createSyncKeysPanel } from "./MidoriSyncKeysPanel.sys.mjs";
import { createSyncDataPanel } from "./MidoriSyncDataPanel.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  CustomizableUI: "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs",
  PanelMultiView: "moz-src:///browser/components/customizableui/PanelMultiView.sys.mjs",
  MidoriSyncService: "resource:///modules/MidoriSyncService.sys.mjs",
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
    const title = html(doc, "h2", "midori-sync-title");
    title.id = "midori-sync-heading";
    const serverLabel = html(doc, "p");
    serverLabel.className = "midori-sync-server";
    const status = html(doc, "p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const form = html(doc, "form");
    form.hidden = true;
    const modeLabel = html(doc, "label", "midori-sync-server-label");
    modeLabel.htmlFor = "midori-sync-server-mode";
    const mode = html(doc, "select");
    mode.id = modeLabel.htmlFor;
    for (const value of ["official", "custom", "local"]) {
      const option = html(doc, "option", `midori-sync-server-${value}`);
      option.value = value;
      mode.appendChild(option);
    }
    const urlLabel = html(doc, "label", "midori-sync-server-url-label");
    urlLabel.htmlFor = "midori-sync-server-url";
    const url = html(doc, "input");
    url.id = urlLabel.htmlFor;
    url.type = "text";
    url.maxLength = 2048;
    url.required = true;
    url.autocomplete = "off";
    url.spellcheck = false;
    const actions = html(doc, "div");
    actions.className = "midori-sync-actions";
    const cancel = button(doc, "midori-sync-cancel", () => {
      lazy.MidoriSyncService.connection.cancelCheck();
      form.hidden = true;
      change.hidden = false;
      accountSection.hidden = false;
      change.focus();
    });
    const apply = html(doc, "button", "midori-sync-server-apply");
    apply.type = "submit";
    actions.append(cancel, apply);
    form.append(modeLabel, mode, urlLabel, url, actions);
    const change = button(doc, "midori-sync-server-change", () => {
      const { server } = lazy.MidoriSyncService.connection.snapshot;
      mode.value = server.requiresLoopbackTransport ? "local" : server.official ? "official" : "custom";
      url.value = server.baseURL;
      url.disabled = mode.value === "official";
      form.hidden = false;
      change.hidden = true;
      accountSection.hidden = true;
      mode.focus();
    });
    mode.addEventListener("change", () => {
      url.disabled = mode.value === "official";
      if (mode.value === "official") {
        url.value = MIDORI_SYNC_OFFICIAL_SERVER;
      } else if (mode.value === "local") {
        url.value = MIDORI_SYNC_LOCAL_SERVER;
      } else {
        url.value = "";
      }
      if (!url.disabled) {
        url.focus();
      }
    });
    let submitting = false;
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (submitting) {
        return;
      }
      submitting = true;
      apply.disabled = mode.disabled = url.disabled = true;
      try {
        await lazy.MidoriSyncService.connection.checkAndUseServer(url.value, {
          allowLocalHTTP: mode.value === "local",
        });
        form.hidden = true;
        change.hidden = false;
        accountSection.hidden = false;
        change.focus();
      } catch (error) {
        const code = error.code === "https_required" ? "https-required" :
          error.code === "invalid_server_url" ? "invalid-url" :
          error.code === "incompatible_server" ? "incompatible" :
          error.code === "account_connected" ? "account-connected" :
          error.code === "cancelled" ? "cancelled" : "failed";
        doc.l10n.setAttributes(status, `midori-sync-connection-${code}`);
      } finally {
        submitting = false;
        apply.disabled = mode.disabled = false;
        url.disabled = mode.value === "official";
      }
    });
    const accountSection = html(doc, "section");
    accountSection.className = "midori-sync-account";
    const accountStatus = html(doc, "p");
    accountStatus.id = "midori-sync-account-status";
    accountStatus.setAttribute("role", "status");
    accountStatus.setAttribute("aria-live", "polite");
    const userLabel = html(doc, "p");
    userLabel.className = "midori-sync-server";
    const pairForm = html(doc, "form");
    pairForm.id = "midori-sync-pair-form";
    const getPairingCode = button(doc, "midori-sync-get-pair-code", () => {
      const server = lazy.MidoriSyncService.connection.snapshot.server;
      win.gBrowser.addTab(new URL("devices", server.baseURL).href, {
        triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}), inBackground: false,
      });
    });
    const codeLabel = html(doc, "label", "midori-sync-pair-code-label");
    codeLabel.htmlFor = "midori-sync-pair-code";
    const code = html(doc, "input");
    code.id = codeLabel.htmlFor;
    code.type = "password";
    code.maxLength = 32;
    code.autocomplete = "off";
    code.required = true;
    const nameLabel = html(doc, "label", "midori-sync-device-name-label");
    nameLabel.htmlFor = "midori-sync-device-name";
    const deviceName = html(doc, "input");
    deviceName.id = nameLabel.htmlFor;
    deviceName.type = "text";
    deviceName.maxLength = 255;
    deviceName.value = "Midori Desktop";
    deviceName.autocomplete = "off";
    deviceName.required = true;
    const pair = html(doc, "button", "midori-sync-pair-submit");
    pair.type = "submit";
    pairForm.append(getPairingCode, codeLabel, code, nameLabel, deviceName, pair);
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
    const accountAction = async action => {
      try {
        await action(lazy.MidoriSyncService.account);
      } catch (error) {
        showAccountError(error.code);
      }
    };
    const unlock = button(doc, "midori-sync-account-unlock", () => accountAction(account =>
      account.snapshot.status === "renewal-required" ? account.renew() : account.unlock()));
    const disconnect = button(doc, "midori-sync-account-disconnect", () => accountAction(account => account.disconnect()));
    pairForm.addEventListener("submit", event => {
      event.preventDefault();
      const value = code.value;
      code.value = "";
      accountAction(account => account.pair(value, deviceName.value.trim()));
    });
    const showAccountError = error => {
      const id = error === "primary_password_required" ? "primary-password" :
        ["vault_locked", "vault_unavailable"].includes(error) ? "vault-locked" :
        error === "invalid_pairing_input" ? "invalid-code" :
        error === "invalid_pairing_code" ? "expired-code" :
        error === "sync_pending_operations" ? "sync-pending" :
        error === "sync_disconnect_unavailable" ? "sync-unverified" :
        error === "revocation_unconfirmed" ? "revocation-unconfirmed" :
        ["renewal_pending", "refresh_unavailable", "renewal_unavailable"].includes(error) ? "renewal-required" :
        ["invalid_renewal", "refresh_superseded", "refresh_operation_conflict", "refresh_capacity"].includes(error) ? "renewal-failed" :
        ["vault_corrupt", "vault_unreadable", "local_secret_missing"].includes(error) ? "saved-unreadable" :
        error === "pairing_unavailable" ? "unavailable" :
        ["oidc_unavailable", "oidc_provider_unavailable", "oidc_invalid_response", "oidc_timeout"].includes(error) ? "authorization-failed" :
        ["oidc_authorization_cancelled", "cancelled"].includes(error) ? "authorization-cancelled" :
        error === "auth_required" ? "expired" :
        ["account_scope_mismatch", "refresh_identity_changed", "native_identity_required", "identity_issuer_mismatch", "invalid_account_identity"].includes(error) ? "identity-changed" : "failed";
      doc.l10n.setAttributes(accountStatus, `midori-sync-account-${id}`);
    };
    accountSection.append(accountStatus, userLabel, pairForm, connectOidc, unlock, disconnect);
    const keysView = privateWindow ? null : createSyncKeysPanel(doc, lazy.MidoriSyncService);
    const dataView = privateWindow ? null : createSyncDataPanel(doc, lazy.MidoriSyncService, url => {
      win.gBrowser.addTab(url, {
        triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}), inBackground: false,
      });
    });
    if (keysView) {
      accountSection.append(keysView.section);
      accountSection.append(dataView.section);
    }
    body.append(title, serverLabel, status, change, form);
    body.append(accountSection);
    view.appendChild(body);
    multiview.appendChild(view);
    panel.appendChild(multiview);
    doc.getElementById("mainPopupSet").appendChild(panel);
    const state = {
      panel,
      unsubscribe: null,
      clearSecrets() {
        code.value = "";
        keysView?.close();
        dataView?.close();
      },
      refresh() {
        if (privateWindow) {
          change.hidden = form.hidden = accountSection.hidden = true;
          doc.l10n.setAttributes(status, "midori-sync-private-window");
          return;
        }
        const snapshot = lazy.MidoriSyncService.connection.snapshot;
        serverLabel.textContent = snapshot.server.baseURL;
        const id = snapshot.checking ? "checking" : snapshot.error ? "failed" :
          snapshot.capabilities ? "verified" : "not-connected";
        doc.l10n.setAttributes(status, `midori-sync-connection-${id}`);
        const account = lazy.MidoriSyncService.account.snapshot;
        const disabled = account.busy || snapshot.checking || account.status === "unknown";
        getPairingCode.disabled = pair.disabled = code.disabled = deviceName.disabled = connectOidc.disabled =
          unlock.disabled = disconnect.disabled = disabled;
        change.disabled = disabled;
        const authentication = snapshot.capabilities?.authentication;
        const oidcAvailable = Boolean(authentication?.browserLogin || authentication?.oidc);
        const developmentPairing = authentication?.development === true && authentication.pairing === true;
        pairForm.hidden = account.status !== "signed-out" || !developmentPairing;
        connectOidc.hidden = account.status !== "signed-out" || developmentPairing;
        connectOidc.disabled = disabled || !oidcAvailable;
        unlock.hidden = !["locked", "expired", "error", "local", "renewal-required"].includes(account.status);
        disconnect.hidden = ["signed-out", "unknown"].includes(account.status);
        userLabel.textContent = account.user?.email || account.user?.name || "";
        keysView?.refresh();
        dataView?.refresh();
        if (account.busy) {
          doc.l10n.setAttributes(accountStatus, "midori-sync-account-working");
        } else if (account.error) {
          showAccountError(account.error);
        } else {
          const accountId = account.revocationPending ? "revocation-pending" : account.status;
          const statusId = accountId === "signed-out" && !developmentPairing ?
            (oidcAvailable ? "connect-ready" : snapshot.capabilities ? "connect-unavailable" : "server-unavailable") : accountId;
          doc.l10n.setAttributes(accountStatus, `midori-sync-account-${statusId}`);
        }
      },
      onUnload: () => {
        state.unsubscribe?.();
        state.clearSecrets();
        this._windows.delete(win);
      },
    };
    panel.addEventListener("popupshown", () => {
      if (!privateWindow && !state.unsubscribe) {
        const unsubscribeConnection = lazy.MidoriSyncService.connection.subscribe(() => state.refresh());
        const unsubscribeAccount = lazy.MidoriSyncService.account.subscribe(() => state.refresh());
        const unsubscribeKeys = lazy.MidoriSyncService.keys.subscribe(() => state.refresh());
        let statusFrame = null;
        const unsubscribeSyncStatus = lazy.MidoriSyncService.subscribeSyncStatus(() => {
          if (statusFrame === null) {
            statusFrame = win.requestAnimationFrame(() => {
              statusFrame = null;
              dataView.refresh();
            });
          }
        });
        state.unsubscribe = () => {
          unsubscribeConnection(); unsubscribeAccount(); unsubscribeKeys(); unsubscribeSyncStatus();
          if (statusFrame !== null) {
            win.cancelAnimationFrame(statusFrame);
          }
        };
        keysView.open();
        dataView.open();
        state.refresh();
      }
    });
    panel.addEventListener("popuphidden", () => {
      state.unsubscribe?.();
      state.unsubscribe = null;
      state.clearSecrets();
    });
    win.addEventListener("unload", state.onUnload, { once: true });
    this._windows.set(win, state);
    return state;
  },
};
