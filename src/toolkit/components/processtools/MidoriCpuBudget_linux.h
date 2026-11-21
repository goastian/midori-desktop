/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGET_LINUX_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGET_LINUX_H_

#if defined(XP_LINUX) && !defined(ANDROID)
#  include "MidoriWorkerCpuRoles_linux.h"
#  include <algorithm>
#  include <cerrno>
#  include <cmath>
#  include <cstdint>
#  include <cstdio>
#  include <cstdlib>
#  include <cstring>
#  include <dirent.h>
#  include <dlfcn.h>
#  include <fcntl.h>
#  include <poll.h>
#  include <sched.h>
#  include <sys/socket.h>
#  include <sys/stat.h>
#  include <sys/vfs.h>
#  include <sys/xattr.h>
#  include <time.h>
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
    if (mExternalGroup >= 0) close(mExternalGroup);
    if (mGroup >= 0) {
      if (IsOwner()) {
        WriteLimit(mGroup, mOriginalQuota, mOriginalPeriod);
        ReleaseRoles();
      } else {
        if (mUiGroup >= 0) close(mUiGroup);
        if (mContentGroup >= 0) close(mContentGroup);
      }
      close(mGroup);
    }
  }

  int Initialize(int aGroup, int aExternalGroup = -1) {
    if (mGroup >= 0) return EALREADY;
    int error = ValidateExclusiveGroup(aGroup);
    if (error) return error;
    char value[4096];
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
    int external = -1;
    if (aExternalGroup >= 0) {
      error = PrepareExternalGroup(aGroup, aExternalGroup, external);
      if (error) return error;
    }
    int group = fcntl(aGroup, F_DUPFD_CLOEXEC, 3);
    if (group < 0) {
      error = errno;
      if (external >= 0) close(external);
      return error;
    }
    mExternalGroup = external;
    mGroup = group;
    mOwner = getpid();
    mPidNamespaceDevice = pidNamespace.st_dev;
    mPidNamespaceInode = pidNamespace.st_ino;
    mOriginalQuota = quota;
    mOriginalPeriod = period;
    error = PrepareRoles();
    if (error) {
      int restored = ReleaseRoles();
      close(mGroup);
      mGroup = -1;
      if (mExternalGroup >= 0) close(mExternalGroup);
      mExternalGroup = -1;
      return restored ? restored : error;
    }
    return 0;
  }

  // A failed rollback must stop startup in the changed cgroup.
  int InitializeDelegated(bool& aRestoreFailed) {
    aRestoreFailed = false;
    if (mGroup >= 0) return EALREADY;
    int root;
    int error = OpenCurrentGroup(root);
    if (error) return error;
    int group = -1, external = -1;
    bool groupCreated = false, externalCreated = false;
    bool moved = false, cpuChanged = false;
    auto finish = [&](int aError) {
      int restored = 0;
      if (aError) {
        if (cpuChanged)
          restored = WriteValue(root, "cgroup.subtree_control", "-cpu");
        if (!restored && moved)
          restored = WriteValue(root, "cgroup.procs", "0");
        if (groupCreated && unlinkat(root, "midori-instance", AT_REMOVEDIR) &&
            !restored)
          restored = errno;
        if (externalCreated &&
            unlinkat(root, "midori-external", AT_REMOVEDIR) && !restored)
          restored = errno;
      }
      if (group >= 0) close(group);
      if (external >= 0) close(external);
      close(root);
      aRestoreFailed = restored != 0;
      return restored ? restored : aError;
    };
    error = ValidateExclusiveGroup(root);
    if (error) return finish(error);
    char delegated[2];
    ssize_t size =
        fgetxattr(root, "user.delegate", delegated, sizeof(delegated));
    if (size < 0) {
      if (errno != ENODATA && errno != EOPNOTSUPP) return finish(errno);
      error = VerifyManagerDelegation(root);
      if (error) return finish(error);
      error = ValidateExclusiveGroup(root);
      if (error) return finish(error);
    } else if (size != 1 || delegated[0] != '1') {
      return finish(EPERM);
    }
    char value[4096];
    error = Read(root, "cgroup.controllers", value, sizeof(value));
    if (error) return finish(error);
    bool available = false;
    char* saved;
    for (char* name = strtok_r(value, " \n", &saved); name;
         name = strtok_r(nullptr, " \n", &saved)) {
      if (!strcmp(name, "cpu")) available = true;
    }
    if (!available) return finish(ENOTSUP);
    error = Read(root, "cgroup.subtree_control", value, sizeof(value));
    if (error) return finish(error);
    for (char* name = strtok_r(value, " \n", &saved); name;
         name = strtok_r(nullptr, " \n", &saved)) {
      if (!strcmp(name, "cpu")) return finish(EBUSY);
    }
    if (mkdirat(root, "midori-external", 0755)) return finish(errno);
    externalCreated = true;
    external = openat(root, "midori-external",
                      O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    if (external < 0) return finish(errno);
    if (mkdirat(root, "midori-instance", 0755)) return finish(errno);
    groupCreated = true;
    group = openat(root, "midori-instance",
                   O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    if (group < 0) return finish(errno);
    error = WriteValue(external, "cgroup.procs", "0");
    if (error) return finish(error);
    moved = true;
    error = WriteValue(root, "cgroup.subtree_control", "+cpu");
    if (error) return finish(error);
    cpuChanged = true;
    error = WriteValue(group, "cgroup.procs", "0");
    if (error) return finish(error);
    return finish(Initialize(group, external));
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
    bool previousDistribution;
    error = ReadRoleDistribution(previousDistribution);
    if (error) return error;
    if (aPercentage) {
      error = SetRoleDistribution(true);
      if (error) return error;
    }
    auto rollback = [&] {
      int restored = WriteLimit(mGroup, previousQuota, previousPeriod);
      int roles = SetRoleDistribution(previousDistribution);
      return restored ? restored : roles;
    };
    if (quota != previousQuota || period != previousPeriod) {
      error = WriteLimit(mGroup, quota, period);
      if (error) {
        int restored = rollback();
        return restored ? restored : error;
      }
      uint64_t actualQuota, actualPeriod;
      error = ReadLimit(mGroup, actualQuota, actualPeriod);
      if (error || actualQuota != quota || actualPeriod != period) {
        int restored = rollback();
        return restored ? restored : error ? error : EIO;
      }
    }
    if (!aPercentage) {
      error = SetRoleDistribution(false);
      if (error) {
        int restored = rollback();
        return restored ? restored : error;
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

  int SetWorkerRole(uintptr_t aOwner, uint32_t aPid, uint64_t aTid,
                    bool aBackground, bool aAlive) {
    if (mGroup < 0) return ENODEV;
    if (!IsOwner()) return EPERM;
    if (!aOwner || !aPid || aPid > INT32_MAX) return EINVAL;
    return mWorkerRoles.SetWorker(aOwner, pid_t(aPid), aTid, aBackground,
                                  aAlive);
  }

  int Shutdown() {
    if (mGroup < 0) return 0;
    if (!IsOwner()) return EPERM;
    int error = WriteLimit(mGroup, mOriginalQuota, mOriginalPeriod);
    if (!error) error = ReleaseRoles();
    if (error) return error;
    if (mExternalGroup >= 0) close(mExternalGroup);
    mExternalGroup = -1;
    close(mGroup);
    mGroup = -1;
    mPercentage = 0;
    return 0;
  }

  int OpenExternalProcessFile(int& aFile) const {
    aFile = -1;
    if (mGroup < 0) return ENODEV;
    if (!IsOwner()) return EPERM;
    if (mExternalGroup < 0) return ENOTSUP;
    aFile = openat(mExternalGroup, "cgroup.procs",
                   O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
    if (aFile < 0) return errno;
    if (aFile < 3) {
      int original = aFile;
      aFile = fcntl(original, F_DUPFD_CLOEXEC, 3);
      int error = aFile < 0 ? errno : 0;
      close(original);
      return error;
    }
    return 0;
  }

  int Refresh(CpuBudgetState& aState) {
    return SetPercentage(mPercentage, aState);
  }

  int OpenGioLaunchFiles(int& aExternal, int& aOwn) const {
    aOwn = -1;
    int error = OpenExternalProcessFile(aExternal);
    if (error) return error;
    int file =
        openat(mUiGroup, "cgroup.procs", O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
    if (file >= 0) {
      aOwn = fcntl(file, F_DUPFD_CLOEXEC, 3);
      error = aOwn < 0 ? errno : 0;
      close(file);
    } else {
      error = errno;
    }
    if (error) {
      close(aExternal);
      aExternal = -1;
    }
    return error;
  }

  int OpenChildProcessFile(int& aFile) const {
    aFile = -1;
    if (mGroup < 0 || mContentGroup < 0) return ENODEV;
    if (!IsOwner()) return EPERM;
    int file = openat(mContentGroup, "cgroup.procs",
                      O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
    if (file < 0) return errno;
    aFile = fcntl(file, F_DUPFD_CLOEXEC, 3);
    int error = aFile < 0 ? errno : 0;
    close(file);
    return error;
  }

  int OpenRestartFiles(int& aGroup, int& aExternal) const {
    aGroup = aExternal = -1;
    if (mGroup < 0) return ENODEV;
    if (!IsOwner()) return EPERM;
    if (mExternalGroup < 0) return ENOTSUP;
    int group = fcntl(mGroup, F_DUPFD_CLOEXEC, 5);
    if (group < 0) return errno;
    int external = fcntl(mExternalGroup, F_DUPFD_CLOEXEC, 5);
    if (external < 0) {
      int error = errno;
      close(group);
      return error;
    }
    aGroup = group;
    aExternal = external;
    return 0;
  }

  static int WaitAndJoinRestartGroup(int aGroup, int aExternal) {
    if (!getuid() || getuid() != geteuid() || !SingleProcessAtStartup())
      return EPERM;
    struct statfs filesystem;
    struct stat directory;
    if (fstatfs(aGroup, &filesystem) || fstat(aGroup, &directory)) return errno;
    if (filesystem.f_type != 0x63677270 || !S_ISDIR(directory.st_mode) ||
        directory.st_uid != geteuid())
      return EPERM;
    int external = -1;
    int error = PrepareExternalGroup(aGroup, aExternal, external);
    if (error) return error;
    close(external);
    error = WriteValue(aExternal, "cgroup.procs", "0");
    if (error) return error;
    int events =
        openat(aGroup, "cgroup.events", O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (events < 0) return errno;
    error = WaitForEmptyGroup(events);
    close(events);
    if (error) return error;
    uint64_t quota, period;
    error = ReadLimit(aGroup, quota, period);
    if (error || quota) return error ? error : EBUSY;
    return WriteValue(aGroup, "cgroup.procs", "0");
  }

  static int JoinChildProcessFile(int aFile) {
    struct statfs filesystem;
    struct stat file;
    if (fstatfs(aFile, &filesystem) || fstat(aFile, &file)) return errno;
    if (filesystem.f_type != 0x63677270 || !S_ISREG(file.st_mode)) return EPERM;
    ssize_t count;
    do {
      count = write(aFile, "0", 1);
    } while (count < 0 && errno == EINTR);
    return count == 1 ? 0 : count < 0 ? errno : EIO;
  }

 private:
  static int VerifyManagerDelegation(int aGroup) {
    char socketPath[96], address[112];
    snprintf(socketPath, sizeof(socketPath), "/run/user/%lu/systemd/private",
             (unsigned long)getuid());
    struct stat socket;
    if (lstat(socketPath, &socket)) return errno == ENOENT ? ENODATA : errno;
    if (!S_ISSOCK(socket.st_mode) || socket.st_uid != getuid()) return EPERM;
    void* library = dlopen("libsystemd.so.0", RTLD_NOW | RTLD_LOCAL);
    if (!library) return ENOSYS;
    struct Bus;
    struct Message;
    auto create =
        reinterpret_cast<int (*)(Bus**)>(dlsym(library, "sd_bus_new"));
    auto setAddress = reinterpret_cast<int (*)(Bus*, const char*)>(
        dlsym(library, "sd_bus_set_address"));
    auto setTimeout = reinterpret_cast<int (*)(Bus*, uint64_t)>(
        dlsym(library, "sd_bus_set_method_call_timeout"));
    auto start =
        reinterpret_cast<int (*)(Bus*)>(dlsym(library, "sd_bus_start"));
    auto getFile =
        reinterpret_cast<int (*)(Bus*)>(dlsym(library, "sd_bus_get_fd"));
    auto ready =
        reinterpret_cast<int (*)(Bus*)>(dlsym(library, "sd_bus_is_ready"));
    auto process = reinterpret_cast<int (*)(Bus*, Message**)>(
        dlsym(library, "sd_bus_process"));
    auto wait = reinterpret_cast<int (*)(Bus*, uint64_t)>(
        dlsym(library, "sd_bus_wait"));
    auto call = reinterpret_cast<int (*)(
        Bus*, const char*, const char*, const char*, const char*, void*,
        Message**, const char*, ...)>(dlsym(library, "sd_bus_call_method"));
    auto read = reinterpret_cast<int (*)(Message*, const char*, ...)>(
        dlsym(library, "sd_bus_message_read"));
    auto boolean =
        reinterpret_cast<int (*)(Bus*, const char*, const char*, const char*,
                                 const char*, void*, char, void*)>(
            dlsym(library, "sd_bus_get_property_trivial"));
    auto string =
        reinterpret_cast<int (*)(Bus*, const char*, const char*, const char*,
                                 const char*, void*, char**)>(
            dlsym(library, "sd_bus_get_property_string"));
    auto releaseMessage = reinterpret_cast<Message* (*)(Message*)>(
        dlsym(library, "sd_bus_message_unref"));
    auto releaseBus =
        reinterpret_cast<Bus* (*)(Bus*)>(dlsym(library, "sd_bus_unref"));
    if (!create || !setAddress || !setTimeout || !start || !getFile || !ready ||
        !process || !wait || !call || !read || !boolean || !string ||
        !releaseMessage || !releaseBus) {
      dlclose(library);
      return ENOSYS;
    }
    Bus* bus = nullptr;
    Message* reply = nullptr;
    char* controlGroup = nullptr;
    auto finish = [&](int aError) {
      free(controlGroup);
      if (reply) releaseMessage(reply);
      if (bus) releaseBus(bus);
      dlclose(library);
      return aError;
    };
    timespec now;
    if (clock_gettime(CLOCK_MONOTONIC, &now)) return finish(errno);
    uint64_t deadline =
        uint64_t(now.tv_sec) * 1000000 + now.tv_nsec / 1000 + 500000;
    auto budget = [&]() -> int64_t {
      if (clock_gettime(CLOCK_MONOTONIC, &now)) return -errno;
      uint64_t current = uint64_t(now.tv_sec) * 1000000 + now.tv_nsec / 1000;
      return current >= deadline ? -ETIMEDOUT : int64_t(deadline - current);
    };
    auto remaining = [&] {
      int64_t left = budget();
      return left < 0 ? int(left) : setTimeout(bus, uint64_t(left));
    };
    int result = create(&bus);
    if (result < 0) return finish(-result);
    snprintf(address, sizeof(address), "unix:path=%s", socketPath);
    result = setAddress(bus, address);
    if (result < 0) return finish(-result);
    result = start(bus);
    if (result < 0) return finish(-result);
    int file = getFile(bus);
    if (file < 0) return finish(-file);
    ucred peer;
    socklen_t length = sizeof(peer);
    if (getsockopt(file, SOL_SOCKET, SO_PEERCRED, &peer, &length))
      return finish(errno);
    if (length != sizeof(peer) || peer.uid != getuid() || peer.pid <= 0)
      return finish(EPERM);
    for (;;) {
      int64_t left = budget();
      if (left < 0) return finish(int(-left));
      result = ready(bus);
      if (result < 0) return finish(-result);
      if (result) break;
      result = process(bus, nullptr);
      if (result < 0) return finish(-result);
      if (result) continue;
      left = budget();
      if (left < 0) return finish(int(-left));
      result = wait(bus, uint64_t(left));
      if (result < 0) return finish(-result);
    }
    result = remaining();
    if (result < 0) return finish(-result);
    const char* destination = "org.freedesktop.systemd1";
    result = call(bus, destination, "/org/freedesktop/systemd1",
                  "org.freedesktop.systemd1.Manager", "GetUnitByPID", nullptr,
                  &reply, "u", uint32_t(getpid()));
    if (result < 0) return finish(-result);
    const char* unit = nullptr;
    result = read(reply, "o", &unit);
    if (result <= 0 || !unit) return finish(result < 0 ? -result : EIO);
    const char* interface = nullptr;
    size_t size = strlen(unit);
    if (size >= 8 && !strcmp(unit + size - 8, "_2escope"))
      interface = "org.freedesktop.systemd1.Scope";
    else if (size >= 10 && !strcmp(unit + size - 10, "_2eservice"))
      interface = "org.freedesktop.systemd1.Service";
    else
      return finish(ENOTSUP);
    result = remaining();
    if (result < 0) return finish(-result);
    int delegated = 0;
    result = boolean(bus, destination, unit, interface, "Delegate", nullptr,
                     'b', &delegated);
    if (result < 0 || !delegated) return finish(result < 0 ? -result : EPERM);
    result = remaining();
    if (result < 0) return finish(-result);
    result = string(bus, destination, unit, interface, "ControlGroup", nullptr,
                    &controlGroup);
    if (result < 0) return finish(-result);
    if (!controlGroup || controlGroup[0] != '/' || strlen(controlGroup) > 4089)
      return finish(EINVAL);
    char expected[4096], current[4096];
    snprintf(expected, sizeof(expected), "0::%s\n", controlGroup);
    int error = Read(AT_FDCWD, "/proc/self/cgroup", current, sizeof(current));
    if (error || strcmp(current, expected))
      return finish(error ? error : EPERM);
    int actual;
    error = OpenCurrentGroup(actual);
    if (error) return finish(error);
    struct stat original, verified;
    error = fstat(aGroup, &original) || fstat(actual, &verified) ? errno : 0;
    close(actual);
    if (!error && (original.st_dev != verified.st_dev ||
                   original.st_ino != verified.st_ino))
      error = EPERM;
    if (!error) {
      result = remaining();
      if (result < 0) error = -result;
    }
    return finish(error);
  }

  static int ValidateExclusiveGroup(int aGroup) {
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
    return 0;
  }

  static int OpenCurrentGroup(int& aGroup) {
    aGroup = -1;
    char value[4096];
    int error = Read(AT_FDCWD, "/proc/self/cgroup", value, sizeof(value));
    if (error) return error;
    char* path = nullptr;
    char* saved;
    for (char* line = strtok_r(value, "\n", &saved); line;
         line = strtok_r(nullptr, "\n", &saved)) {
      if (strncmp(line, "0::/", 4)) continue;
      if (path) return EINVAL;
      path = line + 3;
    }
    if (!path) return ENOTSUP;
    int directory =
        open("/sys/fs/cgroup", O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    if (directory < 0) return errno;
    unsigned depth = 0;
    char* part = path + 1;
    while (*part) {
      char* end = strchr(part, '/');
      if (end) *end = 0;
      if (!strcmp(part, ".") || !strcmp(part, "..") || !*part ||
          ++depth > 1024 || (end && !end[1])) {
        close(directory);
        return EINVAL;
      }
      int next = openat(directory, part,
                        O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
      error = errno;
      close(directory);
      if (next < 0) return error;
      directory = next;
      if (!end) break;
      part = end + 1;
    }
    aGroup = directory;
    return 0;
  }

  static int WaitForEmptyGroup(int aEvents) {
    timespec now;
    if (clock_gettime(CLOCK_MONOTONIC, &now)) return errno;
    uint64_t deadline =
        uint64_t(now.tv_sec) * 1000 + now.tv_nsec / 1000000 + 45000;
    for (;;) {
      char value[4096];
      ssize_t count;
      do {
        count = pread(aEvents, value, sizeof(value) - 1, 0);
      } while (count < 0 && errno == EINTR);
      if (count < 0) return errno;
      if (!count || count == ssize_t(sizeof(value) - 1)) return EIO;
      value[count] = 0;
      bool found = false, populated = true;
      char* saved;
      for (char* line = strtok_r(value, "\n", &saved); line;
           line = strtok_r(nullptr, "\n", &saved)) {
        unsigned number;
        char extra;
        if (sscanf(line, "populated %u%c", &number, &extra) == 1) {
          if (number > 1) return EIO;
          populated = number != 0;
          found = true;
        }
      }
      if (!found) return EIO;
      if (!populated) return 0;
      if (clock_gettime(CLOCK_MONOTONIC, &now)) return errno;
      uint64_t current = uint64_t(now.tv_sec) * 1000 + now.tv_nsec / 1000000;
      if (current >= deadline) return ETIMEDOUT;
      pollfd event{aEvents, POLLPRI, 0};
      int result = poll(&event, 1, int(deadline - current));
      if (result < 0) {
        if (errno == EINTR) continue;
        return errno;
      }
      if (!result) return ETIMEDOUT;
      if (!(event.revents & POLLPRI)) return EIO;
    }
  }

  static int WriteValue(int aDirectory, const char* aName, const char* aValue) {
    int file = openat(aDirectory, aName, O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
    if (file < 0) return errno;
    size_t length = strlen(aValue);
    ssize_t count;
    do {
      count = write(file, aValue, length);
    } while (count < 0 && errno == EINTR);
    int error = count == ssize_t(length) ? 0 : count < 0 ? errno : EIO;
    close(file);
    return error;
  }

  int ReadRoleDistribution(bool& aEnabled) const {
    char value[4096];
    int error = Read(mGroup, "cgroup.subtree_control", value, sizeof(value));
    if (error) return error;
    aEnabled = false;
    char* saved;
    for (char* item = strtok_r(value, " \n", &saved); item;
         item = strtok_r(nullptr, " \n", &saved)) {
      if (!strcmp(item, "cpu")) aEnabled = true;
    }
    if (mWorkerRoles.IsPrepared()) {
      bool workers;
      int error = mWorkerRoles.ReadEnabled(workers);
      if (error || workers != aEnabled) return error ? error : EIO;
    }
    return 0;
  }

  int WriteRoleDistribution(bool aEnabled) const {
    if (!aEnabled) {
      int error = mWorkerRoles.SetEnabled(false);
      return error ? error
                   : WriteValue(mGroup, "cgroup.subtree_control", "-cpu");
    }
    int error = WriteValue(mGroup, "cgroup.subtree_control", "+cpu");
    if (!error) error = mWorkerRoles.SetEnabled(true);
    if (!error) error = WriteValue(mUiGroup, "cpu.weight", "300");
    if (!error) error = WriteValue(mContentGroup, "cpu.weight", "100");
    return error;
  }

  int SetRoleDistribution(bool aEnabled) const {
    bool enabled;
    int error = ReadRoleDistribution(enabled);
    if (error) return error;
    bool changed = enabled != aEnabled;
    auto restore = [&](int aError) {
      if (!changed) return aError;
      int restored = WriteRoleDistribution(enabled);
      return restored ? restored : aError;
    };
    if (changed) {
      error = WriteRoleDistribution(aEnabled);
      if (error) return restore(error);
    }
    bool actual;
    error = ReadRoleDistribution(actual);
    if (error || actual != aEnabled) return restore(error ? error : EIO);
    if (aEnabled) {
      char ui[64], content[64];
      error = Read(mUiGroup, "cpu.weight", ui, sizeof(ui));
      if (!error)
        error = Read(mContentGroup, "cpu.weight", content, sizeof(content));
      if (!error && (strcmp(ui, "300\n") || strcmp(content, "100\n")))
        error = EIO;
      if (!error) error = mWorkerRoles.VerifyWeights();
      if (error) return restore(error);
    }
    return 0;
  }

  int PrepareRoles() {
    bool enabled;
    int error = ReadRoleDistribution(enabled);
    if (error || enabled) return error ? error : EBUSY;
    if (mkdirat(mGroup, "ui", 0700)) return errno;
    mUiCreated = true;
    mUiGroup =
        openat(mGroup, "ui", O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    if (mUiGroup < 0) return errno;
    if (mkdirat(mGroup, "content", 0700)) return errno;
    mContentCreated = true;
    mContentGroup = openat(mGroup, "content",
                           O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    if (mContentGroup < 0) return errno;
    error = WriteValue(mUiGroup, "cgroup.procs", "0");
    if (!error) mMovedToRole = true;
    if (!error) error = mWorkerRoles.Prepare(mUiGroup, mContentGroup);
    return error;
  }

  int ReleaseRoles() {
    if (!mUiCreated && !mContentCreated && !mMovedToRole) return 0;
    int error = SetRoleDistribution(false);
    if (error) return error;
    error = ReturnRoleMembers(mUiGroup);
    if (!error) error = ReturnRoleMembers(mContentGroup);
    if (error) return error;
    if (mMovedToRole) {
      error = WriteValue(mGroup, "cgroup.procs", "0");
      if (error) return error;
      mMovedToRole = false;
    }
    error = mWorkerRoles.Release();
    if (error) return error;
    if (mUiCreated) {
      if (unlinkat(mGroup, "ui", AT_REMOVEDIR)) return errno;
      mUiCreated = false;
      close(mUiGroup);
      mUiGroup = -1;
    }
    if (mContentCreated) {
      if (unlinkat(mGroup, "content", AT_REMOVEDIR)) return errno;
      mContentCreated = false;
      close(mContentGroup);
      mContentGroup = -1;
    }
    return 0;
  }

  int ReturnRoleMembers(int aRole) const {
    if (aRole < 0) return 0;
    int file = openat(aRole, "cgroup.procs", O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (file < 0) return errno;
    FILE* members = fdopen(file, "r");
    if (!members) {
      int error = errno;
      close(file);
      return error;
    }
    int error = 0;
    long pid;
    while (fscanf(members, "%ld", &pid) == 1) {
      if (pid <= 0 || pid > INT32_MAX) {
        error = EIO;
        break;
      }
      char value[32];
      snprintf(value, sizeof(value), "%ld", pid);
      error = WriteValue(mGroup, "cgroup.procs", value);
      if (error == ESRCH) error = 0;
      if (error) break;
    }
    if (!error && ferror(members)) error = errno ? errno : EIO;
    fclose(members);
    return error;
  }

  bool IsOwner() const {
    if (getpid() != mOwner) return false;
    struct stat pidNamespace;
    return !stat("/proc/self/ns/pid", &pidNamespace) &&
           pidNamespace.st_dev == mPidNamespaceDevice &&
           pidNamespace.st_ino == mPidNamespaceInode;
  }

  static int PrepareExternalGroup(int aGroup, int aExternalGroup,
                                  int& aResult) {
    aResult = -1;
    struct statfs filesystem;
    struct stat source, destination;
    if (fstatfs(aExternalGroup, &filesystem) || fstat(aGroup, &source) ||
        fstat(aExternalGroup, &destination))
      return errno;
    if (filesystem.f_type != 0x63677270 || !S_ISDIR(destination.st_mode) ||
        destination.st_uid != geteuid() || source.st_dev != destination.st_dev)
      return EPERM;
    if (source.st_ino == destination.st_ino) return EINVAL;
    char value[4096];
    int error = Read(aExternalGroup, "cgroup.type", value, sizeof(value));
    if (error) return error;
    if (strcmp(value, "domain\n")) return ENOTSUP;
    error =
        Read(aExternalGroup, "cgroup.subtree_control", value, sizeof(value));
    if (error) return error;
    if (*value && strcmp(value, "\n")) return EBUSY;
    uint64_t quota, period;
    error = ReadLimit(aExternalGroup, quota, period);
    if (error) return error;
    if (quota) return EBUSY;
    int parent = openat(aGroup, "..", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
    if (parent < 0) return errno;
    int externalParent =
        openat(aExternalGroup, "..", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
    if (externalParent < 0) {
      error = errno;
      close(parent);
      return error;
    }
    if (fstat(parent, &source) || fstat(externalParent, &destination)) {
      error = errno;
    } else if (source.st_dev != destination.st_dev ||
               source.st_ino != destination.st_ino) {
      error = EPERM;
    } else {
      int control =
          openat(parent, "cgroup.procs", O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
      if (control < 0)
        error = errno;
      else
        close(control);
    }
    close(externalParent);
    close(parent);
    if (error) return error;
    int control = openat(aExternalGroup, "cgroup.procs",
                         O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
    if (control < 0) return errno;
    close(control);
    aResult = fcntl(aExternalGroup, F_DUPFD_CLOEXEC, 3);
    return aResult < 0 ? errno : 0;
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

  LinuxWorkerCpuRoles mWorkerRoles;
  int mGroup = -1;
  int mUiGroup = -1;
  int mContentGroup = -1;
  bool mUiCreated = false;
  bool mContentCreated = false;
  bool mMovedToRole = false;
  int mExternalGroup = -1;
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
