/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORIPROCESSBUDGETARGS_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORIPROCESSBUDGETARGS_H_

#if defined(XP_LINUX) && !defined(ANDROID)
#  include "mozilla/GeckoArgs.h"
#  include "mozilla/MidoriCpuBudget_linux.h"
#  include "mozilla/MidoriCpuThreadPlacement.h"

namespace mozilla::midori {

static geckoargs::CommandLineArg<UniqueFileHandle> sProcessBudgetGroup{
    "-midoriBudgetGroup", "midoribudgetgroup"};
static geckoargs::CommandLineArg<UniqueFileHandle> sProcessCpuNormal{
    "-midoriCpuNormal", "midoricpunormal"};
static geckoargs::CommandLineArg<UniqueFileHandle> sProcessCpuRealtime{
    "-midoriCpuRealtime", "midoricpurealtime"};

inline bool JoinProcessBudgetGroup(int& aArgc, char** aArgv) {
  if (!sProcessBudgetGroup.IsPresent(aArgc, aArgv)) return true;
  auto group = sProcessBudgetGroup.Get(aArgc, aArgv);
  if (!group || !*group || LinuxCpuBudget::JoinChildProcessFile(group->get()))
    return false;
  if (!sProcessCpuNormal.IsPresent(aArgc, aArgv) &&
      !sProcessCpuRealtime.IsPresent(aArgc, aArgv))
    return true;
  auto normal = sProcessCpuNormal.Get(aArgc, aArgv);
  auto realtime = sProcessCpuRealtime.Get(aArgc, aArgv);
  if (!normal || !*normal || !realtime || !*realtime) return false;
  return !InstallManagedCpuThreadPlacement(normal->release(),
                                           realtime->release());
}

}  // namespace mozilla::midori
#endif

#endif
