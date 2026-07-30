/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export const PROFILE_IDENTITY_SCHEMA_VERSION = 1;
export const PROFILE_MIGRATION_JOURNAL_VERSION = 1;

export const SAFE_PROFILE_RESOURCES = Object.freeze({
  credentials: Object.freeze([
    "pkcs11.txt",
    "logins.json",
    "logins-backup.json",
    "cert9.db",
    "key4.db",
    "credentialstate.sqlite",
  ]),
  places: Object.freeze(["places.sqlite", "favicons.sqlite"]),
  preferences: Object.freeze(["containers.json", "xulstore.json"]),
  sessions: Object.freeze([
    "sessionstore.jsonlz4",
    "sessionstore-backups/recovery.jsonlz4",
    "sessionstore-backups/recovery.baklz4",
    "sessionstore-backups/previous.jsonlz4",
    "sessionstore-backups/upgrade.jsonlz4",
  ]),
  workspaces: Object.freeze(["Workspaces/Workspaces.json"]),
});

export const REJECTED_PROFILE_ENTRIES = Object.freeze([
  ".parentlock",
  "addonStartup.json.lz4",
  "cache2",
  "compatibility.ini",
  "extensions.json",
  "lock",
  "minidumps",
  "parent.lock",
  "security_state",
  "startupCache",
  "storage/default",
  "user.js",
]);

const SAFE_PREF_PREFIXES = Object.freeze([
  "floorp.browser.workspaces.",
  "midori.",
]);

const REJECTED_PREF_PREFIXES = Object.freeze([
  "midori.profileIdentity.",
  "midori.profileMigration.",
]);

export function normalizeChannel(channel) {
  const value = String(channel || "release")
    .trim()
    .toLowerCase();
  return /^[a-z0-9._-]+$/.test(value) ? value : "release";
}

export function stableInstallIdentity({
  appId = "midori",
  channel = "release",
} = {}) {
  return `org.astian.${String(appId).toLowerCase()}:${normalizeChannel(
    channel
  )}:profile-v${PROFILE_IDENTITY_SCHEMA_VERSION}`;
}

export function stableInstallIdentityForPackage({ channel } = {}) {
  return stableInstallIdentity({ channel });
}

export function parseProfilesIni(contents) {
  const sections = new Map();
  let current = null;

  for (const rawLine of String(contents || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      current = {};
      sections.set(sectionMatch[1], current);
      continue;
    }

    const separator = line.indexOf("=");
    if (!current || separator <= 0) {
      continue;
    }

    current[line.slice(0, separator).trim()] = line
      .slice(separator + 1)
      .trim();
  }

  return [...sections.entries()]
    .filter(([name, values]) => /^Profile\d+$/.test(name) && values.Path)
    .map(([section, values]) => ({
      section,
      name: values.Name || section,
      path: values.Path,
      isRelative: values.IsRelative !== "0",
      isDefault: values.Default === "1",
    }));
}

export function candidateId(sourceId, profilePath) {
  const input = `${sourceId}\0${profilePath}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `midori-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function candidateFingerprint(candidate) {
  return candidateId(
    candidate.sourceId,
    `${candidate.path}\0${candidate.createdAt || 0}\0${
      candidate.engineVersion || ""
    }`
  );
}

export function selectionToken(candidates) {
  return candidateId(
    "selection",
    candidates
      .map(candidate => `${candidate.id}:${candidate.fingerprint}`)
      .sort()
      .join("|")
  );
}

export function getSelectionState(candidates, selectedId = null) {
  const available = candidates.filter(candidate => candidate.valid !== false);
  const token = selectionToken(available);

  if (!available.length) {
    return { status: "none", candidates: [], selectionToken: token };
  }

  if (!selectedId) {
    return {
      status: available.length > 1 ? "needs-selection" : "needs-confirmation",
      candidates: available,
      selectionToken: token,
    };
  }

  const selected = available.find(candidate => candidate.id === selectedId);
  return {
    status: selected ? "selected" : "stale-selection",
    candidates: available,
    selected: selected || null,
    selectionToken: token,
  };
}

export function sanitizeProfilePrefs(contents) {
  const safeLines = [];

  for (const rawLine of String(contents || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^user_pref\("([^"]+)",\s*(.+)\);$/);
    if (!match) {
      continue;
    }

    const pref = match[1];
    const value = match[2].trim();
    const safeValue =
      /^(?:true|false|-?(?:0|[1-9]\d*)(?:\.\d+)?|"(?:[^"\\]|\\.)*")$/.test(
        value
      );
    if (
      safeValue &&
      SAFE_PREF_PREFIXES.some(prefix => pref.startsWith(prefix)) &&
      !REJECTED_PREF_PREFIXES.some(prefix => pref.startsWith(prefix))
    ) {
      safeLines.push(line);
    }
  }

  return safeLines.length ? `${safeLines.join("\n")}\n` : "";
}

export function createMigrationJournal({
  candidate,
  currentProfilePath,
  appVersion,
  channel,
  now = Date.now(),
}) {
  return {
    schemaVersion: PROFILE_MIGRATION_JOURNAL_VERSION,
    id: candidateFingerprint(candidate),
    state: "discovered",
    sourceCandidateId: candidate.id,
    sourceFingerprint: candidate.fingerprint,
    sourcePath: candidate.path,
    previousProfilePath: currentProfilePath,
    destinationProfilePath: null,
    archivePath: null,
    appVersion,
    channel: normalizeChannel(channel),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    error: null,
  };
}

const JOURNAL_TRANSITIONS = Object.freeze({
  discovered: ["backing-up", "rolled-back", "failed"],
  "backing-up": ["backed-up", "rolled-back", "failed"],
  "backed-up": ["restoring", "rolled-back", "failed"],
  restoring: ["committed", "rolled-back", "failed"],
  committed: ["rolled-back"],
  failed: ["backing-up", "rolled-back"],
  "rolled-back": ["backing-up"],
});

export function transitionMigrationJournal(
  journal,
  nextState,
  updates = {},
  now = Date.now()
) {
  if (!(JOURNAL_TRANSITIONS[journal.state] || []).includes(nextState)) {
    throw new Error(
      `Invalid profile migration transition: ${journal.state} -> ${nextState}`
    );
  }

  return {
    ...journal,
    ...updates,
    state: nextState,
    updatedAt: new Date(now).toISOString(),
  };
}

export function identityMarker({
  candidate,
  appVersion,
  channel,
  migratedAt = Date.now(),
}) {
  return {
    schemaVersion: PROFILE_IDENTITY_SCHEMA_VERSION,
    installationId: stableInstallIdentity({ channel }),
    channel: normalizeChannel(channel),
    sourceFingerprint: candidate.fingerprint,
    appVersion,
    migratedAt: new Date(migratedAt).toISOString(),
  };
}
