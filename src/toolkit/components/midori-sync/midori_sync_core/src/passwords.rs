/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, Zeroizing};

pub const MAX_PASSWORD_REQUEST_BYTES: usize = 786_432;
const MAX_PASSWORD_PLAINTEXT_BYTES: usize = 190_000;

#[derive(Clone, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Login {
    version: u8,
    origin: String,
    #[serde(deserialize_with = "nullable")]
    form_action_origin: Option<String>,
    #[serde(deserialize_with = "nullable")]
    http_realm: Option<String>,
    username: String,
    password: String,
    username_field: String,
    password_field: String,
    time_created: u64,
    time_password_changed: u64,
}

fn nullable<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::deserialize(deserializer)
}

impl Drop for Login {
    fn drop(&mut self) {
        self.origin.zeroize();
        self.form_action_origin.zeroize();
        self.http_realm.zeroize();
        self.username.zeroize();
        self.password.zeroize();
        self.username_field.zeroize();
        self.password_field.zeroize();
    }
}

fn valid_origin(value: &str) -> bool {
    let authority = value
        .strip_prefix("https://")
        .or_else(|| value.strip_prefix("http://"));
    authority.is_some_and(|host| {
        !host.is_empty()
            && host.len() <= 2048
            && !host.contains(['/', '?', '#', '@', '\\'])
            && !host
                .chars()
                .any(|character| character.is_whitespace() || character.is_control())
    })
}

impl Login {
    fn validate(&self) -> Result<(), PasswordError> {
        if self.version != 1
            || !valid_origin(&self.origin)
            || !matches!(
                (&self.form_action_origin, &self.http_realm),
                (Some(_), None) | (None, Some(_))
            )
            || self
                .form_action_origin
                .as_ref()
                .is_some_and(|value| !value.is_empty() && !valid_origin(value))
            || self
                .http_realm
                .as_ref()
                .is_some_and(|value| value.len() > 4096 || value.contains('\0'))
            || self.username.encode_utf16().count() > 4096
            || self.password.encode_utf16().count() > 65536
            || self.username_field.encode_utf16().count() > 1024
            || self.password_field.encode_utf16().count() > 1024
            || self.time_created > 253_402_300_799_999
            || self.time_password_changed > 253_402_300_799_999
        {
            return Err(PasswordError);
        }
        let encoded = Zeroizing::new(serde_json::to_vec(self).map_err(|_| PasswordError)?);
        if encoded.len() > MAX_PASSWORD_PLAINTEXT_BYTES {
            return Err(PasswordError);
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "lowercase", deny_unknown_fields)]
enum Request {
    Validate {
        value: Login,
    },
    Merge {
        #[serde(deserialize_with = "nullable")]
        base: Option<Login>,
        #[serde(deserialize_with = "nullable")]
        local: Option<Login>,
        #[serde(deserialize_with = "nullable")]
        remote: Option<Login>,
    },
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
enum Decision {
    Apply { value: Option<Login> },
    KeepLocal,
    Conflict { reason: &'static str },
}

fn select<T: Clone + Eq>(base: Option<&T>, local: &T, remote: &T) -> Option<T> {
    if local == remote {
        Some(local.clone())
    } else if base.is_some_and(|value| value == local) {
        Some(remote.clone())
    } else if base.is_some_and(|value| value == remote) {
        Some(local.clone())
    } else {
        None
    }
}

fn compatible<T: Eq>(base: Option<&T>, local: &T, remote: &T) -> bool {
    local == remote || base.is_some_and(|value| value == local || value == remote)
}

fn reconcile(base: Option<&Login>, local: Option<&Login>, remote: Option<&Login>) -> Decision {
    if local == remote {
        return Decision::KeepLocal;
    }
    match (base, local, remote) {
        (None, None, Some(remote)) => Decision::Apply {
            value: Some(remote.clone()),
        },
        (Some(base), Some(local), None) if base == local => Decision::Apply { value: None },
        (Some(base), None, Some(remote)) if base == remote => Decision::KeepLocal,
        (Some(_), Some(_), None) | (Some(_), None, Some(_)) => Decision::Conflict {
            reason: "deletion_edit",
        },
        (_, None, None) => Decision::KeepLocal,
        (base, Some(local), Some(remote)) => {
            if !compatible(
                base.map(|login| &login.password),
                &local.password,
                &remote.password,
            ) {
                return Decision::Conflict {
                    reason: "password_diverged",
                };
            }
            let Some(origin) = select(
                base.map(|login| &login.origin),
                &local.origin,
                &remote.origin,
            ) else {
                return Decision::Conflict {
                    reason: "metadata_diverged",
                };
            };
            let Some(form_action_origin) = select(
                base.map(|login| &login.form_action_origin),
                &local.form_action_origin,
                &remote.form_action_origin,
            ) else {
                return Decision::Conflict {
                    reason: "metadata_diverged",
                };
            };
            let Some(http_realm) = select(
                base.map(|login| &login.http_realm),
                &local.http_realm,
                &remote.http_realm,
            ) else {
                return Decision::Conflict {
                    reason: "metadata_diverged",
                };
            };
            let Some(username_field) = select(
                base.map(|login| &login.username_field),
                &local.username_field,
                &remote.username_field,
            ) else {
                return Decision::Conflict {
                    reason: "metadata_diverged",
                };
            };
            let Some(password_field) = select(
                base.map(|login| &login.password_field),
                &local.password_field,
                &remote.password_field,
            ) else {
                return Decision::Conflict {
                    reason: "metadata_diverged",
                };
            };
            let Some(username) = select(
                base.map(|login| &login.username),
                &local.username,
                &remote.username,
            ) else {
                return Decision::Conflict {
                    reason: "metadata_diverged",
                };
            };
            let password = select(
                base.map(|login| &login.password),
                &local.password,
                &remote.password,
            )
            .expect("password compatibility checked before cloning");
            let merged = Login {
                version: 1,
                origin,
                form_action_origin,
                http_realm,
                username,
                password,
                username_field,
                password_field,
                time_created: local.time_created.min(remote.time_created),
                time_password_changed: local
                    .time_password_changed
                    .max(remote.time_password_changed),
            };
            if merged.validate().is_err() {
                return Decision::Conflict {
                    reason: "invalid_merged_login",
                };
            }
            if &merged == local {
                Decision::KeepLocal
            } else {
                Decision::Apply {
                    value: Some(merged),
                }
            }
        }
        _ => Decision::KeepLocal,
    }
}

#[derive(Debug, Eq, PartialEq)]
pub struct PasswordError;

pub fn process_request(bytes: &[u8]) -> Result<Zeroizing<Vec<u8>>, PasswordError> {
    if bytes.is_empty() || bytes.len() > MAX_PASSWORD_REQUEST_BYTES {
        return Err(PasswordError);
    }
    let request: Request = serde_json::from_slice(bytes).map_err(|_| PasswordError)?;
    let result = match request {
        Request::Validate { value } => {
            value.validate()?;
            serde_json::to_vec(&value)
        }
        Request::Merge {
            base,
            local,
            remote,
        } => {
            for login in [base.as_ref(), local.as_ref(), remote.as_ref()]
                .into_iter()
                .flatten()
            {
                login.validate()?;
            }
            serde_json::to_vec(&reconcile(base.as_ref(), local.as_ref(), remote.as_ref()))
        }
    };
    result.map(Zeroizing::new).map_err(|_| PasswordError)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn login() -> Login {
        Login {
            version: 1,
            origin: "https://example.invalid".into(),
            form_action_origin: Some("https://example.invalid".into()),
            http_realm: None,
            username: "person".into(),
            password: "secret".into(),
            username_field: "user".into(),
            password_field: "pass".into(),
            time_created: 1_700_000_000_000,
            time_password_changed: 1_700_000_000_000,
        }
    }

    #[test]
    fn merges_independent_login_changes() {
        let base = login();
        let mut local = base.clone();
        local.username_field = "email".into();
        let mut remote = base.clone();
        remote.password = "new secret".into();
        remote.time_password_changed += 1;
        let Decision::Apply {
            value: Some(merged),
        } = reconcile(Some(&base), Some(&local), Some(&remote))
        else {
            panic!("expected merged login");
        };
        assert_eq!(merged.username_field, "email");
        assert_eq!(merged.password, "new secret");
    }

    #[test]
    fn concurrent_password_changes_conflict() {
        let base = login();
        let mut local = base.clone();
        local.password = "local secret".into();
        let mut remote = base.clone();
        remote.password = "remote secret".into();
        assert!(matches!(
            reconcile(Some(&base), Some(&local), Some(&remote)),
            Decision::Conflict {
                reason: "password_diverged"
            }
        ));
    }

    #[test]
    fn deletions_never_discard_concurrent_edits() {
        let base = login();
        let mut local = base.clone();
        local.password = "local secret".into();
        assert!(matches!(
            reconcile(Some(&base), Some(&local), None),
            Decision::Conflict {
                reason: "deletion_edit"
            }
        ));
        assert!(matches!(
            reconcile(Some(&base), Some(&base), None),
            Decision::Apply { value: None }
        ));
    }

    #[test]
    fn validates_web_origins_and_exclusive_login_kind() {
        let mut invalid = login();
        invalid.origin = "chrome://FirefoxAccounts".into();
        assert_eq!(invalid.validate(), Err(PasswordError));
        let mut invalid = login();
        invalid.http_realm = Some("realm".into());
        assert_eq!(invalid.validate(), Err(PasswordError));
        let mut invalid = login();
        invalid.password = "a".repeat(100_000);
        assert_eq!(invalid.validate(), Err(PasswordError));
    }

    #[test]
    fn wire_response_omits_secret_from_errors() {
        let request = json!({ "action": "validate", "value": login() });
        let response: Value =
            serde_json::from_slice(&process_request(request.to_string().as_bytes()).unwrap())
                .unwrap();
        assert_eq!(response["password"], "secret");
        let malformed = json!({ "action": "validate", "value": { "password": "never log this" } });
        assert_eq!(
            process_request(malformed.to_string().as_bytes()),
            Err(PasswordError)
        );
    }
}
