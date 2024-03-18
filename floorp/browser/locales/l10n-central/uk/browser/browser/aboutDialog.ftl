# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

aboutDialog-title =
    .title = Про { -brand-full-name }

releaseNotes-link = Що нового

update-checkForUpdatesButton =
    .label = Перевірити оновлення
    .accesskey = П

update-updateButton =
    .label = Перезапустити для оновлення { -brand-shorter-name }
    .accesskey = о

update-checkingForUpdates = Перевірка оновлень…

## Variables:
##   $transfer (string) - Transfer progress.

settings-update-downloading = <img data-l10n-name="icon"/>Оновлення завантажується — <label data-l10n-name="download-status">{ $transfer }</label>
aboutdialog-update-downloading = Оновлення завантажується — <label data-l10n-name="download-status">{ $transfer }</label>

##

update-applying = Оновлення застосовується…

update-failed = Не вдалося оновити. <label data-l10n-name="failed-link">Завантажити останню версію</label>
update-failed-main = Не вдалося оновити. <a data-l10n-name="failed-link-main">Завантажити останню версію</a>

update-adminDisabled = Оновлення вимкнені системним адміністратором
update-noUpdatesFound = { -brand-short-name } не потребує оновлення
aboutdialog-update-checking-failed = Не вдалося перевірити наявність оновлень.
update-otherInstanceHandlingUpdates = Оновлення { -brand-short-name } проводиться іншим процесом

## Variables:
##   $displayUrl (String): URL to page with download instructions. Example: www.mozilla.org/firefox/nightly/

aboutdialog-update-manual-with-link = Оновлення доступне на <label data-l10n-name="manual-link">{ $displayUrl }</label>
settings-update-manual-with-link = Оновлення доступне на <a data-l10n-name="manual-link">{ $displayUrl }</a>

update-unsupported = Ви не можете виконувати подальші оновлення на цій системі. <label data-l10n-name="unsupported-link">Докладніше</label>

update-restarting = Перезапуск…

update-internal-error2 = Не вдалося перевірити наявність оновлень через внутрішню помилку. Оновлення доступні за посиланням <label data-l10n-name="manual-link">{ $displayUrl }</label>

##

# Variables:
#   $channel (String): description of the update channel (e.g. "release", "beta", "nightly" etc.)
aboutdialog-channel-description = Ви зараз на каналі оновлень <label data-l10n-name="current-channel">{ $channel }</label>.

warningDesc-version = { -brand-short-name } експериментальний і може бути нестабільним.

aboutdialog-help-user = Довідка { -brand-product-name }
aboutdialog-submit-feedback = Надіслати відгук

community-exp = <label data-l10n-name="community-exp-mozillaLink">{ -vendor-short-name }</label> є <label data-l10n-name="community-exp-creditsLink">глобальною спільнотою</label>, яка працює над тим, щоб інтернет залишався відкритим, громадським та доступним для всіх.

community-2 = { -brand-short-name } був розроблений в <label data-l10n-name="community-mozillaLink">{ -vendor-short-name }</label> - <label data-l10n-name="community-creditsLink">глобальній спільноті</label>, яка працює над тим, щоб зберегти Інтернет відкритим, громадським та доступним для всіх.

helpus = Хочете допомогти? <label data-l10n-name="helpus-donateLink">Зробіть внесок</label> або <label data-l10n-name="helpus-getInvolvedLink">долучайтесь!</label>

bottomLinks-license = Ліцензійна інформація
bottomLinks-rights = Права кінцевого користувача
bottomLinks-privacy = Політика приватності

# Example of resulting string: 66.0.1 (64-bit)
# Variables:
#   $version (String): version of Firefox, e.g. 66.0.1
#   $bits (Number): bits of the architecture (32 or 64)
aboutDialog-version = { $version } ({ $bits }-біт)

# Example of resulting string: 66.0a1 (2019-01-16) (64-bit)
# Variables:
#   $version (String): version of Firefox for Nightly builds, e.g. 66.0a1
#   $isodate (String): date in ISO format, e.g. 2019-01-16
#   $bits (Number): bits of the architecture (32 or 64)
aboutDialog-version-nightly = { $version } ({ $isodate }) ({ $bits }-біт)
