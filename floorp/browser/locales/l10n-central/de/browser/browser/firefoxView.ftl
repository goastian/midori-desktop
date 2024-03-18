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
    .title = Schließen
    .aria-label = Schließen
# Used instead of the localized relative time when a timestamp is within a minute or so of now
firefoxview-just-now-timestamp = Gerade eben
# This is a headline for an area in the product where users can resume and re-open tabs they have previously viewed on other devices.
firefoxview-tabpickup-header = Synchronisierte Tabs
firefoxview-tabpickup-description = Öffnen Sie Seiten von anderen Geräten.
# Variables:
#  $percentValue (Number): the percentage value for setup completion
firefoxview-tabpickup-progress-label = { $percentValue } % abgeschlossen
firefoxview-tabpickup-step-signin-header = Nahtlos zwischen Geräten wechseln
firefoxview-tabpickup-step-signin-description = Um Ihre Tabs vom Telefon hier abzurufen, melden Sie sich zuerst an oder erstellen Sie ein Konto.
firefoxview-tabpickup-step-signin-primarybutton = Weiter
firefoxview-tabpickup-adddevice-header = Synchronisieren Sie { -brand-product-name } auf Ihrem Telefon oder Tablet
firefoxview-tabpickup-adddevice-description = Laden Sie { -brand-product-name } für Mobilgeräte herunter und melden Sie sich dort an.
firefoxview-tabpickup-adddevice-learn-how = So wird's gemacht
firefoxview-tabpickup-adddevice-primarybutton = { -brand-product-name } für Mobilgeräte holen
firefoxview-tabpickup-synctabs-header = Tab-Synchronisation aktivieren
firefoxview-tabpickup-synctabs-description = Erlauben Sie { -brand-short-name }, Tabs zwischen Geräten zu teilen.
firefoxview-tabpickup-synctabs-learn-how = So wird's gemacht
firefoxview-tabpickup-synctabs-primarybutton = Offene Tabs synchronisieren
firefoxview-tabpickup-fxa-admin-disabled-header = Ihre Organisation hat das Synchronisieren deaktiviert
firefoxview-tabpickup-fxa-admin-disabled-description = { -brand-short-name } kann Tabs nicht zwischen Geräten synchronisieren, da Ihr Administrator das Synchronisieren deaktiviert hat.
firefoxview-tabpickup-network-offline-header = Überprüfen Sie Ihre Internetverbindung
firefoxview-tabpickup-network-offline-description = Wenn Sie eine Firewall oder einen Proxy verwenden, überprüfen Sie, ob { -brand-short-name } die Berechtigung hat, auf das Internet zuzugreifen.
firefoxview-tabpickup-network-offline-primarybutton = Erneut versuchen
firefoxview-tabpickup-sync-error-header = Wir haben Probleme bei der Synchronisierung
firefoxview-tabpickup-generic-sync-error-description = { -brand-short-name } kann den Synchronisierungsdienst derzeit nicht erreichen. Versuchen Sie es in ein paar Augenblicken erneut.
firefoxview-tabpickup-sync-error-primarybutton = Erneut versuchen
firefoxview-tabpickup-sync-disconnected-header = Synchronisation aktivieren, um fortzufahren
firefoxview-tabpickup-sync-disconnected-description = Um Ihre Tabs abzurufen, müssen Sie die Synchronisierung in { -brand-short-name } erlauben.
firefoxview-tabpickup-sync-disconnected-primarybutton = Synchronisation in Einstellungen aktivieren
firefoxview-tabpickup-password-locked-header = Geben Sie Ihr Hauptpasswort ein, um Tabs anzuzeigen
firefoxview-tabpickup-password-locked-description = Um Ihre Tabs abzurufen, müssen Sie das Hauptpasswort für { -brand-short-name } eingeben.
firefoxview-tabpickup-password-locked-link = Weitere Informationen
firefoxview-tabpickup-password-locked-primarybutton = Hauptpasswort eingeben
firefoxview-tabpickup-signed-out-header = Melden Sie sich an, um die Verbindung wiederherzustellen
firefoxview-tabpickup-signed-out-description = Um die Verbindung wiederherzustellen und Ihre Tabs abzurufen, melden Sie sich bei Ihrem { -fxaccount-brand-name } an.
firefoxview-tabpickup-signed-out-primarybutton = Anmelden
firefoxview-tabpickup-syncing = Warten Sie, während Ihre Tabs synchronisiert werden. Es wird nur einen Moment dauern.
firefoxview-mobile-promo-header = Holen Sie sich Tabs von Ihrem Telefon oder Tablet
firefoxview-mobile-promo-description = Um Ihre neuesten mobilen Tabs anzuzeigen, melden Sie sich auf iOS oder Android bei { -brand-product-name } an.
firefoxview-mobile-promo-primarybutton = { -brand-product-name } für Mobilgeräte holen
firefoxview-mobile-confirmation-header = 🎉 Alles startklar!
firefoxview-mobile-confirmation-description = Jetzt können Sie Ihre { -brand-product-name }-Tabs von Ihrem Tablet oder Telefon holen.
firefoxview-closed-tabs-title = Kürzlich geschlossen
firefoxview-closed-tabs-description2 = Öffnen Sie Seiten erneut, die Sie in diesem Fenster geschlossen haben.
firefoxview-closed-tabs-placeholder-header = Keine kürzlich geschlossenen Tabs
firefoxview-closed-tabs-placeholder-body = Wenn Sie einen Tab in diesem Fenster schließen, können Sie ihn von hier abrufen.
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
firefoxview-closed-tabs-dismiss-tab =
    .title = { $tabTitle } schließen
# refers to the last tab that was used
firefoxview-pickup-tabs-badge = Zuletzt aktiv
# Variables:
#   $targetURI (string) - URL that will be opened in the new tab
firefoxview-tabs-list-tab-button =
    .title = { $targetURI } in einem neuen Tab öffnen
firefoxview-try-colorways-button = Farbwelten ausprobieren
firefoxview-change-colorway-button = Farbwelt ändern
# Variables:
#  $intensity (String): Colorway intensity
#  $collection (String): Colorway Collection name
firefoxview-colorway-description = { $intensity } · { $collection }
firefoxview-synced-tabs-placeholder-header = Noch nichts zu sehen
firefoxview-synced-tabs-placeholder-body = Wenn Sie das nächste Mal eine Seite in { -brand-product-name } auf einem anderen Gerät öffnen, greifen Sie hier wie von Zauberhand darauf zu.
firefoxview-collapse-button-show =
    .title = Liste anzeigen
firefoxview-collapse-button-hide =
    .title = Liste ausblenden
firefoxview-overview-nav = Kürzlich besucht
    .title = Kürzlich besucht

## History in this context refers to browser history

firefoxview-history-nav = Chronik
    .title = Chronik
firefoxview-history-header = Chronik

## Open Tabs in this context refers to all open tabs in the browser

firefoxview-opentabs-nav = Offene Tabs
    .title = Offene Tabs
firefoxview-opentabs-header = Offene Tabs

## Recently closed tabs in this context refers to recently closed tabs from all windows

firefoxview-recently-closed-nav = Kürzlich geschlossene Tabs
    .title = Kürzlich geschlossene Tabs
firefoxview-recently-closed-header = Kürzlich geschlossene Tabs

## Tabs from other devices refers in this context refers to synced tabs from other devices

firefoxview-synced-tabs-nav = Tabs von anderen Geräten
    .title = Tabs von anderen Geräten
firefoxview-synced-tabs-header = Tabs von anderen Geräten

##

# Used for a link in collapsible cards, in the 'Recent browsing' page of Firefox View
firefoxview-view-all-link = Alle ansehen
# Variables:
#   $winID (Number) - The index of the owner window for this set of tabs
firefoxview-opentabs-window-header =
    .title = Fenster { $winID }
# Variables:
#   $winID (Number) - The index of the owner window (which is currently focused) for this set of tabs
firefoxview-opentabs-current-window-header =
    .title = Fenster { $winID } (aktuell)
firefoxview-opentabs-focus-tab =
    .title = Zu diesem Tab wechseln
firefoxview-show-more = Mehr anzeigen
firefoxview-show-less = Weniger anzeigen
