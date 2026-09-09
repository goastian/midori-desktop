# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Ad blocking

midori-blocker-header = Ad Blocking

midori-blocker-intro-description = Blocks ads, tracking scripts, and other unwanted requests for faster page loads and fewer distractions.

# Variables:
#   $count (Number) - Number of settings that could not be translated.
#   $path (String) - Local path to the migration backup.
midori-blocker-migration-warning =
    { $count ->
        [one] One previous blocker setting could not be translated. Its original data was saved at { $path }.
       *[other] { $count } previous blocker settings could not be translated. Their original data was saved at { $path }.
    }

midori-blocker-setting-on =
    .label = On

midori-blocker-setting-on-summary = Blocks ads and trackers with minimal impact on page loading.

midori-blocker-setting-on-description = Midori blocks the following:

midori-blocker-blocks-ads = Ads and ad network requests

midori-blocker-blocks-tracking = Tracking scripts and pixels

midori-blocker-blocks-annoyances = Nuisance popups and overlays (with annoyance lists enabled)

midori-blocker-setting-off =
    .label = Off

midori-blocker-setting-off-description = No ads or trackers are blocked by Midori. Third-party extensions can still block content independently.

midori-blocker-manage-filter-lists =
    .label = Manage Filter Lists…

midori-blocker-custom-filter-lists =
    .label = Custom Filter Lists…

midori-blocker-filter-lists-window =
    .title = Ad blocking filter lists

midori-blocker-filter-lists-dialog =
    .buttonlabelaccept = Save Changes
    .buttonaccesskeyaccept = S

midori-blocker-filter-lists-description =
    .value = Choose which filter lists are active.

# Variables:
#   $activeCount (Number) - Number of enabled filter lists.
#   $totalCount (Number) - Total number of available filter lists.
midori-blocker-filter-lists-active-count =
    .value = { $activeCount } active of { $totalCount }

midori-blocker-filter-lists-column-enabled =
    .label = Enabled

midori-blocker-filter-lists-column-name =
    .label = Filter List

midori-blocker-filter-lists-column-category =
    .label = Category

midori-blocker-filter-lists-enable =
    .label = Enable

midori-blocker-filter-lists-disable =
    .label = Disable

midori-blocker-extension-detected = Midori now has built-in ad blocking. You can review your setup in settings.

midori-blocker-extension-detected-learn-more =
    .label = Learn more

midori-blocker-extension-detected-dismiss =
    .label = Don’t show again

midori-blocker-extension-install-warning = Midori already has a built-in ad blocker. Running two ad blockers can cause pages to break or load slowly.

midori-blocker-extension-install-got-it =
    .label = Got it

midori-blocker-extension-install-learn-more =
    .label = Learn more

# Variables:
#   $extensionName (String) - Name of the third-party extension controlling ad blocking.
midori-blocker-third-party-notice-description = { $extensionName } is also blocking ads. Running two ad blockers can cause issues.

permissions-exceptions-midori-blocker-window2 =
    .title = Exceptions for Ad Blocking
    .style = { permissions-window2.style }

permissions-exceptions-manage-midori-blocker-desc = You can specify which websites have ad blocking turned off. Type the exact address of the site you want to manage and then click Add Exception.

midori-blocker-toolbar-button =
    .label = Ad blocking
    .tooltiptext = Ad blocking

midori-blocker-panel-not-available = Not available on this page

midori-blocker-panel-disabled = Ad blocking is off

# Variables:
#   $count (Number) - Number of requests blocked on this page.
midori-blocker-panel-hero-count = { $count } blocked

midori-blocker-panel-hero-paused = Paused

# Variables:
#   $host (String) - Host of the current page.
midori-blocker-panel-hero-subtitle = on { $host }

midori-blocker-panel-category-ads = Ads

midori-blocker-panel-category-trackers = Trackers

midori-blocker-panel-category-popups = Pop-ups

midori-blocker-panel-see-all = See everything blocked

midori-blocker-panel-toggle2 =
    .label = Block ads on this site

midori-blocker-panel-paused-card = This site is on your allowlist. Ads, pop-ups, and trackers can load until you turn blocking back on.

midori-blocker-panel-allowlist = Manage allowlist

# Variables:
#   $count (Number) - Number of sites on the allowlist.
midori-blocker-panel-allowlist-count =
    { $count ->
        [one] { $count } site
       *[other] { $count } sites
    }

# Variables:
#   $count (Number) - Number of requests blocked since installation.
#   $size (String) - Localized estimate of data saved, e.g. "41 MB".
midori-blocker-panel-footer-stats = <b data-l10n-name="total">{ $count }</b> blocked all time · { $size } saved

midori-blocker-panel-footer-settings = Settings

midori-blocker-panel-back =
    .aria-label = Back

midori-blocker-panel-detail-title = Blocked on this page

midori-blocker-panel-detail-section-ads = Advertising

midori-blocker-panel-detail-section-trackers = Trackers

midori-blocker-panel-detail-section-popups = Pop-ups

# Variables:
#   $count (Number) - Number of blocked pop-up windows.
midori-blocker-panel-detail-popup-note =
    { $count ->
        [one] { $count } pop-up window was blocked automatically.
       *[other] { $count } pop-up windows were blocked automatically.
    }

# Variables:
#   $domain (String) - Domain the user can allow on the current site.
midori-blocker-panel-allow-domain = Allow
    .aria-label = Allow { $domain }

# Variables:
#   $count (Number) - Number of times requests to the domain were blocked.
midori-blocker-panel-domain-count = ×{ $count }

midori-blocker-show-badge-pref =
    .label = Show blocked count on toolbar button

midori-blocker-show-button-pref =
    .label = Show ad blocker button in the toolbar

midori-blocker-filter-lists-category-core = Default

midori-blocker-filter-lists-category-privacy = Privacy

midori-blocker-filter-lists-category-annoyances = Annoyances

midori-blocker-filter-lists-category-optional = Optional

midori-blocker-filter-lists-category-regional = Regional

midori-blocker-filter-lists-search =
    .placeholder = Search filter lists…

midori-blocker-filter-lists-empty-state = No filter lists available.

midori-blocker-filter-lists-refresh-now =
    .label = Refresh Now

midori-blocker-filter-lists-restore-defaults =
    .label = Restore defaults
    .accesskey = R

# Variables:
#   $date (String) - Human-readable date/time of the last successful list update.
midori-blocker-filter-lists-last-updated = Updated { $date }

midori-blocker-filter-lists-never-updated =
    .value = Not yet updated

# Variables:
#   $date (String) - Human-readable date/time of the next scheduled list update.
midori-blocker-filter-lists-next-refresh =
    .value = Next refresh: { $date }

midori-blocker-filter-lists-next-refresh-unknown =
    .value = Next refresh: unknown

midori-blocker-custom-filter-lists-window =
    .title = Custom Filter Lists

midori-blocker-custom-filter-lists-dialog =
    .buttonlabelaccept = Save Changes
    .buttonaccesskeyaccept = S

midori-blocker-custom-filter-lists-description = Add URLs of custom filter lists. Lists will be fetched and applied alongside built-in filters.

midori-blocker-filter-lists-custom-heading =
    .value = Custom Filter Lists

midori-blocker-filter-lists-custom-input =
    .placeholder = Enter filter list URL…

midori-blocker-filter-lists-custom-url-label =
    .value = Filter list URL

midori-blocker-filter-lists-custom-col =
    .label = URL

midori-blocker-filter-lists-custom-add =
    .label = Add

midori-blocker-filter-lists-custom-remove =
    .label = Remove

midori-blocker-filter-lists-custom-remove-all =
    .label = Remove All

midori-blocker-filter-lists-custom-empty =
    .value = No custom filter lists added.

midori-blocker-custom-list-limit-title = Custom list limit reached
midori-blocker-custom-list-limit-message = Midori supports up to { $count } custom filter lists.

midori-blocker-custom-filters =
    .label = My Filters…

midori-blocker-custom-filters-window =
    .title = My Filters

midori-blocker-custom-filters-dialog =
    .buttonlabelaccept = Save Changes
    .buttonaccesskeyaccept = S

midori-blocker-custom-filters-description = Add your own ad blocking rules. These use standard uBlock Origin filter syntax and are applied alongside your enabled filter lists.

midori-blocker-custom-filters-enabled =
    .label = Enable custom filters
    .accesskey = E

midori-blocker-custom-filters-empty =
    .value = No custom filters.

# Variables:
#   $count (Number) - Number of custom filters currently configured.
midori-blocker-custom-filters-status =
    { $count ->
        [0] No custom filters.
        [one] 1 custom filter.
       *[other] { $count } custom filters.
    }

midori-blocker-custom-filters-status-unsaved = Unsaved changes.

midori-blocker-custom-filters-import =
    .label = Import…

midori-blocker-custom-filters-export =
    .label = Export…

midori-blocker-custom-filters-load-error-title = Load failed

midori-blocker-custom-filters-load-error = Custom filters could not be loaded.

midori-blocker-custom-filters-save-error-title = Save failed

midori-blocker-custom-filters-save-error = Custom filters could not be saved.

midori-blocker-custom-filters-import-error-title = Import failed

midori-blocker-custom-filters-import-error = The selected file could not be imported.

midori-blocker-custom-filters-export-error-title = Export failed

midori-blocker-custom-filters-export-error = Custom filters could not be exported.

midori-blocker-custom-filters-import-picker-title = Import custom filters

midori-blocker-custom-filters-export-picker-title = Export custom filters

midori-blocker-custom-filters-import-replace-title = Replace current filters?

midori-blocker-custom-filters-import-replace-message = Importing will replace everything currently in the editor.

midori-blocker-extension-fallback-name-this = this extension

midori-blocker-extension-fallback-name-your = your extension

midori-blocker-spotlight-title = Midori now includes ad blocking

# Variables:
#   $extensionName (String) - Name of the user’s existing ad-blocking extension.
midori-blocker-spotlight-subtitle = We noticed you have { $extensionName } installed. Midori now has its own ad blocker. Using it helps support Midori, but it’s your call.

midori-blocker-spotlight-primary-button = Keep my current setup

midori-blocker-spotlight-secondary-button = Review settings

midori-blocker-prompt-title = Midori ad blocking

# Variables:
#   $extensionName (String) - Name of the extension that conflicts with built-in ad blocking.
midori-blocker-reenable-conflict-message = Running both Midori ad blocking and “{ $extensionName }” can cause pages to break. Which would you like to keep?

midori-blocker-reenable-use-built-in = Use built-in blocker

midori-blocker-reenable-keep-extension = Keep extension blocker

midori-blocker-extension-install-manage-settings = You can manage ad blocking in Settings > Privacy & Security.

midori-blocker-extension-install-anyway = Install anyway

midori-blocker-extension-install-keep-built-in = Keep using built-in blocker

pane-midori-blocker-title = Ad Blocking
    .title = { pane-midori-blocker-title }

midori-blocker-pane-header =
    .heading = Ad Blocking

midori-blocker-group =
    .label = Ad blocking
    .description = Blocks ads, tracking scripts, and other unwanted requests for faster page loads and fewer distractions.

midori-blocker-enabled-toggle =
    .label = Block ads and trackers
    .description = Blocks ads and trackers with minimal impact on page loading.

# Variables:
#   $extensionName (String) - Name of the third-party extension that also blocks ads.
midori-blocker-extension-notice =
    .message = { $extensionName } is also blocking ads. Running two ad blockers can cause issues.

midori-blocker-lists-group =
    .label = Filter lists

midori-blocker-manage-lists-button =
    .label = Manage filter lists

midori-blocker-custom-lists-button =
    .label = Custom filter lists

midori-blocker-my-filters-button =
    .label = My filters

midori-blocker-exceptions-group =
    .label = Exceptions

midori-blocker-exceptions-button =
    .label = Manage exceptions

midori-blocked-page-title = Midori blocked this page

midori-blocked-page-heading = Midori blocked this page

midori-blocked-page-description = This page was blocked by an ad blocking filter rule.

midori-blocked-page-details =
    .aria-label = Blocked page details

midori-blocked-page-blocked-url-label = Blocked URL

midori-blocked-page-unavailable = Unavailable

midori-blocked-page-hint = “Load anyway” will temporarily allow this site for the rest of your session.

midori-blocked-page-go-back = Go back

midori-blocked-page-load-anyway = Load anyway
