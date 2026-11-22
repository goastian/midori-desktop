/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_MidoriWorkerCpuBudget_h
#define mozilla_dom_MidoriWorkerCpuBudget_h

#include "mozilla/TimeStamp.h"
#include "nsCOMPtr.h"

class nsITimer;
class nsISerialEventTarget;

namespace mozilla::dom {

class WorkerPrivate;

void NotifyManagedWorkerCpuQuota(double aOwnQuotaCpus);
void ChangeManagedBackgroundWorkerCount(bool aWasBackground,
                                        bool aIsBackground);
void ReceiveManagedWorkerCpuRate(uint32_t aRateNanocpus);
void SetManagedWorkerCpuTarget(nsISerialEventTarget* aTarget, bool aAlive);
uint32_t CurrentManagedWorkerCpuRate();

class MidoriWorkerCpuBudget final {
 public:
  explicit MidoriWorkerCpuBudget(WorkerPrivate* aWorker);
  ~MidoriWorkerCpuBudget();
  MidoriWorkerCpuBudget(const MidoriWorkerCpuBudget&) = delete;
  MidoriWorkerCpuBudget& operator=(const MidoriWorkerCpuBudget&) = delete;

  void Refresh(bool aBackground);
  static void SetAtomicsWaitState(bool aWaiting);
  void BeforeEvent();
  void AfterEvent();
  void Stop();

 private:
  bool Account();
  void Enforce();
  void Arm();
  void ArmTimer();
  void Reset();

  WorkerPrivate* mWorker;
  nsCOMPtr<nsITimer> mTimer;
  TimeStamp mLastWall;
  uint64_t mLastCpuNs = 0;
  uint32_t mRateNanocpus = 0;
  double mCreditNs = 0;
  bool mBackground = false;
  bool mWaiting = false;
  bool mTimerArmed = false;
};

}  // namespace mozilla::dom

#endif
