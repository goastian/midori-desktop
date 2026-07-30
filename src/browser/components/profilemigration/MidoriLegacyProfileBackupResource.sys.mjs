/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { BackupResource } from "resource:///modules/backup/BackupResource.sys.mjs";
import {
  SAFE_PROFILE_RESOURCES,
  sanitizeProfilePrefs,
} from "resource:///modules/MidoriProfileIdentity.sys.mjs";

async function isRegularFile(path) {
  try {
    return (await IOUtils.stat(path)).type === "regular";
  } catch {
    return false;
  }
}

async function copyRegularFiles(source, destination, entries) {
  const regularEntries = [];
  for (const entry of entries) {
    if (await isRegularFile(PathUtils.join(source, entry))) {
      regularEntries.push(entry);
    }
  }
  if (regularEntries.length) {
    await IOUtils.makeDirectory(destination, { ignoreExisting: true });
  }
  await BackupResource.copyFiles(source, destination, regularEntries);
  return regularEntries.length;
}

async function copyExtensionPackages(source, destination) {
  const sourceDir = PathUtils.join(source, "extensions");
  const destinationDir = PathUtils.join(destination, "extensions");
  const packages = [];

  for (const path of await IOUtils.getChildren(sourceDir, {
    ignoreAbsent: true,
  })) {
    if (path.endsWith(".xpi") && (await isRegularFile(path))) {
      packages.push(PathUtils.filename(path));
    }
  }

  if (packages.length) {
    await IOUtils.makeDirectory(destinationDir, { ignoreExisting: true });
    await BackupResource.copyFiles(sourceDir, destinationDir, packages);
  }

  return packages.length;
}

async function copySanitizedPrefs(source, destination) {
  const sourcePath = PathUtils.join(source, "prefs.js");
  if (!(await isRegularFile(sourcePath))) {
    return false;
  }

  const contents = sanitizeProfilePrefs(await IOUtils.readUTF8(sourcePath));
  if (!contents) {
    return false;
  }

  await IOUtils.writeUTF8(PathUtils.join(destination, "prefs.js"), contents);
  return true;
}

export class MidoriLegacyProfileBackupResource extends BackupResource {
  static get key() {
    return "midori_profile";
  }

  static get requiresEncryption() {
    return true;
  }

  async backup(stagingPath, profilePath) {
    const sqliteFiles = [
      ...SAFE_PROFILE_RESOURCES.credentials,
      ...SAFE_PROFILE_RESOURCES.places,
    ].filter(name => name.endsWith(".db") || name.endsWith(".sqlite"));
    const regularFiles = [
      ...SAFE_PROFILE_RESOURCES.credentials,
      ...SAFE_PROFILE_RESOURCES.preferences,
      SAFE_PROFILE_RESOURCES.sessions[0],
    ].filter(name => !sqliteFiles.includes(name));

    await BackupResource.copySqliteDatabases(
      profilePath,
      stagingPath,
      sqliteFiles
    );
    const files = await copyRegularFiles(
      profilePath,
      stagingPath,
      regularFiles
    );
    const sessions = await copyRegularFiles(
      PathUtils.join(profilePath, "sessionstore-backups"),
      PathUtils.join(stagingPath, "sessionstore-backups"),
      SAFE_PROFILE_RESOURCES.sessions
        .slice(1)
        .map(name => PathUtils.filename(name))
    );
    const workspaces = await copyRegularFiles(
      PathUtils.join(profilePath, "Workspaces"),
      PathUtils.join(stagingPath, "Workspaces"),
      ["Workspaces.json"]
    );
    const extensions = await copyExtensionPackages(profilePath, stagingPath);
    const preferences = await copySanitizedPrefs(profilePath, stagingPath);

    return { files, sessions, workspaces, extensions, preferences };
  }

  async recover(_manifestEntry, recoveryPath, destinationProfilePath) {
    const rootFiles = [
      ...SAFE_PROFILE_RESOURCES.credentials,
      ...SAFE_PROFILE_RESOURCES.places,
      ...SAFE_PROFILE_RESOURCES.preferences,
      SAFE_PROFILE_RESOURCES.sessions[0],
      "prefs.js",
    ];

    await copyRegularFiles(recoveryPath, destinationProfilePath, rootFiles);
    await copyRegularFiles(
      PathUtils.join(recoveryPath, "sessionstore-backups"),
      PathUtils.join(destinationProfilePath, "sessionstore-backups"),
      SAFE_PROFILE_RESOURCES.sessions
        .slice(1)
        .map(name => PathUtils.filename(name))
    );
    await copyRegularFiles(
      PathUtils.join(recoveryPath, "Workspaces"),
      PathUtils.join(destinationProfilePath, "Workspaces"),
      ["Workspaces.json"]
    );
    await copyExtensionPackages(recoveryPath, destinationProfilePath);

    return null;
  }
}
