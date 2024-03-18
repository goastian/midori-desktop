# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Error page titles

neterror-page-title = Sayfa yükleme sorunu
certerror-page-title = Uyarı: Güvenlik riskiyle karşılaşabilirsiniz
certerror-sts-page-title = Bağlanılmadı: Olası Güvenlik Sorunu
neterror-blocked-by-policy-page-title = Engellenmiş sayfa
neterror-captive-portal-page-title = Ağa giriş yap
neterror-dns-not-found-title = Sunucu bulunamadı
neterror-malformed-uri-page-title = Geçersiz URL

## Error page actions

neterror-advanced-button = Gelişmiş…
neterror-copy-to-clipboard-button = Metni panoya kopyala
neterror-learn-more-link = Daha fazla bilgi al…
neterror-open-portal-login-page-button = Ağa giriş sayfasını aç
neterror-override-exception-button = Riski kabul ederek devam et
neterror-pref-reset-button = Varsayılan ayarları geri yükle
neterror-return-to-previous-page-button = Geri dön
neterror-return-to-previous-page-recommended-button = Geri dön (Önerilir)
neterror-try-again-button = Yeniden dene
neterror-add-exception-button = Bu site için her zaman devam et
neterror-settings-button = DNS ayarlarını değiştir
neterror-view-certificate-link = Sertifikayı göster
neterror-trr-continue-this-time = Bu seferlik devam et
neterror-disable-native-feedback-warning = Her zaman devam et

##

neterror-pref-reset = Ağ güvenliği ayarlarınız buna yol açıyor olabilir. Varsayılan ayarları geri yüklemek ister misiniz?
neterror-error-reporting-automatic = { -vendor-short-name }’nın zararlı siteleri tanımlayıp engellemesine yardımcı olmak için bu gibi hataları rapor et

## Specific error messages

neterror-generic-error = { -brand-short-name } bilinmeyen bir nedenden dolayı bu sayfayı açamıyor.

neterror-load-error-try-again = Site geçici olarak kapalı veya çok meşgul olabilir. Biraz bekleyip yeniden deneyin.
neterror-load-error-connection = Hiçbir sayfayı açamıyorsanız bilgisayarınızın ağ bağlantısını kontrol edin.
neterror-load-error-firewall = Bilgisayarınız veya ağınız güvenlik duvarı veya vekil sunucu ile korunuyorsa { -brand-short-name } uygulamasının web’e erişim izni olduğundan emin olun.

neterror-captive-portal = İnternete erişebilmek için önce bu ağa giriş yapmalısınız.

# Variables:
# $hostAndPath (String) - a suggested site (e.g. "www.example.com") that the user may have meant instead.
neterror-dns-not-found-with-suggestion = <a data-l10n-name="website">{ $hostAndPath }</a> adresine mi gitmek istediniz?
neterror-dns-not-found-hint-header = <strong>Doğru adresi girdiyseniz şunları yapabilirsiniz:</strong>
neterror-dns-not-found-hint-try-again = Daha sonra yeniden deneyin
neterror-dns-not-found-hint-check-network = Ağ bağlantınızı kontrol edin
neterror-dns-not-found-hint-firewall = { -brand-short-name } tarayıcısının web’e erişim izni olup olmadığını kontrol edin (Bağlı olsanız da bir güvenlik duvarının arkasında olabilirsiniz)

## TRR-only specific messages
## Variables:
##   $hostname (String) - Hostname of the website to which the user was trying to connect.
##   $trrDomain (String) - Hostname of the DNS over HTTPS server that is currently in use.

neterror-dns-not-found-trr-only-reason = { -brand-short-name }, güvenilir DNS çözümleyicimiz aracılığıyla bu sitenin adresiyle ilgili isteğinizi koruyamıyor. Nedeni:
neterror-dns-not-found-trr-third-party-warning2 = Varsayılan DNS çözümleyicinizi kullanmaya devam edebilirsiniz ama bu durumda üçüncü taraflar hangi web sitelerini ziyaret ettiğinizi görebilir.

neterror-dns-not-found-trr-only-could-not-connect = { -brand-short-name }, { $trrDomain } adresine bağlanamadı.
neterror-dns-not-found-trr-only-timeout = { $trrDomain } ile bağlantı beklenenden uzun sürdü.
neterror-dns-not-found-trr-offline = İnternete bağlı değilsiniz.
neterror-dns-not-found-trr-unknown-host2 = { $trrDomain } bu web sitesini bulamadı.
neterror-dns-not-found-trr-server-problem = { $trrDomain } ile ilgili bir sorun oluştu.
neterror-dns-not-found-trr-unknown-problem = Beklenmeyen sorun.

## Native fallback specific messages
## Variables:
##   $trrDomain (String) - Hostname of the DNS over HTTPS server that is currently in use.

neterror-dns-not-found-native-fallback-reason = { -brand-short-name }, güvenilir DNS çözümleyicimiz aracılığıyla bu sitenin adresiyle ilgili isteğinizi koruyamıyor. Nedeni:
neterror-dns-not-found-native-fallback-heuristic = Ağınızda HTTP üzerinden DNS devre dışı bırakıldı.
neterror-dns-not-found-native-fallback-not-confirmed2 = { -brand-short-name } { $trrDomain } adresine bağlanamadı.

##

neterror-file-not-found-filename = Dosya adındaki büyük-küçük harfleri ve yazım hatalarını kontrol edin.
neterror-file-not-found-moved = Dosyanın taşınmadığını, adının değişmediğini veya silinmediğini kontrol edin.

neterror-access-denied = Silinmiş, taşınmış veya dosya izinleri nedeniyle erişilemiyor olabilir.

neterror-unknown-protocol = Bu adresi açmak için başka bir yazılım yüklemeniz gerekebilir.

neterror-redirect-loop = Bu sorun bazen çerezlerin devre dışı bırakılmasından veya reddedilmesinden kaynaklabilir.

neterror-unknown-socket-type-psm-installed = Sisteminizde Kişisel Güvenlik Yöneticisi'nin kurulu olduğundan emin olun.
neterror-unknown-socket-type-server-config = Bu durum, standart dışı sunucu yapılandırmasından kaynaklanabilir.

neterror-not-cached-intro = Talep edilen belge { -brand-short-name } önbelleğinde mevcut değil.
neterror-not-cached-sensitive = Bir güvenli önlemli olarak, { -brand-short-name } hassas belgeleri otomatik olarak yeniden talep etmez.
neterror-not-cached-try-again = Belgeyi siteden tekrar talep etmek için Yeniden dene’ye tıklayın.

neterror-net-offline = Çevrimiçi kipe geçip sayfayı tazelemek için “Yeniden dene"ye tıklayın.

neterror-proxy-resolve-failure-settings = Vekil sunucu ayarlarınızın doğru olup olmadığına bakın.
neterror-proxy-resolve-failure-connection = Bilgisayarınızın düzgün işleyen bir ağ bağlantısı olup olmadığına bakın.
neterror-proxy-resolve-failure-firewall = Bilgisayarınız veya ağınız güvenlik duvarı veya vekil sunucu tarafından korunuyorsa { -brand-short-name } uygulamasının Web’e erişim izni olduğundan emin olun.

neterror-proxy-connect-failure-settings = Vekil sunucu ayarlarınızın doğru olup olmadığına bakın.
neterror-proxy-connect-failure-contact-admin = Vekil sunucunun çalıştığından emin olmak için ağ yöneticinizden bilgi alabilirsiniz.

neterror-content-encoding-error = Site sahipleriyle iletişim kurarak bu sorunu onlara bildirmeyi düşünebilirsiniz.

neterror-unsafe-content-type = Site sahipleriyle iletişim kurarak bu sorunu onlara bildirmeyi düşünebilirsiniz.

neterror-nss-failure-not-verified = Görüntülemeye çalıştığınız sayfa, alınan verilerin yetkinliği doğrulanamadığı için gösterilemiyor.
neterror-nss-failure-contact-website = Sitenin sahibiyle iletişime geçerek bu sorunu bildirmeyi deneyebilirsiniz.

# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
certerror-intro = { -brand-short-name } olası bir güvenlik tehdidiyle karşılaştığı için <b>{ $hostname }</b> adresine girmedi. Bu siteyi ziyaret ederseniz saldırganlar parola, e-posta ve kredi kartı gibi bilgilerinizi çalmaya çalışabilir.
# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
certerror-sts-intro = { -brand-short-name } olası bir güvenlik tehdidi algıladı ve <b>{ $hostname }</b> sitesi güvenli bir bağlantı gerektirdiği için bu siteye bağlanmadı.
# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
certerror-expired-cert-intro = { -brand-short-name } olası bir güvenlik tehdidi algıladı ve <b>{ $hostname }</b> sitesine bağlanmadı. Site yanlış yapılandırılmış veya bilgisayarınızın saati yanlış ayarlanmış olabilir.
# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
# $mitm (String) - The name of the software intercepting communications between you and the website (or “man in the middle”)
certerror-mitm = <b>{ $hostname }</b> büyük olasılıkla güvenilir bir site olmasına rağmen güvenli bir bağlantı kurulamadı. Bu sorun, bilgisayarınızda veya ağınızda bulunan <b>{ $mitm }</b> adlı yazılımdan kaynaklanmaktadır.

neterror-corrupted-content-intro = Veri aktarımında bir hata tespit edildiği için bakmak istediğiniz sayfa gösterilemiyor.
neterror-corrupted-content-contact-website = Site sahipleriyle iletişim kurup bu sorunu onlara bildirmeyi düşünebilirsiniz.

# Do not translate "SSL_ERROR_UNSUPPORTED_VERSION".
neterror-sslv3-used = İleri düzey bilgi: SSL_ERROR_UNSUPPORTED_VERSION

# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
neterror-inadequate-security-intro = <b>{ $hostname }</b> eskimiş ve saldırılara açık bir güvenlik teknolojisi kullanıyor. Saldırganlar, güvende olduğunu sandığınız bilgilerinizi kolayca ele geçirebilirler. Bu siteye girebilmeniz için önce site yöneticisinin sunucuyu düzeltmesi gerekir.
# Do not translate "NS_ERROR_NET_INADEQUATE_SECURITY".
neterror-inadequate-security-code = Hata kodu: NS_ERROR_NET_INADEQUATE_SECURITY

# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
# $now (Date) - The current datetime, to be formatted as a date
neterror-clock-skew-error = Bilgisayarınız saatin { DATETIME($now, dateStyle: "medium") } olduğunu sanıyor, bu yüzden de { -brand-short-name } güvenli bağlantı kuramıyor. <b>{ $hostname }</b> adresini ziyaret etmek için sistem ayarlarınıza girerek bilgisayarınızın tarihini, saatini ve saat dilimini güncelleyin. Ardından <b>{ $hostname }</b> sayfasını tazeleyin.

neterror-network-protocol-error-intro = Ağ protokolünde bir hata bulunduğu için, görüntülemeye çalıştığınız sayfa gösterilemiyor.
neterror-network-protocol-error-contact-website = Web sitesinin sahipleriyle iletişim kurarak bu sorunu bildirmeyi deneyebilirsiniz.

certerror-expired-cert-second-para = Büyük olasılıkla web sitesinin sertifikasının süresi dolmuş ve bu yüzden { -brand-short-name } güvenli bağlantı kuramıyor. Bu siteye girerseniz saldırganlar parola, e-posta ve kredi kartı gibi bilgilerinizi çalmaya çalışabilir.
certerror-expired-cert-sts-second-para = Büyük olasılıkla web sitesinin sertifikasının süresi dolmuş ve bu yüzden { -brand-short-name } güvenli bağlantı kuramıyor.

certerror-what-can-you-do-about-it-title = Ne yapabilirsiniz?

certerror-unknown-issuer-what-can-you-do-about-it-website = Sorun büyük olasılıkla web sitesinden kaynaklanıyor, yani sizin yapabileceğiniz bir şey yok.
certerror-unknown-issuer-what-can-you-do-about-it-contact-admin = Kurumsal bir ağdaysanız veya antivirüs yazılımı kullanıyorsanız destek ekibinizden yardım almayı deneyebilirsiniz. Ayrıca web sitesinin sahibini bu sorun hakkında bilgilendirebilirsiniz.

# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
# $now (Date) - The current datetime, to be formatted as a date
certerror-expired-cert-what-can-you-do-about-it-clock = Bilgisayarınızın saati { DATETIME($now, dateStyle: "medium") } olarak ayarlanmış. Sistem ayarlarınızdaki tarih, saat ve saat diliminin doğru olarak ayarlandığını kontrol edin. Ardından <b>{ $hostname }</b> sayfasını tazeleyin.
certerror-expired-cert-what-can-you-do-about-it-contact-website = Saatiniz zaten doğruysa muhtemelen web sitesi yanlış yapılandırılmıştır. Bu sorunu çözmek için bir şey yapamazsınız ama sorunu web sitesinin yöneticisine bildirmeyi deneyebilirsiniz.

certerror-bad-cert-domain-what-can-you-do-about-it = Sorun büyük olasılıkla web sitesinden kaynaklanıyor, yani sizin yapabileceğiniz bir şey yok. Web sitesinin sahibini bu sorun hakkında bilgilendirebilirsiniz.

certerror-mitm-what-can-you-do-about-it-antivirus = Antivirüs yazılımınızda şifrelenmiş bağlantıları tarayan bir özellik (Genellikle “web tarama” veya “https tarama” denir.) varsa o özelliği kapatabilirsiniz. Bu işe yaramazsa antivirüs yazılımınızı kaldırıp yeniden yüklemeyi deneyebilirsiniz.
certerror-mitm-what-can-you-do-about-it-corporate = Kurumsal bir ağda bulunuyorsanız teknik departmanınıza başvurabilirsiniz.
# Variables:
# $mitm (String) - The name of the software intercepting communications between you and the website (or “man in the middle”)
certerror-mitm-what-can-you-do-about-it-attack = <b>{ $mitm }</b> size tanıdık gelmiyorsa bu bir saldırı olabilir. Bu durumda siteye girmemelisiniz.

# Variables:
# $mitm (String) - The name of the software intercepting communications between you and the website (or “man in the middle”)
certerror-mitm-what-can-you-do-about-it-attack-sts = <b>{ $mitm }</b> size tanıdık gelmiyorsa bu bir saldırı olabilir. Siteye erişmek için yapabileceğiniz bir şey bulunmuyor.

# Variables:
# $hostname (String) - Hostname of the website to which the user was trying to connect.
certerror-what-should-i-do-bad-sts-cert-explanation = <b>{ $hostname }</b>, HTTP Sıkı Aktarım Güvenliği (HSTS) denilen bir güvenlik ilkesi uyguluyor. Bu nedenle { -brand-short-name } bu siteye yalnızca güvenli bir şekilde bağlanabilir. Bu siteye ayrıcalık tanıyarak siteyi ziyaret edemezsiniz.
