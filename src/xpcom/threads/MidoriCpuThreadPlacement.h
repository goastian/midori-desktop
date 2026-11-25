/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_MidoriCpuThreadPlacement_h
#define mozilla_MidoriCpuThreadPlacement_h

#include "mozilla/AlreadyAddRefed.h"
#if defined(XP_LINUX) && !defined(ANDROID)
#  include "mozilla/Mutex.h"
#endif

class nsIThreadPoolListener;

namespace mozilla::midori {

#if defined(XP_LINUX) && !defined(ANDROID)
int InstallManagedCpuThreadPlacement(int aNormal, int aRealtime);
void ClearManagedCpuThreadPlacement();
int SetCurrentManagedCpuThreadRole(bool aRealtime);
void EnsureCurrentManagedRealtimeCpuThread();
already_AddRefed<nsIThreadPoolListener>
CreateManagedRealtimeCpuThreadPoolListener();
void NotifyManagedAudioCpuActivity(bool aActive);
bool HasManagedAudioCpuActivity();
#else
inline int SetCurrentManagedCpuThreadRole(bool) { return 0; }
inline void EnsureCurrentManagedRealtimeCpuThread() {}
inline void NotifyManagedAudioCpuActivity(bool) {}
#endif

class ManagedAudioCpuActivity final {
 public:
  ManagedAudioCpuActivity() = default;
  ~ManagedAudioCpuActivity() { SetActive(false); }
  ManagedAudioCpuActivity(const ManagedAudioCpuActivity&) = delete;
  ManagedAudioCpuActivity& operator=(const ManagedAudioCpuActivity&) = delete;
#if defined(XP_LINUX) && !defined(ANDROID)
  void SetActive(bool aActive);
#else
  void SetActive(bool) {}
#endif

 private:
#if defined(XP_LINUX) && !defined(ANDROID)
  Mutex mMutex{"ManagedAudioCpuActivity"};
  bool mActive = false;
#endif
};

}  // namespace mozilla::midori

#endif
