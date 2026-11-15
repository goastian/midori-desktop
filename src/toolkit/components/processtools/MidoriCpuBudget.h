/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGET_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGET_H_

#include "mozilla/MozPromise.h"

namespace mozilla::midori {

class LinuxCpuBudget;

struct ManagedCpuBudgetState {
  bool backendReady = false;
  bool applied = false;
  uint32_t nativeError = 0;
  uint32_t requestedPercentage = 0;
  double externalCapacityCpus = 0;
  double ownQuotaCpus = 0;
  double effectiveCapacityCpus = 0;
};

using ManagedCpuBudgetPromise =
    MozPromise<ManagedCpuBudgetState, nsresult, true>;

void SetManagedCpuBudgetController(LinuxCpuBudget* aController);
int RestoreManagedCpuBudget();
RefPtr<ManagedCpuBudgetPromise> RequestManagedCpuBudget(uint32_t aPercentage);

}  // namespace mozilla::midori

#endif
