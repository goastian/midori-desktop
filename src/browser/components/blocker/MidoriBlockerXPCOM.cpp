/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MidoriBlockerXPCOM.h"

#include "mozilla/JSONStringWriteFuncs.h"
#include "mozilla/RefPtr.h"
#include "mozilla/Span.h"
#include "nsError.h"
#include "nsImportModule.h"

using mozilla::JSONStringRefWriteFunc;
using mozilla::JSONWriter;
using mozilla::MakeStringSpan;

NS_IMPL_ISUPPORTS(MidoriBlockerContentPolicy, nsIContentPolicy)
NS_IMPL_ISUPPORTS(MidoriBlockerXPCOM, nsIMidoriBlockerEngine)

namespace {

void WriteCheckResultJSON(nsACString& aOutJSON, bool aMatched, bool aImportant,
                          const nsCString& aRedirect,
                          const nsCString& aRewrittenUrl, bool aException) {
  aOutJSON.Truncate();

  JSONStringRefWriteFunc jsonOut(aOutJSON);
  JSONWriter writer(jsonOut, JSONWriter::CollectionStyle::SingleLineStyle);

  writer.Start();
  writer.BoolProperty("matched", aMatched);
  writer.BoolProperty("important", aImportant);
  writer.StringProperty("redirect", MakeStringSpan(aRedirect.get()));
  writer.StringProperty("rewrittenUrl", MakeStringSpan(aRewrittenUrl.get()));
  writer.BoolProperty("exception", aException);
  writer.End();
}

void WriteFastCheckResult(nsACString& aOut, bool aMatched, bool aImportant,
                          const nsCString& aRedirect,
                          const nsCString& aRewrittenUrl,
                          const nsCString& aException) {
  if (aRedirect.IsEmpty() && aRewrittenUrl.IsEmpty()) {
    if (!aException.IsEmpty() && !aMatched && !aImportant) {
      aOut.AssignLiteral("E");
      return;
    }
    if (aMatched && aException.IsEmpty()) {
      if (aImportant) {
        aOut.AssignLiteral("I");
      } else {
        aOut.AssignLiteral("B");
      }
      return;
    }
    if (!aImportant && aException.IsEmpty()) {
      aOut.Truncate();
      return;
    }
  }

  WriteCheckResultJSON(aOut, aMatched, aImportant, aRedirect, aRewrittenUrl,
                       !aException.IsEmpty());
}

// The Rust side registers a global domain resolver backed by the eTLD
// service. Upstream initializes it from its own engine wrapper; the blocker
// engine has to do the same before the first engine is created.
bool EnsureDomainResolver() {
  static bool sInitialized = false;
  if (!sInitialized &&
      NS_SUCCEEDED(content_classifier_initialize_domain_resolver())) {
    sInitialized = true;
  }
  return sInitialized;
}

}  // namespace

MidoriBlockerContentPolicy::MidoriBlockerContentPolicy() = default;

MidoriBlockerContentPolicy::~MidoriBlockerContentPolicy() = default;

nsIMidoriBlockerContentPolicyBridge*
MidoriBlockerContentPolicy::GetBridge() {
  if (mBridge) {
    return mBridge;
  }

  nsresult rv;
  mBridge =
      do_ImportESModule("resource:///modules/MidoriBlockerService.sys.mjs",
                        "MidoriBlockerService", &rv);
  if (NS_FAILED(rv)) {
    mBridge = nullptr;
  }

  return mBridge;
}

NS_IMETHODIMP
MidoriBlockerContentPolicy::ShouldLoad(nsIURI* aContentLocation,
                                         nsILoadInfo* aLoadInfo,
                                         int16_t* aDecision) {
  NS_ENSURE_ARG_POINTER(aDecision);

  *aDecision = nsIContentPolicy::ACCEPT;

  if (!aContentLocation || !aLoadInfo) {
    return NS_OK;
  }

  nsIMidoriBlockerContentPolicyBridge* bridge = GetBridge();
  if (!bridge) {
    return NS_OK;
  }

  nsresult rv = bridge->ShouldLoad(aContentLocation, aLoadInfo, aDecision);
  if (NS_FAILED(rv)) {
    *aDecision = nsIContentPolicy::ACCEPT;
  }

  return NS_OK;
}

NS_IMETHODIMP
MidoriBlockerContentPolicy::ShouldProcess(nsIURI* /* aContentLocation */,
                                            nsILoadInfo* /* aLoadInfo */,
                                            int16_t* aDecision) {
  NS_ENSURE_ARG_POINTER(aDecision);

  *aDecision = nsIContentPolicy::ACCEPT;
  return NS_OK;
}

MidoriBlockerXPCOM::MidoriBlockerXPCOM() = default;

MidoriBlockerXPCOM::~MidoriBlockerXPCOM() { ResetEngine(nullptr); }

void MidoriBlockerXPCOM::ResetEngine(ContentClassifierFFIEngine* aEngine) {
  if (mEngine) {
    content_classifier_engine_destroy(mEngine);
  }
  mEngine = aEngine;
}

NS_IMETHODIMP
MidoriBlockerXPCOM::InitFromLists(const nsTArray<nsCString>& aFilterLists) {
  NS_ENSURE_TRUE(!aFilterLists.IsEmpty(), NS_ERROR_INVALID_ARG);
  NS_ENSURE_TRUE(EnsureDomainResolver(), NS_ERROR_NOT_AVAILABLE);

  ContentClassifierFFIEngine* engine = nullptr;
  nsresult rv = content_classifier_engine_from_rules(&aFilterLists, &engine);
  NS_ENSURE_SUCCESS(rv, rv);

  ResetEngine(engine);
  return NS_OK;
}

NS_IMETHODIMP
MidoriBlockerXPCOM::InitFromCache(const nsTArray<uint8_t>& aCacheData) {
  NS_ENSURE_TRUE(EnsureDomainResolver(), NS_ERROR_NOT_AVAILABLE);

  ContentClassifierFFIEngine* engine = nullptr;
  nsresult rv = content_classifier_engine_deserialize(&engine, &aCacheData);
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ENSURE_TRUE(engine, NS_ERROR_FAILURE);

  ResetEngine(engine);
  return NS_OK;
}

// Returns JSON: { matched, important, redirect, rewrittenUrl, exception }.
NS_IMETHODIMP
MidoriBlockerXPCOM::CheckRequestDetailed(
    const nsACString& aUrl, const nsACString& aSourceHostname,
    const nsACString& aHostname, const nsACString& aRequestType,
    const nsACString& aRequestMethod, bool aIsThirdParty, nsACString& _retval) {
  NS_ENSURE_TRUE(mEngine, NS_ERROR_NOT_INITIALIZED);

  bool matched = false;
  bool important = false;
  nsCString redirect;
  nsCString rewrittenUrl;
  nsCString exception;

  nsresult rv =
      content_classifier_engine_check_network_request_preparsed_detailed(
          mEngine, &aUrl, &aHostname, &aSourceHostname, &aRequestType,
          &aRequestMethod, aIsThirdParty, &matched, &important, &redirect,
          &rewrittenUrl, &exception);
  NS_ENSURE_SUCCESS(rv, rv);

  WriteCheckResultJSON(_retval, matched, important, redirect, rewrittenUrl,
                       !exception.IsEmpty());
  return NS_OK;
}

NS_IMETHODIMP
MidoriBlockerXPCOM::CheckRequestFast(
    const nsACString& aUrl, const nsACString& aSourceHostname,
    const nsACString& aHostname, const nsACString& aRequestType,
    const nsACString& aRequestMethod, bool aIsThirdParty, nsACString& _retval) {
  NS_ENSURE_TRUE(mEngine, NS_ERROR_NOT_INITIALIZED);

  bool matched = false;
  bool important = false;
  nsCString redirect;
  nsCString rewrittenUrl;
  nsCString exception;

  nsresult rv =
      content_classifier_engine_check_network_request_preparsed_detailed(
          mEngine, &aUrl, &aHostname, &aSourceHostname, &aRequestType,
          &aRequestMethod, aIsThirdParty, &matched, &important, &redirect,
          &rewrittenUrl, &exception);
  NS_ENSURE_SUCCESS(rv, rv);

  WriteFastCheckResult(_retval, matched, important, redirect, rewrittenUrl,
                       exception);
  return NS_OK;
}

// Returns an empty string when no directives apply.
NS_IMETHODIMP
MidoriBlockerXPCOM::GetCspDirectives(
    const nsACString& aUrl, const nsACString& aSourceHostname,
    const nsACString& aHostname, const nsACString& aRequestType,
    const nsACString& aRequestMethod, bool aIsThirdParty, nsACString& _retval) {
  _retval.Truncate();

  NS_ENSURE_TRUE(mEngine, NS_ERROR_NOT_INITIALIZED);

  nsCString directives;
  nsresult rv = content_classifier_engine_get_csp_directives_preparsed(
      mEngine, &aUrl, &aHostname, &aSourceHostname, &aRequestType,
      &aRequestMethod, aIsThirdParty, &directives);
  NS_ENSURE_SUCCESS(rv, rv);

  _retval.Assign(directives);
  return NS_OK;
}

NS_IMETHODIMP
MidoriBlockerXPCOM::GetReplaceDirectives(
    const nsACString& aUrl, const nsACString& aSourceHostname,
    const nsACString& aHostname, const nsACString& aRequestType,
    const nsACString& aRequestMethod, bool aIsThirdParty, nsACString& _retval) {
  _retval.Truncate();

  NS_ENSURE_TRUE(mEngine, NS_ERROR_NOT_INITIALIZED);

  nsCString directivesJson;
  nsresult rv = content_classifier_engine_get_replace_directives_preparsed(
      mEngine, &aUrl, &aHostname, &aSourceHostname, &aRequestType,
      &aRequestMethod, aIsThirdParty, &directivesJson);
  NS_ENSURE_SUCCESS(rv, rv);

  _retval.Assign(directivesJson);
  return NS_OK;
}

NS_IMETHODIMP
MidoriBlockerXPCOM::Serialize(nsTArray<uint8_t>& _retval) {
  _retval.Clear();

  NS_ENSURE_TRUE(mEngine, NS_ERROR_NOT_INITIALIZED);
  return content_classifier_engine_serialize(mEngine, &_retval);
}

NS_IMETHODIMP
MidoriBlockerXPCOM::GetCosmeticResources(const nsACString& aUrl,
                                           nsACString& _retval) {
  _retval.Truncate();

  NS_ENSURE_TRUE(mEngine, NS_ERROR_NOT_INITIALIZED);

  nsCString outJson;
  nsresult rv = content_classifier_engine_url_cosmetic_resources(mEngine, &aUrl,
                                                                 &outJson);
  NS_ENSURE_SUCCESS(rv, rv);

  _retval.Assign(outJson);
  return NS_OK;
}

NS_IMETHODIMP
MidoriBlockerXPCOM::GetHiddenClassIdSelectors(
    const nsACString& aClassesJson, const nsACString& aIdsJson,
    const nsACString& aExceptionsJson, nsACString& _retval) {
  _retval.Truncate();

  NS_ENSURE_TRUE(mEngine, NS_ERROR_NOT_INITIALIZED);

  nsCString outJson;
  nsresult rv = content_classifier_engine_hidden_class_id_selectors(
      mEngine, &aClassesJson, &aIdsJson, &aExceptionsJson, &outJson);
  NS_ENSURE_SUCCESS(rv, rv);

  _retval.Assign(outJson);
  return NS_OK;
}

NS_IMETHODIMP
MidoriBlockerXPCOM::UseResources(const nsACString& aResourcesJson) {
  NS_ENSURE_TRUE(mEngine, NS_ERROR_NOT_INITIALIZED);
  return content_classifier_engine_use_resources(mEngine, &aResourcesJson);
}

// Follows nsIUrlClassifierDBService: components.conf maps CID/contract here,
// this allocates the implementation and returns the requested interface.
extern "C" nsresult midori_blocker_xpcom_constructor(REFNSIID aIID,
                                                       void** aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = nullptr;

  RefPtr<MidoriBlockerXPCOM> blocker = new MidoriBlockerXPCOM();
  return blocker->QueryInterface(aIID, aResult);
}
