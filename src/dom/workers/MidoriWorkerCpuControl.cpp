/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "mozilla/dom/MidoriWorkerCpuControl.h"

#include "mozilla/dom/MidoriWorkerCpuBudget.h"
#include "mozilla/ipc/Endpoint.h"
#include "nsThreadUtils.h"

namespace mozilla::dom {

nsresult MidoriWorkerCpuControlChild::Create(
    mozilla::ipc::Endpoint<PMidoriWorkerCpuControlChild>&& aEndpoint) {
  MOZ_ASSERT(NS_IsMainThread());
  nsCOMPtr<nsISerialEventTarget> queue;
  nsresult rv = NS_CreateBackgroundTaskQueue("MidoriWorkerCpuControl",
                                             getter_AddRefs(queue));
  if (NS_FAILED(rv)) return rv;
  return queue->Dispatch(NS_NewRunnableFunction(
      "MidoriWorkerCpuControlChild::Bind",
      [endpoint = std::move(aEndpoint)]() mutable {
        RefPtr<MidoriWorkerCpuControlChild> actor =
            new MidoriWorkerCpuControlChild();
        if (!endpoint.Bind(actor)) {
          NS_WARNING("Failed to bind Midori worker CPU control");
          ReceiveManagedWorkerCpuRate(0);
        }
      }));
}

mozilla::ipc::IPCResult MidoriWorkerCpuControlChild::RecvUpdateRate(
    const uint32_t& aRateNanocpus) {
  if (aRateNanocpus > 1000000000)
    return IPC_FAIL(this, "Invalid worker CPU rate");
  ReceiveManagedWorkerCpuRate(aRateNanocpus);
  return IPC_OK();
}

void MidoriWorkerCpuControlChild::ActorDestroy(ActorDestroyReason aWhy) {
  ReceiveManagedWorkerCpuRate(0);
}

}  // namespace mozilla::dom
