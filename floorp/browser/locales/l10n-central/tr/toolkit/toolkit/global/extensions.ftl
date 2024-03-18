# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## Headers used in the webextension permissions dialog,
## See https://bug1308309.bmoattachments.org/attachment.cgi?id=8814612
## for an example of the full dialog.
## Note: This string will be used as raw markup. Avoid characters like <, >, &
## Variables:
##   $extension (String): replaced with the localized name of the extension.

webext-perms-header = { $extension } eklensin mi?
webext-perms-header-with-perms = { $extension } eklensin mi? Bu uzantı şu izinlere sahip olacak:
webext-perms-header-unsigned = { $extension } eklensin mi? Bu uzantı doğrulanmamış. Kötü amaçlı uzantılar kişisel bilgilerinizi çalabilir veya bilgisayarınızı tehlikeye atabilir. Yalnızca kaynağına güveniyorsanız bu uzantıyı ekleyin.
webext-perms-header-unsigned-with-perms = { $extension } eklensin mi? Bu uzantı doğrulanmamış. Kötü amaçlı uzantılar kişisel bilgilerinizi çalabilir veya bilgisayarınızı tehlikeye atabilir. Yalnızca kaynağına güveniyorsanız bu uzantıyı ekleyin. Bu uzantı şu izinlere sahip olacak:
webext-perms-sideload-header = { $extension } eklendi
webext-perms-optional-perms-header = { $extension } ek izinler istiyor.

##

webext-perms-add =
    .label = Ekle
    .accesskey = E
webext-perms-cancel =
    .label = Vazgeç
    .accesskey = z

webext-perms-sideload-text = Bilgisayarınızdaki başka bir program, tarayıcınızı etkileyebilecek bir eklenti yükledi. Lütfen bu eklentinin izin isteklerini inceledikten sonra eklentiyi etkinleştirmeyi veya işlemi iptal etmeyi (eklentiyi devre dışı bırakmayı) seçin.
webext-perms-sideload-text-no-perms = Bilgisayarınızdaki başka bir program, tarayıcınızı etkileyebilecek bir eklenti yükledi. Bu eklentiyi etkinleştirmeyi veya işlemi iptal etmeyi (eklentiyi devre dışı bırakmayı) seçin.
webext-perms-sideload-enable =
    .label = Etkinleştir
    .accesskey = E
webext-perms-sideload-cancel =
    .label = İptal
    .accesskey = a

# Variables:
#   $extension (String): replaced with the localized name of the extension.
webext-perms-update-text = { $extension } güncellendi. Güncellenen sürüm yüklenmeden önce yeni izinleri onaylamanız gerekiyor. “İptal”i seçerseniz mevcut uzantı sürümünüz korunacak. Bu uzantı şu izinlere sahip olacak:
webext-perms-update-accept =
    .label = Güncelle
    .accesskey = G

webext-perms-optional-perms-list-intro = Şunları yapmak istiyor:
webext-perms-optional-perms-allow =
    .label = İzin ver
    .accesskey = z
webext-perms-optional-perms-deny =
    .label = Reddet
    .accesskey = R

webext-perms-host-description-all-urls = Tüm web sitelerine ait verilerinize erişme

# Variables:
#   $domain (String): will be replaced by the DNS domain for which a webextension is requesting access (e.g., mozilla.org)
webext-perms-host-description-wildcard = { $domain } alan adındaki sitelere ait verilerinize erişme

# Variables:
#   $domainCount (Number): Integer indicating the number of additional
#     hosts for which this webextension is requesting permission.
webext-perms-host-description-too-many-wildcards =
    { $domainCount ->
        [one] Diğer { $domainCount } alan adındaki verilerinize erişme
       *[other] Diğer { $domainCount } alan adındaki verilerinize erişme
    }
# Variables:
#   $domain (String): will be replaced by the DNS host name for which a webextension is requesting access (e.g., www.mozilla.org)
webext-perms-host-description-one-site = { $domain } verilerinize erişme

# Variables:
#   $domainCount (Number): Integer indicating the number of additional
#     hosts for which this webextension is requesting permission.
webext-perms-host-description-too-many-sites =
    { $domainCount ->
        [one] Diğer { $domainCount } sitedeki verilerinize erişme
       *[other] Diğer { $domainCount } sitedeki verilerinize erişme
    }

## Headers used in the webextension permissions dialog for synthetic add-ons.
## The part of the string describing what privileges the extension gives should be consistent
## with the value of webext-site-perms-description-gated-perms-{sitePermission}.
## Note, this string will be used as raw markup. Avoid characters like <, >, &
## Variables:
##   $hostname (String): the hostname of the site the add-on is being installed from.

webext-site-perms-header-with-gated-perms-midi = Bu eklenti, { $hostname } sitesinin MIDI cihazlarınıza erişmesini sağlar.
webext-site-perms-header-with-gated-perms-midi-sysex = Bu eklenti, { $hostname } sitesinin MIDI cihazlarınıza erişmesini sağlar (SysEx desteği ile).

##

# This string is used as description in the webextension permissions dialog for synthetic add-ons.
# Note, the empty line is used to create a line break between the two sections.
# Note, this string will be used as raw markup. Avoid characters like <, >, &
webext-site-perms-description-gated-perms-midi =
    Bunlar genellikle ses sentezleyici gibi bilgisayara takılan cihazlardır ama bilgisayarınıza yerleşik de olabilirler.
    
    Normalde web siteleri MIDI cihazlarınıza erişemez. Bu özelliğin yanlış kullanılması hasara neden olabilir veya güvenliğinizi tehlikeye atabilir.

## Headers used in the webextension permissions dialog.
## Note: This string will be used as raw markup. Avoid characters like <, >, &
## Variables:
##   $extension (String): replaced with the localized name of the extension being installed.
##   $hostname (String): will be replaced by the DNS host name for which a webextension enables permissions.

webext-site-perms-header-with-perms = { $extension } eklensin mi? Bu uzantı, { $hostname } sitesine aşağıdaki izinleri verir:
webext-site-perms-header-unsigned-with-perms = { $extension } eklensin mi? Bu uzantı doğrulanmamış. Kötü amaçlı uzantılar kişisel bilgilerinizi çalabilir veya bilgisayarınızı tehlikeye atabilir. Yalnızca kaynağına güveniyorsanız bu uzantıyı ekleyin. Bu uzantı, { $hostname } sitesine aşağıdaki izinleri verir:

## These should remain in sync with permissions.NAME.label in sitePermissions.properties

webext-site-perms-midi = MIDI cihazlarına erişebilir
webext-site-perms-midi-sysex = SysEx destekli MIDI cihazlarına erişebilir
