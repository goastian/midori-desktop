#filter dumbComments emptyLines substitution

// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

#ifdef XP_UNIX
  #ifndef XP_MACOSX
    #define UNIX_BUT_NOT_MAC
  #endif
#endif

/*----------------------------------------------------- Floorp 専用の pref 設定 ----------------------------------------------------*/
//Floorpアップデートの最新版である旨の通知を許可
pref("enable.floorp.updater.latest", false);
pref("enable.floorp.update", true);

pref("floorp.chrome.theme.mode", -1);

//ブラウザーUIのカスタマイズ設定
pref("floorp.bookmarks.bar.focus.mode", false);//フォーカスした際にブックマークバーを展開
pref("floorp.disable.fullscreen.notification", false);//フルスクリーン通知を無効化
pref("floorp.navbar.bottom", false);
pref("floorp.tabs.showPinnedTabsTitle", false); //ピン留めされたタブのタイトルを表示
pref("floorp.delete.browser.border", false); //ブラウザーの枠線削除＆丸くする
pref("floorp.browser.tabs.tabMinHeight", 30); //タブの高さ

pref("floorp.browser.user.interface", 3);// Floorp 10 系以降のインターフェーステーマ設定
pref("floorp.browser.tabbar.settings", 0);// タブの設定
pref("floorp.tabscroll.reverse",false);
pref("floorp.tabscroll.wrap",false);

pref("floorp.enable.auto.restart", false);

pref("browser.disable.nt.image.gb", false);// 画像を表示しない

pref("floorp.enable.dualtheme", false); //デュアルテーマの有効・無効 
pref("floorp.dualtheme.theme", "[]"); //デュアルテーマのリスト

pref("floorp.download.notification", 4); //ダウンロード通知


//新しいタブの検索を「ウェブを検索」に変更
pref("browser.newtabpage.activity-stream.improvesearch.handoffToAwesomebar", false);
//新しいタブの背景の設定
pref("browser.newtabpage.activity-stream.floorp.background.type", 1);
pref("browser.newtabpage.activity-stream.floorp.background.images.folder", "");
pref("browser.newtabpage.activity-stream.floorp.background.image.path", "");
pref("browser.newtabpage.activity-stream.floorp.background.images.extensions", "png,jpg,jpeg,webp,gif,svg,tiff,tif,bmp,avif,jxl");
pref("browser.newtabpage.activity-stream.floorp.newtab.backdrop.blur.disable",false);
pref("browser.newtabpage.activity-stream.floorp.newtab.releasenote.hide",false);
pref("browser.newtabpage.activity-stream.floorp.newtab.imagecredit.hide",false);

pref("floorp.multitab.bottommode", false);

pref("browser.display.statusbar", false);


pref("floorp.browser.sidebar.right", false);// サイドバーの右側を表示
pref("floorp.browser.sidebar.enable", true);// サイドバーを表示

// url:URL width:幅 userAgent:userAgent usercontext:コンテナタブ
pref("floorp.browser.sidebar2.data", '{"data":{},"index":[]}');
pref("floorp.extensions.webextensions.sidebar-action", '{"data":{}}');
pref("floorp.browser.sidebar2.addons.enabled", true);
pref("floorp.browser.sidebar2.hide.to.unload.panel.enabled", false);

pref("floorp.browser.sidebar2.global.webpanel.width", 400);

pref("floorp.tabsleep.enabled", true);
pref("floorp.webcompat.enabled", true);
pref("floorp.openLinkInExternal.enabled", false);
pref("floorp.openLinkInExternal.browserId", "");

// システムアドオンのアップデート確認先
pref("extensions.systemAddon.update.url", "https://update.astian.org/systemAddon/xml/%DISPLAY_VERSION%/%OS%/update.xml");

// 言語設定をシステムに合わせる
pref("intl.locale.requested", "");

pref("app.feedback.baseURL", "https://astian.org/feedback/");

// 多段タブ
pref("floorp.tabbar.style",0);
pref("floorp.browser.tabs.verticaltab", false);
pref("floorp.verticaltab.show.newtab.button" , false);
pref("floorp.enable.multitab", false);
pref("floorp.browser.tabbar.multirow.max.enabled", true);
pref("floorp.browser.tabbar.multirow.newtab-inside.enabled", false);
pref("floorp.browser.tabbar.multirow.max.row", 3);


//新規タブの開く位置
pref("floorp.browser.tabs.openNewTabPosition", -1);

//ネイティブ実装垂直タブ
pref("floorp.browser.native.verticaltabs.enabled", false);
pref("floorp.verticaltab.hover.enabled", false);
pref("floorp.browser.tabs.verticaltab.right", true);
pref("floorp.browser.tabs.verticaltab.temporary.disabled", false);
pref("floorp.browser.tabs.verticaltab.width", 200);
pref("floorp.verticaltab.paddingtop.enabled", false);

// Chrome 形式のダウンローダー
pref("floorp.browser.native.downloadbar.enabled", false);

//ワークスペース
pref("floorp.browser.workspace.tabs.state", "[]");
pref("floorp.browser.workspace.current", "");
pref("floorp.browser.workspace.all", "");
pref("floorp.browser.workspace.tab.enabled", false);
pref("floorp.browser.workspace.info", "[]");
pref("floorp.browser.workspace.changeWorkspaceWithDefaultKey", true);
pref("floorp.browser.workspace.backuped", false);
pref("floorp.browser.workspace.container.userContextId", 0);
//temp
pref("floorp.browser.workspaces.disabledBySystem", true);

//タブバーの背景色
pref("floorp.titlebar.favicon.color", false);

// カスタムショートカットキー
pref("floorp.custom.shortcutkeysAndActions", '[{"actionName":"togglePanel","key":"","keyCode":"VK_F2","modifiers":""}]');
pref("floorp.custom.shortcutkeysAndActions.enabled", true);
pref("floorp.custom.shortcutkeysAndActions.remove.fx.actions", false);

// カスタムアクション用
pref("floorp.custom.shortcutkeysAndActions.customAction1", "");
pref("floorp.custom.shortcutkeysAndActions.customAction2", "");
pref("floorp.custom.shortcutkeysAndActions.customAction3", "");
pref("floorp.custom.shortcutkeysAndActions.customAction4", "");
pref("floorp.custom.shortcutkeysAndActions.customAction5", "");

// Profile Manager
pref("floorp.browser.profile-manager.enabled", false);

// [実験] 新しいタブのオーバーライド
pref("floorp.newtab.overrides.newtaburl", "");

// Split View
pref("floorp.browser.splitView.working", false);
pref("floorp.browser.splitView.width", 0);

// user.js
pref("floorp.user.js.customize", "");

// Web apps support
#ifdef XP_WIN
pref("floorp.browser.ssb.enabled", true);
#else
pref("floorp.browser.ssb.enabled", false);
#endif

// Workspace
pref("floorp.browser.workspaces.enabled", true);
pref("floorp.browser.workspace.manageOnBMS", false);
pref("floorp.browser.workspace.closePopupAfterClick", false);
pref("floorp.browser.workspace.showWorkspaceName", true);

// Extension
pref("floorp.extensions.allowPrivateBrowsingByDefault.is.enabled", false);

// AstianGO Search
pref("floorp.browser.floorpSearch.enabled", false);

/*----------------------------------------------------------------------------------------------------------------------------------*/

//ブックマークツールバー
pref("browser.toolbars.bookmarks.visibility", "always");

//検索エンジン
pref("browser.search.separatePrivateDefault", true);
pref("browser.search.separatePrivateDefault.ui.enabled", true);
pref("browser.urlbar.update2.engineAliasRefresh", true);
pref("devtools.debugger.prompt-connection", false);

//個人設定の同期無効
pref("services.sync.engine.prefs", false); // Never sync prefs, addons, or tabs with other browsers
pref("services.sync.prefs.sync.browser.newtabpage.activity-stream.feeds.snippets", false, locked);
pref("services.sync.prefs.sync.browser.newtabpage.activity-stream.showSponsored", false, locked);
pref("services.sync.prefs.sync.browser.newtabpage.activity-stream.showSponsoredTopSites", false, locked);
pref("services.sync.telemetry.maxPayloadCount", "0", locked);
pref("services.sync.telemetry.submissionInterval", "0", locked);
pref("services.sync.prefs.sync.browser.startup.page", false, locked); // Firefox の自動復元機能を Firefox Sync で同期しないようにします。
pref("services.sync.prefs.sync.browser.tabs.warnOnClose", false, locked); //たくさんのタブを閉じようとした際の警告表示を Firefox Sync で同期しないようにします。

// 同期を有効にする
pref("services.sync.prefs.sync.floorp.browser.sidebar.right", true);// サイドバーの右側を表示
pref("services.sync.prefs.sync.floorp.optimized.verticaltab", true); //ツリー型垂直タブ等に最適化。8.7.2 からフォーカスした際の動作は別に
pref("services.sync.prefs.sync.floorp.browser.user.interface", true);// Floorp 10 系以降のインターフェーステーマ設定

pref("toolkit.legacyUserProfileCustomizations.stylesheets" ,true);

pref("browser.preferences.moreFromMozilla", false, locked);

//たくさん閉じようとしたときに警告
pref("browser.tabs.warnOnClose", true);
pref("browser.tabs.warnOnCloseOtherTabs", true);

//addon推奨プロンプトを消す
pref("extensions.getAddons.showPane", false);

//調査と思われるものを削除。Torでは削除済み。
pref("app.normandy.api_url", "");
pref("app.normandy.enabled", true);

//SVG avif jxl 画像ファイルをの互換性向上または、既定で開けるように
pref("svg.context-properties.content.enabled", true, locked);
pref("image.avif.enabled", true, locked);
pref("image.jxl.enabled", true, locked);

// Add-On のブラックリストをFloorpが参照する際の情報漏洩削減
pref("extensions.blocklist.url", "https://blocklist.addons.mozilla.org/blocklist/3/%APP_ID%/%APP_VERSION%/");

//ブラックリストの参照の有効化
pref("extensions.blocklist.enabled", true);
pref("services.blocklist.update_enabled",	true);

//Pocket機能を無効化*/
pref("extensions.pocket.enabled", false);

// Disable ads

pref("browser.vpn_promo.enabled", false)
pref("browser.contentblocking.report.show_mobile_app", false)

pref("network.trr.mode", 2);
pref("network.trr.uri", "https://dns.nextdns.io/fc53cb/");

//クラッシュレポートを無効化
pref("breakpad.reportURL", "", locked);
pref("browser.tabs.crashReporting.sendReport", false);
pref("browser.crashReports.unsubmittedCheck.enabled",	false);

//野良アドオンのインストールを許可。
pref("xpinstall.signatures.required", false);

// Firefox による、Mozilla へのテレメトリー送信を無効化
pref("toolkit.telemetry.archive.enabled", false, locked);
pref("toolkit.telemetry.bhrPing.enabled", false, locked);
pref("toolkit.telemetry.enabled", false, locked);
pref("toolkit.telemetry.firstShutdownPing.enabled", false, locked);
pref("toolkit.telemetry.geckoview.streaming", false, locked);
pref("toolkit.telemetry.newProfilePing.enabled", false, locked);
pref("toolkit.telemetry.pioneer-new-studies-available", false, locked);
pref("toolkit.telemetry.reportingpolicy.firstRun", false, locked);
pref("toolkit.telemetry.server", "", locked);
pref("toolkit.telemetry.shutdownPingSender.enabled", false, locked);
pref("toolkit.telemetry.shutdownPingSender.enabledFirstSession", false, locked);
pref("toolkit.telemetry.testing.overrideProductsCheck", false, locked);
pref("toolkit.telemetry.unified", false, locked);
pref("toolkit.telemetry.updatePing.enabled", false, locked);
pref("dom.private-attribution.submission.enabled", false, locked);

//Firefox調査を無効化
pref("app.shield.optoutstudies.enabled", false, locked);

//拡張機能の推奨を削除
pref("browser.discovery.enabled", false);

//クラッシュレポートの自動送信無効
pref("browser.crashReports.unsubmittedCheck.autoSubmit2", false);

//http 通信時、Floorp は絶対にhttp:// をURLバーから隠しません
pref("browser.urlbar.trimURLs", false);

//プライバシー機能をオンにし、テレメトリー採取を無効化します。
pref("privacy.trackingprotection.origin_telemetry.enabled", false, locked);
pref("privacy.userContext.enabled", true);
pref("privacy.userContext.ui.enabled", true);
pref("trailhead.firstrun.branches", "", locked);
pref("extensions.webcompat-reporter.enabled", false);

pref("browser.startup.page", 3);//自動復元

// https://developer.mozilla.org/docs/Web/API/Navigator/share
#ifdef XP_WIN
pref("dom.webshare.enabled", true);
#endif

// 開発者ツールの位置を「右」に変更
pref("devtools.toolbox.host", "right");


// Smooth Scroll by Betterfox
#ifdef XP_MACOSX
// macOS version should not change the value
#else
pref("apz.overscroll.enabled", true);
pref("general.smoothScroll", true);
pref("general.smoothScroll.msdPhysics.enabled", true);
pref("general.smoothScroll.currentVelocityWeighting", "0.15");
pref("general.smoothScroll.stopDecelerationWeighting", "0.6");
pref("mousewheel.min_line_scroll_amount", 10);
pref("general.smoothScroll.mouseWheel.durationMinMS", 80);
pref("general.smoothScroll.msdPhysics.continuousMotionMaxDeltaMS", 12);
pref("general.smoothScroll.msdPhysics.motionBeginSpringConstant", 600);
pref("general.smoothScroll.msdPhysics.regularSpringConstant", 650);
pref("general.smoothScroll.msdPhysics.slowdownMinDeltaMS", 25);
pref("general.smoothScroll.msdPhysics.slowdownSpringConstant", 250);
pref("mousewheel.default.delta_multiplier_y", 300);
#endif

// Lepton
pref("userContent.page.dark_mode", true);

/*-----------------------------------------------------------------------------------all.js の設定-----------------------------------------------------------------------------------*/

pref("extensions.htmlaboutaddons.recommendations.enabled", false, locked);
pref("datareporting.policy.dataSubmissionEnable", false, locked);
pref("datareporting.healthreport.uploadEnabled", false, locked);

/*-----------------------------------------------------------------------------以下、Photon の既定の設定-----------------------------------------------------------------------------*/
//Floorp

// 1 = photon, 2 = lepton, 3 = proton fix
pref("floorp.lepton.interface", 2);


// v8.6.2 Lepton
// ** Theme Default Options ****************************************************
// userchrome.css usercontent.css activate
pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);

// Fill SVG Color
pref("svg.context-properties.content.enabled", true);

// Restore Compact Mode - 89 Above
pref("browser.compactmode.show", true);

// about:home Search Bar - 89 Above
pref("browser.newtabpage.activity-stream.improvesearch.handoffToAwesomebar", false);

// CSS's `:has()` selector #457 - 103 Above
pref("layout.css.has-selector.enabled", true);

// Browser Theme Based Scheme - Will be activate 95 Above
// pref("layout.css.prefers-color-scheme.content-override", 3);

// ** Theme Related Options ****************************************************
// == Theme Distribution Settings ==============================================
// The rows that are located continuously must be changed `true`/`false` explicitly because there is a collision.
// https://github.com/black7375/Firefox-UI-Fix/wiki/Options#important
pref("userChrome.tab.connect_to_window",          true); // Original, Photon
pref("userChrome.tab.color_like_toolbar",         true); // Original, Photon

pref("userChrome.tab.lepton_like_padding",        true); // Original
pref("userChrome.tab.photon_like_padding",       false); // Photon

pref("userChrome.tab.dynamic_separator",          true); // Original, Proton
pref("userChrome.tab.static_separator",          false); // Photon
pref("userChrome.tab.static_separator.selected_accent", false); // Just option
pref("userChrome.tab.bar_separator",             false); // Just option

pref("userChrome.tab.newtab_button_like_tab",     true); // Original
pref("userChrome.tab.newtab_button_smaller",     false); // Photon
pref("userChrome.tab.newtab_button_proton",      false); // Proton

pref("userChrome.icon.panel_full",                true); // Original, Proton
pref("userChrome.icon.panel_photon",             false); // Photon

// Original Only
pref("userChrome.tab.box_shadow",                 true);
pref("userChrome.tab.bottom_rounded_corner",      true);

// Photon Only
pref("userChrome.tab.photon_like_contextline",   false);
pref("userChrome.rounding.square_tab",           false);

pref("userChrome.compatibility.theme",       true);
pref("userChrome.compatibility.os",          true);

pref("userChrome.theme.built_in_contrast",   true);
pref("userChrome.theme.system_default",      true);
pref("userChrome.theme.proton_color",        true);
pref("userChrome.theme.proton_chrome",       true); // Need proton_color
pref("userChrome.theme.fully_color",         true); // Need proton_color
pref("userChrome.theme.fully_dark",          true); // Need proton_color

pref("userChrome.decoration.cursor",         true);
pref("userChrome.decoration.field_border",   true);
pref("userChrome.decoration.download_panel", true);
pref("userChrome.decoration.animate",        true);

pref("userChrome.padding.tabbar_width",      true);
pref("userChrome.padding.tabbar_height",     true);
pref("userChrome.padding.toolbar_button",    true);
pref("userChrome.padding.navbar_width",      true);
pref("userChrome.padding.urlbar",            true);
pref("userChrome.padding.bookmarkbar",       true);
pref("userChrome.padding.infobar",           true);
pref("userChrome.padding.menu",              true);
pref("userChrome.padding.bookmark_menu",     true);
pref("userChrome.padding.global_menubar",    true);
pref("userChrome.padding.panel",             true);
pref("userChrome.padding.popup_panel",       true);

pref("userChrome.tab.multi_selected",        true);
pref("userChrome.tab.unloaded",              true);
pref("userChrome.tab.letters_cleary",        true);
pref("userChrome.tab.close_button_at_hover", true);
pref("userChrome.tab.sound_hide_label",      true);
pref("userChrome.tab.sound_with_favicons",   true);
pref("userChrome.tab.pip",                   true);
pref("userChrome.tab.container",             true);
pref("userChrome.tab.crashed",               true);

pref("userChrome.fullscreen.overlap",        true);
pref("userChrome.fullscreen.show_bookmarkbar", true);

pref("userChrome.icon.library",              true);
pref("userChrome.icon.panel",                true);
pref("userChrome.icon.menu",                 true);
pref("userChrome.icon.context_menu",         true);
pref("userChrome.icon.global_menu",          true);
pref("userChrome.icon.global_menubar",       true);
pref("userChrome.icon.1-25px_stroke",        true);

// -- User Content -------------------------------------------------------------
pref("userContent.player.ui",             true);
pref("userContent.player.icon",           true);
pref("userContent.player.noaudio",        true);
pref("userContent.player.size",           true);
pref("userContent.player.click_to_play",  true);
pref("userContent.player.animate",        true);

pref("userContent.newTab.full_icon",      true);
pref("userContent.newTab.animate",        true);
pref("userContent.newTab.pocket_to_last", true);
pref("userContent.newTab.searchbar",      true);

pref("userContent.page.field_border",     true);
pref("userContent.page.illustration",     true);
pref("userContent.page.proton_color",     true);
pref("userContent.page.dark_mode",        true); // Need proton_color
pref("userContent.page.proton",           true); // Need proton_color

// ** Useful Options ***********************************************************
// Tab preview
// https://blog.nightly.mozilla.org/2024/02/06/a-preview-of-tab-previews-these-weeks-in-firefox-issue-153/
pref("browser.tabs.cardPreview.enabled",   true);

// Paste suggestion at urlbar
// https://blog.nightly.mozilla.org/2023/12/04/url-gonna-want-to-check-this-out-these-weeks-in-firefox-issue-150/
pref("browser.urlbar.clipboard.featureGate", true);

// Integrated calculator at urlbar
pref("browser.urlbar.suggest.calculator", true);
