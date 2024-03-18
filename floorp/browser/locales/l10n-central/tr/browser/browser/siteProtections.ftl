# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

content-blocking-trackers-view-empty = Bu sitede bulunmadı
content-blocking-cookies-blocking-trackers-label = Siteler arası takip çerezleri
content-blocking-cookies-blocking-third-party-label = Üçüncü taraf çerezleri
content-blocking-cookies-blocking-unvisited-label = Ziyaret edilmemiş site çerezleri
content-blocking-cookies-blocking-all-label = Tüm çerezler
content-blocking-cookies-view-first-party-label = Bu siteden
content-blocking-cookies-view-trackers-label = Siteler arası takip çerezleri
content-blocking-cookies-view-third-party-label = Üçüncü taraf çerezleri
# This label is shown next to a cookie origin in the cookies subview.
# It forms the end of the (imaginary) sentence "www.example.com [was] Allowed"
content-blocking-cookies-view-allowed-label =
    .value = İzin verildi
# This label is shown next to a cookie origin in the cookies subview.
# It forms the end of the (imaginary) sentence "www.example.com [was] Blocked"
content-blocking-cookies-view-blocked-label =
    .value = Engellendi
# Variables:
#   $domain (String): the domain of the site.
content-blocking-cookies-view-remove-button =
    .tooltiptext = { $domain } için çerez istisnasını temizle
tracking-protection-icon-active = Sosyal medya takip kodları, siteler arası takip çerezleri ve parmak izi toplayıcılar engelleniyor.
tracking-protection-icon-active-container =
    .aria-label = { tracking-protection-icon-active }
tracking-protection-icon-disabled = Bu sitede gelişmiş izlenme koruması KAPALI.
tracking-protection-icon-disabled-container =
    .aria-label = { tracking-protection-icon-disabled }
tracking-protection-icon-no-trackers-detected = Bu sayfada { -brand-short-name } tarayıcısının tanıdığı bir takip kodu tespit edilmedi.
tracking-protection-icon-no-trackers-detected-container =
    .aria-label = { tracking-protection-icon-no-trackers-detected }

## Variables:
##   $host (String): the site's hostname

# Header of the Protections Panel.
protections-header = { $host } korumaları
# Text that gets spoken by a screen reader if the button will disable protections.
protections-disable =
    .aria-label = { $host } için korumaları kapat
# Text that gets spoken by a screen reader if the button will enable protections.
protections-enable =
    .aria-label = { $host } için korumaları aç

## Blocking and Not Blocking sub-views in the Protections Panel

protections-blocking-fingerprinters =
    .title = Engellenen parmak izi toplayıcılar
protections-blocking-cryptominers =
    .title = Engellenen kripto madencileri
protections-blocking-cookies-trackers =
    .title = Engellenen siteler arası takip çerezleri
protections-blocking-cookies-third-party =
    .title = Engellenen üçüncü taraf çerezleri
protections-blocking-cookies-all =
    .title = Tüm çerezler engellendi
protections-blocking-cookies-unvisited =
    .title = Ziyaret edilmemiş site çerezleri engellendi
protections-blocking-tracking-content =
    .title = Engellenen takip içerikleri
protections-blocking-social-media-trackers =
    .title = Engellenen sosyal medya takip kodları
protections-not-blocking-fingerprinters =
    .title = Parmak izi toplayıcılar engellenmiyor
protections-not-blocking-cryptominers =
    .title = Kripto madencileri engellenmiyor
protections-not-blocking-cookies-third-party =
    .title = Üçüncü taraf çerezleri engellenmiyor
protections-not-blocking-cookies-all =
    .title = Çerezler engellenmiyor
protections-not-blocking-cross-site-tracking-cookies =
    .title = Siteler arası takip çerezleri engellenmiyor
protections-not-blocking-tracking-content =
    .title = Takip içerikleri engellenmiyor
protections-not-blocking-social-media-trackers =
    .title = Sosyal medya takip kodları engellenmiyor

## Footer and Milestones sections in the Protections Panel
## Variables:
##   $trackerCount (Number): number of trackers blocked
##   $date (Date): the date on which we started counting

# This text indicates the total number of trackers blocked on all sites.
# In its tooltip, we show the date when we started counting this number.
protections-footer-blocked-tracker-counter =
    { $trackerCount ->
        [one] 1 engelleme
       *[other] { $trackerCount } engelleme
    }
    .tooltiptext = { DATETIME($date, year: "numeric", month: "long", day: "numeric") } tarihinden beri
# In English this looks like "Firefox blocked over 10,000 trackers since October 2019"
protections-milestone =
    { $trackerCount ->
        [one] { -brand-short-name } { DATETIME($date, year: "numeric", month: "long") } tarihinden beri { $trackerCount } takip kodunu engelledi
       *[other] { -brand-short-name } { DATETIME($date, year: "numeric", month: "long") } tarihinden beri { $trackerCount } takip kodunu engelledi
    }
