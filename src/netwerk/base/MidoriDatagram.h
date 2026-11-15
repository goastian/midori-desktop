/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_net_MidoriDatagram_h
#define mozilla_net_MidoriDatagram_h

#include "mozilla/MozPromise.h"
#include "mozilla/Atomics.h"
#include "mozilla/Mutex.h"
#include "mozilla/TimeStamp.h"
#include "nsCOMPtr.h"
#include "mozilla/net/DNS.h"
#include "nsTArray.h"

class nsIUDPSocket;
class nsIUDPSocketListener;
class nsITimer;
struct PRFileDesc;

namespace mozilla::net {

class DatagramReceiveHeadroom final {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(DatagramReceiveHeadroom)
  static already_AddRefed<DatagramReceiveHeadroom> Create(PRFileDesc* aFD);
  bool Renew();
  bool IsActive() const { return mActive; }
  void Close(PRFileDesc* aFD);
  void Relinquish();

 private:
  DatagramReceiveHeadroom(PRFileDesc* aFD, uint32_t aOriginalRequest,
                          uint32_t aAppliedCapacity, uint32_t aCharge,
                          uint32_t aRate);
  ~DatagramReceiveHeadroom();
  bool ScheduleLocked() MOZ_REQUIRES(mMutex);
  bool RestoreLocked() MOZ_REQUIRES(mMutex);
  void ReleaseLocked() MOZ_REQUIRES(mMutex);
  void Expire();

  Mutex mMutex{"DatagramReceiveHeadroom"};
  PRFileDesc* mFD MOZ_GUARDED_BY(mMutex);
  nsCOMPtr<nsITimer> mTimer MOZ_GUARDED_BY(mMutex);
  TimeStamp mLastBlocked MOZ_GUARDED_BY(mMutex);
  const uint32_t mOriginalRequest;
  const uint32_t mAppliedCapacity;
  uint32_t mCharge MOZ_GUARDED_BY(mMutex);
  const uint32_t mRate;
  Atomic<bool, ReleaseAcquire> mActive{true};
};

class DatagramSentObserver {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(DatagramSentObserver)
  virtual void OnDatagramSent(uint64_t aSourceId, int64_t aPacketId,
                              const TimeStamp& aSentAt, bool aSocketSent) = 0;

 protected:
  virtual ~DatagramSentObserver() = default;
};

struct DatagramSendInfo {
  RefPtr<DatagramSentObserver> observer;
  uint64_t sourceId{0};
  int64_t packetId{-1};

  void Notify(const TimeStamp& aSentAt, bool aSocketSent = true) const {
    if (observer && sourceId && packetId >= 0 && !aSentAt.IsNull()) {
      observer->OnDatagramSent(sourceId, packetId, aSentAt, aSocketSent);
    }
  }
};

class MOZ_RAII AutoWebRTCAudioSend final {
 public:
  explicit AutoWebRTCAudioSend(bool aAudio, DatagramSendInfo aInfo = {});
  ~AutoWebRTCAudioSend();
  AutoWebRTCAudioSend(const AutoWebRTCAudioSend&) = delete;
  AutoWebRTCAudioSend& operator=(const AutoWebRTCAudioSend&) = delete;
  static bool IsAudio();
  static DatagramSendInfo Capture();
  void NotifyFallback(const TimeStamp& aSentAt) const;

 private:
  AutoWebRTCAudioSend* const mPrevious;
  const bool mAudio;
  const DatagramSendInfo mInfo;
  bool mCaptured{false};
};

struct DatagramSendOptions {
  TimeStamp expires;
  DatagramSendInfo sent;
  bool urgent{false};
  bool audio{false};

  static DatagramSendOptions ForWebRTC(const void* aData, uint32_t aLength,
                                      bool aLimited, bool aAudio = false);
};

using DatagramSendPromise = MozPromise<TimeStamp, nsresult, true>;

nsresult AsyncListenWithoutReplyStream(nsIUDPSocket* aSocket,
                                       nsIUDPSocketListener* aListener);

RefPtr<DatagramSendPromise> SendDatagramWithCompletion(
    nsIUDPSocket* aSocket, const NetAddr& aAddress,
    const nsTArray<uint8_t>& aData, DatagramSendOptions aOptions = {});

}  // namespace mozilla::net

#endif
