/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests that rich suggestion results are ordered in the
 * same order they were returned from the API.
 */

const SUGGEST_ENABLED_PREF = "browser.search.suggest.enabled";
const RICH_SUGGESTIONS_PREF = "browser.urlbar.richSuggestions.featureGate";

const QUICKACTIONS_URLBAR_PREF = "quickactions.enabled";

add_setup(async function () {
  let engine = await addTestTailSuggestionsEngine(defaultRichSuggestionsFn);

  // Install the test engine.
  let oldDefaultEngine = await Services.search.getDefault();
  registerCleanupFunction(async () => {
    Services.search.setDefault(
      oldDefaultEngine,
      Ci.nsISearchService.CHANGE_REASON_UNKNOWN
    );
    Services.prefs.clearUserPref(RICH_SUGGESTIONS_PREF);
    Services.prefs.clearUserPref(SUGGEST_ENABLED_PREF);
    UrlbarPrefs.clear(QUICKACTIONS_URLBAR_PREF);
  });
  Services.search.setDefault(engine, Ci.nsISearchService.CHANGE_REASON_UNKNOWN);
  Services.prefs.setBoolPref(RICH_SUGGESTIONS_PREF, true);
  Services.prefs.setBoolPref(SUGGEST_ENABLED_PREF, true);
  UrlbarPrefs.set(QUICKACTIONS_URLBAR_PREF, false);
});

/**
 * Tests that non-tail suggestion providers still return results correctly when
 * the tailSuggestions pref is enabled.
 */
add_task(async function test_richsuggestions_order() {
  const query = "what time is it in t";
  let context = createContext(query, { isPrivate: false });

  let defaultRichResult = {
    engineName: TAIL_SUGGESTIONS_ENGINE_NAME,
    isRichSuggestion: true,
  };

  await check_results({
    context,
    matches: [
      makeSearchResult(context, {
        engineName: TAIL_SUGGESTIONS_ENGINE_NAME,
        heuristic: true,
      }),
      makeSearchResult(
        context,
        Object.assign(defaultRichResult, {
          suggestion: query + "oronto",
        })
      ),
      makeSearchResult(context, {
        engineName: TAIL_SUGGESTIONS_ENGINE_NAME,
        suggestion: query + "unisia",
      }),
      makeSearchResult(
        context,
        Object.assign(defaultRichResult, {
          suggestion: query + "acoma",
        })
      ),
      makeSearchResult(context, {
        engineName: TAIL_SUGGESTIONS_ENGINE_NAME,
        suggestion: query + "aipei",
      }),
    ],
  });
});
