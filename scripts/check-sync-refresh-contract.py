import argparse
import copy
import json
from pathlib import Path

from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012


parser = argparse.ArgumentParser()
parser.add_argument("--routes", type=Path)
parser.add_argument("--capabilities", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
spec = json.loads((root / "midori-sync/docs/native-sync.openapi.json").read_text())
validate(spec)
uri = "urn:midori:sync-contract"
registry = Registry().with_resource(
    uri, Resource.from_contents(spec, default_specification=DRAFT202012)
)
checks = 0


def check(name, value, valid=True):
    global checks
    validator = Draft202012Validator(
        {"$ref": f"{uri}#/components/schemas/{name}"},
        registry=registry,
        format_checker=FormatChecker(),
    )
    assert validator.is_valid(value) == valid, f"Unexpected validation: {name}"
    checks += 1


token = "mrf_" + "a" * 64
operation = "12345678-1234-4123-8123-123456789abc"
request = {"refresh_token": token, "operation_id": operation}
check("RefreshRequest", request)
check("RefreshRequest", {**request, "operation_id": operation.upper()})
for override in (
    {"refresh_token": " " + token},
    {"refresh_token": token.upper()},
    {"refresh_token": [token]},
    {"operation_id": operation.replace("-4123-", "-7123-")},
    {"operation_id": operation.replace("-8123-", "-0123-")},
    {"operation_id": "invalid"},
    {"extra": "unexpected"},
):
    check("RefreshRequest", {**request, **override}, False)
for value in ([], {}, None, {"refresh_token": token}, {"operation_id": operation}):
    check("RefreshRequest", value, False)
check("RefreshRevokeRequest", {"refresh_token": token})
check("RefreshRevokeRequest", request, False)

response = {
    "refresh_version": 1,
    "operation_id": operation,
    "account_version": 1,
    "token": "b" * 64,
    "refresh_token": token,
    "expires_at": "2026-09-30T12:00:00+00:00",
    "expires_in": 3600,
    "refresh_expires_at": "2026-10-30T11:00:00+00:00",
    "identity": {"issuer": "urn:midori:sync:local", "subject": "fixture", "kind": "development"},
    "user": {"id": "1", "name": "Fixture", "email": "fixture@local.invalid"},
    "device": {"id": operation, "name": "Desktop", "type": "desktop"},
}
check("RefreshResponse", response)
for field in response:
    incomplete = copy.deepcopy(response)
    del incomplete[field]
    check("RefreshResponse", incomplete, False)
for override in ({"refresh_version": 2}, {"expires_in": 3601}, {"token": "short"}, {"extra": True}):
    check("RefreshResponse", {**response, **override}, False)

pair = {"pairing_token": "A" * 16, "device_name": "Desktop"}
check("NativePairRequest", pair)
check("NativePairRequest", {**pair, "native_refresh": True})
paired = {k: v for k, v in response.items() if k not in ("operation_id", "account_version")}
paired["user"] = {**paired["user"], "avatar_url": None}
check("NativePairResponse", paired)
for field in ("refresh_version", "refresh_token", "refresh_expires_at"):
    incomplete = copy.deepcopy(paired)
    del incomplete[field]
    check("NativePairResponse", incomplete, False)
check("NativePairResponse", {k: v for k, v in paired.items() if not k.startswith("refresh_")})

if args.capabilities:
    capabilities = json.loads(args.capabilities.read_text())
    check("Capabilities", capabilities)
    schemas = {
        "bookmarks": 2, "history": 2, "tabs": 2, "browser-settings": 1,
        "passwords": 1, "credit-cards": 1, "form-history": 1,
        "addresses": 1, "workspaces": 1, "midori-privacy": 1, "site-permissions": 1, "extensions": 1, "extension-settings": 1,
    }
    assert capabilities["data_schemas"] == schemas, "Published data schemas differ from the shared contract"
    assert set(schemas).issubset(capabilities["collections"])
    assert capabilities["crypto_custody_version"] == 1
    assert capabilities["crypto"]["password_unlock_version"] == 1
    assert capabilities["crypto"]["reset"] is True
    assert capabilities["client_recovery"]["registry_auth_version"] == 2
    assert 2 in capabilities["record_schema_versions"]
    assert capabilities["crypto_versions"] == [2]
    assert {
        "credit_cards", "form_history", "addresses", "authenticated_controls",
        "bookmark_labels", "history_parts", "history_visit_removals",
        "tab_fragments", "workspace_metadata", "custom_filters", "site_permissions", "extension_catalog", "extension_settings",
    }.issubset(capabilities["features"])
    for field, value in (
        ("protocol", "other"), ("native_ready", "false"),
        ("account_version", 2), ("changes_version", 2),
        ("operations_version", 2), ("crypto_versions", [1]),
    ):
        check("Capabilities", {**capabilities, field: value}, False)
    for collection in schemas:
        invalid = copy.deepcopy(capabilities)
        invalid["data_schemas"][collection] = str(schemas[collection])
        check("Capabilities", invalid, False)
    invalid = copy.deepcopy(capabilities)
    invalid["crypto"]["reset"] = "true"
    check("Capabilities", invalid, False)
    print(f"Current public capabilities match all {len(schemas)} shared collection schemas.")

if args.routes:
    routes = json.loads(args.routes.read_text())
    actual = {(method.lower(), "/" + route["uri"]) for route in routes for method in route["method"].split("|")}
    operations = 0
    notifications = 0
    for path, item in spec["paths"].items():
        for method in ("get", "post", "put", "patch", "delete"):
            if method in item:
                runtime = item[method].get("x-midori-runtime", "laravel")
                if runtime == "notification-daemon":
                    assert (method, path) == ("get", "/sync/notifications/stream")
                    full_path = "/api/v1" + path
                    daemon = root / "midori-sync/app/Services/SyncNotificationStream.php"
                    assert f"^GET {full_path} HTTP/1" in daemon.read_text()
                    for filename in ("nginx.conf", "nginx.dev.conf", "nginx.prod.conf"):
                        proxy = (root / "midori-sync/docker" / filename).read_text()
                        assert f"location = {full_path} {{" in proxy, f"Missing notification proxy: {filename}"
                        assert "proxy_pass http://127.0.0.1:8765;" in proxy
                    notifications += 1
                else:
                    assert runtime == "laravel", f"Unknown API runtime: {runtime}"
                    assert (method, "/api/v1" + path) in actual, f"Missing route: {method} {path}"
                operations += 1
    print(f"{operations - notifications} documented operations match Artisan routes; "
          f"{notifications} match the notification daemon and all three proxy templates.")

print(f"OpenAPI valid; {checks} schema checks passed.")
