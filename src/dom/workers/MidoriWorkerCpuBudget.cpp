/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/MidoriWorkerCpuBudget.h"

#include <algorithm>
#include <cmath>
#include <utility>

#include "JSExecutionManager.h"
#include "WorkerPrivate.h"
#include "mozilla/Atomics.h"
#include "mozilla/AutoRestore.h"
#include "mozilla/StaticMutex.h"
#include "mozilla/StaticPtr.h"
#include "mozilla/dom/ContentParent.h"
#include "nsITimer.h"
#include "nsTArray.h"
#include "nsThreadUtils.h"
#include "nsXULAppAPI.h"

#ifdef XP_WIN
#  include <windows.h>
#elif defined(XP_MACOSX)
#  include <mach/mach.h>
#  include <pthread.h>
#elif defined(XP_UNIX)
#  include <time.h>
#endif

namespace mozilla::dom {

static constexpr uint32_t kNanocpusPerCpu = 1000000000;
static constexpr double kCpuBurstNs = 1000000;
static Atomic<uint32_t> sWorkerCpuRate(0);
static Atomic<uint32_t> sBackgroundWorkers(0);
static Atomic<bool> sQuotaActive(false);
static Atomic<bool> sUpdatePending(false);
static Atomic<uint64_t> sQuotaRevision(0);
static double sOwnQuotaCpus = 0;
static StaticMutex sWorkerCpuTargetsMutex;
static StaticAutoPtr<nsTArray<nsCOMPtr<nsISerialEventTarget>>> sWorkerCpuTargets
    MOZ_GUARDED_BY(sWorkerCpuTargetsMutex);

uint32_t CurrentManagedWorkerCpuRate() { return sWorkerCpuRate; }

void ReceiveManagedWorkerCpuRate(uint32_t aRateNanocpus) {
  MOZ_RELEASE_ASSERT(aRateNanocpus <= kNanocpusPerCpu);
  nsTArray<nsCOMPtr<nsISerialEventTarget>> targets;
  {
    StaticMutexAutoLock lock(sWorkerCpuTargetsMutex);
    sWorkerCpuRate = aRateNanocpus;
    if (sWorkerCpuTargets) targets.Assign(*sWorkerCpuTargets);
  }
  for (const auto& target : targets) {
    static_cast<void>(target->Dispatch(
        NS_NewRunnableFunction("MidoriWorkerCpuBudget::RateChanged", [] {
          if (auto* worker = GetCurrentThreadWorkerPrivate())
            worker->UpdateCpuBudgetRateInternal();
        })));
  }
}

void SetManagedWorkerCpuTarget(nsISerialEventTarget* aTarget, bool aAlive) {
  StaticMutexAutoLock lock(sWorkerCpuTargetsMutex);
  if (aAlive) {
    if (!sWorkerCpuTargets)
      sWorkerCpuTargets = new nsTArray<nsCOMPtr<nsISerialEventTarget>>();
    if (!sWorkerCpuTargets->Contains(aTarget))
      sWorkerCpuTargets->AppendElement(aTarget);
  } else if (sWorkerCpuTargets) {
    sWorkerCpuTargets->RemoveElement(aTarget);
    if (sWorkerCpuTargets->IsEmpty()) sWorkerCpuTargets = nullptr;
  }
}

static void PublishWorkerCpuRate() {
  MOZ_ASSERT(NS_IsMainThread());
  const uint32_t count = sBackgroundWorkers;
  uint32_t rate = 0;
  if (sOwnQuotaCpus > 0 && count) {
    const double share = sOwnQuotaCpus * kNanocpusPerCpu / (4.0 * count);
    rate = static_cast<uint32_t>(
        std::clamp(std::floor(share), 1.0, double(kNanocpusPerCpu)));
  }
  if (rate == sWorkerCpuRate) return;
  ReceiveManagedWorkerCpuRate(rate);
  for (auto* process : ContentParent::AllProcesses(ContentParent::eLive)) {
    process->UpdateMidoriWorkerCpuRate(rate);
  }
}

void NotifyManagedWorkerCpuQuota(double aOwnQuotaCpus) {
  MOZ_ASSERT(XRE_IsParentProcess());
  const uint64_t revision = ++sQuotaRevision;
  auto update = [aOwnQuotaCpus, revision] {
    if (revision != sQuotaRevision) return;
    sOwnQuotaCpus =
        std::isfinite(aOwnQuotaCpus) && aOwnQuotaCpus > 0 ? aOwnQuotaCpus : 0;
    sQuotaActive = sOwnQuotaCpus > 0;
    PublishWorkerCpuRate();
  };
  if (NS_IsMainThread()) {
    update();
  } else {
    NS_DispatchToMainThread(NS_NewRunnableFunction(
        "MidoriWorkerCpuBudget::QuotaChanged", std::move(update)));
  }
}

void ChangeManagedBackgroundWorkerCount(bool aWasBackground,
                                        bool aIsBackground) {
  MOZ_ASSERT(XRE_IsParentProcess());
  if (aWasBackground == aIsBackground) return;
  if (aIsBackground) {
    ++sBackgroundWorkers;
  } else {
    MOZ_RELEASE_ASSERT(sBackgroundWorkers > 0);
    --sBackgroundWorkers;
  }
  if (!sQuotaActive || sUpdatePending.exchange(true)) return;
  nsresult rv = NS_DispatchToMainThread(
      NS_NewRunnableFunction("MidoriWorkerCpuBudget::WorkersChanged", [] {
        sUpdatePending = false;
        PublishWorkerCpuRate();
      }));
  if (NS_FAILED(rv)) sUpdatePending = false;
}

static bool ReadCurrentCpuNs(uint64_t& aValue) {
#ifdef XP_WIN
  FILETIME created, exited, kernel, user;
  if (!GetThreadTimes(GetCurrentThread(), &created, &exited, &kernel, &user))
    return false;
  ULARGE_INTEGER kernelTime, userTime;
  kernelTime.LowPart = kernel.dwLowDateTime;
  kernelTime.HighPart = kernel.dwHighDateTime;
  userTime.LowPart = user.dwLowDateTime;
  userTime.HighPart = user.dwHighDateTime;
  aValue = (kernelTime.QuadPart + userTime.QuadPart) * 100;
  return true;
#elif defined(XP_MACOSX)
  thread_extended_info_data_t info;
  mach_msg_type_number_t count = THREAD_EXTENDED_INFO_COUNT;
  if (thread_info(pthread_mach_thread_np(pthread_self()), THREAD_EXTENDED_INFO,
                  reinterpret_cast<thread_info_t>(&info),
                  &count) != KERN_SUCCESS)
    return false;
  aValue = info.pth_user_time + info.pth_system_time;
  return true;
#elif defined(XP_UNIX)
  timespec value;
  if (clock_gettime(CLOCK_THREAD_CPUTIME_ID, &value)) return false;
  aValue = uint64_t(value.tv_sec) * 1000000000 + value.tv_nsec;
  return true;
#else
  return false;
#endif
}

MidoriWorkerCpuBudget::MidoriWorkerCpuBudget(WorkerPrivate* aWorker)
    : mWorker(aWorker) {}

MidoriWorkerCpuBudget::~MidoriWorkerCpuBudget() { Stop(); }

void MidoriWorkerCpuBudget::Reset() {
  if (mTimer) mTimer->Cancel();
  mTimerArmed = false;
  mRateNanocpus = 0;
  mLastWall = TimeStamp();
  mCreditNs = 0;
}

void MidoriWorkerCpuBudget::Stop() {
  Reset();
  mWorker = nullptr;
}

bool MidoriWorkerCpuBudget::Account() {
  uint64_t cpu;
  if (!ReadCurrentCpuNs(cpu) || (!mLastWall.IsNull() && cpu < mLastCpuNs)) {
    NS_WARNING("Midori worker CPU clock unavailable");
    Reset();
    return false;
  }
  const TimeStamp now = TimeStamp::Now();
  if (!mLastWall.IsNull()) {
    mCreditNs += (now - mLastWall).ToSeconds() * mRateNanocpus;
    mCreditNs -= double(cpu - mLastCpuNs);
    mCreditNs = std::min(mCreditNs, kCpuBurstNs);
  } else {
    mCreditNs = kCpuBurstNs;
  }
  mLastWall = now;
  mLastCpuNs = cpu;
  return true;
}

void MidoriWorkerCpuBudget::Refresh(bool aBackground) {
  mBackground = aBackground;
  const uint32_t rate = CurrentManagedWorkerCpuRate();
  if (!mWorker || !mBackground || !rate || rate >= kNanocpusPerCpu) {
    Reset();
    return;
  }
  if (!Account()) return;
  mRateNanocpus = rate;
  if (!mWaiting) Arm();
}

void MidoriWorkerCpuBudget::Arm() {
  if (!mWorker || !mRateNanocpus || mTimerArmed || mWaiting) return;
  {
    MutexAutoLock lock(mWorker->mMutex);
    if (mWorker->mStatus >= Canceling || mWorker->mWorkerLoopIsIdle) return;
  }
  if (!mTimer) {
    mTimer = NS_NewTimer();
    if (!mTimer ||
        NS_FAILED(mTimer->SetTarget(mWorker->ControlEventTarget()))) {
      Reset();
      return;
    }
  }
  ArmTimer();
}

void MidoriWorkerCpuBudget::ArmTimer() {
  if (!mWorker || mWorker->mMidoriInAtomicsWait || !mRateNanocpus || !mTimer ||
      mTimerArmed || mWaiting)
    return;
  mTimerArmed = NS_SUCCEEDED(mTimer->InitWithNamedFuncCallback(
      [](nsITimer*, void* aClosure) {
        auto* budget = static_cast<MidoriWorkerCpuBudget*>(aClosure);
        budget->mTimerArmed = false;
        budget->Enforce();
      },
      this, 1, nsITimer::TYPE_ONE_SHOT, "MidoriWorkerCpuBudget"_ns));
  if (!mTimerArmed) Reset();
}

void MidoriWorkerCpuBudget::Enforce() {
  if (!mWorker || !mRateNanocpus || mWaiting) return;
  AutoYieldJSThreadExecution yield;
  {
    AutoRestore<bool> waiting(mWaiting);
    mWaiting = true;
    WorkerPrivate* worker = mWorker;
    while (mWorker && mBackground && mRateNanocpus) {
      const uint32_t rate = CurrentManagedWorkerCpuRate();
      if (!rate || rate >= kNanocpusPerCpu) {
        Reset();
        break;
      }
      if (!Account()) break;
      mRateNanocpus = rate;
      if (mCreditNs >= 0) break;
      if (worker->ProcessAllControlRunnables() ==
          WorkerPrivate::ProcessAllControlRunnablesResult::Abort)
        break;
      MutexAutoLock lock(worker->mMutex);
      if (!mWorker || !mRateNanocpus || worker->mStatus >= Canceling) break;
      if (!worker->mControlQueue.IsEmpty()) continue;
      worker->mCondVar.Wait(
          TimeDuration::FromSeconds((kCpuBurstNs - mCreditNs) / mRateNanocpus));
    }
  }
  Arm();
}

void MidoriWorkerCpuBudget::SetAtomicsWaitState(bool aWaiting) {
  if (auto* worker = GetCurrentThreadWorkerPrivate()) {
    worker->mMidoriInAtomicsWait = aWaiting;
    if (auto* budget = worker->mMidoriCpuGovernor.get()) {
      if (aWaiting) {
        budget->AfterEvent();
      } else if (budget->mRateNanocpus && budget->Account()) {
        budget->ArmTimer();
      }
    }
  }
}

void MidoriWorkerCpuBudget::BeforeEvent() {
  Enforce();
  Arm();
}

void MidoriWorkerCpuBudget::AfterEvent() {
  if (mRateNanocpus) Account();
  if (mTimer) mTimer->Cancel();
  mTimerArmed = false;
}

}  // namespace mozilla::dom
