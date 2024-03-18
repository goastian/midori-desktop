# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

download-ui-confirm-title = Tüm indirmeler iptal edilsin mi?

## Variables:
##   $downloadsCount (Number): The current downloads count.

download-ui-confirm-quit-cancel-downloads =
    { $downloadsCount ->
        [1] Şimdi çıkarsanız 1 dosyanın indirilmesinden vazgeçilecek. Çıkmak istediğinizden emin misiniz?
       *[other] Şimdi çıkarsanız { $downloadsCount } dosyanın indirilmesinden vazgeçilecek. Çıkmak istediğinizden emin misiniz?
    }
download-ui-confirm-quit-cancel-downloads-mac =
    { $downloadsCount ->
        [1] Şimdi çıkarsanız 1 dosyanın indirilmesinden vazgeçilecek. Çıkmak istediğinizden emin misiniz?
       *[other] Şimdi çıkarsanız { $downloadsCount } dosyanın indirilmesinden vazgeçilecek. Çıkmak istediğinizden emin misiniz?
    }
download-ui-dont-quit-button =
    { PLATFORM() ->
        [mac] Hayır, indirmeye devam et
       *[other] Hayır, indirmeye devam et
    }

download-ui-confirm-offline-cancel-downloads =
    { $downloadsCount ->
        [1] Şimdi çevrimdışı olursanız indirilen 1 dosyadan vazgeçilecek. Çevrimdışı olmak istediğinizden emin misiniz?
       *[other] Şimdi çevrimdışı olursanız indirilen { $downloadsCount } dosyadan vazgeçilecek. Çevrimdışı olmak istediğinizden emin misiniz?
    }
download-ui-dont-go-offline-button = Çevrimiçi kal

download-ui-confirm-leave-private-browsing-windows-cancel-downloads =
    { $downloadsCount ->
        [1] Tüm Gizli Gezinti pencerelerini şimdi kapatırsanız 1 indirme işlemi iptal edilecek. Gizli Gezinti’den çıkmak istediğinize emin misiniz?
       *[other] Tüm Gizli Gezinti pencerelerini şimdi kapatırsanız { $downloadsCount } indirme işlemi iptal edilecek. Gizli Gezinti’den çıkmak istediğinize emin misiniz?
    }
download-ui-dont-leave-private-browsing-button = Gizli Gezinti’yi sürdür

download-ui-cancel-downloads-ok =
    { $downloadsCount ->
        [1] Evet, indirmekten vazgeç
       *[other] Evet, { $downloadsCount } dosyayı indirmekten vazgeç
    }

##

download-ui-file-executable-security-warning-title = Çalıştırılabilir dosya açılsın mı?
# Variables:
#   $executable (String): The executable file to be opened.
download-ui-file-executable-security-warning = “{ $executable }” çalıştırılabilen bir dosyadır. Çalıştırılabilen dosyalar virüs veya bilgisayarınıza zarar verebilecek kodlar içerebilir. Bu dosyayı açarken dikkatli olun. “{ $executable }” dosyasını çalıştırmak istediğinizden emin misiniz?
