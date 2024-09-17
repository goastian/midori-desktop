var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
import { k as zCSKCommands, z as zCSKData, b as checkIsSystemShortcut, h as commands, d as createElement, s as setProp, g as insert, i as insertNode, c as createSignal, a as createEffect, r as render, e as createComponent, S as Show, j as effect } from "./assets/utils.js";
const _CustomShortcutKey = class _CustomShortcutKey {
  constructor() {
    //this boolean disable shortcut of csk
    //useful for registering
    __publicField(this, "disable_csk", false);
    __publicField(this, "cskData", {});
    this.initCSKData();
    console.warn("CSK Init Completed");
  }
  static getInstance() {
    if (!_CustomShortcutKey.instance) {
      _CustomShortcutKey.instance = new _CustomShortcutKey();
    }
    if (!_CustomShortcutKey.windows.includes(window)) {
      _CustomShortcutKey.instance.startHandleShortcut(window);
      _CustomShortcutKey.windows.push(window);
    }
    Services.obs.addObserver(_CustomShortcutKey.instance, "nora-csk");
    return _CustomShortcutKey.instance;
  }
  //@ts-ignore
  observe(_subj, _topic, data) {
    const d = zCSKCommands.safeParse(JSON.parse(data));
    if (d.success) {
      switch (d.data.type) {
        case "disable-csk": {
          this.disable_csk = d.data.data;
          break;
        }
        case "update-pref": {
          this.initCSKData();
          break;
        }
      }
    }
  }
  getCSKData() {
    const shouldBeRemovedKeys = ["floorp-open-split-view-on-right"];
    const data = JSON.parse(
      Services.prefs.getStringPref("floorp.browser.nora.csk.data", "{}")
    );
    for (const key of shouldBeRemovedKeys) {
      if (data[key]) {
        delete data[key];
        Services.prefs.setStringPref(
          "floorp.browser.nora.csk.data",
          JSON.stringify(data)
        );
      }
    }
    return data;
  }
  initCSKData() {
    this.cskData = zCSKData.parse(
      this.getCSKData()
    );
  }
  startHandleShortcut(_window) {
    _window.addEventListener("keydown", (ev) => {
      if (this.disable_csk) {
        return;
      }
      if (["Control", "Alt", "Meta", "Shift"].filter((k) => ev.key.includes(k)).length === 0) {
        if (checkIsSystemShortcut(ev)) {
          console.warn(`This Event is registered in System: ${ev}`);
          return;
        }
        for (const [_key, shortcutDatum] of Object.entries(this.cskData)) {
          const key = _key;
          const { alt, ctrl, meta, shift } = shortcutDatum.modifiers;
          if (ev.altKey === alt && ev.ctrlKey === ctrl && ev.metaKey === meta && ev.shiftKey === shift && ev.key === shortcutDatum.key) {
            commands[key].command(ev);
          }
        }
      }
    });
  }
};
__publicField(_CustomShortcutKey, "instance");
__publicField(_CustomShortcutKey, "windows", []);
let CustomShortcutKey = _CustomShortcutKey;
function ContextMenu$2(id, l10n, runFunction) {
  return (() => {
    var _el$ = createElement("xul:menuitem");
    setProp(_el$, "data-l10n-id", l10n);
    setProp(_el$, "label", l10n);
    setProp(_el$, "id", id);
    setProp(_el$, "onCommand", runFunction);
    return _el$;
  })();
}
class gFloorpContextMenuServices {
  constructor() {
    __publicField(this, "initialized", false);
    __publicField(this, "checkItems", []);
    __publicField(this, "contextMenuObserver", new MutationObserver(() => {
      this.contextMenuObserverFunc();
    }));
  }
  get windowModalDialogElem() {
    return document.getElementById("window-modal-dialog");
  }
  get screenShotContextMenuItems() {
    return document.getElementById("context-take-screenshot");
  }
  get contentAreaContextMenu() {
    return document.getElementById("contentAreaContextMenu");
  }
  get pdfjsContextMenuSeparator() {
    return document.getElementById("context-sep-pdfjs-selectall");
  }
  get contextMenuSeparators() {
    return document.querySelectorAll("#contentAreaContextMenu > menuseparator");
  }
  init() {
    if (this.initialized) {
      return;
    }
    this.contentAreaContextMenu.addEventListener("popupshowing", () => this.onPopupShowing());
    this.initialized = true;
  }
  addContextBox(id, l10n, insertElementId, runFunction, checkID, checkedFunction) {
    const contextMenu = ContextMenu$2(id, l10n, runFunction);
    const targetNode = document.getElementById(checkID);
    const insertElement = document.getElementById(insertElementId);
    insert(this.contentAreaContextMenu, () => contextMenu, insertElement);
    this.contextMenuObserver.observe(targetNode, {
      attributes: true
    });
    this.checkItems.push(checkedFunction);
    this.contextMenuObserverFunc();
  }
  contextMenuObserverFunc() {
    for (const checkItem of this.checkItems) {
      checkItem();
    }
  }
  addToolbarContentMenuPopupSet(JSXElem) {
    insert(document.body, JSXElem, this.windowModalDialogElem);
  }
  onPopupShowing() {
    if (!this.screenShotContextMenuItems.hidden) {
      this.pdfjsContextMenuSeparator.hidden = false;
      const nextSibling = this.screenShotContextMenuItems.nextSibling;
      if (nextSibling) {
        nextSibling.hidden = false;
      }
    }
    (async () => {
      for (const contextMenuSeparator of this.contextMenuSeparators) {
        if (contextMenuSeparator.nextSibling.hidden && contextMenuSeparator.previousSibling.hidden && contextMenuSeparator.id !== "context-sep-navigation" && contextMenuSeparator.id !== "context-sep-pdfjs-selectall") {
          contextMenuSeparator.hidden = true;
        }
      }
    })();
  }
}
const gFloorpContextMenu = new gFloorpContextMenuServices();
function initBrowserContextMenu() {
  gFloorpContextMenu.init();
}
const downloadbarStyle = ':root[inFullscreen]:not([macOSNativeFullscreen]) #downloadsPanel {\n  display: none !important;\n}\n\n#downloadsPanel:not([hasdownloads]) {\n  display: none;\n}\n\n#downloadsListBox {\n  scrollbar-width: none;\n  flex-flow: row;\n  flex-grow: 1;\n  overflow-x: scroll;\n  min-width: 0 !important;\n}\n\n.downloadDetails {\n  white-space: nowrap;\n  text-overflow: ellipsis;\n  width: 170px;\n  overflow: hidden;\n}\n\n#downloadsListBox > richlistitem {\n  min-height: 48px;\n  max-width: min-content !important;\n  margin: 3px 6px !important;\n}\n\n#downloadsListBox > richlistitem:hover {\n  background-color: var(--toolbarbutton-hover-background);\n}\n\n#emptyDownloads, #downloadsFooterButtons {\n  display: none !important;\n}\n\n#downloadsPanel-mainView {\n  padding: 0 !important;\n}\n\n#downloadsPanel-list {\n  flex-flow: row;\n  display: flex;\n}\n\n#downloadsPanel-button {\n  flex-flow: row;\n  flex-grow: 0;\n  align-items: center;\n  display: flex;\n  background-color: rgba(var(--toolbar-bgcolor), 70%) !important;\n  justify-content: flex-end !important;\n  min-width: 0 !important;\n}\n\n#downloadsPanel-button toolbarbutton {\n  fill: var(--toolbarbutton-icon-fill);\n  background-size: 25px;\n  flex-direction: row-reverse;\n  justify-content: center;\n  align-items: center;\n  display: flex;\n  background-color: rgba(var(--toolbar-bgcolor), 70%) !important;\n  min-width: 0 !important;\n  margin: 1px 5px !important;\n}\n\n#downloadsPanel-button toolbarbutton:hover {\n  background-color: var(--toolbarbutton-hover-background) !important;\n}\n\n#downloadsPanel-button toolbarbutton > .toolbarbutton-text {\n  padding-inline-start: 0 !important;\n}\n\n#downloadIcon > .toolbarbutton-icon {\n  display: none;\n}\n\n#downloadIcon {\n  border: 1px solid;\n  border-color: var(--toolbarbutton-icon-fill);\n}\n\n#closeIcon {\n  list-style-image: url("chrome://global/skin/icons/close.svg");\n}\n\n.downloadProgress {\n  height: 2px;\n}\n\n.downloadBlockedBadge {\n  margin-inline-start: 0 !important;\n  margin-inline-end: 0 !important;\n}\n\n.downloadMainArea {\n  padding-block-start: 0 !important;\n  padding-block-end: 0 !important;\n}\n\n.downloadTarget {\n  max-width: 170px !important;\n}\n';
function DonwloadBar() {
  return [(() => {
    var _el$ = createElement("vbox"), _el$2 = createElement("linkset"), _el$3 = createElement("link"), _el$4 = createElement("xul:menupopup"), _el$5 = createElement("xul:menuitem"), _el$6 = createElement("xul:menuitem"), _el$7 = createElement("xul:menuitem"), _el$8 = createElement("xul:menuitem"), _el$9 = createElement("xul:menuitem"), _el$10 = createElement("xul:menuitem"), _el$11 = createElement("xul:menuitem"), _el$12 = createElement("xul:menuseparator"), _el$13 = createElement("xul:menuitem"), _el$14 = createElement("xul:menuitem"), _el$15 = createElement("xul:menuseparator"), _el$16 = createElement("xul:menuitem"), _el$17 = createElement("xul:menuitem"), _el$18 = createElement("xul:menuitem"), _el$19 = createElement("xul:menuitem"), _el$20 = createElement("vbox"), _el$21 = createElement("hbox"), _el$22 = createElement("vbox"), _el$23 = createElement("div"), _el$24 = createElement("xul:richlistbox"), _el$25 = createElement("description"), _el$26 = createElement("div"), _el$27 = createElement("xul:toolbarbutton"), _el$28 = createElement("xul:toolbarbutton"), _el$29 = createElement("vbox"), _el$30 = createElement("stack"), _el$31 = createElement("hbox"), _el$32 = createElement("image"), _el$33 = createElement("vbox"), _el$34 = createElement("description"), _el$35 = createElement("progress"), _el$36 = createElement("description"), _el$37 = createElement("vbox"), _el$38 = createElement("toolbarseparator"), _el$39 = createElement("button");
    insertNode(_el$, _el$2);
    insertNode(_el$, _el$4);
    insertNode(_el$, _el$20);
    setProp(_el$, "id", "downloadsPanel");
    setProp(_el$, "data-l10n-id", "downloads-panel");
    setProp(_el$, "class", "cui-widget-panel panel-no-padding");
    setProp(_el$, "role", "group");
    setProp(_el$, "type", "arrow");
    setProp(_el$, "orient", "horizontal");
    insertNode(_el$2, _el$3);
    setProp(_el$3, "rel", "localization");
    setProp(_el$3, "href", "browser/downloads.ftl");
    insertNode(_el$4, _el$5);
    insertNode(_el$4, _el$6);
    insertNode(_el$4, _el$7);
    insertNode(_el$4, _el$8);
    insertNode(_el$4, _el$9);
    insertNode(_el$4, _el$10);
    insertNode(_el$4, _el$11);
    insertNode(_el$4, _el$12);
    insertNode(_el$4, _el$13);
    insertNode(_el$4, _el$14);
    insertNode(_el$4, _el$15);
    insertNode(_el$4, _el$16);
    insertNode(_el$4, _el$17);
    insertNode(_el$4, _el$18);
    insertNode(_el$4, _el$19);
    setProp(_el$4, "id", "downloadsContextMenu");
    setProp(_el$4, "class", "download-state");
    setProp(_el$5, "command", "downloadsCmd_pauseResume");
    setProp(_el$5, "class", "downloadPauseMenuItem");
    setProp(_el$5, "data-l10n-id", "downloads-cmd-pause");
    setProp(_el$6, "command", "downloadsCmd_pauseResume");
    setProp(_el$6, "class", "downloadResumeMenuItem");
    setProp(_el$6, "data-l10n-id", "downloads-cmd-resume");
    setProp(_el$7, "command", "downloadsCmd_unblock");
    setProp(_el$7, "class", "downloadUnblockMenuItem");
    setProp(_el$7, "data-l10n-id", "downloads-cmd-unblock");
    setProp(_el$8, "command", "downloadsCmd_openInSystemViewer");
    setProp(_el$8, "class", "downloadUseSystemDefaultMenuItem");
    setProp(_el$8, "data-l10n-id", "downloads-cmd-use-system-default");
    setProp(_el$9, "command", "downloadsCmd_alwaysOpenInSystemViewer");
    setProp(_el$9, "type", "checkbox");
    setProp(_el$9, "class", "downloadAlwaysUseSystemDefaultMenuItem");
    setProp(_el$9, "data-l10n-id", "downloads-cmd-always-use-system-default");
    setProp(_el$10, "command", "downloadsCmd_alwaysOpenSimilarFiles");
    setProp(_el$10, "type", "checkbox");
    setProp(_el$10, "class", "downloadAlwaysOpenSimilarFilesMenuItem");
    setProp(_el$10, "data-l10n-id", "downloads-cmd-always-open-similar-files");
    setProp(_el$11, "command", "downloadsCmd_show");
    setProp(_el$11, "class", "downloadShowMenuItem");
    setProp(_el$11, "data-l10n-id", "downloads-cmd-show-menuitem-2");
    setProp(_el$12, "class", "downloadCommandsSeparator");
    setProp(_el$13, "command", "downloadsCmd_openReferrer");
    setProp(_el$13, "class", "downloadOpenReferrerMenuItem");
    setProp(_el$13, "data-l10n-id", "downloads-cmd-go-to-download-page");
    setProp(_el$14, "command", "downloadsCmd_copyLocation");
    setProp(_el$14, "class", "downloadCopyLocationMenuItem");
    setProp(_el$14, "data-l10n-id", "downloads-cmd-copy-download-link");
    setProp(_el$16, "command", "downloadsCmd_deleteFile");
    setProp(_el$16, "class", "downloadDeleteFileMenuItem");
    setProp(_el$16, "data-l10n-id", "downloads-cmd-delete-file");
    setProp(_el$17, "command", "cmd_delete");
    setProp(_el$17, "class", "downloadRemoveFromHistoryMenuItem");
    setProp(_el$17, "data-l10n-id", "downloads-cmd-remove-from-history");
    setProp(_el$18, "command", "downloadsCmd_clearList");
    setProp(_el$18, "data-l10n-id", "downloads-cmd-clear-list");
    setProp(_el$19, "command", "downloadsCmd_clearDownloads");
    setProp(_el$19, "hidden", "true");
    setProp(_el$19, "data-l10n-id", "downloads-cmd-clear-downloads");
    insertNode(_el$20, _el$21);
    setProp(_el$20, "id", "downloadsPanel-multiView");
    setProp(_el$20, "mainViewId", "downloadsPanel-mainView");
    setProp(_el$20, "disablekeynav", "true");
    insertNode(_el$21, _el$22);
    insertNode(_el$21, _el$29);
    setProp(_el$21, "id", "downloadsPanel-mainView");
    insertNode(_el$22, _el$23);
    setProp(_el$22, "class", "panel-view-body-unscrollable");
    insertNode(_el$23, _el$24);
    insertNode(_el$23, _el$25);
    insertNode(_el$23, _el$26);
    setProp(_el$23, "id", "downloadsPanel-list");
    setProp(_el$24, "id", "downloadsListBox");
    setProp(_el$24, "data-l10n-id", "downloads-panel-items");
    setProp(_el$24, "data-l10n-attrs", "style");
    setProp(_el$24, "context", "downloadsContextMenu");
    setProp(_el$24, "onmouseover", "DownloadsView.onDownloadMouseOver(event);");
    setProp(_el$24, "onmouseout", "DownloadsView.onDownloadMouseOut(event);");
    setProp(_el$24, "oncontextmenu", "DownloadsView.onDownloadContextMenu(event);");
    setProp(_el$24, "ondragstart", "DownloadsView.onDownloadDragStart(event);");
    setProp(_el$25, "id", "emptyDownloads");
    setProp(_el$25, "data-l10n-id", "downloads-panel-empty");
    insertNode(_el$26, _el$27);
    insertNode(_el$26, _el$28);
    setProp(_el$26, "id", "downloadsPanel-button");
    setProp(_el$27, "oncommand", "DownloadsPanel.showDownloadsHistory();");
    setProp(_el$27, "class", "toolbarbutton-1 subviewbutton");
    setProp(_el$27, "data-l10n-id", "downloads-history");
    setProp(_el$27, "id", "downloadIcon");
    setProp(_el$28, "command", "downloadsCmd_clearList");
    setProp(_el$28, "class", "toolbarbutton-1 subviewbutton");
    setProp(_el$28, "id", "closeIcon");
    insertNode(_el$29, _el$30);
    setProp(_el$29, "id", "downloadsFooter");
    insertNode(_el$30, _el$31);
    insertNode(_el$30, _el$37);
    insertNode(_el$31, _el$32);
    insertNode(_el$31, _el$33);
    setProp(_el$31, "id", "downloadsSummary");
    setProp(_el$31, "align", "center");
    setProp(_el$31, "orient", "horizontal");
    setProp(_el$31, "onkeydown", "DownloadsSummary.onKeyDown(event);");
    setProp(_el$31, "onclick", "DownloadsSummary.onClick(event);");
    setProp(_el$32, "class", "downloadTypeIcon");
    insertNode(_el$33, _el$34);
    insertNode(_el$33, _el$35);
    insertNode(_el$33, _el$36);
    setProp(_el$33, "pack", "center");
    setProp(_el$33, "flex", "1");
    setProp(_el$33, "class", "downloadContainer");
    setProp(_el$34, "id", "downloadsSummaryDescription");
    setProp(_el$35, "id", "downloadsSummaryProgress");
    setProp(_el$35, "class", "downloadProgress");
    setProp(_el$35, "max", "100");
    setProp(_el$36, "id", "downloadsSummaryDetails");
    setProp(_el$36, "crop", "end");
    insertNode(_el$37, _el$38);
    insertNode(_el$37, _el$39);
    setProp(_el$37, "id", "downloadsFooterButtons");
    setProp(_el$39, "id", "downloadsHistory");
    setProp(_el$39, "data-l10n-id", "downloads-history");
    setProp(_el$39, "class", "downloadsPanelFooterButton subviewbutton panel-subview-footer-button toolbarbutton-1");
    setProp(_el$39, "flex", "1");
    setProp(_el$39, "oncommand", "DownloadsPanel.showDownloadsHistory();");
    setProp(_el$39, "pack", "start");
    return _el$;
  })(), (() => {
    var _el$40 = createElement("style");
    setProp(_el$40, "class", "nora-statusbar");
    setProp(_el$40, "jsx", true);
    insert(_el$40, downloadbarStyle);
    return _el$40;
  })()];
}
const [showDownloadbar, setShowDownloadbar] = createSignal(Services.prefs.getBoolPref("floorp.browser.native.downloadbar.enabled", false));
class DownloadBarManager {
  constructor() {
    var _a;
    createEffect(() => {
      Services.prefs.setBoolPref("floorp.browser.native.downloadbar.enabled", showDownloadbar());
    });
    (_a = document.querySelector("#appcontent")) == null ? void 0 : _a.appendChild(document.getElementById("downloadsPanel"));
    this.observeDownloadbar();
  }
  //if we use just method, `this` will be broken
  observeDownloadbar() {
    Services.prefs.addObserver("floorp.browser.native.downloadbar.enabled", () => setShowDownloadbar(() => Services.prefs.getBoolPref("floorp.browser.native.downloadbar.enabled")));
  }
}
function initDownloadbar() {
  var _a;
  new DownloadBarManager();
  console.log(showDownloadbar());
  if (!showDownloadbar()) {
    return;
  }
  (_a = document.getElementById("downloadsPanel")) == null ? void 0 : _a.remove();
  render(
    DonwloadBar,
    document.getElementById("appcontent")
  );
  console.log("init download bar");
  window.DownloadsPanel.hidePanel = () => {
    return;
  };
  delete window.DownloadsView.contextMenu;
  delete window.DownloadsPanel.panel;
  delete window.DownloadsPanel.richListBox;
  window.DownloadsPanel.panel = document.getElementById("downloadsPanel");
  window.DownloadsPanel.richListBox = document.getElementById("downloadsListBox");
  window.DownloadsView.contextMenu = document.getElementById("downloadsContextMenu");
  window.DownloadsPanel._initialized = false;
  window.DownloadsPanel.initialize();
  window.DownloadsView.onDownloadAdded_hook = window.DownloadsView.onDownloadAdded;
  window.DownloadsView.onDownloadAdded = (download) => {
    document.getElementById("downloadsListBox").scrollLeft = 0;
    DownloadsView.onDownloadAdded_hook(download);
  };
  const scrollElem = document.getElementById("downloadsListBox");
  scrollElem == null ? void 0 : scrollElem.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) {
      return;
    }
    e.preventDefault();
    scrollElem.scrollLeft += e.deltaY * 10;
  });
}
const { ContextualIdentityService } = ChromeUtils.importESModule(
  "resource://gre/modules/ContextualIdentityService.sys.mjs"
);
const PrivateContainer = {
  ENABLE_PRIVATE_CONTAINER_PREF: "floorp.privateContainer.enabled",
  PRIVATE_CONTAINER_L10N_ID: "floorp-private-container-name",
  getPrivateContainer() {
    const currentContainers = ContextualIdentityService._identities;
    return currentContainers.find(
      (container) => container.floorpPrivateContainer === true
    );
  },
  getPrivateContainerUserContextId() {
    const privateContainer = this.getPrivateContainer();
    return privateContainer ? privateContainer.userContextId : null;
  },
  removePrivateContainerData() {
    const privateContainer = this.getPrivateContainer();
    if (!privateContainer || !privateContainer.userContextId) {
      return;
    }
    Services.clearData.deleteDataFromOriginAttributesPattern({
      userContextId: privateContainer.userContextId
    });
  },
  async StartupCreatePrivateContainer() {
    const l10n = new Localization(["browser/floorp.ftl"], true);
    ContextualIdentityService.ensureDataReady();
    if (PrivateContainer.getPrivateContainer()) {
      return;
    }
    const userContextId = ++ContextualIdentityService._lastUserContextId;
    const identity = {
      userContextId,
      public: true,
      icon: "chill",
      color: "purple",
      name: await l10n.formatValue(
        PrivateContainer.PRIVATE_CONTAINER_L10N_ID
      ),
      floorpPrivateContainer: true
    };
    ContextualIdentityService._identities.push(identity);
    ContextualIdentityService.saveSoon();
    Services.obs.notifyObservers(
      ContextualIdentityService.getIdentityObserverOutput(identity),
      "contextual-identity-created"
    );
  }
};
const _gFloorpPrivateContainer = class _gFloorpPrivateContainer {
  constructor() {
    __publicField(this, "initialized", false);
    if (this.initialized) {
      return;
    }
    PrivateContainer.StartupCreatePrivateContainer();
    PrivateContainer.removePrivateContainerData();
    window.SessionStore.promiseInitialized.then(() => {
      window.gBrowser.tabContainer.addEventListener("TabClose", _gFloorpPrivateContainer.removeDataIfPrivateContainerTabNotExist);
      window.gBrowser.tabContainer.addEventListener("TabOpen", _gFloorpPrivateContainer.handleTabModifications);
      document.addEventListener("floorpOnLocationChangeEvent", _gFloorpPrivateContainer.handleTabModifications);
      gFloorpContextMenu.addContextBox("open_in_private_container", "open-in_private-container", "context-openlink", () => _gFloorpPrivateContainer.openWithPrivateContainer(window.gContextMenu.linkURL), "context-openlink", () => {
        this.privateContainerMenuItem.hidden = this.openLinkMenuItem.hidden;
      });
    });
    this.initialized = true;
  }
  get privateContainerMenuItem() {
    return document.querySelector("#open_in_private_container");
  }
  get openLinkMenuItem() {
    return document.querySelector("#context-openlink");
  }
  static getInstance() {
    if (!_gFloorpPrivateContainer.instance) {
      _gFloorpPrivateContainer.instance = new _gFloorpPrivateContainer();
    }
    return _gFloorpPrivateContainer.instance;
  }
  getPrivateContainerUserContextId() {
    return PrivateContainer.getPrivateContainerUserContextId();
  }
  static checkPrivateContainerTabExist() {
    const privateContainer = PrivateContainer.getPrivateContainer();
    if (!privateContainer || !privateContainer.userContextId) {
      return false;
    }
    return window.gBrowser.tabs.some((tab) => tab.userContextId === privateContainer.userContextId);
  }
  static removeDataIfPrivateContainerTabNotExist() {
    const privateContainerUserContextID = PrivateContainer.getPrivateContainerUserContextId();
    setTimeout(() => {
      if (!_gFloorpPrivateContainer.checkPrivateContainerTabExist()) {
        PrivateContainer.removePrivateContainerData();
      }
      return window.gBrowser.tabs.filter((tab) => tab.userContextId === privateContainerUserContextID);
    }, 400);
  }
  static tabIsSaveHistory(tab) {
    return tab.getAttribute("historydisabled") === "true";
  }
  static applyDoNotSaveHistoryToTab(tab) {
    tab.linkedBrowser.setAttribute("disablehistory", "true");
    tab.linkedBrowser.setAttribute("disableglobalhistory", "true");
    tab.setAttribute("floorp-disablehistory", "true");
  }
  static checkTabIsPrivateContainer(tab) {
    const privateContainerUserContextID = PrivateContainer.getPrivateContainerUserContextId();
    return tab.userContextId === privateContainerUserContextID;
  }
  static handleTabModifications() {
    const tabs = window.gBrowser.tabs;
    for (const tab of tabs) {
      if (_gFloorpPrivateContainer.checkTabIsPrivateContainer(tab) && !_gFloorpPrivateContainer.tabIsSaveHistory(tab)) {
        _gFloorpPrivateContainer.applyDoNotSaveHistoryToTab(tab);
      }
    }
  }
  static openWithPrivateContainer(url) {
    let relatedToCurrent = false;
    const _OPEN_NEW_TAB_POSITION_PREF = Services.prefs.getIntPref("floorp.browser.tabs.openNewTabPosition", -1);
    switch (_OPEN_NEW_TAB_POSITION_PREF) {
      case 0:
        relatedToCurrent = false;
        break;
      case 1:
        relatedToCurrent = true;
        break;
    }
    const privateContainerUserContextID = PrivateContainer.getPrivateContainerUserContextId();
    Services.obs.notifyObservers({
      wrappedJSObject: new Promise((resolve) => {
        window.openTrustedLinkIn(url, "tab", {
          relatedToCurrent,
          resolveOnNewTabCreated: resolve,
          userContextId: privateContainerUserContextID
        });
      })
    }, "browser-open-newtab-start");
  }
  static reopenInPrivateContainer() {
    let userContextId = PrivateContainer.getPrivateContainerUserContextId();
    const reopenedTabs = window.TabContextMenu.contextTab.multiselected ? window.gBrowser.selectedTabs : [window.TabContextMenu.contextTab];
    for (const tab of reopenedTabs) {
      let triggeringPrincipal;
      if (tab.linkedPanel) {
        triggeringPrincipal = tab.linkedBrowser.contentPrincipal;
      } else {
        const tabState = JSON.parse(window.SessionStore.getTabState(tab));
        try {
          triggeringPrincipal = window.E10SUtils.deserializePrincipal(tabState.triggeringPrincipal_base64);
        } catch (ex) {
          continue;
        }
      }
      if (!triggeringPrincipal || triggeringPrincipal.isNullPrincipal) {
        triggeringPrincipal = Services.scriptSecurityManager.createNullPrincipal({
          userContextId
        });
      } else if (triggeringPrincipal.isContentPrincipal) {
        triggeringPrincipal = Services.scriptSecurityManager.principalWithOA(triggeringPrincipal, {
          userContextId
        });
      }
      const currentTabUserContextId = Number.parseInt(tab.getAttribute("usercontextid"));
      if (currentTabUserContextId === userContextId) {
        userContextId = 0;
      }
      const newTab = window.gBrowser.addTab(tab.linkedBrowser.currentURI.spec, {
        userContextId,
        pinned: tab.pinned,
        index: tab._tPos + 1,
        triggeringPrincipal
      });
      if (window.gBrowser.selectedTab === tab) {
        window.gBrowser.selectedTab = newTab;
      }
      if (tab.muted && !newTab.muted) {
        newTab.toggleMuteAudio(tab.muteReason);
      }
      window.gBrowser.removeTab(tab);
    }
  }
};
__publicField(_gFloorpPrivateContainer, "instance");
let gFloorpPrivateContainer = _gFloorpPrivateContainer;
function ContextMenu$1() {
  return (() => {
    var _el$ = createElement("xul:menuitem");
    setProp(_el$, "id", "context_toggleToPrivateContainer");
    setProp(_el$, "data-l10n-id", "floorp-toggle-private-container");
    setProp(_el$, "label", "Toggle to Private Container");
    setProp(_el$, "onCommand", () => {
      gFloorpPrivateContainer.reopenInPrivateContainer();
    });
    return _el$;
  })();
}
function initPrivateContainer() {
  insert(document.querySelector("#tabContextMenu"), () => createComponent(ContextMenu$1, {}), document.querySelector("#context_selectAllTabs"));
  window.gFloorpPrivateContainer = gFloorpPrivateContainer.getInstance();
  console.log(window.gFloorpPrivateContainer);
}
const {
  CustomizableUI: CustomizableUI$3
} = ChromeUtils.importESModule("resource:///modules/CustomizableUI.sys.mjs");
const gFloorpBrowserAction = {
  createToolbarClickActionButton(widgetId, l10nId, onCommandFunc, styleElement = null, area = CustomizableUI$3.AREA_NAVBAR, position = null, onCreatedFunc = null) {
    var _a;
    insert(document.head, () => styleElement, (_a = document.head) == null ? void 0 : _a.lastChild);
    const widget = CustomizableUI$3.getWidget(widgetId);
    if (widget && widget.type !== "custom") {
      return;
    }
    (async () => {
      var _a2, _b;
      CustomizableUI$3.createWidget({
        id: widgetId,
        type: "button",
        tooltiptext: await ((_a2 = document.l10n) == null ? void 0 : _a2.formatValue(l10nId)),
        label: await ((_b = document.l10n) == null ? void 0 : _b.formatValue(l10nId)),
        removable: true,
        onCommand: () => {
          onCommandFunc == null ? void 0 : onCommandFunc();
        },
        onCreated: (aNode) => {
          onCreatedFunc == null ? void 0 : onCreatedFunc(aNode);
        }
      });
      if (ChromeUtils.importESModule("resource://floorp/FloorpStartup.sys.mjs").isFirstRun) {
        CustomizableUI$3.addWidgetToArea(widgetId, area, position);
      }
    })();
  },
  createMenuToolbarButton(widgetId, l10nId, popupElem, onCommandFunc, area = CustomizableUI$3.AREA_NAVBAR, styleElement = null, position = null, onCreatedFunc = null) {
    var _a;
    insert(document.head, () => styleElement, (_a = document.head) == null ? void 0 : _a.lastChild);
    const widget = CustomizableUI$3.getWidget(widgetId);
    if (widget && widget.type !== "custom") {
      return;
    }
    (async () => {
      var _a2, _b;
      CustomizableUI$3.createWidget({
        id: widgetId,
        type: "button",
        tooltiptext: await ((_a2 = document.l10n) == null ? void 0 : _a2.formatValue(l10nId)),
        label: await ((_b = document.l10n) == null ? void 0 : _b.formatValue(l10nId)),
        removable: true,
        onCommand: () => {
          onCommandFunc == null ? void 0 : onCommandFunc();
        },
        onCreated: (aNode) => {
          aNode.setAttribute("type", "menu");
          aNode.appendChild(popupElem);
          onCreatedFunc == null ? void 0 : onCreatedFunc(aNode);
        }
      });
      if (ChromeUtils.importESModule("resource://floorp/FloorpStartup.sys.mjs").isFirstRun) {
        CustomizableUI$3.addWidgetToArea(widgetId, area, position);
      }
    })();
  }
};
function MenuPopup() {
  return (() => {
    var _el$ = createElement("xul:menupopup"), _el$2 = createElement("xul:browser");
    insertNode(_el$, _el$2);
    setProp(_el$, "id", "profile-manager-popup");
    setProp(_el$2, "id", "profile-switcher-browser");
    setProp(_el$2, "src", "chrome://floorp/content/profile-manager/profile-switcher.xhtml");
    setProp(_el$2, "flex", "1");
    setProp(_el$2, "type", "content");
    setProp(_el$2, "disablehistory", "true");
    setProp(_el$2, "disableglobalhistory", "true");
    setProp(_el$2, "context", "profile-popup-contextmenu");
    return _el$;
  })();
}
const profileManagerStyle = '#profile-switcher-browser {\n  min-width: 25em !important;\n  min-height: 41em !important;\n}\n\n#profile-manager {\n  list-style-image: url("chrome://browser/skin/fxa/avatar-color.svg");\n}\n';
const {
  CustomizableUI: CustomizableUI$2
} = ChromeUtils.importESModule("resource:///modules/CustomizableUI.sys.mjs");
const _gFloorpProfileManager = class _gFloorpProfileManager {
  constructor() {
    __publicField(this, "StyleElement", () => {
      return (() => {
        var _el$ = createElement("style");
        insert(_el$, profileManagerStyle);
        return _el$;
      })();
    });
    gFloorpBrowserAction.createMenuToolbarButton("profile-manager", "floorp-profile-manager", createComponent(MenuPopup, {}), async () => {
      const popup = document.getElementById("profile-manager-popup");
      popup == null ? void 0 : popup.openPopup(document.getElementById("profile-manager-popup"), "after_start", 0, 0, false, false);
    }, CustomizableUI$2.AREA_NAVBAR, this.StyleElement(), 15);
  }
  static getInstance() {
    if (!_gFloorpProfileManager.instance) {
      _gFloorpProfileManager.instance = new _gFloorpProfileManager();
    }
    return _gFloorpProfileManager.instance;
  }
};
__publicField(_gFloorpProfileManager, "instance");
let gFloorpProfileManager = _gFloorpProfileManager;
function initProfileManager() {
  gFloorpProfileManager.getInstance();
}
const iconStyle$1 = '#sidebar-reverse-position-toolbar {\n  list-style-image: url("chrome://browser/skin/preferences/category-sync.svg");\n}\n';
const {
  CustomizableUI: CustomizableUI$1
} = ChromeUtils.importESModule("resource:///modules/CustomizableUI.sys.mjs");
const _gReverseSidebarPosition = class _gReverseSidebarPosition {
  constructor() {
    __publicField(this, "StyleElement", () => {
      return (() => {
        var _el$ = createElement("style");
        insert(_el$, iconStyle$1);
        return _el$;
      })();
    });
    gFloorpBrowserAction.createToolbarClickActionButton("sidebar-reverse-position-toolbar", "sidebar-reverse-position-toolbar", () => {
      window.SidebarController.reversePosition();
    }, this.StyleElement(), CustomizableUI$1.AREA_NAVBAR, 2, () => {
      const onFirstLaunch = ChromeUtils.importESModule("resource://floorp/FloorpStartup.sys.mjs").isFirstRun;
      if (onFirstLaunch) {
        CustomizableUI$1.addWidgetToArea("sidebar-button", CustomizableUI$1.AREA_NAVBAR, 3);
      }
    });
  }
  static getInstance() {
    if (!_gReverseSidebarPosition.instance) {
      _gReverseSidebarPosition.instance = new _gReverseSidebarPosition();
    }
    return _gReverseSidebarPosition.instance;
  }
};
__publicField(_gReverseSidebarPosition, "instance");
let gReverseSidebarPosition = _gReverseSidebarPosition;
function initReverseSidebarPosition() {
  gReverseSidebarPosition.getInstance();
}
const shareModeStyle = '#PersonalToolbar, #alltabs-button, #sidebar-box, #sidebar-select-box, #sidebar-splitter2, #sidebar-select-box, #downloads-button, #unified-extensions-button, #appMenu-fxa-status2, #PanelUI-fxa, #workspace-button > .toolbarbutton-text, .unified-extensions-item, .tab-content:not([selected="true"]), .tab-background:not([selected="true"]) {\n  display: none !important;\n}\n\n.urlbar-addon-page-action {\n  display: none;\n}\n\n.urlbar-addon-page-action[actionid="floorp-system_floorp_ablaze_one"] {\n  display: block;\n}\n\n.urlbar-addon-page-action[actionid="_036a55b4-5e72-4d05-a06c-cba2dfcc134a_"] {\n  display: block;\n}\n\n#fxa-toolbar-menu-button {\n  border: 2px solid green;\n  border-radius: 15px;\n  max-height: 25px;\n  color: #90ee90 !important;\n  fill: currentColor !important;\n  margin: auto !important;\n  padding: 0 0 0 10px !important;\n}\n\n#fxa-toolbar-menu-button:before {\n  content: "Share Mode";\n  margin: auto;\n  font-size: 12px;\n  font-weight: bold;\n  display: -moz-box;\n}\n\n#fxa-toolbar-menu-button:-webkit-any([open], [checked]) {\n  background: none !important;\n  background-color: unset !important;\n}\n\n#fxa-toolbar-menu-button:-moz-any([open], [checked]) {\n  background: none !important;\n  background-color: unset !important;\n}\n\n#fxa-toolbar-menu-button:is([open], [checked]) {\n  background: none !important;\n  background-color: unset !important;\n}\n\n#fxa-toolbar-menu-button:hover > .toolbarbutton-badge-stack {\n  background: none !important;\n  background-color: unset !important;\n}\n\n#fxa-toolbar-menu-button:not([disabled="true"]):-webkit-any([open], [checked], :hover:active) > .toolbarbutton-badge-stack {\n  background: none !important;\n  background-color: unset !important;\n}\n\n#fxa-toolbar-menu-button:not([disabled="true"]):-moz-any([open], [checked], :hover:active) > .toolbarbutton-badge-stack {\n  background: none !important;\n  background-color: unset !important;\n}\n\n#fxa-toolbar-menu-button:not([disabled="true"]):is([open], [checked], :hover:active) > .toolbarbutton-badge-stack {\n  background: none !important;\n  background-color: unset !important;\n}\n\n#fxa-avatar-image {\n  scale: 1.2;\n  list-style-image: url("chrome://branding/content/about-logo-private.png") !important;\n}\n';
const [shareModeEnabled, setShareModeEnabled] = createSignal(false);
function ShareModeElement() {
  return [(() => {
    var _el$ = createElement("xul:menuitem");
    setProp(_el$, "data-l10n-id", "sharemode-menuitem");
    setProp(_el$, "label", "Toggle Share Mode");
    setProp(_el$, "type", "checkbox");
    setProp(_el$, "id", "toggle_sharemode");
    setProp(_el$, "checked", false);
    setProp(_el$, "onCommand", () => setShareModeEnabled((prev) => !prev));
    setProp(_el$, "accesskey", "S");
    return _el$;
  })(), createComponent(Show, {
    get when() {
      return shareModeEnabled();
    },
    get children() {
      var _el$2 = createElement("style");
      insert(_el$2, shareModeStyle);
      return _el$2;
    }
  })];
}
function initShareMode() {
  insert(document.querySelector("#menu_ToolsPopup"), () => createComponent(ShareModeElement, {}), document.querySelector("#menu_openFirefoxView"));
}
const [showStatusbar, setShowStatusbar] = createSignal(Services.prefs.getBoolPref("browser.display.statusbar", false));
const _gFloorpStatusBar = class _gFloorpStatusBar {
  static getInstance() {
    if (!_gFloorpStatusBar.instance) {
      _gFloorpStatusBar.instance = new _gFloorpStatusBar();
    }
    return _gFloorpStatusBar.instance;
  }
  get statusbarEnabled() {
    return Services.prefs.getBoolPref("browser.display.statusbar", false);
  }
  constructor() {
    var _a;
    window.CustomizableUI.registerArea("statusBar", {
      type: window.CustomizableUI.TYPE_TOOLBAR,
      defaultPlacements: ["screenshot-button", "fullscreen-button"]
    });
    window.CustomizableUI.registerToolbarNode(document.getElementById("statusBar"));
    createEffect(() => {
      const statuspanel_label = document.getElementById("statuspanel-label");
      const statuspanel = document.getElementById("statuspanel");
      const statusText = document.getElementById("status-text");
      const observer = new MutationObserver(() => {
        if (statuspanel.getAttribute("inactive") === "true" && statusText) {
          statusText.setAttribute("hidden", "true");
        } else {
          statusText == null ? void 0 : statusText.removeAttribute("hidden");
        }
      });
      Services.prefs.setBoolPref("browser.display.statusbar", showStatusbar());
      if (showStatusbar()) {
        statusText == null ? void 0 : statusText.appendChild(statuspanel_label);
        observer.observe(statuspanel, {
          attributes: true
        });
      } else {
        statuspanel == null ? void 0 : statuspanel.appendChild(statuspanel_label);
        observer == null ? void 0 : observer.disconnect();
      }
    });
    (_a = document.body) == null ? void 0 : _a.appendChild(document.getElementById("statusBar"));
    this.observeStatusbar();
  }
  observeStatusbar() {
    Services.prefs.addObserver("browser.display.statusbar", () => setShowStatusbar(() => this.statusbarEnabled));
  }
};
__publicField(_gFloorpStatusBar, "instance");
let gFloorpStatusBar = _gFloorpStatusBar;
function ContextMenu() {
  return (() => {
    var _el$ = createElement("xul:menuitem");
    setProp(_el$, "data-l10n-id", "status-bar");
    setProp(_el$, "label", "Status Bar");
    setProp(_el$, "type", "checkbox");
    setProp(_el$, "id", "toggle_statusBar");
    setProp(_el$, "onCommand", () => setShowStatusbar((value) => !value));
    effect((_$p) => setProp(_el$, "checked", showStatusbar(), _$p));
    return _el$;
  })();
}
const statusbarStyle = '#statusBar {\n  border-top: 1px solid var(--chrome-content-separator-color);\n  visibility: visible !important;\n}\n\n:root[inFullscreen]:not([macOSNativeFullscreen]) #statusBar:not([fullscreentoolbar="true"]) {\n  visibility: collapse !important;\n}\n\n:root[customizing] #statusBar {\n  display: inherit !important;\n}\n\n#statusBar.collapsed {\n  display: none;\n}\n\n#statusBar #statuspanel-label {\n  box-shadow: none !important;\n  background: none !important;\n  border: none !important;\n}\n\n#statusBar #status-text {\n  overflow: hidden !important;\n}\n';
function StatusBar() {
  return [(() => {
    var _el$ = createElement("xul:toolbar"), _el$2 = createElement("xul:hbox");
    insertNode(_el$, _el$2);
    setProp(_el$, "id", "statusBar");
    setProp(_el$, "toolbarname", "Status bar");
    setProp(_el$, "customizable", "true");
    setProp(_el$, "mode", "icons");
    setProp(_el$, "context", "toolbar-context-menu");
    setProp(_el$, "accesskey", "A");
    setProp(_el$2, "id", "status-text");
    setProp(_el$2, "align", "center");
    setProp(_el$2, "flex", "1");
    setProp(_el$2, "class", "statusbar-padding");
    effect((_$p) => setProp(_el$, "class", `browser-toolbar customization-target ${showStatusbar() ? "" : "collapsed"}`, _$p));
    return _el$;
  })(), (() => {
    var _el$3 = createElement("style");
    setProp(_el$3, "jsx", true);
    insert(_el$3, statusbarStyle);
    return _el$3;
  })()];
}
function initStatusbar() {
  render(() => createComponent(StatusBar, {}), document.getElementById("navigator-toolbox"));
  insert(document.getElementById("toolbar-context-menu"), () => createComponent(ContextMenu, {}), document.getElementById("viewToolbarsMenuSeparator"));
  gFloorpStatusBar.getInstance();
}
const iconStyle = '#undo-closed-tab {\n  list-style-image: url("chrome://global/skin/icons/undo.svg");\n}\n';
const {
  CustomizableUI
} = ChromeUtils.importESModule("resource:///modules/CustomizableUI.sys.mjs");
const _gFloorpUndoClosedTab = class _gFloorpUndoClosedTab {
  constructor() {
    __publicField(this, "StyleElement", () => {
      return (() => {
        var _el$ = createElement("style");
        insert(_el$, iconStyle);
        return _el$;
      })();
    });
    gFloorpBrowserAction.createToolbarClickActionButton("undo-closed-tab", "undo-closed-tab", () => {
      window.undoCloseTab();
    }, this.StyleElement(), CustomizableUI.AREA_NAVBAR, 0);
  }
  static getInstance() {
    if (!_gFloorpUndoClosedTab.instance) {
      _gFloorpUndoClosedTab.instance = new _gFloorpUndoClosedTab();
    }
    return _gFloorpUndoClosedTab.instance;
  }
};
__publicField(_gFloorpUndoClosedTab, "instance");
let gFloorpUndoClosedTab = _gFloorpUndoClosedTab;
function initUndoClosedTab() {
  gFloorpUndoClosedTab.getInstance();
}
CustomShortcutKey.getInstance();
window.SessionStore.promiseInitialized.then(() => {
  initBrowserContextMenu();
  initPrivateContainer();
  initShareMode();
  initStatusbar();
  initDownloadbar();
  initReverseSidebarPosition();
  initUndoClosedTab();
  initProfileManager();
});
//# sourceMappingURL=content.js.map
