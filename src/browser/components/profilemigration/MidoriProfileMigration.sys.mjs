/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  candidateFingerprint,
  candidateId,
  createMigrationJournal,
  getSelectionState,
  identityMarker,
  normalizeChannel,
  parseProfilesIni,
  stableInstallIdentity,
  transitionMigrationJournal,
} from "./MidoriProfileIdentity.sys.mjs";

const MIGRATION_VERSION_PREF = "midori.profileMigration.version";
const ACTIVE_THEME_PREF = "extensions.activeThemeID";
const COLORWAY_PREF = "midori.colorway";
const LEGACY_THEME_MODE_PREF = "midori.theme.mode";
const LEGACY_WINDOW_CONTROLS_PREF = "midori.modblur.windowControls.macStyle";
const WINDOW_CONTROLS_STYLE_PREF = "midori.modblur.windowControls.style";
const CURRENT_MIGRATION_VERSION = 3;
const IDENTITY_FILE = "midori-profile-identity.json";
const JOURNAL_DIRECTORY = "midori-profile-migration";
const JOURNAL_FILE = "transaction.json";
const PROFILE_MARKERS = Object.freeze([
  "prefs.js",
  "places.sqlite",
  "logins.json",
  "sessionstore.jsonlz4",
  "containers.json",
]);

function runtimeModules() {
  const { AppConstants } = ChromeUtils.importESModule(
    "resource://gre/modules/AppConstants.sys.mjs"
  );
  const { ArchiveEncryptionState } = ChromeUtils.importESModule(
    "resource:///modules/backup/ArchiveEncryptionState.sys.mjs"
  );
  const { BackupService } = ChromeUtils.importESModule(
    "resource:///modules/backup/BackupService.sys.mjs"
  );
  const { MidoriLegacyProfileBackupResource } = ChromeUtils.importESModule(
    "resource:///modules/MidoriLegacyProfileBackupResource.sys.mjs"
  );
  return {
    AppConstants,
    ArchiveEncryptionState,
    BackupService,
    MidoriLegacyProfileBackupResource,
  };
}

function profileService() {
  return Cc["@mozilla.org/toolkit/profile-service;1"].getService(
    Ci.nsIToolkitProfileService
  );
}

function runtimeChannel() {
  const { AppConstants } = runtimeModules();
  return normalizeChannel(
    AppConstants.MOZ_UPDATE_CHANNEL ||
      Services.prefs.getStringPref("app.update.channel", "release")
  );
}

function uniquePaths(paths) {
  const seen = new Set();
  return paths.filter(entry => {
    const key =
      Services.appinfo.OS === "WINNT" ? entry.path.toLowerCase() : entry.path;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function historicalProfileRoots() {
  const home = Services.dirsvc.get("Home", Ci.nsIFile).path;
  const currentRoot = Services.dirsvc.get("UAppData", Ci.nsIFile).path;
  const roots = [
    { sourceId: "current", label: "Midori", path: currentRoot },
  ];

  if (Services.appinfo.OS === "WINNT") {
    const roaming = Services.dirsvc.get("AppData", Ci.nsIFile).path;
    roots.push(
      { sourceId: "legacy-midori", label: "Midori 11.5", path: PathUtils.join(roaming, "Midori") },
      { sourceId: "legacy-astian", label: "Midori Astian", path: PathUtils.join(roaming, "Astian", "Midori") },
      { sourceId: "legacy-mozilla", label: "Midori 11.8+", path: PathUtils.join(roaming, "Mozilla", "Midori") }
    );
  } else if (Services.appinfo.OS === "Darwin") {
    const support = PathUtils.join(home, "Library", "Application Support");
    roots.push(
      { sourceId: "legacy-midori", label: "Midori 11.5", path: PathUtils.join(support, "Midori") },
      { sourceId: "legacy-midori-browser", label: "Midori Browser", path: PathUtils.join(support, "Midori Browser") },
      { sourceId: "legacy-astian", label: "Midori Astian", path: PathUtils.join(support, "Astian", "Midori") }
    );
  } else {
    const xdgConfig =
      Services.env.get("XDG_CONFIG_HOME") || PathUtils.join(home, ".config");
    roots.push(
      { sourceId: "legacy-midori", label: "Midori 11.5", path: PathUtils.join(home, ".midori") },
      { sourceId: "legacy-mozilla", label: "Midori 11.8+", path: PathUtils.join(home, ".mozilla", "midori") },
      { sourceId: "xdg-midori", label: "Midori XDG", path: PathUtils.join(xdgConfig, "midori") },
      { sourceId: "xdg-astian", label: "Midori Astian XDG", path: PathUtils.join(xdgConfig, "astian", "midori") },
      { sourceId: "xdg-mozilla", label: "Midori Mozilla XDG", path: PathUtils.join(xdgConfig, "mozilla", "midori") }
    );

    for (const appId of ["org.astian.midori_browser", "org.midori_browser.Midori"]) {
      const flatpakConfig = PathUtils.join(home, ".var", "app", appId, "config");
      roots.push(
        { sourceId: `flatpak-${appId}-midori`, label: "Midori Flatpak", path: PathUtils.join(flatpakConfig, "midori") },
        { sourceId: `flatpak-${appId}-mozilla`, label: "Midori Flatpak", path: PathUtils.join(flatpakConfig, "mozilla", "midori") }
      );
    }

    for (const envName of ["SNAP_USER_DATA", "SNAP_USER_COMMON"]) {
      const snapRoot = Services.env.get(envName);
      if (snapRoot) {
        roots.push({
          sourceId: `snap-${envName.toLowerCase()}`,
          label: "Midori Snap",
          path: PathUtils.join(snapRoot, ".midori"),
        });
      }
    }
  }

  return uniquePaths(roots);
}

function isWithinRoot(root, path) {
  const normalizedRoot = PathUtils.normalize(root);
  let parent = PathUtils.normalize(path);
  const comparableRoot =
    Services.appinfo.OS === "WINNT"
      ? normalizedRoot.toLowerCase()
      : normalizedRoot;
  while (parent && PathUtils.parent(parent) !== parent) {
    parent = PathUtils.parent(parent);
    const comparableParent =
      Services.appinfo.OS === "WINNT" ? parent.toLowerCase() : parent;
    if (comparableParent === comparableRoot) {
      return true;
    }
  }
  return false;
}

async function readJSON(path, fallback = null) {
  try {
    return await IOUtils.readJSON(path);
  } catch {
    return fallback;
  }
}

async function statRegular(path) {
  try {
    const stat = await IOUtils.stat(path);
    return stat.type === "regular" ? stat : null;
  } catch {
    return null;
  }
}

async function summarizeResource(paths) {
  let count = 0;
  let bytes = 0;
  let lastModified = 0;
  for (const path of paths) {
    const stat = await statRegular(path);
    if (stat) {
      count++;
      bytes += stat.size;
      lastModified = Math.max(lastModified, stat.lastModified || 0);
    }
  }
  return { count, bytes, lastModified };
}

async function countExtensions(profilePath) {
  let count = 0;
  for (const path of await IOUtils.getChildren(
    PathUtils.join(profilePath, "extensions"),
    { ignoreAbsent: true }
  )) {
    if (path.endsWith(".xpi") && (await statRegular(path))) {
      count++;
    }
  }
  return { count, bytes: 0, lastModified: 0 };
}

async function countJSONItems(path, property) {
  const value = await readJSON(path, null);
  const items = property ? value?.[property] : value;
  if (Array.isArray(items)) {
    return items.length;
  }
  if (items && typeof items === "object") {
    return Object.keys(items).length;
  }
  return 0;
}

async function getProfileVersion(profilePath) {
  try {
    const contents = await IOUtils.readUTF8(
      PathUtils.join(profilePath, "compatibility.ini")
    );
    return contents.match(/^LastVersion=([^_\r\n]+)/m)?.[1] || null;
  } catch {
    return null;
  }
}

async function profilePreview(root, descriptor, currentProfilePath) {
  const path = descriptor.isRelative
    ? PathUtils.join(root.path, descriptor.path)
    : PathUtils.normalize(descriptor.path);
  if (descriptor.isRelative && !isWithinRoot(root.path, path)) {
    return null;
  }

  const markerStats = await summarizeResource(
    PROFILE_MARKERS.map(name => PathUtils.join(path, name))
  );
  const workspacePath = PathUtils.join(path, "Workspaces", "Workspaces.json");
  const resources = {
    passwords: await summarizeResource([
      PathUtils.join(path, "logins.json"),
      PathUtils.join(path, "key4.db"),
    ]),
    bookmarks: await summarizeResource([
      PathUtils.join(path, "places.sqlite"),
      PathUtils.join(path, "favicons.sqlite"),
    ]),
    sessions: await summarizeResource([
      PathUtils.join(path, "sessionstore.jsonlz4"),
      PathUtils.join(path, "sessionstore-backups", "recovery.jsonlz4"),
      PathUtils.join(path, "sessionstore-backups", "previous.jsonlz4"),
    ]),
    containers: {
      count: await countJSONItems(PathUtils.join(path, "containers.json"), "identities"),
      bytes: 0,
      lastModified: 0,
    },
    workspaces: {
      count: await countJSONItems(workspacePath, "windows"),
      bytes: 0,
      lastModified: 0,
    },
    extensions: await countExtensions(path),
  };
  const valid = markerStats.count > 0 || Object.values(resources).some(item => item.count > 0);
  if (!valid) {
    return null;
  }

  const normalizedPath = PathUtils.normalize(path);
  const normalizedCurrentPath = PathUtils.normalize(currentProfilePath);
  const current =
    Services.appinfo.OS === "WINNT"
      ? normalizedPath.toLowerCase() === normalizedCurrentPath.toLowerCase()
      : normalizedPath === normalizedCurrentPath;
  const profileTimes = await readJSON(PathUtils.join(path, "times.json"), {});
  const candidate = {
    id: candidateId(root.sourceId, path),
    sourceId: root.sourceId,
    sourceLabel: root.label,
    name: descriptor.name,
    path,
    current,
    isDefault: descriptor.isDefault,
    engineVersion: await getProfileVersion(path),
    createdAt: Number(profileTimes.created) || 0,
    lastModified: Math.max(
      markerStats.lastModified,
      ...Object.values(resources).map(item => item.lastModified || 0)
    ),
    resources,
    valid,
  };
  candidate.fingerprint = candidateFingerprint(candidate);
  return candidate;
}

async function descriptorsForRoot(root) {
  let descriptors = [];
  try {
    descriptors = parseProfilesIni(
      await IOUtils.readUTF8(PathUtils.join(root.path, "profiles.ini"))
    );
  } catch {}

  if (descriptors.length) {
    return descriptors;
  }

  for (const path of await IOUtils.getChildren(root.path, {
    ignoreAbsent: true,
  })) {
    try {
      if ((await IOUtils.stat(path)).type === "directory") {
        descriptors.push({
          name: PathUtils.filename(path),
          path,
          isRelative: false,
          isDefault: /default/i.test(PathUtils.filename(path)),
        });
      }
    } catch {}
  }
  return descriptors;
}

async function discoverProfiles() {
  const currentProfilePath = PathUtils.profileDir;
  const candidates = [];
  const seen = new Set();

  for (const root of historicalProfileRoots()) {
    for (const descriptor of await descriptorsForRoot(root)) {
      const candidate = await profilePreview(
        root,
        descriptor,
        currentProfilePath
      );
      if (!candidate) {
        continue;
      }
      const key =
        Services.appinfo.OS === "WINNT"
          ? candidate.path.toLowerCase()
          : candidate.path;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(candidate);
      }
    }
  }

  const currentKey =
    Services.appinfo.OS === "WINNT"
      ? currentProfilePath.toLowerCase()
      : currentProfilePath;
  if (!seen.has(currentKey)) {
    const current = await profilePreview(
      { sourceId: "current", label: "Midori", path: PathUtils.parent(currentProfilePath) },
      { name: profileService().currentProfile?.name || "default", path: currentProfilePath, isRelative: false, isDefault: true },
      currentProfilePath
    );
    if (current) {
      candidates.push(current);
    }
  }

  return candidates.sort((left, right) => {
    if (left.current !== right.current) {
      return left.current ? -1 : 1;
    }
    return right.lastModified - left.lastModified;
  });
}

async function writeAtomicJSON(path, value) {
  await IOUtils.makeDirectory(PathUtils.parent(path), { ignoreExisting: true });
  await IOUtils.writeJSON(path, value, { tmpPath: `${path}.tmp` });
}

async function readIdentity(profilePath = PathUtils.profileDir) {
  return readJSON(PathUtils.join(profilePath, IDENTITY_FILE));
}

async function writeIdentity(profilePath, marker) {
  await writeAtomicJSON(PathUtils.join(profilePath, IDENTITY_FILE), marker);
}

function journalPath(profilePath = PathUtils.profileDir) {
  return PathUtils.join(profilePath, JOURNAL_DIRECTORY, JOURNAL_FILE);
}

async function writeJournal(journal, profilePath = PathUtils.profileDir) {
  await writeAtomicJSON(journalPath(profilePath), journal);
  return journal;
}

function appendBackupPrefs(profilePath) {
  const lineBreak = Services.appinfo.OS === "WINNT" ? "\r\n" : "\n";
  return IOUtils.writeUTF8(
    PathUtils.join(profilePath, "prefs.js"),
    `${lineBreak}user_pref("browser.backup.scheduled.enabled", true);${lineBreak}`,
    { mode: "appendOrCreate" }
  );
}

export async function getProfileRecoveryState() {
  const { AppConstants } = runtimeModules();
  const channel = runtimeChannel();
  const marker = await readIdentity();
  let candidates = await discoverProfiles();
  const observed = new Set(marker?.observedCandidates || []);
  const unseenLegacy = candidates.filter(
    candidate => !candidate.current && !observed.has(candidate.fingerprint)
  );
  const versionChanged =
    marker?.appVersion && marker.appVersion !== AppConstants.MOZ_APP_VERSION_DISPLAY;

  if (marker?.installationId === stableInstallIdentity({ channel }) && !unseenLegacy.length && !versionChanged) {
    return {
      status: "ready",
      candidates: [],
      selectionToken: null,
      appVersion: AppConstants.MOZ_APP_VERSION_DISPLAY,
      channel,
    };
  }

  const currentCandidate = candidates.find(candidate => candidate.current);
  const currentLooksNew =
    profileService().isFirstRun &&
    currentCandidate?.createdAt &&
    Date.now() - currentCandidate.createdAt < 10 * 60 * 1000;
  if (!marker && !unseenLegacy.length && currentLooksNew) {
    const newMarker = identityMarker({
      candidate: currentCandidate,
      appVersion: AppConstants.MOZ_APP_VERSION_DISPLAY,
      channel,
    });
    newMarker.observedCandidates = [currentCandidate.fingerprint];
    await writeIdentity(currentCandidate.path, newMarker);
    return {
      status: "ready",
      candidates: [],
      selectionToken: null,
      appVersion: AppConstants.MOZ_APP_VERSION_DISPLAY,
      channel,
    };
  }

  if (marker && !unseenLegacy.length) {
    candidates = candidates.filter(candidate => candidate.current);
  }
  const selection = getSelectionState(candidates);
  return {
    ...selection,
    appVersion: AppConstants.MOZ_APP_VERSION_DISPLAY,
    channel,
    reason: unseenLegacy.length ? "legacy-profiles" : "identity-or-version",
  };
}

export async function needsProfileRecovery() {
  try {
    const state = await getProfileRecoveryState();
    return ["needs-selection", "needs-confirmation"].includes(state.status);
  } catch (error) {
    console.error("Midori: Could not inspect historical profiles", error);
    return false;
  }
}

export async function migrateSelectedProfile({
  candidateId: selectedId,
  selectionToken: expectedToken,
  password,
}) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("The encrypted backup password must contain at least 8 characters.");
  }

  const state = await getProfileRecoveryState();
  if (state.selectionToken !== expectedToken) {
    throw new Error("The profile list changed. Review the candidates again.");
  }
  const selection = getSelectionState(state.candidates, selectedId);
  if (selection.status !== "selected") {
    throw new Error("Select a profile before starting migration.");
  }

  const candidate = selection.selected;
  const currentProfilePath = PathUtils.profileDir;
  const existingJournal = await readJSON(journalPath(), null);
  if (
    existingJournal?.state === "committed" &&
    existingJournal.sourceFingerprint === candidate.fingerprint &&
    existingJournal.destinationProfilePath &&
    (await IOUtils.exists(existingJournal.destinationProfilePath))
  ) {
    return {
      status: "already-completed",
      destinationProfilePath: existingJournal.destinationProfilePath,
      archivePath: existingJournal.archivePath,
    };
  }

  const { AppConstants, ArchiveEncryptionState, BackupService, MidoriLegacyProfileBackupResource } = runtimeModules();
  let journal = createMigrationJournal({
    candidate,
    currentProfilePath,
    appVersion: AppConstants.MOZ_APP_VERSION_DISPLAY,
    channel: state.channel,
  });
  await writeJournal(journal);
  const { instance: encryptionState } = await ArchiveEncryptionState.initialize(password);
  let newProfile = null;

  try {
    journal = transitionMigrationJournal(journal, "backing-up");
    await writeJournal(journal);

    const backupService = candidate.current
      ? BackupService.init()
      : new BackupService({ MidoriLegacyProfileBackupResource });
    const backup = await backupService.createBackup({
      profilePath: candidate.path,
      reason: "midori-profile-migration",
      encState: encryptionState,
    });
    if (!backup?.archivePath) {
      throw new Error("Firefox Backup did not create an archive.");
    }
    if (
      !candidate.current &&
      !Object.hasOwn(
        backup.manifest?.resources || {},
        MidoriLegacyProfileBackupResource.key
      )
    ) {
      throw new Error("The safe profile resource was not included in the backup.");
    }
    if (!(await backupService.sampleArchive(backup.archivePath)).isEncrypted) {
      throw new Error("Firefox Backup did not encrypt the migration archive.");
    }

    journal = transitionMigrationJournal(journal, "backed-up", {
      archivePath: backup.archivePath,
    });
    await writeJournal(journal);

    const observedCandidates = state.candidates.map(item => item.fingerprint);
    if (candidate.current) {
      await backupService.enableEncryption(password, candidate.path);
      backupService.setScheduledBackups(true, "midori-profile-migration");
      const marker = identityMarker({
        candidate,
        appVersion: state.appVersion,
        channel: state.channel,
      });
      marker.observedCandidates = observedCandidates;
      await writeIdentity(candidate.path, marker);
      journal = transitionMigrationJournal(journal, "restoring");
      journal = transitionMigrationJournal(journal, "committed", {
        destinationProfilePath: candidate.path,
      });
      await writeJournal(journal);
      return { status: "kept-current", archivePath: backup.archivePath };
    }

    journal = transitionMigrationJournal(journal, "restoring");
    await writeJournal(journal);
    newProfile = await backupService.recoverFromBackupArchive(
      backup.archivePath,
      password,
      false,
      currentProfilePath,
      null,
      false,
      "midori-profile-migration"
    );
    const destinationProfilePath = newProfile.rootDir.path;
    const marker = identityMarker({
      candidate,
      appVersion: state.appVersion,
      channel: state.channel,
    });
    marker.observedCandidates = observedCandidates;
    await writeIdentity(destinationProfilePath, marker);

    const encryptionDir = PathUtils.join(
      destinationProfilePath,
      BackupService.PROFILE_FOLDER_NAME
    );
    await IOUtils.makeDirectory(encryptionDir, { ignoreExisting: true });
    await writeAtomicJSON(
      PathUtils.join(encryptionDir, BackupService.ARCHIVE_ENCRYPTION_STATE_FILE),
      await encryptionState.serialize()
    );
    await appendBackupPrefs(destinationProfilePath);

    const service = profileService();
    service.defaultProfile = newProfile;
    await service.asyncFlush();
    journal = transitionMigrationJournal(journal, "committed", {
      destinationProfilePath,
    });
    await writeJournal(journal);
    await writeJournal(journal, destinationProfilePath);

    Services.startup.createInstanceWithProfile(newProfile, [
      "--url",
      "about:home",
    ]);
    Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
    return {
      status: "migrated",
      destinationProfilePath,
      archivePath: backup.archivePath,
    };
  } catch (error) {
    try {
      const service = profileService();
      if (service.currentProfile) {
        service.defaultProfile = service.currentProfile;
        await service.asyncFlush();
      }
      journal = transitionMigrationJournal(journal, "failed", {
        destinationProfilePath: newProfile?.rootDir.path || null,
        error: String(error?.message || error),
      });
      await writeJournal(journal);
    } catch (rollbackError) {
      console.error("Midori: Profile migration rollback failed", rollbackError);
    }
    throw error;
  }
}

export async function rollbackLastProfileMigration() {
  const journal = await readJSON(journalPath(), null);
  if (journal?.state !== "committed" || !journal.previousProfilePath) {
    return { status: "nothing-to-rollback" };
  }

  const service = profileService();
  const previousDirectory = await IOUtils.getDirectory(journal.previousProfilePath);
  const previousProfile = service.getProfileByDir(previousDirectory);
  if (!previousProfile) {
    throw new Error("The previous Midori profile is no longer registered.");
  }

  service.defaultProfile = previousProfile;
  await service.asyncFlush();
  const rolledBack = transitionMigrationJournal(journal, "rolled-back");
  await writeJournal(rolledBack);
  Services.startup.createInstanceWithProfile(previousProfile, [
    "--url",
    "about:home",
  ]);
  Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
  return { status: "rolled-back" };
}

export const LEGACY_THEME_COLORWAYS = Object.freeze({
  "midori-theme-jade-mist@midori.astian.org": "jade",
  "midori-theme-forest-void@midori.astian.org": "forest",
  "midori-theme-sky-crystal@midori.astian.org": "ocean",
  "midori-theme-deep-ocean@midori.astian.org": "midnight",
  "midori-theme-citrus-dawn@midori.astian.org": "sunrise",
  "midori-theme-volcanic-sunset@midori.astian.org": "ember",
});

function colorwayForLegacyMode(prefs) {
  if (!prefs.prefHasUserValue(LEGACY_THEME_MODE_PREF)) {
    return null;
  }

  switch (prefs.getStringPref(LEGACY_THEME_MODE_PREF, "auto").toLowerCase()) {
    case "dark":
      return "forest";
    case "light":
      return "jade";
    case "auto":
      return "system";
    default:
      return null;
  }
}

/**
 * Migrates visual preferences from Midori 11.8.x without resetting Firefox's
 * toolbar state or overriding third-party themes.
 *
 * @param {nsIPrefBranch} prefs
 *   Preference service. Injectable for regression tests.
 * @returns {{ migrated: boolean, colorway: string|null, legacyTheme: string|null }}
 */
export function migrateLegacyProfile(prefs = Services.prefs) {
  const completedVersion = prefs.getIntPref(MIGRATION_VERSION_PREF, 0);
  if (completedVersion >= CURRENT_MIGRATION_VERSION) {
    return { migrated: false, colorway: null, legacyTheme: null };
  }

  const activeTheme = prefs.getStringPref(
    ACTIVE_THEME_PREF,
    "default-theme@mozilla.org"
  );
  const legacyColorway = LEGACY_THEME_COLORWAYS[activeTheme] || null;
  const modeColorway = colorwayForLegacyMode(prefs);
  const selectedColorway = legacyColorway || modeColorway;

  // A colorway selected in 11.9+ is newer than the legacy theme preference and
  // must win. Otherwise translate the old bundled theme to its closest native
  // Midori colorway.
  if (selectedColorway && !prefs.prefHasUserValue(COLORWAY_PREF)) {
    prefs.setStringPref(COLORWAY_PREF, selectedColorway);
  }

  if (
    completedVersion === 2 &&
    prefs.getStringPref(COLORWAY_PREF, "system") === "jade"
  ) {
    prefs.setStringPref(COLORWAY_PREF, "system");
  }

  if (legacyColorway && prefs.prefHasUserValue(ACTIVE_THEME_PREF)) {
    // The old built-in add-on no longer ships. Clearing only known Midori IDs
    // activates the new default theme while leaving third-party themes intact.
    prefs.clearUserPref(ACTIVE_THEME_PREF);
  }

  if (prefs.prefHasUserValue(LEGACY_THEME_MODE_PREF)) {
    prefs.clearUserPref(LEGACY_THEME_MODE_PREF);
  }

  if (prefs.prefHasUserValue(LEGACY_WINDOW_CONTROLS_PREF)) {
    if (
      prefs.getBoolPref(LEGACY_WINDOW_CONTROLS_PREF, false) &&
      !prefs.prefHasUserValue(WINDOW_CONTROLS_STYLE_PREF)
    ) {
      prefs.setStringPref(WINDOW_CONTROLS_STYLE_PREF, "mac-right");
    }
    prefs.clearUserPref(LEGACY_WINDOW_CONTROLS_PREF);
  }

  prefs.setIntPref(MIGRATION_VERSION_PREF, CURRENT_MIGRATION_VERSION);
  return {
    migrated: true,
    colorway: selectedColorway,
    legacyTheme: legacyColorway ? activeTheme : null,
  };
}

export const MidoriProfileMigration = Object.freeze({
  migrate: migrateLegacyProfile,
  getRecoveryState: getProfileRecoveryState,
  needsRecovery: needsProfileRecovery,
  migrateSelectedProfile,
  rollback: rollbackLastProfileMigration,
});
