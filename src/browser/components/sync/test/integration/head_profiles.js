/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const stage = Services.env.get("MIDORI_SYNC_PROFILE_STAGE");
if (["C", "D", "E", "F"].includes(stage)) {
  const backup = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  backup.initWithPath(Services.env.get(stage === "E" ? "MIDORI_SYNC_PROFILE_LEGACY_BACKUP_DIR" :
    stage === "F" ? "MIDORI_SYNC_PROFILE_RESTART_BACKUP_DIR" :
      stage === "C" ? "MIDORI_SYNC_PROFILE_BACKUP_DIR" : "MIDORI_SYNC_PROFILE_B_BACKUP_DIR"));
  const profile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  profile.initWithPath(Services.env.get("XPCSHELL_TEST_PROFILE_DIR"));
  if (!backup.isDirectory() || !profile.isDirectory()) {
    throw new Error("native_profile_backup_unavailable");
  }
  const entries = backup.directoryEntries;
  while (entries.hasMoreElements()) {
    const entry = entries.getNext().QueryInterface(Ci.nsIFile);
    const existing = profile.clone();
    existing.append(entry.leafName);
    if (existing.exists()) {
      existing.remove(true);
    }
    entry.copyTo(profile, entry.leafName);
  }
  const prefsFile = profile.clone();
  prefsFile.append("prefs.js");
  if (prefsFile.exists()) {
    Services.prefs.readUserPrefsFromFile(prefsFile);
  }
}
