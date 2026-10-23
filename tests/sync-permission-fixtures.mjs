import { createSyncPermissionStore } from "../src/browser/components/sync/MidoriSyncPermissionStore.sys.mjs";
import assert from "node:assert/strict";

export const origin = "https://permissions.example.invalid";
export const now = 1792544000000;

export function fixture() {
  const rows = new Map();
  const disk = new Map();
  const listeners = new Set();
  const principal = origin => ({ origin, originAttributes: { privateBrowsingId: 0 } });
  const key = (owner, type) => JSON.stringify([owner.origin, type]);
  let clock = now;
  const permissions = {
    EXPIRE_NEVER: 0, EXPIRE_SESSION: 1, EXPIRE_TIME: 2, EXPIRE_POLICY: 3, EXPIRE_SESSION_TAB: 4,
    additions: 0, persistence: 0, beforePersist: null, afterAdd: null,
    get all() { return structuredClone([...rows.values()]); },
    getAllForPrincipal(owner) { return this.all.filter(row => row.principal.origin === owner.origin); },
    getPermissionSourceFromPrincipal(owner, type) {
      const row = rows.get(key(owner, type));
      return !row ? "absent" : owner.originAttributes.privateBrowsingId ? "private" :
        row.expireType === 3 ? "policy" : [1, 4].includes(row.expireType) ? "session" :
        row.expireType === 2 && row.expireTime <= now ? "expired" :
        row.default ? "default" : "user";
    },
    getPermissionObject(owner, type, exact) {
      assert.equal(exact, true);
      return structuredClone(rows.get(key(owner, type)) ?? null);
    },
    addFromPrincipal(owner, type, capability, expireType = 0, expireTime = 0) {
      this.additions++;
      rows.set(key(owner, type), { principal: structuredClone(owner), type, capability, expireType, expireTime, modificationTime: ++clock });
      this.afterAdd?.();
    },
    removeFromPrincipal(owner, type) { rows.delete(key(owner, type)); },
    async persistPermissionFromPrincipal(owner, type) {
      this.persistence++;
      const saved = structuredClone(rows.get(key(owner, type)) ?? null);
      await this.beforePersist?.();
      disk.set(key(owner, type), saved?.default ? null : saved);
      return true;
    },
  };
  const store = createSyncPermissionStore({ permissions, observers: {
    addObserver(listener, topic) { assert.equal(topic, "perm-changed"); listeners.add(listener); },
    removeObserver(listener, topic) { assert.equal(topic, "perm-changed"); assert.ok(listeners.delete(listener)); },
  }, principalForOrigin: principal, asPermission: object => object, now: () => now });
  const edit = (action, type = "popup", expireType = 0) => permissions.addFromPrincipal(principal(origin), type, action, expireType);
  const write = (desired, expected = null) => store.write({ origin, permission: desired?.permission ?? "popup", desired, expected });
  return { rows, disk, listeners, permissions, store, edit, write, principal, key };
}
