# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

content-blocking-trackers-view-empty = Не виявлено на цьому сайті
content-blocking-cookies-blocking-trackers-label = Куки стеження між сайтами
content-blocking-cookies-blocking-third-party-label = Сторонні куки
content-blocking-cookies-blocking-unvisited-label = Куки з невідвіданих сайтів
content-blocking-cookies-blocking-all-label = Всі куки
content-blocking-cookies-view-first-party-label = З цього сайту
content-blocking-cookies-view-trackers-label = Куки стеження між сайтами
content-blocking-cookies-view-third-party-label = Сторонні куки
# This label is shown next to a cookie origin in the cookies subview.
# It forms the end of the (imaginary) sentence "www.example.com [was] Allowed"
content-blocking-cookies-view-allowed-label =
    .value = Дозволено
# This label is shown next to a cookie origin in the cookies subview.
# It forms the end of the (imaginary) sentence "www.example.com [was] Blocked"
content-blocking-cookies-view-blocked-label =
    .value = Заблоковано
# Variables:
#   $domain (String): the domain of the site.
content-blocking-cookies-view-remove-button =
    .tooltiptext = Стерти виняток для { $domain }
tracking-protection-icon-active = Блокування стеження соціальних мереж, кук стеження між сайтами, а також зчитування цифрового відбитка.
tracking-protection-icon-active-container =
    .aria-label = { tracking-protection-icon-active }
tracking-protection-icon-disabled = Розширений захист від стеження для цього сайту вимкнено.
tracking-protection-icon-disabled-container =
    .aria-label = { tracking-protection-icon-disabled }
tracking-protection-icon-no-trackers-detected = { -brand-short-name } не виявив відомих елементів стеження на цій сторінці.
tracking-protection-icon-no-trackers-detected-container =
    .aria-label = { tracking-protection-icon-no-trackers-detected }

## Variables:
##   $host (String): the site's hostname

# Header of the Protections Panel.
protections-header = Захист для { $host }

## Blocking and Not Blocking sub-views in the Protections Panel

protections-blocking-fingerprinters =
    .title = Заблоковано зчитування цифрового відбитка
protections-blocking-cryptominers =
    .title = Заблоковано криптомайренів
protections-blocking-cookies-trackers =
    .title = Заблоковано куки, що стежать між сайтами
protections-blocking-cookies-third-party =
    .title = Заблоковано сторонні куки
protections-blocking-cookies-all =
    .title = Усі куки заблоковано
protections-blocking-cookies-unvisited =
    .title = Заблоковано куки з невідвіданих сайтів
protections-blocking-tracking-content =
    .title = Блокування вмісту зі стеженням
protections-blocking-social-media-trackers =
    .title = Заблоковано стеження соціальних мереж
protections-not-blocking-fingerprinters =
    .title = Зчитування цифрового відбитка не блокується
protections-not-blocking-cryptominers =
    .title = Криптомайнери не блокуються
protections-not-blocking-cookies-third-party =
    .title = Сторонні куки не блокуються
protections-not-blocking-cookies-all =
    .title = Куки не блокуються
protections-not-blocking-cross-site-tracking-cookies =
    .title = Куки, що стежать між сайтами, не блокуються
protections-not-blocking-tracking-content =
    .title = Вміст зі стеженням не блокується
protections-not-blocking-social-media-trackers =
    .title = Стеження соціальних мереж не блокується

## Footer and Milestones sections in the Protections Panel
## Variables:
##   $trackerCount (Number): number of trackers blocked
##   $date (Date): the date on which we started counting

# This text indicates the total number of trackers blocked on all sites.
# In its tooltip, we show the date when we started counting this number.
protections-footer-blocked-tracker-counter =
    { $trackerCount ->
        [one] 1 заблокований
        [few] { $trackerCount } заблоковані
       *[many] { $trackerCount } заблокованих
    }
    .tooltiptext = Починаючи з { DATETIME($date, year: "numeric", month: "long", day: "numeric") }
# This text indicates the total number of trackers blocked on all sites.
# It should be the same as protections-footer-blocked-tracker-counter;
# this message is used to leave out the tooltip when the date is not available.
protections-footer-blocked-tracker-counter-no-tooltip =
    { $trackerCount ->
        [one] 1 заблокований
        [few] { $trackerCount } заблоковані
       *[many] { $trackerCount } заблокованих
    }
# In English this looks like "Firefox blocked over 10,000 trackers since October 2019"
protections-milestone =
    { $trackerCount ->
        [one] { -brand-short-name } заблокував { $trackerCount } елемент стеження, починаючи з { DATETIME($date, year: "numeric", month: "long") }
        [few] { -brand-short-name } заблокував { $trackerCount } елементи стеження, починаючи з { DATETIME($date, year: "numeric", month: "long") }
       *[many] { -brand-short-name } заблокував { $trackerCount } елементів стеження, починаючи з { DATETIME($date, year: "numeric", month: "long") }
    }
