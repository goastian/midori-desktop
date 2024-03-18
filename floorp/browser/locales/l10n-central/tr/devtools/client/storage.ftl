# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### These strings are used inside the Storage Inspector.

# Key shortcut used to focus the filter box on top of the data view
storage-filter-key = CmdOrCtrl+F

# Hint shown when the selected storage host does not contain any data
storage-table-empty-text = Seçilen sunucu için veri yok

# Hint shown when the cookies storage type is selected. Clicking the link will open
# https://developer.mozilla.org/docs/Tools/Storage_Inspector/Cookies
storage-table-type-cookies-hint = Bir sunucu seçerek çerezleri görüntüleyin ve düzenleyin. <a data-l10n-name="learn-more-link">Daha fazla bilgi al</a>

# Hint shown when the local storage type is selected. Clicking the link will open
# https://developer.mozilla.org/docs/Tools/Storage_Inspector/Local_Storage_Session_Storage
storage-table-type-localstorage-hint = Bir sunucu seçerek yerel depoyu görüntüleyin ve düzenleyin. <a data-l10n-name="learn-more-link">Daha fazla bilgi al</a>

# Hint shown when the session storage type is selected. Clicking the link will open
# https://developer.mozilla.org/docs/Tools/Storage_Inspector/Local_Storage_Session_Storage
storage-table-type-sessionstorage-hint = Bir sunucu seçerek oturum deposunu görüntüleyin ve düzenleyin. <a data-l10n-name="learn-more-link">Daha fazla bilgi al</a>

# Hint shown when the IndexedDB storage type is selected. Clicking the link will open
# https://developer.mozilla.org/docs/Tools/Storage_Inspector/IndexedDB
storage-table-type-indexeddb-hint = Bir sunucu seçerek IndexedDB girdilerini görüntüleyin ve silin. <a data-l10n-name="learn-more-link">Daha fazla bilgi al</a>

# Hint shown when the cache storage type is selected. Clicking the link will open
# https://developer.mozilla.org/docs/Tools/Storage_Inspector/Cache_Storage
storage-table-type-cache-hint = Bir sunucu seçerek önbellek deposunu görüntüleyin ve düzenleyin. <a data-l10n-name="learn-more-link">Daha fazla bilgi al</a>

# Hint shown when the extension storage type is selected. Clicking the link will open
# https://developer.mozilla.org/docs/Tools/Storage_Inspector/Extension_Storage
storage-table-type-extensionstorage-hint = Bir sunucu seçerek uzantı deposunu görüntüleyin ve düzenleyin. <a data-l10n-name="learn-more-link">Daha fazla bilgi al</a>

# Placeholder for the searchbox that allows you to filter the table items
storage-search-box =
    .placeholder = Öğeleri filtrele

# Placeholder text in the sidebar search box
storage-variable-view-search-box =
    .placeholder = Değerleri filtrele

# Add Item button title
storage-add-button =
    .title = Öğe ekle

# Refresh button title
storage-refresh-button =
    .title = Öğeleri tazele

# Context menu action to delete all storage items
storage-context-menu-delete-all =
    .label = Tümünü sil

# Context menu action to delete all session cookies
storage-context-menu-delete-all-session-cookies =
    .label = Tüm oturum çerezlerini sil

# Context menu action to copy a storage item
storage-context-menu-copy =
    .label = Kopyala

# Context menu action to delete storage item
# Variables:
#   $itemName (String) - Name of the storage item that will be deleted
storage-context-menu-delete =
    .label = “{ $itemName }” öğesini sil

# Context menu action to add an item
storage-context-menu-add-item =
    .label = Öğe ekle

# Context menu action to delete all storage items from a given host
# Variables:
#   $host (String) - Host for which we want to delete the items
storage-context-menu-delete-all-from =
    .label = “{ $host }” içindeki her şeyi sil

## Header names of the columns in the Storage Table for each type of storage available
## through the Storage Tree to the side.

storage-table-headers-cookies-name = Adı
storage-table-headers-cookies-value = Değer
storage-table-headers-cookies-expires = Sona erme / max-age
storage-table-headers-cookies-size = Boyut
storage-table-headers-cookies-last-accessed = Son erişim
storage-table-headers-cookies-creation-time = Oluşturma
storage-table-headers-cache-status = Durum
storage-table-headers-extension-storage-area = Depolama alanı

## Labels for Storage type groups present in the Storage Tree, like cookies, local storage etc.

storage-tree-labels-cookies = Çerezler
storage-tree-labels-local-storage = Yerel depo
storage-tree-labels-session-storage = Oturum deposu
storage-tree-labels-indexed-db = Indexed DB
storage-tree-labels-cache = Önbellek deposu
storage-tree-labels-extension-storage = Uzantı depolaması

##

# Tooltip for the button that collapses the right panel in the
# storage UI when the panel is closed.
storage-expand-pane =
    .title = Bölmeyi genişlet

# Tooltip for the button that collapses the right panel in the
# storage UI when the panel is open.
storage-collapse-pane =
    .title = Bölmeyi daralt

# String displayed in the expires column when the cookie is a Session Cookie
storage-expires-session = Oturum

# Heading displayed over the item value in the sidebar
storage-data = Veri

# Heading displayed over the item parsed value in the sidebar
storage-parsed-value = İşlenen değer

# Warning notification when IndexedDB database could not be deleted immediately.
# Variables:
#   $dbName (String) - Name of the database
storage-idb-delete-blocked = Tüm bağlantılar kapatıldıktan sonra “{ $dbName }” veritabanı silinecektir.

# Error notification when IndexedDB database could not be deleted.
# Variables:
#   $dbName (String) - Name of the database
storage-idb-delete-error = “{ $dbName }” veritabanı silinemedi.
