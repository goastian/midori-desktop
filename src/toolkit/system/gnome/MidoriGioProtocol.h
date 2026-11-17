/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef TOOLKIT_SYSTEM_GNOME_MIDORIGIOPROTOCOL_H_
#define TOOLKIT_SYSTEM_GNOME_MIDORIGIOPROTOCOL_H_

#include <cerrno>
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <gio/gio.h>
#include <sys/socket.h>
#include <unistd.h>

namespace mozilla::midori {

constexpr size_t kGioLaunchFileCount = 3;

inline int GioOpenCurrentDirectory() {
  int file = open(".", O_RDONLY | O_DIRECTORY | O_CLOEXEC);
  if (file < 0 || file >= 3) return file;
  int replacement = fcntl(file, F_DUPFD_CLOEXEC, 3);
  int error = errno;
  close(file);
  errno = error;
  return replacement;
}

inline bool GioWrite(int aSocket, const void* aData, size_t aLength) {
  const auto* data = static_cast<const char*>(aData);
  while (aLength) {
    ssize_t count = send(aSocket, data, aLength, MSG_NOSIGNAL);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return false;
    data += count;
    aLength -= count;
  }
  return true;
}

inline bool GioRead(int aSocket, void* aData, size_t aLength) {
  auto* data = static_cast<char*>(aData);
  while (aLength) {
    ssize_t count = read(aSocket, data, aLength);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) return false;
    data += count;
    aLength -= count;
  }
  return true;
}

inline bool GioSend(int aSocket, GVariant* aValue,
                    const int* aFiles = nullptr) {
  gsize size = g_variant_get_size(aValue);
  if (size > UINT32_MAX) {
    errno = E2BIG;
    return false;
  }
  uint32_t length = size;
  if (aFiles) {
    union {
      cmsghdr alignment;
      char bytes[CMSG_SPACE(kGioLaunchFileCount * sizeof(int))];
    } control{};
    iovec vector{&length, sizeof(length)};
    msghdr message{};
    message.msg_iov = &vector;
    message.msg_iovlen = 1;
    message.msg_control = control.bytes;
    message.msg_controllen = sizeof(control.bytes);
    auto* header = CMSG_FIRSTHDR(&message);
    header->cmsg_level = SOL_SOCKET;
    header->cmsg_type = SCM_RIGHTS;
    header->cmsg_len = CMSG_LEN(kGioLaunchFileCount * sizeof(int));
    memcpy(CMSG_DATA(header), aFiles, kGioLaunchFileCount * sizeof(int));
    ssize_t count;
    do {
      count = sendmsg(aSocket, &message, MSG_NOSIGNAL);
    } while (count < 0 && errno == EINTR);
    if (count <= 0) return false;
    if (!GioWrite(aSocket, reinterpret_cast<char*>(&length) + count,
                  sizeof(length) - count))
      return false;
  } else if (!GioWrite(aSocket, &length, sizeof(length))) {
    return false;
  }
  return GioWrite(aSocket, g_variant_get_data(aValue), size);
}

inline GVariant* GioReceive(int aSocket, const GVariantType* aType,
                            int* aFiles = nullptr) {
  uint32_t length;
  if (aFiles) {
    for (size_t i = 0; i < kGioLaunchFileCount; ++i) aFiles[i] = -1;
    union {
      cmsghdr alignment;
      char bytes[CMSG_SPACE(kGioLaunchFileCount * sizeof(int))];
    } control{};
    iovec vector{&length, sizeof(length)};
    msghdr message{};
    message.msg_iov = &vector;
    message.msg_iovlen = 1;
    message.msg_control = control.bytes;
    message.msg_controllen = sizeof(control.bytes);
    ssize_t count;
    do {
      count = recvmsg(aSocket, &message, MSG_CMSG_CLOEXEC);
    } while (count < 0 && errno == EINTR);
    if (count <= 0) return nullptr;
    auto* header = CMSG_FIRSTHDR(&message);
    bool valid =
        !(message.msg_flags & MSG_CTRUNC) && header &&
        header->cmsg_level == SOL_SOCKET && header->cmsg_type == SCM_RIGHTS &&
        header->cmsg_len == CMSG_LEN(kGioLaunchFileCount * sizeof(int));
    if (header && header->cmsg_level == SOL_SOCKET &&
        header->cmsg_type == SCM_RIGHTS) {
      size_t bytes = header->cmsg_len - CMSG_LEN(0);
      auto* files = reinterpret_cast<int*>(CMSG_DATA(header));
      for (size_t i = 0; i < bytes / sizeof(int); ++i) {
        if (valid && i < kGioLaunchFileCount)
          aFiles[i] = files[i];
        else
          close(files[i]);
      }
    }
    if (valid) {
      for (size_t i = 0; i < kGioLaunchFileCount; ++i) {
        if (aFiles[i] >= 3) continue;
        int replacement = fcntl(aFiles[i], F_DUPFD_CLOEXEC, 3);
        if (replacement < 0) return nullptr;
        close(aFiles[i]);
        aFiles[i] = replacement;
      }
    }
    if (!valid || !GioRead(aSocket, reinterpret_cast<char*>(&length) + count,
                           sizeof(length) - count))
      return nullptr;
  } else if (!GioRead(aSocket, &length, sizeof(length))) {
    return nullptr;
  }
  if (!length) return nullptr;
  void* bytes = g_try_malloc(length);
  if (!bytes) return nullptr;
  if (!GioRead(aSocket, bytes, length)) {
    g_free(bytes);
    return nullptr;
  }
  GVariant* value = g_variant_ref_sink(
      g_variant_new_from_data(aType, bytes, length, FALSE, g_free, bytes));
  if (!g_variant_is_normal_form(value)) {
    g_variant_unref(value);
    return nullptr;
  }
  return value;
}

}  // namespace mozilla::midori

#endif
