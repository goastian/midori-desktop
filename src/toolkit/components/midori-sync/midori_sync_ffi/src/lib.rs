/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#![deny(unsafe_op_in_unsafe_fn)]

use midori_sync_core::{
    bookmarks::{process_request, MAX_BOOKMARK_REQUEST_BYTES},
    crypto::CryptoError,
    history::{process_request as process_history_request, MAX_HISTORY_REQUEST_BYTES},
    keyring::{Keyring, KeyringError},
    native::{AccountScope, Purpose, RecordContext, RecordLocator, MAX_NATIVE_PLAINTEXT_BYTES},
    passwords::{process_request as process_password_request, MAX_PASSWORD_REQUEST_BYTES},
};
use std::{ptr, slice, str};
use zeroize::Zeroizing;

pub struct MidoriSyncKeyring(Keyring);
pub struct MidoriSyncBuffer(Zeroizing<Vec<u8>>);

#[repr(u32)]
#[derive(Debug, PartialEq, Eq)]
pub enum MidoriSyncStatus {
    Ok = 0,
    InvalidInput = 1,
    AuthenticationFailed = 2,
    UnknownKey = 3,
    Capacity = 4,
    CryptoFailure = 5,
    UnsupportedVersion = 6,
}

impl From<KeyringError> for MidoriSyncStatus {
    fn from(error: KeyringError) -> Self {
        match error {
            KeyringError::Capacity => Self::Capacity,
            KeyringError::UnknownKey => Self::UnknownKey,
            KeyringError::Crypto(CryptoError::AuthenticationFailed) => Self::AuthenticationFailed,
            KeyringError::Crypto(
                CryptoError::DerivationFailed | CryptoError::RandomUnavailable,
            ) => Self::CryptoFailure,
            KeyringError::Crypto(CryptoError::UnsupportedVersion) => Self::UnsupportedVersion,
            KeyringError::Crypto(_) => Self::InvalidInput,
        }
    }
}

unsafe fn input<'a>(data: *const u8, len: usize, max: usize) -> Option<&'a [u8]> {
    if data.is_null() || len == 0 || len > max {
        return None;
    }
    Some(unsafe { slice::from_raw_parts(data, len) })
}

#[no_mangle]
pub extern "C" fn midori_sync_keyring_new() -> *mut MidoriSyncKeyring {
    Box::into_raw(Box::new(MidoriSyncKeyring(Keyring::default())))
}

/// # Safety
/// `ring` must be null or an exclusively owned live allocation from keyring_new.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_keyring_free(ring: *mut MidoriSyncKeyring) {
    if !ring.is_null() {
        drop(unsafe { Box::from_raw(ring) });
    }
}

/// # Safety
/// A nonnull `data` must be readable for `len` bytes for the duration of the call.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_secret_copy(
    data: *const u8,
    len: usize,
) -> *mut MidoriSyncBuffer {
    let Some(bytes) = (unsafe { input(data, len, 4096) }) else {
        return ptr::null_mut();
    };
    Box::into_raw(Box::new(MidoriSyncBuffer(Zeroizing::new(bytes.to_vec()))))
}

/// # Safety
/// A nonnull `data` must be readable for `len` bytes for the duration of the call.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_plaintext_copy(
    data: *const u8,
    len: usize,
) -> *mut MidoriSyncBuffer {
    let bytes = if len == 0 {
        &[]
    } else {
        let Some(bytes) = (unsafe { input(data, len, MAX_NATIVE_PLAINTEXT_BYTES) }) else {
            return ptr::null_mut();
        };
        bytes
    };
    Box::into_raw(Box::new(MidoriSyncBuffer(Zeroizing::new(bytes.to_vec()))))
}

/// # Safety
/// A nonnull `data` must be readable for `len` bytes for the duration of the call.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_bookmark_request_copy(
    data: *const u8,
    len: usize,
) -> *mut MidoriSyncBuffer {
    let Some(bytes) = (unsafe { input(data, len, MAX_BOOKMARK_REQUEST_BYTES) }) else {
        return ptr::null_mut();
    };
    Box::into_raw(Box::new(MidoriSyncBuffer(Zeroizing::new(bytes.to_vec()))))
}

/// # Safety
/// `request` must be live and immutable; `output` must be writable and disjoint.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_process_bookmark(
    request: *const MidoriSyncBuffer,
    output: *mut *mut MidoriSyncBuffer,
) -> MidoriSyncStatus {
    let Some(output) = (unsafe { output.as_mut() }) else {
        return MidoriSyncStatus::InvalidInput;
    };
    *output = ptr::null_mut();
    let Some(request) = (unsafe { request.as_ref() }) else {
        return MidoriSyncStatus::InvalidInput;
    };
    match process_request(&request.0) {
        Ok(bytes) => {
            *output = Box::into_raw(Box::new(MidoriSyncBuffer(bytes)));
            MidoriSyncStatus::Ok
        }
        Err(_) => MidoriSyncStatus::InvalidInput,
    }
}

/// # Safety
/// A nonnull `data` must be readable for `len` bytes for the duration of the call.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_history_request_copy(
    data: *const u8,
    len: usize,
) -> *mut MidoriSyncBuffer {
    let Some(bytes) = (unsafe { input(data, len, MAX_HISTORY_REQUEST_BYTES) }) else {
        return ptr::null_mut();
    };
    Box::into_raw(Box::new(MidoriSyncBuffer(Zeroizing::new(bytes.to_vec()))))
}

/// # Safety
/// `request` must be live and immutable; `output` must be writable and disjoint.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_process_history(
    request: *const MidoriSyncBuffer,
    output: *mut *mut MidoriSyncBuffer,
) -> MidoriSyncStatus {
    let Some(output) = (unsafe { output.as_mut() }) else {
        return MidoriSyncStatus::InvalidInput;
    };
    *output = ptr::null_mut();
    let Some(request) = (unsafe { request.as_ref() }) else {
        return MidoriSyncStatus::InvalidInput;
    };
    match process_history_request(&request.0) {
        Ok(bytes) => {
            *output = Box::into_raw(Box::new(MidoriSyncBuffer(bytes)));
            MidoriSyncStatus::Ok
        }
        Err(_) => MidoriSyncStatus::InvalidInput,
    }
}

/// # Safety
/// A nonnull `data` must be readable for `len` bytes for the duration of the call.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_password_request_copy(
    data: *const u8,
    len: usize,
) -> *mut MidoriSyncBuffer {
    let Some(bytes) = (unsafe { input(data, len, MAX_PASSWORD_REQUEST_BYTES) }) else {
        return ptr::null_mut();
    };
    Box::into_raw(Box::new(MidoriSyncBuffer(Zeroizing::new(bytes.to_vec()))))
}

/// # Safety
/// `request` must be live and immutable; `output` must be writable and disjoint.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_process_password(
    request: *const MidoriSyncBuffer,
    output: *mut *mut MidoriSyncBuffer,
) -> MidoriSyncStatus {
    let Some(output) = (unsafe { output.as_mut() }) else {
        return MidoriSyncStatus::InvalidInput;
    };
    *output = ptr::null_mut();
    let Some(request) = (unsafe { request.as_ref() }) else {
        return MidoriSyncStatus::InvalidInput;
    };
    match process_password_request(&request.0) {
        Ok(bytes) => {
            *output = Box::into_raw(Box::new(MidoriSyncBuffer(bytes)));
            MidoriSyncStatus::Ok
        }
        Err(_) => MidoriSyncStatus::InvalidInput,
    }
}

/// # Safety
/// `buffer` must be null or an exclusively owned live allocation from this ABI.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_buffer_free(buffer: *mut MidoriSyncBuffer) {
    if !buffer.is_null() {
        drop(unsafe { Box::from_raw(buffer) });
    }
}

/// # Safety
/// `buffer` must remain live and unmodified while the returned pointer is used.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_buffer_data(buffer: *const MidoriSyncBuffer) -> *const u8 {
    unsafe { buffer.as_ref() }.map_or(ptr::null(), |buffer| buffer.0.as_ptr())
}

/// # Safety
/// `buffer` must be null or a live allocation from this ABI.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_buffer_len(buffer: *const MidoriSyncBuffer) -> usize {
    unsafe { buffer.as_ref() }.map_or(0, |buffer| buffer.0.len())
}

/// # Safety
/// `ring` must be a live, exclusively borrowed keyring; calls must be serialized.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_forget(
    ring: *mut MidoriSyncKeyring,
    id: u32,
) -> MidoriSyncStatus {
    let Some(ring) = (unsafe { ring.as_mut() }) else {
        return MidoriSyncStatus::InvalidInput;
    };
    match ring.0.forget(id) {
        Ok(()) => MidoriSyncStatus::Ok,
        Err(error) => error.into(),
    }
}

unsafe fn utf8<'a>(data: *const u8, len: usize, max: usize) -> Result<&'a str, KeyringError> {
    unsafe { input(data, len, max) }
        .and_then(|bytes| str::from_utf8(bytes).ok())
        .ok_or(CryptoError::InvalidInput.into())
}

fn purpose(value: u32) -> Result<Purpose, KeyringError> {
    match value {
        0 => Ok(Purpose::Record),
        1 => Ok(Purpose::Local),
        _ => Err(CryptoError::InvalidInput.into()),
    }
}

fn return_id(result: Result<u32, KeyringError>, output: &mut u32) -> MidoriSyncStatus {
    *output = 0;
    match result {
        Ok(id) => {
            *output = id;
            MidoriSyncStatus::Ok
        }
        Err(error) => error.into(),
    }
}

fn return_buffer(
    result: Result<Zeroizing<Vec<u8>>, KeyringError>,
    output: &mut *mut MidoriSyncBuffer,
) -> MidoriSyncStatus {
    *output = ptr::null_mut();
    match result {
        Ok(bytes) => {
            *output = Box::into_raw(Box::new(MidoriSyncBuffer(bytes)));
            MidoriSyncStatus::Ok
        }
        Err(error) => error.into(),
    }
}

/// # Safety
/// All pointers must be live and disjoint, with strings readable for their given
/// lengths and outputs writable. Calls using the same keyring must be serialized.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_generate_native(
    ring: *mut MidoriSyncKeyring,
    scope: *const u8,
    scope_len: usize,
    out_id: *mut u32,
) -> MidoriSyncStatus {
    let (Some(ring), Some(out_id)) = (unsafe { ring.as_mut() }, unsafe { out_id.as_mut() }) else {
        return MidoriSyncStatus::InvalidInput;
    };
    return_id(
        (|| {
            let scope = AccountScope::from_json(unsafe { utf8(scope, scope_len, 8192)? })?;
            ring.0.generate_native(scope)
        })(),
        out_id,
    )
}

/// # Safety
/// The generate_native contract applies; `secret` must be a live buffer.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_recover_native(
    ring: *mut MidoriSyncKeyring,
    secret: *const MidoriSyncBuffer,
    scope: *const u8,
    scope_len: usize,
    bundle: *const u8,
    bundle_len: usize,
    out_id: *mut u32,
) -> MidoriSyncStatus {
    let (Some(ring), Some(secret), Some(out_id)) = (
        unsafe { ring.as_mut() },
        unsafe { secret.as_ref() },
        unsafe { out_id.as_mut() },
    ) else {
        return MidoriSyncStatus::InvalidInput;
    };
    return_id(
        (|| {
            let scope = AccountScope::from_json(unsafe { utf8(scope, scope_len, 8192)? })?;
            let bundle = unsafe { utf8(bundle, bundle_len, 2048)? };
            ring.0.recover_native(scope, &secret.0, bundle)
        })(),
        out_id,
    )
}

/// # Safety
/// Calls using a live `ring` must be serialized. `output` must be writable and
/// must not own an existing buffer.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_native_key_id(
    ring: *const MidoriSyncKeyring,
    id: u32,
    output: *mut *mut MidoriSyncBuffer,
) -> MidoriSyncStatus {
    let (Some(ring), Some(output)) = (unsafe { ring.as_ref() }, unsafe { output.as_mut() }) else {
        return MidoriSyncStatus::InvalidInput;
    };
    return_buffer(
        ring.0
            .native_key_id(id)
            .map(|key_id| Zeroizing::new(key_id.as_bytes().to_vec())),
        output,
    )
}

/// # Safety
/// The native_key_id contract applies; `context` must be readable for its length
/// and `plaintext` must be a live buffer, both disjoint from `output`.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_seal_native(
    ring: *const MidoriSyncKeyring,
    id: u32,
    purpose_id: u32,
    context: *const u8,
    context_len: usize,
    plaintext: *const MidoriSyncBuffer,
    output: *mut *mut MidoriSyncBuffer,
) -> MidoriSyncStatus {
    let (Some(ring), Some(plaintext), Some(output)) = (
        unsafe { ring.as_ref() },
        unsafe { plaintext.as_ref() },
        unsafe { output.as_mut() },
    ) else {
        return MidoriSyncStatus::InvalidInput;
    };
    return_buffer(
        (|| {
            let purpose = purpose(purpose_id)?;
            let context = RecordContext::from_json(unsafe { utf8(context, context_len, 2048)? })?;
            Ok(Zeroizing::new(
                ring.0
                    .seal_native(id, purpose, &context, &plaintext.0)?
                    .into_bytes(),
            ))
        })(),
        output,
    )
}

/// # Safety
/// The native_key_id contract applies; `expected` and `envelope` must be readable
/// for their given lengths and disjoint from `output`.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_open_native(
    ring: *const MidoriSyncKeyring,
    id: u32,
    purpose_id: u32,
    expected: *const u8,
    expected_len: usize,
    envelope: *const u8,
    envelope_len: usize,
    output: *mut *mut MidoriSyncBuffer,
) -> MidoriSyncStatus {
    let (Some(ring), Some(output)) = (unsafe { ring.as_ref() }, unsafe { output.as_mut() }) else {
        return MidoriSyncStatus::InvalidInput;
    };
    return_buffer(
        (|| {
            let purpose = purpose(purpose_id)?;
            let expected =
                RecordLocator::from_json(unsafe { utf8(expected, expected_len, 2048)? })?;
            let envelope = unsafe { utf8(envelope, envelope_len, 262_144)? };
            ring.0.open_native(id, purpose, &expected, envelope)
        })(),
        output,
    )
}

/// # Safety
/// The native_key_id contract applies; `secret` must be a live buffer disjoint
/// from `output`.
#[no_mangle]
pub unsafe extern "C" fn midori_sync_wrap_native(
    ring: *const MidoriSyncKeyring,
    id: u32,
    secret: *const MidoriSyncBuffer,
    output: *mut *mut MidoriSyncBuffer,
) -> MidoriSyncStatus {
    let (Some(ring), Some(secret), Some(output)) = (
        unsafe { ring.as_ref() },
        unsafe { secret.as_ref() },
        unsafe { output.as_mut() },
    ) else {
        return MidoriSyncStatus::InvalidInput;
    };
    return_buffer(
        ring.0
            .wrap_native(id, &secret.0)
            .map(|bundle| Zeroizing::new(bundle.into_bytes())),
        output,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    unsafe fn take_output(buffer: *mut MidoriSyncBuffer) -> Vec<u8> {
        assert!(!buffer.is_null());
        let bytes = unsafe {
            slice::from_raw_parts(
                midori_sync_buffer_data(buffer),
                midori_sync_buffer_len(buffer),
            )
        }
        .to_vec();
        unsafe { midori_sync_buffer_free(buffer) };
        bytes
    }

    #[test]
    fn native_ffi_recovers_unicode_vectors_and_separates_purposes() {
        let v: serde_json::Value = serde_json::from_str(include_str!(
            "../../midori_sync_core/tests/fixtures/native-sodium.json"
        ))
        .unwrap();
        let scope = serde_json::to_vec(&v["scope"]).unwrap();
        let bundle = serde_json::to_vec(&v["bundle"]).unwrap();
        let passphrase = v["passphrase"].as_str().unwrap().as_bytes();
        let context =
            serde_json::to_vec(&v["records"]["bookmarks"]["record"]["envelope"]["context"])
                .unwrap();
        let mut locator: serde_json::Value = serde_json::from_slice(&context).unwrap();
        locator.as_object_mut().unwrap().remove("schema_version");
        locator.as_object_mut().unwrap().remove("base_revision");
        let locator = serde_json::to_vec(&locator).unwrap();
        let plaintext = v["plaintext"].as_str().unwrap().as_bytes();
        unsafe {
            let ring = midori_sync_keyring_new();
            let secret = midori_sync_secret_copy(passphrase.as_ptr(), passphrase.len());
            let mut id = 0;
            assert_eq!(
                midori_sync_recover_native(
                    ring,
                    secret,
                    scope.as_ptr(),
                    scope.len(),
                    bundle.as_ptr(),
                    bundle.len(),
                    &mut id
                ),
                MidoriSyncStatus::Ok
            );
            let mut output = ptr::null_mut();
            assert_eq!(
                midori_sync_native_key_id(ring, id, &mut output),
                MidoriSyncStatus::Ok
            );
            assert_eq!(
                take_output(output),
                v["key_id"].as_str().unwrap().as_bytes()
            );
            let data = midori_sync_plaintext_copy(plaintext.as_ptr(), plaintext.len());
            assert_eq!(
                midori_sync_seal_native(
                    ring,
                    id,
                    0,
                    context.as_ptr(),
                    context.len(),
                    data,
                    &mut output
                ),
                MidoriSyncStatus::Ok
            );
            midori_sync_buffer_free(data);
            let envelope = take_output(output);
            assert_eq!(
                midori_sync_open_native(
                    ring,
                    id,
                    1,
                    locator.as_ptr(),
                    locator.len(),
                    envelope.as_ptr(),
                    envelope.len(),
                    &mut output
                ),
                MidoriSyncStatus::AuthenticationFailed
            );
            assert!(output.is_null());
            assert_eq!(
                midori_sync_open_native(
                    ring,
                    id,
                    0,
                    locator.as_ptr(),
                    locator.len(),
                    envelope.as_ptr(),
                    envelope.len(),
                    &mut output
                ),
                MidoriSyncStatus::Ok
            );
            assert_eq!(take_output(output), plaintext);
            assert_eq!(
                midori_sync_wrap_native(ring, id, secret, &mut output),
                MidoriSyncStatus::Ok
            );
            let wrapped = take_output(output);
            let mut restored = 0;
            assert_eq!(
                midori_sync_recover_native(
                    ring,
                    secret,
                    scope.as_ptr(),
                    scope.len(),
                    wrapped.as_ptr(),
                    wrapped.len(),
                    &mut restored
                ),
                MidoriSyncStatus::Ok
            );
            midori_sync_buffer_free(secret);
            assert_eq!(
                midori_sync_open_native(
                    ring,
                    restored,
                    0,
                    locator.as_ptr(),
                    locator.len(),
                    envelope.as_ptr(),
                    envelope.len(),
                    &mut output
                ),
                MidoriSyncStatus::Ok
            );
            assert_eq!(take_output(output), plaintext);
            assert_eq!(midori_sync_forget(ring, restored), MidoriSyncStatus::Ok);
            assert_eq!(
                midori_sync_native_key_id(ring, restored, &mut output),
                MidoriSyncStatus::UnknownKey
            );
            assert!(output.is_null());
            midori_sync_keyring_free(ring);
        }
    }

    #[test]
    fn native_ffi_validates_bounds_and_owns_empty_plaintext() {
        let scope =
            br#"["https://sync.example.invalid/","https://accounts.example.invalid/","test"]"#;
        unsafe {
            let ring = midori_sync_keyring_new();
            let mut id = 99;
            assert_eq!(
                midori_sync_generate_native(ring, b"\xff".as_ptr(), 1, &mut id),
                MidoriSyncStatus::InvalidInput
            );
            assert_eq!(id, 0);
            assert_eq!(
                midori_sync_generate_native(ring, scope.as_ptr(), scope.len(), &mut id),
                MidoriSyncStatus::Ok
            );
            let empty = midori_sync_plaintext_copy(ptr::null(), 0);
            assert!(!empty.is_null());
            assert_eq!(midori_sync_buffer_len(empty), 0);
            midori_sync_buffer_free(empty);
            assert!(midori_sync_plaintext_copy(ptr::null(), 1).is_null());
            let oversized = vec![0; MAX_NATIVE_PLAINTEXT_BYTES + 1];
            assert!(midori_sync_plaintext_copy(oversized.as_ptr(), oversized.len()).is_null());
            let mut output = ptr::null_mut();
            assert_eq!(
                midori_sync_open_native(
                    ring,
                    id,
                    2,
                    b"{}".as_ptr(),
                    2,
                    b"{}".as_ptr(),
                    2,
                    &mut output
                ),
                MidoriSyncStatus::InvalidInput
            );
            assert!(output.is_null());
            midori_sync_keyring_free(ring);
        }
    }

    #[test]
    fn null_and_oversized_inputs_are_rejected() {
        unsafe {
            assert!(midori_sync_secret_copy(ptr::null(), 8).is_null());
            assert!(midori_sync_secret_copy(vec![0; 4097].as_ptr(), 4097).is_null());
            assert_eq!(midori_sync_buffer_len(ptr::null()), 0);
            assert!(midori_sync_buffer_data(ptr::null()).is_null());
            assert_eq!(
                midori_sync_forget(ptr::null_mut(), 0),
                MidoriSyncStatus::InvalidInput
            );
            midori_sync_buffer_free(ptr::null_mut());
            midori_sync_keyring_free(ptr::null_mut());
        }
    }

    #[test]
    fn bookmark_requests_are_copied_and_results_are_owned() {
        let mut request =
            br#"{"action":"merge","id":"bookmark____","base":null,"local":null,"remote":null}"#
                .to_vec();
        unsafe {
            assert!(midori_sync_bookmark_request_copy(ptr::null(), 1).is_null());
            assert!(midori_sync_bookmark_request_copy(
                vec![0; MAX_BOOKMARK_REQUEST_BYTES + 1].as_ptr(),
                MAX_BOOKMARK_REQUEST_BYTES + 1
            )
            .is_null());
            let copied = midori_sync_bookmark_request_copy(request.as_ptr(), request.len());
            request.fill(0);
            let mut output = ptr::null_mut();
            assert_eq!(
                midori_sync_process_bookmark(copied, &mut output),
                MidoriSyncStatus::Ok
            );
            midori_sync_buffer_free(copied);
            let bytes = slice::from_raw_parts(
                midori_sync_buffer_data(output),
                midori_sync_buffer_len(output),
            );
            assert_eq!(bytes, br#"{"status":"keep_local"}"#);
            midori_sync_buffer_free(output);
            assert_eq!(
                midori_sync_process_bookmark(ptr::null(), &mut output),
                MidoriSyncStatus::InvalidInput
            );
            assert!(output.is_null());
            assert_eq!(
                midori_sync_process_bookmark(ptr::null(), ptr::null_mut()),
                MidoriSyncStatus::InvalidInput
            );
        }
    }

    #[test]
    fn history_requests_are_copied_and_results_are_owned() {
        let mut request = br#"{"action":"merge","base":null,"local":null,"remote":null}"#.to_vec();
        unsafe {
            assert!(midori_sync_history_request_copy(ptr::null(), 1).is_null());
            assert!(midori_sync_history_request_copy(
                vec![0; MAX_HISTORY_REQUEST_BYTES + 1].as_ptr(),
                MAX_HISTORY_REQUEST_BYTES + 1
            )
            .is_null());
            let copied = midori_sync_history_request_copy(request.as_ptr(), request.len());
            request.fill(0);
            let mut output = ptr::null_mut();
            assert_eq!(
                midori_sync_process_history(copied, &mut output),
                MidoriSyncStatus::Ok
            );
            midori_sync_buffer_free(copied);
            let bytes = slice::from_raw_parts(
                midori_sync_buffer_data(output),
                midori_sync_buffer_len(output),
            );
            assert_eq!(bytes, br#"{"status":"keep_local"}"#);
            midori_sync_buffer_free(output);
            assert_eq!(
                midori_sync_process_history(ptr::null(), &mut output),
                MidoriSyncStatus::InvalidInput
            );
            assert!(output.is_null());
            assert_eq!(
                midori_sync_process_history(ptr::null(), ptr::null_mut()),
                MidoriSyncStatus::InvalidInput
            );
        }
    }

    #[test]
    fn password_requests_are_copied_and_results_are_owned() {
        let mut request = br#"{"action":"merge","base":null,"local":null,"remote":null}"#.to_vec();
        unsafe {
            assert!(midori_sync_password_request_copy(ptr::null(), 1).is_null());
            assert!(midori_sync_password_request_copy(
                vec![0; MAX_PASSWORD_REQUEST_BYTES + 1].as_ptr(),
                MAX_PASSWORD_REQUEST_BYTES + 1
            )
            .is_null());
            let copied = midori_sync_password_request_copy(request.as_ptr(), request.len());
            request.fill(0);
            let mut output = ptr::null_mut();
            assert_eq!(
                midori_sync_process_password(copied, &mut output),
                MidoriSyncStatus::Ok
            );
            midori_sync_buffer_free(copied);
            let bytes = slice::from_raw_parts(
                midori_sync_buffer_data(output),
                midori_sync_buffer_len(output),
            );
            assert_eq!(bytes, br#"{"status":"keep_local"}"#);
            midori_sync_buffer_free(output);
            assert_eq!(
                midori_sync_process_password(ptr::null(), &mut output),
                MidoriSyncStatus::InvalidInput
            );
            assert!(output.is_null());
        }
    }
}
