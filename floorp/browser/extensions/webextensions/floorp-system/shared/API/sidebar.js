/* global ExtensionAPI, ExtensionCommon, Services, XPCOMUtils */

this.sidebar = class extends ExtensionAPI {
  getAPI(context) {
    return {
      sidebar: {
        async getExtensionsInSidebar() {
          const extensionsMap =
            Services.wm.getMostRecentWindow("navigator:browser")
              ?.SidebarController?.sidebars;
          const extensionsArr = [];
          for (const e of extensionsMap.values()) {
            if (!("sourceL10nEl" in e))
              extensionsArr.push({
                title: e.title,
                id: e.extensionId,
                buttonId: e.buttonId,
              });
          }
          return extensionsArr;
        },
      },
    };
  }
};
