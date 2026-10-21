# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Workspace switcher at the bottom of the vertical tabs sidebar

midori-workspaces-new =
    .tooltiptext = New Workspace
    .aria-label = New Workspace

midori-workspaces-sync-capacity =
    .label =
        { $count ->
            [one] One more workspace is waiting for space
           *[other] { $count } more workspaces are waiting for space
        }
    .tooltiptext = This window can show 25 workspaces. Make room to show the workspaces saved by Sync.
