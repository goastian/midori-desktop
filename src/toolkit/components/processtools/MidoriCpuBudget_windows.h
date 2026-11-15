/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGET_WINDOWS_H_
#define TOOLKIT_COMPONENTS_PROCESSTOOLS_MIDORICPUBUDGET_WINDOWS_H_

#ifdef _WIN32
#  include <cstdint>
#  include <windows.h>

namespace mozilla::midori {

struct WindowsCpuCapacity {
  uint32_t systemCpus = 0;
  uint32_t externalCpus = 0;
};

struct WindowsCpuBudgetState {
  uint32_t requestedPercentage = 0;
  uint32_t appliedPercentage = 0;
  uint32_t nativeCpuRate = 0;
  bool hasExternalJob = false;
  bool capacityKnown = false;
  double externalCapacityCpus = 0;
  double ownQuotaCpus = 0;
  double effectiveCapacityCpus = 0;
  double quotaQuantumCpus = 0;
};

// Initialize before the target creates children; job membership is permanent.
class WindowsCpuBudget final {
 public:
  WindowsCpuBudget() = default;
  WindowsCpuBudget(const WindowsCpuBudget&) = delete;
  WindowsCpuBudget& operator=(const WindowsCpuBudget&) = delete;

  ~WindowsCpuBudget() {
    if (mJob) {
      static_cast<void>(SetRate(0));
      CloseHandle(mJob);
    }
    if (mProcess) CloseHandle(mProcess);
  }

  DWORD Initialize(HANDLE aProcess) {
    if (mJob) return ERROR_ALREADY_INITIALIZED;
    BOOL external = FALSE;
    if (!IsProcessInJob(aProcess, nullptr, &external)) return GetLastError();
    HANDLE job = CreateJobObjectW(nullptr, nullptr);
    if (!job) return GetLastError();
    HANDLE process = nullptr;
    DWORD error = ERROR_SUCCESS;
    if (!DuplicateHandle(GetCurrentProcess(), aProcess, GetCurrentProcess(),
                         &process, PROCESS_QUERY_LIMITED_INFORMATION, FALSE,
                         0)) {
      error = GetLastError();
    }
    if (!error) error = WriteAndVerify(job, 10000);
    if (!error) error = WriteAndVerify(job, 0);
    if (!error && !AssignProcessToJobObject(job, aProcess))
      error = GetLastError();
    if (error) {
      CloseHandle(job);
      if (process) CloseHandle(process);
      return error;
    }
    mJob = job;
    mProcess = process;
    mOwner = GetCurrentProcessId();
    mHasExternalJob = external != FALSE;
    return ERROR_SUCCESS;
  }

  DWORD SetPercentage(uint32_t aPercentage, WindowsCpuBudgetState& aState) {
    aState = {};
    aState.requestedPercentage = aPercentage;
    if (aPercentage > 100) return ERROR_INVALID_PARAMETER;
    DWORD error = SetRate(aPercentage * 100);
    if (!error) Describe(aPercentage, aState);
    return error;
  }

  DWORD SetNormalizedPercentage(uint32_t aPercentage,
                                WindowsCpuBudgetState& aState) {
    aState = {};
    aState.requestedPercentage = aPercentage;
    if (aPercentage > 100) return ERROR_INVALID_PARAMETER;
    if (!aPercentage) {
      DWORD error = SetRate(0);
      if (!error) Describe(0, aState);
      return error;
    }
    WindowsCpuCapacity capacity;
    DWORD error = ReadExternalCapacity(capacity);
    if (error) return error;
    uint32_t rate = uint32_t(uint64_t(aPercentage) * capacity.externalCpus *
                             100 / capacity.systemCpus);
    if (!rate) return ERROR_ARITHMETIC_OVERFLOW;
    error = SetRate(rate);
    if (error) return error;
    Describe(aPercentage, aState);
    aState.capacityKnown = true;
    aState.externalCapacityCpus = capacity.externalCpus;
    aState.quotaQuantumCpus = double(capacity.systemCpus) / 10000;
    aState.ownQuotaCpus = double(rate) * capacity.systemCpus / 10000;
    aState.effectiveCapacityCpus = aState.ownQuotaCpus;
    return ERROR_SUCCESS;
  }

  DWORD ReadExternalCapacity(WindowsCpuCapacity& aCapacity) const {
    aCapacity = {};
    if (!mJob) return ERROR_NOT_READY;
    if (GetCurrentProcessId() != mOwner) return ERROR_ACCESS_DENIED;
    if (mHasExternalJob || GetActiveProcessorGroupCount() != 1) {
      return ERROR_NOT_SUPPORTED;
    }
    ULONG cpuSetCount = 0;
    if (!GetProcessDefaultCpuSets(mProcess, nullptr, 0, &cpuSetCount)) {
      DWORD error = GetLastError();
      return cpuSetCount ? ERROR_NOT_SUPPORTED : error;
    }
    if (cpuSetCount) return ERROR_NOT_SUPPORTED;
    using GetMasks = BOOL(WINAPI*)(HANDLE, PGROUP_AFFINITY, USHORT, PUSHORT);
    static auto getMasks = reinterpret_cast<GetMasks>(GetProcAddress(
        GetModuleHandleW(L"kernel32.dll"), "GetProcessDefaultCpuSetMasks"));
    if (getMasks) {
      USHORT count = 0;
      if (!getMasks(mProcess, nullptr, 0, &count)) {
        DWORD error = GetLastError();
        return count ? ERROR_NOT_SUPPORTED : error;
      }
      if (count) return ERROR_NOT_SUPPORTED;
    }
    DWORD_PTR processMask = 0, systemMask = 0;
    if (!GetProcessAffinityMask(mProcess, &processMask, &systemMask)) {
      return GetLastError();
    }
    DWORD systemCpus = GetActiveProcessorCount(0);
    if (!systemCpus) return GetLastError();
    if (!processMask || (processMask & ~systemMask) ||
        CountBits(systemMask) != systemCpus) {
      return ERROR_NOT_SUPPORTED;
    }
    aCapacity.systemCpus = systemCpus;
    aCapacity.externalCpus = CountBits(processMask);
    return ERROR_SUCCESS;
  }

  DWORD DuplicateQueryHandle(HANDLE& aHandle) const {
    aHandle = nullptr;
    if (!mJob) return ERROR_NOT_READY;
    if (GetCurrentProcessId() != mOwner) return ERROR_ACCESS_DENIED;
    if (!DuplicateHandle(GetCurrentProcess(), mJob, GetCurrentProcess(),
                         &aHandle, JOB_OBJECT_QUERY, FALSE, 0)) {
      return GetLastError();
    }
    return ERROR_SUCCESS;
  }

 private:
  static uint32_t CountBits(DWORD_PTR aMask) {
    uint32_t count = 0;
    while (aMask) {
      aMask &= aMask - 1;
      ++count;
    }
    return count;
  }

  void Describe(uint32_t aPercentage, WindowsCpuBudgetState& aState) const {
    aState.appliedPercentage = aPercentage;
    aState.nativeCpuRate = mRate;
    aState.hasExternalJob = mHasExternalJob;
  }

  DWORD SetRate(uint32_t aRate) {
    if (!mJob) return ERROR_NOT_READY;
    if (GetCurrentProcessId() != mOwner) return ERROR_ACCESS_DENIED;
    if (aRate > 10000) return ERROR_INVALID_PARAMETER;
    JOBOBJECT_CPU_RATE_CONTROL_INFORMATION previous = {};
    DWORD error = Read(mJob, previous);
    if (error && aRate) return error;
    if (aRate && (previous.ControlFlags != Flags(mRate) ||
                  (mRate && previous.CpuRate != mRate))) {
      return ERROR_INVALID_DATA;
    }
    if (error || previous.ControlFlags != Flags(aRate) ||
        (aRate && previous.CpuRate != aRate)) {
      error = WriteAndVerify(mJob, aRate);
    }
    if (error) {
      if (aRate) {
        DWORD restoreError = WriteAndVerify(mJob, mRate);
        if (restoreError) return restoreError;
      }
      return error;
    }
    mRate = aRate;
    return ERROR_SUCCESS;
  }

  static DWORD Flags(uint32_t aRate) {
    return aRate ? JOB_OBJECT_CPU_RATE_CONTROL_ENABLE |
                       JOB_OBJECT_CPU_RATE_CONTROL_HARD_CAP
                 : 0;
  }

  static DWORD Read(HANDLE aJob,
                    JOBOBJECT_CPU_RATE_CONTROL_INFORMATION& aState) {
    if (!QueryInformationJobObject(aJob, JobObjectCpuRateControlInformation,
                                   &aState, sizeof(aState), nullptr)) {
      return GetLastError();
    }
    return ERROR_SUCCESS;
  }

  static DWORD WriteAndVerify(HANDLE aJob, uint32_t aRate) {
    JOBOBJECT_CPU_RATE_CONTROL_INFORMATION requested = {};
    requested.ControlFlags = Flags(aRate);
    requested.CpuRate = aRate ? aRate : 10000;
    if (!SetInformationJobObject(aJob, JobObjectCpuRateControlInformation,
                                 &requested, sizeof(requested))) {
      return GetLastError();
    }
    JOBOBJECT_CPU_RATE_CONTROL_INFORMATION actual = {};
    DWORD error = Read(aJob, actual);
    if (error) return error;
    if (actual.ControlFlags != requested.ControlFlags ||
        (aRate && actual.CpuRate != requested.CpuRate)) {
      return ERROR_INVALID_DATA;
    }
    return ERROR_SUCCESS;
  }

  HANDLE mJob = nullptr;
  HANDLE mProcess = nullptr;
  DWORD mOwner = 0;
  uint32_t mRate = 0;
  bool mHasExternalJob = false;
};

}  // namespace mozilla::midori
#endif

#endif
