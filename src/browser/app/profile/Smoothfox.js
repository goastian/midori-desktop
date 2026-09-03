/****************************************************************************************
 * Smoothfox                                                                            *
 * "Faber est suae quisque fortunae"                                                    *
 * priority: better scrolling                                                           *
 * version: 137                                                                         *
 * url: https://github.com/yokoffing/Betterfox                                          *
 ***************************************************************************************/

// Safe baseline for 60 Hz displays and systems that do not report a refresh rate.
// MidoriSmoothScroll.sys.mjs selects the 90 Hz or 120 Hz recipe at runtime.
pref("apz.overscroll.enabled", true);
pref("general.smoothScroll", true);
pref("general.smoothScroll.msdPhysics.enabled", false);
pref("mousewheel.default.delta_multiplier_y", 275);

pref("midori.smoothScroll.migrationVersion", 0);
