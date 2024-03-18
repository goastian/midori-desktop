# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

protections-panel-sendreportview-error = При надсиланні звіту сталася помилка. Спробуйте знову пізніше.
# A link shown when ETP is disabled for a site. Opens the breakage report subview when clicked.
protections-panel-sitefixedsendreport-label = Сайт було виправлено? Надішліть звіт

## These strings are used to define the different levels of
## Enhanced Tracking Protection.

protections-popup-footer-protection-label-strict = Надійний
    .label = Надійний
protections-popup-footer-protection-label-custom = Власний
    .label = Власний
protections-popup-footer-protection-label-standard = Звичайний
    .label = Звичайний

##

# The text a screen reader speaks when focused on the info button.
protections-panel-etp-more-info =
    .aria-label = Більше інформації про розширений захист від стеження
protections-panel-etp-on-header = Розширений захист від стеження для цього сайту увімкнено
protections-panel-etp-off-header = Розширений захист від стеження для цього сайту вимкнено

## Text for the toggles shown when ETP is enabled/disabled for a given site.
## .description is transferred into a separate paragraph by the moz-toggle
## custom element code.
##   $host (String): the hostname of the site that is being displayed.

protections-panel-etp-on-toggle =
    .label = Розширений захист від стеження
    .description = Увімкнено для цього сайту
    .aria-label = Вимкнути захист для { $host }
protections-panel-etp-off-toggle =
    .label = Розширений захист від стеження
    .description = Вимкнено для цього сайту
    .aria-label = Увімкнути захист для { $host }
# The link to be clicked to open the sub-panel view
protections-panel-site-not-working = Не працює сайт?
# The heading/title of the sub-panel view
protections-panel-site-not-working-view =
    .title = Не працює сайт?

## The "Allowed" header also includes a "Why?" link that, when hovered, shows
## a tooltip explaining why these items were not blocked in the page.

protections-panel-not-blocking-why-label = Чому?
protections-panel-not-blocking-why-etp-on-tooltip = Блокування їх може пошкодити елементи деяких вебсайтів. Деякі кнопки, поля заповнення форм і входів можуть не працювати без стеження.
protections-panel-not-blocking-why-etp-off-tooltip = Всі елементи стеження на цьому сайті були завантажені, тому що захист вимкнено.

##

protections-panel-no-trackers-found = { -brand-short-name } не виявив відомих елементів стеження на цій сторінці.
protections-panel-content-blocking-tracking-protection = Вміст стеження
protections-panel-content-blocking-socialblock = Стеження соціальних мереж
protections-panel-content-blocking-cryptominers-label = Криптомайнери
protections-panel-content-blocking-fingerprinters-label = Зчитування цифрового відбитка

## In the protections panel, Content Blocking category items are in three sections:
##   "Blocked" for categories being blocked in the current page,
##   "Allowed" for categories detected but not blocked in the current page, and
##   "None Detected" for categories not detected in the current page.
##   These strings are used in the header labels of each of these sections.

protections-panel-blocking-label = Заблоковано
protections-panel-not-blocking-label = Дозволено
protections-panel-not-found-label = Не виявлено

##

protections-panel-settings-label = Налаштування захисту
protections-panel-protectionsdashboard-label = Панель стану захисту

## In the Site Not Working? view, we suggest turning off protections if
## the user is experiencing issues with any of a variety of functionality.

# The header of the list
protections-panel-site-not-working-view-header = Вимкніть захист, якщо у вас виникли проблеми з:
# The list items, shown in a <ul>
protections-panel-site-not-working-view-issue-list-login-fields = Полями для входу
protections-panel-site-not-working-view-issue-list-forms = Формами
protections-panel-site-not-working-view-issue-list-payments = Платежами
protections-panel-site-not-working-view-issue-list-comments = Коментарями
protections-panel-site-not-working-view-issue-list-videos = Відео
protections-panel-site-not-working-view-issue-list-fonts = Шрифти
protections-panel-site-not-working-view-send-report = Надіслати звіт

##

protections-panel-cross-site-tracking-cookies = Ці куки переслідують вас від одного сайту до іншого, з метою збирання даних про вашу діяльність онлайн. Вони встановлюються сторонніми рекламними й аналітичними компаніями.
protections-panel-cryptominers = Криптомайнери використовують ресурси вашої системи для добування криптовалют. Скрипти для добування криптовалют споживають заряд вашого акумулятора, сповільнюють роботу комп'ютера, а також можуть збільшити ваші витрати на електроенергію.
protections-panel-fingerprinters = Засоби зчитування цифрового відбитка збирають дані про налаштування вашого браузера та комп'ютера, з метою створення вашого профілю. Використовуючи такий цифровий відбиток, вони можуть стежити за вами на багатьох різних вебсайтах.
protections-panel-tracking-content = Вебсайти можуть завантажувати зовнішню рекламу, відео, а також інший вміст з кодом стеження. Блокування такого вмісту може допомогти сайтам швидше завантажуватись, але при цьому деякі кнопки, поля форм і входів можуть не працювати.
protections-panel-social-media-trackers = Соціальні мережі розміщують елементи стеження на інших вебсайтах, щоб стежити за вашими діями в інтернеті. Це дозволяє їм дізнаватися більше про вас, окрім того, чим ви ділитеся у своєму профілі.
protections-panel-description-shim-allowed = Деякі елементи стеження, зазначені нижче, були частково розблоковані на цій сторінці, тому що ви взаємодіяли з ними.
protections-panel-description-shim-allowed-learn-more = Докладніше
protections-panel-shim-allowed-indicator =
    .tooltiptext = Елемент стеження частково розблокований
protections-panel-content-blocking-manage-settings =
    .label = Керувати налаштуваннями захисту
    .accesskey = К
protections-panel-content-blocking-breakage-report-view =
    .title = Повідомити про пошкоджений сайт
protections-panel-content-blocking-breakage-report-view-description = Блокування певних елементів стеження може призвести до проблем з деякими вебсайтами. Звіт про такі проблеми допомагає поліпшувати роботу { -brand-short-name }. При надсиланні цього звіту в Mozilla відправиться URL-адреса з інформацією про налаштування вашого браузера. <label data-l10n-name="learn-more">Докладніше</label>
protections-panel-content-blocking-breakage-report-view-description2 = Блокування певних елементів стеження може призвести до проблем з деякими вебсайтами. Звіт про такі проблеми допомагає поліпшувати роботу { -brand-short-name }. При надсиланні цього звіту в { -vendor-short-name } відправиться URL-адреса з інформацією про налаштування вашого браузера.
protections-panel-content-blocking-breakage-report-view-collection-url = URL
protections-panel-content-blocking-breakage-report-view-collection-url-label =
    .aria-label = URL
protections-panel-content-blocking-breakage-report-view-collection-comments = Необов'язково: Опишіть проблему
protections-panel-content-blocking-breakage-report-view-collection-comments-label =
    .aria-label = Необов'язково: Опишіть проблему
protections-panel-content-blocking-breakage-report-view-cancel =
    .label = Скасувати
protections-panel-content-blocking-breakage-report-view-send-report =
    .label = Надіслати звіт

# Cookie Banner Handling

protections-panel-cookie-banner-handling-header = Зменшення кількості банерів кук
protections-panel-cookie-banner-blocker-header = Блокувальник банерів кук
protections-panel-cookie-banner-handling-enabled = Увімкнено для цього сайту
protections-panel-cookie-banner-handling-disabled = Вимкнено для цього сайту
protections-panel-cookie-banner-handling-undetected = Сайт наразі не підтримується
protections-panel-cookie-banner-view-title =
    .title = Зменшення кількості банерів кук
# Variables
#  $host (String): the hostname of the site that is being displayed.
protections-panel-cookie-banner-view-turn-off-for-site = Вимкнути зменшення кількості банерів кук для { $host }?
protections-panel-cookie-banner-view-turn-on-for-site = Увімкнути зменшення кількості банерів кук для цього сайту?
protections-panel-cookie-banner-blocker-view-title =
    .title = Блокувальник банерів кук
# Variables
#  $host (String): the hostname of the site that is being displayed.
protections-panel-cookie-banner-blocker-view-turn-off-for-site = Вимкнути блокувальник банерів кук для { $host }?
protections-panel-cookie-banner-blocker-view-turn-on-for-site = Увімкнути блокувальник банерів кук для цього сайту?
protections-panel-cookie-banner-view-cookie-clear-warning = { -brand-short-name } очистить куки цього сайту та оновить сторінку. Очищення всіх кук може призвести до виходу з облікових записів або спорожнення кошика для покупок.
protections-panel-cookie-banner-view-turn-on-description = { -brand-short-name } намагається автоматично відхиляти всі запити кук на підтримуваних сайтах.
protections-panel-cookie-banner-blocker-view-turn-on-description = Увімкніть, і { -brand-short-name } намагатиметься автоматично відхиляти банери кук на цьому сайті.
protections-panel-cookie-banner-view-cancel = Скасувати
protections-panel-cookie-banner-view-turn-off = Вимкнути
protections-panel-cookie-banner-view-turn-on = Увімкнути
