# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

certmgr-title =
    .title = Sertifika Yöneticisi

certmgr-tab-mine =
    .label = Sertifikalarınız

certmgr-tab-remembered =
    .label = Kimlik doğrulama kararları

certmgr-tab-people =
    .label = Kişiler

certmgr-tab-servers =
    .label = Sunucular

certmgr-tab-ca =
    .label = Makamlar

certmgr-mine = Sizi tanımlayan aşağıdaki kuruluşlardan sertifikalarınız var
certmgr-remembered = Bu sertifikalar sizi web sitelerine tanıtmak için kullanılır
certmgr-people = Aşağıdaki kişileri tanımlayan kayıtlı sertifikalarınız var
certmgr-server = Bu girdiler, sunucu sertifikası hata ayrıcalıklarını tanımlar
certmgr-ca = Aşağıdaki sertifika makamlarını tanımlayan kayıtlı sertifikalarınız var

certmgr-edit-ca-cert2 =
    .title = CA sertifikası güven ayarlarını düzenle
    .style = min-width: 48em;

certmgr-edit-cert-edit-trust = Güven ayarlarını düzenle:

certmgr-edit-cert-trust-ssl =
    .label = Bu sertifika, web sitelerini tanımlayabilir.

certmgr-edit-cert-trust-email =
    .label = Bu sertifika posta kullanıcılarını tanımlayabilir.

certmgr-delete-cert2 =
    .title = Sertifikayı sil
    .style = min-width: 48em; min-height: 24em;

certmgr-cert-host =
    .label = Ana makine

certmgr-cert-name =
    .label = Sertifika adı

certmgr-cert-server =
    .label = Sunucu

certmgr-token-name =
    .label = Güvenlik aygıtı

certmgr-begins-label =
    .label = Başlangıç tarihi

certmgr-expires-label =
    .label = Bitiş tarihi

certmgr-email =
    .label = E-posta adresi

certmgr-serial =
    .label = Seri numarası

certmgr-fingerprint-sha-256 =
    .label = SHA-256 parmak izi

certmgr-view =
    .label = Görüntüle…
    .accesskey = G

certmgr-edit =
    .label = Güven ayarları…
    .accesskey = n

certmgr-export =
    .label = Dışa aktar…
    .accesskey = D

certmgr-delete =
    .label = Sil…
    .accesskey = S

certmgr-delete-builtin =
    .label = Sil veya güvenme…
    .accesskey = S

certmgr-backup =
    .label = Yedekle…
    .accesskey = Y

certmgr-backup-all =
    .label = Hepsini yedekle…
    .accesskey = d

certmgr-restore =
    .label = İçe aktar…
    .accesskey = a

certmgr-add-exception =
    .label = Ayrıcalık tanı…
    .accesskey = t

exception-mgr =
    .title = Güvenlik ayrıcalığı tanı

exception-mgr-extra-button =
    .label = Güvenlik ayrıcalığını doğrula
    .accesskey = d

exception-mgr-supplemental-warning = Bankalar, mağazalar ve diğer kamu siteleri bunu yapmanızı istemez.

exception-mgr-cert-location-url =
    .value = Konum:

exception-mgr-cert-location-download =
    .label = Sertifikayı al
    .accesskey = a

exception-mgr-cert-status-view-cert =
    .label = Göster…
    .accesskey = G

exception-mgr-permanent =
    .label = Bu ayrıcalığı kalıcı olarak kaydet
    .accesskey = k

pk11-bad-password = Geçerli parola girişi hatalı.
pkcs12-decode-err = Dosyanın çözülmesi başarısız. Ya PKCS #12 biçiminde değil ve bozuldu ya da girdiğiniz şifre hatalı.
pkcs12-unknown-err-restore = PKCS #12 dosyasının yenilenmesi bilinmeyen sebeplerden dolayı başarısız oldu.
pkcs12-unknown-err-backup = Bilinmeyen nedenlerden dolayı PKCS #12 yedekleme dosyası oluşturulamadı.
pkcs12-unknown-err = PKCS #12 işlemi bilinmeyen sebeplerden dolayı başarısız oldu.
pkcs12-info-no-smartcard-backup = Akıllı kart gibi bir donanım güvenlik aygıtından sertifika yedeklemek mümkün değildir.
pkcs12-dup-data = Sertifika ve özel anahtar zaten güvenlik aygıtında mevcut.

## PKCS#12 file dialogs

choose-p12-backup-file-dialog = Yedekleme için dosya adı
file-browse-pkcs12-spec = PKSC12 Dosyaları
choose-p12-restore-file-dialog = İçe aktarılacak sertifika dosyası

## Import certificate(s) file dialog

file-browse-certificate-spec = Sertifika dosyaları
import-ca-certs-prompt = İçe aktarım için CA sertifikalarını içeren dosyayı seçin
import-email-cert-prompt = İçe aktarım için birisinin e-posta sertifikasını içeren dosyayı seçin

## For editing certificates trust

# Variables:
#   $certName: the name of certificate
edit-trust-ca = "{ $certName }" sertifikası bir Sertifika Makamını temsil ediyor.

## For Deleting Certificates

delete-user-cert-title =
    .title = Sertifikalarınızı silin
delete-user-cert-confirm = Bu sertifikaları silmek istediğinizden emin misiniz?
delete-user-cert-impact = Kendi sertifikalarınızdan birini silerseniz artık kendinizi tanıtmak için onu kullanamazsınız.


delete-ssl-override-title =
    .title = Sunucu sertifikası ayrıcalığını sil
delete-ssl-override-confirm = Bu sunucu ayrıcalığını silmek istediğinizden emin misiniz?
delete-ssl-override-impact = Bir sunucu ayrıcalığını silerseniz, o sunucu için olağan güvenlik kontrollerini geri yüklemiş ve sunucunun geçerli bir sertifika kullanmasını zorunlu tutmuş olursunuz.

delete-ca-cert-title =
    .title = CA sertifikalarını sil veya güvenme
delete-ca-cert-confirm = Bu CA sertifikalarını silmeyi istediniz. Dahili sertifikalar için tüm güvenler kaldırılacaktır ki bu da aynı etkiye sahiptir. Silmek veya güvenmemek istediğinizden emin misiniz?
delete-ca-cert-impact = Bir sertifika makamının (CA) sertifikasını silerseniz veya ona güvenmezseniz, bu uygulama artık o CA tarafından yayımlanan hiçbir sertifikaya güvenmeyecektir.


delete-email-cert-title =
    .title = E-posta sertifikalarını sil
delete-email-cert-confirm = Bu kişilerin e-posta sertifikalarını silmek istediğinizden emin misiniz?
delete-email-cert-impact = Bir şahsın e-posta sertifikasını silerseniz, artık o kişiye şifrelenmiş e-posta gönderemezsiniz.

# Used for semi-uniquely representing a cert.
#
# Variables:
#   $serialNumber : the serial number of the cert in AA:BB:CC hex format.
cert-with-serial =
    .value = Sertifika seri numarası: { $serialNumber }

# Used to indicate that the user chose not to send a client authentication certificate to a server that requested one in a TLS handshake.
send-no-client-certificate = İstemci sertifikası gönderme

# Used when no cert is stored for an override
no-cert-stored-for-override = (Depolanmamış)

# When a certificate is unavailable (for example, it has been deleted or the token it exists on has been removed).
certificate-not-available = (Kullanılamaz)

## Used to show whether an override is temporary or permanent

permanent-override = Kalıcı
temporary-override = Geçici

## Add Security Exception dialog

add-exception-branded-warning = { -brand-short-name } uygulamasının siteyi tanımlama şeklini geçersiz kılmak üzeresiniz.
add-exception-invalid-header = Bu site kendini geçersiz bilgilerle tanımlamaya çalışıyor.
add-exception-domain-mismatch-short = Yanlış site
add-exception-domain-mismatch-long = Sertifika başka bir siteye ait. Bu, sitenin başka birisi tarafından taklit edilmeye çalışıldığı anlamına gelebilir.
add-exception-expired-short = Güncelliğini yitirmiş bilgi
add-exception-expired-long = Sertifika şu anda geçerli değil. Çalınmış veya kaybedilmiş olabilir ve birisi tarafından bu siteyi taklit etmek için kullanılabilir.
add-exception-unverified-or-bad-signature-short = Bilinmeyen kimlik
add-exception-unverified-or-bad-signature-long = Güvenilir bir makam tarafından yayımlandığını gösteren güvenli bir imza ile doğrulanmadığı için bu sertifikaya güvenilmiyor.
add-exception-valid-short = Geçerli sertifika
add-exception-valid-long = Bu site geçerli ve doğrulanmış tanımlama bilgisi sunuyor.  Güvenlik ayrıcalığı tanımaya gerek yok.
add-exception-checking-short = Bilgiler denetleniyor
add-exception-checking-long = Site tanımlanmaya çalışılıyor…
add-exception-no-cert-short = Bilgi yok
add-exception-no-cert-long = Bu sitenin tanımlanma durumuna ulaşılamıyor.

## Certificate export "Save as" and error dialogs

save-cert-as = Sertifikayı dosyaya kaydet
cert-format-base64 = X.509 sertifikası (PEM)
cert-format-base64-chain = X.509 sertifikası (PEM)
cert-format-der = X.509 sertifikası (DER)
cert-format-pkcs7 = X.509 sertifikası (PKCS#7)
cert-format-pkcs7-chain = X.509 sertifikası (PKCS#7)
write-file-failure = Dosya hatası
