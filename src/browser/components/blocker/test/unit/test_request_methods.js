/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const ENGINE_CONTRACT_ID = "@astian.org/midori-blocker-engine;1";

function checkRequest(engine, requestMethod) {
  return JSON.parse(
    engine.checkRequestDetailed(
      "https://ads.example/script.js",
      "publisher.example",
      "ads.example",
      "script",
      requestMethod,
      true
    )
  );
}

add_task(function test_request_method_filtering() {
  const engine = Cc[ENGINE_CONTRACT_ID].createInstance(
    Ci.nsIMidoriBlockerEngine
  );
  engine.initFromLists(["||ads.example^$method=POST"]);

  Assert.equal(
    checkRequest(engine, "GET").matched,
    false,
    "GET requests should not match a POST-only rule"
  );
  Assert.equal(
    checkRequest(engine, "POST").matched,
    true,
    "POST requests should match a POST-only rule"
  );
  Assert.equal(
    checkRequest(engine, "").matched,
    false,
    "Requests without a method should not match a method-qualified rule"
  );
});

add_task(function test_fast_request_result_avoids_json_for_simple_matches() {
  const request = (engine, method = "GET") =>
    engine.checkRequestFast(
      "https://ads.example/script.js",
      "publisher.example",
      "ads.example",
      "script",
      method,
      true
    );

  const blockingEngine = Cc[ENGINE_CONTRACT_ID].createInstance(
    Ci.nsIMidoriBlockerEngine
  );
  blockingEngine.initFromLists(["||ads.example^"]);
  Assert.equal(request(blockingEngine), "B", "A simple block uses one byte");

  const importantEngine = Cc[ENGINE_CONTRACT_ID].createInstance(
    Ci.nsIMidoriBlockerEngine
  );
  importantEngine.initFromLists(["||ads.example^$important"]);
  Assert.equal(
    request(importantEngine),
    "I",
    "An important block uses one byte"
  );

  const exceptionEngine = Cc[ENGINE_CONTRACT_ID].createInstance(
    Ci.nsIMidoriBlockerEngine
  );
  exceptionEngine.initFromLists(["||ads.example^", "@@||ads.example^"]);
  Assert.equal(request(exceptionEngine), "E", "An exception uses one byte");

  const allowEngine = Cc[ENGINE_CONTRACT_ID].createInstance(
    Ci.nsIMidoriBlockerEngine
  );
  allowEngine.initFromLists(["||other.example^"]);
  Assert.equal(request(allowEngine), "", "An allowed request allocates no JSON");
});
