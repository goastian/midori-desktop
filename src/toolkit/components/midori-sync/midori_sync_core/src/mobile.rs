/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use crate::{bookmarks, history, keyring::Keyring, native::*, passwords};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::Serialize;
use serde_json::{json, Value};
use zeroize::Zeroizing;

#[derive(Default)]
pub struct MobileCrypto(Keyring);

#[derive(Serialize)]
struct Bundle<'a> {
    key_id: &'a str,
    encrypted_bundle: &'a str,
}

#[derive(Serialize)]
struct Rotation<'a> {
    operation_id: &'a str,
    target_key_id: &'a str,
    source_key_ids: Vec<&'a str>,
    phase: &'a str,
}

fn text<'a>(value: &'a Value, name: &str) -> Result<&'a str, &'static str> {
    value[name].as_str().ok_or("invalid_request")
}

fn bundle(value: &Value) -> Result<Bundle<'_>, &'static str> {
    Ok(Bundle {
        key_id: text(value, "key_id")?,
        encrypted_bundle: text(value, "encrypted_bundle")?,
    })
}

fn registry_bytes(state: &Value) -> Result<Zeroizing<Vec<u8>>, &'static str> {
    let version = state["registry_auth_version"]
        .as_u64()
        .ok_or("invalid_registry")?;
    if version != 2 {
        return Err("registry_version_unsupported");
    }
    let mut keys = state["keys"]
        .as_array()
        .ok_or("invalid_registry")?
        .iter()
        .map(bundle)
        .collect::<Result<Vec<_>, _>>()?;
    keys.sort_by(|a, b| a.key_id.cmp(b.key_id));
    let rotation = if state["rotation"].is_null() {
        None
    } else {
        let r = &state["rotation"];
        let mut sources = r["source_key_ids"]
            .as_array()
            .ok_or("invalid_registry")?
            .iter()
            .map(|v| v.as_str().ok_or("invalid_registry"))
            .collect::<Result<Vec<_>, _>>()?;
        sources.sort_unstable();
        Some(Rotation {
            operation_id: text(r, "operation_id")?,
            target_key_id: text(r, "target_key_id")?,
            source_key_ids: sources,
            phase: text(r, "phase")?,
        })
    };
    let bytes = serde_json::to_vec(&(
        "MidoriSync/key-registry/v2",
        text(state, "epoch")?,
        text(state, "revision")?,
        text(state, "active_key_id")?,
        bundle(&state["identity_key"])?,
        keys,
        text(state, "custody")?,
        state["server_recovery"]
            .as_bool()
            .ok_or("invalid_registry")?,
        rotation,
    ))
    .map_err(|_| "invalid_registry")?;
    Ok(Zeroizing::new(bytes))
}

impl MobileCrypto {
    pub fn request(&mut self, bytes: &[u8]) -> Result<Zeroizing<Vec<u8>>, &'static str> {
        if bytes.len() > 1_048_576 {
            return Err("request_too_large");
        }
        let value: Value = serde_json::from_slice(bytes).map_err(|_| "invalid_request")?;
        let handle = value["handle"]
            .as_u64()
            .and_then(|v| u32::try_from(v).ok())
            .unwrap_or(0);
        let result = match text(&value, "action")? {
            "generate" => {
                let scope =
                    AccountScope::from_json(text(&value, "scope")?).map_err(|_| "invalid_scope")?;
                json!(self.0.generate_native(scope).map_err(|_| "key_capacity")?)
            }
            "recover" => {
                let scope =
                    AccountScope::from_json(text(&value, "scope")?).map_err(|_| "invalid_scope")?;
                let secret = Zeroizing::new(
                    STANDARD
                        .decode(text(&value, "secret")?)
                        .map_err(|_| "invalid_secret")?,
                );
                json!(self
                    .0
                    .recover_native(scope, &secret, text(&value, "bundle")?)
                    .map_err(|_| "recovery_failed")?)
            }
            "key_id" => json!(self.0.native_key_id(handle).map_err(|_| "unknown_key")?),
            "wrap" => {
                let secret = Zeroizing::new(
                    STANDARD
                        .decode(text(&value, "secret")?)
                        .map_err(|_| "invalid_secret")?,
                );
                json!(self
                    .0
                    .wrap_native(handle, &secret)
                    .map_err(|_| "wrap_failed")?)
            }
            "derive" => json!(self
                .0
                .native_record_id(
                    handle,
                    text(&value, "collection")?,
                    serde_json::from_str::<Value>(text(&value, "input")?)
                        .map_err(|_| "invalid_identity")?
                        .to_string()
                        .as_bytes()
                )
                .map_err(|_| "identity_failed")?),
            "registry" => json!(self
                .0
                .native_record_id(handle, "devices", &registry_bytes(&value["state"])?)
                .map_err(|_| "registry_failed")?),
            "seal" => {
                let context = RecordContext::from_json(&value["context"].to_string())
                    .map_err(|_| "invalid_context")?;
                json!(self
                    .0
                    .seal_native(
                        handle,
                        Purpose::Record,
                        &context,
                        text(&value, "plaintext")?.as_bytes()
                    )
                    .map_err(|_| "seal_failed")?)
            }
            "open" => {
                let locator = RecordLocator::from_json(&value["locator"].to_string())
                    .map_err(|_| "invalid_locator")?;
                let bytes = self
                    .0
                    .open_native(handle, Purpose::Record, &locator, text(&value, "envelope")?)
                    .map_err(|_| "authentication_failed")?;
                json!(std::str::from_utf8(&bytes).map_err(|_| "invalid_plaintext")?)
            }
            "bookmarks" => {
                return bookmarks::process_request(text(&value, "request")?.as_bytes())
                    .map_err(|_| "invalid_record")
            }
            "history" => {
                return history::process_request(text(&value, "request")?.as_bytes())
                    .map_err(|_| "invalid_record")
            }
            "passwords" => {
                return passwords::process_request(text(&value, "request")?.as_bytes())
                    .map_err(|_| "invalid_record")
            }
            "forget" => {
                self.0.forget(handle).map_err(|_| "unknown_key")?;
                Value::Null
            }
            _ => return Err("invalid_action"),
        };
        Ok(Zeroizing::new(
            serde_json::to_vec(&result).map_err(|_| "invalid_result")?,
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_serialization_matches_desktop_order() {
        let state = json!({"epoch":"epoch", "revision":"2", "active_key_id":"z", "identity_key":
            {"key_id":"i","encrypted_bundle":"identity"}, "keys":[{"key_id":"z","encrypted_bundle":"data"}],
            "custody":"client", "server_recovery":false, "registry_auth_version":2,"rotation":null});
        assert_eq!(
            std::str::from_utf8(&registry_bytes(&state).unwrap()).unwrap(),
            r#"["MidoriSync/key-registry/v2","epoch","2","z",{"key_id":"i","encrypted_bundle":"identity"},[{"key_id":"z","encrypted_bundle":"data"}],"client",false,null]"#
        );
    }
}
