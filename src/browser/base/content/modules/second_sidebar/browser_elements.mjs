import { XULElement } from "./xul/base/xul_element.mjs";

export class BrowserElements {
  static get root() {
    return new XULElement({ element: window.document.documentElement });
  }
  
  static get browser() {
    return new XULElement({
      element: window.document.getElementById("browser"),
    });
  }

  static get tabbrowserTabbox() {
    return new XULElement({
      element: window.document.getElementById("tabbrowser-tabbox"),
    });
  }

  static get customizationContainer() {
    return new XULElement({
      element: window.document.getElementById("customization-container"),
    });
  }

  static get notificationPopup() {
    return new XULElement({
      element: window.document.getElementById("notification-popup"),
    });
  }

  static get contentAreaContextMenu() {
    return new XULElement({
      element: window.document.getElementById("contentAreaContextMenu"),
    });
  }

  static get menuApiPopup() {
    return new XULElement({
      element: window.document.querySelector('menupopup[menu-api="true"]'),
    });
  }
}
