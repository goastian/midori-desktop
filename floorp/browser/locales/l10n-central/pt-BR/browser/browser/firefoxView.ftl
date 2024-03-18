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
firefoxview-just-now-timestamp = há pouco
# This is a headline for an area in the product where users can resume and re-open tabs they have previously viewed on other devices.
firefoxview-tabpickup-header = Escolha de abas
firefoxview-tabpickup-description = Abra páginas de outros dispositivos.
# Variables:
#  $percentValue (Number): the percentage value for setup completion
firefoxview-tabpickup-progress-label = { $percentValue }% concluído
firefoxview-tabpickup-step-signin-header = Passe facilmente de um dispositivo para outro
firefoxview-tabpickup-step-signin-description = Para abrir aqui as abas do seu celular, primeiro entre na sua conta ou crie uma.
firefoxview-tabpickup-step-signin-primarybutton = Avançar
firefoxview-tabpickup-adddevice-header = Sincronize o { -brand-product-name } em seu celular ou tablet
firefoxview-tabpickup-adddevice-description = Instale o { -brand-product-name } para dispositivos móveis e entre na sua conta.
firefoxview-tabpickup-adddevice-learn-how = Saiba como
firefoxview-tabpickup-adddevice-primarybutton = Instale o { -brand-product-name } para dispositivos móveis
firefoxview-tabpickup-synctabs-header = Ative a sincronização de abas
firefoxview-tabpickup-synctabs-description = Permitir que o { -brand-short-name } compartilhe abas entre dispositivos.
firefoxview-tabpickup-synctabs-learn-how = Saiba como
firefoxview-tabpickup-synctabs-primarybutton = Sincronizar abas abertas
firefoxview-tabpickup-fxa-admin-disabled-header = Sua organização desativou a sincronização
firefoxview-tabpickup-fxa-admin-disabled-description = O { -brand-short-name } não consegue sincronizar abas entre dispositivos porque seu administrador desativou a sincronização.
firefoxview-tabpickup-network-offline-header = Verifique sua conexão com a internet
firefoxview-tabpickup-network-offline-description = Se estiver usando um firewall ou proxy, verifique se o { -brand-short-name } tem permissão para acessar a web.
firefoxview-tabpickup-network-offline-primarybutton = Tentar novamente
firefoxview-tabpickup-sync-error-header = Há algum problema na sincronização
firefoxview-tabpickup-generic-sync-error-description = O { -brand-short-name } não pode acessar o serviço de sincronização no momento. Tente novamente daqui a pouco.
firefoxview-tabpickup-sync-error-primarybutton = Tentar novamente
firefoxview-tabpickup-sync-disconnected-header = Ative a sincronização para continuar
firefoxview-tabpickup-sync-disconnected-description = Para pegar suas abas, você precisa permitir a sincronização no { -brand-short-name }.
firefoxview-tabpickup-sync-disconnected-primarybutton = Ativar a sincronização nas configurações
firefoxview-tabpickup-password-locked-header = Digite sua senha principal para ver abas
firefoxview-tabpickup-password-locked-description = Para recuperar suas abas, precisa inserir a senha principal do { -brand-short-name }.
firefoxview-tabpickup-password-locked-link = Saiba mais
firefoxview-tabpickup-password-locked-primarybutton = Digite a senha principal
firefoxview-tabpickup-signed-out-header = Entre na conta para reconectar
firefoxview-tabpickup-signed-out-description = Para reconectar e acessar suas abas, entre na sua conta { -fxaccount-brand-name }.
firefoxview-tabpickup-signed-out-primarybutton = Entrar
firefoxview-tabpickup-syncing = Aguarde a sincronização de abas. É rápido.
firefoxview-mobile-promo-header = Abra abas do seu celular ou tablet
firefoxview-mobile-promo-description = Para ver suas abas mais recentes do celular, entre na sua conta no { -brand-product-name } no iOS ou Android.
firefoxview-mobile-promo-primarybutton = Instale o { -brand-product-name } para dispositivos móveis
firefoxview-mobile-confirmation-header = 🎉 Pronto!
firefoxview-mobile-confirmation-description = Agora você pode abrir suas abas do { -brand-product-name } do seu tablet ou celular.
firefoxview-closed-tabs-title = Fechado recentemente
firefoxview-closed-tabs-description2 = Reabra páginas que você fechou neste computador.
firefoxview-closed-tabs-placeholder-header = Nenhuma aba fechada recentemente
firefoxview-closed-tabs-placeholder-body = Ao fechar uma aba nesta janela, você pode recuperar aqui.
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
firefoxview-closed-tabs-dismiss-tab =
    .title = Descartar { $tabTitle }
# refers to the last tab that was used
firefoxview-pickup-tabs-badge = Última ativa
# Variables:
#   $targetURI (string) - URL that will be opened in the new tab
firefoxview-tabs-list-tab-button =
    .title = Abrir { $targetURI } em nova aba
firefoxview-try-colorways-button = Experimentar esquemas de cores
firefoxview-change-colorway-button = Mudar esquema de cores
# Variables:
#  $intensity (String): Colorway intensity
#  $collection (String): Colorway Collection name
firefoxview-colorway-description = { $intensity } · { $collection }
firefoxview-synced-tabs-placeholder-header = Nada para mostrar ainda
firefoxview-synced-tabs-placeholder-body = A próxima vez que você abrir uma página no { -brand-product-name } em outro dispositivo, ela aparece aqui como mágica.
firefoxview-collapse-button-show =
    .title = Exibir lista
firefoxview-collapse-button-hide =
    .title = Ocultar lista
firefoxview-overview-nav = Navegação recente
    .title = Navegação recente

## History in this context refers to browser history

firefoxview-history-nav = Histórico
    .title = Histórico
firefoxview-history-header = Histórico

## Open Tabs in this context refers to all open tabs in the browser

firefoxview-opentabs-nav = Abas abertas
    .title = Abas abertas
firefoxview-opentabs-header = Abas abertas

## Recently closed tabs in this context refers to recently closed tabs from all windows

firefoxview-recently-closed-nav = Abas fechadas recentemente
    .title = Abas fechadas recentemente
firefoxview-recently-closed-header = Abas fechadas recentemente

## Tabs from other devices refers in this context refers to synced tabs from other devices

firefoxview-synced-tabs-nav = Abas de outros dispositivos
    .title = Abas de outros dispositivos
firefoxview-synced-tabs-header = Abas de outros dispositivos

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
    .title = Mudar para esta aba
firefoxview-show-more = Mostrar mais
firefoxview-show-less = Mostrar menos
