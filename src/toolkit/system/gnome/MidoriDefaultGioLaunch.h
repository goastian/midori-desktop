/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_SYSTEM_GNOME_MIDORIDEFAULTGIOLAUNCH_H_
#define TOOLKIT_SYSTEM_GNOME_MIDORIDEFAULTGIOLAUNCH_H_

#include "MidoriGioProtocol.h"
#include "base/process_util.h"
#include "chrome/common/process_watcher.h"
#include "mozilla/ClearOnShutdown.h"
#include "mozilla/Maybe.h"
#include "mozilla/MidoriCpuBudget.h"
#include "mozilla/StaticMutex.h"
#include "nsDirectoryServiceDefs.h"
#include "nsDirectoryServiceUtils.h"
#include "nsThreadUtils.h"

namespace mozilla::midori {

static StaticMutex sGioBrokerMutex;
static UniqueFileHandle sGioBrokerSocket;
static base::ProcessHandle sGioBrokerPid = 0;
static bool sGioBrokerShutdown = false;
static bool sGioBrokerRegistered = false;

static void CloseGioBroker() {
  sGioBrokerSocket.reset();
  if (sGioBrokerPid) {
    ProcessWatcher::EnsureProcessTerminated(sGioBrokerPid);
    sGioBrokerPid = 0;
  }
}

static bool StartGioBroker() {
  nsCOMPtr<nsIFile> executable;
  if (NS_FAILED(
          NS_GetSpecialDirectory(NS_GRE_BIN_DIR, getter_AddRefs(executable))) ||
      NS_FAILED(executable->AppendNative("midori-gio-launcher"_ns)))
    return false;
  nsAutoCString path;
  if (NS_FAILED(executable->GetNativePath(path))) return false;
  int sockets[2];
  if (socketpair(AF_UNIX, SOCK_STREAM | SOCK_CLOEXEC, 0, sockets)) return false;
  UniqueFileHandle parent(sockets[0]), child(sockets[1]);
  for (auto* file : {&parent, &child}) {
    if (file->get() >= 3) continue;
    int replacement = fcntl(file->get(), F_DUPFD_CLOEXEC, 3);
    if (replacement < 0) return false;
    file->reset(replacement);
  }
  base::LaunchOptions options;
  options.fds_to_remap.push_back({child.get(), 3});
  if (base::LaunchApp({path.get()}, std::move(options), &sGioBrokerPid).isErr())
    return false;
  sGioBrokerSocket = std::move(parent);
  return true;
}

static Maybe<gboolean> TryLaunchManagedDefaultGio(const char* aUri,
                                                  const char* aToken,
                                                  GAppLaunchContext* aContext,
                                                  GError** aError) {
  int external = -1, own = -1;
  int error = OpenManagedCpuGioLaunchFiles(external, own);
  UniqueFileHandle externalFile(external), ownFile(own);
  auto fail = [&](const char* aMessage) {
    g_set_error_literal(aError, G_IO_ERROR, G_IO_ERROR_FAILED, aMessage);
    return Some(FALSE);
  };
  if (error) return fail(g_strerror(error));
  if (external < 0) return Nothing();
  UniqueFileHandle directory(GioOpenCurrentDirectory());
  if (!directory) return fail(g_strerror(errno));
  StaticMutexAutoLock lock(sGioBrokerMutex);
  if (sGioBrokerShutdown) return fail("Application launcher is shutting down");
  if (!sGioBrokerRegistered) {
    nsresult result = NS_DispatchToMainThread(
        NS_NewRunnableFunction("MidoriGioBrokerShutdown", [] {
          RunOnShutdown(
              [] {
                StaticMutexAutoLock lock(sGioBrokerMutex);
                sGioBrokerShutdown = true;
                CloseGioBroker();
              },
              ShutdownPhase::XPCOMWillShutdown);
        }));
    if (NS_FAILED(result))
      return fail("Cannot register application launcher shutdown");
    sGioBrokerRegistered = true;
  }
  if (!sGioBrokerSocket && !StartGioBroker())
    return fail("Cannot start application launcher");
  char** environment = g_app_launch_context_get_environment(aContext);
  GVariant* request = g_variant_ref_sink(
      g_variant_new("(ss^aay)", aUri, aToken ? aToken : "", environment));
  g_strfreev(environment);
  int files[kGioLaunchFileCount] = {external, own, directory.get()};
  bool sent = GioSend(sGioBrokerSocket.get(), request, files);
  g_variant_unref(request);
  GVariant* response =
      sent ? GioReceive(sGioBrokerSocket.get(), G_VARIANT_TYPE("(bs)"))
           : nullptr;
  if (!response) {
    CloseGioBroker();
    return fail("Application launcher connection failed");
  }
  gboolean launched;
  const char* message;
  g_variant_get(response, "(b&s)", &launched, &message);
  if (!launched)
    g_set_error_literal(aError, G_IO_ERROR, G_IO_ERROR_FAILED, message);
  g_variant_unref(response);
  return Some(launched);
}

}  // namespace mozilla::midori

#endif
