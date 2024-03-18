# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

blocklist-window2 =
    .title = Engelleme Listeleri
    .style = min-width: 55em

blocklist-description = { -brand-short-name } tarayıcınızın çevrimiçi takip kodlarını engellemek için kullanacağı listeyi seçin. Listeler <a data-l10n-name="disconnect-link" title="Disconnect">Disconnect</a> tarafından sağlanmaktadır.
blocklist-close-key =
    .key = w

blocklist-treehead-list =
    .label = Liste

blocklist-dialog =
    .buttonlabelaccept = Değişiklikleri kaydet
    .buttonaccesskeyaccept = D


# This template constructs the name of the block list in the block lists dialog.
# It combines the list name and description.
# e.g. "Standard (Recommended). This list does a pretty good job."
#
# Variables:
#   $listName {string, "Standard (Recommended)."} - List name.
#   $description {string, "This list does a pretty good job."} - Description of the list.
blocklist-item-list-template = { $listName } { $description }

blocklist-item-moz-std-listName = 1. seviye engelleme listesi (Önerilir).
blocklist-item-moz-std-description = Daha az sitede sorun yaşamanız için bazı takip kodlarına izin verir.
blocklist-item-moz-full-listName = 2. seviye engelleme listesi.
blocklist-item-moz-full-description = Algılanan tüm takip kodlarını engeller. Bazı web siteleri veya içerikler düzgün yüklenmeyebilir.
