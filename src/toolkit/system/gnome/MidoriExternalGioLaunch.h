/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_SYSTEM_GNOME_MIDORIEXTERNALGIOLAUNCH_H_
#define TOOLKIT_SYSTEM_GNOME_MIDORIEXTERNALGIOLAUNCH_H_

#include <cerrno>
#include <fcntl.h>
#include <gio/gdesktopappinfo.h>
#include <unistd.h>

namespace mozilla::midori {

struct ExternalGioChildSetup {
  int group;
  int error;
};

inline void PrepareExternalGioChild(void* aData) {
  const auto& data = *static_cast<ExternalGioChildSetup*>(aData);
  ssize_t count;
  do {
    count = write(data.group, "0\n", 2);
  } while (count < 0 && errno == EINTR);
  int error = count == 2 ? 0 : count < 0 ? errno : EIO;
  do {
    count = write(data.error, &error, sizeof(error));
  } while (count < 0 && errno == EINTR);
  if (error || count != sizeof(error)) _exit(127);
}

inline gboolean LaunchExternalGioApplication(GDesktopAppInfo* aApp,
                                             const char* aUri,
                                             GAppLaunchContext* aContext,
                                             int aGroup, GError** aError,
                                             GPid* aPid = nullptr) {
  auto fail = [aError](int error) {
    if (aError) {
      g_clear_error(aError);
      g_set_error(
          aError, G_IO_ERROR, g_io_error_from_errno(error),
          "Cannot launch external application outside browser quota: %s",
          g_strerror(error));
    }
    return FALSE;
  };
  int group = fcntl(aGroup, F_DUPFD_CLOEXEC, 3);
  if (group < 0) return fail(errno);
  int notification[2];
  if (pipe2(notification, O_CLOEXEC | O_NONBLOCK)) {
    int error = errno;
    close(group);
    return fail(error);
  }
  for (int& file : notification) {
    if (file >= 3) continue;
    int replacement = fcntl(file, F_DUPFD_CLOEXEC, 3);
    if (replacement < 0) {
      int error = errno;
      close(notification[0]);
      close(notification[1]);
      close(group);
      return fail(error);
    }
    close(file);
    file = replacement;
  }
  ExternalGioChildSetup setup{group, notification[1]};
  GList uri{const_cast<char*>(aUri), nullptr, nullptr};
  GPid child = 0;
  gboolean launched = g_desktop_app_info_launch_uris_as_manager(
      aApp, &uri, aContext, G_SPAWN_SEARCH_PATH, PrepareExternalGioChild,
      &setup,
      [](GDesktopAppInfo*, GPid aChild, gpointer aData) {
        *static_cast<GPid*>(aData) = aChild;
      },
      &child, aError);
  if (aPid) *aPid = child;
  close(group);
  close(notification[1]);
  if (!child) {
    close(notification[0]);
    return launched;
  }
  int error = 0;
  ssize_t count;
  do {
    count = read(notification[0], &error, sizeof(error));
  } while (count < 0 && errno == EINTR);
  int readError = errno;
  close(notification[0]);
  if (count == sizeof(error) && !error) return launched;
  if (count != sizeof(error)) {
    error = count < 0 && readError != EAGAIN ? readError : EIO;
  }
  return fail(error);
}

}  // namespace mozilla::midori

#endif
