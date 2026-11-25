/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MidoriNetworkBudget.h"
#include "MidoriDatagram.h"

#include <algorithm>
#include <cmath>

#include "base/process_util.h"
#include "mozilla/Atomics.h"
#include "mozilla/Logging.h"
#include "mozilla/dom/ContentChild.h"
#include "mozilla/dom/ContentParent.h"
#include "mozilla/Preferences.h"
#include "mozilla/StaticMutex.h"
#include "mozilla/TimeStamp.h"
#include "mozilla/net/SocketProcessChild.h"
#include "mozilla/net/SocketProcessParent.h"
#include "nsSocketTransportService2.h"
#include "nsThreadUtils.h"
#include "nsITimer.h"
#include "nsISerialEventTarget.h"
#include "nsTArray.h"
#include "prio.h"
#include "nsXULAppAPI.h"

namespace mozilla::net {
namespace {

using Direction = MidoriNetworkBudget::Direction;
StaticMutex sBudgetMutex;
LazyLogModule sBudgetLog("MidoriNetworkBudget");
Atomic<bool, Relaxed> sEnabled(false);
Atomic<uint32_t, Relaxed> sDownloadRate(0);
Atomic<uint32_t, Relaxed> sUploadRate(0);
#if defined(XP_LINUX) && !defined(ANDROID)
Atomic<uint64_t, ReleaseAcquire> sVideoRecoveryUntilMs(0);
TimeStamp sVideoRecoveryClockOrigin;

uint64_t VideoBudgetElapsedMilliseconds() {
  MOZ_ASSERT(!sVideoRecoveryClockOrigin.IsNull());
  return static_cast<uint64_t>(
      (TimeStamp::Now() - sVideoRecoveryClockOrigin).ToMilliseconds());
}
#endif
Atomic<uint32_t, Relaxed> sGlobalMediaSendingCallCount(0);
nsTArray<uint64_t> sLocalMediaSendingCalls;
struct ProcessMediaSendingCalls {
  const void* process;
  uint32_t count;
};
nsTArray<ProcessMediaSendingCalls> sProcessMediaSendingCalls;
Atomic<bool, Relaxed> sDownloadUnderused(false);
Atomic<uint32_t, Relaxed> sBufferedDatagramBytes(0);
constexpr uint32_t kBufferedDatagramLimit = 8 * 1024 * 1024;
bool sUseBroker = false;
thread_local AutoWebRTCAudioSend* sWebRTCAudioSend = nullptr;

struct Bucket {
  explicit Bucket(bool aUpload = false) : upload(aUpload) {}

  const bool upload;
  struct DatagramFlow {
    const void* owner;
    uint64_t served;
    TimeStamp requested;
    bool pending;
    bool atomic;
  };

  uint32_t rate = 0;
  double tokens = 0;
  double processBalance = 0;
  double protocolBalance = 0;
  uint32_t remoteFlows = 1;
  uint64_t generation = 0;
  TimeStamp updated;
  TimeStamp requested;
  TimeStamp localDemand;
  TimeStamp remoteDemand;
  TimeStamp streamDemand;
  TimeStamp datagramDemand;
  TimeStamp observationStarted;
  uint64_t observedBytes = 0;
  bool pending = false;
  nsTArray<DatagramFlow> datagramFlows;

  void MarkFlowDemand(const void* aFlow, bool aAtomic, TimeStamp aNow) {
    datagramFlows.RemoveElementsBy([&](const auto& flow) {
      return (aNow - flow.requested).ToMilliseconds() >= 250;
    });
    uint64_t least = UINT64_MAX;
    DatagramFlow* current = nullptr;
    for (auto& flow : datagramFlows) {
      if (flow.owner == aFlow)
        current = &flow;
      else if (flow.pending && flow.atomic == aAtomic)
        least = std::min(least, flow.served);
    }
    if (least == UINT64_MAX) least = 0;
    if (!current) {
      datagramFlows.AppendElement(DatagramFlow{aFlow, least, aNow, true, aAtomic});
    } else {
      if (!current->pending) current->served = std::max(current->served, least);
      current->pending = true;
      current->requested = aNow;
    }
  }

  bool CanUseFlow(const void* aFlow, bool aAtomic, TimeStamp aNow) const {
    uint64_t least = UINT64_MAX;
    uint64_t current = UINT64_MAX;
    for (const auto& flow : datagramFlows) {
      if (flow.atomic != aAtomic || !flow.pending ||
          (aNow - flow.requested).ToMilliseconds() >= 250)
        continue;
      least = std::min(least, flow.served);
      if (flow.owner == aFlow) current = flow.served;
    }
    return current != UINT64_MAX && current == least;
  }

  bool RenewFlowDemand(const void* aFlow, TimeStamp aNow) {
    for (auto& flow : datagramFlows) {
      if (flow.owner == aFlow && flow.pending) {
        flow.requested = aNow;
        return true;
      }
    }
    return false;
  }

  void RecordFlowUse(const void* aFlow, uint32_t aUsed) {
    for (auto& flow : datagramFlows) {
      if (flow.owner != aFlow) continue;
      flow.served += aUsed;
      if (!aUsed || !flow.atomic) flow.pending = false;
      return;
    }
  }

  double Capacity() const {
    double capacity = std::max(1.0, rate * 0.05);
#if defined(XP_LINUX) && !defined(ANDROID)
    if (upload && !sUseBroker && rate >= 8 * 1024) {
      capacity = std::max(capacity, std::min(rate * 0.15, 64.0 * 1024));
    }
#endif
    return capacity;
  }

  uint32_t FlowCount(bool aAtomic, TimeStamp aNow) const {
    uint32_t count = 0;
    for (const auto& flow : datagramFlows) {
      if (flow.atomic == aAtomic && flow.pending &&
          (aNow - flow.requested).ToMilliseconds() < 250) {
        ++count;
      }
    }
    return std::max(count, HasProtocolDemand(aAtomic, aNow) ? 1u : 0u);
  }

  uint32_t FlowCount(TimeStamp aNow) const {
    return std::max(1u, FlowCount(true, aNow) + FlowCount(false, aNow));
  }

  bool HasLocalDemand(TimeStamp aNow) const {
    return FlowCount(true, aNow) || FlowCount(false, aNow) ||
           (!localDemand.IsNull() &&
            (aNow - localDemand).ToMilliseconds() < 100);
  }

  bool HasRemoteDemand(TimeStamp aNow) const {
    return !remoteDemand.IsNull() &&
           (aNow - remoteDemand).ToMilliseconds() < 100;
  }

  bool HasProtocolDemand(bool aAtomic, TimeStamp aNow) const {
    const TimeStamp demand = aAtomic ? datagramDemand : streamDemand;
    return !demand.IsNull() && (aNow - demand).ToMilliseconds() < 100;
  }

  void MarkDemand(bool aAtomic, TimeStamp aNow) {
    (aAtomic ? datagramDemand : streamDemand) = aNow;
    if (!sUseBroker) localDemand = aNow;
  }

  void RenewDemand(bool aAtomic, TimeStamp aNow) {
    const TimeStamp demand = aAtomic ? datagramDemand : streamDemand;
    if (!demand.IsNull()) MarkDemand(aAtomic, aNow);
  }

  bool CanUse(bool aAtomic, TimeStamp aNow) const {
    if (!sUseBroker && HasRemoteDemand(aNow) && processBalance > 0) {
      return false;
    }
    return !HasProtocolDemand(!aAtomic, aNow) ||
           (aAtomic ? protocolBalance <= 0 : protocolBalance >= 0);
  }

  void RecordUse(bool aAtomic, uint32_t aUsed, TimeStamp aNow) {
    if (aUsed) {
      const double share =
          double(aUsed) / std::max(1u, FlowCount(aAtomic, aNow));
      const double used = aAtomic ? share : -share;
      protocolBalance =
          HasProtocolDemand(!aAtomic, aNow) ? protocolBalance + used : used;
      if (!sUseBroker) {
        const double localShare = double(aUsed) / FlowCount(aNow);
        processBalance = HasRemoteDemand(aNow) ? processBalance + localShare
                                             : localShare;
      }
    }
    (aAtomic ? datagramDemand : streamDemand) = TimeStamp();
    if (!sUseBroker && !HasProtocolDemand(!aAtomic, aNow)) {
      localDemand = TimeStamp();
    }
  }

  void Refill(TimeStamp aNow) {
    if (sUseBroker) return;
    if (!updated.IsNull()) {
      const double elapsed = std::max(0.0, (aNow - updated).ToSeconds());
      tokens = std::min(Capacity(), tokens + elapsed * rate);
    }
    updated = aNow;
  }

  void SetRate(uint32_t aRate) {
    if (rate == aRate) return;
    rate = aRate;
    tokens = sUseBroker ? 0 : Capacity();
    processBalance = protocolBalance = 0;
    remoteFlows = 1;
    updated = TimeStamp::Now();
    observationStarted = updated;
    observedBytes = 0;
    requested = TimeStamp();
    localDemand = remoteDemand = TimeStamp();
    streamDemand = datagramDemand = TimeStamp();
    pending = false;
    datagramFlows.Clear();
    ++generation;
  }
};

Bucket sDownload;
Bucket sUpload(true);

constexpr char kDownloadUnderusedPref[] =
    "midori.performance.network.experimental.downloadUnderused";

void SetDownloadUnderused(bool aUnderused) {
  if (sDownloadUnderused.exchange(aUnderused) == aUnderused ||
      !XRE_IsParentProcess()) return;
  (void)NS_DispatchToMainThread(NS_NewRunnableFunction(
      "MidoriNetworkBudget::PublishUtilization", [aUnderused]() {
        if (Preferences::IsServiceAvailable()) {
          Preferences::SetBool(kDownloadUnderusedPref, aUnderused,
                               PrefValueKind::Default);
        }
      }));
}

void ObserveDownloadUse(uint32_t aBytes, TimeStamp aNow) {
  if (!XRE_IsParentProcess() || !sDownload.rate) return;
  const double elapsed = (aNow - sDownload.observationStarted).ToSeconds();
  if (elapsed >= 1) {
    SetDownloadUnderused(sDownload.observedBytes < sDownload.rate * elapsed * .8);
    sDownload.observedBytes = 0;
    sDownload.observationStarted = aNow;
  }
  sDownload.observedBytes += aBytes;
}

Bucket& GetBucket(Direction aDirection) {
  return aDirection == Direction::Download ? sDownload : sUpload;
}

MidoriNetworkBudget::Reservation PrepareSocketRequest(Bucket& aBucket,
                                                      TimeStamp aNow) {
  if (!sUseBroker || aBucket.tokens >= 1 || aBucket.pending ||
      (!aBucket.requested.IsNull() &&
       (aNow - aBucket.requested).ToMilliseconds() < 10)) {
    return {0, false, 0};
  }
  aBucket.pending = true;
  aBucket.requested = aNow;
  return {uint32_t(aBucket.Capacity()), false, aBucket.generation};
}

void CompleteSocketQuota(Direction aDirection, uint64_t aGeneration,
                         uint32_t aGranted, uint32_t aRate) {
  StaticMutexAutoLock lock(sBudgetMutex);
  Bucket& bucket = GetBucket(aDirection);
  if (bucket.generation != aGeneration) return;
  bucket.pending = false;
  if (!bucket.rate || bucket.rate != aRate) return;
  bucket.tokens = std::min(bucket.Capacity(), bucket.tokens + aGranted);
}

void RequestSocketQuota(Direction aDirection, uint64_t aGeneration,
                        uint32_t aRequested) {
  const nsresult rv = NS_DispatchToMainThread(
      NS_NewRunnableFunction("MidoriNetworkBudget::RequestQuota", [=]() {
        auto* actor = SocketProcessChild::GetSingleton();
        if (!actor || !actor->CanSend()) {
          CompleteSocketQuota(aDirection, aGeneration, 0, 0);
          return;
        }
        uint32_t flows;
        {
          StaticMutexAutoLock lock(sBudgetMutex);
          const Bucket& bucket = GetBucket(aDirection);
          if (bucket.generation != aGeneration) return;
          flows = bucket.FlowCount(TimeStamp::Now());
        }
        actor
            ->SendRequestMidoriNetworkQuota(aDirection == Direction::Upload,
                                            aRequested, flows)
            ->Then(
                GetMainThreadSerialEventTarget(), __func__,
                [=](const MidoriNetworkGrant& aGrant) {
                  CompleteSocketQuota(aDirection, aGeneration, aGrant.mBytes(),
                                      aGrant.mRate());
                },
                [=](ipc::ResponseRejectReason) {
                  CompleteSocketQuota(aDirection, aGeneration, 0, 0);
                });
      }));
  if (NS_FAILED(rv)) CompleteSocketQuota(aDirection, aGeneration, 0, 0);
}

void UpdateBudget(const char*, void*) {
  const uint32_t download = std::max(
      0, Preferences::GetInt(
             "midori.performance.network.experimental.downloadBps", 0));
  const uint32_t upload =
      std::max(0, Preferences::GetInt(
                      "midori.performance.network.experimental.uploadBps", 0));
  StaticMutexAutoLock lock(sBudgetMutex);
  if (sDownload.rate != download) SetDownloadUnderused(false);
  sDownload.SetRate(download);
#if defined(XP_LINUX) && !defined(ANDROID)
  if (sUpload.rate != upload) {
    sVideoRecoveryUntilMs = upload ? 0 : VideoBudgetElapsedMilliseconds() + 2000;
  }
#endif
  sUpload.SetRate(upload);
  sDownloadRate = download;
  sUploadRate = upload;
  sEnabled = download || upload;
}

void UpdateUnderused(const char*, void*) {
  if (!XRE_IsParentProcess()) {
    sDownloadUnderused = sDownloadRate &&
        Preferences::GetBool(kDownloadUnderusedPref, false, PrefValueKind::Default);
  }
}

}  // namespace

RefPtr<MidoriNetworkBudget::SocketUsagePromise>
MidoriNetworkBudget::SampleSocketUsage(bool aSocketProcess) {
  MOZ_ASSERT(NS_IsMainThread());
  if (!XRE_IsParentProcess()) {
    return SocketUsagePromise::CreateAndReject(NS_ERROR_NOT_AVAILABLE,
                                               __func__);
  }
  RefPtr<SocketUsagePromise::Private> promise =
      new SocketUsagePromise::Private(__func__);
  if (aSocketProcess) {
    RefPtr<SocketProcessParent> actor = SocketProcessParent::GetSingleton();
    if (!actor || !actor->CanSend()) {
      return SocketUsagePromise::CreateAndReject(NS_ERROR_NOT_AVAILABLE,
                                                 __func__);
    }
    const uint64_t pid = actor->OtherPid();
    actor->SendGetMidoriSocketUsage()->Then(
        GetMainThreadSerialEventTarget(), __func__,
        [promise, pid](const MidoriSocketUsage& aUsage) {
          if (!aUsage.mAvailable()) {
            promise->Reject(NS_ERROR_NOT_AVAILABLE, __func__);
            return;
          }
          promise->Resolve(
              SocketUsage{pid, aUsage.mSent(), aUsage.mReceived(),
                          {aUsage.mDownloadBps(), aUsage.mUploadBps(),
                           aUsage.mDownloadGeneration(),
                           aUsage.mUploadGeneration()}},
              __func__);
        },
        [promise](ipc::ResponseRejectReason) {
          promise->Reject(NS_ERROR_NOT_AVAILABLE, __func__);
        });
    return promise;
  }
  if (!gSocketTransportService) {
    return SocketUsagePromise::CreateAndReject(NS_ERROR_NOT_AVAILABLE,
                                               __func__);
  }
  RefPtr<nsSocketTransportService> service = gSocketTransportService;
  const uint64_t pid = base::GetCurrentProcId();
  const nsresult rv = service->Dispatch(
      NS_NewRunnableFunction(
          "MidoriNetworkBudget::SampleSocketUsage",
          [promise, pid, service]() {
            uint64_t sent, received;
            service->GetManagedSocketByteCounts(sent, received);
            promise->Resolve(SocketUsage{pid, sent, received, GetBudgetState()},
                             __func__);
          }),
      NS_DISPATCH_NORMAL);
  if (NS_FAILED(rv)) promise->Reject(rv, __func__);
  return promise;
}

MidoriNetworkBudget::BudgetState MidoriNetworkBudget::GetBudgetState() {
  StaticMutexAutoLock lock(sBudgetMutex);
  return {sDownload.rate, sUpload.rate, sDownload.generation, sUpload.generation};
}

bool MidoriNetworkBudget::ReserveDatagramBytes(uint32_t aBytes) {
  if (aBytes > kBufferedDatagramLimit) return false;
  for (;;) {
    uint32_t used = sBufferedDatagramBytes;
    if (used > kBufferedDatagramLimit - aBytes) return false;
    if (sBufferedDatagramBytes.compareExchange(used, used + aBytes))
      return true;
  }
}

void MidoriNetworkBudget::ReleaseDatagramBytes(uint32_t aBytes) {
  MOZ_ASSERT(sBufferedDatagramBytes >= aBytes);
  sBufferedDatagramBytes -= aBytes;
}

uint32_t MidoriNetworkBudget::DownloadRate() { return sDownloadRate; }

uint32_t MidoriNetworkBudget::UploadRate() { return sUploadRate; }

void MidoriNetworkBudget::ReportMediaSending(uint64_t aSourceId, bool aActive) {
  auto report = [=]() {
    MOZ_ASSERT(NS_IsMainThread());
    const uint32_t previous = sLocalMediaSendingCalls.Length();
    if (aActive) {
      if (!sLocalMediaSendingCalls.Contains(aSourceId)) {
        sLocalMediaSendingCalls.AppendElement(aSourceId);
      }
    } else {
      sLocalMediaSendingCalls.RemoveElement(aSourceId);
    }
    const uint32_t count = sLocalMediaSendingCalls.Length();
    if (count == previous) return;
    if (XRE_IsParentProcess()) {
      SetProcessMediaSendingCallCount(nullptr, count);
    } else if (XRE_IsContentProcess()) {
      auto* actor = dom::ContentChild::GetSingleton();
      if (actor && actor->CanSend()) {
        (void)actor->SendSetMidoriMediaSendingCallCount(count);
      }
    }
  };
  if (NS_IsMainThread()) {
    report();
  } else {
    (void)NS_DispatchToMainThread(NS_NewRunnableFunction(__func__, std::move(report)));
  }
}

void MidoriNetworkBudget::SetProcessMediaSendingCallCount(const void* aProcess,
                                                         uint32_t aCount) {
  MOZ_ASSERT(NS_IsMainThread() && XRE_IsParentProcess());
  ProcessMediaSendingCalls* entry = nullptr;
  for (auto& value : sProcessMediaSendingCalls) {
    if (value.process == aProcess) {
      entry = &value;
      break;
    }
  }
  if (entry && entry->count == aCount) return;
  if (!aCount) {
    sProcessMediaSendingCalls.RemoveElementsBy(
        [=](const auto& value) { return value.process == aProcess; });
  } else if (entry) {
    entry->count = aCount;
  } else {
    sProcessMediaSendingCalls.AppendElement(ProcessMediaSendingCalls{aProcess, aCount});
  }
  uint64_t total = 0;
  for (const auto& value : sProcessMediaSendingCalls) total += value.count;
  const uint32_t count = uint32_t(std::min<uint64_t>(total, UINT32_MAX));
  if (count == sGlobalMediaSendingCallCount) return;
  SetGlobalMediaSendingCallCount(count);
  MOZ_LOG_FMT(sBudgetLog, LogLevel::Debug, "media-senders global={} process={:p} local={}",
              count, aProcess, aCount);
  for (auto* actor : dom::ContentParent::AllProcesses(dom::ContentParent::eLive)) {
    if (actor->CanSend()) (void)actor->SendUpdateMidoriMediaSendingCallCount(count);
  }
}

void MidoriNetworkBudget::SetGlobalMediaSendingCallCount(uint32_t aCount) {
  MOZ_ASSERT(NS_IsMainThread());
  sGlobalMediaSendingCallCount = aCount;
}

uint32_t MidoriNetworkBudget::GlobalMediaSendingCallCount() {
  return sGlobalMediaSendingCallCount;
}

bool MidoriNetworkBudget::DatagramReceiveWindowMayGrow() {
  return sDownloadRate && sDownloadUnderused;
}

DatagramReceiveHeadroom::DatagramReceiveHeadroom(PRFileDesc* aFD,
                                                 uint32_t aOriginalRequest,
                                                 uint32_t aAppliedCapacity,
                                                 uint32_t aCharge,
                                                 uint32_t aRate)
    : mFD(aFD),
      mLastBlocked(TimeStamp::Now()),
      mOriginalRequest(aOriginalRequest),
      mAppliedCapacity(aAppliedCapacity),
      mCharge(aCharge),
      mRate(aRate) {}

DatagramReceiveHeadroom::~DatagramReceiveHeadroom() { Relinquish(); }

already_AddRefed<DatagramReceiveHeadroom> DatagramReceiveHeadroom::Create(
    PRFileDesc* aFD) {
  const uint32_t rate = MidoriNetworkBudget::DownloadRate();
  if (!aFD || !rate) return nullptr;
  const uint32_t requested = std::clamp(rate / 2, 128u * 1024, 1024u * 1024);
  const uint32_t charged = requested * 2;
  PRSocketOptionData option{};
  option.option = PR_SockOpt_RecvBufferSize;
  if (PR_GetSocketOption(aFD, &option) != PR_SUCCESS ||
      !option.value.recv_buffer_size ||
      option.value.recv_buffer_size >= charged)
    return nullptr;
  const uint32_t originalCapacity = uint32_t(option.value.recv_buffer_size);
  uint32_t original = originalCapacity;
#ifdef XP_LINUX
  original /= 2;
#endif
  if (!MidoriNetworkBudget::ReserveDatagramBytes(charged)) return nullptr;
  option.value.recv_buffer_size = requested;
  if (PR_SetSocketOption(aFD, &option) != PR_SUCCESS) {
    MidoriNetworkBudget::ReleaseDatagramBytes(charged);
    return nullptr;
  }
  uint32_t applied = 0;
  if (PR_GetSocketOption(aFD, &option) == PR_SUCCESS &&
      option.value.recv_buffer_size <= charged) {
    applied = uint32_t(option.value.recv_buffer_size);
  }
  RefPtr<DatagramReceiveHeadroom> result =
      new DatagramReceiveHeadroom(aFD, original, applied, charged, rate);
  {
    MutexAutoLock lock(result->mMutex);
    if (applied <= originalCapacity || !result->ScheduleLocked())
      result->RestoreLocked();
  }
  if (!result->IsActive()) return nullptr;
  MOZ_LOG(
      sBudgetLog, LogLevel::Info,
      ("UDP receive headroom rate=%u originalRequest=%u capacity=%u charge=%u",
       rate, original, applied, charged));
  return result.forget();
}

bool DatagramReceiveHeadroom::ScheduleLocked() {
  if (mTimer || !mFD) return true;
  nsCOMPtr<nsISerialEventTarget> target = GetCurrentSerialEventTarget();
  return NS_SUCCEEDED(NS_NewTimerWithCallback(
      getter_AddRefs(mTimer),
      [self = RefPtr{this}](nsITimer*) { self->Expire(); }, 250,
      nsITimer::TYPE_ONE_SHOT, "Midori UDP receive headroom"_ns, target));
}

void DatagramReceiveHeadroom::ReleaseLocked() {
  mFD = nullptr;
  if (mTimer) {
    mTimer->Cancel();
    mTimer = nullptr;
  }
  if (mCharge) {
    MidoriNetworkBudget::ReleaseDatagramBytes(mCharge);
    mCharge = 0;
  }
  mActive = false;
}

bool DatagramReceiveHeadroom::RestoreLocked() {
  if (!mFD) return true;
  PRSocketOptionData option{};
  option.option = PR_SockOpt_RecvBufferSize;
  if (PR_GetSocketOption(mFD, &option) != PR_SUCCESS) return false;
  if (!mAppliedCapacity || option.value.recv_buffer_size == mAppliedCapacity) {
    option.value.recv_buffer_size = mOriginalRequest;
    if (PR_SetSocketOption(mFD, &option) != PR_SUCCESS) return false;
  }
  MOZ_LOG(sBudgetLog, LogLevel::Info,
          ("UDP receive headroom restored request=%u charge=%u",
           mOriginalRequest, mCharge));
  ReleaseLocked();
  return true;
}

bool DatagramReceiveHeadroom::Renew() {
  MutexAutoLock lock(mMutex);
  if (!mFD) return false;
  if (MidoriNetworkBudget::DownloadRate() != mRate) {
    if (RestoreLocked()) return false;
  }
  mLastBlocked = TimeStamp::Now();
  if (!ScheduleLocked()) RestoreLocked();
  return mActive;
}

void DatagramReceiveHeadroom::Expire() {
  MutexAutoLock lock(mMutex);
  mTimer = nullptr;
  if (!mFD) return;
  if (MidoriNetworkBudget::DownloadRate() != mRate ||
      (TimeStamp::Now() - mLastBlocked).ToMilliseconds() >= 200) {
    if (RestoreLocked()) return;
  }
  ScheduleLocked();
}

void DatagramReceiveHeadroom::Close(PRFileDesc* aFD) {
  MutexAutoLock lock(mMutex);
  MOZ_ASSERT(!mFD || mFD == aFD);
  PR_Close(aFD);
  ReleaseLocked();
}

void DatagramReceiveHeadroom::Relinquish() {
  MutexAutoLock lock(mMutex);
  ReleaseLocked();
}

AutoWebRTCAudioSend::AutoWebRTCAudioSend(bool aAudio, DatagramSendInfo aInfo)
    : mPrevious(sWebRTCAudioSend), mAudio(aAudio), mInfo(std::move(aInfo)) {
  sWebRTCAudioSend = this;
}

AutoWebRTCAudioSend::~AutoWebRTCAudioSend() { sWebRTCAudioSend = mPrevious; }

bool AutoWebRTCAudioSend::IsAudio() {
  return sWebRTCAudioSend && sWebRTCAudioSend->mAudio;
}

DatagramSendInfo AutoWebRTCAudioSend::Capture() {
  if (!sWebRTCAudioSend) return {};
  sWebRTCAudioSend->mCaptured = true;
  return sWebRTCAudioSend->mInfo;
}

void AutoWebRTCAudioSend::NotifyFallback(const TimeStamp& aSentAt) const {
  if (!mCaptured) mInfo.Notify(aSentAt, false);
}

DatagramSendOptions DatagramSendOptions::ForWebRTC(const void* aData,
                                                   uint32_t aLength,
                                                   bool aLimited,
                                                   bool aAudio) {
  DatagramSendOptions options;
  if (aLength < 2) return options;
  const auto* bytes = static_cast<const uint8_t*>(aData);
  const bool rtcp = aLength >= 8 && (bytes[0] & 0xc0) == 0x80 &&
                    bytes[1] >= 192 && bytes[1] <= 223;
  if (aLength >= 12 && (bytes[0] & 0xc0) == 0x80 && !rtcp) {
    options.sent = AutoWebRTCAudioSend::Capture();
    if (aLimited) {
      options.audio = aAudio;
      options.expires =
          TimeStamp::Now() + TimeDuration::FromMilliseconds(aAudio ? 100 : 500);
    }
  }
  if (!aLimited) return options;
  const uint16_t type = (uint16_t(bytes[0]) << 8) | bytes[1];
  const bool binding = aLength >= 20 && (type & 0xfeef) == 1 &&
                       bytes[4] == 0x21 && bytes[5] == 0x12 &&
                       bytes[6] == 0xa4 && bytes[7] == 0x42;
  const bool handshake = aLength >= 13 && bytes[0] >= 20 && bytes[0] <= 22 &&
                         bytes[1] == 0xfe;
  options.urgent = rtcp || binding || handshake || options.audio;
  return options;
}

uint32_t MidoriNetworkBudget::DatagramReceiveWindow(uint32_t aRttMilliseconds) {
  const uint32_t rate = sDownloadRate;
  if (!rate) return UINT32_MAX;
  const uint32_t burst = std::clamp(rate / 40, 2400u, 32u * 1024);
  const uint64_t inFlight =
      uint64_t(rate) * std::min(aRttMilliseconds, 60000u) / 1000;
  return uint32_t(std::min<uint64_t>(UINT32_MAX, inFlight + burst));
}

void MidoriNetworkBudget::Init() {
  MOZ_ASSERT(NS_IsMainThread());
  static bool initialized = false;
  if (initialized) return;
  initialized = true;
  sUseBroker = XRE_IsSocketProcess();
#if defined(XP_LINUX) && !defined(ANDROID)
  sVideoRecoveryClockOrigin = TimeStamp::Now();
#endif
  Preferences::RegisterCallbackAndCall(
      UpdateBudget, "midori.performance.network.experimental.downloadBps");
  Preferences::RegisterCallbackAndCall(
      UpdateBudget, "midori.performance.network.experimental.uploadBps");
  Preferences::RegisterCallbackAndCall(UpdateUnderused, kDownloadUnderusedPref);
}

MidoriNetworkBudget::Reservation MidoriNetworkBudget::Reserve(
    Direction aDirection, uint32_t aRequested, bool aAtomic,
    const void* aFlow) {
  if (!sEnabled || !aRequested) return {aRequested, false, 0};
  Reservation reservation;
  Reservation request{};
  {
    StaticMutexAutoLock lock(sBudgetMutex);
    Bucket& bucket = GetBucket(aDirection);
    if (!bucket.rate) return {aRequested, false, 0};
    const TimeStamp now = TimeStamp::Now();
    bucket.Refill(now);
    if (aFlow) bucket.MarkFlowDemand(aFlow, aAtomic, now);
    const double available =
        bucket.CanUse(aAtomic, now) &&
                (!aFlow || bucket.CanUseFlow(aFlow, aAtomic, now))
            ? bucket.tokens
            : 0;
    const uint32_t allowed =
        aAtomic ? (available >= 1 ? aRequested : 0)
                : std::min(aRequested, uint32_t(std::max(0.0, available)));
    bucket.tokens -= allowed;
    if (!allowed) bucket.MarkDemand(aAtomic, now);
    reservation = {allowed, false, bucket.generation, aAtomic, aFlow};
    MOZ_LOG(sBudgetLog, LogLevel::Debug,
            ("Reserve upload=%d broker=%d atomic=%d requested=%u allowed=%u "
             "tokens=%.0f processBalance=%.0f protocolBalance=%.0f",
             aDirection == Direction::Upload, sUseBroker, aAtomic, aRequested,
             allowed, bucket.tokens, bucket.processBalance,
             bucket.protocolBalance));
    if (!aAtomic || !allowed) request = PrepareSocketRequest(bucket, now);
  }
  if (request.bytes)
    RequestSocketQuota(aDirection, request.generation, request.bytes);
  return reservation;
}

void MidoriNetworkBudget::Refund(Direction aDirection, Reservation aReservation,
                                 uint32_t aUsed) {
  if (!aReservation.generation) return;
  StaticMutexAutoLock lock(sBudgetMutex);
  Bucket& bucket = GetBucket(aDirection);
  if (!bucket.rate || bucket.generation != aReservation.generation) return;
  const TimeStamp now = TimeStamp::Now();
  bucket.Refill(now);
  bucket.RecordUse(aReservation.atomic, aUsed, now);
  if (aReservation.flow) bucket.RecordFlowUse(aReservation.flow, aUsed);
  if (aDirection == Direction::Download) ObserveDownloadUse(aUsed, now);
  if (aUsed >= aReservation.bytes) return;
  bucket.tokens =
      std::min(bucket.Capacity(), bucket.tokens + aReservation.bytes - aUsed);
  MOZ_LOG(sBudgetLog, LogLevel::Debug,
          ("Refund upload=%d broker=%d reserved=%u used=%u tokens=%.0f",
           aDirection == Direction::Upload, sUseBroker, aReservation.bytes,
           aUsed, bucket.tokens));
}

void MidoriNetworkBudget::CancelDatagramDemand(Direction aDirection,
                                               const void* aFlow) {
  if (!sEnabled) return;
  StaticMutexAutoLock lock(sBudgetMutex);
  for (auto& flow : GetBucket(aDirection).datagramFlows) {
    if (flow.owner == aFlow) flow.pending = false;
  }
}

void MidoriNetworkBudget::ForgetDatagramFlow(Direction aDirection,
                                             const void* aFlow) {
  StaticMutexAutoLock lock(sBudgetMutex);
  GetBucket(aDirection).datagramFlows.RemoveElementsBy([&](const auto& flow) {
    return flow.owner == aFlow;
  });
}

uint32_t MidoriNetworkBudget::WaitMilliseconds(Direction aDirection,
                                               bool aAtomic,
                                               const void* aFlow) {
  if (!sEnabled) return 0;
  Reservation request{};
  uint32_t delay;
  {
    StaticMutexAutoLock lock(sBudgetMutex);
    Bucket& bucket = GetBucket(aDirection);
    if (!bucket.rate) return 0;
    const TimeStamp now = TimeStamp::Now();
    bucket.Refill(now);
    bucket.RenewDemand(aAtomic, now);
    const bool pendingFlow = aFlow && bucket.RenewFlowDemand(aFlow, now);
    if (!aAtomic && aFlow && !pendingFlow) return 0;
    if (bucket.tokens >= 1 && bucket.CanUse(aAtomic, now) &&
        (!pendingFlow || bucket.CanUseFlow(aFlow, aAtomic, now)))
      return 0;
    request = PrepareSocketRequest(bucket, now);
    const double missing = std::max(1.0, 1 - bucket.tokens);
    delay = uint32_t(
        std::clamp(std::ceil(1000.0 * missing / bucket.rate), 10.0, 50.0));
  }
  if (request.bytes)
    RequestSocketQuota(aDirection, request.generation, request.bytes);
  return delay;
}

MidoriNetworkBudget::Grant MidoriNetworkBudget::GrantToSocketProcess(
    Direction aDirection, uint32_t aRequested, uint32_t aFlows) {
  MOZ_ASSERT(NS_IsMainThread());
  MOZ_ASSERT(XRE_IsParentProcess());
  Init();
  StaticMutexAutoLock lock(sBudgetMutex);
  Bucket& bucket = GetBucket(aDirection);
  if (!bucket.rate) return {0, 0};
  const TimeStamp now = TimeStamp::Now();
  bucket.Refill(now);
  if (aRequested) {
    bucket.remoteDemand = now;
    bucket.remoteFlows = std::clamp(aFlows, 1u, 65536u);
  }
  const bool local = bucket.HasLocalDemand(now);
  const double available =
      local && bucket.processBalance < 0 ? 0 : bucket.tokens;
  const uint32_t allowed =
      std::min(aRequested, uint32_t(std::max(0.0, available)));
  bucket.tokens -= allowed;
  if (aDirection == Direction::Download) ObserveDownloadUse(allowed, now);
  if (allowed) {
    const double share = double(allowed) / bucket.remoteFlows;
    bucket.processBalance = local ? bucket.processBalance - share : -share;
  }
  MOZ_LOG(sBudgetLog, LogLevel::Debug,
          ("Grant upload=%d requested=%u granted=%u tokens=%.0f balance=%.0f",
           aDirection == Direction::Upload, aRequested, allowed, bucket.tokens,
           bucket.processBalance));
  return {allowed, bucket.rate};
}

extern "C" uint32_t MidoriNetworkReserveDatagram(bool aUpload,
                                                 uint32_t aRequested,
                                                 uint64_t* aGeneration,
                                                 bool* aProcessShare) {
  return MidoriNetworkReserveDatagramForFlow(aUpload, aRequested, aGeneration,
                                             aProcessShare, nullptr);
}

extern "C" uint32_t MidoriNetworkReserveDatagramForFlow(bool aUpload,
                                                        uint32_t aRequested,
                                                        uint64_t* aGeneration,
                                                        bool* aProcessShare,
                                                        const void* aFlow) {
  const auto reservation = MidoriNetworkBudget::Reserve(
      aUpload ? MidoriNetworkBudget::Direction::Upload
              : MidoriNetworkBudget::Direction::Download,
      aRequested, true, aFlow);
  *aGeneration = reservation.generation;
  *aProcessShare = reservation.processShare;
  return reservation.bytes;
}

extern "C" void MidoriNetworkRefundDatagram(bool aUpload, uint32_t aReserved,
                                            uint64_t aGeneration,
                                            bool aProcessShare,
                                            uint32_t aUsed) {
  MidoriNetworkRefundDatagramForFlow(aUpload, aReserved, aGeneration,
                                     aProcessShare, aUsed, nullptr);
}

extern "C" void MidoriNetworkRefundDatagramForFlow(
    bool aUpload, uint32_t aReserved, uint64_t aGeneration, bool aProcessShare,
    uint32_t aUsed, const void* aFlow) {
  MidoriNetworkBudget::Refund(
      aUpload ? MidoriNetworkBudget::Direction::Upload
              : MidoriNetworkBudget::Direction::Download,
      {aReserved, aProcessShare, aGeneration, true, aFlow}, aUsed);
}

extern "C" void MidoriNetworkCancelDatagramDemand(bool aUpload,
                                                  const void* aFlow) {
  if (aFlow) {
    MidoriNetworkBudget::CancelDatagramDemand(
        aUpload ? MidoriNetworkBudget::Direction::Upload
                : MidoriNetworkBudget::Direction::Download,
        aFlow);
  }
}

#if defined(XP_LINUX) && !defined(ANDROID)
extern "C" uint32_t MidoriWebRTCVideoBudgetState() {
  const uint32_t rate = MidoriNetworkBudget::UploadRate();
  if (rate) return MidoriNetworkBudget::VideoUploadSuspended(rate) ? 2 : 1;
  const uint64_t until = sVideoRecoveryUntilMs;
  if (!until) return 0;
  if (VideoBudgetElapsedMilliseconds() < until) return 3;
  (void)sVideoRecoveryUntilMs.compareExchange(until, 0);
  return 0;
}
#endif

}  // namespace mozilla::net
