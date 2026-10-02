/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use zeroize::{Zeroize, Zeroizing};

pub const MAX_HISTORY_REQUEST_BYTES: usize = 786_432;
pub const MAX_HISTORY_PLAINTEXT_BYTES: usize = 190_000;
const DAY_MICROSECONDS: u64 = 86_400_000_000;
const MAX_SAFE_MICROSECONDS: u64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Visit {
    at_usec: u64,
    transition: u8,
    count: u16,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct HistoryPage {
    version: u8,
    url: String,
    title: String,
    day_start_usec: u64,
    visits: Vec<Visit>,
}

impl Drop for HistoryPage {
    fn drop(&mut self) {
        self.url.zeroize();
        self.title.zeroize();
        for visit in &mut self.visits {
            visit.at_usec = 0;
            visit.transition = 0;
            visit.count = 0;
        }
    }
}

impl HistoryPage {
    fn validate(&self) -> Result<(), HistoryError> {
        let authority = self
            .url
            .strip_prefix("https://")
            .or_else(|| self.url.strip_prefix("http://"))
            .and_then(|rest| rest.split(['/', '?', '#']).next())
            .ok_or(HistoryError)?;
        if self.version != 1
            || self.url.len() > 2000
            || self
                .url
                .chars()
                .any(|ch| ch.is_control() || ch.is_whitespace() || ch == '\\')
            || authority.is_empty()
            || authority.contains('@')
            || self.title.encode_utf16().count() > 4096
            || self.title.chars().any(char::is_control)
            || self.day_start_usec % DAY_MICROSECONDS != 0
            || self.day_start_usec > MAX_SAFE_MICROSECONDS - DAY_MICROSECONDS
            || self.visits.is_empty()
            || self.visits.len() > 2048
        {
            return Err(HistoryError);
        }
        let mut previous = None;
        for visit in &self.visits {
            let key = (visit.at_usec, visit.transition);
            if visit.at_usec < self.day_start_usec
                || visit.at_usec >= self.day_start_usec + DAY_MICROSECONDS
                || !matches!(visit.transition, 1..=3 | 5..=9)
                || visit.count == 0
                || previous.is_some_and(|value| value >= key)
            {
                return Err(HistoryError);
            }
            previous = Some(key);
        }
        let encoded = Zeroizing::new(serde_json::to_vec(self).map_err(|_| HistoryError)?);
        if encoded.len() > MAX_HISTORY_PLAINTEXT_BYTES {
            return Err(HistoryError);
        }
        Ok(())
    }
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "lowercase", deny_unknown_fields)]
enum Request {
    Validate {
        value: HistoryPage,
    },
    Merge {
        base: Option<HistoryPage>,
        local: Option<HistoryPage>,
        remote: Option<HistoryPage>,
    },
}

#[derive(Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
enum Decision {
    Apply { value: Option<HistoryPage> },
    KeepLocal,
    Conflict { reason: &'static str },
}

fn visit_counts(page: Option<&HistoryPage>) -> BTreeMap<(u64, u8), u16> {
    page.map(|page| {
        page.visits
            .iter()
            .map(|visit| ((visit.at_usec, visit.transition), visit.count))
            .collect()
    })
    .unwrap_or_default()
}

fn reconcile(
    base: Option<&HistoryPage>,
    local: Option<&HistoryPage>,
    remote: Option<&HistoryPage>,
) -> Decision {
    if local == remote && (base.is_none() || base == local) {
        return Decision::KeepLocal;
    }
    match (base, local, remote) {
        (None, None, Some(remote)) => Decision::Apply {
            value: Some(remote.clone()),
        },
        (Some(base), Some(local), None) if base == local => Decision::Apply { value: None },
        (Some(_), Some(_), None) | (Some(_), None, Some(_)) => Decision::Conflict {
            reason: "deletion_edit",
        },
        (_, None, None) => Decision::KeepLocal,
        (base, Some(local), Some(remote)) => {
            let base_counts = visit_counts(base);
            let local_counts = visit_counts(Some(local));
            let remote_counts = visit_counts(Some(remote));
            let keys: BTreeSet<_> = local_counts
                .keys()
                .chain(remote_counts.keys())
                .chain(base_counts.keys())
                .copied()
                .collect();
            let mut merged = local.clone();
            merged.title = if local.title == remote.title {
                local.title.clone()
            } else if base.is_some_and(|page| local.title == page.title) {
                remote.title.clone()
            } else if base.is_some_and(|page| remote.title == page.title) {
                local.title.clone()
            } else {
                local.title.clone().max(remote.title.clone())
            };
            merged.visits.clear();
            for (at_usec, transition) in keys {
                let original = base_counts
                    .get(&(at_usec, transition))
                    .copied()
                    .unwrap_or(0);
                let left = local_counts
                    .get(&(at_usec, transition))
                    .copied()
                    .unwrap_or(0);
                let right = remote_counts
                    .get(&(at_usec, transition))
                    .copied()
                    .unwrap_or(0);
                if original > 0 && left < original {
                    return Decision::Conflict {
                        reason: "local_visits_removed",
                    };
                }
                let count = if original == 0 {
                    left.max(right)
                } else {
                    original
                        .checked_add(left.saturating_sub(original))
                        .and_then(|count| count.checked_add(right.saturating_sub(original)))
                        .unwrap_or(0)
                };
                if count == 0 {
                    return Decision::Conflict {
                        reason: "visit_count_overflow",
                    };
                }
                merged.visits.push(Visit {
                    at_usec,
                    transition,
                    count,
                });
            }
            if merged.validate().is_err() {
                return Decision::Conflict {
                    reason: "history_record_too_large",
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
pub struct HistoryError;

pub fn process_request(bytes: &[u8]) -> Result<Zeroizing<Vec<u8>>, HistoryError> {
    if bytes.is_empty() || bytes.len() > MAX_HISTORY_REQUEST_BYTES {
        return Err(HistoryError);
    }
    let request: Request = serde_json::from_slice(bytes).map_err(|_| HistoryError)?;
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
            for page in [base.as_ref(), local.as_ref(), remote.as_ref()]
                .into_iter()
                .flatten()
            {
                page.validate()?;
            }
            let identity = [base.as_ref(), local.as_ref(), remote.as_ref()]
                .into_iter()
                .flatten()
                .next()
                .map(|page| (&page.url, page.day_start_usec));
            if [base.as_ref(), local.as_ref(), remote.as_ref()]
                .into_iter()
                .flatten()
                .any(|page| Some((&page.url, page.day_start_usec)) != identity)
            {
                return Err(HistoryError);
            }
            serde_json::to_vec(&reconcile(base.as_ref(), local.as_ref(), remote.as_ref()))
        }
    };
    result.map(Zeroizing::new).map_err(|_| HistoryError)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};

    fn page() -> HistoryPage {
        HistoryPage {
            version: 1,
            url: "https://example.invalid/page".into(),
            title: "Page".into(),
            day_start_usec: DAY_MICROSECONDS * 20_000,
            visits: vec![Visit {
                at_usec: DAY_MICROSECONDS * 20_000 + 101,
                transition: 1,
                count: 1,
            }],
        }
    }

    #[test]
    fn merges_independent_visits_without_losing_microseconds() {
        let base = page();
        let mut local = base.clone();
        local.visits.push(Visit {
            at_usec: base.day_start_usec + 102,
            transition: 2,
            count: 1,
        });
        let mut remote = base.clone();
        remote.visits.push(Visit {
            at_usec: base.day_start_usec + 103,
            transition: 9,
            count: 1,
        });
        let Decision::Apply {
            value: Some(merged),
        } = reconcile(Some(&base), Some(&local), Some(&remote))
        else {
            panic!("expected merged visits");
        };
        assert_eq!(merged.visits.len(), 3);
        assert_eq!(merged.visits[1].at_usec, base.day_start_usec + 102);
        assert_eq!(merged.visits[2].at_usec, base.day_start_usec + 103);
        assert_eq!(
            reconcile(Some(&base), Some(&merged), Some(&remote)),
            Decision::KeepLocal
        );
    }

    #[test]
    fn aggregates_concurrent_identical_timestamps() {
        let base = page();
        let mut local = base.clone();
        let mut remote = base.clone();
        local.visits[0].count = 2;
        remote.visits[0].count = 2;
        let Decision::Apply {
            value: Some(merged),
        } = reconcile(Some(&base), Some(&local), Some(&remote))
        else {
            panic!("expected merged visits");
        };
        assert_eq!(merged.visits[0].count, 3);
    }

    #[test]
    fn deletion_conflicts_with_concurrent_visit() {
        let base = page();
        let mut local = base.clone();
        local.visits.push(Visit {
            at_usec: base.day_start_usec + 104,
            transition: 1,
            count: 1,
        });
        assert_eq!(
            reconcile(Some(&base), Some(&local), None),
            Decision::Conflict {
                reason: "deletion_edit"
            }
        );
    }

    #[test]
    fn does_not_restore_locally_removed_visits() {
        let base = page();
        let mut local = base.clone();
        local.visits[0].count = 1;
        let mut base_with_two = base.clone();
        base_with_two.visits[0].count = 2;
        let mut remote = base_with_two.clone();
        remote.visits.push(Visit {
            at_usec: base.day_start_usec + 105,
            transition: 1,
            count: 1,
        });
        assert_eq!(
            reconcile(Some(&base_with_two), Some(&local), Some(&remote)),
            Decision::Conflict {
                reason: "local_visits_removed"
            }
        );
    }

    #[test]
    fn rejects_invalid_visits_and_cross_page_merges() {
        let mut invalid = page();
        invalid.visits[0].transition = 4;
        assert_eq!(invalid.validate(), Err(HistoryError));
        let mut invalid = page();
        invalid.visits[0].at_usec = invalid.day_start_usec + DAY_MICROSECONDS;
        assert_eq!(invalid.validate(), Err(HistoryError));
        let mut other = page();
        other.url = "https://other.invalid/".into();
        let request =
            json!({ "action": "merge", "base": page(), "local": page(), "remote": other });
        assert_eq!(
            process_request(request.to_string().as_bytes()),
            Err(HistoryError)
        );
    }

    #[test]
    fn validates_canonical_wire_shape() {
        let request = json!({ "action": "validate", "value": page() });
        let result = process_request(request.to_string().as_bytes()).unwrap();
        let value: Value = serde_json::from_slice(&result).unwrap();
        assert_eq!(value["version"], 1);
        assert_eq!(value["visits"][0]["atUsec"], page().day_start_usec + 101);
        assert_eq!(value["dayStartUsec"], page().day_start_usec);
    }
}
