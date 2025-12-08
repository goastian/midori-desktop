import { BrowserElements } from "../browser_elements.mjs";
import { SidebarControllers } from "../sidebar_controllers.mjs";

export class Shortcuts {
  constructor() {
    this.enabled = true;
    this.#setupListeners();
  }

  #setupListeners() {
    BrowserElements.root.addEventListener("keypress", (event) => {
      if (!this.enabled) return;
      this.trySidebarWidgetShortcut(event);
      this.tryWebPanelShortcuts(event);
    });
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  /**
   *
   * @param {KeyboardEvent} event
   */
  trySidebarWidgetShortcut(event) {
    if (!SidebarControllers.sidebarController || !SidebarControllers.sidebarMainCollapser) {
      return;
    }
    const shortcut = SidebarControllers.sidebarController.sidebarWidgetShortcut;
    if (shortcut.length === 0) return;

    const shortcutParts = this.getShortcutPartsFromShortcut(shortcut);
    const eventParts = this.getShortcutPartsFromEvent(event);

    if (this.isEqual(shortcutParts, eventParts)) {
      event.preventDefault();
      SidebarControllers.sidebarMainCollapser.onSidebarCollapseButtonClick();
    }
  }

  /**
   *
   * @param {KeyboardEvent} event
   */
  tryWebPanelShortcuts(event) {
    if (!SidebarControllers.webPanelsController) {
      return;
    }
    const webPanelControllers = SidebarControllers.webPanelsController.getAll();
    const eventParts = this.getShortcutPartsFromEvent(event);

    for (const webPanelController of webPanelControllers) {
      const shortcut = webPanelController.getShortcut();
      if (shortcut.length === 0) continue;

      const shortcutParts = this.getShortcutPartsFromShortcut(shortcut);

      if (this.isEqual(shortcutParts, eventParts)) {
        event.preventDefault();
        webPanelController.switchWebPanel();
        return;
      }
    }
  }

  /**
   *
   * @param {string} shortcut
   * @returns {boolean}
   */
  isSidebarWidgetShortcutBusy(shortcut) {
    if (!SidebarControllers.webPanelsController) {
      return false;
    }
    const webPanelControllers = SidebarControllers.webPanelsController.getAll();
    return webPanelControllers.some(
      (webPanelController) => webPanelController.getShortcut() === shortcut,
    );
  }

  /**
   *
   * @param {string} uuid
   * @param {string} shortcut
   * @returns {boolean}
   */
  isWebPanelShortcutBusy(uuid, shortcut) {
    if (!SidebarControllers.webPanelsController || !SidebarControllers.sidebarController) {
      return false;
    }
    const webPanelControllers = SidebarControllers.webPanelsController.getAll();
    return (
      webPanelControllers.some(
        (webPanelController) =>
          webPanelController.getUUID() !== uuid &&
          webPanelController.getShortcut() === shortcut,
      ) ||
      shortcut === SidebarControllers.sidebarController.sidebarWidgetShortcut
    );
  }

  /**
   *
   * @param {KeyboardEvent} event
   * @returns {string[]}
   */
  getShortcutPartsFromEvent(event) {
    const parts = [];
    if (event.altKey) parts.push("Alt");
    if (event.ctrlKey) parts.push("Ctrl");
    if (event.metaKey) parts.push("Meta");
    if (event.shiftKey) parts.push("Shift");
    parts.push(event.key.toUpperCase());
    return parts;
  }

  /**
   *
   * @param {string} shortcut
   * @returns {string[]}
   */
  getShortcutPartsFromShortcut(shortcut) {
    return shortcut.split("+");
  }

  /**
   *
   * @param {string} shortcut
   * @returns {boolean}
   */
  isEqual(lhs, rhs) {
    return JSON.stringify(lhs.sort()) == JSON.stringify(rhs.sort());
  }

  unload() {
    this.enabled = false;
    // Los event listeners se limpiarán cuando se destruya BrowserElements
  }
}
