import { BrowserElements } from "../browser_elements.mjs";
import { ScriptSecurityManagerWrapper } from "../wrappers/script_security_manager.mjs";
import { SearchService } from "../wrappers/search.mjs";
import { SidebarControllers } from "../sidebar_controllers.mjs";
import { SidebarElements } from "../sidebar_elements.mjs";

export class ContextMenuItemsController {
  constructor() {
    this.#setupListeners();
    this.searchQuery = "";
  }

  #setupListeners() {
    BrowserElements.contentAreaContextMenu.addEventListener(
      "popupshowing",
      () => this.#onPopupShowing(),
    );

    SidebarElements.openLinkAsWebPanelMenuItem.addEventListener("command", () =>
      this.#openLinkAsWebPanel(),
    );

    SidebarElements.openLinkAsTempWebPanelMenuItem.addEventListener(
      "command",
      () => this.#openLinkAsWebPanel(true),
    );

    SidebarElements.searchInWebPanelMenuItem.addEventListener(
      "command",
      async () => await this.#searchInWebPanel(),
    );
  }

  #onPopupShowing() {
    if (typeof window.gContextMenu !== 'undefined') {
      this.searchQuery = window.gContextMenu.selectedText || window.gContextMenu.linkTextStr;
      SidebarElements.searchInWebPanelMenuItem.setSearchQuery(this.searchQuery);
    }
  }

  /**
   * @param {boolean} temporary
   */
  #openLinkAsWebPanel(temporary = false) {
    if (typeof window.gContextMenu === 'undefined') {
      console.warn("gContextMenu is not available");
      return;
    }
    const url = window.gContextMenu.linkURL;
    SidebarControllers.webPanelNewController.createWebPanel(
      url,
      ScriptSecurityManagerWrapper.DEFAULT_USER_CONTEXT_ID,
      temporary,
    );
  }

  async #searchInWebPanel() {
    const url = await SearchService.getDefaulSubmissionUrl(this.searchQuery);
    if (url === null) return;
    SidebarControllers.webPanelNewController.createWebPanel(
      url,
      ScriptSecurityManagerWrapper.DEFAULT_USER_CONTEXT_ID,
      true,
    );
  }
}
