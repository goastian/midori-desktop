/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const ENGINE_CONTRACT_ID = "@astian.org/midori-blocker-engine;1";

function createEngine(rules) {
  const engine = Cc[ENGINE_CONTRACT_ID].createInstance(
    Ci.nsIMidoriBlockerEngine
  );
  engine.initFromLists([rules.join("\n")]);
  return engine;
}

function directivesFor(engine, url = "https://cdn.example/data.js") {
  return JSON.parse(
    engine.getReplaceDirectives(
      url,
      "publisher.example",
      "cdn.example",
      "script",
      "GET",
      true
    )
  );
}

add_task(function test_replace_directive_matches_in_native_engine() {
  const directive = "/advertisement/content/g";
  const engine = createEngine([
    `||cdn.example^$script,replace=${directive}`,
  ]);

  Assert.deepEqual(
    directivesFor(engine),
    [directive],
    "The native engine should return a matching replace directive"
  );
  Assert.deepEqual(
    directivesFor(engine, "https://other.example/data.js"),
    [],
    "A replace directive should not apply to a different hostname"
  );
});

add_task(function test_replace_backreference_and_escaped_comma_survive_parser() {
  const directive = "/(ad\\,unit)-(\\d+)/$2-$1/g";
  const engine = createEngine([
    `||cdn.example^$script,1p,replace=${directive}`,
  ]);

  Assert.deepEqual(
    JSON.parse(
      engine.getReplaceDirectives(
        "https://cdn.example/data.js",
        "cdn.example",
        "cdn.example",
        "script",
        "GET",
        false
      )
    ),
    [directive],
    "Replacement backreferences and escaped commas should remain intact"
  );
});

add_task(function test_replace_exception_disables_matching_directive() {
  const directive = "/advertisement/content/g";
  const engine = createEngine([
    `||cdn.example^$script,replace=${directive}`,
    `@@||cdn.example^$script,replace=${directive}`,
  ]);

  Assert.deepEqual(
    directivesFor(engine),
    [],
    "An exact replace exception should suppress the directive"
  );
});

add_task(function test_empty_replace_exception_disables_all_directives() {
  const engine = createEngine([
    "||cdn.example^$script,replace=/first/one/g",
    "||cdn.example^$script,replace=/second/two/g",
    "@@||cdn.example^$script,replace",
  ]);

  Assert.deepEqual(
    directivesFor(engine),
    [],
    "An empty matching replace exception should suppress all directives"
  );
});

add_task(function test_replace_directives_survive_serialization() {
  const directive = "/advertisement/content/g";
  const engine = createEngine([
    `||cdn.example^$script,replace=${directive}`,
  ]);
  const restored = Cc[ENGINE_CONTRACT_ID].createInstance(
    Ci.nsIMidoriBlockerEngine
  );
  restored.initFromCache(engine.serialize());

  Assert.deepEqual(
    directivesFor(restored),
    [directive],
    "Replace directives should survive the engine cache round trip"
  );
});
