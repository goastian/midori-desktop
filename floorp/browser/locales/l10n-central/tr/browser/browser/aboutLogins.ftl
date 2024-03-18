# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
# NOTE: New strings should use the about-logins- prefix.

about-logins-page-title = Hesaplar ve Parolalar

about-logins-login-filter =
    .placeholder = Hesaplarda ara
    .key = F

create-new-login-button =
    .title = Yeni hesap oluştur

fxaccounts-sign-in-text = Parolalarınızı tüm cihazlarınıza aktarın
fxaccounts-sign-in-sync-button = Eşitlemek için giriş yap
fxaccounts-avatar-button =
    .title = Hesabı yönet

## The ⋯ menu that is in the top corner of the page

menu =
    .title = Menüyü aç
# This menuitem is only visible on Windows and macOS
about-logins-menu-menuitem-import-from-another-browser = Başka bir tarayıcıdan içe aktar…
about-logins-menu-menuitem-import-from-a-file = Dosyadan içe aktar…
about-logins-menu-menuitem-export-logins = Hesapları dışa aktar…
about-logins-menu-menuitem-remove-all-logins = Tüm hesapları kaldır…
menu-menuitem-preferences =
    { PLATFORM() ->
        [windows] Seçenekler
       *[other] Tercihler
    }
about-logins-menu-menuitem-help = Yardım

## Login List

login-list =
    .aria-label = Arama sorgusuyla eşleşen hesaplar
# Variables
#   $count (number) - Number of logins
login-list-count =
    { $count ->
        [one] { $count } hesap
       *[other] { $count } hesap
    }
# Variables
#   $count (number) - Number of filtered logins
#   $total (number) - Total number of logins
login-list-filtered-count =
    { $total ->
        [one] { $total } hesaptan { $count } hesap
       *[other] { $total } hesaptan { $count } hesap
    }
login-list-sort-label-text = Sıralama:
login-list-name-option = Ad (A-Z)
login-list-name-reverse-option = Ad (Z-A)
login-list-username-option = Kullanıcı adı (A-Z)
login-list-username-reverse-option = Kullanıcı adı (Z-A)
about-logins-login-list-alerts-option = Uyarılar
login-list-last-changed-option = Son değişiklik
login-list-last-used-option = Son kullanım
login-list-intro-title = Hiç hesap bulunamadı
login-list-intro-description = { -brand-product-name } tarayıcısında kaydettiğiniz parolalar burada görünecektir.
about-logins-login-list-empty-search-title = Hiç hesap bulunamadı
about-logins-login-list-empty-search-description = Aramanızla eşleşen sonuç bulunamadı.
login-list-item-title-new-login = Yeni hesap
login-list-item-subtitle-new-login = Hesap bilgilerinizi girin
login-list-item-subtitle-missing-username = (kullanıcı adı yok)
about-logins-list-item-breach-icon =
    .title = Bu site ihlale uğramış
about-logins-list-item-vulnerable-password-icon =
    .title = Güvensiz parola
about-logins-list-section-breach = Veri ihlaline uğrayan siteler
about-logins-list-section-vulnerable = Güvensiz parolalar
about-logins-list-section-nothing = Uyarı yok
about-logins-list-section-today = Bugün
about-logins-list-section-yesterday = Dün
about-logins-list-section-week = Son 7 gün

## Introduction screen

about-logins-login-intro-heading-logged-out2 = Kayıtlı hesaplarınızı mı arıyorsunuz? Eşitlemeyi açın veya içe aktarın.
about-logins-login-intro-heading-logged-in = Eşitlenmiş hesap bulunamadı.
login-intro-description = Hesaplarınızı farklı bir cihazdaki { -brand-product-name } tarayıcınıza kaydettiyseniz onları buraya aktarabilirsiniz:
login-intro-instructions-fxa = Hesaplarınızın kayıtlı olduğu cihazda { -fxaccount-brand-name } açın veya hesabınıza giriş yapın.
login-intro-instructions-fxa-settings = Ayarlar > Eşitleme > “Eşitlemeyi başlat…” kısmına gidip “Hesaplar ve parolalar”ı işaretleyin.
login-intro-instructions-fxa-passwords-help = Yardıma ihtiyacınız varsa <a data-l10n-name="passwords-help-link">parola desteğini</a> ziyaret edebilirsiniz.
about-logins-intro-browser-only-import = Hesaplarınız başka bir tarayıcıda kayıtlıysa onları <a data-l10n-name="import-link">{ -brand-product-name }’a aktarabilirsiniz</a>
about-logins-intro-import2 = Hesaplarınız { -brand-product-name } dışında kayıtlıysa onları <a data-l10n-name="import-browser-link">başka bir tarayıcıdan</a> veya <a data-l10n-name="import-file-link">dosyadan</a> içe aktarabilirsiniz

## Login

login-item-new-login-title = Yeni hesap oluştur
login-item-edit-button = Düzenle
about-logins-login-item-remove-button = Kaldır
login-item-origin-label = Web sitesi adresi
login-item-tooltip-message = Giriş yaptığınız web sitesinin tam adresiyle aynı olmalı.
login-item-origin =
    .placeholder = https://www.example.com
login-item-username-label = Kullanıcı adı
about-logins-login-item-username =
    .placeholder = (kullanıcı adı yok)
login-item-copy-username-button-text = Kopyala
login-item-copied-username-button-text = Kopyalandı!
login-item-password-label = Parola
login-item-password-reveal-checkbox =
    .aria-label = Parolayı göster
login-item-copy-password-button-text = Kopyala
login-item-copied-password-button-text = Kopyalandı!
login-item-save-changes-button = Değişiklikleri kaydet
login-item-save-new-button = Kaydet
login-item-cancel-button = İptal

## The date is displayed in a timeline showing the password evolution.
## A label is displayed under the date to describe the type of change.
## (e.g. updated, created, etc.)

# Variables
#   $datetime (date) - Event date
login-item-timeline-point-date = { DATETIME($datetime, day: "numeric", month: "short", year: "numeric") }
login-item-timeline-action-created = Oluşturma
login-item-timeline-action-updated = Güncelleme
login-item-timeline-action-used = Kullanma

## OS Authentication dialog

about-logins-os-auth-dialog-caption = { -brand-full-name }

## The macOS strings are preceded by the operating system with "Firefox is trying to "
## and includes subtitle of "Enter password for the user "xxx" to allow this." These
## notes are only valid for English. Please test in your respected locale.

# This message can be seen when attempting to edit a login in about:logins on Windows.
about-logins-edit-login-os-auth-dialog-message-win = Hesabınızı düzenlemek için Windows hesap bilgilerinizi girin. Bu sayede hesaplarınızı daha güvenli bir şekilde koruyabiliriz.
# This message can be seen when attempting to edit a login in about:logins
# On MacOS, only provide the reason that account verification is needed. Do not put a complete sentence here.
about-logins-edit-login-os-auth-dialog-message-macosx = kayıtlı hesabı düzenleme

# This message can be seen when attempting to reveal a password in about:logins on Windows.
about-logins-reveal-password-os-auth-dialog-message-win = Parolanızı görmek için Windows hesap bilgilerinizi girin. Bu sayede hesaplarınızı daha güvenli bir şekilde koruyabiliriz.
# This message can be seen when attempting to reveal a password in about:logins
# On MacOS, only provide the reason that account verification is needed. Do not put a complete sentence here.
about-logins-reveal-password-os-auth-dialog-message-macosx = kayıtlı parolayı gösterme

# This message can be seen when attempting to copy a password in about:logins on Windows.
about-logins-copy-password-os-auth-dialog-message-win = Parolanızı kopyalamak için Windows hesap bilgilerinizi girin. Bu sayede hesaplarınızı daha güvenli bir şekilde koruyabiliriz.
# This message can be seen when attempting to copy a password in about:logins
# On MacOS, only provide the reason that account verification is needed. Do not put a complete sentence here.
about-logins-copy-password-os-auth-dialog-message-macosx = kayıtlı parolayı kopyalama

# This message can be seen when attempting to export a password in about:logins on Windows.
about-logins-export-password-os-auth-dialog-message-win = Hesaplarınızı dışa aktarmak için Windows hesap bilgilerinizi girin. Bu sayede hesaplarınızı daha güvenli bir şekilde koruyabiliriz.
# This message can be seen when attempting to export a password in about:logins
# On MacOS, only provide the reason that account verification is needed. Do not put a complete sentence here.
about-logins-export-password-os-auth-dialog-message-macosx = kayıtlı hesapları ve parolaları dışa aktarma

## Primary Password notification

about-logins-primary-password-notification-message = Kayıtlı parola ve hesaplarınızı görmek için lütfen ana parolanızı girin
master-password-reload-button =
    .label = Giriş yap
    .accesskey = G

## Dialogs

confirmation-dialog-cancel-button = İptal
confirmation-dialog-dismiss-button =
    .title = İptal

about-logins-confirm-remove-dialog-title = Bu hesap kaldırılsın mı?
confirm-delete-dialog-message = Bu işlem geri alınamaz.
about-logins-confirm-remove-dialog-confirm-button = Kaldır

## Variables
##   $count (number) - Number of items

about-logins-confirm-remove-all-dialog-confirm-button-label =
    { $count ->
        [1] Kaldır
        [one] Kaldır
       *[other] Tümünü kaldır
    }

about-logins-confirm-remove-all-dialog-checkbox-label =
    { $count ->
        [1] Evet, bu hesabı kaldır
        [one] Evet, bu hesabı kaldır
       *[other] Evet, bu hesapları kaldır
    }

about-logins-confirm-remove-all-dialog-title =
    { $count ->
        [one] { $count } hesap kaldırılsın mı?
       *[other] { $count } hesap kaldırılsın mı?
    }
about-logins-confirm-remove-all-dialog-message =
    { $count ->
        [1] Bu işlem { -brand-short-name } tarayıcısına kaydettiğiniz hesabı ve burada görünen ihlal uyarılarını kaldıracaktır. Bu işlemi geri alamazsınız.
        [one] Bu işlem { -brand-short-name } tarayıcısına kaydettiğiniz hesabı ve burada görünen ihlal uyarılarını kaldıracaktır. Bu işlemi geri alamazsınız.
       *[other] Bu işlem { -brand-short-name } tarayıcısına kaydettiğiniz hesapları ve burada görünen ihlal uyarılarını kaldıracaktır. Bu işlemi geri alamazsınız.
    }

about-logins-confirm-remove-all-sync-dialog-title =
    { $count ->
        [one] { $count } hesap hepsi tüm cihazlardan kaldırılsın mı?
       *[other] { $count } hesabın hepsi tüm cihazlardan kaldırılsın mı?
    }
about-logins-confirm-remove-all-sync-dialog-message =
    { $count ->
        [1] Bu işlem { -brand-short-name } tarayıcısına kaydettiğiniz hesabı { -fxaccount-brand-name }nızla eşitlenen tüm cihazlardan kaldıracaktır. Burada görünen ihlal uyarıları da kaldırılacaktır. Bu işlemi geri alamazsınız.
        [one] Bu işlem { -brand-short-name } tarayıcısına kaydettiğiniz hesabı { -fxaccount-brand-name }nızla eşitlenen tüm cihazlardan kaldıracaktır. Burada görünen ihlal uyarıları da kaldırılacaktır. Bu işlemi geri alamazsınız.
       *[other] Bu işlem { -brand-short-name } tarayıcısına kaydettiğiniz tüm hesapları { -fxaccount-brand-name }nızla eşitlenen tüm cihazlardan kaldıracaktır. Burada görünen ihlal uyarıları da kaldırılacaktır. Bu işlemi geri alamazsınız.
    }

##

about-logins-confirm-export-dialog-title = Hesapları ve parolaları dışa aktarma
about-logins-confirm-export-dialog-message = Parolalarınız okunabilir metin olarak kaydedilecek (örn. KotuP@r0la), yani dışa aktarılan dosyayı açabilen herkes parolalarınızı görebilecektir.
about-logins-confirm-export-dialog-confirm-button = Dışa aktar…

about-logins-alert-import-title = İçe aktarma tamamlandı
about-logins-alert-import-message = Ayrıntılı içe aktarma özetini görüntüle

confirm-discard-changes-dialog-title = Kaydedilmemiş değişikliklerden vazgeçilsin mi?
confirm-discard-changes-dialog-message = Kaydedilmemiş değişikliklerin tümü kaybolacak.
confirm-discard-changes-dialog-confirm-button = Vazgeç

## Breach Alert notification

about-logins-breach-alert-title = Web Sitesi İhlali
breach-alert-text = Giriş bilgilerinizi son güncellemenizden bu yana bu web sitesindeki parolalar sızdırılmış veya çalınmış. Hesabınızı korumak için parolanızı değiştirin.
about-logins-breach-alert-date = Bu ihlal { DATETIME($date, day: "numeric", month: "long", year: "numeric") } tarihinde meydana geldi
# Variables:
#   $hostname (String) - The hostname of the website associated with the login, e.g. "example.com"
about-logins-breach-alert-link = { $hostname } sitesine git

## Vulnerable Password notification

about-logins-vulnerable-alert-title = Güvensiz Parola
about-logins-vulnerable-alert-text2 = Bu parolayı veri ihlaline uğramış olan başka bir hesapta da kullanmışsınız. Aynı parola farklı yerlerde kullanmak tüm hesaplarınızı risk altına sokar. Bu parolayı değiştirin.
# Variables:
#   $hostname (String) - The hostname of the website associated with the login, e.g. "example.com"
about-logins-vulnerable-alert-link = { $hostname } sitesine git
about-logins-vulnerable-alert-learn-more-link = Daha fazla bilgi al

## Error Messages

# This is an error message that appears when a user attempts to save
# a new login that is identical to an existing saved login.
# Variables:
#   $loginTitle (String) - The title of the website associated with the login.
about-logins-error-message-duplicate-login-with-link = { $loginTitle } için bu kullanıcı adına sahip bir kayıt zaten var. <a data-l10n-name="duplicate-link">Mevcut kayda gitmek ister misiniz?</a>

# This is a generic error message.
about-logins-error-message-default = Bu parola kaydedilirken bir hata oluştu.

## Login Export Dialog

# Title of the file picker dialog
about-logins-export-file-picker-title = Hesaplar Dosyasını Dışa Aktar
# The default file name shown in the file picker when exporting saved logins.
# This must end in .csv
about-logins-export-file-picker-default-filename = hesaplar.csv
about-logins-export-file-picker-export-button = Dışa aktar
# A description for the .csv file format that may be shown as the file type
# filter by the operating system.
about-logins-export-file-picker-csv-filter-title =
    { PLATFORM() ->
        [macos] CSV belgesi
       *[other] CSV dosyası
    }

## Login Import Dialog

# Title of the file picker dialog
about-logins-import-file-picker-title = Hesaplar Dosyasını İçe Aktar
about-logins-import-file-picker-import-button = İçe aktar
# A description for the .csv file format that may be shown as the file type
# filter by the operating system.
about-logins-import-file-picker-csv-filter-title =
    { PLATFORM() ->
        [macos] CSV belgesi
       *[other] CSV dosyası
    }
# A description for the .tsv file format that may be shown as the file type
# filter by the operating system. TSV is short for 'tab separated values'.
about-logins-import-file-picker-tsv-filter-title =
    { PLATFORM() ->
        [macos] TSV belgesi
       *[other] TSV dosyası
    }

##
## Variables:
##  $count (number) - The number of affected elements

about-logins-import-dialog-title = İçe aktarma tamamlandı
about-logins-import-dialog-items-added =
    { $count ->
        [one] <span>Eklenen hesap sayısı:</span> <span data-l10n-name="count">{ $count }</span>
       *[other] <span>Eklenen hesap sayısı:</span> <span data-l10n-name="count">{ $count }</span>
    }

about-logins-import-dialog-items-modified =
    { $count ->
        [one] <span>Güncellenen hesap sayısı:</span> <span data-l10n-name="count">{ $count }</span>
       *[other] <span>Güncellenen hesap sayısı:</span> <span data-l10n-name="count">{ $count }</span>
    }

about-logins-import-dialog-items-no-change =
    { $count ->
       *[other] <span>Bulunan mükerrer hesap:</span> <span data-l10n-name="count">{ $count }</span> <span data-l10n-name="meta">(içe aktarılmadı)</span>
    }
about-logins-import-dialog-items-error =
    { $count ->
        [one] <span>Hata:</span> <span data-l10n-name="count">{ $count }</span> <span data-l10n-name="meta">(içe aktarılamadı)</span>
       *[other] <span>Hata:</span> <span data-l10n-name="count">{ $count }</span> <span data-l10n-name="meta">(içe aktarılamadı)</span>
    }
about-logins-import-dialog-done = Tamam

about-logins-import-dialog-error-title = İçe Aktarma Hatası
about-logins-import-dialog-error-conflicting-values-title = Bir Hesap için Çakışan Değerler
about-logins-import-dialog-error-conflicting-values-description = Örnek: bir hesap için birden çok kullanıcı adı, parola, URL vb.
about-logins-import-dialog-error-file-format-title = Dosya Biçimi Sorunu
about-logins-import-dialog-error-file-format-description = Yanlış veya eksik sütun başlıkları. Dosyada kullanıcı adı, parola ve URL sütunlarının bulunduğunu kontrol edin.
about-logins-import-dialog-error-file-permission-title = Dosya okunamıyor
about-logins-import-dialog-error-file-permission-description = { -brand-short-name }, dosyayı okuma iznine sahip değil. Dosya izinlerini değiştirmeyi deneyin.
about-logins-import-dialog-error-unable-to-read-title = Dosya Ayrıştırılamıyor
about-logins-import-dialog-error-unable-to-read-description = Bir CSV veya TSV dosyası seçtiğinizden emin olun.
about-logins-import-dialog-error-no-logins-imported = Hiçbir hesap içe aktarılmadı
about-logins-import-dialog-error-learn-more = Daha fazla bilgi al
about-logins-import-dialog-error-try-import-again = Tekrar içe aktarmayı dene…
about-logins-import-dialog-error-cancel = Vazgeç

about-logins-import-report-title = İçe Aktarma Özeti
about-logins-import-report-description = { -brand-short-name } tarayıcınıza aktarılan hesap ve parolalar.

#
# Variables:
#  $number (number) - The number of the row
about-logins-import-report-row-index = { $number }. satır
about-logins-import-report-row-description-no-change = Mükerrer: Mevcut hesabın aynısı
about-logins-import-report-row-description-modified = Mevcut hesap güncellendi
about-logins-import-report-row-description-added = Yeni hesap eklendi
about-logins-import-report-row-description-error = Hata: Eksik alan

##
## Variables:
##  $field (String) - The name of the field from the CSV file for example url, username or password

about-logins-import-report-row-description-error-multiple-values = Hata: { $field } için birden çok değer
about-logins-import-report-row-description-error-missing-field = Hata: { $field } eksik

##
## Variables:
##  $count (number) - The number of affected elements

about-logins-import-report-added =
    { $count ->
        [one] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">yeni hesap eklendi</div>
       *[other] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">yeni hesap eklendi</div>
    }
about-logins-import-report-modified =
    { $count ->
        [one] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">mevcut hesap güncellendi</div>
       *[other] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">mevcut hesap güncellendi</div>
    }
about-logins-import-report-no-change =
    { $count ->
        [one] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">mükerrer hesap</div> <div data-l10n-name="not-imported">(İçe aktarılmadı)</div>
       *[other] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">mükerrer hesap</div> <div data-l10n-name="not-imported">(İçe aktarılmadı)</div>
    }
about-logins-import-report-error =
    { $count ->
        [one] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">hata</div> <div data-l10n-name="not-imported">(İçe aktarılmadı)</div>
       *[other] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">hata</div> <div data-l10n-name="not-imported">(İçe aktarılmadı)</div>
    }

## Logins import report page

about-logins-import-report-page-title = İçe Aktarma Raporu
