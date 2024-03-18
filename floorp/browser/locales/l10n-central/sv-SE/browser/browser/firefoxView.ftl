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
    .title = Stäng
    .aria-label = Stäng
# Used instead of the localized relative time when a timestamp is within a minute or so of now
firefoxview-just-now-timestamp = Nu
# This is a headline for an area in the product where users can resume and re-open tabs they have previously viewed on other devices.
firefoxview-tabpickup-header = Synkroniserade flikar
firefoxview-tabpickup-description = Öppna sidor från andra enheter.
# Variables:
#  $percentValue (Number): the percentage value for setup completion
firefoxview-tabpickup-progress-label = { $percentValue }% klar
firefoxview-tabpickup-step-signin-header = Växla enkelt mellan enheter
firefoxview-tabpickup-step-signin-description = För att se de öppna flikarna på din telefon, logga in eller skapa ett konto.
firefoxview-tabpickup-step-signin-primarybutton = Fortsätt
firefoxview-tabpickup-adddevice-header = Synkronisera { -brand-product-name } på din telefon eller surfplatta
firefoxview-tabpickup-adddevice-description = Ladda ner { -brand-product-name } för mobil och logga in där.
firefoxview-tabpickup-adddevice-learn-how = Läs mer
firefoxview-tabpickup-adddevice-primarybutton = Hämta { -brand-product-name } för mobil
firefoxview-tabpickup-synctabs-header = Aktivera synkronisering av flikar
firefoxview-tabpickup-synctabs-description = Tillåt { -brand-short-name } att dela flikar mellan enheter.
firefoxview-tabpickup-synctabs-learn-how = Läs mer
firefoxview-tabpickup-synctabs-primarybutton = Synkronisera öppna flikar
firefoxview-tabpickup-fxa-admin-disabled-header = Din organisation har inaktiverat synkronisering
firefoxview-tabpickup-fxa-admin-disabled-description = { -brand-short-name } kan inte synkronisera flikar mellan enheter eftersom din administratör har inaktiverat synkronisering.
firefoxview-tabpickup-network-offline-header = Kontrollera din internetanslutning
firefoxview-tabpickup-network-offline-description = Om du använder en brandvägg eller proxy, kontrollera att { -brand-short-name } har behörighet att komma åt webben.
firefoxview-tabpickup-network-offline-primarybutton = Försök igen
firefoxview-tabpickup-sync-error-header = Vi har problem med att synkronisera
firefoxview-tabpickup-generic-sync-error-description = { -brand-short-name } kan inte nå synkroniseringstjänsten just nu. Försök igen lite senare.
firefoxview-tabpickup-sync-error-primarybutton = Försök igen
firefoxview-tabpickup-sync-disconnected-header = Aktivera synkronisering för att fortsätta
firefoxview-tabpickup-sync-disconnected-description = För att komma åt dina flikar måste du aktivera synkronisering i { -brand-short-name }.
firefoxview-tabpickup-sync-disconnected-primarybutton = Aktivera synkronisering i inställningarna
firefoxview-tabpickup-password-locked-header = Ange ditt primära lösenord för att visa flikar
firefoxview-tabpickup-password-locked-description = För att komma åt dina flikar måste du ange det primära lösenordet för { -brand-short-name }.
firefoxview-tabpickup-password-locked-link = Läs mer
firefoxview-tabpickup-password-locked-primarybutton = Ange primärt lösenord
firefoxview-tabpickup-signed-out-header = Logga in för att återansluta
firefoxview-tabpickup-signed-out-description = För att återansluta och hämta dina flikar, logga in på ditt { -fxaccount-brand-name }.
firefoxview-tabpickup-signed-out-primarybutton = Logga in
firefoxview-tabpickup-syncing = Vi synkroniserar dina flikar, det tar bara ett ögonblick.
firefoxview-mobile-promo-header = Öppna flikar från din telefon eller surfplatta
firefoxview-mobile-promo-description = För att se dina senaste mobilflikar, logga in på { -brand-product-name } på iOS eller Android.
firefoxview-mobile-promo-primarybutton = Hämta { -brand-product-name } för mobil
firefoxview-mobile-confirmation-header = 🎉 Klar att användas!
firefoxview-mobile-confirmation-description = Nu kan du hämta flikarna från { -brand-product-name } till din surfplatta eller telefon.
firefoxview-closed-tabs-title = Nyligen stängda
firefoxview-closed-tabs-description2 = Öppna åter sidor du har stängt i det här fönstret.
firefoxview-closed-tabs-placeholder-header = Inga nyligen stängda flikar
firefoxview-closed-tabs-placeholder-body = När du stänger en flik i det här fönstret kan du hämta den härifrån.
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
firefoxview-closed-tabs-dismiss-tab =
    .title = Ignorera { $tabTitle }
# refers to the last tab that was used
firefoxview-pickup-tabs-badge = Senast aktiv
# Variables:
#   $targetURI (string) - URL that will be opened in the new tab
firefoxview-tabs-list-tab-button =
    .title = Öppna { $targetURI } i en ny flik
firefoxview-try-colorways-button = Testa colorways
firefoxview-change-colorway-button = Ändra colorway
# Variables:
#  $intensity (String): Colorway intensity
#  $collection (String): Colorway Collection name
firefoxview-colorway-description = { $intensity } · { $collection }
firefoxview-synced-tabs-placeholder-header = Inget att se ännu
firefoxview-synced-tabs-placeholder-body = Nästa gång du öppnar en sida i { -brand-product-name } på en annan enhet, hittar du den här.
firefoxview-collapse-button-show =
    .title = Visa lista
firefoxview-collapse-button-hide =
    .title = Dölj lista
firefoxview-overview-nav = Senaste surfning
    .title = Senaste surfning

## History in this context refers to browser history

firefoxview-history-nav = Historik
    .title = Historik
firefoxview-history-header = Historik

## Open Tabs in this context refers to all open tabs in the browser

firefoxview-opentabs-nav = Öppna flikar
    .title = Öppna flikar
firefoxview-opentabs-header = Öppna flikar

## Recently closed tabs in this context refers to recently closed tabs from all windows

firefoxview-recently-closed-nav = Nyligen stängda flikar
    .title = Nyligen stängda flikar
firefoxview-recently-closed-header = Nyligen stängda flikar

## Tabs from other devices refers in this context refers to synced tabs from other devices

firefoxview-synced-tabs-nav = Flikar från andra enheter
    .title = Flikar från andra enheter
firefoxview-synced-tabs-header = Flikar från andra enheter

##

# Used for a link in collapsible cards, in the 'Recent browsing' page of Firefox View
firefoxview-view-all-link = Visa alla
# Variables:
#   $winID (Number) - The index of the owner window for this set of tabs
firefoxview-opentabs-window-header =
    .title = Fönster { $winID }
# Variables:
#   $winID (Number) - The index of the owner window (which is currently focused) for this set of tabs
firefoxview-opentabs-current-window-header =
    .title = Fönster { $winID } (aktuellt)
firefoxview-opentabs-focus-tab =
    .title = Växla till den här fliken
firefoxview-show-more = Visa mer
firefoxview-show-less = Visa mindre
