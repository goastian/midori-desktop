/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORIWORKERCPUROLES_WINDOWS_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORIWORKERCPUROLES_WINDOWS_H_

#ifdef _WIN32
#  include <algorithm>
#  include <cstdint>
#  include <map>
#  include <windows.h>

namespace mozilla::midori {

class WindowsWorkerCpuRoles final {
 public:
  WindowsWorkerCpuRoles() = default;
  WindowsWorkerCpuRoles(const WindowsWorkerCpuRoles&) = delete;
  WindowsWorkerCpuRoles& operator=(const WindowsWorkerCpuRoles&) = delete;

  ~WindowsWorkerCpuRoles() {
    for (auto& item : mWorkers) {
      static_cast<void>(Update(item.second, false));
      CloseHandle(item.second.thread);
    }
  }

  void Prepare(HANDLE aJob) { mJob = aJob; }

  DWORD SetEnabled(bool aEnabled) {
    mEnabled = aEnabled;
    for (auto item = mWorkers.begin(); item != mWorkers.end();) {
      DWORD wait = WaitForSingleObject(item->second.thread, 0);
      if (wait == WAIT_OBJECT_0) {
        CloseHandle(item->second.thread);
        item = mWorkers.erase(item);
        continue;
      }
      if (wait != WAIT_TIMEOUT) return GetLastError();
      DWORD error = Update(item->second, aEnabled);
      if (error) return error;
      ++item;
    }
    return ERROR_SUCCESS;
  }

  DWORD SetWorker(uintptr_t aOwner, DWORD aPid, uint64_t aTid, bool aBackground,
                  bool aAlive) {
    if (!aOwner || !aPid || !aTid || aTid > UINT32_MAX)
      return ERROR_INVALID_PARAMETER;
    auto found = mWorkers.find(aOwner);
    if (!aAlive && found == mWorkers.end()) return ERROR_SUCCESS;
    if (found != mWorkers.end()) {
      if (found->second.pid != aPid ||
          GetThreadId(found->second.thread) != aTid)
        return ERROR_INVALID_PARAMETER;
    } else {
      HANDLE thread = OpenThread(THREAD_QUERY_LIMITED_INFORMATION |
                                     THREAD_SET_INFORMATION | SYNCHRONIZE,
                                 FALSE, DWORD(aTid));
      if (!thread) return GetLastError();
      if (GetProcessIdOfThread(thread) != aPid) {
        CloseHandle(thread);
        return ERROR_ACCESS_DENIED;
      }
      HANDLE process =
          OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, aPid);
      if (!process) {
        DWORD error = GetLastError();
        CloseHandle(thread);
        return error;
      }
      BOOL member = FALSE;
      BOOL queried = IsProcessInJob(process, mJob, &member);
      DWORD error = queried ? member ? ERROR_SUCCESS : ERROR_ACCESS_DENIED
                            : GetLastError();
      CloseHandle(process);
      if (error) {
        CloseHandle(thread);
        return error;
      }
      Worker worker;
      worker.thread = thread;
      worker.pid = aPid;
      for (auto item = mWorkers.begin(); item != mWorkers.end(); ++item) {
        if (item->second.pid == aPid &&
            GetThreadId(item->second.thread) == aTid &&
            WaitForSingleObject(item->second.thread, 0) == WAIT_TIMEOUT) {
          CloseHandle(thread);
          worker = item->second;
          if (worker.owned &&
              GetThreadPriority(worker.thread) == worker.original)
            worker.owned = false;
          mWorkers.erase(item);
          break;
        }
      }
      found = mWorkers.emplace(aOwner, worker).first;
    }
    DWORD wait = WaitForSingleObject(found->second.thread, 0);
    if (wait == WAIT_OBJECT_0) {
      CloseHandle(found->second.thread);
      mWorkers.erase(found);
      return ERROR_SUCCESS;
    }
    if (wait != WAIT_TIMEOUT) {
      DWORD error = GetLastError();
      if (!aAlive) {
        CloseHandle(found->second.thread);
        mWorkers.erase(found);
      }
      return error;
    }
    bool previous = found->second.background;
    found->second.background = aAlive && aBackground;
    DWORD error = Update(found->second, aAlive && mEnabled);
    if (error) {
      if (!aAlive) {
        CloseHandle(found->second.thread);
        mWorkers.erase(found);
        return error;
      }
      found->second.background = previous;
      DWORD restored = Update(found->second, mEnabled);
      return restored ? restored : error;
    }
    if (!aAlive) {
      CloseHandle(found->second.thread);
      mWorkers.erase(found);
    }
    return ERROR_SUCCESS;
  }

 private:
  struct Worker {
    HANDLE thread = nullptr;
    DWORD pid = 0;
    bool background = false;
    bool owned = false;
    int original = THREAD_PRIORITY_NORMAL;
    int applied = THREAD_PRIORITY_NORMAL;
  };

  static DWORD Update(Worker& aWorker, bool aEnabled) {
    int current = GetThreadPriority(aWorker.thread);
    if (current == THREAD_PRIORITY_ERROR_RETURN) return GetLastError();
    bool lower = aEnabled && aWorker.background;
    if (aWorker.owned && !lower && current == aWorker.original) {
      aWorker.owned = false;
      return ERROR_SUCCESS;
    }
    if (aWorker.owned && current != aWorker.applied) return ERROR_BUSY;
    if (!lower && !aWorker.owned) return ERROR_SUCCESS;
    int requested = lower
                        ? (std::min)(aWorker.owned ? aWorker.original : current,
                                     int(THREAD_PRIORITY_BELOW_NORMAL))
                        : aWorker.original;
    if (!aWorker.owned) {
      aWorker.original = current;
      aWorker.applied = requested;
    }
    if (requested != current) {
      if (!SetThreadPriority(aWorker.thread, requested)) return GetLastError();
      aWorker.applied = requested;
      aWorker.owned = requested != aWorker.original;
    }
    int actual = GetThreadPriority(aWorker.thread);
    if (actual == THREAD_PRIORITY_ERROR_RETURN) return GetLastError();
    if (actual != requested) return ERROR_INVALID_DATA;
    aWorker.owned = requested != aWorker.original;
    aWorker.applied = requested;
    return ERROR_SUCCESS;
  }

  HANDLE mJob = nullptr;
  bool mEnabled = false;
  std::map<uintptr_t, Worker> mWorkers;
};

}  // namespace mozilla::midori
#endif

#endif
