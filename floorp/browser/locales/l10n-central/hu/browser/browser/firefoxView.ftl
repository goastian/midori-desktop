# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

toolbar-button-firefox-view =
    .label = { -firefoxview-brand-name }
    .tooltiptext = { -firefoxview-brand-name }
menu-tools-firefox-view =
    .label = { -firefoxview-brand-name }
    .accesskey = F
firefoxview-page-title = { -firefoxview-brand-name }
firefoxview-close-button =
    .title = Bezárás
    .aria-label = Bezárás
# Used instead of the localized relative time when a timestamp is within a minute or so of now
firefoxview-just-now-timestamp = Épp most
# This is a headline for an area in the product where users can resume and re-open tabs they have previously viewed on other devices.
firefoxview-tabpickup-header = Lap átvétele
firefoxview-tabpickup-description = Lapok megnyitása más eszközökről.
# Variables:
#  $percentValue (Number): the percentage value for setup completion
firefoxview-tabpickup-progress-label = { $percentValue }% kész
firefoxview-tabpickup-step-signin-header = Váltson zökkenőmentesen az eszközök között
firefoxview-tabpickup-step-signin-description = Ha itt szeretné átvenni a telefonja lapjait, először jelentkezzen be, vagy hozzon létre egy fiókot.
firefoxview-tabpickup-step-signin-primarybutton = Folytatás
firefoxview-tabpickup-adddevice-header = Szinkronizálja a telefonján vagy a táblagépén lévő { -brand-product-name(case: "accusative") }
firefoxview-tabpickup-adddevice-description = Töltse le a mobilos { -brand-product-name(case: "accusative") }, és jelentkezzen be.
firefoxview-tabpickup-adddevice-learn-how = Tudja meg hogyan
firefoxview-tabpickup-adddevice-primarybutton = Szerezze be a mobilos { -brand-product-name(case: "accusative") }
firefoxview-tabpickup-synctabs-header = Lapszinkronizálás bekapcsolása
firefoxview-tabpickup-synctabs-description = Engedélyezés, hogy a { -brand-short-name } lapokat osszon meg az eszközök között
firefoxview-tabpickup-synctabs-learn-how = Tudja meg hogyan
firefoxview-tabpickup-synctabs-primarybutton = Nyitott lapok szinkronizálása
firefoxview-tabpickup-fxa-admin-disabled-header = A szervezete letiltotta a szinkronizálást
firefoxview-tabpickup-fxa-admin-disabled-description = A { -brand-short-name } nem tudja szinkronizálni a lapokat az eszközök között, mert a rendszergazda letiltotta a szinkronizálást.
firefoxview-tabpickup-network-offline-header = Ellenőrizze internetkapcsolatát
firefoxview-tabpickup-network-offline-description = Ha tűzfalat vagy proxyt használ, ellenőrizze, hogy a { -brand-short-name } jogosult-e a web elérésére.
firefoxview-tabpickup-network-offline-primarybutton = Próbálja újra
firefoxview-tabpickup-sync-error-header = Problémáink vannak a szinkronizálással
firefoxview-tabpickup-generic-sync-error-description = A { -brand-short-name } jelenleg nem tudja elérni a szinkronizálási szolgáltatást. Próbálja újra néhány pillanat múlva.
firefoxview-tabpickup-sync-error-primarybutton = Próbálja újra
firefoxview-tabpickup-sync-disconnected-header = A folytatáshoz kapcsolja be a szinkronizálást
firefoxview-tabpickup-sync-disconnected-description = A lapok átvételéhez engedélyeznie kell a szinkronizálást a { -brand-short-name }ban.
firefoxview-tabpickup-sync-disconnected-primarybutton = Kapcsolja be a szinkronizálást a beállításokban
firefoxview-tabpickup-password-locked-header = A lapok megtekintéséhez adja meg az elsődleges jelszavát
firefoxview-tabpickup-password-locked-description = A lapok átvételéhez meg kell adnia az elsődleges jelszót a { -brand-short-name }ban.
firefoxview-tabpickup-password-locked-link = További tudnivalók
firefoxview-tabpickup-password-locked-primarybutton = Írja be az elsődleges jelszót
firefoxview-tabpickup-signed-out-header = Jelentkezzen be az újrakapcsolódáshoz
firefoxview-tabpickup-signed-out-description = Az újbóli csatlakozáshoz és a lapok megszerzéséhez jelentkezzen be a { -fxaccount-brand-name } fiókjába.
firefoxview-tabpickup-signed-out-primarybutton = Bejelentkezés
firefoxview-tabpickup-syncing = Várjon amíg a lapjai szinkronizálódnak. Csak egy pillanat lesz.
firefoxview-mobile-promo-header = Vegye át a lapjait a telefonjáról vagy táblagépéről
firefoxview-mobile-promo-description = A legújabb mobillapok megtekintéséhez jelentkezzen be a { -brand-product-name }be iOS-en vagy Androidon.
firefoxview-mobile-promo-primarybutton = Szerezze be a mobilos { -brand-product-name }t
firefoxview-mobile-confirmation-header = 🎉 Kész is van.
firefoxview-mobile-confirmation-description = Most már átveheti a { -brand-product-name } lapjait a táblagépéről vagy telefonjáról.
firefoxview-closed-tabs-title = Nemrég bezárt
firefoxview-closed-tabs-description2 = Az ebben az ablakban bezárt oldalak újranyitása.
firefoxview-closed-tabs-placeholder-header = Nincsenek nemrég bezárt lapok
firefoxview-closed-tabs-placeholder-body = Ha bezár egy lapot ebben az ablakban, innen kérheti le.
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
firefoxview-closed-tabs-dismiss-tab =
    .title = A(z) { $tabTitle } eltüntetése
# refers to the last tab that was used
firefoxview-pickup-tabs-badge = Utoljára aktív
# Variables:
#   $targetURI (string) - URL that will be opened in the new tab
firefoxview-tabs-list-tab-button =
    .title = A(z) { $targetURI } megnyitása új lapon
firefoxview-try-colorways-button = Próbálja ki a színvilágokat
firefoxview-change-colorway-button = Színvilág módosítása
# Variables:
#  $intensity (String): Colorway intensity
#  $collection (String): Colorway Collection name
firefoxview-colorway-description = { $intensity } · { $collection }
firefoxview-synced-tabs-placeholder-header = Még nincs semmi látnivaló
firefoxview-synced-tabs-placeholder-body = Amikor legközelebb megnyit egy oldalt a { -brand-product-name }ban egy másik eszközön, akkor itt varázsütésre megtalálja.
firefoxview-collapse-button-show =
    .title = Lista megjelenítése
firefoxview-collapse-button-hide =
    .title = Lista elrejtése
firefoxview-overview-nav = Legutóbbi böngészés
    .title = Legutóbbi böngészés

## History in this context refers to browser history

firefoxview-history-nav = Előzmények
    .title = Előzmények
firefoxview-history-header = Előzmények

## Open Tabs in this context refers to all open tabs in the browser

firefoxview-opentabs-nav = Nyitott lapok
    .title = Nyitott lapok
firefoxview-opentabs-header = Nyitott lapok

## Recently closed tabs in this context refers to recently closed tabs from all windows

firefoxview-recently-closed-nav = Nemrég bezárt lapok
    .title = Nemrég bezárt lapok
firefoxview-recently-closed-header = Nemrég bezárt lapok

## Tabs from other devices refers in this context refers to synced tabs from other devices

firefoxview-synced-tabs-nav = Lapok más eszközökről
    .title = Lapok más eszközökről
firefoxview-synced-tabs-header = Lapok más eszközökről

##

# Used for a link in collapsible cards, in the 'Recent browsing' page of Firefox View
firefoxview-view-all-link = Összes megtekintése
