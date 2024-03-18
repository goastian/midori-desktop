# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

printui-title = Yazdır
# Dialog title to prompt the user for a filename to save print to PDF.
printui-save-to-pdf-title = Farklı kaydet

# Variables
# $sheetCount (integer) - Number of paper sheets
printui-sheets-count =
    { $sheetCount ->
        [one] { $sheetCount } sayfa
       *[other] { $sheetCount } sayfa
    }

printui-page-range-all = Tümü
printui-page-range-current = Geçerli sayfa
printui-page-range-odd = Tek
printui-page-range-even = Çift
printui-page-range-custom = Özel
printui-page-range-label = Sayfalar
printui-page-range-picker =
    .aria-label = Sayfa aralığını seçin
printui-page-custom-range-input =
    .aria-label = Özel sayfa aralığını yazın
    .placeholder = örn. 2-6, 9, 12-16

# Section title for the number of copies to print
printui-copies-label = Kopya sayısı

printui-orientation = Yönlendirme
printui-landscape = Yatay
printui-portrait = Dikey

# Section title for the printer or destination device to target
printui-destination-label = Hedef
printui-destination-pdf-label = PDF’e kaydet

printui-more-settings = Daha fazla ayar
printui-less-settings = Daha az ayar

printui-paper-size-label = Kâğıt boyutu

# Section title (noun) for the print scaling options
printui-scale = Ölçek
printui-scale-fit-to-page-width = Sayfa genişliğine sığdır
# Label for input control where user can set the scale percentage
printui-scale-pcent = Ölçeklendir

# Section title (noun) for the two-sided print options
printui-two-sided-printing = İki taraflı yazdırma
printui-two-sided-printing-off = Kapalı
# Flip the sheet as if it were bound along its long edge.
printui-two-sided-printing-long-edge = Uzun kenarından çevir
# Flip the sheet as if it were bound along its short edge.
printui-two-sided-printing-short-edge = Kısa kenarından çevir

# Section title for miscellaneous print options
printui-options = Seçenekler
printui-headers-footers-checkbox = Üst bilgi ve alt bilgileri yazdır
printui-backgrounds-checkbox = Arka planları yazdır

## The "Format" section, select a version of the website to print. Radio
## options to select between the original page, selected text only, or a version
## where the page is processed with "Reader View".

# The section title.
printui-source-label = Biçim
# Option for printing the original page.
printui-source-radio = Orijinal
# Option for printing just the content a user selected prior to printing.
printui-selection-radio = Seçim
# Option for "simplifying" the page by printing the Reader View version.
printui-simplify-page-radio = Basitleştirilmiş

##

printui-color-mode-label = Renk modu
printui-color-mode-color = Renkli
printui-color-mode-bw = Siyah beyaz

printui-margins = Kenar boşlukları
printui-margins-default = Varsayılan
printui-margins-min = Minimum
printui-margins-none = Yok
printui-margins-custom-inches = Özel (inç)
printui-margins-custom-mm = Özel (mm)
printui-margins-custom-top = Üst
printui-margins-custom-top-inches = Üst (inç)
printui-margins-custom-top-mm = Üst (mm)
printui-margins-custom-bottom = Alt
printui-margins-custom-bottom-inches = Alt (inç)
printui-margins-custom-bottom-mm = Alt (mm)
printui-margins-custom-left = Sol
printui-margins-custom-left-inches = Sol (inç)
printui-margins-custom-left-mm = Sol (mm)
printui-margins-custom-right = Sağ
printui-margins-custom-right-inches = Sağ (inç)
printui-margins-custom-right-mm = Sağ (mm)

printui-system-dialog-link = Sistem iletişim kutusuyla yazdır…

printui-primary-button = Yazdır
printui-primary-button-save = Kaydet
printui-cancel-button = Vazgeç
printui-close-button = Kapat

printui-loading = Ön izleme hazırlanıyor

# Reported by screen readers and other accessibility tools to indicate that
# the print preview has focus.
printui-preview-label =
    .aria-label = Yazdırma ön izleme

printui-pages-per-sheet = Yaprak başına sayfa

# This is shown next to the Print button with an indefinite loading spinner
# when the user prints a page and it is being sent to the printer.
printui-print-progress-indicator = Yazdırılıyor…
printui-print-progress-indicator-saving = Kaydediliyor…

## Paper sizes that may be supported by the Save to PDF destination:

printui-paper-a5 = A5
printui-paper-a4 = A4
printui-paper-a3 = A3
printui-paper-a2 = A2
printui-paper-a1 = A1
printui-paper-a0 = A0
printui-paper-b5 = B5
printui-paper-b4 = B4
printui-paper-jis-b5 = JIS-B5
printui-paper-jis-b4 = JIS-B4
printui-paper-letter = US Letter
printui-paper-legal = US Legal
printui-paper-tabloid = Tabloid

## Error messages shown when a user has an invalid input

printui-error-invalid-scale = Ölçek, 10 ile 200 arasında bir sayı olmalıdır.
printui-error-invalid-margin = Lütfen seçilen kâğıt boyutu için geçerli bir kenar boşluğu girin.
printui-error-invalid-copies = Kopya sayısı 1 ile 10000 arasında olmalıdır.

# Variables
# $numPages (integer) - Number of pages
printui-error-invalid-range = Aralık, 1 ile { $numPages } arasında bir sayı olmalıdır.
printui-error-invalid-start-overflow = “Başlangıç” sayfa numarası “bitiş” sayfa numarasından küçük olmalıdır.
