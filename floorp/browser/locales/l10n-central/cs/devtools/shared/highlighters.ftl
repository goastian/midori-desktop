# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### This file contains strings used in highlighters.
### Highlighters are visualizations that DevTools draws on top of content to aid
### in understanding content sizing, etc.

# The row and column position of a grid cell shown in the grid cell infobar when hovering
# over the CSS grid outline.
# Variables
# $row (integer) - The row index
# $column (integer) - The column index
grid-row-column-positions = Řádek { $row } / Sloupec { $column }
# The layout type of an element shown in the infobar when hovering over a DOM element and
# it is a grid container.
gridtype-container = Kontejner zobrazení grid
# The layout type of an element shown in the infobar when hovering over a DOM element and
# it is a grid item.
gridtype-item = Položka zobrazení grid
# The layout type of an element shown in the infobar when hovering over a DOM element and
# it is both a grid container and a grid item.
gridtype-dual = Kontejner/položka zobrazení grid
# The layout type of an element shown in the infobar when hovering over a DOM element and
# it is a flex container.
flextype-container = Kontejner zobrazení flex
# The layout type of an element shown in the infobar when hovering over a DOM element and
# it is a flex item.
flextype-item = Položka zobrazení flex
# The layout type of an element shown in the infobar when hovering over a DOM element and
# it is both a flex container and a flex item.
flextype-dual = Kontejner/položka zobrazení flex
# Text displayed in `remote-node-picker-notice`, when the remote page is on desktop
remote-node-picker-notice-action-desktop = Klepnutím na prvek jej vyberete v Průzkumníku
# The text displayed in the button that is in the notice in the content page when the user
# clicks on the "Pick an element from the page" in about:devtools-toolbox inspector panel,
# when debugging a remote page.
remote-node-picker-notice-hide-button = Skrýt
# Text displayed in a button inside the "simple-highlighters-message" toolbox
# notification. "Settings" here refers to the DevTools settings panel.
simple-highlighters-settings-button = Otevřít nastavení
