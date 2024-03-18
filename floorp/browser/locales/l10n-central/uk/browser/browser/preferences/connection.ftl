# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

connection-window2 =
    .title = Параметри з'єднання
    .style =
        { PLATFORM() ->
            [macos] min-width: 44em
           *[other] min-width: 49em
        }

connection-close-key =
    .key = w

connection-disable-extension =
    .label = Вимкнути розширення

connection-proxy-configure = Налаштувати доступ до Інтернету через проксі

connection-proxy-option-no =
    .label = Без проксі
    .accesskey = Б
connection-proxy-option-system =
    .label = Використовувати системні налаштування проксі
    .accesskey = п
connection-proxy-option-auto =
    .label = Автоматично визначати налаштування проксі для цієї мережі
    .accesskey = о
connection-proxy-option-manual =
    .label = Ручна конфігурація проксі
    .accesskey = Р

connection-proxy-http = Проксі по HTTP
    .accesskey = H
connection-proxy-http-port = Порт
    .accesskey = о
connection-proxy-https-sharing =
    .label = Також застосувати цей проксі для HTTPS
    .accesskey = с

connection-proxy-https = HTTPS-проксі
    .accesskey = H
connection-proxy-ssl-port = Порт
    .accesskey = р

connection-proxy-socks = Хост SOCKS
    .accesskey = Х
connection-proxy-socks-port = Порт
    .accesskey = т

connection-proxy-socks4 =
    .label = SOCKS 4
    .accesskey = 4
connection-proxy-socks5 =
    .label = SOCKS 5
    .accesskey = 5
connection-proxy-noproxy = Без проксі для
    .accesskey = Б

connection-proxy-noproxy-desc = Приклад: .mozilla.org.ua, localhost, 192.168.1.0/24

# Do not translate "localhost", "127.0.0.1/8" and "::1". (You can translate "and".)
connection-proxy-noproxy-localhost-desc-2 = З'єднання з localhost, 127.0.0.1/8, та ::1 ніколи не використовує проксі.

connection-proxy-autotype =
    .label = URL для автоматичної конфігурації проксі
    .accesskey = а

connection-proxy-reload =
    .label = Оновити
    .accesskey = О

connection-proxy-autologin =
    .label = Не запитувати про автентифікацію, якщо пароль вже збережено
    .accesskey = а
    .tooltip = Якщо у вас є збережені дані для входу, цей параметр виконає автентифікацію на проксі без запитів. При невдалій автентифікації ви отримаєте запит.

connection-proxy-autologin-checkbox =
    .label = Не запитувати про автентифікацію, якщо пароль вже збережено
    .accesskey = а
    .tooltiptext = Якщо у вас є збережені дані для входу, цей параметр виконає автентифікацію на проксі без запитів. При невдалій автентифікації ви отримаєте запит.

connection-proxy-socks-remote-dns =
    .label = Проксі DNS при використанні SOCKS v5
    .accesskey = d

# Variables:
#   $name (String) - Display name or URL for the DNS over HTTPS provider
connection-dns-over-https-url-item-default =
    .label = { $name } (Типово)
    .tooltiptext = Використовувати типовий URL для вирішення DNS через HTTPS

connection-dns-over-https-url-custom =
    .label = Власний
    .accesskey = л
    .tooltiptext = Введіть власний URL для вирішення DNS через HTTPS

connection-dns-over-https-custom-label = Власний
