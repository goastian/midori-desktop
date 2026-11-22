/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef mozilla_dom_MidoriWorkerCpuControl_h
#define mozilla_dom_MidoriWorkerCpuControl_h

#include "mozilla/dom/PMidoriWorkerCpuControlChild.h"
#include "mozilla/dom/PMidoriWorkerCpuControlParent.h"

namespace mozilla::dom {

class MidoriWorkerCpuControlParent final
    : public PMidoriWorkerCpuControlParent {
 public:
  NS_INLINE_DECL_REFCOUNTING(MidoriWorkerCpuControlParent, override)

 private:
  ~MidoriWorkerCpuControlParent() = default;
};

class MidoriWorkerCpuControlChild final : public PMidoriWorkerCpuControlChild {
 public:
  NS_INLINE_DECL_THREADSAFE_REFCOUNTING(MidoriWorkerCpuControlChild, override)

  static nsresult Create(
      mozilla::ipc::Endpoint<PMidoriWorkerCpuControlChild>&& aEndpoint);
  mozilla::ipc::IPCResult RecvUpdateRate(
      const uint32_t& aRateNanocpus) override;

 private:
  ~MidoriWorkerCpuControlChild() = default;
  void ActorDestroy(ActorDestroyReason aWhy) override;
};

}  // namespace mozilla::dom

#endif
