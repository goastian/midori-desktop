# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

certmgr-title =
    .title = Менеджер сертифікатів

certmgr-tab-mine =
    .label = Ваші сертифікати

certmgr-tab-remembered =
    .label = Рішення з автентифікації

certmgr-tab-people =
    .label = Люди

certmgr-tab-servers =
    .label = Сервери

certmgr-tab-ca =
    .label = Центри сертифікації

certmgr-mine = У вас є сертифікати від цих організацій, що ідентифікують вас
certmgr-remembered = Ці сертифікати використовуються для розпізнавання вас на вебсайтах
certmgr-people = У вас є сертифікати, що ідентифікують цих людей
certmgr-server = Ці записи визначають винятки для помилок сертифікатів серверів
certmgr-ca = У вас є сертифікати, що ідентифікують ці центри сертифікації

certmgr-edit-ca-cert2 =
    .title = Змінити налаштування довіри CA сертифіката
    .style = min-width: 48em;

certmgr-edit-cert-edit-trust = Змінити рівень довіри:

certmgr-edit-cert-trust-ssl =
    .label = Цей сертифікат може ідентифікувати сайти.

certmgr-edit-cert-trust-email =
    .label = Цей сертифікат може ідентифікувати користувачів ел. пошти.

certmgr-delete-cert2 =
    .title = Вилучення сертифіката
    .style = min-width: 48em; min-height: 24em;

certmgr-cert-host =
    .label = Хост

certmgr-cert-name =
    .label = Назва сертифіката

certmgr-cert-server =
    .label = Сервер

certmgr-token-name =
    .label = Пристрій захисту

certmgr-begins-label =
    .label = Починається

certmgr-expires-label =
    .label = Дійсний до

certmgr-email =
    .label = Адреса електронної пошти

certmgr-serial =
    .label = Серійний номер

certmgr-fingerprint-sha-256 =
    .label = Відбиток SHA-256

certmgr-view =
    .label = Переглянути…
    .accesskey = П

certmgr-edit =
    .label = Зміна Довіри…
    .accesskey = Д

certmgr-export =
    .label = Експорт…
    .accesskey = Е

certmgr-delete =
    .label = Видалити…
    .accesskey = л

certmgr-delete-builtin =
    .label = Видалити або Не довіряти…
    .accesskey = В

certmgr-backup =
    .label = Створити резервну копію…
    .accesskey = т

certmgr-backup-all =
    .label = Створити резервні копії всіх…
    .accesskey = х

certmgr-restore =
    .label = Імпорт…
    .accesskey = І

certmgr-add-exception =
    .label = Додати виняток…
    .accesskey = к

exception-mgr =
    .title = Додати виняток безпеки

exception-mgr-extra-button =
    .label = Затвердити виняток безпеки
    .accesskey = З

exception-mgr-supplemental-warning = Законні банки, крамниці та інші публічні сайти не попросять це зробити.

exception-mgr-cert-location-url =
    .value = Адреса:

exception-mgr-cert-location-download =
    .label = Отримати сертифікат
    .accesskey = С

exception-mgr-cert-status-view-cert =
    .label = Переглянути…
    .accesskey = н

exception-mgr-permanent =
    .label = Зробити цей виняток постійним
    .accesskey = п

pk11-bad-password = Введено невірний пароль.
pkcs12-decode-err = Помилка розшифровування файлу. Або це не файл PKCS#12, або файл пошкоджений, або введений вами пароль невірний.
pkcs12-unknown-err-restore = Неможливо відновити файл PKCS#12 з невідомих причин.
pkcs12-unknown-err-backup = Невідома помилка резервного копіювання файлу PKCS#12.
pkcs12-unknown-err = Операція PKCS #12 завершена невдало з невідомих причин.
pkcs12-info-no-smartcard-backup = Неможливо відновити сертифікати з такого апаратного пристрою захисту, як смарт-карта.
pkcs12-dup-data = Сертифікат і закритий ключ вже існують в пристрої захисту.

## PKCS#12 file dialogs

choose-p12-backup-file-dialog = Назва файлу резервної копії
file-browse-pkcs12-spec = Файли PKCS12
choose-p12-restore-file-dialog = Файл сертифіката для імпорту

## Import certificate(s) file dialog

file-browse-certificate-spec = Файли сертифікатів
import-ca-certs-prompt = Виберіть для імпорту файл, що містить сертифікат центру
import-email-cert-prompt = Виберіть для імпорту файл, що містить чий-небудь сертифікат електронної пошти

## For editing certificates trust

# Variables:
#   $certName: the name of certificate
edit-trust-ca = Сертифікат "{ $certName }" представляє центр сертифікації.

## For Deleting Certificates

delete-user-cert-title =
    .title = Вилучення власних сертифікатів
delete-user-cert-confirm = Ви дійсно хочете вилучити ці сертифікати?
delete-user-cert-impact = Якщо ви вилучите один з власних сертифікатів, ви не зможете більше використовувати його, щоб ідентифікувати себе.


delete-ssl-override-title =
    .title = Видалити виняток для сертифіката сервера
delete-ssl-override-confirm = Ви дійсно хочете видалити виняток для цього сервера?
delete-ssl-override-impact = Якщо ви видалите виняток для сервера, ви відновите стандартні перевірки безпеки й вимоги використання дійсного сертифіката для цього сервера.

delete-ca-cert-title =
    .title = Видалення або Недовіра CA-сертифікатів
delete-ca-cert-confirm = Ви дали запит на видалення цих CA-сертифікатів. Для вбудованих сертифікатів вся довіра буде скасована, що має той же ефект. Дійсно провести вилучення або встановити недовіру?
delete-ca-cert-impact = Якщо ви видалите чи встановите недовіру сертифіката центру сертифікації(CA), ця програма більше не буде довіряти жодним сертифікатам, виданим цим CA.


delete-email-cert-title =
    .title = Вилучення сертифікатів електронної пошти
delete-email-cert-confirm = Ви дійсно хочете вилучити сертифікати електронної пошти цих людей?
delete-email-cert-impact = Якщо ви вилучите поштовий сертифікат певної особи, ви більше не зможете надсилати їй шифровані.

# Used for semi-uniquely representing a cert.
#
# Variables:
#   $serialNumber : the serial number of the cert in AA:BB:CC hex format.
cert-with-serial =
    .value = Сертифікат з серійним номером: { $serialNumber }

# Used to indicate that the user chose not to send a client authentication certificate to a server that requested one in a TLS handshake.
send-no-client-certificate = Не надсилати сертифікат клієнта

# Used when no cert is stored for an override
no-cert-stored-for-override = (Не збережено)

# When a certificate is unavailable (for example, it has been deleted or the token it exists on has been removed).
certificate-not-available = (Недоступно)

## Used to show whether an override is temporary or permanent

permanent-override = Постійний
temporary-override = Тимчасовий

## Add Security Exception dialog

add-exception-branded-warning = Ви збираєтесь знехтувати тим, як { -brand-short-name } ідентифікує цей сайт.
add-exception-invalid-header = Цей сайт намагається ідентифікувати себе, використовуючи недійсну інформацію.
add-exception-domain-mismatch-short = Неправильний сайт
add-exception-domain-mismatch-long = Сертифікат належить іншому сайту, що може означати, що хтось намагається видати цей сайт за інший.
add-exception-expired-short = Застаріла інформація
add-exception-expired-long = Сертифікат вже недійсний. Він міг бути викрадений чи загублений, та може бути використаний кимось для підміни цього сайта іншим.
add-exception-unverified-or-bad-signature-short = Невідомий центр сертифікації
add-exception-unverified-or-bad-signature-long = Сертифікат не є довіреним, оскільки він не був засвідчений довіреним центром сертифікації з використанням безпечного підпису.
add-exception-valid-short = Чинний сертифікат
add-exception-valid-long = Цей сайт надає дійсну, перевірену ідентифікаційну інформацію. Немає потреби додавати виняток.
add-exception-checking-short = Перевіряється інформація
add-exception-checking-long = Спроба ідентифікації цього сайту…
add-exception-no-cert-short = Немає доступної інформації
add-exception-no-cert-long = Не вдалося отримати інформацію про ідентифікаційний статус цього сайту.

## Certificate export "Save as" and error dialogs

save-cert-as = Зберегти сертифікат у файл
cert-format-base64 = Сертифікат X.509 (PEM)
cert-format-base64-chain = Сертифікат X.509 з ланцюжком (PEM)
cert-format-der = Сертифікат X.509 (DER)
cert-format-pkcs7 = Сертифікат X.509 (PKCS#7)
cert-format-pkcs7-chain = Сертифікат X.509 з ланцюжком (PKCS#7)
write-file-failure = Файлова помилка
