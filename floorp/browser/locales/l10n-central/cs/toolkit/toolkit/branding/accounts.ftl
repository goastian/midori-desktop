# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# “Account” can be localized, “Firefox” must be treated as a brand,
# and kept in English.
-fxaccount-brand-name =
    { $case ->
        [gen]
            { $capitalization ->
                [lower] účtu Firefoxu
                [sentence] účtu Firefoxu
                [title] Účtu Firefoxu
               *[upper] Účtu Firefoxu
            }
        [dat]
            { $capitalization ->
                [lower] účtu Firefoxu
                [sentence] účtu Firefoxu
                [title] Účtu Firefoxu
               *[upper] Účtu Firefoxu
            }
        [acc]
            { $capitalization ->
                [lower] účet Firefoxu
                [sentence] účet Firefoxu
                [title] Účet Firefoxu
               *[upper] Účet Firefoxu
            }
        [voc]
            { $capitalization ->
                [lower] účte Firefoxu
                [sentence] účte Firefoxu
                [title] Účte Firefoxu
               *[upper] Účte Firefoxu
            }
        [loc]
            { $capitalization ->
                [lower] účtu Firefoxu
                [sentence] účtu Firefoxu
                [title] Účtu Firefoxu
               *[upper] Účtu Firefoxu
            }
        [ins]
            { $capitalization ->
                [lower] účtem Firefoxu
                [sentence] účtem Firefoxu
                [title] Účtem Firefoxu
               *[upper] Účtem Firefoxu
            }
       *[nom]
            { $capitalization ->
                [lower] účet Firefoxu
                [sentence] účet Firefoxu
                [title] Účet Firefoxu
               *[upper] Účet Firefoxu
            }
    }
