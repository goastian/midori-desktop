/* eslint-disable no-undef */
/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */

// This script adds a button & menu to customize toolbar mode.
// Remove addons button from toolbar toggle button.

export const gFloorpCustomizeMode = {
  initialized: false,

  init() {
    if (this.initialized) {
      return;
    }

    let elem = window.MozXULElement.parseXULToFragment(`
       <checkbox id="customization-visibility-unified-extensions-button-checkbox" class="customizationmode-checkbox"
                 oncommand="gFloorpCustomizeMode.toggleUnifiedExtensionsButton(!this.checked)" data-l10n-id="floorp-customize-mode-unified-extensions-button"
      />`);
    let enabled = !Services.prefs.getBoolPref(
      "floorp.hide.unifiedExtensionsButtton",
      false
    );
    gFloorpCustomizeMode.addElemToCustomizeModeArea(
      elem,
      enabled,
      "customization-titlebar-visibility-checkbox",
      "after",
      0
    );

    this.initialized = true;
  },
  addElemToCustomizeModeArea(elem, enabled, targetId, type, retry) {
    if (retry > 3) {
      throw new Error(
        `Retry count is over. targetId: ${targetId}, type: ${type}`
      );
    }

    if (enabled) {
      // If enabled == false, this code is not needed. On XUL needless attribute sould be removed.
      elem.firstChild.setAttribute("checked", "true");
    }

    // This code is maybe failed if user doesn"t open customize mode. So we need to retry.
    try {
      let button = document.getElementById(targetId);
      if (!button) {
        throw new Error(
          `targetElem is not found. targetId: ${targetId}, type: ${type}`
        );
      }
      switch (type) {
        case "before":
          button.before(elem);
          break;
        case "after":
          button.after(elem);
          break;
        default:
          button.after(elem);
          break;
      }
    } catch (e) {
      let customizationContainer = document.getElementById("nav-bar");
      let observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.target.getAttribute("customizing") == "true") {
            gFloorpCustomizeMode.addElemToCustomizeModeArea(
              elem,
              enabled,
              targetId,
              type,
              retry + 1
            );
            observer.disconnect();
          }
        });
      });

      let config = { attributes: true };
      observer.observe(customizationContainer, config);
    }
  },

  toggleUnifiedExtensionsButton(enabled) {
    Services.prefs.setBoolPref("floorp.hide.unifiedExtensionsButtton", enabled);
  },
};
