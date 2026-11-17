/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MidoriCpuBudget.h"
#include "mozilla/MidoriCpuBudget_linux.h"
#include "mozilla/MidoriCpuBudget_windows.h"
#ifdef XP_WIN
#  include "mozilla/Atomics.h"
#endif
#include "mozilla/Preferences.h"
#include "mozilla/StaticBackgroundTaskQueue.h"
#include "mozilla/StaticMutex.h"
#include "nsThreadUtils.h"

namespace mozilla::midori {

#if (defined(XP_LINUX) && !defined(ANDROID)) || defined(XP_WIN)
static StaticMutex sMidoriCpuBudgetMutex;
static CpuBudgetController* sMidoriCpuBudgetController = nullptr;
#  ifdef XP_WIN
static Atomic<bool, Relaxed> sMidoriCpuBudgetContext(false);
#  endif
#endif

void SetManagedCpuBudgetController(CpuBudgetController* aController) {
  MOZ_ASSERT(NS_IsMainThread());
#if (defined(XP_LINUX) && !defined(ANDROID)) || defined(XP_WIN)
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  MOZ_ASSERT(!sMidoriCpuBudgetController || !aController);
  sMidoriCpuBudgetController = aController;
#  ifdef XP_WIN
  if (aController) sMidoriCpuBudgetContext = true;
#  endif
#endif
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
#endif
  return result;
}

#if defined(XP_LINUX) && !defined(ANDROID)
int OpenManagedCpuChildProcess(int& aFile) {
  aFile = -1;
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  return sMidoriCpuBudgetController
             ? sMidoriCpuBudgetController->OpenChildProcessFile(aFile)
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
#endif

int RestoreManagedCpuBudget() {
#if (defined(XP_LINUX) && !defined(ANDROID)) || defined(XP_WIN)
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  if (sMidoriCpuBudgetController) {
    auto* controller = sMidoriCpuBudgetController;
    sMidoriCpuBudgetController = nullptr;
#  ifdef XP_WIN
    WindowsCpuBudgetState state;
    return controller->SetNormalizedPercentage(0, state);
#  else
    CpuBudgetState state;
    return controller->SetPercentage(0, state);
#  endif
  }
#endif
  return 0;
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
  static StaticBackgroundTaskQueue queue("MidoriCpuBudget");
  nsCOMPtr<nsISerialEventTarget> target = queue.Get();
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
#if defined(XP_LINUX) && !defined(ANDROID)
        StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
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
        StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
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
#endif
        promise->Resolve(result, __func__);
      }));
  if (NS_FAILED(rv)) promise->Reject(rv, __func__);
  return promise;
}

}  // namespace mozilla::midori
