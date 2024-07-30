
/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */

export const WorkspacesExternalFileService = {
  get _workspacesStoreFile() {
    return PathUtils.join(
      PathUtils.profileDir,
      "Workspaces",
      "Workspaces.json",
    );
  },
};
