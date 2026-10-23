/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

import test from "node:test";
import assert from "node:assert/strict";
import * as schema from "../src/browser/components/workspace/MidoriWorkspaceCatalog.sys.mjs";
import { MidoriSyncWorkspaces } from "../src/browser/components/sync/MidoriSyncWorkspaces.sys.mjs";
import { syncConflictSummary } from "../src/browser/components/sync/MidoriSyncConflictSummary.sys.mjs";

const id = "w1:11111111-1111-4111-8111-111111111111";
const value = (name = "Research", icon = "research") => ({ version: 1, name, icon });
const record = data => ({ id, deleted: data === null, value: data });

function fixture() {
  const store = { windows: {} };
  const catalog = new schema.WorkspaceCatalog(store, () => "22222222-2222-4222-8222-222222222222");
  const observers = new Set();
  const port = {
    async readSyncCatalog() { return structuredClone(store.sync); },
    async syncWorkspaceUsage() { return catalog.usage(id); },
    async checkSyncWorkspace(key, data, force) { return catalog.check(key, data, force); },
    async applySyncWorkspace(key, data, options) {
      if (JSON.stringify(catalog.read(key)) !== JSON.stringify(options.current) &&
          JSON.stringify(catalog.read(key)) !== JSON.stringify(data)) {
        return { status: "conflict", reason: "workspace_changed" };
      }
      return catalog.apply(key, data, options);
    },
  };
  const adapter = new MidoriSyncWorkspaces({ workspaces: port, schema,
    observers: { addObserver: observer => observers.add(observer), removeObserver: observer => observers.delete(observer) } });
  return { store, catalog, port, adapter, observers };
}

test("workspace adapter applies and replays portable metadata through its native port", async () => {
  const { adapter } = fixture();
  assert.deepEqual(await adapter.listIds(), []);
  assert.deepEqual(await adapter.apply(record(value())), { status: "applied" });
  assert.deepEqual(await adapter.read(id), value());
  assert.deepEqual(await adapter.listIds(), [id]);
  assert.deepEqual(await adapter.apply(record(value())), { status: "applied" });
  assert.equal(await adapter.canDelete(id), false);
});

test("concurrent workspace fields merge while competing names remain visible conflicts", async () => {
  const { adapter, catalog } = fixture();
  catalog.apply(id, value("Local name"));
  const remote = record(value("Research", "work"));
  const base = record(value());
  assert.deepEqual((await adapter.plan(remote, base)).decision,
    { status: "apply", value: value("Local name", "work") });
  assert.deepEqual(await adapter.apply(remote, base), { status: "applied" });
  assert.deepEqual(await adapter.read(id), value("Local name", "work"));
  assert.deepEqual(await adapter.apply(record(value("Remote name", "work")), base),
    { status: "conflict", reason: "workspace_field_conflict" });
  assert.deepEqual(await adapter.read(id), value("Local name", "work"));
});

test("missing native records cannot become deletions without an explicit durable marker", async () => {
  const { adapter, catalog } = fixture();
  assert.equal(await adapter.read(id), null);
  assert.equal(await adapter.canDelete(id), false);
  catalog.apply(id, value());
  catalog.apply(id, null);
  assert.equal(await adapter.canDelete(id), true);
  catalog.apply(id, value());
  assert.equal(await adapter.canDelete(id), false);
});

test("a first remote snapshot cannot resurrect a deliberate deletion without an authenticated base", async () => {
  const { adapter, catalog } = fixture();
  catalog.apply(id, value());
  catalog.apply(id, null);
  assert.deepEqual(await adapter.apply(record(value())), { status: "conflict", reason: "deletion_edit" });
  assert.equal(await adapter.read(id), null);
  assert.equal(await adapter.canDelete(id), true);
  assert.deepEqual(await adapter.apply(record(value()), record(null)), { status: "applied" },
    "A known authenticated deleted base allows a later explicit restoration");
  assert.deepEqual(await adapter.read(id), value());
  assert.equal(await adapter.canDelete(id), false);
});

test("an incoming deletion retains local edits and an unknown-base identity collision", async () => {
  const { adapter, catalog } = fixture();
  catalog.apply(id, value("Edited"));
  assert.equal((await adapter.apply(record(null), record(value()))).reason, "deletion_edit");
  assert.equal((await adapter.apply(record(value()))).reason, "workspace_identity_conflict");
  assert.equal((await adapter.apply(record(null))).reason, "workspace_identity_conflict");
  assert.deepEqual(await adapter.read(id), value("Edited"));
});

test("explicit remote decisions record authority to remove an in-use workspace in the durable plan", async () => {
  const { adapter, catalog, port } = fixture();
  catalog.apply(id, value());
  port.checkSyncWorkspace = async (_id, _data, force) => force ? null : "workspace_in_use";
  const incoming = record(null);
  const base = record(value());
  assert.equal((await adapter.prepare(incoming, base)).decision.reason, "workspace_in_use");
  const plan = await adapter.prepare(incoming, base, { resolution: { choice: "remote" } });
  assert.equal(plan.force, true);
  assert.deepEqual(await adapter.applyPrepared(JSON.parse(JSON.stringify(plan))), { status: "applied" });
  assert.deepEqual(await adapter.applyPrepared(plan), { status: "applied" });
  assert.equal(await adapter.read(id), null);
});

test("a local edit after preparing an application cannot be overwritten", async () => {
  const { adapter, catalog } = fixture();
  catalog.apply(id, value());
  const plan = await adapter.prepare(record(value("Remote")), record(value()));
  catalog.apply(id, value("New local edit"));
  assert.deepEqual(await adapter.applyPrepared(plan), { status: "conflict", reason: "workspace_changed" });
  assert.deepEqual(await adapter.read(id), value("New local edit"));
});

test("only metadata changes request inventories, and closing removes native observers", async () => {
  const { adapter, observers } = fixture();
  const events = [];
  adapter.observe(event => events.push(event));
  const notify = reason => { for (const observer of observers) observer(null, "midori-workspace-catalog-changed", reason); };
  for (const action of ["switch", "move-tabs", "default", "reorder", "sync"]) notify(action);
  assert.equal(events.length, 0);
  for (const action of ["publish", "delete"]) notify(action);
  assert.equal(events.length, 2);
  adapter.close();
  assert.equal(observers.size, 0);
  await assert.rejects(adapter.read(id), /cancelled/);
});

test("workspace validation and previews expose only the portable contract", () => {
  const { adapter } = fixture();
  assert.throws(() => adapter.validate(id, { ...value(), tabs: ["secret"] }), /invalid_record/);
  assert.throws(() => adapter.validate(id.slice(3), value()), /invalid_record/);
  assert.deepEqual(syncConflictSummary("workspaces", id, { ...value(), tabs: ["secret"] }),
    { deleted: false, fields: [{ name: "name", value: "Research" }, { name: "icon", value: "research" }] });
});
