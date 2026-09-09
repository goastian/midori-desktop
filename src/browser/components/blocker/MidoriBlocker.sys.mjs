/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  MidoriBlockerExtensionDetector:
    "resource:///modules/MidoriBlockerExtensionDetector.sys.mjs",
  MidoriBlockerPanel: "resource:///modules/MidoriBlockerPanel.sys.mjs",
  MidoriBlockerService: "resource:///modules/MidoriBlockerService.sys.mjs",
});

let actorsRegistered = false;
let bootstrapped = false;
let initialized = false;

function registerActors() {
  if (actorsRegistered) {
    return;
  }

  ChromeUtils.registerWindowActor("MidoriBlocker", {
    parent: {
      esModuleURI: "resource:///modules/MidoriBlockerParent.sys.mjs",
    },
    child: {
      esModuleURI: "resource:///modules/MidoriBlockerChild.sys.mjs",
      events: {
        DOMWindowCreated: {},
        DOMDocElementInserted: {},
      },
    },
    allFrames: true,
    messageManagerGroups: ["browsers"],
    remoteTypes: ["web"],
  });

  ChromeUtils.registerWindowActor("MidoriBlockedPage", {
    parent: {
      esModuleURI: "resource:///modules/MidoriBlockedPageParent.sys.mjs",
    },
    child: {
      esModuleURI: "resource:///modules/MidoriBlockedPageChild.sys.mjs",
      events: {
        click: {},
      },
    },
    matches: ["about:contentblocked?*"],
    allFrames: true,
  });

  actorsRegistered = true;
}

export const MidoriBlocker = {
  bootstrap() {
    if (bootstrapped) {
      return;
    }

    bootstrapped = true;
    registerActors();
    lazy.MidoriBlockerService.init().catch(error => {
      console.error("MidoriBlockerService bootstrap init failed", error);
    });
  },

  init() {
    if (initialized) {
      return;
    }

    registerActors();
    initialized = true;
    lazy.MidoriBlockerPanel.init();
    lazy.MidoriBlockerExtensionDetector.init();
    lazy.MidoriBlockerService.init().catch(error => {
      console.error("MidoriBlockerService startup init failed", error);
    });
  },

  uninit() {
    if (!initialized && !bootstrapped) {
      return;
    }

    if (initialized) {
      lazy.MidoriBlockerExtensionDetector.uninit();
      lazy.MidoriBlockerPanel.uninit();
    }
    lazy.MidoriBlockerService.uninit();
    initialized = false;
    bootstrapped = false;
  },
};

