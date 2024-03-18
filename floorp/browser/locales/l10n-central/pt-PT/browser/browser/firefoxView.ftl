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
    .title = Fechar
    .aria-label = Fechar
# Used instead of the localized relative time when a timestamp is within a minute or so of now
firefoxview-just-now-timestamp = Agora mesmo
# This is a headline for an area in the product where users can resume and re-open tabs they have previously viewed on other devices.
firefoxview-tabpickup-header = Escolha de separador
firefoxview-tabpickup-description = Abrir páginas de outros dispositivos.
# Variables:
#  $percentValue (Number): the percentage value for setup completion
firefoxview-tabpickup-progress-label = { $percentValue }% concluído
firefoxview-tabpickup-step-signin-header = Alterne facilmente entre dispositivos
firefoxview-tabpickup-step-signin-description = Para obter os separadores do seu telemóvel aqui, primeiro, entre ou crie uma conta.
firefoxview-tabpickup-step-signin-primarybutton = Continuar
firefoxview-tabpickup-adddevice-header = Sincronize o { -brand-product-name } no seu telemóvel ou tablet
firefoxview-tabpickup-adddevice-description = Descarregue o { -brand-product-name } para dispositivos móveis e inicie sessão no mesmo.
firefoxview-tabpickup-adddevice-learn-how = Saber mais
firefoxview-tabpickup-adddevice-primarybutton = Obtenha o { -brand-product-name } para dispositivos móveis.
firefoxview-tabpickup-synctabs-header = Ativar sincronização de separadores
firefoxview-tabpickup-synctabs-description = Permitir que o { -brand-short-name } partilhe separadores entre dispositivos.
firefoxview-tabpickup-synctabs-learn-how = Saber mais
firefoxview-tabpickup-synctabs-primarybutton = Sincronizar separadores abertos
firefoxview-tabpickup-fxa-admin-disabled-header = A sua organização desativou a sincronização
firefoxview-tabpickup-fxa-admin-disabled-description = O { -brand-short-name } não consegue sincronizar separadores entre dispositivos porque o seu administrador desativou a sincronização.
firefoxview-tabpickup-network-offline-header = Verifique a sua ligação à Internet
firefoxview-tabpickup-network-offline-description = Se está a utilizar uma firewall ou proxy, verifique se o { -brand-short-name } tem permissão para aceder à Internet.
firefoxview-tabpickup-network-offline-primarybutton = Tentar novamente
firefoxview-tabpickup-sync-error-header = Estamos com problemas para sincronizar
firefoxview-tabpickup-generic-sync-error-description = O { -brand-short-name } não pode aceder ao serviço de sincronização neste momento. Tente novamente dentro de alguns momentos.
firefoxview-tabpickup-sync-error-primarybutton = Tentar novamente
firefoxview-tabpickup-sync-disconnected-header = Ative a sincronização para continuar
firefoxview-tabpickup-sync-disconnected-description = Para obter seus separadores, irá precisar de permitir a sincronização no { -brand-short-name }.
firefoxview-tabpickup-sync-disconnected-primarybutton = Ative a sincronização nas definições
firefoxview-tabpickup-password-locked-header = Introduza a sua Palavra-passe principal para ver os separadores
firefoxview-tabpickup-password-locked-description = Para obter os seus separadores, terá de inserir a Palavra-passe principal no { -brand-short-name }.
firefoxview-tabpickup-password-locked-link = Saber mais
firefoxview-tabpickup-password-locked-primarybutton = Inserir a Palavra-passe principal
firefoxview-tabpickup-signed-out-header = Iniciar sessão para restabelecer a ligação
firefoxview-tabpickup-signed-out-description = Para reassociar e aceder aos seus separadores, inicie sessão na { -fxaccount-brand-name }.
firefoxview-tabpickup-signed-out-primarybutton = Iniciar sessão
firefoxview-tabpickup-syncing = Aguarde enquanto os seus separadores estão a ser sincronizados. Será apenas um momento.
firefoxview-mobile-promo-header = Obter separadores do seu telemóvel ou tablet
firefoxview-mobile-promo-description = Para ver os seus separadores móveis mais recentes, inicie sessão no { -brand-product-name } para iOS ou Android.
firefoxview-mobile-promo-primarybutton = Obtenha o { -brand-product-name } para dispositivos móveis
firefoxview-mobile-confirmation-header = 🎉 Tudo pronto!
firefoxview-mobile-confirmation-description = Agora pode obter os seus separadores do { -brand-product-name } a partir do seu tablet ou telemóvel.
firefoxview-closed-tabs-title = Fechados recentemente
firefoxview-closed-tabs-description2 = Reabrir as páginas que fechou nesta janela.
firefoxview-closed-tabs-placeholder-header = Nenhum separador fechado recentemente
firefoxview-closed-tabs-placeholder-body = Quando fecha um separador nesta janela, pode obtê-lo a partir daqui.
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
firefoxview-closed-tabs-dismiss-tab =
    .title = Desativar { $tabTitle }
# refers to the last tab that was used
firefoxview-pickup-tabs-badge = Ativo pela última vez
# Variables:
#   $targetURI (string) - URL that will be opened in the new tab
firefoxview-tabs-list-tab-button =
    .title = Abrir { $targetURI } num novo separador
firefoxview-try-colorways-button = Experimente os estilos de cor
firefoxview-change-colorway-button = Alterar estilo de cor
# Variables:
#  $intensity (String): Colorway intensity
#  $collection (String): Colorway Collection name
firefoxview-colorway-description = { $intensity } · { $collection }
firefoxview-synced-tabs-placeholder-header = Nada para ver ainda
firefoxview-synced-tabs-placeholder-body = Da próxima vez que abrir uma página no { -brand-product-name } noutro dispositivo, obtenha-a aqui, como magia.
firefoxview-collapse-button-show =
    .title = Mostrar lista
firefoxview-collapse-button-hide =
    .title = Esconder lista
firefoxview-overview-nav = Navegação recente
    .title = Navegação recente

## History in this context refers to browser history

firefoxview-history-nav = Histórico
    .title = Histórico
firefoxview-history-header = Histórico

## Open Tabs in this context refers to all open tabs in the browser

firefoxview-opentabs-nav = Separadores abertos
    .title = Separadores abertos
firefoxview-opentabs-header = Separadores abertos

## Recently closed tabs in this context refers to recently closed tabs from all windows

firefoxview-recently-closed-nav = Separadores fechados recentemente
    .title = Separadores fechados recentemente
firefoxview-recently-closed-header = Separadores fechados recentemente

## Tabs from other devices refers in this context refers to synced tabs from other devices

firefoxview-synced-tabs-nav = Separadores de outros dispositivos
    .title = Separadores de outros dispositivos
firefoxview-synced-tabs-header = Separadores de outros dispositivos

##

# Used for a link in collapsible cards, in the 'Recent browsing' page of Firefox View
firefoxview-view-all-link = Ver tudo
# Variables:
#   $winID (Number) - The index of the owner window for this set of tabs
firefoxview-opentabs-window-header =
    .title = Janela { $winID }
# Variables:
#   $winID (Number) - The index of the owner window (which is currently focused) for this set of tabs
firefoxview-opentabs-current-window-header =
    .title = Janela { $winID } (atual)
firefoxview-opentabs-focus-tab =
    .title = Trocar para este separador
firefoxview-show-more = Mostrar mais
firefoxview-show-less = Mostrar menos
