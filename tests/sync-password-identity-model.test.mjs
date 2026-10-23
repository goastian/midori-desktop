import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import {
  deriveSyncPasswordMigrationId, isSyncPasswordIdentityAlias, syncPasswordValueDigest,
  validSyncPasswordReplacement, validateSyncPasswordIdentityAlias,
} from "../src/browser/components/sync/MidoriSyncPasswordIdentity.sys.mjs";

const value = { version: 1, origin: "https://identity.example.invalid", formActionOrigin: "", httpRealm: null,
  username: "mañana😀", password: "public synthetic\npassword", usernameField: "user", passwordField: "password",
  timeCreated: 0, timePasswordChanged: 253402300799999 };
const target = "1".repeat(64);
const alias = { version: 2, kind: "identity-alias", targetId: target, sourceRevision: "7", targetRevision: "3",
  sourceDigest: "a".repeat(64), targetDeleted: false, targetDigest: "b".repeat(64) };
const derivation = secret => async (collection, bytes) => {
  assert.equal(collection, "passwords");
  return createHmac("sha256", secret).update(bytes).digest("hex");
};

test("password replacement directions are acyclic across legacy and native identities", () => {
  for (const source of ["0,legacy", "é", "x".repeat(65)]) {
    assert.ok(validSyncPasswordReplacement(source, target));
    assert.ok(!validSyncPasswordReplacement(target, source));
  }
  assert.ok(validSyncPasswordReplacement("2".repeat(64), target));
  assert.ok(!validSyncPasswordReplacement(target, "2".repeat(64)));
  for (const [source, destination] of [[target, target], [null, target], ["", target], ["a\n", target], [target, "bad,id"]]) {
    assert.ok(!validSyncPasswordReplacement(source, destination));
  }
});

test("identity aliases bind both revisions and value digests without including credentials", () => {
  const accepted = validateSyncPasswordIdentityAlias("0,legacy", alias, "8");
  assert.deepEqual(accepted, alias);
  assert.notEqual(accepted, alias);
  assert.ok(isSyncPasswordIdentityAlias(accepted));
  assert.ok(!isSyncPasswordIdentityAlias(value));
  assert.ok(!isSyncPasswordIdentityAlias(null));
  assert.doesNotThrow(() => validateSyncPasswordIdentityAlias("0,legacy", alias, "9"), "A re-encryption can advance the alias revision");
  assert.doesNotThrow(() => validateSyncPasswordIdentityAlias("0,legacy", { ...alias, targetDeleted: true, targetDigest: null }, "8"));
});

test("malformed alias references cannot become a native deletion instruction", () => {
  for (const invalid of [null, [], {}, { ...alias, version: 1 }, { ...alias, kind: "login" },
    { ...alias, targetId: "bad,id" }, { ...alias, targetId: "0,legacy" }, { ...alias, sourceRevision: "0" },
    { ...alias, targetRevision: "0" }, { ...alias, sourceRevision: "2147483648" },
    { ...alias, targetRevision: "01" }, { ...alias, sourceDigest: "A".repeat(64) },
    { ...alias, sourceDigest: ["a".repeat(64)] }, { ...alias, targetDigest: ["b".repeat(64)] },
    { ...alias, targetDigest: "b".repeat(63) }, { ...alias, targetDeleted: true },
    { ...alias, targetDeleted: false, targetDigest: null }, { ...alias, password: "unexpected" }]) {
    assert.throws(() => validateSyncPasswordIdentityAlias("0,legacy", invalid), { code: "invalid_record" });
  }
  for (const revision of ["7", "6", "0", "01"]) {
    assert.throws(() => validateSyncPasswordIdentityAlias("0,legacy", alias, revision), { code: "invalid_record" });
  }
});

test("password digests are independent of object insertion order and preserve Unicode and zero dates", async () => {
  const expected = await syncPasswordValueDigest(value);
  assert.equal(expected, "f1382d54182a2b0c21af93b1f13810a2c51065c8850a5b8708cb576fa8319236", "Independent Python UTF-8 JSON vector");
  assert.equal(await syncPasswordValueDigest(Object.fromEntries(Object.entries(value).reverse())), expected);
  for (const patch of [{ password: "public other password" }, { usernameField: "other" }, { timeCreated: 1 },
    { formActionOrigin: null, httpRealm: "" }, { username: "manana😀" }]) {
    assert.notEqual(await syncPasswordValueDigest({ ...value, ...patch }), expected);
  }
});

test("digest input cannot hide undefined fields, extra properties or invalid native values", async () => {
  for (const invalid of [null, {}, { ...value, password: undefined }, { ...value, extra: true },
    { ...value, username: "\ud800" }, { ...value, timeCreated: -1 }, { ...value, timePasswordChanged: Infinity },
    { ...value, timeCreated: 0.5 }, { ...value, timeCreated: 253402300800000 }]) {
    await assert.rejects(syncPasswordValueDigest(invalid), { code: "invalid_record" });
  }
});

test("migration identities are account-bound and deterministic for every legacy native identifier", async () => {
  for (const source of ["comma,guid", "é", "x".repeat(255), "x".repeat(4096), "\ud800", "\ud801"]) {
    const id = await deriveSyncPasswordMigrationId(derivation("account-a"), source);
    assert.match(id, /^[0-9a-f]{64}$/);
    assert.equal(await deriveSyncPasswordMigrationId(derivation("account-a"), source), id);
    assert.notEqual(await deriveSyncPasswordMigrationId(derivation("account-b"), source), id);
  }
  assert.notEqual(await deriveSyncPasswordMigrationId(derivation("a"), "\ud800"),
    await deriveSyncPasswordMigrationId(derivation("a"), "\ud801"), "Escaping preserves distinct malformed UTF-16 native GUIDs");
});

test("migration derivation clears its bounded preimage and rejects invalid identity providers", async () => {
  let passed;
  await deriveSyncPasswordMigrationId(async (_collection, input) => { passed = input; return target; }, "x".repeat(65536));
  assert.ok(passed.length < 256);
  assert.ok(passed.every(byte => byte === 0));
  for (const source of [null, "", 1, "x".repeat(65537)]) {
    await assert.rejects(deriveSyncPasswordMigrationId(derivation("a"), source), { code: "invalid_record" });
  }
  for (const id of ["bad,id", "a".repeat(63), null]) {
    await assert.rejects(deriveSyncPasswordMigrationId(async () => id, "legacy,id"), { code: "invalid_record" });
  }
});
