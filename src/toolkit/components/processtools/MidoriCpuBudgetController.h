/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGETCONTROLLER_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGETCONTROLLER_H_

#include <cstdint>

namespace mozilla::midori {

struct ManagedMemoryBudgetState {
  bool backendReady = false;
  bool applied = false;
  bool ownedLimit = false;
  bool hasLimit = false;
  bool hasExternalLimit = false;
  bool hasEffectiveLimit = false;
  bool swapMeasured = false;
  bool roleAccountingMeasured = false;
  uint32_t nativeError = 0;
  uint32_t roleAccountingError = 0;
  uint64_t requestedBytes = 0;
  uint64_t currentBytes = 0;
  uint64_t uiBytes = 0;
  uint64_t contentBytes = 0;
  uint64_t unattributedBytes = 0;
  uint64_t limitBytes = 0;
  uint64_t externalLimitBytes = 0;
  uint64_t effectiveLimitBytes = 0;
  uint64_t swapBytes = 0;
  uint64_t recoveryHeadroomBytes = 0;
  uint64_t minimumBytes = 0;
  uint64_t oomEvents = 0;
  uint64_t oomKills = 0;
  uint64_t maxEvents = 0;
};

class LinuxCpuBudget;
class WindowsCpuBudget;
class MacCpuBudget;

#ifdef XP_WIN
using CpuBudgetController = WindowsCpuBudget;
#elif defined(XP_MACOSX)
using CpuBudgetController = MacCpuBudget;
#else
using CpuBudgetController = LinuxCpuBudget;
#endif

}  // namespace mozilla::midori

#endif
