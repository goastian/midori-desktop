/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { SYNC_STORE_UUID } from "./MidoriSyncLocalCodec.sys.mjs";
import { SyncProtocolError, validSyncCounter } from "./MidoriSyncProtocol.sys.mjs";

const COLLECTIONS = new Set(["bookmarks", "history", "passwords", "credit-cards", "form-history", "addresses", "workspaces", "tabs", "browser-settings", "midori-tab", "midori-privacy", "devices"]);

export function validateSyncControl(control) {
  if (control?.version !== 1 || !SYNC_STORE_UUID.test(control.epoch) ||
      !COLLECTIONS.has(control.collection) || !SYNC_STORE_UUID.test(control.operation_id) ||
      !SYNC_STORE_UUID.test(control.previous_generation) || !SYNC_STORE_UUID.test(control.generation) ||
      control.previous_generation === control.generation || !validSyncCounter(control.control_revision) ||
      control.control_revision === "0" || !["history_clear", "collection_clear"].includes(control.kind) ||
      !Number.isSafeInteger(control.clear_before_ms) || control.clear_before_ms < 0 ||
      control.clear_before_ms > Math.floor(Number.MAX_SAFE_INTEGER / 1000) ||
      (control.kind === "history_clear" ? control.collection !== "history" || control.clear_before_ms === 0 : control.clear_before_ms !== 0) ||
      (control.proof !== undefined && !/^[0-9a-f]{64}$/.test(control.proof))) {
    throw new SyncProtocolError("invalid_sync_control");
  }
  return control;
}

function controlInput(control) {
  return ["MidoriSync/control/v1", control.epoch, control.collection, control.operation_id,
    control.previous_generation, control.generation, control.control_revision, control.kind, control.clear_before_ms];
}

export async function signSyncControl(keys, value) {
  const control = validateSyncControl({ ...value, version: 1, epoch: keys.writeContext.epoch });
  return { ...control, proof: await keys.deriveRecordId("devices", controlInput(control)) };
}

export async function verifySyncControl(keys, control, { collection, generation, minimumRevision = "0" }) {
  validateSyncControl(control);
  if (control.epoch !== keys.writeContext.epoch || control.collection !== collection ||
      control.generation !== generation || !validSyncCounter(minimumRevision) ||
      BigInt(control.control_revision) < BigInt(minimumRevision) ||
      control.proof !== await keys.deriveRecordId("devices", controlInput(control))) {
    throw new SyncProtocolError("control_authentication_failed");
  }
  return control;
}
