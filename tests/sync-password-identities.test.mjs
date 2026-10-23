import assert from "node:assert/strict";
import test from "node:test";
import { validSyncPasswordId, validSyncRecordId } from "../src/browser/components/sync/MidoriSyncProtocol.sys.mjs";

test("password identities fit both native backends without silently rewriting an MSP identity", () => {
  for (const id of ["{12345678-1234-4234-8234-123456789abc}", "x".repeat(64), "guid with space", "~"]) {
    assert.equal(validSyncPasswordId(id), true);
    assert.equal(validSyncRecordId(id), true);
  }
  for (const id of ["x".repeat(65), "x".repeat(255), "unicode-é", "comma,guid"]) {
    assert.equal(validSyncRecordId(id), true, "The generic transport limit is wider than the native password contract");
    assert.equal(validSyncPasswordId(id), false);
  }
  for (const id of [null, undefined, 1, {}, "", "a\n", "a\r", "a\u007f", "a\u0000"]) {
    assert.equal(validSyncPasswordId(id), false);
  }
});
