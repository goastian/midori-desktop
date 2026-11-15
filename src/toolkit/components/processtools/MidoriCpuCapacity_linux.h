/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUCAPACITY_LINUX_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUCAPACITY_LINUX_H_

#include <cstdint>

#if defined(XP_LINUX) && !defined(ANDROID)
#  include "mozilla/ScopeExit.h"
#  include "nsString.h"
#  include <cerrno>
#  include <cstdio>
#  include <cstring>
#  include <sched.h>
#  include <sys/vfs.h>
#  include <unistd.h>
#endif

namespace mozilla::midori {

struct CpuCapacity {
  uint32_t affinityCpus = 0;
  double quotaCpus = 0;
  double effectiveCpus = 0;
  bool quotaSampled = false;
};

#if defined(XP_LINUX) && !defined(ANDROID)
inline uint32_t AffinityCpus() {
  for (size_t count = 1024; count <= 65536; count *= 2) {
    cpu_set_t* mask = CPU_ALLOC(count);
    if (!mask) return 0;
    auto cleanup = MakeScopeExit([&] { CPU_FREE(mask); });
    const size_t size = CPU_ALLOC_SIZE(count);
    if (sched_getaffinity(getpid(), size, mask) == 0) {
      return CPU_COUNT_S(size, mask);
    }
    if (errno != EINVAL) return 0;
  }
  return 0;
}

inline bool PositiveInteger(const char* aText, uint64_t& aValue) {
  aValue = 0;
  if (!*aText) return false;
  for (; *aText; ++aText) {
    if (*aText < '0' || *aText > '9') return false;
    const uint64_t digit = *aText - '0';
    if (aValue > (UINT64_MAX - digit) / 10) return false;
    aValue = aValue * 10 + digit;
  }
  return aValue > 0;
}

inline bool CurrentCgroup(nsCString& aPath) {
  constexpr long kCgroupV2Magic = 0x63677270;
  struct statfs filesystem;
  if (statfs("/sys/fs/cgroup", &filesystem) ||
      filesystem.f_type != kCgroupV2Magic) {
    return false;
  }
  FILE* file = fopen("/proc/self/cgroup", "re");
  if (!file) return false;
  auto cleanup = MakeScopeExit([&] { fclose(file); });
  char line[4096];
  while (fgets(line, sizeof(line), file)) {
    if (strncmp(line, "0::/", 4)) continue;
    char* end = strchr(line, '\n');
    if (!end) return false;
    *end = '\0';
    nsCString group(line + 3);
    if (group.Find("/../") >= 0 || group.Find("/./") >= 0 ||
        (group.Length() >= 3 &&
         Substring(group, group.Length() - 3).EqualsLiteral("/..")) ||
        (group.Length() >= 2 &&
         Substring(group, group.Length() - 2).EqualsLiteral("/."))) {
      return false;
    }
    aPath.AssignLiteral("/sys/fs/cgroup");
    if (group.Length() > 1) aPath.Append(group);
    nsCString members(aPath);
    members.AppendLiteral("/cgroup.procs");
    FILE* processes = fopen(members.get(), "re");
    if (!processes) return false;
    auto closeProcesses = MakeScopeExit([&] { fclose(processes); });
    unsigned long long pid;
    for (size_t count = 0;
         count < 65536 && fscanf(processes, "%llu", &pid) == 1; ++count) {
      if (pid == uint64_t(getpid())) return true;
    }
    return false;
  }
  return false;
}

inline bool VisibleQuotaCpus(double& aQuota) {
  nsCString path;
  if (!CurrentCgroup(path)) return false;
  constexpr size_t rootLength = sizeof("/sys/fs/cgroup") - 1;
  double maximum = 0;
  while (true) {
    nsCString name(path);
    name.AppendLiteral("/cpu.max");
    FILE* file = fopen(name.get(), "re");
    if (file) {
      char quota[64], period[64], extra;
      const int fields = fscanf(file, "%63s %63s %c", quota, period, &extra);
      fclose(file);
      uint64_t duration;
      if (fields != 2 || !PositiveInteger(period, duration)) return false;
      if (strcmp(quota, "max")) {
        uint64_t budget;
        if (!PositiveInteger(quota, budget)) return false;
        const double limit = double(budget) / duration;
        if (!maximum || limit < maximum) maximum = limit;
      }
    } else if (errno != ENOENT) {
      return false;
    }
    if (path.Length() == rootLength) break;
    const int32_t separator = path.RFindChar('/');
    path.Truncate(separator < int32_t(rootLength) ? rootLength : separator);
  }
  aQuota = maximum;
  return true;
}
#endif

inline CpuCapacity ReadCpuCapacity() {
  CpuCapacity result;
#if defined(XP_LINUX) && !defined(ANDROID)
  result.affinityCpus = AffinityCpus();
  result.quotaSampled = VisibleQuotaCpus(result.quotaCpus);
  result.effectiveCpus = result.affinityCpus;
  if (result.quotaCpus && result.effectiveCpus > result.quotaCpus) {
    result.effectiveCpus = result.quotaCpus;
  }
#endif
  return result;
}

}  // namespace mozilla::midori

#endif
