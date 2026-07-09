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
// Produce a pure Firefox User-Agent for full web compatibility.
// With compatMode.firefox enabled, nsHttpHandler.cpp suppresses the
// "Midori/x.x.x" app token entirely, resulting in:
//   Mozilla/5.0 (...) Gecko/20100101 Firefox/148.0
// This avoids UA-sniffing breakage on Netflix, reCAPTCHA, and all
// subdomains/CDNs/APIs without needing per-site interventions.
pref("general.useragent.compatMode.firefox", true);

// ============================================================================
// MIDORI SEARCH ENGINE PROTECTION
// ============================================================================
// Disable the "Your default search engine has been changed" notification bar
pref("browser.search.removeEngineInfobar.enabled", false);
// Prevent search engine updates via OpenSearch (stops re-adding removed engines)
pref("browser.search.update", false);

// MIDORI NEW TAB & HOME PAGE
// Home page uses about:newtab so it resolves to midori-newtab extension
pref("browser.startup.homepage", "about:newtab");
pref("browser.startup.homepage.abouthome_cache.enabled", false);

pref("app.support.baseURL", "https://astian.org/community");
pref("extensions.install_origins.enabled", true);
pref("browser.newtabpage.activity-stream.feeds.section.highlights", true);
pref("browser.newtabpage.activity-stream.feeds.topsites", true);
pref("browser.profiles.enabled", true);
pref("browser.tabs.cardPreview.enabled", true);
pref("browser.tabs.cardPreview.delayMs", 400);
pref("cookiebanners.service.mode.privateBrowsing", 2);
pref("browser.urlbar.update2.engineAliasRefresh", true);

// Force-enable bundled multi-language support in packaged builds.
// Locking avoids old profile user prefs forcing multilingual support off.
pref("intl.multilingual.enabled", true, locked);
pref("intl.multilingual.downloadEnabled", true, locked);
pref("intl.multilingual.liveReload", true, locked);
pref("intl.multilingual.liveReloadBidirectional", false, locked);
// Langpack updates are part of the app-update pipeline (see bug #183):
// even with `app.update.enabled=false` they would still trigger silent
// network checks against MOZ_APPUPDATE_HOST and surface an "update
// available" badge on the hamburger button. Keep them off and locked.
pref("app.update.langpack.enabled", false, locked);

// Disable sidebar firefox default
pref("browser.sidebar.enabled", false);

pref("browser.newtabpage.activity-stream.go.background.image", false);

// MacOS translucency preference (disabled for testing only) 
pref("pulse.mac-translucent", false);

// NOTE: app-update cadence prefs (app.update.interval, promptWaitTime,
// checkInstallTime.days, badgeWaitTime) are intentionally NOT set here.
// They only matter when the updater is enabled, and leaving them at
// non-zero values was letting the hamburger-menu update badge reappear
// whenever anything briefly re-enabled the update service (bug #183).
// All update surfaces are disabled + locked in the section near the
// bottom of this file ("DISABLE AUTOMATIC UPDATES ...").

// Number of usages of the web console.
// If this is less than 5, then pasting code into the web console is disabled
pref("devtools.selfxss.count", 5);

// Betterfox overrides:
pref('identity.fxaccounts.enabled', true); // Disable Firefox Accounts (replaced by Astian Account)

// Enable importers for other browsers
pref('browser.migrate.vivaldi.enabled', true);
pref('browser.migrate.opera-gx.enabled', true);
pref('browser.migrate.opera.enabled', true);

// Enable downloading DRM.
pref('media.eme.enabled', true);

// Fix GMP (Widevine) downloads: Balrog expects a Firefox version in the URL,
// but %VERSION% resolves to Midori's version (11.6.4) which Balrog doesn't
// recognize. Use %PLATFORM_VERSION% (149.0) instead so Widevine CDM downloads
// correctly from Mozilla's servers.
pref("media.gmp-manager.url", "https://aus5.mozilla.org/update/3/GMP/%PLATFORM_VERSION%/%BUILD_ID%/%BUILD_TARGET%/%LOCALE%/%CHANNEL%/%OS_VERSION%/%DISTRIBUTION%/%DISTRIBUTION_VERSION%/update.xml");

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

// PiP prefs
pref('media.videocontrols.picture-in-picture.audio-toggle.enabled', true);
// PiP skin: "off", "compact", "island", "mini"
pref('midori.pip.skin', 'compact');
// Keep PDF.js visually aligned with Midori's flat/Nova chrome while retaining
// the upstream viewer's default controls and accessibility semantics.
pref('midori.pdfjs.flat.enabled', true);

pref('browser.discovery.enabled', false);
pref('svg.context-properties.content.enabled', true);

// Allow the user to install unsigned addons from sources like our custom addon
// store
pref('xpinstall.signatures.required', false);
// Allow the usage of theme experiments
pref('extensions.experiments.enabled', true);

// VPN promos, Focus promo, and More from Mozilla are now disabled
// in the locked prefs section at the bottom of this file.

// Enable WebMIDI. This is still currently in testing inside of Firefox, but
// will also provide us with the benefit of more features
pref('dom.webmidi.enabled', true);

// Our versioning system is incomprehensible to Mozilla's servers. To fix a bunch
// of addon bugs, we need to update these prefs
pref("extensions.getAddons.search.browseURL", "https://addons.mozilla.org/%LOCALE%/firefox/search?q=%TERMS%&platform=%OS%&appver=%PLATFORMVERSION%");
pref("extensions.getAddons.langpacks.url", "https://services.addons.mozilla.org/api/v4/addons/language-tools/?app=firefox&type=language&appversion=%PLATFORMVERSION%");

// Check for system add-on updates. The `enabled` flag is locked off lower
// in this file alongside the rest of the update-surface prefs (bug #183).
pref("extensions.systemAddon.update.url", "https://update.astian.org/browser/addons/%CHANNEL%/update.xml", locked);

// Pocket is now fully disabled in the locked prefs section at the bottom of this file.

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
pref('midori.workspaces.show-name', true);

// Memory-aware workspaces: discard (unload) tabs of inactive workspaces after
// switching away, freeing their memory while keeping the tab for instant
// on-demand reload. Delay is clamped to [5000, 1800000] ms.
pref('midori.workspaces.unloadInactive', true);
pref('midori.workspaces.unloadDelayMs', 45000);
// Tint the browser chrome with the active workspace accent color (subtle).
pref('midori.workspaces.chromeTint', true);

// ============================================================================
// MIDORI MEMORY PROFILE
// ============================================================================
// Memory profile setting (0=Performance, 1=Balanced, 2=Low Memory)
// Default: 1 (Balanced) - good compromise between RAM usage and performance
pref('midori.memory.profile', 2);

// Enable tab unloading when system memory is low
pref('browser.tabs.unloadOnLowMemory', true);

// Keep native inactivity unloading aligned with Midori tab sleep defaults.
pref('browser.tabs.min_inactive_duration_before_unload', 600000);

// Automatically discard inactive tabs after 10 minutes by default.
pref('midori.tabsleep.enabled', true);
pref('midori.tabsleep.timeoutMinutes', 10);
pref('midori.tabsleep.excludeHosts', '');

// Fork server for Linux - enables copy-on-write memory sharing
pref('dom.ipc.forkserver.enable', true);

// ============================================================================
// MIDORI MOD BLUR CHROME
// ============================================================================
// Midori owns chrome styling through bundled CSS instead of WebExtension themes.
pref('extensions.activeThemeID', 'default-theme@mozilla.org');
pref('midori.colorway', 'jade');

// Firefox-Mod-Blur inspired modules, recolored for Midori. Heavy blur and
// autohide-like behavior stays opt-in to avoid navigation stalls.
pref('midori.modblur.windowControls.macStyle', false);
pref('midori.modblur.bookmarks.popout', false);
pref('midori.modblur.bookmarks.clean', true);
pref('midori.modblur.privacy.blurIdentity', true);
pref('midori.modblur.extensions.cleanMenu', true);
pref('midori.modblur.extensions.hideManageButton', false);
pref('midori.modblur.icons.mainMenu', true);
pref('midori.modblur.verticalTabs.compact', false);
pref('midori.modblur.verticalTabs.hideScrollbar', false);
pref('midori.modblur.tabs.centered', false);
pref('midori.modblur.tabs.hidePreviewPanel', false);
pref('midori.modblur.tabs.onTop', false);
pref('midori.modblur.tabs.activeStaticWidth', true);
pref('midori.modblur.tabs.soundColor', true);
pref('midori.modblur.tabs.hideAllTabsButton', false);
pref('midori.modblur.window.frame', false);
pref('midori.modblur.search.focusOutline', true);
pref('midori.modblur.search.buttonsAlways', false);
pref('midori.modblur.search.popoutBlur', false);
pref('midori.modblur.blur.extra', false);
pref('midori.modblur.blur.acrylic', false);
pref('midori.modblur.newtab.hideShortcutTitles', false);
pref('midori.modblur.newtab.centerWidgets', false);
pref('midori.modblur.newtab.circularShortcuts', false);
pref('midori.modblur.newtab.wallpaperBlur', false);
pref('midori.modblur.theme.spill', false);
pref('midori.modblur.theme.card', false);
pref('midori.modblur.theme.softTexture', true);
pref('midori.arcmode.enabled', false);

// GPU-accelerated rendering for smooth UI
pref('gfx.webrender.all', true);

pref('toolkit.legacyUserProfileCustomizations.stylesheets', true);

// ============================================================================
// MIDORI CUSTOM GRADIENT SYSTEM
// ============================================================================
// Legacy gradient prefs stay disabled so old profiles do not enable them during migration.
pref('midori.gradient.enabled', false);
pref('midori.gradient.type', 'linear');
pref('midori.gradient.angle', 135);
pref('midori.gradient.stops', '[{"color":"#2d8659","position":0},{"color":"#1a5c3a","position":100}]');
pref('midori.gradient.texture', 'none');
pref('midori.gradient.texture.opacity', 50);

pref('network.predictor.enable-hover-on-ssl', true);
pref('pdfjs.enableScripting', false);
pref('pdfjs.enableHighlightEditor', true);
pref('browser.urlbar.trending.featureGate', false);
pref('browser.urlbar.weather.featureGate', false);
pref('browser.urlbar.quickactions.enabled', true);
pref('browser.urlbar.clipboard.featureGate', true);
pref('browser.urlbar.trimHttps', true);
pref('browser.urlbar.untrimOnUserInteraction.featureGate', true);
pref('browser.search.suggest.enabled', false);
pref('browser.urlbar.keepPanelOpenDuringImeComposition', true);
pref('browser.formfill.enable', false);
pref('browser.urlbar.closeOnWindowBlur', false);
pref('browser.urlbar.trustPanel.featureGate', false);
pref('browser.tabs.hoverPreview.enabled', false);
pref('widget.non-native-theme.scrollbar.style', 2);
pref('browser.tabs.closeWindowWithLastTab', false);
pref(' browser.settings-redesign.enabled', true);
pref('browser.privatebrowsing.resetPBM.enabled', false);

// ============================================================================
// MIDORI VERTICAL TABS (Natsumi-style)
// ============================================================================
// Enable Natsumi-inspired vertical tab layout with floating URL bar, rounded
// content area, and modern sidebar. When disabled, horizontal tabs are used
// with light visual refinements.
pref('midori.verticaltabs.enabled', false);
pref('midori.verticaltabs.position', 'left');
pref('midori.verticaltabs.width', 248);
pref('midori.verticaltabs.density', 'normal');
pref('midori.verticaltabs.compact', false);
// Collapse the vertical sidebar to a narrow icon rail that expands on hover
// (pure-CSS edge sensor, no global mousemove). Off by default.
pref('midori.verticaltabs.collapse', false);
pref('midori.verticaltabs.floatingUrlbar', true);
pref('midori.verticaltabs.showRail', true);
pref('midori.verticaltabs.showPinnedSection', true);
pref('midori.verticaltabs.essentials.enabled', true);
pref('midori.verticaltabs.essentials.max', 4);
pref('midori.verticaltabs.essentialsPromo', true);
pref('midori.verticaltabs.urlbar.autoSelect', true);
pref('midori.verticaltabs.accent.mode', 'workspace');
pref('midori.verticaltabs.accent.custom', '#2d8659');
pref('midori.horizontaltabs.position', 'top');

pref('midori.msidebar.enabled', true);
pref('midori.msidebar.position', 'left');
pref('midori.msidebar.width', 400);
pref('midori.msidebar.autohide.enabled', false);
pref('midori.msidebar.autohide.mode', 'overlay');
pref('midori.msidebar.animations.enabled', true);
pref('midori.msidebar.debug', false);
pref('midori.msidebar.hidePanelWhenHidden', true);
pref('midori.msidebar.newPanelButton.position', 'before');
pref('midori.msidebar.geometryHint.enabled', true);
pref('midori.msidebar.containerIndicator', 'left');
pref('midori.msidebar.tooltip.mode', 'title-url');
pref('midori.msidebar.tooltip.fullUrl', false);
pref('midori.msidebar.webPanelToolbar.autohide', true);
pref('midori.msidebar.webPanelToolbar.autohideBack', true);
pref('midori.msidebar.webPanelToolbar.autohideForward', true);
pref('midori.msidebar.shortcut.toggleSidebar', 'Ctrl+Alt+S');
pref('midori.msidebar.shortcut.togglePanel', '');

pref('midori.shortcuts.general.openCenter', 'Ctrl+Alt+M');
pref('midori.shortcuts.tabs.toggleVertical', 'Ctrl+Alt+V');
pref('midori.workspaces.shortcut.previous', 'Ctrl+Alt+Q');
pref('midori.workspaces.shortcut.next', 'Ctrl+Alt+E');
pref('midori.workspaces.shortcut.switch1', '');
pref('midori.workspaces.shortcut.switch2', '');
pref('midori.workspaces.shortcut.switch3', '');
pref('midori.workspaces.shortcut.switch4', '');
pref('midori.workspaces.shortcut.switch5', '');
pref('midori.workspaces.shortcut.switch6', '');
pref('midori.workspaces.shortcut.switch7', '');
pref('midori.workspaces.shortcut.switch8', '');
pref('midori.workspaces.shortcut.switch9', '');

pref('sidebar.revamp', false);
pref('sidebar.verticalTabs', false);
pref('sidebar.visibility', 'hide');

// ============================================================================
// MIDORI AUTO-HIDE TOOLBAR
// ============================================================================
// Hide the toolbar when scrolling down to maximize content area
// The toolbar reappears when scrolling up or moving the mouse to the top
pref('midori.autohide.toolbar', false);
// Briefly reveal the hidden toolbar on navigation so the new address is
// readable, then auto-hide again (Zen-style compact flash).
pref('midori.autohide.flashOnLocationChange', true);
pref('midori.autohide.flashDurationMs', 1200);

// ============================================================================
// MIDORI PRIVACY (replaces Firefox Enhanced Tracking Protection)
// ============================================================================
// Disable Firefox's built-in tracking protection UI - midori-privacy extension
// handles all content blocking and ad filtering.
pref('privacy.trackingprotection.enabled', false);
pref('privacy.trackingprotection.pbmode.enabled', false);
pref('browser.contentblocking.category', 'custom');
pref('browser.protections_panel.enabled', false);

// ============================================================================
// MIDORI TOR INTEGRATION
// ============================================================================
// Embedded Tor proxy for private browsing with network anonymity.
// When enabled, users can open "Tor Windows" (private + SOCKS5 via Tor).
pref('midori.tor.enabled', true);
pref('midori.tor.socks_port', 9150);
pref('midori.tor.bridges.enabled', false);
pref('midori.tor.bridges.list', '');
pref('midori.tor.binary_path', '');
pref('midori.tor.prewarm.enabled', false);
pref('midori.tor.prewarm.idle_timeout_ms', 10000);
pref('midori.tor.bootstrap_timeout_ms', 300000);
pref('midori.tor.stop_after_last_window_ms', 15000);

// ============================================================================
// DISABLE POCKET (reinforce)
// ============================================================================
pref('extensions.pocket.enabled', false, locked);
pref('extensions.pocket.api', '', locked);
pref('extensions.pocket.oAuthConsumerKey', '', locked);
pref('extensions.pocket.site', '', locked);
pref('extensions.pocket.showHome', false, locked);

// ============================================================================
// DISABLE TELEMETRY, DATA REPORTING & CRASH REPORTER
// ============================================================================
// (Securefox.js handles most, but we reinforce with locked prefs)
pref('datareporting.policy.dataSubmissionEnabled', false, locked);
pref('datareporting.healthreport.uploadEnabled', false, locked);
pref('datareporting.usage.uploadEnabled', false, locked);
pref('toolkit.telemetry.unified', false, locked);
pref('toolkit.telemetry.enabled', false, locked);
pref('toolkit.telemetry.server', 'data:,', locked);
pref('toolkit.telemetry.archive.enabled', false, locked);
pref('toolkit.telemetry.newProfilePing.enabled', false, locked);
pref('toolkit.telemetry.shutdownPingSender.enabled', false, locked);
pref('toolkit.telemetry.updatePing.enabled', false, locked);
pref('toolkit.telemetry.bhrPing.enabled', false, locked);
pref('toolkit.telemetry.firstShutdownPing.enabled', false, locked);
pref('toolkit.telemetry.dap_enabled', false, locked);
pref('toolkit.telemetry.coverage.opt-out', true, locked);
pref('toolkit.coverage.opt-out', true, locked);
pref('toolkit.coverage.endpoint.base', '', locked);
pref('browser.newtabpage.activity-stream.feeds.telemetry', false, locked);
pref('browser.newtabpage.activity-stream.telemetry', false, locked);
pref('breakpad.reportURL', '', locked);
pref('browser.tabs.crashReporting.sendReport', false, locked);
pref('browser.crashReports.unsubmittedCheck.autoSubmit2', false, locked);
// Privacy-Preserving Attribution
pref('dom.private-attribution.submission.enabled', false, locked);
// SERP telemetry
pref('browser.search.serpEventTelemetryCategorization.enabled', false, locked);
// Assorted telemetry
pref('dom.security.unexpected_system_load_telemetry_enabled', false, locked);
pref('network.trr.confirmation_telemetry_enabled', false, locked);
pref('security.app_menu.recordEventTelemetry', false, locked);
pref('security.certerrors.recordEventTelemetry', false, locked);
pref('security.protectionspopup.recordEventTelemetry', false, locked);
pref('privacy.trackingprotection.emailtracking.data_collection.enabled', false, locked);

// ============================================================================
// DISABLE FIREFOX SUGGEST & MOZILLA AI FEATURES
// ============================================================================
pref('browser.urlbar.quicksuggest.enabled', false);
pref('browser.urlbar.suggest.quicksuggest.sponsored', false);
pref('browser.urlbar.suggest.quicksuggest.nonsponsored', false);
pref('browser.urlbar.groupLabels.enabled', false);
pref('browser.ml.enable', false);
pref('browser.ml.chat.enabled', false);
pref('browser.ml.chat.menu', false);
pref('browser.preferences.aiControls', true);

// ============================================================================
// DISABLE MOZILLA VPN INTEGRATION
// ============================================================================
pref('browser.vpn_promo.enabled', false, locked);
pref('browser.contentblocking.report.hide_vpn_banner', true, locked);
pref('browser.contentblocking.report.vpn_platforms', '', locked);
pref('browser.contentblocking.report.vpn-promo.url', '', locked);
pref('browser.contentblocking.report.vpn-android.url', '', locked);
pref('browser.contentblocking.report.vpn-ios.url', '', locked);
pref('browser.privatebrowsing.vpnpromourl', '', locked);
pref('privacy.globalprivacycontrol.enabled', true);

// ============================================================================
// DISABLE FIREFOX RELAY & FIREFOX ACCOUNTS
// ============================================================================
pref('identity.fxaccounts.commands.enabled', false, locked);
pref('identity.fxaccounts.pairing.enabled', false, locked);
pref('identity.fxaccounts.toolbar.enabled', false, locked);
pref('identity.fxaccounts.toolbar.accessed', false, locked);
pref('signon.firefoxRelay.feature', '', locked);
pref('signon.firefoxRelay.base_url', '', locked);

// ============================================================================
// MIDORI APP UPDATES
// ============================================================================
// Keep background update surfaces off, but allow manual checks to use the host
// defined at build time in application.ini (MOZ_APPUPDATE_HOST).
pref('app.update.enabled', true, locked);
pref('app.update.auto', false, locked);
pref('app.update.staging.enabled', true, locked);
pref('app.update.background.scheduling.enabled', false, locked);
pref('app.update.BITS.enabled', false, locked);
pref('app.update.service.enabled', true, locked);
pref('app.update.silent', false, locked);
pref('app.update.checkInstallTime', false, locked);
pref('app.update.notifyDuringDownload', false, locked);
// Keep extension auto-updates working (silent, no doorhanger). System
// add-ons ship security fixes; lock the flag so users/profiles can't flip
// it and trigger an unexpected "update available" toast.
pref('extensions.update.autoUpdateDefault', true);
pref('extensions.systemAddon.update.enabled', true, locked);
pref('extensions.getAddons.cache.enabled', false, locked);

// ============================================================================
// DISABLE STUDIES & REMOTE EXPERIMENTS (SHIELD / NORMANDY)
// ============================================================================
pref('app.shield.optoutstudies.enabled', false, locked);
pref('app.normandy.enabled', false, locked);
pref('app.normandy.api_url', '', locked);
pref('app.normandy.first_run', false, locked);
pref('messaging-system.rsexperimentloader.enabled', false, locked);

// ============================================================================
// DISABLE FIREFOX LABS
// ============================================================================
pref('browser.preferences.experimental', false);
pref('browser.preferences.experimental.hidden', true);

// ============================================================================
// OUTBOUND CONNECTION AUDIT — block unnecessary Mozilla connections
// ============================================================================
// Disable captive portal detection (phones home to Mozilla)
pref('network.captive-portal-service.enabled', false, locked);
pref('captivedetect.canonicalURL', '', locked);
// Disable network connectivity checks
pref('network.connectivity-service.enabled', false, locked);
// Disable DoH rollout heuristics
pref('doh-rollout.disable-heuristics', true, locked);
// Disable region updates
pref('browser.region.update.enabled', false, locked);
pref('browser.region.network.url', '', locked);
// Disable default browser agent reporting (Windows)
pref('default-browser-agent.enabled', false, locked);
// Disable extension abuse reports to Mozilla
pref('extensions.abuseReport.enabled', false, locked);
// Disable remote recipe fetching for sign-on
pref('signon.recipes.remoteRecipes.enabled', false, locked);
// Disable push notifications service (Mozilla servers)
pref('dom.push.serverURL', '', locked);
// Disable What's New panel
pref('browser.messaging-system.whatsNewPanel.enabled', false, locked);
// Disable Contextual Feature Recommender (reinforce Peskyfox)
pref('browser.newtabpage.activity-stream.asrouter.userprefs.cfr.addons', false, locked);
pref('browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features', false, locked);
// Disable Focus promo
pref('browser.promo.focus.enabled', false, locked);
// Disable Mozilla recommendations
pref('browser.discovery.enabled', false, locked);
pref('extensions.htmlaboutaddons.recommendations.enabled', false, locked);
pref('extensions.getAddons.showPane', false, locked);

// ============================================================================
// PDF VIEWER STABILITY
// ============================================================================
// pdf.js runs as a chrome/resource script. On constrained systems (and under
// the lowMemory profile where content processes are limited to 1), rendering
// large PDFs can exceed the default slow-script timeout, causing the viewer
// to be killed repeatedly and the tab to be torn down. Bumping these values
// gives the viewer enough head-room to finish rendering.
pref('dom.max_chrome_script_run_time', 60);
pref('dom.max_ext_content_script_run_time', 30);
