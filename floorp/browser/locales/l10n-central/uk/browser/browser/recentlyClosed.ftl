# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## These strings are used in the main menu,
## and should follow the same capitalization (title case for English).
## Check menubar.ftl for reference.

recently-closed-menu-reopen-all-tabs = Знову відкрити всі вкладки
recently-closed-menu-reopen-all-windows = Знову відкрити всі вікна

## These strings are used in the app menu,
## and should follow the same capitalization (sentence case for English).
## Check appmenu.ftl for reference.

recently-closed-panel-reopen-all-tabs = Знову відкрити всі вкладки
recently-closed-panel-reopen-all-windows = Знову відкрити всі вікна

##

# Variables:
#   $tabCount (Number): Number of other tabs
#   $winTitle (String): Window title
recently-closed-undo-close-window-label =
    { $tabCount ->
        [0] { $winTitle }
        [one] { $winTitle } (та { $tabCount } інша вкладка)
        [few] { $winTitle } (та { $tabCount } інших вкладки)
       *[many] { $winTitle } (та { $tabCount } інших вкладок)
    }
