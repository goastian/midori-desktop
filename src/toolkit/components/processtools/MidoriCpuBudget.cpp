/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MidoriCpuBudget.h"
#include "mozilla/MidoriCpuBudget_linux.h"
#include "mozilla/Preferences.h"
#include "mozilla/StaticBackgroundTaskQueue.h"
#include "mozilla/StaticMutex.h"
#include "nsThreadUtils.h"

namespace mozilla::midori {

#if defined(XP_LINUX) && !defined(ANDROID)
static StaticMutex sMidoriCpuBudgetMutex;
static LinuxCpuBudget* sMidoriCpuBudgetController = nullptr;
#endif

void SetManagedCpuBudgetController(LinuxCpuBudget* aController) {
  MOZ_ASSERT(NS_IsMainThread());
#if defined(XP_LINUX) && !defined(ANDROID)
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  MOZ_ASSERT(!sMidoriCpuBudgetController || !aController);
  sMidoriCpuBudgetController = aController;
#endif
}

int RestoreManagedCpuBudget() {
#if defined(XP_LINUX) && !defined(ANDROID)
  StaticMutexAutoLock lock(sMidoriCpuBudgetMutex);
  if (sMidoriCpuBudgetController) {
    auto* controller = sMidoriCpuBudgetController;
    sMidoriCpuBudgetController = nullptr;
    CpuBudgetState state;
    return controller->SetPercentage(0, state);
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
          }
        }
#endif
        promise->Resolve(result, __func__);
      }));
  if (NS_FAILED(rv)) promise->Reject(rv, __func__);
  return promise;
}

}  // namespace mozilla::midori
