# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### This file contains the entities needed to use the Find Bar.

findbar-next =
    .tooltiptext = Bir sonraki eşleşen kelimeyi bulur
findbar-previous =
    .tooltiptext = Bir önceki eşleşen kelimeyi bulur

findbar-find-button-close =
    .tooltiptext = Arama çubuğunu kapat

findbar-highlight-all2 =
    .label = Tümünü vurgula
    .accesskey =
        { PLATFORM() ->
            [macos] T
           *[other] T
        }
    .tooltiptext = Terimin geçtiği her yeri işaretle

findbar-case-sensitive =
    .label = Büyük-küçük harfe duyarlı
    .accesskey = h
    .tooltiptext = Büyük-küçük harfe duyarlı ara

findbar-match-diacritics =
    .label = Fonetik işaretleri bul
    .accesskey = F
    .tooltiptext = Fonetik işaretli harflerle baz harflerini ayrı tut (Örneğin “kar” araması yaptığınızda “kâr” bulunmayacaktır.)

findbar-entire-word =
    .label = Tam sözcükler
    .accesskey = s
    .tooltiptext = Yalnızca tam sözcükleri ara

findbar-not-found = Eşleşme bulunamadı

findbar-wrapped-to-top = Sayfanın sonuna gelindi, baştan devam edildi
findbar-wrapped-to-bottom = Sayfa başına gelindi, sondan devam edildi

findbar-normal-find =
    .placeholder = Sayfada bul
findbar-fast-find =
    .placeholder = Çabuk bul
findbar-fast-find-links =
    .placeholder = Çabuk bul (sadece bağlantılar)

findbar-case-sensitive-status =
    .value = (Büyük-küçük harfe duyarlı)
findbar-match-diacritics-status =
    .value = (Fonetik işaretler eşleştiriliyor)
findbar-entire-word-status =
    .value = (Yalnızca tam sözcükler)

# Variables:
#   $current (Number): Index of the currently selected match
#   $total (Number): Total count of matches
findbar-found-matches =
    .value =
        { $total ->
            [one] { $total } eşleşmeden { $current }. eşleşme
           *[other] { $total } eşleşmeden { $current }. eşleşme
        }

# Variables:
#   $limit (Number): Total count of matches allowed before counting stops
findbar-found-matches-count-limit =
    .value =
        { $limit ->
            [one] { $limit } eşleşmeden fazla
           *[other] { $limit } eşleşmeden fazla
        }
