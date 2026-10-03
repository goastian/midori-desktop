/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use super::*;
use serde_json::{json, Value};

fn vectors() -> Value {
    serde_json::from_str(include_str!("../tests/fixtures/native-sodium.json")).unwrap()
}

fn scope() -> AccountScope {
    AccountScope::from_json(&vectors()["scope"].to_string()).unwrap()
}

fn fixture_key() -> NativeKey {
    let v = vectors();
    let mut secret = SecretKey::zeroed();
    STANDARD
        .decode_slice(v["master_key"].as_str().unwrap(), secret.as_mut_bytes())
        .unwrap();
    NativeKey {
        secret,
        key_id: v["key_id"].as_str().unwrap().into(),
        scope: scope(),
    }
}

fn context(collection: &str) -> RecordContext {
    RecordContext::from_json(
        &vectors()["records"][collection]["record"]["envelope"]["context"].to_string(),
    )
    .unwrap()
}

fn locator(context: &RecordContext) -> RecordLocator {
    RecordLocator {
        collection: context.collection.clone(),
        id: context.id.clone(),
        generation: context.generation.clone(),
    }
}

#[test]
fn records_and_local_storage_match_independent_sodium_vectors() {
    let v = vectors();
    let key = fixture_key();
    let plaintext = v["plaintext"].as_str().unwrap().as_bytes();
    let nonce = decode_fixed::<24>(v["nonce"].as_str().unwrap()).unwrap();
    for (collection, entries) in v["records"].as_object().unwrap() {
        let context = context(collection);
        for (label, purpose) in [("record", Purpose::Record), ("local", Purpose::Local)] {
            let encrypted = key
                .seal_with_nonce(purpose, &context, plaintext, &nonce)
                .unwrap();
            assert_eq!(
                serde_json::from_str::<Value>(&encrypted).unwrap(),
                entries[label]["envelope"]
            );
            assert_eq!(
                STANDARD.encode(key.record_aad(purpose, &context)),
                entries[label]["aad"]
            );
            let opened = key
                .open(
                    purpose,
                    &locator(&context),
                    &entries[label]["envelope"].to_string(),
                )
                .unwrap();
            assert_eq!(opened.as_slice(), plaintext);
        }
    }
}

#[test]
fn bundle_matches_sodium_and_recovers_same_key() {
    let v = vectors();
    let key = fixture_key();
    let passphrase = v["passphrase"].as_str().unwrap().as_bytes();
    let salt = decode_fixed::<16>(v["salt"].as_str().unwrap()).unwrap();
    let nonce = decode_fixed::<24>(v["nonce"].as_str().unwrap()).unwrap();
    let wrapped = key.wrap_with_randomness(passphrase, &salt, &nonce).unwrap();
    assert_eq!(STANDARD.encode(key.bundle_aad(&salt)), v["bundle_aad"]);
    assert_eq!(
        serde_json::from_str::<Value>(&wrapped).unwrap(),
        v["bundle"]
    );
    let recovered = NativeKey::unwrap(scope(), passphrase, &v["bundle"].to_string()).unwrap();
    assert_eq!(
        STANDARD.encode(recovered.secret.as_bytes()),
        v["master_key"]
    );
    assert_eq!(recovered.key_id(), key.key_id());
    assert!(matches!(
        NativeKey::unwrap(scope(), b"an incorrect recovery secret", &wrapped),
        Err(CryptoError::AuthenticationFailed)
    ));
}

#[test]
fn all_account_fields_are_authenticated_for_records_and_bundles() {
    let v = vectors();
    let envelope = v["records"]["bookmarks"]["record"]["envelope"].to_string();
    let expected = locator(&context("bookmarks"));
    for field in 0..3 {
        let mut key = fixture_key();
        key.scope.0[field].push('x');
        assert_eq!(
            key.open(Purpose::Record, &expected, &envelope),
            Err(CryptoError::AuthenticationFailed)
        );
        assert!(matches!(
            NativeKey::unwrap(
                key.scope,
                v["passphrase"].as_str().unwrap().as_bytes(),
                &v["bundle"].to_string()
            ),
            Err(CryptoError::AuthenticationFailed)
        ));
    }
}

#[test]
fn authenticated_record_headers_cannot_be_relocated_or_rewritten() {
    let v = vectors();
    let key = fixture_key();
    let original = v["records"]["bookmarks"]["record"]["envelope"].clone();
    for (field, replacement) in [
        ("collection", json!("passwords")),
        ("id", json!("another-record")),
        ("generation", json!("00000000-0000-4000-8000-000000000002")),
        ("base_revision", json!("9007199254740992")),
    ] {
        let mut modified = original.clone();
        modified["context"][field] = replacement;
        let altered: RecordContext = serde_json::from_value(modified["context"].clone()).unwrap();
        assert_eq!(
            key.open(Purpose::Record, &locator(&altered), &modified.to_string()),
            Err(CryptoError::AuthenticationFailed),
            "{field}"
        );
    }
    let mut expected = locator(&context("bookmarks"));
    expected.id = "another-record".into();
    assert_eq!(
        key.open(Purpose::Record, &expected, &original.to_string()),
        Err(CryptoError::AuthenticationFailed)
    );
    let mut modified = original.clone();
    modified["purpose"] = json!("local");
    assert_eq!(
        key.open(
            Purpose::Local,
            &locator(&context("bookmarks")),
            &modified.to_string()
        ),
        Err(CryptoError::AuthenticationFailed)
    );
    modified = original;
    modified["key_id"] = json!(URL_SAFE_NO_PAD.encode([42; 16]));
    assert_eq!(
        key.open(
            Purpose::Record,
            &locator(&context("bookmarks")),
            &modified.to_string()
        ),
        Err(CryptoError::AuthenticationFailed)
    );
}

#[test]
fn link_associations_use_a_separate_authenticated_collection() {
    let key = fixture_key();
    let mut association = context("bookmarks");
    association.collection = "link-associations".into();
    association.id = "bookmarkGuid".into();
    let encrypted = key.seal(Purpose::Record, &association, b"link-id").unwrap();
    assert_eq!(
        key.open(Purpose::Record, &locator(&association), &encrypted)
            .unwrap()
            .as_slice(),
        b"link-id"
    );
    let mut bookmark = association.clone();
    bookmark.collection = "bookmarks".into();
    assert!(key
        .open(Purpose::Record, &locator(&bookmark), &encrypted)
        .is_err());
}

#[test]
fn modified_nonce_ciphertext_or_tag_never_returns_plaintext() {
    let v = vectors();
    let key = fixture_key();
    let original = v["records"]["bookmarks"]["record"]["envelope"].clone();
    for (field, from_end) in [
        ("nonce", false),
        ("ciphertext", false),
        ("ciphertext", true),
    ] {
        let mut modified = original.clone();
        let mut bytes = STANDARD.decode(modified[field].as_str().unwrap()).unwrap();
        let position = if from_end { bytes.len() - 1 } else { 0 };
        bytes[position] ^= 1;
        modified[field] = json!(STANDARD.encode(bytes));
        assert_eq!(
            key.open(
                Purpose::Record,
                &locator(&context("bookmarks")),
                &modified.to_string()
            ),
            Err(CryptoError::AuthenticationFailed)
        );
    }
}

#[test]
fn generated_keys_nonces_and_bundle_salts_are_fresh() {
    let key = NativeKey::generate(scope()).unwrap();
    let other = NativeKey::generate(scope()).unwrap();
    assert_ne!(key.key_id(), other.key_id());
    assert_ne!(key.secret.as_bytes(), other.secret.as_bytes());
    let context = context("passwords");
    let a = key
        .seal(Purpose::Record, &context, b"public fixture")
        .unwrap();
    let b = key
        .seal(Purpose::Record, &context, b"public fixture")
        .unwrap();
    assert_ne!(a, b);
    assert_eq!(
        key.open(Purpose::Record, &locator(&context), &a)
            .unwrap()
            .as_slice(),
        b"public fixture"
    );
    assert!(other.open(Purpose::Record, &locator(&context), &a).is_err());
    let passphrase = b"a public fixture recovery secret";
    let first: Value = serde_json::from_str(&key.wrap(passphrase).unwrap()).unwrap();
    let second: Value = serde_json::from_str(&key.wrap(passphrase).unwrap()).unwrap();
    assert_ne!(first["salt"], second["salt"]);
    assert_ne!(first["nonce"], second["nonce"]);
    let recovered = NativeKey::unwrap(scope(), passphrase, &first.to_string()).unwrap();
    assert_eq!(
        recovered
            .open(Purpose::Record, &locator(&context), &a)
            .unwrap()
            .as_slice(),
        b"public fixture"
    );
}

#[test]
fn payment_cards_have_their_own_encryption_domain() {
    let key = NativeKey::generate(scope()).unwrap();
    let mut card = context("passwords");
    card.collection = "credit-cards".into();
    let sealed = key.seal(Purpose::Record, &card, b"card fixture").unwrap();
    assert_eq!(
        key.open(Purpose::Record, &locator(&card), &sealed)
            .unwrap()
            .as_slice(),
        b"card fixture"
    );
    assert!(key
        .open(Purpose::Record, &locator(&context("passwords")), &sealed)
        .is_err());
}

#[test]
fn kdf_cost_and_versions_are_rejected_before_derivation() {
    let original = vectors()["bundle"].clone();
    for field in ["memory_kib", "iterations", "parallelism"] {
        let mut modified = original.clone();
        modified["kdf"][field] = json!(u32::MAX);
        assert!(matches!(
            NativeKey::unwrap(scope(), b"public fixture secret", &modified.to_string()),
            Err(CryptoError::UnsupportedVersion)
        ));
    }
    for field in ["bundle_version", "crypto_version"] {
        let mut modified = original.clone();
        modified[field] = json!(1);
        assert!(matches!(
            NativeKey::unwrap(scope(), b"public fixture secret", &modified.to_string()),
            Err(CryptoError::UnsupportedVersion)
        ));
    }
}

#[test]
fn boundaries_and_malformed_metadata_are_rejected() {
    let key = fixture_key();
    let context = context("bookmarks");
    let expected = locator(&context);
    for bytes in [vec![], vec![42; MAX_NATIVE_PLAINTEXT_BYTES]] {
        let sealed = key.seal(Purpose::Record, &context, &bytes).unwrap();
        assert!(sealed.len() <= MAX_NATIVE_ENVELOPE_BYTES);
        assert_eq!(
            key.open(Purpose::Record, &expected, &sealed)
                .unwrap()
                .as_slice(),
            bytes
        );
    }
    assert_eq!(
        key.seal(
            Purpose::Record,
            &context,
            &vec![0; MAX_NATIVE_PLAINTEXT_BYTES + 1]
        ),
        Err(CryptoError::InvalidInput)
    );
    assert_eq!(
        key.open(
            Purpose::Record,
            &expected,
            &" ".repeat(MAX_NATIVE_ENVELOPE_BYTES + 1)
        ),
        Err(CryptoError::InvalidInput)
    );
    assert!(key.open(Purpose::Record, &expected, "{}").is_err());
    assert!(key.wrap(b"short").is_err());
    for revision in ["", "00", "+1", "-1", "1.0", "18446744073709551616"] {
        let mut modified = context.clone();
        modified.base_revision = revision.into();
        assert_eq!(
            key.seal(Purpose::Record, &modified, b""),
            Err(CryptoError::InvalidInput)
        );
    }
    let envelope = vectors()["records"]["bookmarks"]["record"]["envelope"].clone();
    for (field, replacement) in [
        ("crypto_version", json!(3)),
        ("nonce", json!("AAAA")),
        ("extra", json!(true)),
    ] {
        let mut modified = envelope.clone();
        modified[field] = replacement;
        assert!(key
            .open(Purpose::Record, &expected, &modified.to_string())
            .is_err());
    }
    let duplicate = envelope
        .to_string()
        .replacen('{', "{\"crypto_version\":2,", 1);
    assert!(key.open(Purpose::Record, &expected, &duplicate).is_err());
    let mut unsupported = context;
    unsupported.collection = "open-tabs".into();
    assert_eq!(
        key.seal(Purpose::Record, &unsupported, b""),
        Err(CryptoError::UnsupportedCollection)
    );
}
