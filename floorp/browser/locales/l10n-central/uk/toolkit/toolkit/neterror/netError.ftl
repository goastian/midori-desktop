# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Error page titles

neterror-page-title = Проблема під час завантаження сторінки
certerror-page-title = Обережно: Попереду ймовірна загроза безпеки
certerror-sts-page-title = З'єднання не встановлено: Ймовірна загроза безпеки
neterror-blocked-by-policy-page-title = Заблокована сторінка
neterror-captive-portal-page-title = Вхід в мережу
neterror-dns-not-found-title = Сервер не знайдено
neterror-malformed-uri-page-title = Недійсна URL-адреса

## Error page actions

neterror-advanced-button = Додатково…
neterror-copy-to-clipboard-button = Копіювати текст у буфер обміну
neterror-learn-more-link = Докладніше…
neterror-open-portal-login-page-button = Відкрити сторінку входу в мережу
neterror-override-exception-button = Погодитись на ризик і продовжити
neterror-pref-reset-button = Відновити типові налаштування
neterror-return-to-previous-page-button = Назад
neterror-return-to-previous-page-recommended-button = Назад (Рекомендовано)
neterror-try-again-button = Спробувати знову
neterror-add-exception-button = Завжди продовжувати для цього сайту
neterror-settings-button = Змінити налаштування DNS
neterror-view-certificate-link = Переглянути сертифікат
neterror-trr-continue-this-time = Продовжити цього разу
neterror-disable-native-feedback-warning = Завжди продовжувати

##

neterror-pref-reset = Схоже, що це можуть спричиняти ваші налаштування безпеки мережі. Чи хочете ви, щоб були відновлені типові налаштування?
neterror-error-reporting-automatic = Звітувати про подібні помилки, щоб допомогти { -vendor-short-name } виявляти й блокувати зловмисні сайти

## Specific error messages

neterror-generic-error = { -brand-short-name } не може завантажити цю сторінку з невизначеної причини.
neterror-load-error-try-again = Сайт може бути тимчасово недоступний, або перевантажений запитами. Спробуйте знову трохи згодом.
neterror-load-error-connection = Якщо жодна сторінка не завантажується, перевірте з'єднання комп'ютера з інтернетом.
neterror-load-error-firewall = Якщо ваш комп'ютер або мережа захищені мережевим екраном чи проксі-сервером, переконайтеся, що для { -brand-short-name } дозволено доступ до інтернету.
neterror-captive-portal = Перш ніж отримати доступ до Інтернету, ви повинні увійти в цю мережу.
# Variables:
# $hostAndPath (String) - a suggested site (e.g. "www.example.com") that the user may have meant instead.
neterror-dns-not-found-with-suggestion = Ви хотіли відвідати <a data-l10n-name="website">{ $hostAndPath }</a>?
neterror-dns-not-found-hint-header = <strong>Якщо ви ввели правильну адресу, можна:</strong>
neterror-dns-not-found-hint-try-again = Спробувати знову пізніше
neterror-dns-not-found-hint-check-network = Перевірити мережеве з'єднання
neterror-dns-not-found-hint-firewall = Перевірити чи { -brand-short-name } має дозвіл на доступ до інтернету (мережевий екран може блокувати з'єднання)

## TRR-only specific messages
## Variables:
##   $hostname (String) - Hostname of the website to which the user was trying to connect.
##   $trrDomain (String) - Hostname of the DNS over HTTPS server that is currently in use.

neterror-dns-not-found-trr-only-reason = { -brand-short-name } не може захистити ваш запит для адреси цього сайту через нашу довірену службу DNS. Ось чому:
neterror-dns-not-found-trr-third-party-warning2 = Ви можете продовжити роботу з типовим DNS-перетворювачем. Однак, сторонні можуть мати змогу бачити відвідувані вами вебсайти.
neterror-dns-not-found-trr-only-could-not-connect = { -brand-short-name } не зміг встановити з'єднання з { $trrDomain }.
neterror-dns-not-found-trr-only-timeout = З'єднання з { $trrDomain } тривало довше, ніж очікувалося.
neterror-dns-not-found-trr-offline = Ви не під'єднані до інтернету.
neterror-dns-not-found-trr-unknown-host2 = { $trrDomain } не може знайти цей вебсайт.
neterror-dns-not-found-trr-server-problem = Виникла проблема з { $trrDomain }.
neterror-dns-not-found-bad-trr-url = Недійсна URL-адреса.
neterror-dns-not-found-trr-unknown-problem = Неочікувана проблема.

## Native fallback specific messages
## Variables:
##   $trrDomain (String) - Hostname of the DNS over HTTPS server that is currently in use.

neterror-dns-not-found-native-fallback-reason = { -brand-short-name } не може захистити ваш запит для адреси цього сайту через нашу довірену службу DNS. Ось чому:
neterror-dns-not-found-native-fallback-heuristic = DNS через HTTPS було вимкнено у вашій мережі.
neterror-dns-not-found-native-fallback-not-confirmed2 = { -brand-short-name } не зміг встановити з'єднання з { $trrDomain }.

##

neterror-file-not-found-filename = Перевірте правильність назви файлу, відповідність регістру та відсутність інших помилок.
neterror-file-not-found-moved = Перевірте, чи файл не був переміщений, перейменований або видалений.
neterror-access-denied = Він міг бути вилучений, переміщений, або дозволи файлу забороняють доступ.
neterror-unknown-protocol = Для відкриття цієї адреси вам, можливо, доведеться встановити стороннє програмне забезпечення.
neterror-redirect-loop = Ця проблема може виникати при вимиканні або забороні прийняття кук.
neterror-unknown-socket-type-psm-installed = Переконайтеся, що у вашій системі встановлено Personal Security Manager (PSM).
neterror-unknown-socket-type-server-config = Можливо, це відбулося через нетипову конфігурацію сервера.
neterror-not-cached-intro = Вказаний документ більше недоступний у кеші { -brand-short-name }.
neterror-not-cached-sensitive = З міркувань безпеки, { -brand-short-name } не здійснює автоматичний повторний запит вразливих документів.
neterror-not-cached-try-again = Клацніть "Спробувати знову", щоб перезавантажити документ з вебсайту.
neterror-net-offline = Натисніть "Спробувати знову" щоб перемкнутись в онлайновий режим і перезавантажити сторінку.
neterror-proxy-resolve-failure-settings = Перевірте правильність встановлених налаштувань проксі-сервера.
neterror-proxy-resolve-failure-connection = Перевірте з'єднання вашого комп'ютера з мережею.
neterror-proxy-resolve-failure-firewall = Якщо ваш комп'ютер або мережа захищені мережевим екраном чи проксі-сервером, переконайтеся, що для { -brand-short-name } дозволено доступ до інтернету.
neterror-proxy-connect-failure-settings = Перевірте налаштування проксі-сервера і переконайтеся, що вони правильні.
neterror-proxy-connect-failure-contact-admin = Зв'яжіться з вашим системним адміністратором і переконайтеся, що проксі-сервер працює.
neterror-content-encoding-error = Будь ласка, зв'яжіться з власниками вебсайту і повідомте їх про цю проблему.
neterror-unsafe-content-type = Будь ласка, зв'яжіться з власниками вебсайту і повідомте їх про цю проблему.
neterror-nss-failure-not-verified = Неможливо відобразити сторінку, яку ви намагаєтесь переглянути, оскільки неможливо перевірити справжність отриманих даних.
neterror-nss-failure-contact-website = Будь ласка, зв'яжіться з власниками вебсайту і повідомте їх про цю проблему.
# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
certerror-intro = { -brand-short-name } виявив ймовірну загрозу безпеки і не продовжив перехід на <b>{ $hostname }</b>. Якщо ви відвідаєте цей сайт, зловмисники можуть спробувати викрасти вашу інформацію, наприклад, паролі, електронні адреси, або дані платіжних карток.
# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
certerror-sts-intro = { -brand-short-name } виявив потенційну вразливість безпеки і не продовжив встановлення з'єднання з <b>{ $hostname }</b>, тому що цей вебсайт вимагає захищене з'єднання.
# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
certerror-expired-cert-intro = { -brand-short-name } виявив проблему і не встановив з'єднання з <b>{ $hostname }</b>. Вебсайт має неправильну конфігурацію, або годинник вашого комп'ютера має неправильний час.
# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
# $mitm (String) - The name of the software intercepting communications between you and the website (or “man in the middle”)
certerror-mitm = <b>{ $hostname }</b>, найімовірніше, є безпечним сайтом, але захищене з'єднання не вдалося встановити. Ця проблема спричинена <b>{ $mitm }</b> - програмним забезпеченням на вашому комп'ютері чи у вашій мережі.
neterror-corrupted-content-intro = Неможливо відобразити сторінку, яку ви намагаєтесь переглянути, оскільки було виявлено помилку в передачі даних.
neterror-corrupted-content-contact-website = Будь ласка, зв'яжіться з власниками вебсайту та повідомте їх про цю проблему.
# Do not translate "SSL_ERROR_UNSUPPORTED_VERSION".
neterror-sslv3-used = Додаткова інформація: SSL_ERROR_UNSUPPORTED_VERSION
# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
neterror-inadequate-security-intro = <b>{ $hostname }</b> використовує технологію безпеки, яка є застарілою і вразливою до атак. Нападник може з легкістю розкрити інформацію, яка, на вашу думку, є захищеною. Перш ніж ви зможете відвідати сайт, його адміністратор повинен виправити це на сервері.
# Do not translate "NS_ERROR_NET_INADEQUATE_SECURITY".
neterror-inadequate-security-code = Код помилки: NS_ERROR_NET_INADEQUATE_SECURITY
# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
# $now (Date) - The current datetime, to be formatted as a date
neterror-clock-skew-error = Ваш комп'ютер вважає, що це { DATETIME($now, dateStyle: "medium") }, тому { -brand-short-name } не може встановити захищене з'єднання. Для відвідання <b>{ $hostname }</b>, оновіть системні налаштування дати, часу та часового поясу, після чого оновіть <b>{ $hostname }</b>.
neterror-network-protocol-error-intro = Неможливо відобразити сторінку, яку ви намагаєтесь переглянути, тому що виявлено помилку мережевого протоколу.
neterror-network-protocol-error-contact-website = Зв'яжіться з власниками вебсайту, щоб повідомити їх про цю проблему.
certerror-expired-cert-second-para = Схоже, що термін дії сертифіката вебсайту завершився, що не дозволяє { -brand-short-name } встановити безпечне з'єднання. Якщо ви відвідаєте цей сайт, зловмисники можуть викрасти інформацію, наприклад, паролі, адреси електронної пошти чи дані кредитних карток.
certerror-expired-cert-sts-second-para = Схоже, що термін дії сертифіката вебсайту завершився, що не дозволяє { -brand-short-name } встановити безпечне з'єднання.
certerror-what-can-you-do-about-it-title = Як ви можете це виправити?
certerror-unknown-issuer-what-can-you-do-about-it-website = Найімовірніше, ця проблема стосується вебсайту, і ви не зможете її виправити.
certerror-unknown-issuer-what-can-you-do-about-it-contact-admin = Якщо ви використовуєте корпоративний комп'ютер, або антивірусне програмне забезпечення, ви можете зв'язатися зі службою підтримки для отримання допомоги. Ви також можете сповістити адміністратора вебсайту про цю проблему.
# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
# $now (Date) - The current datetime, to be formatted as a date
certerror-expired-cert-what-can-you-do-about-it-clock = Годинник вашого комп'ютера налаштовано на { DATETIME($now, dateStyle: "medium") }. Переконайтеся, що ваш комп'ютер має правильні системні налаштування дати, часу та часового поясу, після чого оновіть <b>{ $hostname }</b>.
certerror-expired-cert-what-can-you-do-about-it-contact-website = Якщо ваш годинник налаштовано правильно, ймовірно, конфігурація сайту неправильна і вам не вдасться це виправити. Ви можете повідомити про цю проблему адміністратора вебсайту.
certerror-bad-cert-domain-what-can-you-do-about-it = Найімовірніше, ця проблема стосується вебсайту, і ви не зможете її виправити. Ви можете сповістити адміністратора вебсайту про цю проблему.
certerror-mitm-what-can-you-do-about-it-antivirus = Якщо ваше антивірусне програмне забезпечення має функцію сканування зашифрованих з'єднань (“мережевий сканер” або “https-сканер”), можете вимкнути її. Якщо це не спрацює, можете спробувати перевстановити антивірусне програмне забезпечення.
certerror-mitm-what-can-you-do-about-it-corporate = Якщо ви перебуваєте в корпоративній мережі, можете звернутися до свого IT-відділу.
# Variables:
# $mitm (String) - The name of the software intercepting communications between you and the website (or “man in the middle”)
certerror-mitm-what-can-you-do-about-it-attack = Якщо ви не знайомі з <b>{ $mitm }</b>, в такому разі це могла бути атака і вам краще не переходити на цей сайт.
# Variables:
# $mitm (String) - The name of the software intercepting communications between you and the website (or “man in the middle”)
certerror-mitm-what-can-you-do-about-it-attack-sts = Якщо ви не знайомі з <b>{ $mitm }</b>, в такому разі це могла бути атака і ви нічого не зможете зробити, щоб отримати доступ до цього сайту.
# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
certerror-what-should-i-do-bad-sts-cert-explanation = <b>{ $hostname }</b> має політику безпеки, що називається HTTP Strict Transport Security (HSTS), і це означає, що { -brand-short-name } може перейти сюди лише з використанням захищеного з'єднання. Ви не можете додати виняток для відвідування цього сайту.
