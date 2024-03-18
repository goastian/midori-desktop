# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Messages used as headers in the main pane

compatibility-selected-element-header = Seçili eleman
compatibility-all-elements-header = Tüm sorunlar

## Message used as labels for the type of issue

compatibility-issue-deprecated = (kullanımdan kaldırıldı)
compatibility-issue-experimental = (deneysel)
compatibility-issue-prefixneeded = (ön ek gerekli)
compatibility-issue-deprecated-experimental = (kullanımdan kaldırıldı, deneysel)
compatibility-issue-deprecated-prefixneeded = (kullanımdan kaldırıldı, ön ek gerekli)
compatibility-issue-experimental-prefixneeded = (deneysel, ön ek gerekli)
compatibility-issue-deprecated-experimental-prefixneeded = (kullanımdan kaldırıldı, deneysel, ön ek gerekli)

## Messages used as labels and titles for buttons in the footer

compatibility-settings-button-label = Ayarlar
compatibility-settings-button-title =
    .title = Ayarlar

## Messages used as headers in settings pane

compatibility-settings-header = Ayarlar
compatibility-target-browsers-header = Hedef tarayıcılar

##

# Text used as the label for the number of nodes where the issue occurred
# Variables:
#   $number (Number) - The number of nodes where the issue occurred
compatibility-issue-occurrences =
    { $number ->
        [one] { $number } tekrar
       *[other] { $number } tekrar
    }

compatibility-no-issues-found = Uyumluluk sorunu bulunamadı.
compatibility-close-settings-button =
    .title = Ayarları kapat

# Text used in the element containing the browser icons for a given compatibility issue.
# Line breaks are significant.
# Variables:
#   $browsers (String) - A line-separated list of browser information (e.g. Firefox 98\nChrome 99).
compatibility-issue-browsers-list =
    .title =
        Uyumluluk sorunları:
        { $browsers }
