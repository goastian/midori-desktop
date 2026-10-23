/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { document, window } = globalThis;
const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  MidoriSyncService: "resource:///modules/MidoriSyncService.sys.mjs",
  createSyncDataPanel: "resource:///modules/MidoriSyncDataPanel.sys.mjs",
  createSyncConflictsPanel: "resource:///modules/MidoriSyncConflictsPanel.sys.mjs",
  createSyncJournalPanel: "resource:///modules/MidoriSyncJournalPanel.sys.mjs",
  createSyncKeysPanel: "resource:///modules/MidoriSyncKeysPanel.sys.mjs",
  createSyncEnrollmentPanel: "resource:///modules/MidoriSyncEnrollmentPanel.sys.mjs",
  syncAccountErrorId: "resource:///modules/MidoriSyncUi.sys.mjs",
  syncDisplayName: "resource:///modules/MidoriSyncUi.sys.mjs",
  setL10n: "resource:///modules/MidoriSyncUi.sys.mjs",
  MIDORI_SYNC_LOCAL_SERVER: "resource:///modules/MidoriSyncServerConfig.sys.mjs",
  MIDORI_SYNC_OFFICIAL_SERVER: "resource:///modules/MidoriSyncServerConfig.sys.mjs",
});

const HTML_NS = "http://www.w3.org/1999/xhtml";
const ENABLED_PREF = "midori.sync.enabled";
const RETENTION_PREF = "midori.sync.history.retentionDays";

function el(tag, l10nId, className) {
  const node = document.createElementNS(HTML_NS, tag);
  if (l10nId) {
    lazy.setL10n(document.l10n, node, l10nId);
  }
  if (className) {
    node.className = className;
  }
  return node;
}

function chromeWindow() {
  return window.browsingContext.topChromeWindow;
}

function openTab(url) {
  const win = chromeWindow();
  win.gBrowser.selectedTab = win.gBrowser.addTab(url, {
    triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}),
  });
}

function build() {
  const service = lazy.MidoriSyncService;
  const card = document.getElementById("sync-card");

  const accountBar = el("div", null, "account-bar");
  const identity = el("span", null, "identity");
  const signOut = el("button", "midori-sync-account-disconnect");
  signOut.type = "button";
  accountBar.append(identity, signOut);

  const message = el("p", null, "message");
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");

  const signIn = el("button", "midori-sync-connect-oidc", "primary");
  signIn.type = "button";
  signIn.id = "midori-sync-connect-oidc";
  const pairForm = el("form", null, "stack");
  pairForm.id = "midori-sync-pair-form";
  const getPairingCode = el("button", "midori-sync-get-pair-code");
  getPairingCode.type = "button";
  const pairCode = el("input");
  pairCode.id = "midori-sync-pair-code";
  pairCode.type = "password";
  pairCode.maxLength = 32;
  pairCode.autocomplete = "off";
  pairCode.required = true;
  const pairName = el("input");
  pairName.id = "midori-sync-device-name";
  pairName.type = "text";
  pairName.maxLength = 255;
  pairName.value = "Midori Desktop";
  pairName.autocomplete = "off";
  pairName.required = true;
  const pairSubmit = el("button", "midori-sync-pair-submit", "primary");
  pairSubmit.type = "submit";
  const codeLabel = el("label", "midori-sync-pair-code-label");
  codeLabel.htmlFor = pairCode.id;
  const nameLabel = el("label", "midori-sync-device-name-label");
  nameLabel.htmlFor = pairName.id;
  pairForm.append(getPairingCode, codeLabel, pairCode, nameLabel, pairName, pairSubmit);
  const unlock = el("button", "midori-sync-account-unlock");
  unlock.type = "button";

  const serverBox = el("details", null, "advanced");
  serverBox.id = "midori-sync-server-box";
  serverBox.append(el("summary", "midori-sync-server-summary"));
  const serverForm = el("form", null, "stack");
  const serverMode = el("select");
  serverMode.id = "midori-sync-server-mode";
  for (const value of ["official", "custom", "local"]) {
    const option = el("option", `midori-sync-server-${value}`);
    option.value = value;
    serverMode.append(option);
  }
  const serverUrl = el("input");
  serverUrl.id = "midori-sync-server-url";
  serverUrl.type = "text";
  serverUrl.maxLength = 2048;
  serverUrl.autocomplete = "off";
  serverUrl.spellcheck = false;
  const serverApply = el("button", "midori-sync-server-apply");
  serverApply.type = "submit";
  const serverStatus = el("p", null, "message");
  serverForm.append(serverMode, serverUrl, serverApply, serverStatus);
  serverBox.append(serverForm);

  const modes = el("fieldset", null, "modes");
  const modeHelp = el("p", "midori-sync-mode-help");
  const modeInputs = {};
  for (const mode of ["everything", "customize", "none"]) {
    const label = el("label", null, "radio");
    const input = el("input");
    input.type = "radio";
    input.name = "sync-mode";
    input.value = mode;
    modeInputs[mode] = input;
    label.append(input, el("span", `midori-sync-mode-${mode}`));
    modes.append(label);
  }

  const retention = el("label", null, "retention");
  retention.append(el("span", "midori-sync-history-retention"));
  const retentionSelect = el("select");
  retentionSelect.id = "midori-sync-history-retention";
  for (const days of [30, 90, 365, 1095, 3650]) {
    const option = el("option", `midori-sync-history-retention-${days}`);
    option.value = String(days);
    retentionSelect.append(option);
  }
  retentionSelect.addEventListener("change", () => {
    Services.prefs.setIntPref(RETENTION_PREF, Number(retentionSelect.value));
  });
  retention.append(retentionSelect);

  const data = lazy.createSyncDataPanel(document, service, openTab);
  const conflicts = lazy.createSyncConflictsPanel(document, service);
  const savedJournals = lazy.createSyncJournalPanel(document, service);
  const keys = lazy.createSyncKeysPanel(document, service);
  const enrollment = lazy.createSyncEnrollmentPanel(document, service);
  let encryptionAutoOpened = false;
  const encryption = el("details", null, "advanced");
  encryption.append(el("summary", "midori-sync-encryption-summary"), keys.section);

  card.append(accountBar, message, signIn, pairForm, unlock, enrollment.section, modes, modeHelp, retention, data.section, conflicts.section, encryption,
    savedJournals.section, serverBox);

  let customize = false;
  const allEnabled = () => (service.syncCollectionsSnapshot ?? []).every(c => c.enabled);

  const setMode = mode => {
    if (mode === "none") {
      service.setSyncEnabled(false);
      customize = false;
    } else {
      service.setSyncEnabled(true);
      customize = mode === "customize";
      if (mode === "everything") {
        for (const snapshot of service.syncCollectionsSnapshot ?? []) {
          if (!snapshot.enabled) {
            try {
              service.setCollectionEnabled(snapshot.name, true);
            } catch {}
          }
        }
      }
    }
    refresh();
  };
  for (const [mode, input] of Object.entries(modeInputs)) {
    input.addEventListener("change", () => input.checked && setMode(mode));
  }

  getPairingCode.addEventListener("click", () => openTab(new URL("devices", service.connection.snapshot.server.baseURL).href));
  pairForm.addEventListener("submit", event => {
    event.preventDefault();
    const value = pairCode.value;
    pairCode.value = "";
    action(account => account.pair(value, pairName.value.trim()));
  });
  signOut.addEventListener("click", () => action(account => account.disconnect()));
  unlock.addEventListener("click", () => action(account =>
    account.snapshot.status === "renewal-required" ? account.renew() : account.unlock()));
  signIn.addEventListener("click", () => {
    let tab;
    let connected = false;
    action(async account => {
      try {
        await account.connectOidc(url => {
          tab = chromeWindow().gBrowser.addTab(url, {
            triggeringPrincipal: Services.scriptSecurityManager.createNullPrincipal({}), inBackground: false,
          });
          tab.addEventListener("TabClose", () => {
            if (!connected) {
              account.cancelAuthorization();
            }
          }, { once: true });
        });
        connected = true;
      } finally {
        if (connected && tab && chromeWindow().gBrowser.tabs.includes(tab)) {
          chromeWindow().gBrowser.removeTab(tab);
        }
        refresh();
      }
    });
  });

  serverMode.addEventListener("change", () => {
    serverUrl.disabled = serverMode.value === "official";
    serverUrl.value = serverMode.value === "official" ? lazy.MIDORI_SYNC_OFFICIAL_SERVER :
      serverMode.value === "local" ? lazy.MIDORI_SYNC_LOCAL_SERVER : "";
  });
  serverForm.addEventListener("submit", async event => {
    event.preventDefault();
    serverApply.disabled = true;
    try {
      await service.connection.checkAndUseServer(serverUrl.value, { allowLocalHTTP: serverMode.value === "local" });
      serverStatus.textContent = "";
    } catch (error) {
      const id = ({ https_required: "https-required", invalid_server_url: "invalid-url",
        incompatible_server: "incompatible", account_connected: "account-connected",
        cancelled: "cancelled" })[error.code] ?? "failed";
      lazy.setL10n(document.l10n, serverStatus, `midori-sync-connection-${id}`);
    } finally {
      serverApply.disabled = false;
      refresh();
    }
  });

  let actionError = null;
  let accountActionVersion = 0;
  async function action(work) {
    const owner = service.account;
    const generation = owner.snapshot.generation;
    const server = service.connection.snapshot.server;
    const current = ++accountActionVersion;
    actionError = null;
    try {
      await work(owner);
    } catch (error) {
      if (!window.closed && current === accountActionVersion && service.account === owner && owner.snapshot.generation === generation &&
          service.connection.snapshot.server === server) {
        actionError = { owner, generation, server, code: error.code ?? "account_failed" };
      }
    } finally {
      if (!window.closed) { refresh(); }
    }
  }

  let refreshQueued = false;
  function refresh() {
    if (!refreshQueued) {
      refreshQueued = true;
      window.requestAnimationFrame(() => {
        refreshQueued = false;
        render();
      });
    }
  }

  function render() {
    const owner = service.account;
    const account = owner.snapshot;
    const connection = service.connection.snapshot;
    if (actionError && (actionError.owner !== owner || actionError.generation !== account.generation || actionError.server !== connection.server)) {
      actionError = null;
    }
    const accountError = actionError?.code ?? account.error;
    const signedOut = account.status === "signed-out";
    const connected = ["connected", "renewal-required", "local"].includes(account.status);
    const accountBusy = account.interactionBusy ?? account.busy;
    const disabled = accountBusy || connection.checking || account.status === "unknown";
    const authentication = connection.capabilities?.authentication;
    const oidcAvailable = Boolean(authentication?.browserLogin || authentication?.oidc);
    const identityText = account.user?.email || lazy.syncDisplayName(account);
    if (identity.textContent !== identityText) {
      identity.textContent = identityText;
    }
    accountBar.hidden = signedOut || account.status === "unknown";
    signOut.disabled = disabled;
    const developmentPairing = authentication?.development === true && authentication.pairing === true;
    signIn.hidden = !signedOut || developmentPairing;
    signIn.disabled = disabled || !oidcAvailable;
    pairForm.hidden = !signedOut || !developmentPairing;
    for (const control of pairForm.elements) {
      control.disabled = disabled;
    }
    unlock.hidden = !["locked", "expired", "error", "local", "renewal-required"].includes(account.status);
    unlock.disabled = disabled || account.status === "local" && service.backgroundSnapshot?.offline;
    lazy.setL10n(document.l10n, unlock, account.status === "local" ? "midori-sync-account-reconnect" : "midori-sync-account-unlock");
    serverBox.hidden = !["signed-out", "unknown"].includes(account.status);
    if (!serverForm.contains(document.activeElement)) {
      const server = connection.server;
      serverMode.value = server.requiresLoopbackTransport ? "local" : server.official ? "official" : "custom";
      serverUrl.value = server.baseURL;
      serverUrl.disabled = serverMode.value === "official";
    }
    if (connection.checking) {
      lazy.setL10n(document.l10n, message, "midori-sync-connection-checking");
      message.hidden = false;
    } else if (accountBusy) {
      lazy.setL10n(document.l10n, message, "midori-sync-account-working");
      message.hidden = false;
    } else if (accountError) {
      lazy.setL10n(document.l10n, message, `midori-sync-account-${lazy.syncAccountErrorId(accountError)}`);
      message.hidden = false;
    } else if (signedOut) {
      lazy.setL10n(document.l10n, message, oidcAvailable ? "midori-sync-account-connect-ready" :
        connection.capabilities ? "midori-sync-account-connect-unavailable" : "midori-sync-account-server-unavailable");
      message.hidden = false;
    } else {
      message.hidden = true;
    }
    modes.hidden = !connected;
    modeHelp.hidden = !connected;
    retention.hidden = !connected;
    const days = Services.prefs.getIntPref(RETENTION_PREF, 90);
    retentionSelect.value = [30, 90, 365, 1095, 3650].includes(days) ? String(days) :
      String([30, 90, 365, 1095, 3650].find(value => value >= days) ?? 3650);
    const enabled = Services.prefs.getBoolPref(ENABLED_PREF, false);
    const mode = !enabled ? "none" : customize || !allEnabled() ? "customize" : "everything";
    for (const [name, input] of Object.entries(modeInputs)) {
      input.checked = name === mode;
    }
    data.section.classList.toggle("toggles-hidden", mode !== "customize");
    data.refresh();
    conflicts.refresh();
    savedJournals.refresh();
    keys.refresh();
    enrollment.refresh();
    encryption.hidden = !connected || account.status === "local";
    const keyState = service.keys.snapshot;
    const keysStatus = keyState.status;
    if (connected && !encryptionAutoOpened &&
        (keyState.backupPending ||
          (keysStatus === "ready" && keyState.passwordUnlockSupported && !keyState.passwordUnlockAvailable) ||
          ["empty", "recovery-required", "migration-required", "backup-required", "pending", "rotation-backup-required", "rotation-pending"].includes(keysStatus))) {
      encryptionAutoOpened = true;
      encryption.open = true;
    }
  }

  const unsubscribers = [
    service.connection.subscribe(refresh),
    service.account.subscribe(refresh),
    service.keys.subscribe(refresh),
    service.subscribeSyncStatus(refresh),
  ];
  Services.prefs.addObserver(ENABLED_PREF, refresh);
  Services.prefs.addObserver(RETENTION_PREF, refresh);
  window.addEventListener("unload", () => {
    unsubscribers.forEach(unsubscribe => unsubscribe());
    Services.prefs.removeObserver(ENABLED_PREF, refresh);
    Services.prefs.removeObserver(RETENTION_PREF, refresh);
    data.close();
    conflicts.close();
    savedJournals.close();
    keys.close();
    enrollment.close();
  }, { once: true });
  data.open();
  conflicts.open();
  savedJournals.open();
  keys.open();
  enrollment.open();
  refresh();
}

build();
