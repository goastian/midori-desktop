/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const h2Stage = Services.env.get("MIDORI_SYNC_H2_STAGE");
if (["C", "D", "E", "F", "G", "H"].includes(h2Stage)) {
  const backup = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  backup.initWithPath(Services.env.get(["C", "E", "G"].includes(h2Stage) ?
    "MIDORI_SYNC_H2_PROFILE_A" : "MIDORI_SYNC_H2_PROFILE_B"));
  const profile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  profile.initWithPath(Services.env.get("XPCSHELL_TEST_PROFILE_DIR"));
  if (!backup.isDirectory() || !profile.isDirectory()) {
    throw new Error("h2_profile_backup_missing");
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
  const prefs = profile.clone();
  prefs.append("prefs.js");
  if (prefs.exists()) {
    Services.prefs.readUserPrefsFromFile(prefs);
  }
}
