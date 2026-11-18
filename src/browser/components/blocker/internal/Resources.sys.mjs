/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  RemoteResources: "resource:///modules/internal/RemoteResources.sys.mjs",
});

function useResources(engine, resourcesJsonOrObject) {
  if (!engine) {
    return false;
  }

  try {
    const payload =
      typeof resourcesJsonOrObject === "string"
        ? resourcesJsonOrObject
        : JSON.stringify(resourcesJsonOrObject ?? []);
    engine.useResources(payload);
    return true;
  } catch (err) {
    console.error("[MidoriBlocker] useResources failed:", err);
    return false;
  }
}

export const Resources = {
  async load(engine) {
    if (!engine) {
      return false;
    }

    const snapshot = await lazy.RemoteResources.readResourceSnapshot();
    return (
      snapshot.resources.length > 0 &&
      useResources(engine, snapshot.resources) &&
      snapshot.complete &&
      !snapshot.remoteEnabled
    );
  },
};
