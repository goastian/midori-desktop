/* Any copyright is dedicated to the Public Domain.
https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/* import-globals-from ../../../backup/tests/xpcshell/head.js */

const { ArchiveEncryptionState } = ChromeUtils.importESModule(
  "resource:///modules/backup/ArchiveEncryptionState.sys.mjs"
);
const { MidoriLegacyProfileBackupResource } = ChromeUtils.importESModule(
  "resource:///modules/MidoriLegacyProfileBackupResource.sys.mjs"
);

const PASSWORD = "midori-test-backup-password";

async function writeFixture(profilePath) {
  await IOUtils.makeDirectory(PathUtils.join(profilePath, "extensions"), {
    createAncestors: true,
  });
  await IOUtils.makeDirectory(
    PathUtils.join(profilePath, "sessionstore-backups"),
    { createAncestors: true }
  );
  await IOUtils.makeDirectory(PathUtils.join(profilePath, "Workspaces"), {
    createAncestors: true,
  });
  await IOUtils.makeDirectory(
    PathUtils.join(profilePath, "storage", "default", "https+++unsafe.test"),
    { createAncestors: true }
  );

  const sqliteFiles = ["key4.db", "places.sqlite", "favicons.sqlite"];
  for (const fileName of sqliteFiles) {
    const connection = await Sqlite.openConnection({
      path: PathUtils.join(profilePath, fileName),
    });
    await connection.execute("CREATE TABLE fixture (value TEXT)");
    await connection.close();
  }

  const files = new Map([
    ["logins.json", '{"logins":[{"id":1}]}'],
    ["containers.json", '{"identities":[{"userContextId":1}]}'],
    ["xulstore.json", "{}"],
    ["sessionstore.jsonlz4", "current-session"],
    ["sessionstore-backups/recovery.jsonlz4", "recovery-session"],
    ["Workspaces/Workspaces.json", '{"windows":{"one":{}}}'],
    ["extensions/fixture@example.xpi", "signed-extension-fixture"],
    ["extensions.json", '{"unsafe":"runtime-state"}'],
    ["addonStartup.json.lz4", "unsafe-startup-cache"],
    ["user.js", 'user_pref("network.proxy.http", "unsafe.test");'],
    ["storage/default/https+++unsafe.test/data", "unsafe-origin-state"],
    [
      "prefs.js",
      [
        'user_pref("midori.colorway", "forest");',
        'user_pref("floorp.browser.workspaces.enabled", true);',
        'user_pref("midori.profileMigration.version", 3);',
        'user_pref("network.proxy.http", "unsafe.test");',
      ].join("\n"),
    ],
  ]);
  for (const [relativePath, contents] of files) {
    await IOUtils.writeUTF8(
      PathUtils.join(profilePath, ...relativePath.split("/")),
      contents
    );
  }
}

add_task(async function test_encrypted_backup_and_safe_recovery_in_tmp() {
  const currentProfile = setupProfile();
  const originalCurrentName = currentProfile.name;
  const profileService = Cc[
    "@mozilla.org/toolkit/profile-service;1"
  ].getService(Ci.nsIToolkitProfileService);
  profileService.defaultProfile = currentProfile;

  const sourcePath = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "midori-115-deb-x64"
  );
  const archiveParent = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "midori-119-backups"
  );
  const recoveryWorkspace = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "midori-next-recovery"
  );
  const recoveredProfilesRoot = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "midori-next-appimage-arm64"
  );
  let recoveredProfile = null;

  registerCleanupFunction(async () => {
    profileService.defaultProfile = currentProfile;
    currentProfile.name = originalCurrentName;
    recoveredProfile?.remove(false);
    await profileService.asyncFlush();
    Services.prefs.clearUserPref("browser.backup.location");
    for (const path of [
      sourcePath,
      archiveParent,
      recoveryWorkspace,
      recoveredProfilesRoot,
    ]) {
      await IOUtils.remove(path, { recursive: true, ignoreAbsent: true });
    }
  });

  Assert.ok(
    sourcePath.startsWith(PathUtils.tempDir),
    "The legacy fixture is isolated in the system temporary directory"
  );
  Assert.ok(
    recoveredProfilesRoot.startsWith(PathUtils.tempDir),
    "The recovered profile is isolated in the system temporary directory"
  );
  await writeFixture(sourcePath);
  Services.prefs.setStringPref("browser.backup.location", archiveParent);

  const backupService = new BackupService({
    MidoriLegacyProfileBackupResource,
  });
  const { instance: encryptionState } =
    await ArchiveEncryptionState.initialize(PASSWORD);
  const backup = await backupService.createBackup({
    profilePath: sourcePath,
    reason: "midori-profile-migration-test",
    encState: encryptionState,
  });

  Assert.ok(backup?.archivePath, "Firefox 153 created a backup archive");
  Assert.ok(
    backup.manifest.resources.midori_profile,
    "The safe Midori resource is present in the archive manifest"
  );
  Assert.ok(
    (await backupService.sampleArchive(backup.archivePath)).isEncrypted,
    "The archive is encrypted"
  );
  await backupService.loadBackupFileInfo(backup.archivePath);
  await Assert.rejects(
    backupService.recoverFromBackupArchive(
      backup.archivePath,
      "incorrect-password",
      false,
      recoveryWorkspace,
      recoveredProfilesRoot,
      false,
      "midori-profile-migration-test"
    ),
    () => true,
    "A wrong password cannot recover the archive"
  );

  await backupService.loadBackupFileInfo(backup.archivePath);
  recoveredProfile = await backupService.recoverFromBackupArchive(
    backup.archivePath,
    PASSWORD,
    false,
    recoveryWorkspace,
    recoveredProfilesRoot,
    false,
    "midori-profile-migration-test"
  );
  const destination = recoveredProfile.rootDir.path;

  for (const relativePath of [
    "logins.json",
    "key4.db",
    "places.sqlite",
    "favicons.sqlite",
    "containers.json",
    "sessionstore.jsonlz4",
    "sessionstore-backups/recovery.jsonlz4",
    "Workspaces/Workspaces.json",
    "extensions/fixture@example.xpi",
  ]) {
    Assert.ok(
      await IOUtils.exists(
        PathUtils.join(destination, ...relativePath.split("/"))
      ),
      `${relativePath} was recovered`
    );
  }

  for (const relativePath of [
    "extensions.json",
    "addonStartup.json.lz4",
    "user.js",
    "storage/default/https+++unsafe.test/data",
  ]) {
    Assert.ok(
      !(await IOUtils.exists(
        PathUtils.join(destination, ...relativePath.split("/"))
      )),
      `${relativePath} was not copied`
    );
  }

  const recoveredPrefs = await IOUtils.readUTF8(
    PathUtils.join(destination, "prefs.js")
  );
  Assert.stringContains(recoveredPrefs, "midori.colorway");
  Assert.stringContains(recoveredPrefs, "floorp.browser.workspaces.enabled");
  Assert.ok(!recoveredPrefs.includes("profileMigration"));
  Assert.ok(!recoveredPrefs.includes("network.proxy"));
  Assert.ok(
    await IOUtils.exists(PathUtils.join(sourcePath, "extensions.json")),
    "The source profile remains untouched for rollback"
  );
});
