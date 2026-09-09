/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { MidoriBlockerService } = ChromeUtils.importESModule(
  "resource:///modules/MidoriBlockerService.sys.mjs"
);

add_task(async function test_expensive_category_lookup_waits_for_panel_request() {
  const browserId = 42;
  const originalClassifier =
    MidoriBlockerService._classifyDomainViaTrackingTables;
  let classifierCalls = 0;
  MidoriBlockerService._classifyDomainViaTrackingTables = async () => {
    classifierCalls++;
    return "trackers";
  };

  try {
    MidoriBlockerService.incrementBlockedCount(browserId, {
      hostname: "ads.example.com",
      isPrivate: true,
      requestType: "script",
    });

    Assert.equal(classifierCalls, 0, "The network path should only do cheap accounting");
    Assert.deepEqual(
      MidoriBlockerService.getBlockedStats(browserId).counts,
      { ads: 1, trackers: 0, popups: 0 },
      "Unclassified requests use the cheap initial category"
    );

    await MidoriBlockerService.prepareBlockedStats(browserId);
    Assert.equal(classifierCalls, 1, "Opening the panel requests detailed classification");
    Assert.deepEqual(
      MidoriBlockerService.getBlockedStats(browserId).counts,
      { ads: 0, trackers: 1, popups: 0 },
      "Detailed categories replace the initial estimate"
    );
  } finally {
    MidoriBlockerService._classifyDomainViaTrackingTables = originalClassifier;
    MidoriBlockerService.resetBlockedCount(browserId);
  }
});
