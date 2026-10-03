/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::{crypto::CryptoError, secret::SecretKey};
use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine,
};
use chacha20poly1305::{aead::AeadInPlace, KeyInit, Tag, XChaCha20Poly1305, XNonce};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

pub const MAX_NATIVE_PLAINTEXT_BYTES: usize = 190_000;
pub const MAX_NATIVE_ENVELOPE_BYTES: usize = 262_144;
const MAX_BUNDLE_BYTES: usize = 2048;

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(transparent)]
pub struct AccountScope([String; 3]);

impl AccountScope {
    pub fn from_json(json: &str) -> Result<Self, CryptoError> {
        let scope: Self = parse_json(json, 8192)?;
        scope.validate()?;
        Ok(scope)
    }

    fn validate(&self) -> Result<(), CryptoError> {
        for (value, maximum) in self.0.iter().zip([2048, 2048, 255]) {
            validate_text(value, maximum)?;
        }
        Ok(())
    }
}

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Purpose {
    Record,
    Local,
}

impl Purpose {
    fn kdf_context(self) -> &'static [u8; 8] {
        match self {
            Self::Record => b"MSPv2rec",
            Self::Local => b"MSPv2loc",
        }
    }

    fn aad_prefix(self) -> &'static [u8] {
        match self {
            Self::Record => b"MidoriSync\0record\0",
            Self::Local => b"MidoriSync\0local\0",
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RecordContext {
    pub collection: String,
    pub id: String,
    pub generation: String,
    pub schema_version: u32,
    pub base_revision: String,
}

impl RecordContext {
    pub fn from_json(json: &str) -> Result<Self, CryptoError> {
        let context: Self = parse_json(json, 2048)?;
        context.validate()?;
        Ok(context)
    }

    fn validate(&self) -> Result<u64, CryptoError> {
        let index = collection_index(&self.collection)?;
        validate_text(&self.id, 255)?;
        validate_generation(&self.generation)?;
        if self.schema_version != 1 {
            return Err(CryptoError::UnsupportedVersion);
        }
        validate_revision(&self.base_revision)?;
        Ok(index)
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RecordLocator {
    pub collection: String,
    pub id: String,
    pub generation: String,
}

impl RecordLocator {
    pub fn from_json(json: &str) -> Result<Self, CryptoError> {
        let locator: Self = parse_json(json, 2048)?;
        locator.validate()?;
        Ok(locator)
    }

    fn validate(&self) -> Result<(), CryptoError> {
        collection_index(&self.collection)?;
        validate_text(&self.id, 255)?;
        validate_generation(&self.generation)
    }

    fn matches(&self, context: &RecordContext) -> bool {
        self.collection == context.collection
            && self.id == context.id
            && self.generation == context.generation
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Envelope {
    crypto_version: u32,
    key_id: String,
    purpose: Purpose,
    context: RecordContext,
    nonce: String,
    ciphertext: String,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Kdf {
    algorithm: String,
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
}

impl Kdf {
    fn current() -> Self {
        Self {
            algorithm: "argon2id13".into(),
            memory_kib: 65_536,
            iterations: 3,
            parallelism: 1,
        }
    }

    fn validate(&self) -> Result<(), CryptoError> {
        if self.algorithm != "argon2id13"
            || self.memory_kib != 65_536
            || self.iterations != 3
            || self.parallelism != 1
        {
            return Err(CryptoError::UnsupportedVersion);
        }
        Ok(())
    }
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Bundle {
    bundle_version: u32,
    crypto_version: u32,
    key_id: String,
    kdf: Kdf,
    salt: String,
    nonce: String,
    ciphertext: String,
}

pub struct NativeKey {
    secret: SecretKey,
    key_id: String,
    scope: AccountScope,
}

impl NativeKey {
    pub fn generate(scope: AccountScope) -> Result<Self, CryptoError> {
        scope.validate()?;
        let mut secret = SecretKey::zeroed();
        getrandom::fill(secret.as_mut_bytes()).map_err(|_| CryptoError::RandomUnavailable)?;
        Ok(Self {
            secret,
            key_id: URL_SAFE_NO_PAD.encode(random_bytes::<16>()?),
            scope,
        })
    }

    pub fn key_id(&self) -> &str {
        &self.key_id
    }

    pub fn seal(
        &self,
        purpose: Purpose,
        context: &RecordContext,
        plaintext: &[u8],
    ) -> Result<String, CryptoError> {
        context.validate()?;
        if plaintext.len() > MAX_NATIVE_PLAINTEXT_BYTES {
            return Err(CryptoError::InvalidInput);
        }
        self.seal_with_nonce(purpose, context, plaintext, &random_bytes::<24>()?)
    }

    pub fn open(
        &self,
        purpose: Purpose,
        expected: &RecordLocator,
        json: &str,
    ) -> Result<Zeroizing<Vec<u8>>, CryptoError> {
        expected.validate()?;
        let envelope: Envelope = parse_json(json, MAX_NATIVE_ENVELOPE_BYTES)?;
        if envelope.crypto_version != 2 {
            return Err(CryptoError::UnsupportedVersion);
        }
        let index = envelope.context.validate()?;
        if envelope.key_id != self.key_id
            || envelope.purpose != purpose
            || !expected.matches(&envelope.context)
        {
            return Err(CryptoError::AuthenticationFailed);
        }
        let nonce = decode_fixed::<24>(&envelope.nonce)?;
        let mut output = Zeroizing::new(
            STANDARD
                .decode(&envelope.ciphertext)
                .map_err(|_| CryptoError::InvalidFormat)?,
        );
        if output.len() < 16 || output.len() > MAX_NATIVE_PLAINTEXT_BYTES + 16 {
            return Err(CryptoError::InvalidFormat);
        }
        let key = self.secret.subkey(purpose.kdf_context(), index);
        cipher(&key)?
            .decrypt_in_place(
                XNonce::from_slice(&nonce),
                &self.record_aad(purpose, &envelope.context),
                &mut *output,
            )
            .map_err(|_| CryptoError::AuthenticationFailed)?;
        Ok(output)
    }

    pub fn wrap(&self, passphrase: &[u8]) -> Result<String, CryptoError> {
        validate_passphrase(passphrase)?;
        self.wrap_with_randomness(passphrase, &random_bytes::<16>()?, &random_bytes::<24>()?)
    }

    pub fn unwrap(scope: AccountScope, passphrase: &[u8], json: &str) -> Result<Self, CryptoError> {
        scope.validate()?;
        validate_passphrase(passphrase)?;
        let bundle: Bundle = parse_json(json, MAX_BUNDLE_BYTES)?;
        if bundle.bundle_version != 2 || bundle.crypto_version != 2 {
            return Err(CryptoError::UnsupportedVersion);
        }
        bundle.kdf.validate()?;
        validate_key_id(&bundle.key_id)?;
        let salt = decode_fixed::<16>(&bundle.salt)?;
        let nonce = decode_fixed::<24>(&bundle.nonce)?;
        let encrypted = decode_fixed::<48>(&bundle.ciphertext)?;
        let wrapping_key = SecretKey::derive(passphrase, &salt, 3)?.subkey(b"MSPv2key", 0);
        let mut output = Self {
            secret: SecretKey::zeroed(),
            key_id: bundle.key_id,
            scope,
        };
        output
            .secret
            .as_mut_bytes()
            .copy_from_slice(&encrypted[..32]);
        let aad = output.bundle_aad(&salt);
        cipher(&wrapping_key)?
            .decrypt_in_place_detached(
                XNonce::from_slice(&nonce),
                &aad,
                output.secret.as_mut_bytes(),
                Tag::from_slice(&encrypted[32..]),
            )
            .map_err(|_| CryptoError::AuthenticationFailed)?;
        Ok(output)
    }

    fn seal_with_nonce(
        &self,
        purpose: Purpose,
        context: &RecordContext,
        plaintext: &[u8],
        nonce: &[u8; 24],
    ) -> Result<String, CryptoError> {
        let index = context.validate()?;
        let key = self.secret.subkey(purpose.kdf_context(), index);
        let mut encrypted = Zeroizing::new(plaintext.to_vec());
        cipher(&key)?
            .encrypt_in_place(
                XNonce::from_slice(nonce),
                &self.record_aad(purpose, context),
                &mut *encrypted,
            )
            .map_err(|_| CryptoError::DerivationFailed)?;
        let envelope = Envelope {
            crypto_version: 2,
            key_id: self.key_id.clone(),
            purpose,
            context: context.clone(),
            nonce: STANDARD.encode(nonce),
            ciphertext: STANDARD.encode(encrypted.as_slice()),
        };
        let json = serde_json::to_string(&envelope).map_err(|_| CryptoError::InvalidFormat)?;
        if json.len() > MAX_NATIVE_ENVELOPE_BYTES {
            return Err(CryptoError::InvalidInput);
        }
        Ok(json)
    }

    fn wrap_with_randomness(
        &self,
        passphrase: &[u8],
        salt: &[u8; 16],
        nonce: &[u8; 24],
    ) -> Result<String, CryptoError> {
        let wrapping_key = SecretKey::derive(passphrase, salt, 3)?.subkey(b"MSPv2key", 0);
        let mut encrypted = Zeroizing::new(self.secret.as_bytes().to_vec());
        cipher(&wrapping_key)?
            .encrypt_in_place(
                XNonce::from_slice(nonce),
                &self.bundle_aad(salt),
                &mut *encrypted,
            )
            .map_err(|_| CryptoError::DerivationFailed)?;
        serde_json::to_string(&Bundle {
            bundle_version: 2,
            crypto_version: 2,
            key_id: self.key_id.clone(),
            kdf: Kdf::current(),
            salt: STANDARD.encode(salt),
            nonce: STANDARD.encode(nonce),
            ciphertext: STANDARD.encode(encrypted.as_slice()),
        })
        .map_err(|_| CryptoError::InvalidFormat)
    }

    fn aad_start(&self, prefix: &[u8]) -> Vec<u8> {
        let mut aad = prefix.to_vec();
        aad.extend_from_slice(&2u32.to_be_bytes());
        for field in &self.scope.0 {
            append_field(&mut aad, field.as_bytes());
        }
        append_field(&mut aad, self.key_id.as_bytes());
        aad
    }

    fn record_aad(&self, purpose: Purpose, context: &RecordContext) -> Vec<u8> {
        let mut aad = self.aad_start(purpose.aad_prefix());
        aad.extend_from_slice(&context.schema_version.to_be_bytes());
        for field in [
            &context.collection,
            &context.id,
            &context.generation,
            &context.base_revision,
        ] {
            append_field(&mut aad, field.as_bytes());
        }
        aad
    }

    fn bundle_aad(&self, salt: &[u8; 16]) -> Vec<u8> {
        let mut aad = self.aad_start(b"MidoriSync\0bundle\0");
        append_field(&mut aad, b"argon2id13");
        for value in [65_536u32, 3, 1] {
            aad.extend_from_slice(&value.to_be_bytes());
        }
        append_field(&mut aad, salt);
        aad
    }
}

fn parse_json<T: for<'de> Deserialize<'de>>(json: &str, maximum: usize) -> Result<T, CryptoError> {
    if json.len() > maximum {
        return Err(CryptoError::InvalidInput);
    }
    serde_json::from_str(json).map_err(|_| CryptoError::InvalidFormat)
}

fn validate_text(text: &str, maximum: usize) -> Result<(), CryptoError> {
    if text.is_empty() || text.len() > maximum || text.chars().any(char::is_control) {
        return Err(CryptoError::InvalidInput);
    }
    Ok(())
}

fn validate_generation(value: &str) -> Result<(), CryptoError> {
    if value.len() != 36
        || !value.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_digit() || (b'a'..=b'f').contains(&b)
            }
        })
    {
        return Err(CryptoError::InvalidInput);
    }
    Ok(())
}

fn validate_revision(value: &str) -> Result<(), CryptoError> {
    if value.is_empty()
        || value.len() > 20
        || (value.len() > 1 && value.starts_with('0'))
        || !value.bytes().all(|b| b.is_ascii_digit())
        || value.parse::<u64>().is_err()
    {
        return Err(CryptoError::InvalidInput);
    }
    Ok(())
}

fn validate_key_id(id: &str) -> Result<(), CryptoError> {
    if id.len() != 22
        || URL_SAFE_NO_PAD
            .decode(id)
            .map_err(|_| CryptoError::InvalidFormat)?
            .len()
            != 16
    {
        return Err(CryptoError::InvalidFormat);
    }
    Ok(())
}

fn validate_passphrase(passphrase: &[u8]) -> Result<(), CryptoError> {
    if !(16..=4096).contains(&passphrase.len()) {
        return Err(CryptoError::InvalidInput);
    }
    Ok(())
}

fn collection_index(collection: &str) -> Result<u64, CryptoError> {
    match collection {
        "bookmarks" => Ok(1),
        "history" => Ok(2),
        "tabs" => Ok(3),
        "browser-settings" => Ok(4),
        "midori-tab" => Ok(5),
        "midori-privacy" => Ok(6),
        "devices" => Ok(7),
        "passwords" => Ok(8),
        "link" => Ok(9),
        "link-associations" => Ok(10),
        "credit-cards" => Ok(11),
        _ => Err(CryptoError::UnsupportedCollection),
    }
}

fn append_field(aad: &mut Vec<u8>, field: &[u8]) {
    aad.extend_from_slice(&(field.len() as u32).to_be_bytes());
    aad.extend_from_slice(field);
}

fn random_bytes<const N: usize>() -> Result<[u8; N], CryptoError> {
    let mut bytes = [0; N];
    getrandom::fill(&mut bytes).map_err(|_| CryptoError::RandomUnavailable)?;
    Ok(bytes)
}

fn decode_fixed<const N: usize>(encoded: &str) -> Result<[u8; N], CryptoError> {
    if encoded.len() != N.div_ceil(3) * 4 {
        return Err(CryptoError::InvalidFormat);
    }
    let mut bytes = [0; N];
    if STANDARD
        .decode_slice(encoded, &mut bytes)
        .map_err(|_| CryptoError::InvalidFormat)?
        != N
    {
        return Err(CryptoError::InvalidFormat);
    }
    Ok(bytes)
}

fn cipher(key: &SecretKey) -> Result<XChaCha20Poly1305, CryptoError> {
    XChaCha20Poly1305::new_from_slice(key.as_bytes()).map_err(|_| CryptoError::InvalidInput)
}

#[cfg(test)]
#[path = "native_tests.rs"]
mod tests;
