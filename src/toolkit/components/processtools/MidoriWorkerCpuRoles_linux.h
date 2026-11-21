/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORIWORKERCPUROLES_LINUX_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORIWORKERCPUROLES_LINUX_H_

#if defined(XP_LINUX) && !defined(ANDROID)
#  include <cerrno>
#  include <cstdint>
#  include <cstdio>
#  include <cstdlib>
#  include <cstring>
#  include <dirent.h>
#  include <fcntl.h>
#  include <map>
#  include <sys/stat.h>
#  include <unistd.h>

namespace mozilla::midori {

class LinuxWorkerCpuRoles final {
 public:
  LinuxWorkerCpuRoles() = default;
  LinuxWorkerCpuRoles(const LinuxWorkerCpuRoles&) = delete;
  LinuxWorkerCpuRoles& operator=(const LinuxWorkerCpuRoles&) = delete;

  ~LinuxWorkerCpuRoles() {
    for (auto& role : mRoles) {
      if (role.background >= 0) close(role.background);
    }
  }

  int Prepare(int aUi, int aContent) {
    mRoles[0].normal = aUi;
    mRoles[1].normal = aContent;
    for (auto& role : mRoles) {
      if (mkdirat(role.normal, "background-workers", 0700)) return errno;
      role.created = true;
      role.background = openat(role.normal, "background-workers",
                               O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
      if (role.background < 0) return errno;
      int error = Write(role.background, "cgroup.type", "threaded");
      if (error) return error;
    }
    return 0;
  }

  bool IsPrepared() const {
    return mRoles[0].normal >= 0 && mRoles[1].normal >= 0;
  }

  int ReadEnabled(bool& aEnabled) const {
    bool first = false;
    for (unsigned i = 0; i < 2; ++i) {
      char value[4096];
      int error = Read(mRoles[i].normal, "cgroup.subtree_control", value,
                       sizeof(value));
      if (error) return error;
      bool enabled = false;
      char* saved = nullptr;
      for (char* name = strtok_r(value, " \n", &saved); name;
           name = strtok_r(nullptr, " \n", &saved)) {
        if (!strcmp(name, "cpu")) enabled = true;
      }
      if (i && enabled != first) return EIO;
      first = enabled;
    }
    aEnabled = first;
    return 0;
  }

  int SetEnabled(bool aEnabled) const {
    int error = 0;
    for (const auto& role : mRoles) {
      if (role.normal < 0) continue;
      int result = Write(role.normal, "cgroup.subtree_control",
                         aEnabled ? "+cpu" : "-cpu");
      if (!result && aEnabled) {
        result = Write(role.background, "cpu.weight", "1");
      }
      if (!error) error = result;
    }
    return error;
  }

  int VerifyWeights() const {
    for (const auto& role : mRoles) {
      char value[64];
      int error = Read(role.background, "cpu.weight", value, sizeof(value));
      if (error || strcmp(value, "1\n")) return error ? error : EIO;
    }
    return 0;
  }

  int SetWorker(uintptr_t aOwner, pid_t aPid, uint64_t aNamespaceTid,
                bool aBackground, bool aAlive) {
    auto found = mWorkers.find(aOwner);
    if (!aAlive && found == mWorkers.end()) return 0;
    if (found != mWorkers.end()) {
      if (found->second.pid != aPid ||
          found->second.namespaceTid != aNamespaceTid)
        return EINVAL;
      int error = VerifyIdentity(found->second);
      if (error == ENOENT || error == ESRCH) {
        mWorkers.erase(found);
        return 0;
      }
      if (error) {
        if (!aAlive) mWorkers.erase(found);
        return error;
      }
    } else {
      Worker worker;
      worker.pid = aPid;
      worker.namespaceTid = aNamespaceTid;
      int error = FindThread(worker);
      if (error == ENOENT || error == ESRCH) return 0;
      if (error) return error;
      error = FindRole(worker.tid, worker.role);
      if (error) return error;
      for (auto item = mWorkers.begin(); item != mWorkers.end();) {
        if (item->second.pid == worker.pid && item->second.tid == worker.tid) {
          item = mWorkers.erase(item);
        } else {
          ++item;
        }
      }
      found = mWorkers.emplace(aOwner, worker).first;
    }
    const auto& worker = found->second;
    const auto& role = mRoles[worker.role];
    char value[32];
    snprintf(value, sizeof(value), "%ld", static_cast<long>(worker.tid));
    int destination = aAlive && aBackground ? role.background : role.normal;
    int error = Write(destination, "cgroup.threads", value);
    if (!error) error = VerifyIdentity(worker);
    if (error == ENOENT || error == ESRCH) {
      mWorkers.erase(found);
      return 0;
    }
    if (!error) {
      bool member;
      error = ContainsThread(destination, worker.tid, member);
      if (!error && !member) error = EIO;
    }
    if (!aAlive) mWorkers.erase(found);
    return error;
  }

  int Release() {
    mWorkers.clear();
    int error = 0;
    for (auto& role : mRoles) {
      if (role.created &&
          unlinkat(role.normal, "background-workers", AT_REMOVEDIR)) {
        if (!error) error = errno;
        continue;
      }
      if (role.background >= 0) close(role.background);
      role.background = -1;
      role.created = false;
      role.normal = -1;
    }
    return error;
  }

 private:
  struct Role {
    int normal = -1;
    int background = -1;
    bool created = false;
  };
  struct Worker {
    pid_t pid = 0;
    pid_t tid = 0;
    uint64_t namespaceTid = 0;
    uint64_t processStart = 0;
    uint64_t threadStart = 0;
    unsigned role = 0;
  };

  static int Read(int aGroup, const char* aName, char* aValue, size_t aSize) {
    int file = openat(aGroup, aName, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (file < 0) return errno;
    ssize_t count;
    do {
      count = read(file, aValue, aSize - 1);
    } while (count < 0 && errno == EINTR);
    int error = count < 0 ? errno : size_t(count) == aSize - 1 ? EOVERFLOW : 0;
    close(file);
    if (!error) aValue[count] = 0;
    return error;
  }

  static int Write(int aGroup, const char* aName, const char* aValue) {
    int file = openat(aGroup, aName, O_WRONLY | O_CLOEXEC | O_NOFOLLOW);
    if (file < 0) return errno;
    size_t length = strlen(aValue);
    ssize_t count;
    do {
      count = write(file, aValue, length);
    } while (count < 0 && errno == EINTR);
    int error = count < 0 ? errno : size_t(count) != length ? EIO : 0;
    close(file);
    return error;
  }

  static int StartTime(const char* aPath, uint64_t& aStart) {
    char value[8192];
    int error = Read(AT_FDCWD, aPath, value, sizeof(value));
    if (error) return error;
    char* field = strrchr(value, ')');
    if (!field || field[1] != ' ') return EIO;
    field += 2;
    for (unsigned i = 0; i < 19; ++i) {
      field = strchr(field, ' ');
      if (!field) return EIO;
      ++field;
    }
    char* end;
    errno = 0;
    aStart = strtoull(field, &end, 10);
    return errno                                           ? errno
           : end == field || (*end != ' ' && *end != '\n') ? EIO
                                                           : 0;
  }

  static int VerifyIdentity(const Worker& aWorker) {
    char path[128];
    uint64_t start;
    snprintf(path, sizeof(path), "/proc/%ld/stat", long(aWorker.pid));
    int error = StartTime(path, start);
    if (error || start != aWorker.processStart) return error ? error : ESRCH;
    snprintf(path, sizeof(path), "/proc/%ld/task/%ld/stat", long(aWorker.pid),
             long(aWorker.tid));
    error = StartTime(path, start);
    return error ? error : start != aWorker.threadStart ? ESRCH : 0;
  }

  static int FindThread(Worker& aWorker) {
    if (aWorker.pid <= 0 || !aWorker.namespaceTid ||
        aWorker.namespaceTid > INT32_MAX)
      return EINVAL;
    char path[128];
    snprintf(path, sizeof(path), "/proc/%ld/stat", long(aWorker.pid));
    int error = StartTime(path, aWorker.processStart);
    if (error) return error;
    snprintf(path, sizeof(path), "/proc/%ld/task", long(aWorker.pid));
    DIR* tasks = opendir(path);
    if (!tasks) return errno;
    error = ESRCH;
    while (dirent* task = readdir(tasks)) {
      char* end;
      long tid = strtol(task->d_name, &end, 10);
      if (end == task->d_name || *end || tid <= 0 || tid > INT32_MAX) continue;
      char value[16384];
      snprintf(path, sizeof(path), "%ld/status", tid);
      int readError = Read(dirfd(tasks), path, value, sizeof(value));
      if (readError == ENOENT || readError == ESRCH) continue;
      if (readError) {
        error = readError;
        break;
      }
      char* ids = strstr(value, "\nNSpid:");
      uint64_t last = uint64_t(tid);
      if (ids) ids += 7;
      while (ids && *ids && *ids != '\n') {
        if (*ids == ' ' || *ids == '\t') {
          ++ids;
          continue;
        }
        errno = 0;
        last = strtoull(ids, &end, 10);
        if (errno || end == ids) {
          error = EIO;
          break;
        }
        ids = end;
      }
      if (error != ESRCH) break;
      if (last != aWorker.namespaceTid) continue;
      aWorker.tid = pid_t(tid);
      snprintf(path, sizeof(path), "/proc/%ld/task/%ld/stat", long(aWorker.pid),
               long(aWorker.tid));
      error = StartTime(path, aWorker.threadStart);
      break;
    }
    closedir(tasks);
    return error ? error : VerifyIdentity(aWorker);
  }

  static int ContainsThread(int aGroup, pid_t aTid, bool& aFound) {
    aFound = false;
    int file =
        openat(aGroup, "cgroup.threads", O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (file < 0) return errno;
    FILE* stream = fdopen(file, "r");
    if (!stream) {
      int error = errno;
      close(file);
      return error;
    }
    long tid;
    while (fscanf(stream, "%ld", &tid) == 1) {
      if (tid == aTid) {
        aFound = true;
        break;
      }
    }
    int error = ferror(stream) ? errno ? errno : EIO : 0;
    fclose(stream);
    return error;
  }

  int FindRole(pid_t aTid, unsigned& aRole) const {
    for (unsigned i = 0; i < 2; ++i) {
      for (int group : {mRoles[i].normal, mRoles[i].background}) {
        bool found;
        int error = ContainsThread(group, aTid, found);
        if (error) return error;
        if (found) {
          aRole = i;
          return 0;
        }
      }
    }
    return EPERM;
  }

  Role mRoles[2];
  std::map<uintptr_t, Worker> mWorkers;
};

}  // namespace mozilla::midori
#endif

#endif
