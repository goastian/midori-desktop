/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MidoriGioProtocol.h"
#include <glib-unix.h>

using namespace mozilla::midori;

static GDBusConnection* sSessionBus = nullptr;

struct MidoriLaunchContext {
  GAppLaunchContext parent;
  char* token;
};
struct MidoriLaunchContextClass {
  GAppLaunchContextClass parent;
};
G_DEFINE_TYPE(MidoriLaunchContext, midori_launch_context,
              G_TYPE_APP_LAUNCH_CONTEXT)

static void midori_launch_context_init(MidoriLaunchContext*) {}

static void midori_launch_context_class_init(MidoriLaunchContextClass* aClass) {
  G_APP_LAUNCH_CONTEXT_CLASS(aClass)->get_startup_notify_id =
      [](GAppLaunchContext* aContext, GAppInfo*, GList*) -> char* {
    return g_strdup(reinterpret_cast<MidoriLaunchContext*>(aContext)->token);
  };
  G_OBJECT_CLASS(aClass)->finalize = [](GObject* aObject) {
    g_free(reinterpret_cast<MidoriLaunchContext*>(aObject)->token);
    G_OBJECT_CLASS(midori_launch_context_parent_class)->finalize(aObject);
  };
}

static int Move(int aFile) {
  ssize_t count;
  do {
    count = write(aFile, "0\n", 2);
  } while (count < 0 && errno == EINTR);
  return count == 2 ? 0 : count < 0 ? errno : EIO;
}

static gboolean Request(gint aSocket, GIOCondition, gpointer aLoop) {
  int files[kGioLaunchFileCount] = {-1, -1, -1};
  GVariant* request = GioReceive(aSocket, G_VARIANT_TYPE("(ssaay)"), files);
  if (!request) {
    for (int file : files)
      if (file >= 0) close(file);
    g_main_loop_quit(static_cast<GMainLoop*>(aLoop));
    return G_SOURCE_REMOVE;
  }
  const char *uri, *token;
  char** environment;
  g_variant_get(request, "(&s&s^aay)", &uri, &token, &environment);
  auto* context = reinterpret_cast<MidoriLaunchContext*>(
      g_object_new(midori_launch_context_get_type(), nullptr));
  context->token = *token ? g_strdup(token) : nullptr;
  char** inherited = g_listenv();
  for (char** key = inherited; *key; ++key)
    g_app_launch_context_unsetenv(G_APP_LAUNCH_CONTEXT(context), *key);
  g_strfreev(inherited);
  for (char** entry = environment; *entry; ++entry) {
    const char* separator = strchr(*entry, '=');
    if (!separator) continue;
    char* key = g_strndup(*entry, separator - *entry);
    g_app_launch_context_setenv(G_APP_LAUNCH_CONTEXT(context), key,
                                separator + 1);
    g_free(key);
  }
  GError* error = nullptr;
  gboolean launched = FALSE;
  int directory = GioOpenCurrentDirectory();
  int directoryError = directory < 0 ? errno : fchdir(files[2]) ? errno : 0;
  close(files[2]);
  int migration = directoryError ? directoryError : Move(files[0]);
  close(files[0]);
  if (migration) {
    g_set_error(&error, G_IO_ERROR, g_io_error_from_errno(migration),
                "Cannot prepare application launch: %s", g_strerror(migration));
  } else {
    if (sSessionBus && g_dbus_connection_is_closed(sSessionBus))
      g_clear_object(&sSessionBus);
    if (!sSessionBus)
      sSessionBus = g_bus_get_sync(G_BUS_TYPE_SESSION, nullptr, nullptr);
    launched = g_app_info_launch_default_for_uri(
        uri, G_APP_LAUNCH_CONTEXT(context), &error);
  }
  int restored = migration ? 0 : Move(files[1]);
  close(files[1]);
  if (directory >= 0) {
    int directoryRestoreError = fchdir(directory) ? errno : 0;
    close(directory);
    if (!restored) restored = directoryRestoreError;
  }
  if (restored) {
    g_clear_error(&error);
    g_set_error(&error, G_IO_ERROR, g_io_error_from_errno(restored),
                "Cannot restore application launcher context: %s",
                g_strerror(restored));
    launched = FALSE;
  }
  GVariant* response = g_variant_ref_sink(
      g_variant_new("(bs)", launched, error ? error->message : ""));
  bool sent = GioSend(aSocket, response);
  g_variant_unref(response);
  g_clear_error(&error);
  g_object_unref(context);
  g_strfreev(environment);
  g_variant_unref(request);
  if (!sent || restored) {
    g_main_loop_quit(static_cast<GMainLoop*>(aLoop));
    return G_SOURCE_REMOVE;
  }
  return G_SOURCE_CONTINUE;
}

int main(int aArgc, char**) {
  if (aArgc != 1 || fcntl(3, F_SETFD, FD_CLOEXEC)) return 1;
  GMainLoop* loop = g_main_loop_new(nullptr, FALSE);
  g_unix_fd_add(3, GIOCondition(G_IO_IN | G_IO_HUP | G_IO_ERR), Request, loop);
  g_main_loop_run(loop);
  g_main_loop_unref(loop);
  g_clear_object(&sSessionBus);
  close(3);
  return 0;
}
