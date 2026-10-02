/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef MidoriSyncFFI_h
#define MidoriSyncFFI_h

/* Generated from midori_sync_ffi/src/lib.rs with cbindgen. */

#include <stddef.h>
#include <stdint.h>

enum class MidoriSyncStatus : uint32_t {
  Ok = 0,
  InvalidInput = 1,
  AuthenticationFailed = 2,
  UnknownKey = 3,
  Capacity = 4,
  CryptoFailure = 5,
  UnsupportedVersion = 6,
};

struct MidoriSyncBuffer;

struct MidoriSyncKeyring;

extern "C" {

MidoriSyncKeyring* midori_sync_keyring_new();

void midori_sync_keyring_free(MidoriSyncKeyring* ring);

MidoriSyncBuffer* midori_sync_secret_copy(const uint8_t* data, size_t len);

MidoriSyncBuffer* midori_sync_plaintext_copy(const uint8_t* data, size_t len);

MidoriSyncBuffer* midori_sync_bookmark_request_copy(const uint8_t* data,
                                                    size_t len);

MidoriSyncStatus midori_sync_process_bookmark(const MidoriSyncBuffer* request,
                                              MidoriSyncBuffer** output);

MidoriSyncBuffer* midori_sync_history_request_copy(const uint8_t* data,
                                                   size_t len);

MidoriSyncStatus midori_sync_process_history(const MidoriSyncBuffer* request,
                                             MidoriSyncBuffer** output);

MidoriSyncBuffer* midori_sync_password_request_copy(const uint8_t* data,
                                                    size_t len);

MidoriSyncStatus midori_sync_process_password(const MidoriSyncBuffer* request,
                                              MidoriSyncBuffer** output);

void midori_sync_buffer_free(MidoriSyncBuffer* buffer);

const uint8_t* midori_sync_buffer_data(const MidoriSyncBuffer* buffer);

size_t midori_sync_buffer_len(const MidoriSyncBuffer* buffer);

MidoriSyncStatus midori_sync_forget(MidoriSyncKeyring* ring, uint32_t id);

MidoriSyncStatus midori_sync_generate_native(MidoriSyncKeyring* ring,
                                             const uint8_t* scope,
                                             size_t scope_len,
                                             uint32_t* out_id);

MidoriSyncStatus midori_sync_recover_native(
    MidoriSyncKeyring* ring, const MidoriSyncBuffer* secret,
    const uint8_t* scope, size_t scope_len, const uint8_t* bundle,
    size_t bundle_len, uint32_t* out_id);

MidoriSyncStatus midori_sync_native_key_id(const MidoriSyncKeyring* ring,
                                           uint32_t id,
                                           MidoriSyncBuffer** output);

MidoriSyncStatus midori_sync_seal_native(const MidoriSyncKeyring* ring,
                                         uint32_t id, uint32_t purpose_id,
                                         const uint8_t* context,
                                         size_t context_len,
                                         const MidoriSyncBuffer* plaintext,
                                         MidoriSyncBuffer** output);

MidoriSyncStatus midori_sync_open_native(
    const MidoriSyncKeyring* ring, uint32_t id, uint32_t purpose_id,
    const uint8_t* expected, size_t expected_len, const uint8_t* envelope,
    size_t envelope_len, MidoriSyncBuffer** output);

MidoriSyncStatus midori_sync_wrap_native(const MidoriSyncKeyring* ring,
                                         uint32_t id,
                                         const MidoriSyncBuffer* secret,
                                         MidoriSyncBuffer** output);

}  // extern "C"

#endif  // MidoriSyncFFI_h
