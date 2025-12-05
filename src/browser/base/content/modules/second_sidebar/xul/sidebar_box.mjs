import { VBox } from "./base/vbox.mjs";

export class SidebarBox extends VBox {
  constructor() {
    super({ id: "sb2-box" });
    // Hide sidebar by default - it will be shown when a webpanel is opened
    this.setAttribute("hidden", "true");
  }
}
