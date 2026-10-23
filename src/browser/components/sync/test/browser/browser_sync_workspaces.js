/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

add_task(async function received_workspaces_appear_in_normal_windows_without_switching_or_opening_tabs() {
  requestLongerTimeout(2);
  const { AboutNewTab } = ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs");
  const originalNewTabURL = AboutNewTab.newTabURL;
  AboutNewTab.newTabURL = "about:blank";
  registerCleanupFunction(() => { AboutNewTab.newTabURL = originalNewTabURL; });
  await SpecialPowers.pushPrefEnv({ set: [["midori.workspaces.enabled", true], ["midori.workspaces.unloadInactive", false]] });
  const { MidoriWorkspaces } = ChromeUtils.importESModule("resource:///modules/MidoriWorkspaces.sys.mjs");
  const { MidoriSyncWorkspaces } = ChromeUtils.importESModule("resource:///modules/MidoriSyncWorkspaces.sys.mjs");
  const { MidoriSyncTabs } = ChromeUtils.importESModule("resource:///modules/MidoriSyncTabs.sys.mjs");
  MidoriWorkspaces.init();
  const first = await BrowserTestUtils.openNewBrowserWindow();
  const second = await BrowserTestUtils.openNewBrowserWindow();
  const privateWindow = await BrowserTestUtils.openNewBrowserWindow({ private: true });
  const windows = [first, second, privateWindow];
  const adapter = new MidoriSyncWorkspaces();
  const incomingId = `w1:${Services.uuid.generateUUID().toString().slice(1, -1)}`;
  const remote = { version: 1, name: "Received workspace", icon: "research" };
  let sharedId;
  let later;
  let notices = 0;
  const catalogObserver = () => { ++notices; };
  Services.obs.addObserver(catalogObserver, "midori-workspace-catalog-changed");
  try {
    for (const win of windows) {
      await TestUtils.waitForCondition(() => MidoriWorkspaces._getWindowState(win)?._onTabOpen,
        "The window workspace producer has attached its native tab listeners");
    }
    const local = await MidoriWorkspaces.createWorkspace(first, "Shared workspace", "work");
    is(notices, 1, "Publishing shared metadata wakes the tracker once across all normal windows");
    sharedId = MidoriWorkspaces.workspaceSyncId(first, local);
    ok(/^w1:/.test(sharedId), "User-created metadata has a stable portable identity");
    const other = (await MidoriWorkspaces.getWorkspacesForWindow(second)).workspaces.find(workspace => workspace.name === "Shared workspace");
    ok(other, "A local metadata edit also reaches the other normal window");
    is(MidoriWorkspaces.workspaceSyncId(second, other.id), sharedId);
    const page = "https://example.com/browser/browser/components/sync/test/browser/file_sync_autofill.html";
    const nativeTab = await BrowserTestUtils.openNewForegroundTab(first.gBrowser, page);
    const noticesBeforePrivate = notices;
    const privateId = await MidoriWorkspaces.createWorkspace(privateWindow, "Private workspace metadata", "secure");
    is(notices, noticesBeforePrivate, "Private metadata changes do not wake the Sync tracker");
    is(MidoriWorkspaces.workspaceSyncId(privateWindow, privateId), null);
    const before = await Promise.all(windows.map(async win => ({
      tabs: [...win.gBrowser.tabs], selectedTab: win.gBrowser.selectedTab,
      selectedWorkspace: (await MidoriWorkspaces.getWorkspacesForWindow(win)).selectedId,
    })));
    Assert.deepEqual(await adapter.apply({ id: incomingId, deleted: false, value: remote }), { status: "applied" });
    for (const [index, win] of windows.entries()) {
      const current = await MidoriWorkspaces.getWorkspacesForWindow(win);
      Assert.deepEqual([...win.gBrowser.tabs], before[index].tabs, "Receiving metadata does not open or close tabs");
      is(win.gBrowser.selectedTab, before[index].selectedTab, "The selected native tab is preserved");
      is(current.selectedId, before[index].selectedWorkspace, "The active workspace is preserved");
      is(current.workspaces.some(workspace => workspace.name === remote.name), index !== 2,
        "Only normal windows receive the shared workspace metadata");
    }
    ok(!(await adapter.listIds()).some(key => MidoriWorkspaces._catalog.read(key)?.name === "Private workspace metadata"),
      "Private workspace metadata is absent from the portable inventory");
    const tabs = new MidoriSyncTabs({ deviceId: Services.uuid.generateUUID().toString().slice(1, -1),
      deviceName: "Workspace fixture", windows: () => windows });
    try {
      const snapshot = tabs.snapshot();
      const entry = snapshot.tabs.find(tab => tab.url === nativeTab.linkedBrowser.currentURI.spec);
      is(entry.workspace, sharedId, "Tab snapshots use the portable workspace identity");
      ok(!JSON.stringify(snapshot).includes("Private workspace metadata"));
    } finally {
      tabs.close();
    }
    const previous = await adapter.read(sharedId);
    const renamed = { ...previous, name: "Renamed remotely", icon: "focus" };
    Assert.deepEqual(await adapter.apply({ id: sharedId, deleted: false, value: renamed },
      { id: sharedId, deleted: false, value: previous }), { status: "applied" });
    is((await MidoriWorkspaces.getWorkspacesForWindow(first)).selectedId, local);
    is((await MidoriWorkspaces.getWorkspacesForWindow(second)).workspaces.find(workspace => workspace.id === other.id).name,
      renamed.name, "A rename preserves identity in both normal windows");
    Assert.deepEqual(await adapter.apply({ id: sharedId, deleted: true }, { id: sharedId, deleted: false, value: renamed }),
      { status: "conflict", reason: "workspace_in_use" });
    is(nativeTab.getAttribute("midori-workspace-id"), local, "An incoming deletion cannot move a local tab silently");
    later = await BrowserTestUtils.openNewBrowserWindow();
    await TestUtils.waitForCondition(() => MidoriWorkspaces._getWindowState(later)?._onTabOpen,
      "The new window has loaded its workspace catalog");
    const reopened = await MidoriWorkspaces.getWorkspacesForWindow(later);
    ok(reopened.workspaces.some(workspace => workspace.name === remote.name), "New windows load the durable shared catalog");
    ok(reopened.workspaces.find(workspace => workspace.id === reopened.selectedId).isDefault,
      "A new window keeps its own initial selection");
    const plan = await adapter.prepare({ id: sharedId, deleted: true }, { id: sharedId, deleted: false, value: renamed },
      { resolution: { choice: "remote" } });
    const nativeTabs = [...first.gBrowser.tabs];
    Assert.deepEqual(await adapter.applyPrepared(plan), { status: "applied" });
    Assert.deepEqual([...first.gBrowser.tabs], nativeTabs, "An explicit remote deletion also keeps every native tab");
    is(first.gBrowser.selectedTab, nativeTab);
    const fallback = (await MidoriWorkspaces.getWorkspacesForWindow(first)).workspaces.find(workspace => workspace.isDefault);
    is(nativeTab.getAttribute("midori-workspace-id"), fallback.id, "An explicit deletion moves membership to the local default");
    ok(!(await adapter.listIds()).includes(sharedId));
    const saved = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, "midori-workspaces.json"));
    ok(!JSON.stringify(saved).includes("Private workspace metadata"), "Private metadata is not written to the profile store");
    const deletion = await adapter.prepare({ id: incomingId, deleted: true }, { id: incomingId, deleted: false, value: remote });
    const received = (await MidoriWorkspaces.getWorkspacesForWindow(second)).workspaces.find(workspace => workspace.name === remote.name);
    MidoriWorkspaces.switchWorkspace(second, received.id);
    const afterSwitch = [...second.gBrowser.tabs];
    Assert.deepEqual(await adapter.applyPrepared(deletion), { status: "conflict", reason: "workspace_changed" },
      "Starting to use a workspace after preparation invalidates an incoming deletion");
    Assert.deepEqual(await adapter.read(incomingId), remote);
    Assert.deepEqual([...second.gBrowser.tabs], afterSwitch);
  } finally {
    Services.obs.removeObserver(catalogObserver, "midori-workspace-catalog-changed");
    for (const key of [sharedId, incomingId].filter(Boolean)) {
      const current = await adapter.read(key);
      const plan = await adapter.prepare({ id: key, deleted: true }, { id: key, deleted: current === null, value: current },
        { resolution: { choice: "remote" } });
      await adapter.applyPrepared(plan);
    }
    adapter.close();
    for (const win of [...windows, later].filter(Boolean)) {
      await BrowserTestUtils.closeWindow(win);
    }
  }
});
