import { SidebarControllers } from "./sidebar_controllers.mjs";
import { SidebarDecorator } from "./sidebar_decorator.mjs";
import { SidebarElements } from "./sidebar_elements.mjs";
import { SidebarSettings } from "./settings/sidebar_settings.mjs";
import { WebPanelsSettings } from "./settings/web_panels_settings.mjs";
import { WebPanelsState } from "./settings/web_panels_state.mjs";
import { CustomizableUIWrapper } from "./wrappers/customizable_ui.mjs";
import { isPopupWindow } from "./utils/windows.mjs";
import { window as globalWindow } from "./globals.mjs";

export class SidebarInjector {
  /**
   *
   * @returns {boolean}
   */
  static inject() {
    // Check if sidebar already exists in the DOM using the global window's document
    if (globalWindow?.document?.getElementById("sb2-wrapper")) {
      console.log("Sidebar already initialized, skipping...");
      return true;
    }
    
    if (isPopupWindow()) {
      console.log("Failed to load second sidebar because window is popup");
      return false;
    }

    console.log("Loading sidebar settings...");
    const sidebarSettings = SidebarSettings.load();

    console.log("Loading web panel settings...");
    const webPanelsSettings = WebPanelsSettings.load(
      sidebarSettings.position,
      sidebarSettings.defaultFloatingOffset,
    );

    console.log("Loading web panel state...");
    const webPanelsState = WebPanelsState.load();

    console.log("Elements creation...");
    SidebarElements.create();

    console.log("Building controllers...");
    SidebarControllers.create();

    console.log("Applying settings...");
    SidebarControllers.sidebarController.loadSettings(sidebarSettings);
    SidebarControllers.webPanelsController.loadSettingsAndState(
      webPanelsSettings,
      webPanelsState,
    );
    
    console.log("Injecting CSS...");
    SidebarDecorator.decorate();

    console.log("Second Sidebar loaded");
    return true;
  }

  /**
   * Remove the sidebar from the window
   * @returns {boolean}
   */
  static remove() {
    try {
      console.log("Removing Midori Sidebar...");
      
      // Check if sidebar exists
      const sidebarElement = globalWindow?.document?.getElementById("sb2-wrapper");
      if (!sidebarElement) {
        console.log("Sidebar not found, nothing to remove");
        return true;
      }
      
      // Destroy all controllers with unload methods
      const controllersToUnload = [
        'webPanelsController',
        'sidebarController',
        'sidebarMainController',
        'sidebarMainCollapser',
        'sidebarMainSettingsController',
        'sidebarGeometry',
        'sidebarToolbarCollapser',
        'sidebarMover',
        'sidebarResizer',
        'sidebarSplitterController',
        'webPanelTooltipController',
        'webPanelsShortcuts',
        'webPanelNewController',
        'webPanelEditController',
        'webPanelMoreController',
        'webPanelDeleteController',
        'contextMenuItemsController'
      ];
      
      for (const controllerName of controllersToUnload) {
        const controller = SidebarControllers[controllerName];
        if (controller && typeof controller.unload === 'function') {
          try {
            controller.unload();
          } catch (e) {
            console.warn(`Error unloading ${controllerName}:`, e);
          }
        }
      }
      
      // Remove CSS styles
      SidebarDecorator.undecorate();
      
      // Unregister CustomizableUI area
      try {
        if (SidebarElements.sidebarMain) {
          CustomizableUIWrapper.unregisterArea(SidebarElements.sidebarMain.id);
        }
      } catch (e) {
        console.warn("Error unregistering CustomizableUI area:", e);
      }
      
      // Remove context menu items
      const contextMenuItems = [
        SidebarElements.openLinkAsWebPanelMenuItem,
        SidebarElements.openLinkAsTempWebPanelMenuItem,
        SidebarElements.searchInWebPanelMenuItem
      ];
      
      for (const item of contextMenuItems) {
        if (item && item.getXUL) {
          try {
            item.getXUL().remove();
          } catch (e) {
            console.warn("Error removing context menu item:", e);
          }
        }
      }
      
      // Remove popups
      const popups = [
        SidebarElements.webPanelTooltip,
        SidebarElements.webPanelMenuPopup,
        SidebarElements.webPanelPopupNew,
        SidebarElements.webPanelPopupEdit,
        SidebarElements.webPanelPopupDelete,
        SidebarElements.sidebarMainMenuPopup,
        SidebarElements.sidebarMainPopupSettings,
        SidebarElements.webPanelPopupMore
      ];
      
      for (const popup of popups) {
        if (popup && popup.getXUL) {
          try {
            popup.getXUL().remove();
          } catch (e) {
            console.warn("Error removing popup:", e);
          }
        }
      }
      
      // Remove main sidebar DOM element
      if (SidebarElements.sidebarWrapper && SidebarElements.sidebarWrapper.getXUL) {
        SidebarElements.sidebarWrapper.getXUL().remove();
      }
      
      // Clear all references
      for (const key in SidebarElements) {
        if (SidebarElements.hasOwnProperty(key) && key !== 'create') {
          delete SidebarElements[key];
        }
      }
      
      for (const key in SidebarControllers) {
        if (SidebarControllers.hasOwnProperty(key) && key !== 'create') {
          delete SidebarControllers[key];
        }
      }
      
      console.log("Midori Sidebar removed successfully");
      return true;
    } catch (error) {
      console.error("Error removing Midori Sidebar:", error);
      console.error(error.stack);
      return false;
    }
  }
}
