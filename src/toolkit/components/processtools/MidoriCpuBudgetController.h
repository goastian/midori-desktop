/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGETCONTROLLER_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGETCONTROLLER_H_

namespace mozilla::midori {

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
