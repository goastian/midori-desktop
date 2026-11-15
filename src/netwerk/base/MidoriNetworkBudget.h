/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_MidoriNetworkBudget_h
#define mozilla_net_MidoriNetworkBudget_h

#include <stdint.h>

#include "mozilla/MozPromise.h"

namespace mozilla::net {

class MidoriNetworkBudget final {
 public:
  enum class Direction { Download, Upload };
  struct Reservation {
    uint32_t bytes;
    bool processShare;
    uint64_t generation;
    bool atomic{false};
    const void* flow{nullptr};
  };
  struct Grant {
    uint32_t bytes;
    uint32_t rate;
  };

  struct BudgetState {
    uint32_t downloadBps;
    uint32_t uploadBps;
    uint64_t downloadGeneration;
    uint64_t uploadGeneration;
  };
  struct SocketUsage {
    uint64_t processId;
    uint64_t sent;
    uint64_t received;
    BudgetState budget;
  };
  using SocketUsagePromise = MozPromise<SocketUsage, nsresult, true>;

  static RefPtr<SocketUsagePromise> SampleSocketUsage(bool aSocketProcess);
  static BudgetState GetBudgetState();

  static void Init();
  static uint32_t DownloadRate();
  static uint32_t UploadRate();
  static void ReportMediaSending(uint64_t aSourceId, bool aActive);
  static void SetProcessMediaSendingCallCount(const void* aProcess, uint32_t aCount);
  static void SetGlobalMediaSendingCallCount(uint32_t aCount);
  static uint32_t GlobalMediaSendingCallCount();
  static bool VideoUploadSuspended(uint32_t aUploadRate) {
    return aUploadRate && aUploadRate < 8 * 1024;
  }
  static bool DatagramReceiveWindowMayGrow();
  static uint32_t DatagramReceiveWindow(uint32_t aRttMilliseconds = 0);
  static bool ReserveDatagramBytes(uint32_t aBytes);
  static void ReleaseDatagramBytes(uint32_t aBytes);
  static Reservation Reserve(Direction aDirection, uint32_t aRequested,
                             bool aAtomic = false, const void* aFlow = nullptr);
  static void Refund(Direction aDirection, Reservation aReservation,
                     uint32_t aUsed);
  static void CancelDatagramDemand(Direction aDirection, const void* aFlow);
  static void ForgetDatagramFlow(Direction aDirection, const void* aFlow);
  static uint32_t WaitMilliseconds(Direction aDirection, bool aAtomic = false,
                                   const void* aFlow = nullptr);
  static Grant GrantToSocketProcess(Direction aDirection, uint32_t aRequested,
                                   uint32_t aFlows);
};

extern "C" uint32_t MidoriNetworkReserveDatagram(bool aUpload,
                                                 uint32_t aRequested,
                                                 uint64_t* aGeneration,
                                                 bool* aProcessShare);
extern "C" void MidoriNetworkRefundDatagram(bool aUpload, uint32_t aReserved,
                                            uint64_t aGeneration,
                                            bool aProcessShare, uint32_t aUsed);

extern "C" uint32_t MidoriNetworkReserveDatagramForFlow(bool aUpload,
                                                        uint32_t aRequested,
                                                        uint64_t* aGeneration,
                                                        bool* aProcessShare,
                                                        const void* aFlow);
extern "C" void MidoriNetworkRefundDatagramForFlow(
    bool aUpload, uint32_t aReserved, uint64_t aGeneration, bool aProcessShare,
    uint32_t aUsed, const void* aFlow);
extern "C" void MidoriNetworkCancelDatagramDemand(bool aUpload,
                                                  const void* aFlow);

}  // namespace mozilla::net

#endif
