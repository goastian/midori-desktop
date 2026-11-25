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
int SetManagedAudioCpuActivity(uintptr_t aOwner, bool aActive);
#ifdef XP_MACOSX
int RegisterManagedCpuTask(uintptr_t aOwner, uint32_t aPid, uint32_t aTask);
int UnregisterManagedCpuTask(uintptr_t aOwner);
#endif
#if defined(XP_LINUX) && !defined(ANDROID)
int OpenManagedCpuExternalProcess(int& aFile);
int OpenManagedCpuChildProcess(bool aContent, int& aFile);
int OpenManagedCpuChildThreadFiles(bool aContent, int& aNormal, int& aRealtime);
int OpenManagedCpuGioLaunchFiles(int& aExternal, int& aOwn);
int OpenManagedCpuRestartFiles(int& aGroup, int& aExternal, int& aMemory);
#endif
#ifdef XP_WIN
bool HasManagedCpuBudgetContext();
#endif

using ManagedCpuBudgetPromise =
    MozPromise<ManagedCpuBudgetState, nsresult, true>;
using ManagedMemoryBudgetPromise =
    MozPromise<ManagedMemoryBudgetState, nsresult, true>;

int SetManagedCpuBudgetController(CpuBudgetController* aController);
int BeginManagedCpuBudgetShutdown();
int RestoreManagedCpuBudget();
RefPtr<ManagedCpuBudgetPromise> RequestManagedCpuBudget(uint32_t aPercentage);
RefPtr<ManagedMemoryBudgetPromise> RequestManagedMemoryBudget(uint64_t aBytes,
                                                              bool aUpdate);

}  // namespace mozilla::midori

#endif
