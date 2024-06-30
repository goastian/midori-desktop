/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from /toolkit/content/preferencesBindings.js */

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { workspaceIcons } = ChromeUtils.importESModule(
  "resource:///modules/WorkspacesService.sys.mjs",
);
const { ContextualIdentityService } = ChromeUtils.importESModule(
  "resource://gre/modules/ContextualIdentityService.sys.mjs",
);

// eslint-disable-next-line no-undef
XPCOMUtils.defineLazyGetter(this, "L10n", () => {
  return new Localization(["branding/brand.ftl", "browser/floorp"]);
});

const win = Services.wm.getMostRecentWindow("navigator:browser");

async function onLoad() {
  // set Title
  let winElem = document.documentElement;
  document.l10n.setAttributes(winElem, "workspace-customize");

  // Workspace Menu Items
  const workspaces =
    await win.gWorkspaces.getCurrentWorkspacesDataWithoutPreferences();
  const workspaceSelect = document.getElementById("workspacesPopup");
  const workspaceNameLabel = document.getElementById("workspaceName");

  for (let key in workspaces) {
    const element = window.MozXULElement.parseXULToFragment(`
        <menuitem value="${workspaces[key].id}"></menuitem>
      `);

    // against to XSS
    element.firstElementChild.setAttribute("label", workspaces[key].name);

    workspaceSelect.appendChild(element);
  }

  //icon Menu Items
  const iconSelect = document.getElementById("workspacesIconSelectPopup");
  const iconNameLabel = document.getElementById("iconName");

  for (let icon of workspaceIcons) {
    const element = window.MozXULElement.parseXULToFragment(`
        <menuitem data-l10n-id="workspace-icon-${icon}" value="${icon}"
                  style="list-style-image: url(chrome://browser/skin/workspace-icons/${icon}.svg);"
        />
    `);

    iconSelect.appendChild(element);
  }

  // container
  const containerSelect = document.getElementById(
    "workspacesContainerSelectPopup",
  );
  const containerNameLabel = document.getElementById("containerName");
  const currentContainers = ContextualIdentityService.getPublicIdentities();

  const noContainer = window.MozXULElement.parseXULToFragment(`
      <menuitem data-l10n-id="floorp-no-workspace-container" value="0"></menuitem>
    `);
  containerSelect.appendChild(noContainer);
  containerNameLabel.value = "0";

  for (let container of currentContainers) {
    const element = window.MozXULElement.parseXULToFragment(`
        <menuitem label="${container.name}" value="${container.userContextId}"></menuitem>
      `);

    if (container.l10nID) {
      let labelName = ContextualIdentityService.getUserContextLabel(
        container.userContextId,
      );
      element.firstElementChild.setAttribute("label", labelName);
    }

    containerSelect.appendChild(element);
  }

  iconNameLabel.value = "fingerprint";
  containerNameLabel.value = "0";

  if (window.arguments) {
    const workspaceId = window.arguments[0].workspaceId;
    const workspace = await win.gWorkspaces.getWorkspaceById(workspaceId);
    workspaceNameLabel.value = workspace.id;
    iconNameLabel.value = workspace.icon || "fingerprint";
    containerNameLabel.value = workspace.userContextId || "0";
  } else {
    const defaultWorkspace = await win.gWorkspaces.getDefaultWorkspace();
    workspaceNameLabel.value = defaultWorkspace.id;
    iconNameLabel.value = defaultWorkspace.icon || "fingerprint";
    containerNameLabel.value = defaultWorkspace.userContextId || "0";
  }

  document.addEventListener("dialogaccept", setPref);
}

async function setPref() {
  const workspaceId = document.getElementById("workspaceName").value;
  const icon = document.getElementById("iconName").value;
  const container = document.getElementById("containerName").value;

  await win.gWorkspaces.setWorkspaceContainerUserContextIdAndIcon(
    workspaceId,
    container,
    icon,
  );
}
