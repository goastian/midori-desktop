# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

privatebrowsingpage-open-private-window-label = Відкрити приватне вікно
    .accesskey = п
about-private-browsing-search-placeholder = Пошук в Інтернеті
about-private-browsing-info-title = Ви у приватному вікні
about-private-browsing-search-btn =
    .title = Пошук в Інтернеті
# Variables
#  $engine (String): the name of the user's default search engine
about-private-browsing-handoff =
    .title = Шукайте за допомогою { $engine } або введіть адресу
about-private-browsing-handoff-no-engine =
    .title = Введіть запит чи адресу
# Variables
#  $engine (String): the name of the user's default search engine
about-private-browsing-handoff-text = Шукайте за допомогою { $engine } або введіть адресу
about-private-browsing-handoff-text-no-engine = Введіть запит чи адресу
about-private-browsing-not-private = Зараз ви не у приватному вікні.
about-private-browsing-info-description-private-window = Приватне вікно: { -brand-short-name } очищує історію пошуку та перегляду, коли ви закриваєте всі приватні вікна. Це не робить вас анонімними.
about-private-browsing-info-description-simplified = { -brand-short-name } очищує історію пошуку та перегляду, коли ви закриваєте усі приватні вікна, але це не робить вас анонімними.
about-private-browsing-learn-more-link = Докладніше
about-private-browsing-hide-activity = Приховуйте свою активність і місцеперебування де б ви не переглядали щось в інтернеті
about-private-browsing-get-privacy = Отримайте захист приватності в інтернеті всюди
about-private-browsing-hide-activity-1 = Приховати активність перегляду та місцеперебування за допомогою { -mozilla-vpn-brand-name }. Одним натисканням створює безпечне з'єднання навіть у загальнодоступній мережі Wi-Fi.
about-private-browsing-prominent-cta = Зберігайте приватність з { -mozilla-vpn-brand-name }
about-private-browsing-focus-promo-cta = Завантажити { -focus-brand-name }
about-private-browsing-focus-promo-header = { -focus-brand-name }: приватний перегляд у дорозі
about-private-browsing-focus-promo-text = Наш спеціалізований мобільний застосунок для приватного перегляду щоразу очищає вашу історію та куки.

## The following strings will be used for experiments in Fx99 and Fx100

about-private-browsing-focus-promo-header-b = Перейдіть до приватного перегляду на своєму телефоні
about-private-browsing-focus-promo-text-b = Користуйтеся { -focus-brand-name } для тих приватних пошуків, які ви хочете приховати від основного мобільного браузера.
about-private-browsing-focus-promo-header-c = Приватність вищого рівня на мобільному пристрої
about-private-browsing-focus-promo-text-c = { -focus-brand-name } щоразу очищує вашу історію, блокуючи рекламу та елементи стеження.
# This string is the title for the banner for search engine selection
# in a private window.
# Variables:
#   $engineName (String) - The engine name that will currently be used for the private window.
about-private-browsing-search-banner-title = { $engineName } є вашим типовим пошуковим засобом у приватних вікнах
about-private-browsing-search-banner-description =
    { PLATFORM() ->
        [windows] Щоб обрати інший пошуковий засіб, відкрийте <a data-l10n-name="link-options">Налаштування</a>
       *[other] Щоб обрати інший пошуковий засіб, відкрийте <a data-l10n-name="link-options">Налаштування</a>
    }
about-private-browsing-search-banner-close-button =
    .aria-label = Закрити
about-private-browsing-promo-close-button =
    .title = Закрити

## Strings used in a “pin promotion” message, which prompts users to pin a private window

about-private-browsing-pin-promo-header = Свобода приватного перегляду одним натиском
about-private-browsing-pin-promo-link-text =
    { PLATFORM() ->
        [macos] Закріпити в док
       *[other] Закріпити на панелі завдань
    }
about-private-browsing-pin-promo-title = Жодних збережених кук чи історії на комп'ютері. Переглядайте без думки, що за вами хтось спостерігає.

## Strings used in a promotion message for cookie banner reduction

# Simplified version of the headline if the original text doesn't work
# in your language: `See fewer cookie requests`.
about-private-browsing-cookie-banners-promo-header = Геть банери про куки!
about-private-browsing-cookie-banners-promo-button = Зменшити кількість банерів кук
about-private-browsing-cookie-banners-promo-message = Дайте можливість { -brand-short-name } автоматично відповідати на спливні вікна кук, щоб вони не заважали вам під час онлайн-перегляду. { -brand-short-name } відхилить усі запити, якщо це можливо.
# Simplified version of the headline if the original text doesn't work
# in your language: `{ -brand-short-name } will show fewer cookie requests`
about-private-browsing-cookie-banners-promo-heading = { -brand-short-name } піклується про банери кук для вас
about-private-browsing-cookie-banners-promo-body = Тепер ми автоматично відхиляємо багато банерів кук, щоб за вами менше стежили та ви могли користуватися інтернетом без відволікання.

## Strings for Felt Privacy v1 experiments in 119

about-private-browsing-felt-privacy-v1-info-header = Не залишайте слідів на цьому пристрої
about-private-browsing-felt-privacy-v1-info-body = { -brand-short-name } видаляє ваші куки, історію та дані сайтів, коли ви закриваєте всі приватні вікна.
about-private-browsing-felt-privacy-v1-info-link = Хто може бачити мою діяльність?
