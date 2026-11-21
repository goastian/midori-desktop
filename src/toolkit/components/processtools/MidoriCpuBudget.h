/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGET_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGET_H_

#include "mozilla/MidoriCpuBudgetController.h"
#include "mozilla/MozPromise.h"

namespace mozilla::midori {

struct ManagedCpuBudgetState {
  bool backendReady = false;
  bool applied = false;
  uint32_t nativeError = 0;
  uint32_t requestedPercentage = 0;
  double externalCapacityCpus = 0;
  double ownQuotaCpus = 0;
  double effectiveCapacityCpus = 0;
  double quotaQuantumCpus = 0;
};

struct ManagedCpuCapacity {
  bool managed = false;
  double externalCapacityCpus = 0;
  int nativeError = 0;
};

ManagedCpuCapacity ReadManagedCpuCapacity();
int SetManagedWorkerCpuRole(uintptr_t aOwner, uint32_t aPid, uint64_t aTid,
                            bool aBackground, bool aAlive);
#if defined(XP_LINUX) && !defined(ANDROID)
int OpenManagedCpuExternalProcess(int& aFile);
int OpenManagedCpuChildProcess(int& aFile);
int OpenManagedCpuGioLaunchFiles(int& aExternal, int& aOwn);
int OpenManagedCpuRestartFiles(int& aGroup, int& aExternal);
#endif
#ifdef XP_WIN
bool HasManagedCpuBudgetContext();
#endif

using ManagedCpuBudgetPromise =
    MozPromise<ManagedCpuBudgetState, nsresult, true>;

void SetManagedCpuBudgetController(CpuBudgetController* aController);
int BeginManagedCpuBudgetShutdown();
int RestoreManagedCpuBudget();
RefPtr<ManagedCpuBudgetPromise> RequestManagedCpuBudget(uint32_t aPercentage);

}  // namespace mozilla::midori

#endif
