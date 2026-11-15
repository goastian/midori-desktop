/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_MidoriMediaTrace_h
#define mozilla_MidoriMediaTrace_h

#include "mozilla/Atomics.h"
#include "mozilla/UniquePtr.h"
#include "nsError.h"
#include <stdint.h>

namespace mozilla {

struct MidoriMediaTraceEntry {
  uint32_t kind = 0;
  const void* context = nullptr;
  uint32_t rtp = 0;
  uint32_t rawRtp = 0;
  uint32_t ssrc = 0;
  uint32_t sourceCode = 0;
  uint32_t producer = 0;
  uint32_t frame = 0;
  uint64_t paint = 0;
  double observed = 0;
  double presented = -1;
  bool valid = true;
};

struct MidoriMediaTraceBatch {
  UniquePtr<MidoriMediaTraceEntry[]> entries;
  uint32_t count = 0;
  uint32_t capacity = 0;
  uint64_t generation = 0;
  double started = 0;
  double finished = 0;
  bool truncated = false;
  bool expired = false;
};

extern Atomic<bool, Relaxed> gMidoriMediaTraceEnabled;

class MidoriMediaTrace final {
 public:
  static bool Enabled() { return gMidoriMediaTraceEnabled; }
  static nsresult Begin(uint64_t& aGeneration);
  static nsresult Finish(uint64_t aGeneration, MidoriMediaTraceBatch& aBatch);
  static void Add(MidoriMediaTraceEntry aEntry);
};

}  // namespace mozilla

extern "C" bool MidoriMediaTraceEnabled();
extern "C" void MidoriMediaTraceSource(const void* aContext, uint32_t aRawRtp,
                                       uint32_t aCode, bool aValid);
extern "C" void MidoriMediaTraceRtp(const void* aContext, uint32_t aSsrc,
                                    uint32_t aRtp, uint32_t aRawRtp);

#endif
