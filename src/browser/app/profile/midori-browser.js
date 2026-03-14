// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
// Note: You must have semicolons at the end of each line in user setting files

// Betterfox has a lower priority than the prefs included in this file
#include Fastfox.js
#include Smoothfox.js
#include Securefox.js
#include Memoryfox.js

// Midori Browser Mods
// Include "Firefox/x.y" in User-Agent for site compatibility (Netflix, Gmail, Mozilla Addons, etc.)
// Result: Mozilla/5.0 (...) Gecko/20100101 Firefox/148.0 Midori/11.6.2
pref("general.useragent.compatMode.firefox", true);

// Disable the "Your default search engine has been changed" notification bar
pref("browser.search.removeEngineInfobar.enabled", false);

pref("app.support.baseURL", "https://astian.org/community");
pref("extensions.install_origins.enabled", true);
pref("browser.newtabpage.activity-stream.feeds.section.highlights", true);
pref("browser.newtabpage.activity-stream.feeds.topsites", true);
pref("browser.profiles.enabled", true);
pref("browser.tabs.cardPreview.enabled", true);
pref("browser.tabs.cardPreview.delayMs", 400);
pref("cookiebanners.service.mode.privateBrowsing", 2);
pref("browser.urlbar.update2.engineAliasRefresh", true);

// Disable Languages (as most of them break the branding)
pref("intl.multilingual.enabled", false);

pref("browser.newtabpage.activity-stream.go.background.image", false);

// MacOS translucency preference (disabled for testing only) 
pref("pulse.mac-translucent", false);

// Prefs from browser/branding/unofficial/prefs/firefox-branding.js:

// The time interval between checks for a new version (in seconds)
pref("app.update.interval", 86400); // 24 hours
// Give the user x seconds to react before showing the big UI. default=24 hours
pref("app.update.promptWaitTime", 86400);

// The number of days a binary is permitted to be old
// without checking for an update.  This assumes that
// app.update.checkInstallTime is true.
pref("app.update.checkInstallTime.days", 2);

// Give the user x seconds to reboot before showing a badge on the hamburger
// button. default=immediately
pref("app.update.badgeWaitTime", 0);

// Number of usages of the web console.
// If this is less than 5, then pasting code into the web console is disabled
pref("devtools.selfxss.count", 5);

// Betterfox overrides:
pref('identity.fxaccounts.enabled', true); // Enable firefox sync

// Enable importers for other browsers
pref('browser.migrate.vivaldi.enabled', true);
pref('browser.migrate.opera-gx.enabled', true);
pref('browser.migrate.opera.enabled', true);

// Enable downloading DRM.
pref('media.eme.enabled', true);

// Enable linux hardware video decoding. Note that this may cause a crash
// on start for some linux setups, for example, those that do not have DMA-BUF
// or VA-API. We should see if we can find a work around for those 
// crashes when they come up
pref('media.ffmpeg.vaapi.enabled', true);

// Disable firefox's about:welcome page
pref('browser.aboutwelcome.enabled', false);

pref('midori.welcome.enabled', true);
pref('midori.welcome.seen', false);

// Custom search engine preferences
pref('midori.search.useCustomEngine', false);
pref('midori.search.customEngine.name', '');
pref('midori.search.customEngine.url', '');
pref('midori.search.customEngine.iconURL', '');

// Note that this is causing state & performance issues. I am going to disable
// it by default
pref('midori.sidebar.keeptabsactive.enabled', false);

//PIP pref
pref('media.videocontrols.picture-in-picture.audio-toggle.enabled', true);

pref('browser.discovery.enabled', false);
pref('svg.context-properties.content.enabled', true);

// Allow the user to install unsigned addons from sources like our custom addon
// store
pref('xpinstall.signatures.required', false);
// Allow the usage of theme experiments
pref('extensions.experiments.enabled', true);

// Disable VPN promos
pref('browser.vpn_promo.enabled', false, locked);
pref("browser.promo.focus.enabled", false, locked);
pref("browser.preferences.moreFromMozilla", false, locked);
pref('browser.contentblocking.report.hide_vpn_banner', true, locked);

// Enable WebMIDI. This is still currently in testing inside of Firefox, but
// will also provide us with the benefit of more features
pref('dom.webmidi.enabled', true);

// Our versioning system is incomprehensible to Mozilla's servers. To fix a bunch
// of addon bugs, we need to update these prefs
pref("extensions.getAddons.search.browseURL", "https://addons.mozilla.org/%LOCALE%/firefox/search?q=%TERMS%&platform=%OS%&appver=%PLATFORMVERSION%");
pref("extensions.getAddons.langpacks.url", "https://services.addons.mozilla.org/api/v4/addons/language-tools/?app=firefox&type=language&appversion=%PLATFORMVERSION%");

// Check for system add-on updates.
pref("extensions.systemAddon.update.url", "https://update.astian.org/browser/addons/%CHANNEL%/update.xml", locked);
pref("extensions.systemAddon.update.enabled", true);

//Update Routes (Download page for manual download and Temperoraliy Discord Invite Link for Release Notes)
pref("app.update.url.manual", "https://astian.org/midori-browser/download", locked);
pref("app.update.url.details", "https://github.com/goastian/midori-desktop/releases//latest", locked);
pref("app.releaseNotesURL", "https://github.com/gooastian/midori-browser/commits/main", locked);
pref("app.releaseNotesURL.aboutDialog", "https://github.com/goastian/midori-browser/commits/main", locked);

// This pref needs to be here to not break context menus (GH#169)
pref("extensions.pocket.enabled", false);

// Reenable accessability. Should have a low enough performance impact with the
// changes in 113
//  0: auto-detect
//  1: force disable
// -1: force enable
pref('accessibility.force_disabled', 1);

// This feature isn't stable / performant, but I am going to enable it anyway
// specifically to get vertical tab styling to work with minimal jank
pref('layout.css.has-selector.enabled', true);

// Allow for showing and hiding of assorted tab buttons at the users
// digression
pref('midori.tabs.show.close', true);
pref('midori.tabs.show.new', true);

// Disable bookmark toolbar by default
pref('browser.toolbars.bookmarks.visibility', 'never');

// Midori Workspaces
pref('midori.workspaces.enabled', true);
pref('midori.workspaces.show-button', true);

// ============================================================================
// MIDORI MEMORY PROFILE
// ============================================================================
// Memory profile setting (0=Performance, 1=Balanced, 2=Low Memory)
// Default: 1 (Balanced) - good compromise between RAM usage and performance
pref('midori.memory.profile', 2);

// Enable tab unloading when system memory is low
pref('browser.tabs.unloadOnLowMemory', true);

// Fork server for Linux - enables copy-on-write memory sharing
pref('dom.ipc.forkserver.enable', true);

// ============================================================================
// MIDORI GLASSMORPHISM THEMES
// ============================================================================
// Set Jade Mist as the default active theme
pref('extensions.activeThemeID', 'midori-theme-jade-mist@midori.astian.org');

// Enable backdrop-filter for glassmorphism effects
pref('layout.css.backdrop-filter.enabled', true);
pref('gfx.webrender.all', true);

pref('toolkit.legacyUserProfileCustomizations.stylesheets', true);

// ============================================================================
// MIDORI CUSTOM GRADIENT SYSTEM
// ============================================================================
// Allow users to define custom gradients for the browser chrome
pref('midori.gradient.enabled', false);
pref('midori.gradient.type', 'linear');
pref('midori.gradient.angle', 135);
pref('midori.gradient.stops', '[{"color":"#2d8659","position":0},{"color":"#1a5c3a","position":100}]');
pref('midori.gradient.texture', 'none');
pref('midori.gradient.texture.opacity', 50);

// ============================================================================
// MIDORI AUTO-HIDE TOOLBAR
// ============================================================================
// Hide the toolbar when scrolling down to maximize content area
// The toolbar reappears when scrolling up or moving the mouse to the top
pref('midori.autohide.toolbar', true);
