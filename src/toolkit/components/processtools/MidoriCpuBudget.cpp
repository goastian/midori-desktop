/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MidoriCpuBudget.h"
#include "mozilla/MidoriCpuThreadPlacement.h"
#include "mozilla/dom/MidoriWorkerCpuBudget.h"
#include "mozilla/MidoriCpuBudget_linux.h"
#include "mozilla/MidoriCpuBudget_windows.h"
#ifdef XP_MACOSX
#  include "mozilla/MidoriCpuBudget_macos.h"
#endif
#ifdef XP_WIN
#  include "mozilla/Atomics.h"
#endif
#include "mozilla/Preferences.h"
#include "mozilla/StaticBackgroundTaskQueue.h"
#include "mozilla/StaticMutex.h"
#include "nsThreadUtils.h"

namespace mozilla::midori {

#if (defined(XP_LINUX) && !defined(ANDROID)) || defined(XP_WIN) || \
    defined(XP_MACOSX)
static StaticMutex sMidoriCpuBudgetMutex;
static CpuBudgetController* sMidoriCpuBudgetController = nullptr;
static bool sMidoriCpuBudgetClosing = false;
#  ifdef XP_WIN
static Atomic<bool, Relaxed> sMidoriCpuBudgetContext(false);
#  endif
#endif

static already_AddRefed<nsISerialEventTarget> ManagedBudgetTarget() {
  static StaticBackgroundTaskQueue queue("MidoriCpuBudget");
  return queue.Get();
}

int SetManagedCpuBudgetController(CpuBudgetController* aController) {
  MOZ_ASSERT(NS_IsMainThread());
#if (defined(XP_LINUX) && !defined(ANDROID)) || defined(XP_WIN) || \
    defined(XP_MACOSX)
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  MOZ_ASSERT(!sMidoriCpuBudgetController || !aController);
  sMidoriCpuBudgetController = aController;
  sMidoriCpuBudgetClosing = false;
#  ifdef XP_WIN
  if (aController) sMidoriCpuBudgetContext = true;
#  endif
#  if defined(XP_LINUX) && !defined(ANDROID)
  if (aController) {
    int normal, realtime;
    int error = aController->OpenThreadFiles(false, normal, realtime);
    if (!error) error = InstallManagedCpuThreadPlacement(normal, realtime);
    if (!error && HasManagedAudioCpuActivity())
      error = aController->SetAudioActivity(1, true);
    if (error) return error;
  }
#  endif
#endif
  return 0;
}

int SetManagedAudioCpuActivity(uintptr_t aOwner, bool aActive) {
#if defined(XP_LINUX) && !defined(ANDROID)
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  if (sMidoriCpuBudgetController && !sMidoriCpuBudgetClosing)
    return sMidoriCpuBudgetController->SetAudioActivity(aOwner, aActive);
#endif
  return 0;
}

int SetManagedWorkerCpuRole(uintptr_t aOwner, uint32_t aPid, uint64_t aTid,
                            bool aBackground, bool aAlive) {
#if (defined(XP_LINUX) && !defined(ANDROID)) || defined(XP_WIN) || \
    defined(XP_MACOSX)
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  if (sMidoriCpuBudgetController && !sMidoriCpuBudgetClosing) {
    return sMidoriCpuBudgetController->SetWorkerRole(aOwner, aPid, aTid,
                                                     aBackground, aAlive);
  }
#endif
  return 0;
}

#ifdef XP_WIN
bool HasManagedCpuBudgetContext() { return sMidoriCpuBudgetContext; }
#endif

ManagedCpuCapacity ReadManagedCpuCapacity() {
  ManagedCpuCapacity result;
#if defined(XP_LINUX) && !defined(ANDROID)
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  if (sMidoriCpuBudgetController) {
    result.managed = true;
    result.nativeError = sMidoriCpuBudgetController->ReadExternalCapacity(
        result.externalCapacityCpus);
    if (result.nativeError) result.externalCapacityCpus = 0;
  }
#elif defined(XP_WIN)
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  if (sMidoriCpuBudgetController) {
    result.managed = true;
    WindowsCpuCapacity capacity;
    result.nativeError =
        sMidoriCpuBudgetController->ReadExternalCapacity(capacity);
    if (!result.nativeError)
      result.externalCapacityCpus = capacity.externalCpus;
  }
#elif defined(XP_MACOSX)
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  if (sMidoriCpuBudgetController) {
    result.managed = true;
    result.nativeError = sMidoriCpuBudgetController->ReadExternalCapacity(
        result.externalCapacityCpus);
    if (result.nativeError) result.externalCapacityCpus = 0;
  }
#endif
  return result;
}

#ifdef XP_MACOSX
int RegisterManagedCpuTask(uintptr_t aOwner, uint32_t aPid, uint32_t aTask) {
  int error = 0;
  {
    StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
    if (sMidoriCpuBudgetController && !sMidoriCpuBudgetClosing) {
      error = sMidoriCpuBudgetController->Attach(aOwner, aPid, aTask);
      if (error) {
        MacCpuBudgetState state;
        static_cast<void>(sMidoriCpuBudgetController->SetPercentage(0, state));
      }
    }
  }
  if (error) dom::NotifyManagedWorkerCpuQuota(0);
  return error;
}

int UnregisterManagedCpuTask(uintptr_t aOwner) {
  int error = 0;
  {
    StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
    if (sMidoriCpuBudgetController && !sMidoriCpuBudgetClosing)
      error = sMidoriCpuBudgetController->Detach(aOwner);
  }
  if (error) dom::NotifyManagedWorkerCpuQuota(0);
  return error;
}
#endif

#if defined(XP_LINUX) && !defined(ANDROID)
int OpenManagedCpuChildProcess(bool aContent, int& aFile) {
  aFile = -1;
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  return sMidoriCpuBudgetController
             ? sMidoriCpuBudgetController->OpenChildProcessFile(aContent, aFile)
             : 0;
}

int OpenManagedCpuChildThreadFiles(bool aContent, int& aNormal,
                                   int& aRealtime) {
  aNormal = aRealtime = -1;
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  return sMidoriCpuBudgetController
             ? sMidoriCpuBudgetController->OpenThreadFiles(aContent, aNormal,
                                                           aRealtime)
             : 0;
}

int OpenManagedCpuExternalProcess(int& aFile) {
  aFile = -1;
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  return sMidoriCpuBudgetController
             ? sMidoriCpuBudgetController->OpenExternalProcessFile(aFile)
             : 0;
}

int OpenManagedCpuGioLaunchFiles(int& aExternal, int& aOwn) {
  aExternal = aOwn = -1;
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  return sMidoriCpuBudgetController
             ? sMidoriCpuBudgetController->OpenGioLaunchFiles(aExternal, aOwn)
             : 0;
}

int OpenManagedCpuRestartFiles(int& aGroup, int& aExternal, int& aMemory) {
  aGroup = aExternal = aMemory = -1;
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  return sMidoriCpuBudgetController
             ? sMidoriCpuBudgetController->OpenRestartFiles(aGroup, aExternal,
                                                            aMemory)
             : 0;
}
#endif

int BeginManagedCpuBudgetShutdown() {
  int error = 0;
#if (defined(XP_LINUX) && !defined(ANDROID)) || defined(XP_WIN) || \
    defined(XP_MACOSX)
  {
    StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
    if (sMidoriCpuBudgetController) {
      sMidoriCpuBudgetClosing = true;
#  ifdef XP_WIN
      WindowsCpuBudgetState state;
      error = sMidoriCpuBudgetController->SetNormalizedPercentage(0, state);
#  elif defined(XP_MACOSX)
      MacCpuBudgetState state;
      error = sMidoriCpuBudgetController->SetPercentage(0, state);
#  else
      int memoryError = sMidoriCpuBudgetController->RestoreMemoryBudget();
      CpuBudgetState state;
      error = sMidoriCpuBudgetController->SetPercentage(0, state);
      if (!error) error = memoryError;
#  endif
    }
  }
#endif
  dom::NotifyManagedWorkerCpuQuota(0);
  return error;
}

int RestoreManagedCpuBudget() {
  int error = 0;
#if (defined(XP_LINUX) && !defined(ANDROID)) || defined(XP_WIN) || \
    defined(XP_MACOSX)
  {
    StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
    sMidoriCpuBudgetClosing = true;
    if (sMidoriCpuBudgetController) {
      auto* controller = sMidoriCpuBudgetController;
      sMidoriCpuBudgetController = nullptr;
#  if defined(XP_LINUX) && !defined(ANDROID)
      ClearManagedCpuThreadPlacement();
#  endif
#  ifdef XP_WIN
      WindowsCpuBudgetState state;
      error = controller->SetNormalizedPercentage(0, state);
#  else
      error = controller->Shutdown();
#  endif
    }
  }
#endif
  dom::NotifyManagedWorkerCpuQuota(0);
  return error;
}

RefPtr<ManagedCpuBudgetPromise> RequestManagedCpuBudget(uint32_t aPercentage) {
  MOZ_ASSERT(NS_IsMainThread());
  if (aPercentage > 100) {
    return ManagedCpuBudgetPromise::CreateAndReject(NS_ERROR_INVALID_ARG,
                                                    __func__);
  }
  if (aPercentage &&
      !Preferences::GetBool("midori.performance.cpu.experimental.enabled",
                            false)) {
    return ManagedCpuBudgetPromise::CreateAndResolve(ManagedCpuBudgetState{},
                                                     __func__);
  }
  nsCOMPtr<nsISerialEventTarget> target = ManagedBudgetTarget();
  if (!target) {
    return ManagedCpuBudgetPromise::CreateAndReject(NS_ERROR_NOT_AVAILABLE,
                                                    __func__);
  }
  RefPtr<ManagedCpuBudgetPromise::Private> promise =
      new ManagedCpuBudgetPromise::Private(__func__);
  nsresult rv = target->Dispatch(NS_NewRunnableFunction(
      "MidoriCpuBudget::SetPercentage", [promise, aPercentage] {
        ManagedCpuBudgetState result;
        result.requestedPercentage = aPercentage;
#if (defined(XP_LINUX) && !defined(ANDROID)) || defined(XP_WIN) || \
    defined(XP_MACOSX)
        StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
        if (sMidoriCpuBudgetClosing) {
          promise->Reject(NS_ERROR_ABORT, __func__);
          return;
        }
#endif
#if defined(XP_LINUX) && !defined(ANDROID)
        if (sMidoriCpuBudgetController) {
          result.backendReady = true;
          CpuBudgetState state;
          result.nativeError =
              sMidoriCpuBudgetController->SetPercentage(aPercentage, state);
          if (!result.nativeError) {
            result.applied = true;
            result.externalCapacityCpus = state.externalCapacityCpus;
            result.ownQuotaCpus = state.ownQuotaCpus;
            result.effectiveCapacityCpus = state.effectiveCapacityCpus;
            result.quotaQuantumCpus = state.quotaQuantumCpus;
          }
        }
#elif defined(XP_WIN)
        if (sMidoriCpuBudgetController) {
          result.backendReady = true;
          WindowsCpuBudgetState state;
          result.nativeError =
              sMidoriCpuBudgetController->SetNormalizedPercentage(aPercentage, state);
          if (!result.nativeError) {
            result.applied = true;
            result.externalCapacityCpus = state.externalCapacityCpus;
            result.ownQuotaCpus = state.ownQuotaCpus;
            result.effectiveCapacityCpus = state.effectiveCapacityCpus;
            result.quotaQuantumCpus = state.quotaQuantumCpus;
          }
        }
#elif defined(XP_MACOSX)
        if (sMidoriCpuBudgetController) {
          result.backendReady = true;
          MacCpuBudgetState state;
          result.nativeError = sMidoriCpuBudgetController->SetPercentage(aPercentage, state);
          if (!result.nativeError) {
            result.applied = true;
            result.externalCapacityCpus = state.externalCapacityCpus;
            result.ownQuotaCpus = state.ownQuotaCpus;
            result.effectiveCapacityCpus = state.effectiveCapacityCpus;
            result.quotaQuantumCpus = state.quotaQuantumCpus;
          } else {
            dom::NotifyManagedWorkerCpuQuota(0);
          }
        }
#endif
        if (result.applied)
          dom::NotifyManagedWorkerCpuQuota(result.ownQuotaCpus);
        promise->Resolve(result, __func__);
      }));
  if (NS_FAILED(rv)) promise->Reject(rv, __func__);
  return promise;
}

RefPtr<ManagedMemoryBudgetPromise> RequestManagedMemoryBudget(uint64_t aBytes,
                                                              bool aUpdate) {
  MOZ_ASSERT(NS_IsMainThread());
  if (aUpdate && aBytes &&
      !Preferences::GetBool("midori.performance.memory.experimental.enabled",
                            false)) {
    return ManagedMemoryBudgetPromise::CreateAndReject(NS_ERROR_NOT_AVAILABLE,
                                                       __func__);
  }
  nsCOMPtr<nsISerialEventTarget> target = ManagedBudgetTarget();
  if (!target) {
    return ManagedMemoryBudgetPromise::CreateAndReject(NS_ERROR_NOT_AVAILABLE,
                                                       __func__);
  }
  RefPtr<ManagedMemoryBudgetPromise::Private> promise =
      new ManagedMemoryBudgetPromise::Private(__func__);
  nsresult rv = target->Dispatch(NS_NewRunnableFunction(
      "MidoriMemoryBudget::Request", [promise, aBytes, aUpdate] {
        ManagedMemoryBudgetState state;
#if defined(XP_LINUX) && !defined(ANDROID)
        StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
        if (sMidoriCpuBudgetClosing) {
          promise->Reject(NS_ERROR_ABORT, __func__);
          return;
        }
        if (sMidoriCpuBudgetController) {
          state.nativeError =
              sMidoriCpuBudgetController->MemoryBudget(aBytes, aUpdate, state);
        }
#endif
        state.requestedBytes = aBytes;
        promise->Resolve(state, __func__);
      }));
  if (NS_FAILED(rv)) promise->Reject(rv, __func__);
  return promise;
}

}  // namespace mozilla::midori
