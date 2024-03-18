# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this file,
# You can obtain one at http://mozilla.org/MPL/2.0/.

places-open =
    .label = Aç
    .accesskey = A
places-open-in-tab =
    .label = Yeni sekmede aç
    .accesskey = Y
places-open-in-container-tab =
    .label = Yeni kapsayıcı sekmede aç
    .accesskey = k
places-open-all-bookmarks =
    .label = Tüm yer imlerini aç
    .accesskey = T
places-open-all-in-tabs =
    .label = Tümünü sekmelerde aç
    .accesskey = m
places-open-in-window =
    .label = Yeni pencerede aç
    .accesskey = i
places-open-in-private-window =
    .label = Yeni gizli pencerede aç
    .accesskey = z

places-empty-bookmarks-folder =
    .label = (Boş)

places-add-bookmark =
    .label = Yer imi ekle…
    .accesskey = m
places-add-folder-contextmenu =
    .label = Klasör ekle…
    .accesskey = ö
places-add-folder =
    .label = Klasör ekle…
    .accesskey = ö
places-add-separator =
    .label = Ayraç ekle
    .accesskey = A

places-view =
    .label = Görünüm
    .accesskey = G
places-by-date =
    .label = Tarih
    .accesskey = T
places-by-site =
    .label = Site
    .accesskey = S
places-by-most-visited =
    .label = En çok ziyaret edilenler
    .accesskey = E
places-by-last-visited =
    .label = Son ziyaret edilenler
    .accesskey = S
places-by-day-and-site =
    .label = Tarih ve site
    .accesskey = T

places-history-search =
    .placeholder = Geçmişte ara
places-history =
    .aria-label = Geçmiş
places-bookmarks-search =
    .placeholder = Yer imlerinde ara

places-delete-domain-data =
    .label = Bu siteyi unut
    .accesskey = u
places-sortby-name =
    .label = Ada göre sırala
    .accesskey = R
# places-edit-bookmark and places-edit-generic will show one or the other and can have the same access key.
places-edit-bookmark =
    .label = Yer imini düzenle…
    .accesskey = d
places-edit-generic =
    .label = Düzenle…
    .accesskey = D
places-edit-folder2 =
    .label = Klasörü düzenle…
    .accesskey = d
places-delete-folder =
    .label =
        { $count ->
            [1] Klasörü sil
            [one] Klasörü sil
           *[other] Klasörleri sil
        }
    .accesskey = s
# Variables:
#   $count (number) - The number of pages selected for removal.
places-delete-page =
    .label =
        { $count ->
            [1] Sayfayı sil
           *[other] Sayfaları sil
        }
    .accesskey = S

# Managed bookmarks are created by an administrator and cannot be changed by the user.
managed-bookmarks =
    .label = Yönetilen yer imleri
# This label is used when a managed bookmarks folder doesn't have a name.
managed-bookmarks-subfolder =
    .label = Alt klasör

# This label is used for the "Other Bookmarks" folder that appears in the bookmarks toolbar.
other-bookmarks-folder =
    .label = Diğer yer imleri

places-show-in-folder =
    .label = Klasörde göster
    .accesskey = K

# Variables:
# $count (number) - The number of elements being selected for removal.
places-delete-bookmark =
    .label =
        { $count ->
            [1] Yer imini sil
            [one] Yer imini sil
           *[other] Yer imlerini sil
        }
    .accesskey = s

# Variables:
#   $count (number) - The number of bookmarks being added.
places-create-bookmark =
    .label =
        { $count ->
            [1] Yer imlerine ekle…
           *[other] Yer imlerine ekle…
        }
    .accesskey = m

places-untag-bookmark =
    .label = Etiketi kaldır
    .accesskey = K

places-manage-bookmarks =
    .label = Yer imlerini yönet
    .accesskey = n

places-forget-about-this-site-confirmation-title = Bu siteyi unut

# Variables:
# $hostOrBaseDomain (string) - The base domain (or host in case there is no base domain) for which data is being removed
places-forget-about-this-site-confirmation-msg = Bu işlem; { $hostOrBaseDomain } sitesine ait gezinti geçmişini, çerezleri, önbelleği ve içerik tercihlerini kaldıracaktır. İlgili yer imleri ve parolalar kaldırılmayacaktır. Devam etmek istediğinizden emin misiniz?

places-forget-about-this-site-forget = Unut

places-library3 =
    .title = Arşiv

places-organize-button =
    .label = Düzenle
    .tooltiptext = Yer imlerinizi düzenleyin
    .accesskey = D

places-organize-button-mac =
    .label = Düzenle
    .tooltiptext = Yer imlerinizi düzenleyin

places-file-close =
    .label = Kapat
    .accesskey = K

places-cmd-close =
    .key = w

places-view-button =
    .label = Görünümler
    .tooltiptext = Görünümünüzü değiştirin
    .accesskey = G

places-view-button-mac =
    .label = Görünümler
    .tooltiptext = Görünümünüzü değiştirin

places-view-menu-columns =
    .label = Sütunları göster
    .accesskey = ü

places-view-menu-sort =
    .label = Sırala
    .accesskey = S

places-view-sort-unsorted =
    .label = Sıralanmamış
    .accesskey = r

places-view-sort-ascending =
    .label = A’dan Z’ye sırala
    .accesskey = A

places-view-sort-descending =
    .label = Z’den A’ya sırala
    .accesskey = Z

places-maintenance-button =
    .label = İçe aktarma ve yedekleme
    .tooltiptext = Yer imlerinizi içe aktarın ve yedekleyin
    .accesskey = m

places-maintenance-button-mac =
    .label = İçe aktarma ve yedekleme
    .tooltiptext = Yer imlerinizi içe aktarın ve yedekleyin

places-cmd-backup =
    .label = Yedekle…
    .accesskey = Y

places-cmd-restore =
    .label = Geri yükle
    .accesskey = G

places-cmd-restore-from-file =
    .label = Dosya seç…
    .accesskey = D

places-import-bookmarks-from-html =
    .label = Yer imlerini HTML’den içe aktar…
    .accesskey = H

places-export-bookmarks-to-html =
    .label = Yer imlerini HTML olarak dışa aktar…
    .accesskey = M

places-import-other-browser =
    .label = Başka bir tarayıcıdaki verileri içe aktar…
    .accesskey = B

places-view-sort-col-name =
    .label = Adı

places-view-sort-col-tags =
    .label = Etiketler

places-view-sort-col-url =
    .label = Konum

places-view-sort-col-most-recent-visit =
    .label = Son ziyaret

places-view-sort-col-visit-count =
    .label = Ziyaret sayısı

places-view-sort-col-date-added =
    .label = Ekleme tarihi

places-view-sort-col-last-modified =
    .label = Son değişiklik

places-view-sortby-name =
    .label = İsme göre sırala
    .accesskey = s
places-view-sortby-url =
    .label = Konuma göre sırala
    .accesskey = K
places-view-sortby-date =
    .label = Son ziyarete göre sırala
    .accesskey = z
places-view-sortby-visit-count =
    .label = Ziyaret sayısına göre sırala
    .accesskey = a
places-view-sortby-date-added =
    .label = Ekleme tarihine göre sırala
    .accesskey = E
places-view-sortby-last-modified =
    .label = Son değişiklik tarihine göre sırala
    .accesskey = d
places-view-sortby-tags =
    .label = Etiketlere göre sırala
    .accesskey = t

places-cmd-find-key =
    .key = f

places-back-button =
    .tooltiptext = Geriye gider

places-forward-button =
    .tooltiptext = İleriye gider

places-details-pane-select-an-item-description = Özelliklerini görmek ve değiştirmek için bir öğe seçin

places-details-pane-no-items =
    .value = Öğe yok
# Variables:
#   $count (Number): number of items
places-details-pane-items-count =
    .value =
        { $count ->
            [one] { $count } öğe
           *[other] { $count } öğe
        }

## Strings used as a placeholder in the Library search field. For example,
## "Search History" stands for "Search through the browser's history".

places-search-bookmarks =
    .placeholder = Yer imlerinde ara
places-search-history =
    .placeholder = Geçmişte ara
places-search-downloads =
    .placeholder = İndirilenlerde ara

##

places-locked-prompt = { -brand-short-name } uygulamasına ait dosyalardan biri başka bir uygulama tarafından kullanılmakta olduğundan, yer imi ve geçmiş sistemi çalışmayacak. Bazı güvenlik yazılımları bu soruna sebep olabilir.
