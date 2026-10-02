/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MidoriSyncCrypto_h
#define MidoriSyncCrypto_h

#include "mozilla/RefPtr.h"
#include "nsCOMPtr.h"
#include "nsIMidoriSyncCrypto.h"
#include "nsIObserver.h"
#include "nsWeakReference.h"

class nsISerialEventTarget;

class MidoriSyncCrypto final : public nsIMidoriSyncCrypto,
                               public nsIObserver,
                               public nsSupportsWeakReference {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIMIDORISYNCCRYPTO
  NS_DECL_NSIOBSERVER

  MidoriSyncCrypto();
  nsresult Init();

 private:
  ~MidoriSyncCrypto();
  struct State;
  struct Request;
  nsresult Dispatch(Request&& aRequest, JSContext* aCx,
                    mozilla::dom::Promise** aPromise);

  RefPtr<State> mState;
  nsCOMPtr<nsISerialEventTarget> mQueue;
  uint32_t mPending = 0;
};

#endif
