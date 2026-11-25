/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_ManagedMemoryAdmission_h
#define mozilla_net_ManagedMemoryAdmission_h

#include "mozilla/MozPromise.h"
#include "mozilla/WeakPtr.h"
#include "nsCOMPtr.h"
#include "nsISupportsImpl.h"
#include "nsString.h"

class nsITimer;
class nsIChannel;
class nsIURI;

namespace mozilla::dom {
class CanonicalBrowsingContext;
}

namespace mozilla::net {

using MemoryAdmissionPromise = MozPromise<bool, nsresult, true>;

class ManagedMemoryAdmissionRequest final : public SupportsWeakPtr {
 public:
  NS_INLINE_DECL_REFCOUNTING(ManagedMemoryAdmissionRequest)

  explicit ManagedMemoryAdmissionRequest(uint64_t aId);
  static RefPtr<ManagedMemoryAdmissionRequest> MaybeCreate(
      dom::CanonicalBrowsingContext* aContext, nsIURI* aURI,
      nsIChannel* aChannel);

  RefPtr<MemoryAdmissionPromise> Promise() const { return mPromise; }
  void Cancel();

 private:
  ~ManagedMemoryAdmissionRequest();
  void Finish(nsresult aStatus);
  void ArmDeadline();

  nsString mId;
  RefPtr<MemoryAdmissionPromise::Private> mPromise;
  nsCOMPtr<nsITimer> mTimer;
  bool mSettled = false;
  bool mAdmitted = false;
  bool mRequired = false;
  bool mWaitForBudget = false;
};

}  // namespace mozilla::net

#endif
