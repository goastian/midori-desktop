# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


### UI strings for the MR1 onboarding / multistage about:welcome
### Various strings use a non-breaking space to avoid a single dangling /
### widowed word, so test on various window sizes if you also want this.


## Welcome page strings

onboarding-welcome-header = Вітаємо в { -brand-short-name }
onboarding-start-browsing-button-label = Почати перегляд
onboarding-not-now-button-label = Не зараз
mr1-onboarding-get-started-primary-button-label = Розпочати

## Custom Return To AMO onboarding strings

return-to-amo-subtitle = Чудово, ви отримали { -brand-short-name }
# <img data-l10n-name="icon"/> will be replaced with the icon belonging to the extension
#
# Variables:
#   $addon-name (String) - Name of the add-on
return-to-amo-addon-title = Тепер перейдімо до <img data-l10n-name="icon"/> <b>{ $addon-name }</b>.
return-to-amo-add-extension-label = Додати розширення
return-to-amo-add-theme-label = Додайте тему

##  Variables: $addon-name (String) - Name of the add-on to be installed

mr1-return-to-amo-subtitle = Вітайте { -brand-short-name }
mr1-return-to-amo-addon-title = У вас під рукою швидкий приватний браузер. Тепер ви можете додати <b>{ $addon-name }</b> і робити ще більше з { -brand-short-name }
mr1-return-to-amo-add-extension-label = Додати { $addon-name }

## Multistage onboarding strings (about:welcome pages)


# Aria-label to make the "steps" of multistage onboarding visible to screen readers.
# Variables:
#   $current (Int) - Number of the current page
#   $total (Int) - Total number of pages

onboarding-welcome-steps-indicator-label =
    .aria-label = Перебіг: крок { $current } з { $total }
# This button will open system settings to turn on prefers-reduced-motion
mr1-onboarding-reduce-motion-button-label = Вимкнути анімацію
# String for the Firefox Accounts button
mr1-onboarding-sign-in-button-label = Увійти
# The primary import button label will depend on whether we can detect which browser was used to download Firefox.
# Variables:
#   $previous (Str) - Previous browser name, such as Edge, Chrome
mr1-onboarding-import-primary-button-label-attribution = Імпортувати з { $previous }
mr1-onboarding-theme-header = Зробіть його своїм
mr1-onboarding-theme-subtitle = Персоналізуйте { -brand-short-name } за допомогою теми.
mr1-onboarding-theme-secondary-button-label = Не зараз
# System theme uses operating system color settings
mr1-onboarding-theme-label-system = Системна тема
mr1-onboarding-theme-label-light = Світла
mr1-onboarding-theme-label-dark = Темна
# "Alpenglow" here is the name of the theme, and should be kept in English.
mr1-onboarding-theme-label-alpenglow = Alpenglow
onboarding-theme-primary-button-label = Готово

## Please make sure to split the content of the title attribute into lines whose
## width corresponds to about 40 Latin characters, to ensure that the tooltip
## doesn't become too long. Line breaks will be preserved when displaying the
## tooltip.

# Tooltip displayed on hover of system theme
mr1-onboarding-theme-tooltip-system =
    .title =
        Повторювати тему операційної системи
        для кнопок, меню та вікон.
# Input description for system theme
mr1-onboarding-theme-description-system =
    .aria-description =
        Повторювати тему операційної системи
        для кнопок, меню та вікон.
# Tooltip displayed on hover of light theme
mr1-onboarding-theme-tooltip-light =
    .title =
        Застосувати світлу тему
        кнопок, меню та вікон.
# Input description for light theme
mr1-onboarding-theme-description-light =
    .aria-description =
        Застосувати світлу тему
        кнопок, меню та вікон.
# Tooltip displayed on hover of dark theme
mr1-onboarding-theme-tooltip-dark =
    .title =
        Застосувати темну тему
        кнопок, меню та вікон.
# Input description for dark theme
mr1-onboarding-theme-description-dark =
    .aria-description =
        Застосувати темну тему
        кнопок, меню та вікон.
# Tooltip displayed on hover of Alpenglow theme
mr1-onboarding-theme-tooltip-alpenglow =
    .title =
        Застосувати динамічну, барвисту
        тему кнопок, меню та вікон.
# Input description for Alpenglow theme
mr1-onboarding-theme-description-alpenglow =
    .aria-description =
        Застосувати динамічну, барвисту
        тему кнопок, меню та вікон.
# Selector description for default themes
mr2-onboarding-default-theme-label = Переглянути типові теми.

## Strings for Thank You page

mr2-onboarding-thank-you-header = Дякуємо, що обрали нас
mr2-onboarding-thank-you-text = { -brand-short-name } — незалежний браузер, підтримуваний некомерційною організацією. Разом ми робимо інтернет безпечнішим, здоровішим та приватнішим.
mr2-onboarding-start-browsing-button-label = Почати перегляд

## Multistage live language reloading onboarding strings (about:welcome pages)
##
## The following language names are generated by the browser's Intl.DisplayNames API.
##
## Variables:
##   $negotiatedLanguage (String) - The name of the langpack's language, e.g. "Español (ES)"
##   $systemLanguage (String) - The name of the system language, e.g "Español (ES)"
##   $appLanguage (String) - The name of the language shipping in the browser build, e.g. "English (EN)"

onboarding-live-language-header = Виберіть свою мову
mr2022-onboarding-live-language-text = { -brand-short-name } говорить вашою мовою
mr2022-language-mismatch-subtitle = Завдяки нашій спільноті { -brand-short-name } перекладено понад 90 мовами. Схоже, у вашій системі використовується { $systemLanguage }, а в { -brand-short-name } використовується { $appLanguage }.
onboarding-live-language-button-label-downloading = Завантаження мовного пакунка для { $negotiatedLanguage }…
onboarding-live-language-waiting-button = Отримання доступних мов…
onboarding-live-language-installing = Установлення мовного пакунка для { $negotiatedLanguage }…
mr2022-onboarding-live-language-switch-to = Змінити на { $negotiatedLanguage }
mr2022-onboarding-live-language-continue-in = Використовувати { $appLanguage }
onboarding-live-language-secondary-cancel-download = Скасувати
onboarding-live-language-skip-button-label = Пропустити

## Firefox 100 Thank You screens

# "Hero Text" displayed on left side of welcome screen. This text can be
# formatted to span multiple lines as needed. The <span data-l10n-name="zap">
# </span> in this string allows a "zap" underline style to be automatically
# added to the text inside it. "Yous" should stay inside the zap span, but
# "Thank" can be put inside instead if there's no "you" in the translation.
# The English text would normally be "100 Thank-Yous" i.e., plural noun, but for
# aesthetics of splitting it across multiple lines, the hyphen is omitted.
fx100-thank-you-hero-text =
    100
    Дякуємо
    <span data-l10n-name="zap">Вам</span>
fx100-thank-you-subtitle = Це наш 100-й випуск! Дякуємо, що допомагаєте нам створювати кращий та здоровіший інтернет.
fx100-thank-you-pin-primary-button-label =
    { PLATFORM() ->
        [macos] Закріпити { -brand-short-name } у Dock
       *[other] Закріпити { -brand-short-name } на панелі завдань
    }
fx100-upgrade-thanks-header = 100 разів дякуємо вам
# Message shown with a start-browsing button. Emphasis <em> should be for "you"
# but "Thank" can be used instead if there's no "you" in the translation.
fx100-upgrade-thank-you-body = Це наш 100-й випуск { -brand-short-name }. Дякуємо <em>вам</em> за допомогу в створенні кращого та здоровішого інтернету.
# Message shown with either a pin-to-taskbar or set-default button.
fx100-upgrade-thanks-keep-body = Це наш 100-й випуск! Дякуємо за те, що ви є частиною нашої спільноти. Тримайте { -brand-short-name } на відстані одного натискання для наступних 100.
mr2022-onboarding-secondary-skip-button-label = Пропустити цей крок

## MR2022 New User Easy Setup screen strings

# Primary button string used on new user onboarding first screen showing multiple actions such as Set Default, Import from previous browser.
mr2022-onboarding-easy-setup-primary-button-label = Зберегти та продовжити
# Set Default action checkbox label used on new user onboarding first screen
mr2022-onboarding-easy-setup-set-default-checkbox-label = Встановити { -brand-short-name } типовим браузером
# Import action checkbox label used on new user onboarding first screen
mr2022-onboarding-easy-setup-import-checkbox-label = Імпортувати з іншого браузера

## MR2022 New User Pin Firefox screen strings

# Title used on about:welcome for new users when Firefox is not pinned.
# In this context, open up is synonymous with "Discover".
# The metaphor is that when they open their Firefox browser, it helps them discover an amazing internet.
# If this translation does not make sense in your language, feel free to use the word "discover."
mr2022-onboarding-welcome-pin-header = Відкрийте дивовижний інтернет
# Subtitle is used on onboarding page for new users page when Firefox is not pinned
mr2022-onboarding-welcome-pin-subtitle = Відкривайте { -brand-short-name } всюди одним натиском. Щоразу роблячи це, ви обираєте відкритий та незалежний інтернет.
# Primary button string used on welcome page for when Firefox is not pinned.
mr2022-onboarding-pin-primary-button-label =
    { PLATFORM() ->
        [macos] Закріпити { -brand-short-name } у док
       *[other] Закріпити { -brand-short-name } на панелі завдань
    }
# Subtitle will be used when user already has Firefox pinned, but
# has not set it as their default browser.
# When translating "zip", please feel free to pick a verb that signifies movement and/or exploration
# and makes sense in the context of navigating the web.
mr2022-onboarding-set-default-only-subtitle = Розпочніть роботу з некомерційним браузером. Ми захищаємо вашу приватність, поки ви мандруєте інтернетом.

## MR2022 Existing User Pin Firefox Screen Strings

# Title used on multistage onboarding page for existing users when Firefox is not pinned
mr2022-onboarding-existing-pin-header = Дякуємо за вибір { -brand-product-name }
# Subtitle is used on onboarding page for existing users when Firefox is not pinned
mr2022-onboarding-existing-pin-subtitle = Відкривайте здоровіший інтернет звідусіль одним натиском. Наша найновіша версія має функції, які вам сподобаються.
# Subtitle will be used on the welcome screen for existing users
# when they already have Firefox pinned but not set as default
mr2022-onboarding-existing-set-default-only-subtitle = Користуйтеся браузером, який захищає вашу приватність, поки ви мандруєте інтернетом. Наша найновіша версія має функції, які вам сподобаються.
mr2022-onboarding-existing-pin-checkbox-label = Також додайте приватний перегляд { -brand-short-name }

## MR2022 New User Set Default screen strings

# This string is the title used when the user already has pinned the browser, but has not set default.
mr2022-onboarding-set-default-title = Зробіть { -brand-short-name } основним браузером
mr2022-onboarding-set-default-primary-button-label = Встановити { -brand-short-name } типовим браузером
# When translating "zip", please feel free to pick a verb that signifies movement and/or exploration
# and makes sense in the context of navigating the web.
mr2022-onboarding-set-default-subtitle = Користуйтеся некомерційним браузером. Ми захищаємо вашу приватність, поки ви мандруєте інтернетом.

## MR2022 Get Started screen strings.
## These strings will be used on the welcome page
## when Firefox is already set to default and pinned.

# When translating "zip", please feel free to pick a verb that signifies movement and/or exploration
# and makes sense in the context of navigating the web.
mr2022-onboarding-get-started-primary-subtitle = Наша найновіша версія створена для вас, пропонуючи ще простіше користування інтернетом та функції, які вам сподобаються.
mr2022-onboarding-get-started-primary-button-label = Налаштуйте за лічені секунди

## MR2022 Import Settings screen strings

mr2022-onboarding-import-header = Блискавично швидке налаштування
mr2022-onboarding-import-subtitle = Налаштуйте { -brand-short-name } на свій смак. Додайте закладки, паролі та інші дані зі свого іншого браузера.
mr2022-onboarding-import-primary-button-label-no-attribution = Імпортувати з іншого браузера

## If your language uses grammatical genders, in the description for the
## colorway feel free to switch from "You are a X. You…" (e.g. "You are a
## Playmaker. You create…") to "X: you…" ("Playmaker: You create…"). This might
## help creating a more inclusive translation.

mr2022-onboarding-colorway-title = Оберіть колір, який вас надихає
mr2022-onboarding-colorway-subtitle = Незалежні голоси можуть змінити культуру.
mr2022-onboarding-colorway-primary-button-label-continue = Налаштувати та продовжити
mr2022-onboarding-existing-colorway-checkbox-label = Зробіть { -firefox-home-brand-name(case: "acc", capitalization: "lower") } своєю яскравою домашньою сторінкою
mr2022-onboarding-colorway-label-default = Типово
mr2022-onboarding-colorway-tooltip-default2 =
    .title = Поточні кольори { -brand-short-name }
mr2022-onboarding-colorway-description-default = <b>Використовувати поточні кольори { -brand-short-name }.</b>
mr2022-onboarding-colorway-label-playmaker = Тактичність
mr2022-onboarding-colorway-tooltip-playmaker2 =
    .title = Тактичність (червоний)
mr2022-onboarding-colorway-description-playmaker = <b>Ви тактичні.</b> Ви створюєте можливості для перемоги та допомагаєте всім навколо покращити їхню гру.
mr2022-onboarding-colorway-label-expressionist = Експресіонізм
mr2022-onboarding-colorway-tooltip-expressionist2 =
    .title = Експресіонізм (жовтий)
mr2022-onboarding-colorway-description-expressionist = <b>Ви експресивні.</b> Ви бачите світ інакше, а ваші витвори викликають в інших емоції.
mr2022-onboarding-colorway-label-visionary = Мрійливість
mr2022-onboarding-colorway-tooltip-visionary2 =
    .title = Мрійливість (зелений)
mr2022-onboarding-colorway-description-visionary = <b>Ви мрійливі.</b> Ви ставите під сумнів стан речей та спонукаєте інших уявити краще майбутнє.
mr2022-onboarding-colorway-label-activist = Активізм
mr2022-onboarding-colorway-tooltip-activist2 =
    .title = Активізм (синій)
mr2022-onboarding-colorway-description-activist = <b>Ви активні.</b> Ви покращуєте світ і зміцнюєте переконання інших.
mr2022-onboarding-colorway-label-dreamer = Натхненність
mr2022-onboarding-colorway-tooltip-dreamer2 =
    .title = Натхненність (пурпуровий)
mr2022-onboarding-colorway-description-dreamer = <b>Ви надихаєте інших.</b> Ви вірите, що доля любить завзятих і надихаєте людей бути сміливими.
mr2022-onboarding-colorway-label-innovator = Винахідливість
mr2022-onboarding-colorway-tooltip-innovator2 =
    .title = Винахідливість (жовтогарячий)
mr2022-onboarding-colorway-description-innovator = <b>Ви винахідливі.</b> Ви всюди бачите можливості та впливаєте на життя всіх навколо.

## MR2022 Multistage Mobile Download screen strings

mr2022-onboarding-mobile-download-title = Переходьте з ноутбука на телефон і назад
mr2022-onboarding-mobile-download-subtitle = Продовжуйте працювати зі своїми вкладками на іншому пристрої. А також синхронізуйте закладки й паролі всюди, де користуєтеся { -brand-product-name }.
mr2022-onboarding-mobile-download-cta-text = Скануйте QR-код, щоб отримати { -brand-product-name } для мобільного, або <a data-l10n-name="download-label">надішліть собі посилання для завантаження.</a>
mr2022-onboarding-no-mobile-download-cta-text = Скануйте QR-код, щоб отримати { -brand-product-name } для мобільного.

## MR2022 Upgrade Dialog screens
## Pin private window screen shown only for users who don't have Firefox private pinned

mr2022-upgrade-onboarding-pin-private-window-header = Отримайте свободу приватного перегляду одним натиском
mr2022-upgrade-onboarding-pin-private-window-subtitle = Жодних збережених кук чи історії на комп'ютері. Переглядайте без думки, що за вами хтось спостерігає.
mr2022-upgrade-onboarding-pin-private-window-primary-button-label =
    { PLATFORM() ->
        [macos] Закріпити приватне вікно { -brand-short-name } у док
       *[other] Закріпити приватне вікно { -brand-short-name } на панелі завдань
    }

## MR2022 Privacy Segmentation screen strings

mr2022-onboarding-privacy-segmentation-title = Ми завжди поважаємо вашу приватність
mr2022-onboarding-privacy-segmentation-subtitle = Від інтелектуальних пропозицій до розумнішого пошуку, ми постійно працюємо над створенням досконалішого, більш персоналізованого { -brand-product-name }.
mr2022-onboarding-privacy-segmentation-text-cta = Що ви хочете бачити, коли ми пропонуємо нові функції, які використовують ваші дані для вдосконалення перегляду?
mr2022-onboarding-privacy-segmentation-button-primary-label = Використовувати рекомендації { -brand-product-name }
mr2022-onboarding-privacy-segmentation-button-secondary-label = Показати подробиці

## MR2022 Multistage Gratitude screen strings

mr2022-onboarding-gratitude-title = Ви допомагаєте нам створювати кращий інтернет
mr2022-onboarding-gratitude-subtitle = Дякуємо вам за користування { -brand-short-name } від Mozilla Foundation. Завдяки вашій підтримці ми докладаємо зусиль для створення більш відкритого, доступного та кращого інтернету для всіх.
mr2022-onboarding-gratitude-primary-button-label = Перегляньте, що нового
mr2022-onboarding-gratitude-secondary-button-label = Почати перегляд

## Onboarding spotlight for infrequent users

onboarding-infrequent-import-title = Почувайтеся як вдома
onboarding-infrequent-import-subtitle = Пам'ятайте, що ви можете імпортувати свої закладки, паролі та інші дані, незалежно від того, увійшли ви до синхронізації чи ні.
onboarding-infrequent-import-primary-button = Імпорт до { -brand-short-name }

## MR2022 Illustration alt tags
## Descriptive tags for illustrations used by screen readers and other assistive tech

mr2022-onboarding-pin-image-alt =
    .aria-label = Людина працює за ноутбуком серед зірок і квіток
mr2022-onboarding-default-image-alt =
    .aria-label = Людина обіймає логотип { -brand-product-name }
mr2022-onboarding-import-image-alt =
    .aria-label = Людина катається на скейтборді з коробкою піктограм програмного забезпечення
mr2022-onboarding-mobile-download-image-alt =
    .aria-label = Жаби стрибають по листках лілій, в центрі яких зображено QR-код для завантаження { -brand-product-name } для мобільного
mr2022-onboarding-pin-private-image-alt =
    .aria-label = За допомогою чарівної палички з капелюха з'являється логотип приватного перегляду { -brand-product-name }
mr2022-onboarding-privacy-segmentation-image-alt =
    .aria-label = Світлошкіра і темношкіра долоні роблять жест "Дай п'ять"
mr2022-onboarding-gratitude-image-alt =
    .aria-label = Вид заходу сонця через вікно з лисицею та кімнатною рослиною на підвіконні
mr2022-onboarding-colorways-image-alt =
    .aria-label = Балончик із фарбою створює барвистий колаж із зображенням зеленого ока, помаранчевого черевика, червоного баскетбольного м'яча, фіолетових навушників, блакитного серця та жовтої корони

## Device migration onboarding

onboarding-device-migration-image-alt =
    .aria-label = Лисиця на екрані ноутбука махає вітаючись. До ноутбука підключена мишка.
onboarding-device-migration-title = З поверненням!
onboarding-device-migration-subtitle = Увійдіть у свій { -fxaccount-brand-name(capitalization: "sentence") }, щоб перенести свої закладки, паролі та історію на новий пристрій.
onboarding-device-migration-subtitle2 = Увійдіть в обліковий запис, щоб перенести свої закладки, паролі та історію на новий пристрій.
onboarding-device-migration-primary-button-label = Увійти
