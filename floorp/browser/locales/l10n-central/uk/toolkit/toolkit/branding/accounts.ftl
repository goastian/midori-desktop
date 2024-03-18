# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# “Account” can be localized, “Firefox” must be treated as a brand,
# and kept in English.
-fxaccount-brand-name =
    { $case ->
        *[nom] { $capitalization ->
           *[upper] Обліковий запис Firefox
            [lower] обліковий запис Firefox
        }
        [gen] { $capitalization ->
           *[upper] Облікового запису Firefox
            [lower] облікового запису Firefox
        }
        [dat] { $capitalization ->
           *[upper] Обліковому записі Firefox
            [lower] обліковому записі Firefox
        }
        [acc] { $capitalization ->
           *[upper] Обліковий запис Firefox
            [lower] обліковий запис Firefox
        }
        [abl] { $capitalization ->
           *[upper] Обліковим записом Firefox
            [lower] обліковим записом Firefox
        }
    }
