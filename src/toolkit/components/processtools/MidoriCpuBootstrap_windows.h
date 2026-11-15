/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBOOTSTRAP_WINDOWS_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBOOTSTRAP_WINDOWS_H_

#ifdef _WIN32
#  include <cstdint>

namespace mozilla::midori {

enum class WindowsCpuParent : uint32_t {
  Unknown,
  LauncherJobWithoutCpuLimit,
};

extern const volatile WindowsCpuParent gMidoriCpuParent;

}  // namespace mozilla::midori
#endif

#endif
