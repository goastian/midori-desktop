/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, Zeroizing};

pub const MAX_BOOKMARK_REQUEST_BYTES: usize = 524288;
const RESERVED_GUIDS: [&str; 11] = [
    "root________",
    "menu________",
    "toolbar_____",
    "unfiled_____",
    "mobile______",
    "tags________",
    "new_________",
    "menu_______v",
    "toolbar____v",
    "unfiled____v",
    "mobile_____v",
];

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Bookmark,
    Folder,
    Separator,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Bookmark {
    version: u8,
    kind: Kind,
    parent_guid: String,
    index: u32,
    title: String,
    #[serde(deserialize_with = "nullable")]
    url: Option<String>,
    date_added: u64,
}

fn nullable<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::deserialize(deserializer)
}

impl Drop for Bookmark {
    fn drop(&mut self) {
        self.title.zeroize();
        self.url.zeroize();
    }
}

fn guid(value: &str) -> bool {
    value.len() == 12
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
}

impl Bookmark {
    fn validate(&self, id: &str) -> Result<(), BookmarkError> {
        if !guid(id)
            || RESERVED_GUIDS.contains(&id)
            || self.version != 1
            || !guid(&self.parent_guid)
            || self.parent_guid == id
            || matches!(self.parent_guid.as_str(), "root________" | "tags________")
            || RESERVED_GUIDS[6..].contains(&self.parent_guid.as_str())
            || self.index > 1_000_000
            || self.title.encode_utf16().count() > 4096
            || self.title.contains('\0')
            || self.date_added > 253_402_300_799_999
        {
            return Err(BookmarkError);
        }
        match (&self.kind, &self.url) {
            (Kind::Bookmark, Some(url)) => {
                let scheme = url.split_once(':').map(|(scheme, _)| scheme).unwrap_or("");
                if url.len() > 65536
                    || url.chars().any(char::is_control)
                    || scheme.is_empty()
                    || !scheme.as_bytes()[0].is_ascii_alphabetic()
                    || !scheme.bytes().all(|byte| {
                        byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'-' | b'.')
                    })
                {
                    return Err(BookmarkError);
                }
            }
            (Kind::Folder | Kind::Separator, None) => {}
            _ => return Err(BookmarkError),
        }
        if self.kind == Kind::Separator && !self.title.is_empty() {
            return Err(BookmarkError);
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "lowercase", deny_unknown_fields)]
enum Request {
    Validate {
        id: String,
        value: Bookmark,
    },
    Merge {
        id: String,
        #[serde(deserialize_with = "nullable")]
        base: Option<Bookmark>,
        #[serde(deserialize_with = "nullable")]
        local: Option<Bookmark>,
        #[serde(deserialize_with = "nullable")]
        remote: Option<Bookmark>,
    },
    Prepare {
        id: String,
        #[serde(deserialize_with = "nullable")]
        base: Option<Bookmark>,
        #[serde(deserialize_with = "nullable")]
        local: Option<Bookmark>,
        #[serde(deserialize_with = "nullable")]
        remote: Option<Bookmark>,
        #[serde(rename = "localPosition", deserialize_with = "nullable")]
        local_position: Option<Position>,
    },
    Project {
        id: String,
        effects: Effects,
        items: Vec<PositionedItem>,
    },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Position {
    parent_guid: String,
    index: u32,
}

impl Position {
    fn of(value: &Bookmark) -> Self {
        Self {
            parent_guid: value.parent_guid.clone(),
            index: value.index,
        }
    }

    fn validate(&self) -> Result<(), BookmarkError> {
        if !guid(&self.parent_guid)
            || self.index > 1_000_000
            || matches!(self.parent_guid.as_str(), "root________" | "tags________")
            || RESERVED_GUIDS[6..].contains(&self.parent_guid.as_str())
        {
            return Err(BookmarkError);
        }
        Ok(())
    }

    fn assign(&self, value: &mut Bookmark) {
        value.parent_guid.clone_from(&self.parent_guid);
        value.index = self.index;
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
struct Effects {
    #[serde(deserialize_with = "nullable")]
    from: Option<Position>,
    #[serde(deserialize_with = "nullable")]
    to: Option<Position>,
}

#[derive(Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct PositionedItem {
    id: String,
    position: Position,
}

#[derive(Serialize)]
struct Prepared {
    decision: Decision,
    position: Option<Position>,
    effects: Option<Effects>,
}

fn prepare(
    id: &str,
    mut base: Option<Bookmark>,
    local: Option<Bookmark>,
    mut remote: Option<Bookmark>,
    local_position: Option<Position>,
) -> Result<Prepared, BookmarkError> {
    validate_merge(id, &base, &local, &remote)?;
    if let Some(position) = local_position {
        position.validate()?;
        let base = base.as_mut().ok_or(BookmarkError)?;
        if position.parent_guid != base.parent_guid {
            return Err(BookmarkError);
        }
        if let Some(remote) = remote.as_mut() {
            if Position::of(remote) == Position::of(base) {
                position.assign(remote);
            }
        }
        position.assign(base);
    }
    let position = remote.as_ref().map(Position::of);
    let decision = reconcile(base.as_ref(), local.as_ref(), remote.as_ref());
    let effects = if let Decision::Apply { value } = &decision {
        let from = local.as_ref().map(Position::of);
        let to = value.as_ref().map(Position::of);
        (from != to).then_some(Effects { from, to })
    } else {
        None
    };
    Ok(Prepared {
        decision,
        position,
        effects,
    })
}

fn project(
    id: &str,
    effects: Effects,
    mut items: Vec<PositionedItem>,
) -> Result<Vec<PositionedItem>, BookmarkError> {
    if !guid(id) || RESERVED_GUIDS.contains(&id) || items.len() > 100 || effects.from == effects.to
    {
        return Err(BookmarkError);
    }
    for position in [&effects.from, &effects.to].into_iter().flatten() {
        position.validate()?;
    }
    for item in &mut items {
        if !guid(&item.id) || RESERVED_GUIDS.contains(&item.id.as_str()) {
            return Err(BookmarkError);
        }
        item.position.validate()?;
        if item.id == id {
            continue;
        }
        if let Some(from) = &effects.from {
            if item.position.parent_guid == from.parent_guid && item.position.index > from.index {
                item.position.index -= 1;
            }
        }
        if let Some(to) = &effects.to {
            if item.position.parent_guid == to.parent_guid && item.position.index >= to.index {
                item.position.index += 1;
            }
        }
        item.position.validate()?;
    }
    Ok(items)
}

fn validate_merge(
    id: &str,
    base: &Option<Bookmark>,
    local: &Option<Bookmark>,
    remote: &Option<Bookmark>,
) -> Result<(), BookmarkError> {
    if !guid(id) || RESERVED_GUIDS.contains(&id) {
        return Err(BookmarkError);
    }
    for value in [base, local, remote].into_iter().flatten() {
        value.validate(id)?;
    }
    Ok(())
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
enum Decision {
    Apply {
        value: Option<Bookmark>,
    },
    KeepLocal,
    Conflict {
        reason: &'static str,
        fields: Vec<&'static str>,
    },
}

fn conflict(reason: &'static str) -> Decision {
    Decision::Conflict {
        reason,
        fields: vec![],
    }
}

fn reconcile(
    base: Option<&Bookmark>,
    local: Option<&Bookmark>,
    remote: Option<&Bookmark>,
) -> Decision {
    if local == remote {
        return Decision::KeepLocal;
    }
    match (base, local, remote) {
        (None, None, Some(remote)) => Decision::Apply {
            value: Some(remote.clone()),
        },
        (None, Some(_), _) => conflict("local_creation"),
        (Some(base), Some(local), None) => {
            if base == local {
                Decision::Apply { value: None }
            } else {
                conflict("deletion_edit")
            }
        }
        (Some(base), None, Some(remote)) => {
            if base == remote {
                Decision::KeepLocal
            } else {
                conflict("deletion_edit")
            }
        }
        (Some(base), Some(local), Some(remote)) => {
            if base.kind != local.kind || base.kind != remote.kind {
                return conflict("type_changed");
            }
            let mut merged = local.clone();
            let mut fields = vec![];
            if local.title == base.title {
                merged.title.clone_from(&remote.title);
            } else if remote.title != base.title && local.title != remote.title {
                fields.push("title");
            }
            if local.url == base.url {
                merged.url.clone_from(&remote.url);
            } else if remote.url != base.url && local.url != remote.url {
                fields.push("url");
            }
            let base_position = (&base.parent_guid, base.index);
            let local_position = (&local.parent_guid, local.index);
            let remote_position = (&remote.parent_guid, remote.index);
            if local_position == base_position {
                merged.parent_guid.clone_from(&remote.parent_guid);
                merged.index = remote.index;
            } else if remote_position != base_position && local_position != remote_position {
                fields.push("position");
            }
            merged.date_added = base.date_added.min(local.date_added).min(remote.date_added);
            if !fields.is_empty() {
                Decision::Conflict {
                    reason: "concurrent_fields",
                    fields,
                }
            } else if &merged == local {
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
pub struct BookmarkError;

pub fn process_request(bytes: &[u8]) -> Result<Zeroizing<Vec<u8>>, BookmarkError> {
    if bytes.is_empty() || bytes.len() > MAX_BOOKMARK_REQUEST_BYTES {
        return Err(BookmarkError);
    }
    let request: Request = serde_json::from_slice(bytes).map_err(|_| BookmarkError)?;
    let result = match request {
        Request::Validate { id, value } => {
            value.validate(&id)?;
            serde_json::to_vec(&value)
        }
        Request::Merge {
            id,
            base,
            local,
            remote,
        } => {
            validate_merge(&id, &base, &local, &remote)?;
            serde_json::to_vec(&reconcile(base.as_ref(), local.as_ref(), remote.as_ref()))
        }
        Request::Prepare {
            id,
            base,
            local,
            remote,
            local_position,
        } => serde_json::to_vec(&prepare(&id, base, local, remote, local_position)?),
        Request::Project { id, effects, items } => {
            serde_json::to_vec(&project(&id, effects, items)?)
        }
    };
    result.map(Zeroizing::new).map_err(|_| BookmarkError)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn bookmark() -> Bookmark {
        Bookmark {
            version: 1,
            kind: Kind::Bookmark,
            parent_guid: "toolbar_____".into(),
            index: 0,
            title: "Título ñ".into(),
            url: Some("https://example.invalid/one".into()),
            date_added: 1000,
        }
    }

    #[test]
    fn combines_independent_fields_and_is_idempotent() {
        let base = bookmark();
        let mut local = base.clone();
        local.title = "Local".into();
        let mut remote = base.clone();
        remote.url = Some("https://example.invalid/two".into());
        let Decision::Apply {
            value: Some(merged),
        } = reconcile(Some(&base), Some(&local), Some(&remote))
        else {
            panic!("Expected a merge");
        };
        assert_eq!(merged.title, local.title);
        assert_eq!(merged.url, remote.url);
        assert_eq!(
            reconcile(Some(&base), Some(&merged), Some(&remote)),
            Decision::KeepLocal
        );
    }

    #[test]
    fn conflicting_fields_and_position_remain_unresolved() {
        let base = bookmark();
        let mut local = base.clone();
        local.title = "Local".into();
        local.index = 2;
        let mut remote = base.clone();
        remote.title = "Remote".into();
        remote.parent_guid = "unfiled_____".into();
        assert_eq!(
            reconcile(Some(&base), Some(&local), Some(&remote)),
            Decision::Conflict {
                reason: "concurrent_fields",
                fields: vec!["title", "position"]
            }
        );
    }

    #[test]
    fn deletions_preserve_edits_and_repeated_creations_do_not_duplicate() {
        let base = bookmark();
        let mut changed = base.clone();
        changed.title = "Edited".into();
        assert_eq!(
            reconcile(Some(&base), Some(&base), None),
            Decision::Apply { value: None }
        );
        assert_eq!(
            reconcile(Some(&base), Some(&changed), None),
            conflict("deletion_edit")
        );
        assert_eq!(
            reconcile(Some(&base), None, Some(&changed)),
            conflict("deletion_edit")
        );
        assert_eq!(
            reconcile(Some(&base), None, Some(&base)),
            Decision::KeepLocal
        );
        assert_eq!(
            reconcile(None, Some(&base), Some(&base)),
            Decision::KeepLocal
        );
        assert_eq!(
            reconcile(None, Some(&base), Some(&changed)),
            conflict("local_creation")
        );
        assert_eq!(
            reconcile(None, Some(&base), None),
            conflict("local_creation")
        );
        assert_eq!(
            reconcile(None, None, Some(&base)),
            Decision::Apply { value: Some(base) }
        );
    }

    #[test]
    fn date_added_converges_and_type_changes_are_not_replacements() {
        let base = bookmark();
        let mut remote = base.clone();
        remote.date_added = 900;
        assert!(matches!(
            reconcile(Some(&base), Some(&base), Some(&remote)),
            Decision::Apply { .. }
        ));
        remote.kind = Kind::Folder;
        remote.url = None;
        assert_eq!(
            reconcile(Some(&base), Some(&base), Some(&remote)),
            conflict("type_changed")
        );
    }

    #[test]
    fn schema_rejects_roots_cycles_unknown_fields_and_unbounded_data() {
        let mut request = json!({"action":"validate", "id":"bookmark____", "value":bookmark()});
        assert!(process_request(&serde_json::to_vec(&request).unwrap()).is_ok());
        for (field, value) in [
            ("version", json!(2)),
            ("parentGuid", json!("bookmark____")),
            ("parentGuid", json!("tags________")),
            ("kind", json!("query")),
            ("title", json!("x".repeat(16385))),
            ("index", json!(-1)),
            ("dateAdded", json!(253_402_300_800_000_u64)),
            ("url", Value::Null),
            ("url", json!("not a URI")),
            ("url", json!("https://example.invalid/\n")),
            ("unexpected", json!(true)),
        ] {
            let mut invalid = request.clone();
            invalid["value"][field] = value;
            assert_eq!(
                process_request(&serde_json::to_vec(&invalid).unwrap()),
                Err(BookmarkError),
                "{field}"
            );
        }
        for id in RESERVED_GUIDS {
            request["id"] = json!(id);
            assert_eq!(
                process_request(&serde_json::to_vec(&request).unwrap()),
                Err(BookmarkError)
            );
        }
        assert_eq!(
            process_request(&vec![b' '; MAX_BOOKMARK_REQUEST_BYTES + 1]),
            Err(BookmarkError)
        );
        assert_eq!(
            process_request(br#"{"action":"validate","id":"bookmark____","value":{},"value":{}}"#),
            Err(BookmarkError)
        );
    }

    #[test]
    fn validates_folders_separators_unicode_and_returns_json() {
        for kind in [Kind::Folder, Kind::Separator] {
            let mut value = bookmark();
            value.kind = kind;
            value.url = None;
            if kind == Kind::Separator {
                value.title.clear();
            }
            let request = json!({"action":"validate", "id":"bookmark____", "value":value});
            let validated = process_request(&serde_json::to_vec(&request).unwrap()).unwrap();
            assert_eq!(
                serde_json::from_slice::<Value>(&validated).unwrap(),
                request["value"]
            );
            let mut missing_url = request.clone();
            missing_url["value"].as_object_mut().unwrap().remove("url");
            assert_eq!(
                process_request(&serde_json::to_vec(&missing_url).unwrap()),
                Err(BookmarkError)
            );
        }
        let complete = json!({"action":"merge", "id":"bookmark____", "base":bookmark(), "local":bookmark(), "remote":null});
        for field in ["base", "local", "remote"] {
            let mut incomplete = complete.clone();
            incomplete.as_object_mut().unwrap().remove(field);
            assert_eq!(
                process_request(&serde_json::to_vec(&incomplete).unwrap()),
                Err(BookmarkError)
            );
        }
    }

    #[test]
    fn projected_baselines_allow_mechanical_shifts_but_preserve_user_moves() {
        let mut base = bookmark();
        base.index = 2;
        let mut local = base.clone();
        local.index = 1;
        let position = Position::of(&local);
        let prepared = prepare(
            "bookmark____",
            Some(base.clone()),
            Some(local.clone()),
            None,
            Some(position.clone()),
        )
        .unwrap();
        assert_eq!(prepared.decision, Decision::Apply { value: None });
        assert_eq!(prepared.effects.unwrap().from, Some(position.clone()));
        local.index = 3;
        assert_eq!(
            prepare(
                "bookmark____",
                Some(base),
                Some(local),
                None,
                Some(position)
            )
            .unwrap()
            .decision,
            conflict("deletion_edit")
        );
    }

    #[test]
    fn independent_remote_edits_keep_the_projected_position_and_local_edits() {
        let mut base = bookmark();
        base.index = 2;
        let mut local = base.clone();
        local.index = 1;
        local.title = "Local edit".into();
        let position = Position::of(&local);
        let mut remote = base.clone();
        remote.url = Some("https://example.invalid/remote".into());
        let prepared = prepare(
            "bookmark____",
            Some(base.clone()),
            Some(local.clone()),
            Some(remote.clone()),
            Some(position.clone()),
        )
        .unwrap();
        assert_eq!(prepared.position, Some(position.clone()));
        assert!(prepared.effects.is_none());
        let Decision::Apply {
            value: Some(result),
        } = prepared.decision
        else {
            panic!("Expected merge");
        };
        assert_eq!(result.index, 1);
        assert_eq!(result.title, "Local edit");
        remote.index = 4;
        local.index = 3;
        let prepared = prepare(
            "bookmark____",
            Some(base),
            Some(local),
            Some(remote),
            Some(position),
        )
        .unwrap();
        assert_eq!(
            prepared.decision,
            Decision::Conflict {
                reason: "concurrent_fields",
                fields: vec!["position"]
            }
        );
    }

    #[test]
    fn projects_insert_delete_and_moves_without_moving_the_subject_twice() {
        let item = |id: &str, index| PositionedItem {
            id: id.into(),
            position: Position {
                parent_guid: "toolbar_____".into(),
                index,
            },
        };
        let effects = Effects {
            from: Some(Position {
                parent_guid: "toolbar_____".into(),
                index: 0,
            }),
            to: Some(Position {
                parent_guid: "toolbar_____".into(),
                index: 2,
            }),
        };
        let result = project(
            "bookmark____",
            effects,
            vec![
                item("bookmark____", 0),
                item("sibling1____", 1),
                item("sibling2____", 2),
                item("sibling3____", 3),
            ],
        )
        .unwrap();
        assert_eq!(
            result.iter().map(|i| i.position.index).collect::<Vec<_>>(),
            vec![0, 0, 1, 3]
        );
        let effects = Effects {
            from: Some(Position {
                parent_guid: "toolbar_____".into(),
                index: 1,
            }),
            to: Some(Position {
                parent_guid: "unfiled_____".into(),
                index: 0,
            }),
        };
        let result = project(
            "bookmark____",
            effects,
            vec![
                item("sibling1____", 2),
                PositionedItem {
                    id: "sibling2____".into(),
                    position: Position {
                        parent_guid: "unfiled_____".into(),
                        index: 0,
                    },
                },
            ],
        )
        .unwrap();
        assert_eq!(result[0].position.index, 1);
        assert_eq!(result[1].position.index, 1);
    }

    #[test]
    fn prepared_and_projected_requests_validate_context_and_bounds() {
        let mut request = json!({"action":"prepare", "id":"bookmark____", "base":bookmark(), "local":bookmark(), "remote":null,
            "localPosition":{"parentGuid":"toolbar_____", "index":0}});
        assert!(process_request(&serde_json::to_vec(&request).unwrap()).is_ok());
        request["localPosition"]["parentGuid"] = json!("unfiled_____");
        assert_eq!(
            process_request(&serde_json::to_vec(&request).unwrap()),
            Err(BookmarkError)
        );
        let mut request = json!({"action":"project", "id":"bookmark____", "effects":{"from":null,"to":{"parentGuid":"toolbar_____","index":0}},
            "items":[{"id":"sibling1____","position":{"parentGuid":"toolbar_____","index":1_000_000}}]});
        assert_eq!(
            process_request(&serde_json::to_vec(&request).unwrap()),
            Err(BookmarkError)
        );
        request["items"][0]["position"]["index"] = json!(0);
        assert!(process_request(&serde_json::to_vec(&request).unwrap()).is_ok());
        request["items"] = json!(vec![request["items"][0].clone(); 101]);
        assert_eq!(
            process_request(&serde_json::to_vec(&request).unwrap()),
            Err(BookmarkError)
        );
    }
}
