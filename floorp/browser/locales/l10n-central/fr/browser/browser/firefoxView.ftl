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
    .title = Fermer
    .aria-label = Fermer
# Used instead of the localized relative time when a timestamp is within a minute or so of now
firefoxview-just-now-timestamp = À l’instant
# This is a headline for an area in the product where users can resume and re-open tabs they have previously viewed on other devices.
firefoxview-tabpickup-header = Récupération d’onglets
firefoxview-tabpickup-description = Ouvrez des pages provenant d’autres appareils.
# Variables:
#  $percentValue (Number): the percentage value for setup completion
firefoxview-tabpickup-progress-label = Terminé à { $percentValue } %
firefoxview-tabpickup-step-signin-header = Passez facilement d’un appareil à l’autre
firefoxview-tabpickup-step-signin-description = Pour récupérer les onglets de votre téléphone ici, commencez par vous connecter ou créer un compte.
firefoxview-tabpickup-step-signin-primarybutton = Continuer
firefoxview-tabpickup-adddevice-header = Synchronisez { -brand-product-name } avec votre téléphone ou votre tablette
firefoxview-tabpickup-adddevice-description = Téléchargez { -brand-product-name } pour mobile et connectez-vous.
firefoxview-tabpickup-adddevice-learn-how = Découvrez comment
firefoxview-tabpickup-adddevice-primarybutton = Installez { -brand-product-name } sur votre appareil mobile
firefoxview-tabpickup-synctabs-header = Activez la synchronisation des onglets
firefoxview-tabpickup-synctabs-description = Autorisez { -brand-short-name } à partager les onglets entre vos appareils.
firefoxview-tabpickup-synctabs-learn-how = Me montrer comment faire
firefoxview-tabpickup-synctabs-primarybutton = Synchroniser les onglets ouverts
firefoxview-tabpickup-fxa-admin-disabled-header = Votre organisation a désactivé la synchronisation
firefoxview-tabpickup-fxa-admin-disabled-description = { -brand-short-name } ne peut pas synchroniser d’onglets entre appareils car votre administrateur·trice a désactivé la synchronisation.
firefoxview-tabpickup-network-offline-header = Vérifiez votre connexion à Internet
firefoxview-tabpickup-network-offline-description = Si vous utilisez un pare-feu ou un proxy, vérifiez que { -brand-short-name } a l’autorisation d’accéder au Web.
firefoxview-tabpickup-network-offline-primarybutton = Réessayer
firefoxview-tabpickup-sync-error-header = Nous rencontrons des problèmes de synchronisation
firefoxview-tabpickup-generic-sync-error-description = { -brand-short-name } ne peut pas joindre le service de synchronisation pour l’instant. Réessayez dans quelques instants.
firefoxview-tabpickup-sync-error-primarybutton = Réessayer
firefoxview-tabpickup-sync-disconnected-header = Activez la synchronisation pour continuer
firefoxview-tabpickup-sync-disconnected-description = Pour récupérer vos onglets, vous devez autoriser la synchronisation dans { -brand-short-name }.
firefoxview-tabpickup-sync-disconnected-primarybutton = Activer la synchronisation dans les paramètres
firefoxview-tabpickup-password-locked-header = Saisissez votre mot de passe principal pour afficher les onglets
firefoxview-tabpickup-password-locked-description = Pour récupérer vos onglets, vous devez saisir le mot de passe principal de { -brand-short-name }.
firefoxview-tabpickup-password-locked-link = En savoir plus
firefoxview-tabpickup-password-locked-primarybutton = Saisir le mot de passe principal
firefoxview-tabpickup-signed-out-header = Identifiez-vous pour vous reconnecter
firefoxview-tabpickup-signed-out-description = Pour vous reconnecter et récupérer vos onglets, connectez-vous à votre { -fxaccount-brand-name }.
firefoxview-tabpickup-signed-out-primarybutton = Se connecter
firefoxview-tabpickup-syncing = Veuillez patienter pendant la synchronisation de vos onglets. Ce ne sera pas long.
firefoxview-mobile-promo-header = Récupérez les onglets de votre téléphone ou de votre tablette
firefoxview-mobile-promo-description = Pour afficher les derniers onglets de votre appareil mobile, connectez-vous à { -brand-product-name } sous iOS ou Android.
firefoxview-mobile-promo-primarybutton = Installez { -brand-product-name } sur votre appareil mobile
firefoxview-mobile-confirmation-header = 🎉 C’est parti !
firefoxview-mobile-confirmation-description = Vous pouvez maintenant récupérer les onglets du { -brand-product-name } de votre tablette ou votre téléphone.
firefoxview-closed-tabs-title = Récemment fermés
firefoxview-closed-tabs-description2 = Rouvrez des pages que vous avez fermées dans cette fenêtre.
firefoxview-closed-tabs-placeholder-header = Aucun onglet récemment fermé
firefoxview-closed-tabs-placeholder-body = Si vous avez fermé un onglet de cette fenêtre, vous pouvez le récupérer ici.
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
firefoxview-closed-tabs-dismiss-tab =
    .title = Retirer { $tabTitle }
# refers to the last tab that was used
firefoxview-pickup-tabs-badge = Dernier onglet actif
# Variables:
#   $targetURI (string) - URL that will be opened in the new tab
firefoxview-tabs-list-tab-button =
    .title = Ouvrir { $targetURI } dans un nouvel onglet
firefoxview-try-colorways-button = Essayer les coloris
firefoxview-change-colorway-button = Changer de coloris
# Variables:
#  $intensity (String): Colorway intensity
#  $collection (String): Colorway Collection name
firefoxview-colorway-description = { $intensity } · { $collection }
firefoxview-synced-tabs-placeholder-header = Rien à voir pour l’instant
firefoxview-synced-tabs-placeholder-body = La prochaine fois que vous ouvrez une page dans { -brand-product-name } sur un autre appareil, retrouvez-la ici comme par magie.
firefoxview-collapse-button-show =
    .title = Afficher la liste
firefoxview-collapse-button-hide =
    .title = Masquer la liste
firefoxview-overview-nav = Navigation récente
    .title = Navigation récente

## History in this context refers to browser history

firefoxview-history-nav = Historique
    .title = Historique
firefoxview-history-header = Historique

## Open Tabs in this context refers to all open tabs in the browser

firefoxview-opentabs-nav = Onglets ouverts
    .title = Onglets ouverts
firefoxview-opentabs-header = Onglets ouverts

## Recently closed tabs in this context refers to recently closed tabs from all windows

firefoxview-recently-closed-nav = Onglets récemment fermés
    .title = Onglets récemment fermés
firefoxview-recently-closed-header = Onglets récemment fermés

## Tabs from other devices refers in this context refers to synced tabs from other devices

firefoxview-synced-tabs-nav = Onglets d’autres appareils
    .title = Onglets d’autres appareils
firefoxview-synced-tabs-header = Onglets d’autres appareils

##

# Used for a link in collapsible cards, in the 'Recent browsing' page of Firefox View
firefoxview-view-all-link = Tout afficher
# Variables:
#   $winID (Number) - The index of the owner window for this set of tabs
firefoxview-opentabs-window-header =
    .title = Fenêtre { $winID }
# Variables:
#   $winID (Number) - The index of the owner window (which is currently focused) for this set of tabs
firefoxview-opentabs-current-window-header =
    .title = Fenêtre { $winID } (actuelle)
firefoxview-opentabs-focus-tab =
    .title = Basculer vers cet onglet
firefoxview-show-more = En afficher plus
firefoxview-show-less = En afficher moins
