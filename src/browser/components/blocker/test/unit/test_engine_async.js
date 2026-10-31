/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

function createEngine() {
  return Cc["@astian.org/midori-blocker-engine;1"].createInstance(
    Ci.nsIMidoriBlockerEngine
  );
}

function check(engine, hostname) {
  return engine.checkRequestFast(
    `https://${hostname}/ad.js`,
    "publisher.example",
    hostname,
    "script",
    "GET",
    true
  );
}

add_task(async function test_async_build_and_binary_cache_round_trip() {
  const engine = createEngine();
  let dispatched = false;
  Services.tm.dispatchToMainThread(() => { dispatched = true; });
  await engine.initFromListsAsync([
    "||ads.example^\n@@||allowed.ads.example^\nexample.com##.ad",
  ]);
  Assert.ok(dispatched, "Building filters allows the main event loop to run");
  Assert.equal(check(engine, "ads.example"), "B");
  Assert.equal(check(engine, "allowed.ads.example"), "E");

  const cache = engine.serialize();
  Assert.ok(cache instanceof Uint8Array, "Cache bytes use a typed array");
  const restored = createEngine();
  await restored.initFromCacheAsync(cache);
  Assert.equal(check(restored, "ads.example"), "B");
  Assert.equal(check(restored, "allowed.ads.example"), "E");
  Assert.deepEqual(
    JSON.parse(restored.getCosmeticResources("https://example.com/")),
    JSON.parse(engine.getCosmeticResources("https://example.com/")),
    "Cosmetic rules survive background construction and cache restoration"
  );
});

add_task(async function test_failed_cache_keeps_the_working_engine() {
  const engine = createEngine();
  await engine.initFromListsAsync(["||ads.example^"]);
  await Assert.rejects(
    engine.initFromCacheAsync(new Uint8Array([1, 2, 3])),
    /NS_ERROR_FAILURE/
  );
  Assert.equal(check(engine, "ads.example"), "B");
});

add_task(async function test_newer_initialization_supersedes_background_work() {
  const engine = createEngine();
  const pending = engine.initFromListsAsync(["||old.example^"]);
  const rejected = Assert.rejects(pending, /NS_ERROR_ABORT/);
  engine.initFromLists(["||new.example^"]);
  await rejected;
  Assert.equal(check(engine, "new.example"), "B");
  Assert.equal(check(engine, "old.example"), "");
});
