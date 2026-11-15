/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/MidoriMediaTrace.h"

#include "mozilla/ClearOnShutdown.h"
#include "mozilla/StaticMutex.h"
#include "mozilla/TimeStamp.h"
#include "nsThreadUtils.h"
#include <new>

namespace mozilla {

Atomic<bool, Relaxed> gMidoriMediaTraceEnabled(false);
namespace {
constexpr uint32_t kCapacity = 8192;
constexpr double kMaximumDurationMs = 60000;
StaticMutex sTraceMutex;
MidoriMediaTraceEntry* sEntries = nullptr;
uint32_t sCount = 0;
uint64_t sGeneration = 0;
uint64_t sActiveGeneration = 0;
double sStarted = 0;
bool sTruncated = false;
bool sExpired = false;
bool sShutdownRegistered = false;

double Now() {
  return (TimeStamp::Now() - TimeStamp::ProcessCreation()).ToMilliseconds();
}
}  // namespace

nsresult MidoriMediaTrace::Begin(uint64_t& aGeneration) {
  if (!NS_IsMainThread() ||
      PastShutdownPhase(ShutdownPhase::XPCOMWillShutdown)) {
    return NS_ERROR_NOT_AVAILABLE;
  }
  StaticMutexAutoLock lock(sTraceMutex);
  if (sActiveGeneration) return NS_ERROR_ALREADY_INITIALIZED;
  auto entries = UniquePtr<MidoriMediaTraceEntry[]>(
      new (std::nothrow) MidoriMediaTraceEntry[kCapacity]);
  if (!entries) return NS_ERROR_OUT_OF_MEMORY;
  if (!sShutdownRegistered) {
    RunOnShutdown(
        [] {
          StaticMutexAutoLock shutdownLock(sTraceMutex);
          gMidoriMediaTraceEnabled = false;
          delete[] sEntries;
          sEntries = nullptr;
          sActiveGeneration = 0;
        },
        ShutdownPhase::XPCOMWillShutdown);
    sShutdownRegistered = true;
  }
  sEntries = entries.release();
  sCount = 0;
  sStarted = Now();
  sTruncated = false;
  sExpired = false;
  aGeneration = sActiveGeneration = ++sGeneration;
  gMidoriMediaTraceEnabled = true;
  return NS_OK;
}

nsresult MidoriMediaTrace::Finish(uint64_t aGeneration,
                                  MidoriMediaTraceBatch& aBatch) {
  if (!NS_IsMainThread()) return NS_ERROR_NOT_AVAILABLE;
  StaticMutexAutoLock lock(sTraceMutex);
  if (!sActiveGeneration || aGeneration != sActiveGeneration) {
    return NS_ERROR_INVALID_ARG;
  }
  gMidoriMediaTraceEnabled = false;
  aBatch.entries.reset(sEntries);
  sEntries = nullptr;
  aBatch.count = sCount;
  aBatch.capacity = kCapacity;
  aBatch.generation = sActiveGeneration;
  aBatch.started = sStarted;
  aBatch.finished = Now();
  aBatch.truncated = sTruncated;
  aBatch.expired = sExpired;
  sActiveGeneration = 0;
  return NS_OK;
}

void MidoriMediaTrace::Add(MidoriMediaTraceEntry aEntry) {
  if (!Enabled()) return;
  StaticMutexAutoLock lock(sTraceMutex);
  if (!Enabled() || !sEntries) return;
  aEntry.observed = Now();
  if (aEntry.observed - sStarted > kMaximumDurationMs) {
    sExpired = true;
    gMidoriMediaTraceEnabled = false;
    return;
  }
  if (sCount == kCapacity) {
    sTruncated = true;
    gMidoriMediaTraceEnabled = false;
    return;
  }
  sEntries[sCount++] = aEntry;
}

}  // namespace mozilla

extern "C" bool MidoriMediaTraceEnabled() {
  return mozilla::MidoriMediaTrace::Enabled();
}

extern "C" void MidoriMediaTraceSource(const void* aContext, uint32_t aRawRtp,
                                       uint32_t aCode, bool aValid) {
  mozilla::MidoriMediaTraceEntry entry;
  entry.kind = 1;
  entry.context = aContext;
  entry.rawRtp = aRawRtp;
  entry.sourceCode = aValid ? aCode : 0;
  entry.valid = aValid;
  mozilla::MidoriMediaTrace::Add(entry);
}

extern "C" void MidoriMediaTraceRtp(const void* aContext, uint32_t aSsrc,
                                    uint32_t aRtp, uint32_t aRawRtp) {
  mozilla::MidoriMediaTraceEntry entry;
  entry.kind = 2;
  entry.context = aContext;
  entry.ssrc = aSsrc;
  entry.rtp = aRtp;
  entry.rawRtp = aRawRtp;
  mozilla::MidoriMediaTrace::Add(entry);
}
