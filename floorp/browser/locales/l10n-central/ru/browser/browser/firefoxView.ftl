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
    .title = Закрыть
    .aria-label = Закрыть
# Used instead of the localized relative time when a timestamp is within a minute or so of now
firefoxview-just-now-timestamp = Прямо сейчас
# This is a headline for an area in the product where users can resume and re-open tabs they have previously viewed on other devices.
firefoxview-tabpickup-header = Выбор вкладки
firefoxview-tabpickup-description = Открывать страницы с других устройств.
# Variables:
#  $percentValue (Number): the percentage value for setup completion
firefoxview-tabpickup-progress-label = { $percentValue }% завершено
firefoxview-tabpickup-step-signin-header = Легко переключайтесь между устройствами
firefoxview-tabpickup-step-signin-description = Чтобы просматривать здесь вкладки со своего телефона, сначала выполните вход или создайте аккаунт.
firefoxview-tabpickup-step-signin-primarybutton = Продолжить
firefoxview-tabpickup-adddevice-header = Синхронизируйте { -brand-product-name } на своем телефоне или планшете
firefoxview-tabpickup-adddevice-description = Загрузите { -brand-product-name } для мобильных устройств и выполните вход.
firefoxview-tabpickup-adddevice-learn-how = Подробнее
firefoxview-tabpickup-adddevice-primarybutton = Получить { -brand-product-name } для мобильных устройств
firefoxview-tabpickup-synctabs-header = Включить синхронизацию вкладок
firefoxview-tabpickup-synctabs-description = Разрешить { -brand-short-name } делиться вкладками между устройствами.
firefoxview-tabpickup-synctabs-learn-how = Подробнее
firefoxview-tabpickup-synctabs-primarybutton = Синхронизировать открытые вкладки
firefoxview-tabpickup-fxa-admin-disabled-header = В вашей организации синхронизация отключена
firefoxview-tabpickup-fxa-admin-disabled-description = { -brand-short-name } не может синхронизировать вкладки между устройствами, потому что ваш администратор отключил синхронизацию.
firefoxview-tabpickup-network-offline-header = Проверьте своё соединение с Интернетом
firefoxview-tabpickup-network-offline-description = Если вы используете межсетевой экран или прокси, убедитесь, что { -brand-short-name } разрешён доступ к Интернету.
firefoxview-tabpickup-network-offline-primarybutton = Попробовать снова
firefoxview-tabpickup-sync-error-header = У нас возникли проблемы с синхронизацией
firefoxview-tabpickup-generic-sync-error-description = { -brand-short-name } не удаётся соединиться со службой синхронизации прямо сейчас. Попробуйте снова через некоторое время.
firefoxview-tabpickup-sync-error-primarybutton = Попробовать снова
firefoxview-tabpickup-sync-disconnected-header = Для продолжения включите синхронизацию
firefoxview-tabpickup-sync-disconnected-description = Чтобы забрать вкладки, вам нужно разрешить в { -brand-short-name } синхронизацию.
firefoxview-tabpickup-sync-disconnected-primarybutton = Включить в настройках синхронизацию
firefoxview-tabpickup-password-locked-header = Введите свой Основной пароль для просмотра вкладок
firefoxview-tabpickup-password-locked-description = Чтобы получить свои вкладки, вам потребуется ввести Основной пароль для { -brand-short-name }.
firefoxview-tabpickup-password-locked-link = Подробнее
firefoxview-tabpickup-password-locked-primarybutton = Введите Основной пароль
firefoxview-tabpickup-signed-out-header = Войти, чтобы подключиться снова
firefoxview-tabpickup-signed-out-description = Чтобы снова подключиться и получить свои вкладки, войдите в свой { -fxaccount-brand-name(case: "nominative") }.
firefoxview-tabpickup-signed-out-primarybutton = Войти
firefoxview-tabpickup-syncing = Подождите, пока вкладки синхронизируются. Это займёт одно мгновение.
firefoxview-mobile-promo-header = Просматривайте вкладки со своего телефона или планшета
firefoxview-mobile-promo-description = Чтобы просмотреть свои последние вкладки с мобильного устройства, войдите в { -brand-product-name } на iOS или Android.
firefoxview-mobile-promo-primarybutton = Получить { -brand-product-name } для мобильных устройств
firefoxview-mobile-confirmation-header = 🎉 Всё готово!
firefoxview-mobile-confirmation-description = Теперь вы можете просматривать свои вкладки { -brand-product-name } с планшета или телефона.
firefoxview-closed-tabs-title = Недавно закрытые
firefoxview-closed-tabs-description2 = Заново открыть страницы, которые вы закрыли в этом окне.
firefoxview-closed-tabs-placeholder-header = Нет недавно закрытых вкладок
firefoxview-closed-tabs-placeholder-body = Когда вы закрываете вкладку в этом окне, вы можете восстановить её здесь.
# Variables:
#   $tabTitle (string) - Title of tab being dismissed
firefoxview-closed-tabs-dismiss-tab =
    .title = Убрать { $tabTitle }
# refers to the last tab that was used
firefoxview-pickup-tabs-badge = Последняя активная
# Variables:
#   $targetURI (string) - URL that will be opened in the new tab
firefoxview-tabs-list-tab-button =
    .title = Открыть { $targetURI } в новой вкладке
firefoxview-try-colorways-button = Попробуйте расцветки
firefoxview-change-colorway-button = Сменить расцветку
# Variables:
#  $intensity (String): Colorway intensity
#  $collection (String): Colorway Collection name
firefoxview-colorway-description = { $intensity } · { $collection }
firefoxview-synced-tabs-placeholder-header = Здесь пока ничего нет
firefoxview-synced-tabs-placeholder-body = В следующий раз, когда вы откроете страницу в { -brand-product-name } на другом устройстве, она появится здесь, как по волшебству.
firefoxview-collapse-button-show =
    .title = Показать список
firefoxview-collapse-button-hide =
    .title = Скрыть список
firefoxview-overview-nav = Недавний просмотр
    .title = Недавний просмотр

## History in this context refers to browser history

firefoxview-history-nav = История
    .title = История
firefoxview-history-header = История

## Open Tabs in this context refers to all open tabs in the browser

firefoxview-opentabs-nav = Открытые вкладки
    .title = Открытые вкладки
firefoxview-opentabs-header = Открытые вкладки

## Recently closed tabs in this context refers to recently closed tabs from all windows

firefoxview-recently-closed-nav = Недавно закрытые вкладки
    .title = Недавно закрытые вкладки
firefoxview-recently-closed-header = Недавно закрытые вкладки

## Tabs from other devices refers in this context refers to synced tabs from other devices

firefoxview-synced-tabs-nav = Вкладки с других устройств
    .title = Вкладки с других устройств
firefoxview-synced-tabs-header = Вкладки с других устройств

##

# Used for a link in collapsible cards, in the 'Recent browsing' page of Firefox View
firefoxview-view-all-link = Просмотреть все
# Variables:
#   $winID (Number) - The index of the owner window for this set of tabs
firefoxview-opentabs-window-header =
    .title = Окно { $winID }
# Variables:
#   $winID (Number) - The index of the owner window (which is currently focused) for this set of tabs
firefoxview-opentabs-current-window-header =
    .title = Окно { $winID } (Текущее)
firefoxview-opentabs-focus-tab =
    .title = Переключаться на эту вкладку
firefoxview-show-more = Показать больше
firefoxview-show-less = Показать меньше
