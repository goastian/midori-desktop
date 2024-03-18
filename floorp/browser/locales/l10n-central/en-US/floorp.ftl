# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

###################################################################### about:Dialog #################################################################################

about-floorp = <label data-l10n-name="floorp-browser-link">{ -brand-product-name }</label> It is a light, fast and secure browser committed to the privacy and security of users. <label data-l10n-name="ablaze-Link">{ -vendor-short-name }</label>, to improve the web. Want to help? <label data-l10n-name="helpus-donateLink">Make a donation</label>
icon-creator = Icon creator <label data-l10n-name="browser-logo-twitter">@CutterKnife_</label> and <label data-l10n-name="brand-logo-twitter">@mwxdxx.</label>
contributors = A list of <label data-l10n-name="about-contributor">contributors and Developers</label>

#################################################################### about:preferences ####################################################################

pane-design-title = Design
category-design =
    .tooltiptext = { pane-design-title }
design-header = { pane-design-title }

feature-requires-restart = A restart is required to apply changes

tab-width = Minimum width of tabs
preferences-tabs-newtab-position = New tab position
open-new-tab-use-default =
 .label = Open new tabs at default position
open-new-tab-at-the-end =
 .label = Open new tabs at the end of the Tab Bar
open-new-tab-next-to-current =
 .label = Open new tabs next to the current tab
multirow-tabs-limit = 
 .label = Enable row limit for multi-row tabs
multirow-tabs-newtab =
 .label = Place the "Open a new tab" button at the end of the lowest row of tabs
multirow-tabs-value = Number of rows when multi-row tabs are enabled
enable-tab-sleep = 
 .label = Enable Sleeping Tabs
tab-sleep-timeout-minutes-value = Tabs will sleep after being inactive for (minutes)
tab-sleep-settings-button = Settings...
tab-sleep-settings-dialog-title =
 .title = Sleeping Tabs Settings
tab-sleep-settings-dialog-excludehosts-label = Exclude hosts
tab-sleep-settings-dialog-excludehosts-label-2 = Enter one host per line.
tab-sleep-tab-context-menu-excludetab = Keep tab awake
enable-tab-scroll-change =
 .label = Switch tabs by scrolling with your mouse
enable-tab-scroll-reverse =
 .label = Reverse direction of scrolling tabs
enable-tab-scroll-wrap =
 .label = Wrap scrolling tabs at the edge
enable-double-click-block =
 .label = Close tabs with a double click
enable-show-pinned-tabs-title =
 .label = Show the title of pinned tabs

tabbar-preference = Tab Bar

tab-normal-mode = 
 .label= Default

hide-horizontality-tabs =
 .label= Hide tabs on Horizontal Tab Bar

verticalTab-setting =
 .label = Optimise browser for Vertical Tab Bar

move-tabbar-position =
 .label = Display Tab Bar underneath the Toolbar

tabbar-on-bottom =
 .label = Display Tab Bar at the bottom of the window

tabbar-favicon-color =
 .label = Color the Tab Bar using the current website's favicon color

tabbar-style-preference = Tab Bar Style

horizontal-tabbar =
 .label = Horizontal Tab Bar

tabbar-style-description = A restart of { -brand-short-name } is required to fully apply this setting.
multirow-tabbar =
 .label = Multi-Row Tab Bar
vertical-tabbar =
 .label = Vertical Tab Bar (experimental)

native-vertical-tab-show-right =
 .label = Show Vertical Tab Bar on the right side of the window

hover-vertical-tab =
 .label = Collapse Vertical Tab Bar
floorp-show-vertical-tab-newtab-button =
  .label = Show the "Open a new tab" button inside Vertical Tab Bar
floorp-show-vertical-tab-scrollbar =
  .label = Show scrollbar on Vertical Tab Bar

TST = Tree Style Tab
about-TST = Tree Style Tab is a popular add-on that allows you to display tabs in a tree-like structure. This add-on is already pre-integrated in { -brand-short-name }. Please install the add-on to activate { -brand-short-name }'s Tree Style Tab.
treestyletab-Settings = 
 .label = Collapse Tree Style Tab

sidebar-reverse-position-toolbar = Show Sidebars on the other side

bookmarks-bar-settings = Bookmarks Toolbar (only one option can be used at a time)
bookmarks-focus-mode =
 .label = Hide the Bookmarks Toolbar unless hovering over the navigation bar
bookmarks-bottom-mode =
 .label = Show the Bookmarks Toolbar at the bottom of { -brand-short-name }

navbar-settings = Navigation Bar
show-nav-bar-bottom =
 .label = Show the Toolbar at the bottom of { -brand-short-name } (experimental)

material-effect =
 .label = Allow Mica For Everyone to modify the browser design
disable-extension-check-compatibility-option =
 .label = Do not check for compatibility with add-ons
other-preference = Other Preferences

enable-userscript =
 .label = Enable legacy components
about-userscript = Enabling this feature may cause unexpected bugs or fatal errors.

search-positon-top =
 .label = Display the Find Bar at the top of the page
allow-auto-restart =
 .label = Restart automatically when settings that require a restart are changed

disable-fullscreen-notification =
 .label = Do not show a notification when entering full screen

## Browser Theme

system-color-settings = Some themes have both light and dark modes - choose which mode you'd like these themes to use.
preferences-theme-appearance-header = Theme Mode

system-theme-dark =
 .label = Dark

system-theme-light =
 .label = Light

system-theme-auto =
 .label = Follow my system appearance

## User interface preferences

ui-preference = Browser appearance
preferences-browser-appearance-description = Choose a built-in third-party design to use in { -brand-short-name }. Some designs may not be compatible with your configuration.

firefox-proton =
 .label = Firefox Proton UI

firefox-photon-lepton =
 .label = Firefox Photon・Lepton UI

floorp-fluentUI =
 .label = Microsoft Fluent UI (deprecated)
 
floorp-fluerialUI =
 .label = { -brand-short-name } Fluerial UI (deprecated)

floorp-gnomeUI =
 .label = GNOME Theme (deprecated)

## Download Manager
download-notification-preferences = Download Notifications
start-always-notify =
 .label = Notify only when starting downloads
finish-always-notify =
 .label = Notify only when a download finishes
always-notify =
 .label = Notify when starting downloads and when a download finishes
do-not-notify =
 .label = Disable download notifications

## Sidebar
profiles-button-label = Manage Profiles
floorp-help-button-label = { -brand-short-name } Support

appmenuitem-reboot =
 .label = Restart

## UserAgent

userAgent-preference = User Agent
default-useragent-mode =
 .label = Use Firefox User Agent (Default)
windows-chrome-useragent-mode =
 .label = Spoof Chrome on Windows
macOS-chrome-useragent-mode =
 .label = Spoof Chrome on macOS
linux-chrome-useragent-mode =
 .label = Spoof Chrome on Linux
mobile-chrome-useragent-mode =
 .label = Spoof Chrome on iOS
use-custom-useragent-mode =
 .label = Use Custom User Agent

## DMR UI
download-mgr-UI =
 .label = Enable the SimpleUI Download Manager
downloading-red-color =
 .label = Use the red downloads icon when downloading

sidebar-preferences = Sidebar

bsb-preferences = Browser Manager Sidebar Settings
view-sidebar2-right = 
 .label = Display the Browser Manager Sidebar on the right
enable-sidebar2 =
 .label = Enable the Browser Manager Sidebar
visible-bms = 
 .label = Show the Browser Manager Sidebar
hide-bms-to-unload-panel =
  .label = Unload panel when hiding panel
enable-addons-in-sidebar2-with-experimental =
 .label = Enable Extensions Content Scripts in Browser Manager Sidebar (experimental)
enable-addons-in-sidebar2 =
 .label = Enable Extensions Content Scripts in Browser Manager Sidebar
sidebar2-enable-addons-desc = If this setting is enabled, ad blocking extensions and other extensions will work in the sidebar. However, not all extensions will work.

custom-URL-option = Set Web Panel URLs
set-custom-URL-button =
    .label = Set Custom URLs...
    .accesskey = S

pane-BSB-title = { bsb-header }
category-BSB =
    .tooltiptext = { pane-BSB-title }

category-downloads = 
    .tooltiptext = { files-and-applications-title }

bsb-header = Browser Manager Sidebar
bsb-context = Use the following Container
bsb-userAgent-label = 
  .label = Use Mobile User Agent in this Web Panel
bsb-width = Width (if set to 0, the global value will be used)
bsb-page = Page to open

bsb-add = Add Web Panel on Browser Manager Sidebar

bsb-setting = Web Panel Settings

bsb-add-title =
 .title = { bsb-add }

bsb-setting-title = 
 .title = { bsb-setting }

bsb-browser-manager-sidebar =
  .label = { sidebar2-browser-manager-sidebar }

bsb-bookmark-sidebar =
  .label = { sidebar2-bookmark-sidebar }

bsb-history-sidebar =
  .label = { sidebar2-history-sidebar }

bsb-download-sidebar =
  .label = { sidebar2-download-sidebar }

bsb-notes-sidebar =
  .label = { sidebar2-notes-sidebar }

bsb-website = 
  .label = Website

sidebar2-pref-delete =
 .label = Delete

sidebar2-pref-setting =
 .label = Settings

sidebar2-global-width = Global Web Panels width

use-icon-provider-option = Use Icon Provider

use-icon-provider-option-google =
 .label = Google

use-icon-provider-option-duckduckgo =
 .label = DuckDuckGo

use-icon-provider-option-yandex =
 .label = Yandex (available in China)

use-icon-provider-option-hatena =
 .label = Hatena (available in China)

memory-and-performance = Memory and Performance

min-memory = 
    .label = Minimum Memory Usage (low performance)

balance-memory = 
    .label = Balance Memory Usage and Performance

max-memory = 
    .label = Best Performance (high memory usage)

delete-border-and-roundup-option =
  .label = Round the corners of pages
STG-smilar-workspaces-option =
  .label = Make "Simple Tab Groups" add-on buttons look like Workspaces buttons

## DualTheme
dualtheme-enable =
 .label = Enable Dual Theme

newtab-background = { -brand-short-name } Home Background

newtab-background-random-image =
    .label = Random images from Unsplash

newtab-background-gradation =
    .label = Gradient

newtab-background-not-background =
    .label = Disable background

newtab-background-selected-image =
    .label = Custom folder...

newtab-background-selected-one-image =
    .label = Custom image...

newtab-background-folder = Use images from this folder:

newtab-background-image = Use image :

newtab-choose-image = Choose Image...

newtab-background-folder-reload =
  .label = Reload images

newtab-background-folder-default = 
  .label = Restore Defaults

newtab-background-folder-open = 
  .label = Open folder

newtab-background-folder-choose = Choose images folder...

newtab-background-image-choose = Choose image...

newtab-background-extensions = Use images with these file extensions (separated by ",")

disable-blur-on-newtab =
  .label = Disable blur effect in { -brand-short-name } Home

disable-releasenote-on-newtab =
  .label = Disable Release Note and Support Links in { -brand-short-name } Home

disable-imagecredit-on-newtab =
  .label = Disable image credit (Unsplash) in { -brand-short-name } Home

## Lepton Preferences

about-lepton = Customize { -brand-short-name } with Lepton

lepton-preference-button =
    .label = Lepton Settings...
    .accesskey = L

lepton-header = Lepton Settings

lepton-preference = Lepton Settings
photon-mode =
    .label = Use Photon design

lepton-mode = 
    .label = Use Lepton design

protonfix-mode =
    .label = Use tweaked Proton design

autohide-preference = Automatically hide browser elements

floorp-lepton-enable-tab-autohide =
    .label = Automatically hide tabs
floorp-lepton-enable-navbar-autohide =
    .label = Automatically hide Toolbar
floorp-lepton-enable-sidebar-autohide =
    .label = Automatically hide Sidebar
floorp-lepton-enable-urlbar-autohide =
    .label = Automatically hide Address Bar
floorp-lepton-enable-back-button-autohide =
    .label = Automatically hide back button
floorp-lepton-enable-forward-button-autohide =
    .label = Automatically hide forward button
floorp-lepton-enable-page-action-button-autohide =
    .label = Automatically hide buttons on the Address Bar
floorp-lepton-enable-toolbar-overlap =
    .label = Show Toolbar over website content
floorp-lepton-enable-toolbar-overlap-allow-layout-shift-autohide =
    .label = Automatically hide Toolbar when displaying "ltr" content

hide-preference = Manage browser elements

floorp-lepton-enable-tab_icon-hide =
    .label = Hide tab icons
floorp-lepton-enable-tabbar-hide =
    .label = Hide Tab Bar
floorp-lepton-enable-navbar-hide =
    .label = Hide Toolbar
floorp-lepton-enable-sidebar_header-hide =
    .label = Hide Sidebar Headers
floorp-lepton-enable-urlbar_iconbox-hide =
    .label = Hide Address Bar icons
floorp-lepton-enable-bookmarkbar_icon-hide =
    .label = Hide Bookmarks Bar icons
floorp-lepton-enable-bookmarkbar_label-hide =
    .label = Hide Bookmarks Bar labels
floorp-lepton-enable-disabled_menu-hide =
    .label = Hide disabled context menu items

floorp-lepton-disable-userChrome-icon =
    .label = Disable Lepton's context menu and panel menu icons
floorp-lepton-disable-userChrome-menu-icon =
    .label = Enable Lepton's context menu icons

positon-preferences = Position adjustments

floorp-lepton-enable-centered-tab =
    .label = Center labels in tabs
floorp-lepton-enable-centered-urlbar =
    .label = Center text in the Address Bar
floorp-lepton-enable-centered-bookmarkbar =
    .label = Center Bookmarks Bar items

urlbar-preferences = Address Bar

floorp-lepton-enable-urlbar-icon-move-to-left =
    .label = Move Address Bar icons to the left side
floorp-lepton-enable-urlname-go_button_when_typing =
    .label = When typing, show a "Go" button
floorp-lepton-enable-always-show-page_action =
    .label = Always show page actions in the Address Bar

tabbar-preferences = Tab Bar

floorp-lepton-enable-tabbar-positon-as-titlebar =
    .label = Tab Bar in the Title Bar
floorp-lepton-enable-tabbar-as-urlbar =
    .label = Combine Tab Bar and Toolbar

lepton-sidebar-preferences = Sidebar
floorp-lepton-enable-overlap-sidebar =
    .label = Show Sidebar over website content

floorp-home-mode-choice-default =
    .label = { -brand-short-name } Home (Default)
floorp-home-prefs-content-header = { -brand-short-name } Home Content
floorp-home-prefs-content-description = Choose the content you want to see on the { -brand-short-name } Home Page.

## Notes
floorp-notes = { -brand-short-name } Notes
restore-from-backup = Restore Notes from backup
enable-notes-sync = 
 .label = Enable { -brand-short-name } Notes Sync
about-notes-backup-tips = { -brand-short-name } Notes uses Firefox Sync to sync your notes with other devices. If you lose your notes, you can restore them from a backup. A backup is created when you launch { -brand-short-name }.
notes-sync-description = This can solve the problem of losing content due to overwriting notes during synchronization.
backuped-time = Backed up at
notes-backup-option = Backup Settings
backup-option-button = Backup Settings...

restore-from-backup-prompt-title = { -brand-short-name } Notes Restore Service
restore-from-this-backup = Restore Notes back to the state they were in this backup?

restore-button = Restore

## user.js
header-userjs = user.js
userjs-customize = Customize { -brand-short-name } with user.js
about-userjs-customize = user.js is a configuration file that allows you to customize { -brand-short-name }. user.js files are downloaded from the Internet and overwrite your current user.js file. Please back up your current user.js file before continuing. user.js configurations will be applied automatically after restarting { -brand-short-name }.

userjs-label = user.js list
userjs-prompt = Apply this user.js?
apply-userjs-attention = Applying a new user.js will overwrite your current user.js file.
apply-userjs-attention2 = Please back up your current user.js file before continuing.

userjs-button = user.js Settings...
userjs-select-option = Manage the user.js currently used in { -brand-short-name } to improve performance and privacy.

apply-userjs-button = Apply
## userjs Options

default-userjs-label = { -brand-short-name } Default
about-default-userjs = Telemetry disabled. Well balanced { -brand-short-name } with various customizations enabled.

Securefox-label = Yokoffing Securefox
about-Securefox = HTTPS-by-Default. Total Cookie Protection with site isolation. Enhanced state and network partitioning. Various other enhancements.

default-label = Yokoffing Default
about-default = All the essentials. None of the breakage. This is your user.js.

Fastfox-label = Yokoffing Fastfox
about-Fastfox = Immensely increase Firefox's browsing speed. Give Chrome a run for its money!

Peskyfox-label = Yokoffing Peskyfox
about-Peskyfox = Unclutter the new tab page. Remove Pocket. Restore compact mode as an option. Stop webpage notifications, pop-ups, and other annoyances.

Smoothfox-label = Yokoffing Smoothfox
about-Smoothfox = Get Edge-like smooth scrolling on your favorite browser — or choose something more your style. 

select-workspace = Select Workspace
workspace-select-icon = Select Workspace Icon
 .label = Select Workspace Icon
workspace-select-container = Select Container Tab
 .label = Select Container Tab
workspace-customize = 
 .title = Customize Workspace

floorp-no-workspace-conatiner =
  .label = No Container

workspace-icon-article =
 .label = Article
workspace-icon-book = 
 .label = Book
workspace-icon-briefcase =
 .label = Job
workspace-icon-cart =
 .label = Shopping
workspace-icon-chat = 
 .label = Chat
workspace-icon-chill =
 .label = Private
workspace-icon-circle =
 .label = Circle
workspace-icon-compass =
 .label = Compass
workspace-icon-code =
 .label = Code
workspace-icon-dollar =
 .label = Bank
workspace-icon-fence =
 .label = Fence
workspace-icon-fingerprint =
 .label = Personal
workspace-icon-food =
 .label = Food
workspace-icon-fruit =
 .label = Fruit
workspace-icon-game =
 .label = Game
workspace-icon-gear =
 .label = Gear
workspace-icon-gift =
 .label = Gift
workspace-icon-key =
 .label = Key
workspace-icon-lightning =
 .label = Lightning
workspace-icon-network =
 .label = Internet
workspace-icon-notes =
 .label = Notes
workspace-icon-paint =
 .label = Paint
workspace-icon-photo =
 .label = Photo
workspace-icon-pin =
 .label = Pin
workspace-icon-pet =
 .label = Pet
workspace-icon-question =
 .label = Question
workspace-icon-smartphone =
 .label = Smart Phone
workspace-icon-star =
 .label = Star
workspace-icon-tree =
 .label = Tree
workspace-icon-vacation =
 .label = Vacation
workspace-icon-love =
 .label = Love
workspace-icon-moon =
 .label = Moon
workspace-icon-music =
 .label = Music
workspace-icon-user =
 .label = User
# Custom Keyboard Shortcuts
floorp-CSK-title = Custom keyboard shortcuts
floorp-CSK-description = Customize { -brand-short-name }'s keyboard shortcuts. { -brand-short-name } provides more than 80 customizable keyboard shortcuts! Duplicate keyboard shortcuts will not work. Restart { -brand-short-name } to apply these settings.
disable-fx-actions =
 .label = Disable Mozilla Firefox's keyboard shortcuts
customize-Action =
 .label = Add shortcut
remove-Action =
 .label = Remove shortcut
CSK-reset-title = Reset custom keyboard shortcuts
CSK-reset-description = Reset custom keyboard shortcuts to { -brand-short-name }'s defaults.
CSK-reset-label = Reset custom keyboard shortcuts
CSK-reset-button = Restore Defaults
CSK-manage-title = Manage keyboard shortcuts

CSK-remove-shortcutkey = Remove custom keyboard shortcut?
CSK-remove-shortcutkey-description = Are you sure you want to remove this keyboard shortcut?

CSK-restore-default = Restore Defaults?
CSK-restore-default-description = Restore { -brand-short-name }'s default keyboard shortcuts? Your current shortcuts will be lost.

CSK-reboot-browser-label = Restart { -brand-short-name } to apply these settings
CSK-reboot-browser-button = Restart { -brand-short-name }

# Exist shortcut key: "S", "shift"
CSK-keyborad-shortcut-info = Current keyboard shortcut: { $key } & { $modifiers }.
CSK-keyborad-shortcut-info-with-keycode = Current keyboard shortcut: { $key }.

CSK-keyborad-shortcut-is-changed = (Not Applied)

floorp-custom-actions-tab-action = Tab Actions
floorp-custom-actions-page-action = Page Actions
floorp-custom-actions-visible-action = Visible Actions
floorp-custom-actions-search-action = Search Actions
floorp-custom-actions-tools-action = Tools Actions
floorp-custom-actions-bookmark-action = Bookmark Actions
floorp-custom-actions-open-page-action = Open Page Actions
floorp-custom-actions-history-action = History Actions
floorp-custom-actions-pip-action = Picture-in-Picture Actions
floorp-custom-actions-downloads-action = Downloads Actions
floorp-custom-actions-sidebar-action = Sidebar Actions
floorp-custom-actions-bms-action = Browser Manager Sidebar Actions
floorp-custom-actions-split-view-action = Split View Actions
floorp-custom-actions-workspaces-action = Workspaces Actions
floorp-custom-actions-custom-action = Custom Actions (Experimental)

## Mouse Gestures
mouse-gesture = Mouse Gestures
mouse-gesture-description = Gesturefy must be installed to use mouse gestures with { -brand-short-name }.
Gesturefy = Gesturefy
about-Gesturefy = Gesturefy is an extension that adds mouse gestures to your browser. If { -brand-short-name } detects the installation of this add-on, it will add gesture commands to Gesturefy that are only available in { -brand-short-name }. This add-on also create new tabs!

# Translate
TWS = Translate Web Pages
about-TWS = Translate your page in real time using Google or Yandex. You can also translate selected text or the entire page.

# Privacy Hub
## BlockMoreTrackers
privacy-hub-header = Privacy Hub
block-more-tracker = Block more Ads and Trackers
block-tracker = This section contains a set of extensions designed to block ads and trackers
view-at-AMO = View this addon in addons.mozilla.org
uBlock-Origin = uBlock Origin
about-uboori = uBlock Origin blocks ads, extensive trackers, and additional dangerous sites.
Facebook-Container = Facebook Container
about-Facebook-Container = Prevent Facebook from tracking you around the web. Facebook Container extension helps you take control and isolate your web activity from Facebook.

## Fingerprinting
fingerprint-header = Resist Fingerprinting & IP address leaks
block-fingerprint = Fingerprinting is a tracking mechanism that relies on the unique features of your browser and operating system. This section contains settings to further enhance this protection beyond the default blocking.
enable-firefox-fingerprint-protections = Enable strong protection against fingerprinting
about-firefox-fingerprint-protection = Enabling protection by Firefox includes forced light mode, disabling some APIs, etc. Some sites may be broken.
fingerprint-Protection =
 .label =  Anti-fingerprinting protections
html5-canvas-prompt-settings =
 .label =  Automatically dismiss access confirmation prompts for HTML5 image data
canvas-prompt = Prevents websites from using the canvas-reading prompt unless manually permitted.
disable-webgl =
 .label =  Disable WebGL
about-webgl = WebGL is a Javascript API used to render graphics, which can be used to identify GPU.
Canvas-Blocker = Canvas Blocker
about-CB = This add-on spoofs data used by fingerprinting techniques.
WebRTC-connection = WebRTC is a standard that provides real-time calling. If you disable this setting, you will not be able to use Discord, etc.
WebRTC = 
 .label = Enable WebRTC Connection

################################################################### browser ###############################################################

rest-mode = Taking a break...
rest-mode-description = { -brand-short-name } is currently suspended. Press ENTER or OK to continue.

Sidebar2 =
  .label = Browser Manager Sidebar
  .tooltiptext = Change Sidebar visibility

sidebar2-mute-and-unmute =
  .label = Mute/Unmute this Panel

sidebar2-unload-panel =
  .label = Unload this Panel

sidebar2-change-ua-panel =
  .label = Toggle Mobile User Agent

sidebar2-delete-panel =
  .label = Delete this Panel

sidebar2-close-button =
  .tooltiptext = Close Sidebar

sidebar-back-button =
  .tooltiptext = Back

sidebar-forward-button =
  .tooltiptext = Forward

sidebar-reload-button = 
  .tooltiptext = Reload

sidebar-go-index-button =
  .tooltiptext = Go Home

sidebar-muteAndUnmute-button =
  .tooltiptext = Mute/Unmute sidebar

sidebar2-browser-manager-sidebar = Browser Manager

show-browser-manager-sidebar =
  .tooltiptext = Show { sidebar2-browser-manager-sidebar } Sidebar

sidebar2-bookmark-sidebar = Bookmarks

show-bookmark-sidebar =
  .tooltiptext = Show { sidebar2-bookmark-sidebar } Sidebar

sidebar2-history-sidebar = History

show-history-sidebar =
  .tooltiptext = Show { sidebar2-history-sidebar } Sidebar

sidebar2-download-sidebar = Downloads

show-download-sidebar =
  .tooltiptext = Show { sidebar2-download-sidebar } Sidebar

sidebar2-notes-sidebar = Notes

show-notes-sidebar =
  .tooltiptext = Show { sidebar2-notes-sidebar } Sidebar

sidebar-add-button =
  .tooltiptext = { bsb-add }

sidebar-addons-button =
  .tooltiptext = Add-ons and themes

sidebar2-hide-sidebar-button =
  .tooltiptext = Hide Browser Manager Sidebar

sidebar-passwords-button =
  .tooltiptext = Passwords

sidebar-preferences-button =
  .tooltiptext = Settings

sidebar-keepWidth-button =
  .tooltiptext = Keep using the current width on this Panel

sidebar2-keep-width-for-global =
  .label = Apply this width to all panels without a custom width

bsb-context-add = 
  .label = Add page to Web Panel...

bsb-context-link-add = 
  .label = Add link to Web Panel...
#################################################################### menu panel ############################################################

open-profile-dir = 
    .label = Open Profile Directory

####################################################################### menu ###############################################################

css-menu =
    .label = CSS
    .accesskey = C

css-menubar =
    .label = CSS
    .accesskey = C

rebuild-css =
    .label = Rebuild browser CSS files
    .accesskey = R

make-browsercss-file =
    .label = Create browser CSS file
    .accesskey = M

open-css-folder =
    .label = Open CSS folder
    .accesskey = O

edit-userChromeCss-editor =
    .label = Edit userChrome.css file

edit-userContentCss-editor =
    .label = Edit userContent.css file

not-found-editor-path = Could not find a CSS file editor
set-pref-description = Input the file location of the CSS file editor you want to use:
rebuild-complete = Rebuild has been completed.
please-enter-filename = Please enter a file name.

################################################################### Undo-Closed-Tab ###############################################################

undo-closed-tab = Reopen closed tab

################################################################### about:addons ###############################################################

# Dual Theme
dual-theme-enable-addon-button = Enable as a sub-theme
dual-theme-disable-addon-button = Disable sub-theme
dual-theme-enabled-heading = Enabled as a sub-theme

##################################################################### toolbar ###############################################################

status-bar =
    .label = Status Bar
     .accesskey = S

##################################################################### Gesturefy ###############################################################

gf-floorp-open-tree-style-tab-name = [{ -brand-short-name }] Open Tree Style Tab Panel
gf-floorp-open-tree-style-tab-description = Open Tree Style Tab Panel on the Sidebar

gf-floorp-open-bookmarks-sidebar-name = [{ -brand-short-name }] Open Bookmarks Panel
gf-floorp-open-bookmarks-sidebar-description = Open Bookmarks Panel on the Sidebar

gf-floorp-open-history-sidebar-name = [{ -brand-short-name }] Open History Panel
gf-floorp-open-history-sidebar-description = Open History Panel on the Sidebar

gf-floorp-open-synctabs-sidebar-name = [{ -brand-short-name }] Open Synced Tabs Panel
gf-floorp-open-synctabs-sidebar-description = Open Synced Tabs Panel on the Sidebar

gf-floorp-close-sidebar-name = [{ -brand-short-name }] Close Sidebar
gf-floorp-close-sidebar-description = Close Sidebar


gf-floorp-open-browser-manager-sidebar-name = [{ -brand-short-name }] Open BMS
gf-floorp-open-browser-manager-sidebar-description = Open Browser Manager Sidebar if the Web Panel of Browser Manager Sidebar is loaded

gf-floorp-close-browser-manager-sidebar-name = [{ -brand-short-name }] Close BMS
gf-floorp-close-browser-manager-sidebar-description = Close Browser Manager Sidebar

gf-floorp-show-browser-manager-sidebar-name = [{ -brand-short-name }] Toggle BMS
gf-floorp-show-browser-manager-sidebar-description = Toggle Browser Manager Sidebar

gf-floorp-hide-statusbar-name = [{ -brand-short-name }] Hide Status Bar
gf-floorp-hide-statusbar-description = Hide Status Bar

gf-floorp-show-statusbar-name = [{ -brand-short-name }] Toggle Status Bar
gf-floorp-show-statusbar-description = Show or Hide Status Bar

gf-floorp-open-extension-sidebar-name = [{ -brand-short-name }] Open selected add-on Sidebar
gf-floorp-open-extension-sidebar-description = Open selected add-on on the Sidebar
gf-floorp-open-extension-sidebar-settings-addons-id = Add-on of Sidebar
gf-floorp-open-extension-sidebar-settings-addons-id-description = The extension of the add-on open of sidebar
gf-floorp-open-extension-sidebar-settings-list-default = Please select add-on
gf-floorp-open-extension-sidebar-settings-list-unknwon = Unknown add-on
##################################################################### { -brand-short-name } System Update Portable Version ###############################################################

update-portable-notification-found-title = Updates found!
update-portable-notification-found-message = Downloading updates...
update-portable-notification-ready-title = Ready to update!
update-portable-notification-ready-message = { -brand-short-name } will be updated on the next launch.
update-portable-notification-success-title = Update succeeded!
update-portable-notification-success-message = Update succeeded! Hope you enjoy the new version of { -brand-short-name }!
update-portable-notification-failed-title = Update failed.
update-portable-notification-failed-redirector-message = Update failed. Restarting your browser may solve this problem.
update-portable-notification-failed-prepare-message = Failed to prepare the update.

##################################################################### { -brand-short-name } Portable Preferences ###############################################################

floorp-portable-update-application-allow = { -brand-short-name } Portable Update
floorp-update-application-auto-enabled-option =
  .label = Automatically check for updates to { -brand-short-name } portable. (Recommended)
  
##################################################################### Open link in external ###############################################################
openInExternal-title = Open in external browser
open-link-in-external-enabled-option =
 .label = Enable the "Open in external browser" feature
open-link-in-external-select-browser-option = Choose what browser will be opened
open-link-in-external-select-browser-option-default =
 .label = Default browser
open-link-in-external-tab-context-menu = Open in external browser
open-link-in-external-tab-dialog-title-error = An error occurred:
open-link-in-external-tab-dialog-message-default-browser-not-found = Default browser was not found or is not configured.
open-link-in-external-tab-dialog-message-selected-browser-not-found = The selected browser does not exist.


######################################################################### { -brand-short-name } Notes ###############################################################

new-memo = New
memo-title-input-placeholder = Write a title here
memo-input-placeholder = Write or paste a memo here
delete-memo = Delete
save-memo = Save
memo-welcome-title = Welcome!
memo-first-tip = Welcome to { -brand-short-name } Notes! Here are some instructions on how to use it!
memo-second-tip = { -brand-short-name } Notes is a notepad that lets you store multiple notes that sync across devices. To enable synchronization, you need to sign in to { -brand-short-name } with your Firefox account.
memo-third-tip = { -brand-short-name } Notes will be saved in your { -brand-short-name } settings and synchronized across devices using Firefox Sync. Firefox Sync encrypts the contents of the sync with your Firefox account password, so no one but you know its contents.
memo-import-data-tip = Firefox Sync is not a backup service. We recommend you to create backups.
memo-new-title = New Note
chage-view-mode = Toggle View/Edit Mode
readonly-mode = Offline (Read-only)

######################################################################### Default bookmarks ###############################################################
default-bookmark-ablaze-support = Astian Support

######################################################################### Like Chrome Download mgr ###############################################################

floorp-delete-all-downloads = 
  .label = Clear Downloads
  .accesskey = D
  .tooltiptext = Clear Downloads

floorp-show-all-downloads =
  .label = Show all downloads
  .accesskey = S
  .tooltiptext = Show all downloads

######################################################################### workspace ###############################################################

workspaces-create-new-workspace-button =
 .label = Create new Workspace...
 .tooltiptext = Create a new Workspace
workspaces-manage-workspaces-button =
  .label = Manage Workspaces...
  .tooltiptext = Manage your Workspaces

rename-this-workspace =
  .label = Rename Workspace
  .accesskey = R
delete-this-workspace =
  .label = Delete Workspace
  .accesskey = D
manage-this-workspaces =
  .label = Manage Workspaces...
  .accesskey = M

workspace-new-default-name = New Workspace
workspace-default-name = Default

move-tab-another-workspace =
 .label = Move to another Workspace

rename-workspace-prompt-title = Rename Workspace
rename-workspace-prompt-text = Enter Workspace Name. Most characters and symbols can be used.

workspaces-toolbar-button = Workspaces
  .label = Workspaces
  .tooltiptext = Select a Workspace...

## Preferences
enable-workspaces = 
    .label = Enable Workspaces
    .tooltiptext = Enable Workspaces
workspace-notice = Workspaces will not work with this settings enabled unless the workspaces's button is placed on the toolbar. Use this setting if you want to disable Workspaces completely.
enable-workspaces-with-experimental =
 .label = Enable Workspaces (Experimental)
 .tooltiptext = Enable Workspaces (Experimental)

workspace-warning = Workspaces cannot be used with Tab Group add-ons. If you want to use Tab Group add-ons, please disable Workspaces and restart { -brand-short-name }.

category-workspaces =
    .label = Workspaces
    .tooltiptext = Workspaces
pane-workspaces-title = Workspaces

floorp-workspaces-title = { -brand-short-name } Workspaces
floorp-workspace-settings-button = Workspace Settings...

change-to-close-workspace-popup-option = 
 .label = Close workspaces popup when selecting a Workspace
manage-workspace-on-bms-option =
 .label = Manage Workspace on Browser Manager Sidebar
show-workspace-name-option =
 .label = Show Workspace Name on Tab Bar's Workspace Button

######################################################################### menubar item ###############################################################

sharemode-menuitem =
  .label = Share Mode
  .accesskey = S


############################################################################## Welcome page ###############################################################

welcome-login-to-firefox-account = Sign in to your Firefox Account
welcome-to-floorp = Welcome to { -brand-short-name }!
welcome-discribe-floorp = { -brand-short-name } is a fast and secure lightweight browser committed to user privacy and security.
welcome-start-setup = Ready to dive in?
welcome-skip-to-start-browsing = Skip to Start Browsing
welcome-select-preferences-template = Choose a template
welcome-minimum-template = Basic
welcome-enable-basic-features = Enable basic features and settings for a simple experience.
welcome-medium-template = Default
welcome-enable-some-features = Enable additional features and settings for a better experience.
welcome-maximum-template = Advanced
welcome-enable-most-of-features = Enable advanced features and settings. Recommended for experienced users.
welcome-go-next-setup = Next
welcome-select-browser-design = Select a Browser Design
welcome-discribe-browser-design = You can choose one of the wonderful third-party { -brand-short-name } designs. OS-specific designs are also available in Preferences.
welcome-design-lepton-name = Lepton Original Design
welcome-design-photon-name = Lepton Photon Design
welcome-design-ProtonFix-name = Lepton ProtonFix Design
welcome-design-floorp-fluerial-name = { -brand-short-name } Fluerial Design
welcome-design-firefox-proton-name = Firefox Proton Design
welcome-import-data = Import Your Browser Data
welcome-import-data-description = Quick setup! Import your bookmarks, passwords, and more from your old browser. Firefox users can import data from Firefox Sync.
welcome-import-data-button = Import Data...
welcome-import-data-skip = Skip Import
welcome-select-button = Select
welcome-finish-setup = Setup Complete!
welcome-finish-setup-description = You're all set! Other features like Vertical Tabs & Workspaces can be found in { -brand-short-name }'s Settings. Enjoy { -brand-short-name }!
welcomet-finish-setup = Start Browsing the Web


############################################################# Custom Shortcutkey ###############################################################

category-CSK =
 .label = Keyboard Shortcuts
 .tooltiptext = Keyboard Shortcuts
category-CSK-title = Keyboard Shortcuts
shortcutkey-customize = 
 .title = Keyboard Shortcuts
select-shortcutkeyAction = Select an action to trigger
shortcutkey-customize-key-list-placeholder = Your keyboard shortcut will appear here
shortcut-key-label = Keyboard Shortcut
start-input-button-listen = Start Listening
end-input-button-listen = Stop Listening
shortcut-key-description = Click "Start Listening" and enter your new keyboard shortcut for this action. Multiple keys can be used; however, keyboard shortcuts will not work if already assigned to other actions.

floorp-custom-actions-open-new-tab = Open a new tab
  .label = Open a new tab
floorp-custom-actions-close-tab = Close the current tab
  .label = Close the current tab
floorp-custom-actions-open-new-window = Open a new window
  .label = Open a new window
floorp-custom-actions-open-new-private-window = Open a new private window
  .label = Open a new private window
floorp-custom-actions-close-window = Close the current window
  .label = Close the current window
floorp-custom-actions-restore-last-session = Restore the last session
  .label = Restore the last session
floorp-custom-actions-restore-last-window = Restore the last window
  .label = Restore the last window
floorp-custom-actions-show-next-tab = Show the next tab
  .label = Show the next tab
floorp-custom-actions-show-previous-tab = Show the previous tab
  .label = Show the previous tab
floorp-custom-actions-show-all-tabs-panel = Show all tabs panel
  .label = Show the tabs list
floorp-custom-actions-send-with-mail = Send with mail
  .label = Send via email
floorp-custom-actions-save-page = Save page
  .label = Save page
floorp-custom-actions-print-page = Print page
  .label = Print page
floorp-custom-actions-mute-current-tab = Toggle mute/unmute current tab
  .label = Toggle mute/unmute current tab
floorp-custom-actions-toggle-bookmark-toolbar = Toggle bookmark toolbar
  .label = Toggle Bookmarks Toolbar
floorp-custom-actions-show-source-of-page = Show source of page
  .label = Open Page Source
floorp-custom-actions-show-page-info = Show page info
  .label = Open Page Info
floorp-custom-actions-zoom-in = Zoom in
  .label = Zoom in
floorp-custom-actions-zoom-out = Zoom out
  .label = Zoom out
floorp-custom-actions-reset-zoom = Reset zoom
  .label = Reset zoom
floorp-custom-actions-back = Back
  .label = Back
floorp-custom-actions-forward = Forward
  .label = Forward
floorp-custom-actions-reload = Reload
  .label = Reload
floorp-custom-actions-stop = Stop
  .label = Stop
floorp-custom-actions-force-reload = Force reload
  .label = Force reload
floorp-custom-actions-search-in-this-page = Search in this page
  .label = Find in page
floorp-custom-actions-show-next-search-result = Show next search word in this page result
  .label = Next "Find in page" result
floorp-custom-actions-show-previous-search-result = Show previous search word in this page result
  .label = Previous "Find in page" result
floorp-custom-actions-search-the-web = Search the web
  .label = Search the web
floorp-custom-actions-open-migration-wizard = Open migration wizard
  .label = Open migration wizard
floorp-custom-actions-quit-from-application = Quit from application
  .label = Quit { -brand-short-name }
floorp-custom-actions-enter-into-customize-mode = Customize Toolbar
  .label = Open Customize { -brand-short-name }
floorp-custom-actions-enter-into-offline-mode = Enter offline mode
  .label = Enter offline mode
floorp-custom-actions-open-screen-capture = Open screen capture tool
  .label = Take a screenshot
floorp-custom-actions-show-pip = Show picture in picture
  .label = Show Picture-in-Picture
floorp-custom-actions-bookmark-this-page = Bookmark this page
  .label = Bookmark this page
floorp-custom-actions-open-bookmarks-sidebar = Open bookmarks sidebar
  .label = Open Bookmarks sidebar
floorp-custom-actions-open-bookmark-add-tool = Open bookmark add tool
  .label = Add Bookmark
floorp-custom-actions-open-bookmark-add-toolbar = Open "Add a new bookmark" pop-up window
  .label = Add to Bookmarks Toolbar
floorp-custom-actions-open-bookmarks-manager = Open bookmarks manager
  .label = Open Bookmarks Manager
floorp-custom-actions-show-bookmark-toolbar = Toggle bookmark toolbar
  .label = Toggle Bookmarks Toolbar
floorp-custom-actions-open-general-preferences = Open general preferences
  .label = Open General Preferences
floorp-custom-actions-open-privacy-preferences = Open privacy preferences
  .label = Open Privacy Preferences
floorp-custom-actions-open-workspaces-preferences = Open workspaces preferences
  .label = Open Workspaces Preferences
floorp-custom-actions-open-containers-preferences = Open containers preferences
  .label = Open Containers Preferences
floorp-custom-actions-open-search-preferences = Open search preferences
  .label = Open Search Preferences
floorp-custom-actions-open-sync-preferences = Open sync preferences
  .label = Open Sync Preferences
floorp-custom-actions-open-task-manager = Open task manager
  .label = Open { -brand-short-name }'s Task Manager
floorp-custom-actions-open-home-page = Open { -brand-short-name }'s home page
  .label = Open { -brand-short-name }'s homepage
floorp-custom-actions-open-addons-manager = Open add-ons and themes
  .label = Open Add-ons and themes
floorp-custom-actions-forget-history = Forget history
  .label = Forget history
floorp-custom-actions-quick-forget-history = Quick forget history
  .label = Quick forget history
floorp-custom-actions-clear-recent-history = Clear recent history
  .label = Clear recent history
floorp-custom-actions-search-history = Search history
  .label = Search history
floorp-custom-actions-manage-history = Manage history
  .label = Manage history
floorp-custom-actions-open-downloads = Open downloads
  .label = Open Downloads
floorp-custom-actions-show-bsm = Show browser manager sidebar
  .label = Show the Browser Manager Sidebar
floorp-custom-actions-show-bookmark-sidebar = Show bookmark sidebar
  .label = Show Bookmarks Sidebar
floorp-custom-actions-show-history-sidebar = Show history sidebar
  .label = Show History Sidebar
floorp-custom-actions-show-synced-tabs-sidebar = Show synced tabs sidebar
  .label = Show Synced Tabs Sidebar
floorp-custom-actions-reverse-sidebar = Reverse sidebar position
  .label = Reverse sidebar position
floorp-custom-actions-hide-sidebar = Hide sidebar
  .label = Hide sidebar
floorp-custom-actions-show-sidebar = Toggle sidebar
  .label = Toggle sidebar
floorp-custom-actions-toggle-sidebar = Toggle sidebar
  .label = Toggle sidebar
floorp-custom-actions-open-previous-workspace = Open previous workspace
  .label = Open previous workspace
floorp-custom-actions-open-next-workspace = Open next workspace
  .label = Open next workspace
floorp-custom-actions-show-panel-1 = Toggle panel 1
  .label = Toggle panel 1
floorp-custom-actions-show-panel-2 = Toggle panel 2
  .label = Toggle panel 2
floorp-custom-actions-show-panel-3 = Toggle panel 3
  .label = Toggle panel 3
floorp-custom-actions-show-panel-4 = Toggle panel 4
  .label = Toggle panel 4
floorp-custom-actions-show-panel-5 = Toggle panel 5
  .label = Toggle panel 5
floorp-custom-actions-show-panel-6 = Toggle panel 6
  .label = Toggle panel 6
floorp-custom-actions-show-panel-7 = Toggle panel 7
  .label = Toggle panel 7
floorp-custom-actions-show-panel-8 = Toggle panel 8
  .label = Toggle panel 8
floorp-custom-actions-show-panel-9 = Toggle panel 9
  .label = Toggle panel 9
floorp-custom-actions-show-panel-10 = Toggle panel 10
  .label = Toggle panel 10
floorp-custom-actions-open-split-view-on-left = Open current tab on left in split view
  .label = Open current tab on left in split view
floorp-custom-actions-open-split-view-on-right = Open current tab on right in split view
  .label = Open current tab on right in split view
floorp-custom-actions-close-split-view = Close split view
  .label = Close split view
floorp-custom-actions-custom-action-1 = Custom action 1
  .label = Custom action 1
floorp-custom-actions-custom-action-2 = Custom action 2
  .label = Custom action 2
floorp-custom-actions-custom-action-3 = Custom action 3
  .label = Custom action 3
floorp-custom-actions-custom-action-4 = Custom action 4
  .label = Custom action 4
floorp-custom-actions-custom-action-5 = Custom action 5
  .label = Custom action 5
floorp-custom-actions-rest-mode = Enable rest mode
  .label = Enable rest mode

##################################################################### Profile Switcher ###############################################################

floorp-open-profile-with-new-instance = Launch
 .tooltiptext = Launch { -brand-short-name } with this profile
floorp-profiles-in-use = This profile is in use.
floorp-profiles-title = Profiles
floorp-profile-manager = Profile Manager
floorp-profiles-create = Create Profile
floorp-profile = Profile
 .label = Profile Manager
 .tooltiptext = Open Profile Manager
fxa-not-signed-in = Not signed in


###################################################################### Private Container ##############################################################
floorp-private-container-name = Private
floorp-toggle-private-container =
  .label = Reopen in Private/No Container
  .accesskey = P
open-in_private-container =
  .label = Open in New Tab with Private Container

######################################################################## Split View ###############################################################

floorp-split-view-menu =
 .label = Open in split view
splitview-show-on-right =
 .label = Show on right
splitview-show-on-left =
  .label = Show on left
splitview-close-split-tab =
  .label = Close split tab

######################################################################### Page Actions ###############################################################
qrcode-generate-page-action-title = Scan QR Code with your Phone
qrcode-generate-page-action =
 .tooltiptext = Share this page with your phone

######################################################################### Customize Mode ###############################################################
floorp-customize-mode-unified-extensions-button =
 .label = Unified Extensions Button

######################################################################### Progressive Web Apps (SSB) ###############################################################

ssb-page-action =
  .label = Install app
  .tooltiptext = Install this site as an app
ssb-page-action-title = Install app
ssb-app-open-button =
 .label = Open In App
ssb-app-install-button =
 .label = Install
ssb-app-cancel-button =
 .label = Cancel
floorp-open-manage-ssb-page =
  .label = Manage installed Web Apps
appmenuitem-webapps =
  .label = Web Apps
appmenu-open-installed-apps-subheader = Open installed web apps
appmenuitem-install-current-page =
  .label = Install this site as an app
appmenuitem-open-current-page =
  .label = Open this site on installed app
appmenuitem-contextmenu-open-app =
  .label = Open this app
appmenuitem-contextmenu-uninstall-app =
  .label = Uninstall this app

## Preferences
category-ssb =
  .label = Web Apps
  .tooltiptext = Web Apps
category-ssb-title = Web Apps

floorp-ssb-title = Web Apps
floorp-ssb-description = Web Apps are websites that can be installed as apps. They can be launched from { -brand-short-name }'s menu panel or the Windows Start menu.

ssb-preferences = Web Apps Settings

floorp-enable-ssb =
  .label = Enable Web Apps
floorp-enable-ssb-with-experimental =
  .label = Enable Web Apps (Experimental)
floorp-enable-ssb-description = This feature is experimental on Mac and Linux. It is recommended to enable this feature on Windows.

floorp-disable-toolbars =
  .label = Disable toolbars on Web Apps Window
floorp-disable-toolbars-description = This setting will hide all extensions and toolbars on Web Apps Window.

ssb-installed-list-title = Installed Web Apps

ssb-uninstall-title = Uninstall Web App
ssb-uninstall-message = Are you sure you want to uninstall this Web App from { -brand-short-name }?
ssb-uninstall-button =
  .label = Uninstall
ssb-uninstall-cancel = Cancel

######################################################################### Download Notification ###############################################################
floorp-started-download = Download started
floorp-finished-download = Download finished

######################################################################### Update notify ###############################################################

floorp-notificationTitle-latest = { -brand-short-name } is up to date!
floorp-notificationContent-latest = { -brand-short-name } is up to date. You are using the latest version of { -brand-short-name }.
floorp-notificationTitle = New version of { -brand-short-name } is available!
floorp-notificationContent = Click to download the latest version.