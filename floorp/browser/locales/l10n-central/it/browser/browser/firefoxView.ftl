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
    .title = Chiudi
    .aria-label = Chiudi
# Used instead of the localized relative time when a timestamp is within a minute or so of now
firefoxview-just-now-timestamp = adesso
# This is a headline for an area in the product where users can resume and re-open tabs they have previously viewed on other devices.
firefoxview-tabpickup-header = Riprendi schede
firefoxview-tabpickup-description = Apri pagine da altri dispositivi.
# Variables:
#  $percentValue (Number): the percentage value for setup completion
firefoxview-tabpickup-progress-label = { $percentValue }% completato
firefoxview-tabpickup-step-signin-header = Passa velocemente da un dispositivo all’altro
firefoxview-tabpickup-step-signin-description = Per recuperare le schede aperte sul tuo telefono, accedi o crea un account.
firefoxview-tabpickup-step-signin-primarybutton = Continua
firefoxview-tabpickup-adddevice-header = Sincronizza { -brand-product-name } sul tuo telefono o tablet
firefoxview-tabpickup-adddevice-description = Scarica { -brand-product-name } per dispositivi mobili e accedi al tuo account.
firefoxview-tabpickup-adddevice-learn-how = Scopri come
firefoxview-tabpickup-adddevice-primarybutton = Ottieni { -brand-product-name } per mobile
firefoxview-tabpickup-synctabs-header = Attiva la sincronizzazione delle schede
firefoxview-tabpickup-synctabs-description = Consenti a { -brand-short-name } di condividere le schede tra i tuoi dispositivi.
firefoxview-tabpickup-synctabs-learn-how = Scopri come
firefoxview-tabpickup-synctabs-primarybutton = Sincronizza le schede aperte
firefoxview-tabpickup-fxa-admin-disabled-header = La tua azienda ha disattivato la sincronizzazione
firefoxview-tabpickup-fxa-admin-disabled-description = { -brand-short-name } non è in grado di sincronizzare le schede tra i tuoi dispositivi in quanto un amministratore ha disattivato la sincronizzazione.
firefoxview-tabpickup-network-offline-header = Verifica la tua connessione a Internet
firefoxview-tabpickup-network-offline-description = Se utilizzi un firewall o un proxy, verifica che { -brand-short-name } abbia il permesso di accedere a Internet.
firefoxview-tabpickup-network-offline-primarybutton = Riprova
firefoxview-tabpickup-sync-error-header = Si è verificato un problema con la sincronizzazione
firefoxview-tabpickup-generic-sync-error-description = { -brand-short-name } non può raggiungere il servizio per la sincronizzazione in questo momento. Riprova tra qualche istante.
firefoxview-tabpickup-sync-error-primarybutton = Riprova
firefoxview-tabpickup-sync-disconnected-header = Attiva la sincronizzazione per continuare
firefoxview-tabpickup-sync-disconnected-description = Per recuperare le tue schede è necessario attivare la sincronizzazione in { -brand-short-name }.
firefoxview-tabpickup-sync-disconnected-primarybutton = Attiva la sincronizzazione nelle impostazioni
firefoxview-tabpickup-password-locked-header = Inserisci la password principale per visualizzare le schede
firefoxview-tabpickup-password-locked-description = Per recuperare le tue schede devi inserire la tua password principale per { -brand-short-name }.
firefoxview-tabpickup-password-locked-link = Ulteriori informazioni
firefoxview-tabpickup-password-locked-primarybutton = Inserisci la password principale
firefoxview-tabpickup-signed-out-header = Accedi per riconnetterti
firefoxview-tabpickup-signed-out-description = Per riconnetterti e recuperare le tue schede, accedi al tuo { -fxaccount-brand-name }.
firefoxview-tabpickup-signed-out-primarybutton = Accedi
firefoxview-tabpickup-syncing = Stiamo sincronizzando le tue schede, ci vorrà solo un attimo.
firefoxview-mobile-promo-header = Recupera le schede aperte sul tuo telefono o tablet
firefoxview-mobile-promo-description = Per visualizzare le ultime schede che hai aperto sul tuo telefono, accedi a { -brand-product-name } su iOS o Android.
firefoxview-mobile-promo-primarybutton = Ottieni { -brand-product-name } per mobile
firefoxview-mobile-confirmation-header = 🎉 Tutto pronto!
firefoxview-mobile-confirmation-description = Ora puoi recuperare le schede di { -brand-product-name } aperte sul tuo telefono o tablet.
firefoxview-closed-tabs-title = Chiuse di recente
firefoxview-closed-tabs-description2 = Riapri pagine che hai chiuso in questa finestra.
firefoxview-closed-tabs-placeholder-header = Nessuna scheda chiusa di recente
firefoxview-closed-tabs-placeholder-body = Quando chiudi una scheda in questa finestra potrai sempre recuperarla da qui.
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
firefoxview-closed-tabs-dismiss-tab =
    .title = Rimuovi { $tabTitle }
# refers to the last tab that was used
firefoxview-pickup-tabs-badge = Ultima attiva
# Variables:
#   $targetURI (string) - URL that will be opened in the new tab
firefoxview-tabs-list-tab-button =
    .title = Apri { $targetURI } in una nuova scheda
firefoxview-try-colorways-button = Prova nuove tonalità
firefoxview-change-colorway-button = Cambia tonalità
# Variables:
#  $intensity (String): Colorway intensity
#  $collection (String): Colorway Collection name
firefoxview-colorway-description = { $intensity } · { $collection }
firefoxview-synced-tabs-placeholder-header = Non c’è ancora nulla da mostrare
firefoxview-synced-tabs-placeholder-body = La prossima volta che apri una pagina in { -brand-product-name } su un altro dispositivo, la troverai qui.
firefoxview-collapse-button-show =
    .title = Mostra elenco
firefoxview-collapse-button-hide =
    .title = Nascondi elenco
firefoxview-overview-nav = Navigazione recente
    .title = Navigazione recente

## History in this context refers to browser history

firefoxview-history-nav = Cronologia
    .title = Cronologia
firefoxview-history-header = Cronologia

## Open Tabs in this context refers to all open tabs in the browser

firefoxview-opentabs-nav = Schede aperte
    .title = Schede aperte
firefoxview-opentabs-header = Schede aperte

## Recently closed tabs in this context refers to recently closed tabs from all windows

firefoxview-recently-closed-nav = Schede chiuse di recente
  .title = Schede chiuse di recente
firefoxview-recently-closed-header = Schede chiuse di recente

## Tabs from other devices refers in this context refers to synced tabs from other devices

firefoxview-synced-tabs-nav = Schede da altri dispositivi
  .title = Schede da altri dispositivi
firefoxview-synced-tabs-header = Schede da altri dispositivi

##

# Used for a link in collapsible cards, in the 'Recent browsing' page of Firefox View
firefoxview-view-all-link = Mostra tutto

# Variables:
#   $winID (Number) - The index of the owner window for this set of tabs
firefoxview-opentabs-window-header =
  .title = Finestra { $winID }

# Variables:
#   $winID (Number) - The index of the owner window (which is currently focused) for this set of tabs
firefoxview-opentabs-current-window-header =
  .title = Finestra { $winID } (attuale)

firefoxview-opentabs-focus-tab =
  .title = Passa a questa scheda

firefoxview-show-more = Mostra altro
firefoxview-show-less = Mostra meno

