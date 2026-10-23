/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

if (Services.env.get("MIDORI_SYNC_DURABILITY_STAGE") === "verify" ||
    Services.env.get("MIDORI_SYNC_DURABILITY_CHANGE") !== "create") {
  const backup = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  backup.initWithPath(Services.env.get("MIDORI_SYNC_DURABILITY_BACKUP"));
  const profile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  profile.initWithPath(Services.env.get("XPCSHELL_TEST_PROFILE_DIR"));
  if (!backup.isDirectory() || !profile.isDirectory()) {
    throw new Error("durability_profile_backup_missing");
  }
  for (const entry of backup.directoryEntries) {
    const existing = profile.clone();
    existing.append(entry.leafName);
    if (existing.exists()) {
      existing.remove(true);
    }
    entry.copyTo(profile, entry.leafName);
  }
}
