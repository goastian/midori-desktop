import { createHash, createHmac } from "node:crypto";
import { MidoriSyncExtensionSettings } from "../src/browser/components/sync/MidoriSyncExtensionSettings.sys.mjs";
import { createSyncExtensionSettingsBundle, serializeSyncExtensionSettings } from "../src/browser/components/sync/MidoriSyncExtensionSettingsModel.sys.mjs";

export const addonId = "@settings-extension";
export const digest = async text => createHash("sha256").update(text).digest("hex");
const derive = (key = "public settings identity fixture") => async (collection, bytes) =>
  createHmac("sha256", key).update(collection).update(bytes).digest("hex");
export const bundle = (data, id = addonId, key) => createSyncExtensionSettingsBundle("amo", id, data, { deriveRecordId: derive(key), digest });
export const incoming = record => ({ ...record, deleted: false, authenticatedSchema: 2 });
export const deleted = id => ({ id, deleted: true, value: null, authenticatedSchema: 2 });

export function fixture(data = {}, key) {
  const f = { states: new Map(), records: new Map(), listeners: new Set(), writes: 0, barriers: 0, hints: 0 };
  f.set = (data, id = addonId, fields = {}) => f.states.set(id, {
    catalog: "amo", addonId: id, native: { catalog: "amo", addonId: id, scope: "user", instance: "original", version: "1" },
    source: null, status: "portable", reason: null, raw: data === null ? "{}" : serializeSyncExtensionSettings(data),
    data: structuredClone(data), ...fields,
  });
  f.set(data);
  f.store = {
    async read(_catalog, id) {
      if (f.readError) { throw Object.assign(new Error("native_read_failed"), { code: "native_read_failed" }); }
      return structuredClone(f.states.get(id));
    },
    async list() { return f.inventory ?? structuredClone([...f.states.values()]); },
    async persist(_catalog, id, expected) {
      f.barriers++;
      await f.beforePersist?.();
      if (f.persistError) { throw Object.assign(new Error("native_write_failed"), { code: "native_write_failed" }); }
      return !f.persistStale && JSON.stringify(f.states.get(id)) === JSON.stringify(expected);
    },
    async write({ addonId: id, desired, expected }) {
      await f.beforeWrite?.();
      if (f.quota) { return { status: "deferred", reason: "extension_settings_quota" }; }
      if (JSON.stringify(expected) !== JSON.stringify(f.states.get(id))) {
        return { status: "deferred", reason: "extension_settings_local_changed" };
      }
      f.writes++;
      f.set(desired ?? {}, id, { native: expected.native, status: expected.status, source: expected.source });
      if (f.afterCommitError) { throw Object.assign(new Error("native_write_failed"), { code: "native_write_failed" }); }
      return { status: "applied" };
    },
    observe(listener) { f.listeners.add(listener); return () => f.listeners.delete(listener); },
  };
  f.options = { store: f.store, record: async id => structuredClone(f.records.get(id) ?? null), deriveRecordId: derive(key), digest };
  f.adapter = new MidoriSyncExtensionSettings(f.options);
  f.adapter.observe(() => f.hints++);
  f.stage = (value, manifest = false) => {
    for (const record of [...value.parts, ...(manifest ? [value.manifest] : [])]) {
      f.records.set(record.id, { remote: incoming(record) });
    }
  };
  f.data = (id = addonId) => f.states.get(id).data;
  return f;
}

