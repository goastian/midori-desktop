# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

about-reader-loading = Yükleniyor…
about-reader-load-error = Makale sayfadan yüklenemedi

about-reader-color-scheme-light = Beyaz
    .title = Açık renk düzeni
about-reader-color-scheme-dark = Siyah
    .title = Koyu renk düzeni
about-reader-color-scheme-sepia = Sepya
    .title = Sepya renk düzeni
about-reader-color-scheme-auto = Otomatik
    .title = Otomatik renk düzeni

# An estimate for how long it takes to read an article,
# expressed as a range covering both slow and fast readers.
# Variables:
#   $rangePlural (String): The plural category of the range, using the same set as for numbers.
#   $range (String): The range of minutes as a localised string. Examples: "3-7", "~1".
about-reader-estimated-read-time =
    { $rangePlural ->
        [one] { $range } dakika
       *[other] { $range } dakika
    }

## These are used as tooltips in Type Control

about-reader-toolbar-minus =
    .title = Yazı tipi boyutunu küçült
about-reader-toolbar-plus =
    .title = Yazı tipi boyutunu büyüt
about-reader-toolbar-contentwidthminus =
    .title = İçerik genişliğini azalt
about-reader-toolbar-contentwidthplus =
    .title = İçerik genişliğini artır
about-reader-toolbar-lineheightminus =
    .title = Satır yüksekliğini azalt
about-reader-toolbar-lineheightplus =
    .title = Satır yüksekliğini artır

## These are the styles of typeface that are options in the reader view controls.

about-reader-font-type-serif = Serif
about-reader-font-type-sans-serif = Sans-serif

## Reader View toolbar buttons

about-reader-toolbar-close = Okuyucu Görünümü'nü kapat
about-reader-toolbar-type-controls = Yazı denetimleri
about-reader-toolbar-savetopocket = { -pocket-brand-name }’a kaydet
