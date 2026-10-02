/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::crypto::CryptoError;
use argon2::{Algorithm, Argon2, Block, Params, Version};
use zeroize::Zeroizing;

pub(crate) struct SecretKey(Zeroizing<Box<[u8]>>);

impl SecretKey {
    pub(crate) fn zeroed() -> Self {
        Self(Zeroizing::new(vec![0; 32].into_boxed_slice()))
    }

    pub(crate) fn as_bytes(&self) -> &[u8] {
        &self.0
    }

    pub(crate) fn as_mut_bytes(&mut self) -> &mut [u8] {
        &mut self.0
    }

    pub(crate) fn derive(
        password: &[u8],
        salt: &[u8],
        iterations: u32,
    ) -> Result<Self, CryptoError> {
        if password.is_empty() || password.len() > 4096 || salt.len() != 16 {
            return Err(CryptoError::InvalidInput);
        }
        let params = Params::new(65_536, iterations, 1, Some(32))
            .map_err(|_| CryptoError::DerivationFailed)?;
        let mut memory = Zeroizing::new(vec![Block::default(); params.block_count()]);
        let mut output = Self::zeroed();
        Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
            .hash_password_into_with_memory(
                password,
                salt,
                output.as_mut_bytes(),
                memory.as_mut_slice(),
            )
            .map_err(|_| CryptoError::DerivationFailed)?;
        Ok(output)
    }

    pub(crate) fn subkey(&self, context: &[u8; 8], index: u64) -> Self {
        let mut salt = [0; 16];
        salt[..8].copy_from_slice(&index.to_le_bytes());
        let hash = blake2b_simd::Params::new()
            .hash_length(32)
            .key(self.as_bytes())
            .salt(&salt)
            .personal(context)
            .hash(b"");
        let mut output = Self::zeroed();
        output.as_mut_bytes().copy_from_slice(hash.as_bytes());
        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    #[test]
    fn moving_and_rehashing_do_not_move_secret_bytes() {
        let mut secret = SecretKey::zeroed();
        secret.as_mut_bytes().fill(42);
        let address = secret.as_bytes().as_ptr();
        let mut map = HashMap::new();
        map.insert(0, secret);
        map.reserve(128);
        assert_eq!(map[&0].as_bytes().as_ptr(), address);
        let moved = map.remove(&0).unwrap();
        assert_eq!(moved.as_bytes().as_ptr(), address);
        assert_eq!(moved.as_bytes(), &[42; 32]);
    }
}
