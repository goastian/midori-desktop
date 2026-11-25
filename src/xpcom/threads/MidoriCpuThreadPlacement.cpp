/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/MidoriCpuThreadPlacement.h"

#include <atomic>
#include <cerrno>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <dirent.h>
#include <fcntl.h>
#include <mutex>
#include <set>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/vfs.h>
#include <unistd.h>

#include "mozilla/MidoriCpuBudget.h"
#include "mozilla/RefPtr.h"
#include "mozilla/ipc/BackgroundChild.h"
#include "mozilla/ipc/PBackgroundChild.h"
#include "nsThreadUtils.h"
#include "nsIThreadPool.h"
#include "nsXULAppAPI.h"

namespace mozilla::midori {
namespace {

struct ThreadPlacement {
  const pid_t process = getpid();
  std::mutex mutex;
  std::set<pid_t> realtime;
  int normalFile = -1;
  int realtimeFile = -1;
  unsigned audioStreams = 0;
};

ThreadPlacement& Placement() {
  static std::atomic<ThreadPlacement*> current{nullptr};
  ThreadPlacement* placement = current.load(std::memory_order_acquire);
  if (!placement || placement->process != getpid()) {
    auto* replacement = new ThreadPlacement;
    while (!current.compare_exchange_weak(placement, replacement,
                                          std::memory_order_acq_rel)) {
      if (placement && placement->process == getpid()) {
        delete replacement;
        return *placement;
      }
    }
    placement = replacement;
  }
  return *placement;
}

struct CurrentThread {
  pid_t process = getpid();
  pid_t tid = pid_t(syscall(SYS_gettid));
  bool realtime = false;
  ~CurrentThread() {
    if (process != getpid()) return;
    auto& placement = Placement();
    std::lock_guard lock(placement.mutex);
    placement.realtime.erase(tid);
  }
};

CurrentThread& Thread() {
  thread_local CurrentThread current;
  return current;
}

class RealtimePoolListener final : public nsIThreadPoolListener {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_IMETHOD OnThreadCreated() override {
    EnsureCurrentManagedRealtimeCpuThread();
    return NS_OK;
  }
  NS_IMETHOD OnThreadShuttingDown() override {
    static_cast<void>(SetCurrentManagedCpuThreadRole(false));
    return NS_OK;
  }

 private:
  ~RealtimePoolListener() = default;
};

NS_IMPL_ISUPPORTS(RealtimePoolListener, nsIThreadPoolListener)

int PlaceThread(int aFile, pid_t aTid) {
  char value[32];
  int length = snprintf(value, sizeof(value), "%ld", long(aTid));
  if (lseek(aFile, 0, SEEK_SET) < 0) return errno;
  ssize_t count;
  do {
    count = write(aFile, value, size_t(length));
  } while (count < 0 && errno == EINTR);
  return count == length ? 0 : count < 0 ? errno : EIO;
}

bool IsThreadFile(int aFile) {
  struct statfs filesystem;
  struct stat file;
  int flags = fcntl(aFile, F_GETFL);
  return flags >= 0 && (flags & O_ACCMODE) == O_WRONLY &&
         !fstatfs(aFile, &filesystem) && !fstat(aFile, &file) &&
         filesystem.f_type == 0x63677270 && S_ISREG(file.st_mode);
}

}  // namespace

int InstallManagedCpuThreadPlacement(int aNormal, int aRealtime) {
  auto& placement = Placement();
  std::lock_guard lock(placement.mutex);
  int error = 0;
  if (!IsThreadFile(aNormal) || !IsThreadFile(aRealtime)) error = EPERM;
  if (!error && (fcntl(aNormal, F_SETFD, FD_CLOEXEC) < 0 ||
                 fcntl(aRealtime, F_SETFD, FD_CLOEXEC) < 0))
    error = errno;
  if (!error && placement.normalFile >= 0) error = EALREADY;
  DIR* tasks = error ? nullptr : opendir("/proc/self/task");
  if (!error && !tasks) error = errno;
  while (!error) {
    errno = 0;
    dirent* task = readdir(tasks);
    if (!task) {
      error = errno;
      break;
    }
    char* end;
    long tid = strtol(task->d_name, &end, 10);
    if (end == task->d_name || *end || tid <= 0 || tid > INT32_MAX) continue;
    int result = PlaceThread(
        placement.realtime.count(pid_t(tid)) ? aRealtime : aNormal, pid_t(tid));
    if (result != ENOENT && result != ESRCH) error = result;
  }
  if (tasks) closedir(tasks);
  if (error) {
    if (aNormal >= 0) close(aNormal);
    if (aRealtime >= 0) close(aRealtime);
    return error;
  }
  placement.normalFile = aNormal;
  placement.realtimeFile = aRealtime;
  return 0;
}

void ClearManagedCpuThreadPlacement() {
  auto& placement = Placement();
  std::lock_guard lock(placement.mutex);
  if (placement.normalFile >= 0) close(placement.normalFile);
  if (placement.realtimeFile >= 0) close(placement.realtimeFile);
  placement.normalFile = placement.realtimeFile = -1;
}

int SetCurrentManagedCpuThreadRole(bool aRealtime) {
  auto& current = Thread();
  if (current.process != getpid()) {
    current.process = getpid();
    current.tid = pid_t(syscall(SYS_gettid));
    current.realtime = false;
  }
  auto& placement = Placement();
  std::lock_guard lock(placement.mutex);
  if (aRealtime)
    placement.realtime.insert(current.tid);
  else
    placement.realtime.erase(current.tid);
  int file = aRealtime ? placement.realtimeFile : placement.normalFile;
  int error = file < 0 ? 0 : PlaceThread(file, current.tid);
  if (!error) current.realtime = aRealtime;
  return error;
}

void EnsureCurrentManagedRealtimeCpuThread() {
  auto& current = Thread();
  if (!current.realtime || current.process != getpid()) {
    if (SetCurrentManagedCpuThreadRole(true)) {
      NS_WARNING("Could not place realtime CPU thread");
    }
  }
}

already_AddRefed<nsIThreadPoolListener>
CreateManagedRealtimeCpuThreadPoolListener() {
  return MakeAndAddRef<RealtimePoolListener>();
}

bool HasManagedAudioCpuActivity() {
  auto& placement = Placement();
  std::lock_guard lock(placement.mutex);
  return placement.audioStreams != 0;
}

void ManagedAudioCpuActivity::SetActive(bool aActive) {
  MutexAutoLock lock(mMutex);
  if (mActive == aActive) return;
  mActive = aActive;
  NotifyManagedAudioCpuActivity(aActive);
}

void NotifyManagedAudioCpuActivity(bool aActive) {
  auto& placement = Placement();
  bool changed;
  {
    std::lock_guard lock(placement.mutex);
    bool before = placement.audioStreams != 0;
    if (aActive)
      ++placement.audioStreams;
    else if (placement.audioStreams)
      --placement.audioStreams;
    changed = before != (placement.audioStreams != 0);
  }
  if (!changed) return;
  if (XRE_IsParentProcess()) {
    static_cast<void>(
        SetManagedAudioCpuActivity(1, HasManagedAudioCpuActivity()));
    return;
  }
  static_cast<void>(NS_DispatchToMainThread(
      NS_NewRunnableFunction("MidoriAudioCpuActivity", [] {
        if (auto* actor = ipc::BackgroundChild::GetOrCreateForCurrentThread()) {
          static_cast<void>(
              actor->SendMidoriAudioCpuActivity(HasManagedAudioCpuActivity()));
        }
      })));
}

}  // namespace mozilla::midori
