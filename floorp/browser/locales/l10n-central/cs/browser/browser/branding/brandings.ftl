# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


## The following feature names must be treated as a brand.
##
## They cannot be:
## - Transliterated.
## - Translated.
##
## Declension should be avoided where possible, leaving the original
## brand unaltered in prominent UI positions.
##
## For further details, consult:
## https://mozilla-l10n.github.io/styleguides/mozilla_general/#brands-copyright-and-trademark

-facebook-container-brand-name =
    { $case ->
       *[nom] Facebook Container
        [gen] Facebook Containeru
        [dat] Facebook Containeru
        [acc] Facebook Container
        [voc] Facebook Containere
        [loc] Facebook Containeru
        [ins] Facebook Containerem
    }
    .gender = masculine
-lockwise-brand-name =
    { $case ->
       *[nom] Firefox Lockwise
        [gen] Firefoxu Lockwise
        [dat] Firefoxu Lockwise
        [acc] Firefox Lockwise
        [voc] Firefoxe Lockwise
        [loc] Firefoxu Lockwise
        [ins] Firefoxem Lockwise
    }
    .gender = masculine
-lockwise-brand-short-name =
    { $case ->
       *[nom] Lockwise
        [gen] Lockwisu
        [dat] Lockwisu
        [acc] Lockwise
        [voc] Lockwise
        [loc] Lockwisu
        [ins] Lockwisem
    }
    .gender = masculine
-monitor-brand-name =
    { $case ->
       *[nom] Firefox Monitor
        [gen] Firefox Monitoru
        [dat] Firefox Monitoru
        [acc] Firefox Monitor
        [voc] Firefox Monitore
        [loc] Firefox Monitoru
        [ins] Firefox Monitorem
    }
    .gender = masculine
-monitor-brand-short-name =
    { $case ->
       *[nom] Monitor
        [gen] Monitoru
        [dat] Monitoru
        [acc] Monitor
        [voc] Monitore
        [loc] Monitoru
        [ins] Monitorem
    }
    .gender = masculine
-pocket-brand-name =
    { $case ->
       *[nom] Pocket
        [gen] Pocketu
        [dat] Pocketu
        [acc] Pocket
        [voc] Pocket
        [loc] Pocketu
        [ins] Pocketem
    }
    .gender = masculine
-send-brand-name =
    { $case ->
       *[nom] Firefox Send
        [gen] Firefoxu Send
        [dat] Firefoxu Send
        [acc] Firefox Send
        [voc] Firefoxe Send
        [loc] Firefoxu Send
        [ins] Firefoxem Send
    }
    .gender = masculine
-screenshots-brand-name = Midori Screenshots
-mozilla-vpn-brand-name =
    { $case ->
       *[nom] Mozilla VPN
        [gen] Mozilly VPN
        [dat] Mozille VPN
        [acc] Mozillu VPN
        [voc] Mozillo VPN
        [loc] Mozille VPN
        [ins] Mozillou VPN
    }
    .gender = feminine
-profiler-brand-name =
    { $case ->
        [gen] Firefox Profileru
        [dat] Firefox Profileru
        [acc] Firefox Profiler
        [voc] Firefox Profilere
        [loc] Firefox Profileru
        [ins] Firefox Profilerem
       *[nom] Firefox Profiler
    }
    .gender = masculine
-translations-brand-name = Midori Translations
-rally-brand-name = Mozilla Rally
-rally-short-name = Rally
-focus-brand-name =
    { $case ->
       *[nom] Firefox Focus
        [gen] Firefoxu Focus
        [dat] Firefoxu Focus
        [acc] Firefox Focus
        [voc] Firefoxe Focus
        [loc] Firefoxu Focus
        [ins] Firefoxem Focus
    }
    .gender = masculine
-relay-brand-name =
    { $case ->
       *[nom] Firefox Relay
        [gen] Firefoxu Relay
        [dat] Firefoxu Relay
        [acc] Firefox Relay
        [voc] Firefoxe Relay
        [loc] Firefoxu Relay
        [ins] Firefoxem Relay
    }
    .gender = masculine
-relay-brand-short-name = Relay
# “Suggest” can be localized, “Firefox” must be treated as a brand
# and kept in English.
-firefox-suggest-brand-name =
    { $case ->
       *[nom]
            { $capitalization ->
               *[upper] Návrhy od Firefoxu
                [lower] návrhy od Firefoxu
            }
        [gen]
            { $capitalization ->
               *[upper] Návrhů od Firefoxu
                [lower] návrhů od Firefoxu
            }
        [dat]
            { $capitalization ->
               *[upper] Návrhům od Firefoxu
                [lower] návrhům od Firefoxu
            }
        [acc]
            { $capitalization ->
               *[upper] Návrhy od Firefoxu
                [lower] návrhy od Firefoxu
            }
        [voc]
            { $capitalization ->
               *[upper] Návrhy od Firefoxu
                [lower] návrhy od Firefoxu
            }
        [loc]
            { $capitalization ->
               *[upper] Návrzích od Firefoxu
                [lower] návrzích od Firefoxu
            }
        [ins]
            { $capitalization ->
               *[upper] Návrhy od Firefoxu
                [lower] návrhy od Firefoxu
            }
    }
# ”Home" can be localized, “Firefox” must be treated as a brand
# and kept in English.
-firefox-home-brand-name =
    { $case ->
       *[nom]
            { $capitalization ->
               *[upper] Domovská stránka Firefoxu
                [lower] domovská stránka Firefoxu
            }
        [gen]
            { $capitalization ->
               *[upper] Domovské stránky Firefoxu
                [lower] domovské stránky Firefoxu
            }
        [dat]
            { $capitalization ->
               *[upper] Domovské stránce Firefoxu
                [lower] domovské stránce Firefoxu
            }
        [acc]
            { $capitalization ->
               *[upper] Domovskou stránku Firefoxu
                [lower] domovskou stránku Firefoxu
            }
        [voc]
            { $capitalization ->
               *[upper] Domovská stránko Firefoxu
                [lower] domovská stránko Firefoxu
            }
        [loc]
            { $capitalization ->
               *[upper] Domovské stránce Firefoxu
                [lower] domovské stránce Firefoxu
            }
        [ins]
            { $capitalization ->
               *[upper] Domovskou stránkou Firefoxu
                [lower] domovskou stránkou Firefoxu
            }
    }
# View" can be localized, “Firefox” must be treated as a brand
# and kept in English.
-firefoxview-brand-name =
    { $case ->
       *[nom]
            { $capitalization ->
               *[upper] Přehled Firefoxu
                [lower] přehled Firefoxu
            }
        [gen]
            { $capitalization ->
               *[upper] Přehledu Firefoxu
                [lower] přehledu Firefoxu
            }
        [dat]
            { $capitalization ->
               *[upper] Přehledu Firefoxu
                [lower] přehledu Firefoxu
            }
        [acc]
            { $capitalization ->
               *[upper] Přehled Firefoxu
                [lower] přehled Firefoxu
            }
        [voc]
            { $capitalization ->
               *[upper] Přehlede Firefoxu
                [lower] přehlede Firefoxu
            }
        [loc]
            { $capitalization ->
               *[upper] Přehledu Firefoxu
                [lower] přehledu Firefoxu
            }
        [ins]
            { $capitalization ->
               *[upper] Přehledem Firefoxu
                [lower] přehledem Firefoxu
            }
    }
