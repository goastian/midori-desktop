/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const { InfoBar } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/InfoBar.sys.mjs"
);
const { CFRMessageProvider } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/CFRMessageProvider.sys.mjs"
);
const { ASRouter } = ChromeUtils.importESModule(
  "resource:///modules/asrouter/ASRouter.sys.mjs"
);

const UNIVERSAL_MESSAGE = {
  id: "universal-infobar",
  content: {
    type: "universal",
    text: "t",
    buttons: [],
  },
};

const cleanupInfobars = () => {
  InfoBar._universalInfobars = [];
  InfoBar._activeInfobar = null;
};

const makeFakeWin = ({
  closed = false,
  toolbarVisible = true,
  taskbarTab = false,
  readyState = "complete",
  selectedBrowser,
} = {}) => {
  const win = {
    closed,
    toolbar: { visible: toolbarVisible },
    document: {
      readyState,
      documentElement: {
        hasAttribute: name => (name === "taskbartab" ? taskbarTab : false),
      },
    },
    gBrowser: { selectedBrowser },
  };

  const browser = { ownerGlobal: win, id: selectedBrowser };
  win.gBrowser = { selectedBrowser: browser };
  return win;
};

add_setup(async function () {
  const sandbox = sinon.createSandbox();
  sandbox
    .stub(PrivateBrowsingUtils, "isWindowPrivate")
    .callsFake(win => !!win?.isPrivate);

  registerCleanupFunction(() => {
    sandbox.restore();
  });
});

add_task(async function showNotificationAllWindows() {
  const sandbox = sinon.createSandbox();
  let fakeNotification = { showNotification: sandbox.stub().resolves() };
  let fakeWins = [
    makeFakeWin({ selectedBrowser: "win1" }),
    makeFakeWin({ selectedBrowser: "win2" }),
    makeFakeWin({ selectedBrowser: "win3" }),
  ];

  sandbox.stub(InfoBar, "maybeLoadCustomElement");
  sandbox.stub(InfoBar, "maybeInsertFTL");

  let origWinManager = Services.wm;
  // Using sinon.stub won’t work here, because Services.wm is a frozen,
  // non-configurable object and its methods cannot be replaced via typical JS
  // property assignment.
  Object.defineProperty(Services, "wm", {
    value: { getEnumerator: () => fakeWins[Symbol.iterator]() },
    configurable: true,
    writable: true,
  });

  await InfoBar.showNotificationAllWindows(fakeNotification);

  Assert.equal(fakeNotification.showNotification.callCount, 3);
  Assert.equal(fakeNotification.showNotification.getCall(0).args[0].id, "win1");
  Assert.equal(fakeNotification.showNotification.getCall(1).args[0].id, "win2");
  Assert.equal(fakeNotification.showNotification.getCall(2).args[0].id, "win3");

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
  Object.defineProperty(Services, "wm", {
    value: origWinManager,
    configurable: true,
    writable: true,
  });
});

add_task(async function removeUniversalInfobars() {
  const sandbox = sinon.createSandbox();
  let browser = BrowserWindowTracker.getTopWindow().gBrowser.selectedBrowser;
  let origBox = browser.ownerGlobal.gNotificationBox;
  browser.ownerGlobal.gNotificationBox = {
    appendNotification: sandbox.stub().resolves({}),
    removeNotification: sandbox.stub(),
  };

  sandbox
    .stub(InfoBar, "showNotificationAllWindows")
    .callsFake(async notification => {
      await notification.showNotification(browser);
    });

  let notification = await InfoBar.showInfoBarMessage(
    browser,
    UNIVERSAL_MESSAGE,
    sandbox.stub()
  );

  Assert.equal(InfoBar._universalInfobars.length, 1);
  notification.removeUniversalInfobars();

  Assert.ok(
    browser.ownerGlobal.gNotificationBox.removeNotification.calledWith(
      notification.notification
    )
  );

  Assert.deepEqual(InfoBar._universalInfobars, []);

  // Cleanup
  cleanupInfobars();
  browser.ownerGlobal.gNotificationBox = origBox;
  sandbox.restore();
});

add_task(async function initialUniversal_showsAllWindows_andSendsTelemetry() {
  const sandbox = sinon.createSandbox();
  let browser = BrowserWindowTracker.getTopWindow().gBrowser.selectedBrowser;
  let origBox = browser.ownerGlobal.gNotificationBox;
  browser.ownerGlobal.gNotificationBox = {
    appendNotification: sandbox.stub().resolves({}),
    removeNotification: sandbox.stub(),
  };

  let showAll = sandbox
    .stub(InfoBar, "showNotificationAllWindows")
    .callsFake(async notification => {
      await notification.showNotification(browser);
    });

  let dispatch1 = sandbox.stub();
  let dispatch2 = sandbox.stub();

  await InfoBar.showInfoBarMessage(browser, UNIVERSAL_MESSAGE, dispatch1);
  await InfoBar.showInfoBarMessage(browser, UNIVERSAL_MESSAGE, dispatch2, true);

  Assert.ok(showAll.calledOnce);
  Assert.equal(InfoBar._universalInfobars.length, 2);

  // Dispatch impression (as this is the first universal infobar) and telemetry
  // ping
  Assert.equal(dispatch1.callCount, 2);

  // Do not send telemetry for subsequent appearance of the message
  Assert.equal(dispatch2.callCount, 0);

  // Cleanup
  cleanupInfobars();
  browser.ownerGlobal.gNotificationBox = origBox;
  sandbox.restore();
});

add_task(async function observe_domwindowopened_withLoadEvent() {
  const sandbox = sinon.createSandbox();
  let stub = sandbox.stub(InfoBar, "showInfoBarMessage").resolves();

  InfoBar._activeInfobar = {
    message: { content: { type: "universal" } },
    dispatch: sandbox.stub(),
  };

  let subject = makeFakeWin({ readyState: "loading", selectedBrowser: "b" });
  subject.addEventListener = function (event, cb) {
    subject.document.readyState = "complete";
    cb();
  };

  InfoBar.observe(subject, "domwindowopened");

  Assert.ok(stub.calledOnce);
  // Called with universalInNewWin true
  Assert.equal(stub.firstCall.args[3], true);

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function observe_domwindowopened() {
  const sandbox = sinon.createSandbox();
  let stub = sandbox.stub(InfoBar, "showInfoBarMessage").resolves();

  InfoBar._activeInfobar = {
    message: { content: { type: "universal" } },
    dispatch: sandbox.stub(),
  };

  let win = BrowserWindowTracker.getTopWindow();
  InfoBar.observe(win, "domwindowopened");

  Assert.ok(stub.calledOnce);
  Assert.equal(stub.firstCall.args[3], true);

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function observe_skips_nonUniversal() {
  const sandbox = sinon.createSandbox();
  let stub = sandbox.stub(InfoBar, "showInfoBarMessage").resolves();
  InfoBar._activeInfobar = {
    message: { content: { type: "global" } },
    dispatch: sandbox.stub(),
  };
  InfoBar.observe({}, "domwindowopened");
  Assert.ok(stub.notCalled);

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function infobarCallback_dismissed_universal() {
  const sandbox = sinon.createSandbox();
  const browser = BrowserWindowTracker.getTopWindow().gBrowser.selectedBrowser;
  const dispatch = sandbox.stub();

  sandbox
    .stub(InfoBar, "showNotificationAllWindows")
    .callsFake(async notif => await notif.showNotification(browser));

  let infobar = await InfoBar.showInfoBarMessage(
    browser,
    UNIVERSAL_MESSAGE,
    dispatch
  );
  // Reset the dispatch count to just watch for the DISMISSED ping
  dispatch.reset();

  infobar.infobarCallback("not‑removed‑event");

  Assert.equal(dispatch.callCount, 1);
  Assert.equal(dispatch.firstCall.args[0].data.event, "DISMISSED");
  Assert.deepEqual(InfoBar._universalInfobars, []);

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function removeObserver_on_removeUniversalInfobars() {
  const sandbox = sinon.createSandbox();

  sandbox.stub(InfoBar, "showNotificationAllWindows").resolves();

  let browser = BrowserWindowTracker.getTopWindow().gBrowser.selectedBrowser;
  let dispatch = sandbox.stub();

  // Show the universal infobar so it registers the observer
  let infobar = await InfoBar.showInfoBarMessage(
    browser,
    UNIVERSAL_MESSAGE,
    dispatch
  );
  Assert.ok(infobar, "Got an InfoBar notification");

  // Swap out Services.obs so removeObserver is spyable
  let origObs = Services.obs;
  let removeSpy = sandbox.spy();
  Services.obs = {
    addObserver: origObs.addObserver.bind(origObs),
    removeObserver: removeSpy,
    notifyObservers: origObs.notifyObservers.bind(origObs),
  };

  infobar.removeUniversalInfobars();

  Assert.ok(
    removeSpy.calledWith(InfoBar, "domwindowopened"),
    "removeObserver was invoked for domwindowopened"
  );

  // Cleanup
  Services.obs = origObs;
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function universalInfobar_persists_original_window_closure() {
  const sandbox = sinon.createSandbox();
  // Fake window so we can safely close it
  let fakeWindow = makeFakeWin({ selectedBrowser: "win1" });

  InfoBar._activeInfobar = {
    message: UNIVERSAL_MESSAGE,
    dispatch: sandbox.stub(),
  };
  InfoBar._universalInfobars = [
    { box: { ownerGlobal: fakeWindow }, notification: {} },
  ];

  Assert.ok(InfoBar._activeInfobar, "Got a universal infobar");

  // Mock closing the original window
  fakeWindow.closed = true;

  Assert.ok(
    InfoBar._activeInfobar,
    "_activeInfobar should persist through window closure"
  );

  let fakeNewWindow = makeFakeWin({ selectedBrowser: "win2" });

  makeFakeWin({ selectedBrowser: "win2" });

  let showInfobarStub = sandbox.stub(InfoBar, "showInfoBarMessage").resolves();
  InfoBar.observe(fakeNewWindow, "domwindowopened");
  Assert.ok(
    showInfobarStub.calledOnce,
    "New window should receive the universal infobar"
  );

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function test_universalInfobar_skips_popup_window() {
  const sandbox = sinon.createSandbox();
  const popupWin = makeFakeWin({
    toolbarVisible: false, // Simulate a popup window
    selectedBrowser: "popup-win",
  });

  const dispatch = sandbox.stub();
  const infobar = await InfoBar.showInfoBarMessage(
    popupWin.gBrowser.selectedBrowser,
    UNIVERSAL_MESSAGE,
    dispatch
  );

  Assert.equal(infobar, null, "Infobar not shown in popup window");
  Assert.equal(dispatch.callCount, 0, "No impression sent");

  // Cleanup
  cleanupInfobars();
  sandbox.restore();
});

add_task(async function test_universalInfobar_skips_taskbar_window() {
  const sandbox = sinon.createSandbox();
  const win = BrowserWindowTracker.getTopWindow();
  win.document.documentElement.setAttribute("taskbartab", "");

  const dispatch = sandbox.stub();
  const infobar = await InfoBar.showInfoBarMessage(
    win.gBrowser.selectedBrowser,
    UNIVERSAL_MESSAGE,
    dispatch
  );

  Assert.equal(infobar, null, "Infobar not visible for taskbar-tab window");
  Assert.equal(dispatch.callCount, 0, "No impression sent");

  win.document.documentElement.removeAttribute("taskbartab");
  cleanupInfobars();
  sandbox.restore();
});
