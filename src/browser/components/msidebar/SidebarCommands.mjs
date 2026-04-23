export function toggleSidebar(win) {
  const enabled = Services.prefs.getBoolPref('midori.msidebar.enabled', false);
  Services.prefs.setBoolPref('midori.msidebar.enabled', !enabled);
  try {
    win?.focus();
  } catch {}
}
