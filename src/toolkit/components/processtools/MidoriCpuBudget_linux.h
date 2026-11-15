/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGET_LINUX_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGET_LINUX_H_

#if defined(XP_LINUX) && !defined(ANDROID)
#  include <algorithm>
#  include <cerrno>
#  include <cmath>
#  include <cstdint>
#  include <cstdio>
#  include <cstring>
#  include <dirent.h>
#  include <fcntl.h>
#  include <sched.h>
#  include <sys/stat.h>
#  include <sys/vfs.h>
#  include <unistd.h>

namespace mozilla::midori {

struct CpuBudgetState {
  uint32_t requestedPercentage = 0;
  double externalCapacityCpus = 0;
  double ownQuotaCpus = 0;
  double effectiveCapacityCpus = 0;
  double quotaQuantumCpus = 0;
};

// The launcher supplies its exclusive, delegated leaf before creating children.
class LinuxCpuBudget final {
 public:
  LinuxCpuBudget() = default;
  LinuxCpuBudget(const LinuxCpuBudget&) = delete;
  LinuxCpuBudget& operator=(const LinuxCpuBudget&) = delete;

  ~LinuxCpuBudget() {
    if (mGroup >= 0) {
      if (IsOwner()) WriteLimit(mGroup, mOriginalQuota, mOriginalPeriod);
      close(mGroup);
    }
  }

  int Initialize(int aGroup) {
    if (mGroup >= 0) return EALREADY;
    if (getuid() != geteuid() || !getuid()) return EPERM;
    struct statfs filesystem;
    struct stat directory;
    if (fstatfs(aGroup, &filesystem) || fstat(aGroup, &directory)) return errno;
    if (filesystem.f_type != 0x63677270 || !S_ISDIR(directory.st_mode) ||
        directory.st_uid != geteuid())
      return EPERM;
    char value[4096];
    int error = Read(aGroup, "cgroup.type", value, sizeof(value));
    if (error) return error;
    if (strcmp(value, "domain\n")) return ENOTSUP;
    error = Read(aGroup, "cgroup.procs", value, sizeof(value));
    if (error) return error;
    char self[32];
    snprintf(self, sizeof(self), "%ld\n", long(getpid()));
    if (strcmp(value, self)) return EBUSY;
    int duplicate = openat(aGroup, ".", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
    if (duplicate < 0) return errno;
    DIR* contents = fdopendir(duplicate);
    if (!contents) {
      error = errno;
      close(duplicate);
      return error;
    }
    dirent* entry;
    errno = 0;
    while ((entry = readdir(contents))) {
      if (!strcmp(entry->d_name, ".") || !strcmp(entry->d_name, "..")) continue;
      struct stat child;
      if (fstatat(aGroup, entry->d_name, &child, AT_SYMLINK_NOFOLLOW)) break;
      if (S_ISDIR(child.st_mode)) {
        errno = EBUSY;
        break;
      }
    }
    error = errno;
    closedir(contents);
    if (error) return error;
    if (!SingleProcessAtStartup()) return EBUSY;
    uint64_t quota, period;
    error = ReadLimit(aGroup, quota, period);
    if (error) return error;
    if (quota) return EBUSY;
    error = Read(aGroup, "cpu.max.burst", value, sizeof(value));
    if (error != ENOENT && (error || strcmp(value, "0\n"))) {
      return error ? error : EBUSY;
    }
    int file = openat(aGroup, "cpu.max", O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
    if (file < 0) return errno;
    close(file);
    double capacity;
    error = ExternalCapacity(aGroup, capacity);
    if (error) return error;
    struct stat pidNamespace;
    if (stat("/proc/self/ns/pid", &pidNamespace)) return errno;
    int group = fcntl(aGroup, F_DUPFD_CLOEXEC, 0);
    if (group < 0) return errno;
    mGroup = group;
    mOwner = getpid();
    mPidNamespaceDevice = pidNamespace.st_dev;
    mPidNamespaceInode = pidNamespace.st_ino;
    mOriginalQuota = quota;
    mOriginalPeriod = period;
    return 0;
  }

  int SetPercentage(uint32_t aPercentage, CpuBudgetState& aState) {
    if (mGroup < 0) return ENODEV;
    if (!IsOwner()) return EPERM;
    if (aPercentage > 100) return EINVAL;
    double capacity = 0;
    int error = ExternalCapacity(mGroup, capacity);
    if (error) {
      if (aPercentage) return error;
      capacity = 0;
    }
    uint64_t period = aPercentage ? 100000 : mOriginalPeriod;
    double desired = capacity * period * aPercentage / 100;
    if (aPercentage && (!std::isfinite(desired) || desired < 1000 ||
                        desired >= double(UINT64_MAX)))
      return ERANGE;
    uint64_t quota =
        aPercentage ? uint64_t(std::floor(desired)) : mOriginalQuota;
    uint64_t previousQuota, previousPeriod;
    error = ReadLimit(mGroup, previousQuota, previousPeriod);
    if (error) return error;
    if (quota != previousQuota || period != previousPeriod) {
      error = WriteLimit(mGroup, quota, period);
      if (error) return error;
      uint64_t actualQuota, actualPeriod;
      error = ReadLimit(mGroup, actualQuota, actualPeriod);
      if (error || actualQuota != quota || actualPeriod != period) {
        int restored = WriteLimit(mGroup, previousQuota, previousPeriod);
        return restored ? restored : error ? error : EIO;
      }
    }
    mPercentage = aPercentage;
    aState.requestedPercentage = aPercentage;
    aState.externalCapacityCpus = capacity;
    aState.ownQuotaCpus = quota ? double(quota) / period : 0;
    aState.effectiveCapacityCpus =
        quota ? std::min(capacity, aState.ownQuotaCpus) : capacity;
    aState.quotaQuantumCpus = quota ? 1.0 / period : 0;
    return 0;
  }

  int ReadExternalCapacity(double& aCapacity) const {
    aCapacity = 0;
    if (mGroup < 0) return ENODEV;
    if (!IsOwner()) return EPERM;
    return ExternalCapacity(mGroup, aCapacity);
  }

  int Refresh(CpuBudgetState& aState) {
    return SetPercentage(mPercentage, aState);
  }

 private:
  bool IsOwner() const {
    if (getpid() != mOwner) return false;
    struct stat pidNamespace;
    return !stat("/proc/self/ns/pid", &pidNamespace) &&
           pidNamespace.st_dev == mPidNamespaceDevice &&
           pidNamespace.st_ino == mPidNamespaceInode;
  }

  static int Read(int aDirectory, const char* aName, char* aValue,
                  size_t aSize) {
    int file = openat(aDirectory, aName, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (file < 0) return errno;
    size_t count = 0;
    int error = 0;
    while (count < aSize - 1) {
      ssize_t length = read(file, aValue + count, aSize - count - 1);
      if (length < 0) {
        if (errno == EINTR) continue;
        error = errno;
        break;
      }
      if (!length) break;
      count += size_t(length);
    }
    if (!error && count == aSize - 1) error = EOVERFLOW;
    close(file);
    aValue[count] = 0;
    return error;
  }

  static bool Integer(const char* aValue, uint64_t& aResult) {
    aResult = 0;
    if (!*aValue) return false;
    for (; *aValue; ++aValue) {
      if (*aValue < '0' || *aValue > '9') return false;
      uint64_t digit = *aValue - '0';
      if (aResult > (UINT64_MAX - digit) / 10) return false;
      aResult = aResult * 10 + digit;
    }
    return aResult != 0;
  }

  static int ReadLimit(int aGroup, uint64_t& aQuota, uint64_t& aPeriod) {
    char value[160], quota[64], period[64], extra;
    int error = Read(aGroup, "cpu.max", value, sizeof(value));
    if (error) return error;
    if (sscanf(value, "%63s %63s %c", quota, period, &extra) != 2 ||
        !Integer(period, aPeriod) || aPeriod < 1000 || aPeriod > 1000000)
      return EINVAL;
    if (!strcmp(quota, "max"))
      aQuota = 0;
    else if (!Integer(quota, aQuota))
      return EINVAL;
    return 0;
  }

  static int WriteLimit(int aGroup, uint64_t aQuota, uint64_t aPeriod) {
    char value[160];
    int length = aQuota ? snprintf(value, sizeof(value), "%llu %llu",
                                   (unsigned long long)aQuota,
                                   (unsigned long long)aPeriod)
                        : snprintf(value, sizeof(value), "max %llu",
                                   (unsigned long long)aPeriod);
    int file = openat(aGroup, "cpu.max", O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
    if (file < 0) return errno;
    ssize_t count;
    do {
      count = write(file, value, size_t(length));
    } while (count < 0 && errno == EINTR);
    int error = count == length ? 0 : count < 0 ? errno : EIO;
    close(file);
    return error;
  }

  static bool SingleProcessAtStartup() {
    DIR* tasks = opendir("/proc/self/task");
    if (!tasks) return false;
    size_t count = 0;
    dirent* entry;
    errno = 0;
    while ((entry = readdir(tasks))) {
      if (entry->d_name[0] != '.') ++count;
    }
    bool valid = !errno && count == 1;
    closedir(tasks);
    if (!valid) return false;
    char path[96], value[64];
    snprintf(path, sizeof(path), "/proc/self/task/%ld/children",
             long(getpid()));
    int error = Read(AT_FDCWD, path, value, sizeof(value));
    return !error && !*value;
  }

  static int ExternalCapacity(int aGroup, double& aCapacity) {
    aCapacity = 0;
    for (size_t count = 1024; count <= 65536; count *= 2) {
      cpu_set_t* mask = CPU_ALLOC(count);
      if (!mask) return ENOMEM;
      size_t bytes = CPU_ALLOC_SIZE(count);
      int code = sched_getaffinity(getpid(), bytes, mask);
      int error = errno;
      if (!code) aCapacity = CPU_COUNT_S(bytes, mask);
      CPU_FREE(mask);
      if (!code) break;
      if (error != EINVAL || count == 65536) return error;
    }
    if (aCapacity <= 0) return EINVAL;
    int group =
        openat(aGroup, "..", O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    if (group < 0) return errno;
    int result = 0;
    for (unsigned depth = 0; depth < 1024; ++depth) {
      struct statfs filesystem;
      struct stat current, parent;
      if (fstatfs(group, &filesystem) || fstat(group, &current)) {
        result = errno;
        break;
      }
      if (filesystem.f_type != 0x63677270) break;
      uint64_t quota, period;
      int error = ReadLimit(group, quota, period);
      if (error && error != ENOENT) {
        result = error;
        break;
      }
      if (!error && quota)
        aCapacity = std::min(aCapacity, double(quota) / period);
      int next =
          openat(group, "..", O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
      if (next < 0) {
        result = errno;
        break;
      }
      if (fstat(next, &parent)) {
        result = errno;
        close(next);
        break;
      }
      bool root =
          parent.st_dev == current.st_dev && parent.st_ino == current.st_ino;
      close(group);
      group = next;
      if (root) break;
      if (depth == 1023) result = ELOOP;
    }
    close(group);
    return result;
  }

  int mGroup = -1;
  pid_t mOwner = 0;
  dev_t mPidNamespaceDevice = 0;
  ino_t mPidNamespaceInode = 0;
  uint32_t mPercentage = 0;
  uint64_t mOriginalQuota = 0;
  uint64_t mOriginalPeriod = 100000;
};

}  // namespace mozilla::midori
#endif

#endif
