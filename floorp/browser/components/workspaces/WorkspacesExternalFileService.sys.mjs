/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 export const EXPORTED_SYMBOLS = ["WorkspacesExternalFileService"];

export const WorkspacesExternalFileService = {
  get _workspacesStoreFile() {
    return PathUtils.join(
      PathUtils.profileDir,
      "Workspaces",
      "Workspaces.json",
    );
  },
};