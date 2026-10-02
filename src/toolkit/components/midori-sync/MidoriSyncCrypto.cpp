/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MidoriSyncCrypto.h"

#include "IHistory.h"
#include "midori_sync_ffi.h"
#include "mozilla/Atomics.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/MozPromise.h"
#include "mozilla/Services.h"
#include "mozilla/Span.h"
#include "mozilla/UniquePtr.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/dom/ScriptSettings.h"
#include "mozilla/dom/TypedArray.h"
#include "nsIObserverService.h"
#include "nsIURI.h"
#include "nsNetUtil.h"
#include "nsISerialEventTarget.h"
#include "nsServiceManagerUtils.h"
#include "nsString.h"
#include "nsThreadUtils.h"
#include "xpcpublic.h"

using namespace mozilla;
using namespace mozilla::dom;

namespace {

constexpr uint32_t kMaxPending = 8;

struct BufferDeleter {
  void operator()(MidoriSyncBuffer* aBuffer) const {
    midori_sync_buffer_free(aBuffer);
  }
};
struct KeyringDeleter {
  void operator()(MidoriSyncKeyring* aKeyring) const {
    midori_sync_keyring_free(aKeyring);
  }
};
using SyncBuffer = UniquePtr<MidoriSyncBuffer, BufferDeleter>;
using Keyring = UniquePtr<MidoriSyncKeyring, KeyringDeleter>;

enum class Operation {
  ForgetKey,
  GenerateNative,
  RecoverNative,
  NativeKeyId,
  SealNative,
  OpenNative,
  WrapNative,
  ProcessBookmark,
  ProcessHistory,
  ProcessPassword
};

struct WorkResult {
  uint32_t mKeyId = 0;
  SyncBuffer mBytes;
};
using WorkPromise = MozPromise<WorkResult, nsresult, true>;

nsresult ToResult(MidoriSyncStatus aStatus) {
  switch (aStatus) {
    case MidoriSyncStatus::Ok:
      return NS_OK;
    case MidoriSyncStatus::InvalidInput:
      return NS_ERROR_INVALID_ARG;
    case MidoriSyncStatus::AuthenticationFailed:
      return NS_ERROR_DOM_OPERATION_ERR;
    case MidoriSyncStatus::UnknownKey:
      return NS_ERROR_NOT_AVAILABLE;
    case MidoriSyncStatus::Capacity:
      return NS_ERROR_DOM_QUOTA_EXCEEDED_ERR;
    case MidoriSyncStatus::CryptoFailure:
      return NS_ERROR_FAILURE;
    case MidoriSyncStatus::UnsupportedVersion:
      return NS_ERROR_DOM_NOT_SUPPORTED_ERR;
  }
  return NS_ERROR_FAILURE;
}

}  // namespace

struct MidoriSyncCrypto::State {
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(State)
  Atomic<bool> mClosed{false};
  Keyring mKeyring{midori_sync_keyring_new()};

 private:
  ~State() = default;
};

struct MidoriSyncCrypto::Request {
  explicit Request(Operation aOperation) : mOperation(aOperation) {}

  Operation mOperation;
  uint32_t mKeyId = 0;
  uint32_t mPurpose = 0;
  SyncBuffer mSecret;
  nsCString mText;
  nsCString mMetadata;
};

NS_IMPL_ISUPPORTS(MidoriSyncCrypto, nsIMidoriSyncCrypto, nsIObserver,
                  nsISupportsWeakReference)

MidoriSyncCrypto::MidoriSyncCrypto() : mState(MakeRefPtr<State>()) {
  MOZ_ASSERT(NS_IsMainThread());
}

MidoriSyncCrypto::~MidoriSyncCrypto() { MOZ_ASSERT(NS_IsMainThread()); }

nsresult MidoriSyncCrypto::Init() {
  MOZ_ASSERT(NS_IsMainThread());
  nsCOMPtr<nsIObserverService> observers = services::GetObserverService();
  NS_ENSURE_TRUE(observers, NS_ERROR_NOT_AVAILABLE);
  nsresult rv = observers->AddObserver(this, "profile-before-change", true);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = observers->AddObserver(this, "xpcom-shutdown", true);
  if (NS_FAILED(rv)) {
    observers->RemoveObserver(this, "profile-before-change");
  }
  return rv;
}

NS_IMETHODIMP MidoriSyncCrypto::Observe(nsISupports*, const char*,
                                        const char16_t*) {
  return Close();
}

NS_IMETHODIMP MidoriSyncCrypto::Close() {
  MOZ_ASSERT(NS_IsMainThread());
  if (mState->mClosed.exchange(true)) {
    return NS_OK;
  }
  if (nsCOMPtr<nsIObserverService> observers = services::GetObserverService()) {
    observers->RemoveObserver(this, "profile-before-change");
    observers->RemoveObserver(this, "xpcom-shutdown");
  }
  if (!mPending) {
    mState->mKeyring.reset();
  }
  return NS_OK;
}

nsresult MidoriSyncCrypto::Dispatch(Request&& aRequest, JSContext* aCx,
                                    Promise** aPromise) {
  MOZ_ASSERT(NS_IsMainThread());
  NS_ENSURE_ARG_POINTER(aCx);
  NS_ENSURE_ARG_POINTER(aPromise);
  *aPromise = nullptr;
  NS_ENSURE_FALSE(mState->mClosed, NS_ERROR_NOT_AVAILABLE);
  NS_ENSURE_TRUE(mPending < kMaxPending, NS_ERROR_IN_PROGRESS);
  if (!mQueue) {
    nsresult rv = NS_CreateBackgroundTaskQueue("MidoriSyncCrypto",
                                               getter_AddRefs(mQueue));
    NS_ENSURE_SUCCESS(rv, rv);
  }
  nsIGlobalObject* global = xpc::CurrentNativeGlobal(aCx);
  NS_ENSURE_TRUE(global, NS_ERROR_UNEXPECTED);
  ErrorResult error;
  RefPtr<Promise> promise = Promise::Create(global, error);
  if (error.Failed()) {
    return error.StealNSResult();
  }
  RefPtr<WorkPromise::Private> work = new WorkPromise::Private(__func__);
  const Operation operation = aRequest.mOperation;
  RefPtr<MidoriSyncCrypto> self = this;
  ++mPending;
  work->Then(
      GetCurrentSerialEventTarget(), __func__,
      [self, promise, operation](WorkResult&& result) {
        --self->mPending;
        if (self->mState->mClosed) {
          if (!self->mPending) {
            self->mState->mKeyring.reset();
          }
          promise->MaybeReject(NS_ERROR_ABORT);
          return;
        }
        if (operation == Operation::ForgetKey) {
          promise->MaybeResolveWithUndefined();
        } else if (operation == Operation::GenerateNative ||
                   operation == Operation::RecoverNative) {
          promise->MaybeResolve(result.mKeyId);
        } else if (operation == Operation::NativeKeyId ||
                   operation == Operation::SealNative ||
                   operation == Operation::WrapNative ||
                   operation == Operation::ProcessBookmark ||
                   operation == Operation::ProcessHistory ||
                   operation == Operation::ProcessPassword) {
          nsDependentCSubstring text(
              reinterpret_cast<const char*>(
                  midori_sync_buffer_data(result.mBytes.get())),
              midori_sync_buffer_len(result.mBytes.get()));
          promise->MaybeResolve(NS_ConvertUTF8toUTF16(text));
        } else {
          AutoJSAPI jsapi;
          if (!jsapi.Init(promise->GetGlobalObject())) {
            promise->MaybeReject(NS_ERROR_FAILURE);
            return;
          }
          ErrorResult error;
          JS::Rooted<JSObject*> bytes(
              jsapi.cx(), Uint8Array::Create(
                              jsapi.cx(),
                              Span(midori_sync_buffer_data(result.mBytes.get()),
                                   midori_sync_buffer_len(result.mBytes.get())),
                              error));
          error.WouldReportJSException();
          if (error.Failed()) {
            promise->MaybeReject(std::move(error));
          } else {
            promise->MaybeResolve(bytes);
          }
        }
      },
      [self, promise](nsresult rv) {
        --self->mPending;
        if (self->mState->mClosed && !self->mPending) {
          self->mState->mKeyring.reset();
        }
        promise->MaybeReject(self->mState->mClosed ? NS_ERROR_ABORT : rv);
      });
  nsresult rv = mQueue->Dispatch(NS_NewRunnableFunction(
      "MidoriSyncCrypto::Work",
      [state = mState, request = std::move(aRequest), work]() mutable {
        MOZ_ASSERT(!NS_IsMainThread());
        if (state->mClosed) {
          state->mKeyring.reset();
          work->Reject(NS_ERROR_ABORT, __func__);
          return;
        }
        WorkResult result;
        MidoriSyncStatus status;
        const auto* text =
            reinterpret_cast<const uint8_t*>(request.mText.get());
        const auto* metadata =
            reinterpret_cast<const uint8_t*>(request.mMetadata.get());
        switch (request.mOperation) {
          case Operation::ForgetKey:
            status = midori_sync_forget(state->mKeyring.get(), request.mKeyId);
            break;
          case Operation::ProcessBookmark: {
            MidoriSyncBuffer* bytes = nullptr;
            status =
                midori_sync_process_bookmark(request.mSecret.get(), &bytes);
            result.mBytes.reset(bytes);
            break;
          }
          case Operation::ProcessHistory: {
            MidoriSyncBuffer* bytes = nullptr;
            status = midori_sync_process_history(request.mSecret.get(), &bytes);
            result.mBytes.reset(bytes);
            break;
          }
          case Operation::ProcessPassword: {
            MidoriSyncBuffer* bytes = nullptr;
            status =
                midori_sync_process_password(request.mSecret.get(), &bytes);
            result.mBytes.reset(bytes);
            break;
          }
          case Operation::GenerateNative:
            status = midori_sync_generate_native(
                state->mKeyring.get(), metadata, request.mMetadata.Length(),
                &result.mKeyId);
            break;
          case Operation::RecoverNative:
            status = midori_sync_recover_native(
                state->mKeyring.get(), request.mSecret.get(), metadata,
                request.mMetadata.Length(), text, request.mText.Length(),
                &result.mKeyId);
            break;
          case Operation::NativeKeyId:
          case Operation::SealNative:
          case Operation::OpenNative:
          case Operation::WrapNative: {
            MidoriSyncBuffer* bytes = nullptr;
            if (request.mOperation == Operation::NativeKeyId) {
              status = midori_sync_native_key_id(state->mKeyring.get(),
                                                 request.mKeyId, &bytes);
            } else if (request.mOperation == Operation::SealNative) {
              status = midori_sync_seal_native(
                  state->mKeyring.get(), request.mKeyId, request.mPurpose,
                  metadata, request.mMetadata.Length(), request.mSecret.get(),
                  &bytes);
            } else if (request.mOperation == Operation::OpenNative) {
              status = midori_sync_open_native(
                  state->mKeyring.get(), request.mKeyId, request.mPurpose,
                  metadata, request.mMetadata.Length(), text,
                  request.mText.Length(), &bytes);
            } else {
              status =
                  midori_sync_wrap_native(state->mKeyring.get(), request.mKeyId,
                                          request.mSecret.get(), &bytes);
            }
            result.mBytes.reset(bytes);
            break;
          }
        }
        request.mSecret.reset();
        if (state->mClosed) {
          state->mKeyring.reset();
          work->Reject(NS_ERROR_ABORT, __func__);
        } else if (NS_FAILED(ToResult(status))) {
          work->Reject(ToResult(status), __func__);
        } else {
          work->Resolve(std::move(result), __func__);
        }
      }));
  if (NS_FAILED(rv)) {
    work->Reject(rv, __func__);
  }
  promise.forget(aPromise);
  return NS_OK;
}

NS_IMETHODIMP MidoriSyncCrypto::ForgetKey(uint32_t aKeyId, JSContext* aCx,
                                          Promise** aPromise) {
  NS_ENSURE_TRUE(aKeyId, NS_ERROR_INVALID_ARG);
  Request request{Operation::ForgetKey};
  request.mKeyId = aKeyId;
  return Dispatch(std::move(request), aCx, aPromise);
}

NS_IMETHODIMP MidoriSyncCrypto::GenerateNativeKey(
    const nsACString& aAccountScope, JSContext* aCx, Promise** aPromise) {
  NS_ENSURE_TRUE(!aAccountScope.IsEmpty() && aAccountScope.Length() <= 8192,
                 NS_ERROR_INVALID_ARG);
  Request request{Operation::GenerateNative};
  request.mMetadata = aAccountScope;
  return Dispatch(std::move(request), aCx, aPromise);
}

NS_IMETHODIMP MidoriSyncCrypto::RecoverNativeKey(
    const nsACString& aAccountScope, const nsTArray<uint8_t>& aPassphrase,
    const nsACString& aBundle, JSContext* aCx, Promise** aPromise) {
  NS_ENSURE_TRUE(!aAccountScope.IsEmpty() && aAccountScope.Length() <= 8192 &&
                     aPassphrase.Length() >= 16 &&
                     aPassphrase.Length() <= 4096 && !aBundle.IsEmpty() &&
                     aBundle.Length() <= 2048,
                 NS_ERROR_INVALID_ARG);
  Request request{Operation::RecoverNative};
  request.mMetadata = aAccountScope;
  request.mText = aBundle;
  request.mSecret.reset(
      midori_sync_secret_copy(aPassphrase.Elements(), aPassphrase.Length()));
  return Dispatch(std::move(request), aCx, aPromise);
}

NS_IMETHODIMP MidoriSyncCrypto::NativeKeyId(uint32_t aKeyId, JSContext* aCx,
                                            Promise** aPromise) {
  NS_ENSURE_TRUE(aKeyId, NS_ERROR_INVALID_ARG);
  Request request{Operation::NativeKeyId};
  request.mKeyId = aKeyId;
  return Dispatch(std::move(request), aCx, aPromise);
}

NS_IMETHODIMP MidoriSyncCrypto::SealNative(uint32_t aKeyId, uint32_t aPurpose,
                                           const nsACString& aContext,
                                           const nsTArray<uint8_t>& aPlaintext,
                                           JSContext* aCx, Promise** aPromise) {
  NS_ENSURE_TRUE(aKeyId && aPurpose <= 1 && !aContext.IsEmpty() &&
                     aContext.Length() <= 2048 && aPlaintext.Length() <= 190000,
                 NS_ERROR_INVALID_ARG);
  Request request{Operation::SealNative};
  request.mKeyId = aKeyId;
  request.mPurpose = aPurpose;
  request.mMetadata = aContext;
  request.mSecret.reset(
      midori_sync_plaintext_copy(aPlaintext.Elements(), aPlaintext.Length()));
  return Dispatch(std::move(request), aCx, aPromise);
}

NS_IMETHODIMP MidoriSyncCrypto::OpenNative(uint32_t aKeyId, uint32_t aPurpose,
                                           const nsACString& aExpected,
                                           const nsACString& aEnvelope,
                                           JSContext* aCx, Promise** aPromise) {
  NS_ENSURE_TRUE(aKeyId && aPurpose <= 1 && !aExpected.IsEmpty() &&
                     aExpected.Length() <= 2048 && !aEnvelope.IsEmpty() &&
                     aEnvelope.Length() <= 262144,
                 NS_ERROR_INVALID_ARG);
  Request request{Operation::OpenNative};
  request.mKeyId = aKeyId;
  request.mPurpose = aPurpose;
  request.mMetadata = aExpected;
  request.mText = aEnvelope;
  return Dispatch(std::move(request), aCx, aPromise);
}

NS_IMETHODIMP MidoriSyncCrypto::WrapNativeKey(
    uint32_t aKeyId, const nsTArray<uint8_t>& aPassphrase, JSContext* aCx,
    Promise** aPromise) {
  NS_ENSURE_TRUE(
      aKeyId && aPassphrase.Length() >= 16 && aPassphrase.Length() <= 4096,
      NS_ERROR_INVALID_ARG);
  Request request{Operation::WrapNative};
  request.mKeyId = aKeyId;
  request.mSecret.reset(
      midori_sync_secret_copy(aPassphrase.Elements(), aPassphrase.Length()));
  return Dispatch(std::move(request), aCx, aPromise);
}

NS_IMETHODIMP MidoriSyncCrypto::ProcessBookmark(
    const nsTArray<uint8_t>& aRequest, JSContext* aCx, Promise** aPromise) {
  NS_ENSURE_TRUE(!aRequest.IsEmpty() && aRequest.Length() <= 524288,
                 NS_ERROR_INVALID_ARG);
  Request request{Operation::ProcessBookmark};
  request.mSecret.reset(midori_sync_bookmark_request_copy(aRequest.Elements(),
                                                          aRequest.Length()));
  return Dispatch(std::move(request), aCx, aPromise);
}

NS_IMETHODIMP MidoriSyncCrypto::ProcessHistory(
    const nsTArray<uint8_t>& aRequest, JSContext* aCx, Promise** aPromise) {
  NS_ENSURE_TRUE(!aRequest.IsEmpty() && aRequest.Length() <= 786432,
                 NS_ERROR_INVALID_ARG);
  Request request{Operation::ProcessHistory};
  request.mSecret.reset(
      midori_sync_history_request_copy(aRequest.Elements(), aRequest.Length()));
  return Dispatch(std::move(request), aCx, aPromise);
}

NS_IMETHODIMP MidoriSyncCrypto::SetHistoryTitle(const nsACString& aUrl,
                                                const nsAString& aTitle) {
  MOZ_ASSERT(NS_IsMainThread());
  NS_ENSURE_FALSE(mState->mClosed, NS_ERROR_NOT_AVAILABLE);
  NS_ENSURE_TRUE(
      !aUrl.IsEmpty() && aUrl.Length() <= 2000 && aTitle.Length() <= 4096,
      NS_ERROR_INVALID_ARG);
  nsCOMPtr<nsIURI> uri;
  nsresult rv = NS_NewURI(getter_AddRefs(uri), aUrl);
  NS_ENSURE_SUCCESS(rv, rv);
  bool http = false;
  bool https = false;
  bool hasUserPass = false;
  rv = uri->SchemeIs("http", &http);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = uri->SchemeIs("https", &https);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = uri->GetHasUserPass(&hasUserPass);
  NS_ENSURE_SUCCESS(rv, rv);
  nsAutoCString spec;
  rv = uri->GetSpec(spec);
  NS_ENSURE_SUCCESS(rv, rv);
  NS_ENSURE_TRUE((http || https) && !hasUserPass && spec.Equals(aUrl),
                 NS_ERROR_INVALID_ARG);
  nsCOMPtr<mozilla::IHistory> history =
      do_GetService("@mozilla.org/browser/history;1");
  NS_ENSURE_TRUE(history, NS_ERROR_NOT_AVAILABLE);
  return history->SetURITitle(uri, aTitle);
}

NS_IMETHODIMP MidoriSyncCrypto::ProcessPassword(
    const nsTArray<uint8_t>& aRequest, JSContext* aCx, Promise** aPromise) {
  NS_ENSURE_TRUE(!aRequest.IsEmpty() && aRequest.Length() <= 786432,
                 NS_ERROR_INVALID_ARG);
  Request request{Operation::ProcessPassword};
  request.mSecret.reset(midori_sync_password_request_copy(aRequest.Elements(),
                                                          aRequest.Length()));
  return Dispatch(std::move(request), aCx, aPromise);
}
