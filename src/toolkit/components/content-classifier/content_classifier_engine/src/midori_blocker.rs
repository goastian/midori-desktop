/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use adblock::{lists::FilterSet, resources::Resource, Engine};
use nserror::{nsresult, NS_ERROR_FAILURE, NS_ERROR_INVALID_ARG, NS_OK};
use nsstring::{nsACString, nsCString};
use thin_vec::ThinVec;

pub struct MidoriBlockerFFIEngine {
    engine: Engine,
}

#[no_mangle]
pub unsafe extern "C" fn midori_blocker_initialize_domain_resolver() -> nsresult {
    let result = super::content_classifier_initialize_domain_resolver();
    if result.failed() {
        return result;
    }
    let resolver = Box::new(SchemelessSiteResolver {});
    let _ = adblock::url_parser::set_domain_resolver(resolver);
    return NS_OK;
}

#[no_mangle]
pub unsafe extern "C" fn midori_blocker_engine_from_rules(
    rules: &ThinVec<nsCString>,
    out_engine: *mut *mut MidoriBlockerFFIEngine,
) -> nsresult {
    if out_engine.is_null() {
        return NS_ERROR_INVALID_ARG;
    }

    let capacity = rules.iter().map(|list| list.len() + 1).sum();
    let mut list_text = String::with_capacity(capacity);
    for list in rules {
        list_text.push_str(&String::from_utf8_lossy(list.as_ref()));
        list_text.push('\n');
    }
    let mut filter_set = FilterSet::new(false);
    filter_set.add_filter_list(list_text, adblock::lists::ParseOptions::default());
    let engine = Engine::new_with_filter_set(filter_set);

    let boxed_engine = Box::new(MidoriBlockerFFIEngine { engine });
    *out_engine = Box::into_raw(boxed_engine);
    NS_OK
}

#[no_mangle]
pub unsafe extern "C" fn midori_blocker_engine_destroy(engine: *mut MidoriBlockerFFIEngine) {
    if !engine.is_null() {
        drop(Box::from_raw(engine));
    }
}

#[no_mangle]
pub unsafe extern "C" fn midori_blocker_engine_check_network_request_preparsed(
    engine: *const MidoriBlockerFFIEngine,
    url: &nsACString,
    schemeless_site: &nsACString,
    source_schemeless_site: &nsACString,
    request_type: &nsACString,
    request_method: &nsACString,
    third_party: bool,
    previously_matched_rule: bool,
    out_matched: *mut bool,
    out_important: *mut bool,
    out_exception: *mut nsCString,
) -> nsresult {
    if engine.is_null() || out_matched.is_null() || out_important.is_null() {
        return NS_ERROR_INVALID_ARG;
    }

    let engine = &(*engine).engine;

    let url_str = String::from_utf8_lossy(url.as_ref()).to_string();
    let schemeless_site_str = String::from_utf8_lossy(schemeless_site.as_ref()).to_string();
    let source_schemeless_site_str =
        String::from_utf8_lossy(source_schemeless_site.as_ref()).to_string();
    let request_type_str = String::from_utf8_lossy(request_type.as_ref()).to_string();
    let request_method_str = String::from_utf8_lossy(request_method.as_ref()).to_string();

    let request = adblock::request::Request::preparsed(
        &url_str,
        &schemeless_site_str,
        &source_schemeless_site_str,
        &request_type_str,
        third_party,
        &request_method_str,
    );

    let result = engine.check_network_request_subset(&request, previously_matched_rule, false);

    *out_matched = result.should_block();
    *out_important = result.important;

    if !out_exception.is_null() {
        if let Some(exception) = result.exception {
            (*out_exception).assign(&exception.to_string());
        } else {
            (*out_exception).truncate();
        }
    }

    NS_OK
}

/// Request check for the Midori blocker that also reports redirect and
/// rewrite directives. Kept separate from the function above so upstream can
/// reshape its own check without touching the blocker path.
#[no_mangle]
pub unsafe extern "C" fn midori_blocker_engine_check_network_request_preparsed_detailed(
    engine: *const MidoriBlockerFFIEngine,
    url: &nsACString,
    hostname: &nsACString,
    source_hostname: &nsACString,
    request_type: &nsACString,
    request_method: &nsACString,
    third_party: bool,
    out_matched: *mut bool,
    out_important: *mut bool,
    out_redirect: *mut nsCString,
    out_rewritten_url: *mut nsCString,
    out_exception: *mut nsCString,
) -> nsresult {
    if engine.is_null() || out_matched.is_null() || out_important.is_null() {
        return NS_ERROR_INVALID_ARG;
    }

    let engine = &(*engine).engine;

    let url_str = String::from_utf8_lossy(url.as_ref()).to_string();
    let hostname_str = String::from_utf8_lossy(hostname.as_ref()).to_string();
    let source_hostname_str = String::from_utf8_lossy(source_hostname.as_ref()).to_string();
    let request_type_str = String::from_utf8_lossy(request_type.as_ref()).to_string();
    let request_method_str = String::from_utf8_lossy(request_method.as_ref()).to_string();

    let request = adblock::request::Request::preparsed(
        &url_str,
        &hostname_str,
        &source_hostname_str,
        &request_type_str,
        third_party,
        &request_method_str,
    );

    // Exceptions land in separate lists from the rules they relax, so force
    // exception checks the same way the function above does.
    let result = engine.check_network_request_subset(&request, false, true);

    *out_matched = result.should_block();
    *out_important = result.important;

    if !out_redirect.is_null() {
        if let Some(redirect) = result.redirect.as_deref() {
            (*out_redirect).assign(redirect);
        } else {
            (*out_redirect).truncate();
        }
    }

    if !out_rewritten_url.is_null() {
        if let Some(rewritten_url) = result.rewritten_url.as_deref() {
            (*out_rewritten_url).assign(rewritten_url);
        } else {
            (*out_rewritten_url).truncate();
        }
    }

    if !out_exception.is_null() {
        if let Some(exception) = result.exception {
            (*out_exception).assign(&exception.to_string());
        } else {
            (*out_exception).truncate();
        }
    }

    NS_OK
}

#[no_mangle]
pub unsafe extern "C" fn midori_blocker_engine_get_csp_directives_preparsed(
    engine: *const MidoriBlockerFFIEngine,
    url: &nsACString,
    hostname: &nsACString,
    source_hostname: &nsACString,
    request_type: &nsACString,
    request_method: &nsACString,
    third_party: bool,
    out_directives: *mut nsCString,
) -> nsresult {
    if engine.is_null() || out_directives.is_null() {
        return NS_ERROR_INVALID_ARG;
    }

    let engine = &(*engine).engine;

    let url_str = String::from_utf8_lossy(url.as_ref()).to_string();
    let hostname_str = String::from_utf8_lossy(hostname.as_ref()).to_string();
    let source_hostname_str = String::from_utf8_lossy(source_hostname.as_ref()).to_string();
    let request_type_str = String::from_utf8_lossy(request_type.as_ref()).to_string();
    let request_method_str = String::from_utf8_lossy(request_method.as_ref()).to_string();

    let request = adblock::request::Request::preparsed(
        &url_str,
        &hostname_str,
        &source_hostname_str,
        &request_type_str,
        third_party,
        &request_method_str,
    );

    if let Some(directives) = engine.get_csp_directives(&request) {
        (*out_directives).assign(&directives);
    } else {
        (*out_directives).truncate();
    }

    NS_OK
}

#[no_mangle]
pub unsafe extern "C" fn midori_blocker_engine_get_replace_directives_preparsed(
    engine: *const MidoriBlockerFFIEngine,
    url: &nsACString,
    hostname: &nsACString,
    source_hostname: &nsACString,
    request_type: &nsACString,
    request_method: &nsACString,
    third_party: bool,
    out_directives_json: *mut nsCString,
) -> nsresult {
    if engine.is_null() || out_directives_json.is_null() {
        return NS_ERROR_INVALID_ARG;
    }

    let url_str = String::from_utf8_lossy(url.as_ref()).to_string();
    let hostname_str = String::from_utf8_lossy(hostname.as_ref()).to_string();
    let source_hostname_str = String::from_utf8_lossy(source_hostname.as_ref()).to_string();
    let request_type_str = String::from_utf8_lossy(request_type.as_ref()).to_string();
    let request_method_str = String::from_utf8_lossy(request_method.as_ref()).to_string();

    let request = adblock::request::Request::preparsed(
        &url_str,
        &hostname_str,
        &source_hostname_str,
        &request_type_str,
        third_party,
        &request_method_str,
    );
    let directives = (*engine).engine.get_replace_directives(&request);

    match serde_json::to_string(&directives) {
        Ok(json) => {
            (*out_directives_json).assign(&json);
            NS_OK
        }
        Err(_) => NS_ERROR_FAILURE,
    }
}

#[no_mangle]
pub unsafe extern "C" fn midori_blocker_engine_serialize(
    engine: *const MidoriBlockerFFIEngine,
    out_data: &mut ThinVec<u8>,
) -> nsresult {
    if engine.is_null() {
        return NS_ERROR_INVALID_ARG;
    }

    let serialized = (*engine).engine.serialize();
    *out_data = serialized.into();
    NS_OK
}

#[no_mangle]
pub unsafe extern "C" fn midori_blocker_engine_deserialize(
    out_engine: *mut *mut MidoriBlockerFFIEngine,
    data: &ThinVec<u8>,
) -> nsresult {
    if out_engine.is_null() {
        return NS_ERROR_INVALID_ARG;
    }

    let mut engine = Engine::default();
    if engine.deserialize(data.as_slice()).is_err() {
        return NS_ERROR_FAILURE;
    }

    let boxed_engine = Box::new(MidoriBlockerFFIEngine { engine });
    *out_engine = Box::into_raw(boxed_engine);
    NS_OK
}

#[no_mangle]
pub unsafe extern "C" fn midori_blocker_engine_url_cosmetic_resources(
    engine: *const MidoriBlockerFFIEngine,
    url: &nsACString,
    out_json: &mut nsCString,
) -> nsresult {
    if engine.is_null() {
        return NS_ERROR_INVALID_ARG;
    }

    let url_str = String::from_utf8_lossy(url.as_ref()).to_string();
    let resources = (*engine).engine.url_cosmetic_resources(&url_str);

    match serde_json::to_string(&resources) {
        Ok(json) => {
            out_json.assign(&json);
            NS_OK
        }
        Err(_) => NS_ERROR_FAILURE,
    }
}

#[no_mangle]
pub unsafe extern "C" fn midori_blocker_engine_hidden_class_id_selectors(
    engine: *const MidoriBlockerFFIEngine,
    classes_json: &nsACString,
    ids_json: &nsACString,
    exceptions_json: &nsACString,
    out_json: &mut nsCString,
) -> nsresult {
    if engine.is_null() {
        return NS_ERROR_INVALID_ARG;
    }

    let classes: Vec<String> = match serde_json::from_slice(classes_json.as_ref()) {
        Ok(v) => v,
        Err(_) => return NS_ERROR_INVALID_ARG,
    };
    let ids: Vec<String> = match serde_json::from_slice(ids_json.as_ref()) {
        Ok(v) => v,
        Err(_) => return NS_ERROR_INVALID_ARG,
    };
    let exceptions: std::collections::HashSet<String> =
        match serde_json::from_slice(exceptions_json.as_ref()) {
            Ok(v) => v,
            Err(_) => return NS_ERROR_INVALID_ARG,
        };

    let selectors = (*engine)
        .engine
        .hidden_class_id_selectors(&classes, &ids, &exceptions);

    match serde_json::to_string(&selectors) {
        Ok(json) => {
            out_json.assign(&json);
            NS_OK
        }
        Err(_) => NS_ERROR_FAILURE,
    }
}

#[no_mangle]
pub unsafe extern "C" fn midori_blocker_engine_use_resources(
    engine: *mut MidoriBlockerFFIEngine,
    resources_json: &nsACString,
) -> nsresult {
    if engine.is_null() {
        return NS_ERROR_INVALID_ARG;
    }

    let resources: Vec<Resource> = match serde_json::from_slice(resources_json.as_ref()) {
        Ok(v) => v,
        Err(_) => return NS_ERROR_INVALID_ARG,
    };

    (*engine).engine.use_resources(resources);
    NS_OK
}

struct SchemelessSiteResolver {}

impl adblock::url_parser::ResolvesDomain for SchemelessSiteResolver {
    fn get_host_domain(&self, host: &str) -> (usize, usize) {
        etp_engine::url_parser::ResolvesDomain::get_host_domain(
            &super::SchemelessSiteResolver {},
            host,
        )
    }
}
