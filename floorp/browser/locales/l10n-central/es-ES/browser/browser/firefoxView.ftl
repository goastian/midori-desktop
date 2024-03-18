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
    .title = Cerrar
    .aria-label = Cerrar
# Used instead of the localized relative time when a timestamp is within a minute or so of now
firefoxview-just-now-timestamp = Ahora mismo
# This is a headline for an area in the product where users can resume and re-open tabs they have previously viewed on other devices.
firefoxview-tabpickup-header = Selector de pestañas
firefoxview-tabpickup-description = Abrir pestañas de otros dispositivos.
# Variables:
#  $percentValue (Number): the percentage value for setup completion
firefoxview-tabpickup-progress-label = { $percentValue }% completado
firefoxview-tabpickup-step-signin-header = Cambie fácilmente entre dispositivos
firefoxview-tabpickup-step-signin-description = Para ver las pestañas de su teléfono aquí, primero inicie sesión o cree una cuenta.
firefoxview-tabpickup-step-signin-primarybutton = Continuar
firefoxview-tabpickup-adddevice-header = Sincronizar { -brand-product-name } en su teléfono o tableta
firefoxview-tabpickup-adddevice-description = Descargue { -brand-product-name } para dispositivos móviles e inicie sesión allí.
firefoxview-tabpickup-adddevice-learn-how = Saber cómo
firefoxview-tabpickup-adddevice-primarybutton = Obtenga { -brand-product-name } para móviles
firefoxview-tabpickup-synctabs-header = Activar la sincronización de pestañas
firefoxview-tabpickup-synctabs-description = Permitir que { -brand-short-name } comparta pestañas entre dispositivos.
firefoxview-tabpickup-synctabs-learn-how = Saber cómo
firefoxview-tabpickup-synctabs-primarybutton = Sincronizar pestañas abiertas
firefoxview-tabpickup-fxa-admin-disabled-header = Su organización ha desactivado la sincronización
firefoxview-tabpickup-fxa-admin-disabled-description = { -brand-short-name } no puede sincronizar las pestañas entre dispositivos porque su administrador desactivó la sincronización.
firefoxview-tabpickup-network-offline-header = Compruebe su conexión a internet
firefoxview-tabpickup-network-offline-description = Si está utilizando un firewall o proxy, verifique que { -brand-short-name } tenga permiso para acceder a la web.
firefoxview-tabpickup-network-offline-primarybutton = Reintentar
firefoxview-tabpickup-sync-error-header = Tenemos problemas para sincronizar
firefoxview-tabpickup-generic-sync-error-description = { -brand-short-name } no puede comunicarse con el servicio de sincronización en este momento. Vuelva a intentarlo en unos instantes.
firefoxview-tabpickup-sync-error-primarybutton = Reintentar
firefoxview-tabpickup-sync-disconnected-header = Activar la sincronización para continuar
firefoxview-tabpickup-sync-disconnected-description = Para recuperar sus pestañas, deberá permitir la sincronización en { -brand-short-name }.
firefoxview-tabpickup-sync-disconnected-primarybutton = Activar la sincronización en los ajustes
firefoxview-tabpickup-password-locked-header = Escriba su contraseña maestra para ver las pestañas
firefoxview-tabpickup-password-locked-description = Para recuperar sus pestañas, deberá escribir la contraseña maestra de { -brand-short-name }.
firefoxview-tabpickup-password-locked-link = Saber más
firefoxview-tabpickup-password-locked-primarybutton = Escriba la contraseña maestra
firefoxview-tabpickup-signed-out-header = Inicie sesión para reconectar
firefoxview-tabpickup-signed-out-description = Para volver a conectar y recuperar sus pestañas, inicie sesión en su { -fxaccount-brand-name }.
firefoxview-tabpickup-signed-out-primarybutton = Iniciar sesión
firefoxview-tabpickup-syncing = Espere mientras sus pestañas se sincronizan. Será solo un momento.
firefoxview-mobile-promo-header = Recuperar las pestañas desde su teléfono o tableta
firefoxview-mobile-promo-description = Para ver sus últimas pestañas móviles, conéctese a { -brand-product-name } en iOS o Android.
firefoxview-mobile-promo-primarybutton = Obtenga { -brand-product-name } para móviles
firefoxview-mobile-confirmation-header = 🎉 ¡Todo preparado!
firefoxview-mobile-confirmation-description = Ahora puede continuar con sus pestañas de { -brand-product-name } desde su tableta o teléfono.
firefoxview-closed-tabs-title = Cerradas recientemente
firefoxview-closed-tabs-description2 = Volver a abrir las páginas que cerró en esta ventana.
firefoxview-closed-tabs-placeholder-header = No hay pestañas cerradas recientemente
firefoxview-closed-tabs-placeholder-body = Cuando cierre una pestaña en esta ventana, puede buscarla desde aquí.
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
firefoxview-closed-tabs-dismiss-tab =
    .title = Descartar { $tabTitle }
# refers to the last tab that was used
firefoxview-pickup-tabs-badge = Última activa
# Variables:
#   $targetURI (string) - URL that will be opened in the new tab
firefoxview-tabs-list-tab-button =
    .title = Abrir { $targetURI } en una nueva pestaña
firefoxview-try-colorways-button = Probar combinaciones de colores
firefoxview-change-colorway-button = Cambiar la combinación de colores
# Variables:
#  $intensity (String): Colorway intensity
#  $collection (String): Colorway Collection name
firefoxview-colorway-description = { $intensity } · { $collection }
firefoxview-synced-tabs-placeholder-header = Nada que ver todavía
firefoxview-synced-tabs-placeholder-body = La próxima vez que abra una página en { -brand-product-name } en otro dispositivo, la encontrará aquí como por arte de magia.
firefoxview-collapse-button-show =
    .title = Mostrar lista
firefoxview-collapse-button-hide =
    .title = Ocultar lista
firefoxview-overview-nav = Navegación reciente
    .title = Navegación reciente

## History in this context refers to browser history

firefoxview-history-nav = Historia
    .title = Historia
firefoxview-history-header = Historial

## Open Tabs in this context refers to all open tabs in the browser

firefoxview-opentabs-nav = Pestañas abiertas
    .title = Pestañas abiertas
firefoxview-opentabs-header = Pestañas abiertas

## Recently closed tabs in this context refers to recently closed tabs from all windows

firefoxview-recently-closed-nav = Pestañas cerradas recientemente
    .title = Pestañas cerradas recientemente
firefoxview-recently-closed-header = Pestañas cerradas recientemente

## Tabs from other devices refers in this context refers to synced tabs from other devices

firefoxview-synced-tabs-nav = Pestañas de otros dispositivos
    .title = Pestañas de otros dispositivos
firefoxview-synced-tabs-header = Pestañas de otros dispositivos

##

# Used for a link in collapsible cards, in the 'Recent browsing' page of Firefox View
firefoxview-view-all-link = Ver todo
# Variables:
#   $winID (Number) - The index of the owner window for this set of tabs
firefoxview-opentabs-window-header =
    .title = Ventana { $winID }
# Variables:
#   $winID (Number) - The index of the owner window (which is currently focused) for this set of tabs
firefoxview-opentabs-current-window-header =
    .title = Ventana { $winID } (Actual)
firefoxview-opentabs-focus-tab =
    .title = Cambiar a esta pestaña
firefoxview-show-more = Mostrar más
firefoxview-show-less = Mostrar menos
