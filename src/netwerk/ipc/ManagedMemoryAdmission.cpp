/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "ManagedMemoryAdmission.h"

#include "mozilla/Services.h"
#include "mozilla/dom/CanonicalBrowsingContext.h"
#include "nsError.h"
#include "nsHashPropertyBag.h"
#include "nsIChannel.h"
#include "nsIObserverService.h"
#include "nsISimpleEnumerator.h"
#include "nsITimer.h"
#include "nsIURI.h"
#include "nsThreadUtils.h"

namespace mozilla::net {

static constexpr char kMemoryAdmissionTopic[] = "midori-memory-admission";

ManagedMemoryAdmissionRequest::ManagedMemoryAdmissionRequest(uint64_t aId)
    : mPromise(new MemoryAdmissionPromise::Private(__func__)) {
  mId.AppendInt(aId);
}

ManagedMemoryAdmissionRequest::~ManagedMemoryAdmissionRequest() {
  MOZ_ASSERT(mSettled);
}

RefPtr<ManagedMemoryAdmissionRequest>
ManagedMemoryAdmissionRequest::MaybeCreate(
    dom::CanonicalBrowsingContext* aContext, nsIURI* aURI,
    nsIChannel* aChannel) {
  MOZ_ASSERT(NS_IsMainThread());
  if (!aContext || !aContext->IsTop() || !aURI) {
    return nullptr;
  }
  nsCOMPtr<nsIObserverService> observers = services::GetObserverService();
  if (!observers || !observers->HasObservers(kMemoryAdmissionTopic)) {
    return nullptr;
  }
  if (aURI->SchemeIs("about") || aURI->SchemeIs("chrome") ||
      aURI->SchemeIs("resource") || aURI->SchemeIs("javascript")) {
    return nullptr;
  }
  nsCOMPtr<nsISimpleEnumerator> activeObservers;
  bool hasActiveObservers = false;
  if (NS_FAILED(observers->EnumerateObservers(
          kMemoryAdmissionTopic, getter_AddRefs(activeObservers))) ||
      !activeObservers ||
      NS_FAILED(activeObservers->HasMoreElements(&hasActiveObservers)) ||
      !hasActiveObservers) {
    return nullptr;
  }
  static uint64_t nextId = 0;
  RefPtr<ManagedMemoryAdmissionRequest> request =
      new ManagedMemoryAdmissionRequest(++nextId);
  WeakPtr<ManagedMemoryAdmissionRequest> weak = request.get();
  nsCOMPtr<nsIWritablePropertyBag2> subject = new nsHashPropertyBag();
  subject->SetPropertyAsAString(u"id"_ns, request->mId);
  subject->SetPropertyAsUint64(u"browsingContextId"_ns, aContext->Id());
  nsCOMPtr<nsIIdentChannel> identified = do_QueryInterface(aChannel);
  subject->SetPropertyAsUint64(u"channelId"_ns,
                               identified ? identified->ChannelId() : 0);
  subject->SetPropertyAsBool(u"required"_ns, false);
  subject->SetPropertyAsBool(u"waitForBudget"_ns, false);
  nsCOMPtr<nsIRunnable> allow =
      NS_NewRunnableFunction("ManagedMemoryAdmission::Allow", [weak] {
        if (weak) weak->Finish(NS_OK);
      });
  nsCOMPtr<nsIRunnable> deny =
      NS_NewRunnableFunction("ManagedMemoryAdmission::Deny", [weak] {
        if (weak) weak->Finish(NS_ERROR_NOT_AVAILABLE);
      });
  subject->SetPropertyAsInterface(u"allow"_ns, allow);
  subject->SetPropertyAsInterface(u"deny"_ns, deny);
  nsresult rv =
      observers->NotifyObservers(subject, kMemoryAdmissionTopic, u"request");
  if (!request->mSettled) {
    subject->GetPropertyAsBool(u"required"_ns, &request->mRequired);
    subject->GetPropertyAsBool(u"waitForBudget"_ns, &request->mWaitForBudget);
    if (NS_FAILED(rv)) {
      request->Finish(request->mRequired ? NS_ERROR_NOT_AVAILABLE : NS_OK);
    } else {
      request->ArmDeadline();
    }
  }
  if (request->mSettled && request->mAdmitted) return nullptr;
  return request;
}

void ManagedMemoryAdmissionRequest::ArmDeadline() {
  if (mWaitForBudget) return;
  mTimer = NS_NewTimer();
  if (!mTimer ||
      NS_FAILED(mTimer->InitWithNamedFuncCallback(
          [](nsITimer*, void* aClosure) {
            RefPtr<ManagedMemoryAdmissionRequest> request =
                static_cast<ManagedMemoryAdmissionRequest*>(aClosure);
            request->Finish(request->mRequired ? NS_ERROR_NOT_AVAILABLE
                                               : NS_OK);
          },
          this, 10000, nsITimer::TYPE_ONE_SHOT,
          "ManagedMemoryAdmission::Deadline"_ns))) {
    Finish(mRequired ? NS_ERROR_NOT_AVAILABLE : NS_OK);
  }
}

void ManagedMemoryAdmissionRequest::Cancel() { Finish(NS_BINDING_ABORTED); }

void ManagedMemoryAdmissionRequest::Finish(nsresult aStatus) {
  MOZ_ASSERT(NS_IsMainThread());
  if (mSettled) return;
  RefPtr<ManagedMemoryAdmissionRequest> self = this;
  mSettled = true;
  mAdmitted = NS_SUCCEEDED(aStatus);
  if (mTimer) mTimer->Cancel();
  mTimer = nullptr;
  if (NS_SUCCEEDED(aStatus)) {
    mPromise->Resolve(true, __func__);
  } else {
    mPromise->Reject(aStatus, __func__);
  }
  nsCOMPtr<nsIObserverService> observers = services::GetObserverService();
  if (observers) {
    nsCOMPtr<nsIWritablePropertyBag2> subject = new nsHashPropertyBag();
    subject->SetPropertyAsAString(u"id"_ns, mId);
    subject->SetPropertyAsBool(u"admitted"_ns, mAdmitted);
    observers->NotifyObservers(subject, kMemoryAdmissionTopic, u"settled");
  }
}

}  // namespace mozilla::net
