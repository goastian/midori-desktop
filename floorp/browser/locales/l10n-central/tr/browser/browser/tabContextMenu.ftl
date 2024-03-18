# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

tab-context-new-tab =
    .label = Yeni sekme
    .accesskey = Y
reload-tab =
    .label = Sekmeyi tazele
    .accesskey = z
select-all-tabs =
    .label = Tüm sekmeleri seç
    .accesskey = ü
tab-context-play-tab =
    .label = Sekmeyi oynat
    .accesskey = o
tab-context-play-tabs =
    .label = Sekmeleri oynat
    .accesskey = o
duplicate-tab =
    .label = Sekmeyi çoğalt
    .accesskey = o
duplicate-tabs =
    .label = Sekmeleri çoğalt
    .accesskey = o
# The following string is displayed on a menuitem that will close the tabs from the start of the tabstrip to the currently targeted tab (excluding the currently targeted and any other selected tabs).
# In left-to-right languages this should use "Left" and in right-to-left languages this should use "Right".
close-tabs-to-the-start =
    .label = Soldaki sekmeleri kapat
    .accesskey = o
# The following string is displayed on a menuitem that will close the tabs from the end of the tabstrip to the currently targeted tab (excluding the currently targeted and any other selected tabs).
# In left-to-right languages this should use "Right" and in right-to-left languages this should use "Left".
close-tabs-to-the-end =
    .label = Sağdaki sekmeleri kapat
    .accesskey = a
close-other-tabs =
    .label = Diğer sekmeleri kapat
    .accesskey = D
reload-tabs =
    .label = Sekmeleri tazele
    .accesskey = z
pin-tab =
    .label = Sekmeyi sabitle
    .accesskey = S
unpin-tab =
    .label = Normal sekmeye dönüştür
    .accesskey = N
pin-selected-tabs =
    .label = Sekmeleri sabitle
    .accesskey = S
unpin-selected-tabs =
    .label = Normal sekmeye dönüştür
    .accesskey = N
bookmark-selected-tabs =
    .label = Sekmeleri yer imlerine ekle…
    .accesskey = r
tab-context-bookmark-tab =
    .label = Sekmeyi yer imlerine ekle…
    .accesskey = m
tab-context-open-in-new-container-tab =
    .label = Yeni kapsayıcı sekmede aç
    .accesskey = k
move-to-start =
    .label = En başa taşı
    .accesskey = E
move-to-end =
    .label = En sona taşı
    .accesskey = s
move-to-new-window =
    .label = Yeni pencereye taşı
    .accesskey = Y
tab-context-close-multiple-tabs =
    .label = Birden çok sekmeyi kapat
    .accesskey = B
tab-context-share-url =
    .label = Paylaş
    .accesskey = P

## Variables:
##  $tabCount (Number): the number of tabs that are affected by the action.

tab-context-reopen-closed-tabs =
    .label =
        { $tabCount ->
            [1] Kapatılan sekmeyi yeniden aç
            [one] Kapatılan sekmeyi yeniden aç
           *[other] Kapatılan sekmeleri yeniden aç
        }
    .accesskey = d
tab-context-close-n-tabs =
    .label =
        { $tabCount ->
            [1] Sekmeyi kapat
            [one] { $tabCount } sekmeyi kapat
           *[other] { $tabCount } sekmeyi kapat
        }
    .accesskey = e
tab-context-move-tabs =
    .label =
        { $tabCount ->
            [1] Sekmeyi taşı
            [one] Sekmeleri taşı
           *[other] Sekmeleri taşı
        }
    .accesskey = t

tab-context-send-tabs-to-device =
    .label =
        { $tabCount ->
            [one] Sekmeyi cihaza gönder
           *[other] { $tabCount } sekmeyi cihaza gönder
        }
    .accesskey = n
