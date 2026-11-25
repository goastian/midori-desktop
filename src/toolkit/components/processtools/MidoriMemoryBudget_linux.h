/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORIMEMORYBUDGET_LINUX_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORIMEMORYBUDGET_LINUX_H_

#if defined(XP_LINUX) && !defined(ANDROID)
#  include "MidoriCpuBudgetController.h"
#  include <algorithm>
#  include <cerrno>
#  include <cstdint>
#  include <cstdio>
#  include <cstring>
#  include <fcntl.h>
#  include <sys/stat.h>
#  include <unistd.h>

namespace mozilla::midori {

class LinuxMemoryBudget final {
 public:
  int Read(int aGroup, ManagedMemoryBudgetState& aState,
           int aRoles = -1) const {
    ManagedMemoryBudgetState result;
    uint64_t limit, external, ui = 0, content = 0;
    int roles = aRoles >= 0 ? aRoles : aGroup;
    int roleError = ReadRole(roles, "ui", ui);
    if (!roleError) roleError = ReadRole(roles, "content", content);
    int error = ReadNumber(aGroup, "memory.current", result.currentBytes);
    if (!error) error = ReadNumber(aGroup, "memory.max", limit, true);
    if (!error) error = ReadAncestors(aGroup, external);
    if (!error) error = ReadEvents(aGroup, result);
    if (error) return error;
    result.hasLimit = limit != UINT64_MAX;
    result.ownedLimit = mOwned && limit == mExpectedLimit;
    result.limitBytes = result.hasLimit ? limit : 0;
    result.hasExternalLimit = external != UINT64_MAX;
    result.externalLimitBytes = result.hasExternalLimit ? external : 0;
    uint64_t effective = std::min(limit, external);
    result.hasEffectiveLimit = effective != UINT64_MAX;
    result.effectiveLimitBytes = result.hasEffectiveLimit ? effective : 0;
    error = ReadNumber(aGroup, "memory.swap.current", result.swapBytes);
    if (error != ENOENT && error) return error;
    result.swapMeasured = !error;
    if (!roleError && ui > kMaxSafeBytes - content) roleError = EOVERFLOW;
    if (!roleError && ui + content > result.currentBytes) roleError = EAGAIN;
    result.roleAccountingError = roleError;
    if (!roleError) {
      result.roleAccountingMeasured = true;
      result.uiBytes = ui;
      result.contentBytes = content;
      result.unattributedBytes = result.currentBytes - ui - content;
    }
    result.recoveryHeadroomBytes = 128 * 1024 * 1024;
    if (result.currentBytes > kMaxSafeBytes - result.recoveryHeadroomBytes)
      return EOVERFLOW;
    long page = sysconf(_SC_PAGESIZE);
    if (page <= 0 || uint64_t(page) > 1024 * 1024) return EINVAL;
    uint64_t minimum = result.currentBytes + result.recoveryHeadroomBytes;
    if (minimum > kMaxSafeBytes - uint64_t(page) + 1) return EOVERFLOW;
    result.minimumBytes = minimum + (uint64_t(page) - minimum % page) % page;
    result.backendReady = true;
    aState = result;
    return 0;
  }

  int Set(int aGroup, uint64_t aBytes, ManagedMemoryBudgetState& aState,
          int aRoles = -1) {
    if (!aBytes) {
      int error = Restore(aGroup);
      if (!error) error = Read(aGroup, aState, aRoles);
      if (!error) aState.applied = true;
      return error;
    }
    if (aBytes > kMaxSafeBytes) return ERANGE;
    int error = Read(aGroup, aState, aRoles);
    if (error) return error;
    long page = sysconf(_SC_PAGESIZE);
    if (page <= 0) return EINVAL;
    uint64_t desired = aBytes - aBytes % page;
    if (desired < aState.minimumBytes) return ERANGE;
    if (aState.hasExternalLimit &&
        aState.externalLimitBytes < aState.minimumBytes)
      return ERANGE;
    uint64_t previous = aState.hasLimit ? aState.limitBytes : UINT64_MAX;
    if ((!mOwned && previous != UINT64_MAX) ||
        (mOwned && previous != mExpectedLimit))
      return EBUSY;
    bool owned = mOwned;
    if (previous != desired) {
      error = WriteLimit(aGroup, desired);
      if (error) return error;
    }
    mOwned = true;
    mExpectedLimit = desired;
    ManagedMemoryBudgetState actual;
    error = Read(aGroup, actual, aRoles);
    if (!error && (!actual.hasLimit || actual.limitBytes != desired)) {
      mOwned = false;
      mExpectedLimit = UINT64_MAX;
      aState = actual;
      return EBUSY;
    }
    if (error) {
      uint64_t observed;
      int sampled = ReadNumber(aGroup, "memory.max", observed, true);
      if (sampled) return error;
      if (observed != desired) {
        mOwned = false;
        mExpectedLimit = UINT64_MAX;
        return EBUSY;
      }
      int rollback = WriteLimit(aGroup, previous);
      if (!rollback) {
        mOwned = owned;
        mExpectedLimit = previous;
        uint64_t restored;
        int verified = ReadNumber(aGroup, "memory.max", restored, true);
        if (verified) return verified;
        if (restored != previous) {
          mOwned = false;
          mExpectedLimit = UINT64_MAX;
          return EBUSY;
        }
      }
      return rollback ? rollback : error;
    }
    actual.applied = true;
    aState = actual;
    return 0;
  }

  int Restore(int aGroup) {
    if (!mOwned) return 0;
    uint64_t current;
    int error = ReadNumber(aGroup, "memory.max", current, true);
    if (error) return error;
    if (current == UINT64_MAX) {
      mOwned = false;
      mExpectedLimit = UINT64_MAX;
      return 0;
    }
    if (current != mExpectedLimit) return EBUSY;
    error = WriteLimit(aGroup, UINT64_MAX);
    if (error) return error;
    mOwned = false;
    mExpectedLimit = UINT64_MAX;
    error = ReadNumber(aGroup, "memory.max", current, true);
    if (error) return error;
    return current == UINT64_MAX ? 0 : EBUSY;
  }

 private:
  static constexpr uint64_t kMaxSafeBytes = 9007199254740991;
  bool mOwned = false;
  uint64_t mExpectedLimit = UINT64_MAX;

  static int ReadText(int aGroup, const char* aName, char* aValue,
                      size_t aSize) {
    int file = openat(aGroup, aName, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
    if (file < 0) return errno;
    size_t used = 0;
    int error = 0;
    while (used < aSize - 1) {
      ssize_t count = read(file, aValue + used, aSize - 1 - used);
      if (count < 0 && errno == EINTR) continue;
      if (count <= 0) {
        if (count < 0) error = errno;
        break;
      }
      used += size_t(count);
    }
    if (!error && used == aSize - 1) error = EOVERFLOW;
    close(file);
    aValue[used] = 0;
    return error;
  }

  static int Number(const char* aText, uint64_t& aValue) {
    aValue = 0;
    if (*aText < '0' || *aText > '9') return EINVAL;
    for (; *aText; ++aText) {
      if (*aText == '\n' && !aText[1]) break;
      if (*aText < '0' || *aText > '9') return EINVAL;
      uint64_t digit = *aText - '0';
      if (aValue > (kMaxSafeBytes - digit) / 10) return EOVERFLOW;
      aValue = aValue * 10 + digit;
    }
    return 0;
  }

  static int ReadNumber(int aGroup, const char* aName, uint64_t& aValue,
                        bool aAllowMax = false) {
    char text[64];
    int error = ReadText(aGroup, aName, text, sizeof(text));
    if (error) return error;
    if (aAllowMax && (!strcmp(text, "max\n") || !strcmp(text, "max"))) {
      aValue = UINT64_MAX;
      return 0;
    }
    return Number(text, aValue);
  }

  static int ReadRole(int aGroup, const char* aName, uint64_t& aBytes) {
    int role =
        openat(aGroup, aName, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW);
    if (role < 0) return errno;
    int error = ReadNumber(role, "memory.current", aBytes);
    close(role);
    return error;
  }

  static int ReadAncestors(int aGroup, uint64_t& aLimit) {
    aLimit = UINT64_MAX;
    int current = fcntl(aGroup, F_DUPFD_CLOEXEC, 3);
    if (current < 0) return errno;
    bool own = true;
    for (size_t depth = 0; depth < 256; ++depth) {
      int parent = openat(current, "..", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
      if (parent < 0) {
        int error = errno;
        close(current);
        return error;
      }
      struct stat here, above;
      int error = fstat(current, &here) || fstat(parent, &above) ? errno : 0;
      bool root = !error &&
                  (here.st_dev != above.st_dev || here.st_ino == above.st_ino);
      if (!error && !root && !own) {
        uint64_t limit;
        error = ReadNumber(current, "memory.max", limit, true);
        if (!error) aLimit = std::min(aLimit, limit);
      }
      if (!error && root) {
        uint64_t limit;
        error = ReadNumber(current, "memory.max", limit, true);
        if (error == ENOENT)
          error = 0;
        else if (!error)
          error = ENOTSUP;
      }
      close(current);
      if (error || root) {
        close(parent);
        return error;
      }
      current = parent;
      own = false;
    }
    close(current);
    return ELOOP;
  }

  static int ReadEvents(int aGroup, ManagedMemoryBudgetState& aState) {
    char text[2048];
    int error = ReadText(aGroup, "memory.events", text, sizeof(text));
    if (error) return error;
    bool oom = false, kills = false, maximum = false;
    char* save;
    for (char* line = strtok_r(text, "\n", &save); line;
         line = strtok_r(nullptr, "\n", &save)) {
      char* separator = strchr(line, ' ');
      if (!separator) return EINVAL;
      *separator++ = 0;
      uint64_t value;
      error = Number(separator, value);
      if (error) return error;
      if (!strcmp(line, "oom")) {
        if (oom) return EINVAL;
        oom = true;
        aState.oomEvents = value;
      } else if (!strcmp(line, "oom_kill")) {
        if (kills) return EINVAL;
        kills = true;
        aState.oomKills = value;
      } else if (!strcmp(line, "max")) {
        if (maximum) return EINVAL;
        maximum = true;
        aState.maxEvents = value;
      }
    }
    return oom && kills && maximum ? 0 : EINVAL;
  }

  static int WriteLimit(int aGroup, uint64_t aLimit) {
    char text[64];
    int length = aLimit == UINT64_MAX ? snprintf(text, sizeof(text), "max")
                                      : snprintf(text, sizeof(text), "%llu",
                                                 (unsigned long long)aLimit);
    int file = openat(aGroup, "memory.max",
                      O_WRONLY | O_CLOEXEC | O_NOFOLLOW | O_NONBLOCK);
    if (file < 0) return errno;
    ssize_t count;
    do {
      count = write(file, text, size_t(length));
    } while (count < 0 && errno == EINTR);
    int error = count == length ? 0 : count < 0 ? errno : EIO;
    close(file);
    return error;
  }
};

}  // namespace mozilla::midori
#endif
#endif
