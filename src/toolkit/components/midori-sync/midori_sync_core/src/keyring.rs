/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::crypto::CryptoError;
use crate::native::{AccountScope, NativeKey, Purpose, RecordContext, RecordLocator};
use std::collections::HashMap;
use zeroize::Zeroizing;

const MAX_KEYS: usize = 8;

#[derive(Debug, PartialEq, Eq)]
pub enum KeyringError {
    Capacity,
    UnknownKey,
    Crypto(CryptoError),
}

impl From<CryptoError> for KeyringError {
    fn from(error: CryptoError) -> Self {
        Self::Crypto(error)
    }
}

pub struct Keyring {
    keys: HashMap<u32, NativeKey>,
    next_id: u32,
}

impl Default for Keyring {
    fn default() -> Self {
        Self {
            keys: HashMap::new(),
            next_id: 1,
        }
    }
}

impl Keyring {
    pub fn generate_native(&mut self, scope: AccountScope) -> Result<u32, KeyringError> {
        self.check_capacity()?;
        self.insert(NativeKey::generate(scope)?)
    }

    pub fn recover_native(
        &mut self,
        scope: AccountScope,
        passphrase: &[u8],
        bundle: &str,
    ) -> Result<u32, KeyringError> {
        self.check_capacity()?;
        self.insert(NativeKey::unwrap(scope, passphrase, bundle)?)
    }

    pub fn native_key_id(&self, id: u32) -> Result<&str, KeyringError> {
        Ok(self.native(id)?.key_id())
    }

    pub fn seal_native(
        &self,
        id: u32,
        purpose: Purpose,
        context: &RecordContext,
        plaintext: &[u8],
    ) -> Result<String, KeyringError> {
        Ok(self.native(id)?.seal(purpose, context, plaintext)?)
    }

    pub fn open_native(
        &self,
        id: u32,
        purpose: Purpose,
        expected: &RecordLocator,
        envelope: &str,
    ) -> Result<Zeroizing<Vec<u8>>, KeyringError> {
        Ok(self.native(id)?.open(purpose, expected, envelope)?)
    }

    pub fn wrap_native(&self, id: u32, passphrase: &[u8]) -> Result<String, KeyringError> {
        Ok(self.native(id)?.wrap(passphrase)?)
    }

    fn native(&self, id: u32) -> Result<&NativeKey, KeyringError> {
        self.keys.get(&id).ok_or(KeyringError::UnknownKey)
    }

    pub fn forget(&mut self, id: u32) -> Result<(), KeyringError> {
        self.keys.remove(&id).ok_or(KeyringError::UnknownKey)?;
        Ok(())
    }

    fn check_capacity(&self) -> Result<(), KeyringError> {
        if self.keys.len() >= MAX_KEYS || self.next_id == u32::MAX {
            return Err(KeyringError::Capacity);
        }
        Ok(())
    }

    fn insert(&mut self, key: NativeKey) -> Result<u32, KeyringError> {
        self.check_capacity()?;
        let id = self.next_id;
        self.next_id += 1;
        self.keys.insert(id, key);
        Ok(id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope() -> AccountScope {
        AccountScope::from_json(
            r#"["https://sync.example.invalid/","https://accounts.example.invalid/","test"]"#,
        )
        .unwrap()
    }

    #[test]
    fn forgotten_handles_are_never_reused() {
        let mut ring = Keyring::default();
        let first = ring.generate_native(scope()).unwrap();
        ring.forget(first).unwrap();
        let second = ring.generate_native(scope()).unwrap();
        assert_ne!(first, second);
        assert_eq!(ring.forget(first), Err(KeyringError::UnknownKey));
        assert_eq!(ring.native_key_id(first), Err(KeyringError::UnknownKey));
    }

    #[test]
    fn exhausted_handles_reject_before_generation() {
        let mut ring = Keyring {
            next_id: u32::MAX,
            ..Keyring::default()
        };
        assert_eq!(ring.generate_native(scope()), Err(KeyringError::Capacity));
    }

    #[test]
    fn capacity_and_failed_recovery_preserve_handles() {
        let mut ring = Keyring::default();
        assert!(ring
            .recover_native(scope(), b"public test passphrase", "{}")
            .is_err());
        assert_eq!(ring.next_id, 1);
        let first = ring.generate_native(scope()).unwrap();
        for _ in 1..MAX_KEYS {
            ring.generate_native(scope()).unwrap();
        }
        assert_eq!(ring.generate_native(scope()), Err(KeyringError::Capacity));
        ring.forget(first).unwrap();
        let next = ring.generate_native(scope()).unwrap();
        assert!(next > MAX_KEYS as u32);
        assert_eq!(ring.native_key_id(first), Err(KeyringError::UnknownKey));
    }
}
