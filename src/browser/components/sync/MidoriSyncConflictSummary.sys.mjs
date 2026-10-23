/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export function syncConflictSummary(collection, id, value) {
  if (value === null) {
    return { deleted: true, fields: [] };
  }
  const fields = [];
  const add = (name, text) => {
    if (typeof text === "string" && text) {
      fields.push({ name, value: text.replace(/[\p{Cc}\p{Cs}]/gu, "").slice(0, 300) });
    }
  };
  const origin = text => {
    try {
      const url = new URL(text);
      return ["https:", "http:"].includes(url.protocol) ? url.origin : "";
    } catch {
      return "";
    }
  };
  switch (collection) {
    case "bookmarks":
    case "history":
      add("title", value.title);
      add("website", origin(value.url));
      break;
    case "passwords":
      add("website", origin(value.origin));
      add("username", value.username);
      break;
    case "credit-cards":
      add("card-ending", typeof value.number === "string" ? value.number.replace(/\D/g, "").slice(-4) : "");
      break;
    case "addresses":
      add("name", [value.fields?.["given-name"], value.fields?.["family-name"]].filter(part => typeof part === "string").join(" "));
      add("country", value.fields?.country);
      break;
    case "form-history":
      add("field", value.fieldname);
      break;
    case "workspaces":
      add("name", value.name);
      add("icon", value.icon);
      break;
    case "extensions":
      add("extension", value.addonId);
      if (typeof value.enabled === "boolean") {
        fields.push({ name: "extension-state", l10nId: `midori-sync-extension-${value.enabled ? "enabled" : "disabled"}` });
      }
      break;
    case "extension-settings":
      add("extension", value.addonId);
      if (value.bundle?.kind === "text-manifest") {
        add("settings-bytes", String(value.bundle.byte_count));
        add("settings-digest", value.bundle.digest?.slice(0, 16));
      }
      break;
    case "site-permissions": {
      add("website", origin(value.origin));
      const types = { cookie: "cookies", popup: "popups", "midori-blocker": "blocker", camera: "camera",
        microphone: "microphone", geo: "location", "desktop-notification": "notifications" };
      if (Object.hasOwn(types, value.permission)) {
        fields.push({ name: "permission", l10nId: `midori-sync-permission-type-${types[value.permission]}` });
      }
      if (["allow", "deny", "prompt", "session-cookies"].includes(value.action)) {
        fields.push({ name: "permission-action", l10nId: `midori-sync-permission-action-${value.action}` });
      }
      break;
    }
    case "midori-privacy":
      if (value.kind === "text-manifest" && value.type === "custom-filters") {
        add("filter-bytes", String(value.byte_count));
        add("filter-digest", value.digest?.slice(0, 16));
      }
      break;
    case "browser-settings":
      add("setting", id);
      break;
    case "tabs":
      add("device", value.device_name);
      break;
  }
  return { deleted: false, fields };
}
