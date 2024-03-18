# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## These messages are used as headings in the recommendation doorhanger

cfr-doorhanger-extension-heading = Uzantı Önerisi
cfr-doorhanger-feature-heading = Özellik Önerisi

##

cfr-doorhanger-extension-sumo-link =
    .tooltiptext = Bunu neden görüyorum?

cfr-doorhanger-extension-cancel-button = Şimdi değil
    .accesskey = m

cfr-doorhanger-extension-ok-button = Hemen ekle
    .accesskey = H

cfr-doorhanger-extension-manage-settings-button = Öneri ayarlarını yönet
    .accesskey = Ö

cfr-doorhanger-extension-never-show-recommendation = Bana bu öneriyi gösterme
    .accesskey = B

cfr-doorhanger-extension-learn-more-link = Daha fazla bilgi al

# This string is used on a new line below the add-on name
# Variables:
#   $name (String) - Add-on author name
cfr-doorhanger-extension-author = geliştiren: { $name }

# This is a notification displayed in the address bar.
# When clicked it opens a panel with a message for the user.
cfr-doorhanger-extension-notification = Öneri
# .a11y-announcement is extracted in JS and announced via A11y.announce.
cfr-doorhanger-extension-notification2 = Öneri
    .tooltiptext = Eklenti önerisi
    .a11y-announcement = Eklenti öneriniz var

# This is a notification displayed in the address bar.
# When clicked it opens a panel with a message for the user.
# .a11y-announcement is extracted in JS and announced via A11y.announce.
cfr-doorhanger-feature-notification = Öneri
    .tooltiptext = Özellik önerisi
    .a11y-announcement = Özellik öneriniz var

## Add-on statistics
## These strings are used to display the total number of
## users and rating for an add-on. They are shown next to each other.

# Variables:
#   $total (Number) - The rating of the add-on from 1 to 5
cfr-doorhanger-extension-rating =
    .tooltiptext =
        { $total ->
            [one] { $total } yıldız
           *[other] { $total } yıldız
        }
# Variables:
#   $total (Number) - The total number of users using the add-on
cfr-doorhanger-extension-total-users =
    { $total ->
        [one] { $total } kullanıcı
       *[other] { $total } kullanıcı
    }

## Firefox Accounts Message

cfr-doorhanger-bookmark-fxa-header = Yer imlerinize her yerden ulaşın.
cfr-doorhanger-bookmark-fxa-body = Bu yer imine mobil cihazlarınızdan da ulaşmak istemez miydiniz? Hemen { -fxaccount-brand-name } açın.
cfr-doorhanger-bookmark-fxa-link-text = Yer imlerini eşitle…
cfr-doorhanger-bookmark-fxa-close-btn-tooltip =
    .aria-label = Kapat düğmesi
    .title = Kapat

## Protections panel

cfr-protections-panel-header = Takip edilmeden gezin
cfr-protections-panel-body = Verileriniz sizde kalsın. { -brand-short-name }, internette ne yaptığınızı öğrenmeye çalışan takip kodlarının çoğundan sizi korur.
cfr-protections-panel-link-text = Daha fazla bilgi alın

## What's New toolbar button and panel

# This string is used by screen readers to offer a text based alternative for
# the notification icon
cfr-badge-reader-label-newfeature = Yeni özellik:

cfr-whatsnew-button =
    .label = Yeni neler var?
    .tooltiptext = Yeni neler var?

cfr-whatsnew-release-notes-link-text = Sürüm notlarını okuyun

## Enhanced Tracking Protection Milestones

# Variables:
#   $blockedCount (Number) - The total count of blocked trackers. This number will always be greater than 1.
#   $date (Datetime) - The date we began recording the count of blocked trackers
cfr-doorhanger-milestone-heading2 =
    { $blockedCount ->
        [one] { -brand-short-name } { DATETIME($date, month: "long", year: "numeric") } tarihinden beri <b>{ $blockedCount }</b> takip kodunu engelledi!
       *[other] { -brand-short-name } { DATETIME($date, month: "long", year: "numeric") } tarihinden beri <b>{ $blockedCount }</b> takip kodunu engelledi!
    }
cfr-doorhanger-milestone-ok-button = Tümünü göster
    .accesskey = T
cfr-doorhanger-milestone-close-button = Kapat
    .accesskey = K

## DOH Message

cfr-doorhanger-doh-body = Gizliliğiniz bizim için önemli. Web’de gezinirken gizliliğinizi korumak için { -brand-short-name } artık DNS isteklerinizi mümkün olduğunca iş ortaklarımıza yönlendiriyor.
cfr-doorhanger-doh-header = Daha güvenli, şifrelenmiş DNS sorguları
cfr-doorhanger-doh-primary-button-2 = Tamam
    .accesskey = T
cfr-doorhanger-doh-secondary-button = Devre dışı bırak
    .accesskey = D

## Fission Experiment Message

## Full Video Support CFR message

cfr-doorhanger-video-support-body = Bu sitedeki videolar { -brand-short-name }’un bu sürümünde düzgün oynatılamayabilir. Eksiksiz video desteği için { -brand-short-name } tarayıcınızı güncellemelisiniz.
cfr-doorhanger-video-support-header = Videoları izlemek için { -brand-short-name }’ güncelleyin
cfr-doorhanger-video-support-primary-button = Şimdi güncelle
    .accesskey = m

## Spotlight modal shared strings

## VPN promotion dialog for public Wi-Fi users
##
## If a user is detected to be on a public Wi-Fi network, they are given a
## bit of info about how to improve their privacy and then offered a button
## to the Mozilla VPN page and a link to dismiss the dialog.

# This header text can be explicitly wrapped.
spotlight-public-wifi-vpn-header = Galiba herkese açık bir Wi-Fi ağına bağlısınız
spotlight-public-wifi-vpn-body = Konumunuzu ve girdiğiniz siteleri gizlemek için VPN kullanabilirsiniz. Havalimanları ve kafeler gibi halka açık yerlerde internette gezinirken VPN kullanmanız güvenliğinizi artırır.
spotlight-public-wifi-vpn-primary-button = { -mozilla-vpn-brand-name } ile gizli kalın
    .accesskey = k
spotlight-public-wifi-vpn-link = Şimdi değil
    .accesskey = m

## Total Cookie Protection Rollout

## Emotive Continuous Onboarding

spotlight-better-internet-header = Daha iyi bir interneti seçtiniz
spotlight-better-internet-body = { -brand-short-name } kullandığınızda tüm insanlık için daha açık ve daha erişilebilir bir interneti savunmuş oluyorsunuz.
spotlight-peace-mind-header = Yanınızdayız
spotlight-peace-mind-body = { -brand-short-name } her ay kullanıcı başına ortalama 3.000 takip kodunu engelliyor. Çünkü bizce hiçbir şey, özellikle takip kodları gibi can sıkıcı unsurlar, iyi bir internetle aranıza girmemeli.
spotlight-pin-primary-button =
    { PLATFORM() ->
        [macos] Dock’a sabitle
       *[other] Görev çubuğuna sabitle
    }
spotlight-pin-secondary-button = Şimdi değil

## MR2022 Background Update Windows native toast notification strings.
##
## These strings will be displayed by the Windows operating system in
## a native toast, like:
##
## <b>multi-line title</b>
## multi-line text
## <img>
## [ primary button ] [ secondary button ]
##
## The button labels are fitted into narrow fixed-width buttons by
## Windows and therefore must be as narrow as possible.

mr2022-background-update-toast-title = Yeni { -brand-short-name }. Daha çok gizlilik. Daha az izleyici.
mr2022-background-update-toast-text = Bugüne kadarki en güçlü izlenme korumamızla güncellenen en yeni { -brand-short-name }’u şimdi deneyin.

# This button label will be fitted into a narrow fixed-width button by
# Windows. Try to not exceed the width of the English text (compare it
# using a variable font like Arial): the button can only fit 1-2
# additional characters, exceeding characters will be truncated.
mr2022-background-update-toast-primary-button-label = { -brand-shorter-name }’u açın

# This button label will be fitted into a narrow fixed-width button by
# Windows. Try to not exceed the width of the English text (compare it using a
# variable font like Arial): the button can only fit 1-2 additional characters,
# exceeding characters will be truncated.
mr2022-background-update-toast-secondary-button-label = Daha sonra hatırlat

## Firefox View CFR

firefoxview-cfr-primarybutton = Deneyin
    .accesskey = D
firefoxview-cfr-secondarybutton = Şimdi değil
    .accesskey = m
firefoxview-cfr-header-v2 = Kaldığınız yerden hızlıca devam edin
firefoxview-cfr-body-v2 = { -firefoxview-brand-name } ile yakın zamanda kapattığınız sekmeleri geri getirebilir ve cihazlarınız arasında kolayca şekilde geçiş yapabilirsiniz.

## Firefox View Spotlight

firefoxview-spotlight-promo-title = { -firefoxview-brand-name }’a merhaba deyin

# “Poof” refers to the expression to convey when something or someone suddenly disappears, or in this case, reappears. For example, “Poof, it’s gone.”
firefoxview-spotlight-promo-subtitle = Telefonunuzdan baktığınız sayfayı görmek mi istiyorsunuz? Az önce ziyaret ettiğiniz siteye geri dönmeniz mi gerekiyor? { -firefoxview-brand-name } ile hepsi yanınızda.
firefoxview-spotlight-promo-primarybutton = Nasıl çalıştığını görün
firefoxview-spotlight-promo-secondarybutton = Geç

## Colorways expiry reminder CFR

colorways-cfr-primarybutton = Renk kuşağını seç
    .accesskey = R

# "shades" refers to the different color options available to users in colorways.
colorways-cfr-body = Kültürü değiştiren seslerden ilham alan { -brand-short-name } renkleriyle tarayıcınızı renklendirin.
colorways-cfr-header-28days = Bağımsız Sesler renk kuşakları 16 Ocak’ta kullanımdan kalkıyor
colorways-cfr-header-14days = Bağımsız Sesler renk kuşakları iki hafta sonra kullanımdan kalkıyor
colorways-cfr-header-7days = Bağımsız Sesler renk kuşakları bu hafta kullanımdan kalkıyor
colorways-cfr-header-today = Bağımsız Sesler renk kuşakları bugün kullanımdan kalkıyor

## Cookie Banner Handling CFR

cfr-cbh-header = { -brand-short-name } çerez bildirimlerini reddedebilsin mi?
cfr-cbh-body = { -brand-short-name } birçok çerez bildirimi isteğini otomatik olarak reddedebilir.
cfr-cbh-confirm-button = Çerez bildirimlerini reddet
    .accesskey = r
cfr-cbh-dismiss-button = Şimdi değil
    .accesskey = m

## These strings are used in the Fox doodle Pin/set default spotlights

july-jam-headline = Sizi koruyoruz
july-jam-body = { -brand-short-name }, her ay kullanıcı başına ortalama 3.000 takip kodunu engelleyerek internete güvenli ve hızlı erişim sağlıyor.
july-jam-set-default-primary = Bağlantılarımı { -brand-short-name } ile aç
fox-doodle-pin-headline = Yeniden hoş geldiniz

# “indie” is short for the term “independent”.
# In this instance, free from outside influence or control.
fox-doodle-pin-body = Küçük bir hatırlatma: Bağımsız tarayıcınızı bir tık kadar yakınınızda tutabilirsiniz.
fox-doodle-pin-primary = Bağlantılarımı { -brand-short-name } ile aç
fox-doodle-pin-secondary = Şimdi değil

## These strings are used in the Set Firefox as Default PDF Handler for Existing Users experiment

set-default-pdf-handler-headline = <strong>PDF’leriniz artık { -brand-short-name } ile açılıyor.</strong> Formları doğrudan tarayıcınızda düzenleyebilir ve imzalayabilirsiniz. Varsayılan ayarları değiştirmek isterseniz ayarlarda “PDF” araması yapabilirsiniz.
set-default-pdf-handler-primary = Anladım

## FxA sync CFR

fxa-sync-cfr-header = Yeni bir cihaza geçmeyi düşünüyor musunuz?
fxa-sync-cfr-body = { -brand-product-name } tarayıcısını yüklediğiniz her yere yer imleriniz, parolalarınız ve sekmeleriniz de sizinle birlikte gelsin.
fxa-sync-cfr-primary = Bilgi al
    .accesskey = D
fxa-sync-cfr-secondary = Daha sonra hatırlat
    .accesskey = D

## Device Migration FxA Spotlight

device-migration-fxa-spotlight-header = Eski bir cihaz mı kullanıyorsunuz?
device-migration-fxa-spotlight-body = Yeni bir cihaza geçiş yaparken yer imleri ve parolalar gibi önemli bilgilerinizin kaybolmaması için için verilerinizi yedekleyin.
device-migration-fxa-spotlight-primary-button = Verilerimi nasıl yedekleyebilirim?
device-migration-fxa-spotlight-link = Daha sonra hatırlat
